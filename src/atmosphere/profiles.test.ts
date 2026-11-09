import { Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createHospitalWorld, getHospitalExtras } from '../world';
import { LightRig } from './lightRig';
import { LIGHTING_PROFILES, ProfileBlender, profileFromTarget, stateOf } from './profiles';

function rigAt(position: Vector3) {
  const build = createHospitalWorld({ textures: false });
  const extras = getHospitalExtras(build.world)!;
  const scene = new Scene();
  const rig = new LightRig(scene, extras, { random: () => 0.99, disturbanceInterval: [1e6, 1e6] });
  const sample = (profile: keyof typeof LIGHTING_PROFILES | null, t = 10) => {
    rig.setProfile(profile ? stateOf(LIGHTING_PROFILES[profile]) : null);
    rig.update(1 / 60, t, position);
    const lit = rig.lights.filter((l) => l.intensity > 0);
    return {
      fluorescent: extras.fixtures.filter((f) => f.kind === 'fluorescent').length,
      total: lit.reduce((s, l) => s + l.intensity, 0),
      reach: lit.reduce((s, l) => s + l.distance, 0) / Math.max(1, lit.length),
      red: lit.reduce((s, l) => s + l.color.r - l.color.b, 0),
      fill: rig.fill.intensity,
    };
  };
  return { sample, dispose() { rig.dispose(); build.dispose(); } };
}

describe('NW-004A lighting profiles', () => {
  it('parses profile targets and ignores fixture and circuit targets', () => {
    expect(profileFromTarget('nw:profile:patient-chase')).toBe('patient-chase');
    expect(profileFromTarget('nw:profile:nope')).toBeNull();
    expect(profileFromTarget('nw:lights:corridor-main')).toBeNull();
  });

  it('blends smoothly from one profile to another and arrives exactly', () => {
    const b = new ProfileBlender('exploration');
    b.activate('nurse-encounter', 10, 2);
    const mid = b.update(11);
    expect(mid.fluorescent).toBeLessThan(1);
    expect(mid.fluorescent).toBeGreaterThan(LIGHTING_PROFILES['nurse-encounter'].fluorescent);
    const end = b.update(12.5);
    expect(end.fluorescent).toBeCloseTo(LIGHTING_PROFILES['nurse-encounter'].fluorescent, 6);
    expect(end.id).toBe('nurse-encounter');
    // Strength mixes with exploration.
    b.activate('patient-chase', 20, 0, 0.5);
    expect(b.update(20).emergency).toBeCloseTo((1 + LIGHTING_PROFILES['patient-chase'].emergency) / 2, 6);
  });

  it('reshapes the real ward lighting: darker pools for the Nurse, red emergency light for the chase', () => {
    const r = rigAt(new Vector3(-3, 1.6, 0));
    try {
      const explore = r.sample('exploration');
      const original = r.sample(null);
      expect(explore.total).toBeCloseTo(original.total, 5); // exploration is the NW-001A look
      const nurse = r.sample('nurse-encounter');
      expect(nurse.total).toBeLessThan(explore.total * 0.7);
      expect(nurse.reach).toBeLessThan(explore.reach * 0.8);
      const chase = r.sample('patient-chase');
      expect(chase.red).toBeGreaterThan(explore.red + 0.5);
      expect(chase.fill).toBeGreaterThan(explore.fill);
    } finally { r.dispose(); }
  });

  it('supernatural: the lights breathe in a wave that travels along the ward', () => {
    const r = rigAt(new Vector3(0, 1.6, 0));
    try {
      const levels = [0, 0.7, 1.4, 2.1, 2.8].map((t) => r.sample('supernatural', 10 + t).total);
      expect(Math.max(...levels) - Math.min(...levels)).toBeGreaterThan(0.15 * Math.max(...levels));
    } finally { r.dispose(); }
  });
});
