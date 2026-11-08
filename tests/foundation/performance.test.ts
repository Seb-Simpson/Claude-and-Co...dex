import { describe, expect, it } from 'vitest';
import { FrameProfiler } from '../../src/engine/performance';
import { FrameClock } from '../../src/engine/timing';

describe('bounded engine performance samples', () => {
  it('retains actual stalled RAF intervals while the simulation clock remains capped', () => {
    const profiler = new FrameProfiler();
    const clock = new FrameClock();
    clock.tick(0);
    profiler.record(0, 12, 0, 0, 5, 7, 0);
    const stalled = clock.tick(1000);
    profiler.record(1000, 37, 15, 10, 5, 7, stalled.fixedSteps.length);
    const snapshot = profiler.snapshot();
    expect(stalled.deltaSeconds).toBe(0.1);
    expect(snapshot.frameIntervalMs).toEqual({ last: 1000, mean: 1000, p50: 1000, p95: 1000, max: 1000 });
    expect(snapshot.substeps.last).toBe(5);
    expect(snapshot.fixedMs.last).toBe(15);
    expect(snapshot.physicsMs.last).toBe(10);
    expect(snapshot.frameCpuMs.last).toBe(37);
  });

  it('bounds storage and drops stale spikes rather than accumulating a lifetime maximum', () => {
    const profiler = new FrameProfiler(4);
    profiler.record(0, 900, 800, 70, 10, 20, 5);
    for (let index = 1; index <= 8; index++) profiler.record(index * 16, index, 1, 2, 3, 4, 1);
    const snapshot = profiler.snapshot();
    expect(snapshot.sampleCount).toBe(4);
    expect(snapshot.capacity).toBe(4);
    expect(snapshot.totalFrames).toBe(9);
    expect(snapshot.totalSubsteps).toBe(13);
    expect(snapshot.frameCpuMs).toEqual({ last: 8, mean: 6.5, p50: 6, p95: 8, max: 8 });
    expect(snapshot.fixedMs.max).toBe(1);
    expect(snapshot.frameIntervalMs.mean).toBe(16);
  });

  it('excludes the first interval after a pause and clears samples for a new session', () => {
    const profiler = new FrameProfiler();
    profiler.record(0, 1, 0, 0, 0, 1, 0);
    profiler.record(16, 1, 0, 0, 0, 1, 0);
    profiler.resetInterval();
    profiler.record(100_000, 1, 0, 0, 0, 1, 0);
    expect(profiler.snapshot().frameIntervalMs.max).toBe(16);
    expect(profiler.snapshot().frameIntervalMs.last).toBe(0);
    profiler.record(100_020, 1, 0, 0, 0, 1, 0);
    expect(profiler.snapshot().frameIntervalMs.mean).toBe(18);
    profiler.clear();
    expect(profiler.snapshot().sampleCount).toBe(0);
    expect(profiler.snapshot().totalFrames).toBe(0);
    expect(profiler.snapshot().totalSubsteps).toBe(0);
    expect(profiler.snapshot().frameIntervalMs.max).toBe(0);
    expect(profiler.snapshot().frameCpuMs.max).toBe(0);
    profiler.record(200_000, 2, 0, 0, 0, 2, 0);
    expect(profiler.snapshot().frameIntervalMs.max).toBe(0);
    expect(profiler.snapshot().frameCpuMs.last).toBe(2);
  });

  it('returns independent snapshots and rejects an invalid capacity', () => {
    const profiler = new FrameProfiler();
    profiler.record(0, 1, 0, 0, 0, 1, 0);
    const first = profiler.snapshot();
    profiler.record(100, 5, 1, 1, 1, 2, 1);
    expect(first.sampleCount).toBe(1);
    expect(first.frameCpuMs.last).toBe(1);
    expect(profiler.snapshot().frameCpuMs.last).toBe(5);
    for (const capacity of [0, -1, 1.5, NaN, Infinity]) expect(() => new FrameProfiler(capacity)).toThrow('capacity');
  });
});
