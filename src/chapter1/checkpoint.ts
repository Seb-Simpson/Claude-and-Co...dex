/**
 * NW-R03 — Chapter 1 checkpoints (schema version 1).
 *
 * A checkpoint stores the full Chapter 1 state plus the player's pose, the door leaves left open
 * and one-time interactions used. It never stores Shaw's perception or memory. It is kept apart
 * from the existing chapter save (`night-ward:` keys in frontend/saves.ts), which is untouched.
 *
 * Restoration safety: every checkpoint definition names the beats it requires and the spaces the
 * player may stand in. A save whose state lacks those beats, or whose position is outside those
 * spaces, is refused, so a checkpoint can't put the player behind a barrier without the state that
 * opens it.
 */
import { validateChapter1State, type BeatId, type Chapter1State } from './state';

export const CH1_CHECKPOINT_SCHEMA = 'night-ward.ch1.checkpoint';
export const CH1_CHECKPOINT_VERSION = 1;
export const MAX_CH1_CHECKPOINT_BYTES = 32_768;

export interface Ch1CheckpointDefinition {
  readonly id: string;
  readonly label: string;
  /** Beats the state must contain. */
  readonly requires: readonly BeatId[];
  /** Beats the state must NOT contain (a later checkpoint supersedes this one). */
  readonly before?: readonly BeatId[];
  /** Greybox space ids the restored position must lie in. */
  readonly spaces: readonly string[];
}

/** R01 §7.3 checkpoints, mapped to the R02 greybox spaces. */
export const CH1_CHECKPOINTS: readonly Ch1CheckpointDefinition[] = [
  { id: 'CP0', label: 'Room 104', requires: [], spaces: ['R104'] },
  { id: 'CP1', label: 'After Lights Out', requires: ['lights-out-survived'], spaces: ['WC', 'LOBBY'] },
  { id: 'CP2', label: 'Stores entrance', requires: ['lights-out-survived'], before: ['stores-entered'], spaces: ['SC'] },
  { id: 'CP3', label: 'Crawlway entrance', requires: ['stores-encounter-resolved'], spaces: ['ST2'] },
  { id: 'CP4', label: 'ES2 exit', requires: ['crawlway-exited'], spaces: ['ES2'] },
  { id: 'CP5', label: 'Loop entry', requires: ['crawlway-exited'], before: ['keys-taken'], spaces: ['EJ', 'LEC'] },
  { id: 'CP6', label: 'Plant 2', requires: ['plant2-opened'], spaces: ['M0'] },
  { id: 'CP7', label: 'Bulkhead', requires: ['valve-closed'], before: ['bulkhead-opened'], spaces: ['M4', 'M5'] },
  { id: 'CP8', label: 'Through the NT doors', requires: ['north-wing-reached'], spaces: ['NB'] },
];

export interface Ch1Pose { readonly x: number; readonly y: number; readonly z: number; readonly yaw: number }

export interface Ch1Checkpoint {
  readonly schema: typeof CH1_CHECKPOINT_SCHEMA;
  readonly version: typeof CH1_CHECKPOINT_VERSION;
  readonly checkpointId: string;
  readonly savedAt: string;
  readonly pose: Ch1Pose;
  readonly state: Chapter1State;
  /** Door ids (`nw:door:…`) left open by the player. */
  readonly openDoors: readonly string[];
  /** One-time interactables already used (`nw:…` ids). */
  readonly usedInteractions: readonly string[];
}

export type Ch1CheckpointResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

