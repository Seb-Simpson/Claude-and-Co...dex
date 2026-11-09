import { audioOutput } from '../audio/mixer';

/**
 * Interface sound: a small synthesised set (nothing to download), on its own AudioContext so it
 * still plays while the game's context is suspended by the pause menu. It routes through the
 * mixer's effects bus, so the volume settings apply. The context is created on the first user
 * gesture (browsers block audio before one).
 */
export type UiCue = 'move' | 'select' | 'back' | 'open' | 'deny';

export interface UiSound {
  /** Call from a user gesture: creates/resumes the context. */
  unlock(): void;
  play(cue: UiCue): void;
  /** The interface AudioContext once a gesture has created it (the title-screen ambience shares it). */
  readonly context: AudioContext | null;
  dispose(): void;
}

export function createUiSound(): UiSound {
  let ctx: AudioContext | null = null;
  let lastMove = 0;
  const out = (): AudioNode | null => (ctx ? audioOutput(ctx, 'sfx') : null);

  function tone(freq: number, dur: number, type: OscillatorType, peak: number, glideTo?: number): void {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(out()!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }

  function click(level: number, hp: number): void {
    if (!ctx) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.03);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.18));
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = hp;
    const gain = ctx.createGain();
    gain.gain.value = level;
    src.connect(filter).connect(gain).connect(out()!);
    src.start(t);
    src.onended = () => { src.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  return {
    unlock() {
      try {
        if (!ctx) ctx = new AudioContext();
        if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
      } catch { ctx = null; /* no Web Audio: stay silent */ }
    },
    play(cue) {
      if (!ctx || ctx.state !== 'running') return;
      const now = performance.now();
      if (cue === 'move') {
        if (now - lastMove < 45) return;
        lastMove = now;
        click(0.05, 2400);
      } else if (cue === 'select') { tone(196, 0.32, 'sine', 0.12, 147); click(0.05, 900); }
      else if (cue === 'back') tone(147, 0.22, 'sine', 0.08, 110);
      else if (cue === 'open') tone(98, 0.6, 'triangle', 0.07, 92);
      else tone(110, 0.18, 'square', 0.025, 104);
    },
    get context() { return ctx; },
    dispose() {
      void ctx?.close().catch(() => undefined);
      ctx = null;
    },
  };
}
