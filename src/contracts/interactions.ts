import type { Object3D } from 'three';
import type { ObjectId, Pose, Vec3 } from './spatial';

export type InteractionType = 'door' | 'drawer' | 'cabinet' | 'locker' | 'bed' | 'inspect';
export type InteractionAction = 'open' | 'close' | 'inspect' | 'enter-hiding' | 'exit-hiding';
export type DoorState = 'closed' | 'opening' | 'open' | 'closing' | 'locked' | 'blocked';
export type HidingState = 'outside' | 'entering' | 'hidden' | 'exiting';
/** Noise an interaction makes (heard by entities through `player:noise`). `null` on a marker means silent. */
export interface InteractionNoise {
  readonly radius: number;
  readonly intensity: number;
}
/**
 * Hold-to-interact. The action completes after `seconds` of continuous holding while the player
 * keeps looking at the target, stays in place and in range. Releasing, looking away or moving
 * cancels it. A toggle mode (accessibility) replaces holding with press-to-start, press-to-cancel.
 */
export interface InteractionHold {
  readonly seconds: number;
  /** The player must be crouched (e.g. a hatch at floor level). */
  readonly crouch?: boolean;
  /** Verb shown in the prompt while holding ("Unscrewing…"). */
  readonly progressLabel?: string;
}
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
  /** Hold-to-interact (inspect markers only). */
  readonly hold?: InteractionHold;
  /** Overrides the default interaction noise; `null` is silent. */
  readonly noise?: InteractionNoise | null;
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
  /** `cancelled`: a hold was released, interrupted or abandoned before completing. */
  readonly outcome: 'completed' | 'blocked' | 'denied' | 'cancelled';
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
