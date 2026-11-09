import RAPIER from '@dimforge/rapier3d-compat';
import { Euler, Group, PerspectiveCamera, Quaternion, Scene } from 'three';
import type { WebGLRenderer } from 'three';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EngineServices, HospitalWorld } from '../../src/contracts';
import { createEventBus } from '../../src/integration/events';
import { createGameplayRuntime } from '../../src/gameplay/runtime';
import type { PlayerInput } from '../../src/gameplay/player';
import { captureCinematicPose, createCinematicPlayer } from '../../src/gameplay/chapter/cinematics';

beforeAll(async () => { await RAPIER.init(); });
const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); });
const idle = { forward: 0, right: 0, sprint: false, crouch: false };

function fixture() {
  const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const events = createEventBus();
  const camera = new PerspectiveCamera(70, 1, 0.05, 100);
  const engine: EngineServices = {
    scene: new Scene(), camera, physics, renderer: { domElement: {} } as WebGLRenderer,
    audio: { context: null, resume: async () => {}, dispose: async () => {} },
  };
  const world: HospitalWorld = {
    id: 'test:cinematic-lease', root: new Group(),
    bounds: { min: { x: -5, y: -1, z: -5 }, max: { x: 5, y: 4, z: 5 } },
    rooms: [], doors: [], interactables: [], hidingLocations: [], entitySpawns: [], patrolRoutes: [],
    colliders: [{ id: 'test:floor', shape: { type: 'box', halfExtents: { x: 5, y: 0.5, z: 5 } },
      pose: { position: { x: 0, y: -0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } }, bodyType: 'fixed', sensor: false }],
    playerSpawn: { position: { x: 0, y: 0.005, z: 0 }, yaw: 0 },
  };
  let input: PlayerInput = idle;
  const suppression = vi.fn();
  const inputDispose = vi.fn();
  const runtime = createGameplayRuntime({ engine, events, world, player: null }, {
    input: { read: () => input, setSuppressed: suppression, dispose: inputDispose },
    attachControls: false, showHud: false, activeEntityTypes: [],
  });
  let elapsedSeconds = 0;
  const tick = (count = 1) => {
    for (let i = 0; i < count; i++) {
      elapsedSeconds += 1 / 60;
      const frame = { deltaSeconds: 1 / 60, elapsedSeconds };
      runtime.fixedUpdate(frame); physics.step(); runtime.update(frame);
    }
  };
  tick(3);
  cleanups.push(() => { runtime.dispose(); events.dispose(); physics.free(); });
  return { runtime, physics, events, camera, tick, suppression, inputDispose,
    setInput: (value: PlayerInput) => { input = value; } };
}

