import { Matrix4, Vector3 } from 'three';
import { cagedBulb, emergencyLight } from '../architecture';
import type { WorldBuilder } from '../core/builder';
import { box, cylinder, cylinderBetween, torus } from '../core/geometry';
import { C1, CEILING, DOORS, ROOMS, T, X, Z } from '../layout';
import { SIGN_DANGER, SIGN_PAPER, SIGN_ROOM, SIGN_WARNING, collide, put, sign } from '../props/common';
import {
  cardboardBox, crashCart, electricalPanel, fireExtinguisher, floorDecal, gurney, mopBucket, noticeBoard, pipeRun, puddle,
  sanitizer, scatteredPapers, stepLadder, visitorChair, wallClock, wetFloorSign, wheelchair,
} from '../props/furniture';
import { inspectMarker } from './hiding';

const HALF_PI = Math.PI / 2;

export function buildServiceSpaces(b: WorldBuilder): void {
  corridorDressing(b);
  eastCorridor(b);
  liftCar(b);
  if (b.layout === 'chapter1') chapter1Landing(b); else stairwell(b);
  maintenance(b);
}

function corridorDressing(b: WorldBuilder): void {
  const id = ROOMS.corridor;
  // Faded wayfinding line on the floor, worn through in places.
  let x = -19.6;
  while (x < 17.6) {
    const len = b.rng.range(1.2, 4.5);
    const end = Math.min(17.6, x + len);
    b.block('cabinetBlue', (x + end) / 2, 0.0015, 0.95, end - x, 0.003, 0.06, 0, { shade: 'flat', tint: b.rng.range(0.55, 0.85) });
    x = end + b.rng.range(0.05, 0.5);
  }
  wallClock(b, { x: -3.2, z: Z.corridorS, yaw: Math.PI });
  visitorChair(b, { x: -4.05, z: 1.05, yaw: Math.PI }, id);
  visitorChair(b, { x: -3.42, z: 1.05, yaw: Math.PI - 0.12 }, id);
  fireExtinguisher(b, { x: 11.1, z: Z.corridorS, yaw: Math.PI });
  sign(b, 'FIRE EXTINGUISHER', SIGN_DANGER, 0.3, 0.1, new Matrix4().makeRotationY(Math.PI).setPosition(11.1, 1.35, Z.corridorS - 0.012), { canvas: [384, 128] });
  noticeBoard(b, new Matrix4().makeRotationY(Math.PI).setPosition(b.layout === 'chapter1' ? 14.6 : 13.6, 1.5, Z.corridorS), 1.4, 0.9);
  for (const [dx, side] of [[-15.55, 'n'], [-11.15, 'n'], [-6.75, 's'], [0.6, 'n'], [10.55, 's'], [b.layout === 'chapter1' ? -0.9 : -2.4, 's']] as const) {
    sanitizer(b, { x: dx, z: side === 'n' ? Z.corridorN : Z.corridorS, yaw: side === 'n' ? 0 : Math.PI });
  }
  // A ceiling tile came down here; water still finds its way through.
  wetFloorSign(b, { x: -8.85, z: 0.5, yaw: 0.6 });
  puddle(b, -9.3, -0.3, 0.9, 0.7);
  b.emitter('drip', id, -9.3, 2.6, -0.3);
  b.emitter('vent', id, -12.0, 2.65, 0.4);
  b.emitter('vent', id, 5.0, 2.65, -0.4);
  // Wheelchair parked facing the end window, as if someone was left there to look out.
  wheelchair(b, { x: -18.75, z: -0.35, yaw: -HALF_PI + 0.15 }, id);
  scatteredPapers(b, -3.0, 0.1, 0.8, 7);
  floorDecal(b, 'stainDrag', 9.4, -0.7, 2.6, 0.55, 0.05);
  floorDecal(b, 'stainWater', 12.5, -0.3, 1.4, 1.2, 0.8);
  crashCart(b, { x: 15.0, z: 1.05, yaw: Math.PI + 0.1 }, id);
  // Smoke-door warnings (Chapter 1 puts its own 'CLOSES ON ALARM' signs here).
  for (const face of b.layout === 'chapter1' ? [] : [-1, 1]) {
    sign(b, 'FIRE DOOR — KEEP CLEAR', SIGN_WARNING, 0.5, 0.1, new Matrix4().makeRotationY(face < 0 ? -HALF_PI : HALF_PI).setPosition(DOORS.smoke + face * 0.092, 2.4, 0), { canvas: [512, 104] });
  }
  sign(b, 'WARD 4 WEST', { ...SIGN_ROOM, subtext: 'ROOMS 101 – 110' }, 0.9, 0.3, new Matrix4().makeRotationY(-HALF_PI).setPosition(X.eastCorridorE - 0.012, 2.05, 0), { canvas: [512, 170] });
  sign(b, '← WARD 4 WEST     STAIRS B  ·  LIFTS ↑', SIGN_ROOM, 1.6, 0.18, new Matrix4().makeRotationY(-HALF_PI).setPosition(X.eastCorridorE - 0.012, 2.45, -2.2), { canvas: [1024, 116] });
  sign(b, 'PLEASE KEEP DOORS CLOSED AT NIGHT', SIGN_PAPER, 0.42, 0.16, new Matrix4().makeRotationZ(-0.04).setPosition(-9.9, 1.55, Z.corridorN + 0.014), { canvas: [512, 196] });

  // Battery emergency bulkheads: dim amber until the mains lighting fails around them.
  for (const x of [-9.8, 4.6, 13.4]) emergencyLight(b, id, new Vector3(x, 2.45, Z.corridorN + 0.05), 0, { color: 0xffb060, intensity: 0.7, state: 'steady' });
  // Long sight lines where a silhouette can be glimpsed far away (presentation only).
  b.sightlines.push(
    { id: 'nw:sightline:corridor-west', roomId: id, position: new Vector3(-19.2, 0, -0.75), yaw: -HALF_PI },
    { id: 'nw:sightline:corridor-east', roomId: ROOMS.east, position: new Vector3(19.9, 0, 0.6), yaw: HALF_PI },
    { id: 'nw:sightline:smoke-doors', roomId: id, position: new Vector3(DOORS.smoke + 0.9, 0, 0.0), yaw: HALF_PI },
  );

  // Displaced ceiling tile hanging by a wire — sways when the building breathes.
  const pivot = new Vector3(12.5 - 0.3, CEILING.corridor - 0.01, -0.3);
  const wire = cylinderBetween(new Vector3(0, 0, 0.2), new Vector3(0.05, -0.12, 0.2), 0.004, 3);
  const tile = b.mergedObject([
    { material: 'ceilingStained', geometry: box(0.58, 0.015, 0.58), matrix: new Matrix4().makeRotationZ(-1.05).setPosition(0.14, -0.26, 0) },
    { material: 'rubber', geometry: wire.geometry, matrix: wire.matrix },
  ], 'nw:hanging-tile');
  tile.position.copy(pivot);
  b.attach(tile);
  b.anomalies.push({ kind: 'sway', id: 'nw:anomaly:hanging-tile', roomId: id, position: pivot.clone().setY(2.3), object: tile, amplitude: 0.12 });
}

