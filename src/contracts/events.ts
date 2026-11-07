import type { EnvironmentalAnomalyEvent, LightingEvent, ScareTriggerEvent, SoundEvent } from './atmosphere';
import type { ChaseEndedEvent, ChaseStartedEvent, EntityStateEvent, ReflectionEncounter } from './entities';
import type { DoorStateEvent, HidingStateEvent, InteractionEvent, InteractionRequest } from './interactions';
import type { PlayerCaptureEvent, PlayerNoiseEvent } from './player';
import type { Unsubscribe } from './spatial';

/** Synchronous notifications; publishers own validation and state changes. */
export interface GameEventMap {
  'player:noise': PlayerNoiseEvent;
  'player:captured': PlayerCaptureEvent;
  'interaction:request': InteractionRequest;
  'interaction:completed': InteractionEvent;
  'door:state': DoorStateEvent;
  'hiding:state': HidingStateEvent;
  'entity:state': EntityStateEvent;
  'chase:started': ChaseStartedEvent;
  'chase:ended': ChaseEndedEvent;
  'atmosphere:lighting': LightingEvent;
  'atmosphere:sound': SoundEvent;
  'horror:scare': ScareTriggerEvent;
  'horror:anomaly': EnvironmentalAnomalyEvent;
  'horror:reflection': ReflectionEncounter;
}
export interface EventBus<Events extends object> {
  on<K extends keyof Events>(type: K, listener: (payload: Events[K]) => void): Unsubscribe;
  emit<K extends keyof Events>(type: K, payload: Events[K]): void;
}
export type GameEvents = EventBus<GameEventMap>;
