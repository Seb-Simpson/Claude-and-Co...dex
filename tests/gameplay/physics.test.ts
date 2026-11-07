import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ColliderDefinition, Pose } from '../../src/contracts';
import { createPhysicsAdapter } from '../../src/physics/adapter';

beforeAll(async () => { await RAPIER.init(); });
const identity = { x: 0, y: 0, z: 0, w: 1 };
function box(id: string, x: number, y: number, z: number, hx: number, hy: number, hz: number, bodyType: 'fixed' | 'kinematic' = 'fixed'): ColliderDefinition {
  return { id, bodyType, sensor: false, pose: { position: { x, y, z }, rotation: identity }, shape: { type: 'box', halfExtents: { x: hx, y: hy, z: hz } } };
}
const floor = box('floor', 0, -0.5, 0, 20, 0.5, 20);

describe('Rapier gameplay adapter', () => {
  it('collides with floor and thin walls continuously without an initialization physics step', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const physics = createPhysicsAdapter(world, [floor, box('wall', 2, 1, 0, 0.025, 1, 20)]);
    try {
      const actor = physics.createCharacter({ position: { x: 0, y: 0.01, z: 0 }, height: 1.8, radius: 0.3 });
      const fall = actor.move({ x: 0, y: -100, z: 0 });
      expect(fall.position.y).toBeGreaterThanOrEqual(-0.002);
      expect(fall.position.y).toBeLessThan(0.02);
      expect(fall.grounded).toBe(true);
      const run = actor.move({ x: 100, y: -0.1, z: 3 });
      expect(run.position.x).toBeLessThan(1.68);
      expect(run.position.x).toBeGreaterThan(1.6);
      expect(run.position.z).toBeGreaterThan(2.8);
      expect(run.position.y).toBeGreaterThanOrEqual(-0.002);
      expect(actor.canOccupy(actor.getPosition())).toBe(true);
    } finally { physics.dispose(); world.free(); }
  });

  it('preserves feet when resizing and prevents standing through a ceiling', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const physics = createPhysicsAdapter(world, [floor, box('ceiling', 0, 1.5, 0, 1, 0.1, 1)]);
    try {
      const actor = physics.createCharacter({ position: { x: 0, y: 0.01, z: 0 }, height: 1, radius: 0.3 });
      expect(actor.setHeight(1.8)).toBe(false);
      expect(actor.height).toBe(1);
      actor.move({ x: 3, y: -0.01, z: 0 });
      const feet = actor.getPosition();
      expect(actor.setHeight(1.8)).toBe(true);
      expect(actor.getPosition()).toEqual(feet);
      expect(actor.height).toBe(1.8);
    } finally { physics.dispose(); world.free(); }
  });

  it('separates world visibility from sensors and actor collision', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const physics = createPhysicsAdapter(world, [floor, { ...box('trigger', 1, 1, 0, 0.05, 1, 1), sensor: true }]);
    try {
      const actor = physics.createCharacter({ position: { x: 0, y: 0.01, z: 0 }, height: 1.8, radius: 0.3 });
      const other = physics.createCharacter({ position: { x: 2, y: 0.01, z: 0 }, height: 1.8, radius: 0.3 });
      expect(physics.hasLineOfSight({ x: 0, y: 1, z: 0 }, { x: 3, y: 1, z: 0 })).toBe(true);
      expect(physics.isPositionFree(actor.getPosition(), 0.3, 1.8)).toBe(false);
      expect(actor.canOccupy(actor.getPosition())).toBe(true);
      expect(actor.move({ x: 5, y: 0, z: 0 }).position.x).toBeLessThan(1.41);
      other.setEnabled(false);
      expect(actor.move({ x: 5, y: 0, z: 0 }).position.x).toBeGreaterThan(5);
    } finally { physics.dispose(); world.free(); }
  });

  it('checks moving door poses atomically against actors and updates queries immediately', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const physics = createPhysicsAdapter(world, [floor, box('door', 3, 1, 0, 0.1, 1, 1, 'kinematic')]);
    try {
      const actor = physics.createCharacter({ position: { x: 0, y: 0.01, z: 0 }, height: 1.8, radius: 0.3 });
      const blocked: Pose = { position: { x: 0, y: 1, z: 0 }, rotation: identity };
      expect(physics.trySetColliderPoses([{ id: 'door', pose: blocked }])).toBe(false);
      expect(physics.getColliderPose('door').position.x).toBe(3);
      expect(physics.hasLineOfSight({ x: 2, y: 1, z: 0 }, { x: 4, y: 1, z: 0 })).toBe(false);
      const open: Pose = { position: { x: 3, y: 1, z: 5 }, rotation: identity };
      expect(physics.trySetColliderPoses([{ id: 'door', pose: open }])).toBe(true);
      expect(physics.hasLineOfSight({ x: 2, y: 1, z: 0 }, { x: 4, y: 1, z: 0 })).toBe(true);
      actor.dispose();
    } finally { physics.dispose(); world.free(); }
  });

  it('accepts a touching floor endpoint but rejects a thin wall crossing', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const physics = createPhysicsAdapter(world, [floor, box('thin-wall', 2, 1, 0, 0.005, 1, 4)]);
    try {
      expect(physics.isSegmentFree({ x: 0, y: 0.01, z: 0 }, { x: 0, y: 0, z: 1 }, 0.28, 1.8)).toBe(true);
      expect(physics.isSegmentFree({ x: 0, y: 0.01, z: 0 }, { x: 4, y: 0, z: 0 }, 0.28, 1.8)).toBe(false);
    } finally { physics.dispose(); world.free(); }
  });

  it('uses rotated obstacle normals for collision and sliding', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const wall = box('rotated-wall', 2, 1, 0, 0.025, 1, 5);
    const physics = createPhysicsAdapter(world, [floor, {
      ...wall, pose: { ...wall.pose, rotation: { x: 0, y: Math.sin(Math.PI / 8), z: 0, w: Math.cos(Math.PI / 8) } },
    }]);
    try {
      const actor = physics.createCharacter({ position: { x: 0, y: 0.01, z: 0 }, height: 1.8, radius: 0.3 });
      const moved = actor.move({ x: 4, y: -0.05, z: 0 });
      expect(moved.position.x).toBeLessThan(3.5);
      expect(moved.position.z).toBeGreaterThan(0.5);
      expect(actor.canOccupy(moved.position)).toBe(true);
    } finally { physics.dispose(); world.free(); }
  });

  it('requires footprint support and only disposes owned resources', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const foreign = world.createCollider(RAPIER.ColliderDesc.ball(1).setTranslation(100, 100, 100));
    const physics = createPhysicsAdapter(world, [box('floor', 0, -0.5, 0, 1, 0.5, 1)]);
    expect(physics.hasSupport({ x: 0, y: 0.01, z: 0 }, 0.3)).toBe(true);
    expect(physics.hasSupport({ x: 0.9, y: 0.01, z: 0 }, 0.3)).toBe(false);
    physics.createCharacter({ position: { x: 0, y: 0.01, z: 0 }, height: 1.8, radius: 0.3 });
    physics.dispose();
    physics.dispose();
    expect(world.getCollider(foreign.handle)).toBe(foreign);
    expect(world.colliders.len()).toBe(1);
    world.free();
  });
});
