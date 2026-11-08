import RAPIER from '@dimforge/rapier3d-compat';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DoorMarker, NavigationAgent, Pose, Vec3 } from '../../src/contracts';
import { createPhysicsAdapter } from '../../src/physics/adapter';
import type { CharacterBody } from '../../src/physics/adapter';
import { createNavigationProvider } from '../../src/physics/navigation';
import { createHospitalWorld } from '../../src/world/createHospitalWorld';

const patient: NavigationAgent = { radius: 0.3, height: 1.8, maxSlopeRadians: Math.PI / 4, maxStepHeight: 0.25 };
const player: NavigationAgent = { ...patient, radius: 0.28 };
const resources: { dispose(): void }[] = [];
beforeAll(async () => { await RAPIER.init(); });
afterEach(() => { for (const resource of resources.splice(0).reverse()) resource.dispose(); });
function fixture() {
  const hospital = createHospitalWorld({ textures: false });
  resources.push(hospital);
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  resources.push({ dispose: () => world.free() });
  const physics = createPhysicsAdapter(world, hospital.world.colliders);
  resources.push(physics);
  const navigation = createNavigationProvider(physics, hospital.world.bounds, { cellSize: 0.25 });
  const doorProgress = new Map(hospital.world.doors.map(door => [door.id, door.initialState === 'open' ? 1 : 0]));
  return { hospital: hospital.world, physics, navigation, world, doorProgress };
}
function matrix(pose: Pose): Matrix4 {
  return new Matrix4().compose(new Vector3().copy(pose.position), new Quaternion().copy(pose.rotation), new Vector3(1, 1, 1));
}
function moveDoor(f: ReturnType<typeof fixture>, door: DoorMarker, open: boolean): void {
  const initial = door.initialState === 'open' ? door.openPose : door.closedPose;
  const local = door.colliderIds.map(id => ({ id, matrix: matrix(initial).invert().multiply(matrix(f.hospital.colliders.find(collider => collider.id === id)!.pose)) }));
  const start = f.doorProgress.get(door.id)!;
  // Use the same <=2 degree conservative angular samples as gameplay. No engine
  // step is needed for any query to observe the newly posed door.
  for (let index = 1; index <= 90; index += 1) {
    const progress = start + ((open ? 1 : 0) - start) * index / 90;
    const position = new Vector3().copy(door.closedPose.position).lerp(new Vector3().copy(door.openPose.position), progress);
    const rotation = new Quaternion().copy(door.closedPose.rotation).slerp(new Quaternion().copy(door.openPose.rotation), progress);
    const target = matrix({ position, rotation });
    expect(f.physics.trySetColliderPoses(local.map(entry => {
      const movedPosition = new Vector3(), movedRotation = new Quaternion();
      target.clone().multiply(entry.matrix).decompose(movedPosition, movedRotation, new Vector3());
      return { id: entry.id, pose: { position: movedPosition, rotation: movedRotation } };
    })), `${door.id} angular sample ${index}`).toBe(true);
  }
  f.doorProgress.set(door.id, open ? 1 : 0);
}
function walk(body: CharacterBody, target: Vec3): void {
  for (let tick = 0; tick < 2000; tick += 1) {
    const position = body.getPosition();
    const dx = target.x - position.x, dz = target.z - position.z;
    const remaining = Math.hypot(dx, dz);
    if (remaining <= 0.03) return;
    const step = Math.min(0.09, remaining);
    const result = body.move({ x: dx / remaining * step, y: -0.03, z: dz / remaining * step });
    expect(result.grounded).toBe(true);
    expect(result.position.y).toBeGreaterThanOrEqual(-0.001);
    expect(result.position.y, `floor drift ${JSON.stringify(result.position)} target ${JSON.stringify(target)}`).toBeLessThan(0.02);
  }
  throw new Error(`Capsule could not reach ${JSON.stringify(target)} from ${JSON.stringify(body.getPosition())}`);
}

