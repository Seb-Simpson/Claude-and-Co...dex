import type { AudioService } from '../../contracts';
import { audioOutput } from '../../audio/mixer';
import { createDialoguePlayer } from '../chapter/dialogue';
import type { DialogueCue, DialoguePlayback, DialogueSubtitle, DialogueVoice } from '../chapter/dialogue';

export type OpeningVoiceId = 'nw005.voice.shaw.return-to-bed' | 'nw005.voice.shaw.not-authorised';
export type OpeningSoundId = 'locked' | 'pickup' | 'denied' | 'accepted' | 'footsteps' | 'wake' | 'step' | 'capture' | 'call';

function temporary(id: OpeningVoiceId, text: string, durationSeconds: number, assetUrl: string): DialogueCue {
  return { id, speaker: 'Nurse Shaw · intercom', text, durationSeconds, assetUrl,
    recordingStatus: 'temporary', bus: 'sfx', segments: [{ startSeconds: 0, endSeconds: durationSeconds, text }] };
}

/** Replaceable synthetic timing stand-ins. These are explicitly NOT approved performances. */
export const OPENING_VOICES: Readonly<Record<OpeningVoiceId, DialogueCue>> = {
  'nw005.voice.shaw.return-to-bed': temporary('nw005.voice.shaw.return-to-bed',
    'Patient one-zero-four. Please return to your bed.', 3.48,
    new URL('./assets/audio/shaw-return-to-bed.temporary.wav', import.meta.url).href),
  'nw005.voice.shaw.not-authorised': temporary('nw005.voice.shaw.not-authorised',
    'Patient one-zero-four. You have not been authorised to leave.', 3.8300226757369615,
    new URL('./assets/audio/shaw-not-authorised.temporary.wav', import.meta.url).href),
};

export interface OpeningAudio {
  /** Milestones wait for queued speech, so saved one-shot flags describe heard cues. */
  readonly idle: boolean;
  /** Serial speech channel: a quick unlock cannot interrupt the first line. */
  queue(id: OpeningVoiceId): void;
  effect(id: OpeningSoundId,strength?:number): void;
  /** Called by the existing host loop only. Never creates timers/listeners/another AudioContext. */
  update(deltaSeconds: number): void;
  pause(): void;
  resume(): void;
  dispose(): void;
}

/** Shared-context speech voice with a band-limited intercom chain and native playback clock. */
function intercomVoice(context: AudioContext, buffer: AudioBuffer): DialogueVoice {
  const high = context.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 320;
  const low = context.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 3200;
  const gain = context.createGain(); gain.gain.value = 0.7;
  high.connect(low); low.connect(gain); gain.connect(audioOutput(context, 'sfx'));
  let source: AudioBufferSourceNode | null = null;
  let offset = 0;
  let startedAt = 0;
  let stopped = false;
  const clock = (): number => Math.min(buffer.duration, offset + (source ? Math.max(0, context.currentTime - startedAt) : 0));
  function detach(): void {
    const old = source; source = null;
    if (!old) return;
    old.onended = null;
    try { old.stop(); } finally { old.disconnect(); }
  }
  function start(): void {
    if (stopped || source || offset >= buffer.duration) return;
    if (context.state !== 'running') throw new Error('Intercom requires the shared audio context to be unlocked');
    const next = context.createBufferSource(); next.buffer = buffer;
    next.connect(high); source = next; startedAt = context.currentTime;
    next.onended = () => {
      if (source !== next) return;
      offset = buffer.duration; source = null; next.onended = null; next.disconnect();
    };
    try { next.start(0, offset); }
    catch (error) { source = null; next.onended = null; next.disconnect(); throw error; }
  }
  try { start(); }
  catch (error) { high.disconnect(); low.disconnect(); gain.disconnect(); throw error; }
  return {
    get timeSeconds() { return clock(); },
    pause() { if (source && !stopped) { offset = clock(); detach(); } },
    resume: start,
    stop() {
      if (stopped) return;
      offset = clock(); stopped = true;
      try { detach(); } finally { high.disconnect(); low.disconnect(); gain.disconnect(); }
    },
  };
}

