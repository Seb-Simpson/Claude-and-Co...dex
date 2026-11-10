import { describe, expect, it } from 'vitest';
import { createOpeningCheckpoint, validateOpeningCheckpoint } from '../../src/gameplay/opening/checkpoint';
import { createOpeningState, reduceOpening } from '../../src/gameplay/opening/state';
import type { OpeningState } from '../../src/gameplay/opening/state';

function exitState(): OpeningState {
  let state = createOpeningState();
  for (const command of ['awaken', 'try-locked-door', 'take-card', 'use-reader'] as const) state = reduceOpening(state, command).state;
  return state;
}

describe('opening milestone checkpoints', () => {
  it('captures exit state as a bounded independent copy', () => {
    const state = exitState();
    const checkpoint = createOpeningCheckpoint(state, 'room104-exit');
    expect(checkpoint).toEqual({ version: 1, milestone: 'room104-exit', state });
    expect(checkpoint.state).not.toBe(state);
    expect(validateOpeningCheckpoint(JSON.parse(JSON.stringify(checkpoint)))).toEqual(checkpoint);
  });

  it('captures the station handoff while preserving optional sighting and 106 choices', () => {
    const state = reduceOpening(exitState(), 'reach-station').state;
    const checkpoint = createOpeningCheckpoint(state, 'station-approach');
    expect(checkpoint.state).toMatchObject({ stationReached: true, room106Tried: false, sightingSeen: false });
    expect(validateOpeningCheckpoint(checkpoint)).toEqual(checkpoint);
  });

  it('requires awakened, acquired-card and unlocked chronology rather than saving each click', () => {
    const initial = createOpeningState();
    const awake = reduceOpening(initial, 'awaken').state;
    const withCard = reduceOpening(awake, 'take-card').state;
    for (const state of [initial, awake, withCard]) {
      expect(() => createOpeningCheckpoint(state, 'room104-exit')).toThrow('valid opening milestone');
      expect(validateOpeningCheckpoint({ version: 1, milestone: 'room104-exit', state })).toBeNull();
    }
  });

  it('rejects milestone and station-state mismatches', () => {
    const exit = exitState();
    const station = reduceOpening(exit, 'reach-station').state;
    expect(() => createOpeningCheckpoint(exit, 'station-approach')).toThrow();
    expect(() => createOpeningCheckpoint(station, 'room104-exit')).toThrow();
    expect(validateOpeningCheckpoint({ version: 1, milestone: 'station-approach', state: exit })).toBeNull();
    expect(validateOpeningCheckpoint({ version: 1, milestone: 'room104-exit', state: station })).toBeNull();
  });

  it('rejects unknown schemas, missing and extra fields, arrays and wrong milestone types', () => {
    const valid = createOpeningCheckpoint(exitState(), 'room104-exit');
    for (const data of [
      null, false, [], {},
      { version: 1, milestone: 'room104-exit' },
      { ...valid, version: 2 }, { ...valid, milestone: 'room104-door' },
      { ...valid, milestone: 1 }, { ...valid, extra: true },
      { ...valid, [Symbol('hidden')]: true },
      { ...valid, state: { ...valid.state, doorUnlocked: false } },
    ]) expect(validateOpeningCheckpoint(data)).toBeNull();
  });

  it('rejects inherited fields and accessor payloads without invoking getters', () => {
    const valid = createOpeningCheckpoint(exitState(), 'room104-exit');
    const inherited: unknown = Object.create(valid);
    expect(validateOpeningCheckpoint(inherited)).toBeNull();
    const getter = { ...valid };
    Object.defineProperty(getter, 'state', { enumerable: true, get() { throw new Error('must not execute'); } });
    expect(validateOpeningCheckpoint(getter)).toBeNull();
    expect(validateOpeningCheckpoint(Object.assign(new Date(), valid))).toBeNull();
  });

  it('accepts a plain null-prototype serialized record and returns ordinary data', () => {
    const valid = createOpeningCheckpoint(exitState(), 'room104-exit');
    const source: unknown = Object.assign(Object.create(null) as object, valid);
    const restored = validateOpeningCheckpoint(source);
    expect(restored).toEqual(valid);
    expect(restored).not.toBe(valid);
    expect(restored?.state).not.toBe(valid.state);
    expect(Object.getPrototypeOf(restored)).toBe(Object.prototype);
  });

  it('restored one-shot reservations never schedule repeat voice lines', () => {
    const checkpoint = createOpeningCheckpoint(exitState(), 'room104-exit');
    const restored = validateOpeningCheckpoint(JSON.parse(JSON.stringify(checkpoint)))!;
    for (const command of ['awaken', 'take-card', 'use-reader', 'try-locked-door'] as const) {
      expect(reduceOpening(restored.state, command).effects).toEqual([]);
    }
  });
});
