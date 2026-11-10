import { describe, expect, it } from 'vitest';
import {
  CHAPTER_CHECKPOINTS, CHAPTER_CONTENT_REVISION, CHAPTER_SCHEMA_VERSION,
} from '../../src/gameplay/chapter/model';
import type { ChapterCheckpointId, ChapterCommand, ChapterState } from '../../src/gameplay/chapter/model';
import { applyChapterCommand, createInitialChapterState } from '../../src/gameplay/chapter/progression';
import {
  createChapterCoreCheckpoint, MAX_CHAPTER_CHECKPOINT_BYTES, migrateLegacyChapterSave,
  parseChapterCoreCheckpoint, serializeChapterCoreCheckpoint, validateChapterCoreCheckpoint,
} from '../../src/gameplay/chapter/checkpoints';

/** Explicit semantic fixtures: no claim of player/world/AI restoration. */
function boundary(id: ChapterCheckpointId): ChapterState {
  const level = CHAPTER_CHECKPOINTS.indexOf(id);
  return {
    schemaVersion: CHAPTER_SCHEMA_VERSION, contentRevision: CHAPTER_CONTENT_REVISION,
    clues: level === 0 ? [] : [
      'wristband', 'current-intake', 'unanswered-call', 'station-direction', 'night-ledger',
      ...(level >= 2 ? ['release-procedure', 'withdrawal-record', 'panel-schematic', 'bridge-annotation'] as const : []),
    ],
    completedScenes: level === 0 ? [] : [
      'c1.cine.awakening', 'c1.cine.nurse-reveal',
      ...(level >= 2 ? ['c1.cine.record'] as const : []),
      ...(level === 4 ? ['c1.cine.nurse-confrontation', 'c1.cine.ending'] as const : []),
    ],
    activeScene: null, nextSceneToken: level === 0 ? 1 : level === 1 ? 3 : level === 4 ? 6 : 4,
    stationReached: level >= 1, nurseSurvived: level >= 1,
    panelVisited: level >= 2, stairReached: level === 4,
    puzzle: {
      reserveEnabled: level >= 2, observationLink: level >= 2 ? 'isolated' : 'bridged',
      destination: level >= 2 ? 'egress' : 'ward', breaker: 'ready', busArmed: level >= 2,
      handleLocation: level >= 3 ? 'installed' : level === 2 ? 'held' : 'incident-pack',
      releaseConfirmed: level === 4, failedAttempts: 0,
    },
    viewedHintLevel: 0, checkpoints: CHAPTER_CHECKPOINTS.slice(0, level + 1), atSafeBoundary: id,
  };
}

function envelope(state: unknown, checkpointId = 'chapter1.before-confrontation') {
  return { schemaVersion: 1, contentRevision: 'c1.2-nurse', checkpointId, state };
}

