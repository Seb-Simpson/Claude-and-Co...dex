import { describe, expect, it, vi } from 'vitest';
import { preloadAll, preloadOne, takePreloaded } from '../../src/assets/preload';
import { audioOutput, mixerCount, volumeToGain } from '../../src/audio/mixer';
import { createLoadingPlan } from '../../src/frontend/loading/plan';
import { LoadingTracker } from '../../src/frontend/loading/tracker';
import { createSaveStore, formatPlayTime } from '../../src/frontend/saves';
import { createSettingsStore, DEFAULT_SETTINGS, prefersReducedMotion, sanitizeSettings, settings } from '../../src/settings/settings';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(k: string) { return this.map.get(k) ?? null; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string) { this.map.delete(k); }
  setItem(k: string, v: string) { this.map.set(k, v); }
}
const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } } as unknown as Storage;

describe('settings', () => {
  it('validates anything it reads and clamps out-of-range values', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    const s = sanitizeSettings({ masterVolume: 4, musicVolume: -1, mouseSensitivity: 99, quality: 'cinematic', motion: 'reduce', subtitles: 'yes', effects: Number.NaN });
    expect(s.masterVolume).toBe(1);
    expect(s.musicVolume).toBe(0);
    expect(s.mouseSensitivity).toBe(3);
    expect(s.quality).toBe(DEFAULT_SETTINGS.quality);
    expect(s.motion).toBe('reduce');
    expect(s.subtitles).toBe(DEFAULT_SETTINGS.subtitles);
    expect(s.effects).toBe(DEFAULT_SETTINGS.effects);
  });

  it('persists changes and restores them in a new store', () => {
    const storage = new MemoryStorage();
    const a = createSettingsStore(storage);
    expect(a.persistent).toBe(true);
    a.update({ masterVolume: 0.25, quality: 'low', invertY: true });
    const b = createSettingsStore(storage);
    expect(b.get()).toMatchObject({ masterVolume: 0.25, quality: 'low', invertY: true });
    b.reset();
    expect(createSettingsStore(storage).get()).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps working in memory when storage is unavailable or corrupt', () => {
    const blocked = createSettingsStore(throwing);
    expect(blocked.persistent).toBe(false);
    expect(blocked.update({ sfxVolume: 0.1 }).sfxVolume).toBe(0.1);
    const storage = new MemoryStorage();
    storage.setItem('night-ward:settings:v1', '{not json');
    expect(createSettingsStore(storage).get()).toEqual(DEFAULT_SETTINGS);
    expect(createSettingsStore(null).persistent).toBe(false);
  });

  it('notifies subscribers and honours the OS reduced-motion preference only on "system"', () => {
    const store = createSettingsStore(new MemoryStorage());
    const seen = vi.fn();
    const off = store.subscribe(seen);
    store.update({ effects: 0.5 });
    off();
    store.update({ effects: 0.2 });
    expect(seen).toHaveBeenCalledTimes(1);
    expect(prefersReducedMotion({ ...DEFAULT_SETTINGS, motion: 'system' }, { matches: true })).toBe(true);
    expect(prefersReducedMotion({ ...DEFAULT_SETTINGS, motion: 'full' }, { matches: true })).toBe(false);
    expect(prefersReducedMotion({ ...DEFAULT_SETTINGS, motion: 'reduce' }, { matches: false })).toBe(true);
  });
});

describe('audio mixer', () => {
  function fakeContext() {
    const nodes: { gain: { value: number; cancelScheduledValues: ReturnType<typeof vi.fn>; setTargetAtTime: ReturnType<typeof vi.fn> }; connect: ReturnType<typeof vi.fn> }[] = [];
    const ctx = Object.assign(new EventTarget(), {
      state: 'running' as AudioContextState, currentTime: 1, destination: { id: 'dest' },
      createGain: vi.fn(() => {
        const node = { gain: { value: 1, cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() }, connect: vi.fn((n: unknown) => n) };
        nodes.push(node);
        return node;
      }),
    });
    return { ctx: ctx as unknown as AudioContext, nodes };
  }

  it('routes music and effects through their own buses into one master', () => {
    const { ctx, nodes } = fakeContext();
    const music = audioOutput(ctx, 'music');
    const sfx = audioOutput(ctx, 'sfx');
    expect(music).not.toBe(sfx);
    expect(audioOutput(ctx, 'music')).toBe(music);
    expect(nodes).toHaveLength(3);
    const [master] = nodes;
    expect(master!.connect).toHaveBeenCalledWith({ id: 'dest' });
    expect(nodes[1]!.connect).toHaveBeenCalledWith(master);
    expect(nodes[2]!.connect).toHaveBeenCalledWith(master);
  });

  it('follows the volume settings live with a perceptual curve', () => {
    const { ctx, nodes } = fakeContext();
    audioOutput(ctx, 'sfx');
    settings.update({ masterVolume: 0.5, sfxVolume: 0 });
    expect(nodes[0]!.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.25, 1, 0.03);
    expect(nodes[2]!.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 1, 0.03);
    expect(volumeToGain(1)).toBe(1);
    expect(volumeToGain(0.5)).toBe(0.25);
    settings.reset();
  });

  it('forgets closed contexts', () => {
    const { ctx } = fakeContext();
    audioOutput(ctx, 'music');
    const before = mixerCount();
    (ctx as unknown as { state: string }).state = 'closed';
    ctx.dispatchEvent(new Event('statechange'));
    expect(mixerCount()).toBe(before - 1);
  });
});