/**
 * Fetches two tiny local recordings once during setup; decodes only after the user's existing
 * audio-unlock gesture. Voice and SFX share NIGHT WARD's settings-controlled SFX/master buses.
 */
export async function createOpeningAudio(
  audio: AudioService,
  subtitle: (line: DialogueSubtitle | null) => void,
): Promise<OpeningAudio> {
  const encoded = await Promise.all(Object.values(OPENING_VOICES).map(async cue => {
    const response = await fetch(cue.assetUrl!);
    if (!response.ok) throw new Error(`Opening temporary voice asset failed to load: ${cue.id} (${response.status})`);
    return [cue.id, await response.arrayBuffer()] as const;
  }));
  let disposed = false;
  let paused = false;
  let preparing = false;
  let prepared = false;
  let failed = false;
  let resumePending = false;
  let waitingSeconds = 0;
  let activeHasVoice = false;
  let active: DialoguePlayback | null = null;
  const pending: OpeningVoiceId[] = [];
  const requested = new Set<OpeningVoiceId>();
  const recordings = new Map<string, AudioBuffer>();
  const effects = new Set<() => void>();
  let noise: AudioBuffer | null = null;
  let latestSubtitle: DialogueSubtitle | null = null;
  const player = createDialoguePlayer({ mode: 'preview', subtitle(line) {
    latestSubtitle = line;
    subtitle(paused ? null : line);
  }, playVoice(cue) {
    const context = audio.context;
    const buffer = recordings.get(cue.id);
    if (!context || !buffer) throw new Error(`Opening voice unavailable: ${cue.id}`);
    return intercomVoice(context, buffer);
  } });

  function prepare(): void {
    const context = audio.context;
    if (disposed || preparing || prepared || !context || context.state !== 'running') return;
    preparing = true;
    void Promise.all(encoded.map(async ([id, bytes]) => {
      const buffer = await context.decodeAudioData(bytes.slice(0));
      if (Math.abs(buffer.duration - OPENING_VOICES[id as OpeningVoiceId].durationSeconds) > 0.01) {
        throw new Error(`Opening voice duration mismatch: ${id}`);
      }
      return [id, buffer] as const;
    })).then(results => {
      if (disposed) return;
      for (const [id, buffer] of results) recordings.set(id, buffer);
      prepared = true;
    }).catch((error: unknown) => {
      if (disposed) return;
      // A broken decoder must not softlock the door puzzle. This explicit subtitle-only preview
      // is a degraded path; the missing audio is reported rather than represented as final voice.
      console.error('NIGHT WARD opening voice preview unavailable:', error);
      failed = true; prepared = true;
    });
  }
  function pump(): void {
    if (disposed || paused) return;
    const running = audio.context?.state === 'running';
    if (resumePending) {
      // A subtitle-only preview has no native source to unlock. Preserve its clock even if
      // the shared audio context is still missing/suspended; a recorded voice waits to resume.
      if (active?.active && activeHasVoice && !running) return;
      resumePending = false; active?.resume();
    }
    if (active?.active) return;
    active = null;
    if (pending.length === 0) { waitingSeconds = 0; return; }
    const audible = prepared && !failed && running;
    // Audio unlock may be denied, or decoding may never settle. After one second of actual
    // host play time, continue this cue as explicitly unrecorded preview. Pause never spends
    // this grace period. If audio becomes available later, only a subsequent cue uses it.
    if (!audible && !failed && waitingSeconds < 1) return;
    const id = pending.shift()!;
    const cue = OPENING_VOICES[id];
    const { assetUrl: _assetUrl, ...unrecorded } = cue;
    waitingSeconds = 0; activeHasVoice = audible;
    active = player.play(audible ? cue : { ...unrecorded, recordingStatus: 'not-recorded' });
  }
  function stopEffects(): void { for (const stop of [...effects]) stop(); }

  function effect(id: OpeningSoundId,strength=1): void {
    const context = audio.context;
    if (disposed || (paused&&id!=='capture') || !context || context.state !== 'running') return;
    // Even very fast repeated reader use has a fixed bound on live voices/nodes.
    const now = context.currentTime;
    function tone(frequency: number, delay: number, duration: number, level: number, noisy = false): void {
      if (!context) return;
      while (effects.size >= 16) effects.values().next().value?.();
      const gain = context.createGain();
      const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = noisy ? 900 : 3500;
      let source: AudioScheduledSourceNode;
      if (noisy) {
        if (!noise) {
          noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.3), context.sampleRate);
          const data = noise.getChannelData(0);
          let seed = 104;
          for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; data[i] = (seed / 2147483648) * 0.8; }
        }
        const next = context.createBufferSource(); next.buffer = noise; next.loop = true; source = next;
      } else {
        const next = context.createOscillator(); next.type = 'sine'; next.frequency.value = frequency; source = next;
      }
      source.connect(filter); filter.connect(gain); gain.connect(audioOutput(context, 'sfx'));
      const start = now + delay;
      gain.gain.setValueAtTime(0, now);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(level*Math.min(1,Math.max(0,strength)), start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      let done = false;
      const stop = (): void => {
        if (done) return; done = true; effects.delete(stop); source.onended = null;
        try { source.stop(); } finally { source.disconnect(); filter.disconnect(); gain.disconnect(); }
      };
      source.onended = stop;
      effects.add(stop);
      try { source.start(start); source.stop(start + duration + 0.015); }
      catch (error) { stop(); throw error; }
    }
    if (id === 'locked') { tone(110, 0, 0.07, 0.055, true); tone(85, 0.14, 0.09, 0.045, true); }
    else if (id === 'pickup') tone(540, 0, 0.13, 0.025, true);
    else if (id === 'denied') { tone(175, 0, 0.12, 0.035); tone(145, 0.13, 0.12, 0.03); }
    else if (id === 'accepted') { tone(740, 0, 0.12, 0.035); tone(980, 0.14, 0.14, 0.03); tone(90, 0.3, 0.09, 0.045, true); }
    else if (id === 'footsteps') for (let i = 0; i < 4; i++) tone(75, i * 0.85, 0.16, 0.022 + i * 0.002, true);
    else if (id === 'step') tone(95,0,.11,.013,true);
    else if (id === 'call') {tone(630,0,.13,.014);tone(520,.18,.18,.010);}
    else if (id === 'capture') {tone(80,0,.42,.028,true);tone(65,.14,.5,.022);}
    else if (id === 'wake') { tone(560, 0.3, 0.09, 0.009); tone(560, 1.4, 0.09, 0.009); tone(90, 0, 2, 0.005, true); }
  }
  return {
    get idle() { return pending.length === 0 && !active?.active; },
    queue(id) {
      if (disposed || requested.has(id)) return;
      requested.add(id); pending.push(id); prepare(); pump();
    },
    effect,
    update(deltaSeconds) {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new Error('Opening audio delta must be finite and nonnegative');
      if (disposed || paused) return;
      if (pending.length > 0 && !active?.active) waitingSeconds = Math.min(1, waitingSeconds + deltaSeconds);
      prepare(); pump(); player.update(deltaSeconds); pump();
    },
    pause() {
      if (disposed || paused) return;
      paused = true; active?.pause(); stopEffects(); subtitle(null);
    },
    resume() {
      if (disposed || !paused) return;
      paused = false; resumePending = true;
      subtitle(latestSubtitle); prepare(); pump();
    },
    dispose() {
      if (disposed) return;
      disposed = true; pending.length = 0; requested.clear();
      try { player.dispose(); } finally { stopEffects(); recordings.clear(); noise = null; subtitle(null); }
    },
  };
}
