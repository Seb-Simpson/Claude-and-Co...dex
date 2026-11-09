import { Matrix4, Vector3 } from 'three';
import type { DoorState } from '../../contracts';
import { cagedBulb, ceilingRect, door, emergencyLight, floorRect, troffer, wall, windowUnit, type Opening } from '../architecture';
import type { WorldBuilder } from '../core/builder';
import { box } from '../core/geometry';
import { C1, C1_ROOMS, CEILING, DOORS, ROOMS, T, X, Z } from '../layout';
import { SIGN_EXIT, SIGN_WARNING, sign } from '../props/common';
import { doorOpening, threshold, windowOpening } from './shell';

/**
 * NW-004A Chapter 1 layout v2: the gameplay BLOCKOUT shell (walls, floors, ceilings, doors, base
 * lighting). Built only with `layout: 'chapter1'`; the classic ward uses `buildShell` unchanged.
 *
 * Kept in place from the classic ward: rooms 101 to 106 (Room 104 and its Blender set), the Wing A
 * corridor, the station, treatment, the connector, 110, Electrical 114, the maintenance passage,
 * the east corridor, the lift and the Stairwell B shaft. New: the staff passage (behind the north
 * rooms), the ward hall (old waiting bay plus the corridor in front of it), Wing B, the observation
 * bay (old storage), the release vestibule (old Records footprint) and the pump bay. Records 112
 * moves into the old Room 108. See docs/NW-004A.md and docs/nw-004a/level/chapter1_design.py.
 *
 * Door positions depend on `b.stage` (world state the coordinator will own once door transactions
 * exist): 'act1' Records locked; 'act3' Records released; 'alarm' after CONFIRM RELEASE: the fire
 * doors are shut (closed, not locked: anyone can push through), the stair barrier and the
 * observation-bay door stand open.
 */
