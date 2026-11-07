import { Vector3 } from 'three';
import type { AnimationProfile, PoseContext, PoseFn } from './animator';
import type { BodyDims, JointName, Pose, RigPart } from './rig';
import { blob, foot, hand, limb, skirt, strand } from './shapes';

export const TAU = Math.PI * 2;
const sin = Math.sin;
const cos = Math.cos;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
/** Smooth pseudo-noise in about [-1, 1]. */
export const wobble = (t: number, seed: number): number => (sin(t * 1.3 + seed) + sin(t * 2.7 + seed * 1.7) * 0.6 + sin(t * 5.1 + seed * 0.3) * 0.25) / 1.85;
/** Step-wise twitch: holds a random value, snaps to a new one every `period` seconds. */
export const twitch = (t: number, seed: number, period: number): number => {
  const k = Math.floor(t / period + seed);
  const a = Math.sin(k * 12.9898 + seed * 78.233) * 43758.5453;
  const value = (a - Math.floor(a)) * 2 - 1;
  const local = (t / period + seed) - Math.floor(t / period + seed);
  const prev = Math.sin((k - 1) * 12.9898 + seed * 78.233) * 43758.5453;
  const prevValue = (prev - Math.floor(prev)) * 2 - 1;
  const snap = clamp01(local * period / 0.08);
  return prevValue + (value - prevValue) * snap;
};

export const PATIENT_DIMS: BodyDims = {
  hipHeight: 1.1, hipWidth: 0.2, thigh: 0.55, shin: 0.5, spine: 0.28, chest: 0.36, neck: 0.21, head: 0.25,
  shoulderWidth: 0.36, upperArm: 0.43, forearm: 0.43, ankle: 0.07,
};

