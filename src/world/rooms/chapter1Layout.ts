import { Matrix4, Object3D, Vector3 } from 'three';
import type { ColliderDefinition, ObjectId, RoomMetadata, Vec3 } from '../../contracts';
import { cagedBulb, ceilingRect, floorRect, troffer } from '../architecture';
import type { WorldBuilder } from '../core/builder';
import { box, cylinder } from '../core/geometry';
import { C1, C1_ROOMS, CEILING, ROOMS, T, Z } from '../layout';
import { PLAYER_SPAWN } from '../metadata';
import { SIGN_DANGER, SIGN_PAPER, SIGN_ROOM, SIGN_WARNING, collide, put, sign } from '../props/common';
import {
  beamSeating, cardboardBox, gurney, linenCart, lockerBank, scatteredPapers, vendingMachine, visitorChair, wheelchair,
} from '../props/furniture';
import type { StagingAnchor } from '../staging';
import { addLockerHiding } from './hiding';

const HALF_PI = Math.PI / 2;
/** Contract yaw: 0 looks -Z (north), positive turns left. */
const FACE = { north: 0, south: Math.PI, east: -HALF_PI, west: HALF_PI } as const;
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const bounds = (x0: number, x1: number, z0: number, z1: number, y1: number = CEILING.room): RoomMetadata['bounds'] => ({ min: { x: x0, y: 0, z: z0 }, max: { x: x1, y: y1, z: z1 } });

/** Chapter 1 semantic room keys (Codex `CHAPTER_ROOMS`) → room IDs in this layout. */
export const CHAPTER1_ROOM_BINDINGS = {
  'room-104': ROOMS.r104,
  'patient-wing-a': ROOMS.corridor,
  atrium: C1_ROOMS.wardHall,
  gallery: ROOMS.r107,
  'nurses-station': ROOMS.nurses,
  treatment: ROOMS.treatment,
  'patient-wing-b': C1_ROOMS.wingB,
  records: ROOMS.records,
  electrical: ROOMS.electrical,
  maintenance: ROOMS.maintenance,
  'release-vestibule': C1_ROOMS.vestibule,
  'patient-observation': C1_ROOMS.observationBay,
  'stairwell-b': ROOMS.stairwell,
} as const;

/** Chapter 1 door keys (Codex `doors`) → door IDs. */
export const CHAPTER1_DOOR_BINDINGS = {
  'stair-barrier': 'nw:door:stairwell-b',
  'observation-bay': 'nw:door:observation-bay',
  'service-boundary': 'nw:door:staff-boundary',
} as const;

/** Doors the alarm (CONFIRM RELEASE) shuts; closed, never locked. */
export const CHAPTER1_FIRE_DOORS = [
  'nw:door:hall-west-north', 'nw:door:hall-west-south', 'nw:door:smoke-north', 'nw:door:smoke-south',
  'nw:door:staff-boundary', 'nw:door:east-fire-west', 'nw:door:east-fire-east',
] as const;

/** Service-side doors the Nurse never opens (proposed actor policy; the quiet route depends on it). */
export const CHAPTER1_NURSE_EXCLUDED_DOORS = [
  'nw:door:maintenance-west', 'nw:door:hall-service', 'nw:door:electrical-114', 'nw:door:electrical-service', 'nw:door:vestibule-service',
] as const;

