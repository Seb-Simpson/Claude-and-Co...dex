/**
 * Asset pipeline step 1 (not a regular test): samples NIGHT WARD's tuned procedural motion into
 * per-frame world-space joint rotations, which `blender/rig_and_export.py` retargets onto the
 * sculpted Blender models and bakes into glTF animation clips.
 *
 * Run with:  NW_POSE_OUT=/path/poses.json npx vitest run src/horror/entities/pipeline/samplePoses.test.ts
 * Skipped in normal test runs.
 */
import { writeFileSync } from 'node:fs';
import { Quaternion, Vector3 } from 'three';
import { it } from 'vitest';
import { type AnimationProfile, blendPoses, type PoseContext, type PoseFn, type VisualState } from '../animator';
import { CRAWLER_ANIMATION, CRAWLER_CONTACTS, CRAWLER_DIMS, crawlerParts } from '../crawler';
import { CRAWLER_MATERIALS, createMaterialSet, NURSE_MATERIALS, PATIENT_MATERIALS, WATCHER_MATERIALS } from '../materials';
import { NURSE_ANIMATION, NURSE_DIMS, nurseParts } from '../nurse';
import { NURSE_CLIPS } from '../nurseClips';
import { PATIENT_ANIMATION, PATIENT_DIMS, patientParts, TAU, wobble } from '../patient';
import { type BodyDims, createRig, JOINTS, type Pose, type RigPart } from '../rig';
import { WATCHER_ANIMATION, WATCHER_DIMS, WATCHER_POSES, watcherParts } from '../watcher';

const FPS = 30;

interface ClipSpec {
  readonly name: string;
  readonly state: VisualState;
  readonly duration: number;
  readonly loop: boolean;
  /** Nominal speed (m/s) the clip is authored for; runtime scales playback by actual speed. */
  readonly speed: number;
  readonly gait: number;
  /** Gait cycles in the clip (0 for non-gait). */
  readonly cycles: number;
  readonly variant?: number;
  readonly timeScale?: number;
  /** NW-007B: the clip's own pose function (overrides the state's). */
  readonly pose?: PoseFn;
}

interface EntitySpec {
  readonly profile: AnimationProfile;
  readonly dims: BodyDims;
  readonly parts: () => RigPart[];
  readonly materials: Parameters<typeof createMaterialSet>[0];
  readonly clips: readonly ClipSpec[];
  readonly poses?: Partial<Record<string, PoseFn>>;
}

const gaitClip = (name: string, state: VisualState, stride: number, speed: number, cycles: number, gait = 1, loop = true): ClipSpec =>
  ({ name, state, duration: (cycles * stride) / speed, loop, speed, gait, cycles });
const timedClip = (name: string, state: VisualState, duration: number, loop = true, variant?: number): ClipSpec =>
  ({ name, state, duration, loop, speed: 0, gait: 0, cycles: 0, ...(variant !== undefined ? { variant } : {}) });

/** The Reflection: you, but wrong — head tipped hard over, breathing, a slow lift of the chin. */
const reflectionIdle: PoseFn = (c) => {
  const breath = Math.sin(TAU * c.time * 0.2) * 0.02;
  return {
    spine: [0, 0, 0.03], chest: [breath, 0, 0.05],
    neck: [0.05, 0.08 * wobble(c.time * 0.15, 3), 0.32 + 0.04 * Math.sin(c.time * 0.31)],
    head: [-0.08 + 0.05 * Math.sin(c.time * 0.23), 0.1 * wobble(c.time * 0.1, 7), 0.42 + 0.05 * wobble(c.time * 0.2, 5)],
    upperArmL: [0.02, 0, -0.06], upperArmR: [0.02, 0, 0.06], forearmL: [0.08, 0, 0], forearmR: [0.1, 0, 0],
  };
};
/** Appearing: the head straightens a little, as if it has noticed you looking. */
const reflectionNotice: PoseFn = (c) => {
  const k = Math.min(1, c.stateTime / 2.5);
  const base = reflectionIdle(c);
  return { ...base, neck: [0.05, 0.12 * k, 0.32 * (1 - 0.55 * k)], head: [-0.12 * k, 0.2 * k, 0.42 * (1 - 0.6 * k)] };
};

