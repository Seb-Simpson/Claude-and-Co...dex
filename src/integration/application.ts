import { Vector3 } from 'three';
import type { FrameContext, GameEventMap, GameModule } from '../contracts';
import { createEngine, createNeutralScene } from '../engine';
import type { Engine, EngineOptions } from '../engine';
import { createGameplayModule } from '../gameplay';
import type { GameplayOptions, GameplayRuntime } from '../gameplay';
import { createEventBus } from './events';
import type { EventBus } from './events';
import { createModuleRegistry } from './registry';
import type { ModuleRegistry } from './registry';
import { hospitalInspectionText } from './hospitalInspection';
import { createPatientEncounter } from './patientEncounter';
import type { ApplicationDiagnostics, ApplicationSnapshot, ApplicationState } from './testing';

export interface ApplicationOptions {
  container: HTMLElement;
  modules: readonly GameModule[];
  gameplayOptions?: GameplayOptions;
  engineFactory?: (options: EngineOptions) => Promise<Engine>;
  onStatus?: (message: string, isError?: boolean) => void;
  onState?: (state: ApplicationState) => void;
}
export interface Application extends ApplicationDiagnostics {
  start(): Promise<void>;
  play(): void;
}
interface Attempt {
  id: number;
  registry: ModuleRegistry;
  events: EventBus;
  runtime: GameplayRuntime | null;
  encounter: ReturnType<typeof createPatientEncounter> | null;
  fixture: ReturnType<typeof createNeutralScene> | null;
  records: { type: keyof GameEventMap; payload: unknown }[];
  fixedOffset: number | null;
  renderOffset: number | null;
}

