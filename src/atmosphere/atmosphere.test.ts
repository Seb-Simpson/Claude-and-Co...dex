import { Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createHospitalWorld } from '../world/createHospitalWorld';
import { applyOverride, fixtureBrightness, seedFromId } from './flicker';
import { LightRig, nearestIndices } from './lightRig';

describe('fixture flicker patterns', () => {
  it('keeps steady and dead fixtures constant', () => {
    for (let t = 0; t < 30; t += 0.37) {
      expect(fixtureBrightness('steady', t, 7)).toBe(1);
      expect(fixtureBrightness('dead', t, 7)).toBe(0);
    }
  });

  it('flickers in bursts but stays mostly lit (navigable)', () => {
    let lit = 0;
    let dark = 0;
    for (let t = 0; t < 120; t += 1 / 60) {
      const b = fixtureBrightness('flicker', t, seedFromId('nw:light:fluorescent:01'));
      if (b > 0.5) lit++; else dark++;
    }
    expect(dark).toBeGreaterThan(0);
    expect(lit / (lit + dark)).toBeGreaterThan(0.75);
  });

  it('makes dying tubes mostly dark with occasional attempts', () => {
    let on = 0;
    const samples = 60 * 120;
    for (let i = 0; i < samples; i++) if (fixtureBrightness('dying', i / 60, 99) > 0.2) on++;
    expect(on).toBeGreaterThan(0);
    expect(on / samples).toBeLessThan(0.25);
  });

  it('is deterministic for a given seed and time', () => {
    expect(fixtureBrightness('flicker', 12.34, 5)).toBe(fixtureBrightness('flicker', 12.34, 5));
  });

  it('fades overrides in and out and expires them', () => {
    const blackout = { effect: 'blackout' as const, start: 10, end: 12, intensity: 0, seed: 1 };
    expect(applyOverride(1, blackout, 9)).toBe(1);
    expect(applyOverride(1, blackout, 11)).toBe(0);
    expect(applyOverride(1, blackout, 10.1)).toBeGreaterThan(0);
    expect(applyOverride(1, blackout, 12.5)).toBe(1);
    expect(applyOverride(1, { ...blackout, effect: 'dim', intensity: 0.3 }, 11)).toBeCloseTo(0.3);
  });
});

describe('LightRig', () => {
  const build = createHospitalWorld({ textures: false });

  it('selects the nearest fixtures stably', () => {
    expect(nearestIndices([5, 1, 3, 1], 3)).toEqual([1, 3, 2]);
  });

  it('keeps a constant light count, follows the camera and cleans up', () => {
    const scene = new Scene();
    const rig = new LightRig(scene, build.extras, { poolSize: 8, random: () => 0.5 });
    expect(rig.lights).toHaveLength(8);
    const before = scene.children.length;
    rig.update(1 / 60, 1, new Vector3(-12.4, 1.6, 0));
    const near = rig.lights.filter((l) => l.intensity > 0 && l.position.distanceTo(new Vector3(-12.4, 1.6, 0)) < 12);
    expect(near.length).toBeGreaterThan(0);
    rig.update(1 / 60, 2, new Vector3(19.5, 1.6, -4));
    expect(rig.lights.some((l) => l.position.x > 15)).toBe(true);
    expect(scene.children.length).toBe(before);
    rig.dispose();
    expect(scene.children.length).toBe(0);
  });

  it('applies lighting events by fixture id or circuit and restores them', () => {
    const scene = new Scene();
    const rig = new LightRig(scene, build.extras, { random: () => 0.99, disturbanceInterval: [1e6, 1e6] });
    const corridor = build.extras.fixtures.filter((f) => f.circuits.includes('nw:lights:corridor-main'));
    const steady = corridor.find((f) => f.state === 'steady')!;
    rig.update(0.016, 1, new Vector3(steady.position.x, 1.6, 0));
    expect(rig.brightnessOf(steady.id)).toBe(1);
    expect(rig.apply({ targetId: 'nw:lights:corridor-main', effect: 'blackout', durationSeconds: 5 })).toBe(corridor.length);
    rig.update(0.016, 3, new Vector3(steady.position.x, 1.6, 0));
    expect(rig.brightnessOf(steady.id)).toBe(0);
    rig.apply({ targetId: 'nw:lights:corridor-main', effect: 'restore', durationSeconds: 0 });
    rig.update(0.016, 3.1, new Vector3(steady.position.x, 1.6, 0));
    expect(rig.brightnessOf(steady.id)).toBe(1);
    rig.dispose();
  });

  it('produces ambient disturbances that always recover', () => {
    const scene = new Scene();
    let seed = 1;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const rig = new LightRig(scene, build.extras, { random, disturbanceInterval: [5, 6] });
    const events: string[] = [];
    rig.on((e) => events.push(e.type));
    const camera = new Vector3(-3.8, 1.6, 0);
    for (let t = 0; t < 120; t += 0.1) rig.update(0.1, t, camera);
    expect(events.length).toBeGreaterThan(5);
    // Long after the last disturbance, steady tubes are lit again unless popped.
    const steady = build.extras.fixtures.filter((f) => f.state === 'steady' && f.kind === 'fluorescent');
    for (let t = 120; t < 400; t += 0.5) rig.update(0.5, t, new Vector3(1000, 0, 1000));
    const lit = steady.filter((f) => rig.brightnessOf(f.id) === 1);
    expect(lit.length).toBeGreaterThan(0);
    rig.dispose();
  });
});
