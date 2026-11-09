import { Matrix4, Vector3 } from 'three';
import { emergencyLight, troffer } from '../architecture';
import type { WorldBuilder } from '../core/builder';
import { box, cylinder, plane } from '../core/geometry';
import { CEILING, DOORS, ROOMS, Z } from '../layout';
import { SIGN_ROOM, SIGN_WARNING, collide, sign } from '../props/common';
import {
  beamSeating, bin, binders, cardboardBox, computerMonitor, crashCart, examTable, floorDecal, glassCabinet, gurney, ivStand,
  linenCart, lockerBank, mopBucket, noticeBoard, officeChair, oxygenCylinders, phone, scatteredPapers, shelvingUnit, sinkUnit,
  stepLadder, surgicalLamp, vendingMachine, visitorChair, wallClock, wallTv, wheelchair,
} from '../props/furniture';
import { addLockerHiding, inspectMarker } from './hiding';

const HALF_PI = Math.PI / 2;

export function buildClinicalRooms(b: WorldBuilder): void {
  nursesStation(b);
  treatmentRoom(b);
  // Chapter 1: storage becomes the observation bay and the waiting bay becomes the ward hall
  // (both dressed in chapter1Layout.ts).
  if (b.layout === 'chapter1') return;
  storageRoom(b);
  waitingBay(b);
}