describe('actual Ward 4 collision and navigation integration', () => {
  it('imports every hospital collider and supports room104 and physical entity spawns without stepping the engine', () => {
    const f = fixture();
    const step = vi.spyOn(f.world, 'step');
    expect(f.hospital.colliders.length).toBeGreaterThanOrEqual(220);
    expect(f.world.colliders.len()).toBe(f.hospital.colliders.length);
    expect(f.hospital.playerSpawn.position).toEqual({ x: -12.4, y: 0, z: 4.1 });
    expect(f.navigation.isPositionValid(f.hospital.playerSpawn.position, player)).toBe(true);
    expect(f.physics.hasSupport(f.hospital.playerSpawn.position, player.radius)).toBe(true);
    for (const spawn of f.hospital.entitySpawns.filter(spawn => spawn.type !== 'reflection')) {
      const agent = spawn.type === 'crawler' ? { ...patient, radius: 0.22, height: 0.65 } : patient;
      expect(f.navigation.isPositionValid(spawn.position, agent), spawn.id).toBe(true);
    }
    const body = f.physics.createCharacter({ position: f.hospital.playerSpawn.position, radius: player.radius, height: player.height });
    for (let tick = 0; tick < 120; tick += 1) expect(body.move({ x: 0, y: -0.03, z: 0 }).grounded).toBe(true);
    expect(body.getPosition().y).toBeCloseTo(0.003, 4);
    expect(step).not.toHaveBeenCalled();
  });

  it('keeps furniture and closed doors solid under large displacement', () => {
    const f = fixture();
    const body = f.physics.createCharacter({ position: f.hospital.playerSpawn.position, radius: player.radius, height: player.height });
    moveDoor(f, f.hospital.doors.find(door => door.id === 'nw:door:room-104')!, false);
    // Room104 door is now closed. A single fast capsule sweep must not reach corridor.
    const blocked = body.move({ x: 0.4, y: -0.03, z: -8 });
    expect(blocked.position.z).toBeGreaterThan(1.7);
    expect(body.canOccupy(blocked.position)).toBe(true);
    const furniture = f.hospital.colliders.find(collider => collider.roomId === 'nw:ward4:room-104' && collider.bodyType === 'fixed' && collider.pose.position.y > 0.1 && collider.pose.position.y < 0.8 && collider.shape.type === 'box');
    expect(furniture).toBeDefined();
    expect(f.physics.isPositionFree({ ...furniture!.pose.position, y: 0 }, player.radius, player.height, [], false)).toBe(false);
  });

  it('updates the whole ward loop as real maintenance doors open and close, with no stale collision cache', () => {
    const f = fixture();
    const route = f.hospital.patrolRoutes.find(route => route.id === 'nw:route:ward-loop')!;
    const west = f.hospital.doors.find(door => door.id === 'nw:door:maintenance-west')!;
    const east = f.hospital.doors.find(door => door.id === 'nw:door:maintenance-east')!;
    // The current hospital starts with both passage doors ajar. Close their
    // actual colliders in this isolated fixture to exercise the blocked case.
    moveDoor(f, west, false);
    moveDoor(f, east, false);
    const query = { from: { x: -5.7, y: 0, z: 7.2 }, to: { x: -5.7, y: 0, z: 4 }, agent: patient };
    expect(f.navigation.findPath(query)).toBeNull();
    // A repeated blocked query must reuse the result rather than repeat A*.
    const scan = vi.spyOn(f.physics, 'isSegmentFree');
    expect(f.navigation.findPath(query)).toBeNull();
    expect(scan).not.toHaveBeenCalled();
    const revision = f.physics.getObstacleRevision!();
    moveDoor(f, west, true);
    moveDoor(f, east, true);
    expect(f.physics.getObstacleRevision!()).toBeGreaterThan(revision);
    const body = f.physics.createCharacter({ position: route.points[0]!, radius: patient.radius, height: patient.height });
    for (let index = 0; index < route.points.length; index += 1) {
      const path = f.navigation.findPath({ from: route.points[index]!, to: route.points[(index + 1) % route.points.length]!, agent: patient });
      expect(path?.reachesGoal, `ward loop leg ${index}`).toBe(true);
      for (let point = 1; point < path!.waypoints.length; point += 1) {
        expect(f.physics.isSegmentFree(path!.waypoints[point - 1]!, path!.waypoints[point]!, patient.radius, patient.height, [], false)).toBe(true);
        walk(body, path!.waypoints[point]!);
      }
    }
    body.dispose();
    expect(f.navigation.findPath(query)?.reachesGoal).toBe(true);
    moveDoor(f, west, false);
    const direct = f.physics.isSegmentFree(query.from, query.to, patient.radius, patient.height, [], false);
    expect(direct).toBe(false);
    // The east door remains open, so the longer hospital loop is still a valid escape.
    expect(f.navigation.findPath(query)?.reachesGoal).toBe(true);
  }, 20000);
});
