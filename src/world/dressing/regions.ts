import { Box3, Vector3 } from 'three';

/**
 * Where the Room 104 visual prototype replaces procedural visuals. Each box holds only static
 * pieces that the Blender set redraws. Walls' structural cores, door leaves, the TV screen, the
 * wheelchair (a creep anomaly), light panels and every collider stay procedural.
 */
const box = (min: [number, number, number], max: [number, number, number]): Box3 => new Box3(new Vector3(...min), new Vector3(...max));

export const PROTOTYPE_REGIONS = {
  /** Room 104 interior: floor, ceiling, furniture and the room-side wall finishes. */
  room104: box([-15.535, -0.02, 1.545], [-11.265, 2.77, 6.405]),
  /** West corridor, corridor-facing finishes of the north wall (wainscot, rail, skirting, frames, signs). */
  corridorNorthFace: box([-20.2, -0.02, -1.405], [-6.99, 3.01, -1.26]),
  /** West corridor, corridor-facing finishes of the south wall. */
  corridorSouthFace: box([-20.2, -0.02, 1.26], [-6.99, 3.01, 1.405]),
  /** West corridor ceiling (its own rect from x -20 to -7) and its troffer housings; the window blinds and the dangling cables stay. */
  corridorCeiling: box([-20.01, 2.6, -1.41], [-6.99, 2.85, 1.41]),
  /** West corridor floor-level paint and decals (guide line, puddle) that would sit under the new floor skin. */
  corridorFloorDecals: box([-20.2, -0.02, -1.41], [-6.99, 0.006, 1.41]),
} as const;

export const PROTOTYPE_SUPPRESSION: readonly Box3[] = Object.values(PROTOTYPE_REGIONS);
