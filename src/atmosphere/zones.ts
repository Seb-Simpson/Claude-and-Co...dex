/** Per-space darkness: fog density and ambient floor. Tags come from the hospital room metadata. */
export interface ZoneMood { readonly fog: number; readonly ambient: number }

const MOODS: readonly (readonly [string, ZoneMood])[] = [
  ['stairwell', { fog: 0.07, ambient: 0.22 }],
  ['maintenance', { fog: 0.075, ambient: 0.24 }],
  ['storage', { fog: 0.068, ambient: 0.27 }],
  ['flooded', { fog: 0.064, ambient: 0.28 }],
  ['isolation', { fog: 0.066, ambient: 0.26 }],
  // NW-005A: the ward was lit like an open one. Patient rooms and corridors now sit much lower,
  // so the working tubes make pools with real darkness between them; the nurses' station stays the
  // brightest space (the lit island the player walks toward). The camera-following fill light
  // (lightRig) still keeps the floor in front of the player readable.
  // The room the player wakes in is the calm before the corridor: enough light to look around and
  // read what is in it. (Listed before 'patient-room': the first matching tag wins.)
  ['player-start', { fog: 0.054, ambient: 0.3 }],
  ['patient-room', { fog: 0.064, ambient: 0.19 }],
  ['nurses-station', { fog: 0.05, ambient: 0.3 }],
  ['treatment', { fog: 0.058, ambient: 0.24 }],
  ['waiting', { fog: 0.06, ambient: 0.24 }],
  // Fog kept moderate in corridors: the lit station 9 m away has to stay visible through it.
  ['corridor', { fog: 0.05, ambient: 0.2 }],
];

const DEFAULT: ZoneMood = { fog: 0.06, ambient: 0.24 };

/** First matching tag wins (most specific spaces are listed first). */
export function zoneMood(tags: readonly string[]): ZoneMood {
  for (const [tag, mood] of MOODS) if (tags.includes(tag)) return mood;
  return DEFAULT;
}
