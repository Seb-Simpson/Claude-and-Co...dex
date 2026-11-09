import { Matrix4, Vector3 } from 'three';
import { cagedBulb, ceilingRect, door, emergencyLight, floorRect, troffer, wall } from '../architecture';
import type { WorldBuilder } from '../core/builder';
import { box } from '../core/geometry';
import { C1, CEILING, DOORS, KEY_ELECTRICAL, ROOMS, T, X, Z } from '../layout';
import { SIGN_DANGER, SIGN_PAPER, SIGN_ROOM, SIGN_WARNING, collide, put, sign } from '../props/common';
import {
  binders, cardboardBox, computerMonitor, electricalPanel, floorDecal, officeChair, phone, pipeRun, scatteredPapers, shelvingUnit,
} from '../props/furniture';
import { addLockerHiding, inspectMarker } from './hiding';

const HALF_PI = Math.PI / 2;
/** Records 112 spans x 10.4 to 14.2; Electrical 114 spans x 14.2 to 18 (the former unbuilt south block). */
export const RECORDS_X = [10.4, 14.2] as const;
export const ELECTRICAL_X = [14.2, 18] as const;

/**
 * NW-004A: Medical Records (112) and the Electrical / service room (114), built in the south block
 * between Room 110 and the east corridor, which was unbuilt. No existing room, door or collider
 * moves. The rooms add walkable space behind two new corridor doors, plus one locked service door
 * from Electrical into the maintenance passage: a provisional alternate route. It stays locked, so
 * it changes no navigation, until Codex decides whether Chapter 1 uses it.
 */
export function buildRecordsAndElectrical(b: WorldBuilder): void {
  // Chapter 1 layout v2: Records moves into the old Room 108 footprint (x -4.6..-0.2, door -2.4);
  // the old Records footprint becomes the release vestibule (built in chapter1Layout.ts).
  const chapter1 = b.layout === 'chapter1';
  const [rx0, rx1] = chapter1 ? C1.recordsX : RECORDS_X;
  const recordsDoor = chapter1 ? C1.recordsDoor : DOORS.records;
  const [ex0, ex1] = ELECTRICAL_X;
  const roomFinish = { skirting: true } as const;
  floorRect(b, ROOMS.records, rx0 + T / 2, rx1 - T / 2, Z.southFace, Z.southBack);
  floorRect(b, ROOMS.electrical, ex0 + T / 2, ex1, Z.southFace, Z.southBack, 'floorConcrete', { aoStrength: 0.55 });
  wall(b, {
    axis: 'z', at: ex0, from: Z.southFace, to: Z.southBack, neg: roomFinish, pos: { skin: 'concrete', skirting: false },
    ...(chapter1 ? { openings: [{ from: C1.vestibuleElectricalZ - 0.6, to: C1.vestibuleElectricalZ + 0.6, bottom: 0, top: 2.1 }] } : {}),
  });
  ceilingRect(b, rx0 + T / 2, rx1 - T / 2, Z.southFace, Z.southBack, CEILING.room, 'ceilingStained', [{ x: rx0 + 3.0, z: 5.4, hanging: true }]);
  ceilingRect(b, ex0 + T / 2, ex1, Z.southFace, Z.southBack, CEILING.room, 'concrete');

  const south = Z.corridorS + T / 2;
  const recordsInitial = chapter1 ? (b.stage === 'act1' ? 'locked' : 'closed') : 'closed';
  door(b, {
    name: 'records-112', roomId: ROOMS.records, axis: 'x', at: south, center: recordsDoor, hinge: 'max', swing: 'pos', initial: recordsInitial, vision: 'wide',
    prompt: recordsInitial === 'locked' ? 'Locked — released from the station' : 'Open Medical Records',
  });
  door(b, { name: 'electrical-114', roomId: ROOMS.electrical, axis: 'x', at: south, center: DOORS.electrical, hinge: 'min', swing: 'pos', initial: 'closed', vision: 'none', leafTint: 0.7, prompt: 'Open electrical room' });
  door(b, chapter1 ? {
    // Chapter 1: the provisional service key is withdrawn; the door is an ordinary closed door.
    name: 'electrical-service', roomId: ROOMS.electrical, axis: 'x', at: Z.southBack + T / 2, center: DOORS.electricalService, hinge: 'max', swing: 'neg',
    initial: 'closed', vision: 'none', leafTint: 0.55, prompt: 'Open service door',
  } : {
    name: 'electrical-service', roomId: ROOMS.electrical, axis: 'x', at: Z.southBack + T / 2, center: DOORS.electricalService, hinge: 'max', swing: 'neg',
    initial: 'locked', vision: 'none', leafTint: 0.55, requirements: [KEY_ELECTRICAL], prompt: 'Locked — Electrical service door',
  });
  if (!chapter1) {
    b.connect(ROOMS.corridor, ROOMS.records);
    b.connect(ROOMS.corridor, ROOMS.electrical);
    b.connect(ROOMS.electrical, ROOMS.maintenance);
  }

  records(b, rx0, rx1, recordsDoor);
  electrical(b);
  if (!chapter1) wayfinding(b);
}