describe('real gameplay cinematic camera/control lease', () => {
  it('retains the capsule while suppressing player motion, look, camera writes and noise', () => {
    const f = fixture();
    const noise = vi.fn(); f.events.on('player:noise', noise);
    const position = f.runtime.player.getSnapshot().position;
    const colliders = f.physics.colliders.len();
    const lease = f.runtime.acquireCinematicControl()!;
    expect(lease).not.toBeNull();
    expect(f.runtime.acquireCinematicControl()).toBeNull();
    expect(f.runtime.player.controlsLocked).toBe(true);
    expect(f.suppression).toHaveBeenLastCalledWith(true);
    f.camera.position.set(0.2, 1.5, 0.1);
    const shot = f.camera.position.clone();
    f.runtime.player.look(100, 100);
    f.runtime.player.setViewRotation({ yaw: 2, pitch: 1 });
    f.setInput({ ...idle, forward: 1, sprint: true });
    f.tick(120);
    expect(f.runtime.player.getSnapshot().position).toEqual(position);
    expect(f.runtime.player.getSnapshot().rotation).toEqual({ yaw: 0, pitch: 0 });
    expect(f.camera.position).toEqual(shot);
    expect(f.runtime.player.getSnapshot().captured).toBe(false);
    expect(f.runtime.player.getSnapshot().hiding.state).toBe('outside');
    expect(f.physics.colliders.len()).toBe(colliders);
    expect(noise).not.toHaveBeenCalled();
    lease.release();
  });

  it('accepts a matching eye pose and rejects camera handoffs that would teleport or roll the player', () => {
    const f = fixture();
    const original = captureCinematicPose(f.camera);
    const lease = f.runtime.acquireCinematicControl()!;
    expect(lease.handoff({ ...original, position: { ...original.position, x: 3 } })).toBe(false);
    expect(lease.handoff({ ...original, rotation: { x: NaN, y: 0, z: 0, w: 1 } })).toBe(false);
    const roll = new Quaternion().setFromEuler(new Euler(0, 0, 0.4));
    expect(lease.handoff({ ...original, rotation: roll })).toBe(false);
    const support = vi.spyOn(f.runtime.physics, 'hasSupport').mockReturnValue(false);
    expect(lease.handoff(original)).toBe(false);
    support.mockRestore();
    const rotation = new Quaternion().setFromEuler(new Euler(0.1, 0.5, 0, 'YXZ'));
    expect(lease.handoff({ ...original, rotation })).toBe(true);
    const after = captureCinematicPose(f.camera);
    lease.release(); f.tick();
    expect(Math.hypot(f.camera.position.x - after.position.x, f.camera.position.y - after.position.y,
      f.camera.position.z - after.position.z)).toBeLessThan(0.001);
    expect(f.camera.quaternion.angleTo(rotation)).toBeLessThan(0.001);
  });

  it('clears pending controls and waits for neutral on release; stale releases cannot unlock another lease', () => {
    const f = fixture();
    const lease = f.runtime.acquireCinematicControl()!;
    f.setInput({ ...idle, forward: 1, crouch: true });
    f.tick(); lease.release();
    const position = f.runtime.player.getSnapshot().position;
    f.tick(20);
    expect(f.runtime.player.getSnapshot().position).toEqual(position);
    expect(f.runtime.player.getSnapshot().crouching).toBe(false);
    f.setInput(idle); f.tick();
    f.setInput({ ...idle, forward: 1 }); f.tick(20);
    expect(f.runtime.player.getSnapshot().position.z).toBeLessThan(position.z - 0.1);
    const newer = f.runtime.acquireCinematicControl()!;
    lease.release();
    expect(f.runtime.player.controlsLocked).toBe(true);
    newer.release();
    expect(f.suppression.mock.calls.map(([value]) => value)).toEqual([true, false, true, false]);
  });

  it('runs and skips an actual shared-camera path with the real runtime lease and no return snap', async () => {
    const f = fixture();
    const start = captureCinematicPose(f.camera);
    const cinematic = createCinematicPlayer({ camera: f.camera,
      acquireControl: () => f.runtime.acquireCinematicControl(), validateHandoff: () => true });
    cleanups.push(() => cinematic.dispose());
    const playback = cinematic.play({ id: 'test:authored-path', durationSeconds: 2, cues: [], camera: [
      { atSeconds: 0, pose: start },
      { atSeconds: 1, pose: { ...start, position: { ...start.position, x: 0.3 } } },
      { atSeconds: 2, pose: start },
    ] });
    cinematic.update(0.5); f.tick();
    expect(f.camera.position.x).toBeGreaterThan(0.1);
    playback.skip();
    cinematic.update(0.1); f.tick();
    expect(f.runtime.player.controlsLocked).toBe(true);
    cinematic.update(0.15);
    expect(await playback.finished).toMatchObject({ outcome: 'skipped' });
    expect(f.runtime.player.controlsLocked).toBe(false);
    f.tick();
    expect(f.camera.position.x).toBeCloseTo(start.position.x);
    expect(f.camera.position.y).toBeCloseTo(start.position.y, 2);
  });

  it('aborts a scene and releases suppression on capture, hiding or teardown', async () => {
    const f = fixture();
    const start = captureCinematicPose(f.camera);
    const cinematic = createCinematicPlayer({ camera: f.camera,
      acquireControl: () => f.runtime.acquireCinematicControl(), validateHandoff: () => true });
    cleanups.push(() => cinematic.dispose());
    const definition = { id: 'test:interrupt', durationSeconds: 1, cues: [], camera: [
      { atSeconds: 0, pose: start }, { atSeconds: 1, pose: start },
    ] };
    const scene = cinematic.play(definition);
    f.runtime.player.setCaptured(true);
    expect(await scene.finished).toMatchObject({ outcome: 'interrupted' });
    expect(f.runtime.player.controlsLocked).toBe(false);
    expect(f.suppression).toHaveBeenLastCalledWith(false);
    f.runtime.player.setCaptured(false);
    const hiddenLease = f.runtime.acquireCinematicControl()!;
    f.runtime.player.setHiding('hidden', 'test:spot');
    expect(hiddenLease.signal.aborted).toBe(true);
    expect(f.runtime.acquireCinematicControl()).toBeNull();
    f.runtime.player.setHiding('outside', null);
    const disposedLease = f.runtime.acquireCinematicControl()!;
    f.runtime.dispose();
    expect(disposedLease.signal.aborted).toBe(true);
    expect(f.runtime.player.controlsLocked).toBe(false);
    expect(f.inputDispose).toHaveBeenCalledOnce();
    expect(f.physics.colliders.len()).toBe(0);
    disposedLease.release();
  });

  it('teardown interrupts an active shared-camera sequence before its runtime is destroyed', async () => {
    const f = fixture();
    const pose = captureCinematicPose(f.camera);
    const cinematic = createCinematicPlayer({ camera: f.camera,
      acquireControl: () => f.runtime.acquireCinematicControl(), validateHandoff: () => true });
    cleanups.push(() => cinematic.dispose());
    const handle = cinematic.play({ id: 'test:dispose', durationSeconds: 2, cues: [],
      camera: [{ atSeconds: 0, pose }, { atSeconds: 2, pose }] });
    f.runtime.dispose();
    expect(await handle.finished).toMatchObject({ outcome: 'interrupted' });
    expect(f.physics.colliders.len()).toBe(0);
    expect(f.suppression).toHaveBeenLastCalledWith(false);
  });
});