export interface Ch1CheckpointContext {
  /** Space id at a position (the greybox layout's lookup). */
  spaceAt(x: number, z: number): string | null;
  /** Known door ids and one-time interactable ids, so stale ids from another build are refused. */
  readonly doorIds: ReadonlySet<string>;
  readonly interactionIds: ReadonlySet<string>;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function createCh1Checkpoint(input: {
  checkpointId: string; pose: Ch1Pose; state: Chapter1State; openDoors: readonly string[]; usedInteractions: readonly string[]; now?: Date;
}, context: Ch1CheckpointContext): Ch1CheckpointResult<Ch1Checkpoint> {
  const candidate: Ch1Checkpoint = {
    schema: CH1_CHECKPOINT_SCHEMA, version: CH1_CHECKPOINT_VERSION, checkpointId: input.checkpointId,
    savedAt: (input.now ?? new Date()).toISOString(), pose: { ...input.pose }, state: input.state,
    openDoors: [...new Set(input.openDoors)].sort(), usedInteractions: [...new Set(input.usedInteractions)].sort(),
  };
  return validateCh1Checkpoint(JSON.parse(JSON.stringify(candidate)), context);
}

export function validateCh1Checkpoint(raw: unknown, context: Ch1CheckpointContext): Ch1CheckpointResult<Ch1Checkpoint> {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Checkpoint is not an object' };
  const r = raw as Record<string, unknown>;
  if (r.schema !== CH1_CHECKPOINT_SCHEMA) return { ok: false, error: 'Not a Chapter 1 checkpoint' };
  if (r.version !== CH1_CHECKPOINT_VERSION) {
    return { ok: false, error: typeof r.version === 'number' && r.version > CH1_CHECKPOINT_VERSION ? 'Checkpoint is from a newer version' : `Unsupported checkpoint version ${String(r.version)}` };
  }
  const definition = CH1_CHECKPOINTS.find((c) => c.id === r.checkpointId);
  if (!definition) return { ok: false, error: `Unknown checkpoint "${String(r.checkpointId)}"` };
  if (typeof r.savedAt !== 'string' || Number.isNaN(Date.parse(r.savedAt))) return { ok: false, error: 'Invalid timestamp' };
  const pose = r.pose as Record<string, unknown> | undefined;
  if (!pose || !finite(pose.x) || !finite(pose.y) || !finite(pose.z) || !finite(pose.yaw)) return { ok: false, error: 'Invalid pose' };
  if (Math.abs(pose.y) > 0.5) return { ok: false, error: 'Pose is off the floor' };
  const state = validateChapter1State(r.state);
  if (!state.ok) return { ok: false, error: `Invalid state: ${state.error}` };
  const missing = definition.requires.filter((beat) => !state.state.beats.includes(beat));
  if (missing.length) return { ok: false, error: `Checkpoint ${definition.id} requires ${missing.join(', ')}` };
  const superseded = (definition.before ?? []).filter((beat) => state.state.beats.includes(beat));
  if (superseded.length) return { ok: false, error: `Checkpoint ${definition.id} is behind ${superseded.join(', ')}` };
  const space = context.spaceAt(pose.x, pose.z);
  if (!space || !definition.spaces.includes(space)) return { ok: false, error: `Position is outside checkpoint ${definition.id} (${space ?? 'void'})` };
  const ids = (value: unknown, known: ReadonlySet<string>, name: string): string[] | string => {
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) return `${name} must be strings`;
    const unknown = value.find((v) => !known.has(v));
    if (unknown) return `${name} contains unknown id "${unknown}"`;
    return [...new Set(value as string[])].sort();
  };
  const openDoors = ids(r.openDoors, context.doorIds, 'openDoors'); if (typeof openDoors === 'string') return { ok: false, error: openDoors };
  const usedInteractions = ids(r.usedInteractions, context.interactionIds, 'usedInteractions'); if (typeof usedInteractions === 'string') return { ok: false, error: usedInteractions };
  return {
    ok: true,
    value: {
      schema: CH1_CHECKPOINT_SCHEMA, version: CH1_CHECKPOINT_VERSION, checkpointId: definition.id, savedAt: r.savedAt,
      pose: { x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw }, state: state.state, openDoors, usedInteractions,
    },
  };
}

export function serializeCh1Checkpoint(checkpoint: Ch1Checkpoint): Ch1CheckpointResult<string> {
  const text = JSON.stringify(checkpoint);
  if (text.length > MAX_CH1_CHECKPOINT_BYTES) return { ok: false, error: 'Checkpoint is too large' };
  return { ok: true, value: text };
}

export function parseCh1Checkpoint(text: string, context: Ch1CheckpointContext): Ch1CheckpointResult<Ch1Checkpoint> {
  if (typeof text !== 'string' || text.length === 0) return { ok: false, error: 'Empty checkpoint' };
  if (text.length > MAX_CH1_CHECKPOINT_BYTES) return { ok: false, error: 'Checkpoint is too large' };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'Checkpoint is corrupted (not JSON)' }; }
  return validateCh1Checkpoint(raw, context);
}

/** Storage with the same guarded-access discipline as settings (storage may be missing or throw). */
export interface Ch1CheckpointStore {
  load(context: Ch1CheckpointContext): Ch1CheckpointResult<Ch1Checkpoint> | null;
  save(checkpoint: Ch1Checkpoint): boolean;
  clear(): void;
}

export function createCh1CheckpointStore(key: string, storage?: Storage | null): Ch1CheckpointStore {
  const store = (): Storage | null => {
    try { return storage === undefined ? globalThis.localStorage ?? null : storage; } catch { return null; }
  };
  return {
    load(context) {
      let text: string | null = null;
      try { text = store()?.getItem(key) ?? null; } catch { return null; }
      if (text === null) return null;
      return parseCh1Checkpoint(text, context);
    },
    save(checkpoint) {
      const serialized = serializeCh1Checkpoint(checkpoint);
      if (!serialized.ok) return false;
      try { store()?.setItem(key, serialized.value); return Boolean(store()); } catch { return false; }
    },
    clear() { try { store()?.removeItem(key); } catch { /* storage unavailable */ } },
  };
}
