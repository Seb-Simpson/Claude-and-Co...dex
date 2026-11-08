import RAPIER from '@dimforge/rapier3d-compat';
import { Group, PerspectiveCamera, Scene } from 'three';
import type { WebGLRenderer } from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { EngineServices, GameModule, ModuleContext } from '../../src/contracts';
import type { Engine, EngineHooks, EngineOptions } from '../../src/engine';
import { createGameplayModule } from '../../src/gameplay';
import type { PlayerInput } from '../../src/gameplay';
import { createApplication } from '../../src/integration/application';
import { createHospitalWorld, HOSPITAL_WORLD_ID } from '../../src/world';
import type { HospitalWorldBuild } from '../../src/world';

beforeAll(async () => { await RAPIER.init(); });

/** A deterministic engine driver: real scene, camera and Rapier, without a WebGL context. */
function engineFixture() {
  const documentTarget = new EventTarget();
  const ownerDocument = Object.assign(documentTarget, {
    pointerLockElement: null,
    defaultView: new EventTarget(),
    exitPointerLock: vi.fn(),
  }) as unknown as Document;
  const canvas = Object.assign(new EventTarget(), {
    ownerDocument,
    requestPointerLock: vi.fn(async () => {}),
    focus: vi.fn(),
    click: vi.fn(),
    remove: vi.fn(),
  });
  const container = { ownerDocument, clientWidth: 1280, clientHeight: 720 } as unknown as HTMLElement;
  const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const audio = { context: null, resume: vi.fn(async () => {}), dispose: vi.fn(async () => {}) };
  const services: EngineServices = {
    scene: new Scene(), camera: new PerspectiveCamera(70, 16 / 9, 0.05, 250), physics, audio,
    renderer: {
      domElement: canvas,
      info: { render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 } },
    } as unknown as WebGLRenderer,
  };
  let hooks: EngineHooks = {};
  let running = false;
  let disposed = false;
  let elapsedSeconds = 0;
  let maximumActiveLoops = 0;
  let physicsCountsOnDispose: { colliders: number; bodies: number } | null = null;
  const stop = vi.fn(() => { running = false; });
  const start = vi.fn((next: EngineHooks) => {
    if (running) throw new Error('A second engine loop was started');
    if (disposed) throw new Error('A disposed engine was started');
    hooks = next;
    running = true;
    elapsedSeconds = 0;
    maximumActiveLoops = Math.max(maximumActiveLoops, Number(running));
  });
  const dispose = vi.fn(async () => {
    if (disposed) return;
    disposed = true;
    stop();
    physicsCountsOnDispose = { colliders: physics.colliders.len(), bodies: physics.bodies.len() };
    await audio.dispose();
    physics.free();
  });
  const engine: Engine = { services, start, stop, resize: vi.fn(), dispose };
  const factory = vi.fn(async (_options: EngineOptions) => engine);
  return {
    container, engine, factory, services, start, stop, dispose, audio,
    get running() { return running; },
    get maximumActiveLoops() { return maximumActiveLoops; },
    get physicsCountsOnDispose() { return physicsCountsOnDispose; },
    tick(steps = 1) {
      for (let step = 0; step < steps; step++) {
        if (!running) return;
        elapsedSeconds += 1 / 60;
        const frame = { deltaSeconds: 1 / 60, elapsedSeconds };
        hooks.fixedUpdate?.(frame);
        physics.timestep = frame.deltaSeconds;
        physics.step();
        hooks.update?.(frame);
      }
    },
  };
}

function hospitalModules() {
  const builds: HospitalWorldBuild[] = [];
  const worldDisposals: string[] = [];
  const contexts: ModuleContext[] = [];
  const captureCounts: number[] = [];
  const probeDisposals: number[] = [];
  const modules: readonly GameModule[] = [
    {
      id: 'test:actual-hospital', kind: 'world',
      setup() {
        const build = createHospitalWorld({ textures: false });
        builds.push(build);
        return {
          world: build.world,
          dispose() { worldDisposals.push(build.world.id); build.dispose(); },
        };
      },
    },
    createGameplayModule(),
    {
      id: 'test:session-probe', kind: 'horror',
      setup(context) {
        const index = contexts.length;
        const ownedRoot = new Group();
        ownedRoot.name = `session-probe-${index}`;
        context.engine.scene.add(ownedRoot);
        contexts.push(context);
        captureCounts.push(0);
        context.events.on('player:captured', () => { captureCounts[index] = (captureCounts[index] ?? 0) + 1; });
        return { dispose() { probeDisposals.push(index); ownedRoot.removeFromParent(); } };
      },
    },
  ];
  return { modules, builds, worldDisposals, contexts, captureCounts, probeDisposals };
}

