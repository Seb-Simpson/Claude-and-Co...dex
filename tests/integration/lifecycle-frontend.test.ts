import RAPIER from '@dimforge/rapier3d-compat';
import { PerspectiveCamera, Scene } from 'three';
import type { WebGLRenderer } from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { EngineServices, GameModule } from '../../src/contracts';
import type { Engine, EngineHooks, EngineOptions } from '../../src/engine';
import { createGameplayModule } from '../../src/gameplay';
import type { PlayerInput } from '../../src/gameplay';
import { createApplication, type ApplicationProgress } from '../../src/integration/application';
import { createHospitalWorld } from '../../src/world';

/**
 * NW-003 lifecycle: pause/resume freezes the same session in place; returning to the title screen
 * disposes the session but keeps the single engine; a new session reuses it; progress milestones
 * are real and ordered.
 */
beforeAll(async () => { await RAPIER.init(); });

function engineFixture() {
  const ownerDocument = Object.assign(new EventTarget(), { pointerLockElement: null, defaultView: new EventTarget(), exitPointerLock: vi.fn() }) as unknown as Document;
  const canvas = Object.assign(new EventTarget(), { ownerDocument, requestPointerLock: vi.fn(async () => {}), focus: vi.fn(), click: vi.fn(), remove: vi.fn() });
  const container = { ownerDocument, clientWidth: 1280, clientHeight: 720 } as unknown as HTMLElement;
  const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const context = { state: 'running' as AudioContextState, suspend: vi.fn(async function (this: { state: string }) { context.state = 'suspended'; }), resume: vi.fn(async () => { context.state = 'running'; }) };
  const audio = { context: context as unknown as AudioContext, resume: vi.fn(async () => {}), dispose: vi.fn(async () => {}) };
  const render = vi.fn();
  const services: EngineServices = {
    scene: new Scene(), camera: new PerspectiveCamera(70, 16 / 9, 0.05, 250), physics, audio,
    renderer: { domElement: canvas, render, info: { render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 } } } as unknown as WebGLRenderer,
  };
  let hooks: EngineHooks = {};
  let running = false;
  let elapsed = 0;
  let loops = 0;
  let maxLoops = 0;
  const start = vi.fn((next: EngineHooks) => { if (running) throw new Error('A second engine loop was started'); hooks = next; running = true; loops += 1; maxLoops = Math.max(maxLoops, 1); });
  const stop = vi.fn(() => { running = false; });
  const engine: Engine = { services, start, stop, resize: vi.fn(), dispose: vi.fn(async () => { stop(); physics.free(); }) };
  const factory = vi.fn(async (_o: EngineOptions) => engine);
  return {
    container, factory, services, start, stop, context, render,
    get running() { return running; }, get loops() { return loops; }, get maxLoops() { return maxLoops; },
    tick(steps = 1) {
      for (let i = 0; i < steps; i++) {
        if (!running) return;
        elapsed += 1 / 60;
        const frame = { deltaSeconds: 1 / 60, elapsedSeconds: elapsed };
        hooks.fixedUpdate?.(frame);
        physics.timestep = frame.deltaSeconds;
        physics.step();
        hooks.update?.(frame);
      }
    },
  };
}

function modules(disposals: string[]): GameModule[] {
  return [
    { id: 'test:hospital', kind: 'world', setup() { const b = createHospitalWorld({ textures: false }); return { world: b.world, dispose() { disposals.push('world'); b.dispose(); } }; } },
    createGameplayModule(),
  ];
}

async function boot() {
  const fixture = engineFixture();
  const disposals: string[] = [];
  const progress: ApplicationProgress[] = [];
  const states: string[] = [];
  const input: PlayerInput = { forward: 1, right: 0, sprint: false, crouch: false };
  const app = createApplication({
    container: fixture.container, modules: modules(disposals), engineFactory: fixture.factory,
    gameplayOptions: { attachControls: false, showHud: false, input: { read: () => input, dispose() {} } },
    onProgress: (p) => progress.push(p), onState: (s) => states.push(s),
  });
  return { fixture, disposals, progress, states, app };
}

