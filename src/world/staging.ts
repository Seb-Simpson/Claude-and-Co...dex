import type { ObjectId, Vec3 } from '../contracts';
import { ROOMS } from './layout';

/**
 * NW-004A cinematic staging anchors for Chapter 1. These are data only: where a camera can stand,
 * where an entity can be posed, and what it looks at. They contain no sequencing; Codex's cutscene
 * player and encounter logic decide when and whether each is used.
 *
 * Conventions: metres, +Y up, north = -Z (same as the world). `yaw` follows the contract
 * convention (0 looks -Z, positive turns left). Camera anchors give a `target` to look at, plus a
 * suggested vertical field of view. Each scene suggests a lighting profile
 * ('nw:profile:<id>', see src/atmosphere/profiles.ts). `tests/world/nw-004a-staging.test.ts`
 * checks that every anchor sits inside its room, every entity mark has floor and room to stand,
 * and every camera has a clear line of sight to its target.
 */
export type StagingScene = 'awakening' | 'nurse-reveal' | 'record-discovery' | 'patient-introduction' | 'stairwell-ending';

export interface StagingAnchor {
  readonly id: ObjectId;
  readonly scene: StagingScene;
  readonly kind: 'camera' | 'entity' | 'player' | 'focus' | 'light';
  readonly roomId: ObjectId;
  readonly position: Vec3;
  /** Camera: point to frame. */
  readonly target?: Vec3;
  /** Entity/player: facing (contract yaw). */
  readonly yaw?: number;
  readonly fov?: number;
  readonly note: string;
}

export interface StagingSceneInfo {
  readonly scene: StagingScene;
  readonly title: string;
  readonly roomId: ObjectId;
  readonly suggestedProfile: string;
  readonly note: string;
}

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const FACE = { north: 0, south: Math.PI, east: -Math.PI / 2, west: Math.PI / 2 } as const;

export const STAGING_SCENES: readonly StagingSceneInfo[] = [
  { scene: 'awakening', title: 'Opening — waking in Room 104', roomId: ROOMS.r104, suggestedProfile: 'nw:profile:exploration', note: 'The player wakes on the unmade bed. The door is open, the TV hisses, and the wheelchair faces the wall.' },
  { scene: 'nurse-reveal', title: 'First Nurse reveal — the nurses’ station', roomId: ROOMS.nurses, suggestedProfile: 'nw:profile:nurse-encounter', note: 'Seen from the corridor across the counter. Lit only by the station’s pool, with the corridor behind falling dark.' },
  { scene: 'record-discovery', title: 'The contradictory medical record — Records 112', roomId: ROOMS.records, suggestedProfile: 'nw:profile:exploration', note: 'The open file on the archivist’s desk, under the one dying tube. When the player looks up, the far aisle is the reveal line.' },
  { scene: 'patient-introduction', title: 'Patient introduction — east corridor beyond the smoke doors', roomId: ROOMS.corridor, suggestedProfile: 'nw:profile:supernatural', note: 'Framed through the open smoke doors, under the hanging EXIT sign at x 16.2. The Patient can also come out of the maintenance passage door (east corridor).' },
  { scene: 'stairwell-ending', title: 'Chapter ending — Stairwell B', roomId: ROOMS.stairwell, suggestedProfile: 'nw:profile:patient-chase', note: 'The chained door, the first flight blocked with junk, the landing. Something waits at the top of the second flight.' },
];

