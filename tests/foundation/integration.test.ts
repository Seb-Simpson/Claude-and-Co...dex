import { Group, PerspectiveCamera, Scene } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type {
  EngineServices, GameModule, HospitalWorld, ModuleContext, ModuleInstance,
  ModuleKind, PlayerNoiseEvent, PlayerProvider,
} from '../../src/contracts';
import { createEventBus } from '../../src/integration/events';
import { createModuleRegistry } from '../../src/integration/registry';

const frame = { deltaSeconds: 1 / 60, elapsedSeconds: 1 };
const noise: PlayerNoiseEvent = {
  playerId: 'player', position: { x: 0, y: 0, z: 0 }, kind: 'footstep',
  radius: 4, intensity: 0.4, timeSeconds: 1,
};
function engine(): EngineServices {
  return {
    scene: new Scene(), camera: new PerspectiveCamera(),
    renderer: {} as EngineServices['renderer'], physics: {} as EngineServices['physics'],
    audio: { context: null, resume: async () => {}, dispose: async () => {} },
  };
}
function world(): HospitalWorld {
  return {
    id: 'fixture', root: new Group(),
    bounds: { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 2, z: 1 } },
    rooms: [], colliders: [], interactables: [], doors: [], hidingLocations: [],
    entitySpawns: [], patrolRoutes: [], playerSpawn: { position: { x: 0, y: 0, z: 0 }, yaw: 0 },
  };
}
function module(id: string, kind: ModuleKind, instance: Partial<ModuleInstance> = {}): GameModule {
  return { id, kind, setup: () => ({ dispose() {}, ...instance }) };
}

