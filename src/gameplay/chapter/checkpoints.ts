import {
  CHAPTER_CHECKPOINTS, CHAPTER_CLUES, CHAPTER_CONTENT_REVISION, CHAPTER_SCENES,
  CHAPTER_SCHEMA_VERSION,
} from './model';
import type { ChapterCheckpointId, ChapterPuzzleState, ChapterState } from './model';
import { canCommitChapterCheckpoint, createInitialChapterState } from './progression';

/** Core progression only. This deliberately contains no world, player, actor or audio snapshot. */
export interface ChapterCoreCheckpoint {
  readonly schemaVersion: typeof CHAPTER_SCHEMA_VERSION;
  readonly contentRevision: typeof CHAPTER_CONTENT_REVISION;
  readonly checkpointId: ChapterCheckpointId;
  readonly state: ChapterState;
}

export type ChapterCheckpointResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

/** Defensive upper bound for this small, bounded schema, not a storage quota. */
export const MAX_CHAPTER_CHECKPOINT_BYTES = 32_768;
const STATE_KEYS = [
  'schemaVersion', 'contentRevision', 'clues', 'completedScenes', 'activeScene',
  'nextSceneToken', 'stationReached', 'nurseSurvived', 'panelVisited', 'stairReached',
  'puzzle', 'viewedHintLevel', 'checkpoints', 'atSafeBoundary',
] as const;
const PUZZLE_KEYS = [
  'reserveEnabled', 'observationLink', 'destination', 'breaker', 'busArmed',
  'handleLocation', 'releaseConfirmed', 'failedAttempts',
] as const;

function failure(error: string): ChapterCheckpointResult<never> { return { ok: false, error }; }
function ownDataRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const names = Reflect.ownKeys(value);
  return names.length === keys.length && names.every((key) => {
    if (typeof key !== 'string' || !keys.includes(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    return descriptor.enumerable && Object.hasOwn(descriptor, 'value');
  });
}
function finiteInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}
function enumValue<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T);
}
function uniqueEnumArray<T extends string>(value: unknown, values: readonly T[]): value is T[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > values.length) return false;
  const names = Reflect.ownKeys(value);
  if (names.length !== value.length + 1) return false;
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !enumValue(descriptor.value, values)) return false;
  }
  return new Set(value).size === value.length;
}

function validPuzzle(value: unknown): value is ChapterPuzzleState {
  if (!ownDataRecord(value, PUZZLE_KEYS)) return false;
  if (typeof value.reserveEnabled !== 'boolean' || typeof value.busArmed !== 'boolean' || typeof value.releaseConfirmed !== 'boolean') return false;
  if (!enumValue(value.observationLink, ['bridged', 'isolated']) || !enumValue(value.destination, ['ward', 'lift', 'egress']) ||
      !enumValue(value.breaker, ['ready', 'tripped']) || !enumValue(value.handleLocation, ['incident-pack', 'held', 'installed']) ||
      !finiteInteger(value.failedAttempts, 2)) return false;
  if (value.busArmed && (!value.reserveEnabled || value.observationLink !== 'isolated' || value.destination !== 'egress' || value.breaker !== 'ready')) return false;
  if (value.releaseConfirmed && (!value.busArmed || value.handleLocation !== 'installed')) return false;
  return true;
}

