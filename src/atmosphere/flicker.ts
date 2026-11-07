import type { FixtureState } from '../world/extras';

/** Integer hash → [0,1). Stable across runs so each fixture keeps its own personality. */
export function hash01(a: number, b = 0): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x165667b1, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export function seedFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Brightness multiplier in [0, ~1.1] for a fixture state at presentation time `t` (seconds).
 * Patterns are irregular but deterministic: fluorescent tubes misfire in bursts with long calm
 * gaps rather than strobing constantly, which keeps the ward navigable.
 */
export function fixtureBrightness(state: FixtureState, t: number, seed: number): number {
  switch (state) {
    case 'steady':
      return 1;
    case 'dead':
      return 0;
    case 'buzz': {
      const w = Math.floor(t * 9 + seed % 97);
      const micro = hash01(seed, w) < 0.03 ? 0.55 : 1;
      return micro * (0.95 + 0.05 * Math.sin(t * 47 + seed));
    }
    case 'flicker': {
      const windowLength = 1.7;
      const w = Math.floor(t / windowLength + (seed % 13));
      const burst = hash01(seed, w);
      if (burst > 0.34) return 1;
      const local = t - Math.floor(t / windowLength) * windowLength;
      const burstLength = 0.25 + hash01(seed + 1, w) * 0.9;
      if (local > burstLength) return 1;
      const tick = Math.floor(t * (14 + hash01(seed + 2, w) * 16));
      return hash01(seed + 3, tick) > 0.45 ? 1 : 0.06;
    }
    case 'dying': {
      const windowLength = 4.5;
      const w = Math.floor(t / windowLength + (seed % 7));
      const attempt = hash01(seed, w);
      const local = t - Math.floor(t / windowLength) * windowLength;
      if (attempt < 0.55 || local > 0.3 + attempt * 1.2) return 0.03;
      const tick = Math.floor(t * 22);
      return hash01(seed + 5, tick) > 0.5 ? 0.4 + 0.5 * attempt : 0.03;
    }
  }
}

export type LightingEffect = 'restore' | 'blackout' | 'flicker' | 'dim';

/** Active override from a lighting event or ambient disturbance. */
export interface LightOverride {
  readonly effect: Exclude<LightingEffect, 'restore'>;
  readonly start: number;
  readonly end: number;
  readonly intensity: number;
  readonly seed: number;
}

/** Apply an override on top of the base brightness. Fades in/out over ~0.25 s at the edges. */
export function applyOverride(base: number, override: LightOverride | undefined, t: number): number {
  if (!override || t >= override.end || t < override.start) return base;
  const edge = Math.min(1, (t - override.start) / 0.25, (override.end - t) / 0.25);
  switch (override.effect) {
    case 'blackout':
      return base * (1 - edge) + 0 * edge;
    case 'dim':
      return base * (1 - edge) + base * override.intensity * edge;
    case 'flicker': {
      const tick = Math.floor(t * 18);
      const on = hash01(override.seed, tick) > 0.5 ? 1 : 0.05;
      return base * (1 - edge) + Math.max(on * override.intensity, 0) * edge;
    }
  }
}
