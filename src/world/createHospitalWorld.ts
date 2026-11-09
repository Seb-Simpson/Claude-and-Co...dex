import type { Box3 } from 'three';
import type { HospitalWorld } from '../contracts';
import { WorldBuilder } from './core/builder';
import { attachExtras, type HospitalExtras } from './extras';
import { declareActors, declareRooms, PLAYER_SPAWN } from './metadata';
import { buildClinicalRooms } from './rooms/clinical';
import { buildPatientRooms } from './rooms/patientRooms';
import { buildServiceSpaces } from './rooms/service';
import { buildShell } from './rooms/shell';

export interface CreateHospitalWorldOptions {
  /** Deterministic seed for clutter placement and procedural textures. */
  readonly seed?: number;
  /**
   * Generate procedural canvas textures. Defaults to true when a DOM canvas exists; pass false for
   * headless metadata use (tests, tooling). Geometry, colliders and metadata are identical either way.
   */
  readonly textures?: boolean;
  /**
   * Static visuals fully inside these boxes are not drawn, because a Blender-built set replaces them.
   * Colliders, doors, interactables, navigation, lights and anomalies are unchanged.
   */
  readonly suppressVisuals?: readonly Box3[];
}

export interface HospitalWorldBuild {
  /** Contract world: Three.js root, colliders, interactables, doors, hiding spots, spawns, rooms. */
  readonly world: HospitalWorld;
  /** Presentation metadata (light fixtures, anomaly targets, sound emitters) for atmosphere/horror. */
  readonly extras: HospitalExtras;
  /** Static pieces left undrawn by `suppressVisuals` (material and centre), for diagnostics. */
  readonly suppressed: readonly { readonly material: string; readonly center: { x: number; y: number; z: number } }[];
  /** Frees every geometry, material and texture created for this world. Idempotent. */
  dispose(): void;
}

export const HOSPITAL_WORLD_ID = 'nw:hospital:ward-4-west';

/** Builds the Ward 4 West hospital wing. Allocates GPU-side objects lazily (on first render). */
export function createHospitalWorld(options: CreateHospitalWorldOptions = {}): HospitalWorldBuild {
  const builder = new WorldBuilder(options.seed ?? 0x4e57, {
    ...(options.textures === undefined ? {} : { textures: options.textures }),
    ...(options.suppressVisuals ? { suppressVisuals: options.suppressVisuals } : {}),
  });
  try {
    declareRooms(builder);
    buildShell(builder);
    buildPatientRooms(builder);
    buildClinicalRooms(builder);
    buildServiceSpaces(builder);
    declareActors(builder);
    builder.finalize();
  } catch (error) {
    builder.dispose();
    throw error;
  }

  const world: HospitalWorld = {
    id: HOSPITAL_WORLD_ID,
    root: builder.root,
    bounds: { min: { x: -20.4, y: -0.3, z: -15.7 }, max: { x: 22.8, y: 6.1, z: 8.3 } },
    rooms: builder.rooms,
    colliders: builder.colliders,
    interactables: builder.interactables,
    doors: builder.doors,
    hidingLocations: builder.hidingLocations,
    entitySpawns: builder.entitySpawns,
    patrolRoutes: builder.patrolRoutes,
    playerSpawn: PLAYER_SPAWN,
  };
  const extras: HospitalExtras = {
    fixtures: builder.fixtures,
    anomalies: builder.anomalies,
    soundEmitters: builder.soundEmitters,
    rooms: builder.rooms,
    connections: builder.connections,
    sharedMaterials: [],
    reflectiveSurfaces: builder.reflectiveSurfaces,
    sightlines: builder.sightlines,
  };
  attachExtras(builder.root, extras);
  builder.root.updateMatrixWorld(true);

  let disposed = false;
  return {
    world,
    extras,
    suppressed: builder.suppressed,
    dispose() {
      if (disposed) return;
      disposed = true;
      builder.root.removeFromParent();
      builder.dispose();
    },
  };
}
