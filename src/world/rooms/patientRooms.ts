import { Matrix4, Vector3 } from 'three';
import type { ObjectId } from '../../contracts';
import { troffer } from '../architecture';
import type { WorldBuilder } from '../core/builder';
import { box, plane } from '../core/geometry';
import { CEILING, DOORS, ROOMS, Z } from '../layout';
import { SIGN_DANGER, SIGN_PAPER, SIGN_ROOM, sign } from '../props/common';
import {
  bedsideCabinet, bin, cardboardBox, curtain, decal, floorDecal, flowersVase, headwall, hospitalBed, ivStand, mopBucket,
  overbedTable, overturnedBed, plasticSheeting, puddle, scatteredPapers, sinkUnit, teddyBear, visitorChair, vitalsMonitor,
  wallClock, wallTv, wardrobe, wetFloorSign, wheelchair,
} from '../props/furniture';
import { addBedHiding } from './hiding';

const HALF_PI = Math.PI / 2;
/** Yaw that makes a prop's local +Z face the given world axis. */
const FACE = { east: HALF_PI, west: -HALF_PI, south: 0, north: Math.PI } as const;

/** Plaque beside each patient door, on the corridor face. */
function roomPlaque(b: WorldBuilder, number: string, doorX: number, side: 'north' | 'south', offset: number, subtitle?: string): void {
  const z = side === 'north' ? Z.corridorN + 0.012 : Z.corridorS - 0.012;
  const m = new Matrix4().makeRotationY(side === 'north' ? 0 : Math.PI).setPosition(doorX + offset, 1.6, z);
  sign(b, number, { ...SIGN_ROOM, ...(subtitle ? { subtext: subtitle } : {}) }, 0.3, 0.18, m, { canvas: [256, 160] });
  // Patient-name card holder beneath the number.
  b.block('whitePlastic', doorX + offset, 1.4, z + (side === 'north' ? 0.006 : -0.006), 0.26, 0.08, 0.01, 0, { shade: 'flat', tint: 0.85 });
}

function paperNote(b: WorldBuilder, text: string, x: number, y: number, z: number, yaw: number, roll = 0.04): void {
  const m = new Matrix4().makeRotationY(yaw).multiply(new Matrix4().makeRotationZ(roll)).setPosition(x, y, z);
  sign(b, text, SIGN_PAPER, 0.3, 0.2, m, { canvas: [384, 256] });
}

export function buildPatientRooms(b: WorldBuilder): void {
  room101(b);
  room103(b);
  room105(b);
  room107(b);
  room102(b);
  room104(b);
  room106(b);
  room108(b);
  room110(b);
}

/** 101 — Isolation. Plastic sheeting, an overturned bed and the drag mark leading to the door. */
function room101(b: WorldBuilder): void {
  const id = ROOMS.r101;
  roomPlaque(b, '101', DOORS.r101, 'north', -0.95);
  sign(b, 'ISOLATION', { ...SIGN_DANGER, subtext: 'DO NOT ENTER' }, 0.5, 0.3, new Matrix4().setPosition(DOORS.r101 - 0.95, 1.95, Z.corridorN + 0.012), { canvas: [384, 230] });
  troffer(b, id, -17.8, -4.0, CEILING.room, 'dead', []);
  plasticSheeting(b, -19.95, -2.85, -16.9, -2.85, CEILING.room, true);
  plasticSheeting(b, -19.95, -5.4, -18.6, -5.9, CEILING.room, false);
  overturnedBed(b, { x: -18.4, z: -4.4, yaw: 0.28 }, id);
  headwall(b, { x: -20, z: -4.2, yaw: FACE.east }, { dangling: true });
  ivStand(b, { x: -16.9, z: -4.9, yaw: 1.2 }, id, { tipped: true, bag: 'full' });
  bin(b, { x: -16.2, z: -6.1, yaw: 0 }, 'clinical', id);
  bin(b, { x: -15.9, z: -1.55, yaw: Math.PI }, 'sharps');
  floorDecal(b, 'stainDrag', -17.2, -3.2, 2.6, 0.7, -0.9);
  floorDecal(b, 'stainDark', -18.0, -3.9, 1.1, 1.0, 0.4);
  cardboardBox(b, { x: -19.5, z: -2.0, yaw: 0.3 }, id, [0.5, 0.35, 0.4], true);
  scatteredPapers(b, -17.5, -2.6, 0.9, 7);
  decal(b, 'stainWater', new Matrix4().makeRotationY(Math.PI).setPosition(-17.0, 2.3, Z.northBack + 0.01).multiply(new Matrix4().makeRotationY(Math.PI)), 1.4, 0.9);
}

