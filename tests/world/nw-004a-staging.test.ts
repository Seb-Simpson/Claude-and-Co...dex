import RAPIER from '@dimforge/rapier3d-compat';
import { Box3, Matrix4, Quaternion, Ray, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { createPhysicsAdapter } from '../../src/physics';
import { createHospitalWorld, getHospitalExtras, STAGING_ANCHORS, STAGING_SCENES } from '../../src/world';

/**
 * NW-004A staging anchors: every anchor is inside its room; every entity/player mark has floor
 * under it and room for a body; every camera sees its target with nothing solid in between.
 * Door leaves are ignored for sightlines, because the cutscene decides which doors are open.
 */
beforeAll(async () => { await RAPIER.init(); });

function solids(hospital: ReturnType<typeof createHospitalWorld>): Box3[] {
  return hospital.world.colliders
    .filter((c) => !c.sensor && c.shape.type === 'box' && !c.id.startsWith('nw:door:') && !/:floor:/.test(c.id))
    .map((c) => {
      const half = (c.shape as { halfExtents: { x: number; y: number; z: number } }).halfExtents;
      const r = c.pose.rotation;
      const m = new Matrix4().compose(new Vector3(c.pose.position.x, c.pose.position.y, c.pose.position.z), new Quaternion(r.x, r.y, r.z, r.w), new Vector3(1, 1, 1));
      // Rotated boxes become their world AABB: conservative (may over-report a block, never miss one).
      return new Box3(new Vector3(-half.x, -half.y, -half.z), new Vector3(half.x, half.y, half.z)).applyMatrix4(m);
    });
}

describe('NW-004A cinematic staging anchors', () => {
  it('covers the five Chapter 1 scenes and is published on the world extras', () => {
    const h = createHospitalWorld({ textures: false });
    try {
      expect(getHospitalExtras(h.world)?.staging).toBe(STAGING_ANCHORS);
      for (const s of STAGING_SCENES) {
        const anchors = STAGING_ANCHORS.filter((a) => a.scene === s.scene);
        expect(anchors.some((a) => a.kind === 'camera'), s.scene).toBe(true);
        expect(anchors.some((a) => a.kind === 'entity' || a.kind === 'focus'), s.scene).toBe(true);
      }
      expect(new Set(STAGING_ANCHORS.map((a) => a.id)).size).toBe(STAGING_ANCHORS.length);
    } finally { h.dispose(); }
  });

  it('places every anchor inside the room it names', () => {
    const h = createHospitalWorld({ textures: false });
    try {
      for (const a of STAGING_ANCHORS) {
        const room = h.world.rooms.find((r) => r.id === a.roomId);
        expect(room, a.id).toBeDefined();
        const b = room!.bounds;
        expect(a.position.x, a.id).toBeGreaterThanOrEqual(b.min.x);
        expect(a.position.x, a.id).toBeLessThanOrEqual(b.max.x);
        expect(a.position.z, a.id).toBeGreaterThanOrEqual(b.min.z);
        expect(a.position.z, a.id).toBeLessThanOrEqual(b.max.z);
      }
    } finally { h.dispose(); }
  });

  it('gives every entity and player mark floor to stand on and room for a body', () => {
    const h = createHospitalWorld({ textures: false });
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const physics = createPhysicsAdapter(world, h.world.colliders);
    try {
      for (const a of STAGING_ANCHORS.filter((x) => x.kind === 'entity' || x.kind === 'player')) {
        const p = { x: a.position.x, y: a.position.y + 0.003, z: a.position.z };
        expect(physics.hasSupport(p, 0.25), a.id).toBe(true);
        expect(physics.isPositionFree(p, 0.25, 1.7, [], false), a.id).toBe(true);
      }
    } finally { physics.dispose(); world.free(); h.dispose(); }
  });

  it('gives every camera a clear line of sight to its target', () => {
    const h = createHospitalWorld({ textures: false });
    try {
      const boxes = solids(h);
      for (const a of STAGING_ANCHORS.filter((x) => x.kind === 'camera')) {
        const from = new Vector3(a.position.x, a.position.y, a.position.z);
        const to = new Vector3(a.target!.x, a.target!.y, a.target!.z);
        const ray = new Ray(from, to.clone().sub(from).normalize());
        const length = from.distanceTo(to);
        const hit = new Vector3();
        // Stop 0.25 m short of the target: the thing being framed is allowed to be solid.
        const blockers = boxes.filter((b) => !b.containsPoint(from) && ray.intersectBox(b, hit) && from.distanceTo(hit) < length - 0.25);
        expect(blockers.map((b) => b.getCenter(new Vector3()).toArray().map((n) => n.toFixed(2)).join(',')), a.id).toEqual([]);
      }
    } finally { h.dispose(); }
  });
});
