import type { ChapterPuzzleState, PuzzleCommand, PuzzleResult } from './model';

export function createChapterPuzzleState(): ChapterPuzzleState {
  return {
    reserveEnabled: false, observationLink: 'bridged', destination: 'ward',
    breaker: 'ready', busArmed: false, handleLocation: 'incident-pack',
    releaseConfirmed: false, failedAttempts: 0,
  };
}

export function chapterReserveLoad(state: ChapterPuzzleState): number {
  return (state.observationLink === 'bridged' ? 1 : 0) + (state.destination === 'lift' ? 2 : 1);
}

/** Pure operator controls: selectors never trip; every failure is recoverable. */
export function applyChapterPuzzleCommand(state: ChapterPuzzleState, command: PuzzleCommand): PuzzleResult {
  // Successful arming latches the supply, just as final mechanical release stays open.
  if (state.busArmed) return { state, feedback: 'already-armed' };
  switch (command.type) {
    case 'set-reserve':
      return { state: { ...state, reserveEnabled: command.enabled }, feedback: 'configured' };
    case 'set-observation-link':
      return { state: { ...state, observationLink: command.value }, feedback: 'configured' };
    case 'select-destination':
      return { state: { ...state, destination: command.value }, feedback: 'configured' };
    case 'reset-breaker':
      return { state: { ...state, breaker: 'ready' }, feedback: 'reset' };
    case 'engage': {
      const failedAttempts = Math.min(2, state.failedAttempts + 1) as 1 | 2;
      if (state.breaker === 'tripped') return { state: { ...state, failedAttempts }, feedback: 'breaker-tripped' };
      if (!state.reserveEnabled) return { state: { ...state, failedAttempts }, feedback: 'no-reserve' };
      if (chapterReserveLoad(state) > 1) {
        return { state: { ...state, breaker: 'tripped', failedAttempts }, feedback: 'overload' };
      }
      if (state.destination !== 'egress') return { state: { ...state, failedAttempts }, feedback: 'no-egress-supply' };
      return { state: { ...state, busArmed: true }, feedback: 'bus-armed' };
    }
  }
}
