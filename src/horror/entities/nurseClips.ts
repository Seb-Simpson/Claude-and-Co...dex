import type { PoseContext, PoseFn, VisualState } from './animator';
import { legs, TAU, wobble } from './patient';
import type { Pose } from './rig';

/**
 * NW-007B: Nurse Shaw's authored clips — the single source for the Blender bake
 * (pipeline/samplePoses.test.ts), the runtime fallback, and the animation contract
 * (docs/NW-007B.md). Every clip is IN PLACE: hips stay over the origin, nothing translates the
 * actor. Gameplay owns position and yaw; clips only move the skeleton.
 *
 * First-appearance rule: she should read as a ward sister doing a disturbing routine, not a
 * monster. Only `listen` (old, twitchy) and `capture` show anything wrong with her body.
 */
const sin = Math.sin;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
/** Smoothstep between a and b. */
const ease = (t: number, a: number, b: number): number => { const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x); };
const mix = (a: number, b: number, k: number): number => a + (b - a) * k;
const merge = (...poses: Pose[]): Pose => Object.assign({}, ...poses) as Pose;
const breath = (c: PoseContext, depth = 0.016): number => sin(TAU * c.time * 0.21 + c.seed) * depth;

/** Hands loosely clasped at the apron: a nurse waiting, not a doll. */
const restingArms = (c: PoseContext, k = 1): Pose => ({
  upperArmL: [0.22 * k, 0, 0.16 * k], upperArmR: [0.22 * k, 0, -0.16 * k],
  forearmL: [1.05 * k + breath(c, 0.02), 0.3 * k, 0.2 * k], forearmR: [1.05 * k - breath(c, 0.02), -0.3 * k, -0.2 * k],
  handL: [0.08, 0, 0.25 * k], handR: [0.08, 0, -0.25 * k],
});

/** Standing: soft knees, weight drifting slowly from foot to foot. */
const stance = (c: PoseContext, shift = 1): Pose => {
  const w = sin(c.time * 0.31 + c.seed) * 0.035 * shift;
  return merge(legs(0, 0, 0, 0.05), {
    hipsOffset: [w, 0, 0],
    hips: [0, 0, -w * 0.6],
    thighL: [0.025, 0, -w * 0.5], thighR: [0.025, 0, -w * 0.5],
  });
};

/** A slow, deliberate glance: no snapping. `yaw` > 0 looks to her left. */
const look = (yaw: number, pitch: number, roll = 0): Pose => ({
  neck: [pitch * 0.4, yaw * 0.4, roll * 0.4], head: [pitch * 0.6, yaw * 0.6, roll * 0.6],
});

/** Calm idle: breathing, weight shift, an occasional unhurried look about the ward. */
export const shawIdle: PoseFn = (c) => {
  const glance = wobble(c.time * 0.12, c.seed + 2) * 0.35;
  return merge(stance(c), restingArms(c), look(glance, -0.1 + wobble(c.time * 0.09, c.seed) * 0.05), {
    spine: [0.02, 0, 0], chest: [0.03 + breath(c), glance * 0.12, 0],
  });
};

/**
 * Walk: purposeful, upright, arms swinging a little against the legs, shoulders counter-rotating,
 * hips rolling. Same stride and nominal speed as before (1.05 m, 0.9 m/s) so gameplay's speed
 * scaling and footstep timing are unchanged.
 */
export const shawWalk: PoseFn = (c) => {
  const s = sin(TAU * c.phase);
  const g = c.gait;
  const swing = 0.22 * g;
  return merge(legs(c.phase, 0.3 * g, 0.34 * g, 0.05), look(wobble(c.time * 0.15, c.seed + 4) * 0.18, -0.08), {
    hipsOffset: [0, -0.012 * Math.abs(Math.cos(TAU * c.phase)) * g, 0],
    hips: [0, 0.06 * s * g, 0.03 * s * g],
    spine: [-0.02, -0.03 * s * g, 0], chest: [0.02 + breath(c, 0.01), -0.05 * s * g, 0],
    upperArmL: [-swing * s + 0.05, 0, 0.1], upperArmR: [swing * s + 0.05, 0, -0.1],
    forearmL: [0.25 + 0.12 * Math.max(0, -s) * g, 0, 0], forearmR: [0.25 + 0.12 * Math.max(0, s) * g, 0, 0],
    handL: [0.1, 0, 0.05], handR: [0.1, 0, -0.05],
  });
};

/** Turning on the spot: small stepping, torso and head leading the turn. Gameplay rotates her. */
export const shawTurn: PoseFn = (c) => {
  const p = (c.time / 1.2) % 1;
  return merge(legs(p, 0.08, 0.22, 0.06), restingArms(c, 0.7), look(0.25, -0.08), {
    hips: [0, 0.08 * sin(TAU * p), 0], spine: [0, 0.08, 0], chest: [0.02, 0.12, 0],
  });
};

