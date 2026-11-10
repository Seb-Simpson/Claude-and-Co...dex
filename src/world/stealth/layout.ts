import type { Vec3 } from '../../contracts';

/**
 * NW-006A: the Nurses' Station stealth space, in game coordinates (metres, +Y up, north = -Z).
 * Authored once here; `src/world/stealth/nursesStation.ts` publishes these as named scene nodes
 * and typed accessors. Gameplay must read positions from those accessors, never from copies.
 */
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const STEALTH = {
  /** Where the player enters the station approach (end of the bed-to-station path, see opening.ts). */
  entry: v(-4.2, 0, 0.2),
  /**
   * Watching point: the corridor, west of the station, looking east through the open counter.
   * It is safe only while the nurse is inside the station: from her station waypoints the standing
   * player is at least 7 m away (her vision range) or out of line of sight. When she turns onto the
   * corridor leg of her route (she walks west past this point to x -10.5), the player must already
   * have moved on. The route is Codex's (nw:route:station-round); the tests measure both halves.
   */
  observation: v(-9.0, 0, 0.45),
  /** Crouch cover: stand just south of the linen screen (1.2 m, a standing player is seen over it). */
  crouchCover: v(-4.6, 0, -0.42),
  /** The linen screen itself: centre, and its size (x wide, y high, z deep). */
  screen: { centre: v(-4.6, 0.6, -1.0), size: { x: 0.9, y: 1.2, z: 0.5 } },
  /** Primary hiding place: the staff locker inside the station (existing spot nw:hiding:nurses-staff). */
  hidingPrimary: 'nw:hiding:nurses-staff',
  /**
   * Second, optional concealment: Room 105, whose door already stands open beside the observation
   * point. Its open floor is NOT safe (she sees into the room as she walks past the door); the
   * concealment is the existing under-bed hiding nw:hiding:room-105-bed-b. `concealment` is that
   * hiding's approach point (its first exit candidate), 4.5 m from the observation point.
   */
  hidingSecondary: 'nw:hiding:room-105-bed-b',
  concealment: v(-7.85, 0, -3.75),
  /** Patrol route through the station and out to the corridor (existing route nw:route:station-round). */
  patrolRoute: 'nw:route:station-round',
  /** Waypoints of that route, copied for documentation and tests (kept equal by the test suite). */
  patrolWaypoints: [v(-3.6, 0, -4.6), v(-1.5, 0, -4.9), v(-0.8, 0, -3.2), v(-0.75, 0, -1.0), v(-3.8, 0, 0), v(-10.5, 0, 0), v(-3.8, 0, 0), v(-0.75, 0, -1.0), v(-0.8, 0, -3.2), v(-1.5, 0, -4.9)] as readonly Vec3[],
  /** Exit toward the next Chapter 1 section: east along the corridor, past the treatment door. */
  exit: v(4.6, 0, 0.2),
  /** Doors along the route. */
  doors: ['nw:door:treatment'] as readonly string[],
} as const;

/** Standing and crouched eye heights used by Codex's player controller (player.ts). */
export const EYE = { standing: 1.65, crouching: 0.9 } as const;
/** Nurse Shaw's eye height (same profile as the other actors). */
export const NURSE_EYE = 1.65;

/**
 * NW-006A station props (Blender set: dressing/pipeline/station_set.py; keep the two in step, a
 * test checks every GLB node against these boxes). Centre and size are world-axis aligned boxes;
 * each is a solid collider except the wall-mounted pieces (annunciator, glove dispenser).
 */
export const STATION_PROPS = {
  /** Linen trolley = the crouch-cover collider (STEALTH.screen). */
  trolley: { centre: STEALTH.screen.centre, size: STEALTH.screen.size },
  /** Four-drawer filing cabinets on the back wall; B has a drawer left open (deeper box). */
  cabinetA: { centre: v(-5.73, 0.66, -6.08), size: { x: 0.47, y: 1.32, z: 0.62 } },
  cabinetB: { centre: v(-5.25, 0.66, -5.94), size: { x: 0.47, y: 1.32, z: 0.9 } },
  /** Supply cupboard on the west wall, front facing +x, one door 22 degrees open. */
  cupboard: { centre: v(-6.405, 0.975, -5.2), size: { x: 0.63, y: 1.95, z: 0.9 } },
  /** Parked observations machine by the east wall. */
  obsMachine: { centre: v(-0.42, 0.65, -5.3), size: { x: 0.56, y: 1.3, z: 0.56 } },
} as const;
