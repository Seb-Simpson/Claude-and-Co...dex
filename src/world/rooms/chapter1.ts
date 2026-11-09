import { Matrix4, Vector3 } from 'three';
import type { Vec3 } from '../../contracts';
import type { WorldBuilder } from '../core/builder';
import { box, cylinder, cylinderBetween } from '../core/geometry';
import { CEILING, ROOMS } from '../layout';

/**
 * NW-004A environmental storytelling that rewards looking: details, not gore.
 * - Ceiling PA/intercom speakers that key up on their own (sound emitters of kind 'intercom').
 * - The treatment room's interrupted procedure: an unbuckled strap, a dropped syringe, gloves
 *   peeled off inside out, a sheet dragged half off the table toward the door.
 * Haze volumes are declared below as data for the atmosphere module.
 */
export function buildChapter1Details(b: WorldBuilder): void {
  intercoms(b);
  interruptedProcedure(b);
}

function intercoms(b: WorldBuilder): void {
  const speakers: [string, number, number, number][] = [
    [ROOMS.corridor, -9.0, CEILING.corridor, 0.85],
    [ROOMS.corridor, 4.2, CEILING.corridor, -0.85],
    [ROOMS.corridor, 14.8, CEILING.corridor, 0.85],
    [ROOMS.nurses, -2.6, CEILING.corridor, -4.6],
    [ROOMS.east, 19.5, CEILING.corridor, -6.8],
  ];
  for (const [roomId, x, y, z] of speakers) {
    b.add('whitePlastic', cylinder(0.14, 0.14, 0.03, 18), new Matrix4().makeTranslation(x, y - 0.015, z), { shade: 'flat', tint: 0.82 });
    for (let i = -2; i <= 2; i++) b.add('rubber', box(0.2 - Math.abs(i) * 0.03, 0.004, 0.012), new Matrix4().makeTranslation(x, y - 0.032, z + i * 0.04), { shade: 'flat', tint: 1.4 });
    b.emitter('intercom', roomId, x, y - 0.05, z);
  }
}

function interruptedProcedure(b: WorldBuilder): void {
  // Exam table at (3.0, -4.2), long axis along x. The near restraint hangs unbuckled to the floor.
  const strap = cylinderBetween(new Vector3(3.35, 0.82, -3.86), new Vector3(3.42, 0.08, -3.7), 0.018, 4);
  b.add('fabricSeat', strap.geometry, strap.matrix, { shade: 'flat', tint: [0.55, 0.5, 0.42] });
  b.add('steel', box(0.05, 0.035, 0.01), new Matrix4().makeRotationZ(0.3).setPosition(3.43, 0.07, -3.68), { shade: 'flat', tint: 1.2 });
  // The sheet, dragged off toward the door and dropped.
  b.add('paper', box(1.1, 0.006, 0.7), new Matrix4().makeRotationY(0.5).setPosition(2.0, 0.004, -3.0), { tint: [0.92, 0.94, 0.95] });
  b.add('paper', box(0.5, 0.35, 0.006), new Matrix4().makeRotationX(-1.2).setPosition(2.55, 0.42, -3.62), { tint: [0.92, 0.94, 0.95] });
  // Syringe and a vial on the floor, gloves peeled off inside out.
  b.add('glass', cylinder(0.008, 0.008, 0.12, 6), new Matrix4().makeRotationZ(Math.PI / 2).premultiply(new Matrix4().makeRotationY(0.7)).setPosition(3.7, 0.01, -3.35), { tint: [0.9, 0.95, 1] });
  b.add('glass', cylinder(0.014, 0.014, 0.05, 8), new Matrix4().makeTranslation(3.95, 0.025, -3.1), { tint: [0.75, 0.85, 1] });
  for (const [x, z, a] of [[1.55, -4.95, 0.4], [1.68, -5.05, 2.1]] as const) {
    b.add('rubber', box(0.09, 0.012, 0.2), new Matrix4().makeRotationY(a).setPosition(x, 0.006, z), { shade: 'flat', tint: [1.6, 1.7, 2.1] });
  }
}

/** A local haze volume: soft drifting fog the atmosphere module renders (no colliders, no gameplay). */
export interface HazeVolume {
  readonly id: string;
  readonly roomId: string;
  readonly center: Vec3;
  readonly size: Vec3;
  /** 0..1 */
  readonly density: number;
}

/** Haze that hides the far ends of spaces: the corridor end, the stairwell, the maintenance run. */
export const HAZE_VOLUMES: readonly HazeVolume[] = [
  { id: 'nw:haze:corridor-east-end', roomId: ROOMS.corridor, center: { x: 16.2, y: 0.9, z: 0 }, size: { x: 4.2, y: 1.6, z: 2.6 }, density: 0.9 },
  { id: 'nw:haze:east-junction', roomId: ROOMS.east, center: { x: 19.5, y: 0.8, z: -6 }, size: { x: 2.4, y: 1.4, z: 7 }, density: 0.6 },
  { id: 'nw:haze:stairwell', roomId: ROOMS.stairwell, center: { x: 19.5, y: 1.4, z: -13.2 }, size: { x: 2.4, y: 2.6, z: 3.6 }, density: 0.8 },
  { id: 'nw:haze:maintenance', roomId: ROOMS.maintenance, center: { x: 6, y: 0.7, z: 7.25 }, size: { x: 22, y: 1.2, z: 1.2 }, density: 0.7 },
  { id: 'nw:haze:corridor-west-end', roomId: ROOMS.corridor, center: { x: -18.6, y: 0.8, z: 0 }, size: { x: 2.6, y: 1.4, z: 2.6 }, density: 0.5 },
];
