import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cpu = vi.hoisted(() => ({ now: 0, physicsCalls: 0, renderMs: 7, physicsMs: 2 }));
vi.mock('three', async (importOriginal) => {
  const original = await importOriginal<typeof import('three')>();
  return {
    ...original,
    WebGLRenderer: class {
      domElement = Object.assign(new EventTarget(), { setAttribute() {}, remove() {} });
      setPixelRatio() {}
      setSize() {}
      render() { cpu.now += cpu.renderMs; }
      dispose() {}
      forceContextLoss() {}
    },
  };
});
vi.mock('@dimforge/rapier3d-compat', () => ({
  init: async () => {},
  World: class {
    timestep = 1 / 60;
    step() { cpu.physicsCalls += 1; cpu.now += cpu.physicsMs; }
    free() {}
  },
}));

import { createEngine } from '../../src/engine/createEngine';

let queued: Map<number, FrameRequestCallback>;
let nextRequest: number;
let documentTarget: EventTarget & { hidden: boolean };

beforeEach(() => {
  cpu.now = 0; cpu.physicsCalls = 0;
  queued = new Map(); nextRequest = 0;
  documentTarget = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal('document', documentTarget);
  vi.stubGlobal('window', Object.assign(new EventTarget(), { devicePixelRatio: 1 }));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = ++nextRequest; queued.set(id, callback); return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { queued.delete(id); });
  vi.spyOn(performance, 'now').mockImplementation(() => cpu.now);
});
afterEach(() => { vi.unstubAllGlobals(); });

function nextFrame(milliseconds: number): void {
  const frame = queued.entries().next().value as [number, FrameRequestCallback] | undefined;
  if (!frame) throw new Error('The engine did not schedule a frame');
  queued.delete(frame[0]);
  frame[1](milliseconds);
}
function container(): HTMLElement {
  return { clientWidth: 800, clientHeight: 450, appendChild() {} } as unknown as HTMLElement;
}

describe('engine frame instrumentation', () => {
  it('measures all fixed substeps, Rapier, update and render independently from raw RAF gaps', async () => {
    const engine = await createEngine({ container: container() });
    try {
      engine.start({ fixedUpdate() { cpu.now += 3; }, update() { cpu.now += 5; } });
      nextFrame(0);
      nextFrame(1000);
      const snapshot = engine.getPerformanceSnapshot?.();
      expect(snapshot?.sampleCount).toBe(2);
      expect(snapshot?.totalFrames).toBe(2);
      expect(snapshot?.totalSubsteps).toBe(5);
      expect(snapshot?.frameIntervalMs.last).toBe(1000);
      expect(snapshot?.fixedMs.last).toBe(15);
      expect(snapshot?.physicsMs.last).toBe(10);
      expect(snapshot?.updateMs.last).toBe(5);
      expect(snapshot?.renderMs.last).toBe(7);
      expect(snapshot?.frameCpuMs.last).toBe(37);
      expect(snapshot?.substeps.last).toBe(5);
      expect(cpu.physicsCalls).toBe(5);
      expect(queued.size).toBe(1);
    } finally { await engine.dispose(); }
    expect(queued.size).toBe(0);
  });

  it('excludes visibility pauses and clears measurements when the engine is restarted', async () => {
    const engine = await createEngine({ container: container() });
    try {
      engine.start({});
      nextFrame(0); nextFrame(16);
      documentTarget.hidden = true;
      documentTarget.dispatchEvent(new Event('visibilitychange'));
      expect(queued.size).toBe(0);
      documentTarget.hidden = false;
      documentTarget.dispatchEvent(new Event('visibilitychange'));
      nextFrame(100_000);
      expect(engine.getPerformanceSnapshot?.().frameIntervalMs.max).toBe(16);
      nextFrame(100_020);
      expect(engine.getPerformanceSnapshot?.().frameIntervalMs.last).toBe(20);
      engine.stop();
      expect(queued.size).toBe(0);
      engine.start({});
      expect(engine.getPerformanceSnapshot?.().sampleCount).toBe(0);
      nextFrame(200_000);
      expect(engine.getPerformanceSnapshot?.().sampleCount).toBe(1);
      expect(engine.getPerformanceSnapshot?.().frameIntervalMs.max).toBe(0);
      expect(queued.size).toBe(1);
    } finally { await engine.dispose(); }
  });
});
