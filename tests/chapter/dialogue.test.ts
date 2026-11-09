import { describe, expect, it, vi } from 'vitest';
import { CHAPTER_DIALOGUE, createBufferedDialogueVoiceAdapter, createDialoguePlayer, validateDialogueCue } from '../../src/gameplay/chapter/dialogue';
import type { DialogueCue, DialogueSubtitle } from '../../src/gameplay/chapter/dialogue';
import { settings } from '../../src/settings/settings';

const cue: DialogueCue = {
  id: 'test.voice', speaker: 'Intercom', text: 'Remain calm. Please wait.',
  durationSeconds: 4, recordingStatus: 'approved', assetUrl: '/voice/test.ogg', bus: 'sfx',
  segments: [
    { startSeconds: 0, endSeconds: 1.5, text: 'Remain calm.' },
    { startSeconds: 2, endSeconds: 4, text: 'Please wait.' },
  ],
};
function fixture(mode: 'production' | 'preview' = 'production') {
  const lines: (DialogueSubtitle | null)[] = [];
  const voice = { pause: vi.fn(), resume: vi.fn(), stop: vi.fn() };
  const releaseDuck = vi.fn();
  const playVoice = vi.fn(() => voice);
  const duck = vi.fn(() => releaseDuck);
  const onPreview = vi.fn();
  const player = createDialoguePlayer({ mode, subtitle: (line) => lines.push(line), playVoice, duck, onPreview });
  return { player, voice, lines, releaseDuck, playVoice, duck, onPreview };
}

