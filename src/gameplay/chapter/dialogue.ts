import { audioOutput } from '../../audio/mixer';
import type { AudioBus } from '../../audio/mixer';
import type { ChapterVoiceCueId } from './bindings';

/** Recording approval is production metadata, never inferred from the presence of subtitles. */
export type RecordingStatus = 'not-recorded' | 'temporary' | 'recorded' | 'approved';
export interface DialogueSegment {
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly text: string;
}
export interface DialogueCue {
  readonly id: string;
  readonly speaker: string;
  readonly text: string;
  readonly durationSeconds: number;
  readonly segments: readonly DialogueSegment[];
  readonly recordingStatus: RecordingStatus;
  readonly assetUrl?: string;
  /** The voice adapter must connect to audioOutput(context, bus), never destination directly. */
  readonly bus: AudioBus;
}
export interface DialogueSubtitle {
  readonly cueId: string;
  readonly speaker: string;
  readonly text: string;
}
/** A handle owns only this voice. stop() must be idempotent and release ducking/source nodes. */
export interface DialogueVoice {
  /** Monotonic source-relative playhead. Native audio adapters should supply this clock. */
  readonly timeSeconds?: number;
  pause(): void;
  resume(): void;
  stop(): void;
}
export interface DialoguePlayerOptions {
  readonly mode: 'production' | 'preview';
  readonly subtitle: (line: DialogueSubtitle | null) => void;
  readonly playVoice?: (cue: DialogueCue) => DialogueVoice;
  /** Optional scoped ducking. Released on completion, interruption and playback failure. */
  readonly duck?: (cue: DialogueCue) => (() => void);
  readonly onPreview?: (cue: DialogueCue) => void;
}
export interface DialogueResult {
  readonly id: string;
  readonly outcome: 'completed' | 'interrupted';
  readonly reason?: string;
}
export interface DialoguePlayback {
  readonly id: string;
  readonly elapsedSeconds: number;
  /** Finite, monotonic audio-clock hint, or null for preview/clockless adapters. */
  readonly audioTimeSeconds: number | null;
  readonly finished: Promise<DialogueResult>;
  readonly result: DialogueResult | null;
  readonly active: boolean;
  update(deltaSeconds: number): void;
  pause(): void;
  resume(): void;
  stop(reason?: string): void;
}
export interface DialoguePlayer {
  play(cue: DialogueCue): DialoguePlayback;
  update(deltaSeconds: number): void;
  dispose(): void;
}

function unrecorded(id: string, speaker: string, text: string, durationSeconds: number): DialogueCue {
  return { id, speaker, text, durationSeconds, bus: 'sfx', recordingStatus: 'not-recorded',
    segments: [{ startSeconds: 0, endSeconds: durationSeconds, text }] };
}

/**
 * Complete Chapter One speech script. Timings are editorial preview values, not approved
 * performances. Every cue deliberately has no audio asset and blocks production playback.
 */
