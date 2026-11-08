import { Vector3 } from 'three';
import type { AnimationProfile, PoseContext, PoseFn } from './animator';
import { TAU, twitch, wobble } from './patient';
import type { BodyDims, ContactSpec, JointName, Pose, RigPart } from './rig';
import { blob, foot, hand, limb, skirt } from './shapes';

const sin = Math.sin;
const cos = Math.cos;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const merge = (...poses: Pose[]): Pose => Object.assign({}, ...poses) as Pose;

export const CRAWLER_DIMS: BodyDims = {
  hipHeight: 0.45, hipWidth: 0.17, thigh: 0.46, shin: 0.43, spine: 0.32, chest: 0.32, neck: 0.22, head: 0.22,
  shoulderWidth: 0.3, upperArm: 0.4, forearm: 0.42, ankle: 0.05,
};

/** Hands, knees and toes all touch the floor; the clamp keeps whichever is lowest planted. */
export const CRAWLER_CONTACTS: readonly ContactSpec[] = [
  { bone: 'handL', offset: new Vector3(0, -0.1, 0) },
  { bone: 'handR', offset: new Vector3(0, -0.1, 0) },
  { bone: 'shinL', offset: new Vector3(0, -0.03, 0) },
  { bone: 'shinR', offset: new Vector3(0, -0.03, 0) },
  { bone: 'footL', offset: new Vector3(0, -0.05, -0.15) },
  { bone: 'footR', offset: new Vector3(0, -0.05, -0.15) },
];

/** Starved, prone body dragging itself on long arms; rags at the hips, spine showing. */
export function crawlerParts(d: BodyDims = CRAWLER_DIMS): RigPart[] {
  const parts: RigPart[] = [
    { bone: 'hips', material: 'skin', geometry: blob(0.13, 0.1, 0.09, 0, 0.02, 0) },
    { bone: 'hips', material: 'rag', geometry: skirt(0.2, 0.15, 0.11, 0.17, 0.13, 2, 12, 0.02).translate(0, 0.08, 0) },
    { bone: 'spine', material: 'skin', geometry: blob(0.1, 0.17, 0.075, 0, 0.15, 0), blend: 0.08 },
    { bone: 'chest', material: 'skin', geometry: blob(0.15, 0.18, 0.09, 0, 0.15, 0), blend: 0.08 },
    { bone: 'neck', material: 'skin', geometry: limb(d.neck + 0.02, 0.035, 0.042, 8, { offset: new Vector3(0, d.neck, 0) }), blend: 0.05 },
    { bone: 'head', material: 'skin', geometry: blob(0.068, 0.1, 0.085, 0, 0.1, 0) },
    // Jaw hanging open.
    { bone: 'head', material: 'skin', geometry: blob(0.055, 0.035, 0.06, 0, -0.01, -0.04), tint: [0.85, 0.83, 0.82] },
    { bone: 'head', material: 'dark', geometry: blob(0.032, 0.04, 0.02, 0, 0.03, -0.068) },
    { bone: 'head', material: 'dark', geometry: blob(0.017, 0.011, 0.01, -0.028, 0.115, -0.073) },
    { bone: 'head', material: 'dark', geometry: blob(0.017, 0.011, 0.01, 0.028, 0.115, -0.073) },
    { bone: 'head', material: 'glint', geometry: blob(0.004, 0.004, 0.003, -0.027, 0.117, -0.081, 6, 4) },
    { bone: 'head', material: 'glint', geometry: blob(0.004, 0.004, 0.003, 0.03, 0.116, -0.081, 6, 4) },
  ];
  // Vertebrae ridge along the back (the back faces +Z in bind pose).
  for (let i = 0; i < 9; i++) {
    const bone: JointName = i < 4 ? 'spine' : 'chest';
    const y = i < 4 ? 0.04 + i * 0.075 : (i - 4) * 0.07;
    parts.push({ bone, material: 'skin', geometry: blob(0.022, 0.018, 0.022, 0, y, 0.075), tint: [0.92, 0.92, 0.9] });
  }
  for (const side of ['L', 'R'] as const) {
    const j = (name: string) => `${name}${side}` as JointName;
    parts.push(
      { bone: j('shoulder'), material: 'skin', geometry: blob(0.045, 0.04, 0.045) },
      { bone: j('upperArm'), material: 'skin', geometry: limb(d.upperArm, 0.046, 0.035), blend: 0.08 },
      { bone: j('forearm'), material: 'skin', geometry: limb(d.forearm, 0.036, 0.027), blend: 0.06 },
      { bone: j('hand'), material: 'skin', geometry: hand(0.08, 0.15, 0.06, 0.18, 0.5), blend: 0.03, tint: [0.7, 0.68, 0.64] },
      { bone: j('thigh'), material: 'skin', geometry: limb(d.thigh, 0.058, 0.04), blend: 0.1 },
      { bone: j('shin'), material: 'skin', geometry: limb(d.shin, 0.04, 0.028), blend: 0.08, tint: [0.8, 0.78, 0.74] },
      { bone: j('foot'), material: 'skin', geometry: foot(0.22, 0.07, 0.045, d.ankle), tint: [0.6, 0.58, 0.54] },
    );
  }
  return parts;
}