/** 103 — Sedated. Curtain drawn around a bed with a shape under the sheet; the monitor still runs. */
function room103(b: WorldBuilder): void {
  const id = ROOMS.r103;
  roomPlaque(b, '103', DOORS.r103, 'north', -0.95);
  troffer(b, id, -13.4, -3.6, CEILING.room, 'dead', []);
  const bedX = -15.525 + 1.05;
  hospitalBed(b, { x: bedX, z: -4.4, yaw: FACE.east }, id, 'lump', { railsUp: true });
  headwall(b, { x: -15.525, z: -4.4, yaw: FACE.east });
  vitalsMonitor(b, { x: -15.525, z: -3.55, yaw: FACE.east }, id, 'ecg', 'nw:anomaly:monitor-103');
  bedsideCabinet(b, { x: -15.2, z: -5.75, yaw: FACE.east }, id);
  ivStand(b, { x: -15.1, z: -3.2, yaw: 0.4 }, id, { bag: 'full' });
  curtain(b, new Vector3(-15.45, 0, -3.05), new Vector3(-12.75, 0, -3.05), CEILING.room, id, { anomalyId: 'nw:anomaly:curtain-103' });
  curtain(b, new Vector3(-12.75, 0, -3.05), new Vector3(-12.75, 0, -6.3), CEILING.room, id, { gathered: 0.15 });
  visitorChair(b, { x: -12.0, z: -5.6, yaw: FACE.west + 0.3 }, id);
  wardrobe(b, { x: -15.2, z: -2.05, yaw: FACE.east }, id);
  sinkUnit(b, { x: -11.275, z: -3.6, yaw: FACE.west }, id, { mirror: 'covered' });
  overbedTable(b, { x: -13.3, z: -4.9, yaw: FACE.west }, id);
  flowersVase(b, { x: -13.4, z: -4.9, yaw: 0, y: 0.885 }, true);
  wallClock(b, { x: -13.4, z: -1.55, yaw: Math.PI });
}

/** 105 — Semi-private. One bed kept, one stripped; a family's chairs still face the window. */
function room105(b: WorldBuilder): void {
  const id = ROOMS.r105;
  roomPlaque(b, '105', DOORS.r105, 'north', -0.95, 'A · B');
  troffer(b, id, -9.0, -3.4, CEILING.room, 'flicker', [], { intensity: 4 });
  const bedZ = Z.northBack + 1.05;
  hospitalBed(b, { x: -10.1, z: bedZ, yaw: 0 }, id, 'made');
  const hideBed = hospitalBed(b, { x: -7.85, z: bedZ, yaw: 0 }, id, 'stripped');
  headwall(b, { x: -10.1, z: Z.northBack, yaw: 0 }, { width: 1.2 });
  headwall(b, { x: -7.85, z: Z.northBack, yaw: 0 }, { width: 1.2, dangling: true });
  bedsideCabinet(b, { x: -10.85, z: -6.1, yaw: 0 }, id);
  bedsideCabinet(b, { x: -7.1, z: -6.1, yaw: 0 }, id, { drawerOut: true, items: false });
  flowersVase(b, { x: -10.85, z: -6.1, yaw: 0, y: 0.79 }, true);
  curtain(b, new Vector3(-8.97, 0, -6.35), new Vector3(-8.97, 0, -3.4), CEILING.room, id, { gathered: 0.1, anomalyId: 'nw:anomaly:curtain-105' });
  curtain(b, new Vector3(-11.05, 0, -3.3), new Vector3(-9.05, 0, -3.3), CEILING.room, id, { gathered: 0.65 });
  visitorChair(b, { x: -10.3, z: -2.6, yaw: Math.PI + 0.2 }, id);
  visitorChair(b, { x: -9.6, z: -2.4, yaw: Math.PI - 0.15 }, id);
  overbedTable(b, { x: -10.1, z: -4.0, yaw: 0 }, id);
  vitalsMonitor(b, { x: -9.4, z: Z.northBack, yaw: 0 }, id, 'off');
  scatteredPapers(b, -7.6, -3.0, 0.4, 3);
  if (hideBed) addBedHiding(b, 'room-105-bed-b', { x: -7.85, z: bedZ, yaw: 0 }, id, hideBed, [
    { position: { x: -7.85, y: 0, z: -3.75 }, yaw: Math.PI },
    { position: { x: -8.65, y: 0, z: -4.0 }, yaw: Math.PI },
  ]);
}

