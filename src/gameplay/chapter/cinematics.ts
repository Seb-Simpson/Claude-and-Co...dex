import { Quaternion, Vector3 } from 'three';
import type { PerspectiveCamera } from 'three';
import { validateDialogueCue } from './dialogue';
import type { DialogueCue, DialoguePlayback, DialoguePlayer } from './dialogue';

export interface CinematicPose {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly rotation: { readonly x: number; readonly y: number; readonly z: number; readonly w: number };
  readonly fov: number;
}
export interface CinematicKeyframe {
  readonly atSeconds: number;
  readonly pose: CinematicPose;
}
export type CinematicCue =
  | { readonly atSeconds: number; readonly kind: 'dialogue'; readonly dialogue: DialogueCue }
  | { readonly atSeconds: number; readonly kind: 'animation' | 'environment' | 'sound'; readonly id: string };
export interface CinematicDefinition {
  readonly id: string;
  readonly durationSeconds: number;
  readonly camera: readonly CinematicKeyframe[];
  readonly cues: readonly CinematicCue[];
  /** Skip still blends to the same handoff; zero-duration snapping is not allowed. */
  readonly skipBlendSeconds?: number;
}
export interface CinematicCueResource {
  stop(): void;
  pause?(): void;
  resume?(): void;
}
export interface CinematicControlLease {
  /** Capture/hiding/player disposal invalidates the real control lease. */
  readonly signal?: AbortSignal;
  /** Validate/update the existing real player at this pose; false cancels semantic completion. */
  handoff(pose: CinematicPose): boolean;
  release(): void;
}
export interface CinematicPlayerOptions {
  readonly camera: PerspectiveCamera;
  /** Must exclusively suppress camera writes, look, movement, interaction and player noise. */
  readonly acquireControl: () => CinematicControlLease | null;
  readonly validateHandoff: (pose: CinematicPose) => boolean;
  readonly dialogue?: DialoguePlayer;
  readonly cue?: (cue: Exclude<CinematicCue, { kind: 'dialogue' }>) => CinematicCueResource | void;
  readonly settled?: (result: CinematicResult) => void;
}
export interface CinematicResult {
  readonly id: string;
  readonly outcome: 'completed' | 'skipped' | 'interrupted';
  readonly reason?: string;
}
export interface CinematicPlayback {
  readonly id: string;
  readonly elapsedSeconds: number;
  readonly state: 'playing' | 'paused' | 'skipping' | CinematicResult['outcome'];
  readonly finished: Promise<CinematicResult>;
  skip(): void;
  pause(): void;
  resume(): void;
  cancel(reason?: string): void;
}
export interface CinematicPlayer {
  play(definition: CinematicDefinition, options?: { readonly signal?: AbortSignal }): CinematicPlayback;
  /** Feed from the existing host update; this runtime never creates a render loop. */
  update(deltaSeconds: number): void;
  dispose(): void;
}