export function declareChapter1Rooms(b: WorldBuilder): void {
  const rooms: RoomMetadata[] = [
    { id: ROOMS.corridor, name: 'Wing A corridor', bounds: bounds(-20, -0.2, Z.corridorN, Z.corridorS, CEILING.corridor), tags: ['corridor', 'main', 'patrol', 'long-sightline', 'wing-a'] },
    { id: C1_ROOMS.wardHall, name: 'Ward hall (old day room)', bounds: bounds(-0.2, 6.0, Z.corridorN, Z.southBack, CEILING.corridor), tags: ['hall', 'hub', 'day-room', 'atrium'] },
    { id: C1_ROOMS.wingB, name: 'Wing B corridor', bounds: bounds(6.0, 18, Z.corridorN, Z.corridorS, CEILING.corridor), tags: ['corridor', 'wing-b', 'chase'] },
    { id: ROOMS.east, name: 'East corridor and lift lobby', bounds: bounds(18, 20.85, -11, Z.maintS, CEILING.corridor), tags: ['corridor', 'junction', 'lift', 'stairwell-access', 'chase'] },
    { id: C1_ROOMS.staffPassage, name: 'Staff passage', bounds: bounds(-6.8, 18, C1.passageEastN, C1.passageS, CEILING.corridor - 0.2), tags: ['corridor', 'staff', 'narrow', 'dark', 'nurse-route', 'dog-leg'] },
    { id: ROOMS.connector, name: 'Service connector', bounds: bounds(-6.8, -4.6, Z.corridorS, Z.southBack, CEILING.corridor), tags: ['corridor', 'connector', 'service-access'] },
    { id: ROOMS.maintenance, name: 'Maintenance passage', bounds: bounds(-6.8, 18, Z.maintN, Z.maintS, CEILING.service), tags: ['service', 'maintenance', 'narrow', 'dark', 'loop'] },
    { id: C1_ROOMS.pumpBay, name: 'Pump bay', bounds: bounds(C1.pumpBayX[0], C1.pumpBayX[1], Z.maintS, C1.pumpBayS, CEILING.service), tags: ['service', 'maintenance', 'hiding'] },
    { id: ROOMS.stairwell, name: 'Stairwell B (ward-level landing)', bounds: bounds(18.15, 20.85, -15.4, -11.15, CEILING.stair), tags: ['stairwell', 'landing', 'exit'] },
    { id: ROOMS.nurses, name: "Nurses' station", bounds: bounds(-6.8, 0.2, Z.northBack, Z.corridorN, CEILING.corridor), tags: ['nurses-station', 'staff', 'lit', 'hiding'] },
    { id: ROOMS.treatment, name: 'Treatment room', bounds: bounds(0.2, 6.6, Z.northBack, Z.northFace), tags: ['treatment', 'clinical', 'hiding'] },
    { id: ROOMS.r107, name: '107 — Observation gallery', bounds: bounds(6.6, 11, Z.northBack, Z.northFace), tags: ['gallery', 'observation', 'one-way-glass', 'dark'] },
    { id: C1_ROOMS.observationBay, name: 'Observation bay', bounds: bounds(11, 18, Z.northBack, Z.northFace), tags: ['observation', 'cell', 'patient', 'barrier'] },
    { id: ROOMS.lift, name: 'Lift car (out of service)', bounds: bounds(21, 22.6, -4.85, -3.15, 2.3), tags: ['lift', 'inaccessible'] },
    { id: ROOMS.r101, name: 'Room 101 — Isolation', bounds: bounds(-20, -15.6, Z.northBack, Z.northFace), tags: ['patient-room', 'isolation', 'window', 'dark'] },
    { id: ROOMS.r103, name: 'Room 103', bounds: bounds(-15.6, -11.2, Z.northBack, Z.northFace), tags: ['patient-room', 'curtained', 'monitor', 'window'] },
    { id: ROOMS.r105, name: 'Room 105 — Semi-private', bounds: bounds(-11.2, -6.8, Z.northBack, Z.northFace), tags: ['patient-room', 'two-bed', 'window', 'hiding'] },
    { id: ROOMS.r102, name: 'Room 102 — Paediatric overflow', bounds: bounds(-20, -15.6, Z.southFace, Z.southBack), tags: ['patient-room', 'paediatric', 'lamp'] },
    { id: ROOMS.r104, name: 'Room 104', bounds: bounds(-15.6, -11.2, Z.southFace, Z.southBack), tags: ['patient-room', 'player-start', 'tv'] },
    { id: ROOMS.r106, name: 'Room 106 — Water damage', bounds: bounds(-11.2, -6.8, Z.southFace, Z.southBack), tags: ['patient-room', 'flooded', 'hiding'] },
    { id: ROOMS.records, name: '112 — Medical Records', bounds: bounds(C1.recordsX[0], C1.recordsX[1], Z.southFace, Z.southBack), tags: ['records', 'archive', 'staff', 'hiding', 'chapter-1'] },
    { id: ROOMS.r110, name: 'Room 110', bounds: bounds(6, 10.4, Z.southFace, Z.southBack), tags: ['patient-room', 'occupied', 'monitor', 'lamp'] },
    { id: C1_ROOMS.vestibule, name: 'Release vestibule', bounds: bounds(C1.vestibuleX[0], C1.vestibuleX[1], Z.southFace, Z.southBack), tags: ['vestibule', 'observation', 'hiding', 'chapter-1'] },
    { id: ROOMS.electrical, name: '114 — Electrical', bounds: bounds(14.2, 18, Z.southFace, Z.southBack), tags: ['service', 'electrical', 'dark', 'maintenance-access', 'chapter-1'] },
  ];
  rooms.forEach((room) => b.room(room));
}

