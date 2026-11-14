import { describe, expect, it, vi } from 'vitest';
import { audioOutput, duckBuses, duckLevels } from '../../src/audio/mixer';
import { settings } from '../../src/settings/settings';

function fakeContext() {
  const nodes: { gain: { value: number; cancelScheduledValues: ReturnType<typeof vi.fn>; setTargetAtTime: ReturnType<typeof vi.fn> }; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  const ctx = Object.assign(new EventTarget(), {
    state: 'running' as AudioContextState, currentTime: 1, destination: { id: 'dest' },
    createGain: vi.fn(() => {
      const node = { gain: { value: 1, cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() }, connect: vi.fn((n: unknown) => n), disconnect: vi.fn() };
      nodes.push(node);
      return node;
    }),
  });
  return { ctx: ctx as unknown as AudioContext, nodes };
}

describe('voice bus and ducking', () => {
  it('creates a separate voice bus on first use, following the voice volume setting', () => {
    const { ctx, nodes } = fakeContext();
    audioOutput(ctx, 'music');
    expect(nodes).toHaveLength(3);
    const voice = audioOutput(ctx, 'voice');
    expect(nodes).toHaveLength(4);
    expect(voice).not.toBe(audioOutput(ctx, 'sfx'));
    expect(audioOutput(ctx, 'voice')).toBe(voice);
    expect(nodes[3]!.connect).toHaveBeenCalledWith(nodes[0]);
    const before = settings.get().voiceVolume;
    settings.update({ voiceVolume: 0.5 });
    expect(nodes[3]!.gain.setTargetAtTime).toHaveBeenCalledWith(0.25, 1, expect.any(Number));
    settings.update({ voiceVolume: before });
  });

  it('ducks music and effects under dialogue; overlapping ducks take the deepest; release is idempotent', () => {
    const { ctx } = fakeContext();
    audioOutput(ctx, 'voice');
    const a = duckBuses(ctx, { music: -8, sfx: -4 });
    const b = duckBuses(ctx, { music: -12 });
    expect(duckLevels(ctx)).toEqual({ music: -12, sfx: -4, voice: 0 });
    b();
    expect(duckLevels(ctx)).toEqual({ music: -8, sfx: -4, voice: 0 });
    a(); a();
    expect(duckLevels(ctx)).toEqual({ music: 0, sfx: 0, voice: 0 });
  });
});
