import { type Settings, settings } from '../settings/settings';

/**
 * Volume buses for every AudioContext the game uses. Sound sources connect to
 * `audioOutput(context, 'music' | 'sfx')` instead of `context.destination`:
 *
 *   music ─┐
 *          ├─ master ─ destination
 *   sfx  ──┘
 *
 * Bus gains follow the settings store live, with a short ramp so changes never click.
 */
export type AudioBus = 'music' | 'sfx';

interface Mixer { master: GainNode; music: GainNode; sfx: GainNode }

const mixers = new Map<BaseAudioContext, Mixer>();

/** Perceptual curve: slider position -> gain (a squared law reads as linear loudness). */
export function volumeToGain(volume: number): number {
  const v = Math.min(1, Math.max(0, volume));
  return v * v;
}

function apply(context: BaseAudioContext, mixer: Mixer, value: Settings): void {
  const t = context.currentTime;
  for (const [node, volume] of [[mixer.master, value.masterVolume], [mixer.music, value.musicVolume], [mixer.sfx, value.sfxVolume]] as const) {
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
  mixer = { master, music, sfx };
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

/** The node a sound source should connect to (instead of `context.destination`). */
export function audioOutput(context: BaseAudioContext, bus: AudioBus): AudioNode {
  return mixerFor(context)[bus];
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