describe('Chapter One core checkpoint codec', () => {
  it('accepts all five boundaries from the actual reducer, including deferred record playback and skip', () => {
    let state = createInitialChapterState();
    const command = (input: ChapterCommand) => {
      const result = applyChapterCommand(state, input);
      expect(result.accepted, result.reason).toBe(true);
      state = result.state;
    };
    const save = (id: ChapterCheckpointId) => {
      const serialized = serializeChapterCoreCheckpoint(state);
      expect(serialized.ok).toBe(true);
      if (serialized.ok) {
        const parsed = parseChapterCoreCheckpoint(serialized.value);
        expect(parsed.ok).toBe(true);
        if (parsed.ok) expect(parsed.value.checkpointId).toBe(id);
      }
    };
    const settle = () => {
      expect(state.activeScene).not.toBeNull();
      command({ type: 'settle-scene', token: state.activeScene!.token, outcome: 'skipped' });
    };
    save('chapter1.start');
    command({ type: 'request-scene', id: 'c1.cine.awakening', safe: true });
    settle();
    command({ type: 'inspect', clue: 'current-intake' });
    command({ type: 'inspect', clue: 'unanswered-call' });
    command({ type: 'reach-station' });
    command({ type: 'inspect', clue: 'night-ledger' });
    command({ type: 'request-scene', id: 'c1.cine.nurse-reveal', safe: true });
    settle();
    command({ type: 'survive-nurse', method: 'quiet-route', contactBroken: true, atReviewDesk: true });
    save('chapter1.after-nurse');
    command({ type: 'inspect', clue: 'release-procedure' });
    command({ type: 'collect-operating-handle' });
    command({ type: 'visit-panel' });
    command({ type: 'puzzle', command: { type: 'set-reserve', enabled: true } });
    command({ type: 'puzzle', command: { type: 'set-observation-link', value: 'isolated' } });
    command({ type: 'puzzle', command: { type: 'select-destination', value: 'egress' } });
    command({ type: 'puzzle', command: { type: 'engage' } });
    command({ type: 'commit-checkpoint', id: 'chapter1.after-records-power', safe: true });
    save('chapter1.after-records-power');
    command({ type: 'install-operating-handle' });
    command({ type: 'commit-checkpoint', id: 'chapter1.before-confrontation', safe: true });
    save('chapter1.before-confrontation');
    command({ type: 'confirm-release', safe: true });
    expect(createChapterCoreCheckpoint(state).ok).toBe(false);
    settle();
    command({ type: 'reach-stair-landing', safe: true });
    command({ type: 'request-scene', id: 'c1.cine.ending', safe: true });
    settle();
    save('chapter1.complete');
  });

  it.each(CHAPTER_CHECKPOINTS)('round-trips supported safe boundary %s', (id) => {
    const state = boundary(id);
    const result = serializeChapterCoreCheckpoint(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const restored = parseChapterCoreCheckpoint(result.value);
    expect(restored).toEqual({ ok: true, value: envelope(state, id) });
  });

  it('copies state, arrays and puzzle without retaining producer references', () => {
    const source = boundary('chapter1.before-confrontation');
    const created = createChapterCoreCheckpoint(source);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.state).not.toBe(source);
    expect(created.value.state.clues).not.toBe(source.clues);
    expect(created.value.state.completedScenes).not.toBe(source.completedScenes);
    expect(created.value.state.checkpoints).not.toBe(source.checkpoints);
    expect(created.value.state.puzzle).not.toBe(source.puzzle);
    const expected = JSON.stringify(created.value);
    (source.clues as string[]).push('nurse-note');
    (source.puzzle as { busArmed: boolean }).busArmed = false;
    expect(JSON.stringify(created.value)).toBe(expected);
    const validatedAgain = validateChapterCoreCheckpoint(created.value);
    expect(validatedAgain.ok).toBe(true);
    if (validatedAgain.ok) expect(validatedAgain.value.state.puzzle).not.toBe(created.value.state.puzzle);
  });

  it('permits discovered record facts before its safely deferred cinematic', () => {
    const state = boundary('chapter1.after-records-power');
    expect(createChapterCoreCheckpoint({ ...state, completedScenes: state.completedScenes.filter((id) => id !== 'c1.cine.record') }).ok).toBe(true);
  });

  it.each([
    '', '{', 'null', '[]', 'true', '"checkpoint"', '{"schemaVersion":2}',
    ' '.repeat(MAX_CHAPTER_CHECKPOINT_BYTES + 1),
  ])('returns a diagnostic for malformed or oversized input, without throwing', (serialized) => {
    expect(() => parseChapterCoreCheckpoint(serialized)).not.toThrow();
    expect(parseChapterCoreCheckpoint(serialized).ok).toBe(false);
  });

  it('rejects unsupported envelope/state revisions and additional schema fields', () => {
    const state = boundary('chapter1.before-confrontation');
    const valid = envelope(state);
    for (const invalid of [
      { ...valid, schemaVersion: 2 }, { ...valid, contentRevision: 'c1.2' },
      { ...valid, checkpointId: 'chapter2.start' }, { ...valid, unwanted: true },
      { ...valid, state: { ...state, schemaVersion: 0 } },
      { ...valid, state: { ...state, contentRevision: 'future' } },
      { ...valid, state: { ...state, unknownFlag: false } },
    ]) expect(validateChapterCoreCheckpoint(invalid).ok).toBe(false);
  });

  it('rejects active/mismatched/non-boundary state', () => {
    const state = boundary('chapter1.before-confrontation');
    for (const invalid of [
      { ...state, activeScene: { id: 'c1.cine.nurse-confrontation', token: 4 } },
      { ...state, atSafeBoundary: null },
      { ...state, atSafeBoundary: 'chapter1.after-records-power' },
    ]) expect(validateChapterCoreCheckpoint(envelope(invalid)).ok).toBe(false);
    expect(validateChapterCoreCheckpoint(envelope(state, 'chapter1.after-nurse')).ok).toBe(false);
  });

  it('rejects duplicate, missing, reordered and unknown stable identifiers', () => {
    const state = boundary('chapter1.before-confrontation');
    for (const invalid of [
      { ...state, clues: [...state.clues, 'wristband'] },
      { ...state, clues: ['nonexistent'] },
      { ...state, completedScenes: [...state.completedScenes, 'c1.cine.record'] },
      { ...state, completedScenes: ['unknown'] },
      { ...state, checkpoints: ['chapter1.start', 'chapter1.before-confrontation'] },
      { ...state, checkpoints: [...state.checkpoints].reverse() },
      { ...state, checkpoints: [...state.checkpoints, 'chapter1.before-confrontation'] },
    ]) expect(validateChapterCoreCheckpoint(envelope(invalid)).ok).toBe(false);
  });

  it('rejects impossible causal progress and contradictory electrical states', () => {
    const state = boundary('chapter1.before-confrontation');
    for (const invalid of [
      { ...state, nurseSurvived: false },
      { ...state, stationReached: false },
      { ...state, clues: state.clues.filter((id) => id !== 'unanswered-call') },
      { ...state, clues: state.clues.filter((id) => id !== 'station-direction') },
      { ...state, clues: state.clues.filter((id) => id !== 'withdrawal-record') },
      { ...state, completedScenes: state.completedScenes.filter((id) => id !== 'c1.cine.nurse-reveal') },
      { ...state, completedScenes: state.completedScenes.filter((id) => id !== 'c1.cine.awakening') },
      { ...state, puzzle: { ...state.puzzle, handleLocation: 'incident-pack' } },
      { ...state, puzzle: { ...state.puzzle, busArmed: false } },
      { ...state, puzzle: { ...state.puzzle, reserveEnabled: false } },
      { ...state, puzzle: { ...state.puzzle, observationLink: 'bridged' } },
      { ...state, puzzle: { ...state.puzzle, destination: 'lift' } },
      { ...state, puzzle: { ...state.puzzle, breaker: 'tripped' } },
      { ...state, puzzle: { ...state.puzzle, releaseConfirmed: true } },
      { ...state, stairReached: true },
      { ...state, completedScenes: [...state.completedScenes, 'c1.cine.ending'] },
      { ...state, viewedHintLevel: 2 },
      { ...state, completedScenes: [...state.completedScenes].reverse() },
    ]) expect(validateChapterCoreCheckpoint(envelope(invalid)).ok).toBe(false);
    const start = boundary('chapter1.start');
    expect(createChapterCoreCheckpoint({ ...start, puzzle: { ...start.puzzle, destination: 'egress' } }).ok).toBe(false);
    expect(createChapterCoreCheckpoint({ ...start, puzzle: { ...start.puzzle, failedAttempts: 1 } }).ok).toBe(false);
  });

  it('rejects invalid numeric fields, sparse arrays and accessor/prototype objects', () => {
    const state = boundary('chapter1.before-confrontation');
    for (const nextSceneToken of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, 2]) {
      expect(validateChapterCoreCheckpoint(envelope({ ...state, nextSceneToken })).ok).toBe(false);
    }
    for (const failedAttempts of [-1, 0.5, 3, NaN]) {
      expect(validateChapterCoreCheckpoint(envelope({ ...state, puzzle: { ...state.puzzle, failedAttempts } })).ok).toBe(false);
    }
    expect(validateChapterCoreCheckpoint(envelope({ ...state, clues: Array(2) })).ok).toBe(false);
    const prototypeObject = Object.create({ inherited: true }) as object;
    Object.assign(prototypeObject, envelope(state));
    expect(validateChapterCoreCheckpoint(prototypeObject).ok).toBe(false);
    let invoked = false;
    const accessor = { ...envelope(state) };
    Object.defineProperty(accessor, 'state', { enumerable: true, get() { invoked = true; return state; } });
    expect(validateChapterCoreCheckpoint(accessor).ok).toBe(false);
    expect(invoked).toBe(false);
    const symbolProperty = { ...envelope(state), [Symbol('extra')]: true };
    expect(validateChapterCoreCheckpoint(symbolProperty).ok).toBe(false);
    const hiddenState = { ...state };
    Object.defineProperty(hiddenState, 'stationReached', { enumerable: false });
    expect(validateChapterCoreCheckpoint(envelope(hiddenState)).ok).toBe(false);
  });
});

describe('legacy metadata-only save migration', () => {
  const legacy = { version: 1, checkpoint: 'nw:checkpoint:room-104-wake', label: 'Room 104 · Ward 4 West', playSeconds: 42.25, savedAt: 1_700_000_000_000, sessions: 2 };

  it('maps valid Room 104 metadata to fresh chapter-start core state only', () => {
    const migrated = migrateLegacyChapterSave(legacy);
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.value.checkpointId).toBe('chapter1.start');
    expect(migrated.value.state).toEqual(boundary('chapter1.start'));
    expect(migrated.value).not.toHaveProperty('playSeconds');
    expect(legacy.playSeconds).toBe(42.25);
  });

  it.each([
    null, {}, { ...legacy, version: 2 }, { ...legacy, checkpoint: 'chapter1.complete' },
    { ...legacy, playSeconds: NaN }, { ...legacy, playSeconds: -1 },
    { ...legacy, sessions: 1.5 }, { ...legacy, savedAt: Infinity },
    { ...legacy, label: '' }, { ...legacy, label: 'x'.repeat(257) },
  ])('rejects invalid or non-Room104 legacy metadata', (invalid) => {
    expect(migrateLegacyChapterSave(invalid).ok).toBe(false);
  });
});
