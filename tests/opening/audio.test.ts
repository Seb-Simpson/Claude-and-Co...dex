import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpeningAudio, OPENING_VOICES } from '../../src/gameplay/opening/audio';
import type { DialogueSubtitle } from '../../src/gameplay/chapter/dialogue';
import type { AudioService } from '../../src/contracts';
import { audioOutput } from '../../src/audio/mixer';
import { settings } from '../../src/settings/settings';

const originalSettings = settings.get();
afterEach(() => { vi.unstubAllGlobals(); settings.update(originalSettings); });
function parameter() { return { value: 0, cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn(),
  setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }; }
function makeNode() {
  return { gain: parameter(), frequency: parameter(), type: '', buffer: null, loop: false,
    onended: null as (() => void) | null, connect: vi.fn((_target?: unknown) => undefined), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() };
}
function fixture(initialState: AudioContextState = 'running') {
  const nodes: ReturnType<typeof makeNode>[] = [];
  const sources: ReturnType<typeof makeNode>[] = [];
  function node() { const n = makeNode(); nodes.push(n); return n; }
  let decoded = 0;
  const durations = Object.values(OPENING_VOICES).map(cue => cue.durationSeconds);
  const context = { state: initialState, currentTime: 0, sampleRate: 22050, destination: {},
    createGain: vi.fn(node), createBiquadFilter: vi.fn(node), createOscillator: vi.fn(() => { const n = node(); sources.push(n); return n; }),
    createBufferSource: vi.fn(() => { const n = node(); sources.push(n); return n; }),
    createBuffer: vi.fn((_channels: number, frames: number, rate: number) => ({ duration: frames / rate, getChannelData: () => new Float32Array(frames) })),
    decodeAudioData: vi.fn(async () => ({ duration: durations[decoded++]! })), addEventListener: vi.fn(), removeEventListener: vi.fn(),
  };
  let unlocked = true;
  const service = { get context() { return unlocked ? context : null; }, resume: vi.fn(async () => undefined), dispose: vi.fn(async () => undefined) } as unknown as AudioService;
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
  const subtitles: (DialogueSubtitle | null)[] = [];
  return { context, service, sources, nodes, subtitles, lock() { unlocked = false; }, unlock() { unlocked = true; } };
}
async function flush(): Promise<void> { for (let i = 0; i < 8; i++) await Promise.resolve(); }

