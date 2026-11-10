import { describe, expect, it } from 'vitest';
import {
  applyChapterCommand, canCommitChapterCheckpoint, createInitialChapterState,
  getAvailableChapterScenes, getChapterObjective,
} from '../../src/gameplay/chapter/progression';
import type { ChapterCommand, ChapterResult, ChapterSceneId, ChapterState } from '../../src/gameplay/chapter/model';

function apply(state: ChapterState, command: ChapterCommand): ChapterState {
  const result = applyChapterCommand(state, command);
  expect(result.accepted, result.reason).toBe(true);
  return result.state;
}
function scene(state: ChapterState, id: ChapterSceneId, outcome: 'completed' | 'skipped' = 'completed'): ChapterState {
  state = apply(state, { type: 'request-scene', id, safe: true });
  return apply(state, { type: 'settle-scene', token: state.activeScene!.token, outcome });
}
function afterNurse(outcome: 'completed' | 'skipped' = 'completed', method: 'hiding' | 'quiet-route' = 'hiding'): ChapterState {
  let state = scene(createInitialChapterState(), 'c1.cine.awakening', outcome);
  state = apply(state, { type: 'inspect', clue: 'current-intake' });
  state = apply(state, { type: 'inspect', clue: 'unanswered-call' });
  state = apply(state, { type: 'reach-station' });
  state = apply(state, { type: 'inspect', clue: 'night-ledger' });
  state = scene(state, 'c1.cine.nurse-reveal', outcome);
  return apply(state, { type: 'survive-nurse', method, contactBroken: true, atReviewDesk: true });
}
function afterPower(recordScene = true): ChapterState {
  let state = afterNurse();
  state = apply(state, { type: 'inspect', clue: 'release-procedure' });
  state = apply(state, { type: 'collect-operating-handle' });
  if (recordScene) state = scene(state, 'c1.cine.record');
  state = apply(state, { type: 'visit-panel' });
  for (const command of [
    { type: 'set-reserve', enabled: true },
    { type: 'set-observation-link', value: 'isolated' },
    { type: 'select-destination', value: 'egress' },
    { type: 'engage' },
  ] as const) state = apply(state, { type: 'puzzle', command });
  return apply(state, { type: 'commit-checkpoint', id: 'chapter1.after-records-power', safe: true });
}
function beforeConfrontation(recordScene = true): ChapterState {
  let state = afterPower(recordScene);
  state = apply(state, { type: 'install-operating-handle' });
  return apply(state, { type: 'commit-checkpoint', id: 'chapter1.before-confrontation', safe: true });
}