function stateError(value: unknown): string | null {
  if (!ownDataRecord(value, STATE_KEYS)) return 'Checkpoint state has unsupported fields or object shape.';
  if (value.schemaVersion !== CHAPTER_SCHEMA_VERSION || value.contentRevision !== CHAPTER_CONTENT_REVISION) return 'Unsupported chapter state version.';
  if (!uniqueEnumArray(value.clues, CHAPTER_CLUES) || !uniqueEnumArray(value.completedScenes, CHAPTER_SCENES) ||
      !uniqueEnumArray(value.checkpoints, CHAPTER_CHECKPOINTS)) return 'Checkpoint contains invalid or duplicate identifiers.';
  if (value.activeScene !== null) return 'A core checkpoint cannot resume an active cinematic.';
  if (!finiteInteger(value.nextSceneToken, Number.MAX_SAFE_INTEGER - 1) || value.nextSceneToken < 1 || value.nextSceneToken <= value.completedScenes.length) return 'Invalid cinematic sequence counter.';
  if (!['stationReached', 'nurseSurvived', 'panelVisited', 'stairReached'].every((key) => typeof value[key] === 'boolean')) return 'Invalid chapter flags.';
  if (!validPuzzle(value.puzzle) || !finiteInteger(value.viewedHintLevel, 2)) return 'Invalid electrical or hint state.';
  if (!enumValue(value.atSafeBoundary, CHAPTER_CHECKPOINTS)) return 'Checkpoint is not at a supported safe boundary.';
  const checkpoints = value.checkpoints;
  if (checkpoints.length === 0 || checkpoints.some((id, index) => id !== CHAPTER_CHECKPOINTS[index]) ||
      checkpoints.at(-1) !== value.atSafeBoundary) return 'Checkpoint boundaries are not an authored ordered prefix.';

  const clues = value.clues;
  const scenes = value.completedScenes;
  const puzzle = value.puzzle;
  const awakened = scenes.includes('c1.cine.awakening');
  const nurseShown = scenes.includes('c1.cine.nurse-reveal');
  const recordShown = scenes.includes('c1.cine.record');
  const confrontationShown = scenes.includes('c1.cine.nurse-confrontation');
  const endingShown = scenes.includes('c1.cine.ending');
  if (awakened !== clues.includes('wristband')) return 'Awakening and wristband knowledge disagree.';
  if (!awakened && (value.stationReached || value.nurseSurvived || value.panelVisited || value.stairReached || clues.length > 0)) return 'Progress precedes awakening.';
  if (clues.includes('current-intake') && !clues.includes('station-direction')) return 'Intake notice lacks its station direction.';
  if (awakened && scenes[0] !== 'c1.cine.awakening') return 'Cinematic history precedes awakening.';
  if (nurseShown && (!awakened || !value.stationReached || !clues.includes('night-ledger') ||
      !clues.includes('current-intake') || !clues.includes('unanswered-call'))) return 'Nurse reveal lacks its station encounter.';
  if (value.nurseSurvived && !nurseShown) return 'Nurse survival precedes her introduction.';
  if (puzzle.handleLocation !== 'incident-pack' && (!value.nurseSurvived || !clues.includes('withdrawal-record') || !clues.includes('release-procedure'))) return 'Operating handle lacks its records discovery.';
  if (clues.includes('withdrawal-record') && puzzle.handleLocation === 'incident-pack') return 'Withdrawal record precedes operating-pack discovery.';
  if (recordShown && !clues.includes('withdrawal-record')) return 'Record cinematic lacks discovered evidence.';
  if ((recordShown || confrontationShown || endingShown) && (!nurseShown || scenes.some((id, index) =>
    id !== 'c1.cine.awakening' && id !== 'c1.cine.nurse-reveal' && index < scenes.indexOf('c1.cine.nurse-reveal')))) return 'Later cinematic precedes the Nurse encounter.';
  if (endingShown && scenes.at(-1) !== 'c1.cine.ending') return 'Cinematic history continues beyond the chapter ending.';
  if (value.panelVisited && !value.nurseSurvived) return 'Panel visit precedes the introductory encounter.';
  if (!value.panelVisited && (puzzle.reserveEnabled || puzzle.observationLink !== 'bridged' || puzzle.destination !== 'ward' ||
      puzzle.breaker !== 'ready' || puzzle.failedAttempts !== 0)) return 'Electrical controls changed before reaching the panel.';
  if (puzzle.busArmed && (!value.panelVisited || !value.nurseSurvived)) return 'Armed bus lacks its panel encounter.';
  if (puzzle.handleLocation === 'installed' && (!puzzle.busArmed || !checkpoints.includes('chapter1.after-records-power'))) return 'Installed handle lacks the prepared power checkpoint.';
  if (puzzle.releaseConfirmed && !checkpoints.includes('chapter1.before-confrontation')) return 'Release precedes the safe confrontation checkpoint.';
  if (confrontationShown && !puzzle.releaseConfirmed) return 'Nurse confrontation precedes release.';
  if (value.stairReached && (!puzzle.releaseConfirmed || !confrontationShown)) return 'Stair arrival precedes the Nurse handoff.';
  if (endingShown && !value.stairReached) return 'Ending precedes the safe stair landing.';
  if (value.viewedHintLevel > 0 && (!value.panelVisited || !clues.includes('release-procedure'))) return 'Hint precedes its exploration opportunity.';
  if (value.viewedHintLevel > 0 && puzzle.failedAttempts === 0 && (!clues.includes('panel-schematic') || !clues.includes('bridge-annotation'))) return 'Hint lacks explored clues or an evaluated failed attempt.';
  if (value.viewedHintLevel === 2 && puzzle.failedAttempts < 2) return 'Second hint precedes its failed attempts.';
  if (checkpoints.includes('chapter1.after-nurse') && !value.nurseSurvived) return 'Nurse checkpoint lacks survival.';
  if (checkpoints.includes('chapter1.after-records-power') && (!puzzle.busArmed || puzzle.handleLocation === 'incident-pack')) return 'Power checkpoint lacks records and reserve.';
  if (checkpoints.includes('chapter1.before-confrontation') && puzzle.handleLocation !== 'installed') return 'Confrontation checkpoint lacks the operating handle.';
  if (checkpoints.includes('chapter1.complete') !== endingShown) return 'Completion checkpoint and ending disagree.';
  if (!canCommitChapterCheckpoint(value as unknown as ChapterState, value.atSafeBoundary)) return 'State does not satisfy its safe checkpoint boundary.';
  return null;
}