/** Look around (one-shot): left, a held beat, right, back to centre. Ends in the idle pose. */
export const shawLookAround: PoseFn = (c) => {
  const t = c.stateTime;
  const yaw = 0.75 * (ease(t, 0.3, 1.2) - ease(t, 1.9, 2.9)) - 0.7 * (ease(t, 2.0, 2.9) - ease(t, 3.4, 4.2));
  return merge(stance(c, 0.5), restingArms(c), look(yaw, -0.06), { spine: [0.02, yaw * 0.15, 0], chest: [0.03 + breath(c), yaw * 0.22, 0] });
};

/**
 * Nurse-call check (one-shot, 5 s). Stands facing the master station on the back desk:
 * looks up and to her left at the annunciator (0.3–1.1 s), holds while she reads it, looks down
 * to the console (2.0–2.6), reaches with her right hand (2.4–3.2), presses and holds the reset
 * (3.2–3.9), withdraws (3.9–4.7). Entry and exit: the idle pose.
 */
export const shawPanelCheck: PoseFn = (c) => {
  const t = c.stateTime;
  const up = ease(t, 0.3, 1.1) * (1 - ease(t, 2.0, 2.6));
  const down = ease(t, 2.0, 2.6) * (1 - ease(t, 4.0, 4.8));
  const reach = ease(t, 2.4, 3.2) * (1 - ease(t, 3.9, 4.7));
  const press = ease(t, 3.2, 3.4) * (1 - ease(t, 3.75, 3.9));
  const arms = restingArms(c, 1 - reach);
  return merge(stance(c, 0.4), arms, look(0.55 * up, 0.32 * up - 0.42 * down), {
    spine: [-0.05 * down, 0.06 * up, 0], chest: [0.03 + breath(c) - 0.08 * down, 0.12 * up, 0],
    upperArmR: [mix(0.22, 0.72, reach), 0, mix(-0.16, -0.05, reach)],
    forearmR: [mix(1.05, 0.55 - 0.08 * press, reach), mix(-0.3, 0, reach), mix(-0.2, 0, reach)],
    handR: [mix(0.08, -0.25 + 0.15 * press, reach), 0, 0],
  });
};

/**
 * Reading the record (loop, 6 s): leaning over the desk, left hand flat on the page, right hand
 * turning a page at 3 s, head down and very still. Entry from idle (blend ~0.6 s).
 */
export const shawRecordsRead: PoseFn = (c) => {
  const t = c.time % 6;
  const turn = ease(t, 2.8, 3.3) * (1 - ease(t, 3.6, 4.2));
  return merge(stance(c, 0.3), look(wobble(c.time * 0.2, c.seed) * 0.06, -0.38), {
    spine: [-0.16, 0, 0], chest: [-0.12 + breath(c, 0.012), 0.04 * turn, 0],
    upperArmL: [0.62, 0, 0.12], forearmL: [0.55, 0.2, 0.1], handL: [-0.35, 0, 0.1],
    upperArmR: [0.58 + 0.12 * turn, 0, -0.1 - 0.12 * turn], forearmR: [0.62 - 0.2 * turn, -0.15, -0.1], handR: [-0.3 + 0.35 * turn, 0, -0.1 + 0.4 * turn],
  });
};

/**
 * Brief listen (one-shot, 2.4 s): she stops what she is doing, lifts her chin a fraction and
 * turns her ear slowly toward the sound, holds, then lets it go. Restrained: no head snap.
 */
export const shawListenBrief: PoseFn = (c) => {
  const t = c.stateTime;
  const k = ease(t, 0.15, 0.75) * (1 - ease(t, 1.8, 2.4));
  return merge(stance(c, 0.2), restingArms(c, 1 - 0.3 * k), look(0.55 * k, 0.08 * k, 0.22 * k), {
    spine: [0.02, 0.08 * k, 0], chest: [0.03 - 0.03 * k, 0.15 * k, 0],
  });
};

/**
 * Investigating (gait loop): a slow, careful walk, slightly forward, the head sweeping smoothly
 * from side to side, the right hand a little out from the body as if feeling the way.
 */
export const shawInvestigate: PoseFn = (c) => {
  const s = sin(TAU * c.phase);
  const g = c.gait;
  const sweep = sin(c.time * 0.9 + c.seed) * 0.55;
  return merge(legs(c.phase, 0.24 * g, 0.28 * g, 0.1), look(sweep, -0.12), {
    hipsOffset: [0, -0.02 - 0.01 * Math.abs(Math.cos(TAU * c.phase)) * g, 0],
    hips: [0, 0.04 * s * g, 0], spine: [-0.08, sweep * 0.1, 0], chest: [-0.05 + breath(c, 0.01), sweep * 0.18, 0],
    upperArmL: [0.15 - 0.1 * s * g, 0, 0.12], forearmL: [0.5, 0, 0],
    upperArmR: [0.45 + 0.05 * s * g, 0, -0.32], forearmR: [0.4, 0, 0], handR: [-0.2, 0, 0],
  });
};