/** Open-fronted nurses' station: the ward's last lit island, abandoned mid-shift. */
function nursesStation(b: WorldBuilder): void {
  const id = ROOMS.nurses;
  // Chapter 1: the counter is shortened at the west end, giving a second way behind it (1.4 m)
  // toward the staff lockers and the review desk.
  const x0 = b.layout === 'chapter1' ? -5.3 : -6.3;
  const x1 = -1.3;
  const len = x1 - x0;
  const cx = (x0 + x1) / 2;
  // Front counter: laminate fascia facing the corridor, high transaction ledge and low worktop.
  b.block('laminate', cx, 0.55, -1.62, len, 1.1, 0.06, 0, { tint: [0.85, 0.9, 0.95] });
  b.block('wainscot', cx, 0.5, -1.585, len, 0.9, 0.01, 0, { tint: 0.85 });
  b.block('laminate', cx, 1.12, -1.66, len + 0.06, 0.04, 0.34, 0, { tint: 1.05 });
  b.block('steel', cx, 1.095, -1.5, len + 0.06, 0.012, 0.03, 0, { shade: 'flat' });
  b.block('laminate', cx, 0.75, -2.0, len, 0.035, 0.75, 0);
  b.block('beigePlastic', cx, 0.37, -2.32, len, 0.72, 0.04, 0, { tint: 0.7 });
  for (const x of [x0 + 0.02, x1 - 0.02]) b.block('laminate', x, 0.55, -1.98, 0.04, 1.1, 0.78, 0, { tint: 0.85 });
  // Under-counter pedestals.
  for (const x of [x0 + 0.35, cx, x1 - 0.35]) b.block('beigePlastic', x, 0.36, -2.0, 0.42, 0.7, 0.6, 0, { tint: 0.92 });
  b.solid(cx, 0.56, -1.97, len, 1.12, 0.95, { roomId: id, kind: 'counter' });

  // Worktop clutter.
  computerMonitor(b, { x: b.layout === 'chapter1' ? -4.9 : -5.4, z: -2.1, yaw: 0, y: 0.77 }, id, 'flicker');
  computerMonitor(b, { x: -3.9, z: -2.05, yaw: -0.25, y: 0.77 }, id, 'on');
  computerMonitor(b, { x: -2.5, z: -2.15, yaw: 0.2, y: 0.77 }, id, 'off');
  phone(b, { x: -4.6, z: -1.95, yaw: 0.3, y: 0.77 }, true);
  binders(b, { x: -1.9, z: -2.25, yaw: 0, y: 0.77 }, 6);
  scatteredPapers(b, -4.3, -2.1, 0.25, 6, 0.772);
  b.block('whitePlastic', -3.2, 0.82, -1.92, 0.08, 0.1, 0.08, 0, { tint: [0.4, 0.6, 0.9] });
  b.add('whitePlastic', cylinder(0.04, 0.035, 0.1, 8), new Matrix4().makeTranslation(-2.95, 0.82, -1.9), { tint: [1, 0.95, 0.85] });
  // Desk lamp, still on.
  b.add('steel', cylinder(0.08, 0.09, 0.02, 10), new Matrix4().makeTranslation(-1.65, 0.78, -2.05), { tint: 0.4 });
  b.add('steel', box(0.02, 0.4, 0.02), new Matrix4().makeRotationZ(0.3).setPosition(-1.6, 0.97, -2.05), { tint: 0.4 });
  b.add('steel', cylinder(0.04, 0.08, 0.1, 10), new Matrix4().makeRotationZ(1.1).setPosition(-1.5, 1.15, -2.05), { tint: 0.4 });
  b.fixture({
    kind: 'lamp', state: 'buzz', roomId: id, circuits: ['nw:lights:lamps'], position: new Vector3(-1.55, 1.0, -2.0),
    color: 0xffc27a, intensity: 1.6, distance: 3.5, panel: { shape: 'bulb', matrix: new Matrix4().makeTranslation(-1.47, 1.12, -2.05) }, halo: 0.45, haloOpacity: 0.3,
  });

  officeChair(b, { x: -4.7, z: -2.9, yaw: 0.4 }, id);
  officeChair(b, { x: -2.8, z: -3.4, yaw: 2.0 }, id, true);

  // Back wall: patient board, records shelving, drug cupboard, desk. Chapter 1 moves them 0.8 m
  // west to make room for the glazed screen (x -3.0..-1.8) and staff door (x -1.2).
  const sx = b.layout === 'chapter1' ? -0.8 : 0;
  const boardMatrix = new Matrix4().setPosition(-3.6 + sx, 1.55, Z.northBack + 0.02);
  b.add('frame', box(2.5, 1.3, 0.03), new Matrix4().setPosition(-3.6 + sx, 1.55, Z.northBack + 0.015));
  b.add('whiteboard', plane(2.4, 1.2), boardMatrix.clone().multiply(new Matrix4().makeTranslation(0, 0, 0.018)), { uv: 'local', shade: 'flat' });
  b.add('whitePlastic', box(2.3, 0.04, 0.06), new Matrix4().setPosition(-3.6 + sx, 0.92, Z.northBack + 0.05), { tint: 0.8 });
  inspectMarker(b, 'ward-board', 'inspect', 'Read the ward board', { x: -3.6 + sx, z: Z.northBack + 0.1, yaw: 0 }, [2.4, 1.2, 0.12], 1.55, 3.5);
  b.block('laminate', -3.6 + sx, 0.73, -6.05, 2.6, 0.035, 0.65, 0);
  b.block('beigePlastic', -4.7 + sx, 0.36, -6.05, 0.42, 0.7, 0.6, 0, { tint: 0.9 });
  collide(b, { x: -3.6 + sx, z: -6.05, yaw: 0 }, id, 0, 0.37, 0, 2.6, 0.74, 0.65);
  inspectMarker(b, 'station-drawer', 'drawer', 'Search the drawer', { x: -4.7 + sx, z: -5.72, yaw: 0 }, [0.42, 0.2, 0.1], 0.6, 1.6);
  computerMonitor(b, { x: -3.0 + sx, z: -6.1, yaw: 0.15, y: 0.75 }, id, 'off');
  if (b.layout !== 'chapter1') shelvingUnit(b, { x: -1.2, z: -6.1, yaw: 0 }, id, { width: 1.4, depth: 0.4, height: 2.1, fill: 0.9 });
  glassCabinet(b, { x: 0.125 - 0.22, z: -4.3, yaw: -HALF_PI }, id, { width: 1.0, disturbed: true });
  inspectMarker(b, 'drug-cupboard', 'cabinet', 'Open drug cupboard', { x: -0.3, z: -4.3, yaw: -HALF_PI }, [1.0, 1.0, 0.1], 1.35, 1.8);
  noticeBoard(b, new Matrix4().makeRotationY(-HALF_PI).setPosition(0.125, 1.55, -2.8), 1.1, 0.75);
  wallClock(b, { x: b.layout === 'chapter1' ? -6.3 : -5.9, z: Z.northBack, yaw: 0 }, 2.25);
  // Staff lockers on the west partition: one is large enough to hide in.
  lockerBank(b, { x: -6.725 + 0.27, z: -3.0, yaw: HALF_PI }, id, 2, { ajar: [1] });
  addLockerHiding(b, 'nurses-staff', { x: -6.725 + 0.3, z: -4.15, yaw: HALF_PI }, id);
  bin(b, { x: -6.3, z: -5.9, yaw: 0.2 }, 'general', id);
  scatteredPapers(b, -3.2, -3.6, 1.2, 10);
  floorDecal(b, 'stainWater', -2.2, -4.4, 1.4, 1.1, 0.4);

  troffer(b, id, -4.6, -3.9, CEILING.corridor, 'buzz', ['nw:lights:nurses'], { intensity: 3.8 });
  troffer(b, id, -1.8, -3.9, CEILING.corridor, 'dead', ['nw:lights:nurses']);

  // Hanging station sign, readable from both directions along the corridor.
  for (const yaw of [0, Math.PI]) {
    const m = new Matrix4().makeRotationY(yaw).setPosition(-3.8, 2.35, -1.2 + (yaw === 0 ? 0.006 : -0.006));
    sign(b, "NURSES' STATION", { ...SIGN_ROOM, subtext: 'WARD 4 WEST' }, 1.4, 0.32, m, { canvas: [768, 176] });
  }
  b.block('whitePlastic', -3.8, 2.35, -1.2, 1.44, 0.34, 0.01, 0, { shade: 'flat', tint: 0.6 });
  for (const x of [-4.4, -3.2]) b.block('steel', x, 2.6, -1.2, 0.008, 0.18, 0.008, 0, { shade: 'flat' });
}