/** Rooms, hiding places, obstacles and BLOCKOUT markers specific to the Chapter 1 layout. */
export function buildChapter1Rooms(b: WorldBuilder): void {
  wardHall(b);
  wingB(b);
  staffPassage(b);
  observationBay(b);
  vestibule(b);
  pumpBay(b);
  eastCorridorChapter1(b);
  wayfindingChapter1(b);
}

/** A labelled grey blockout stand-in: Step B replaces each with a real prop and interaction. */
function blockoutProp(b: WorldBuilder, label: string, x: number, z: number, sx: number, sy: number, sz: number, roomId: ObjectId, yaw = 0, collides = true): void {
  b.block('beigePlastic', x, sy / 2, z, sx, sy, sz, yaw, { tint: 0.55 });
  if (collides) b.solid(x, sy / 2, z, sx, sy, sz, { yaw, roomId, kind: 'prop' });
  sign(b, `BLOCKOUT: ${label}`, SIGN_PAPER, Math.min(0.6, Math.max(sx, sz)), 0.1, new Matrix4().makeRotationY(yaw).setPosition(x, sy + 0.08, z), { canvas: [512, 86] });
}

function wardHall(b: WorldBuilder): void {
  const id = C1_ROOMS.wardHall;
  // The dead upright piano and the longcase clock stopped at 03:17: the hall's landmarks.
  put(b, { x: 3.0, z: 3.2, yaw: 0 }, 'darkWood', box(1.5, 1.25, 0.6), 0, 0.625, 0, 0, 0, 0, { tint: 0.55 });
  put(b, { x: 3.0, z: 3.2, yaw: 0 }, 'whitePlastic', box(1.3, 0.04, 0.2), 0, 0.78, -0.35, 0, 0, 0, { tint: 0.85 });
  collide(b, { x: 3.0, z: 3.2, yaw: 0 }, id, 0, 0.63, 0, 1.5, 1.26, 0.6);
  put(b, { x: 4.25, z: 3.2, yaw: 0 }, 'darkWood', box(0.5, 2.1, 0.38), 0, 1.05, 0, 0, 0, 0, { tint: 0.5 });
  b.add('whitePlastic', cylinder(0.17, 0.17, 0.02, 20), new Matrix4().makeRotationX(HALF_PI).setPosition(4.25, 1.75, 2.99), { tint: 0.95 });
  b.add('rubber', box(0.012, 0.13, 0.006), new Matrix4().makeRotationZ(-0.45).setPosition(4.27, 1.78, 2.975), { shade: 'flat' });
  b.add('rubber', box(0.012, 0.09, 0.006), new Matrix4().makeRotationZ(-2.6).setPosition(4.27, 1.73, 2.975), { shade: 'flat' });
  collide(b, { x: 4.25, z: 3.2, yaw: 0 }, id, 0, 1.05, 0, 0.5, 2.1, 0.38);
  sign(b, 'DAY ROOM', { ...SIGN_ROOM, subtext: 'WARD 4 WEST' }, 0.7, 0.24, new Matrix4().makeRotationY(Math.PI).setPosition(4.1, 2.3, Z.southBack - 0.012), { canvas: [512, 176] });
  beamSeating(b, { x: 0.25, z: 3.9, yaw: HALF_PI }, id, 3);
  vendingMachine(b, { x: 4.95, z: Z.southBack - 0.45, yaw: Math.PI }, id, 'flicker');
  visitorChair(b, { x: 1.4, z: 5.4, yaw: 0.6 }, id, { tipped: true });
  wheelchair(b, { x: 1.2, z: 2.0, yaw: 2.3 }, id);
  scatteredPapers(b, 2.0, 1.2, 0.8, 6);
  // The service door in the south wall leads to the maintenance passage (quiet route).
  sign(b, 'SERVICE — STAFF ONLY', SIGN_WARNING, 0.42, 0.1, new Matrix4().makeRotationY(Math.PI).setPosition(C1.hallService, 2.3, Z.southBack - 0.012), { canvas: [512, 120] });
  // The tray the Nurse's diversion rattles (Codex stages the sound).
  const tray = { x: 2.6, z: -1.05, yaw: 0.2 };
  put(b, tray, 'steel', box(0.5, 0.02, 0.35), 0, 0.9, 0, 0, 0, 0, { tint: 0.9 });
  put(b, tray, 'steel', box(0.03, 0.88, 0.03), 0, 0.44, 0, 0, 0, 0, { tint: 0.7 });
  collide(b, tray, id, 0, 0.45, 0, 0.5, 0.9, 0.35);
}

