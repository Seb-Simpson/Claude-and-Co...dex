import { Object3D } from 'three';
import type { ObjectId, Vec3 } from '../contracts';
import type { WorldBuilder } from './core/builder';
import { ROOMS } from './layout';
import { PLAYER_SPAWN } from './metadata';

/**
 * NW-005A: stable semantic references for the opening (Room 104, the corridor outside, the
 * approach to the nurses' station). Gameplay (Codex) reads these instead of hard-coding
 * coordinates:
 *
 * - as data: `getHospitalExtras(world).opening` (this array), and
 * - as uniquely named `Object3D` nodes under `world.root` (`node`), which is the form
 *   `validateChapterBindings()` already resolves. Moving parts are parented to what moves:
 *   the Room 106 handle node is a child of the Room 106 door group, so it follows the door.
 *
 * Nothing here is behaviour. The card reader, card pickup, intercom line and Nurse appearance are
 * staged by Codex's systems; this module only says where they are. The Blender set
 * (dressing/pipeline/opening.py) builds the visible props at the same positions, and
 * opening.test.ts checks both against each other and against collision.
 *
 * Conventions: metres, +Y up, north = -Z. `yaw` is the contract yaw (0 looks -Z, positive turns
 * left); a prop's yaw is the direction its face looks. `stand` is a validated feet position from
 * which the player can use the prop.
 */
export type OpeningKey =
  | 'player-spawn' | 'room-104-door' | 'card-reader' | 'access-card' | 'intercom-speaker'
  | 'room-106-door' | 'room-106-handle' | 'nurse-first-sight' | 'nurse-first-sight-view' | 'station-approach';

export interface OpeningBinding {
  readonly key: OpeningKey;
  /** Stable world ID. */
  readonly id: ObjectId;
  readonly kind: 'pose' | 'door' | 'prop' | 'audio' | 'entity' | 'camera' | 'path';
  readonly roomId: ObjectId;
  /** Name of the Object3D under world.root that carries this reference. */
  readonly node: string;
  readonly position: Vec3;
  readonly yaw?: number;
  readonly pitch?: number;
  readonly doorId?: ObjectId;
  readonly stand?: Vec3;
  readonly target?: Vec3;
  readonly points?: readonly Vec3[];
  readonly note: string;
}

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const FACE = { north: 0, south: Math.PI, east: -Math.PI / 2, west: Math.PI / 2 } as const;

/** Room 106 door: hinge at x -7.05 (hinge side 'max'), leaf toward -x; the corridor face is -z. */
const HANDLE_106_LOCAL = v(-1.0, 1.0, -0.0725);

