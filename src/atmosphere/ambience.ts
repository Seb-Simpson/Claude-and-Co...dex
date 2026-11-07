import type { Vector3 } from 'three';
import type { SoundEmitter } from '../world/extras';

/**
 * Procedural, restrained hospital soundscape built only from Web Audio nodes (no assets, no
 * network). Nothing is created until the shared AudioContext exists and is running, which only
 * happens after the user's explicit audio-unlock gesture.
 */
export type CueId =
  | 'nw:pipe-knock' | 'nw:distant-door' | 'nw:drip' | 'nw:trolley' | 'nw:lift-chime' | 'nw:lift-doors' | 'nw:metal-creak'
  | 'nw:settle' | 'nw:light-pop' | 'nw:static' | 'nw:curtain' | 'nw:vent-breath' | 'nw:monitor-beep' | 'nw:flatline'
  | 'nw:wheel-creak' | 'nw:brownout'
  | 'nw:chase-stinger' | 'nw:heartbeat' | 'nw:reveal' | 'nw:power-down' | 'nw:power-up' | 'nw:presence-out' | 'nw:distant-steps';

export const CUE_IDS: readonly CueId[] = [
  'nw:pipe-knock', 'nw:distant-door', 'nw:drip', 'nw:trolley', 'nw:lift-chime', 'nw:lift-doors', 'nw:metal-creak', 'nw:settle',
  'nw:light-pop', 'nw:static', 'nw:curtain', 'nw:vent-breath', 'nw:monitor-beep', 'nw:flatline', 'nw:wheel-creak', 'nw:brownout',
  'nw:chase-stinger', 'nw:heartbeat', 'nw:reveal', 'nw:power-down', 'nw:power-up', 'nw:presence-out', 'nw:distant-steps',
];

export interface PlayOptions {
  readonly position?: { x: number; y: number; z: number } | undefined;
  readonly volume?: number;
  readonly duration?: number;
}

interface Voice { readonly stop: () => void; readonly endsAt: number }

const EMITTER_CUES: Record<SoundEmitter['kind'], readonly CueId[]> = {
  pipes: ['nw:pipe-knock', 'nw:metal-creak', 'nw:pipe-knock'],
  stairwell: ['nw:distant-door', 'nw:settle', 'nw:metal-creak', 'nw:distant-steps'],
  lift: ['nw:metal-creak', 'nw:settle'],
  drip: [],
  vent: ['nw:vent-breath', 'nw:settle'],
  distant: ['nw:settle', 'nw:distant-door', 'nw:distant-steps'],
  trolley: ['nw:trolley', 'nw:wheel-creak'],
  door: ['nw:distant-door', 'nw:distant-steps'],
};

