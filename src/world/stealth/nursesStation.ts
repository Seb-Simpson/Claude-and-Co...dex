import { Object3D } from 'three';
import type { HospitalWorld, ObjectId, Vec3 } from '../../contracts';
import type { WorldBuilder } from '../core/builder';
import { ROOMS } from '../layout';
import { STATION_INTERACTIONS, STEALTH } from './layout';

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
  // NW-007B: where Nurse Shaw performs her station actions, and the props they involve.
  for (const [key, it] of Object.entries(STATION_INTERACTIONS)) {
    const node = new Object3D();
    node.name = `nw:station:nurse-${key}`;
    node.position.set(it.stand.x, it.stand.y, it.stand.z);
    node.rotation.y = it.yaw;
    node.userData.nwStation = { key, roomId: ROOMS.nurses, clip: it.clip, yaw: it.yaw, target: { ...it.target }, lookAt: { ...it.lookAt } };
    b.root.add(node);
  }
  for (const [name, p, note] of [
    ['nw:station:call-console', STATION_INTERACTIONS.panel.target, 'Nurse-call master station (reset key) on the back desk.'],
    ['nw:station:call-lamp-104', STATION_INTERACTIONS.panel.lookAt, 'Annunciator lamp for Room 104, lit (art node station_call_led).'],
    ['nw:station:record-104', STATION_INTERACTIONS.records.target, 'Room 104 observation record on the back desk (art in station_print / station_paperwork).'],
  ] as const) {
    const node = new Object3D();
    node.name = name;
    node.position.set(p.x, p.y, p.z);
    node.userData.nwStation = { key: name.slice('nw:station:'.length), roomId: ROOMS.nurses, note };
    b.root.add(node);
  }
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

/** NW-007B: one authored station action for Nurse Shaw. */
export interface StationAction {
  readonly node: string;
  readonly stand: Vec3;
  /** Gameplay yaw convention: 0 = facing -Z. */
  readonly yaw: number;
  readonly clip: string;
  readonly target: Vec3;
  readonly lookAt: Vec3;
}

export interface StationStaging {
  readonly panel: StationAction;
  readonly records: StationAction;
  /** Prop nodes: the console reset key, the lit Room 104 lamp, the Room 104 record. */
  readonly callConsole: Vec3;
  readonly callLamp104: Vec3;
  readonly record104: Vec3;
}

/** Typed accessor over the NW-007B staging nodes. Throws if one is missing. */
export function getStationStaging(world: HospitalWorld): StationStaging {
  const at = (name: string) => {
    const node = world.root.getObjectByName(name);
    if (!node) throw new Error(`Missing station binding ${name}`);
    return node;
  };
  const action = (key: 'panel' | 'records'): StationAction => {
    const node = at(`nw:station:nurse-${key}`);
    const d = node.userData.nwStation as { clip: string; yaw: number; target: Vec3; lookAt: Vec3 };
    return { node: node.name, stand: { x: node.position.x, y: node.position.y, z: node.position.z }, yaw: d.yaw, clip: d.clip, target: d.target, lookAt: d.lookAt };
  };
  const point = (name: string): Vec3 => { const p = at(name).position; return { x: p.x, y: p.y, z: p.z }; };
  return {
    panel: action('panel'), records: action('records'),
    callConsole: point('nw:station:call-console'), callLamp104: point('nw:station:call-lamp-104'), record104: point('nw:station:record-104'),
  };
}