/** Hanging double-sided corridor signs: quiet wayfinding toward Records, Electrical and Stairs B. */
function wayfinding(b: WorldBuilder): void {
  const signs: [number, string, string][] = [
    [-6.9, 'NURSES\u2019 STATION  ·  112 – 114  ·  STAIRS B  →', '←  ROOMS 101 – 106'],
    [9.7, 'RECORDS 112  ·  ELECTRICAL 114  ·  STAIRS B  →', '←  NURSES\u2019 STATION  ·  ROOMS 101 – 110'],
  ];
  for (const [x, east, west] of signs) {
    b.block('whitePlastic', x, 2.43, 0, 0.05, 0.2, 1.3, 0, { shade: 'flat', tint: 0.75 });
    for (const dz of [-0.45, 0.45]) b.block('steel', x, 2.6, dz, 0.01, 0.14, 0.01, 0, { shade: 'flat' });
    for (const [face, text] of [[1, west], [-1, east]] as const) {
      // A sign facing +x is read by someone walking west, and vice versa.
      const m = new Matrix4().makeRotationY(face > 0 ? HALF_PI : -HALF_PI).setPosition(x + face * 0.027, 2.43, 0);
      sign(b, text, SIGN_ROOM, 1.26, 0.17, m, { canvas: [1024, 138] });
    }
  }
}