function validName(name: string): boolean { return typeof name === 'string' && name.trim().length > 0 && name.length <= 256; }
function copyPose(pose: CinematicPose): CinematicPose {
  if (!pose || !pose.position || !pose.rotation ||
      ![pose.position.x, pose.position.y, pose.position.z, pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w, pose.fov].every(Number.isFinite) ||
      pose.fov < 20 || pose.fov > 120) throw new Error('Invalid cinematic pose');
  const length = Math.hypot(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);
  if (Math.abs(length - 1) > 0.001) throw new Error('Cinematic quaternion must be normalized');
  return {
    position: { x: pose.position.x, y: pose.position.y, z: pose.position.z },
    rotation: { x: pose.rotation.x, y: pose.rotation.y, z: pose.rotation.z, w: pose.rotation.w },
    fov: pose.fov,
  };
}
/** Validates/copies an authored path without acquiring a camera or allocating resources. */
export function validateCinematicDefinition(input: CinematicDefinition): CinematicDefinition {
  if (!input || !validName(input.id) || !Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0 || input.durationSeconds > 3600) throw new Error('Invalid cinematic duration or identity');
  if (!Array.isArray(input.camera) || input.camera.length < 2 || input.camera.length > 4096) throw new Error('A cinematic needs a bounded camera path');
  let previous = -1;
  const camera = input.camera.map((frame) => {
    if (!frame || !Number.isFinite(frame.atSeconds) || frame.atSeconds < 0 || frame.atSeconds <= previous || frame.atSeconds > input.durationSeconds) throw new Error('Camera keyframes must be strictly ordered within the cinematic');
    previous = frame.atSeconds;
    return { atSeconds: frame.atSeconds, pose: copyPose(frame.pose) };
  });
  if (camera[0]!.atSeconds !== 0 || camera[camera.length - 1]!.atSeconds !== input.durationSeconds) throw new Error('Camera path must cover the complete cinematic');
  const blend = input.skipBlendSeconds ?? 0.25;
  if (!Number.isFinite(blend) || blend < 0.05 || blend > 2) throw new Error('Skip blend must be between 0.05 and 2 seconds');
  if (!Array.isArray(input.cues) || input.cues.length > 4096) throw new Error('Invalid cinematic cues');
  previous = -1;
  let voiceEnd = -1;
  const cues = input.cues.map((cue): CinematicCue => {
    if (!cue || !Number.isFinite(cue.atSeconds) || cue.atSeconds < 0 || cue.atSeconds < previous || cue.atSeconds > input.durationSeconds) throw new Error('Cinematic cues must be ordered within the timeline');
    previous = cue.atSeconds;
    if (cue.kind === 'dialogue') {
      const dialogue = validateDialogueCue(cue.dialogue);
      if (cue.atSeconds < voiceEnd || cue.atSeconds + dialogue.durationSeconds > input.durationSeconds) throw new Error('Dialogue cannot overlap or outlast a cinematic');
      voiceEnd = cue.atSeconds + dialogue.durationSeconds;
      return { ...cue, dialogue };
    }
    if (!['animation', 'environment', 'sound'].includes(cue.kind) || !validName(cue.id)) throw new Error('Invalid cinematic cue');
    return { ...cue };
  });
  return { ...input, camera, cues, skipBlendSeconds: blend };
}
export function captureCinematicPose(camera: PerspectiveCamera): CinematicPose {
  return copyPose({ position: camera.position, rotation: camera.quaternion, fov: camera.fov });
}

/**
 * Map-independent camera/dialogue/cue transport. The host provides one shared camera,
 * a real control lease, validated authored paths and scoped presentation adapters.
 * Gameplay commits come only from completed/skipped results, never individual presentation cues.
 */
