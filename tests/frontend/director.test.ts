import { describe, expect, it } from 'vitest';
import { createDirector, frameLuminance, type CorridorEvent, type LightState } from '../../src/frontend/menu/director';

const FPS = 60;
function run(seconds: number, options: Parameters<typeof createDirector>[0] = {}): { states: LightState[]; events: CorridorEvent[]; kinds: string[] } {
  const d = createDirector({ seed: 104, ...options });
  const events: CorridorEvent[] = [];
  d.onEvent((e) => events.push(e));
  const states: LightState[] = [];
  for (let i = 0; i < seconds * FPS; i++) states.push(d.update(1 / FPS));
  return { states, events, kinds: d.sequences.map((s) => s.kind) };
}

/** Count luminance reversals of at least `threshold` (a flash is two of them). */
function transitionsPerSecond(states: LightState[], threshold: number): number {
  const L = states.map(frameLuminance);
  const times: number[] = [];
  let extreme = L[0]!;
  let direction = 0;
  for (let i = 1; i < L.length; i++) {
    const v = L[i]!;
    if (direction >= 0 && v > extreme) extreme = v;
    else if (direction <= 0 && v < extreme) extreme = v;
    if (direction >= 0 && extreme - v >= threshold) { times.push(i / FPS); direction = -1; extreme = v; }
    else if (direction <= 0 && v - extreme >= threshold) { times.push(i / FPS); direction = 1; extreme = v; }
  }
  let worst = 0;
  for (let i = 0, j = 0; i < times.length; i++) {
    while (times[i]! - times[j]! > 1) j++;
    worst = Math.max(worst, i - j + 1);
  }
  return worst;
}

describe('title-screen lighting director', () => {
  it('is deterministic for a seed', () => {
    const a = run(90);
    const b = run(90);
    expect(a.kinds).toEqual(b.kinds);
    expect(a.states[5000]).toEqual(b.states[5000]);
    expect(run(90, { seed: 7 }).kinds).not.toEqual(a.kinds);
  });

  it('opens with the tube striking on, and visibly fails within seconds', () => {
    const { states } = run(20);
    expect(states[5]!.main).toBeLessThan(0.1); // starts dark
    expect(states[Math.round(2.5 * FPS)]!.main).toBeGreaterThan(0.8); // then on
    const afterOn = states.slice(3 * FPS);
    expect(afterOn.some((s) => s.main < 0.4)).toBe(true); // and it fails again before 20 s
  });

  it('shows the figure early, only in the dark, and takes it away when the light returns', () => {
    const { states, events } = run(40);
    const firstIn = events.find((e) => e.type === 'figure-in');
    expect(firstIn?.at).toBeGreaterThan(10);
    expect(firstIn!.at).toBeLessThan(26);
    const seen = states.filter((s) => s.figure > 0.05);
    expect(seen.length).toBeGreaterThan(FPS); // there for more than a second in total
    for (const s of seen) expect(s.main).toBeLessThan(0.25);
    expect(events.some((e) => e.type === 'figure-out' && e.at > firstIn!.at)).toBe(true);
  });

  it('never runs as a loop: varied sequences, never the same twice running, irregular gaps', () => {
    const d = createDirector({ seed: 3 });
    for (let i = 0; i < 600 * FPS; i++) d.update(1 / FPS);
    const kinds = d.sequences.map((s) => s.kind);
    expect(new Set(kinds).size).toBeGreaterThanOrEqual(6);
    for (let i = 1; i < kinds.length; i++) expect(kinds[i]).not.toBe(kinds[i - 1]);
    const gaps = d.sequences.slice(1).map((s, i) => s.at - d.sequences[i]!.at);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length);
    expect(sd).toBeGreaterThan(1.5);
    expect(kinds.filter((k) => k === 'figure').length).toBeGreaterThanOrEqual(4);
  });

  it('keeps big light changes under three flashes per second (photosensitivity)', () => {
    for (const seed of [1, 2, 3, 104, 1969]) {
      const { states } = run(600, { seed });
      expect(transitionsPerSecond(states, 0.1)).toBeLessThanOrEqual(6);
    }
  });

  it('reduced motion: the light still changes, but only by slow fades, and nothing sways', () => {
    const { states, events } = run(120, { reducedMotion: true });
    const L = states.map(frameLuminance);
    let maxStep = 0;
    for (let i = 1; i < L.length; i++) maxStep = Math.max(maxStep, Math.abs(L[i]! - L[i - 1]!));
    expect(maxStep).toBeLessThan(0.03);
    expect(Math.min(...states.slice(10 * FPS).map((s) => s.main))).toBeLessThan(0.1);
    expect(new Set(states.map((s) => s.sway))).toEqual(new Set([0.5]));
    expect(events.some((e) => e.type === 'figure-in')).toBe(true);
  });

  it('force() runs a sequence on demand and announces it for the sound', () => {
    const d = createDirector({ seed: 9, firstFigureAt: 999 });
    const events: CorridorEvent[] = [];
    d.onEvent((e) => events.push(e));
    for (let i = 0; i < 4 * FPS; i++) d.update(1 / FPS);
    d.force('figure');
    let peak = 0;
    let darkest = 1;
    for (let i = 0; i < 3 * FPS; i++) { const s = d.update(1 / FPS); peak = Math.max(peak, s.figure); darkest = Math.min(darkest, s.main); }
    expect(darkest).toBe(0);
    expect(peak).toBeGreaterThan(0.95);
    for (let i = 0; i < 6 * FPS; i++) d.update(1 / FPS);
    expect(d.state.figure).toBe(0);
    expect(d.state.main).toBeGreaterThan(0.8);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['drop', 'blackout', 'figure-in', 'figure-out', 'return']));

    d.force('exit-pulse');
    let exitPeak = 0;
    for (let i = 0; i < FPS; i++) exitPeak = Math.max(exitPeak, d.update(1 / FPS).exit);
    expect(exitPeak).toBeGreaterThan(1.5);
  });

  it('freeze pins channels for screenshots', () => {
    const d = createDirector({ seed: 1 });
    d.freeze({ main: 0, figure: 1 });
    for (let i = 0; i < 2 * FPS; i++) d.update(1 / FPS);
    expect(d.state.main).toBe(0);
    expect(d.state.figure).toBe(1);
    d.freeze(null);
    d.update(1 / FPS);
    expect(d.state.figure).toBe(0);
  });
});
