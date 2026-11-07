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
 *  │102 │104 │106 │ ↓  │108 │  bay    │110 │(solid)│ │        │
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
} as const;

export const KEY_STAIRWELL = { id: 'nw:key:stairwell-b', description: 'Stairwell B key (chain and padlock)' } as const;
