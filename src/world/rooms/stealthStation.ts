import type { WorldBuilder } from '../core/builder';
import { ROOMS } from '../layout';
import { STEALTH } from '../stealth/layout';

/**
 * NW-006A: the linen screen in the corridor, beside the station, that gives crouch cover. It is
 * 1.2 m high: from inside the station a standing player (eye 1.65 m) is seen over it, a crouched
 * player (eye 0.9 m) is not. It is a deliberate new collider; the tests pin it.
 */
export function buildStealthStation(b: WorldBuilder): void {
  const { centre, size } = STEALTH.screen;
  const id = ROOMS.corridor;
  // Frame and linen panel (the frame is steel, the panel linen), both real geometry.
  b.block('steel', centre.x, 0.02, centre.z, size.x, 0.04, size.z, 0, { tint: 0.8 });
  for (const dx of [-size.x / 2 + 0.02, size.x / 2 - 0.02]) {
    b.block('steel', centre.x + dx, centre.y, centre.z, 0.03, size.y, 0.03, 0, { tint: 0.7 });
  }
  b.block('linen', centre.x, centre.y - 0.05, centre.z, size.x - 0.06, size.y - 0.12, 0.04, 0, { tint: [0.6, 0.68, 0.74] });
  b.block('steel', centre.x, size.y, centre.z, size.x, 0.03, size.z, 0, { tint: 0.7 });
  b.solid(centre.x, centre.y, centre.z, size.x, size.y, size.z, { roomId: id, kind: 'prop' });
}
