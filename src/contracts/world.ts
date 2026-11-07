import type { Group } from 'three';
import type { EntitySpawnPoint, PatrolRoute } from './entities';
import type { DoorMarker, HidingLocation, InteractableMarker } from './interactions';
import type { Bounds3, ObjectId, Pose, SpawnPose, Vec3 } from './spatial';

export interface RoomMetadata {
  readonly id: ObjectId;
  readonly name: string;
  readonly bounds: Bounds3;
  readonly tags: readonly string[];
}
export type ColliderShape =
  | { readonly type: 'box'; readonly halfExtents: Vec3 }
  | { readonly type: 'sphere'; readonly radius: number }
  /** Capsule aligned to local Y; halfHeight excludes the hemispherical caps. */
  | { readonly type: 'capsule'; readonly radius: number; readonly halfHeight: number }
  | { readonly type: 'trimesh'; readonly vertices: readonly number[]; readonly indices: readonly number[] };
/** Shape dimensions are local metres. Pose is world-space; scale is baked into shape data. */
export interface ColliderDefinition {
  readonly id: ObjectId;
  readonly shape: ColliderShape;
  readonly pose: Pose;
  readonly bodyType: 'fixed' | 'kinematic';
  readonly sensor: boolean;
  readonly friction?: number;
  readonly restitution?: number;
  readonly roomId?: ObjectId;
  readonly interactableId?: ObjectId;
}
/** World owns visual resources. Physics/gameplay consume metadata without editing world files. */
export interface HospitalWorld {
  readonly id: ObjectId;
  readonly root: Group;
  readonly bounds: Bounds3;
  readonly rooms: readonly RoomMetadata[];
  readonly colliders: readonly ColliderDefinition[];
  /** Every interactive object, including the same DoorMarker objects listed in doors. */
  readonly interactables: readonly InteractableMarker[];
  /** Subset of interactables; repeat the exact same object/id, never a second definition. */
  readonly doors: readonly DoorMarker[];
  readonly hidingLocations: readonly HidingLocation[];
  readonly entitySpawns: readonly EntitySpawnPoint[];
  readonly patrolRoutes: readonly PatrolRoute[];
  readonly playerSpawn: SpawnPose;
}