/** 107 — Restraints. Boarded window, a chair once wedged under the handle, gouges by the bed. */
function room107(b: WorldBuilder): void {
  const id = ROOMS.r107;
  roomPlaque(b, '107', DOORS.r107, 'north', 0.95);
  paperNote(b, 'KEEP LOCKED', DOORS.r107 + 0.95, 1.95, Z.corridorN + 0.014, 0, -0.08);
  troffer(b, id, 8.8, -3.8, CEILING.room, 'dying', [], { intensity: 4.5 });
  hospitalBed(b, { x: 9.5, z: Z.northBack + 1.05, yaw: 0 }, id, 'restraints');
  headwall(b, { x: 9.5, z: Z.northBack, yaw: 0 }, { width: 1.2 });
  visitorChair(b, { x: 7.3, z: -2.6, yaw: 2.4 }, id, { tipped: true });
  overbedTable(b, { x: 8.2, z: -4.2, yaw: 0.7 }, id, { tipped: true });
  wardrobe(b, { x: 10.6, z: -2.1, yaw: FACE.west }, id);
  sinkUnit(b, { x: 6.675, z: -4.5, yaw: FACE.east }, id, { mirror: 'cracked' });
  for (let i = 0; i < 4; i++) {
    decal(b, 'stainDark', new Matrix4().makeRotationY(-HALF_PI).setPosition(10.915, 0.55 + i * 0.03, -4.6 - i * 0.05).multiply(new Matrix4().makeRotationZ(1.35 + i * 0.05)), 0.9, 0.05);
  }
  floorDecal(b, 'stainDark', 9.3, -3.9, 0.9, 0.7, 1.2);
  scatteredPapers(b, 8.2, -3.0, 1.2, 9);
  paperNote(b, 'IT LEARNS THE ROUNDS', 7.6, 1.5, Z.northBack + 0.012, 0, 0.1);
}