function eastCorridor(b: WorldBuilder): void {
  const id = ROOMS.east;
  // Lift: stainless surround, two sliding leaves, call panel, out-of-service notice.
  const wx = X.eastCorridorE;
  b.block('steel', wx - 0.02, 1.1, -4.67, 0.04, 2.2, 0.1);
  b.block('steel', wx - 0.02, 1.1, -3.33, 0.04, 2.2, 0.1);
  b.block('steel', wx - 0.02, 2.25, -4.0, 0.04, 0.12, 1.44);
  b.block('steel', wx - 0.03, 2.5, -4.0, 0.02, 0.22, 0.5, 0, { tint: 0.5 });
  sign(b, '4', { background: '#101315', foreground: '#ffae4a', worn: 0.1 }, 0.12, 0.14, new Matrix4().makeRotationY(-HALF_PI).setPosition(wx - 0.042, 2.5, -4.0), { emissive: true, canvas: [128, 150] });
  const leaf = (z: number, name: string) => {
    const g = b.mergedObject([
      { material: 'steel', geometry: box(0.03, 2.18, 0.6), matrix: new Matrix4().makeTranslation(0, 1.09, 0) },
      { material: 'rubber', geometry: box(0.035, 2.18, 0.01), matrix: new Matrix4().makeTranslation(0, 1.09, z < -4 ? 0.3 : -0.3) },
    ], name);
    g.position.set(wx + 0.03, 0, z);
    b.attach(g);
    return g;
  };
  const left = leaf(-4.3, 'nw:lift:leaf-left');
  const right = leaf(-3.7, 'nw:lift:leaf-right');
  b.anomalies.push({ kind: 'lift', id: 'nw:anomaly:lift', roomId: id, position: new Vector3(wx - 0.3, 1.4, -4.0), left, right, travel: 0.56, axis: 'z' });
  b.block('steel', wx - 0.03, 1.2, -2.95, 0.03, 0.32, 0.14, 0, { tint: 0.85 });
  for (const y of [1.26, 1.14]) b.add('whitePlastic', cylinder(0.022, 0.022, 0.02, 10), new Matrix4().makeRotationZ(HALF_PI).setPosition(wx - 0.05, y, -2.95), { shade: 'flat', tint: 0.6 });
  sign(b, 'OUT OF SERVICE', SIGN_PAPER, 0.32, 0.22, new Matrix4().makeRotationY(-HALF_PI).multiply(new Matrix4().makeRotationZ(0.06)).setPosition(wx - 0.012, 1.55, -2.55), { canvas: [384, 260] });
  inspectMarker(b, 'lift', 'inspect', 'Call the lift', { x: wx - 0.1, z: -3.6, yaw: HALF_PI }, [1.6, 2.2, 0.2], 1.1, 2.0);
  b.emitter('lift', id, 21.8, 1.5, -4.0);

  // Stairwell B approach.
  sign(b, 'STAIRWELL B', SIGN_ROOM, 0.7, 0.18, new Matrix4().setPosition(DOORS.stair, 2.27, -11 + 0.012), { canvas: [512, 132] });
  sign(b, 'NO ACCESS', { ...SIGN_DANGER, subtext: 'STRUCTURAL SURVEY PENDING' }, 0.5, 0.3, new Matrix4().makeRotationZ(-0.03).setPosition(DOORS.stair + 1.0, 1.5, -11 + 0.014), { canvas: [512, 300] });
  inspectMarker(b, 'stairwell-notice', 'inspect', 'Read the notice', { x: DOORS.stair + 1.0, z: -10.95, yaw: 0 }, [0.5, 0.3, 0.06], 1.5, 1.8);
  b.emitter('stairwell', ROOMS.stairwell, 19.5, 3.0, -13.6);
  b.sightlines.push({ id: 'nw:sightline:stair-lobby', roomId: id, position: new Vector3(19.4, 0, -10.1), yaw: 0 });
  wheelchair(b, b.layout === 'chapter1' ? { x: 20.35, z: -7.4, yaw: 0.9 } : { x: 18.75, z: -9.9, yaw: 0.9 }, id);
  cardboardBox(b, { x: 20.4, z: -10.5, yaw: 0.2 }, id, [0.5, 0.45, 0.45]);
  cardboardBox(b, { x: 20.42, z: -10.48, yaw: -0.15, y: 0.45 }, null, [0.4, 0.3, 0.38], true);

  gurney(b, { x: 20.4, z: 3.4, yaw: 0.04 }, id);
  b.emitter('trolley', id, 19.5, 1.0, 5.8);
  sign(b, 'MAINTENANCE', { ...SIGN_WARNING, subtext: 'AUTHORISED PERSONNEL ONLY' }, 0.5, 0.25, new Matrix4().makeRotationY(HALF_PI).setPosition(X.east + T + 0.012, 2.3, DOORS.maintenanceEast), { canvas: [512, 256] });
  floorDecal(b, 'stainDrag', 19.2, 6.8, 2.0, 0.5, 2.6);
  scatteredPapers(b, 19.4, -6.5, 0.6, 4);
}

