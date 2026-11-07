import type {
  EngineServices,
  FrameContext,
  GameEvents,
  GameModule,
  HospitalWorld,
  ModuleContext,
  ModuleInstance,
  ModuleKind,
  PlayerProvider,
} from '../contracts';
import { validateWorld } from './validateWorld';

const phases: readonly ModuleKind[] = [
  'world', 'physics', 'gameplay', 'entities', 'atmosphere', 'horror',
];

type RegistryState = 'collecting' | 'starting' | 'running' | 'disposing' | 'disposed' | 'failed';

interface ActiveModule {
  definition: GameModule;
  instance: ModuleInstance;
  releaseEvents(): void;
}

export interface ModuleRegistry {
  readonly state: RegistryState;
  readonly world: HospitalWorld | null;
  readonly player: PlayerProvider | null;
  register(module: GameModule): void;
  start(): Promise<void>;
  fixedUpdate(frame: FrameContext): void;
  update(frame: FrameContext): void;
  dispose(): Promise<void>;
}

/** A single startup transaction. World modules precede gameplay; teardown reverses setup. */
export function createModuleRegistry(engine: EngineServices, events: GameEvents): ModuleRegistry {
  const definitions: GameModule[] = [];
  const active: ActiveModule[] = [];
  let state: RegistryState = 'collecting';
  let world: HospitalWorld | null = null;
  let player: PlayerProvider | null = null;
  let startPromise: Promise<void> | undefined;
  let disposePromise: Promise<void> | undefined;

  async function teardown(): Promise<unknown[]> {
    const errors: unknown[] = [];
    for (const entry of active.splice(0).reverse()) {
      if (entry.instance.world) {
        try {
          entry.instance.world.root.removeFromParent();
        } catch (error) {
          errors.push(error);
        }
        world = null;
      }
      if (entry.instance.player) player = null;
      try {
        await entry.instance.dispose();
      } catch (error) {
        errors.push(error);
      } finally {
        try {
          entry.releaseEvents();
        } catch (error) {
          errors.push(error);
        }
      }
    }
    world = null;
    player = null;
    return errors;
  }

  async function startup(): Promise<void> {
    const ordered = [...definitions].sort((a, b) => phases.indexOf(a.kind) - phases.indexOf(b.kind));
    try {
      for (const definition of ordered) {
        const subscriptions = new Set<() => void>();
        let scopeDisposed = false;
        const releaseEvents = (): void => {
          scopeDisposed = true;
          for (const unsubscribe of subscriptions) unsubscribe();
          subscriptions.clear();
        };
        const scopedEvents: GameEvents = {
          on(type, listener) {
            if (scopeDisposed) throw new Error(`Module "${definition.id}" has been disposed.`);
            const unsubscribe = events.on(type, listener);
            const release = (): void => {
              unsubscribe();
              subscriptions.delete(release);
            };
            subscriptions.add(release);
            return release;
          },
          emit(type, payload) {
            if (scopeDisposed) throw new Error(`Module "${definition.id}" has been disposed.`);
            events.emit(type, payload);
          },
        };
        const context: ModuleContext = {
          engine,
          events: scopedEvents,
          get world() { return world; },
          get player() { return player; },
        };
        let instance: ModuleInstance;
        try {
          instance = await definition.setup(context);
        } catch (error) {
          releaseEvents();
          throw new Error(`Module "${definition.id}" failed to set up.`, { cause: error });
        }
        if (!instance || typeof instance.dispose !== 'function') {
          releaseEvents();
          throw new Error(`Module "${definition.id}" must return a disposable instance.`);
        }
        // Track before validating so a rejected result is still disposed during rollback.
        active.push({ definition, instance, releaseEvents });
        if (instance.world && definition.kind !== 'world') {
          throw new Error(`Only a world module can publish world data ("${definition.id}").`);
        }
        if (instance.player && definition.kind !== 'gameplay') {
          throw new Error(`Only a gameplay module can publish a player ("${definition.id}").`);
        }
        if (definition.kind === 'world') {
          if (!instance.world) throw new Error(`World module "${definition.id}" did not publish a world.`);
          validateWorld(instance.world);
          world = instance.world;
          engine.scene.add(world.root);
        }
        if (instance.player) player = instance.player;
      }
      state = 'running';
    } catch (error) {
      const errors = await teardown();
      state = 'failed';
      if (errors.length > 0) {
        throw new AggregateError([error, ...errors], 'Module startup and rollback failed.');
      }
      throw error;
    }
  }

  const registry: ModuleRegistry = {
    get state() { return state; },
    get world() { return world; },
    get player() { return player; },
    register(module) {
      if (state !== 'collecting') throw new Error('Modules must register before startup.');
      if (!module.id.trim()) throw new Error('Module IDs must not be empty.');
      if (!phases.includes(module.kind)) throw new Error(`Unknown module kind "${module.kind}".`);
      if (typeof module.setup !== 'function') throw new Error(`Module "${module.id}" needs setup().`);
      if (definitions.some((entry) => entry.id === module.id)) {
        throw new Error(`Duplicate module ID "${module.id}".`);
      }
      if ((module.kind === 'world' || module.kind === 'gameplay') &&
          definitions.some((entry) => entry.kind === module.kind)) {
        throw new Error(`Only one ${module.kind} module may register.`);
      }
      definitions.push(module);
    },
    start() {
      if (state !== 'collecting') {
        return Promise.reject(new Error(`Cannot start registry in state "${state}".`));
      }
      state = 'starting';
      // Assign the promise before calling module code, which may request shutdown.
      startPromise = Promise.resolve().then(startup);
      return startPromise;
    },
    fixedUpdate(frame) {
      if (state !== 'running') return;
      for (const { instance } of active) instance.fixedUpdate?.(frame);
    },
    update(frame) {
      if (state !== 'running') return;
      for (const { instance } of active) instance.update?.(frame);
    },
    dispose() {
      if (disposePromise) return disposePromise;
      const pendingStartup = state === 'starting' ? startPromise : undefined;
      if (!pendingStartup) state = 'disposing';
      // Assign before invoking any disposer; disposal can trigger more shutdown requests.
      disposePromise = Promise.resolve().then(async () => {
        // Async setup cannot be safely cancelled; wait, then tear down its result.
        if (pendingStartup) {
          try { await pendingStartup; } catch { /* startup already rolled back */ }
        }
        state = 'disposing';
        const errors = await teardown();
        state = 'disposed';
        if (errors.length > 0) throw new AggregateError(errors, 'Module disposal failed.');
      });
      return disposePromise;
    },
  };
  return registry;
}
