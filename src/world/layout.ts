/**
 * Ward 4 West floor plan (metres, +Y up, -Z = north).
 *
 *            z=-15.4 ┌────────┐
 *                    │STAIR B │ (locked, chained)
 *            z=-11   ├──door──┤
 *   north exterior   │        │
 *  ┌────┬────┬────┬───────┬───────┬────┬────────┐   │ C-EAST │═ lift (x=21)
 *  │101 │103 │105 │NURSES'│TREAT- │107 │STORAGE │   │corridor│
 *  │    │    │    │STATION│MENT   │    │        │   │        │
 *  ├─d──┴─d──┴─d──┴counter┴─d─────┴d───┴─d──────┘   │        │
 *  W  window      MAIN PATIENT CORRIDOR      ║smoke doors     │  z = -1.4 .. 1.4
 *  ├─d──┬─d──┬─d──┬conn┬─d──┬ waiting ┬─d──┬───────┐ │        │
 *  │102 │104 │106 │ ↓  │108 │  bay    │110 │112│114│ │        │   112 records, 114 electrical
 *  └────┴────┴────┴─d──┴────┴─────────┴────┴───────┘ │        │
 *                 │   MAINTENANCE PASSAGE ═══════════d        │  z = 6.55 .. 7.95
 *                 └────────────────────────────────────────────┘
 *  x: -20                     0                     18    20.85
 */
export const T = 0.15;

export const ROOMS = {
  corridor: 'nw:ward4:corridor-main',
  east: 'nw:ward4:corridor-east',
  connector: 'nw:ward4:connector',
  maintenance: 'nw:ward4:maintenance',
  stairwell: 'nw:ward4:stairwell-b',
  nurses: 'nw:ward4:nurses-station',
  treatment: 'nw:ward4:treatment',
  storage: 'nw:ward4:storage',
  waiting: 'nw:ward4:waiting-bay',
  lift: 'nw:ward4:lift-car',
  r101: 'nw:ward4:room-101',
  r102: 'nw:ward4:room-102',
  r103: 'nw:ward4:room-103',
  r104: 'nw:ward4:room-104',
  r105: 'nw:ward4:room-105',
  r106: 'nw:ward4:room-106',
  r107: 'nw:ward4:room-107',
  r108: 'nw:ward4:room-108',
  r110: 'nw:ward4:room-110',
  records: 'nw:ward4:records-112',
  electrical: 'nw:ward4:electrical-114',
} as const;

export type RoomKey = keyof typeof ROOMS;

/** Interior wall-face coordinates. */
export const Z = {
  northBack: -6.4,
  northFace: -1.55,
  corridorN: -1.4,
  corridorS: 1.4,
  southFace: 1.55,
  southBack: 6.4,
  maintN: 6.55,
  maintS: 7.95,
} as const;

export const X = {
  west: -20,
  east: 18,
  eastCorridorW: 18.15,
  eastCorridorE: 20.85,
} as const;

export const CEILING = { corridor: 2.7, room: 2.75, service: 2.98, stair: 6 } as const;

/** Partition centre lines (x) for the north and south bands. */
export const NORTH_SPLITS = [-20, -15.6, -11.2, -6.8, 0.2, 6.6, 11.0, 18] as const;
export const SOUTH_SPLITS = [-20, -15.6, -11.2, -6.8, -4.6, -0.2, 6.0, 10.4, 18] as const;

/** Door centres along the corridor walls. */
export const DOORS = {
  r101: -16.4, r103: -12.0, r105: -7.6, treatment: 1.4, r107: 7.45, storage: 12.0,
  r102: -16.4, r104: -12.0, r106: -7.6, r108: -1.0, r110: 6.95,
  maintenanceWest: -5.7, maintenanceEast: 7.25, stair: 19.5, smoke: 8.4,
  // NW-004A (Records 112, Electrical 114; service door into the maintenance passage)
  records: 11.95, electrical: 16.4, electricalService: 16.6,
} as const;

export const KEY_STAIRWELL = { id: 'nw:key:stairwell-b', description: 'Stairwell B key (chain and padlock)' } as const;
/** Provisional (NW-004A): Codex decides whether Chapter 1 hands this out. */
export const KEY_ELECTRICAL = { id: 'nw:key:electrical-114', description: 'Electrical room service key' } as const;

/**
 * NW-004A Chapter 1 layout v2 (blockout, behind `layout: 'chapter1'` / `?nwLayout=chapter1`).
 * New room IDs and door positions. The classic ward does not use any of these.
 */
export const C1_ROOMS = {
  staffPassage: 'nw:ward4:staff-passage',
  wardHall: 'nw:ward4:ward-hall',
  wingB: 'nw:ward4:wing-b',
  vestibule: 'nw:ward4:release-vestibule',
  observationBay: 'nw:ward4:observation-bay',
  pumpBay: 'nw:ward4:pump-bay',
} as const;

export const C1 = {
  /** Staff passage behind the north rooms (west run, x -6.8..9.0). */
  passageN: -8.3,
  passageS: -6.55,
  passageZ: -7.425,
  /**
   * The passage dog-legs north behind the observation suite: a link (x 9.0..10.2) and an east run
   * (x 10.2..18, z -9.6..-8.4). The two runs do not overlap in z, so there is no end-to-end view.
   */
  passageLink: [9.0, 10.2] as const,
  passageEastN: -9.6,
  passageEastS: -8.4,
  passageEastZ: -9.0,
  /** Records 112 moves into the old Room 108 footprint. */
  recordsX: [-4.6, -0.2] as const,
  recordsDoor: -2.4,
  /** Release vestibule in the old Records footprint. */
  vestibuleX: [10.4, 14.2] as const,
  vestibuleDoor: 12.3,
  vestibuleElectricalZ: 3.8,
  hallWest: -0.2,
  /** Smoke doors move east from x 8.4 so their open leaves clear the 107 door. */
  smokeX: 9.4,
  hallService: 2.8,
  stationStaff: -1.2,
  stationScreen: [-3.0, -1.8] as const,
  treatmentStaff: 4.6,
  treatmentWindow: [2.4, 4.4] as const,
  observationDoorZ: -4.0,
  galleryGlass: [-5.6, -2.4] as const,
  eastFireZ: -1.9,
  pumpBayX: [3.6, 6.6] as const,
  pumpBayS: 9.4,
  /** Ward-level stair landing. */
  landing: { x0: 18.3, x1: 20.7, z0: -12.8, z1: -11.2 },
} as const;
