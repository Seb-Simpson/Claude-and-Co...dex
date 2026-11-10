import { describe, expect, it } from 'vitest';
import { createOpeningState, reduceOpening, validateOpeningState } from '../../src/gameplay/opening/state';
import type { OpeningCommand, OpeningEffect, OpeningState } from '../../src/gameplay/opening/state';

function run(commands: readonly OpeningCommand[]): { state: OpeningState; effects: OpeningEffect[] } {
  let state = createOpeningState();
  const effects: OpeningEffect[] = [];
  for (const command of commands) {
    const result = reduceOpening(state, command);
    state = result.state;
    effects.push(...result.effects);
    expect(validateOpeningState(state)).toEqual(state);
  }
  return { state, effects };
}

const awake = (): OpeningState => reduceOpening(createOpeningState(), 'awaken').state;
const unlocked = (): OpeningState => run(['awaken', 'take-card', 'use-reader']).state;

describe('Room 104 opening causal state', () => {
  it('starts locked without possession or reserved voice events', () => {
    expect(createOpeningState()).toEqual({
      version: 1, awakened: false, cardAcquired: false, doorUnlocked: false,
      firstLinePlayed: false, secondLinePlayed: false, room106Tried: false,
      sightingSeen: false, stationReached: false,
    });
  });

  it('keeps gameplay actions inert until completed or skipped awakening hands control over', () => {
    const state = createOpeningState();
    for (const command of ['try-locked-door', 'take-card', 'use-reader', 'try-106', 'see-nurse', 'reach-station'] as const) {
      expect(reduceOpening(state, command)).toEqual({ state, effects: [] });
    }
    expect(reduceOpening(state, 'awaken').state.awakened).toBe(true);
    expect(reduceOpening(awake(), 'awaken').effects).toEqual([]);
  });

  it('responds physically on each deliberate locked-door attempt but reserves line one once', () => {
    const first = reduceOpening(awake(), 'try-locked-door');
    expect(first.effects).toEqual(['handle-104', 'voice-return-to-bed']);
    expect(first.state.doorUnlocked).toBe(false);
    const repeat = reduceOpening(first.state, 'try-locked-door');
    expect(repeat.effects).toEqual(['handle-104']);
    expect(repeat.state).toBe(first.state);
  });

  it('denies the reader without possessing the card and never accidentally unlocks', () => {
    const state = awake();
    expect(reduceOpening(state, 'use-reader')).toEqual({ state, effects: ['reader-denied'] });
    expect(state.cardAcquired).toBe(false);
    expect(state.secondLinePlayed).toBe(false);
  });

  it('acquires once, accepts once and reserves line two in the same transition', () => {
    const first = reduceOpening(awake(), 'take-card');
    expect(first.effects).toEqual(['card-taken']);
    expect(reduceOpening(first.state, 'take-card').effects).toEqual([]);
    const accepted = reduceOpening(first.state, 'use-reader');
    expect(accepted.effects).toEqual(['reader-accepted', 'voice-not-authorised']);
    expect(accepted.state).toMatchObject({ cardAcquired: true, doorUnlocked: true, secondLinePlayed: true });
    expect(reduceOpening(accepted.state, 'use-reader').effects).toEqual([]);
    expect(reduceOpening(accepted.state, 'try-locked-door').effects).toEqual([]);
  });

  it('does not force line one if an observant player finds the card first', () => {
    const result = run(['awaken', 'take-card', 'use-reader', 'try-locked-door']);
    expect(result.state.firstLinePlayed).toBe(false);
    expect(result.effects).toEqual(['card-taken', 'reader-accepted', 'voice-not-authorised']);
  });

  it('orders the intended complete route without narrating or inventing extra goals', () => {
    const result = run([
      'awaken', 'try-locked-door', 'use-reader', 'take-card', 'use-reader',
      'try-106', 'see-nurse', 'reach-station',
    ]);
    expect(result.effects).toEqual([
      'handle-104', 'voice-return-to-bed', 'reader-denied', 'card-taken',
      'reader-accepted', 'voice-not-authorised', 'handle-106', 'sighting', 'station-handoff',
    ]);
    expect(result.state.stationReached).toBe(true);
  });

  it('does not permit corridor events through the still-locked room exit', () => {
    const state = awake();
    for (const command of ['try-106', 'see-nurse', 'reach-station'] as const) {
      expect(reduceOpening(state, command)).toEqual({ state, effects: [] });
    }
  });

  it('allows repeated deliberate Room 106 attempts while keeping its one-shot flag stable', () => {
    const first = reduceOpening(unlocked(), 'try-106');
    const second = reduceOpening(first.state, 'try-106');
    expect(first.effects).toEqual(['handle-106']);
    expect(second.effects).toEqual(['handle-106']);
    expect(second.state).toBe(first.state);
    expect(second.state.doorUnlocked).toBe(true);
  });

  it('reserves a single non-chasing sighting and does not require seeing it for progression', () => {
    const state = unlocked();
    const sighting = reduceOpening(state, 'see-nurse');
    expect(sighting.effects).toEqual(['sighting']);
    expect(reduceOpening(sighting.state, 'see-nurse').effects).toEqual([]);
    const handoff = reduceOpening(state, 'reach-station');
    expect(handoff.state).toMatchObject({ stationReached: true, sightingSeen: false });
    expect(handoff.effects).toEqual(['station-handoff']);
    expect(reduceOpening(handoff.state, 'reach-station').effects).toEqual([]);
  });

  it('restores a serialized milestone without replaying one-shot lines or sightings', () => {
    const original = run([
      'awaken', 'try-locked-door', 'take-card', 'use-reader', 'try-106', 'see-nurse', 'reach-station',
    ]).state;
    const restored = validateOpeningState(JSON.parse(JSON.stringify(original)));
    expect(restored).toEqual(original);
    expect(restored).not.toBe(original);
    for (const command of ['awaken', 'take-card', 'use-reader', 'see-nurse', 'reach-station'] as const) {
      expect(reduceOpening(restored!, command).effects).toEqual([]);
    }
    expect(createOpeningState()).not.toEqual(restored);
  });

  it('never mutates the supplied frozen state', () => {
    const before = Object.freeze(awake());
    const result = reduceOpening(before, 'take-card');
    expect(before.cardAcquired).toBe(false);
    expect(result.state.cardAcquired).toBe(true);
  });
});