function wingB(b: WorldBuilder): void {
  const id = C1_ROOMS.wingB;
  // The gurney pinch outside the vestibule (route A and B both start past it).
  gurney(b, { x: 13.0, z: -0.7, yaw: HALF_PI + 0.05 }, id, { sheet: true });
  sign(b, 'RELEASE VESTIBULE', { ...SIGN_ROOM, subtext: 'OBSERVATION PROGRAMME' }, 0.5, 0.2, new Matrix4().makeRotationY(Math.PI).setPosition(C1.vestibuleDoor + 0.95, 1.6, Z.corridorS - 0.012), { canvas: [512, 204] });
}

function staffPassage(b: WorldBuilder): void {
  const id = C1_ROOMS.staffPassage;
  // Narrow, dark, institutional: a laundry cart parked against the north wall, a fire point.
  linenCart(b, { x: 7.8, z: C1.passageN + 0.35, yaw: 0 }, id);
  cardboardBox(b, { x: -5.9, z: C1.passageN + 0.3, yaw: 0.2 }, id, [0.45, 0.4, 0.4]);
  sign(b, 'STAFF ONLY', SIGN_WARNING, 0.36, 0.1, new Matrix4().makeRotationY(HALF_PI).setPosition(0.2 - 0.092, 2.3, C1.passageZ), { canvas: [384, 108] });
  sign(b, 'OBSERVATION PROGRAMME →', SIGN_ROOM, 0.7, 0.12, new Matrix4().setPosition(12.5, 1.9, C1.passageEastN + 0.012), { canvas: [768, 132] });
  b.emitter('vent', id, 5.0, 2.4, C1.passageZ);
  b.sightlines.push({ id: 'nw:sightline:staff-passage-east', roomId: id, position: new Vector3(-5.5, 0, C1.passageZ), yaw: -HALF_PI });
}

function observationBay(b: WorldBuilder): void {
  const id = C1_ROOMS.observationBay;
  // The Patient's cell: padded walls (blockout panels), a bolted bed frame, the observation camera.
  for (const z of [-6.2, -1.75]) b.block('fabricSeat', 14.5, 1.2, z, 6.6, 2.2, 0.06, 0, { tint: [0.75, 0.74, 0.7] });
  put(b, { x: 16.9, z: -5.3, yaw: HALF_PI }, 'steel', box(1.9, 0.45, 0.85), 0, 0.225, 0, 0, 0, 0, { tint: 0.5 });
  collide(b, { x: 16.9, z: -5.3, yaw: HALF_PI }, id, 0, 0.225, 0, 1.9, 0.45, 0.85);
  b.add('steel', cylinder(0.06, 0.06, 0.12, 8), new Matrix4().makeTranslation(17.85, 2.55, -1.75), { tint: 0.4 });
  cagedBulb(b, id, 14.5, 2.6, -4.0, 'dying', 1.4);
  sign(b, 'OBSERVATION — DO NOT ENTER', SIGN_DANGER, 0.5, 0.18, new Matrix4().makeRotationY(-HALF_PI).setPosition(18.15 + 0.012, 2.3, C1.observationDoorZ), { canvas: [512, 184] });
  b.sightlines.push({ id: 'nw:sightline:gallery-glass', roomId: ROOMS.r107, position: new Vector3(9.6, 0, -4.0), yaw: -HALF_PI });
}

