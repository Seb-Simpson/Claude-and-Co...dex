/** Ordered story authority. AI, camera, physics and persistence remain adapters, not state here. */
export interface EncounterDirector<P extends string> {
  readonly phase: P;
  readonly elapsed: number;
  /** Only the immediate successor can be entered. Stale/reentrant commands are harmless. */
  advance(expected: P): boolean;
  tick(deltaSeconds: number): void;
}
export function createEncounterDirector<P extends string>(
  phases: readonly P[], restored?: P, transition?: (previous: P, current: P) => void,
): EncounterDirector<P> {
  if (!phases.length || new Set(phases).size !== phases.length) throw new Error('Encounter phases must be unique');
  let index = restored === undefined ? 0 : phases.indexOf(restored);
  if (index < 0) throw new Error('Unknown encounter checkpoint phase');
  let elapsed = 0;
  let transitioning = false;
  return {
    get phase() { return phases[index]!; }, get elapsed() { return elapsed; },
    advance(expected) {
      if (transitioning || phases[index] !== expected || index === phases.length - 1) return false;
      const previous = phases[index++]!;
      elapsed = 0;
      transitioning = true;
      try {transition?.(previous, phases[index]!);} finally {transitioning = false;}
      return true;
    },
    tick(dt) {
      if (!Number.isFinite(dt) || dt < 0) throw new Error('Invalid encounter time');
      elapsed += Math.min(dt, .1);
    },
  };
}