export function buildChapter1Shell(b: WorldBuilder): void {
  const corridorFinish = { wainscot: true, rail: true } as const;
  const roomFinish = { skirting: true } as const;
  const alarm = b.stage === 'alarm';
  const fireDoor: DoorState = alarm ? 'closed' : 'open';

  // ---- Floors --------------------------------------------------------------------------------
  floorRect(b, ROOMS.corridor, X.west, -0.2, Z.corridorN, Z.corridorS);
  floorRect(b, C1_ROOMS.wardHall, -0.2, 6.0 - T / 2, Z.corridorN, Z.southBack);
  floorRect(b, C1_ROOMS.wingB, 6.0 - T / 2, X.east, Z.corridorN, Z.corridorS);
  floorRect(b, ROOMS.east, X.east, X.eastCorridorE, -11, Z.maintS);
  const north: [string, number, number][] = [
    [ROOMS.r101, -20, -15.6], [ROOMS.r103, -15.6, -11.2], [ROOMS.r105, -11.2, -6.8], [ROOMS.treatment, 0.2, 6.6], [ROOMS.r107, 6.6, 11], [C1_ROOMS.observationBay, 11, 18],
  ];
  for (const [id, x0, x1] of north) floorRect(b, id, x0 + (x0 === -20 ? 0 : T / 2), x1 - (x1 === 18 ? 0 : T / 2), Z.northBack, Z.northFace);
  floorRect(b, ROOMS.nurses, -6.8 + T / 2, 0.2 - T / 2, Z.northBack, Z.corridorN);
  const south: [string, number, number][] = [
    [ROOMS.r102, -20, -15.6], [ROOMS.r104, -15.6, -11.2], [ROOMS.r106, -11.2, -6.8], [ROOMS.r110, 6.0, 10.4],
  ];
  for (const [id, x0, x1] of south) floorRect(b, id, x0 + (x0 === -20 ? 0 : T / 2), x1 - T / 2, Z.southFace, Z.southBack);
  floorRect(b, ROOMS.connector, -6.8 + T / 2, -4.6 - T / 2, Z.corridorS, Z.southBack);
  floorRect(b, ROOMS.maintenance, -6.8, X.east, Z.maintN, Z.maintS, 'floorConcrete', { aoStrength: 0.55 });
  floorRect(b, C1_ROOMS.pumpBay, C1.pumpBayX[0] + T / 2, C1.pumpBayX[1] - T / 2, Z.maintS, C1.pumpBayS, 'floorConcrete', { aoStrength: 0.6 });
  floorRect(b, C1_ROOMS.staffPassage, -6.8, C1.passageLink[0], C1.passageN, C1.passageS, 'floor', { aoStrength: 0.5 });
  floorRect(b, C1_ROOMS.staffPassage, C1.passageLink[0], C1.passageLink[1], C1.passageEastN, C1.passageS, 'floor', { aoStrength: 0.5 });
  floorRect(b, C1_ROOMS.staffPassage, C1.passageLink[1], X.east, C1.passageEastN, C1.passageEastS, 'floor', { aoStrength: 0.5 });
  // Stairwell B: only the ward-level landing has a floor; the down flight is below it.
  floorRect(b, ROOMS.stairwell, X.eastCorridorW, X.eastCorridorE, C1.landing.z0, -11 - T, 'floorConcrete');

  // ---- Corridor walls (Wing A, the hall front, Wing B) -----------------------------------------
  wall(b, {
    axis: 'x', at: Z.corridorN - T / 2, from: -20 - T, to: X.eastCorridorW, roomId: ROOMS.corridor,
    openings: [
      doorOpening(DOORS.r101), doorOpening(DOORS.r103), doorOpening(DOORS.r105), { from: -6.4, to: -0.2, bottom: 0, top: 2.3 },
      doorOpening(DOORS.treatment), windowOpening((C1.treatmentWindow[0] + C1.treatmentWindow[1]) / 2, C1.treatmentWindow[1] - C1.treatmentWindow[0], 0.9, 2.1),
      doorOpening(DOORS.r107),
    ],
    pos: corridorFinish, neg: roomFinish,
  });
  wall(b, {
    axis: 'x', at: Z.corridorS + T / 2, from: -20 - T, to: X.eastCorridorW, roomId: ROOMS.corridor,
    openings: [
      doorOpening(DOORS.r102), doorOpening(DOORS.r104), doorOpening(DOORS.r106), { from: -6.8 + T / 2, to: -4.6 - T / 2, bottom: 0, top: 2.4 },
      doorOpening(C1.recordsDoor), { from: -0.2 + T / 2, to: 6.0 - T / 2, bottom: 0, top: 2.4 }, doorOpening(DOORS.r110), doorOpening(C1.vestibuleDoor), doorOpening(DOORS.electrical),
    ],
    neg: corridorFinish, pos: roomFinish,
  });
  // North exterior behind 101 to 105 (patient-room windows), then the station/treatment/observation
  // back wall, which is now the staff passage's south wall: glazed station screen and two staff doors.
  wall(b, {
    axis: 'x', at: Z.northBack - T / 2, from: -20 - T, to: -6.8, roomId: ROOMS.corridor,
    openings: [windowOpening(-17.8, 1.6), windowOpening(-13.4, 1.6), windowOpening(-9.0, 2.0)],
    pos: roomFinish,
  });
  wall(b, {
    axis: 'x', at: Z.northBack - T / 2, from: -6.8, to: X.eastCorridorW, roomId: C1_ROOMS.staffPassage,
    openings: [
      { from: C1.stationScreen[0], to: C1.stationScreen[1], bottom: 1.0, top: 2.1 },
      doorOpening(C1.stationStaff), doorOpening(C1.treatmentStaff),
    ],
    pos: roomFinish, neg: corridorFinish,
  });
  // Staff passage: west run (north wall, west end), the dog-leg link, and the east run.
  const [lx0, lx1] = C1.passageLink;
  wall(b, { axis: 'x', at: C1.passageN - T / 2, from: -6.8 - T, to: lx0 - T / 2, roomId: C1_ROOMS.staffPassage, pos: corridorFinish });
  wall(b, { axis: 'z', at: -6.8 - T / 2, from: C1.passageN - T, to: Z.northBack - T, roomId: C1_ROOMS.staffPassage, pos: corridorFinish });
  wall(b, { axis: 'z', at: lx0 - T / 2, from: C1.passageEastN - T, to: C1.passageN - T, roomId: C1_ROOMS.staffPassage, pos: corridorFinish });
  wall(b, { axis: 'x', at: C1.passageEastN - T / 2, from: lx0 - T, to: X.eastCorridorW, roomId: C1_ROOMS.staffPassage, pos: corridorFinish });
  wall(b, { axis: 'x', at: C1.passageEastS + T / 2, from: lx1, to: X.eastCorridorW, roomId: C1_ROOMS.staffPassage, neg: corridorFinish });
  wall(b, { axis: 'z', at: lx1 + T / 2, from: C1.passageEastS, to: Z.northBack - T, roomId: C1_ROOMS.staffPassage, neg: corridorFinish });
  // Staff-boundary fire door across the passage at x 0.2 (service-boundary).
  wall(b, {
    axis: 'z', at: 0.2, from: C1.passageN, to: C1.passageS, roomId: C1_ROOMS.staffPassage,
    openings: [doorOpening(C1.passageZ)], neg: corridorFinish, pos: corridorFinish,
  });
  // West end wall with the tall corridor window.
  wall(b, {
    axis: 'z', at: -20 - T / 2, from: Z.northBack - T, to: Z.southBack + T, roomId: ROOMS.corridor,
    openings: [windowOpening(0, 1.8, 0.75, 2.4)], pos: roomFinish,
  });
  // North partitions; 107 | observation bay carries the one-way glass.
  for (const x of [-15.6, -11.2, -6.8, 0.2, 6.6]) {
    wall(b, { axis: 'z', at: x, from: Z.northBack, to: Z.northFace, neg: roomFinish, pos: roomFinish });
  }
  wall(b, {
    axis: 'z', at: 11.0, from: Z.northBack, to: Z.northFace, roomId: ROOMS.r107,
    openings: [{ from: C1.galleryGlass[0], to: C1.galleryGlass[1], bottom: 0.9, top: 2.1 }], neg: roomFinish, pos: { skin: 'concrete', skirting: false },
  });
  // South partitions (Records 112 now sits between -4.6 and -0.2; 14.2 is built with the vestibule).
  for (const x of [-15.6, -11.2, -6.8, -4.6, -0.2, 6.0, 10.4]) {
    const connectorSide = x === -6.8 ? { pos: corridorFinish, neg: roomFinish } : x === -4.6 ? { neg: corridorFinish, pos: roomFinish } : { neg: roomFinish, pos: roomFinish };
    wall(b, { axis: 'z', at: x, from: Z.southFace, to: Z.southBack, ...connectorSide });
  }
  // Rear of the south rooms / maintenance passage north wall: four service doors.
  wall(b, {
    axis: 'x', at: Z.southBack + T / 2, from: -20 - T, to: X.eastCorridorW,
    openings: [doorOpening(DOORS.maintenanceWest), doorOpening(C1.hallService), doorOpening(C1.vestibuleDoor), doorOpening(DOORS.electricalService)],
    neg: roomFinish, pos: { skin: 'concrete', skirting: false },
  });
  // Maintenance passage outer wall (opens into the pump bay) and west end.
  wall(b, {
    axis: 'x', at: Z.maintS + T / 2, from: -6.8 - T, to: X.eastCorridorE + T, core: 'concrete', neg: { skirting: false },
    openings: [{ from: C1.pumpBayX[0], to: C1.pumpBayX[1], bottom: 0, top: 2.6 }],
  });
  wall(b, { axis: 'z', at: -6.8 - T / 2, from: Z.southBack, to: Z.maintS + T, core: 'concrete' });
  // Pump bay (a recess off the maintenance passage: the migrated storage lockers stand here).
  for (const x of C1.pumpBayX) wall(b, { axis: 'z', at: x, from: Z.maintS + T, to: C1.pumpBayS + T, core: 'concrete', roomId: C1_ROOMS.pumpBay });
  wall(b, { axis: 'x', at: C1.pumpBayS + T / 2, from: C1.pumpBayX[0] - T / 2, to: C1.pumpBayX[1] + T / 2, core: 'concrete', roomId: C1_ROOMS.pumpBay });

  // ---- East corridor -----------------------------------------------------------------------
  wall(b, {
    axis: 'z', at: X.east + T / 2, from: -11 - T, to: Z.corridorN - T, openings: [doorOpening(C1.passageEastZ), doorOpening(C1.observationDoorZ)],
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
  // Stairwell shaft (tall, concrete), extended below the landing for the visible down flight.
  wall(b, { axis: 'z', at: X.east + T / 2, from: -15.4 - T, to: -11, core: 'concrete', height: CEILING.stair });
  wall(b, { axis: 'z', at: X.eastCorridorE + T / 2, from: -15.4 - T, to: -11, core: 'concrete', height: CEILING.stair });
  wall(b, { axis: 'x', at: -15.4 - T / 2, from: X.east, to: X.eastCorridorE + T, core: 'concrete', height: CEILING.stair });
  b.block('concrete', 19.5, 4.5, -11 - T / 2, 2.85, 3, T);
  for (const x of [X.east + T / 2, X.eastCorridorE + T / 2]) b.block('concrete', x, -1.1, -13.3, T, 2.2, 4.3);
  b.block('concrete', 19.5, -1.1, -15.4 - T / 2, 2.85, 2.2, T);

  // ---- Windows (exterior: 101, 103, 105 and the west end only) --------------------------------
  windowUnit(b, { axis: 'x', at: Z.northBack - T / 2, from: -18.6, to: -17.0, bottom: 0.85, top: 2.2, outside: -1, roomId: ROOMS.r101, blinds: 'broken' });
  windowUnit(b, { axis: 'x', at: Z.northBack - T / 2, from: -14.2, to: -12.6, bottom: 0.85, top: 2.2, outside: -1, roomId: ROOMS.r103, blinds: 'closed', moonIntensity: 0.8 });
  windowUnit(b, { axis: 'x', at: Z.northBack - T / 2, from: -10.0, to: -8.0, bottom: 0.85, top: 2.2, outside: -1, roomId: ROOMS.r105, blinds: 'half' });
  windowUnit(b, { axis: 'z', at: -20 - T / 2, from: -0.9, to: 0.9, bottom: 0.75, top: 2.4, outside: -1, roomId: ROOMS.corridor, blinds: 'half', moonIntensity: 2.2 });
  // Interior glazing (no moonlight): station screen, treatment window, one-way gallery glass.
  interiorGlass(b, 'x', Z.northBack - T / 2, C1.stationScreen[0], C1.stationScreen[1], 1.0, 2.1, 1);
  interiorGlass(b, 'x', Z.corridorN - T / 2, C1.treatmentWindow[0], C1.treatmentWindow[1], 0.9, 2.1, 1);
  interiorGlass(b, 'z', 11.0, C1.galleryGlass[0], C1.galleryGlass[1], 0.9, 2.1, 0.35);

  // ---- Ceilings ------------------------------------------------------------------------------
  ceilingRect(b, X.west, -7, Z.corridorN, Z.corridorS, CEILING.corridor, 'ceilingStained', [{ x: -16.5, z: 0.3, hanging: false }, { x: -9.3, z: -0.3 }]);
  ceilingRect(b, -7, -0.2, Z.corridorN, Z.corridorS, CEILING.corridor, 'ceiling');
  ceilingRect(b, -0.2, 6.0 - T / 2, Z.corridorN, Z.southBack, CEILING.corridor, 'ceiling', [{ x: 4.6, z: 5.2 }]);
  ceilingRect(b, 6.0 - T / 2, X.east, Z.corridorN, Z.corridorS, CEILING.corridor, 'ceilingStained', [{ x: 12.5, z: -0.3 }]);
  ceilingRect(b, X.east, X.eastCorridorE, -11, Z.maintS, CEILING.corridor, 'ceilingStained', [{ x: 19.5, z: 3.3 }]);
  const ceilingFor = (id: string): 'ceiling' | 'ceilingStained' => ([ROOMS.r101, ROOMS.r106, C1_ROOMS.observationBay, ROOMS.r107] as string[]).includes(id) ? 'ceilingStained' : 'ceiling';
  for (const [id, x0, x1] of north) {
    const holes = id === ROOMS.r101 ? [{ x: -18.0, z: -3.5, hanging: true }] : [];
    ceilingRect(b, x0 + (x0 === -20 ? 0 : T / 2), x1 - (x1 === 18 ? 0 : T / 2), Z.northBack, Z.northFace, CEILING.room, ceilingFor(id), holes);
  }
  ceilingRect(b, -6.8 + T / 2, 0.2 - T / 2, Z.northBack, Z.corridorN, CEILING.corridor, 'ceiling');
  for (const [id, x0, x1] of south) {
    const holes = id === ROOMS.r106 ? [{ x: -9.5, z: 4.2, hanging: true }, { x: -8.9, z: 4.8 }, { x: -9.5, z: 3.6 }] : [];
    ceilingRect(b, x0 + (x0 === -20 ? 0 : T / 2), x1 - T / 2, Z.southFace, Z.southBack, CEILING.room, ceilingFor(id), holes);
  }
  ceilingRect(b, -6.8 + T / 2, -4.6 - T / 2, Z.corridorS, Z.southBack, CEILING.corridor, 'ceilingStained');
  ceilingRect(b, -6.8, X.east, Z.maintN, Z.maintS, CEILING.service, 'concrete');
  ceilingRect(b, C1.pumpBayX[0], C1.pumpBayX[1], Z.maintS, C1.pumpBayS, CEILING.service, 'concrete');
  ceilingRect(b, -6.8, lx0, C1.passageN, C1.passageS, CEILING.corridor - 0.2, 'ceilingStained');
  ceilingRect(b, lx0, lx1, C1.passageEastN, C1.passageS, CEILING.corridor - 0.2, 'ceilingStained');
  ceilingRect(b, lx1, X.east, C1.passageEastN, C1.passageEastS, CEILING.corridor - 0.2, 'ceilingStained');
  ceilingRect(b, X.eastCorridorW, X.eastCorridorE, -15.4, -11 - T, CEILING.stair - 0.02, 'concrete');
  b.block('wall', -3.3, 2.5, Z.corridorN - T / 2, 6.2, 0.4, T + 0.02);

  // ---- Doors ---------------------------------------------------------------------------------
  const north_ = Z.corridorN - T / 2;
  const south_ = Z.corridorS + T / 2;
  const back = Z.northBack - T / 2;
  door(b, { name: 'room-101', roomId: ROOMS.r101, axis: 'x', at: north_, center: DOORS.r101, hinge: 'max', swing: 'neg', initial: 'closed', leafTint: 0.85 });
  door(b, { name: 'room-103', roomId: ROOMS.r103, axis: 'x', at: north_, center: DOORS.r103, hinge: 'max', swing: 'neg', initial: 'closed' });
  door(b, { name: 'room-105', roomId: ROOMS.r105, axis: 'x', at: north_, center: DOORS.r105, hinge: 'max', swing: 'neg', initial: 'open', openAngle: Math.PI * 0.42 });
  door(b, { name: 'treatment', roomId: ROOMS.treatment, axis: 'x', at: north_, center: DOORS.treatment, hinge: 'min', swing: 'neg', initial: 'closed', vision: 'wide' });
  door(b, { name: 'room-107', roomId: ROOMS.r107, axis: 'x', at: north_, center: DOORS.r107, hinge: 'min', swing: 'neg', initial: 'closed', vision: 'none', leafTint: 0.8, prompt: 'Open observation gallery' });
  door(b, { name: 'room-102', roomId: ROOMS.r102, axis: 'x', at: south_, center: DOORS.r102, hinge: 'max', swing: 'pos', initial: 'open', openAngle: Math.PI * 0.3 });
  door(b, { name: 'room-104', roomId: ROOMS.r104, axis: 'x', at: south_, center: DOORS.r104, hinge: 'max', swing: 'pos', initial: 'open' });
  door(b, { name: 'room-106', roomId: ROOMS.r106, axis: 'x', at: south_, center: DOORS.r106, hinge: 'max', swing: 'pos', initial: 'closed' });
  door(b, { name: 'room-110', roomId: ROOMS.r110, axis: 'x', at: south_, center: DOORS.r110, hinge: 'min', swing: 'pos', initial: 'closed' });
  door(b, { name: 'maintenance-west', roomId: ROOMS.connector, axis: 'x', at: Z.southBack + T / 2, center: DOORS.maintenanceWest, hinge: 'min', swing: 'neg', initial: 'closed', vision: 'none', leafTint: 0.6, prompt: 'Open maintenance door' });
  door(b, { name: 'maintenance-east', roomId: ROOMS.east, axis: 'z', at: X.east + T / 2, center: DOORS.maintenanceEast, hinge: 'min', swing: 'pos', initial: 'closed', vision: 'none', leafTint: 0.6, prompt: 'Open maintenance door' });
  // Stair barrier: no chain, no key. Released by CONFIRM RELEASE (stage 'alarm'), then pulled shut
  // from the landing at the end.
  door(b, {
    name: 'stairwell-b', roomId: ROOMS.east, axis: 'x', at: -11 - T / 2, center: DOORS.stair, hinge: 'min', swing: 'neg', initial: alarm ? 'open' : 'locked', vision: 'wide',
    prompt: alarm ? 'Stairwell B barrier' : 'Barrier latched — Stairwell B', leafTint: 0.75,
  });
  // New staff doors.
  door(b, { name: 'station-staff', roomId: ROOMS.nurses, axis: 'x', at: back, center: C1.stationStaff, hinge: 'max', swing: 'pos', initial: 'closed', vision: 'wide', leafTint: 0.9, prompt: 'Open staff door' });
  door(b, { name: 'treatment-staff', roomId: ROOMS.treatment, axis: 'x', at: back, center: C1.treatmentStaff, hinge: 'min', swing: 'pos', initial: 'closed', vision: 'narrow', leafTint: 0.9, prompt: 'Open staff door' });
  // The boundary door is an ordinary self-closing fire door (closed in every stage): the Nurse
  // opens it on her round; the alarm keeps it shut.
  door(b, { name: 'staff-boundary', roomId: C1_ROOMS.staffPassage, axis: 'z', at: 0.2, center: C1.passageZ, hinge: 'min', swing: 'pos', initial: 'closed', vision: 'narrow', leafTint: 0.7, prompt: 'Fire door' });
  door(b, { name: 'staff-east', roomId: C1_ROOMS.staffPassage, axis: 'z', at: X.east + T / 2, center: C1.passageEastZ, hinge: 'min', swing: 'neg', initial: 'closed', vision: 'narrow', leafTint: 0.85, prompt: 'Open staff door' });
  door(b, {
    name: 'observation-bay', roomId: C1_ROOMS.observationBay, axis: 'z', at: X.east + T / 2, center: C1.observationDoorZ, hinge: 'max', swing: 'neg',
    initial: alarm ? 'open' : 'locked', vision: 'narrow', leafTint: 0.6, prompt: alarm ? 'Observation bay' : 'Latched — Observation bay',
  });
  // Release vestibule: Wing B door (vision panel looking east), Electrical internal door, service door.
  door(b, { name: 'vestibule', roomId: C1_ROOMS.vestibule, axis: 'x', at: south_, center: C1.vestibuleDoor, hinge: 'min', swing: 'pos', initial: 'closed', vision: 'wide', leafTint: 0.8, prompt: 'Open release vestibule' });
  door(b, { name: 'vestibule-electrical', roomId: C1_ROOMS.vestibule, axis: 'z', at: C1.vestibuleX[1], center: C1.vestibuleElectricalZ, hinge: 'max', swing: 'pos', initial: 'closed', vision: 'none', leafTint: 0.7, prompt: 'Open electrical room' });
  door(b, { name: 'vestibule-service', roomId: C1_ROOMS.vestibule, axis: 'x', at: Z.southBack + T / 2, center: C1.vestibuleDoor, hinge: 'max', swing: 'neg', initial: 'closed', vision: 'none', leafTint: 0.6, prompt: 'Open service door' });
  door(b, { name: 'hall-service', roomId: C1_ROOMS.wardHall, axis: 'x', at: Z.southBack + T / 2, center: C1.hallService, hinge: 'min', swing: 'neg', initial: 'closed', vision: 'none', leafTint: 0.6, prompt: 'Open service door' });
  // Fire-door pairs held open on magnets until the alarm: hall-west (x -0.2, swinging east so its
  // open leaves never cover the station's way in), the existing smoke pair (moved to x 9.4 so its
  // open leaves clear the 107 door; swinging west, the way route A runs) and east-fire (z -1.9, swinging north,
  // the way route B runs). Each leaf is 1.2 m (not 1.4): with wider leaves the Patient's door
  // navigation cannot reach the leaf from its swing side (see docs/nw-004a/STEP-A.md). Short
  // solid pilasters fill the corridor width either side of each pair.
  for (const [x, prefix] of [[C1.hallWest, 'hall-west'], [C1.smokeX, 'smoke']] as const) {
    for (const [center, hinge] of [[-0.6, 'min'], [0.6, 'max']] as const) {
      door(b, {
        name: `${prefix}-${hinge === 'min' ? 'north' : 'south'}`, roomId: x < 0 ? C1_ROOMS.wardHall : C1_ROOMS.wingB, axis: 'z', at: x, center, opening: 1.2, hinge,
        swing: x < 0 ? 'pos' : 'neg', initial: fireDoor, vision: 'wide', frame: false, openAngle: Math.PI * 0.5, prompt: 'Fire door',
      });
    }
    b.block('frame', x, 2.4, 0, 0.18, 0.6, 2.8);
    for (const z of [-1.3, 1.3]) {
      b.block('frame', x, 1.05, z, 0.18, 2.1, 0.2);
      b.solid(x, 1.05, z, 0.18, 2.1, 0.2, { roomId: x < 0 ? C1_ROOMS.wardHall : C1_ROOMS.wingB, kind: 'wall' });
    }
  }
  for (const [center, hinge] of [[18.9, 'min'], [20.1, 'max']] as const) {
    door(b, {
      name: `east-fire-${hinge === 'min' ? 'west' : 'east'}`, roomId: ROOMS.east, axis: 'x', at: C1.eastFireZ, center, opening: 1.2, hinge, swing: 'neg',
      initial: fireDoor, vision: 'wide', frame: false, openAngle: Math.PI * 0.5, prompt: 'Fire door',
    });
  }
  b.block('frame', 19.5, 2.4, C1.eastFireZ, 2.7, 0.6, 0.18);
  for (const x of [18.225, 20.775]) {
    b.block('frame', x, 1.05, C1.eastFireZ, 0.15, 2.1, 0.18);
    b.solid(x, 1.05, C1.eastFireZ, 0.15, 2.1, 0.18, { roomId: ROOMS.east, kind: 'wall' });
  }
  // Fire-door warnings, visible from Act I: they foreshadow the alarm.
  for (const [x, z, yaw] of [[C1.hallWest - 0.092, 0, -Math.PI / 2], [C1.hallWest + 0.092, 0, Math.PI / 2], [C1.smokeX - 0.092, 0, -Math.PI / 2], [C1.smokeX + 0.092, 0, Math.PI / 2], [19.5, C1.eastFireZ + 0.092, 0], [19.5, C1.eastFireZ - 0.092, Math.PI]] as const) {
    sign(b, 'FIRE DOOR — CLOSES ON ALARM', SIGN_WARNING, 0.62, 0.1, new Matrix4().makeRotationY(yaw).setPosition(x, 2.4, z), { canvas: [640, 104] });
  }

  for (const [axis, at, center] of [
    ['x', north_, DOORS.r101], ['x', north_, DOORS.r103], ['x', north_, DOORS.r105], ['x', north_, DOORS.treatment], ['x', north_, DOORS.r107],
    ['x', south_, DOORS.r102], ['x', south_, DOORS.r104], ['x', south_, DOORS.r106], ['x', south_, DOORS.r110], ['x', south_, C1.recordsDoor],
    ['x', south_, C1.vestibuleDoor], ['x', south_, DOORS.electrical],
    ['x', Z.southBack + T / 2, DOORS.maintenanceWest], ['x', Z.southBack + T / 2, C1.hallService], ['x', Z.southBack + T / 2, C1.vestibuleDoor], ['x', Z.southBack + T / 2, DOORS.electricalService],
    ['z', X.east + T / 2, DOORS.maintenanceEast], ['x', -11 - T / 2, DOORS.stair], ['z', X.eastCorridorE + T / 2, -4.0],
    ['x', back, C1.stationStaff], ['x', back, C1.treatmentStaff], ['z', 0.2, C1.passageZ], ['z', X.east + T / 2, C1.passageEastZ], ['z', X.east + T / 2, C1.observationDoorZ], ['z', C1.vestibuleX[1], C1.vestibuleElectricalZ],
  ] as const) threshold(b, axis, at, center);

  // ---- Lighting ------------------------------------------------------------------------------
  const corridorStates = [
    [-18.2, 'flicker'], [-14.6, 'dead'], [-11.0, 'steady'], [-7.4, 'buzz'], [-3.8, 'steady'], [-1.2, 'dying'],
    [3.0, 'steady'], [7.0, 'dead'], [10.6, 'flicker'], [14.2, 'dead'],
  ] as const;
  for (const [x, state] of corridorStates) {
    const id = x < -0.2 ? ROOMS.corridor : x < 6 ? C1_ROOMS.wardHall : C1_ROOMS.wingB;
    troffer(b, id, x, 0, CEILING.corridor, state, [x < -0.2 ? 'nw:lights:corridor-main' : x < 6 ? 'nw:lights:ward-hall' : 'nw:lights:wing-b']);
  }
  troffer(b, C1_ROOMS.wardHall, 2.6, 4.0, CEILING.corridor, 'buzz', ['nw:lights:ward-hall'], { intensity: 3 });
  for (const [z, state] of [[-9.0, 'dead'], [-4.6, 'flicker'], [0, 'steady'], [4.6, 'dying']] as const) {
    troffer(b, ROOMS.east, 19.5, z, CEILING.corridor, state, ['nw:lights:corridor-east'], { rotate: true });
  }
  troffer(b, ROOMS.connector, -5.7, 3.9, CEILING.corridor, 'flicker', ['nw:lights:connector'], { rotate: true, intensity: 3.5 });
  // The staff passage is dark: two caged bulbs and a dying one near the boundary door.
  for (const [x, z, state] of [[-4.2, C1.passageZ, 'steady'], [0.9, C1.passageZ, 'dying'], [9.6, C1.passageEastZ, 'flicker'], [15.5, C1.passageEastZ, 'steady']] as const) cagedBulb(b, C1_ROOMS.staffPassage, x, CEILING.corridor - 0.3, z, state, 1.8);
  emergencyLight(b, ROOMS.east, new Vector3(19.5, 2.56, -10.92), 0, { intensity: 1.6, state: 'flicker' });
  emergencyLight(b, ROOMS.stairwell, new Vector3(18.3, 2.6, -12.4), Math.PI / 2, { intensity: 3 });
  emergencyLight(b, ROOMS.corridor, new Vector3(-19.9, 2.45, -1.1), Math.PI / 2, { color: 0xffa040, intensity: 1.3, state: 'flicker' });
  emergencyLight(b, ROOMS.maintenance, new Vector3(-6.7, 2.4, 7.25), Math.PI / 2, { color: 0xff5020, intensity: 1.6 });

  // Hanging EXIT sign in Wing B pointing toward Stairwell B — the real way out in this chapter.
  b.block('whitePlastic', 16.2, 2.45, 0, 0.06, 0.24, 0.62, 0, { shade: 'flat', tint: 0.7 });
  b.block('steel', 16.2, 2.62, 0, 0.01, 0.16, 0.01, 0, { shade: 'flat' });
  for (const face of [-1, 1]) {
    const m = new Matrix4().makeRotationY(face < 0 ? -Math.PI / 2 : Math.PI / 2).setPosition(16.2 + face * 0.032, 2.45, 0);
    const mesh = sign(b, 'EXIT  →', SIGN_EXIT, 0.58, 0.2, m, { emissive: true, canvas: [512, 176] });
    b.fixture({
      kind: 'exit', state: 'buzz', roomId: C1_ROOMS.wingB, circuits: ['nw:lights:exit'],
      position: new Vector3(16.2 + face * 0.2, 2.3, 0), color: 0x2aff6a, intensity: face < 0 ? 0.6 : 0, distance: 3.5,
      material: mesh.material as import('three').MeshBasicMaterial, halo: face < 0 ? 0.9 : 0, haloOpacity: 0.3,
    });
  }

  // Room connectivity (doorways and open thresholds) for atmosphere/sound occlusion.
  const links: [string, string][] = [
    [ROOMS.corridor, ROOMS.r101], [ROOMS.corridor, ROOMS.r103], [ROOMS.corridor, ROOMS.r105], [ROOMS.corridor, ROOMS.nurses],
    [ROOMS.corridor, ROOMS.r102], [ROOMS.corridor, ROOMS.r104], [ROOMS.corridor, ROOMS.r106], [ROOMS.corridor, ROOMS.connector],
    [ROOMS.corridor, ROOMS.records], [ROOMS.corridor, C1_ROOMS.wardHall],
    [C1_ROOMS.wardHall, ROOMS.treatment], [C1_ROOMS.wardHall, C1_ROOMS.wingB], [C1_ROOMS.wardHall, ROOMS.maintenance],
    [C1_ROOMS.wingB, ROOMS.r107], [C1_ROOMS.wingB, ROOMS.r110], [C1_ROOMS.wingB, C1_ROOMS.vestibule], [C1_ROOMS.wingB, ROOMS.electrical], [C1_ROOMS.wingB, ROOMS.east],
    [ROOMS.nurses, C1_ROOMS.staffPassage], [ROOMS.treatment, C1_ROOMS.staffPassage], [C1_ROOMS.staffPassage, ROOMS.east],
    [ROOMS.east, C1_ROOMS.observationBay], [ROOMS.east, ROOMS.stairwell], [ROOMS.east, ROOMS.maintenance],
    [ROOMS.connector, ROOMS.maintenance], [C1_ROOMS.vestibule, ROOMS.maintenance], [C1_ROOMS.vestibule, ROOMS.electrical], [ROOMS.electrical, ROOMS.maintenance],
    [ROOMS.maintenance, C1_ROOMS.pumpBay],
  ];
  for (const [a, c] of links) b.connect(a, c);
}

/** Interior glazing: a pane and slim frame in a wall opening. No moonlight, no blinds. */
function interiorGlass(b: WorldBuilder, axis: 'x' | 'z', at: number, from: number, to: number, bottom: number, top: number, tint: number): void {
  const mid = (from + to) / 2;
  const w = to - from;
  const h = top - bottom;
  const at3 = (along: number, y: number): [number, number, number] => axis === 'x' ? [along, y, at] : [at, y, along];
  const size = (sAlong: number, sy: number, sAcross: number): [number, number, number] => axis === 'x' ? [sAlong, sy, sAcross] : [sAcross, sy, sAlong];
  const [gx, gy, gz] = at3(mid, (bottom + top) / 2);
  const [sx, sy, sz] = size(w, h, 0.012);
  b.add('glass', box(sx, sy, sz), new Matrix4().makeTranslation(gx, gy, gz), { shade: 'flat', tint });
  for (const y of [bottom + 0.02, top - 0.02]) {
    const [fx, fy, fz] = at3(mid, y);
    const [fsx, fsy, fsz] = size(w, 0.04, T + 0.02);
    b.add('frame', box(fsx, fsy, fsz), new Matrix4().makeTranslation(fx, fy, fz), { shade: 'flat' });
  }
  for (const along of [from + 0.02, to - 0.02]) {
    const [fx, fy, fz] = at3(along, (bottom + top) / 2);
    const [fsx, fsy, fsz] = size(0.04, h, T + 0.02);
    b.add('frame', box(fsx, fsy, fsz), new Matrix4().makeTranslation(fx, fy, fz), { shade: 'flat' });
  }
}

export type { Opening };
