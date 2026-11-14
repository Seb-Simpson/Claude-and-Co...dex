import { describe, expect, it } from 'vitest';
import {
  CH1_CHECKPOINT_VERSION, createCh1Checkpoint, createCh1CheckpointStore, parseCh1Checkpoint, serializeCh1Checkpoint,
  type Ch1CheckpointContext,
} from '../../src/chapter1/checkpoint';
import { applyChapter1Events, createChapter1State, type BeatId, type Chapter1Event } from '../../src/chapter1/state';
import { buildLayout } from '../../src/world/greybox/grid';

const layout = buildLayout();
const context: Ch1CheckpointContext = {
  spaceAt: (x, z) => layout.spaceAt(x, z)?.id ?? null,
  doorIds: new Set(['nw:door:gb-steam', 'nw:door:gb-bulkhead']),
  interactionIds: new Set(['nw:inspect:gb-r03-valve', 'nw:inspect:gb-r03-padlock']),
};
const beats = (...ids: BeatId[]): Chapter1Event[] => ids.map((beat) => ({ type: 'beat', beat }));
const atBulkhead = applyChapter1Events(createChapter1State(), [
  ...beats('woke', 'left-room-104', 'lights-out-survived', 'stores-entered', 'stores-encounter-resolved', 'crawlway-exited'),
  { type: 'item', id: 'shaw-keys', op: 'add' }, ...beats('keys-taken', 'plant2-opened', 'valve-closed'),
  { type: 'knowledge', id: 'link-closure-order' }, { type: 'suspicion', source: 'seen-escaped' },
]).state;

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

describe('Chapter 1 checkpoints', () => {
  const make = () => createCh1Checkpoint({
    checkpointId: 'CP7', pose: { x: 4.2, y: 0, z: -43, yaw: 1.57 }, state: atBulkhead,
    openDoors: ['nw:door:gb-steam'], usedInteractions: ['nw:inspect:gb-r03-valve'], now: new Date('2026-11-15T00:00:00Z'),
  }, context);

  it('save → serialise → store → reload → parse round-trips every field', () => {
    const cp = make();
    expect(cp.ok).toBe(true);
    if (!cp.ok) return;
    const storage = new MemoryStorage();
    const store = createCh1CheckpointStore('test', storage as unknown as Storage);
    expect(store.save(cp.value)).toBe(true);
    // "Exit": a brand-new store over the same storage.
    const reloaded = createCh1CheckpointStore('test', storage as unknown as Storage).load(context);
    expect(reloaded).toEqual({ ok: true, value: cp.value });
    if (!reloaded?.ok) return;
    expect(reloaded.value.state.suspicion).toBe(1);
    expect(reloaded.value.state.knowledge).toContain('link-closure-order');
    expect(reloaded.value.state.items).toContain('shaw-keys');
    expect(reloaded.value.openDoors).toEqual(['nw:door:gb-steam']);
  });

  it('refuses a checkpoint that would place the player behind a barrier without the required state', () => {
    const early = applyChapter1Events(createChapter1State(), beats('woke', 'left-room-104')).state;
    const r = createCh1Checkpoint({ checkpointId: 'CP7', pose: { x: 4.2, y: 0, z: -43, yaw: 0 }, state: early, openDoors: [], usedInteractions: [] }, context);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/requires/);
  });

  it('refuses positions outside the checkpoint’s spaces, superseded checkpoints and unknown ids', () => {
    expect(createCh1Checkpoint({ checkpointId: 'CP7', pose: { x: -35.4, y: 0, z: 4.4, yaw: 0 }, state: atBulkhead, openDoors: [], usedInteractions: [] }, context).ok).toBe(false);
    expect(createCh1Checkpoint({ checkpointId: 'CP2', pose: { x: 0, y: 0, z: 20, yaw: 0 }, state: atBulkhead, openDoors: [], usedInteractions: [] }, context).ok).toBe(false);
    expect(createCh1Checkpoint({ checkpointId: 'CP7', pose: { x: 4.2, y: 0, z: -43, yaw: 0 }, state: atBulkhead, openDoors: ['nw:door:nope'], usedInteractions: [] }, context).ok).toBe(false);
    expect(createCh1Checkpoint({ checkpointId: 'CP99', pose: { x: 4.2, y: 0, z: -43, yaw: 0 }, state: atBulkhead, openDoors: [], usedInteractions: [] }, context).ok).toBe(false);
  });

  it('handles corrupted, foreign, future-version and tampered saves explicitly', () => {
    const cp = make();
    if (!cp.ok) throw new Error(cp.error);
    const text = serializeCh1Checkpoint(cp.value);
    if (!text.ok) throw new Error(text.error);
    expect(parseCh1Checkpoint('{not json', context)).toEqual({ ok: false, error: 'Checkpoint is corrupted (not JSON)' });
    expect(parseCh1Checkpoint(text.value.slice(0, 40), context).ok).toBe(false);
    expect(parseCh1Checkpoint(JSON.stringify({ ...cp.value, schema: 'night-ward.chapter' }), context)).toEqual({ ok: false, error: 'Not a Chapter 1 checkpoint' });
    expect(parseCh1Checkpoint(JSON.stringify({ ...cp.value, version: CH1_CHECKPOINT_VERSION + 1 }), context)).toEqual({ ok: false, error: 'Checkpoint is from a newer version' });
    expect(parseCh1Checkpoint(JSON.stringify({ ...cp.value, state: { ...cp.value.state, suspicion: 4 } }), context).ok).toBe(false);
    expect(parseCh1Checkpoint(JSON.stringify({ ...cp.value, pose: { ...cp.value.pose, x: Number.NaN } }), context).ok).toBe(false);
    expect(parseCh1Checkpoint('x'.repeat(40_000), context)).toEqual({ ok: false, error: 'Checkpoint is too large' });
    // Storage that throws behaves as "no save".
    const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
    const store = createCh1CheckpointStore('k', throwing as unknown as Storage);
    expect(store.load(context)).toBeNull();
    expect(store.save(cp.value)).toBe(false);
    expect(() => store.clear()).not.toThrow();
  });

  it('keeps developer teleport checkpoints separate (different ids and storage key)', () => {
    // Developer CP teleports live in the greybox level data and are never written to storage.
    const storage = new MemoryStorage();
    createCh1CheckpointStore('night-ward:greybox:ch1-checkpoint', storage as unknown as Storage);
    expect([...storage.map.keys()]).toEqual([]);
  });
});
