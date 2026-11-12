import { describe, expect, it } from 'vitest';
import { Ambience, CUE_IDS, type CueId } from './ambience';

/**
 * NW-007B audio cues on a recording fake AudioContext: each cue synthesizes, routes through a
 * positional panner when given a position, stops cleanly, and stays quiet. Loudness is measured
 * as the largest gain value scheduled while the cue was synthesized (envelope peaks), relative to
 * the existing chase stinger.
 */
const NEW_CUES: readonly CueId[] = ['nw:shaw-steps', 'nw:shaw-keys', 'nw:shaw-rustle', 'nw:call-panel', 'nw:paper', 'nw:station-hum', 'nw:capture'];

function fakeContext() {
  const gains: number[] = [];
  const counts = { panners: 0, started: 0, stopped: 0 };
  const param = (record: boolean) => {
    const push = (v: number) => { if (record) gains.push(v); };
    return {
      value: 1,
      setValueAtTime(v: number) { push(v); return this; }, linearRampToValueAtTime(v: number) { push(v); return this; },
      exponentialRampToValueAtTime(v: number) { push(v); return this; }, setTargetAtTime(v: number) { push(v); return this; },
      cancelScheduledValues() { return this; }, cancelAndHoldAtTime() { return this; },
    };
  };
  const node = (extra: Record<string, unknown> = {}) => ({
    connect(target: unknown) { return target; }, disconnect() { /* noop */ },
    start() { counts.started++; }, stop() { counts.stopped++; },
    frequency: param(false), Q: param(false), gain: param(false), detune: param(false), playbackRate: param(false),
    threshold: param(false), ratio: param(false), knee: param(false), attack: param(false), release: param(false),
    positionX: param(false), positionY: param(false), positionZ: param(false),
    ...extra,
  });
  const ctx = {
    state: 'running', currentTime: 0, sampleRate: 8000, destination: node(),
    listener: { positionX: param(false), positionY: param(false), positionZ: param(false), forwardX: param(false), forwardY: param(false), forwardZ: param(false), upX: param(false), upY: param(false), upZ: param(false) },
    createGain: () => node({ gain: param(true) }),
    createOscillator: () => node({ type: 'sine' }),
    createBiquadFilter: () => node({ type: 'lowpass' }),
    createBufferSource: () => node({ buffer: null, loop: false }),
    createDynamicsCompressor: () => node(),
    createStereoPanner: () => node({ pan: param(false) }),
    createPanner: () => { counts.panners++; return node({ panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 1, maxDistance: 100, rolloffFactor: 1 }); },
    createBuffer: (channels: number, length: number) => ({ length, numberOfChannels: channels, getChannelData: () => new Float32Array(length) }),
  };
  return { ctx: ctx as unknown as AudioContext, gains, counts };
}

const peakOf = (cue: CueId, volume = 0.6): number => {
  const f = fakeContext();
  const ambience = new Ambience(() => f.ctx, [], () => 0.5);
  ambience.play('nw:pipe-knock', { volume: 0 }); // initialise (room tone gains are not part of the cue)
  f.gains.length = 0;
  expect(ambience.play(cue, { volume, position: { x: -3, y: 1, z: -5 } }), cue).toBe(true);
  return Math.max(...f.gains);
};

describe('NW-007B Nurse and station cues', () => {
  it('registers every new cue id', () => {
    for (const cue of NEW_CUES) expect(CUE_IDS).toContain(cue);
  });

  it('synthesizes each cue through a positional panner and stops every source it starts', () => {
    for (const cue of NEW_CUES) {
      const f = fakeContext();
      const ambience = new Ambience(() => f.ctx, [], () => 0.5);
      ambience.play('nw:pipe-knock', { volume: 0 });
      const before = { ...f.counts };
      expect(ambience.play(cue, { volume: 0.6, position: { x: 1, y: 1, z: 1 } }), cue).toBe(true);
      expect(f.counts.panners - before.panners, cue).toBeGreaterThan(0);
      expect(f.counts.started - before.started, cue).toBeGreaterThan(0);
      ambience.stopAll();
      ambience.dispose?.();
    }
  });

  it('keeps every new cue well below the chase stinger (restrained levels)', () => {
    const stinger = peakOf('nw:chase-stinger');
    const peaks = Object.fromEntries(NEW_CUES.map((c) => [c, peakOf(c)]));
    for (const [cue, peak] of Object.entries(peaks)) expect(peak, cue).toBeLessThan(stinger * 0.6);
    // The capture accent stays under half the stinger; her heels are no louder than the existing
    // entity heel click (horror/audio/entityAudio.ts: 0.32 x volume).
    expect(peaks['nw:capture']).toBeLessThan(stinger * 0.5);
    expect(peaks['nw:shaw-steps']).toBeLessThanOrEqual(0.32 * 0.6 + 1e-9);
  });

  it('loops the station hum without gaps (each repeat overlaps the next)', () => {
    const f = fakeContext();
    const ambience = new Ambience(() => f.ctx, [], () => 0.5);
    ambience.play('nw:pipe-knock', { volume: 0 });
    ambience.loop('hum', 'nw:station-hum', { volume: 0.5, duration: 4, position: { x: -3, y: 1, z: -4 } });
    ambience.stopLoop('hum');
    expect(ambience.play('nw:station-hum', { duration: 4 })).toBe(true);
  });
});

// NW-007C integration: stop must cancel active tails, not just the repeat scheduler.
it('NW-007C: clears only the addressed cue including its active positional tails over five retries',()=>{
 const f=fakeContext(),a=new Ambience(()=>f.ctx,[],()=>.5);
 a.play('nw:pipe-knock');const baseline=a.diagnostics().voices;
 for(let i=0;i<5;i++){
  a.loop('hum','nw:station-hum',{position:{x:1,y:1,z:1}});
  a.play('nw:station-hum',{position:{x:1,y:1,z:1}});
  expect(a.diagnostics().loops).toEqual(['nw:station-hum']);
  const before=f.counts.stopped;a.stopCue('nw:station-hum');
  expect(f.counts.stopped).toBeGreaterThan(before);expect(a.diagnostics().voices).toBe(baseline);
  expect(a.diagnostics().loops).toEqual([]);
 }
 a.dispose();expect(a.diagnostics()).toEqual({voices:0,loops:[],cinematicVoices:[]});
});
it('NW-007C: a gait contact emits one heel instead of scheduling a second approaching footstep burst',()=>{
 const f=fakeContext(),a=new Ambience(()=>f.ctx,[],()=>.5);a.play('nw:pipe-knock');
 let before=f.counts.started;a.play('nw:shaw-step');const single=f.counts.started-before;
 before=f.counts.started;a.play('nw:shaw-steps');const burst=f.counts.started-before;
 expect(single).toBeGreaterThan(0);expect(single).toBeLessThan(burst);
 a.stopCue('nw:shaw-step');expect(a.diagnostics().cinematicVoices).not.toContain('nw:shaw-step');a.dispose();
});
