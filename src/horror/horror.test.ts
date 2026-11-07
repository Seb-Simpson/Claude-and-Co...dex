import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createHospitalWorld } from '../world/createHospitalWorld';
import { createAnomaly } from './anomalies';
import { AnomalyDirector, type DirectorCandidate } from './director';

const candidates = (ids: string[], distance = 10): DirectorCandidate[] => ids.map((id) => ({ id, distance, facing: 0.5, busy: false }));

describe('AnomalyDirector', () => {
  it('waits for the first delay, then respects the cooldown', () => {
    const director = new AnomalyDirector({ firstDelay: [10, 10], cooldown: [30, 30], random: () => 0 });
    expect(director.tick(5, candidates(['a', 'b']))).toBeNull();
    expect(director.tick(10, candidates(['a', 'b']))).toBe('a');
    expect(director.tick(20, candidates(['a', 'b']))).toBeNull();
    expect(director.tick(40, candidates(['a', 'b']))).toBe('b');
  });

  it('never repeats the same anomaly twice running and skips busy or distant ones', () => {
    const director = new AnomalyDirector({ firstDelay: [0, 0], cooldown: [1, 1], random: () => 0 });
    expect(director.tick(0, candidates(['a']))).toBe('a');
    expect(director.tick(2, candidates(['a']))).toBeNull();
    const pool: DirectorCandidate[] = [
      { id: 'busy', distance: 10, facing: 0.5, busy: true },
      { id: 'far', distance: 60, facing: 0.5, busy: false },
      { id: 'close', distance: 1, facing: 0.5, busy: false },
      { id: 'ok', distance: 9, facing: 0.5, busy: false },
    ];
    expect(director.tick(20, pool)).toBe('ok');
  });

  it('stays silent during chases and for a quiet period afterwards', () => {
    const director = new AnomalyDirector({ firstDelay: [0, 0], cooldown: [1, 1], random: () => 0 });
    director.suspend();
    expect(director.tick(5, candidates(['a']))).toBeNull();
    director.resume(10, 25);
    expect(director.tick(20, candidates(['a']))).toBeNull();
    expect(director.tick(36, candidates(['a']))).toBe('a');
  });
});

describe('anomaly runtimes', () => {
  const build = createHospitalWorld({ textures: false });
  const target = (id: string) => build.extras.anomalies.find((a) => a.id === id)!;

  it('opens the lift doors on an empty car and closes them again', () => {
    const lift = target('nw:anomaly:lift');
    if (lift.kind !== 'lift') throw new Error('expected lift');
    const runtime = createAnomaly(lift);
    const leftStart = lift.left.position.z;
    const cues = runtime.start(0);
    expect(cues.map((c) => c.cueId)).toContain('nw:lift-chime');
    runtime.update(3, 0.016, 5);
    expect(lift.left.position.z).toBeLessThan(leftStart - 0.4);
    for (let t = 3; t < 15; t += 0.1) runtime.update(t, 0.1, 5);
    expect(runtime.active).toBe(false);
    expect(lift.left.position.z).toBeCloseTo(leftStart, 5);
  });

  it('billows a curtain and returns it exactly to rest', () => {
    const curtain = target('nw:anomaly:curtain-103');
    if (curtain.kind !== 'curtain') throw new Error('expected curtain');
    const runtime = createAnomaly(curtain);
    const position = curtain.mesh.geometry.getAttribute('position');
    runtime.start(0);
    for (let t = 0; t < 2; t += 0.05) runtime.update(t, 0.05, 4);
    const moved = Array.from(position.array as ArrayLike<number>).some((v, i) => Math.abs(v - curtain.rest[i]!) > 0.01);
    expect(moved).toBe(true);
    for (let t = 2; t < 30; t += 0.05) runtime.update(t, 0.05, 4);
    expect(runtime.active).toBe(false);
    expect(Array.from(position.array as ArrayLike<number>)).toEqual(Array.from(curtain.rest));
  });

  it('drifts the wheelchair a little and only within its amplitude', () => {
    const chair = target('nw:anomaly:wheelchair-104');
    if (chair.kind !== 'creep') throw new Error('expected creep');
    const base = chair.object.rotation.y;
    const runtime = createAnomaly(chair);
    runtime.start(0);
    for (let t = 0; t < 5; t += 0.1) runtime.update(t, 0.1, 3);
    expect(Math.abs(chair.object.rotation.y - base)).toBeLessThanOrEqual(chair.amplitude + 1e-9);
    expect(Math.abs(chair.object.rotation.y - base)).toBeGreaterThan(0.05);
    runtime.reset();
    expect(chair.object.rotation.y).toBe(base);
  });

  it('never moves anomaly targets far from their declared position', () => {
    for (const anomaly of build.extras.anomalies) {
      const runtime = createAnomaly(anomaly);
      runtime.start(0);
      for (let t = 0; t < 12; t += 0.1) runtime.update(t, 0.1, 5);
      const object = anomaly.kind === 'curtain' ? anomaly.mesh : anomaly.kind === 'screen' ? null : anomaly.kind === 'lift' ? anomaly.left : anomaly.object;
      if (object) expect(object.getWorldPosition(new Vector3()).distanceTo(anomaly.position)).toBeLessThan(3);
      runtime.reset();
    }
  });
});
