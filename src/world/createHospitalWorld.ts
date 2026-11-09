import type { Box3 } from 'three';
import type { HospitalWorld } from '../contracts';
import { WorldBuilder } from './core/builder';
import { attachExtras, type HospitalExtras } from './extras';
import { declareActors, declareRooms, PLAYER_SPAWN } from './metadata';
import { buildClinicalRooms } from './rooms/clinical';
import { buildPatientRooms } from './rooms/patientRooms';
import { buildChapter1Details, HAZE_VOLUMES } from './rooms/chapter1';
import { buildRecordsAndElectrical } from './rooms/records';
import { buildServiceSpaces } from './rooms/service';
import { buildShell } from './rooms/shell';
import { buildChapter1Shell } from './rooms/chapter1Shell';
import {
  addChapter1Triggers, buildChapter1Rooms, CHAPTER1_ANCHORS, declareChapter1Actors, declareChapter1Rooms, retagChapter1Rooms,
} from './rooms/chapter1Layout';
import { STAGING_ANCHORS } from './staging';

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
  /**
   * NW-004A: 'classic' (default) is the shipped Ward 4 West. 'chapter1' is the Chapter 1 layout v2
   * gameplay blockout (preview with `?nwLayout=chapter1`). Codex has not adopted it; nothing
   * changes for the classic world.
   */
  readonly layout?: 'classic' | 'chapter1';
  /**
   * Chapter 1 only: door positions for a story stage, until coordinator door transactions exist.
   * 'act1' (default) Records locked; 'act3' Records released; 'alarm' after CONFIRM RELEASE: fire
   * doors shut (closed, not locked), stair barrier and observation-bay door open. 'review' is for
   * blockout review only (walkthrough recording): every ordinary door open, the cell latched.
   */
  readonly chapter1Stage?: 'act1' | 'act3' | 'alarm' | 'review';
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
    layout: options.layout ?? 'classic',
    stage: options.chapter1Stage ?? 'act1',
  });
  const chapter1 = builder.layout === 'chapter1';
  try {
    if (chapter1) declareChapter1Rooms(builder); else declareRooms(builder);
    if (chapter1) buildChapter1Shell(builder); else buildShell(builder);
    buildPatientRooms(builder);
    buildClinicalRooms(builder);
    buildServiceSpaces(builder);
    buildRecordsAndElectrical(builder);
    if (chapter1) buildChapter1Rooms(builder);
    buildChapter1Details(builder);
    if (chapter1) {
      declareChapter1Actors(builder);
      addChapter1Triggers(builder);
      retagChapter1Rooms(builder);
    } else {
      declareActors(builder);
    }
    builder.finalize();
  } catch (error) {
    builder.dispose();
    throw error;
  }

  const world: HospitalWorld = {
    id: HOSPITAL_WORLD_ID,
    root: builder.root,
    bounds: { min: { x: -20.4, y: -0.3, z: -15.7 }, max: { x: 22.8, y: 6.1, z: chapter1 ? 9.7 : 8.3 } },
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
    staging: chapter1 ? CHAPTER1_ANCHORS : STAGING_ANCHORS,
    haze: HAZE_VOLUMES,
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
