import { validateOpeningState } from './state';
import type { OpeningState } from './state';

/** Semantic milestones only. The binding adapter supplies the restored player pose. */
export interface OpeningCheckpoint {
  readonly version: 1;
  readonly milestone: 'room104-exit' | 'station-approach';
  readonly state: OpeningState;
}

const keys = new Set(['version', 'milestone', 'state']);

/** Validates untrusted slot data without invoking accessors or retaining mutable references. */
export function validateOpeningCheckpoint(value: unknown): OpeningCheckpoint | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.size || ownKeys.some(key => typeof key !== 'string' || !keys.has(key))) return null;
  if (ownKeys.some(key => !('value' in Object.getOwnPropertyDescriptor(value, key)!))) return null;
  const data = value as Record<string, unknown>;
  if (data.version !== 1 || (data.milestone !== 'room104-exit' && data.milestone !== 'station-approach')) return null;
  const state = validateOpeningState(data.state);
  if (!state || !state.awakened || !state.doorUnlocked) return null;
  if (state.stationReached !== (data.milestone === 'station-approach')) return null;
  return { version: 1, milestone: data.milestone, state };
}

/** A checkpoint captures an internally consistent milestone, not an interaction autosave. */
export function createOpeningCheckpoint(
  state: OpeningState,
  milestone: OpeningCheckpoint['milestone'],
): OpeningCheckpoint {
  const checkpoint = validateOpeningCheckpoint({ version: 1, milestone, state });
  if (!checkpoint) throw new Error('Cannot checkpoint Room 104 before a valid opening milestone');
  return checkpoint;
}
