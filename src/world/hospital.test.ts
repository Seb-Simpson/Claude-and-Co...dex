import { Mesh, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { ColliderDefinition, GameModule, HospitalWorld, ModuleContext, Vec3 } from '../contracts';
import { validateWorld } from '../integration/validateWorld';
import { createHospitalWorld } from './createHospitalWorld';
import hospitalModule from './hospital.module';

const build = createHospitalWorld({ textures: false });
const world = build.world;

/** Solid colliders that block a walking body (floors and sensors excluded). */
const blockers = world.colliders.filter((c) => !c.sensor && !c.id.includes(':floor:'));

function overlaps(collider: ColliderDefinition, p: Vec3, radius: number, y0: number, y1: number): boolean {
  if (collider.shape.type !== 'box') return false;
  const q = collider.pose.rotation;
  const local = new Vector3(p.x - collider.pose.position.x, 0, p.z - collider.pose.position.z)
    .applyQuaternion(new Quaternion(q.x, q.y, q.z, q.w).invert());
  const h = collider.shape.halfExtents;
  const cy = collider.pose.position.y;
  return Math.abs(local.x) < h.x + radius && Math.abs(local.z) < h.z + radius && cy - h.y < y1 && cy + h.y > y0;
}

function clear(p: Vec3, radius = 0.3, list: readonly ColliderDefinition[] = blockers): ColliderDefinition[] {
  return list.filter((c) => overlaps(c, p, radius, 0.1, 1.7));
}

describe('createHospitalWorld', () => {
  it('passes shared world validation', () => {
    expect(() => validateWorld(world)).not.toThrow();
  });

  it('declares the required spaces with sensible proportions', () => {
    const tags = (tag: string) => world.rooms.filter((r) => r.tags.includes(tag));
    expect(tags('patient-room').length).toBeGreaterThanOrEqual(6);
    for (const tag of ['nurses-station', 'storage', 'treatment', 'maintenance', 'stairwell', 'corridor']) {
      expect(tags(tag).length, tag).toBeGreaterThan(0);
    }
    const corridor = world.rooms.find((r) => r.id === 'nw:ward4:corridor-main')!;
    const width = corridor.bounds.max.z - corridor.bounds.min.z;
    expect(width).toBeGreaterThanOrEqual(2.4);
    expect(width).toBeLessThanOrEqual(3.2);
    expect(corridor.bounds.max.x - corridor.bounds.min.x).toBeGreaterThan(30);
    for (const room of tags('patient-room')) {
      const area = (room.bounds.max.x - room.bounds.min.x) * (room.bounds.max.z - room.bounds.min.z);
      expect(area, room.id).toBeGreaterThan(16);
    }
  });

  it('keeps the stairwell door locked for future expansion', () => {
    const stair = world.doors.find((d) => d.id === 'nw:door:stairwell-b')!;
    expect(stair.initialState).toBe('locked');
    expect(stair.requirements?.[0]?.id).toBe('nw:key:stairwell-b');
  });

  it('aligns every door collider with its hinge pose in the initial state', () => {
    for (const door of world.doors) {
      const collider = world.colliders.find((c) => c.id === door.colliderIds[0])!;
      expect(collider.bodyType).toBe('kinematic');
      expect(collider.interactableId).toBe(door.id);
      const pose = door.initialState === 'open' ? door.openPose : door.closedPose;
      const q = pose.rotation;
      expect(collider.pose.rotation).toEqual(q);
      // The collider centre must lie half a leaf-width from the hinge, at half height.
      const offset = new Vector3(collider.pose.position.x - pose.position.x, 0, collider.pose.position.z - pose.position.z);
      const half = collider.shape.type === 'box' ? collider.shape.halfExtents : { x: 0, y: 0, z: 0 };
      expect(offset.length()).toBeCloseTo(half.x, 2);
      const leafAxis = new Vector3(1, 0, 0).applyQuaternion(new Quaternion(q.x, q.y, q.z, q.w));
      expect(Math.abs(offset.normalize().dot(leafAxis))).toBeCloseTo(1, 3);
      // The door object starts in its initial pose.
      expect(door.object.position.distanceTo(new Vector3(pose.position.x, pose.position.y, pose.position.z))).toBeLessThan(1e-6);
      // Open and closed poses differ by roughly a quarter turn or less.
      const a = new Quaternion(door.closedPose.rotation.x, door.closedPose.rotation.y, door.closedPose.rotation.z, door.closedPose.rotation.w);
      const b = new Quaternion(door.openPose.rotation.x, door.openPose.rotation.y, door.openPose.rotation.z, door.openPose.rotation.w);
      expect(a.angleTo(b)).toBeGreaterThan(0.4);
      expect(a.angleTo(b)).toBeLessThanOrEqual(Math.PI / 2 + 1e-6);
    }
  });

  it('places the player and every entity spawn in clear floor space', () => {
    expect(clear(world.playerSpawn.position, 0.35)).toEqual([]);
    const fixed = blockers.filter((c) => c.bodyType === 'fixed');
    for (const spawn of world.entitySpawns) {
      if (spawn.type === 'reflection') continue; // non-physical mirror encounter
      expect(clear(spawn.position, 0.3, fixed).map((c) => c.id), spawn.id).toEqual([]);
    }
  });

  it('offers at least one clear exit from every hiding spot', () => {
    expect(world.hidingLocations.filter((h) => h.type === 'locker').length).toBeGreaterThanOrEqual(3);
    expect(world.hidingLocations.filter((h) => h.type === 'bed').length).toBeGreaterThanOrEqual(1);
    for (const spot of world.hidingLocations) {
      const clearExits = spot.exitCandidates.filter((e) => clear(e.position, 0.3).length === 0);
      expect(clearExits.length, spot.id).toBeGreaterThan(0);
      expect(clear(spot.exitCandidates[0]!.position, 0.3).map((c) => c.id), `${spot.id} first exit`).toEqual([]);
    }
  });

  it('routes patrols through walkable space (fixed geometry only; doors are dynamic)', () => {
    const fixed = blockers.filter((c) => c.bodyType === 'fixed');
    for (const route of world.patrolRoutes) {
      const points = route.loop ? [...route.points, route.points[0]!] : route.points;
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i]!;
        const b = points[i + 1]!;
        const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.2);
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const p = { x: a.x + (b.x - a.x) * t, y: 0, z: a.z + (b.z - a.z) * t };
          expect(clear(p, 0.25, fixed).map((c) => c.id), `${route.id} segment ${i} at ${p.x.toFixed(2)},${p.z.toFixed(2)}`).toEqual([]);
        }
      }
    }
  });

  it('keeps colliders inside the published world bounds', () => {
    for (const c of world.colliders) {
      const p = c.pose.position;
      expect(p.x).toBeGreaterThan(world.bounds.min.x);
      expect(p.x).toBeLessThan(world.bounds.max.x);
      expect(p.z).toBeGreaterThan(world.bounds.min.z);
      expect(p.z).toBeLessThan(world.bounds.max.z);
    }
  });

  it('publishes presentation metadata for atmosphere and horror modules', () => {
    const fixtures = build.extras.fixtures;
    expect(fixtures.length).toBeGreaterThan(30);
    expect(fixtures.some((f) => f.state === 'flicker')).toBe(true);
    expect(fixtures.some((f) => f.state === 'dead')).toBe(true);
    expect(fixtures.some((f) => f.kind === 'emergency')).toBe(true);
    for (const f of fixtures) expect(f.circuits).toContain('nw:lights:all');
    const anomalyIds = build.extras.anomalies.map((a) => a.id);
    expect(anomalyIds).toEqual(expect.arrayContaining(['nw:anomaly:curtain-103', 'nw:anomaly:tv-104', 'nw:anomaly:lift', 'nw:anomaly:monitor-110']));
    expect(build.extras.soundEmitters.length).toBeGreaterThan(5);
  });

  it('keeps draw-call cost bounded by merging static geometry', () => {
    let meshes = 0;
    world.root.traverse((o) => { if (o instanceof Mesh) meshes++; });
    expect(meshes).toBeLessThan(500);
  });

  it('is deterministic for a given seed', () => {
    const again = createHospitalWorld({ textures: false });
    expect(again.world.colliders.map((c) => c.id)).toEqual(world.colliders.map((c) => c.id));
    expect(again.world.colliders[100]?.pose).toEqual(world.colliders[100]?.pose);
    again.dispose();
  });

  it('registers as the single world module and disposes idempotently', async () => {
    expect(hospitalModule.kind).toBe('world');
    const instance = await (hospitalModule as GameModule).setup({} as ModuleContext);
    const published = instance.world as HospitalWorld;
    expect(() => validateWorld(published)).not.toThrow();
    await instance.dispose();
    const extra = createHospitalWorld({ textures: false });
    extra.dispose();
    expect(() => extra.dispose()).not.toThrow();
  });
});
