import RAPIER from '@dimforge/rapier3d-compat';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAudioService } from '../../src/engine/audio';
import { FrameClock } from '../../src/engine/timing';

class MockAudioContext {
  static instances: MockAudioContext[] = [];
  state: AudioContextState = 'suspended';
  resume = vi.fn(async () => { this.state = 'running'; });
  close = vi.fn(async () => { this.state = 'closed'; });
  constructor() { MockAudioContext.instances.push(this); }
}

afterEach(() => {
  vi.unstubAllGlobals();
  MockAudioContext.instances.length = 0;
});

describe('FrameClock', () => {
  it('starts without simulating the time before the first frame', () => {
    const clock = new FrameClock();
    expect(clock.tick(100_000)).toEqual({ deltaSeconds: 0, elapsedSeconds: 0, fixedSteps: [] });
  });

  it('accumulates short frames and produces fixed simulation steps', () => {
    const clock = new FrameClock(0.02);
    clock.tick(0);
    expect(clock.tick(10).fixedSteps).toEqual([]);
    expect(clock.tick(25).fixedSteps).toEqual([{ deltaSeconds: 0.02, elapsedSeconds: 0.02 }]);
    expect(clock.tick(40).fixedSteps).toEqual([{ deltaSeconds: 0.02, elapsedSeconds: 0.04 }]);
  });

  it('caps stalled frame delta and drops excess fixed work instead of accumulating a backlog', () => {
    const clock = new FrameClock(0.01, 0.1, 3);
    clock.tick(0);
    const stalled = clock.tick(5000);
    expect(stalled.deltaSeconds).toBe(0.1);
    expect(stalled.fixedSteps).toHaveLength(3);
    expect(stalled.fixedSteps.every(step => step.deltaSeconds === 0.01)).toBe(true);
    const following = clock.tick(5010);
    expect(following.fixedSteps.length).toBeLessThanOrEqual(2);
    expect(following.fixedSteps.at(-1)?.elapsedSeconds).toBeLessThanOrEqual(0.05);
  });

  it('resets the pause gap and fractional step without rewinding elapsed simulation', () => {
    const clock = new FrameClock(0.02);
    clock.tick(0);
    expect(clock.tick(30).fixedSteps).toHaveLength(1);
    clock.reset();
    expect(clock.tick(100_000)).toEqual({ deltaSeconds: 0, elapsedSeconds: 0.03, fixedSteps: [] });
    expect(clock.tick(100_010).fixedSteps).toHaveLength(0);
    expect(clock.tick(100_020).fixedSteps).toEqual([{ deltaSeconds: 0.02, elapsedSeconds: 0.04 }]);
  });

  it('clamps backwards timestamps to a zero delta', () => {
    const clock = new FrameClock();
    clock.tick(100);
    expect(clock.tick(90)).toEqual({ deltaSeconds: 0, elapsedSeconds: 0, fixedSteps: [] });
  });

  it('rejects invalid timestamps and invalid scheduling configuration', () => {
    const clock = new FrameClock();
    for (const timestamp of [NaN, Infinity, -Infinity]) expect(() => clock.tick(timestamp)).toThrow('finite');
    for (const value of [0, -1, NaN, Infinity]) {
      expect(() => new FrameClock(value)).toThrow('configuration');
      expect(() => new FrameClock(1 / 60, value)).toThrow('configuration');
    }
    for (const value of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => new FrameClock(1 / 60, 0.1, value)).toThrow('configuration');
    }
  });
});

describe('browser-native audio lifetime', () => {
  it('creates no context until resume, then reuses a running context', async () => {
    vi.stubGlobal('AudioContext', MockAudioContext);
    const audio = createAudioService();
    expect(audio.context).toBeNull();
    expect(MockAudioContext.instances).toHaveLength(0);
    await audio.resume();
    await audio.resume();
    expect(MockAudioContext.instances).toHaveLength(1);
    const context = MockAudioContext.instances[0];
    expect(audio.context).toBe(context);
    expect(context?.resume).toHaveBeenCalledTimes(1);
    await audio.dispose();
    await audio.dispose();
    expect(context?.close).toHaveBeenCalledTimes(1);
    expect(audio.context).toBeNull();
    await expect(audio.resume()).rejects.toThrow('disposed');
  });

  it('can dispose before the first user gesture without requiring AudioContext', async () => {
    const audio = createAudioService();
    await audio.dispose();
    await audio.dispose();
    expect(audio.context).toBeNull();
    await expect(audio.resume()).rejects.toThrow('disposed');
  });

  it('propagates a browser resume rejection and allows a later gesture to retry', async () => {
    vi.stubGlobal('AudioContext', MockAudioContext);
    const audio = createAudioService();
    await audio.resume();
    const context = MockAudioContext.instances[0];
    if (!context) throw new Error('AudioContext was not created');
    context.state = 'suspended';
    context.resume.mockRejectedValueOnce(new Error('gesture required'));
    await expect(audio.resume()).rejects.toThrow('gesture required');
    await audio.resume();
    expect(context.state).toBe('running');
    await audio.dispose();
  });
});

it('initializes real Rapier WASM and resolves a dynamic body against a fixed collider', async () => {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  try {
    world.timestep = 1 / 60;
    const floor = world.createCollider(RAPIER.ColliderDesc.cuboid(5, 0.5, 5).setTranslation(0, -0.5, 0));
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 3, 0));
    world.createCollider(RAPIER.ColliderDesc.ball(0.5), body);
    for (let step = 0; step < 180; step += 1) world.step();
    expect(floor.parent()).toBeNull();
    expect(body.translation().y).toBeGreaterThan(0.45);
    expect(body.translation().y).toBeLessThan(0.55);
    expect(Math.abs(body.linvel().y)).toBeLessThan(0.05);
    expect(world.colliders.len()).toBe(2);
  } finally {
    world.free();
  }
});