describe('Chapter One causal progression', () => {
  it('completes all four acts and five scenes through semantic inputs without timer gates', () => {
    let state = createInitialChapterState();
    expect(getChapterObjective(state)).toBe('orient');
    expect(getAvailableChapterScenes(state)).toEqual(['c1.cine.awakening']);
    state = scene(state, 'c1.cine.awakening');
    expect(state.clues).toContain('wristband');
    state = apply(state, { type: 'inspect', clue: 'current-intake' });
    state = apply(state, { type: 'inspect', clue: 'unanswered-call' });
    expect(getChapterObjective(state)).toBe('station');
    state = apply(state, { type: 'reach-station' });
    state = apply(state, { type: 'inspect', clue: 'night-ledger' });
    state = scene(state, 'c1.cine.nurse-reveal');
    state = apply(state, { type: 'survive-nurse', method: 'quiet-route', contactBroken: true, atReviewDesk: true });
    expect(state.atSafeBoundary).toBe('chapter1.after-nurse');
    expect(getChapterObjective(state)).toBe('release-procedure');
    state = apply(state, { type: 'inspect', clue: 'release-procedure' });
    state = apply(state, { type: 'collect-operating-handle' });
    expect(getChapterObjective(state)).toBe('arm-power');
    expect(state.clues).toContain('withdrawal-record');
    state = scene(state, 'c1.cine.record');
    state = apply(state, { type: 'visit-panel' });
    for (const command of [
      { type: 'set-reserve', enabled: true }, { type: 'set-observation-link', value: 'isolated' },
      { type: 'select-destination', value: 'egress' }, { type: 'engage' },
    ] as const) state = apply(state, { type: 'puzzle', command });
    expect(getChapterObjective(state)).toBe('local-release');
    expect(state.puzzle.releaseConfirmed).toBe(false);
    state = apply(state, { type: 'commit-checkpoint', id: 'chapter1.after-records-power', safe: true });
    state = apply(state, { type: 'install-operating-handle' });
    state = apply(state, { type: 'commit-checkpoint', id: 'chapter1.before-confrontation', safe: true });
    const release = applyChapterCommand(state, { type: 'confirm-release', safe: true });
    expect(release.effects.filter((effect) => effect.type === 'release-confirmed')).toHaveLength(1);
    expect(release.effects.some((effect) => effect.type === 'activate-entity')).toBe(false);
    state = release.state;
    expect(state.activeScene?.id).toBe('c1.cine.nurse-confrontation');
    const handoff = applyChapterCommand(state, { type: 'settle-scene', token: state.activeScene!.token, outcome: 'completed' });
    expect(handoff.effects).toContainEqual({ type: 'activate-entity', entity: 'nurse' });
    state = handoff.state;
    expect(getChapterObjective(state)).toBe('stairwell');
    // No active-chase requirement: a player who loses the Nurse may still escape.
    state = apply(state, { type: 'reach-stair-landing', safe: true });
    state = scene(state, 'c1.cine.ending');
    expect(getChapterObjective(state)).toBe('complete');
    expect(state.completedScenes).toHaveLength(5);
    expect(state.checkpoints).toEqual(['chapter1.start', 'chapter1.after-nurse', 'chapter1.after-records-power', 'chapter1.before-confrontation', 'chapter1.complete']);
    expect(state.atSafeBoundary).toBe('chapter1.complete');
    expect(canCommitChapterCheckpoint(state, 'chapter1.complete')).toBe(true);
  });

  it('permits station fallback evidence after leaving the opening room early', () => {
    let state = scene(createInitialChapterState(), 'c1.cine.awakening', 'skipped');
    state = apply(state, { type: 'reach-station' });
    expect(getChapterObjective(state)).toBe('orient');
    // The command carries a fact, not an exact prop ID: bedside and clipboard copies agree.
    state = apply(state, { type: 'inspect', clue: 'current-intake' });
    state = apply(state, { type: 'inspect', clue: 'unanswered-call' });
    state = apply(state, { type: 'inspect', clue: 'night-ledger' });
    expect(getChapterObjective(state)).toBe('survive-nurse');
    expect(getAvailableChapterScenes(state)).toContain('c1.cine.nurse-reveal');
  });

  it('has equivalent completed and skipped scene commits, with both introductory survival choices', () => {
    expect(afterNurse('completed', 'hiding')).toEqual(afterNurse('skipped', 'quiet-route'));
    const confrontationStart = apply(beforeConfrontation(), { type: 'confirm-release', safe: true });
    const token = confrontationStart.activeScene!.token;
    expect(applyChapterCommand(confrontationStart, { type: 'settle-scene', token, outcome: 'completed' }))
      .toEqual(applyChapterCommand(confrontationStart, { type: 'settle-scene', token, outcome: 'skipped' }));
    for (const id of ['c1.cine.awakening', 'c1.cine.record', 'c1.cine.ending'] as const) {
      let initial = id === 'c1.cine.awakening' ? createInitialChapterState() : id === 'c1.cine.record' ? afterPower(false) : beforeConfrontation();
      if (id === 'c1.cine.ending') {
        initial = apply(initial, { type: 'confirm-release', safe: true });
        initial = apply(initial, { type: 'settle-scene', token: initial.activeScene!.token, outcome: 'skipped' });
        initial = apply(initial, { type: 'reach-stair-landing', safe: true });
      }
      expect(scene(initial, id, 'completed')).toEqual(scene(initial, id, 'skipped'));
    }
  });

  it('defers record camera playback without hiding its item, facts or physical release requirements', () => {
    let state = beforeConfrontation(false);
    expect(state.completedScenes).not.toContain('c1.cine.record');
    expect(state.clues).toContain('withdrawal-record');
    expect(getAvailableChapterScenes(state)).toContain('c1.cine.record');
    expect(applyChapterCommand(state, { type: 'request-scene', id: 'c1.cine.record', safe: false }).accepted).toBe(false);
    // Inspecting the route after checkpointing must not disable the local release.
    state = apply(state, { type: 'inspect', clue: 'patient-chart' });
    expect(state.atSafeBoundary).toBeNull();
    const release = applyChapterCommand(state, { type: 'confirm-release', safe: true });
    expect(release.accepted).toBe(true);
    expect(release.state.puzzle.releaseConfirmed).toBe(true);
  });

  it('rejects out-of-order story inputs and unsafe boundaries with no mutation or effects', () => {
    const initial = createInitialChapterState();
    const commands: ChapterCommand[] = [
      { type: 'request-scene', id: 'c1.cine.nurse-confrontation', safe: true },
      { type: 'request-scene', id: 'c1.cine.ending', safe: true },
      { type: 'survive-nurse', method: 'hiding', contactBroken: true, atReviewDesk: true },
      { type: 'collect-operating-handle' }, { type: 'install-operating-handle' },
      { type: 'confirm-release', safe: true }, { type: 'reach-stair-landing', safe: true },
      { type: 'commit-checkpoint', id: 'chapter1.before-confrontation', safe: true },
    ];
    for (const command of commands) {
      const result = applyChapterCommand(initial, command);
      expect(result.accepted).toBe(false);
      expect(result.reason).toBeTruthy();
      expect(result.state).toBe(initial);
      expect(result.effects).toEqual([]);
    }
    const awakened = scene(initial, 'c1.cine.awakening');
    for (const command of commands) expect(applyChapterCommand(awakened, command).accepted).toBe(false);
    expect(applyChapterCommand(awakened, { type: 'inspect', clue: 'withdrawal-record' }).accepted).toBe(false);
    expect(applyChapterCommand(afterNurse(), { type: 'commit-checkpoint', id: 'chapter1.after-nurse', safe: false }).accepted).toBe(false);
  });

  it('requires real contact break plus a safe review boundary, not a compulsory hide or elapsed timer', () => {
    const state = afterNurse();
    const notSurvived = { ...state, nurseSurvived: false, checkpoints: ['chapter1.start'] as const, atSafeBoundary: null };
    for (const [contactBroken, atReviewDesk] of [[false, false], [false, true], [true, false]]) {
      expect(applyChapterCommand(notSurvived, { type: 'survive-nurse', method: 'quiet-route', contactBroken: contactBroken!, atReviewDesk: atReviewDesk! }).accepted).toBe(false);
    }
    expect(applyChapterCommand(notSurvived, { type: 'survive-nurse', method: 'quiet-route', contactBroken: true, atReviewDesk: true }).accepted).toBe(true);
  });

  it('interrupts without completion, arbitrates ownership, rejects stale callbacks and retries safely', () => {
    let state = apply(createInitialChapterState(), { type: 'request-scene', id: 'c1.cine.awakening', safe: true });
    const oldToken = state.activeScene!.token;
    expect(applyChapterCommand(state, { type: 'request-scene', id: 'c1.cine.nurse-reveal', safe: true }).accepted).toBe(false);
    expect(applyChapterCommand(state, { type: 'inspect', clue: 'current-intake' }).accepted).toBe(false);
    state = apply(state, { type: 'settle-scene', token: oldToken, outcome: 'interrupted' });
    expect(state.completedScenes).toEqual([]);
    expect(state.clues).not.toContain('wristband');
    state = apply(state, { type: 'request-scene', id: 'c1.cine.awakening', safe: true });
    expect(state.activeScene!.token).not.toBe(oldToken);
    expect(applyChapterCommand(state, { type: 'settle-scene', token: oldToken, outcome: 'completed' }).accepted).toBe(false);
    state = apply(state, { type: 'settle-scene', token: state.activeScene!.token, outcome: 'skipped' });
    expect(state.clues).toEqual(['wristband']);
  });

  it('dispatches irreversible release and scene activation at most once across interruption/retry', () => {
    let state = beforeConfrontation();
    const emitted: ChapterResult['effects'][number][] = [];
    let result = applyChapterCommand(state, { type: 'confirm-release', safe: true });
    emitted.push(...result.effects);
    state = result.state;
    state = apply(state, { type: 'settle-scene', token: state.activeScene!.token, outcome: 'interrupted' });
    result = applyChapterCommand(state, { type: 'confirm-release', safe: true });
    expect(result.effects).toEqual([]);
    state = apply(state, { type: 'request-scene', id: 'c1.cine.nurse-confrontation', safe: true });
    result = applyChapterCommand(state, { type: 'settle-scene', token: state.activeScene!.token, outcome: 'skipped' });
    emitted.push(...result.effects);
    state = result.state;
    expect(applyChapterCommand(state, { type: 'settle-scene', token: state.nextSceneToken - 1, outcome: 'completed' }).effects).toEqual([]);
    expect(emitted.filter((effect) => effect.type === 'release-confirmed')).toHaveLength(1);
    expect(emitted.filter((effect) => effect.type === 'activate-entity' && effect.entity === 'nurse')).toHaveLength(1);
  });

  it('is immutable and has bounded state under repeated inspections and notifications', () => {
    let state = afterNurse();
    const previous = structuredClone(state);
    for (let n = 0; n < 1000; n++) state = apply(state, { type: 'inspect', clue: 'nurse-note' });
    expect(state.clues.filter((clue) => clue === 'nurse-note')).toHaveLength(1);
    expect(previous.clues).not.toContain('nurse-note');
    const duplicate = applyChapterCommand(state, { type: 'survive-nurse', method: 'hiding', contactBroken: true, atReviewDesk: true });
    expect(duplicate.effects).toEqual([]);
    expect(duplicate.state).toBe(state);
  });
});
