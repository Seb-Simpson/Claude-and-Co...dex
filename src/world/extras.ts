import type { Color, InstancedMesh, Material, Mesh, MeshBasicMaterial, Object3D, Sprite, Vector3 } from 'three';
import type { HospitalWorld, ObjectId, RoomMetadata } from '../contracts';

/**
 * Presentation metadata the hospital shares with NIGHT WARD's own atmosphere/horror modules.
 * It is attached to `world.root.userData` so no shared contract changes are needed. Gameplay
 * modules can ignore it entirely.
 */
export type FixtureKind = 'fluorescent' | 'strip' | 'emergency' | 'caged' | 'lamp' | 'monitor' | 'exit' | 'moon' | 'vending' | 'lift';
/** steady: normal; flicker: intermittent; dying: mostly off with bursts; dead: never lights; buzz: on with micro flicker. */
export type FixtureState = 'steady' | 'flicker' | 'dying' | 'dead' | 'buzz';

export type FixturePanel =
  | { readonly type: 'instance'; readonly mesh: InstancedMesh; readonly index: number; readonly color: Color }
  | { readonly type: 'material'; readonly material: MeshBasicMaterial; readonly color: Color };

export interface LightFixture {
  readonly id: ObjectId;
  /** Room ID the light belongs to. */
  readonly roomId: ObjectId;
  /** Lighting-event target groups this fixture answers to, e.g. `nw:lights:corridor-main`. */
  readonly circuits: readonly string[];
  readonly kind: FixtureKind;
  readonly state: FixtureState;
  /** World-space point the light is emitted from. */
  readonly position: Vector3;
  readonly color: number;
  /** Candela when lit (physically based PointLight units). Zero for fixtures that only glow. */
  readonly intensity: number;
  readonly distance: number;
  /** Visible emissive element(s); filled when the world is finalised. */
  panels: FixturePanel[];
  halo: Sprite | null;
  readonly haloOpacity: number;
}

export type AnomalyTarget =
  | {
    readonly kind: 'curtain';
    readonly id: ObjectId;
    readonly roomId: ObjectId;
    readonly position: Vector3;
    readonly mesh: Mesh;
    /** Rest positions of the curtain vertices (local space). */
    readonly rest: Float32Array;
    readonly height: number;
  }
  | {
    readonly kind: 'screen';
    readonly id: ObjectId;
    readonly roomId: ObjectId;
    readonly position: Vector3;
    readonly mode: 'ecg' | 'tv';
    readonly material: MeshBasicMaterial;
    readonly canvas: HTMLCanvasElement | null;
    readonly redraw: ((time: number, mode: 'normal' | 'glitch' | 'flatline' | 'static' | 'off') => void) | null;
  }
  | {
    readonly kind: 'lift';
    readonly id: ObjectId;
    readonly roomId: ObjectId;
    readonly position: Vector3;
    readonly left: Object3D;
    readonly right: Object3D;
    /** Local axis offset (metres) for each panel when fully open. */
    readonly travel: number;
    readonly axis: 'x' | 'z';
  }
  | {
    readonly kind: 'sway';
    readonly id: ObjectId;
    readonly roomId: ObjectId;
    readonly position: Vector3;
    readonly object: Object3D;
    readonly amplitude: number;
  }
  | {
    readonly kind: 'creep';
    readonly id: ObjectId;
    readonly roomId: ObjectId;
    readonly position: Vector3;
    readonly object: Object3D;
    /** Maximum yaw drift in radians. */
    readonly amplitude: number;
  };

export type SoundEmitterKind = 'pipes' | 'stairwell' | 'lift' | 'drip' | 'vent' | 'distant' | 'trolley' | 'door';
export interface SoundEmitter {
  readonly id: ObjectId;
  readonly kind: SoundEmitterKind;
  readonly roomId: ObjectId;
  readonly position: Vector3;
}

/** A mirror or pane of glass where The Reflection may be presented. */
export interface ReflectiveSurface {
  readonly id: ObjectId;
  readonly kind: 'mirror' | 'window' | 'glass';
  readonly roomId: ObjectId;
  /** Centre of the reflective face (world space). */
  readonly position: Vector3;
  /** Unit normal pointing out of the surface into the room. */
  readonly normal: Vector3;
  readonly width: number;
  readonly height: number;
}

/** Long sight lines where a distant silhouette can be glimpsed (presentation only). */
export interface SightlineAnchor {
  readonly id: ObjectId;
  readonly roomId: ObjectId;
  /** Floor position of the figure. */
  readonly position: Vector3;
  /** Yaw (contract convention: 0 faces -Z) the figure stands facing. */
  readonly yaw: number;
}

export interface HospitalExtras {
  readonly fixtures: readonly LightFixture[];
  readonly anomalies: readonly AnomalyTarget[];
  readonly soundEmitters: readonly SoundEmitter[];
  /** Rooms in the same order as `world.rooms`, for quick zone lookups. */
  readonly rooms: readonly RoomMetadata[];
  /** Pairs of room IDs that are open to each other (doors or open thresholds). */
  readonly connections: readonly (readonly [ObjectId, ObjectId])[];
  /** Materials that atmosphere may tint during disturbances (kept for future use). */
  readonly sharedMaterials: readonly Material[];
  readonly reflectiveSurfaces: readonly ReflectiveSurface[];
  readonly sightlines: readonly SightlineAnchor[];
}

const EXTRAS_KEY = 'nightWardHospital';

export function attachExtras(root: Object3D, extras: HospitalExtras): void {
  root.userData[EXTRAS_KEY] = extras;
}

/** Returns hospital presentation metadata when the world was produced by createHospitalWorld. */
export function getHospitalExtras(world: HospitalWorld | null): HospitalExtras | null {
  if (!world) return null;
  const value: unknown = world.root.userData[EXTRAS_KEY];
  if (!value || typeof value !== 'object' || !('fixtures' in value)) return null;
  return value as HospitalExtras;
}

/** Finds the room containing a world position (feet height tolerant). */
export function roomAt(extras: HospitalExtras, position: { x: number; y: number; z: number }): RoomMetadata | null {
  let best: RoomMetadata | null = null;
  let bestArea = Infinity;
  for (const room of extras.rooms) {
    const { min, max } = room.bounds;
    if (position.x < min.x || position.x > max.x || position.z < min.z || position.z > max.z) continue;
    const area = (max.x - min.x) * (max.z - min.z);
    if (area < bestArea) { best = room; bestArea = area; }
  }
  return best;
}
