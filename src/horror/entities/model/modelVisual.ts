import {
  type AnimationAction, AnimationMixer, type Bone, Group, LoopOnce, LoopRepeat, type Material, type Mesh, type Object3D, type SkinnedMesh, Vector3,
} from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { EntityBehaviourState } from '../../../contracts';
import { type FootstepEvent, resolveVisualState, type VisualState } from '../animator';
import type { JointName } from '../rig';
import type { BodiedEntityType, EntityVisual, EntityVisualInput } from '../visual';
import type { ClipManifest, LoadedModel } from './library';

/** Which clip plays for each presentation state, per entity. */
export const CLIP_FOR_STATE: Readonly<Record<BodiedEntityType, Readonly<Record<VisualState, string>>>> = {
  patient: { idle: 'idle', walk: 'walk', alert: 'alert', run: 'run', search: 'search', observe: 'observe', lost: 'lost', listen: 'alert', stand: 'idle' },
  nurse: { idle: 'idle', walk: 'walk', alert: 'alert', run: 'run', search: 'search', observe: 'listen', lost: 'search', listen: 'listen', stand: 'idle' },
  crawler: { idle: 'idle', walk: 'walk', alert: 'alert', run: 'run', search: 'search', observe: 'idle', lost: 'search', listen: 'alert', stand: 'idle' },
  watcher: { idle: 'pose0', walk: 'walk', alert: 'pose0', run: 'walk', search: 'pose0', observe: 'pose0', lost: 'pose0', listen: 'pose0', stand: 'pose0' },
};

const WATCHER_POSE_COUNT = 5;

/**
 * Cross-fade time (s) for a transition. Short fades read as sudden, jerky changes (the alert snap);
 * long ones as unhurried settling. The Watcher never visibly moves between poses: its pose changes
 * happen only while unobserved, so they are instant.
 */
export function fadeFor(type: BodiedEntityType, from: VisualState | null, to: VisualState): number {
  if (from === null) return 0;
  if (type === 'watcher') return from === 'walk' || to === 'walk' ? 0.4 : 0;
  if (to === 'alert') return type === 'patient' ? 0.07 : 0.1;
  if (to === 'listen') return 0.12;
  if (from === 'alert' && to === 'run') return 0.18;
  if (to === 'run') return 0.25;
  if (from === 'run') return 0.7;
  if (to === 'observe') return 1.0;
  if (to === 'idle') return 0.6;
  return 0.45;
}

export interface ModelVisualOptions {
  readonly seed?: number;
  /** Lunge at the start of a pursuit: run playback starts this much faster and eases down. */
  readonly lunge?: number;
}

interface ClipState {
  readonly manifest: ClipManifest;
  readonly action: AnimationAction;
  lastTime: number;
}

/**
 * EntityVisual backed by a skinned Blender model and an AnimationMixer. Clips are in place (no
 * root motion): gameplay owns position and facing through the parent node; this only animates
 * the skeleton. Gait clips are time-scaled by measured speed so feet do not slide, and footsteps
 * are raised from the clip's authored contact times.
 */