const ENTITIES: Record<string, EntitySpec> = {
  patient: {
    profile: PATIENT_ANIMATION, dims: PATIENT_DIMS, parts: () => patientParts(), materials: PATIENT_MATERIALS,
    clips: [
      timedClip('idle', 'idle', 8),
      gaitClip('walk', 'walk', 1.5, 0.75, 2),
      timedClip('alert', 'alert', 0.9, false),
      gaitClip('run', 'run', 2.9, 4.1, 2),
      gaitClip('search', 'search', 1.2, 0.5, 4, 0.7),
      timedClip('observe', 'observe', 8),
      gaitClip('lost', 'lost', 1.2, 0.35, 3, 0.4),
    ],
  },
  nurse: {
    profile: NURSE_ANIMATION, dims: NURSE_DIMS, parts: () => nurseParts(), materials: NURSE_MATERIALS,
    clips: [
      // NW-007B authored clips (idle and walk replace the old ones under the same names).
      ...NURSE_CLIPS.map((c): ClipSpec => ({
        name: c.name, state: c.gait ? (c.name === 'walk' ? 'walk' : 'search') : c.fallback, duration: c.duration, loop: c.loop,
        speed: c.gait?.speed ?? 0, gait: c.gait ? 1 : 0, cycles: c.gait?.cycles ?? 0, pose: c.pose,
      })),
      timedClip('listen', 'listen', 6),
      timedClip('alert', 'alert', 0.6, false),
      gaitClip('run', 'run', 2.0, 3.4, 2),
      gaitClip('search', 'search', 1.0, 0.7, 4),
    ],
  },
  crawler: {
    profile: CRAWLER_ANIMATION, dims: CRAWLER_DIMS, parts: () => crawlerParts(), materials: CRAWLER_MATERIALS,
    clips: [
      timedClip('idle', 'idle', 6),
      gaitClip('walk', 'walk', 0.9, 0.65, 2),
      timedClip('alert', 'alert', 0.6, false),
      gaitClip('run', 'run', 1.5, 3.2, 2),
      gaitClip('search', 'search', 0.8, 0.5, 4, 0.7),
    ],
  },
  watcher: {
    profile: WATCHER_ANIMATION, dims: WATCHER_DIMS, parts: () => watcherParts(), materials: WATCHER_MATERIALS,
    clips: [
      ...WATCHER_POSES.map((_, i) => timedClip(`pose${i}`, 'stand', 4, true, i)),
      gaitClip('walk', 'walk', 0.7, 0.55, 2),
    ],
  },
  reflection: {
    profile: WATCHER_ANIMATION, dims: WATCHER_DIMS, parts: () => watcherParts(), materials: WATCHER_MATERIALS,
    clips: [timedClip('idle', 'idle', 8), timedClip('notice', 'alert', 3, false)],
    poses: { idle: reflectionIdle, alert: reflectionNotice },
  },
};

function sample(entity: EntitySpec, clip: ClipSpec) {
  const materials = createMaterialSet(entity.materials);
  const rig = createRig('sample', entity.dims, entity.parts(), materials.materials, entity === ENTITIES.crawler ? CRAWLER_CONTACTS : undefined);
  const fn = clip.pose ?? entity.poses?.[clip.state] ?? entity.profile.poses[clip.state];
  const frames = Math.max(2, Math.round(clip.duration * FPS) + (clip.loop ? 0 : 1));
  const ctx = (t: number): PoseContext => ({
    time: t, phase: clip.cycles > 0 ? ((t / clip.duration) * clip.cycles) % 1 : 0,
    gait: clip.gait, speed: clip.speed, stateTime: t, variant: clip.variant ?? 0, seed: 3,
  });
  const blendWindow = clip.loop ? Math.min(0.8, clip.duration * 0.3) : 0;
  const out: { q: Record<string, number[]>; o: number[] }[] = [];
  const q = new Quaternion();
  for (let f = 0; f < frames; f++) {
    const t = f / FPS;
    let pose: Pose = fn(ctx(t));
    // Seamless loops: fade time-driven motion into the clip's own start over the last stretch.
    if (blendWindow > 0 && t > clip.duration - blendWindow) {
      const w = (t - (clip.duration - blendWindow)) / blendWindow;
      pose = blendPoses(pose, fn(ctx(t - clip.duration)), w * w * (3 - 2 * w));
    }
    rig.apply(pose, false);
    rig.model.updateMatrixWorld(true);
    const qs: Record<string, number[]> = {};
    for (const j of JOINTS) {
      rig.bones[j].getWorldQuaternion(q);
      qs[j] = [q.x, q.y, q.z, q.w];
    }
    const o = pose.hipsOffset ?? [0, 0, 0];
    out.push({ q: qs, o: [o[0], o[1], o[2]] });
  }
  rig.dispose();
  materials.dispose();
  const gaitSpec = entity.profile.gaits[clip.state];
  const steps = clip.cycles > 0 && gaitSpec
    ? Array.from({ length: clip.cycles }, (_, k) => gaitSpec.steps.map((s) => ({ time: ((k + s.phase) / clip.cycles) * clip.duration, bone: s.bone }))).flat()
    : [];
  return { name: clip.name, state: clip.state, duration: clip.duration, loop: clip.loop, speed: clip.speed, cycles: clip.cycles, steps, frames: out };
}

it.skipIf(!process.env.NW_POSE_OUT)('samples entity animation clips for the Blender pipeline', () => {
  const result: Record<string, unknown> = { fps: FPS, joints: JOINTS, entities: {} };
  // NW_POSE_ENTITY=nurse samples one entity only (rebuild just that model).
  for (const [name, entity] of Object.entries(ENTITIES).filter(([n]) => !process.env.NW_POSE_ENTITY || n === process.env.NW_POSE_ENTITY)) {
    (result.entities as Record<string, unknown>)[name] = { clips: entity.clips.map((c) => sample(entity, c)) };
  }
  writeFileSync(process.env.NW_POSE_OUT!, JSON.stringify(result));
  void Vector3;
});