describe('first playable application lifecycle with the actual hospital', () => {
  it('boots Room 104 and all hospital collision data through one engine, then gates simulation on play', async () => {
    const fixture = engineFixture();
    const hospital = hospitalModules();
    const input: PlayerInput = { forward: 1, right: 0, sprint: false, crouch: false };
    const app = createApplication({
      container: fixture.container, modules: hospital.modules, engineFactory: fixture.factory,
      gameplayOptions: { attachControls: false, showHud: false, input: { read: () => input, dispose() {} } },
    });
    try {
      await app.start();
      const ready = app.snapshot();
      const world = hospital.builds[0]?.world;
      if (!world) throw new Error('The real hospital module was not built');
      expect(ready.state).toBe('ready');
      expect(ready.worldId).toBe(HOSPITAL_WORLD_ID);
      expect(world.colliders.length).toBeGreaterThanOrEqual(220);
      expect(ready.colliderCount).toBeGreaterThanOrEqual(world.colliders.length + 1);
      expect(world.rooms.find((room) => room.tags.includes('player-start'))?.name).toBe('Room 104');
      expect(ready.player?.position).toEqual(world.playerSpawn.position);
      expect(ready.entities.map((entity) => entity.type)).toEqual(['patient']);
      expect(ready.entities[0]?.position).toEqual(world.entitySpawns.find((spawn) => spawn.type === 'patient')?.position);
      fixture.tick(30);
      expect(app.snapshot().player?.position).toEqual(ready.player?.position);
      expect(app.snapshot().performance.simulatedSeconds).toBe(0);
      app.play();
      expect(app.snapshot().state).toBe('playing');
      fixture.tick(30);
      const moved = app.snapshot().player;
      expect(app.snapshot().performance.simulatedSeconds).toBeCloseTo(0.5, 6);
      expect(moved?.position.z).toBeLessThan(world.playerSpawn.position.z - 0.5);
      expect(moved?.position.y).toBeGreaterThanOrEqual(-0.02);
      expect(fixture.factory).toHaveBeenCalledTimes(1);
      expect(fixture.start).toHaveBeenCalledTimes(1);
      expect(fixture.maximumActiveLoops).toBe(1);
    } finally { await app.dispose(); }
    expect(fixture.dispose).toHaveBeenCalledTimes(1);
    expect(fixture.audio.dispose).toHaveBeenCalledTimes(1);
    expect(hospital.worldDisposals).toEqual([HOSPITAL_WORLD_ID]);
  });

  it('captures without continuing simulation and restarts into a fresh, complete hospital attempt', async () => {
    const fixture = engineFixture();
    const hospital = hospitalModules();
    const app = createApplication({
      container: fixture.container, modules: hospital.modules, engineFactory: fixture.factory,
      gameplayOptions: { attachControls: false, showHud: false },
    });
    try {
      await app.start();
      const original = app.snapshot();
      const originalChildren = fixture.services.scene.children.length;
      const originalBodies = fixture.services.physics.bodies.len();
      app.play();
      expect(app.teleport({ x: -12.4, y: 0, z: 0 })).toBe(true);
      fixture.tick(20);
      app.captureForTest();
      const captured = app.snapshot();
      expect(captured.state).toBe('captured');
      expect(captured.player?.captured).toBe(true);
      expect(captured.player?.movement).toBe('captured');
      fixture.tick(120);
      expect(app.snapshot().player?.position).toEqual(captured.player?.position);
      expect(app.snapshot().entities).toEqual(captured.entities);
      expect(app.snapshot().performance.simulatedSeconds).toBe(captured.performance.simulatedSeconds);
      await app.restart();
      const restarted = app.snapshot();
      expect(restarted.state).toBe('ready');
      expect(restarted.performance.simulatedSeconds).toBe(0);
      expect(restarted.sessionId).toBe(original.sessionId + 1);
      expect(restarted.player?.position).toEqual(original.player?.position);
      expect(restarted.player?.captured).toBe(false);
      expect(restarted.entities).toEqual(original.entities);
      expect(restarted.doorStates).toEqual(original.doorStates);
      expect(restarted.colliderCount).toBe(original.colliderCount);
      expect(fixture.services.physics.bodies.len()).toBe(originalBodies);
      expect(fixture.services.scene.children).toHaveLength(originalChildren);
      expect(hospital.builds).toHaveLength(2);
      expect(hospital.builds[1]?.world.root).not.toBe(hospital.builds[0]?.world.root);
      expect(hospital.worldDisposals).toEqual([HOSPITAL_WORLD_ID]);
      expect(hospital.probeDisposals).toEqual([0]);
      expect(fixture.factory).toHaveBeenCalledTimes(1);
      expect(fixture.start).toHaveBeenCalledTimes(2);
      expect(fixture.maximumActiveLoops).toBe(1);
    } finally { await app.dispose(); }
    expect(hospital.worldDisposals).toHaveLength(2);
    expect(fixture.dispose).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent restarts and releases old event scopes across repeated attempts', async () => {
    const fixture = engineFixture();
    const hospital = hospitalModules();
    const app = createApplication({
      container: fixture.container, modules: hospital.modules, engineFactory: fixture.factory,
      gameplayOptions: { attachControls: false, showHud: false },
    });
    try {
      await app.start();
      const original = app.snapshot();
      const originalChildren = fixture.services.scene.children.length;
      for (let attempt = 1; attempt <= 3; attempt++) {
        await Promise.all([app.restart(), app.restart(), app.restart()]);
        const snapshot = app.snapshot();
        expect(snapshot.sessionId).toBe(original.sessionId + attempt);
        expect(snapshot.colliderCount).toBe(original.colliderCount);
        expect(snapshot.entities).toEqual(original.entities);
        expect(fixture.services.scene.children).toHaveLength(originalChildren);
        expect(hospital.worldDisposals).toHaveLength(attempt);
        expect(hospital.probeDisposals).toHaveLength(attempt);
      }
      const staleContext = hospital.contexts[0];
      if (!staleContext) throw new Error('The first attempt did not publish a module context');
      expect(() => staleContext.events.emit('player:captured', {
        playerId: 'player', entityId: 'stale:entity', position: { x: 0, y: 0, z: 0 }, timeSeconds: 0,
      })).toThrow('disposed');
      expect(app.snapshot().state).toBe('ready');
      app.play();
      app.captureForTest();
      expect(hospital.captureCounts).toEqual([0, 0, 0, 1]);
      expect(fixture.factory).toHaveBeenCalledTimes(1);
      expect(fixture.start).toHaveBeenCalledTimes(4);
      expect(fixture.maximumActiveLoops).toBe(1);
    } finally { await Promise.all([app.dispose(), app.dispose()]); }
    expect(fixture.dispose).toHaveBeenCalledTimes(1);
    expect(hospital.worldDisposals).toHaveLength(4);
    expect(hospital.probeDisposals).toEqual([0, 1, 2, 3]);
    expect(fixture.services.scene.children).toHaveLength(0);
    expect(app.snapshot().state).toBe('disposed');
  });

  it('rolls back real world, physics and module resources when startup fails', async () => {
    const fixture = engineFixture();
    const hospital = hospitalModules();
    const reportError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = createApplication({
      container: fixture.container,
      modules: [...hospital.modules, {
        id: 'test:failed-integration', kind: 'horror',
        setup() { throw new Error('Intentional integration startup failure'); },
      }],
      engineFactory: fixture.factory,
      gameplayOptions: { attachControls: false, showHud: false },
    });
    try {
      await expect(app.start()).rejects.toThrow();
      expect(app.snapshot().state).toBe('error');
      expect(app.snapshot().error).toBeTruthy();
      expect(fixture.services.scene.children).toHaveLength(0);
      expect(fixture.physicsCountsOnDispose).toEqual({ colliders: 0, bodies: 0 });
      expect(fixture.dispose).toHaveBeenCalledTimes(1);
      expect(hospital.worldDisposals).toEqual([HOSPITAL_WORLD_ID]);
      expect(hospital.probeDisposals).toEqual([0]);
      expect(fixture.running).toBe(false);
      expect(fixture.start).not.toHaveBeenCalled();
    } finally { await app.dispose(); reportError.mockRestore(); }
    expect(fixture.dispose).toHaveBeenCalledTimes(1);
    expect(fixture.audio.dispose).toHaveBeenCalledTimes(1);
  });

  it('waits for pending module setup before disposing the attempt and never starts a late loop', async () => {
    const fixture = engineFixture();
    const hospital = hospitalModules();
    let releaseSetup = (): void => {};
    let markReached = (): void => {};
    const setupGate = new Promise<void>((resolve) => { releaseSetup = resolve; });
    const setupReached = new Promise<void>((resolve) => { markReached = resolve; });
    const lateDisposal = vi.fn();
    const app = createApplication({
      container: fixture.container,
      modules: [...hospital.modules, {
        id: 'test:pending-module', kind: 'horror',
        async setup() {
          markReached();
          await setupGate;
          return { dispose: lateDisposal };
        },
      }],
      engineFactory: fixture.factory,
      gameplayOptions: { attachControls: false, showHud: false },
    });
    const starting = app.start();
    await setupReached;
    const shuttingDown = app.dispose();
    releaseSetup();
    await Promise.all([starting, shuttingDown]);
    expect(app.snapshot().state).toBe('disposed');
    expect(lateDisposal).toHaveBeenCalledTimes(1);
    expect(hospital.worldDisposals).toEqual([HOSPITAL_WORLD_ID]);
    expect(hospital.probeDisposals).toEqual([0]);
    expect(fixture.physicsCountsOnDispose).toEqual({ colliders: 0, bodies: 0 });
    expect(fixture.services.scene.children).toHaveLength(0);
    expect(fixture.start).not.toHaveBeenCalled();
    expect(fixture.dispose).toHaveBeenCalledTimes(1);
  });

  it('awaits in-flight module teardown when a WebGL failure overlaps explicit shutdown', async () => {
    const fixture = engineFixture();
    const hospital = hospitalModules();
    const reportError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let releaseTeardown = (): void => {};
    let markTeardownReached = (): void => {};
    const teardownGate = new Promise<void>((resolve) => { releaseTeardown = resolve; });
    const teardownReached = new Promise<void>((resolve) => { markTeardownReached = resolve; });
    const delayedDisposal = vi.fn(async () => {
      markTeardownReached();
      await teardownGate;
    });
    const app = createApplication({
      container: fixture.container,
      modules: [...hospital.modules, {
        id: 'test:delayed-teardown', kind: 'horror',
        setup() { return { dispose: delayedDisposal }; },
      }],
      engineFactory: fixture.factory,
      gameplayOptions: { attachControls: false, showHud: false },
    });
    try {
      await app.start();
      app.play();
      fixture.tick();
      const onError = fixture.factory.mock.calls[0]?.[0].onError;
      expect(onError).toBeTypeOf('function');
      onError?.(new Error('WebGL context lost during shutdown'));
      await teardownReached;
      const firstShutdown = app.dispose();
      const secondShutdown = app.dispose();
      // Give both shutdown paths a full turn to reach the blocked module disposer.
      await new Promise<void>((resolve) => { setImmediate(resolve); });
      expect(delayedDisposal).toHaveBeenCalledTimes(1);
      expect(fixture.dispose).not.toHaveBeenCalled();
      expect(fixture.services.physics.colliders.len()).toBeGreaterThanOrEqual(220);
      expect(fixture.running).toBe(false);
      releaseTeardown();
      await Promise.all([firstShutdown, secondShutdown]);
      expect(fixture.physicsCountsOnDispose).toEqual({ colliders: 0, bodies: 0 });
      expect(fixture.dispose).toHaveBeenCalledTimes(1);
      expect(fixture.audio.dispose).toHaveBeenCalledTimes(1);
      expect(hospital.worldDisposals).toEqual([HOSPITAL_WORLD_ID]);
      expect(hospital.probeDisposals).toEqual([0]);
      expect(fixture.services.scene.children).toHaveLength(0);
      const closed = app.snapshot();
      expect(closed.state).toBe('disposed');
      expect(closed.colliderCount).toBe(0);
      fixture.tick(10);
      expect(app.snapshot().frameCount).toBe(closed.frameCount);
      expect(fixture.start).toHaveBeenCalledTimes(1);
    } finally {
      releaseTeardown();
      await app.dispose();
      reportError.mockRestore();
    }
  });
});