function vestibule(b: WorldBuilder): void {
  const id = C1_ROOMS.vestibule;
  const [x0, x1] = C1.vestibuleX;
  floorRect(b, id, x0 + T / 2, x1 - T / 2, Z.southFace, Z.southBack);
  ceilingRect(b, x0 + T / 2, x1 - T / 2, Z.southFace, Z.southBack, CEILING.room, 'ceilingStained');
  troffer(b, id, 12.3, 3.9, CEILING.room, 'buzz', ['nw:lights:vestibule'], { intensity: 3 });
  // The linen cupboard (option C): 3 m from the corridor door, out of view from the junction.
  addLockerHiding(b, 'vestibule-linen', { x: x0 + 0.375, z: 5.7, yaw: HALF_PI }, id);
  // Step B stand-ins: the handle socket and CONFIRM RELEASE panel on the west wall.
  blockoutProp(b, 'HANDLE SOCKET + CONFIRM', x0 + 0.25, 3.4, 0.35, 1.3, 0.8, id);
  sign(b, 'RELEASE VESTIBULE — CONFIRM LOCALLY', SIGN_WARNING, 0.6, 0.12, new Matrix4().makeRotationY(HALF_PI).setPosition(x0 + T / 2 + 0.012, 1.9, 3.4), { canvas: [768, 140] });
  b.emitter('intercom', id, 12.3, CEILING.room - 0.05, 4.4);
}

function pumpBay(b: WorldBuilder): void {
  const id = C1_ROOMS.pumpBay;
  // The migrated storage lockers (IDs kept): route B's hiding places, facing the passage.
  for (const [name, x] of [['storage-a', 4.0], ['storage-b', 4.65], ['storage-c', 5.3]] as const) {
    addLockerHiding(b, name, { x, z: C1.pumpBayS - 0.32, yaw: Math.PI }, id);
  }
  lockerBank(b, { x: 6.2, z: C1.pumpBayS - 0.3, yaw: Math.PI }, id, 1, { ajar: [0] });
  cagedBulb(b, id, 5.1, CEILING.service - 0.4, 8.6, 'flicker', 1.6);
  b.emitter('pipes', id, 5.1, 2.6, 9.0);
}

function eastCorridorChapter1(b: WorldBuilder): void {
  // The band reader beside the barrier, on the landing's east wall (Step B makes it interactive).
  blockoutProp(b, 'BAND READER', 20.75, -11.7, 0.12, 1.3, 0.3, ROOMS.stairwell, 0, false);
  sign(b, 'STAIRWELL B — EXIT', { ...SIGN_ROOM, subtext: 'RETENTION BARRIER' }, 0.7, 0.24, new Matrix4().setPosition(19.5, 2.55, -11 + 0.08), { canvas: [512, 176] });
}

/** Hanging double-sided signs: the only wayfinding (no objective markers). */
function wayfindingChapter1(b: WorldBuilder): void {
  const signs: [number, string, string][] = [
    [-6.9, 'NURSES’ STATION  ·  RECORDS 112  ·  DAY ROOM  →', '←  ROOMS 101 – 106'],
    [9.7, 'ELECTRICAL 114  ·  STAIRS B  →', '←  DAY ROOM  ·  NURSES’ STATION'],
  ];
  for (const [x, east, west] of signs) {
    b.block('whitePlastic', x, 2.43, 0, 0.05, 0.2, 1.3, 0, { shade: 'flat', tint: 0.75 });
    for (const dz of [-0.45, 0.45]) b.block('steel', x, 2.6, dz, 0.01, 0.14, 0.01, 0, { shade: 'flat' });
    for (const [face, text] of [[1, west], [-1, east]] as const) {
      const m = new Matrix4().makeRotationY(face > 0 ? HALF_PI : -HALF_PI).setPosition(x + face * 0.027, 2.43, 0);
      sign(b, text, SIGN_ROOM, 1.26, 0.17, m, { canvas: [1024, 138] });
    }
  }
}