/** 102 — Paediatric overflow. A cot, a night-lamp still on, a drawing nobody took down. */
function room102(b: WorldBuilder): void {
  const id = ROOMS.r102;
  roomPlaque(b, '102', DOORS.r102, 'south', -0.95);
  troffer(b, id, -17.8, 4.0, CEILING.room, 'dead', []);
  hospitalBed(b, { x: -18.6, z: Z.southBack - 0.75, yaw: Math.PI }, id, 'cot', { railsUp: true });
  headwall(b, { x: -18.6, z: Z.southBack, yaw: Math.PI }, { width: 1.0 });
  bedsideCabinet(b, { x: -19.6, z: 5.95, yaw: Math.PI }, id);
  // Warm night-lamp on the cabinet.
  b.block('beigePlastic', -19.6, 0.88, 5.95, 0.12, 0.16, 0.12, 0, { tint: [1, 0.8, 0.6] });
  b.fixture({
    kind: 'lamp', state: 'buzz', roomId: id, circuits: ['nw:lights:lamps'], position: new Vector3(-19.5, 1.05, 5.8),
    color: 0xffb070, intensity: 1.1, distance: 3.6, panel: { shape: 'bulb', matrix: new Matrix4().makeScale(1.6, 1, 1.6).setPosition(-19.6, 1.0, 5.95) }, halo: 0.5, haloOpacity: 0.35,
  });
  b.add('drawing', plane(0.42, 0.32), new Matrix4().makeRotationY(HALF_PI).multiply(new Matrix4().makeRotationZ(0.05)).setPosition(-19.99, 1.35, 3.9), { uv: 'local', shade: 'flat' });
  teddyBear(b, { x: -17.4, z: 3.6, yaw: 2.2 });
  for (let i = 0; i < 5; i++) {
    const c: [number, number, number] = [[1.4, 0.4, 0.3], [0.4, 0.6, 1.4], [1.4, 1.2, 0.3], [0.4, 1.2, 0.5], [1.2, 0.5, 1.2]][i] as [number, number, number];
    b.block('whitePlastic', -18.4 + b.rng.range(-0.6, 0.6), 0.04, 3.2 + b.rng.range(-0.5, 0.5), 0.08, 0.08, 0.08, b.rng.range(0, 1), { tint: c });
  }
  curtain(b, new Vector3(-19.95, 0, 4.4), new Vector3(-17.4, 0, 4.4), CEILING.room, id, { gathered: 0.55 });
  visitorChair(b, { x: -16.4, z: 5.6, yaw: FACE.west + 0.4 }, id);
  sinkUnit(b, { x: -15.675, z: 4.2, yaw: FACE.west }, id);
}

/** 104 — Where the player wakes. Sheets thrown back, IV pulled over, a wheelchair facing the TV. */
function room104(b: WorldBuilder): void {
  const id = ROOMS.r104;
  roomPlaque(b, '104', DOORS.r104, 'south', -0.95);
  troffer(b, id, -13.4, 3.6, CEILING.room, 'flicker', [], { intensity: 4 });
  hospitalBed(b, { x: -14.25, z: Z.southBack - 1.05, yaw: Math.PI }, id, 'unmade');
  headwall(b, { x: -14.25, z: Z.southBack, yaw: Math.PI });
  bedsideCabinet(b, { x: -15.2, z: 5.95, yaw: Math.PI }, id, { drawerOut: true });
  ivStand(b, { x: -13.2, z: 4.6, yaw: 2.6 }, id, { tipped: true, bag: 'empty' });
  vitalsMonitor(b, { x: -13.4, z: Z.southBack, yaw: Math.PI }, id, 'off');
  wallTv(b, { x: -15.525, z: 2.75, yaw: FACE.east }, id, 'tv', 'nw:anomaly:tv-104');
  wheelchair(b, { x: -14.25, z: 2.75, yaw: FACE.west }, id, { anomalyId: 'nw:anomaly:wheelchair-104' });
  sinkUnit(b, { x: -11.275, z: 4.3, yaw: FACE.west }, id);
  wardrobe(b, { x: -11.6, z: 5.95, yaw: FACE.west }, id, { open: true });
  overbedTable(b, { x: -13.2, z: 5.6, yaw: Math.PI + 0.4 }, id);
  // Hospital wristband and slippers left by the bed.
  b.block('whitePlastic', -13.5, 0.004, 4.0, 0.22, 0.004, 0.02, 0.5, { shade: 'flat' });
  b.block('fabricSeat', -13.8, 0.02, 4.25, 0.1, 0.035, 0.26, 0.2, { tint: [0.6, 0.7, 0.9] });
  b.block('fabricSeat', -13.62, 0.02, 4.3, 0.1, 0.035, 0.26, -0.15, { tint: [0.6, 0.7, 0.9] });
  wallClock(b, { x: -13.4, z: Z.southFace, yaw: 0 });
}