/** Treatment room: exam table under a failing surgical lamp, crash cart left open. */
function treatmentRoom(b: WorldBuilder): void {
  const id = ROOMS.treatment;
  sign(b, 'TREATMENT', SIGN_ROOM, 0.6, 0.16, new Matrix4().setPosition(DOORS.treatment + 1.15, 1.75, Z.corridorN + 0.012), { canvas: [512, 136] });
  troffer(b, id, 4.6, -3.4, CEILING.room, 'flicker', ['nw:lights:treatment'], { intensity: 5 });
  troffer(b, id, 1.8, -4.6, CEILING.room, 'dead', ['nw:lights:treatment']);
  examTable(b, { x: 3.0, z: -4.2, yaw: HALF_PI }, id);
  surgicalLamp(b, 2.6, -4.6, CEILING.room, id, 'dying');
  // Base and wall cabinets with a scrub sink along the east wall.
  const ex = 6.525;
  b.block('cabinetBlue', ex - 0.3, 0.45, -5.0, 0.6, 0.9, 2.6);
  b.block('laminate', ex - 0.31, 0.915, -5.0, 0.64, 0.03, 2.62, 0, { tint: [0.9, 0.95, 1] });
  for (let i = 0; i < 4; i++) b.block('rubber', ex - 0.6, 0.5, -6.15 + i * 0.65, 0.005, 0.8, 0.005, 0, { shade: 'flat' });
  b.block('cabinetBlue', ex - 0.18, 1.85, -5.0, 0.36, 0.7, 2.6, 0, { tint: 1.05 });
  b.block('glass', ex - 0.37, 1.85, -5.0, 0.01, 0.64, 2.5);
  collide(b, { x: ex - 0.3, z: -5.0, yaw: 0 }, id, 0, 0.47, 0, 0.62, 0.94, 2.62);
  // Items on the worktop.
  for (let i = 0; i < 7; i++) {
    b.add(b.rng.chance(0.5) ? 'glass' : 'whitePlastic', cylinder(0.03, 0.03, b.rng.range(0.08, 0.18), 6), new Matrix4().makeTranslation(ex - 0.3 + b.rng.range(-0.15, 0.15), 1.0, -6.0 + i * 0.3), { tint: [b.rng.range(0.6, 1), b.rng.range(0.7, 1), 1] });
  }
  b.add('steel', box(0.4, 0.02, 0.3), new Matrix4().makeRotationY(0.2).setPosition(ex - 0.32, 0.94, -4.2), { tint: 1.1 });
  crashCart(b, { x: 1.0, z: -5.85, yaw: 0.25 }, id, { drawersOut: true });
  oxygenCylinders(b, { x: 0.55, z: -4.3, yaw: HALF_PI }, id, 3, true);
  const chapter1 = b.layout === 'chapter1';
  // Chapter 1: the staff door at x 4.6 takes this stretch of the north wall; the cabinet moves west.
  if (!chapter1) ivStand(b, { x: 4.4, z: -5.4, yaw: 0 }, id, { bag: 'empty' });
  ivStand(b, { x: 1.6, z: -3.0, yaw: 0.8 }, id, { tipped: true });
  const cabinetX = chapter1 ? 3.1 : 4.9;
  glassCabinet(b, { x: cabinetX, z: Z.northBack + 0.22, yaw: 0 }, id, { width: 0.8 });
  inspectMarker(b, 'treatment-cabinet', 'cabinet', 'Open instrument cabinet', { x: cabinetX, z: Z.northBack + 0.45, yaw: 0 }, [0.8, 1.0, 0.1], 1.35, 1.8);
  if (chapter1) {
    // Route A hiding: a tall screened gown cupboard in the corner by the corridor door, in place
    // of the folding screen and the scrub sink.
    addLockerHiding(b, 'treatment-screen', { x: 6.525 - 0.3, z: -2.55, yaw: -HALF_PI }, id);
  }
  if (!chapter1) sinkUnit(b, { x: ex, z: -2.6, yaw: -HALF_PI }, id, { mirror: 'cracked' });
  // Folding privacy screen (three panels, curtain fabric).
  if (!chapter1) {
  for (let i = 0; i < 3; i++) {
    const a = 0.5 - i * 0.5;
    const x = 4.7 + i * 0.55;
    const z = -2.6 + Math.sin(i * 0.8) * 0.2;
    b.add('chrome', box(0.6, 1.7, 0.03), new Matrix4().makeRotationY(a).setPosition(x, 0.95, z), { tint: 0.7 });
    b.add('curtain', box(0.54, 1.5, 0.035), new Matrix4().makeRotationY(a).setPosition(x, 0.97, z), { uv: 'local' });
  }
  collide(b, { x: 5.25, z: -2.6, yaw: 0 }, id, 0, 0.9, 0, 1.6, 1.8, 0.4);
  }
  // Stool, instrument trolley and bins.
  b.add('chrome', cylinder(0.02, 0.02, 0.5, 6), new Matrix4().makeTranslation(3.6, 0.3, -3.1));
  b.add('rubber', cylinder(0.18, 0.18, 0.06, 12), new Matrix4().makeTranslation(3.6, 0.58, -3.1), { tint: 1.4 });
  b.add('chrome', box(0.5, 0.02, 0.35), new Matrix4().makeTranslation(2.1, 0.9, -5.5));
  b.add('chrome', box(0.02, 0.9, 0.02), new Matrix4().makeTranslation(2.1, 0.45, -5.5));
  for (let i = 0; i < 5; i++) b.add('chrome', box(0.12, 0.005, 0.015), new Matrix4().makeRotationY(b.rng.range(-0.4, 0.4)).setPosition(1.95 + i * 0.07, 0.915, -5.5), { shade: 'flat' });
  bin(b, { x: 5.9, z: -1.9, yaw: 0 }, 'clinical', id);
  bin(b, { x: 0.275, z: -5.2, yaw: HALF_PI }, 'sharps');
  floorDecal(b, 'stainDark', 2.9, -3.4, 0.7, 0.5, 0.3);
  floorDecal(b, 'stainDark', 2.3, -2.6, 0.35, 0.3, 1.1);
  scatteredPapers(b, 2.2, -2.6, 0.6, 4);
  b.emitter('vent', id, 3.4, 2.7, -3.0);
}