describe('opening save payload validation', () => {
  it('rejects foreign schema, extra/missing fields, wrong types and non-data objects', () => {
    const valid = createOpeningState();
    const { awakened: _omitted, ...missing } = valid;
    for (const value of [
      null, undefined, false, [], {}, missing,
      { ...valid, version: 2 }, { ...valid, extra: true },
      { ...valid, awakened: 'false' }, { ...valid, cardAcquired: 1 },
      Object.assign(new Date(), valid),
      { ...valid, [Symbol('hidden')]: true },
    ]) expect(validateOpeningState(value)).toBeNull();
    const accessor = { ...valid };
    Object.defineProperty(accessor, 'awakened', { enumerable: true, get() { throw new Error('not plain save data'); } });
    expect(validateOpeningState(accessor)).toBeNull();
  });

  it('rejects impossible possession, unlock, voice and corridor chronology', () => {
    const state = createOpeningState();
    for (const value of [
      { ...state, cardAcquired: true },
      { ...state, firstLinePlayed: true },
      { ...state, awakened: true, doorUnlocked: true, secondLinePlayed: true },
      { ...state, awakened: true, cardAcquired: true, doorUnlocked: true },
      { ...state, awakened: true, cardAcquired: true, secondLinePlayed: true },
      { ...state, awakened: true, room106Tried: true },
      { ...state, awakened: true, sightingSeen: true },
      { ...state, awakened: true, stationReached: true },
    ]) expect(validateOpeningState(value)).toBeNull();
  });

  it('accepts data from a null-prototype object and returns a plain bounded copy', () => {
    const data: unknown = Object.assign(Object.create(null) as object, unlocked());
    const validated = validateOpeningState(data);
    expect(validated).toEqual(unlocked());
    expect(Object.getPrototypeOf(validated)).toBe(Object.prototype);
  });

  it('rejects invalid runtime state rather than producing effects from corruption', () => {
    expect(() => reduceOpening({ ...awake(), doorUnlocked: true }, 'use-reader')).toThrow('Invalid Room 104 opening state');
  });
});
