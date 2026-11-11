import {validateNarrativeCheckpoint} from '../directors/narrative';
import type {NarrativeCheckpoint} from '../directors/narrative';
import {validateStationCheckpoint} from '../encounters/checkpoint';
import type {StationCheckpoint} from '../encounters/checkpoint';
import { validateOpeningState } from './state';
import type { OpeningState } from './state';

/** Semantic milestones only. The binding adapter supplies the restored player pose. */
export interface OpeningCheckpoint {
  readonly narrative?: NarrativeCheckpoint;
  readonly station?: StationCheckpoint;
  readonly version: 1;
  readonly milestone: 'room104-exit' | 'station-approach';
  readonly state: OpeningState;
}

const keys = new Set(['version', 'milestone', 'state', 'station', 'narrative']);

/** Validates untrusted slot data without invoking accessors or retaining mutable references. */
export function validateOpeningCheckpoint(value: unknown): OpeningCheckpoint | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const ownKeys = Reflect.ownKeys(value);
  if ((ownKeys.length < 3 || ownKeys.length > 5) || ownKeys.some(key => typeof key !== 'string' || !keys.has(key))) return null;
  if (ownKeys.some(key => !('value' in Object.getOwnPropertyDescriptor(value, key)!))) return null;
  const data = value as Record<string, unknown>;
  if (data.version !== 1 || (data.milestone !== 'room104-exit' && data.milestone !== 'station-approach')) return null;
  const state = validateOpeningState(data.state);
  if (!state || !state.awakened || !state.doorUnlocked) return null;
  if (state.stationReached !== (data.milestone === 'station-approach')) return null;
  const station = data.station === undefined ? undefined : validateStationCheckpoint(data.station);
  if (data.station !== undefined && !station) return null;
  if (station?.phase === 'complete' && !state.stationReached) return null;
  const narrative = data.narrative === undefined ? undefined : validateNarrativeCheckpoint(data.narrative);
  if (data.narrative !== undefined && (!narrative || narrative.step < 2)) return null;
  if(narrative && (state.stationReached!==(narrative.step>=3) || (narrative.step>=5&&!station)))return null;
  if (narrative && station && narrative.step !== ({introduction:4,tension:5,stealth:6,complete:7} as const)[station.phase]) return null;
  return { version: 1, milestone: data.milestone, state, ...(station ? {station} : {}), ...(narrative ? {narrative} : {}) };
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