function cloneState(state: ChapterState): ChapterState {
  return { ...state, clues: [...state.clues], completedScenes: [...state.completedScenes],
    checkpoints: [...state.checkpoints], activeScene: null, puzzle: { ...state.puzzle } };
}

/** Validate unknown input before touching a live session. No mutation or resource allocation. */
export function validateChapterCoreCheckpoint(value: unknown): ChapterCheckpointResult<ChapterCoreCheckpoint> {
  try {
    if (!ownDataRecord(value, ['schemaVersion', 'contentRevision', 'checkpointId', 'state'])) return failure('Invalid chapter checkpoint envelope.');
    if (value.schemaVersion !== CHAPTER_SCHEMA_VERSION || value.contentRevision !== CHAPTER_CONTENT_REVISION) return failure('Unsupported chapter checkpoint version.');
    if (!enumValue(value.checkpointId, CHAPTER_CHECKPOINTS)) return failure('Unknown chapter checkpoint.');
    const error = stateError(value.state);
    if (error) return failure(error);
    const state = value.state as ChapterState;
    if (state.atSafeBoundary !== value.checkpointId) return failure('Envelope and state checkpoint disagree.');
    return { ok: true, value: { schemaVersion: CHAPTER_SCHEMA_VERSION, contentRevision: CHAPTER_CONTENT_REVISION,
      checkpointId: value.checkpointId, state: cloneState(state) } };
  } catch {
    return failure('Unreadable chapter checkpoint.');
  }
}

/** Snapshot only a freshly committed semantic safe boundary. This is not a full game save. */
export function createChapterCoreCheckpoint(state: ChapterState): ChapterCheckpointResult<ChapterCoreCheckpoint> {
  return validateChapterCoreCheckpoint({ schemaVersion: CHAPTER_SCHEMA_VERSION, contentRevision: CHAPTER_CONTENT_REVISION,
    checkpointId: state.atSafeBoundary, state });
}

/** Canonical serialization; unsafe/corrupt states return an error instead of a partial save. */
export function serializeChapterCoreCheckpoint(state: ChapterState): ChapterCheckpointResult<string> {
  const result = createChapterCoreCheckpoint(state);
  return result.ok ? { ok: true, value: JSON.stringify(result.value) } : result;
}

export function parseChapterCoreCheckpoint(serialized: string): ChapterCheckpointResult<ChapterCoreCheckpoint> {
  if (typeof serialized !== 'string' || serialized.length > MAX_CHAPTER_CHECKPOINT_BYTES) return failure('Chapter checkpoint is missing or exceeds the size limit.');
  try { return validateChapterCoreCheckpoint(JSON.parse(serialized) as unknown); }
  catch { return failure('Malformed chapter checkpoint JSON.'); }
}

/**
 * Pure migration of the existing metadata-only Room 104 slot. No localStorage writes,
 * frontend registration or invented later progress. The future host retains metadata.
 */
export function migrateLegacyChapterSave(value: unknown): ChapterCheckpointResult<ChapterCoreCheckpoint> {
  try {
    if (!ownDataRecord(value, ['version', 'checkpoint', 'label', 'playSeconds', 'savedAt', 'sessions']) || value.version !== 1 ||
        value.checkpoint !== 'nw:checkpoint:room-104-wake' || typeof value.label !== 'string' || value.label.length === 0 || value.label.length > 256 ||
        typeof value.playSeconds !== 'number' || !Number.isFinite(value.playSeconds) || value.playSeconds < 0 || value.playSeconds > Number.MAX_SAFE_INTEGER ||
        !finiteInteger(value.savedAt, 8_640_000_000_000_000) || !finiteInteger(value.sessions)) return failure('Unsupported or corrupt legacy Room 104 metadata.');
    return createChapterCoreCheckpoint(createInitialChapterState());
  } catch { return failure('Unreadable legacy save metadata.'); }
}