export class Ambience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private toneGain: GainNode | null = null;
  private buzz: { osc: OscillatorNode; gain: GainNode; panner: PannerNode } | null = null;
  private noise: AudioBuffer | null = null;
  private readonly persistent: AudioScheduledSourceNode[] = [];
  private readonly voices = new Set<Voice>();
  private readonly loops = new Map<string, { cue: CueId; options: PlayOptions; next: number }>();
  private readonly dripNext = new Map<string, number>();
  private nextEvent = 12;
  private silenceUntil = 0;
  private nextSilence = 55;
  private disposed = false;
  private failed = false;
  /** Seconds of quiet the scheduler must respect (e.g. after a scare). */
  private hushUntil = 0;

  constructor(
    private readonly getContext: () => AudioContext | null,
    private readonly emitters: readonly SoundEmitter[],
    private readonly random: () => number = Math.random,
  ) {}

  get ready(): boolean { return this.ctx !== null; }

  /** Keep the soundscape quiet for a while (moments of silence after big beats). */
  hush(seconds: number): void {
    if (!this.ctx) return;
    this.hushUntil = Math.max(this.hushUntil, this.ctx.currentTime + seconds);
  }

  private init(): boolean {
    if (this.ctx || this.disposed || this.failed) return this.ctx !== null;
    const ctx = this.getContext();
    if (!ctx || ctx.state !== 'running') return false;
    try {
      this.ctx = ctx;
      const master = ctx.createGain();
      master.gain.value = 0.75;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 3;
      master.connect(comp).connect(ctx.destination);
      this.master = master;
      this.noise = this.makeNoise(ctx, 4, 'brown');
      // Room tone: air handling rumble plus faint mains hum.
      const tone = ctx.createBufferSource();
      tone.buffer = this.noise;
      tone.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 260;
      const toneGain = ctx.createGain();
      toneGain.gain.value = 0;
      toneGain.gain.setTargetAtTime(0.11, ctx.currentTime, 2.5);
      tone.connect(lp).connect(toneGain).connect(master);
      const hum = ctx.createOscillator();
      hum.frequency.value = 50;
      const humGain = ctx.createGain();
      humGain.gain.value = 0.012;
      hum.connect(humGain).connect(toneGain);
      tone.start();
      hum.start();
      this.persistent.push(tone, hum);
      this.toneGain = toneGain;
      // Fluorescent buzz source, repositioned to the nearest misbehaving tube.
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 100;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2400;
      bp.Q.value = 2.5;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const panner = this.panner(ctx, 1.5);
      osc.connect(bp).connect(gain).connect(panner).connect(master);
      osc.start();
      this.persistent.push(osc);
      this.buzz = { osc, gain, panner };
      this.nextEvent = ctx.currentTime + 10 + this.random() * 10;
      this.nextSilence = ctx.currentTime + 45 + this.random() * 30;
      return true;
    } catch (error) {
      console.warn('NIGHT WARD ambience unavailable:', error);
      this.failed = true;
      this.ctx = null;
      return false;
    }
  }

  private makeNoise(ctx: AudioContext, seconds: number, color: 'white' | 'brown'): AudioBuffer {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      if (color === 'white') data[i] = white;
      else { last = (last + 0.02 * white) / 1.02; data[i] = last * 3.5; }
    }
    return buffer;
  }

  private panner(ctx: AudioContext, ref = 2): PannerNode {
    const p = ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = 1.1;
    p.maxDistance = 60;
    return p;
  }

  private setPos(p: PannerNode, v: { x: number; y: number; z: number }): void {
    if (p.positionX) {
      p.positionX.value = v.x; p.positionY.value = v.y; p.positionZ.value = v.z;
    } else {
      (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(v.x, v.y, v.z);
    }
  }

  /** Route a voice through a panner (positional) or straight to master. */
  private out(ctx: AudioContext, position: PlayOptions['position'], ref = 2): AudioNode {
    if (!position) return this.master!;
    const p = this.panner(ctx, ref);
    this.setPos(p, position);
    p.connect(this.master!);
    return p;
  }

  private noiseSource(ctx: AudioContext, loop = false): AudioBufferSourceNode {
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = loop;
    src.playbackRate.value = 1 + this.random() * 0.3;
    return src;
  }

  private track(stopFns: (() => void)[], endsAt: number): Voice {
    const voice: Voice = { stop: () => stopFns.forEach((s) => { try { s(); } catch { /* already stopped */ } }), endsAt };
    this.voices.add(voice);
    return voice;
  }

  /** Synthesize a cue. Returns false when audio is not yet available. */
  play(cue: CueId | string, options: PlayOptions = {}): boolean {
    if (!this.init() || !this.ctx || !this.master) return false;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    const vol = Math.max(0, Math.min(1, options.volume ?? 0.6));
    const out = this.out(ctx, options.position, cue === 'nw:drip' ? 1 : 2.5);
    const env = (g: GainNode, peak: number, attack: number, decay: number, at = t): void => {
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    };
    const stops: (() => void)[] = [];
    let end = t + 1;
    const osc = (type: OscillatorType, freq: number): OscillatorNode => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; stops.push(() => o.stop()); return o; };
    const filt = (type: BiquadFilterType, freq: number, q = 1): BiquadFilterNode => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; };
    const noiseBurst = (at: number, dur: number, f: BiquadFilterNode, peak: number): void => {
      const src = this.noiseSource(ctx);
      const g = ctx.createGain();
      env(g, peak, 0.004, dur, at);
      src.connect(f).connect(g).connect(out);
      src.start(at, this.random() * 2, dur + 0.1);
      stops.push(() => src.stop());
    };
    switch (cue) {
      case 'nw:pipe-knock': {
        const knocks = 2 + Math.floor(this.random() * 4);
        let at = t;
        for (let i = 0; i < knocks; i++) {
          noiseBurst(at, 0.12, filt('bandpass', 500 + this.random() * 500, 14), vol * 0.9);
          const o = osc('sine', 140 + this.random() * 60);
          const g = ctx.createGain();
          env(g, vol * 0.35, 0.003, 0.25, at);
          o.connect(g).connect(out);
          o.start(at); o.stop(at + 0.35);
          at += 0.12 + this.random() * 0.45;
        }
        end = at + 0.5;
        break;
      }
      case 'nw:distant-door': {
        const o = osc('sine', 70);
        o.frequency.setValueAtTime(70, t);
        o.frequency.exponentialRampToValueAtTime(38, t + 0.5);
        const g = ctx.createGain();
        env(g, vol * 0.8, 0.01, 0.7);
        o.connect(g).connect(out);
        o.start(t); o.stop(t + 0.9);
        noiseBurst(t, 0.5, filt('lowpass', 300), vol * 0.5);
        noiseBurst(t + 0.18 + this.random() * 0.1, 0.25, filt('lowpass', 220), vol * 0.2);
        end = t + 1.2;
        break;
      }
      case 'nw:drip': {
        const o = osc('sine', 1400 + this.random() * 900);
        o.frequency.exponentialRampToValueAtTime(500 + this.random() * 200, t + 0.06);
        const g = ctx.createGain();
        env(g, vol * 0.25, 0.002, 0.09);
        o.connect(g).connect(out);
        o.start(t); o.stop(t + 0.15);
        end = t + 0.2;
        break;
      }
      case 'nw:trolley':
      case 'nw:wheel-creak': {
        const dur = cue === 'nw:trolley' ? 2.6 + this.random() * 1.5 : 1.1;
        const o = osc('triangle', 820 + this.random() * 300);
        const lfo = osc('sine', cue === 'nw:trolley' ? 5.5 : 2.2);
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 90;
        lfo.connect(lfoGain).connect(o.frequency);
        const am = osc('sine', cue === 'nw:trolley' ? 3.1 : 1.3);
        const amGain = ctx.createGain();
        amGain.gain.value = 0.5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol * 0.12, t + 0.3);
        g.gain.linearRampToValueAtTime(vol * 0.1, t + dur - 0.4);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        const vca = ctx.createGain();
        vca.gain.value = 0.5;
        am.connect(amGain).connect(vca.gain);
        o.connect(filt('bandpass', 1100, 3)).connect(vca).connect(g).connect(out);
        [o, lfo, am].forEach((n) => { n.start(t); n.stop(t + dur + 0.1); });
        if (cue === 'nw:trolley') {
          const rumble = this.noiseSource(ctx, true);
          const rg = ctx.createGain();
          rg.gain.setValueAtTime(0.0001, t);
          rg.gain.linearRampToValueAtTime(vol * 0.25, t + 0.4);
          rg.gain.linearRampToValueAtTime(0.0001, t + dur);
          rumble.connect(filt('lowpass', 180)).connect(rg).connect(out);
          rumble.start(t); rumble.stop(t + dur + 0.1);
          stops.push(() => rumble.stop());
        }
        end = t + dur + 0.2;
        break;
      }
      case 'nw:lift-chime': {
        [[988, 0], [784, 0.55]].forEach(([f, dt]) => {
          const o = osc('sine', f!);
          const g = ctx.createGain();
          env(g, vol * 0.3, 0.01, 1.4, t + dt!);
          o.connect(g).connect(out);
          o.start(t + dt!); o.stop(t + dt! + 1.6);
        });
        end = t + 2.3;
        break;
      }
      case 'nw:lift-doors': {
        const dur = options.duration ?? 1.6;
        const src = this.noiseSource(ctx, true);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol * 0.18, t + 0.2);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        src.connect(filt('bandpass', 700, 1.5)).connect(g).connect(out);
        src.start(t); src.stop(t + dur + 0.1);
        stops.push(() => src.stop());
        const motor = osc('sawtooth', 58);
        const mg = ctx.createGain();
        mg.gain.setValueAtTime(0.0001, t);
        mg.gain.linearRampToValueAtTime(vol * 0.05, t + 0.3);
        mg.gain.linearRampToValueAtTime(0.0001, t + dur);
        motor.connect(filt('lowpass', 160)).connect(mg).connect(out);
        motor.start(t); motor.stop(t + dur + 0.1);
        noiseBurst(t + dur - 0.05, 0.12, filt('bandpass', 400, 4), vol * 0.4);
        end = t + dur + 0.3;
        break;
      }
      case 'nw:metal-creak': {
        const dur = 1.2 + this.random() * 1.2;
        const o = osc('sawtooth', 60 + this.random() * 40);
        o.frequency.linearRampToValueAtTime(90 + this.random() * 60, t + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol * 0.12, t + dur * 0.3);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(filt('bandpass', 380 + this.random() * 300, 9)).connect(g).connect(out);
        o.start(t); o.stop(t + dur + 0.1);
        end = t + dur + 0.2;
        break;
      }
      case 'nw:settle':
      case 'nw:vent-breath': {
        const dur = cue === 'nw:settle' ? 3 + this.random() * 2 : 4 + this.random() * 2;
        const src = this.noiseSource(ctx, true);
        const f = filt(cue === 'nw:settle' ? 'lowpass' : 'bandpass', cue === 'nw:settle' ? 90 : 420, cue === 'nw:settle' ? 1 : 0.8);
        f.frequency.linearRampToValueAtTime(cue === 'nw:settle' ? 160 : 650, t + dur * 0.5);
        f.frequency.linearRampToValueAtTime(cue === 'nw:settle' ? 70 : 380, t + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol * (cue === 'nw:settle' ? 0.6 : 0.16), t + dur * 0.45);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        src.connect(f).connect(g).connect(out);
        src.start(t); src.stop(t + dur + 0.1);
        stops.push(() => src.stop());
        end = t + dur + 0.2;
        break;
      }
      case 'nw:light-pop': {
        noiseBurst(t, 0.03, filt('highpass', 2500), vol * 0.7);
        const o = osc('sine', 3200);
        const g = ctx.createGain();
        env(g, vol * 0.08, 0.002, 0.4);
        o.connect(g).connect(out);
        o.start(t); o.stop(t + 0.5);
        end = t + 0.6;
        break;
      }
      case 'nw:static': {
        const dur = options.duration ?? 1.5;
        const src = this.noiseSource(ctx, true);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol * 0.14, t + 0.05);
        g.gain.setValueAtTime(vol * 0.14, t + dur - 0.1);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        src.connect(filt('bandpass', 3200, 0.6)).connect(g).connect(out);
        src.start(t); src.stop(t + dur + 0.1);
        stops.push(() => src.stop());
        end = t + dur + 0.1;
        break;
      }
      case 'nw:curtain': {
        const dur = 1.4 + this.random();
        const src = this.noiseSource(ctx, true);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol * 0.06, t + 0.3);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        src.connect(filt('highpass', 1800)).connect(g).connect(out);
        src.start(t); src.stop(t + dur + 0.1);
        stops.push(() => src.stop());
        end = t + dur + 0.1;
        break;
      }
      case 'nw:monitor-beep':
      case 'nw:flatline': {
        const dur = cue === 'nw:flatline' ? options.duration ?? 2.5 : 0.09;
        const o = osc('sine', cue === 'nw:flatline' ? 960 : 1180);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol * 0.06, t + 0.01);
        g.gain.setValueAtTime(vol * 0.06, t + dur - 0.02);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(out);
        o.start(t); o.stop(t + dur + 0.05);
        end = t + dur + 0.1;
        break;
      }
      case 'nw:chase-stinger': {
        const boom = osc('sine', 62);
        boom.frequency.exponentialRampToValueAtTime(28, t + 0.9);
        const bg = ctx.createGain();
        env(bg, vol * 0.9, 0.005, 1.4);
        boom.connect(bg).connect(out);
        boom.start(t); boom.stop(t + 1.6);
        noiseBurst(t, 0.6, filt('lowpass', 400), vol * 0.6);
        for (const f of [233, 247, 277, 311]) {
          const o = osc('sawtooth', f * (0.995 + this.random() * 0.01));
          const g = ctx.createGain();
          env(g, vol * 0.05, 0.01, 1.8);
          o.connect(filt('bandpass', 900, 1.5)).connect(g).connect(out);
          o.start(t); o.stop(t + 2);
        }
        end = t + 2.1;
        break;
      }
      case 'nw:heartbeat': {
        const beats = Math.max(1, Math.round(options.duration ?? 3));
        for (let i = 0; i < beats; i++) {
          for (const [dt, peak] of [[0, 1], [0.16, 0.7]] as const) {
            const at = t + i * 0.82 + dt;
            const o = osc('sine', 58);
            o.frequency.setValueAtTime(64, at);
            o.frequency.exponentialRampToValueAtTime(38, at + 0.12);
            const g = ctx.createGain();
            env(g, vol * 0.6 * peak, 0.008, 0.18, at);
            o.connect(g).connect(out);
            o.start(at); o.stop(at + 0.3);
          }
        }
        end = t + beats * 0.82 + 0.4;
        break;
      }
      case 'nw:reveal': {
        const dur = 3.2;
        const src = this.noiseSource(ctx, true);
        const f = filt('bandpass', 300, 2);
        f.frequency.exponentialRampToValueAtTime(1600, t + dur * 0.8);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol * 0.12, t + dur * 0.75);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        src.connect(f).connect(g).connect(out);
        src.start(t); src.stop(t + dur + 0.1);
        stops.push(() => src.stop());
        const ring = osc('sine', 5200);
        const rg = ctx.createGain();
        rg.gain.setValueAtTime(0.0001, t);
        rg.gain.linearRampToValueAtTime(vol * 0.006, t + 1.5);
        rg.gain.linearRampToValueAtTime(0.0001, t + dur + 1);
        ring.connect(rg).connect(out);
        ring.start(t); ring.stop(t + dur + 1.1);
        end = t + dur + 1.2;
        break;
      }
      case 'nw:power-down':
      case 'nw:power-up': {
        const down = cue === 'nw:power-down';
        const dur = down ? 1.3 : 0.7;
        const o = osc('sawtooth', down ? 120 : 40);
        o.frequency.exponentialRampToValueAtTime(down ? 28 : 120, t + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol * 0.12, t);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(filt('lowpass', 500)).connect(g).connect(out);
        o.start(t); o.stop(t + dur + 0.05);
        noiseBurst(t + (down ? 0 : dur), 0.08, filt('bandpass', 300, 3), vol * 0.7);
        end = t + dur + 0.2;
        break;
      }
      case 'nw:presence-out': {
        const src = this.noiseSource(ctx, true);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol * 0.15, t + 0.9);
        g.gain.setValueAtTime(0.0001, t + 0.92);
        src.connect(filt('lowpass', 900)).connect(g).connect(out);
        src.start(t); src.stop(t + 1);
        stops.push(() => src.stop());
        end = t + 1.1;
        break;
      }
      case 'nw:distant-steps': {
        const count = 4 + Math.floor(this.random() * 6);
        const pace = 0.55 + this.random() * 0.3;
        for (let i = 0; i < count; i++) {
          const at = t + i * pace * (0.92 + this.random() * 0.16);
          const o = osc('sine', 80);
          o.frequency.exponentialRampToValueAtTime(40, at + 0.1);
          const g = ctx.createGain();
          env(g, vol * 0.22 * (1 - i / (count * 1.6)), 0.004, 0.12, at);
          o.connect(g).connect(out);
          o.start(at); o.stop(at + 0.2);
          noiseBurst(at, 0.05, filt('lowpass', 500), vol * 0.12);
        }
        end = t + count * pace + 0.4;
        break;
      }
      case 'nw:brownout': {
        if (this.toneGain) {
          const g = this.toneGain.gain;
          g.cancelScheduledValues(t);
          g.setTargetAtTime(0.03, t, 0.15);
          g.setTargetAtTime(0.11, t + (options.duration ?? 3), 0.8);
        }
        end = t;
        break;
      }
      default:
        if (out !== this.master) out.disconnect();
        return false;
    }
    this.track(stops, end);
    if (out !== this.master) setTimeout(() => { try { out.disconnect(); } catch { /* closed */ } }, Math.max(0, (end - ctx.currentTime) * 1000 + 300));
    return true;
  }

  /**
   * Abrupt silence: room tone, buzz and ambient events cut out at once, then the building
   * slowly comes back. Used after a chase ends, when the quiet is the scare.
   */
  silence(seconds: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.silenceUntil = Math.max(this.silenceUntil, now + seconds);
    this.hushUntil = Math.max(this.hushUntil, now + seconds + 4);
    for (const v of this.voices) v.stop();
    this.voices.clear();
    if (this.toneGain) {
      const g = this.toneGain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(0.0001, now + 0.02);
      g.setTargetAtTime(0.11, now + seconds, 3);
    }
    this.buzz?.gain.gain.setValueAtTime(0, now + 0.02);
  }

  /** Temporarily scale the whole ambience (near-miss muffling). */
  duck(level: number, seconds: number): void {
    if (!this.ctx || !this.master) return;
    const g = this.master.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(0.75 * level, now, 0.1);
    g.setTargetAtTime(0.75, now + seconds, 1);
  }

  /** Repeat a cue until stopped (used by `atmosphere:sound` events with loop: true). */
  loop(key: string, cue: CueId | string, options: PlayOptions): void {
    this.loops.set(key, { cue: cue as CueId, options, next: 0 });
  }

  stopLoop(key: string): void { this.loops.delete(key); }

  stopAll(): void {
    for (const v of this.voices) v.stop();
    this.voices.clear();
    this.loops.clear();
  }

  update(listener: { position: Vector3; forward: Vector3; up: Vector3 }, buzzSource: { position: Vector3; brightness: number; flickering: boolean } | null): void {
    if (!this.init() || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const l = ctx.listener;
    if (l.positionX) {
      l.positionX.value = listener.position.x; l.positionY.value = listener.position.y; l.positionZ.value = listener.position.z;
      l.forwardX.value = listener.forward.x; l.forwardY.value = listener.forward.y; l.forwardZ.value = listener.forward.z;
      l.upX.value = listener.up.x; l.upY.value = listener.up.y; l.upZ.value = listener.up.z;
    } else {
      const legacy = l as unknown as { setPosition(x: number, y: number, z: number): void; setOrientation(a: number, b: number, c: number, d: number, e: number, f: number): void };
      legacy.setPosition(listener.position.x, listener.position.y, listener.position.z);
      legacy.setOrientation(listener.forward.x, listener.forward.y, listener.forward.z, listener.up.x, listener.up.y, listener.up.z);
    }
    for (const v of this.voices) if (v.endsAt < now - 1) this.voices.delete(v);

    // Fluorescent buzz follows the nearest misbehaving tube; crackles when it misfires.
    if (this.buzz) {
      const target = buzzSource && now >= this.silenceUntil ? (buzzSource.flickering ? 0.05 : 0.025) * Math.min(1, buzzSource.brightness) : 0;
      this.buzz.gain.gain.setTargetAtTime(target, now, buzzSource?.flickering ? 0.01 : 0.2);
      if (buzzSource) this.setPos(this.buzz.panner, buzzSource.position);
    }

    // HVAC cycles off now and then: genuine silence, then a slow return.
    if (this.toneGain && now >= this.nextSilence && now >= this.silenceUntil) {
      const hold = 8 + this.random() * 12;
      const g = this.toneGain.gain;
      g.cancelScheduledValues(now);
      g.setTargetAtTime(0.0001, now, 0.6);
      g.setTargetAtTime(0.11, now + hold, 2.5);
      this.silenceUntil = now + hold + 3;
      this.nextSilence = this.silenceUntil + 50 + this.random() * 60;
    }

    const quiet = now < this.silenceUntil || now < this.hushUntil;
    if (!quiet && now >= this.nextEvent) {
      this.nextEvent = now + 16 + this.random() * 30;
      const candidates = this.emitters.filter((e) => {
        if (EMITTER_CUES[e.kind].length === 0) return false;
        const d = e.position.distanceTo(listener.position);
        return d > 5 && d < 32;
      });
      if (candidates.length > 0) {
        const e = candidates[Math.floor(this.random() * candidates.length)]!;
        const cues = EMITTER_CUES[e.kind];
        const cue = cues[Math.floor(this.random() * cues.length)]!;
        this.play(cue, { position: e.position, volume: 0.35 + this.random() * 0.35 });
      }
    }

    // Drips near the listener, irregular.
    if (!quiet) {
      for (const e of this.emitters) {
        if (e.kind !== 'drip') continue;
        if (e.position.distanceTo(listener.position) > 13) continue;
        const next = this.dripNext.get(e.id) ?? 0;
        if (now < next) continue;
        this.dripNext.set(e.id, now + 1.2 + this.random() * 3.6 + (this.random() < 0.1 ? 6 : 0));
        this.play('nw:drip', { position: e.position, volume: 0.45 + this.random() * 0.3 });
      }
    }

    for (const [, entry] of this.loops) {
      if (now < entry.next) continue;
      entry.next = now + Math.max(0.5, entry.options.duration ?? 2);
      this.play(entry.cue, entry.options);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopAll();
    for (const source of this.persistent) {
      try { source.stop(); source.disconnect(); } catch { /* context already closed */ }
    }
    this.persistent.length = 0;
    try { this.master?.disconnect(); } catch { /* context already closed */ }
    this.buzz = null;
    this.master = null;
    this.toneGain = null;
    this.ctx = null;
  }
}