describe('module registry', () => {
  it('boots an empty architecture without requiring world or gameplay implementation', async () => {
    const registry = createModuleRegistry(engine(), createEventBus());
    await registry.start();
    expect(registry.state).toBe('running');
    expect(registry.world).toBeNull();
    expect(registry.player).toBeNull();
    await registry.dispose();
    expect(registry.state).toBe('disposed');
  });

  it('orders modules by phase, mounts world before gameplay, and exposes live dependencies', async () => {
    const services = engine();
    const registry = createModuleRegistry(services, createEventBus());
    const hospital = world();
    const setup: string[] = [];
    const cleanup: string[] = [];
    const provider: PlayerProvider = { getSnapshot: vi.fn() };
    let physicsContext: ModuleContext | undefined;
    const definitions: GameModule[] = [
      { id: 'horror', kind: 'horror', setup: (context) => {
        setup.push('horror');
        expect(context.player).toBe(provider);
        return { dispose: () => { cleanup.push('horror'); } };
      } },
      { id: 'gameplay', kind: 'gameplay', setup: (context) => {
        setup.push('gameplay');
        expect(context.world).toBe(hospital);
        expect(hospital.root.parent).toBe(services.scene);
        return { player: provider, dispose: () => { cleanup.push('gameplay'); } };
      } },
      { id: 'world', kind: 'world', setup: () => {
        setup.push('world');
        return { world: hospital, dispose: () => { cleanup.push('world'); } };
      } },
      { id: 'physics', kind: 'physics', setup: (context) => {
        setup.push('physics');
        physicsContext = context;
        expect(context.world).toBe(hospital);
        return { dispose: () => { cleanup.push('physics'); } };
      } },
    ];
    definitions.forEach((definition) => registry.register(definition));
    await registry.start();
    expect(setup).toEqual(['world', 'physics', 'gameplay', 'horror']);
    expect(physicsContext?.world).toBe(hospital);
    expect(physicsContext?.player).toBe(provider);
    await registry.dispose();
    expect(cleanup).toEqual([...setup].reverse());
    expect(hospital.root.parent).toBeNull();
    expect(registry.world).toBeNull();
    expect(registry.player).toBeNull();
  });

  it('keeps registration order within a phase and updates only running modules', async () => {
    const registry = createModuleRegistry(engine(), createEventBus());
    const updates: string[] = [];
    const fixed = vi.fn();
    registry.register(module('first', 'entities', { update: () => updates.push('first'), fixedUpdate: fixed }));
    registry.register(module('second', 'entities', { update: () => updates.push('second') }));
    registry.update(frame);
    expect(updates).toEqual([]);
    await registry.start();
    registry.fixedUpdate(frame);
    registry.update(frame);
    expect(fixed).toHaveBeenCalledExactlyOnceWith(frame);
    expect(updates).toEqual(['first', 'second']);
    await registry.dispose();
    registry.update(frame);
    expect(updates).toHaveLength(2);
  });

  it('rejects duplicate IDs, singleton modules, late registration, and restarts', async () => {
    const registry = createModuleRegistry(engine(), createEventBus());
    registry.register(module('one', 'gameplay'));
    registry.register(module('hospital', 'world', { world: world() }));
    expect(() => registry.register(module('duplicate-world', 'world'))).toThrow('Only one');
    expect(() => registry.register(module('one', 'entities'))).toThrow('Duplicate');
    expect(() => registry.register(module('two', 'gameplay'))).toThrow('Only one');
    expect(() => registry.register(module(' ', 'entities'))).toThrow('empty');
    await registry.start();
    expect(() => registry.register(module('late', 'entities'))).toThrow('before startup');
    await expect(registry.start()).rejects.toThrow('running');
    await registry.dispose();
    await expect(registry.start()).rejects.toThrow('disposed');
  });

  it('rolls back prior modules and subscriptions when a later setup throws', async () => {
    const bus = createEventBus();
    const services = engine();
    const registry = createModuleRegistry(services, bus);
    const hospital = world();
    const disposed = vi.fn();
    const listener = vi.fn();
    registry.register(module('world', 'world', { world: hospital, dispose: disposed }));
    registry.register({ id: 'bad', kind: 'gameplay', setup(context) {
      context.events.on('player:noise', listener);
      throw new Error('broken setup');
    } });
    await expect(registry.start()).rejects.toThrow('bad');
    expect(registry.state).toBe('failed');
    expect(disposed).toHaveBeenCalledOnce();
    expect(hospital.root.parent).toBeNull();
    expect(registry.world).toBeNull();
    bus.emit('player:noise', noise);
    expect(listener).not.toHaveBeenCalled();
    await registry.dispose();
    expect(disposed).toHaveBeenCalledOnce();
  });

  it('disposes invalid module results before reporting a startup error', async () => {
    const registry = createModuleRegistry(engine(), createEventBus());
    const disposed = vi.fn();
    registry.register(module('invalid-world', 'entities', { world: world(), dispose: disposed }));
    await expect(registry.start()).rejects.toThrow('Only a world module');
    expect(disposed).toHaveBeenCalledOnce();
    expect(registry.world).toBeNull();
  });

  it('requires the world provider to return world metadata and rolls back its resources', async () => {
    const registry = createModuleRegistry(engine(), createEventBus());
    const disposed = vi.fn();
    registry.register(module('empty-world', 'world', { dispose: disposed }));
    await expect(registry.start()).rejects.toThrow('did not publish a world');
    expect(disposed).toHaveBeenCalledOnce();
    expect(registry.state).toBe('failed');
  });

  it('removes module listeners on disposal and preserves external listeners', async () => {
    const bus = createEventBus();
    const registry = createModuleRegistry(engine(), bus);
    const owned = vi.fn();
    const external = vi.fn();
    bus.on('player:noise', external);
    let heldContext: ModuleContext | undefined;
    registry.register({ id: 'sound', kind: 'atmosphere', setup(context) {
      heldContext = context;
      context.events.on('player:noise', owned);
      return { dispose() {} };
    } });
    await registry.start();
    bus.emit('player:noise', noise);
    expect(owned).toHaveBeenCalledOnce();
    await registry.dispose();
    bus.emit('player:noise', noise);
    expect(owned).toHaveBeenCalledOnce();
    expect(external).toHaveBeenCalledTimes(2);
    expect(() => heldContext?.events.on('player:noise', owned)).toThrow('disposed');
    expect(() => heldContext?.events.emit('player:noise', noise)).toThrow('disposed');
  });

  it('attempts every disposer even when one rejects and disposal is idempotent', async () => {
    const registry = createModuleRegistry(engine(), createEventBus());
    const first = vi.fn();
    const failure = new Error('dispose failed');
    const second = vi.fn(async () => { throw failure; });
    registry.register(module('first', 'entities', { dispose: first }));
    registry.register(module('second', 'entities', { dispose: second }));
    await registry.start();
    const disposal = registry.dispose();
    await expect(disposal).rejects.toBeInstanceOf(AggregateError);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(registry.state).toBe('disposed');
    expect(registry.dispose()).toBe(disposal);
  });

  it('waits for an in-flight async setup before disposing it', async () => {
    const registry = createModuleRegistry(engine(), createEventBus());
    const disposed = vi.fn();
    let resolveSetup!: (instance: ModuleInstance) => void;
    registry.register({ id: 'async', kind: 'entities', setup: () => new Promise((resolve) => { resolveSetup = resolve; }) });
    const startup = registry.start();
    const disposal = registry.dispose();
    expect(disposed).not.toHaveBeenCalled();
    await Promise.resolve();
    resolveSetup({ dispose: disposed });
    await startup;
    await disposal;
    expect(disposed).toHaveBeenCalledOnce();
    expect(registry.state).toBe('disposed');
  });

  it('cleans a module even when its setup synchronously requests shutdown', async () => {
    const registry = createModuleRegistry(engine(), createEventBus());
    const disposed = vi.fn();
    let shutdown: Promise<void> | undefined;
    registry.register({ id: 'reentrant-setup', kind: 'entities', setup() {
      shutdown = registry.dispose();
      return { dispose: disposed };
    } });
    await registry.start();
    expect(shutdown).toBeDefined();
    await shutdown;
    expect(disposed).toHaveBeenCalledOnce();
    expect(registry.state).toBe('disposed');
  });

  it('shares one disposal promise with synchronous reentrant shutdown requests', async () => {
    const registry = createModuleRegistry(engine(), createEventBus());
    let nestedShutdown: Promise<void> | undefined;
    const disposed = vi.fn(() => { nestedShutdown = registry.dispose(); });
    registry.register(module('reentrant-dispose', 'entities', { dispose: disposed }));
    await registry.start();
    const shutdown = registry.dispose();
    expect(registry.state).toBe('disposing');
    await shutdown;
    expect(nestedShutdown).toBe(shutdown);
    expect(disposed).toHaveBeenCalledOnce();
    expect(registry.state).toBe('disposed');
  });

  it('reports both the setup failure and rollback failure', async () => {
    const registry = createModuleRegistry(engine(), createEventBus());
    registry.register(module('earlier', 'entities', { dispose: () => { throw new Error('rollback'); } }));
    registry.register({ id: 'later', kind: 'horror', setup: () => { throw new Error('setup'); } });
    await expect(registry.start()).rejects.toMatchObject({ errors: expect.arrayContaining([
      expect.objectContaining({ message: expect.stringContaining('later') }),
      expect.objectContaining({ message: 'rollback' }),
    ]) });
    expect(registry.state).toBe('failed');
  });
});