function liftCar(b: WorldBuilder): void {
  const id = ROOMS.lift;
  const x0 = 21.0;
  const x1 = 22.6;
  const z0 = -4.85;
  const z1 = -3.15;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  b.block('steel', cx, -0.03, cz, x1 - x0, 0.06, z1 - z0, 0, { tint: 0.5 });
  b.block('steel', cx, 2.3, cz, x1 - x0, 0.04, z1 - z0, 0, { tint: 0.7 });
  b.block('steel', x1 + 0.02, 1.15, cz, 0.04, 2.3, z1 - z0, 0, { tint: 0.85 });
  b.block('steel', cx, 1.15, z0 - 0.02, x1 - x0, 2.3, 0.04, 0, { tint: 0.8 });
  b.block('steel', cx, 1.15, z1 + 0.02, x1 - x0, 2.3, 0.04, 0, { tint: 0.8 });
  b.block('chrome', x1 - 0.04, 0.95, cz, 0.04, 0.04, 1.4, 0, { shade: 'flat' });
  b.block('rubber', x1 - 0.5, 0.005, cz + 0.2, 0.7, 0.01, 0.5, 0.3, { tint: 0.8 });
  b.fixture({
    kind: 'lift', state: 'flicker', roomId: id, circuits: ['nw:lights:lift'], position: new Vector3(cx, 2.1, cz),
    color: 0xe8f0ff, intensity: 1.2, distance: 3, panel: { shape: 'strip', matrix: new Matrix4().makeRotationY(HALF_PI).setPosition(cx, 2.27, cz) },
  });
  b.solid(cx, 1.15, cz, x1 - x0, 2.3, z1 - z0, { roomId: id, kind: 'lift' });
}

