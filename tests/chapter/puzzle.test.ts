import { describe, expect, it } from 'vitest';
import { applyChapterPuzzleCommand, chapterReserveLoad, createChapterPuzzleState } from '../../src/gameplay/chapter/puzzle';
import type { ChapterPuzzleState, PuzzleCommand } from '../../src/gameplay/chapter/model';

describe('Chapter One emergency reserve controls', () => {
  it('evaluates every reserve / bridge / branch / breaker combination without opening anything', () => {
    let evaluated = 0;
    for (const reserveEnabled of [false, true]) for (const observationLink of ['bridged', 'isolated'] as const) {
      for (const destination of ['ward', 'lift', 'egress'] as const) for (const breaker of ['ready', 'tripped'] as const) {
        const state: ChapterPuzzleState = { ...createChapterPuzzleState(), reserveEnabled, observationLink, destination, breaker };
        const copy = structuredClone(state);
        const result = applyChapterPuzzleCommand(state, { type: 'engage' });
        expect(state).toEqual(copy);
        expect(result.state.busArmed).toBe(reserveEnabled && observationLink === 'isolated' && destination === 'egress' && breaker === 'ready');
        expect(result.state.releaseConfirmed).toBe(false);
        expect(result.state.handleLocation).toBe('incident-pack');
        if (breaker === 'tripped') expect(result.feedback).toBe('breaker-tripped');
        else if (!reserveEnabled) expect(result.feedback).toBe('no-reserve');
        else if (chapterReserveLoad(state) > 1) expect(result.feedback).toBe('overload');
        else if (destination === 'ward') expect(result.feedback).toBe('no-egress-supply');
        else expect(result.feedback).toBe('bus-armed');
        evaluated++;
      }
    }
    expect(evaluated).toBe(24);
  });

  it('allows every selector order, no waiting or consumable, and latches a successful supply', () => {
    const controls: PuzzleCommand[] = [
      { type: 'set-reserve', enabled: true }, { type: 'set-observation-link', value: 'isolated' },
      { type: 'select-destination', value: 'egress' },
    ];
    for (const order of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
      let state = createChapterPuzzleState();
      for (const index of order) {
        state = applyChapterPuzzleCommand(state, controls[index]!).state;
        expect(state.breaker).toBe('ready');
      }
      state = applyChapterPuzzleCommand(state, { type: 'engage' }).state;
      expect(state.busArmed).toBe(true);
      expect(applyChapterPuzzleCommand(state, { type: 'set-reserve', enabled: false })).toEqual({ state, feedback: 'already-armed' });
    }
  });

  it('recovers from every wrong powered branch after a reset and saturates failure accounting', () => {
    for (const observationLink of ['bridged', 'isolated'] as const) for (const destination of ['ward', 'lift', 'egress'] as const) {
      let state: ChapterPuzzleState = { ...createChapterPuzzleState(), reserveEnabled: true, observationLink, destination };
      state = applyChapterPuzzleCommand(state, { type: 'engage' }).state;
      if (state.busArmed) continue;
      for (let n = 0; n < 100; n++) state = applyChapterPuzzleCommand(state, { type: 'engage' }).state;
      expect(state.failedAttempts).toBe(2);
      state = applyChapterPuzzleCommand(state, { type: 'set-observation-link', value: 'isolated' }).state;
      state = applyChapterPuzzleCommand(state, { type: 'select-destination', value: 'egress' }).state;
      state = applyChapterPuzzleCommand(state, { type: 'reset-breaker' }).state;
      state = applyChapterPuzzleCommand(state, { type: 'engage' }).state;
      expect(state.busArmed).toBe(true);
      expect(state.releaseConfirmed).toBe(false);
    }
  });
});
