import { Object3D } from 'three';
import type { HospitalWorld, ObjectId, Vec3 } from '../../contracts';
import type { WorldBuilder } from '../core/builder';
import { ROOMS } from '../layout';
import { STEALTH } from './layout';

/**
 * NW-006A: stable scene bindings for the Nurses' Station stealth space.
 *
 * Every semantic point is a uniquely named Object3D under `world.root` (`nw:stealth:<key>`), with
 * `userData.nwStealth` describing it. Codex reads positions through `getNursesStationStealth(world)`,
 * never from copied coordinates. This module adds no enemy AI, detection or progression.
 */
export interface StealthPoint {
  readonly key: string;
  readonly node: string;
  readonly position: Vec3;
  readonly roomId: ObjectId;
  readonly note: string;
}

export interface NursesStationStealth {
  /** Player entry from the corridor approach. */
  readonly entry: StealthPoint;
  /** Safe observation point: watch the nurse from here; she cannot see the player beyond 7 m. */
  readonly observation: StealthPoint;
  /** Crouch-learning location: stand here and crouch, and the covered linen trolley hides you from the station. */
  readonly crouchCover: StealthPoint;
  /** The linen trolley collider (the node sits at its centre; node name kept as `screen` for compatibility). */
  readonly screen: StealthPoint;
  /** Nurse patrol waypoints, in route order (the existing route nw:route:station-round). */
  readonly patrolWaypoints: readonly StealthPoint[];
  readonly patrolRouteId: ObjectId;
  /** Primary hiding location: the staff locker inside the station. */
  readonly hidingPrimary: ObjectId;
  /**
   * Second, optional concealment: the under-bed hiding in Room 105 (door already open), next to the
   * observation point. The room's open floor is visible from the corridor; only the hiding conceals.
   */
  readonly hidingSecondary: ObjectId;
  /** Approach point for that hiding (inside Room 105, beside the bed). */
  readonly concealment: StealthPoint;
  /** Stealth route exit toward the next Chapter 1 section. */
  readonly exit: StealthPoint;
  /** Doors on the route (the treatment door, which the route passes). */
  readonly doorIds: readonly ObjectId[];
  /** Environmental audio emitters inside the space: nurse trolley (plays wheel creaks) and the station intercom. */
  readonly emitterIds: readonly ObjectId[];
}

const NODE = (key: string): string => `nw:stealth:${key}`;

/** Publishes every binding as a named node under the world root and records the emitters. */
export function addStealthMarkers(b: WorldBuilder): void {
  const add = (key: string, position: Vec3, roomId: ObjectId, note: string, extra: Record<string, unknown> = {}): void => {
    const node = new Object3D();
    node.name = NODE(key);
    node.position.set(position.x, position.y, position.z);
    node.userData.nwStealth = { key, roomId, note, ...extra };
    b.root.add(node);
  };
  add('entry', STEALTH.entry, ROOMS.corridor, 'Player entry from the corridor approach.');
  add('observation', STEALTH.observation, ROOMS.corridor, 'Safe observation point, west of the station, looking east through the open counter.');
  add('crouch-cover', STEALTH.crouchCover, ROOMS.corridor, 'Stand here and crouch: the linen trolley hides you from the station\u2019s west and centre (not from the east gap).');
  add('screen', STEALTH.screen.centre, ROOMS.corridor, 'Covered linen trolley, 1.2 m high (the cover faces the station). A deliberate collider.', { size: STEALTH.screen.size });
  STEALTH.patrolWaypoints.forEach((p, i) => add(`patrol-${i}`, p, ROOMS.nurses, `Nurse patrol waypoint ${i} (route nw:route:station-round).`, { index: i }));
  add('concealment', STEALTH.concealment, ROOMS.r105, 'Room 105, beside bed B: slide under it (nw:hiding:room-105-bed-b) when she turns onto the corridor.', { hidingId: STEALTH.hidingSecondary });
  add('exit', STEALTH.exit, ROOMS.corridor, 'Stealth route exit toward the next Chapter 1 section.');
  // Emitters: the trolley on the nurse's route (sounds ahead of her) and the station intercom.
  const before = b.soundEmitters.length;
  b.emitter('trolley', ROOMS.nurses, -1.6, 0.9, -5.2);
  b.emitter('intercom', ROOMS.nurses, -3.4, 1.9, -5.9);
  b.root.userData.nwStealthEmitters = b.soundEmitters.slice(before).map((e) => e.id);
}

/** Typed accessor over the named nodes. Throws if a binding is missing (a broken world, not a fallback). */
export function getNursesStationStealth(world: HospitalWorld): NursesStationStealth {
  const find = (key: string): StealthPoint => {
    const node = world.root.getObjectByName(NODE(key));
    if (!node) throw new Error(`Missing stealth binding ${NODE(key)}`);
    const data = node.userData.nwStealth as { roomId: ObjectId; note: string };
    return { key, node: NODE(key), position: { x: node.position.x, y: node.position.y, z: node.position.z }, roomId: data.roomId, note: data.note };
  };
  const patrol = STEALTH.patrolWaypoints.map((_, i) => find(`patrol-${i}`));
  return {
    entry: find('entry'),
    observation: find('observation'),
    crouchCover: find('crouch-cover'),
    screen: find('screen'),
    patrolWaypoints: patrol,
    patrolRouteId: 'nw:route:station-round',
    hidingPrimary: STEALTH.hidingPrimary,
    hidingSecondary: STEALTH.hidingSecondary,
    concealment: find('concealment'),
    exit: find('exit'),
    doorIds: STEALTH.doors,
    emitterIds: world.root.userData.nwStealthEmitters ?? [],
  };
}
