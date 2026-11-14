import { type Settings, settings } from '../settings/settings';

/**
 * Volume buses for every AudioContext the game uses. Sound sources connect to
 * `audioOutput(context, 'music' | 'sfx' | 'voice')` instead of `context.destination`:
 *
 *   music ─ duck ─┐
 *   sfx   ─ duck ─┼─ master ─ destination
 *   voice ─ duck ─┘
 *
 * Bus gains follow the settings store live, with a short ramp so changes never click.
 */
export type AudioBus = 'music' | 'sfx' | 'voice';

/**
 * Buses connect straight to master. The voice bus and the duck stages are created on first use
 * (`audioOutput(context, 'voice')`, `duckBuses`), so contexts that never use them keep the
 * original three-node graph. When ducking starts, a duck gain is inserted between each bus and
 * master; settings only touch the volume gains and ducking only the duck gains.
 */
interface Mixer {
  master: GainNode; music: GainNode; sfx: GainNode; voice: GainNode | null;
  duck: Partial<Record<AudioBus, GainNode>> | null;
  ducks: Map<number, Partial<Record<AudioBus, number>>>;
}

const mixers = new Map<BaseAudioContext, Mixer>();

/** Perceptual curve: slider position -> gain (a squared law reads as linear loudness). */
export function volumeToGain(volume: number): number {
  const v = Math.min(1, Math.max(0, volume));
  return v * v;
}

function apply(context: BaseAudioContext, mixer: Mixer, value: Settings): void {
  const t = context.currentTime;
  const pairs: [GainNode, number][] = [[mixer.master, value.masterVolume], [mixer.music, value.musicVolume], [mixer.sfx, value.sfxVolume]];
  if (mixer.voice) pairs.push([mixer.voice, value.voiceVolume]);
  for (const [node, volume] of pairs) {
    node.gain.cancelScheduledValues(t);
    node.gain.setTargetAtTime(volumeToGain(volume), t, 0.03);
  }
}

function mixerFor(context: BaseAudioContext): Mixer {
  let mixer = mixers.get(context);
  if (mixer) return mixer;
  const master = context.createGain();
  const music = context.createGain();
  const sfx = context.createGain();
  const s = settings.get();
  master.gain.value = volumeToGain(s.masterVolume);
  music.gain.value = volumeToGain(s.musicVolume);
  sfx.gain.value = volumeToGain(s.sfxVolume);
  music.connect(master);
  sfx.connect(master);
  master.connect(context.destination);
  mixer = { master, music, sfx, voice: null, duck: null, ducks: new Map() };
  mixers.set(context, mixer);
  const onState = (): void => {
    if (context.state === 'closed') {
      mixers.delete(context);
      context.removeEventListener?.('statechange', onState);
    }
  };
  context.addEventListener?.('statechange', onState);
  return mixer;
}

function insertDuck(context: BaseAudioContext, mixer: Mixer, bus: AudioBus, node: GainNode): void {
  const duck = context.createGain();
  node.disconnect(mixer.master);
  node.connect(duck);
  duck.connect(mixer.master);
  mixer.duck![bus] = duck;
}
function voiceBus(context: BaseAudioContext, mixer: Mixer): GainNode {
  if (mixer.voice) return mixer.voice;
  const voice = context.createGain();
  voice.gain.value = volumeToGain(settings.get().voiceVolume);
  mixer.voice = voice;
  if (mixer.duck) {
    const duck = context.createGain();
    voice.connect(duck);
    duck.connect(mixer.master);
    mixer.duck.voice = duck;
  } else voice.connect(mixer.master);
  return voice;
}
function duckStages(context: BaseAudioContext, mixer: Mixer): Partial<Record<AudioBus, GainNode>> {
  if (mixer.duck) return mixer.duck;
  mixer.duck = {};
  insertDuck(context, mixer, 'music', mixer.music);
  insertDuck(context, mixer, 'sfx', mixer.sfx);
  if (mixer.voice) insertDuck(context, mixer, 'voice', mixer.voice);
  return mixer.duck;
}

/** The node a sound source should connect to (instead of `context.destination`). */
export function audioOutput(context: BaseAudioContext, bus: AudioBus): AudioNode {
  const mixer = mixerFor(context);
  return bus === 'voice' ? voiceBus(context, mixer) : mixer[bus];
}

let duckSequence = 0;
const dbToGain = (db: number): number => 10 ** (db / 20);
function applyDucks(context: BaseAudioContext, mixer: Mixer, seconds: number): void {
  const t = context.currentTime;
  const stages = duckStages(context, mixer);
  for (const bus of ['music', 'sfx', 'voice'] as const) {
    const stage = stages[bus];
    if (!stage) continue;
    let db = 0;
    for (const duck of mixer.ducks.values()) db = Math.min(db, duck[bus] ?? 0);
    const param = stage.gain;
    param.cancelScheduledValues(t);
    param.setTargetAtTime(dbToGain(db), t, Math.max(0.01, seconds / 3));
  }
}
/**
 * Lowers buses while something important plays (dialogue ducks music and effects). Several ducks
 * may overlap; the deepest wins per bus. Returns an idempotent release.
 */
export function duckBuses(context: BaseAudioContext, amounts: Partial<Record<AudioBus, number>>, options: { attack?: number; release?: number } = {}): () => void {
  const mixer = mixerFor(context);
  const id = ++duckSequence;
  mixer.ducks.set(id, { ...amounts });
  applyDucks(context, mixer, options.attack ?? 0.12);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (!mixer.ducks.delete(id) || context.state === 'closed') return;
    applyDucks(context, mixer, options.release ?? 0.6);
  };
}
/** For tests: the current duck target (dB) per bus. */
export function duckLevels(context: BaseAudioContext): Record<AudioBus, number> {
  const mixer = mixerFor(context);
  void duckStages;
  const out = { music: 0, sfx: 0, voice: 0 };
  for (const duck of mixer.ducks.values()) for (const bus of ['music', 'sfx', 'voice'] as const) out[bus] = Math.min(out[bus], duck[bus] ?? 0);
  return out;
}

settings.subscribe((value) => {
  for (const [context, mixer] of mixers) {
    if (context.state === 'closed') mixers.delete(context);
    else apply(context, mixer, value);
  }
});

/** For tests and diagnostics. */
export function mixerCount(): number { return mixers.size; }

const taps = new WeakMap<BaseAudioContext, AnalyserNode>();
/**
 * Diagnostics: the RMS level (0..1) leaving a context's master bus, after every volume setting.
 * Tests use it to prove that sound is actually playing and that the sliders change it.
 */
export function outputLevel(context: BaseAudioContext): number {
  let tap = taps.get(context);
  if (!tap) {
    tap = context.createAnalyser();
    tap.fftSize = 2048;
    mixerFor(context).master.connect(tap);
    taps.set(context, tap);
  }
  const data = new Float32Array(tap.fftSize);
  tap.getFloatTimeDomainData(data);
  let sum = 0;
  for (const v of data) sum += v * v;
  return Math.sqrt(sum / data.length);
}