/** One named Object3D per Codex `CHAPTER_TRIGGERS` key: `nw:trigger:<key>`, axis-aligned box. */
export interface TriggerVolume {
  readonly key: string;
  readonly id: ObjectId;
  readonly roomId: ObjectId;
  readonly center: Vec3;
  readonly halfExtents: Vec3;
}

export const CHAPTER1_TRIGGERS: readonly TriggerVolume[] = [
  { key: 'station-entry', roomId: ROOMS.corridor, center: v(-3.6, 0, 0), halfExtents: v(2.4, 1.2, 1.3) },
  { key: 'nurse-introduction-zone', roomId: ROOMS.corridor, center: v(-4.0, 0, -0.5), halfExtents: v(1.0, 1.2, 0.8) },
  { key: 'review-safe-boundary', roomId: ROOMS.nurses, center: v(-5.4, 0, -5.0), halfExtents: v(0.8, 1.2, 0.6) },
  { key: 'records-safe-inspection', roomId: ROOMS.records, center: v(-2.4, 0, 4.4), halfExtents: v(1.9, 1.2, 1.8) },
  { key: 'panel-approach', roomId: ROOMS.electrical, center: v(16.9, 0, 3.2), halfExtents: v(0.9, 1.2, 1.3) },
  { key: 'release-safe-boundary', roomId: C1_ROOMS.vestibule, center: v(12.3, 0, 2.4), halfExtents: v(0.8, 1.2, 0.6) },
  { key: 'patient-introduction-zone', roomId: ROOMS.east, center: v(18.4, 0, -0.2), halfExtents: v(2.4, 1.2, 1.5) },
  { key: 'chase-route-a', roomId: C1_ROOMS.wingB, center: v(10.6, 0, 0), halfExtents: v(0.8, 1.2, 1.35) },
  { key: 'chase-route-b', roomId: C1_ROOMS.vestibule, center: v(12.3, 0, 5.8), halfExtents: v(0.8, 1.2, 0.5) },
  { key: 'stair-safe-landing', roomId: ROOMS.stairwell, center: v(19.9, 0, -12.1), halfExtents: v(0.9, 1.2, 0.6) },
].map((t) => ({ ...t, id: `nw:trigger:${t.key}` }));

export function addChapter1Triggers(b: WorldBuilder): void {
  for (const t of CHAPTER1_TRIGGERS) {
    const node = new Object3D();
    node.name = t.id;
    node.position.set(t.center.x, t.center.y + t.halfExtents.y, t.center.z);
    node.userData.nwTrigger = { key: t.key, roomId: t.roomId, halfExtents: { ...t.halfExtents }, floorY: t.center.y };
    b.root.add(node);
  }
}