export const CHAPTER_DIALOGUE = {
  'c1.voice.intercom.awakening': {
    ...unrecorded('c1.voice.intercom.awakening', 'Intercom', 'West Ward, night shift. Please remain in your rooms. The nurse will be with you shortly.', 10),
    segments: [
      { startSeconds: 0, endSeconds: 2.8, text: 'West Ward, night shift.' },
      { startSeconds: 2.8, endSeconds: 6.1, text: 'Please remain in your rooms.' },
      { startSeconds: 6.1, endSeconds: 10, text: 'The nurse will be with you shortly.' },
    ],
  },
  'c1.voice.protagonist.appointment': unrecorded('c1.voice.protagonist.appointment', 'You', 'I came for an appointment.', 2.5),
  'c1.voice.protagonist.call': unrecorded('c1.voice.protagonist.call', 'You', 'Hello? Is anyone there?', 3),
  'c1.voice.intercom.review': unrecorded('c1.voice.intercom.review', 'Intercom', 'Room one-zero-four. Night review requested.', 4.5),
  'c1.voice.protagonist.ledger': unrecorded('c1.voice.protagonist.ledger', 'You', 'That wasn’t there.', 2),
  'c1.voice.protagonist.signature': unrecorded('c1.voice.protagonist.signature', 'You', 'That’s my signature.', 2.5),
  'c1.voice.archive.slate': unrecorded('c1.voice.archive.slate', 'Archive', 'West Ward. Withdrawal record. Seventeenth October, two thousand twelve.', 7),
  'c1.voice.archive.withdrawal': unrecorded('c1.voice.archive.withdrawal', 'Your recorded voice', 'My patient number is one-zero-four. I am withdrawing consent. I want to leave.', 9),
  'c1.voice.archive.refusal': unrecorded('c1.voice.archive.refusal', 'Nurse Shaw · archive', 'The consultant has not cleared your discharge.', 4.5),
  'c1.voice.protagonist.memory': unrecorded('c1.voice.protagonist.memory', 'You', 'I don’t remember this.', 2.5),
  'c1.voice.intercom.armed': unrecorded('c1.voice.intercom.armed', 'Intercom', 'West Ward control restored. Emergency release awaiting local confirmation.', 6),
  'c1.voice.intercom.release': unrecorded('c1.voice.intercom.release', 'Intercom', 'Emergency transfer active. Observation bays releasing.', 4),
  'c1.voice.intercom.recognition': unrecorded('c1.voice.intercom.recognition', 'Intercom', 'Patient one-zero-four. Return admission confirmed. Your discharge request is still pending.', 10),
} as const satisfies Readonly<Record<ChapterVoiceCueId, DialogueCue>>;
export type ChapterDialogueId = keyof typeof CHAPTER_DIALOGUE;

function assertDelta(delta: number): void {
  if (!Number.isFinite(delta) || delta < 0) throw new Error('Dialogue delta must be finite and nonnegative');
}
function validLabel(value: string): boolean { return typeof value === 'string' && value.trim().length > 0 && value.length <= 16_384; }

/** Copies authored metadata before allocating audio or subtitle resources. */
export function validateDialogueCue(cue: DialogueCue): DialogueCue {
  if (!cue || !validLabel(cue.id) || !validLabel(cue.speaker) || !validLabel(cue.text)) throw new Error('Invalid dialogue identity or text');
  if (!Number.isFinite(cue.durationSeconds) || cue.durationSeconds <= 0 || cue.durationSeconds > 3600) throw new Error('Invalid dialogue duration');
  if (!['not-recorded', 'temporary', 'recorded', 'approved'].includes(cue.recordingStatus)) throw new Error('Invalid recording status');
  if (cue.bus !== 'sfx' && cue.bus !== 'music') throw new Error('Dialogue must use an existing mixer bus');
  if (cue.recordingStatus !== 'not-recorded' && !validLabel(cue.assetUrl ?? '')) throw new Error('Recorded dialogue requires an asset reference');
  if (cue.recordingStatus === 'not-recorded' && cue.assetUrl !== undefined) throw new Error('Unrecorded dialogue cannot claim an audio asset');
  if (!Array.isArray(cue.segments) || cue.segments.length === 0 || cue.segments.length > 1024) throw new Error('Invalid subtitle segments');
  let previousEnd = 0;
  const segments = cue.segments.map((segment) => {
    if (!segment || !validLabel(segment.text) || !Number.isFinite(segment.startSeconds) || !Number.isFinite(segment.endSeconds) ||
        segment.startSeconds < previousEnd || segment.endSeconds <= segment.startSeconds || segment.endSeconds > cue.durationSeconds) {
      throw new Error('Subtitle segments must be ordered, non-overlapping and within the cue');
    }
    previousEnd = segment.endSeconds;
    return { ...segment };
  });
  return { ...cue, segments };
}

