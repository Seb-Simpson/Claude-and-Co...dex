import type { DoorState, EntitySnapshot, GameEventMap, PlayerSnapshot, Vec3 } from '../contracts';
import type { InteractionPrompt } from '../gameplay';
import type { EnginePerformanceSnapshot } from '../engine';
export type ApplicationState = 'menu' | 'loading' | 'ready' | 'playing' | 'paused' | 'captured' | 'restarting' | 'error' | 'disposed';
export interface ApplicationSnapshot {
  state: ApplicationState;
  sessionId: number;
  worldId: string | null;
  player: Omit<PlayerSnapshot, 'camera'> | null;
  entities: readonly EntitySnapshot[];
  colliderCount: number;
  frameCount: number;
  renderer: { calls: number; triangles: number; geometries: number; textures: number };
  audioState: AudioContextState | 'locked';
  events: readonly { type: keyof GameEventMap; payload: unknown }[];
  doorStates: Record<string, DoorState>;
  prompt: InteractionPrompt | null;
  error: string | null;
  performance: {
    fixedMaxMs: number; updateMaxMs: number; frameDeltaMaxMs: number;
    /** Gameplay simulation time in this attempt; excludes ready/captured frame work. */
    simulatedSeconds: number;
    engine?: EnginePerformanceSnapshot;
  };
}
/** Opt-in QA bridge, installed only when the application URL contains ?test=1. */
export interface ApplicationDiagnostics {
  snapshot(): ApplicationSnapshot;
  teleport(position: Vec3, yaw?: number): boolean;
  aimAt(position: Vec3): void;
  captureForTest(): void;
  restart(): Promise<void>;
  dispose(): Promise<void>;
}
declare global { interface Window { nightWardTest?: ApplicationDiagnostics } }
