import type { PerspectiveCamera } from 'three';
import type { HidingState } from './interactions';
import type { ObjectId, Vec3, ViewRotation } from './spatial';

export type MovementState = 'idle' | 'walking' | 'sprinting' | 'crouching' | 'hidden' | 'captured';
export interface PlayerSnapshot {
  readonly id: ObjectId;
  /** Feet position; never the camera's eye position. */
  readonly position: Vec3;
  readonly rotation: ViewRotation;
  readonly velocity: Vec3;
  readonly movement: MovementState;
  readonly crouching: boolean;
  readonly grounded: boolean;
  readonly hiding: { readonly state: HidingState; readonly spotId: ObjectId | null };
  readonly captured: boolean;
  readonly camera: PerspectiveCamera;
}
export interface PlayerProvider { getSnapshot(): PlayerSnapshot }
export type PlayerNoiseKind = 'footstep' | 'sprint' | 'interaction' | 'breathing';
/** Gameplay sound used by perception. A sound cue alone does not grant AI information. */
/** timeSeconds is the fixedUpdate simulation clock, shared by all gameplay events. */
export interface PlayerNoiseEvent {
  readonly playerId: ObjectId;
  readonly position: Vec3;
  readonly kind: PlayerNoiseKind;
  /** Maximum hearing distance before optional occlusion/material attenuation. */
  readonly radius: number;
  /** Relative intensity in [0,1]. */
  readonly intensity: number;
  readonly timeSeconds: number;
}
export interface PlayerCaptureEvent {
  readonly playerId: ObjectId;
  readonly entityId: ObjectId;
  readonly position: Vec3;
  readonly timeSeconds: number;
}
