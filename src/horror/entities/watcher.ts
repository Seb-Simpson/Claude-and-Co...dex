import { Vector3 } from 'three';
import type { AnimationProfile, PoseContext, PoseFn } from './animator';
import { legs, TAU } from './patient';
import type { BodyDims, JointName, Pose, RigPart } from './rig';
import { blob, foot, hand, limb, skirt } from './shapes';

const merge = (...poses: Pose[]): Pose => Object.assign({}, ...poses) as Pose;

export const WATCHER_DIMS: BodyDims = {
  hipHeight: 1.24, hipWidth: 0.18, thigh: 0.62, shin: 0.56, spine: 0.3, chest: 0.36, neck: 0.27, head: 0.28,
  shoulderWidth: 0.38, upperArm: 0.47, forearm: 0.46, ankle: 0.06,
};

/** Too tall, too thin, a long dark coat and a pale, entirely featureless face. */
export function watcherParts(d: BodyDims = WATCHER_DIMS): RigPart[] {
  const chestY = d.hipHeight + 0.04 + d.spine;
  const parts: RigPart[] = [
    { bone: 'hips', material: 'coat', geometry: blob(0.14, 0.11, 0.1, 0, 0.02, 0) },
    { bone: 'spine', material: 'coat', geometry: blob(0.11, 0.17, 0.08, 0, 0.15, 0), blend: 0.08 },
    { bone: 'chest', material: 'coat', geometry: blob(0.16, 0.2, 0.095, 0, 0.17, 0), blend: 0.08 },
    { bone: 'neck', material: 'skin', geometry: limb(d.neck + 0.02, 0.035, 0.04, 8, { offset: new Vector3(0, d.neck, 0) }), blend: 0.05 },
    { bone: 'head', material: 'skin', geometry: blob(0.085, 0.14, 0.1, 0, 0.13, 0) },
    // A faint, shallow brow line — the only hint there was ever a face.
    { bone: 'head', material: 'dark', geometry: blob(0.05, 0.004, 0.01, 0, 0.145, -0.096), tint: [0.4, 0.4, 0.4] },
    // Coat collar.
    { bone: 'chest', material: 'coat', geometry: skirt(0.09, 0.06, 0.06, 0.1, 0.085, 1, 12).translate(0, d.chest + 0.07, 0) },
  ];
  for (const side of ['L', 'R'] as const) {
    const j = (name: string) => `${name}${side}` as JointName;
    parts.push(
      { bone: j('shoulder'), material: 'coat', geometry: blob(0.055, 0.05, 0.055) },
      { bone: j('upperArm'), material: 'coat', geometry: limb(d.upperArm, 0.045, 0.04), blend: 0.08 },
      { bone: j('forearm'), material: 'coat', geometry: limb(d.forearm - 0.03, 0.04, 0.036), blend: 0.06 },
      { bone: j('hand'), material: 'skin', geometry: hand(0.11, 0.15, 0.075, 0.03, 0.12), blend: 0.03 },
      { bone: j('thigh'), material: 'coat', geometry: limb(d.thigh, 0.06, 0.045), blend: 0.1, tint: [0.8, 0.8, 0.8] },
      { bone: j('shin'), material: 'coat', geometry: limb(d.shin, 0.045, 0.035), blend: 0.08, tint: [0.8, 0.8, 0.8] },
      { bone: j('foot'), material: 'dark', geometry: foot(0.28, 0.08, 0.06, d.ankle) },
    );
  }
  // Long coat from shoulders to the ankles.
  const top = chestY + d.chest * 0.95;
  const coat = skirt(top - 0.18, 0.17, 0.11, 0.25, 0.2, 9, 16, 0.008).translate(0, d.chest * 0.95, 0);
  parts.push({
    bone: 'chest', material: 'coat', geometry: coat,
    weights: (p) => {
      if (p.y > chestY) return ['chest', 1, 'spine', 0];
      if (p.y > d.hipHeight - 0.1) return ['hips', 1, 'spine', 0];
      const thigh: JointName = p.x < 0 ? 'thighL' : 'thighR';
      const w = Math.min(1, (d.hipHeight - 0.1 - p.y) / 0.8) * 0.5;
      return [thigh, w, 'hips', 1 - w];
    },
  });
  return parts;
}

/** Five still poses. The presenter only switches variant while the Watcher is unobserved. */
export const WATCHER_POSES: readonly Pose[] = [
  // 0: perfectly straight, arms at its sides.
  { upperArmL: [0, 0, 0.02], upperArmR: [0, 0, -0.02] },
  // 1: head tipped far over.
  { neck: [0, 0, 0.35], head: [0.05, 0, 0.75], upperArmL: [0, 0, 0.02], upperArmR: [0, 0, -0.02] },
  // 2: body turned away, head turned all the way back toward you.
  { hips: [0, Math.PI, 0], neck: [0, 1.4, 0], head: [0.1, 1.55, 0], upperArmL: [0, 0, 0.02], upperArmR: [0, 0, -0.02] },
  // 3: leaning, as if against something that is not there.
  { hips: [0, 0, -0.12], spine: [0, 0, 0.18], chest: [0, 0, 0.12], neck: [0, 0, -0.2], head: [0, 0, -0.35], upperArmR: [0, 0, -0.15], upperArmL: [0, 0, 0.1] },
  // 4: one long arm slowly raised, pointing.
  { upperArmR: [1.45, 0, -0.05], forearmR: [0.05, 0, 0], handR: [-0.1, 0, 0], neck: [0.05, 0, 0.1], head: [0, 0, 0.2], upperArmL: [0, 0, 0.02] },
];

const still = (c: PoseContext): Pose => {
  const base = WATCHER_POSES[c.variant % WATCHER_POSES.length] ?? {};
  // Almost no motion: one tiny head adjustment every several seconds.
  const tick = Math.floor(c.time / 7.3 + c.seed) % 2 === 0 ? 0 : 0.015;
  const head = base.head ?? [0, 0, 0];
  return merge(legs(0, 0, 0, 0), base, { head: [head[0] + tick, head[1], head[2]] });
};

/** Moves without walking: a barely-there stride, nothing else stirs. */
const glide: PoseFn = (c) => merge(still({ ...c, variant: 0 }), legs(c.phase, 0.07, 0.05, 0), {
  hipsOffset: [0, 0, 0],
  hips: [0, 0.02 * Math.sin(TAU * c.phase), 0],
});

export const WATCHER_ANIMATION: AnimationProfile = {
  poses: { stand: still, idle: still, walk: glide, alert: still, run: glide, search: still, observe: still, lost: still, listen: still },
  gaits: { walk: { stride: 0.7, fullSpeed: 0.5, steps: [] }, run: { stride: 0.9, fullSpeed: 1.5, steps: [] } },
  blend: { stand: 0.05, walk: 0.4, idle: 0.05 },
};
