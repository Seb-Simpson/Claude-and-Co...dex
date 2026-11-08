import { Matrix4, Vector3 } from 'three';
import { ceilingRect, door, emergencyLight, floorRect, troffer, wall, windowUnit, type Opening } from '../architecture';
import type { WorldBuilder } from '../core/builder';
import { box } from '../core/geometry';
import { CEILING, DOORS, KEY_STAIRWELL, ROOMS, T, X, Z } from '../layout';
import { SIGN_EXIT, sign } from '../props/common';

const doorOpening = (center: number, width = 1.2): Opening => ({ from: center - width / 2, to: center + width / 2, bottom: 0, top: 2.1 });
const windowOpening = (center: number, width: number, bottom = 0.85, top = 2.2): Opening => ({ from: center - width / 2, to: center + width / 2, bottom, top });

/** Threshold plate covering the wall thickness under a doorway. */
function threshold(b: WorldBuilder, axis: 'x' | 'z', at: number, center: number, width = 1.2): void {
  const m = new Matrix4().makeTranslation(axis === 'x' ? center : at, 0.004, axis === 'x' ? at : center);
  b.add('steel', box(axis === 'x' ? width : T + 0.06, 0.008, axis === 'x' ? T + 0.06 : width), m, { shade: 'flat', tint: 0.7 });
}