/** Emaciated, too-tall body in a faded gown: long arms, long neck, sparse hair. */
export function patientParts(d: BodyDims = PATIENT_DIMS): RigPart[] {
  const chestY = d.hipHeight + 0.04 + d.spine;
  const parts: RigPart[] = [
    { bone: 'hips', material: 'skin', geometry: blob(0.16, 0.12, 0.1, 0, 0.02, 0) },
    { bone: 'spine', material: 'skin', geometry: blob(0.12, 0.17, 0.085, 0, 0.14, 0), blend: 0.08 },
    { bone: 'chest', material: 'skin', geometry: blob(0.17, 0.2, 0.105, 0, 0.17, 0.005), blend: 0.08 },
    { bone: 'neck', material: 'skin', geometry: limb(d.neck + 0.02, 0.046, 0.054, 8, { offset: new Vector3(0, d.neck, 0) }), blend: 0.06 },
    { bone: 'head', material: 'skin', geometry: blob(0.09, 0.125, 0.105, 0, 0.115, 0.005), tint: [0.86, 0.85, 0.82] },
    { bone: 'head', material: 'skin', geometry: blob(0.065, 0.05, 0.07, 0, 0.025, -0.025), tint: [0.9, 0.86, 0.86] },
    // Brow ridge, nose and cheekbones over sunken cheeks: a face, not a mask.
    { bone: 'head', material: 'skin', geometry: blob(0.072, 0.016, 0.03, 0, 0.146, -0.078), tint: [0.92, 0.9, 0.86] },
    { bone: 'head', material: 'skin', geometry: blob(0.013, 0.03, 0.02, 0, 0.096, -0.1), tint: [0.95, 0.9, 0.88] },
    { bone: 'head', material: 'skin', geometry: blob(0.022, 0.014, 0.02, -0.052, 0.098, -0.072), tint: [0.9, 0.88, 0.85] },
    { bone: 'head', material: 'skin', geometry: blob(0.022, 0.014, 0.02, 0.052, 0.098, -0.072), tint: [0.9, 0.88, 0.85] },
    { bone: 'head', material: 'dark', geometry: blob(0.016, 0.03, 0.01, -0.05, 0.07, -0.074) },
    { bone: 'head', material: 'dark', geometry: blob(0.016, 0.03, 0.01, 0.05, 0.07, -0.074) },
    { bone: 'head', material: 'skin', geometry: blob(0.012, 0.03, 0.022, -0.092, 0.115, 0.0), tint: [0.85, 0.8, 0.8] },
    { bone: 'head', material: 'skin', geometry: blob(0.012, 0.03, 0.022, 0.092, 0.115, 0.0), tint: [0.85, 0.8, 0.8] },
    { bone: 'head', material: 'dark', geometry: blob(0.021, 0.013, 0.012, -0.033, 0.122, -0.081) },
    { bone: 'head', material: 'dark', geometry: blob(0.021, 0.013, 0.012, 0.033, 0.122, -0.081) },
    { bone: 'head', material: 'dark', geometry: blob(0.022, 0.007, 0.01, 0, 0.036, -0.086) },
    { bone: 'head', material: 'glint', geometry: blob(0.0045, 0.0045, 0.003, -0.031, 0.124, -0.091, 6, 4) },
    { bone: 'head', material: 'glint', geometry: blob(0.0045, 0.0045, 0.003, 0.035, 0.123, -0.091, 6, 4) },
  ];
  // Sparse, long hair falling down the back.
  for (let i = 0; i < 11; i++) {
    const a = (i / 10 - 0.5) * 2.4;
    const top = new Vector3(Math.sin(a) * 0.07, 0.2 + Math.cos(a) * 0.02, 0.05 + Math.cos(a) * 0.02);
    const bottom = new Vector3(Math.sin(a) * 0.12, -0.12 - (i % 3) * 0.08, 0.1 + Math.abs(Math.sin(a)) * 0.02);
    parts.push({ bone: 'head', material: 'dark', geometry: strand(top, bottom, 0.006) });
  }
  for (const side of ['L', 'R'] as const) {
    const s = side === 'L' ? -1 : 1;
    const j = (name: string) => `${name}${side}` as JointName;
    parts.push(
      { bone: j('shoulder'), material: 'skin', geometry: blob(0.05, 0.045, 0.05) },
      { bone: j('upperArm'), material: 'skin', geometry: limb(d.upperArm, 0.05, 0.039), blend: 0.08 },
      { bone: j('upperArm'), material: 'gown', geometry: skirt(0.17, 0.07, 0.066, 0.078, 0.074, 2, 10), blend: 0.06 },
      { bone: j('forearm'), material: 'skin', geometry: limb(d.forearm, 0.04, 0.03), blend: 0.07, tint: [0.92, 0.88, 0.9] },
      { bone: j('hand'), material: 'skin', geometry: hand(0.095, 0.14, 0.062, 0.1, 0.35), blend: 0.03, tint: [0.82, 0.8, 0.78] },
      { bone: j('thigh'), material: 'skin', geometry: limb(d.thigh, 0.082, 0.056), blend: 0.1 },
      { bone: j('shin'), material: 'skin', geometry: limb(d.shin, 0.056, 0.04), blend: 0.08, tint: [0.92, 0.9, 0.88] },
      { bone: j('foot'), material: 'skin', geometry: foot(0.25, 0.085, 0.05, d.ankle), tint: [0.62, 0.6, 0.55] },
    );
    void s;
  }
  // Hospital wristband and a stained bandage around the right shin.
  parts.push({ bone: 'forearmL', material: 'bandage', geometry: skirt(0.035, 0.028, 0.028, 0.027, 0.027, 1, 8).translate(0, -d.forearm + 0.05, 0) });
  parts.push({ bone: 'shinR', material: 'bandage', geometry: skirt(0.24, 0.052, 0.052, 0.042, 0.042, 3, 10).translate(0, -0.12, 0), tint: [0.85, 0.78, 0.68] });
  // The gown: one cloth tube from the chest to mid-shin, weighted across chest, hips and thighs
  // so the hem swings with the legs.
  const gownTop = chestY + d.chest * 0.92;
  const gownBottom = 0.44;
  const gown = skirt(gownTop - gownBottom, 0.15, 0.105, 0.21, 0.17, 9, 18, 0.012).translate(0, d.chest * 0.92, 0);
  parts.push({
    bone: 'chest', material: 'gown', geometry: gown,
    weights: (p) => {
      const y = p.y;
      if (y > chestY) return ['chest', 1, 'spine', 0];
      if (y > d.hipHeight + 0.1) {
        const t = clamp01((chestY - y) / (chestY - d.hipHeight - 0.1));
        return ['spine', t, 'chest', 1 - t];
      }
      if (y > d.hipHeight - 0.2) return ['hips', 1, 'spine', 0];
      const thigh: JointName = p.x < 0 ? 'thighL' : 'thighR';
      const w = clamp01((d.hipHeight - 0.2 - y) / 0.5) * 0.65;
      return [thigh, w, 'hips', 1 - w];
    },
  });
  return parts;
}

/** Shared limb helpers (also used by the Nurse and Watcher). */
export function legs(phase: number, amp: number, knee: number, kneeBase: number, limp = 0): Pose {
  const p = phase + limp * 0.06 * sin(TAU * phase);
  const swingL = sin(TAU * p);
  const swingR = -sin(TAU * p);
  const kL = kneeBase + knee * Math.max(0, cos(TAU * p));
  const kR = kneeBase + knee * Math.max(0, -cos(TAU * p));
  const ampL = amp * (1 - limp * 0.35);
  return {
    thighL: [ampL * swingL + kneeBase * 0.5, 0, 0],
    shinL: [-kL, 0, 0],
    footL: [-(ampL * swingL) * 0.4 + kL * 0.45 - kneeBase * 0.5, 0, limp * 0.15],
    thighR: [amp * swingR + kneeBase * 0.5, 0, 0],
    shinR: [-kR, 0, 0],
    footR: [-(amp * swingR) * 0.4 + kR * 0.45 - kneeBase * 0.5, 0, 0],
  };
}

