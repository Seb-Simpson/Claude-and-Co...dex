import { Vector3 } from 'three';
import type { AnimationProfile, PoseContext, PoseFn } from './animator';
import { legs, TAU, twitch, wobble } from './patient';
import type { BodyDims, JointName, Pose, RigPart } from './rig';
import { blob, block, foot, hand, limb, skirt } from './shapes';

const sin = Math.sin;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const merge = (...poses: Pose[]): Pose => Object.assign({}, ...poses) as Pose;

export const NURSE_DIMS: BodyDims = {
  hipHeight: 0.95, hipWidth: 0.18, thigh: 0.47, shin: 0.43, spine: 0.24, chest: 0.32, neck: 0.19, head: 0.23,
  shoulderWidth: 0.33, upperArm: 0.31, forearm: 0.28, ankle: 0.06,
};

/**
 * A ward sister from decades ago: starched dress and cap, dark stockings, and a bandage tied
 * over her eyes — she hunts by sound, and her silhouette says so.
 */
export function nurseParts(d: BodyDims = NURSE_DIMS): RigPart[] {
  const waist = d.hipHeight + 0.04 + d.spine * 0.7;
  const parts: RigPart[] = [
    { bone: 'hips', material: 'dress', geometry: blob(0.15, 0.11, 0.11, 0, 0.03, 0) },
    { bone: 'spine', material: 'dress', geometry: blob(0.115, 0.15, 0.085, 0, 0.13, 0), blend: 0.08 },
    { bone: 'chest', material: 'dress', geometry: blob(0.15, 0.17, 0.1, 0, 0.15, 0), blend: 0.08 },
    { bone: 'chest', material: 'dress', geometry: block(0.24, 0.05, 0.02, 0, d.chest * 0.9, -0.07, 0.3), tint: [1.08, 1.08, 1.08] },
    { bone: 'neck', material: 'skin', geometry: limb(d.neck + 0.02, 0.04, 0.045, 8, { offset: new Vector3(0, d.neck, 0) }), blend: 0.05 },
    { bone: 'head', material: 'skin', geometry: blob(0.085, 0.11, 0.1, 0, 0.1, 0) },
    { bone: 'head', material: 'dark', geometry: blob(0.095, 0.075, 0.09, 0, 0.15, 0.03) },
    { bone: 'head', material: 'dark', geometry: blob(0.05, 0.045, 0.045, 0, 0.12, 0.1) },
    // Eye bandage: a band around the head with a trailing knot.
    { bone: 'head', material: 'bandage', geometry: skirt(0.045, 0.094, 0.106, 0.094, 0.106, 1, 16).translate(0, 0.14, 0) },
    { bone: 'head', material: 'bandage', geometry: block(0.03, 0.12, 0.01, 0.02, 0.07, 0.11, 0.15, 0, 0.2) },
    { bone: 'head', material: 'dark', geometry: blob(0.022, 0.012, 0.008, 0, 0.04, -0.093) },
    // Starched cap.
    { bone: 'head', material: 'dress', geometry: block(0.16, 0.06, 0.1, 0, 0.215, 0.02, -0.25), tint: [1.12, 1.12, 1.12] },
  ];
  for (const side of ['L', 'R'] as const) {
    const j = (name: string) => `${name}${side}` as JointName;
    parts.push(
      { bone: j('shoulder'), material: 'dress', geometry: blob(0.05, 0.045, 0.05) },
      { bone: j('upperArm'), material: 'dress', geometry: limb(d.upperArm, 0.052, 0.044), blend: 0.07 },
      { bone: j('forearm'), material: 'dress', geometry: limb(d.forearm - 0.03, 0.043, 0.036), blend: 0.06 },
      { bone: j('forearm'), material: 'dress', geometry: skirt(0.04, 0.036, 0.036, 0.036, 0.036, 1, 8).translate(0, -d.forearm + 0.05, 0), tint: [1.15, 1.15, 1.15] },
      { bone: j('hand'), material: 'skin', geometry: hand(0.08, 0.085, 0.055, 0.05, 0.3), blend: 0.03 },
      { bone: j('thigh'), material: 'stocking', geometry: limb(d.thigh, 0.07, 0.052), blend: 0.1 },
      { bone: j('shin'), material: 'stocking', geometry: limb(d.shin, 0.052, 0.036), blend: 0.08 },
      { bone: j('foot'), material: 'shoe', geometry: foot(0.21, 0.07, 0.055, d.ankle) },
    );
  }
  // Keys on a chatelaine at the hip.
  parts.push({ bone: 'hips', material: 'dark', geometry: block(0.02, 0.12, 0.01, 0.15, -0.06, -0.02) });
  // A-line skirt from the waist to below the knee, swinging with the thighs.
  const top = waist;
  const bottom = 0.36;
  const skirtGeometry = skirt(top - bottom, 0.15, 0.115, 0.27, 0.22, 7, 18, 0.006).translate(0, top - d.hipHeight, 0);
  parts.push({
    bone: 'hips', material: 'dress', geometry: skirtGeometry,
    weights: (p) => {
      if (p.y > d.hipHeight - 0.05) return ['hips', 1, 'spine', 0];
      const thigh: JointName = p.x < 0 ? 'thighL' : 'thighR';
      const w = clamp01((d.hipHeight - 0.05 - p.y) / 0.5) * 0.55;
      return [thigh, w, 'hips', 1 - w];
    },
  });
  // Apron panel.
  parts.push({ bone: 'hips', material: 'dress', geometry: block(0.24, 0.42, 0.01, 0, -0.15, -0.135, -0.08), tint: [1.18, 1.18, 1.15] });
  return parts;
}