/**
 * Uses already-decoded, explicitly supplied recordings in the engine's AudioContext.
 * No context, downloader, duplicate listener or synthetic voice is created here.
 * Sources connect to the existing settings-controlled mixer. Resume creates a fresh
 * one-shot buffer source at the paused offset, as required by the Web Audio API.
 */
export function createBufferedDialogueVoiceAdapter(
  context: BaseAudioContext,
  recordings: ReadonlyMap<string, AudioBuffer>,
): (cue: DialogueCue) => DialogueVoice {
  return (input) => {
    const cue = validateDialogueCue(input);
    if (context.state !== 'running') throw new Error('Dialogue audio must be unlocked before playback');
    const buffer = cue.assetUrl === undefined ? undefined : recordings.get(cue.assetUrl);
    if (!buffer || !Number.isFinite(buffer.duration) || buffer.duration <= 0) throw new Error(`Dialogue recording is not loaded: ${cue.id}`);
    // Approved timing must match the supplied recording; tolerance covers encoding padding,
    // not a different performance that could otherwise truncate speech or strand its timeline.
    if (Math.abs(buffer.duration - cue.durationSeconds) > 0.01) throw new Error(`Dialogue recording timing does not match subtitles: ${cue.id}`);
    let source: AudioBufferSourceNode | null = null;
    let startedAt = 0;
    let offset = 0;
    let stopped = false;
    const playhead = (): number => offset >= buffer.duration
      ? cue.durationSeconds
      : Math.min(buffer.duration, offset + (source ? Math.max(0, context.currentTime - startedAt) : 0));
    const disconnect = (): void => {
      const old = source; source = null;
      if (!old) return;
      old.onended = null;
      try { old.stop(); } finally { old.disconnect(); }
    };
    const start = (): void => {
      if (stopped || source || offset >= buffer.duration) return;
      if (context.state !== 'running') throw new Error('Dialogue audio context is not running');
      const next = context.createBufferSource();
      next.buffer = buffer;
      next.connect(audioOutput(context, cue.bus));
      source = next;
      startedAt = context.currentTime;
      next.onended = () => {
        if (source !== next) return;
        source = null; offset = buffer.duration;
        next.onended = null;
        next.disconnect();
      };
      try { next.start(0, offset); } catch (error) {
        source = null; next.onended = null; next.disconnect(); throw error;
      }
    };
    start();
    return {
      get timeSeconds() { return playhead(); },
      pause() {
        if (stopped || !source) return;
        offset = Math.min(buffer.duration, playhead());
        disconnect();
      },
      resume() { start(); },
      stop() { if (!stopped) { offset = Math.min(buffer.duration, playhead()); stopped = true; disconnect(); } },
    };
  };
}

/**
 * A single, cancellable dialogue channel sampled by the host update, without timers.
 * Native recorded voices provide the authoritative audio playhead so clamped/dropped
 * simulation time cannot leave subtitles behind audible speech. Preview and custom
 * adapters without a finite playhead use the host delta as an explicit fallback.
 */