/** 106 — Flooded. The ceiling gave way; water still drips onto a bed pushed into the corner. */
function room106(b: WorldBuilder): void {
  const id = ROOMS.r106;
  roomPlaque(b, '106', DOORS.r106, 'south', -0.95);
  troffer(b, id, -8.0, 2.8, CEILING.room, 'dying', [], { intensity: 3 });
  const bedPlace = { x: -10.1, z: 5.15, yaw: Math.PI + 0.32 };
  const bed = hospitalBed(b, bedPlace, id, 'stripped');
  headwall(b, { x: -9.9, z: Z.southBack, yaw: Math.PI });
  puddle(b, -9.3, 4.2, 2.8, 2.2);
  puddle(b, -7.9, 2.7, 1.0, 0.7);
  floorDecal(b, 'stainWater', -9.2, 4.3, 3.4, 2.8, 0.3);
  decal(b, 'stainWater', new Matrix4().makeRotationY(Math.PI).setPosition(-9.3, 2.0, Z.southBack - 0.01), 2.4, 1.6);
  decal(b, 'stainRust', new Matrix4().makeRotationY(-HALF_PI).setPosition(-6.885, 1.4, 4.4), 1.6, 2.2);
  wetFloorSign(b, { x: -8.4, z: 3.3, yaw: 0.4 }, true);
  mopBucket(b, { x: -7.6, z: 4.6, yaw: 0.6 }, id);
  bedsideCabinet(b, { x: -8.5, z: 5.95, yaw: Math.PI + 0.1 }, id, { items: false });
  visitorChair(b, { x: -10.6, z: 2.6, yaw: 0.9 }, id, { tipped: true });
  sinkUnit(b, { x: -11.125, z: 3.5, yaw: FACE.east }, id, { mirror: 'cracked' });
  b.emitter('drip', id, -9.5, 2.6, 4.2);
  if (bed) addBedHiding(b, 'room-106-bed', bedPlace, id, bed, [
    { position: { x: -9.0, y: 0, z: 4.15 }, yaw: Math.PI / 2 },
    { position: { x: -10.3, y: 0, z: 3.6 }, yaw: 0 },
  ]);
}

/** 108 — Ransacked. Someone searched this room in a hurry, or something did. */
function room108(b: WorldBuilder): void {
  const id = ROOMS.r108;
  roomPlaque(b, '108', DOORS.r108, 'south', -0.95);
  troffer(b, id, -2.4, 3.6, CEILING.room, 'dying', [], { intensity: 4 });
  hospitalBed(b, { x: -3.5, z: 5.3, yaw: Math.PI + 0.12 }, id, 'bare');
  b.block('mattress', -1.7, 0.08, 3.9, 0.85, 0.15, 1.9, 0.65, { tint: 0.85 });
  b.solid(-1.7, 0.08, 3.9, 0.85, 0.15, 1.9, { yaw: 0.65, roomId: id, kind: 'prop' });
  wardrobe(b, { x: -1.0, z: 5.7, yaw: HALF_PI }, id, { tipped: true });
  bedsideCabinet(b, { x: -4.2, z: 3.3, yaw: 2.0 }, id, { drawerOut: true, items: false });
  overbedTable(b, { x: -2.5, z: 2.4, yaw: -0.4 }, id, { tipped: true });
  visitorChair(b, { x: -3.9, z: 2.2, yaw: -2.2 }, id, { tipped: true });
  // Curtain torn from its track, heaped on the floor.
  for (let i = 0; i < 6; i++) {
    b.add('curtain', box(b.rng.range(0.4, 0.9), 0.03, b.rng.range(0.3, 0.7)), new Matrix4().makeRotationY(b.rng.range(0, 3)).multiply(new Matrix4().makeRotationX(b.rng.range(-0.3, 0.3))).setPosition(-2.9 + b.rng.range(-0.4, 0.4), 0.02 + i * 0.03, 4.4 + b.rng.range(-0.3, 0.3)), { uv: 'local' });
  }
  b.add('chrome', box(1.6, 0.025, 0.03), new Matrix4().makeRotationY(0.3).multiply(new Matrix4().makeRotationZ(0.35)).setPosition(-2.2, 0.3, 4.8), { shade: 'flat' });
  scatteredPapers(b, -2.6, 3.8, 1.5, 22);
  cardboardBox(b, { x: -4.1, z: 6.0, yaw: 0.2 }, id, [0.45, 0.3, 0.35], true);
  sinkUnit(b, { x: -4.525, z: 4.6, yaw: FACE.east }, id, { mirror: 'cracked' });
  floorDecal(b, 'stainDrag', -2.0, 2.4, 1.8, 0.6, 2.4);
}

