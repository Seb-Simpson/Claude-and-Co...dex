import { Box3, Vector3 } from 'three';

/**
 * Where the Room 104 visual set replaces procedural visuals. Each box holds only static pieces
 * that the Blender set redraws. Walls' structural cores, door leaves, the TV screen, the
 * wheelchair (a creep anomaly), light panels and every collider stay procedural.
 *
 * NW-005A: the corridor regions now run on to the nurses' station (x -0.2), and every corridor
 * door in that stretch (101-106, 108) has a frame box: the set's door kit redraws the frame, stop,
 * architraves and threshold. Door leaves are not static pieces (gameplay animates them); the set's
 * leaf is parented into each door group at runtime (dressing/doors.ts).
 */
const box = (min: [number, number, number], max: [number, number, number]): Box3 => new Box3(new Vector3(...min), new Vector3(...max));

/** East end of the set: where Wing A meets the hall / the next fire compartment. */
export const SET_EAST_X = -0.2;

/** Corridor doors whose frames and leaves the set's door kit replaces: id -> [door centre x, wall plane z]. */
export const DRESSED_DOORS: Readonly<Record<string, readonly [number, number]>> = {
  'nw:door:room-101': [-16.4, -1.475],
  'nw:door:room-103': [-12.0, -1.475],
  'nw:door:room-105': [-7.6, -1.475],
  'nw:door:room-102': [-16.4, 1.475],
  'nw:door:room-104': [-12.0, 1.475],
  'nw:door:room-106': [-7.6, 1.475],
  'nw:door:room-108': [-1.0, 1.475],
};

const doorFrames = Object.fromEntries(Object.entries(DRESSED_DOORS).map(([id, [x, z]]) => [
  `frame:${id.replace('nw:door:', '')}`,
  // Frame boxes, stop strips and the threshold plate sit within 0.12 m of the wall plane, below 2.2 m.
  box([x - 0.66, -0.02, z - 0.125], [x + 0.66, 2.2, z + 0.125]),
]));

export const PROTOTYPE_REGIONS = {
  /** Room 104 interior: floor, ceiling, furniture and the room-side wall finishes. */
  room104: box([-15.535, -0.02, 1.545], [-11.265, 2.77, 6.405]),
  /** West corridor (to x -7), corridor-facing finishes of the north wall (wainscot, rail, skirting, frames, signs). */
  corridorNorthFace: box([-20.2, -0.02, -1.405], [-6.99, 3.01, -1.26]),
  /** West corridor, corridor-facing finishes of the south wall. */
  corridorSouthFace: box([-20.2, -0.02, 1.26], [-6.99, 3.01, 1.405]),
  /**
   * NW-005A, x -7 to the station: only the wall finishes themselves (wainscot, rail and brackets,
   * skirting), a thinner box so the visitors' chairs, the sanitiser dispensers and the corridor
   * clock (which stay procedural) are not caught.
   */
  corridorNorthFaceEast: box([-7.01, -0.02, -1.405], [SET_EAST_X, 3.01, -1.33]),
  corridorSouthFaceEast: box([-7.01, -0.02, 1.33], [SET_EAST_X, 3.01, 1.405]),
  /** Corridor ceiling troffer housings (the ceiling rects themselves cross the set's end and stay; the set overlays them). */
  corridorCeiling: box([-20.01, 2.6, -1.41], [SET_EAST_X, 2.85, 1.41]),
  /** Corridor floor-level paint and decals (guide line, puddle) that would sit under the new floor skin. */
  corridorFloorDecals: box([-20.2, -0.02, -1.41], [SET_EAST_X, 0.006, 1.41]),
  ...doorFrames,
  /**
   * NW-005A corridor props the set remodels on their existing colliders (the colliders stay):
   * the station counter's front fascia and transaction ledge (the worktop, pedestals and
   * everything on the desk stay), the two visitors' chairs, the south sanitisers and the
   * wet-floor sign.
   */
  stationCounterFront: box([-6.36, -0.02, -1.87], [-1.24, 1.165, -1.44]),
  visitorChairs: box([-4.45, -0.02, 0.66], [-2.95, 1.02, 1.36]),
  sanitiserSouthA: box([-6.85, 1.1, 1.25], [-6.65, 1.5, 1.405]),
  sanitiserSouthB: box([-2.5, 1.1, 1.25], [-2.3, 1.5, 1.405]),
  wetFloorSign: box([-9.25, -0.02, 0.1], [-8.45, 0.7, 0.9]),
} as const;

export const PROTOTYPE_SUPPRESSION: readonly Box3[] = Object.values(PROTOTYPE_REGIONS);
