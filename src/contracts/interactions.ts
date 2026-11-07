import type { Object3D } from 'three';
import type { ObjectId, Pose, Vec3 } from './spatial';

export type InteractionType = 'door' | 'drawer' | 'cabinet' | 'locker' | 'bed' | 'inspect';
export type InteractionAction = 'open' | 'close' | 'inspect' | 'enter-hiding' | 'exit-hiding';
export type DoorState = 'closed' | 'opening' | 'open' | 'closing' | 'locked' | 'blocked';
export type HidingState = 'outside' | 'entering' | 'hidden' | 'exiting';
export interface InteractionRequirement {
  readonly id: string;
  readonly description: string;
}
/** Object and all descendants can resolve to this marker. IDs are globally unique. */
export interface InteractableMarker {
  readonly id: ObjectId;
  readonly type: InteractionType;
  readonly object: Object3D;
  readonly prompt: string;
  /** Maximum eye-to-surface distance in metres. */
  readonly range: number;
  readonly requirements?: readonly InteractionRequirement[];
  readonly colliderIds?: readonly ObjectId[];
}
/** Door object origin is its hinge; visual transforms and physical colliders must move together. */
export interface DoorMarker extends InteractableMarker {
  readonly type: 'door';
  readonly colliderIds: readonly ObjectId[];
  readonly initialState: DoorState;
  readonly closedPose: Pose;
  readonly openPose: Pose;
  readonly durationSeconds: number;
}
export interface HidingLocation {
  readonly id: ObjectId;
  readonly interactableId: ObjectId;
  readonly type: 'locker' | 'bed';
  /** Full eye pose while concealed. The gameplay module controls the camera transition. */
  readonly cameraPose: Pose;
  /** Feet position while concealed. Never infer this from the camera. */
  readonly playerPosition: Vec3;
  /** Ordered feet positions to validate against collision before exiting. */
  readonly exitCandidates: readonly SpawnPoseForExit[];
  readonly capacity: 1;
  readonly colliderIds: readonly ObjectId[];
}
export interface SpawnPoseForExit { readonly position: Vec3; readonly yaw: number }
export interface HidingOccupancy {
  readonly spotId: ObjectId;
  readonly occupantId: ObjectId | null;
  readonly state: HidingState;
}
export interface InteractionRequest {
  readonly playerId: ObjectId;
  readonly targetId: ObjectId;
  readonly action: InteractionAction;
}
export interface InteractionEvent extends InteractionRequest {
  readonly outcome: 'completed' | 'blocked' | 'denied';
  readonly reason?: string;
  readonly position: Vec3;
}
export interface DoorStateEvent {
  readonly doorId: ObjectId;
  readonly previous: DoorState;
  readonly current: DoorState;
}
export interface HidingStateEvent {
  readonly playerId: ObjectId;
  readonly spotId: ObjectId;
  readonly previous: HidingState;
  readonly current: HidingState;
  /** Observers retain justified knowledge; concealment is never universal invisibility. */
  readonly witnessedBy: readonly ObjectId[];
}
