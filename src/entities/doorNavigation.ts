import { Matrix4, Quaternion, Vector3 } from 'three';
import type { DoorMarker, DoorState, HospitalWorld, NavigationAgent, NavigationProvider, Vec3 } from '../contracts';
import type { PhysicsAdapter } from '../physics';

export interface DoorNavigationOptions {
  readonly world: HospitalWorld;
  readonly physics: PhysicsAdapter;
  readonly navigation: NavigationProvider;
  readonly agent: NavigationAgent;
  readonly getDoorState: (id: string) => DoorState | undefined;
  readonly requestDoorOpen: (id: string) => boolean;
  readonly interactionDistance?: number;
}
export interface DoorNavigationAdapter {
  getDoorApproach(from: Vec3, goal: Vec3, localOnly?: boolean): Vec3 | null;
  openNearbyDoor(from: Vec3, goal: Vec3): boolean;
}
interface Doorway { readonly marker: DoorMarker; readonly center: Vector3; readonly normal: Vector3; readonly swingSide: number; readonly swingClearance: number }
const vector = (p: Vec3): Vector3 => new Vector3(p.x, p.y, p.z);
const distance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Bridge for actors that can operate ordinary doors. A blocked route can lead to
 * a reachable door approach; opening still uses the interaction system's swept
 * collision checks. No collider is removed or crossed during planning.
 */
export function createDoorNavigationAdapter(options: DoorNavigationOptions): DoorNavigationAdapter {
  const { world, physics, navigation, agent } = options;
  const reach = options.interactionDistance ?? 1.8;
  if (!Number.isFinite(reach) || reach <= 0) throw new Error('Door interaction distance must be positive');
  world.root.updateWorldMatrix(true, true);
  const doorways: Doorway[] = world.doors.flatMap((marker) => {
    const collider = world.colliders.find((value) => marker.colliderIds.includes(value.id));
    if (!collider || collider.shape.type !== 'box') return [];
    // Imported colliders start at the authored hinge pose, which may be open.
    const localCenter = vector(collider.pose.position).applyMatrix4(marker.object.matrixWorld.clone().invert());
    const rotation = marker.closedPose.rotation;
    const q = new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
    const closed = new Matrix4().compose(vector(marker.closedPose.position), q, new Vector3(1, 1, 1));
    const center = localCenter.clone().applyMatrix4(closed);
    const normal = new Vector3(0, 0, 1).applyQuaternion(q).normalize();
    const openedCenter = localCenter.clone().applyMatrix4(new Matrix4().compose(vector(marker.openPose.position),
      new Quaternion().copy(marker.openPose.rotation), new Vector3(1, 1, 1)));
    return [{ marker, center, normal, swingSide: Math.sign(openedCenter.sub(center).dot(normal)),
      swingClearance: collider.shape.halfExtents.x * 2 + agent.radius + 0.1 }];
  });
  function candidates(from: Vec3, goal: Vec3, requireFreeApproach = true): { doorway: Doorway; approach: Vec3; score: number }[] {
    const at = vector(from), target = vector(goal);
    return doorways.flatMap((doorway) => {
      const state = options.getDoorState(doorway.marker.id);
      if (!state || state === 'locked' || state === 'open') return [];
      const side = at.clone().sub(doorway.center).dot(doorway.normal);
      const targetSide = target.clone().sub(doorway.center).dot(doorway.normal);
      if (side * targetSide >= -0.01) return [];
      // Wait outside the leaf's swept arc on its opening side. A short approach
      // inside that arc would make the actor block its own door animation.
      const clearance = Math.sign(side) === doorway.swingSide
        ? Math.max(agent.radius + 0.45, doorway.swingClearance) : agent.radius + 0.45;
      const approachVector = doorway.center.clone().addScaledVector(doorway.normal, Math.sign(side) * clearance);
      const approach = { x: approachVector.x, y: from.y, z: approachVector.z };
      if (requireFreeApproach && !navigation.isPositionValid(approach, agent)) return [];
      return [{ doorway, approach, score: distance(from, approach) + distance(approach, goal) }];
    }).sort((a, b) => a.score - b.score);
  }
  return {
    getDoorApproach(from, goal, localOnly = false) {
      const direct = distance(from, goal);
      for (const candidate of candidates(from, goal)) {
        if (localOnly && (distance(from, candidate.doorway.center) > reach + agent.radius ||
            candidate.score > direct + reach ||
            !physics.isSegmentFree(from, candidate.approach, agent.radius, agent.height, [], false))) continue;
        const path = navigation.findPath({ from, to: candidate.approach, agent });
        if (path?.reachesGoal) return { ...candidate.approach };
      }
      return null;
    },
    openNearbyDoor(from, goal) {
      for (const { doorway, approach } of candidates(from, goal, false)) {
        if (distance(from, doorway.center) > reach || distance(from, approach) > 0.8) continue;
        const eye = { ...from, y: from.y + Math.min(1.2, agent.height * 0.7) };
        const handle = { x: doorway.center.x, y: eye.y, z: doorway.center.z };
        if (!physics.hasLineOfSight(eye, handle, doorway.marker.colliderIds)) continue;
        if (options.requestDoorOpen(doorway.marker.id)) return true;
      }
      return false;
    },
  };
}
