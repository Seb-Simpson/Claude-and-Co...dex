import { describe, expect, it } from 'vitest';
import type { ChapterCommand, ChapterState } from '../../src/gameplay/chapter/model';
import { projectChapterJournal } from '../../src/gameplay/chapter/journal';
import { applyChapterCommand, createInitialChapterState, getChapterHintLevel } from '../../src/gameplay/chapter/progression';

function apply(state: ChapterState, command: ChapterCommand): ChapterState {
  const result = applyChapterCommand(state, command);
  expect(result.accepted, result.reason).toBe(true);
  return result.state;
}
function panelState(): ChapterState {
  let state = createInitialChapterState();
  for (const id of ['c1.cine.awakening', 'c1.cine.nurse-reveal'] as const) {
    if (id === 'c1.cine.nurse-reveal') {
      for (const clue of ['current-intake', 'unanswered-call', 'night-ledger'] as const) state = apply(state, { type: 'inspect', clue });
      state = apply(state, { type: 'reach-station' });
    }
    state = apply(state, { type: 'request-scene', id, safe: true });
    state = apply(state, { type: 'settle-scene', token: state.activeScene!.token, outcome: 'skipped' });
  }
  state = apply(state, { type: 'survive-nurse', method: 'hiding', contactBroken: true, atReviewDesk: true });
  return apply(state, { type: 'visit-panel' });
}

describe('Chapter One journal projection', () => {
  it('shows only earned evidence, preserves readable exact wristband and does not expose authorial truth', () => {
    let state = createInitialChapterState();
    expect(projectChapterJournal(state).entries).toEqual([]);
    state = apply(state, { type: 'request-scene', id: 'c1.cine.awakening', safe: true });
    state = apply(state, { type: 'settle-scene', token: state.activeScene!.token, outcome: 'skipped' });
    const journal = projectChapterJournal(state);
    expect(journal.entries).toHaveLength(1);
    expect(journal.entries[0]!.text).toContain('PATIENT 104\nADMITTED: YESTERDAY\nSTATUS: DO NOT DISCHARGE');
    expect(JSON.stringify(journal)).not.toMatch(/2012|embodied|suppressed|recalled/);
  });

  it('retains the record and full transcription when camera playback must be deferred', () => {
    let state = panelState();
    state = apply(state, { type: 'inspect', clue: 'release-procedure' });
    state = apply(state, { type: 'collect-operating-handle' });
    expect(state.completedScenes).not.toContain('c1.cine.record');
    const entry = projectChapterJournal(state).entries.find((value) => value.id === 'withdrawal-record')!;
    expect(entry.text).toContain('HVI-000104');
    expect(entry.text).toContain('I am withdrawing consent. I want to leave.');
    expect(entry.text).toContain('DISCHARGE UNCONFIRMED');
    expect(entry.text).not.toContain('never escaped');
  });

  it('offers hints through exploration or reversible mistakes without compulsory waiting', () => {
    let state = panelState();
    expect(getChapterHintLevel(state)).toBe(0);
    state = apply(state, { type: 'inspect', clue: 'release-procedure' });
    expect(getChapterHintLevel(state)).toBe(0);
    expect(applyChapterCommand(state, { type: 'read-hint' }).accepted).toBe(false);
    state = apply(state, { type: 'puzzle', command: { type: 'engage' } });
    expect(getChapterHintLevel(state)).toBe(1);
    expect(projectChapterJournal(state).hintAvailable).toBe(true);
    expect(projectChapterJournal(state).hints).toEqual([]);
    state = apply(state, { type: 'read-hint' });
    expect(projectChapterJournal(state).hintAvailable).toBe(false);
    expect(projectChapterJournal(state).hints).toHaveLength(1);
    state = apply(state, { type: 'puzzle', command: { type: 'engage' } });
    expect(getChapterHintLevel(state)).toBe(2);
    state = apply(state, { type: 'read-hint' });
    expect(projectChapterJournal(state).hints[1]!.text).toContain('Isolate observation, select EGRESS');
    expect(state.viewedHintLevel).toBe(2);
  });

  it('also offers the first hint from reading both relevant diagrams', () => {
    let state = panelState();
    for (const clue of ['release-procedure', 'panel-schematic', 'bridge-annotation'] as const) state = apply(state, { type: 'inspect', clue });
    expect(state.puzzle.failedAttempts).toBe(0);
    expect(getChapterHintLevel(state)).toBe(1);
  });

  it('returns independent projections and keeps objective notifications causal and duplicate-safe', () => {
    const state = panelState();
    const original = structuredClone(state);
    const first = projectChapterJournal(state);
    const second = projectChapterJournal(state);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.entries).not.toBe(second.entries);
    expect(first.entries[0]).not.toBe(second.entries[0]);
    expect(state).toEqual(original);
    expect(first.objective.id).toBe('release-procedure');
    expect(first.completedObjectives).toEqual(['orient', 'station', 'survive-nurse']);
    const duplicate = applyChapterCommand(state, { type: 'reach-station' });
    expect(duplicate.effects).toEqual([]);
  });
});
