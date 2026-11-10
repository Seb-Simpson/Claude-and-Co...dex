import { describe, expect, it } from 'vitest';
import { createSaveStore, ROOM_104_CHECKPOINT } from '../../src/frontend/saves';
import { createOpeningCheckpoint } from '../../src/gameplay/opening/checkpoint';
import { createOpeningState, reduceOpening } from '../../src/gameplay/opening/state';

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}
const key = 'night-ward:save:v1';
function milestone(atStation = false) {
  let state = createOpeningState();
  for (const command of ['awaken', 'try-locked-door', 'take-card', 'use-reader'] as const) state = reduceOpening(state, command).state;
  if (atStation) state = reduceOpening(state, 'reach-station').state;
  return createOpeningCheckpoint(state, atStation ? 'station-approach' : 'room104-exit');
}

describe('opening data in the existing Continue slot', () => {
  it('migrates a legacy metadata-only Room 104 save without fabricating opening progress', () => {
    const storage = new MemoryStorage();
    const legacy = { version: 1, checkpoint: ROOM_104_CHECKPOINT.id, label: ROOM_104_CHECKPOINT.label, playSeconds: 18, savedAt: 1, sessions: 2 };
    storage.setItem(key, JSON.stringify(legacy));
    expect(createSaveStore(storage).load()).toEqual(legacy);
  });

  it('does not create a save solely because content tries to publish a milestone', () => {
    const store = createSaveStore(new MemoryStorage());
    expect(store.checkpoint(milestone())).toBeNull();
    expect(store.load()).toBeNull();
  });

  it('persists card, lock and one-shot state at the exit milestone across a fresh store', () => {
    const storage = new MemoryStorage();
    const store = createSaveStore(storage, () => 100);
    store.begin();
    store.record(21, true);
    const exit = milestone();
    const saved = store.checkpoint(exit);
    expect(saved).toMatchObject({ checkpoint: 'nw:checkpoint:room104-exit', opening: exit, playSeconds: 21, sessions: 1 });
    const loaded = createSaveStore(storage).load();
    expect(loaded).toEqual(saved);
    expect(loaded?.opening?.state).toMatchObject({ cardAcquired: true, doorUnlocked: true, firstLinePlayed: true, secondLinePlayed: true });
    expect(reduceOpening(loaded!.opening!.state, 'use-reader').effects).toEqual([]);
    expect(reduceOpening(loaded!.opening!.state, 'try-locked-door').effects).toEqual([]);
  });

  it('retains the milestone payload when the frontend banks time at pause or menu', () => {
    let now = 50;
    const store = createSaveStore(new MemoryStorage(), () => now);
    store.begin();
    store.checkpoint(milestone(true));
    now = 99;
    const saved = store.record(8, true);
    expect(saved).toMatchObject({ checkpoint: 'nw:checkpoint:station-approach', label: 'Nurses’ Station · West Ward', playSeconds: 8, sessions: 1, savedAt: 99 });
    expect(saved?.opening).toEqual(milestone(true));
  });

  it('starts a new game with no card, unlocked door or previously consumed cues', () => {
    const storage = new MemoryStorage();
    const store = createSaveStore(storage);
    store.begin();
    store.checkpoint(milestone(true));
    const fresh = store.begin();
    expect(fresh).toMatchObject({ checkpoint: ROOM_104_CHECKPOINT.id, label: ROOM_104_CHECKPOINT.label, playSeconds: 0, sessions: 0 });
    expect(fresh.opening).toBeUndefined();
    expect(createSaveStore(storage).load()?.opening).toBeUndefined();
  });

  it('rejects malformed checkpoint writes without replacing a valid milestone', () => {
    const store = createSaveStore(new MemoryStorage());
    store.begin();
    const valid = store.checkpoint(milestone());
    expect(store.checkpoint({ ...milestone(), state: { ...milestone().state, cardAcquired: false } })).toBeNull();
    expect(store.load()).toEqual(valid);
  });

  it('falls back to safe Room 104 metadata if stored opening progress is corrupted', () => {
    const storage = new MemoryStorage();
    const store = createSaveStore(storage);
    store.begin();
    const saved = store.checkpoint(milestone(true))!;
    storage.setItem(key, JSON.stringify({ ...saved, opening: { ...saved.opening, version: 99 } }));
    const recovered = createSaveStore(storage).load();
    expect(recovered?.opening).toBeUndefined();
    expect(recovered?.checkpoint).toBe(ROOM_104_CHECKPOINT.id);
    expect(recovered?.label).toBe(ROOM_104_CHECKPOINT.label);
    expect(recovered?.playSeconds).toBe(saved.playSeconds);
  });

  it('uses the same checkpoint semantics in memory when storage is denied', () => {
    const denied = { setItem() { throw new Error('denied'); } } as unknown as Storage;
    const store = createSaveStore(denied);
    expect(store.persistent).toBe(false);
    store.begin();
    store.checkpoint(milestone());
    expect(store.load()?.opening).toEqual(milestone());
    store.begin();
    expect(store.load()?.opening).toBeUndefined();
    store.clear();
    expect(store.load()).toBeNull();
  });
});
