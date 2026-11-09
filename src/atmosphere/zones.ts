/** Per-space darkness: fog density and ambient floor. Tags come from the hospital room metadata. */
export interface ZoneMood { readonly fog: number; readonly ambient: number }

const MOODS: readonly (readonly [string, ZoneMood])[] = [
  ['stairwell', { fog: 0.07, ambient: 0.22 }],
  ['maintenance', { fog: 0.075, ambient: 0.24 }],
  ['electrical', { fog: 0.072, ambient: 0.23 }],
  ['records', { fog: 0.06, ambient: 0.3 }],
  ['storage', { fog: 0.068, ambient: 0.27 }],
  ['flooded', { fog: 0.064, ambient: 0.28 }],
  ['isolation', { fog: 0.066, ambient: 0.26 }],
  ['patient-room', { fog: 0.058, ambient: 0.32 }],
  ['nurses-station', { fog: 0.044, ambient: 0.42 }],
  ['treatment', { fog: 0.052, ambient: 0.36 }],
  ['waiting', { fog: 0.055, ambient: 0.34 }],
  ['corridor', { fog: 0.05, ambient: 0.38 }],
];

const DEFAULT: ZoneMood = { fog: 0.052, ambient: 0.38 };

/** First matching tag wins (most specific spaces are listed first). */
export function zoneMood(tags: readonly string[]): ZoneMood {
  for (const [tag, mood] of MOODS) if (tags.includes(tag)) return mood;
  return DEFAULT;
}