function stairwell(b: WorldBuilder): void {
  const id = ROOMS.stairwell;
  const rise = 0.17;
  const run = 0.27;
  const steps = 10;
  for (let i = 0; i < steps; i++) {
    const top = (i + 1) * rise;
    const zf = -11.9 - i * run;
    b.block('concrete', 18.8, top / 2, zf - run / 2, 1.25, top, run, 0, { tint: 0.95 });
    b.block('steel', 18.8, top + 0.004, zf - 0.02, 1.25, 0.008, 0.04, 0, { shade: 'flat', tint: 0.6 });
    b.solid(18.8, top / 2, zf - run / 2, 1.25, top, run, { roomId: id, kind: 'stair' });
  }
  const landing = steps * rise;
  b.block('concrete', 19.5, landing / 2, -15.0, X.eastCorridorE - X.eastCorridorW, landing, 0.8);
  b.solid(19.5, landing / 2, -15.0, X.eastCorridorE - X.eastCorridorW, landing, 0.8, { roomId: id, kind: 'stair' });
  for (let j = 0; j < steps; j++) {
    const top = landing + (j + 1) * rise;
    const zf = -14.6 + j * run;
    b.block('concrete', 20.2, top / 2, zf + run / 2, 1.3, top, run, 0, { tint: 0.9 });
    b.solid(20.2, top / 2, zf + run / 2, 1.3, top, run, { roomId: id, kind: 'stair' });
  }
  b.block('concrete', 20.2, landing * 2 - 0.08, -11.52, 1.3, 0.16, 0.75);
  b.solid(20.2, landing * 2 - 0.08, -11.52, 1.3, 0.16, 0.75, { roomId: id, kind: 'stair' });
  // Handrails.
  const rail1 = cylinderBetween(new Vector3(18.22, 0.95, -11.9), new Vector3(18.22, landing + 0.95, -14.6), 0.022, 6);
  b.add('steel', rail1.geometry, rail1.matrix, { tint: 0.7 });
  const rail2 = cylinderBetween(new Vector3(19.5, landing + 0.95, -14.6), new Vector3(19.5, landing * 2 + 0.95, -11.9), 0.022, 6);
  b.add('steel', rail2.geometry, rail2.matrix, { tint: 0.7 });
  // Something was stacked on the stairs to stop anyone going up.
  cardboardBox(b, { x: 18.7, z: -12.9, yaw: 0.4, y: rise * 4 }, null, [0.5, 0.4, 0.45]);
  visitorChair(b, { x: 19.0, z: -13.7, yaw: 2.4, y: rise * 7 }, id, { collide: false });
  b.add('steel', box(1.2, 0.04, 0.04), new Matrix4().makeRotationZ(0.6).setPosition(19.0, 1.2, -13.2), { tint: 0.5 });
  sign(b, 'LEVEL 4', SIGN_ROOM, 0.4, 0.16, new Matrix4().makeRotationY(HALF_PI).setPosition(X.eastCorridorW + 0.012, 2.2, -12.4), { canvas: [384, 154] });
  floorDecal(b, 'stainDark', 19.6, -11.6, 0.8, 0.6, 0.7);
}