export function createCinematicPlayer(options: CinematicPlayerOptions): CinematicPlayer {
  let active: { readonly handle: CinematicPlayback; update(delta: number): void } | null = null;
  let disposed = false;
  let starting = false;
  const vectorA = new Vector3();
  const vectorB = new Vector3();
  const quaternionA = new Quaternion();
  const quaternionB = new Quaternion();

  function writePose(pose: CinematicPose): void {
    options.camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    options.camera.quaternion.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);
    if (options.camera.fov !== pose.fov) { options.camera.fov = pose.fov; options.camera.updateProjectionMatrix(); }
    options.camera.updateMatrixWorld(true);
  }
  function interpolate(a: CinematicPose, b: CinematicPose, alpha: number): void {
    vectorA.set(a.position.x, a.position.y, a.position.z);
    vectorB.set(b.position.x, b.position.y, b.position.z);
    options.camera.position.copy(vectorA.lerp(vectorB, alpha));
    quaternionA.set(a.rotation.x, a.rotation.y, a.rotation.z, a.rotation.w);
    quaternionB.set(b.rotation.x, b.rotation.y, b.rotation.z, b.rotation.w);
    options.camera.quaternion.copy(quaternionA.slerp(quaternionB, alpha));
    const fov = a.fov + (b.fov - a.fov) * alpha;
    if (options.camera.fov !== fov) { options.camera.fov = fov; options.camera.updateProjectionMatrix(); }
    options.camera.updateMatrixWorld(true);
  }
  return {
    play(input, playOptions = {}) {
      if (disposed) throw new Error('Cinematic player is disposed');
      if (active || starting) throw new Error('Another cinematic owns the camera');
      if (playOptions.signal?.aborted) throw new Error('Cinematic signal is already aborted');
      const definition = validateCinematicDefinition(input);
      const first = definition.camera[0]!.pose;
      const last = definition.camera[definition.camera.length - 1]!.pose;
      const actual = captureCinematicPose(options.camera);
      vectorA.set(first.position.x, first.position.y, first.position.z);
      quaternionA.set(first.rotation.x, first.rotation.y, first.rotation.z, first.rotation.w);
      if (options.camera.position.distanceTo(vectorA) > 0.02 || options.camera.quaternion.angleTo(quaternionA) > 0.02 || Math.abs(actual.fov - first.fov) > 0.1) {
        throw new Error('Cinematic start must match the actual shared camera');
      }
      if (definition.cues.some((cue) => cue.kind === 'dialogue') && !options.dialogue) throw new Error('Cinematic dialogue requires a dialogue player');
      starting = true;
      try {
        if (!options.validateHandoff(last)) throw new Error('Cinematic handoff pose is invalid');
        if (disposed) throw new Error('Cinematic player was disposed during setup');
        const lease = options.acquireControl();
        if (!lease) throw new Error('Cinematic control lease is unavailable');
        if (disposed || lease.signal?.aborted) {
          lease.release();
          throw new Error('Cinematic control lease was invalidated during setup');
        }
        let elapsed = 0;
        let skipElapsed = 0;
        let skipFrom: CinematicPose | null = null;
        let cursor = 0;
        let paused = false;
        let phase: 'playing' | 'skipping' | CinematicResult['outcome'] = 'playing';
        let settling = false;
        let voice: DialoguePlayback | null = null;
        let voiceStartSeconds = 0;
        let resources: CinematicCueResource[] = [];
        let resolve!: (result: CinematicResult) => void;
        const finished = new Promise<CinematicResult>((done) => { resolve = done; });
        const ownsCamera = (): boolean => active?.handle === handle && !settling;
        const stopPresentation = (): unknown[] => {
          const errors: unknown[] = [];
          const oldVoice = voice; voice = null;
          const oldResources = resources; resources = [];
          try { oldVoice?.stop('Cinematic scope ended'); } catch (error) { errors.push(error); }
          for (const resource of oldResources.reverse()) { try { resource.stop(); } catch (error) { errors.push(error); } }
          return errors;
        };
        const abort = (): void => handle.cancel('Cinematic aborted');
        const settle = (outcome: CinematicResult['outcome'], reason?: string): void => {
          if (!ownsCamera()) return;
          settling = true;
          playOptions.signal?.removeEventListener('abort', abort);
          lease.signal?.removeEventListener('abort', abort);
          const errors = stopPresentation();
          if (outcome !== 'interrupted') {
            try {
              if (!options.validateHandoff(last) || !lease.handoff(copyPose(last))) throw new Error('Cinematic handoff was rejected');
              writePose(last);
            } catch (error) { errors.push(error); }
          }
          try { lease.release(); } catch (error) { errors.push(error); }
          phase = errors.length ? 'interrupted' : outcome;
          const result: CinematicResult = { id: definition.id, outcome: phase,
            ...(reason !== undefined ? { reason } : errors.length ? { reason: errors[0] instanceof Error ? errors[0].message : 'Cinematic cleanup failed' } : {}) };
          active = null;
          resolve(result);
          // Semantic owner callback runs after cleanup and release. Its exception cannot leak a lease.
          options.settled?.(result);
        };
        const guarded = (operation: () => void): void => {
          if (!ownsCamera()) return;
          try { operation(); } catch (error) { settle('interrupted', error instanceof Error ? error.message : 'Cinematic callback failed'); }
        };
        const sample = (): void => {
          const next = definition.camera.findIndex((frame) => frame.atSeconds >= elapsed);
          if (next <= 0) { writePose(definition.camera[0]!.pose); return; }
          const end = definition.camera[next]!;
          const begin = definition.camera[next - 1]!;
          interpolate(begin.pose, end.pose, (elapsed - begin.atSeconds) / (end.atSeconds - begin.atSeconds));
        };
        const advanceTo = (time: number): void => {
          const line = voice;
          const recordedTime = line?.active ? line.audioTimeSeconds : null;
          const next = recordedTime === null ? time : Math.max(time, voiceStartSeconds + recordedTime);
          const previous = elapsed;
          elapsed = Math.max(elapsed, Math.min(definition.durationSeconds, next));
          if (ownsCamera()) sample();
          line?.update(recordedTime === null ? elapsed - previous : 0);
          if (ownsCamera() && phase === 'playing' && line?.result?.outcome === 'interrupted') throw new Error(line.result.reason ?? 'Cinematic dialogue failed');
        };
        const dispatch = (cue: CinematicCue): void => {
          if (cue.kind === 'dialogue') {
            const playback = options.dialogue!.play(cue.dialogue);
            if (!ownsCamera() || phase !== 'playing') { playback.stop('Cinematic scope already ended'); return; }
            if (!playback.active) throw new Error(playback.result?.reason ?? 'Cinematic dialogue could not start');
            voice = playback;
            voiceStartSeconds = cue.atSeconds;
          } else {
            const resource = options.cue?.(cue);
            if (!resource) return;
            if (!ownsCamera() || phase !== 'playing') resource.stop();
            else resources.push(resource);
          }
        };
        const handle: CinematicPlayback = {
          id: definition.id, finished,
          get elapsedSeconds() { return elapsed; },
          get state() { return ownsCamera() && paused ? 'paused' : phase; },
          skip() {
            if (!ownsCamera() || phase !== 'playing') return;
            guarded(() => {
              phase = 'skipping';
              skipFrom = captureCinematicPose(options.camera);
              const errors = stopPresentation();
              if (errors.length) throw errors[0];
            });
          },
          pause() {
            if (!ownsCamera() || paused) return;
            guarded(() => {
              paused = true; voice?.pause();
              if (voice && ownsCamera()) {
                elapsed = Math.max(elapsed, Math.min(definition.durationSeconds, voiceStartSeconds + voice.elapsedSeconds));
                sample();
              }
              for (const resource of resources) { if (!ownsCamera()) return; resource.pause?.(); }
            });
          },
          resume() {
            if (!ownsCamera() || !paused) return;
            guarded(() => {
              paused = false; voice?.resume();
              for (const resource of resources) { if (!ownsCamera()) return; resource.resume?.(); }
            });
          },
          cancel(reason = 'Cinematic interrupted') { settle('interrupted', reason); },
        };
        active = {
          handle,
          update(delta) {
            if (!ownsCamera() || paused) return;
            guarded(() => {
              if (phase === 'skipping') {
                skipElapsed = Math.min(definition.skipBlendSeconds!, skipElapsed + delta);
                const linear = skipElapsed / definition.skipBlendSeconds!;
                interpolate(skipFrom!, last, linear * linear * (3 - 2 * linear));
                if (linear >= 1) { elapsed = definition.durationSeconds; settle('skipped'); }
                return;
              }
              // The native audio playhead is authoritative while a recorded line is audible.
              // It may advance much farther than the clamped host delta after a frame stall.
              // Catch up to this line's end, then return to host timing for quiet intervals.
              const recordedTime = voice?.active ? voice.audioTimeSeconds : null;
              let target = Math.min(definition.durationSeconds, recordedTime === null
                ? elapsed + delta : Math.max(elapsed, voiceStartSeconds + recordedTime));
              while (cursor < definition.cues.length && definition.cues[cursor]!.atSeconds <= target) {
                const cue = definition.cues[cursor]!;
                advanceTo(cue.atSeconds);
                if (!ownsCamera() || paused || phase !== 'playing') return;
                target = Math.max(target, elapsed);
                cursor++;
                dispatch(cue);
                if (!ownsCamera() || paused || phase !== 'playing') return;
                // A fresh clocked recording starts at offset zero now. Never spend leftover
                // host catch-up on it or immediately dispatch a later voice at a false offset.
                const freshRecordedTime = voice?.active ? voice.audioTimeSeconds : null;
                if (freshRecordedTime !== null) target = Math.min(target, Math.max(elapsed, voiceStartSeconds + freshRecordedTime));
              }
              advanceTo(target);
              if (ownsCamera() && elapsed >= definition.durationSeconds) settle('completed');
            });
          },
        };
        playOptions.signal?.addEventListener('abort', abort, { once: true });
        lease.signal?.addEventListener('abort', abort, { once: true });
        starting = false;
        if (playOptions.signal?.aborted || lease.signal?.aborted) handle.cancel('Cinematic aborted during setup');
        else active.update(0);
        return handle;
      } finally { starting = false; }
    },
    update(delta) {
      if (!Number.isFinite(delta) || delta < 0) throw new Error('Cinematic delta must be finite and nonnegative');
      active?.update(delta);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      active?.handle.cancel('Cinematic player disposed');
    },
  };
}