describe('chapter dialogue transport', () => {
  it('dispatches exact subtitle segments on the supplied clock and stops the owned voice/mix scope', async () => {
    const f = fixture();
    const run = f.player.play(cue);
    expect(f.playVoice).toHaveBeenCalledWith(expect.objectContaining({ bus: 'sfx', assetUrl: '/voice/test.ogg' }));
    expect(f.lines.at(-1)?.text).toBe('Remain calm.');
    f.player.update(1.5);
    expect(f.lines.at(-1)).toBeNull();
    f.player.update(0.5);
    expect(f.lines.at(-1)?.text).toBe('Please wait.');
    f.player.update(2);
    expect(await run.finished).toEqual({ id: cue.id, outcome: 'completed' });
    expect(f.lines.at(-1)).toBeNull();
    expect(f.voice.stop).toHaveBeenCalledTimes(1);
    expect(f.releaseDuck).toHaveBeenCalledTimes(1);
    run.stop(); f.player.dispose();
    expect(f.voice.stop).toHaveBeenCalledTimes(1);
  });

  it('pauses the line and owned voice without wall-clock subtitle expiration', () => {
    const f = fixture();
    const run = f.player.play(cue);
    f.player.update(0.75);
    run.pause(); run.pause(); f.player.update(100);
    expect(run.elapsedSeconds).toBe(0.75);
    expect(f.lines.at(-1)?.text).toBe('Remain calm.');
    expect(f.voice.pause).toHaveBeenCalledTimes(1);
    run.resume(); run.resume(); f.player.update(1.25);
    expect(f.voice.resume).toHaveBeenCalledTimes(1);
    expect(f.lines.at(-1)?.text).toBe('Please wait.');
  });

  it('does not replay skipped-over subtitle segments when the host drops a large interval', async () => {
    const f = fixture();
    const run = f.player.play(cue);
    f.player.update(100);
    expect(f.lines.map((line) => line?.text)).not.toContain('Please wait.');
    expect((await run.finished).outcome).toBe('completed');
  });

  it('keeps missing acting explicit and blocks every unrecorded chapter line in production', () => {
    const f = fixture();
    expect(Object.keys(CHAPTER_DIALOGUE)).toHaveLength(13);
    for (const line of Object.values(CHAPTER_DIALOGUE)) {
      expect(line.recordingStatus).toBe('not-recorded');
      expect('assetUrl' in line).toBe(false);
      expect(() => f.player.play(line)).toThrow(/approved/);
      expect(() => validateDialogueCue(line)).not.toThrow();
    }
    expect(f.playVoice).not.toHaveBeenCalled();
  });

  it('allows a marked subtitle-only preview without starting or ducking audio', async () => {
    const f = fixture('preview');
    const line = CHAPTER_DIALOGUE['c1.voice.intercom.awakening'];
    const run = f.player.play(line);
    expect(f.onPreview).toHaveBeenCalledWith(expect.objectContaining({ recordingStatus: 'not-recorded' }));
    expect(f.playVoice).not.toHaveBeenCalled();
    expect(f.duck).not.toHaveBeenCalled();
    expect(f.lines.at(-1)?.text).toBe('West Ward, night shift.');
    f.player.update(10);
    expect((await run.finished).outcome).toBe('completed');
  });

  it('rejects malformed segments, missing audio adapters and unsupported mixer routes before allocation', () => {
    const f = fixture();
    expect(() => f.player.play({ ...cue, durationSeconds: NaN })).toThrow(/duration/);
    expect(() => f.player.play({ ...cue, bus: 'master' as 'sfx' })).toThrow(/mixer bus/);
    expect(() => f.player.play({ ...cue, segments: [{ startSeconds: 1, endSeconds: 0, text: 'bad' }] })).toThrow(/segments/);
    expect(() => f.player.play({ ...cue, segments: [...cue.segments, { startSeconds: 3, endSeconds: 4, text: 'overlap' }] })).toThrow(/segments/);
    expect(() => createDialoguePlayer({ mode: 'production', subtitle() {} }).play(cue)).toThrow(/adapter/);
    expect(f.playVoice).not.toHaveBeenCalled();
  });

  it('cleans ducking and resolves interruption if voice setup or subtitle delivery fails', async () => {
    const release = vi.fn();
    const player = createDialoguePlayer({ mode: 'production', subtitle() {}, duck: () => release,
      playVoice() { throw new Error('Decoder failed'); } });
    const run = player.play(cue);
    expect(await run.finished).toMatchObject({ outcome: 'interrupted', reason: 'Decoder failed' });
    expect(release).toHaveBeenCalledTimes(1);
    const stop = vi.fn();
    const brokenSink = createDialoguePlayer({ mode: 'production', subtitle() { throw new Error('Sink failed'); },
      playVoice: () => ({ stop, pause() {}, resume() {} }) });
    const failed = brokenSink.play(cue);
    expect((await failed.finished).outcome).toBe('interrupted');
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('old handles cannot stop, pause or advance a replacement line', async () => {
    const f = fixture();
    const old = f.player.play(cue);
    old.stop('checkpoint');
    expect((await old.finished).outcome).toBe('interrupted');
    const next = f.player.play({ ...cue, id: 'new.voice' });
    old.stop(); old.pause(); old.resume(); old.update(50);
    expect(next.active).toBe(true);
    expect(next.elapsedSeconds).toBe(0);
    expect(f.lines.at(-1)?.cueId).toBe('new.voice');
    f.player.dispose(); f.player.dispose();
    expect((await next.finished).outcome).toBe('interrupted');
    expect(() => f.player.play(cue)).toThrow(/disposed/);
  });

  it('copies input metadata and rejects invalid host deltas', () => {
    const f = fixture();
    const mutable = { ...cue, segments: cue.segments.map((s) => ({ ...s })) };
    const run = f.player.play(mutable);
    mutable.segments[1]!.text = 'mutated';
    run.update(2);
    expect(f.lines.at(-1)?.text).toBe('Please wait.');
    for (const invalid of [-1, NaN, Infinity]) expect(() => f.player.update(invalid)).toThrow(/delta/);
  });

  it('uses only finite monotonic custom playheads, with host fallback for a missing/invalid hint', () => {
    let clock = NaN;
    const player = createDialoguePlayer({ mode: 'production', subtitle() {},
      playVoice: () => ({ get timeSeconds() { return clock; }, pause() {}, resume() {}, stop() {} }) });
    const run = player.play(cue);
    expect(run.audioTimeSeconds).toBeNull();
    player.update(0.5);
    expect(run.elapsedSeconds).toBe(0.5);
    clock = 2.5; player.update(0.1);
    expect(run.elapsedSeconds).toBe(2.5);
    clock = 1; player.update(0.1);
    expect(run.elapsedSeconds).toBe(2.5);
    expect(run.audioTimeSeconds).toBe(2.5);
    clock = Infinity;
    expect(run.audioTimeSeconds).toBeNull();
    player.update(0.25);
    expect(run.elapsedSeconds).toBe(2.75);
    run.stop();
  });
});

describe('buffered dialogue voice adapter', () => {
  function audioFixture() {
    const sources: { buffer: AudioBuffer | null; onended: (() => void) | null; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
    const gains: { gain: { value: number; cancelScheduledValues: ReturnType<typeof vi.fn>; setTargetAtTime: ReturnType<typeof vi.fn> }; connect: ReturnType<typeof vi.fn> }[] = [];
    const fake = Object.assign(new EventTarget(), {
      currentTime: 0, state: 'running', destination: {},
      createGain() {
        const node = { gain: { value: 1, cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() }, connect: vi.fn() };
        gains.push(node); return node;
      },
      createBufferSource() {
        const source = { buffer: null as AudioBuffer | null, onended: null as (() => void) | null,
          connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() };
        sources.push(source); return source;
      },
    });
    const context = fake as unknown as AudioContext;
    const recordings = new Map([['/voice/test.ogg', { duration: 4 } as AudioBuffer]]);
    const close = (): void => { fake.state = 'closed'; fake.dispatchEvent(new Event('statechange')); };
    return { fake, context, sources, gains, recordings, close };
  }

  it('connects to the existing settings-controlled SFX bus and resumes at a paused source offset', () => {
    const f = audioFixture();
    try {
      const voice = createBufferedDialogueVoiceAdapter(f.context, f.recordings)(cue);
      expect(f.sources).toHaveLength(1);
      expect(f.sources[0]!.connect).toHaveBeenCalledWith(f.gains[2]);
      expect(f.sources[0]!.start).toHaveBeenCalledWith(0, 0);
      settings.update({ sfxVolume: 0 });
      expect(f.gains[2]!.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.03);
      f.fake.currentTime = 1.25;
      voice.pause(); voice.pause();
      expect(f.sources[0]!.stop).toHaveBeenCalledTimes(1);
      expect(f.sources[0]!.disconnect).toHaveBeenCalledTimes(1);
      f.fake.currentTime = 50;
      voice.resume(); voice.resume();
      expect(f.sources).toHaveLength(2);
      expect(f.sources[1]!.start).toHaveBeenCalledWith(0, 1.25);
      voice.stop(); voice.stop(); voice.resume();
      expect(f.sources[1]!.stop).toHaveBeenCalledTimes(1);
      expect(f.sources[1]!.disconnect).toHaveBeenCalledTimes(1);
      expect(f.sources).toHaveLength(2);
    } finally { settings.reset(); f.close(); }
  });

  it('releases a naturally ended source and does not resurrect it on resume', () => {
    const f = audioFixture();
    try {
      const voice = createBufferedDialogueVoiceAdapter(f.context, f.recordings)(cue);
      f.sources[0]!.onended!();
      expect(f.sources[0]!.disconnect).toHaveBeenCalledTimes(1);
      voice.pause(); voice.resume(); voice.stop();
      expect(f.sources).toHaveLength(1);
      expect(f.sources[0]!.stop).not.toHaveBeenCalled();
    } finally { f.close(); }
  });

  it('rejects locked audio, absent recordings and incompatible subtitle timing before allocating a source', () => {
    const f = audioFixture();
    try {
      const adapter = createBufferedDialogueVoiceAdapter(f.context, f.recordings);
      f.fake.state = 'suspended';
      expect(() => adapter(cue)).toThrow(/unlocked/);
      f.fake.state = 'running';
      expect(() => adapter({ ...cue, assetUrl: '/missing.ogg' })).toThrow(/not loaded/);
      expect(() => adapter({ ...cue, durationSeconds: 6 })).toThrow(/timing/);
      expect(f.sources).toHaveLength(0);
    } finally { f.close(); }
  });

  it('keeps captions on the AudioContext playhead after dropped host time, including pause/resume and natural end', async () => {
    const f = audioFixture();
    try {
      const subtitles: (DialogueSubtitle | null)[] = [];
      const player = createDialoguePlayer({ mode: 'production', subtitle: (line) => subtitles.push(line),
        playVoice: createBufferedDialogueVoiceAdapter(f.context, f.recordings) });
      const run = player.play(cue);
      f.fake.currentTime = 3;
      player.update(0.1); // A stalled renderer has discarded 2.9 seconds of wall time.
      expect(run.elapsedSeconds).toBe(3);
      expect(run.audioTimeSeconds).toBe(3);
      expect(subtitles.at(-1)?.text).toBe('Please wait.');
      f.fake.currentTime = 3.25;
      run.pause();
      expect(run.elapsedSeconds).toBe(3.25);
      f.fake.currentTime = 100;
      player.update(100);
      expect(run.elapsedSeconds).toBe(3.25);
      expect(run.audioTimeSeconds).toBe(3.25);
      run.resume();
      expect(f.sources[1]!.start).toHaveBeenCalledWith(0, 3.25);
      f.fake.currentTime = 100.5;
      player.update(0.1);
      expect(run.elapsedSeconds).toBe(3.75);
      f.fake.currentTime = 101;
      f.sources[1]!.onended!();
      player.update(0.1);
      expect(await run.finished).toMatchObject({ outcome: 'completed' });
      expect(run.elapsedSeconds).toBe(4);
      expect(run.audioTimeSeconds).toBeNull();
      expect(subtitles.at(-1)).toBeNull();
      expect(f.sources[1]!.disconnect).toHaveBeenCalledTimes(1);
    } finally { f.close(); }
  });
});
