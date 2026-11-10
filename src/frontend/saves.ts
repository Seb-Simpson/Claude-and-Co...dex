import { validateOpeningCheckpoint } from '../gameplay/opening/checkpoint';
import type { OpeningCheckpoint } from '../gameplay/opening/checkpoint';

/**
 * The save slot behind "Continue".
 *
 * NIGHT WARD has one checkpoint so far, the patient waking in Room 104, because gameplay does not
 * define later ones yet. A save records that a night is under way (checkpoint, play time, when it
 * was last played), so Continue resumes from the latest checkpoint and New Game starts the record
 * over. When gameplay adds checkpoints, `checkpoint` carries the new ids; the menu reads `label`.
 */
export interface SaveRecord {
  readonly version: 1;
  readonly checkpoint: string;
  readonly label: string;
  readonly playSeconds: number;
  readonly savedAt: number;
  readonly sessions: number;
  readonly opening?: OpeningCheckpoint;
}

export const ROOM_104_CHECKPOINT = { id: 'nw:checkpoint:room-104-wake', label: 'Room 104 · Ward 4 West' } as const;
const KEY = 'night-ward:save:v1';

export interface SaveStore {
  load(): SaveRecord | null;
  /** Begin a fresh record (New Game). */
  begin(): SaveRecord;
  /** Add played time; records the session count on the first call of a session. */
  record(seconds: number, newSession: boolean): SaveRecord | null;
  checkpoint(opening: OpeningCheckpoint): SaveRecord | null;
  clear(): void;
  readonly persistent: boolean;
}

function storageOrNull(candidate?: Storage | null): Storage | null {
  try {
    const s = candidate === undefined ? globalThis.localStorage : candidate;
    if (!s) return null;
    s.setItem(`${KEY}:probe`, '1');
    s.removeItem(`${KEY}:probe`);
    return s;
  } catch {
    return null;
  }
}

function valid(raw: unknown): SaveRecord | null {
  const r = raw as Partial<SaveRecord> | null;
  if (!r || r.version !== 1 || typeof r.checkpoint !== 'string' || typeof r.label !== 'string') return null;
  if (![r.playSeconds, r.savedAt, r.sessions].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) return null;
  const opening = r.opening === undefined ? undefined : validateOpeningCheckpoint(r.opening);
  // A malformed extension falls back to the original safe Room104 checkpoint.
  const { opening: _opening, ...base } = r as SaveRecord;
  if (r.opening !== undefined && !opening) return { ...base, checkpoint: ROOM_104_CHECKPOINT.id, label: ROOM_104_CHECKPOINT.label };
  return { ...base, ...(opening ? { opening, checkpoint: `nw:checkpoint:${opening.milestone}`,
    label: opening.milestone === 'station-approach' ? 'Nurses’ Station · West Ward' : 'Room 104 · Door released' } : {}) };
}

export function createSaveStore(storage?: Storage | null, now: () => number = Date.now): SaveStore {
  const backing = storageOrNull(storage);
  let memory: SaveRecord | null = null;
  const read = (): SaveRecord | null => {
    if (!backing) return memory;
    try { const raw = backing.getItem(KEY); return raw ? valid(JSON.parse(raw)) : null; } catch { return null; }
  };
  const write = (record: SaveRecord | null): void => {
    memory = record;
    if (!backing) return;
    try { if (record) backing.setItem(KEY, JSON.stringify(record)); else backing.removeItem(KEY); } catch { /* storage revoked */ }
  };
  return {
    load: read,
    begin() {
      const record: SaveRecord = { version: 1, checkpoint: ROOM_104_CHECKPOINT.id, label: ROOM_104_CHECKPOINT.label, playSeconds: 0, savedAt: now(), sessions: 0 };
      write(record);
      return record;
    },
    record(seconds, newSession) {
      const current = read();
      if (!current) return null;
      const next: SaveRecord = {
        ...current,
        playSeconds: current.playSeconds + Math.max(0, seconds),
        savedAt: now(),
        sessions: current.sessions + (newSession ? 1 : 0),
      };
      write(next);
      return next;
    },
    checkpoint(value) {
      const opening = validateOpeningCheckpoint(value);
      const current = read();
      if (!opening || !current) return null;
      const next: SaveRecord = { ...current, opening, checkpoint: `nw:checkpoint:${opening.milestone}`,
        label: opening.milestone === 'station-approach' ? 'Nurses’ Station · West Ward' : 'Room 104 · Door released', savedAt: now() };
      write(next);
      return next;
    },
    clear: () => write(null),
    get persistent() { return backing !== null; },
  };
}

export function formatPlayTime(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