function records(b: WorldBuilder, x0: number, x1: number, doorX: number): void {
  const id = ROOMS.records;
  /** Offset from the classic position (x0 10.4): the room keeps its west-wall arrangement. */
  const dx = x0 - RECORDS_X[0];
  // Interior: x 10.475..14.125, z 1.625..6.4. The door (x 11.35..12.55) opens onto a clear front
  // zone; two double-sided archive racks run east-west behind it with a 0.9 m aisle between them
  // and a 1.5 m back aisle; a 1.3 m strip along the west wall holds the cupboard and the desk.
  for (const [i, z] of [3.2, 4.6].entries()) {
    shelvingUnit(b, { x: 12.85 + dx, z, yaw: 0 }, id, { width: 2.2, depth: 0.5, height: 2.1, fill: i === 1 ? 0.5 : 0.85 });
  }
  // Two filing cabinets by the door, one drawer pulled out and empty.
  for (const [i, z] of [1.95, 2.5].entries()) {
    const p = { x: x1 - 0.32, z, yaw: -HALF_PI };
    put(b, p, 'lockerPaint', box(0.47, 1.32, 0.62), 0, 0.66, 0, 0, 0, 0, { tint: [0.62, 0.66, 0.6] });
    for (let d = 0; d < 4; d++) put(b, p, 'steel', box(0.18, 0.02, 0.02), 0, 0.28 + d * 0.31, 0.32, 0, 0, 0, { tint: 0.7 });
    collide(b, p, id, 0, 0.66, 0, 0.47, 1.32, 0.62);
    if (i === 1) put(b, p, 'lockerPaint', box(0.42, 0.26, 0.5), 0, 0.9, 0.55, 0, 0, 0, { tint: [0.6, 0.64, 0.58] });
  }
  // The archivist's desk against the west wall. The contradictory record lies open on it.
  const desk = { x: x0 + 0.45, z: 5.6, yaw: HALF_PI };
  put(b, desk, 'laminate', box(1.4, 0.04, 0.68), 0, 0.74, 0);
  for (const sx of [-0.66, 0.66]) put(b, desk, 'steel', box(0.04, 0.72, 0.62), sx, 0.36, 0, 0, 0, 0, { tint: 0.6 });
  collide(b, desk, id, 0, 0.38, 0, 1.4, 0.76, 0.68);
  computerMonitor(b, { x: x0 + 0.3, z: 6.0, yaw: HALF_PI + 0.2 }, id, 'flicker');
  phone(b, { x: x0 + 0.32, z: 5.15, yaw: HALF_PI }, true);
  binders(b, { x: x0 + 0.2, z: 5.45, yaw: HALF_PI }, 5);
  officeChair(b, { x: x0 + 1.2, z: 5.5, yaw: -HALF_PI + 0.7 }, id, false);
  put(b, desk, 'paper', box(0.42, 0.012, 0.3), 0.0, 0.765, 0.08, 0.25);
  inspectMarker(b, 'records-patient-file', 'inspect', 'Read the patient file', { x: desk.x + 0.08, z: desk.z, yaw: desk.yaw }, [0.5, 0.12, 0.4], 0.78, 1.7);
  // A records trolley abandoned in the back aisle, files spilled from it.
  const trolley = { x: 13.25 + dx, z: 5.7, yaw: 0.3 };
  put(b, trolley, 'steel', box(0.9, 0.04, 0.5), 0, 0.8, 0, 0, 0, 0, { tint: 0.65 });
  put(b, trolley, 'steel', box(0.9, 0.04, 0.5), 0, 0.3, 0, 0, 0, 0, { tint: 0.6 });
  collide(b, trolley, id, 0, 0.45, 0, 0.9, 0.9, 0.5);
  scatteredPapers(b, 12.4 + dx, 5.55, 0.6, 14);
  scatteredPapers(b, 11.7 + dx, 3.9, 0.4, 5);
  cardboardBox(b, { x: 13.85 + dx, z: 6.1, yaw: 0.2 }, id, [0.4, 0.3, 0.34], true);
  floorDecal(b, 'stainWater', 13.2 + dx, 5.9, 1.2, 0.9, 0.4);
  // Hiding: the tall archive cupboard just inside the door, facing into the room.
  addLockerHiding(b, 'records-cupboard', { x: x0 + 0.36, z: 2.25, yaw: HALF_PI }, id);
  // Signage and lighting.
  sign(b, '112', { ...SIGN_ROOM, subtext: 'MEDICAL RECORDS' }, 0.3, 0.2, new Matrix4().makeRotationY(Math.PI).setPosition(doorX - 0.95, 1.6, Z.corridorS - 0.012), { canvas: [256, 170] });
  sign(b, 'STAFF ONLY — CONFIDENTIAL', SIGN_WARNING, 0.42, 0.08, new Matrix4().makeRotationY(Math.PI).setPosition(doorX, 2.25, Z.corridorS - 0.012), { canvas: [512, 98] });
  sign(b, 'RETURN ALL FILES BEFORE 22:00', SIGN_PAPER, 0.4, 0.16, new Matrix4().makeRotationY(HALF_PI).setPosition(x0 + 0.09, 1.45, 3.6), { canvas: [512, 204] });
  troffer(b, id, 12.3 + dx, 2.4, CEILING.room, 'dying', ['nw:lights:records'], { intensity: 3.2 });
  troffer(b, id, 12.3 + dx, 5.4, CEILING.room, 'dead', ['nw:lights:records']);
  b.emitter('vent', id, 12.3 + dx, 2.7, 4.0);
}