/** Every Codex `CHAPTER_ANCHORS` key as data: id `nw:c1:<key>`. Feet poses for player/entity kinds. */
const anchor = (key: string, kind: StagingAnchor['kind'], roomId: ObjectId, position: Vec3, extra: { yaw?: number; target?: Vec3; fov?: number } = {}, note = ''): StagingAnchor => ({
  id: `nw:c1:${key}`, scene: 'chapter1', kind, roomId, position, ...extra, note: note || key,
});
export const CHAPTER1_ANCHORS: readonly StagingAnchor[] = [
  anchor('checkpoint-start', 'player', ROOMS.r104, v(PLAYER_SPAWN.position.x, 0, PLAYER_SPAWN.position.z), { yaw: PLAYER_SPAWN.yaw }),
  anchor('checkpoint-after-nurse', 'player', ROOMS.nurses, v(-5.4, 0, -5.0), { yaw: FACE.north }, 'The review desk at the station’s west end.'),
  anchor('checkpoint-after-records-power', 'player', ROOMS.electrical, v(16.3, 0, 4.5), { yaw: FACE.west }, 'Electrical, facing the internal door to the vestibule.'),
  anchor('checkpoint-before-patient', 'player', C1_ROOMS.vestibule, v(12.3, 0, 2.6), { yaw: FACE.north }, 'Vestibule threshold.'),
  anchor('checkpoint-complete', 'player', ROOMS.stairwell, v(20.2, 0, -12.2), { yaw: FACE.north }),
  anchor('awakening-start', 'camera', ROOMS.r104, v(-14.25, 1.05, 5.05), { target: v(-12.0, 1.35, 1.6), fov: 62 }),
  anchor('awakening-ceiling', 'focus', ROOMS.r104, v(-13.4, CEILING.room, 4.6)),
  anchor('awakening-fixture', 'focus', ROOMS.r104, v(-13.4, CEILING.room - 0.02, 3.6)),
  anchor('awakening-monitor', 'focus', ROOMS.r104, v(-13.4, 1.45, Z.southBack - 0.1)),
  anchor('awakening-wristband', 'focus', ROOMS.r104, v(-12.4, 0.95, 4.0)),
  anchor('awakening-door', 'focus', ROOMS.r104, v(-12.0, 1.2, Z.southFace)),
  anchor('awakening-handoff', 'player', ROOMS.r104, v(-12.4, 0, 3.9), { yaw: FACE.north }),
  anchor('nurse-camera-start', 'camera', ROOMS.corridor, v(-4.2, 1.6, 0.2), { target: v(-3.6, 1.1, -1.75), fov: 55 }),
  anchor('nurse-ledger', 'focus', ROOMS.nurses, v(-3.6, 1.12, -1.75)),
  anchor('nurse-emergence', 'entity', ROOMS.nurses, v(C1.stationStaff, 0, -5.6), { yaw: FACE.south }, 'Just inside the staff door, 6.9 m from the handoff.'),
  anchor('nurse-diversion', 'focus', C1_ROOMS.wardHall, v(2.6, 0.9, -1.05), {}, 'The instrument tray under the treatment window.'),
  anchor('nurse-handoff', 'player', ROOMS.corridor, v(-4.2, 0, 0.2), { yaw: FACE.north }),
  anchor('nurse-stage', 'entity', C1_ROOMS.staffPassage, v(-5.0, 0, C1.passageZ), { yaw: FACE.east }),
  anchor('record-camera-start', 'camera', ROOMS.records, v(-1.1, 1.65, 2.4), { target: v(-4.15, 0.78, 5.6), fov: 50 }),
  anchor('record-identity', 'focus', ROOMS.records, v(-4.07, 0.77, 5.6)),
  anchor('record-receiver', 'focus', ROOMS.records, v(-4.28, 0.8, 5.15)),
  anchor('record-handoff', 'player', ROOMS.records, v(-3.6, 0, 4.1), { yaw: FACE.west }),
  anchor('patient-camera-start', 'camera', C1_ROOMS.vestibule, v(12.3, 1.6, 2.1), { target: v(19.4, 1.2, -1.2), fov: 45 }, 'Inside the vestibule, out of its door east along Wing B to the junction.'),
  anchor('patient-release-door', 'focus', C1_ROOMS.observationBay, v(18.0, 1.1, C1.observationDoorZ)),
  anchor('patient-emergence', 'entity', ROOMS.east, v(19.4, 0, -3.2), { yaw: FACE.south }, '9.8 m from the vestibule door.'),
  anchor('patient-handoff', 'player', C1_ROOMS.vestibule, v(12.3, 0, 2.6), { yaw: FACE.north }),
  anchor('patient-stage', 'entity', C1_ROOMS.observationBay, v(14.5, 0, -4.0), { yaw: FACE.west }, 'Dormant, facing the gallery glass.'),
  anchor('ending-camera-start', 'camera', ROOMS.east, v(19.5, 1.6, -9.4), { target: v(19.5, 1.2, -12.0), fov: 55 }),
  anchor('ending-reader', 'focus', ROOMS.stairwell, v(20.75, 1.3, -11.7)),
  anchor('ending-lower-stair', 'focus', ROOMS.stairwell, v(19.5, -1.2, -14.4)),
  anchor('ending-handoff', 'player', ROOMS.stairwell, v(20.2, 0, -12.2), { yaw: FACE.south }),
  anchor('egress-chime', 'focus', C1_ROOMS.vestibule, v(12.3, CEILING.room - 0.1, 4.4)),
];

