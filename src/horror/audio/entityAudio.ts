import type { Vector3 } from 'three';
import { envelope, filter, makePanner, noiseSource, placePanner, releaseLater } from '../../atmosphere/synth';
import type { VisualState } from '../entities/animator';
import type { BodiedEntityType } from '../entities/visual';
import { audioOutput } from '../../audio/mixer';

/** What the entity audio needs per entity each frame (all presentation-side measurements). */
export interface EntityAudioFrame {
  readonly id: string;
  readonly type: BodiedEntityType;
  /** Mouth/chest height world position. */
  readonly position: Vector3;
  readonly visualState: VisualState;
  readonly distance: number;
  /** A wall stands between listener and entity: muffle it. */
  readonly occluded: boolean;
  readonly observed: boolean;
}

export interface Listener { readonly position: Vector3; readonly forward: Vector3; readonly up: Vector3 }

interface Voice {
  readonly type: BodiedEntityType;
  readonly panner: PannerNode;
  readonly gain: GainNode;
  readonly occlusion: BiquadFilterNode;
  readonly sources: AudioScheduledSourceNode[];
  /** Breath / hum controls (type dependent). */
  readonly rate?: OscillatorNode;
  readonly rateDepth?: GainNode;
  readonly color?: BiquadFilterNode;
  readonly hum?: { readonly osc: OscillatorNode; readonly gain: GainNode; nextNote: number; note: number };
  nextClick: number;
}

const HUM = [349.2, 329.6, 293.7, 329.6, 261.6, 293.7, 246.9];

/**
 * Positional entity sound: the Patient's wet breathing and presence drone, the Nurse's heel
 * clicks, keys and humming (which stops dead when she starts listening), the Crawler's hand
 * plants and throat clicks, and the high whine that accompanies looking at the Watcher.
 * Driven entirely by presentation frames and footstep events; it never reads gameplay internals.
 */
