import { audioOutput } from '../audio/mixer';
import bedM4a from './media/audio/bed.m4a?url';
import bedWebm from './media/audio/bed.webm?url';
import doorM4a from './media/audio/door.m4a?url';
import doorWebm from './media/audio/door.webm?url';
import metal1M4a from './media/audio/metal_1.m4a?url';
import metal1Webm from './media/audio/metal_1.webm?url';
import metal2M4a from './media/audio/metal_2.m4a?url';
import metal2Webm from './media/audio/metal_2.webm?url';
import metal3M4a from './media/audio/metal_3.m4a?url';
import metal3Webm from './media/audio/metal_3.webm?url';
import motifM4a from './media/audio/motif.m4a?url';
import motifWebm from './media/audio/motif.webm?url';
import motifLowM4a from './media/audio/motif_low.m4a?url';
import motifLowWebm from './media/audio/motif_low.webm?url';
import presenceM4a from './media/audio/presence.m4a?url';
import presenceWebm from './media/audio/presence.webm?url';
import type { CorridorEvent, LightState } from './menu/director';

/**
 * The title screen's sound: an original ambience (src/frontend/media/pipeline/make_menu_audio.py)
 * played over the corridor and tied to what its lights do.
 *
 *   music bus   the 48 s ambience bed (sub drone, bowed cluster, ventilation, mains hum, in a long
 *               corridor reverb), the NIGHT WARD motif, the swell when the figure appears
 *   sfx bus     distant metal and a far door at irregular times, the crackle of every tube
 *               failure, and a ballast buzz whose level follows the hanging tube's light
 *
 * Browsers only allow sound after a user gesture: nothing plays (and nothing is downloaded) until
 * the first click or key press, or the "Enable sound" control. The player can mute it; that choice
 * is remembered. Everything stops and the decoded audio is released when the title screen hides.
 */
export type MenuAudioState = 'locked' | 'loading' | 'playing' | 'muted' | 'stopped' | 'unavailable';

export interface MenuAudio {
  readonly state: MenuAudioState;
  readonly muted: boolean;
  /** From a user gesture (or once the context is running): download and start the ambience. */
  enable(context: AudioContext | null): Promise<void>;
  setMuted(muted: boolean): void;
  /** The title screen is showing. */
  start(): void;
  /** The title screen hid: fade out, stop everything, release buffers. */
  stop(): void;
  /** Corridor events (crackle, presence, door). */
  handle(event: CorridorEvent): void;
  /** Per-frame light state: the ballast buzz follows the hanging tube. */
  setLight(state: LightState): void;
  onChange(listener: () => void): () => void;
  readonly debug: { readonly played: readonly string[]; readonly voices: number; readonly buffers: number; readonly bedPlaying: boolean };
  dispose(): void;
}

type Sound = 'bed' | 'metal_1' | 'metal_2' | 'metal_3' | 'door' | 'motif' | 'motif_low' | 'presence';
const FILES: Record<Sound, [string, string]> = {
  bed: [bedWebm, bedM4a], metal_1: [metal1Webm, metal1M4a], metal_2: [metal2Webm, metal2M4a], metal_3: [metal3Webm, metal3M4a],
  door: [doorWebm, doorM4a], motif: [motifWebm, motifM4a], motif_low: [motifLowWebm, motifLowM4a], presence: [presenceWebm, presenceM4a],
};
const MUTE_KEY = 'night-ward:menu-sound-muted';
const LOOP_START = 1;
const LOOP_END = 49;

function readMuted(): boolean {
  try { return globalThis.localStorage?.getItem(MUTE_KEY) === '1'; } catch { return false; }
}
function writeMuted(value: boolean): void {
  try { globalThis.localStorage?.setItem(MUTE_KEY, value ? '1' : '0'); } catch { /* storage unavailable: session only */ }
}
function preferOpus(): boolean {
  try { return typeof Audio === 'function' && new Audio().canPlayType('audio/webm; codecs="opus"') !== ''; } catch { return false; }
}