export const OPENING_BINDINGS: readonly OpeningBinding[] = [
  {
    key: 'player-spawn', id: 'nw:opening:player-spawn', kind: 'pose', roomId: ROOMS.r104, node: 'nw:opening:player-spawn',
    position: { ...PLAYER_SPAWN.position }, yaw: PLAYER_SPAWN.yaw, pitch: 0,
    note: 'Wakes beside the bed facing the open door (the world player spawn; camera pitch 0).',
  },
  {
    key: 'room-104-door', id: 'nw:opening:room-104-door', kind: 'door', roomId: ROOMS.r104, node: 'nw:opening:room-104-door',
    doorId: 'nw:door:room-104', position: v(-12.0, 1.05, 1.475), stand: v(-12.0, 0, 2.3),
    note: 'The only way out of Room 104. Initially open; gameplay owns its state (door id nw:door:room-104).',
  },
  {
    key: 'card-reader', id: 'nw:opening:card-reader', kind: 'prop', roomId: ROOMS.r104, node: 'nw:opening:card-reader',
    position: v(-12.85, 1.15, 1.575), yaw: FACE.south, doorId: 'nw:door:room-104', stand: v(-12.85, 0, 2.25),
    note: 'Staff card reader on the room side, latch side of the door, 1.15 m. Face looks into the room (+z).',
  },
  {
    key: 'access-card', id: 'nw:opening:access-card', kind: 'prop', roomId: ROOMS.r104, node: 'nw:opening:access-card',
    position: v(-12.9, 0.006, 3.2), yaw: 0.35, stand: v(-12.6, 0, 3.75),
    note: 'E. Shaw’s staff card on its lanyard, face up on the floor between the bed and the door. Visual node: nw:opening:access-card-prop (hide it on pickup).',
  },
  {
    key: 'intercom-speaker', id: 'nw:opening:intercom-speaker', kind: 'audio', roomId: ROOMS.r104, node: 'nw:opening:intercom-speaker',
    position: v(-12.0, 2.42, 1.6), yaw: FACE.south,
    note: 'Ward intercom grille above the door, room side: the source for c1.voice.intercom.* in Room 104. Also a sound emitter of kind ‘intercom’.',
  },
  {
    key: 'room-106-door', id: 'nw:opening:room-106-door', kind: 'door', roomId: ROOMS.r106, node: 'nw:opening:room-106-door',
    doorId: 'nw:door:room-106', position: v(-7.6, 1.05, 1.475), stand: v(-7.6, 0, 0.6),
    note: 'Room 106 door, across the corridor, closed (door id nw:door:room-106).',
  },
  {
    key: 'room-106-handle', id: 'nw:opening:room-106-handle', kind: 'prop', roomId: ROOMS.corridor, node: 'nw:opening:room-106-handle',
    doorId: 'nw:door:room-106', position: v(-8.05, 1.0, 1.4025), yaw: FACE.north, stand: v(-8.05, 0, 0.75),
    note: 'Lever handle on 106’s corridor face. The node is a child of the door group and moves with the leaf; position is the closed pose.',
  },
  {
    key: 'nurse-first-sight', id: 'nw:opening:nurse-first-sight', kind: 'entity', roomId: ROOMS.corridor, node: 'nw:opening:nurse-first-sight',
    position: v(-1.2, 0, 0.0), yaw: FACE.west,
    note: 'Nurse Shaw’s first visible appearance: standing at the far end of the corridor by the station, facing back toward Room 104, 10.8 m from the 104 doorway, lit from behind by the station.',
  },
  {
    key: 'nurse-first-sight-view', id: 'nw:opening:nurse-first-sight-view', kind: 'camera', roomId: ROOMS.corridor, node: 'nw:opening:nurse-first-sight-view',
    position: v(-12.0, 1.6, 0.55), target: v(-1.2, 1.5, 0.0),
    note: 'Where the player first sees her from: stepping out of Room 104 and looking east. The line of sight is clear (tested).',
  },
  {
    key: 'station-approach', id: 'nw:opening:station-approach', kind: 'path', roomId: ROOMS.corridor, node: 'nw:opening:station-approach',
    position: v(-4.2, 0, 0.2), points: [v(-12.4, 0, 4.1), v(-12.0, 0, 2.4), v(-12.0, 0, 0.3), v(-7.0, 0, 0.2), v(-4.2, 0, 0.2)],
    note: 'The walk from the bed to the station lobby (walkable with the player body; tested). No objective markers: the lit station and the signs lead.',
  },
];

/** Adds one named marker per binding under the world root (and the 106 handle under its door). */
export function addOpeningMarkers(b: WorldBuilder): void {
  for (const binding of OPENING_BINDINGS) {
    const node = new Object3D();
    node.name = binding.node;
    node.userData.nwOpening = { key: binding.key, id: binding.id, kind: binding.kind, roomId: binding.roomId, ...(binding.doorId ? { doorId: binding.doorId } : {}) };
    if (binding.key === 'room-106-handle') {
      const door = b.doors.find((d) => d.id === binding.doorId);
      if (!door) throw new Error('Room 106 door missing for the handle marker');
      node.position.set(HANDLE_106_LOCAL.x, HANDLE_106_LOCAL.y, HANDLE_106_LOCAL.z);
      door.object.add(node);
      continue;
    }
    node.position.set(binding.position.x, binding.position.y, binding.position.z);
    if (binding.yaw !== undefined) node.rotation.y = binding.yaw;
    b.root.add(node);
  }
  const intercom = OPENING_BINDINGS.find((x) => x.key === 'intercom-speaker')!;
  b.emitter('intercom', intercom.roomId, intercom.position.x, intercom.position.y, intercom.position.z);
}
