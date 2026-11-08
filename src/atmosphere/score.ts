import type { EntityBehaviourState } from '../contracts';
import { envelope, filter, noiseSource } from './synth';

export type TensionLevel = 'calm' | 'uneasy' | 'search' | 'chase';

/**
 * Pure: derive musical tension from what gameplay has announced (entity:state + chase events).
 * Entity positions are not needed and never inferred.
 */
export function tensionFrom(states: Iterable<EntityBehaviourState>, activeChases: number): TensionLevel {
  if (activeChases > 0) return 'chase';
  let level: TensionLevel = 'calm';
  for (const s of states) {
    if (s === 'pursue') return 'chase';
    if (s === 'search' || s === 'lost-target') level = 'search';
    else if (s === 'investigate' && level === 'calm') level = 'uneasy';
  }
  return level;
}

const TARGETS: Record<TensionLevel, { drone: number; search: number; chase: number }> = {
  calm: { drone: 0, search: 0, chase: 0 },
  uneasy: { drone: 0.03, search: 0, chase: 0 },
  search: { drone: 0.045, search: 0.04, chase: 0 },
  chase: { drone: 0.05, search: 0, chase: 0.16 },
};

/**
 * Dynamic tension bed: a low beating drone, a sparse ticking search layer, and a pulsing chase
 * layer. `cut()` drops everything to nothing in a few milliseconds for the post-chase silence.
 */
export class TensionScore {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private layers: { drone: GainNode; search: GainNode; chase: GainNode; chaseFilter: BiquadFilterNode } | null = null;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private level: TensionLevel = 'calm';
  private nextPulse = 0;
  private nextTick = 0;
  private nextScrape = 0;
  private mutedUntil = 0;
  private disposed = false;

  constructor(private readonly getContext: () => AudioContext | null, private readonly random: () => number = Math.random) {}

  get current(): TensionLevel { return this.level; }

  private init(): boolean {
    if (this.ctx) return true;
    if (this.disposed) return false;
    const ctx = this.getContext();
    if (!ctx || ctx.state !== 'running') return false;
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    const mk = (): GainNode => { const g = ctx.createGain(); g.gain.value = 0; g.connect(master); return g; };
    const drone = mk();
    const search = mk();
    const chase = mk();
    // Drone: slow-beating low cluster.
    const lp = filter(ctx, 'lowpass', 260, 0.6);
    for (const f of [49, 51.9, 73.4]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.connect(lp);
      o.start();
      this.sources.push(o);
    }
    lp.connect(drone);
    // Search: a thin bowed-metal pair that beats against itself.
    for (const f of [1180, 1186.5]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.08;
      o.connect(g).connect(search);
      o.start();
      this.sources.push(o);
    }
    // Chase: rising sawtooth drone behind the pulses.
    const chaseFilter = filter(ctx, 'lowpass', 300, 1.5);
    for (const f of [55, 55.4, 110.3]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = f > 100 ? 0.12 : 0.22;
      o.connect(g).connect(chaseFilter);
      o.start();
      this.sources.push(o);
    }
    chaseFilter.connect(chase);
    this.master = master;
    this.layers = { drone, search, chase, chaseFilter };
    return true;
  }

  setLevel(level: TensionLevel): void {
    this.level = level;
  }

  /** Abrupt cut to silence; layers stay muted for `holdSeconds` even if tension remains. */
  cut(holdSeconds = 6): void {
    this.level = 'calm';
    if (!this.ctx || !this.layers) return;
    const now = this.ctx.currentTime;
    this.mutedUntil = now + holdSeconds;
    for (const g of [this.layers.drone, this.layers.search, this.layers.chase]) {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0, now + 0.03);
    }
  }

  update(): void {
    if (!this.init() || !this.ctx || !this.layers || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (now < this.mutedUntil) return;
    const target = TARGETS[this.level];
    const { drone, search, chase, chaseFilter } = this.layers;
    drone.gain.setTargetAtTime(target.drone, now, this.level === 'calm' ? 3 : 1.2);
    search.gain.setTargetAtTime(target.search * 0.15, now, 1.5);
    chase.gain.setTargetAtTime(target.chase * 0.35, now, 0.25);
    chaseFilter.frequency.setTargetAtTime(this.level === 'chase' ? 1400 : 300, now, 2);
    const lookahead = now + 0.15;
    if (this.level === 'chase') {
      while (this.nextPulse < lookahead) {
        if (this.nextPulse < now) this.nextPulse = now;
        this.thump(this.nextPulse, 0.4);
        this.thump(this.nextPulse + 0.17, 0.25);
        this.nextPulse += 0.46;
      }
      if (now >= this.nextScrape) {
        this.nextScrape = now + 1.5 + this.random() * 3;
        const src = noiseSource(ctx);
        const f = filter(ctx, 'bandpass', 2500 + this.random() * 1500, 9);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.05, now + 0.4);
        g.gain.linearRampToValueAtTime(0.0001, now + 0.9);
        src.connect(f).connect(g).connect(chase);
        src.start(now, this.random(), 1);
      }
    } else this.nextPulse = now;
    if (this.level === 'search' && now >= this.nextTick) {
      this.nextTick = now + 1.2 + this.random() * 2.4;
      const o = ctx.createOscillator();
      o.frequency.value = 1900 + this.random() * 400;
      const g = ctx.createGain();
      envelope(g, now, 0.03, 0.002, 0.05);
      o.connect(g).connect(this.master);
      o.start(now); o.stop(now + 0.1);
    }
  }

  private thump(at: number, peak: number): void {
    if (!this.ctx || !this.layers) return;
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(70, at);
    o.frequency.exponentialRampToValueAtTime(34, at + 0.14);
    const g = this.ctx.createGain();
    envelope(g, at, peak, 0.005, 0.18);
    o.connect(g).connect(this.layers.chase);
    o.start(at); o.stop(at + 0.3);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const s of this.sources) { try { s.stop(); s.disconnect(); } catch { /* closed */ } }
    try { this.master?.disconnect(); } catch { /* closed */ }
    this.ctx = null;
  }
}