/**
 * Capture (one-shot, 1.4 s, holds the last pose): she steps in place, leans in and both hands
 * come up and forward to shoulder height, head tilting down toward the player. No translation.
 */
export const shawCapture: PoseFn = (c) => {
  const t = c.stateTime;
  const k = ease(t, 0.05, 0.7);
  const lean = ease(t, 0.3, 1.2);
  return merge(legs(0, 0, 0, 0.12 + 0.1 * k), {
    thighR: [0.3 * k, 0, 0], shinR: [-0.25 * k, 0, 0], footR: [-0.05 * k, 0, 0],
    thighL: [-0.12 * k, 0, 0], shinL: [-0.18 * k, 0, 0],
    hipsOffset: [0, -0.05 * k, 0],
    spine: [-0.18 * lean, 0, 0], chest: [-0.12 * lean, 0, 0],
    neck: [-0.15 * lean, 0, 0.1 * lean], head: [-0.22 * lean, 0, 0.25 * lean],
    upperArmL: [1.25 * k, 0, 0.05], upperArmR: [1.32 * k, 0, -0.05],
    forearmL: [0.35 * k, 0, 0], forearmR: [0.28 * k, 0, 0],
    handL: [-0.25 * k, 0, 0.15], handR: [-0.25 * k, 0, -0.15],
  });
};

export interface NurseClipSpec {
  readonly name: string;
  readonly pose: PoseFn;
  readonly duration: number;
  readonly loop: boolean;
  /** Gait clips: stride (m) and nominal speed (m/s); playback is time-scaled by actual speed. */
  readonly gait?: { readonly stride: number; readonly speed: number; readonly cycles: number };
  /** Presentation state to use if the clip is unavailable (procedural fallback, or an older GLB). */
  readonly fallback: VisualState;
  /** Semantic scene binding this clip expects her to stand at, if any. */
  readonly target?: string;
  /** What gameplay should do around the clip (documented in docs/NW-007B.md). */
  readonly note: string;
}

/**
 * NW-007B clip contract. `idle` and `walk` replace the old clips under the same names (same loop
 * flags and gait numbers); the rest are new. `listen`, `alert`, `run` and `search` are kept as they
 * were (`search` remains for older callers; `investigate` is the new presentation of it).
 */
export const NURSE_CLIPS: readonly NurseClipSpec[] = [
  { name: 'idle', pose: shawIdle, duration: 8, loop: true, fallback: 'idle', note: 'Standing still. Calm breathing, weight shift, slow glances.' },
  { name: 'walk', pose: shawWalk, duration: (2 * 1.05) / 0.9, loop: true, gait: { stride: 1.05, speed: 0.9, cycles: 2 }, fallback: 'walk', note: 'Patrol and authored walking. Time-scaled by measured speed.' },
  { name: 'turn', pose: shawTurn, duration: 1.2, loop: true, fallback: 'idle', note: 'Turning on the spot while gameplay changes her yaw with little or no translation.' },
  { name: 'look_around', pose: shawLookAround, duration: 4.2, loop: false, fallback: 'idle', note: 'One-shot glance left then right; returns to idle pose.' },
  { name: 'panel_check', pose: shawPanelCheck, duration: 5, loop: false, fallback: 'observe', target: 'nw:station:nurse-panel', note: 'At the nurse-call master station, facing the back wall. Reads the annunciator, presses reset.' },
  { name: 'records_read', pose: shawRecordsRead, duration: 6, loop: true, fallback: 'idle', target: 'nw:station:nurse-records', note: 'At the back desk, facing the back wall, over the Room 104 record.' },
  { name: 'listen_brief', pose: shawListenBrief, duration: 2.4, loop: false, fallback: 'listen', note: 'A restrained pause to listen; returns to idle pose. Use the old `listen` only for the uncanny version.' },
  { name: 'investigate', pose: shawInvestigate, duration: (4 * 0.8) / 0.55, loop: true, gait: { stride: 0.8, speed: 0.55, cycles: 4 }, fallback: 'search', note: 'Careful walk with the head sweeping. Presentation of the search / lost states.' },
  { name: 'capture', pose: shawCapture, duration: 1.4, loop: false, fallback: 'alert', note: 'Restrained capture reach; clamps on its last frame. Gameplay places her ~0.9 m in front of the camera.' },
];

export type NurseClipName = (typeof NURSE_CLIPS)[number]['name'];
export const NURSE_CLIP_NAMES: readonly string[] = NURSE_CLIPS.map((c) => c.name);
