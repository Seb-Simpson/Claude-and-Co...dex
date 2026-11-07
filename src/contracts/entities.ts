import type { PlayerNoiseEvent } from './player';
import type { ObjectId, SpawnPose, Vec3 } from './spatial';

export type EntityType = 'patient' | 'nurse' | 'crawler' | 'watcher' | 'reflection';
export type EntityBehaviourState = 'idle' | 'patrol' | 'investigate' | 'search' | 'pursue' | 'lost-target' | 'return-to-patrol';
export interface EntitySpawnPoint extends SpawnPose {
  readonly id: ObjectId;
  /** Runtime entity identity; the spawn marker id is a separate metadata object identity. */
  readonly entityId: ObjectId;
  readonly type: EntityType;
  readonly roomId?: ObjectId;
  readonly patrolRouteId?: ObjectId;
}
export interface PatrolRoute { readonly id: ObjectId; readonly points: readonly Vec3[]; readonly loop: boolean }
/** Inputs describe observations, not privileged access to a concealed player's coordinates. */
export interface PerceptionInput {
  readonly timeSeconds: number;
  readonly observerPosition: Vec3;
  readonly observerForward: Vec3;
  readonly visiblePlayer: { readonly id: ObjectId; readonly position: Vec3; readonly distance: number } | null;
  readonly heardNoises: readonly PlayerNoiseEvent[];
  readonly witnessedHidingSpotIds: readonly ObjectId[];
}
export interface PerceptionConfig {
  readonly visionRange: number;
  readonly fieldOfViewRadians: number;
  readonly hearingMultiplier: number;
  readonly detectionSeconds: number;
  readonly loseSightSeconds: number;
}
export interface NavigationAgent {
  readonly radius: number;
  readonly height: number;
  readonly maxSlopeRadians: number;
  readonly maxStepHeight: number;
}
export interface NavigationQuery {
  readonly from: Vec3;
  readonly to: Vec3;
  readonly agent: NavigationAgent;
}
export interface NavigationPath {
  readonly waypoints: readonly Vec3[];
  readonly reachesGoal: boolean;
}
export interface LineOfSightQuery {
  readonly from: Vec3;
  readonly to: Vec3;
  readonly ignoreColliderIds?: readonly ObjectId[];
}
/** Navigation providers account for obstacle clearance and dynamic closed doors. */
export interface NavigationProvider {
  findPath(query: NavigationQuery): NavigationPath | null;
  hasLineOfSight(query: LineOfSightQuery): boolean;
  isPositionValid(position: Vec3, agent: NavigationAgent): boolean;
}
export interface LastKnownPlayerPosition {
  readonly playerId: ObjectId;
  readonly position: Vec3;
  readonly timeSeconds: number;
  readonly source: 'vision' | 'sound' | 'witnessed-hiding';
}
export interface EntitySnapshot {
  readonly id: ObjectId;
  readonly type: EntityType;
  readonly position: Vec3;
  readonly state: EntityBehaviourState;
  readonly lastKnownPlayer: LastKnownPlayerPosition | null;
}
export interface EntityStateEvent {
  readonly entityId: ObjectId;
  readonly previous: EntityBehaviourState;
  readonly current: EntityBehaviourState;
}
export interface ChaseStartedEvent {
  readonly chaseId: ObjectId;
  readonly entityId: ObjectId;
  readonly playerId: ObjectId;
  readonly position: Vec3;
  readonly timeSeconds: number;
}
export interface ChaseEndedEvent {
  readonly chaseId: ObjectId;
  readonly entityId: ObjectId;
  readonly playerId: ObjectId;
  readonly reason: 'escaped' | 'captured' | 'cancelled';
  readonly timeSeconds: number;
}
/** The Reflection is a visual encounter, never a physical pursuer. */
export interface ReflectionEncounter {
  readonly id: ObjectId;
  readonly anchorId: ObjectId;
  readonly visible: boolean;
  readonly durationSeconds: number;
}