describe('asset preload', () => {
  const stream = (chunks: number[]): Response => new Response(new ReadableStream({
    start(controller) { for (const n of chunks) controller.enqueue(new Uint8Array(n).fill(7)); controller.close(); },
  }), { headers: { 'content-length': String(chunks.reduce((a, b) => a + b, 0)) } });

  it('reports received bytes chunk by chunk and hands the buffer to one loader', async () => {
    const seen: number[] = [];
    await preloadOne({ url: '/a.glb', bytes: 999, label: 'a' }, { fetch: (async () => stream([100, 250, 50])) as unknown as typeof fetch, onProgress: (p) => seen.push(p.received) });
    expect(seen).toEqual([0, 100, 350, 400, 400]);
    const buffer = takePreloaded('/a.glb');
    expect(buffer?.byteLength).toBe(400);
    expect(takePreloaded('/a.glb')).toBeUndefined();
  });

  it('reports failures per file without rejecting the batch', async () => {
    const result = await preloadAll([{ url: '/ok.glb', bytes: 10, label: 'ok' }, { url: '/missing.glb', bytes: 10, label: 'missing' }], {
      fetch: (async (url: string) => (url === '/ok.glb' ? stream([10]) : new Response('no', { status: 404 }))) as unknown as typeof fetch,
    });
    expect(result.failed).toEqual(['/missing.glb']);
    expect(takePreloaded('/ok.glb')?.byteLength).toBe(10);
  });
});

describe('loading tracker', () => {
  it('derives the percentage from work only: bytes received and finished steps', () => {
    const t = new LoadingTracker().addBytes('f', 'file', 50, 1000).addStep('s', 'step', 50);
    expect(t.snapshot().fraction).toBe(0);
    t.begin('s');
    expect(t.snapshot().fraction).toBe(0); // an active step is not partial progress
    t.bytes('f', 500);
    expect(t.snapshot().fraction).toBeCloseTo(0.25);
    t.bytes('f', 200); // never goes backwards
    expect(t.snapshot().fraction).toBeCloseTo(0.25);
    t.finish('s');
    t.bytes('f', 1000, undefined, true);
    expect(t.snapshot()).toMatchObject({ fraction: 1, complete: true });
  });

  it('lets a failed task complete the bar (its owner falls back) and records why', () => {
    const t = new LoadingTracker().addStep('a', 'a', 1).addStep('b', 'b', 1);
    t.finish('a');
    t.fail('b', 'HTTP 404');
    const s = t.snapshot();
    expect(s.complete).toBe(true);
    expect(s.tasks[1]).toMatchObject({ state: 'failed', note: 'HTTP 404' });
  });

  it('plans the real stages: downloads by manifest size, engine, every module and shaders', () => {
    const plan = createLoadingPlan(['nw:world:hospital', 'night-ward:gameplay'], { includeEngine: true });
    const ids = plan.tracker.snapshot().tasks.map((t) => t.id);
    expect(ids.filter((i) => i.startsWith('file:'))).toHaveLength(7); // 5 entity models + set + light map
    expect(ids).toEqual(expect.arrayContaining(['engine:renderer', 'module:nw:world:hospital', 'module:night-ward:gameplay', 'shaders:scene']));
    expect(plan.tracker.snapshot().totalBytes).toBeGreaterThan(10 * 1024 * 1024);
    plan.onProgress({ stage: 'module', id: 'nw:world:hospital', state: 'done' });
    expect(plan.tracker.snapshot().tasks.find((t) => t.id === 'module:nw:world:hospital')?.state).toBe('done');
    const restart = createLoadingPlan(['nw:world:hospital'], { includeEngine: false, downloads: [] });
    expect(restart.tracker.snapshot().tasks.map((t) => t.id)).toEqual(['module:nw:world:hospital', 'shaders:scene']);
  });
});

describe('save slot', () => {
  it('starts a record on New Game, accumulates play time and counts sessions', () => {
    let now = 1000;
    const store = createSaveStore(new MemoryStorage(), () => now);
    expect(store.load()).toBeNull();
    store.begin();
    now = 2000;
    store.record(65, true);
    store.record(10, false);
    expect(store.load()).toMatchObject({ playSeconds: 75, sessions: 1, savedAt: 2000, checkpoint: 'nw:checkpoint:room-104-wake' });
    store.clear();
    expect(store.load()).toBeNull();
    expect(formatPlayTime(3725)).toBe('1:02:05');
    expect(formatPlayTime(65)).toBe('1:05');
  });

  it('rejects malformed records and survives unavailable storage', () => {
    const storage = new MemoryStorage();
    storage.setItem('night-ward:save:v1', JSON.stringify({ version: 1, checkpoint: 'x', label: 'y', playSeconds: -5, savedAt: 0, sessions: 0 }));
    expect(createSaveStore(storage).load()).toBeNull();
    const blocked = createSaveStore(throwing);
    expect(blocked.persistent).toBe(false);
    blocked.begin();
    expect(blocked.load()?.label).toBe('Room 104 · Ward 4 West');
  });
});