/** 110 — Occupied. Made bed, fresh flowers, a live monitor. Everything waiting for someone. */
function room110(b: WorldBuilder): void {
  const id = ROOMS.r110;
  roomPlaque(b, '110', DOORS.r110, 'south', 0.95);
  b.block('whitePlastic', DOORS.r110 + 0.95, 1.4, Z.corridorS - 0.02, 0.24, 0.05, 0.01, 0, { shade: 'flat', tint: [1, 0.95, 0.75] });
  troffer(b, id, 8.2, 3.6, CEILING.room, 'buzz', [], { intensity: 2.6, color: 0xf2efe4 });
  hospitalBed(b, { x: 8.7, z: Z.southBack - 1.05, yaw: Math.PI }, id, 'made');
  headwall(b, { x: 8.7, z: Z.southBack, yaw: Math.PI });
  vitalsMonitor(b, { x: 9.7, z: Z.southBack, yaw: Math.PI }, id, 'ecg', 'nw:anomaly:monitor-110');
  ivStand(b, { x: 9.75, z: 4.9, yaw: 0.3 }, id, { bag: 'full' });
  bedsideCabinet(b, { x: 7.6, z: 5.95, yaw: Math.PI }, id);
  flowersVase(b, { x: 7.65, z: 5.95, yaw: 0, y: 0.79 }, false);
  b.block('beigePlastic', 7.45, 0.88, 6.05, 0.12, 0.16, 0.12, 0, { tint: [1, 0.85, 0.7] });
  b.fixture({
    kind: 'lamp', state: 'steady', roomId: id, circuits: ['nw:lights:lamps'], position: new Vector3(7.5, 1.1, 5.8),
    color: 0xffc080, intensity: 1.0, distance: 3.6, panel: { shape: 'bulb', matrix: new Matrix4().makeScale(1.6, 1, 1.6).setPosition(7.45, 1.0, 6.05) }, halo: 0.45, haloOpacity: 0.3,
  });
  visitorChair(b, { x: 10.0, z: 3.2, yaw: -2.5 }, id);
  b.block('linen', 10.0, 0.52, 3.2, 0.4, 0.06, 0.32, -2.5, { tint: [0.6, 0.65, 0.8] });
  overbedTable(b, { x: 8.0, z: 4.5, yaw: Math.PI }, id);
  b.block('fabricSeat', 7.9, 0.02, 3.7, 0.1, 0.035, 0.26, 0.05, { tint: [0.9, 0.6, 0.6] });
  b.block('fabricSeat', 8.08, 0.02, 3.72, 0.1, 0.035, 0.26, -0.05, { tint: [0.9, 0.6, 0.6] });
  curtain(b, new Vector3(10.25, 0, 6.3), new Vector3(10.25, 0, 3.0), CEILING.room, id, { gathered: 0.75 });
  sinkUnit(b, { x: 6.075, z: 4.4, yaw: FACE.east }, id);
  wardrobe(b, { x: 10.0, z: 1.95, yaw: 0 }, id);
}

export type { ObjectId };