export function createMenuAudio(random: () => number = Math.random): MenuAudio {
  let ctx: AudioContext | null = null;
  let muted = readMuted();
  let state: MenuAudioState = muted ? 'muted' : 'locked';
  let showing = false;
  let generation = 0;
  const buffers = new Map<Sound, AudioBuffer>();
  const loading = new Map<Sound, Promise<AudioBuffer | null>>();
  let menuGain: GainNode | null = null; // music-side master for the title screen (mute + fades)
  let sfxGain: GainNode | null = null; // sfx-side master
  let bed: AudioBufferSourceNode | null = null;
  let buzz: { osc: OscillatorNode[]; gain: GainNode; filter: BiquadFilterNode } | null = null;
  let noise: AudioBuffer | null = null;
  const voices = new Set<AudioScheduledSourceNode>();
  const timers = new Set<number>();
  const played: string[] = [];
  const listeners = new Set<() => void>();
  let lastCrackle = 0;
  let motifCount = 0;

  const setState = (next: MenuAudioState): void => { if (state !== next) { state = next; for (const l of listeners) l(); } };
  const r = (lo: number, hi: number): number => lo + (hi - lo) * random();
  const later = (seconds: number, fn: () => void): void => {
    const id = window.setTimeout(() => { timers.delete(id); fn(); }, seconds * 1000);
    timers.add(id);
  };

  function load(name: Sound): Promise<AudioBuffer | null> {
    const have = buffers.get(name);
    if (have) return Promise.resolve(have);
    const pending = loading.get(name);
    if (pending) return pending;
    const mine = generation;
    const url = FILES[name][preferOpus() ? 0 : 1];
    const p = fetch(url)
      .then((res) => { if (!res.ok) throw new Error(`${res.status}`); return res.arrayBuffer(); })
      .then((data) => ctx!.decodeAudioData(data))
      .then((buffer) => { if (mine === generation) buffers.set(name, buffer); return buffer; })
      .catch(() => null)
      .finally(() => loading.delete(name));
    loading.set(name, p);
    return p;
  }

  function graph(): void {
    if (!ctx || menuGain) return;
    menuGain = ctx.createGain();
    menuGain.gain.value = 0;
    menuGain.connect(audioOutput(ctx, 'music'));
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0;
    sfxGain.connect(audioOutput(ctx, 'sfx'));
    // One second of noise, reused for every crackle.
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // Ballast buzz: 100 Hz (mains x2) rich in harmonics, band-limited; its level follows the light.
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 1.4;
    const osc = [100, 200.6].map((f, i) => {
      const o = ctx!.createOscillator();
      o.type = i === 0 ? 'sawtooth' : 'square';
      o.frequency.value = f;
      const g = ctx!.createGain();
      g.gain.value = i === 0 ? 1 : 0.25;
      o.connect(g).connect(filter);
      o.start();
      return o;
    });
    filter.connect(gain).connect(sfxGain);
    buzz = { osc, gain, filter };
  }

  function fade(to: number, seconds: number): void {
    if (!ctx || !menuGain || !sfxGain) return;
    const t = ctx.currentTime;
    for (const g of [menuGain, sfxGain]) {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(to, t + seconds);
    }
  }

  function voice(name: Sound, bus: 'music' | 'sfx', level: number, pan = 0, delay = 0): void {
    const buffer = buffers.get(name);
    const out = bus === 'music' ? menuGain : sfxGain;
    if (!ctx || !buffer || !out) { void load(name); return; }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = level;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(g).connect(p).connect(out);
    src.onended = () => { voices.delete(src); src.disconnect(); g.disconnect(); p.disconnect(); };
    voices.add(src);
    src.start(ctx.currentTime + delay);
    played.push(name);
    if (played.length > 100) played.shift();
  }

  function crackle(intensity: number, seconds: number, centre = 2600): void {
    if (!ctx || !noise || !sfxGain || muted) return;
    const now = ctx.currentTime;
    if (now - lastCrackle < 0.03) return;
    lastCrackle = now;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = centre * r(0.8, 1.25);
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    // Crackle: a few sharp pops inside a short burst.
    g.gain.setValueAtTime(0, now);
    const pops = 2 + Math.floor(intensity * 5);
    for (let i = 0; i < pops; i++) {
      const at = now + (i / pops) * seconds * r(0.7, 1);
      g.gain.setValueAtTime(0.32 * intensity * r(0.4, 1), at);
      g.gain.setTargetAtTime(0.02 * intensity, at + 0.004, 0.006);
    }
    g.gain.setTargetAtTime(0, now + seconds, 0.02);
    src.connect(bp).connect(g).connect(sfxGain);
    src.onended = () => { voices.delete(src); src.disconnect(); bp.disconnect(); g.disconnect(); };
    voices.add(src);
    src.start(now, r(0, 0.8), seconds + 0.15);
  }

  function thump(level: number): void {
    if (!ctx || !sfxGain) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(70, now);
    o.frequency.exponentialRampToValueAtTime(38, now + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    o.connect(g).connect(sfxGain);
    o.onended = () => { voices.delete(o); o.disconnect(); g.disconnect(); };
    voices.add(o);
    o.start(now);
    o.stop(now + 0.65);
  }

  // Irregular distant sounds and the motif: never on a fixed cycle.
  function scheduleMetal(): void {
    later(r(9, 26), () => {
      if (state !== 'playing') return;
      const n = (['metal_1', 'metal_2', 'metal_3'] as const)[Math.floor(r(0, 3))]!;
      voice(n, 'sfx', r(0.35, 0.7), r(-0.8, 0.8));
      scheduleMetal();
    });
  }
  function scheduleMotif(first: boolean): void {
    later(first ? r(5, 9) : r(55, 110), () => {
      if (state !== 'playing') return;
      voice(motifCount % 3 === 2 ? 'motif_low' : 'motif', 'music', motifCount === 0 ? 0.5 : r(0.32, 0.48), r(-0.25, 0.25));
      motifCount++;
      scheduleMotif(false);
    });
  }

  async function begin(): Promise<void> {
    if (!ctx || !showing || muted) return;
    if (state === 'playing' || state === 'loading') return;
    const mine = generation;
    setState('loading');
    graph();
    const buffer = await load('bed');
    if (mine !== generation || !ctx || !showing || muted) { setState(muted ? 'muted' : 'stopped'); return; }
    if (!buffer) { setState('unavailable'); return; }
    bed = ctx.createBufferSource();
    bed.buffer = buffer;
    bed.loop = true;
    bed.loopStart = Math.min(LOOP_START, buffer.duration / 2);
    bed.loopEnd = Math.min(LOOP_END, buffer.duration);
    bed.connect(menuGain!);
    bed.start(ctx.currentTime, LOOP_START);
    fade(1, 3.5);
    setState('playing');
    // Fetch the rest in the background; schedule them once present.
    for (const n of ['motif', 'metal_1', 'metal_2', 'metal_3', 'door', 'presence', 'motif_low'] as const) void load(n);
    motifCount = 0;
    scheduleMotif(true);
    scheduleMetal();
  }

  function halt(release: boolean): void {
    generation++;
    for (const id of timers) window.clearTimeout(id);
    timers.clear();
    const t = ctx?.currentTime ?? 0;
    if (ctx && menuGain && sfxGain) fade(0, 0.6);
    const endAt = t + 0.7;
    const oldBed = bed;
    bed = null;
    try { oldBed?.stop(endAt); } catch { /* already stopped */ }
    for (const v of voices) { try { v.stop(endAt); } catch { /* ended */ } }
    voices.clear();
    if (release) {
      const old = { menuGain, sfxGain, buzz };
      menuGain = null; sfxGain = null; buzz = null; noise = null;
      window.setTimeout(() => {
        for (const o of old.buzz?.osc ?? []) { try { o.stop(); } catch { /* */ } o.disconnect(); }
        old.buzz?.filter.disconnect(); old.buzz?.gain.disconnect();
        old.menuGain?.disconnect(); old.sfxGain?.disconnect();
        oldBed?.disconnect();
      }, 800);
      buffers.clear();
      loading.clear();
    }
  }

  const api: MenuAudio = {
    get state() { return state; },
    get muted() { return muted; },
    async enable(context) {
      if (!context) { setState('unavailable'); return; }
      ctx = context;
      if (ctx.state === 'suspended') { try { await ctx.resume(); } catch { /* resumes on the next gesture */ } }
      if (muted) { setState('muted'); return; }
      await begin();
    },
    setMuted(value) {
      muted = value;
      writeMuted(value);
      if (value) { halt(false); setState('muted'); }
      else if (ctx) { setState('stopped'); void begin(); }
      else setState('locked');
      for (const l of listeners) l();
    },
    start() {
      showing = true;
      if (ctx && !muted) void begin();
      else if (muted && ctx) setState('muted');
    },
    stop() {
      showing = false;
      halt(true);
      setState(muted ? 'muted' : ctx ? 'stopped' : 'locked');
    },
    handle(event) {
      if (state !== 'playing') return;
      switch (event.type) {
        case 'drop': crackle(0.5 + 0.5 * event.intensity, 0.05 + 0.12 * event.intensity); break;
        case 'buzz': crackle(0.35 * event.intensity, 0.04, 3600); break;
        case 'return': crackle(0.3 + 0.4 * event.intensity, 0.04, 4200); break;
        case 'blackout': crackle(1, 0.22, 1800); thump(0.25); break;
        case 'figure-in': voice('presence', 'music', 0.75, 0.15); break;
        case 'door': voice('door', 'sfx', r(0.5, 0.8), r(-0.9, 0.9)); break;
        case 'exit-pulse': crackle(0.15, 0.03, 5200); break;
        default: break;
      }
    },
    setLight(s) {
      if (!ctx || !buzz || state !== 'playing') return;
      buzz.gain.gain.setTargetAtTime(0.022 * Math.min(1, s.main) * (0.7 + 0.3 * Math.min(1, s.far)), ctx.currentTime, 0.015);
    },
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    get debug() { return { played, voices: voices.size, buffers: buffers.size, bedPlaying: !!bed }; },
    dispose() { showing = false; halt(true); listeners.clear(); },
  };
  return api;
}