/** The Nurse's round and the Patient's post-release search (single level). */
export const NIGHT_ROUND: readonly Vec3[] = [
  v(-6.0, 0, C1.passageZ), v(C1.stationStaff, 0, C1.passageZ), v(C1.stationStaff, 0, -5.4), v(-3.6, 0, -5.1), v(-2.4, 0, -3.0), v(-0.75, 0, -2.9),
  v(-0.75, 0, -0.4), v(1.4, 0, -0.5), v(1.4, 0, -2.6), v(4.7, 0, -3.3), v(4.6, 0, -5.6), v(C1.treatmentStaff, 0, C1.passageZ), v(0.9, 0, C1.passageZ),
  v(-1.2, 0, C1.passageZ),
];
export const WING_B_SEARCH: readonly Vec3[] = [
  v(19.4, 0, -3.2), v(19.4, 0, 0), v(12.3, 0, 0), v(12.3, 0, 3.0), v(12.3, 0, 7.2), v(17.4, 0, 7.25), v(19.5, 0, 6.4), v(19.5, 0, 0),
];

export function declareChapter1Actors(b: WorldBuilder): void {
  b.patrolRoutes.push(
    { id: 'nw:route:night-round', loop: true, points: NIGHT_ROUND },
    { id: 'nw:route:wing-b-search', loop: true, points: WING_B_SEARCH },
  );
  b.entitySpawns.push(
    { id: 'nw:spawn:patient', entityId: 'nw:entity:patient', type: 'patient', position: v(14.5, 0, -4.0), yaw: FACE.west, roomId: C1_ROOMS.observationBay, patrolRouteId: 'nw:route:wing-b-search' },
    { id: 'nw:spawn:nurse', entityId: 'nw:entity:nurse', type: 'nurse', position: v(-5.0, 0, C1.passageZ), yaw: FACE.east, roomId: C1_ROOMS.staffPassage, patrolRouteId: 'nw:route:night-round' },
    { id: 'nw:spawn:watcher', entityId: 'nw:entity:watcher', type: 'watcher', position: v(-19.4, 0, 0.75), yaw: -HALF_PI, roomId: ROOMS.corridor },
    { id: 'nw:spawn:reflection', entityId: 'nw:entity:reflection', type: 'reflection', position: v(5.2, 0, -3.4), yaw: HALF_PI, roomId: ROOMS.treatment },
  );
}

/**
 * Room builders shared with the classic ward tag their pieces with classic room IDs. In Chapter 1
 * the corridor band east of x -0.2 belongs to the ward hall or Wing B: re-tag colliders, fixtures
 * and sound emitters by position so room-scoped systems (atmosphere zones, occlusion) see the
 * right room.
 */
export function retagChapter1Rooms(b: WorldBuilder): void {
  const roomAt = (x: number, z: number, current: string | undefined): string | undefined => {
    if (current !== ROOMS.corridor) return current;
    if (x <= -0.2 || z < Z.corridorN - 0.1 || z > Z.corridorS + 0.1) return current;
    return x < 6.0 ? C1_ROOMS.wardHall : C1_ROOMS.wingB;
  };
  for (let i = 0; i < b.colliders.length; i++) {
    const c = b.colliders[i]!;
    const next = roomAt(c.pose.position.x, c.pose.position.z, c.roomId);
    if (next !== c.roomId) b.colliders[i] = { ...c, roomId: next } as ColliderDefinition;
  }
  for (const f of b.fixtures) {
    const next = roomAt(f.position.x, f.position.z, f.roomId);
    if (next && next !== f.roomId) (f as { roomId: string }).roomId = next;
  }
  for (let i = 0; i < b.soundEmitters.length; i++) {
    const s = b.soundEmitters[i]!;
    const next = roomAt(s.position.x, s.position.z, s.roomId);
    if (next && next !== s.roomId) b.soundEmitters[i] = { ...s, roomId: next };
  }
}