export function createModelVisual(type: BodiedEntityType, model: LoadedModel, options: ModelVisualOptions = {}): EntityVisual {
  const object = new Group();
  object.name = `nw:entity-model:${type}`;
  const root = cloneSkinned(model.scene) as Object3D;
  root.name = `nw:entity-model-root:${type}`;
  object.add(root);
  // Per-instance materials so each entity can fade on its own; textures stay shared.
  const materials: Material[] = [];
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.push(m);
    // Animated limbs leave the bind-pose bounds; a handful of entities do not need culling.
    mesh.frustumCulled = false;
  });
  const baseOpacity = materials.map((m) => m.opacity);
  const bones = new Map<string, Bone>();
  root.traverse((o) => { if ((o as Bone).isBone) bones.set(o.name, o as Bone); });

  const mixer = new AnimationMixer(root);
  const clips = new Map<string, ClipState>();
  for (const manifest of model.manifest.clips) {
    const clip = model.clips.get(manifest.name);
    if (!clip) continue;
    const action = mixer.clipAction(clip);
    action.setLoop(manifest.loop ? LoopRepeat : LoopOnce, Infinity);
    action.clampWhenFinished = !manifest.loop;
    clips.set(manifest.name, { manifest, action, lastTime: 0 });
  }
  const seed = options.seed ?? 0;
  const lunge = options.lunge ?? (type === 'patient' ? 0.55 : type === 'crawler' ? 0.35 : 0.2);

  let current: { state: VisualState; clip: ClipState } | null = null;
  let forced: VisualState | null = null;
  let behaviour: EntityBehaviourState | null = null;
  let behaviourTime = 0;
  let stillTime = 0;
  let variant = seed % WATCHER_POSE_COUNT;
  let unobservedTime = 0;
  let nextPoseChange = 5 + (seed % 7);
  let lungeTime = Infinity;
  let disposed = false;

  const clipName = (state: VisualState): string => {
    const name = CLIP_FOR_STATE[type][state];
    return type === 'watcher' && name === 'pose0' ? `pose${variant}` : name;
  };

  const play = (state: VisualState): void => {
    const name = clipName(state);
    const next = clips.get(name) ?? clips.get(CLIP_FOR_STATE[type].idle) ?? [...clips.values()][0];
    if (!next || (current && current.clip === next)) {
      if (current) current.state = state;
      return;
    }
    const fade = fadeFor(type, current?.state ?? null, state);
    next.action.reset();
    next.action.enabled = true;
    next.action.setEffectiveWeight(1);
    next.action.setEffectiveTimeScale(1);
    if (!next.manifest.loop) next.action.time = 0;
    else if (current && current.clip.manifest.cycles > 0 && next.manifest.cycles > 0) {
      // Keep the gait phase when switching between walking-type clips (no foot-swap pop).
      next.action.time = (current.clip.action.time / current.clip.manifest.duration) * next.manifest.duration;
    } else next.action.time = ((seed * 0.37) % 1) * next.manifest.duration;
    next.lastTime = next.action.time;
    next.action.play();
    if (current && fade > 0) next.action.crossFadeFrom(current.clip.action, fade, true);
    else if (current) current.clip.action.stop();
    if (state === 'run' && current && (current.state === 'alert' || current.state === 'listen')) lungeTime = 0;
    current = { state, clip: next };
  };

  return {
    type,
    object,
    get visualState() { return current?.state ?? 'idle'; },
    update(dt, input: EntityVisualInput): readonly FootstepEvent[] {
      if (disposed) return [];
      const step = Math.max(0, Math.min(dt, 0.1));
      if (input.behaviour !== behaviour) { behaviour = input.behaviour; behaviourTime = 0; } else behaviourTime += step;
      stillTime = input.speed < 0.1 ? stillTime + step : 0;
      if (type === 'watcher') {
        if (input.observed) unobservedTime = 0;
        else if ((unobservedTime += step) > nextPoseChange && forced === null) {
          variant = (variant + 1 + Math.floor(Math.abs(Math.sin(seed + behaviourTime * 7.1)) * (WATCHER_POSE_COUNT - 1))) % WATCHER_POSE_COUNT;
          unobservedTime = 0;
          nextPoseChange = 5 + Math.abs(Math.sin(seed * 3.1 + behaviourTime)) * 9;
          if (current && current.state !== 'walk') { const s = current.state; current.clip.action.stop(); current = null; play(s); }
        }
      }
      const state = forced ?? resolveVisualState(type, input.behaviour, input.speed, {
        previous: current?.state ?? 'idle', behaviourTime, stillTime, nearDoor: input.nearDoor ?? false,
      });
      play(state);
      if (!current) return [];
      const active = current.clip;
      // Gait clips play at the rate that matches gameplay speed; the pursuit opens with a lunge.
      let scale = 1;
      if (active.manifest.cycles > 0 && active.manifest.speed > 0 && current.state !== 'search' && current.state !== 'lost') {
        scale = Math.min(2.2, Math.max(0.35, input.speed / active.manifest.speed));
      }
      if (current.state === 'run' && lungeTime < 0.7) {
        lungeTime += step;
        scale *= 1 + lunge * (1 - lungeTime / 0.7);
      }
      active.action.setEffectiveTimeScale(scale);
      mixer.update(step);
      // Contact events from the dominant clip's authored step times.
      const events: FootstepEvent[] = [];
      const t = active.action.time;
      if (active.manifest.steps.length && scale > 0) {
        const prev = active.lastTime;
        const wrapped = t < prev;
        for (const s of active.manifest.steps) {
          const crossed = wrapped ? s.time > prev || s.time <= t : s.time > prev && s.time <= t;
          if (crossed) events.push({ bone: s.bone, state: current.state, speed: input.speed });
        }
      }
      active.lastTime = t;
      return events;
    },
    forceState(state, nextVariant) {
      forced = state;
      if (nextVariant !== undefined && nextVariant % WATCHER_POSE_COUNT !== variant) {
        variant = nextVariant % WATCHER_POSE_COUNT;
        if (current) { const s = current.state; current.clip.action.stop(); current = null; play(s); }
      }
    },
    setOpacity(value) {
      const v = Math.max(0, Math.min(1, value));
      materials.forEach((m, i) => {
        m.transparent = v < 0.999 || (baseOpacity[i] ?? 1) < 1;
        m.depthWrite = v >= 0.999;
        m.opacity = (baseOpacity[i] ?? 1) * v;
      });
    },
    bonePosition(bone: JointName, target = new Vector3()) {
      const b = bones.get(bone);
      if (!b) return object.getWorldPosition(target);
      b.updateWorldMatrix(true, false);
      return target.setFromMatrixPosition(b.matrixWorld);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      for (const m of materials) m.dispose();
      // Each cloned skeleton owns a bone-matrix DataTexture once rendered; free it with the instance.
      disposeSkeletons(root);
      object.removeFromParent();
    },
  };
}

/** Free the bone textures of every skinned mesh under `root` (clones own their skeletons). */
export function disposeSkeletons(root: Object3D): void {
  root.traverse((o) => { if ((o as SkinnedMesh).isSkinnedMesh) (o as SkinnedMesh).skeleton.dispose(); });
}