function maintenance(b: WorldBuilder): void {
  const id = ROOMS.maintenance;
  const x0 = -6.7;
  const x1 = X.east - 0.05;
  // Overhead services: insulated main, copper feed, cold return, rectangular duct, cable tray.
  pipeRun(b, [new Vector3(x0, 2.62, 7.72), new Vector3(x1, 2.62, 7.72)], 0.075, 'pipe');
  pipeRun(b, [new Vector3(x0, 2.78, 7.5), new Vector3(4.0, 2.78, 7.5), new Vector3(4.0, 2.78, 7.8), new Vector3(x1, 2.78, 7.8)], 0.04, 'copper');
  pipeRun(b, [new Vector3(x0, 2.45, 7.84), new Vector3(2.8, 2.45, 7.84), new Vector3(2.8, 0.35, 7.84), new Vector3(2.8, 0.35, 7.95)], 0.035, 'pipe');
  pipeRun(b, [new Vector3(9.0, 2.45, 7.84), new Vector3(x1, 2.45, 7.84)], 0.035, 'pipe');
  b.add('redPaint', torus(0.12, 0.012, 5, 14), new Matrix4().makeTranslation(2.8, 1.2, 7.72));
  b.add('steel', cylinder(0.012, 0.012, 0.14, 5), new Matrix4().makeRotationX(HALF_PI).setPosition(2.8, 1.2, 7.79));
  b.block('steel', (x0 + x1) / 2, 2.82, 6.95, x1 - x0, 0.3, 0.5, 0, { tint: 0.75 });
  for (let x = x0 + 0.6; x < x1; x += 2.1) {
    b.block('steel', x, 2.9, 7.7, 0.04, 0.16, 0.36, 0, { tint: 0.5 });
    b.block('steel', x, 2.97, 6.95, 0.04, 0.05, 0.55, 0, { tint: 0.5 });
  }
  b.block('steel', (x0 + x1) / 2, 2.58, Z.maintN + 0.18, x1 - x0, 0.05, 0.3, 0, { tint: 0.6 });
  for (let i = 0; i < 4; i++) {
    const s = cylinderBetween(new Vector3(x0, 2.62, 6.62 + i * 0.06), new Vector3(x1, 2.62, 6.62 + i * 0.06), 0.012 + (i % 2) * 0.006, 5);
    b.add('rubber', s.geometry, s.matrix, { tint: i === 2 ? [1.6, 0.6, 0.4] : 1 });
  }
  // Sagging cable loop near the west end.
  const sag = [new Vector3(-3.0, 2.6, 6.75), new Vector3(-2.4, 1.9, 6.8), new Vector3(-1.8, 2.6, 6.75)];
  pipeRun(b, sag, 0.012, 'rubber');

  for (const [bx, state] of [[-4.5, 'steady'], [1.5, 'dead'], [6.5, 'flicker'], [11.5, 'steady'], [16.0, 'dying']] as const) {
    cagedBulb(b, id, bx, 2.48, 7.25, state, 2.0);
  }

  electricalPanel(b, { x: -2.0, z: Z.maintN, yaw: 0 }, true);
  electricalPanel(b, { x: 3.6, z: Z.maintN, yaw: 0 }, false);
  sign(b, 'DANGER  415V', SIGN_DANGER, 0.3, 0.12, new Matrix4().setPosition(3.6, 2.05, Z.maintN + 0.012), { canvas: [384, 154] });
  sign(b, 'DON\'T TAKE THE LIFT', SIGN_PAPER, 0.34, 0.2, new Matrix4().makeRotationZ(0.05).setPosition(8.1, 1.55, Z.maintN + 0.012), { canvas: [384, 226] });
  // Calorifier (hot water cylinder) narrowing the passage.
  b.add('copper', cylinder(0.3, 0.3, 1.9, 14), new Matrix4().makeTranslation(9.0, 0.95, 7.62), { tint: 0.75 });
  b.add('pipe', cylinder(0.32, 0.32, 0.06, 14), new Matrix4().makeTranslation(9.0, 1.93, 7.62));
  pipeRun(b, [new Vector3(9.0, 1.95, 7.62), new Vector3(9.0, 2.45, 7.62), new Vector3(9.0, 2.45, 7.84)], 0.03, 'copper');
  b.solid(9.0, 0.95, 7.65, 0.62, 1.9, 0.6, { roomId: id, kind: 'prop' });
  // Floor: puddle under a weeping joint, grating, tools.
  puddle(b, 4.2, 7.3, 1.8, 1.0);
  b.emitter('drip', id, 4.2, 2.7, 7.4);
  for (let gx = 12.2; gx < 14.6; gx += 0.6) b.block('steel', gx, 0.006, 7.25, 0.58, 0.012, 0.9, 0, { tint: 0.45 });
  put(b, { x: -4.2, z: 7.72, yaw: 0.2 }, 'redPaint', box(0.45, 0.2, 0.22), 0, 0.1, 0);
  collide(b, { x: -4.2, z: 7.72, yaw: 0.2 }, id, 0, 0.1, 0, 0.45, 0.2, 0.22);
  mopBucket(b, { x: -6.3, z: 7.6, yaw: 0.8 }, id);
  stepLadder(b, { x: 14.9, z: 7.72, yaw: Math.PI / 2 }, id);
  cardboardBox(b, { x: 17.2, z: 7.72, yaw: 0.1 }, id, [0.42, 0.4, 0.4]);
  cardboardBox(b, { x: 0.3, z: 7.76, yaw: -0.1 }, id, [0.38, 0.3, 0.34], true);
  b.sightlines.push(
    { id: 'nw:sightline:maintenance-east', roomId: id, position: new Vector3(17.3, 0, 7.25), yaw: HALF_PI },
    { id: 'nw:sightline:maintenance-west', roomId: id, position: new Vector3(-6.2, 0, 7.15), yaw: -HALF_PI },
  );
  b.emitter('pipes', id, -2.0, 2.6, 7.6);
  b.emitter('pipes', id, 8.0, 2.6, 7.6);
  b.emitter('pipes', id, 15.0, 2.6, 7.6);
  b.emitter('door', id, -6.6, 1.2, 7.2);
  // Connector signage and the trail leading through the service door.
  sign(b, 'MAINTENANCE', { ...SIGN_WARNING, subtext: 'AUTHORISED PERSONNEL ONLY' }, 0.5, 0.25, new Matrix4().makeRotationY(Math.PI).setPosition(DOORS.maintenanceWest, 2.35, Z.southBack - 0.012), { canvas: [512, 256] });
  floorDecal(b, 'stainDrag', -5.7, 5.4, 1.8, 0.5, HALF_PI + 0.15);
  b.block('chrome', -6.4, 0.45, 3.0, 0.5, 0.9, 0.5, 0.2, { tint: 0.6 });
  b.solid(-6.4, 0.45, 3.0, 0.5, 0.9, 0.5, { yaw: 0.2, roomId: ROOMS.connector, kind: 'prop' });
  for (let i = 0; i < 4; i++) b.block('fabricSeat', -6.4, 0.92 + i * 0.09, 3.0, 0.48, 0.06, 0.46, 0.2 + i * 0.05, { tint: [0.9, 0.7, 0.6] });
}

