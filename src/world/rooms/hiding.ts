import { BoxGeometry, Mesh, MeshBasicMaterial } from 'three';
import type { InteractableMarker, InteractionType, ObjectId, SpawnPoseForExit } from '../../contracts';
import type { WorldBuilder } from '../core/builder';
import { yawQuaternion } from '../core/geometry';
import { collide, type Place, worldPoint } from '../props/common';
import { hidingLocker } from '../props/furniture';

/** Yaw (contract convention: 0 looks -Z, positive turns left) that looks along (dx, dz). */
export const yawToward = (dx: number, dz: number): number => Math.atan2(-dx, -dz);

/**
 * Invisible raycast target for interactables that are part of merged static geometry.
 * Raycasters still hit meshes whose material is not rendered.
 */
export function proxy(b: WorldBuilder, name: string, p: Place, size: readonly [number, number, number], centerY: number): Mesh {
  const material = b.materials.adopt(new MeshBasicMaterial({ visible: false }));
  const mesh = new Mesh(b.own(new BoxGeometry(size[0], size[1], size[2])), material);
  mesh.name = name;
  mesh.position.set(p.x, centerY, p.z);
  mesh.rotation.y = p.yaw;
  mesh.userData.nwProxy = true;
  b.attach(mesh);
  return mesh;
}

export function inspectMarker(b: WorldBuilder, idSuffix: string, type: InteractionType, prompt: string, p: Place, size: readonly [number, number, number], centerY: number, range = 2.0): InteractableMarker {
  const id = `nw:${type}:${idSuffix}`;
  const object = proxy(b, id, p, size, centerY);
  const marker: InteractableMarker = { id, type, object, prompt, range };
  b.interactables.push(marker);
  return marker;
}

/** Under-bed hiding spot bound to an existing bed collider. */
export function addBedHiding(b: WorldBuilder, name: string, p: Place, roomId: ObjectId, bedCollider: ObjectId, exits: readonly SpawnPoseForExit[]): void {
  const id = `nw:bed:${name}`;
  const object = proxy(b, id, p, [1.0, 0.8, 2.05], 0.42);
  b.interactables.push({ id, type: 'bed', object, prompt: 'Hide under bed', range: 1.8, colliderIds: [bedCollider] });
  const first = exits[0]!;
  const look = yawToward(first.position.x - p.x, first.position.z - p.z);
  b.hidingLocations.push({
    id: `nw:hiding:${name}`,
    interactableId: id,
    type: 'bed',
    cameraPose: { position: { x: p.x, y: 0.2, z: p.z }, rotation: yawQuaternion(look) },
    playerPosition: { x: p.x, y: 0, z: p.z },
    exitCandidates: exits,
    capacity: 1,
    colliderIds: [bedCollider],
  });
  void roomId;
}

/** Full-height staff locker the player can hide inside. Front faces local +Z. */
export function addLockerHiding(b: WorldBuilder, name: string, p: Place, roomId: ObjectId): void {
  const id = `nw:locker:${name}`;
  const object = hidingLocker(b, p, name);
  const colliderId = collide(b, p, roomId, 0, 0.975, 0, 0.64, 1.95, 0.58);
  b.interactables.push({ id, type: 'locker', object, prompt: 'Hide in locker', range: 1.6, colliderIds: [colliderId] });
  const front = worldPoint(p, 0, 0, 0.8);
  const frontLeft = worldPoint(p, -0.65, 0, 0.75);
  const frontRight = worldPoint(p, 0.65, 0, 0.75);
  const outward = p.yaw + Math.PI; // camera faces the locker's local +Z
  const eye = worldPoint(p, 0, 1.55, 0.05);
  const feet = worldPoint(p, 0, 0, 0);
  b.hidingLocations.push({
    id: `nw:hiding:${name}`,
    interactableId: id,
    type: 'locker',
    cameraPose: { position: { x: eye.x, y: eye.y, z: eye.z }, rotation: yawQuaternion(outward) },
    playerPosition: { x: feet.x, y: 0, z: feet.z },
    exitCandidates: [front, frontLeft, frontRight].map((v) => ({ position: { x: v.x, y: 0, z: v.z }, yaw: outward })),
    capacity: 1,
    colliderIds: [colliderId],
  });
}