const merge = (...poses: Pose[]): Pose => Object.assign({}, ...poses) as Pose;

const breathe = (c: PoseContext, rate = 0.22, depth = 0.025): number => sin(TAU * c.time * rate + c.seed) * depth;

const idle: PoseFn = (c) => {
  const b = breathe(c);
  const shift = sin(c.time * 0.45 + c.seed) * 0.05;
  return merge(legs(0, 0, 0, 0.12), {
    hipsOffset: [shift, 0, 0],
    hips: [0.05, 0, shift * 0.6],
    spine: [-0.18, 0, 0],
    chest: [-0.22 + b, 0, 0],
    neck: [0.32, 0, 0.05],
    head: [0.08 + wobble(c.time * 0.2, c.seed) * 0.08, wobble(c.time * 0.15, c.seed + 3) * 0.25, 0.32 + wobble(c.time * 0.3, c.seed + 5) * 0.08],
    shoulderL: [0, 0, -b * 1.5],
    shoulderR: [0, 0, b * 1.5],
    upperArmL: [0.08, 0, -0.14],
    upperArmR: [0.04, 0, 0.12],
    forearmL: [0.18, 0, 0],
    forearmR: [0.12, 0, 0],
    handL: [0.25 + twitch(c.time, c.seed, 1.9) * 0.18, 0, 0.1],
    handR: [0.2 + twitch(c.time, c.seed + 7, 2.6) * 0.22, 0, -0.1],
  });
};

/** Slow, limping stalk: hunched, head thrust forward, arms hanging long and lagging. */
const walk: PoseFn = (c) => {
  const g = c.gait;
  const p = c.phase;
  const lag = sin(TAU * (p - 0.15));
  return merge(legs(p, 0.42 * g, 0.75 * g, 0.16, 1), {
    hipsOffset: [0.035 * sin(TAU * p) * g, -0.03 * Math.abs(cos(TAU * p)) * g, 0],
    hips: [0.06, 0.12 * sin(TAU * p) * g, 0.07 * sin(TAU * p) * g],
    spine: [-0.22, -0.06 * sin(TAU * p) * g, 0],
    chest: [-0.26 + breathe(c, 0.3, 0.02), -0.05 * sin(TAU * p) * g, 0],
    neck: [0.42, 0, 0.04],
    head: [0.16, wobble(c.time * 0.25, c.seed) * 0.12, 0.28 + 0.04 * sin(TAU * p)],
    upperArmL: [-0.18 * lag * g + 0.05, 0, -0.13],
    upperArmR: [0.18 * lag * g + 0.05, 0, 0.13],
    forearmL: [0.22 + 0.1 * Math.max(0, lag) * g, 0, 0],
    forearmR: [0.2 + 0.1 * Math.max(0, -lag) * g, 0, 0],
    handL: [0.3, 0, 0.1],
    handR: [0.3 + twitch(c.time, c.seed, 2.2) * 0.15, 0, -0.1],
  });
};

/** Sudden straightening: rises to full height, head snaps level, fingers splay. */
const alert: PoseFn = (c) => {
  const k = clamp01(c.stateTime / 0.18);
  const tremble = sin(c.time * 41 + c.seed) * 0.025;
  return merge(legs(0, 0, 0, 0.18), {
    hipsOffset: [0, 0, 0],
    hips: [0, 0, 0],
    spine: [0.02 * k, 0, 0],
    chest: [0.08 * k + breathe(c, 0.9, 0.04), 0, 0],
    neck: [0.05, 0, 0],
    head: [-0.06 + tremble, tremble, 0.02],
    shoulderL: [0, 0, -0.08 * k],
    shoulderR: [0, 0, 0.08 * k],
    upperArmL: [0.35 * k, 0, -0.38 * k],
    upperArmR: [0.35 * k, 0, 0.38 * k],
    forearmL: [0.45 * k, 0, 0],
    forearmR: [0.45 * k, 0, 0],
    handL: [-0.25 + tremble * 3, 0, 0.15],
    handR: [-0.25 - tremble * 3, 0, -0.15],
  });
};

