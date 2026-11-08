import type { EntityBehaviourState, EntityType } from '../../contracts';
import type { Euler3, JointName, Pose, Rig } from './rig';
import { JOINTS } from './rig';

/** Presentation states. Mapped from gameplay behaviour; never fed back to it. */
export type VisualState = 'idle' | 'walk' | 'alert' | 'run' | 'search' | 'observe' | 'lost' | 'listen' | 'stand';
export const VISUAL_STATES: readonly VisualState[] = ['idle', 'walk', 'alert', 'run', 'search', 'observe', 'lost', 'listen', 'stand'];

export interface PoseContext {
  /** Presentation time (seconds). */
  readonly time: number;
  /** Gait cycle position in [0, 1). */
  readonly phase: number;
  /** 0 when standing still, 1 when moving at the state's natural speed. */
  readonly gait: number;
  readonly speed: number;
  /** Seconds since this visual state began. */
  readonly stateTime: number;
  /** Pose variant chosen by the presenter (Watcher poses, idle flavours). */
  readonly variant: number;
  /** Per-instance seed for desynchronised micro-motion. */
  readonly seed: number;
}

export type PoseFn = (ctx: PoseContext) => Pose;

export interface GaitSpec {
  /** Metres travelled per full gait cycle. */
  readonly stride: number;
  /** Cycle phases at which a contact plants, and which contact bone plants. */
  readonly steps: readonly { readonly phase: number; readonly bone: JointName }[];
  /** Speed (m/s) considered "fully walking" for gait weight. */
  readonly fullSpeed: number;
  /** Keep cycling slowly even when stationary (e.g. searching shuffle). */
  readonly idleCadence?: number;
}

export interface AnimationProfile {
  readonly poses: Readonly<Record<VisualState, PoseFn>>;
  readonly gaits: Readonly<Partial<Record<VisualState, GaitSpec>>>;
  /** Blend-in time for each state (seconds). Short values read as sudden, jerky changes. */
  readonly blend: Readonly<Partial<Record<VisualState, number>>>;
}

export interface FootstepEvent { readonly bone: JointName; readonly state: VisualState; readonly speed: number }

const ZERO: Euler3 = [0, 0, 0];
const ease = (t: number): number => t * t * (3 - 2 * t);

export function blendPoses(a: Pose, b: Pose, t: number): Pose {
  const out: Record<string, Euler3> = {};
  for (const joint of JOINTS) {
    const pa = a[joint] ?? ZERO;
    const pb = b[joint] ?? ZERO;
    if (pa === ZERO && pb === ZERO) continue;
    out[joint] = [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2] + (pb[2] - pa[2]) * t];
  }
  const oa = a.hipsOffset ?? ZERO;
  const ob = b.hipsOffset ?? ZERO;
  out.hipsOffset = [oa[0] + (ob[0] - oa[0]) * t, oa[1] + (ob[1] - oa[1]) * t, oa[2] + (ob[2] - oa[2]) * t];
  return out as Pose;
}

/** Drives a rig from a visual state and a measured speed. Never touches the parent transform. */
export class Animator {
  private current: VisualState;
  private previous: VisualState;
  private blendT = 1;
  private blendDuration = 0.5;
  private stateTime = 0;
  private time = 0;
  private phase = 0;
  variant = 0;
  private lastPose: Pose = {};

  constructor(private readonly rig: Rig, private readonly profile: AnimationProfile, private readonly seed: number, initial: VisualState = 'idle') {
    this.current = initial;
    this.previous = initial;
  }

  get state(): VisualState { return this.current; }
  get gaitPhase(): number { return this.phase; }
  get pose(): Pose { return this.lastPose; }

  setState(state: VisualState): boolean {
    if (state === this.current) return false;
    this.previous = this.current;
    this.current = state;
    this.blendT = 0;
    this.blendDuration = this.profile.blend[state] ?? 0.5;
    this.stateTime = 0;
    return true;
  }

