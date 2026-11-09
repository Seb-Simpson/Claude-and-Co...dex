import { beforeAll, expect, it } from 'vitest';
import { initRapier, Sim } from './harness';
import { record } from './report';

/**
 * NW-004A Step A, condition 7 (gameplay side): cost of one Patient AI fixed step (perception,
 * navigation, door navigation) over 30 simulated seconds, classic ward vs the Chapter 1 blockout.
 * Wall-clock numbers from this container; compare the shapes, not the absolute values.
 */
beforeAll(initRapier);
it('measures Patient AI step cost: classic vs Chapter 1 (latched and released)', () => {
  for (const [label, layout, stage] of [['classic', 'classic', 'act1'], ['chapter1-act1-cell-latched', 'chapter1', 'act1'], ['chapter1-alarm-released', 'chapter1', 'alarm']] as const) {
    const sim = new Sim({ layout, stage, player: { x: -12.4, z: 4.1, yaw: 0 }, entities: ['patient'] });
    try {
      const times: number[] = [];
      for (let i = 0; i < 1800; i++) {
        const t = performance.now();
        sim.entities.fixedUpdate({ deltaSeconds: 1 / 60, elapsedSeconds: i / 60 });
        times.push(performance.now() - t);
        sim.rapier.step();
      }
      const over = times.filter((t) => t > 16.7).length;
      times.sort((a, b) => a - b);
      const r = (v: number): number => Math.round(v * 100) / 100;
      record('ai-cost', label, { medianMs: r(times[900]!), p99Ms: r(times[1782]!), maxMs: r(times[1799]!), stepsOver16ms: over, steps: 1800 });
      expect(times[900]!).toBeLessThan(2);
    } finally { sim.dispose(); }
  }
}, 120_000);
