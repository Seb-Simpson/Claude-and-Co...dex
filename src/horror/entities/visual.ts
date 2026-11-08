import { Group, Vector3 } from 'three';
import type { EntityBehaviourState, EntityType } from '../../contracts';
import { type AnimationProfile, Animator, type FootstepEvent, resolveVisualState, type VisualState } from './animator';
import { CRAWLER_ANIMATION, CRAWLER_CONTACTS, CRAWLER_DIMS, crawlerParts } from './crawler';
import { CRAWLER_MATERIALS, createMaterialSet, type EntityMaterialSet, NURSE_MATERIALS, PATIENT_MATERIALS, WATCHER_MATERIALS } from './materials';
import { NURSE_ANIMATION, NURSE_DIMS, nurseParts } from './nurse';
import { PATIENT_ANIMATION, PATIENT_DIMS, patientParts } from './patient';
import { createRig, type JointName, type Rig } from './rig';
import { WATCHER_ANIMATION, WATCHER_DIMS, WATCHER_POSES, watcherParts } from './watcher';

/** Physical entity types that have a body. The Reflection is a separate, nonphysical presenter. */
export type BodiedEntityType = Exclude<EntityType, 'reflection'>;

/** Everything the presentation needs each frame. All of it comes from gameplay or is measured. */
export interface EntityVisualInput {
  /** Authoritative behaviour from gameplay (`EntitySnapshot.state` / node `userData.behaviourState`). */
  readonly behaviour: EntityBehaviourState;
  /** Horizontal speed in m/s, measured from the gameplay-owned transform. */
  readonly speed: number;
  /** Entity stands in/next to a doorway (enables the Patient's observation pose). */
  readonly nearDoor?: boolean;
  /** Entity is currently visible to the camera (the Watcher only changes pose unobserved). */
  readonly observed?: boolean;
}

export interface EntityVisual {
  readonly type: BodiedEntityType;
  /**
   * Visual root. Parent it under the gameplay-owned entity transform (feet position, facing -Z).
   * The visual never writes to its parent's transform; it only animates its own bones.
   */
  readonly object: Group;
  readonly visualState: VisualState;
  /** Advance animation; returns contact events (footsteps / hand plants) this frame. */
  update(deltaSeconds: number, input: EntityVisualInput): readonly FootstepEvent[];
  /** Presentation override for cinematics or previews; `null` returns control to `update` input. */
  forceState(state: VisualState | null, variant?: number): void;
  /** 1 = solid. Used for reveals and disappearances. */
  setOpacity(value: number): void;
  /** World-space position of a bone (head for sight lines, feet for footsteps and footprints). */
  bonePosition(bone: JointName, target?: Vector3): Vector3;
  dispose(): void;
}

interface Definition {
  readonly dims: ReturnType<typeof createRig>['dims'];
  readonly parts: () => ReturnType<typeof patientParts>;
  readonly materials: Parameters<typeof createMaterialSet>[0];
  readonly animation: AnimationProfile;
  readonly contacts?: typeof CRAWLER_CONTACTS;
  readonly scale: number;
}

const DEFINITIONS: Record<BodiedEntityType, Definition> = {
  patient: { dims: PATIENT_DIMS, parts: () => patientParts(), materials: PATIENT_MATERIALS, animation: PATIENT_ANIMATION, scale: 1 },
  nurse: { dims: NURSE_DIMS, parts: () => nurseParts(), materials: NURSE_MATERIALS, animation: NURSE_ANIMATION, scale: 1 },
  crawler: { dims: CRAWLER_DIMS, parts: () => crawlerParts(), materials: CRAWLER_MATERIALS, animation: CRAWLER_ANIMATION, contacts: CRAWLER_CONTACTS, scale: 1 },
  watcher: { dims: WATCHER_DIMS, parts: () => watcherParts(), materials: WATCHER_MATERIALS, animation: WATCHER_ANIMATION, scale: 1 },
};

export interface CreateEntityVisualOptions {
  /** Desynchronises idle motion between instances. */
  readonly seed?: number;
}

/** Creates a skinned, procedurally animated body for one entity type. */
export function createEntityVisual(type: BodiedEntityType, options: CreateEntityVisualOptions = {}): EntityVisual {
  const definition = DEFINITIONS[type];
  const materials: EntityMaterialSet = createMaterialSet(definition.materials);
  let rig: Rig;
  try {
    rig = createRig(`nw:visual:${type}`, definition.dims, definition.parts(), materials.materials, definition.contacts);
  } catch (error) {
    materials.dispose();
    throw error;
  }
  const seed = options.seed ?? Math.floor(Math.random() * 1000);
  const object = new Group();
  object.name = `nw:entity-visual:${type}`;
  object.add(rig.model);
  const animator = new Animator(rig, definition.animation, seed, type === 'watcher' ? 'stand' : 'idle');
  let behaviour: EntityBehaviourState | null = null;
  let behaviourTime = 0;
  let stillTime = 0;
  let forced: VisualState | null = null;
  let unobservedTime = 0;
  let nextPoseChange = 4 + (seed % 7);
  let disposed = false;

  return {
    type,
    object,
    get visualState() { return animator.state; },
    update(dt, input) {
      if (disposed) return [];
      const step = Math.max(0, Math.min(dt, 0.1));
      if (input.behaviour !== behaviour) { behaviour = input.behaviour; behaviourTime = 0; } else behaviourTime += step;
      stillTime = input.speed < 0.1 ? stillTime + step : 0;
      if (type === 'watcher') {
        // Pose changes are never witnessed: only while nobody is looking.
        if (input.observed) unobservedTime = 0;
        else {
          unobservedTime += step;
          if (unobservedTime > nextPoseChange && forced === null) {
            animator.variant = (animator.variant + 1 + Math.floor(Math.abs(Math.sin(seed + behaviourTime)) * (WATCHER_POSES.length - 1))) % WATCHER_POSES.length;
            unobservedTime = 0;
            nextPoseChange = 5 + Math.abs(Math.sin(seed * 3.1 + behaviourTime)) * 9;
          }
        }
      }
      const next = forced ?? resolveVisualState(type, input.behaviour, input.speed, {
        previous: animator.state, behaviourTime, stillTime, nearDoor: input.nearDoor ?? false,
      });
      animator.setState(next);
      return animator.update(step, input.speed);
    },
    forceState(state, variant) {
      forced = state;
      if (variant !== undefined) animator.variant = variant;
    },
    setOpacity(value) { materials.setOpacity(value); },
    bonePosition(bone, target = new Vector3()) {
      rig.bones[bone].updateWorldMatrix(true, false);
      return target.setFromMatrixPosition(rig.bones[bone].matrixWorld);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      rig.dispose();
      materials.dispose();
      object.removeFromParent();
    },
  };
}