/** Storage: tight aisles of wire shelving, a wall of lockers — three big enough to hide in. */
function storageRoom(b: WorldBuilder): void {
  const id = ROOMS.storage;
  sign(b, 'STORE', { ...SIGN_ROOM, subtext: 'STAFF ONLY' }, 0.4, 0.22, new Matrix4().setPosition(DOORS.storage + 0.95, 1.6, Z.corridorN + 0.012), { canvas: [384, 210] });
  troffer(b, id, 14.6, -3.9, CEILING.room, 'dying', ['nw:lights:storage'], { intensity: 4 });
  // Battery backup bulkhead: the only light in here that never quite gives up.
  emergencyLight(b, id, new Vector3(17.93, 2.35, -2.4), -Math.PI / 2, { color: 0xffa24a, intensity: 1.1, state: 'buzz' });
  for (const x of [13.9, 15.25, 16.6]) shelvingUnit(b, { x, z: Z.northBack + 0.3, yaw: 0 }, id, { width: 1.25, depth: 0.5 });
  shelvingUnit(b, { x: 14.6, z: -3.4, yaw: HALF_PI }, id, { width: 1.3, depth: 0.55, fill: 0.6 });
  shelvingUnit(b, { x: 14.6, z: -4.72, yaw: HALF_PI }, id, { width: 1.3, depth: 0.55 });
  const wx = 11.075 + 0.3;
  addLockerHiding(b, 'storage-a', { x: wx, z: -3.55, yaw: HALF_PI }, id);
  addLockerHiding(b, 'storage-b', { x: wx, z: -4.2, yaw: HALF_PI }, id);
  addLockerHiding(b, 'storage-c', { x: wx, z: -4.85, yaw: HALF_PI }, id);
  lockerBank(b, { x: 17.73, z: -3.6, yaw: -HALF_PI }, id, 4, { ajar: [2] });
  linenCart(b, { x: 17.35, z: -5.2, yaw: 0.05 }, id);
  mopBucket(b, { x: 12.0, z: -5.95, yaw: 0.3 }, id);
  stepLadder(b, { x: 12.75, z: -6.0, yaw: 0.1 }, id);
  oxygenCylinders(b, { x: 16.8, z: -2.0, yaw: Math.PI }, id, 2);
  wheelchair(b, { x: 13.4, z: -2.2, yaw: 2.6 }, id, { folded: true });
  cardboardBox(b, { x: 16.0, z: -4.6, yaw: 0.2 }, id, [0.5, 0.4, 0.45]);
  cardboardBox(b, { x: 16.05, z: -4.62, yaw: -0.1, y: 0.4 }, null, [0.4, 0.3, 0.35], true);
  cardboardBox(b, { x: 13.15, z: -5.55, yaw: 0.6 }, id, [0.45, 0.3, 0.4]);
  sign(b, 'CHECK EXPIRY DATES', SIGN_WARNING, 0.5, 0.14, new Matrix4().makeRotationY(-HALF_PI).setPosition(17.99, 1.95, -5.0), { canvas: [512, 144] });
  scatteredPapers(b, 13.0, -3.5, 0.6, 5);
}