/** Prone base: hips on the floor, torso propped up toward the head, legs dragging behind. */
const prone = (c: PoseContext, lift: number): Pose => ({
  hipsOffset: [0, 0, 0],
  hips: [-1.15 + lift * 0.2, 0, 0],
  spine: [0.05 + lift * 0.08, 0, 0],
  chest: [0.12 + lift * 0.1, 0, 0],
  neck: [0.55 - lift * 0.1, 0, 0],
  head: [0.55 + wobble(c.time * 0.3, c.seed) * 0.08, wobble(c.time * 0.2, c.seed + 4) * 0.3, wobble(c.time * 0.25, c.seed + 9) * 0.2],
});

/** Diagonal crawl: splayed, hyperextended arms reach and pull; the legs drag with weak kicks. */
function crawl(c: PoseContext, reach: number, lift: number, kick: number): Pose {
  const p = c.phase;
  const sL = sin(TAU * p);
  const sR = sin(TAU * (p + 0.5));
  const swingL = Math.max(0, cos(TAU * p));
  const swingR = Math.max(0, cos(TAU * (p + 0.5)));
  const g = Math.max(0.15, c.gait);
  return merge(prone(c, lift), {
    hips: [-1.15 + lift * 0.2, 0.1 * sL * g, 0.08 * sL * g],
    chest: [0.12 + lift * 0.1, -0.14 * sL * g, -0.06 * sL * g],
    shoulderL: [0.15 * sL * g, 0, -0.1],
    shoulderR: [0.15 * sR * g, 0, 0.1],
    upperArmL: [1.7 + reach * sL * g, 0.2, -1.3 + 0.25 * swingL * g],
    upperArmR: [1.7 + reach * sR * g, -0.2, 1.3 - 0.25 * swingR * g],
    forearmL: [-0.4 + 0.55 * swingL * g, 0, 0.3],
    forearmR: [-0.4 + 0.55 * swingR * g, 0, -0.3],
    handL: [0.9, 0, 0.1],
    handR: [0.9, 0, -0.1],
    thighL: [-0.4 + kick * sR * g, 0, -0.25],
    thighR: [-0.4 + kick * sL * g, 0, 0.25],
    shinL: [-0.05 - 0.4 * Math.max(0, sR) * g, 0, 0],
    shinR: [-0.05 - 0.4 * Math.max(0, sL) * g, 0, 0],
    footL: [1.1, 0, 0],
    footR: [1.1, 0, 0],
  });
}

const idle: PoseFn = (c) => {
  const breath = sin(TAU * c.time * 0.5 + c.seed) * 0.03;
  const tap = (k: number) => Math.max(0, sin(c.time * 7 + k)) * 0.25;
  return merge(crawl({ ...c, gait: 0 }, 0, 0.1, 0), {
    chest: [0.18 + breath, 0, 0],
    neck: [0.55, twitch(c.time, c.seed, 3.4) * 0.35, 0],
    head: [0.55, twitch(c.time, c.seed + 2, 2.1) * 0.25, twitch(c.time, c.seed + 6, 4.3) * 0.5],
    handL: [0.9 + tap(0), 0, 0.1],
    handR: [0.9 + tap(2.1), 0, -0.1],
  });
};

const walk: PoseFn = (c) => crawl(c, 0.32, 0.05, 0.18);

/** Head lifts and turns sideways, body rises on locked arms. */
const alert: PoseFn = (c) => {
  const k = clamp01(c.stateTime / 0.12);
  return merge(crawl({ ...c, gait: 0 }, 0, 0.6 * k, 0), {
    upperArmL: [2.0, 0.2, -1.05], upperArmR: [2.0, -0.2, 1.05],
    forearmL: [-1.2, 0, 0.3], forearmR: [-1.2, 0, -0.3],
    neck: [0.9, 0, 0],
    head: [0.5, sin(c.time * 31) * 0.03, 1.2 * k],
  });
};

/** Skittering sprint: high cadence, body lifted, legs scrabbling. */
const run: PoseFn = (c) => crawl({ ...c, gait: Math.max(0.6, c.gait) }, 0.42, 0.25, 0.45);

const search: PoseFn = (c) => merge(crawl(c, 0.25, 0.05, 0.1), {
  neck: [0.5, 0.7 * sin(c.time * 0.7 + c.seed), 0.1],
  head: [0.45, 0.5 * sin(c.time * 0.7 + c.seed - 0.6), 0.4 * sin(c.time * 0.33)],
});

export const CRAWLER_ANIMATION: AnimationProfile = {
  poses: { idle, walk, alert, run, search, lost: search, observe: idle, listen: alert, stand: idle },
  gaits: {
    walk: { stride: 0.9, fullSpeed: 0.6, steps: [{ phase: 0.25, bone: 'handL' }, { phase: 0.75, bone: 'handR' }] },
    search: { stride: 0.8, fullSpeed: 0.6, steps: [{ phase: 0.25, bone: 'handL' }, { phase: 0.75, bone: 'handR' }] },
    run: { stride: 1.5, fullSpeed: 2.5, steps: [{ phase: 0.25, bone: 'handL' }, { phase: 0.75, bone: 'handR' }] },
  },
  blend: { idle: 0.6, walk: 0.4, alert: 0.1, run: 0.2, search: 0.6 },
};
