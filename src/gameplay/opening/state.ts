/**
 * Room 104 content state. Spatial validation belongs to the interaction adapter;
 * this reducer accepts only already-validated semantic actions.
 *
 * Voice flags reserve their one-shot cues when emitted, before asynchronous
 * playback starts. A restarted checkpoint cannot schedule either cue twice.
 */
export interface OpeningState {
  readonly version: 1;
  readonly awakened: boolean;
  readonly cardAcquired: boolean;
  readonly doorUnlocked: boolean;
  readonly firstLinePlayed: boolean;
  readonly secondLinePlayed: boolean;
  readonly room106Tried: boolean;
  readonly sightingSeen: boolean;
  readonly stationReached: boolean;
}

export type OpeningCommand =
  | 'awaken'
  | 'try-locked-door'
  | 'take-card'
  | 'use-reader'
  | 'try-106'
  | 'see-nurse'
  | 'reach-station';

export type OpeningEffect =
  | 'handle-104'
  | 'voice-return-to-bed'
  | 'card-taken'
  | 'reader-denied'
  | 'reader-accepted'
  | 'voice-not-authorised'
  | 'handle-106'
  | 'sighting'
  | 'station-handoff';

export interface OpeningResult {
  readonly state: OpeningState;
  readonly effects: readonly OpeningEffect[];
}

const flags = [
  'awakened', 'cardAcquired', 'doorUnlocked', 'firstLinePlayed',
  'secondLinePlayed', 'room106Tried', 'sightingSeen', 'stationReached',
] as const satisfies readonly (keyof OpeningState)[];
const allowedKeys = new Set<string>(['version', ...flags]);

export function createOpeningState(): OpeningState {
  return {
    version: 1,
    awakened: false,
    cardAcquired: false,
    doorUnlocked: false,
    firstLinePlayed: false,
    secondLinePlayed: false,
    room106Tried: false,
    sightingSeen: false,
    stationReached: false,
  };
}

/** Validate an untrusted save payload and return a fresh bounded data object. */
export function validateOpeningState(value: unknown): OpeningState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const data = value as Record<string, unknown>;
  const keys = Reflect.ownKeys(data);
  if (keys.length !== allowedKeys.size || keys.some(key => typeof key !== 'string' || !allowedKeys.has(key))) return null;
  // Accessors are not save data and can throw or change value between reads.
  if (keys.some(key => !('value' in Object.getOwnPropertyDescriptor(data, key)!))) return null;
  if (data.version !== 1 || flags.some(key => typeof data[key] !== 'boolean')) return null;
  const state = data as unknown as OpeningState;
  if (!state.awakened && flags.some(key => key !== 'awakened' && state[key])) return null;
  if (state.doorUnlocked && !state.cardAcquired) return null;
  // Unlocking and reserving line two are one atomic semantic transition.
  if (state.secondLinePlayed !== state.doorUnlocked) return null;
  if ((state.room106Tried || state.sightingSeen || state.stationReached) && !state.doorUnlocked) return null;
  return {
    version: 1,
    awakened: state.awakened,
    cardAcquired: state.cardAcquired,
    doorUnlocked: state.doorUnlocked,
    firstLinePlayed: state.firstLinePlayed,
    secondLinePlayed: state.secondLinePlayed,
    room106Tried: state.room106Tried,
    sightingSeen: state.sightingSeen,
    stationReached: state.stationReached,
  };
}

/**
 * No clocks, timers, world coordinates, audio handles or player-facing objectives.
 * Presentation effects are ordered: mechanical feedback precedes the voice cue.
 */
export function reduceOpening(state: OpeningState, command: OpeningCommand): OpeningResult {
  if (!validateOpeningState(state)) throw new Error('Invalid Room 104 opening state');
  const unchanged = (): OpeningResult => ({ state, effects: [] });
  if (command === 'awaken') return state.awakened ? unchanged() : { state: { ...state, awakened: true }, effects: [] };
  if (!state.awakened) return unchanged();
  switch (command) {
    case 'try-locked-door':
      if (state.doorUnlocked) return unchanged();
      return {
        state: state.firstLinePlayed ? state : { ...state, firstLinePlayed: true },
        effects: state.firstLinePlayed ? ['handle-104'] : ['handle-104', 'voice-return-to-bed'],
      };
    case 'take-card':
      return state.cardAcquired ? unchanged() : { state: { ...state, cardAcquired: true }, effects: ['card-taken'] };
    case 'use-reader':
      if (state.doorUnlocked) return unchanged();
      if (!state.cardAcquired) return { state, effects: ['reader-denied'] };
      return {
        state: { ...state, doorUnlocked: true, secondLinePlayed: true },
        effects: ['reader-accepted', 'voice-not-authorised'],
      };
    case 'try-106':
      if (!state.doorUnlocked) return unchanged();
      return { state: state.room106Tried ? state : { ...state, room106Tried: true }, effects: ['handle-106'] };
    case 'see-nurse':
      if (!state.doorUnlocked || state.sightingSeen) return unchanged();
      return { state: { ...state, sightingSeen: true }, effects: ['sighting'] };
    case 'reach-station':
      if (!state.doorUnlocked || state.stationReached) return unchanged();
      return { state: { ...state, stationReached: true }, effects: ['station-handoff'] };
  }
}
