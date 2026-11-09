import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EntityType } from '../../../src/contracts';
import { dist2, type Sim } from './harness';

/**
 * Step A measurements. With NW004A_REPORT=1 every scenario writes its numbers to
 * docs/nw-004a/step-a/<file>.json (the report quotes them); without it nothing is written.
 */
const results = new Map<string, Record<string, unknown>>();
export function record(file: string, key: string, value: unknown): void {
  const entry = results.get(file) ?? {};
  entry[key] = value;
  results.set(file, entry);
  if (!process.env.NW004A_REPORT) return;
  const out = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/nw-004a/step-a', `${file}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(entry, null, 2)}\n`);
}

const r1 = (v: number): number => Math.round(v * 10) / 10;

/** A compact, human-readable account of one run: outcome, state changes, doors, distances. */
export function summarise(sim: Sim, type: EntityType): Record<string, unknown> {
  const timeline: string[] = [];
  let last = '';
  let minDistance = Infinity;
  let seenAt: number | null = null;
  for (const s of sim.samples) {
    const e = s.entities.find((x) => x.type === type);
    if (!e) continue;
    const d = dist2(e.position, s.player);
    minDistance = Math.min(minDistance, d);
    if (seenAt === null && e.state === 'pursue') seenAt = s.t;
    if (e.state !== last) {
      timeline.push(`${s.t.toFixed(1)}s ${e.state} at (${e.position.x.toFixed(1)}, ${e.position.z.toFixed(1)}), player (${s.player.x.toFixed(1)}, ${s.player.z.toFixed(1)}), ${d.toFixed(1)} m${e.lastKnownPlayer ? `, last known by ${e.lastKnownPlayer.source}` : ''}`);
      last = e.state;
    }
  }
  return {
    captured: sim.captured.length > 0,
    endTime: r1(sim.time),
    playerEnd: { x: r1(sim.position.x), z: r1(sim.position.z) },
    hidden: sim.player.getSnapshot().hiding.state,
    firstPursuit: seenAt === null ? null : r1(seenAt),
    minDistance: r1(minDistance),
    maxEntitySpeed: r1(sim.maxEntitySpeed(type)),
    timeline,
    doors: sim.doorLog.filter((d) => d.to === 'opening' || d.to === 'closing' || d.to === 'blocked').map((d) => `${d.t.toFixed(1)}s ${d.door.replace('nw:door:', '')} ${d.to}`),
  };
}

/**
 * Fairness: every position the entity believed the player was at must be a place the player
 * really was at that moment (vision or a real footstep), never a hidden live locator.
 */
export function lastKnownIsHonest(sim: Sim, type: EntityType): { checked: number; worst: number } {
  let worst = 0;
  let checked = 0;
  const seen = new Set<string>();
  for (const s of sim.samples) {
    const lk = s.entities.find((x) => x.type === type)?.lastKnownPlayer;
    if (!lk) continue;
    const key = `${lk.timeSeconds}:${lk.position.x}:${lk.position.z}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let best = Infinity;
    for (const q of sim.samples) if (Math.abs(q.t - lk.timeSeconds) <= 0.15) best = Math.min(best, dist2(q.player, lk.position));
    if (best === Infinity) continue;
    checked += 1;
    worst = Math.max(worst, best);
  }
  return { checked, worst: r1(worst) };
}
