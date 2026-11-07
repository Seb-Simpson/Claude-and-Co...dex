import type { ObjectId, Vec3 } from './spatial';

export interface LightingEvent {
  readonly targetId: ObjectId;
  readonly effect: 'restore' | 'blackout' | 'flicker' | 'dim';
  readonly durationSeconds: number;
  readonly intensity?: number;
}
/** Local asset IDs are resolved by the atmosphere module. Never remote paid services. */
export interface SoundEvent {
  readonly cueId: ObjectId;
  readonly action: 'play' | 'stop';
  readonly position?: Vec3;
  readonly volume: number;
  readonly loop: boolean;
}
export interface ScareTriggerEvent {
  readonly triggerId: ObjectId;
  readonly roomId?: ObjectId;
  readonly position?: Vec3;
  readonly intensity: number;
}
export interface EnvironmentalAnomalyEvent {
  readonly anomalyId: ObjectId;
  readonly action: 'start' | 'stop';
  readonly targetId: ObjectId;
  readonly durationSeconds?: number;
}