const clasped = (b = 0): Pose => ({
  upperArmL: [0.32, 0, 0.2], upperArmR: [0.32, 0, -0.2],
  forearmL: [1.25 + b, 0.35, 0.25], forearmR: [1.25 + b, -0.35, -0.25],
  handL: [0.1, 0, 0.3], handR: [0.1, 0, -0.3],
});

/** Head jerks toward sounds: held still, then snaps. */
const listenHead = (c: PoseContext, amount: number, period: number): Pose => ({
  neck: [-0.05 + twitch(c.time, c.seed + 1, period) * 0.08 * amount, twitch(c.time, c.seed, period) * 0.35 * amount, 0],
  head: [-0.12 + twitch(c.time, c.seed + 4, period * 1.3) * 0.1, twitch(c.time, c.seed + 2, period) * 0.5 * amount, twitch(c.time, c.seed + 3, period * 0.8) * 0.35 * amount],
});

const idle: PoseFn = (c) => merge(legs(0, 0, 0, 0.04), clasped(), listenHead(c, 0.6, 2.6), {
  hips: [0, 0, 0], spine: [0.03, 0, 0], chest: [0.04 + sin(TAU * c.time * 0.18 + c.seed) * 0.012, 0, 0],
});

const walk: PoseFn = (c) => merge(legs(c.phase, 0.3 * c.gait, 0.32 * c.gait, 0.05), clasped(), listenHead(c, 0.25, 3.2), {
  hipsOffset: [0, -0.012 * Math.abs(Math.cos(TAU * c.phase)) * c.gait, 0],
  hips: [0, 0.05 * sin(TAU * c.phase) * c.gait, 0],
  spine: [0.04, 0, 0],
  chest: [0.05, 0, 0],
});

/** Frozen listening: head cocked hard, one hand lifted toward the ear. */
const listen: PoseFn = (c) => merge(legs(0, 0, 0, 0.07), listenHead(c, 1.3, 0.7), {
  spine: [-0.08, 0, 0.05],
  chest: [-0.1, 0.12, 0.08],
  neck: [-0.05, 0.25 + twitch(c.time, c.seed, 0.7) * 0.2, 0.3],
  head: [-0.05, 0.3 + twitch(c.time, c.seed + 2, 0.55) * 0.25, 0.7 + twitch(c.time, c.seed + 5, 0.9) * 0.1],
  upperArmL: [0.3, 0, 0.18], forearmL: [1.2, 0.3, 0.2], handL: [0.1, 0, 0.3],
  upperArmR: [1.55, 0, -0.55], forearmR: [1.9, 0, 0], handR: [0.2 + sin(c.time * 9) * 0.05, 0, 0],
});

const alert: PoseFn = (c) => {
  const k = clamp01(c.stateTime / 0.1);
  return merge(legs(0, 0, 0, 0.1), {
    spine: [-0.05 * k, 0, 0], chest: [-0.05, 0, 0], neck: [-0.1, 0, 0], head: [-0.05 + sin(c.time * 37) * 0.02, 0, 0],
    upperArmL: [0.9 * k, 0, -0.1], upperArmR: [0.9 * k, 0, 0.1], forearmL: [0.3, 0, 0], forearmR: [0.3, 0, 0],
    handL: [-0.3, 0, 0], handR: [-0.3, 0, 0],
  });
};

/** Pursuit: a stiff, rapid stride with both arms reaching ahead. */
const run: PoseFn = (c) => {
  const s = sin(TAU * c.phase);
  const g = Math.max(0.5, c.gait);
  return merge(legs(c.phase, 0.7 * g, 1.0 * g, 0.12), {
    hipsOffset: [0, -0.04, 0],
    hips: [-0.05, 0.06 * s, 0],
    spine: [-0.12, 0, 0], chest: [-0.06, 0, 0],
    neck: [0.05, 0, 0], head: [-0.06 + sin(c.time * 29) * 0.03, sin(c.time * 17) * 0.04, 0],
    upperArmL: [1.4 + 0.08 * s, 0, -0.06], upperArmR: [1.4 - 0.08 * s, 0, 0.06],
    forearmL: [0.15, 0, 0], forearmR: [0.15, 0, 0],
    handL: [-0.35, 0, 0.1], handR: [-0.35, 0, -0.1],
  });
};

const search: PoseFn = (c) => merge(walk(c), listenHead(c, 1.6, 0.85), {
  chest: [-0.06, twitch(c.time, c.seed + 9, 1.1) * 0.2, 0],
});

export const NURSE_ANIMATION: AnimationProfile = {
  poses: { idle, walk, listen, alert, run, search, observe: listen, lost: search, stand: idle },
  gaits: {
    walk: { stride: 1.05, fullSpeed: 0.8, steps: [{ phase: 0, bone: 'footR' }, { phase: 0.5, bone: 'footL' }] },
    search: { stride: 1.0, fullSpeed: 0.8, steps: [{ phase: 0, bone: 'footR' }, { phase: 0.5, bone: 'footL' }] },
    run: { stride: 2.0, fullSpeed: 2.6, steps: [{ phase: 0, bone: 'footR' }, { phase: 0.5, bone: 'footL' }] },
  },
  blend: { idle: 0.7, walk: 0.6, listen: 0.15, alert: 0.1, run: 0.25, search: 0.5 },
};

export { wobble };