export function createDialoguePlayer(options: DialoguePlayerOptions): DialoguePlayer {
  let active: DialoguePlayback | null = null;
  let disposed = false;
  return {
    play(input) {
      if (disposed) throw new Error('Dialogue player is disposed');
      if (active) throw new Error('Dialogue is already playing');
      const cue = validateDialogueCue(input);
      if (options.mode === 'production' && cue.recordingStatus !== 'approved') throw new Error(`Dialogue ${cue.id} has no approved recording`);
      if (cue.recordingStatus !== 'not-recorded' && !options.playVoice) throw new Error('Recorded dialogue requires a voice adapter');
      let elapsed = 0;
      let paused = false;
      let settled = false;
      let voice: DialogueVoice | undefined;
      let unduck: (() => void) | undefined;
      let displayed: number | null = null;
      let result: DialogueResult | null = null;
      let observedAudioTime = 0;
      let resolve!: (result: DialogueResult) => void;
      const finished = new Promise<DialogueResult>((done) => { resolve = done; });
      const ownsChannel = (): boolean => !settled && active === handle;
      const audioTime = (): number | null => {
        if (!ownsChannel() || !voice) return null;
        let observed: unknown;
        try { observed = voice.timeSeconds; } catch { return null; }
        if (typeof observed !== 'number' || !Number.isFinite(observed) || observed < 0) return null;
        observedAudioTime = Math.max(observedAudioTime, Math.min(cue.durationSeconds, observed));
        return observedAudioTime;
      };
      const settle = (outcome: DialogueResult['outcome'], reason?: string): void => {
        if (!ownsChannel()) return;
        settled = true;
        // Keep the channel reserved through cleanup; callbacks cannot start a new line that
        // would then be cleared by the old line's final subtitle callback.
        const errors: unknown[] = [];
        try { voice?.stop(); } catch (error) { errors.push(error); }
        try { unduck?.(); } catch (error) { errors.push(error); }
        // This call is before completion resolution. The sink must not retain wall-clock hides.
        try { options.subtitle(null); } catch (error) { errors.push(error); }
        active = null;
        result = { id: cue.id, outcome: errors.length ? 'interrupted' : outcome,
          ...(reason !== undefined ? { reason } : errors.length ? { reason: 'Dialogue cleanup failed' } : {}) };
        resolve(result);
      };
      const display = (): void => {
        const index = cue.segments.findIndex((segment) => elapsed >= segment.startSeconds && elapsed < segment.endSeconds);
        const next = index < 0 ? null : index;
        if (displayed === next) return;
        displayed = next;
        const segment = next === null ? null : cue.segments[next]!;
        options.subtitle(segment ? { cueId: cue.id, speaker: cue.speaker, text: segment.text } : null);
      };
      const guarded = (operation: () => void): void => {
        if (!ownsChannel()) return;
        try { operation(); } catch (error) { settle('interrupted', error instanceof Error ? error.message : 'Dialogue callback failed'); }
      };
      const handle: DialoguePlayback = {
        id: cue.id, finished,
        get result() { return result; },
        get active() { return ownsChannel(); },
        get elapsedSeconds() { return elapsed; },
        get audioTimeSeconds() { return audioTime(); },
        update(delta) {
          assertDelta(delta);
          if (!ownsChannel() || paused) return;
          const recordedTime = audioTime();
          elapsed = recordedTime === null ? Math.min(cue.durationSeconds, elapsed + delta) : Math.max(elapsed, recordedTime);
          if (elapsed >= cue.durationSeconds) settle('completed');
          else guarded(display);
        },
        pause() {
          if (!paused) guarded(() => {
            // Capture and freeze the audible position, not the previously clamped host time.
            voice?.pause();
            const recordedTime = audioTime();
            if (recordedTime !== null) elapsed = Math.max(elapsed, recordedTime);
            if (elapsed >= cue.durationSeconds) { settle('completed'); return; }
            paused = true;
            display();
          });
        },
        resume() { if (paused) guarded(() => { paused = false; voice?.resume(); }); },
        stop(reason = 'Dialogue interrupted') { settle('interrupted', reason); },
      };
      active = handle;
      guarded(() => {
        if (cue.recordingStatus === 'not-recorded') options.onPreview?.(cue);
        else {
          unduck = options.duck?.(cue);
          if (!ownsChannel()) { unduck?.(); unduck = undefined; return; }
          voice = options.playVoice!(cue);
          if (!voice || typeof voice.stop !== 'function' || typeof voice.pause !== 'function' || typeof voice.resume !== 'function') {
            throw new Error('Voice adapter did not return a controllable playback');
          }
          if (!ownsChannel()) { voice.stop(); voice = undefined; return; }
        }
        if (ownsChannel()) display();
      });
      return handle;
    },
    update(delta) { assertDelta(delta); active?.update(delta); },
    dispose() {
      if (disposed) return;
      disposed = true;
      active?.stop('Dialogue player disposed');
    },
  };
}