/**
 * Chapter 1 (blockout): Stairwell B at ward level. The barrier opens onto a flat landing; the up
 * flights are gone and a down flight falls away north to the lower infirmary. It is visible, with
 * its rail, but a mesh gate across its head stops anyone entering it in this chapter.
 */
function chapter1Landing(b: WorldBuilder): void {
  const id = ROOMS.stairwell;
  const { z0 } = C1.landing;
  const rise = 0.17;
  const run = 0.27;
  // Down flight: ten steps from the landing edge, descending north (visual; below the floor).
  for (let i = 0; i < 10; i++) {
    const top = -(i + 1) * rise;
    const zf = z0 - i * run;
    b.block('concrete', 19.5, top - 0.1, zf - run / 2, 2.6, 0.2, run, 0, { tint: 0.85 - i * 0.04 });
    b.block('steel', 19.5, top + 0.004, zf - 0.02, 2.6, 0.008, 0.04, 0, { shade: 'flat', tint: 0.5 });
  }
  b.block('concrete', 19.5, -1.8, -14.9, 2.7, 0.1, 1.0, 0, { tint: 0.4 });
  // Edge nosing, a rail down the west side, and the mesh gate across the head of the flight.
  b.block('yellowPaint', 19.5, 0.005, z0 + 0.03, 2.7, 0.01, 0.06, 0, { shade: 'flat' });
  const rail = cylinderBetween(new Vector3(18.3, 0.95, z0), new Vector3(18.3, 0.95 - 10 * rise, z0 - 10 * run), 0.022, 6);
  b.add('steel', rail.geometry, rail.matrix, { tint: 0.7 });
  for (const x of [X.eastCorridorW + 0.05, X.eastCorridorE - 0.05]) b.block('steel', x, 1.0, z0 - 0.05, 0.05, 2.0, 0.05, 0, { tint: 0.6 });
  b.block('steel', 19.5, 2.0, z0 - 0.05, 2.7, 0.05, 0.05, 0, { tint: 0.6 });
  b.block('steel', 19.5, 1.0, z0 - 0.05, 2.7, 0.04, 0.03, 0, { tint: 0.6 });
  for (let x = X.eastCorridorW + 0.2; x < X.eastCorridorE - 0.1; x += 0.15) b.block('steel', x, 1.0, z0 - 0.05, 0.012, 2.0, 0.012, 0, { shade: 'flat', tint: 0.45 });
  b.solid(19.5, 1.2, z0 + 0.0, X.eastCorridorE - X.eastCorridorW, 2.4, 0.1, { roomId: id, kind: 'stair-gate' });
  sign(b, 'LOWER INFIRMARY — NO ACCESS', SIGN_DANGER, 0.6, 0.12, new Matrix4().setPosition(19.5, 1.5, z0 - 0.02), { canvas: [640, 128] });
  sign(b, 'LEVEL 4', SIGN_ROOM, 0.4, 0.16, new Matrix4().makeRotationY(HALF_PI).setPosition(X.eastCorridorW + 0.012, 2.2, -12.0), { canvas: [384, 154] });
  floorDecal(b, 'stainDark', 19.6, -11.6, 0.8, 0.6, 0.7);
  void T;
}