/** Waiting bay opening off the corridor: rows of seats, a vending machine that will not die. */
function waitingBay(b: WorldBuilder): void {
  const id = ROOMS.waiting;
  troffer(b, id, 2.8, 3.9, CEILING.corridor, 'dead', ['nw:lights:waiting']);
  beamSeating(b, { x: 2.0, z: Z.southBack - 0.35, yaw: Math.PI }, id, 4, { missing: [2] });
  beamSeating(b, { x: -0.125 + 0.35, z: 3.9, yaw: HALF_PI }, id, 3);
  vendingMachine(b, { x: 4.95, z: Z.southBack - 0.45, yaw: Math.PI }, id, 'flicker');
  // Water cooler.
  b.block('whitePlastic', 5.55, 0.5, 3.0, 0.32, 1.0, 0.32, 0, { tint: 0.85 });
  b.add('glass', cylinder(0.13, 0.13, 0.4, 10), new Matrix4().makeTranslation(5.55, 1.22, 3.0));
  collide(b, { x: 5.55, z: 3.0, yaw: 0 }, id, 0, 0.7, 0, 0.34, 1.4, 0.34);
  // Dead plant.
  b.add('darkWood', cylinder(0.2, 0.16, 0.4, 10), new Matrix4().makeTranslation(0.35, 0.2, 5.95), { tint: 0.7 });
  for (let i = 0; i < 6; i++) {
    b.add('darkWood', box(0.015, 0.8, 0.015), new Matrix4().makeRotationZ(b.rng.range(-0.5, 0.5)).multiply(new Matrix4().makeRotationX(b.rng.range(-0.5, 0.5))).setPosition(0.35, 0.75, 5.95), { tint: [0.6, 0.5, 0.3] });
  }
  collide(b, { x: 0.35, z: 5.95, yaw: 0 }, id, 0, 0.3, 0, 0.42, 0.6, 0.42);
  // Low table with magazines.
  b.block('laminate', 2.6, 0.42, 4.3, 1.0, 0.04, 0.55, 0.1);
  for (const [x, z] of [[-0.45, -0.22], [0.45, -0.22], [-0.45, 0.22], [0.45, 0.22]] as const) b.block('steel', 2.6 + x, 0.2, 4.3 + z, 0.03, 0.4, 0.03, 0.1);
  collide(b, { x: 2.6, z: 4.3, yaw: 0.1 }, id, 0, 0.22, 0, 1.0, 0.44, 0.55);
  scatteredPapers(b, 2.6, 4.3, 0.35, 4, 0.445);
  visitorChair(b, { x: 3.7, z: 3.0, yaw: -0.8 }, id, { tipped: true });
  wheelchair(b, { x: 1.2, z: 2.5, yaw: 2.3 }, id);
  wallTv(b, { x: 2.0, z: Z.southBack, yaw: Math.PI }, id, 'off');
  noticeBoard(b, new Matrix4().makeRotationY(-HALF_PI).setPosition(5.925, 1.5, 4.3), 1.2, 0.8);
  sign(b, 'PLEASE WAIT TO BE CALLED', SIGN_ROOM, 1.1, 0.16, new Matrix4().makeRotationY(-HALF_PI).setPosition(5.92, 2.25, 4.3), { canvas: [768, 112] });
  // Abandoned gurney half out in the corridor — a pinch point.
  gurney(b, { x: 3.0, z: 0.82, yaw: HALF_PI + 0.08 }, ROOMS.corridor, { sheet: true });
}