  update(dt: number, speed: number): FootstepEvent[] {
    const step = Math.max(0, Math.min(dt, 0.1));
    this.time += step;
    this.stateTime += step;
    this.blendT = Math.min(1, this.blendT + (this.blendDuration > 0 ? step / this.blendDuration : 1));
    const gaitSpec = this.profile.gaits[this.current];
    const events: FootstepEvent[] = [];
    let gait = 0;
    if (gaitSpec) {
      gait = Math.min(1, speed / gaitSpec.fullSpeed);
      const cycles = speed / gaitSpec.stride + (gaitSpec.idleCadence ?? 0) * (1 - gait);
      const before = this.phase;
      this.phase = (this.phase + cycles * step) % 1;
      if (gait > 0.25 || (gaitSpec.idleCadence ?? 0) > 0) {
        for (const s of gaitSpec.steps) {
          const crossed = before <= this.phase ? before < s.phase && this.phase >= s.phase : before < s.phase || this.phase >= s.phase;
          if (crossed && cycles > 0) events.push({ bone: s.bone, state: this.current, speed });
        }
      }
    }
    const ctx = (state: VisualState): PoseContext => ({
      time: this.time, phase: this.phase, gait, speed, stateTime: state === this.current ? this.stateTime : this.stateTime + 10, variant: this.variant, seed: this.seed,
    });
    let pose = this.profile.poses[this.current](ctx(this.current));
    if (this.blendT < 1) pose = blendPoses(this.profile.poses[this.previous](ctx(this.previous)), pose, ease(this.blendT));
    this.lastPose = pose;
    this.rig.apply(pose, true);
    return events;
  }
}

export interface StateResolution {
  readonly previous: VisualState;
  /** Seconds since the gameplay behaviour last changed. */
  readonly behaviourTime: number;
  /** Seconds the entity has been (nearly) stationary. */
  readonly stillTime: number;
  /** Whether the entity stands in or beside a doorway. */
  readonly nearDoor: boolean;
}

/**
 * Pure mapping from authoritative gameplay behaviour + observed motion to a presentation state.
 * Gameplay decides what the entity is doing; this only decides how it looks while doing it.
 */
export function resolveVisualState(type: EntityType, behaviour: EntityBehaviourState, speed: number, r: StateResolution): VisualState {
  const moving = speed > 0.15;
  switch (type) {
    case 'watcher':
      return speed > 0.05 ? 'walk' : 'stand';
    case 'reflection':
      return 'stand';
    case 'nurse':
      if (behaviour === 'pursue') return r.behaviourTime < 0.45 ? 'alert' : 'run';
      if (behaviour === 'investigate') return r.behaviourTime < 1.4 || !moving ? 'listen' : 'walk';
      if (behaviour === 'search' || behaviour === 'lost-target') return 'search';
      return moving ? 'walk' : 'idle';
    case 'crawler':
      if (behaviour === 'pursue') return r.behaviourTime < 0.4 ? 'alert' : 'run';
      if (behaviour === 'investigate') return r.behaviourTime < 0.6 ? 'alert' : moving ? 'walk' : 'search';
      if (behaviour === 'search' || behaviour === 'lost-target') return 'search';
      return moving ? 'walk' : 'idle';
    case 'patient':
    default:
      if (behaviour === 'pursue') return r.behaviourTime < 0.75 ? 'alert' : 'run';
      if (behaviour === 'investigate') {
        if (r.behaviourTime < 0.6 && (r.previous === 'idle' || r.previous === 'walk' || r.previous === 'observe' || r.previous === 'alert')) return 'alert';
        return moving ? 'walk' : 'search';
      }
      if (behaviour === 'search') return 'search';
      if (behaviour === 'lost-target') return 'lost';
      if (moving) return 'walk';
      return r.nearDoor && r.stillTime > 1.0 ? 'observe' : 'idle';
  }
}