/** One renderer/physics backend; every restart replaces the entire module/event session. */
export function createApplication(options: ApplicationOptions): Application {
  let state: ApplicationState = 'loading';
  let engine: Engine | null = null;
  let attempt: Attempt | null = null;
  let sequence = 0;
  let frameCount = 0;
  let error: string | null = null;
  let started: Promise<void> | undefined;
  let restarting: Promise<void> | undefined;
  let disposal: Promise<void> | undefined;
  let disposed = false;
  let backendDisposed = false;
  let engineDisposal: Promise<void> | undefined;
  let attemptDisposal: Promise<void> | undefined;
  let fixedMaxMs = 0;
  let updateMaxMs = 0;
  let frameDeltaMaxMs = 0;
  const document = options.container.ownerDocument;
  function setState(value: ApplicationState): void { state = value; options.onState?.(value); }
  function now(): number { return performance.now(); }
  function unlock(): void {
    if (document?.pointerLockElement) document.exitPointerLock();
  }
  function onPointerLock(): void {
    if (state === 'ready' && document.pointerLockElement === engine?.services.renderer.domElement) app.play();
  }
  document?.addEventListener('pointerlockchange', onPointerLock);

  function clearAttempt(): Promise<void> {
    if (attemptDisposal) return attemptDisposal;
    const old = attempt;
    attempt = null;
    if (!old) return Promise.resolve();
    // Assign before invoking any module callbacks. Fatal errors and page disposal
    // must join the same teardown before either is allowed to free the backend.
    attemptDisposal = Promise.resolve().then(async () => {
      try { old.encounter?.dispose(); }
      finally {
        try { await old.registry.dispose(); }
        finally { old.fixture?.dispose(); old.events.dispose(); }
      }
    }).finally(() => { attemptDisposal = undefined; });
    return attemptDisposal;
  }
  function releaseEngine(): Promise<void> {
    if (!engine) return Promise.resolve();
    if (!engineDisposal) {
      backendDisposed = true;
      engineDisposal = Promise.resolve().then(() => engine!.dispose());
    }
    return engineDisposal;
  }
  async function fail(failure: unknown): Promise<void> {
    error = failure instanceof Error ? failure.message : String(failure);
    console.error('NIGHT WARD:', failure);
    document?.removeEventListener('pointerlockchange', onPointerLock);
    if (!disposed) { setState('error'); options.onStatus?.(`Unable to run NIGHT WARD: ${error}`, true); }
    engine?.stop(); unlock();
    try { await clearAttempt(); } finally { await releaseEngine(); }
  }
  function render(frame: FrameContext): void {
    const active = attempt;
    if (!active || disposed) return;
    const begin = now();
    frameCount += 1;
    frameDeltaMaxMs = Math.max(frameDeltaMaxMs, frame.deltaSeconds * 1000);
    active.renderOffset ??= frame.elapsedSeconds;
    const local = { deltaSeconds: frame.deltaSeconds, elapsedSeconds: frame.elapsedSeconds - active.renderOffset };
    active.registry.update(local);
    active.encounter?.update(local);
    updateMaxMs = Math.max(updateMaxMs, now() - begin);
  }
  function fixed(frame: FrameContext): void {
    const active = attempt;
    if (!active || disposed || state !== 'playing') return;
    const begin = now();
    active.fixedOffset ??= frame.elapsedSeconds - frame.deltaSeconds;
    active.registry.fixedUpdate({ deltaSeconds: frame.deltaSeconds, elapsedSeconds: frame.elapsedSeconds - active.fixedOffset });
    fixedMaxMs = Math.max(fixedMaxMs, now() - begin);
  }
  async function beginAttempt(): Promise<void> {
    if (!engine || disposed) return;
    const events = createEventBus();
    const registry = createModuleRegistry(engine.services, events);
    const active: Attempt = {
      id: ++sequence, registry, events, runtime: null, encounter: null, fixture: null,
      records: [], fixedOffset: null, renderOffset: null,
    };
    attempt = active;
    fixedMaxMs = 0; updateMaxMs = 0; frameDeltaMaxMs = 0;
    const track: readonly (keyof GameEventMap)[] = [
      'player:captured', 'chase:started', 'chase:ended', 'entity:state', 'hiding:state',
      'door:state', 'interaction:completed', 'atmosphere:lighting', 'atmosphere:sound',
    ];
    for (const type of track) events.on(type, (payload) => {
      active.records.push({ type, payload });
      if (active.records.length > 128) active.records.shift();
    });
    events.on('player:captured', (event) => {
      if (attempt !== active || disposed || event.playerId !== active.runtime?.player.getSnapshot().id) return;
      setState('captured'); unlock();
    });
    for (const definition of options.modules) {
      if (definition.id === 'night-ward:gameplay' && definition.kind === 'gameplay') {
        const module = createGameplayModule({
          activeEntityTypes: ['patient'], navigation: { cellSize: 0.25, maxNodes: 4096 }, inspectionText: hospitalInspectionText,
          ...options.gameplayOptions,
          onRestart: () => { void app.restart().catch(() => { /* restart reports and releases failures */ }); },
        });
        registry.register({ ...module, async setup(context) {
          const result = await module.setup(context);
          if (result.player && 'physics' in result) active.runtime = result as GameplayRuntime;
          return result;
        } });
      } else registry.register(definition);
    }
    try {
      await registry.start();
      if (disposed || attempt !== active) return;
      if (!registry.world) active.fixture = createNeutralScene(engine.services);
      else engine.services.renderer.domElement?.setAttribute?.('aria-label', 'NIGHT WARD hospital view');
      if (active.runtime) {
        active.encounter = createPatientEncounter({ events, audio: engine.services.audio,
          playerId: active.runtime.player.getSnapshot().id, onMessage: (message) => active.runtime?.notify(message) });
      }
      setState('ready');
      options.onStatus?.(registry.world
        ? `${options.modules.length} modules ready. World: ${registry.world.id}.`
        : 'Renderer and Rapier ready. Neutral test scene · no game modules installed.');
      engine.start({ fixedUpdate: fixed, update: render });
      if (document?.pointerLockElement === engine.services.renderer.domElement) app.play();
    } catch (failure) {
      await clearAttempt();
      throw failure;
    }
  }
  const app: Application = {
    start() {
      if (started) return started;
      if (disposed) return Promise.reject(new Error('Application disposed'));
      started = Promise.resolve().then(async () => {
        const created = await (options.engineFactory ?? createEngine)({ container: options.container, onError: (failure) => { void fail(failure).catch((cleanupError: unknown) => console.error('Cleanup failed:', cleanupError)); } });
        engine = created;
        if (disposed) { await releaseEngine(); return; }
        await beginAttempt();
      }).catch(async (failure: unknown) => { await fail(failure); throw failure; });
      return started;
    },
    play() { if (state === 'ready' && !disposed) setState('playing'); },
    restart() {
      if (restarting) return restarting;
      if (disposed || state === 'error' || !engine) return Promise.reject(new Error('Application cannot restart'));
      setState('restarting'); engine.stop(); unlock();
      restarting = Promise.resolve().then(async () => {
        await clearAttempt();
        if (!disposed) await beginAttempt();
      }).catch(async (failure: unknown) => { await fail(failure); throw failure; }).finally(() => { restarting = undefined; });
      return restarting;
    },
    snapshot(): ApplicationSnapshot {
      const info = backendDisposed ? undefined : engine?.services.renderer.info;
      const snapshot = attempt?.runtime?.player.getSnapshot();
      const player = snapshot ? (({ camera: _camera, ...value }) => value)(snapshot) : null;
      const doorStates: ApplicationSnapshot['doorStates'] = {};
      for (const door of attempt?.registry.world?.doors ?? []) {
        const value = attempt?.runtime?.interactions.getDoorState(door.id);
        if (value) doorStates[door.id] = value;
      }
      return {
        state, sessionId: sequence, worldId: attempt?.registry.world?.id ?? null, player,
        entities: attempt?.runtime?.entities.getSnapshots() ?? [],
        colliderCount: backendDisposed ? 0 : engine?.services.physics.colliders.len() ?? 0, frameCount,
        renderer: { calls: info?.render.calls ?? 0, triangles: info?.render.triangles ?? 0,
          geometries: info?.memory.geometries ?? 0, textures: info?.memory.textures ?? 0 },
        audioState: engine?.services.audio.context?.state ?? 'locked', events: [...(attempt?.records ?? [])],
        doorStates, prompt: attempt?.runtime?.interactions.getPrompt() ?? null, error,
        performance: { fixedMaxMs, updateMaxMs, frameDeltaMaxMs },
      };
    },
    teleport(position, yaw) {
      const runtime = attempt?.runtime;
      if (!runtime || disposed || runtime.player.getSnapshot().captured || runtime.player.getSnapshot().hiding.state !== 'outside' ||
          !runtime.player.body.canOccupy(position) || !runtime.physics.hasSupport(position, runtime.player.body.radius)) return false;
      runtime.player.body.setPosition(position);
      runtime.player.setViewRotation({ yaw: yaw ?? 0, pitch: 0 });
      runtime.player.update({ deltaSeconds: 0.1, elapsedSeconds: 0 });
      return true;
    },
    aimAt(position) {
      const runtime = attempt?.runtime;
      if (!runtime) return;
      const eye = runtime.player.getSnapshot().camera.getWorldPosition(new Vector3());
      const dx = position.x - eye.x, dy = position.y - eye.y, dz = position.z - eye.z;
      runtime.player.setViewRotation({ yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) });
    },
    captureForTest() {
      const active = attempt;
      if (!active?.runtime) return;
      const snapshot = active.runtime.player.getSnapshot();
      active.events.emit('player:captured', { playerId: snapshot.id, entityId: 'nw:entity:patient', position: snapshot.position,
        timeSeconds: 0 });
    },
    dispose() {
      if (disposal) return disposal;
      disposed = true; setState('disposed'); engine?.stop(); unlock();
      document?.removeEventListener('pointerlockchange', onPointerLock);
      disposal = Promise.resolve().then(async () => {
        if (started) { try { await started; } catch { /* failed startup already cleaned up */ } }
        if (restarting) { try { await restarting; } catch { /* complete partial setup cleanup below */ } }
        try { await clearAttempt(); } finally { await releaseEngine(); }
      });
      return disposal;
    },
  };
  return app;
}