export const STAGING_ANCHORS: readonly StagingAnchor[] = [
  // 1. Awakening (Room 104)
  { id: 'nw:stage:awakening:bed-pov', scene: 'awakening', kind: 'camera', roomId: ROOMS.r104, position: v(-14.25, 1.05, 5.05), target: v(-12.0, 1.35, 1.6), fov: 62, note: 'Eye on the pillow, looking down the bed to the open door.' },
  { id: 'nw:stage:awakening:establishing', scene: 'awakening', kind: 'camera', roomId: ROOMS.r104, position: v(-11.8, 2.3, 2.1), target: v(-14.2, 1.05, 5.0), fov: 55, note: 'High corner by the door, over the sink, looking back at the bed.' },
  { id: 'nw:stage:awakening:player', scene: 'awakening', kind: 'player', roomId: ROOMS.r104, position: v(-12.4, 0, 4.1), yaw: 0, note: 'The existing player spawn, beside the bed.' },
  { id: 'nw:stage:awakening:doorway-figure', scene: 'awakening', kind: 'entity', roomId: ROOMS.corridor, position: v(-12.0, 0, 0.55), yaw: FACE.south, note: 'Just outside the open door, facing in: a silhouette against the corridor tube.' },
  { id: 'nw:stage:awakening:tv', scene: 'awakening', kind: 'focus', roomId: ROOMS.r104, position: v(-15.45, 1.75, 2.75), note: 'The TV (anomaly nw:anomaly:tv-104).' },

  // 2. First Nurse reveal (nurses' station)
  { id: 'nw:stage:nurse-reveal:corridor-approach', scene: 'nurse-reveal', kind: 'camera', roomId: ROOMS.corridor, position: v(-8.2, 1.62, 0.9), target: v(-3.6, 1.35, -3.6), fov: 50, note: 'Player-height approach from the west: the station opens up on the left.' },
  { id: 'nw:stage:nurse-reveal:over-counter', scene: 'nurse-reveal', kind: 'camera', roomId: ROOMS.corridor, position: v(-2.3, 1.55, -0.45), target: v(-3.6, 1.45, -4.3), fov: 45, note: 'Across the counter, down into the back of the station.' },
  { id: 'nw:stage:nurse-reveal:nurse-mark', scene: 'nurse-reveal', kind: 'entity', roomId: ROOMS.nurses, position: v(-3.6, 0, -4.3), yaw: FACE.south, note: 'Behind the counter, at the spawn of the Nurse’s station round, facing the corridor.' },
  { id: 'nw:stage:nurse-reveal:station-pool', scene: 'nurse-reveal', kind: 'light', roomId: ROOMS.nurses, position: v(-3.4, 2.6, -3.8), note: 'Keep the station’s own light on while the corridor dims (circuit nw:lights:nurses-station).' },

  // 3. Contradictory record (Records 112)
  { id: 'nw:stage:record:over-shoulder', scene: 'record-discovery', kind: 'camera', roomId: ROOMS.records, position: v(11.5, 1.65, 4.55), target: v(10.95, 0.78, 5.6), fov: 48, note: 'Over the player’s shoulder onto the open file.' },
  { id: 'nw:stage:record:insert', scene: 'record-discovery', kind: 'camera', roomId: ROOMS.records, position: v(11.35, 1.2, 5.6), target: v(10.95, 0.77, 5.62), fov: 35, note: 'Insert close-up of the page.' },
  { id: 'nw:stage:record:file', scene: 'record-discovery', kind: 'focus', roomId: ROOMS.records, position: v(10.95, 0.77, 5.6), note: 'The patient file (interactable nw:inspect:records-patient-file).' },
  { id: 'nw:stage:record:aisle-figure', scene: 'record-discovery', kind: 'entity', roomId: ROOMS.records, position: v(13.65, 0, 3.9), yaw: FACE.west, note: 'At the far end of the aisle between the racks, facing the desk: the look-up reveal.' },

  // 4. Patient introduction (east corridor)
  { id: 'nw:stage:patient-intro:through-doors', scene: 'patient-introduction', kind: 'camera', roomId: ROOMS.corridor, position: v(5.4, 1.6, 0.2), target: v(16.0, 1.2, 0.2), fov: 40, note: 'Long lens down the corridor, framed by the open smoke doors at x 8.4.' },
  { id: 'nw:stage:patient-intro:mark', scene: 'patient-introduction', kind: 'entity', roomId: ROOMS.corridor, position: v(16.0, 0, 0.3), yaw: FACE.west, note: 'Under the hanging EXIT sign, facing back down the corridor.' },
  { id: 'nw:stage:patient-intro:emerge', scene: 'patient-introduction', kind: 'entity', roomId: ROOMS.east, position: v(19.0, 0, 6.6), yaw: FACE.north, note: 'Alternative: out of the maintenance passage door into the east corridor.' },
  { id: 'nw:stage:patient-intro:exit-sign', scene: 'patient-introduction', kind: 'light', roomId: ROOMS.corridor, position: v(16.2, 2.45, 0), note: 'The double-sided EXIT sign (circuit nw:lights:exit).' },

  // 5. Stairwell ending
  { id: 'nw:stage:stairwell:doorway', scene: 'stairwell-ending', kind: 'camera', roomId: ROOMS.east, position: v(19.5, 1.62, -9.9), target: v(19.0, 1.4, -13.6), fov: 55, note: 'From the east corridor through the stair door, up the blocked first flight.' },
  { id: 'nw:stage:stairwell:landing', scene: 'stairwell-ending', kind: 'camera', roomId: ROOMS.stairwell, position: v(19.55, 3.3, -14.9), target: v(19.5, 1.2, -11.3), fov: 60, note: 'From the half landing, looking back down at the door.' },
  { id: 'nw:stage:stairwell:player', scene: 'stairwell-ending', kind: 'player', roomId: ROOMS.stairwell, position: v(19.95, 0, -11.55), yaw: FACE.north, note: 'Just inside the door, beside the foot of the stairs.' },
  { id: 'nw:stage:stairwell:above', scene: 'stairwell-ending', kind: 'entity', roomId: ROOMS.stairwell, position: v(20.2, 3.4, -11.6), yaw: FACE.south, note: 'At the top of the second flight, level 5 landing edge, looking down.' },
];