describe('Room104 opening audio', () => {
  it('contains exactly the two required scripts with explicit temporary status and measured asset timing', () => {
    const voices = Object.values(OPENING_VOICES);
    expect(voices).toHaveLength(2);
    expect(voices.map(cue => cue.text)).toEqual([
      'Patient one-zero-four. Please return to your bed.',
      'Patient one-zero-four. You have not been authorised to leave.',
    ]);
    for (const cue of voices) {
      expect(cue.recordingStatus).toBe('temporary');
      expect(cue.assetUrl).toContain('.temporary.wav');
      expect(cue.segments.at(-1)?.endSeconds).toBe(cue.durationSeconds);
    }
  });

  it('loads once, waits for existing audio unlock, serializes both lines and deduplicates cue IDs', async () => {
    const f = fixture(); f.lock();
    const audio = await createOpeningAudio(f.service, line => f.subtitles.push(line));
    const [first, second] = Object.keys(OPENING_VOICES) as (keyof typeof OPENING_VOICES)[];
    audio.queue(first!); audio.queue(first!); audio.queue(second!);
    audio.update(0.5);
    expect(f.context.decodeAudioData).not.toHaveBeenCalled();
    expect(f.sources).toHaveLength(0);
    f.unlock(); audio.update(0); await flush(); audio.update(0);
    expect(f.context.decodeAudioData).toHaveBeenCalledTimes(2);
    expect(f.sources).toHaveLength(1);
    expect(f.subtitles.at(-1)?.cueId).toBe(first);
    f.context.currentTime = OPENING_VOICES[first!].durationSeconds + 0.01;
    audio.update(0.01);
    expect(f.sources).toHaveLength(2);
    expect(f.subtitles.at(-1)?.cueId).toBe(second);
    f.context.currentTime += OPENING_VOICES[second!].durationSeconds + 0.01;
    audio.update(0.01);
    expect(f.subtitles.at(-1)).toBeNull();
    audio.queue(first!); audio.update(100);
    expect(f.sources).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    audio.dispose();
  });

  it('reports idle only after queued speech settles or the session is disposed', async () => {
    const f = fixture();
    const audio = await createOpeningAudio(f.service, line => f.subtitles.push(line));
    expect(audio.idle).toBe(true);
    audio.queue('nw005.voice.shaw.return-to-bed');
    expect(audio.idle).toBe(false);
    audio.update(0); await flush(); audio.update(0);
    expect(audio.idle).toBe(false);
    audio.pause(); audio.update(100);
    expect(audio.idle).toBe(false);
    audio.resume();
    f.context.currentTime = 4;
    audio.update(0);
    expect(audio.idle).toBe(true);
    audio.queue('nw005.voice.shaw.not-authorised');
    expect(audio.idle).toBe(false);
    audio.dispose();
    expect(audio.idle).toBe(true);
  });

  it('uses bounded play-time grace when unlock is denied, without counting pause or replaying on late unlock', async () => {
    const f = fixture(); f.lock();
    const audio = await createOpeningAudio(f.service, line => f.subtitles.push(line));
    audio.queue('nw005.voice.shaw.return-to-bed');
    audio.update(0.4); audio.pause(); audio.update(100); audio.resume(); audio.update(0.5);
    expect(f.subtitles.filter(Boolean)).toHaveLength(0);
    expect(audio.idle).toBe(false);
    audio.update(0.11);
    expect(f.subtitles.at(-1)?.cueId).toBe('nw005.voice.shaw.return-to-bed');
    expect(f.sources).toHaveLength(0);
    f.unlock(); audio.update(0); await flush(); audio.update(0);
    expect(f.sources).toHaveLength(0); // current preview is never restarted as audible speech
    audio.update(4);
    expect(audio.idle).toBe(true);
    audio.queue('nw005.voice.shaw.not-authorised');
    audio.update(0);
    expect(f.sources).toHaveLength(1); // a later cue can use the now-unlocked recording
    audio.dispose();
  });

  it('finishes serial subtitle previews when a shared context remains suspended', async () => {
    const f = fixture('suspended');
    const audio = await createOpeningAudio(f.service, line => f.subtitles.push(line));
    audio.queue('nw005.voice.shaw.return-to-bed'); audio.queue('nw005.voice.shaw.not-authorised');
    audio.update(1);
    expect(f.subtitles.at(-1)?.cueId).toBe('nw005.voice.shaw.return-to-bed');
    audio.pause(); audio.update(100); audio.resume(); audio.update(0);
    expect(audio.idle).toBe(false);
    audio.update(4); audio.update(1);
    expect(f.subtitles.at(-1)?.cueId).toBe('nw005.voice.shaw.not-authorised');
    audio.update(4);
    expect(audio.idle).toBe(true);
    expect(f.context.decodeAudioData).not.toHaveBeenCalled();
    audio.dispose();
  });

  it('pauses at the audible offset, clears subtitles, then resumes without replaying the beginning', async () => {
    const f = fixture();
    const audio = await createOpeningAudio(f.service, line => f.subtitles.push(line));
    audio.queue('nw005.voice.shaw.return-to-bed'); audio.update(0); await flush(); audio.update(0);
    f.context.currentTime = 1.2;
    audio.pause(); audio.pause(); audio.update(100);
    expect(f.subtitles.at(-1)).toBeNull();
    expect(f.sources[0]?.stop).toHaveBeenCalledTimes(1);
    f.context.currentTime = 100;
    audio.resume(); audio.update(0);
    expect(f.sources[1]?.start).toHaveBeenCalledWith(0, 1.2);
    expect(f.subtitles.at(-1)?.text).toBe('Patient one-zero-four. Please return to your bed.');
    audio.dispose(); audio.dispose();
    expect(f.sources[1]?.stop).toHaveBeenCalledTimes(1);
    expect(f.subtitles.at(-1)).toBeNull();
    expect(f.nodes.filter(n => n.type === 'highpass' || n.type === 'lowpass').every(n => n.disconnect.mock.calls.length === 1)).toBe(true);
  });

  it('routes filtered intercom and restrained effects through the existing SFX bus with bounded nodes', async () => {
    const f = fixture();
    const audio = await createOpeningAudio(f.service, line => f.subtitles.push(line));
    audio.queue('nw005.voice.shaw.return-to-bed'); audio.update(0); await flush(); audio.update(0);
    const output = audioOutput(f.context as unknown as AudioContext, 'sfx');
    expect(f.nodes.some(n => n.connect.mock.calls.some(([target]) => target === output))).toBe(true);
    expect(f.nodes.some(n => n.type === 'highpass' && n.frequency.value === 320)).toBe(true);
    settings.update({ sfxVolume: 0, masterVolume: 0 });
    const sfxGain = output as unknown as { gain: { setTargetAtTime: ReturnType<typeof vi.fn> } };
    expect(sfxGain.gain.setTargetAtTime).toHaveBeenCalledWith(0, f.context.currentTime, 0.03);
    for (let i = 0; i < 25; i++) audio.effect('footsteps');
    expect(f.sources.filter(source => !source.disconnect.mock.calls.length).length).toBeLessThanOrEqual(17); // 16 SFX + current speech
    audio.dispose();
    expect(f.sources.every(source => source.disconnect.mock.calls.length > 0)).toBe(true);
    audio.effect('accepted'); audio.queue('nw005.voice.shaw.not-authorised'); audio.update(1);
    expect(f.sources.every(source => source.disconnect.mock.calls.length > 0)).toBe(true);
  });

  it('reports decoder failure and keeps the opening recoverable with an explicitly unrecorded subtitle preview', async () => {
    const f = fixture();
    f.context.decodeAudioData.mockRejectedValue(new Error('decoder unavailable'));
    const reported = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const audio = await createOpeningAudio(f.service, line => f.subtitles.push(line));
    audio.queue('nw005.voice.shaw.return-to-bed'); audio.update(0); await flush(); audio.update(0);
    expect(reported).toHaveBeenCalledWith('NIGHT WARD opening voice preview unavailable:', expect.any(Error));
    expect(f.sources).toHaveLength(0);
    expect(f.subtitles.at(-1)?.cueId).toBe('nw005.voice.shaw.return-to-bed');
    audio.update(4);
    expect(f.subtitles.at(-1)).toBeNull();
    audio.dispose();
  });

  it('cancels a pending decode safely on teardown and rejects unavailable files', async () => {
    const f = fixture();
    const audio = await createOpeningAudio(f.service, line => f.subtitles.push(line));
    audio.queue('nw005.voice.shaw.return-to-bed'); audio.update(0); audio.dispose(); await flush(); audio.update(100);
    expect(f.sources).toHaveLength(0);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    await expect(createOpeningAudio(f.service, () => undefined)).rejects.toThrow(/failed to load/);
  });
});
