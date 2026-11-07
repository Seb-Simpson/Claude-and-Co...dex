import type RAPIER from '@dimforge/rapier3d-compat';
import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { GameEvents } from './events';
import type { PlayerProvider } from './player';
import type { HospitalWorld } from './world';

/** Hook-local time: fixedUpdate uses simulation time; update uses clamped render time.
 * Authoritative state and event timestamps must use the fixedUpdate simulation clock. */
export interface FrameContext { readonly deltaSeconds: number; readonly elapsedSeconds: number }
export interface AudioService {
  readonly context: AudioContext | null;
  resume(): Promise<void>;
  dispose(): Promise<void>;
}
export interface EngineServices {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly physics: RAPIER.World;
  readonly audio: AudioService;
}
export type ModuleKind = 'physics' | 'world' | 'gameplay' | 'entities' | 'atmosphere' | 'horror';
export interface ModuleContext {
  readonly engine: EngineServices;
  readonly events: GameEvents;
  readonly world: HospitalWorld | null;
  readonly player: PlayerProvider | null;
}
/** Modules release their own listeners, colliders and visual resources in dispose. */
export interface ModuleInstance {
  readonly world?: HospitalWorld;
  readonly player?: PlayerProvider;
  fixedUpdate?(frame: FrameContext): void;
  update?(frame: FrameContext): void;
  dispose(): void | Promise<void>;
}
export interface GameModule {
  readonly id: string;
  readonly kind: ModuleKind;
  setup(context: ModuleContext): ModuleInstance | Promise<ModuleInstance>;
}
