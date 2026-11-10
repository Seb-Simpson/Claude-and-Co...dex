import type { WorldBuilder } from '../core/builder';
import { ROOMS } from '../layout';
import { STATION_PROPS } from '../stealth/layout';

/**
 * NW-006A: colliders and procedural stand-ins for the Nurses' Station set.
 *
 * The visible art is the Blender station set (dressing/pipeline/station_set.py, loaded by
 * dressing/station.ts). These blocks are what the game shows only if that set fails to load: on
 * success they fall inside dressing/regions.ts STATION_REGIONS and are left out. The colliders are
 * the same either way; every one is deliberate and pinned by the tests.
 *
 * - Linen trolley (the crouch cover, 1.2 m): from inside the station a standing player (eye 1.65 m)
 *   is seen over it, a crouched player (eye 0.9 m) is not, except from the east gap.
 * - Records corner: two filing cabinets on the back wall, the supply cupboard on the west wall.
 * - Observations machine parked by the east wall.
 */
export function buildStealthStation(b: WorldBuilder): void {
  trolley(b);
  const { cabinetA, cabinetB, cupboard, obsMachine } = STATION_PROPS;
  for (const c of [cabinetA, cabinetB]) {
    // Body, then the four drawer fronts as darker bands.
    b.block('steel', c.centre.x, c.centre.y, -6.08, c.size.x, c.size.y, 0.62, 0, { tint: 0.62 });
    for (let k = 0; k < 4; k++) b.block('steel', c.centre.x, 0.21 + k * 0.31, -6.08 + 0.315, c.size.x - 0.04, 0.27, 0.012, 0, { tint: 0.5 });
    b.solid(c.centre.x, c.centre.y, c.centre.z, c.size.x, c.size.y, c.size.z, { roomId: ROOMS.nurses, kind: 'prop' });
  }
  b.block('whitePlastic', -6.495, cupboard.centre.y, cupboard.centre.z, 0.45, cupboard.size.y, cupboard.size.z, 0, { tint: 0.85 });
  b.solid(cupboard.centre.x, cupboard.centre.y, cupboard.centre.z, cupboard.size.x, cupboard.size.y, cupboard.size.z, { roomId: ROOMS.nurses, kind: 'prop' });
  b.block('steel', obsMachine.centre.x, 0.05, obsMachine.centre.z, 0.5, 0.06, 0.5, 0, { tint: 0.4 });
  b.block('steel', obsMachine.centre.x, 0.55, obsMachine.centre.z, 0.04, 0.9, 0.04, 0, { tint: 0.7 });
  b.block('whitePlastic', obsMachine.centre.x, 1.1, obsMachine.centre.z, 0.32, 0.23, 0.15, 0, { tint: 0.9 });
  b.solid(obsMachine.centre.x, obsMachine.centre.y, obsMachine.centre.z, obsMachine.size.x, obsMachine.size.y, obsMachine.size.z, { roomId: ROOMS.nurses, kind: 'prop' });
}

/** Stand-in trolley: corner posts, three shelves of linen and the cover on the station side. */
function trolley(b: WorldBuilder): void {
  const { centre, size } = STATION_PROPS.trolley;
  const hx = size.x / 2 - 0.03;
  const hz = size.z / 2 - 0.03;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.block('steel', centre.x + sx * hx, 0.6, centre.z + sz * hz, 0.025, 1.18, 0.025, 0, { tint: 0.7 });
  for (const y of [0.16, 0.57, 0.97]) {
    b.block('steel', centre.x, y, centre.z, size.x - 0.05, 0.02, size.z - 0.05, 0, { tint: 0.7 });
    b.block('linen', centre.x, y + 0.13, centre.z, size.x - 0.14, 0.24, size.z - 0.12, 0, { tint: 0.9 });
  }
  b.block('curtain', centre.x, 0.68, centre.z - size.z / 2 - 0.004, size.x + 0.01, 1.04, 0.008, 0, { tint: [0.6, 0.85, 0.85] });
  b.block('curtain', centre.x, size.y - 0.004, centre.z - 0.03, size.x + 0.01, 0.008, size.z - 0.06, 0, { tint: [0.6, 0.85, 0.85] });
  b.solid(centre.x, centre.y, centre.z, size.x, size.y, size.z, { roomId: ROOMS.corridor, kind: 'prop' });
}