describe('NW-003 application lifecycle', () => {
  it('reports real loading milestones in order: engine, every module, then shaders', async () => {
    const { app, progress } = await boot();
    await app.start();
    const ids = progress.map((p) => `${p.stage}:${p.id}:${p.state}`);
    expect(ids[0]).toBe('engine:renderer:begin');
    expect(ids[1]).toBe('engine:renderer:done');
    expect(ids).toContain('module:test:hospital:begin');
    expect(ids.indexOf('module:test:hospital:done')).toBeLessThan(ids.indexOf('module:night-ward:gameplay:begin'));
    // No compileAsync on the fake renderer: the shader stage is skipped, never faked.
    expect(ids.some((i) => i.startsWith('shaders:'))).toBe(false);
    await app.dispose();
  });

  it('pause freezes player, entities, physics and audio in place; resume continues the same session', async () => {
    const { app, fixture } = await boot();
    await app.start();
    app.play();
    fixture.tick(30);
    const before = app.snapshot();
    expect(before.state).toBe('playing');
    expect(app.pause()).toBe(true);
    expect(fixture.running).toBe(false);
    expect(fixture.context.suspend).toHaveBeenCalledTimes(1);
    const paused = app.snapshot();
    fixture.tick(120); // the browser keeps producing frames; nothing may advance
    const still = app.snapshot();
    expect(still.state).toBe('paused');
    expect(still.player!.position).toEqual(paused.player!.position);
    expect(still.entities).toEqual(paused.entities);
    expect(still.frameCount).toBe(paused.frameCount);
    app.resume();
    expect(fixture.running).toBe(true);
    expect(fixture.context.resume).toHaveBeenCalledTimes(1);
    expect(app.snapshot().sessionId).toBe(before.sessionId);
    fixture.tick(30);
    expect(app.snapshot().player!.position.z).not.toBe(paused.player!.position.z);
    await app.dispose();
  });

  it('repeated pauses never start a second loop or a second session', async () => {
    const { app, fixture } = await boot();
    await app.start();
    app.play();
    const session = app.snapshot().sessionId;
    for (let i = 0; i < 25; i++) { fixture.tick(2); expect(app.pause()).toBe(true); expect(app.pause()).toBe(false); app.resume(); app.resume(); }
    expect(fixture.maxLoops).toBe(1);
    expect(fixture.running).toBe(true);
    expect(app.snapshot().sessionId).toBe(session);
    expect(fixture.factory).toHaveBeenCalledTimes(1);
    await app.dispose();
  });

  it('returning to the title screen disposes the session but keeps the engine; New Game reuses it', async () => {
    const { app, fixture, disposals } = await boot();
    await app.start();
    app.play();
    app.pause();
    await app.endSession();
    expect(app.snapshot().state).toBe('menu');
    expect(app.snapshot().player).toBeNull();
    expect(disposals).toEqual(['world']);
    expect(fixture.running).toBe(false);
    expect(fixture.services.physics.colliders.len()).toBe(0);
    await app.newSession();
    const fresh = app.snapshot();
    expect(fresh.state).toBe('ready');
    expect(fresh.sessionId).toBe(2);
    expect(fresh.player!.position.x).toBeCloseTo(-12.4, 1);
    expect(fixture.factory).toHaveBeenCalledTimes(1);
    expect(fixture.services.physics.colliders.len()).toBeGreaterThan(200);
    await app.dispose();
  });

  it('restart from pause builds a clean session and leaves audio running', async () => {
    const { app, fixture } = await boot();
    await app.start();
    app.play();
    app.pause();
    await app.restart();
    expect(app.snapshot().state).toBe('ready');
    expect(app.snapshot().sessionId).toBe(2);
    expect(fixture.context.state).toBe('running');
    expect(fixture.maxLoops).toBe(1);
    await app.dispose();
  });

  it('redraw renders one frame without advancing the session', async () => {
    const { app, fixture } = await boot();
    await app.start();
    app.play();
    app.pause();
    const frames = app.snapshot().frameCount;
    app.redraw();
    expect(fixture.render).toHaveBeenCalledTimes(1);
    expect(app.snapshot().frameCount).toBe(frames);
    await app.dispose();
  });
});