/** Walls, floors, ceilings, doors, windows and base lighting for the whole wing. */
export function buildShell(b: WorldBuilder): void {
  const corridorFinish = { wainscot: true, rail: true } as const;
  const roomFinish = { skirting: true } as const;

  // ---- Floors --------------------------------------------------------------------------------
  floorRect(b, ROOMS.corridor, X.west, X.east, Z.corridorN, Z.corridorS);
  floorRect(b, ROOMS.east, X.east, X.eastCorridorE, -11, Z.maintS);
  const north: [string, number, number][] = [
    [ROOMS.r101, -20, -15.6], [ROOMS.r103, -15.6, -11.2], [ROOMS.r105, -11.2, -6.8], [ROOMS.treatment, 0.2, 6.6], [ROOMS.r107, 6.6, 11], [ROOMS.storage, 11, 18],
  ];
  for (const [id, x0, x1] of north) floorRect(b, id, x0 + (x0 === -20 ? 0 : T / 2), x1 - (x1 === 18 ? 0 : T / 2), Z.northBack, Z.northFace);
  floorRect(b, ROOMS.nurses, -6.8 + T / 2, 0.2 - T / 2, Z.northBack, Z.corridorN);
  const south: [string, number, number][] = [
    [ROOMS.r102, -20, -15.6], [ROOMS.r104, -15.6, -11.2], [ROOMS.r106, -11.2, -6.8], [ROOMS.r108, -4.6, -0.2], [ROOMS.r110, 6.0, 10.4],
  ];
  for (const [id, x0, x1] of south) floorRect(b, id, x0 + (x0 === -20 ? 0 : T / 2), x1 - T / 2, Z.southFace, Z.southBack);
  floorRect(b, ROOMS.connector, -6.8 + T / 2, -4.6 - T / 2, Z.corridorS, Z.southBack);
  floorRect(b, ROOMS.waiting, -0.2 + T / 2, 6.0 - T / 2, Z.corridorS, Z.southBack);
  floorRect(b, ROOMS.maintenance, -6.8, X.east, Z.maintN, Z.maintS, 'floorConcrete', { aoStrength: 0.55 });
  floorRect(b, ROOMS.stairwell, X.eastCorridorW, X.eastCorridorE, -15.4, -11 - T, 'floorConcrete');

  // ---- Corridor walls --------------------------------------------------------------------------
  wall(b, {
    axis: 'x', at: Z.corridorN - T / 2, from: -20 - T, to: X.eastCorridorW, roomId: ROOMS.corridor,
    openings: [doorOpening(DOORS.r101), doorOpening(DOORS.r103), doorOpening(DOORS.r105), { from: -6.4, to: -0.2, bottom: 0, top: 2.3 }, doorOpening(DOORS.treatment), doorOpening(DOORS.r107), doorOpening(DOORS.storage)],
    pos: corridorFinish, neg: roomFinish,
  });
  wall(b, {
    axis: 'x', at: Z.corridorS + T / 2, from: -20 - T, to: X.eastCorridorW, roomId: ROOMS.corridor,
    openings: [doorOpening(DOORS.r102), doorOpening(DOORS.r104), doorOpening(DOORS.r106), { from: -6.8 + T / 2, to: -4.6 - T / 2, bottom: 0, top: 2.4 }, doorOpening(DOORS.r108), { from: 0.2, to: 5.6, bottom: 0, top: 2.4 }, doorOpening(DOORS.r110)],
    neg: corridorFinish, pos: roomFinish,
  });
  // North exterior with patient-room windows.
  wall(b, {
    axis: 'x', at: Z.northBack - T / 2, from: -20 - T, to: X.eastCorridorW, roomId: ROOMS.corridor,
    openings: [windowOpening(-17.8, 1.6), windowOpening(-13.4, 1.6), windowOpening(-9.0, 2.0), windowOpening(3.4, 1.8), windowOpening(8.8, 1.6)],
    pos: roomFinish,
  });
  // West end wall with the tall corridor window.
  wall(b, {
    axis: 'z', at: -20 - T / 2, from: Z.northBack - T, to: Z.southBack + T, roomId: ROOMS.corridor,
    openings: [windowOpening(0, 1.8, 0.75, 2.4)], pos: roomFinish,
  });
  // Partitions.
  for (const x of [-15.6, -11.2, -6.8, 0.2, 6.6, 11.0]) {
    wall(b, { axis: 'z', at: x, from: Z.northBack, to: Z.northFace, neg: roomFinish, pos: roomFinish });
  }
  for (const x of [-15.6, -11.2, -6.8, -4.6, -0.2, 6.0, 10.4]) {
    const connectorSide = x === -6.8 ? { pos: corridorFinish, neg: roomFinish } : x === -4.6 ? { neg: corridorFinish, pos: roomFinish } : { neg: roomFinish, pos: roomFinish };
    wall(b, { axis: 'z', at: x, from: Z.southFace, to: Z.southBack, ...connectorSide });
  }
  // Rear of the south rooms / maintenance passage north wall.
  wall(b, {
    axis: 'x', at: Z.southBack + T / 2, from: -20 - T, to: X.eastCorridorW, openings: [doorOpening(DOORS.maintenanceWest)],
    neg: roomFinish, pos: { skin: 'concrete', skirting: false },
  });
  // Maintenance passage outer wall and west end (raw concrete).
  wall(b, { axis: 'x', at: Z.maintS + T / 2, from: -6.8 - T, to: X.eastCorridorE + T, core: 'concrete', neg: { skirting: false } });
  wall(b, { axis: 'z', at: -6.8 - T / 2, from: Z.southBack, to: Z.maintS + T, core: 'concrete' });

  // ---- East corridor -----------------------------------------------------------------------
  wall(b, {
    axis: 'z', at: X.east + T / 2, from: -11 - T, to: Z.corridorN - T, openings: [windowOpening(-8.9, 2.0)],
    pos: corridorFinish, neg: roomFinish, roomId: ROOMS.east,
  });
  wall(b, {
    axis: 'z', at: X.east + T / 2, from: Z.corridorS + T, to: Z.maintS + T, openings: [doorOpening(DOORS.maintenanceEast)],
    pos: corridorFinish, neg: { skin: 'concrete', skirting: false }, roomId: ROOMS.east,
  });
  wall(b, {
    axis: 'z', at: X.eastCorridorE + T / 2, from: -11 - T, to: Z.maintS + T,
    openings: [{ from: -4.6, to: -3.4, bottom: 0, top: 2.2, collide: true }], neg: corridorFinish, roomId: ROOMS.east,
  });
  wall(b, {
    axis: 'x', at: -11 - T / 2, from: X.east, to: X.eastCorridorE + T, openings: [doorOpening(DOORS.stair)],
    pos: { wainscot: true }, neg: { skin: 'concrete', skirting: false }, roomId: ROOMS.east,
  });
  // Stairwell shaft (tall, concrete).
  wall(b, { axis: 'z', at: X.east + T / 2, from: -15.4 - T, to: -11, core: 'concrete', height: CEILING.stair });
  wall(b, { axis: 'z', at: X.eastCorridorE + T / 2, from: -15.4 - T, to: -11, core: 'concrete', height: CEILING.stair });
  wall(b, { axis: 'x', at: -15.4 - T / 2, from: X.east, to: X.eastCorridorE + T, core: 'concrete', height: CEILING.stair });
  b.block('concrete', 19.5, 4.5, -11 - T / 2, 2.85, 3, T);

  // ---- Windows -------------------------------------------------------------------------------
  windowUnit(b, { axis: 'x', at: Z.northBack - T / 2, from: -18.6, to: -17.0, bottom: 0.85, top: 2.2, outside: -1, roomId: ROOMS.r101, blinds: 'broken' });
  windowUnit(b, { axis: 'x', at: Z.northBack - T / 2, from: -14.2, to: -12.6, bottom: 0.85, top: 2.2, outside: -1, roomId: ROOMS.r103, blinds: 'closed', moonIntensity: 0.8 });
  windowUnit(b, { axis: 'x', at: Z.northBack - T / 2, from: -10.0, to: -8.0, bottom: 0.85, top: 2.2, outside: -1, roomId: ROOMS.r105, blinds: 'half' });
  windowUnit(b, { axis: 'x', at: Z.northBack - T / 2, from: 2.5, to: 4.3, bottom: 0.85, top: 2.2, outside: -1, roomId: ROOMS.treatment, blinds: 'open' });
  windowUnit(b, { axis: 'x', at: Z.northBack - T / 2, from: 8.0, to: 9.6, bottom: 0.85, top: 2.2, outside: -1, roomId: ROOMS.r107, boarded: true });
  windowUnit(b, { axis: 'z', at: -20 - T / 2, from: -0.9, to: 0.9, bottom: 0.75, top: 2.4, outside: -1, roomId: ROOMS.corridor, blinds: 'half', moonIntensity: 2.2 });
  windowUnit(b, { axis: 'z', at: X.east + T / 2, from: -9.9, to: -7.9, bottom: 0.85, top: 2.2, outside: -1, roomId: ROOMS.east, blinds: 'broken' });

  // ---- Ceilings ------------------------------------------------------------------------------
  ceilingRect(b, X.west, -7, Z.corridorN, Z.corridorS, CEILING.corridor, 'ceilingStained', [{ x: -16.5, z: 0.3, hanging: false }, { x: -9.3, z: -0.3 }]);
  ceilingRect(b, -7, DOORS.smoke, Z.corridorN, Z.corridorS, CEILING.corridor, 'ceiling', [{ x: 1.7, z: 0.3 }]);
  ceilingRect(b, DOORS.smoke, X.east, Z.corridorN, Z.corridorS, CEILING.corridor, 'ceilingStained', [{ x: 12.5, z: -0.3 }]);
  ceilingRect(b, X.east, X.eastCorridorE, -11, Z.maintS, CEILING.corridor, 'ceilingStained', [{ x: 19.5, z: 3.3 }]);
  const ceilingFor = (id: string): 'ceiling' | 'ceilingStained' => ([ROOMS.r101, ROOMS.r106, ROOMS.r108, ROOMS.storage, ROOMS.r107] as string[]).includes(id) ? 'ceilingStained' : 'ceiling';
  for (const [id, x0, x1] of north) {
    const holes = id === ROOMS.r101 ? [{ x: -18.0, z: -3.5, hanging: true }] : [];
    ceilingRect(b, x0 + (x0 === -20 ? 0 : T / 2), x1 - (x1 === 18 ? 0 : T / 2), Z.northBack, Z.northFace, CEILING.room, ceilingFor(id), holes);
  }
  ceilingRect(b, -6.8 + T / 2, 0.2 - T / 2, Z.northBack, Z.corridorN, CEILING.corridor, 'ceiling');
  for (const [id, x0, x1] of south) {
    const holes = id === ROOMS.r106 ? [{ x: -9.5, z: 4.2, hanging: true }, { x: -8.9, z: 4.8 }, { x: -9.5, z: 3.6 }] : id === ROOMS.r108 ? [{ x: -2.8, z: 3.2 }] : [];
    ceilingRect(b, x0 + (x0 === -20 ? 0 : T / 2), x1 - T / 2, Z.southFace, Z.southBack, CEILING.room, ceilingFor(id), holes);
  }
  ceilingRect(b, -6.8 + T / 2, -4.6 - T / 2, Z.corridorS, Z.southBack, CEILING.corridor, 'ceilingStained');
  ceilingRect(b, -0.2 + T / 2, 6.0 - T / 2, Z.corridorS, Z.southBack, CEILING.corridor, 'ceiling', [{ x: 4.6, z: 5.2 }]);
  ceilingRect(b, -6.8, X.east, Z.maintN, Z.maintS, CEILING.service, 'concrete');
  ceilingRect(b, X.eastCorridorW, X.eastCorridorE, -15.4, -11 - T, CEILING.stair - 0.02, 'concrete');
  // Bulkhead soffits over open thresholds.
  b.block('wall', -3.3, 2.5, Z.corridorN - T / 2, 6.2, 0.4, T + 0.02);

  // ---- Doors ---------------------------------------------------------------------------------
  const north_ = Z.corridorN - T / 2;
  const south_ = Z.corridorS + T / 2;
  door(b, { name: 'room-101', roomId: ROOMS.r101, axis: 'x', at: north_, center: DOORS.r101, hinge: 'max', swing: 'neg', initial: 'closed', leafTint: 0.85 });
  door(b, { name: 'room-103', roomId: ROOMS.r103, axis: 'x', at: north_, center: DOORS.r103, hinge: 'max', swing: 'neg', initial: 'closed' });
  door(b, { name: 'room-105', roomId: ROOMS.r105, axis: 'x', at: north_, center: DOORS.r105, hinge: 'max', swing: 'neg', initial: 'open', openAngle: Math.PI * 0.42 });
  door(b, { name: 'treatment', roomId: ROOMS.treatment, axis: 'x', at: north_, center: DOORS.treatment, hinge: 'min', swing: 'neg', initial: 'closed', vision: 'wide' });
  door(b, { name: 'room-107', roomId: ROOMS.r107, axis: 'x', at: north_, center: DOORS.r107, hinge: 'min', swing: 'neg', initial: 'closed', vision: 'none', leafTint: 0.8 });
  door(b, { name: 'storage', roomId: ROOMS.storage, axis: 'x', at: north_, center: DOORS.storage, hinge: 'min', swing: 'neg', initial: 'closed', vision: 'none', prompt: 'Open storage door' });
  door(b, { name: 'room-102', roomId: ROOMS.r102, axis: 'x', at: south_, center: DOORS.r102, hinge: 'max', swing: 'pos', initial: 'open', openAngle: Math.PI * 0.3 });
  door(b, { name: 'room-104', roomId: ROOMS.r104, axis: 'x', at: south_, center: DOORS.r104, hinge: 'max', swing: 'pos', initial: 'open' });
  door(b, { name: 'room-106', roomId: ROOMS.r106, axis: 'x', at: south_, center: DOORS.r106, hinge: 'max', swing: 'pos', initial: 'closed' });
  door(b, { name: 'room-108', roomId: ROOMS.r108, axis: 'x', at: south_, center: DOORS.r108, hinge: 'max', swing: 'pos', initial: 'open', openAngle: Math.PI * 0.18 });
  door(b, { name: 'room-110', roomId: ROOMS.r110, axis: 'x', at: south_, center: DOORS.r110, hinge: 'min', swing: 'pos', initial: 'closed' });
  // The maintenance passage is part of the Patient's patrol loop (it spawns there). Entities cannot
  // open doors, so both service doors start ajar; closed, they sealed the Patient in for the game.
  door(b, { name: 'maintenance-west', roomId: ROOMS.connector, axis: 'x', at: Z.southBack + T / 2, center: DOORS.maintenanceWest, hinge: 'min', swing: 'neg', initial: 'open', openAngle: Math.PI * 0.45, vision: 'none', leafTint: 0.6, prompt: 'Open maintenance door' });
  door(b, { name: 'maintenance-east', roomId: ROOMS.east, axis: 'z', at: X.east + T / 2, center: DOORS.maintenanceEast, hinge: 'min', swing: 'pos', initial: 'open', openAngle: Math.PI * 0.45, vision: 'none', leafTint: 0.6, prompt: 'Open maintenance door' });
  door(b, {
    name: 'stairwell-b', roomId: ROOMS.east, axis: 'x', at: -11 - T / 2, center: DOORS.stair, hinge: 'min', swing: 'neg', initial: 'locked', vision: 'wide',
    chained: true, requirements: [KEY_STAIRWELL], prompt: 'Chained shut — Stairwell B', leafTint: 0.75,
  });
  // Smoke-control double doors held open on magnets across the corridor.
  for (const [center, hinge] of [[-0.7, 'min'], [0.7, 'max']] as const) {
    door(b, { name: `smoke-${hinge === 'min' ? 'north' : 'south'}`, roomId: ROOMS.corridor, axis: 'z', at: DOORS.smoke, center, opening: 1.4, hinge, swing: 'pos', initial: 'open', vision: 'wide', frame: false, openAngle: Math.PI * 0.5 });
  }
  b.block('frame', DOORS.smoke, 2.4, 0, 0.18, 0.6, 2.8);
  b.block('frame', DOORS.smoke, 1.05, -1.38, 0.18, 2.1, 0.06);
  b.block('frame', DOORS.smoke, 1.05, 1.38, 0.18, 2.1, 0.06);
  for (const z of [-1.37, 1.37]) b.block('steel', DOORS.smoke + 1.4, 1.9, z, 0.08, 0.08, 0.04, 0, { shade: 'flat', tint: 0.5 });

  for (const [axis, at, center] of [
    ['x', north_, DOORS.r101], ['x', north_, DOORS.r103], ['x', north_, DOORS.r105], ['x', north_, DOORS.treatment], ['x', north_, DOORS.r107], ['x', north_, DOORS.storage],
    ['x', south_, DOORS.r102], ['x', south_, DOORS.r104], ['x', south_, DOORS.r106], ['x', south_, DOORS.r108], ['x', south_, DOORS.r110],
    ['x', Z.southBack + T / 2, DOORS.maintenanceWest], ['z', X.east + T / 2, DOORS.maintenanceEast], ['x', -11 - T / 2, DOORS.stair], ['z', X.eastCorridorE + T / 2, -4.0],
  ] as const) threshold(b, axis, at, center);

  // ---- Corridor lighting ---------------------------------------------------------------------
  const corridorStates = [
    [-18.2, 'flicker'], [-14.6, 'dead'], [-11.0, 'steady'], [-7.4, 'buzz'], [-3.8, 'steady'], [-0.2, 'dying'],
    [3.4, 'steady'], [7.0, 'dead'], [10.6, 'flicker'], [14.2, 'dead'],
  ] as const;
  for (const [x, state] of corridorStates) troffer(b, ROOMS.corridor, x, 0, CEILING.corridor, state, ['nw:lights:corridor-main']);
  for (const [z, state] of [[-9.0, 'dead'], [-4.6, 'flicker'], [0, 'steady'], [4.6, 'dying']] as const) {
    troffer(b, ROOMS.east, 19.5, z, CEILING.corridor, state, ['nw:lights:corridor-east'], { rotate: true });
  }
  troffer(b, ROOMS.connector, -5.7, 3.9, CEILING.corridor, 'flicker', ['nw:lights:connector'], { rotate: true, intensity: 3.5 });
  emergencyLight(b, ROOMS.east, new Vector3(19.5, 2.56, -10.92), 0, { intensity: 1.6 });
  emergencyLight(b, ROOMS.stairwell, new Vector3(18.3, 2.6, -13.5), Math.PI / 2, { intensity: 3 });
  emergencyLight(b, ROOMS.corridor, new Vector3(-19.9, 2.45, -1.1), Math.PI / 2, { color: 0xffa040, intensity: 1.3, state: 'flicker' });
  emergencyLight(b, ROOMS.maintenance, new Vector3(-6.7, 2.4, 7.25), Math.PI / 2, { color: 0xff5020, intensity: 1.6 });

  // Hanging EXIT sign pointing toward the chained stairwell — a cruel joke.
  const exitMatrix = new Matrix4().makeRotationY(-Math.PI / 2).setPosition(16.2, 2.45, 0);
  b.block('whitePlastic', 16.2, 2.45, 0, 0.06, 0.24, 0.62, 0, { shade: 'flat', tint: 0.7 });
  b.block('steel', 16.2, 2.62, 0, 0.01, 0.16, 0.01, 0, { shade: 'flat' });
  for (const face of [-1, 1]) {
    const m = new Matrix4().makeRotationY(face < 0 ? -Math.PI / 2 : Math.PI / 2).setPosition(16.2 + face * 0.032, 2.45, 0);
    const mesh = sign(b, 'EXIT  →', SIGN_EXIT, 0.58, 0.2, m, { emissive: true, canvas: [512, 176] });
    b.fixture({
      kind: 'exit', state: 'buzz', roomId: ROOMS.corridor, circuits: ['nw:lights:exit'],
      position: new Vector3(16.2 + face * 0.2, 2.3, 0), color: 0x2aff6a, intensity: face < 0 ? 0.6 : 0, distance: 3.5,
      material: mesh.material as import('three').MeshBasicMaterial, halo: face < 0 ? 0.9 : 0, haloOpacity: 0.3,
    });
  }
  void exitMatrix;

  // Room connectivity (doorways and open thresholds) for atmosphere/sound occlusion.
  for (const id of [ROOMS.r101, ROOMS.r103, ROOMS.r105, ROOMS.nurses, ROOMS.treatment, ROOMS.r107, ROOMS.storage, ROOMS.r102, ROOMS.r104, ROOMS.r106, ROOMS.r108, ROOMS.r110, ROOMS.connector, ROOMS.waiting, ROOMS.east]) {
    b.connect(ROOMS.corridor, id);
  }
  b.connect(ROOMS.connector, ROOMS.maintenance);
  b.connect(ROOMS.maintenance, ROOMS.east);
  b.connect(ROOMS.east, ROOMS.stairwell);
}