/** Predatory sprint: torso nearly horizontal, huge strides, arms thrashing. */
const run: PoseFn = (c) => {
  const p = c.phase;
  const g = Math.max(0.4, c.gait);
  const s = sin(TAU * p);
  return merge(legs(p, 0.95 * g, 1.5 * g, 0.3), {
    hipsOffset: [0, -0.1 * g + 0.06 * Math.abs(sin(TAU * p * 2)), -0.05],
    hips: [-0.25 * g, 0.22 * s * g, 0.05 * s],
    spine: [-0.45 * g, -0.12 * s * g, 0],
    chest: [-0.3 * g, -0.1 * s * g, 0],
    neck: [0.75 * g, 0, 0],
    head: [0.35 * g + sin(c.time * 23) * 0.03, 0, 0.06 * s],
    shoulderL: [0.1 * s, 0, -0.06],
    shoulderR: [-0.1 * s, 0, 0.06],
    upperArmL: [-1.05 * s * g + 0.25, 0, -0.32],
    upperArmR: [1.05 * s * g + 0.25, 0, 0.32],
    forearmL: [0.7 + 0.5 * Math.max(0, -s), 0, 0],
    forearmR: [0.7 + 0.5 * Math.max(0, s), 0, 0],
    handL: [-0.2, 0, 0.2],
    handR: [-0.2, 0, -0.2],
  });
};

/** Searching: neck sweeps through an impossible arc, one long arm feeling ahead. */
const search: PoseFn = (c) => {
  const g = c.gait;
  const sweep = sin(c.time * 0.55 + c.seed);
  return merge(legs(c.phase, 0.28 * g, 0.5 * g, 0.2, 0.6), {
    hips: [0.04, 0.1 * sweep, 0],
    spine: [-0.2, 0.18 * sweep, 0],
    chest: [-0.22 + breathe(c, 0.35, 0.03), 0.22 * sweep, 0],
    neck: [0.38, 0.75 * sweep, 0.12 * sweep],
    head: [0.1 + wobble(c.time * 0.5, c.seed) * 0.08, 0.6 * sin(c.time * 0.55 + c.seed - 0.5), 0.25 * cos(c.time * 0.3)],
    upperArmL: [0.05, 0, -0.13],
    upperArmR: [0.95 + 0.15 * sin(c.time * 0.8), 0, 0.25],
    forearmL: [0.2, 0, 0],
    forearmR: [0.3, 0, 0],
    handL: [0.3, 0, 0.1],
    handR: [-0.1 + twitch(c.time, c.seed + 3, 0.9) * 0.3, 0, -0.2],
  });
};

/** Doorway observation: one hand high on the frame, body leaning, head tilted in to peer. */
const observe: PoseFn = (c) => {
  const b = breathe(c, 0.18, 0.02);
  return merge(legs(0, 0, 0, 0.08), {
    hipsOffset: [0.06, 0, 0],
    thighR: [0.04, 0, 0.06],
    thighL: [0.1, 0, -0.04],
    hips: [0, 0, 0.08],
    spine: [-0.1, 0, -0.18],
    chest: [-0.12 + b, -0.15, -0.16],
    neck: [0.25, -0.2, -0.25],
    head: [0.05 + wobble(c.time * 0.12, c.seed) * 0.05, -0.15 + wobble(c.time * 0.1, c.seed + 2) * 0.1, -0.55],
    shoulderR: [0, 0, 0.12],
    upperArmR: [2.55, 0, 0.42],
    forearmR: [0.5, 0, 0],
    handR: [0.7, 0, 0],
    upperArmL: [0.02, 0, -0.12],
    forearmL: [0.15, 0, 0],
    handL: [0.25 + twitch(c.time, c.seed, 3.1) * 0.15, 0, 0.1],
  });
};

/** Lost target: slumped, head hanging, slow drifting look. */
const lost: PoseFn = (c) => {
  const base = search({ ...c, time: c.time * 0.5 });
  return merge(base, {
    neck: [-0.05, 0.4 * sin(c.time * 0.3 + c.seed), 0.2],
    head: [-0.3, 0.2 * sin(c.time * 0.21), 0.45],
    upperArmR: [0.1, 0, -0.05],
    forearmR: [0.15, 0, 0],
  });
};

export const PATIENT_ANIMATION: AnimationProfile = {
  poses: { idle, walk, alert, run, search, observe, lost, listen: alert, stand: idle },
  gaits: {
    walk: { stride: 1.5, fullSpeed: 0.7, steps: [{ phase: 0.0, bone: 'footR' }, { phase: 0.5, bone: 'footL' }] },
    run: { stride: 2.9, fullSpeed: 3.2, steps: [{ phase: 0.0, bone: 'footR' }, { phase: 0.5, bone: 'footL' }] },
    search: { stride: 1.2, fullSpeed: 0.8, steps: [{ phase: 0.0, bone: 'footR' }, { phase: 0.5, bone: 'footL' }] },
    lost: { stride: 1.2, fullSpeed: 0.8, steps: [{ phase: 0.0, bone: 'footR' }, { phase: 0.5, bone: 'footL' }] },
  },
  blend: { idle: 0.8, walk: 0.6, alert: 0.12, run: 0.3, search: 0.9, observe: 1.2, lost: 1.0 },
};