export class EntityAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private duckGain: GainNode | null = null;
  private presence: { gain: GainNode; sources: AudioScheduledSourceNode[] } | null = null;
  private tinnitus: { gain: GainNode; sources: AudioScheduledSourceNode[] } | null = null;
  private readonly voices = new Map<string, Voice>();
  private disposed = false;

  constructor(private readonly getContext: () => AudioContext | null, private readonly random: () => number = Math.random) {}

  get ready(): boolean { return this.ctx !== null; }

  private init(): boolean {
    if (this.ctx) return true;
    if (this.disposed) return false;
    const ctx = this.getContext();
    if (!ctx || ctx.state !== 'running') return false;
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0.9;
    const duck = ctx.createGain();
    duck.gain.value = 1;
    master.connect(duck).connect(audioOutput(ctx, 'sfx'));
    this.master = master;
    this.duckGain = duck;
    // Patient presence: a low, beating drone that rises as it gets near.
    const pg = ctx.createGain();
    pg.gain.value = 0;
    const lp = filter(ctx, 'lowpass', 200, 0.7);
    const sources: AudioScheduledSourceNode[] = [];
    for (const f of [55, 55.8, 82.6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = f > 80 ? 0.25 : 0.5;
      o.connect(g).connect(lp);
      o.start();
      sources.push(o);
    }
    lp.connect(pg).connect(master);
    this.presence = { gain: pg, sources };
    // Watcher: a thin ringing that only exists while you look at it.
    const tg = ctx.createGain();
    tg.gain.value = 0;
    const tSources: AudioScheduledSourceNode[] = [];
    for (const f of [6900, 6937]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      o.connect(tg);
      o.start();
      tSources.push(o);
    }
    tg.connect(master);
    this.tinnitus = { gain: tg, sources: tSources };
    return true;
  }

  private createVoice(_id: string, type: BodiedEntityType): Voice | null {
    const ctx = this.ctx;
    if (!ctx || !this.master) return null;
    const panner = makePanner(ctx, type === 'crawler' ? 1.2 : 1.8, 1.25);
    const occlusion = filter(ctx, 'lowpass', 8000, 0.5);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(occlusion).connect(panner).connect(this.master);
    const sources: AudioScheduledSourceNode[] = [];
    if (type === 'patient' || type === 'crawler') {
      // Breathing: band-passed noise amplitude-modulated by a slow LFO.
      const noise = noiseSource(ctx, true);
      const color = filter(ctx, 'bandpass', type === 'patient' ? 520 : 1400, type === 'patient' ? 1.4 : 2.2);
      const am = ctx.createGain();
      am.gain.value = 0.5;
      const rate = ctx.createOscillator();
      rate.frequency.value = 0.3;
      const rateDepth = ctx.createGain();
      rateDepth.gain.value = 0.5;
      rate.connect(rateDepth).connect(am.gain);
      noise.connect(color).connect(am).connect(gain);
      noise.start(ctx.currentTime, this.random() * 1.5);
      rate.start();
      sources.push(noise, rate);
      if (type === 'patient') {
        const sub = ctx.createOscillator();
        sub.frequency.value = 43;
        const subGain = ctx.createGain();
        subGain.gain.value = 0.35;
        sub.connect(subGain).connect(gain);
        sub.start();
        sources.push(sub);
      }
      return { type, panner, gain, occlusion, sources, rate, rateDepth, color, nextClick: ctx.currentTime + 2 };
    }
    if (type === 'nurse') {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = HUM[0]!;
      const vibrato = ctx.createOscillator();
      vibrato.frequency.value = 5.2;
      const vibratoDepth = ctx.createGain();
      vibratoDepth.gain.value = 5;
      vibrato.connect(vibratoDepth).connect(osc.frequency);
      const humGain = ctx.createGain();
      humGain.gain.value = 0;
      osc.connect(filter(ctx, 'lowpass', 900, 0.7)).connect(humGain).connect(gain);
      osc.start();
      vibrato.start();
      sources.push(osc, vibrato);
      return { type, panner, gain, occlusion, sources, hum: { osc, gain: humGain, nextNote: ctx.currentTime + 1, note: 0 }, nextClick: Infinity };
    }
    return { type, panner, gain, occlusion, sources, nextClick: Infinity };
  }

  update(listener: Listener, frames: readonly EntityAudioFrame[]): void {
    if (!this.init() || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const l = ctx.listener;
    if (l.positionX) {
      l.positionX.value = listener.position.x; l.positionY.value = listener.position.y; l.positionZ.value = listener.position.z;
      l.forwardX.value = listener.forward.x; l.forwardY.value = listener.forward.y; l.forwardZ.value = listener.forward.z;
      l.upX.value = listener.up.x; l.upY.value = listener.up.y; l.upZ.value = listener.up.z;
    }
    const seen = new Set<string>();
    let nearestPatient = Infinity;
    let patientRunning = false;
    let watcherLevel = 0;
    for (const frame of frames) {
      seen.add(frame.id);
      let voice = this.voices.get(frame.id);
      if (!voice) {
        const created = this.createVoice(frame.id, frame.type);
        if (!created) continue;
        voice = created;
        this.voices.set(frame.id, voice);
      }
      placePanner(voice.panner, frame.position);
      voice.occlusion.frequency.setTargetAtTime(frame.occluded ? 700 : 8000, now, 0.25);
      const s = frame.visualState;
      if (frame.type === 'patient') {
        nearestPatient = Math.min(nearestPatient, frame.distance);
        patientRunning ||= s === 'run' || s === 'alert';
        const [rate, level, color] = s === 'run' ? [1.15, 0.5, 1100] : s === 'alert' ? [0.95, 0.42, 950] : s === 'walk' || s === 'search' || s === 'lost' ? [0.33, 0.24, 540] : [0.24, 0.17, 460];
        voice.rate?.frequency.setTargetAtTime(rate, now, 0.2);
        voice.color?.frequency.setTargetAtTime(color, now, 0.2);
        voice.gain.gain.setTargetAtTime(level, now, s === 'alert' ? 0.05 : 0.4);
      } else if (frame.type === 'crawler') {
        const running = s === 'run' || s === 'alert';
        voice.rate?.frequency.setTargetAtTime(running ? 2.4 : 0.5, now, 0.15);
        voice.gain.gain.setTargetAtTime(running ? 0.28 : 0.08, now, 0.3);
        if (now >= voice.nextClick && frame.distance < 18) {
          voice.nextClick = now + 2.5 + this.random() * 5;
          this.clickTrain(frame.position, frame.occluded, running ? 0.5 : 0.3);
        }
      } else if (frame.type === 'nurse' && voice.hum) {
        voice.gain.gain.setTargetAtTime(1, now, 0.3);
        const humming = s === 'idle' || s === 'walk';
        const hum = voice.hum;
        if (!humming) {
          // She stops humming the instant she starts listening.
          hum.gain.gain.setTargetAtTime(0, now, 0.03);
          hum.nextNote = now + 3;
        } else if (now >= hum.nextNote) {
          const phraseEnd = hum.note % HUM.length === HUM.length - 1;
          const freq = HUM[hum.note % HUM.length]!;
          hum.osc.frequency.setTargetAtTime(freq, now, 0.05);
          hum.gain.gain.setTargetAtTime(phraseEnd ? 0 : 0.05, now, 0.12);
          hum.note++;
          hum.nextNote = now + (phraseEnd ? 3 + this.random() * 4 : 0.55 + this.random() * 0.5);
        }
      } else if (frame.type === 'watcher' && frame.observed) {
        watcherLevel = Math.max(watcherLevel, Math.max(0, 1 - frame.distance / 16));
      }
    }
    for (const [id, voice] of this.voices) if (!seen.has(id)) { this.releaseVoice(voice); this.voices.delete(id); }
    if (this.presence) {
      const near = Number.isFinite(nearestPatient) ? Math.min(1, Math.max(0, (26 - nearestPatient) / 20)) : 0;
      this.presence.gain.gain.setTargetAtTime(near * near * (patientRunning ? 0.09 : 0.05), now, 0.6);
    }
    this.tinnitus?.gain.gain.setTargetAtTime(watcherLevel * 0.004, now, watcherLevel > 0 ? 1.5 : 0.4);
  }

  /** One contact event (footstep or hand plant) at a world position. */
  footstep(type: BodiedEntityType, bone: string, position: Vector3, state: VisualState, distance: number, occluded: boolean): void {
    if (!this.init() || !this.ctx || !this.master || distance > 40) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    const panner = makePanner(ctx, 1.5, 1.1);
    placePanner(panner, position);
    const lp = filter(ctx, 'lowpass', occluded ? 650 : 9000, 0.5);
    lp.connect(panner).connect(this.master);
    const hard = state === 'run' || state === 'alert';
    const burst = (f: BiquadFilterNode, peak: number, dur: number, at = t): void => {
      const src = noiseSource(ctx);
      const g = ctx.createGain();
      envelope(g, at, peak, 0.003, dur);
      src.connect(f).connect(g).connect(lp);
      src.start(at, this.random() * 1.5, dur + 0.05);
    };
    if (type === 'patient') {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(95, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      const g = ctx.createGain();
      envelope(g, t, hard ? 0.55 : 0.3, 0.004, 0.16);
      o.connect(g).connect(lp);
      o.start(t); o.stop(t + 0.25);
      burst(filter(ctx, 'lowpass', 750), hard ? 0.5 : 0.25, 0.07);
      if (bone === 'footL' && !hard) {
        // The bad leg drags before it lands.
        const src = noiseSource(ctx);
        const f = filter(ctx, 'bandpass', 1300, 2);
        f.frequency.linearRampToValueAtTime(700, t + 0.35);
        const dg = ctx.createGain();
        dg.gain.setValueAtTime(0.0001, t - 0.0);
        dg.gain.linearRampToValueAtTime(0.06, t + 0.08);
        dg.gain.linearRampToValueAtTime(0.0001, t + 0.38);
        src.connect(f).connect(dg).connect(lp);
        src.start(t, this.random(), 0.45);
      }
    } else if (type === 'nurse') {
      burst(filter(ctx, 'highpass', 2600), hard ? 0.5 : 0.32, 0.025);
      burst(filter(ctx, 'bandpass', 1750, 7), hard ? 0.4 : 0.28, 0.07);
      if (this.random() < 0.45) {
        for (let i = 0; i < 3; i++) {
          const o = ctx.createOscillator();
          o.frequency.value = 3100 + this.random() * 2600;
          const g = ctx.createGain();
          envelope(g, t + 0.04 + i * 0.03, 0.015, 0.002, 0.12);
          o.connect(g).connect(lp);
          o.start(t + 0.04 + i * 0.03); o.stop(t + 0.25 + i * 0.03);
        }
      }
    } else if (type === 'crawler') {
      burst(filter(ctx, 'bandpass', 850, 1.3), hard ? 0.38 : 0.22, 0.06);
      burst(filter(ctx, 'highpass', 4200), hard ? 0.2 : 0.12, 0.012, t + 0.02);
      if (this.random() < 0.15) this.clickTrain(position, occluded, 0.25);
    }
    releaseLater(lp, 0.6);
    releaseLater(panner, 0.6);
  }

  private clickTrain(position: Vector3, occluded: boolean, volume: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const panner = makePanner(ctx, 1.2, 1.2);
    placePanner(panner, position);
    const lp = filter(ctx, 'lowpass', occluded ? 700 : 9000, 0.5);
    lp.connect(panner).connect(this.master);
    const count = 5 + Math.floor(this.random() * 8);
    let at = ctx.currentTime + 0.01;
    for (let i = 0; i < count; i++) {
      const src = noiseSource(ctx);
      const g = ctx.createGain();
      envelope(g, at, volume * (0.6 + this.random() * 0.4), 0.001, 0.012);
      src.connect(filter(ctx, 'bandpass', 2200 + this.random() * 1200, 4)).connect(g).connect(lp);
      src.start(at, this.random(), 0.03);
      at += 0.028 + this.random() * 0.03;
    }
    releaseLater(lp, at - ctx.currentTime + 0.3);
    releaseLater(panner, at - ctx.currentTime + 0.3);
  }

  /** Scale all entity audio (1 = normal). Used for near-miss muffling and breath-holding. */
  duck(level: number, seconds: number): void {
    if (!this.ctx || !this.duckGain) return;
    const g = this.duckGain.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(level, now, 0.08);
    g.setTargetAtTime(1, now + seconds, 0.8);
  }

  private releaseVoice(voice: Voice): void {
    for (const s of voice.sources) { try { s.stop(); s.disconnect(); } catch { /* stopped */ } }
    if (voice.hum) { try { voice.hum.osc.stop(); } catch { /* stopped */ } }
    try { voice.gain.disconnect(); voice.panner.disconnect(); } catch { /* closed */ }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const voice of this.voices.values()) this.releaseVoice(voice);
    this.voices.clear();
    for (const s of [...(this.presence?.sources ?? []), ...(this.tinnitus?.sources ?? [])]) { try { s.stop(); } catch { /* stopped */ } }
    try { this.master?.disconnect(); this.duckGain?.disconnect(); } catch { /* closed */ }
    this.ctx = null;
  }
}