function electrical(b: WorldBuilder): void {
  const id = ROOMS.electrical;
  const [x0, x1] = ELECTRICAL_X;
  // Distribution boards on the east wall; one hangs open with a tripped breaker row.
  for (const [i, z] of [2.4, 3.15, 3.9].entries()) electricalPanel(b, { x: x1 - 0.02, z, yaw: -HALF_PI }, i === 1);
  // Main switchgear cabinet and a transformer cage on the north side of the room.
  put(b, { x: 15.2, z: 6.0, yaw: 0 }, 'lockerPaint', box(1.6, 2.0, 0.6), 0, 1.0, 0, 0, 0, 0, { tint: [0.55, 0.6, 0.56] });
  collide(b, { x: 15.2, z: 6.0, yaw: 0 }, id, 0, 1.0, 0, 1.6, 2.0, 0.6);
  sign(b, 'DANGER  415 V', SIGN_DANGER, 0.36, 0.12, new Matrix4().makeRotationY(Math.PI).setPosition(15.2, 1.6, 5.69), { canvas: [384, 128] });
  // Cable tray and conduits along the ceiling, dropping into the boards.
  pipeRun(b, [new Vector3(x0 + 0.3, 2.55, 2.0), new Vector3(x1 - 0.25, 2.55, 2.0), new Vector3(x1 - 0.25, 2.55, 4.4)], 0.035, 'pipe');
  for (const z of [2.4, 3.15, 3.9]) pipeRun(b, [new Vector3(x1 - 0.12, 2.55, z), new Vector3(x1 - 0.12, 1.9, z)], 0.018, 'pipe');
  // Tools left mid-job: a ladder-shaped absence, a bucket, a work lamp on the floor.
  cardboardBox(b, { x: 14.8, z: 2.2, yaw: 0.4 }, id, [0.5, 0.36, 0.4], true);
  put(b, { x: 15.6, z: 3.4, yaw: 0.9 }, 'yellowPaint', box(0.22, 0.28, 0.16), 0, 0.14, 0);
  floorDecal(b, 'stainDark', 16.3, 3.1, 1.6, 1.3, 0.3);
  sign(b, '114', { ...SIGN_ROOM, subtext: 'ELECTRICAL' }, 0.3, 0.2, new Matrix4().makeRotationY(Math.PI).setPosition(DOORS.electrical + 0.95, 1.6, Z.corridorS - 0.012), { canvas: [256, 170] });
  sign(b, 'AUTHORISED PERSONNEL ONLY', SIGN_WARNING, 0.42, 0.08, new Matrix4().makeRotationY(Math.PI).setPosition(DOORS.electrical, 2.25, Z.corridorS - 0.012), { canvas: [512, 98] });
  sign(b, 'BREAKER W4-C TRIPPED AGAIN — DO NOT RESET — M.', SIGN_PAPER, 0.42, 0.18, new Matrix4().makeRotationY(-HALF_PI).setPosition(x1 - 0.2, 1.05, 3.15), { canvas: [512, 220] });
  inspectMarker(b, 'electrical-breakers', 'inspect', 'Inspect the breakers', { x: x1 - 0.2, z: 3.15, yaw: -HALF_PI }, [0.6, 0.9, 0.25], 1.45, 1.6);
  cagedBulb(b, id, 16.0, 2.62, 3.6, 'flicker', 2.4);
  emergencyLight(b, id, new Vector3(x0 + 0.12, 2.4, 4.2), HALF_PI, { color: 0xff5020, intensity: 1.2 });
  b.emitter('pipes', id, 16.8, 2.5, 4.5);
  void wall;
  void X;
}
