/**
 * NW-R02 — Chapter 1 architectural greybox: the single data source for the level.
 *
 * Everything that is built (floors, walls, ceilings, doors, colliders), drawn (developer map),
 * tested (topology, navigation) and measured (telemetry zones) comes from these tables.
 *
 * Coordinates: metres, x east, z south (so -z is north), floor at y = 0. Every rectangle edge sits
 * on the 0.1 m grid. Spaces never overlap; a wall is generated on every boundary between two
 * different spaces (or a space and the void) unless a connection opens it.
 */

export type Rect = readonly [x0: number, x1: number, z0: number, z1: number];

export type ZoneId =
  | 'west' | 'lobby' | 'office' | 'south' | 'stores' | 'crawl' | 'east' | 'loop' | 'branch-s'
  | 'branch-n' | 'plant' | 'maintenance' | 'chase' | 'old-north' | 'north-wing' | 'chapter2';

export interface ZoneDef {
  readonly id: ZoneId;
  readonly label: string;
  /** Floor tint and map colour. */
  readonly color: string;
}

export const ZONES: readonly ZoneDef[] = [
  { id: 'west', label: 'West ward (Ward 4 West)', color: '#6f9bd1' },
  { id: 'lobby', label: 'Central lobby', color: '#d9c36a' },
  { id: 'office', label: "Nurse's Office", color: '#d97a6a' },
  { id: 'south', label: 'South corridor', color: '#7cc28a' },
  { id: 'stores', label: 'Stores', color: '#c49a5a' },
  { id: 'crawl', label: 'Service crawlway', color: '#9a7ac9' },
  { id: 'east', label: 'East corridor', color: '#6ac2c0' },
  { id: 'loop', label: 'East loop', color: '#c96aa8' },
  { id: 'branch-s', label: 'East south branch', color: '#8ab3a0' },
  { id: 'branch-n', label: 'East north branch', color: '#a0a8c9' },
  { id: 'plant', label: 'Plant 2', color: '#c98a4a' },
  { id: 'maintenance', label: 'Maintenance passage', color: '#b0703a' },
  { id: 'chase', label: 'Chase run (M6–M9)', color: '#d0503a' },
  { id: 'old-north', label: 'Old north corridor (NOT IN USE)', color: '#8a8a7a' },
  { id: 'north-wing', label: 'North Wing (1987)', color: '#e8e0c8' },
  { id: 'chapter2', label: 'Chapter 2 continuation (stub)', color: '#505050' },
];

export type SpaceKind = 'room' | 'corridor' | 'crawl' | 'service' | 'stub';

export interface SpaceDef {
  readonly id: string;
  readonly name: string;
  readonly zone: ZoneId;
  readonly kind: SpaceKind;
  readonly rects: readonly Rect[];
  /** Clear ceiling height in metres. Below 1.8 forces crouching (standing height). */
  readonly ceiling: number;
  /** On the critical path from Room 104 to the far side of the barricade. */
  readonly required: boolean;
  /** Design-doc reference (R01 room code). */
  readonly ref?: string;
}

const C = { room: 2.8, corridor: 3.0, lobby: 3.4, service: 2.6, crawl: 1.2, low: 1.4 };

export const SPACES: readonly SpaceDef[] = [
  // ---- West ward ------------------------------------------------------------------------------
  { id: 'WC', name: 'West corridor', zone: 'west', kind: 'corridor', rects: [[-38, -6, -1.2, 1.2]], ceiling: C.corridor, required: true, ref: 'W' },
  { id: 'R104', name: 'Room 104', zone: 'west', kind: 'room', rects: [[-38, -32, 1.2, 7]], ceiling: C.room, required: true, ref: 'W1' },
  { id: 'W2', name: 'Room 103', zone: 'west', kind: 'room', rects: [[-32, -27, 1.2, 7]], ceiling: C.room, required: false, ref: 'W2' },
  { id: 'W3', name: 'Bay 105–108', zone: 'west', kind: 'room', rects: [[-27, -17, 1.2, 7]], ceiling: C.room, required: false, ref: 'W3' },
  { id: 'W4', name: 'Bathroom', zone: 'west', kind: 'room', rects: [[-17, -13, 1.2, 7]], ceiling: C.room, required: false, ref: 'W4' },
  { id: 'W8', name: 'Linen cupboard', zone: 'west', kind: 'room', rects: [[-13, -10.6, 1.2, 4]], ceiling: C.room, required: false, ref: 'W8' },
  { id: 'W5', name: 'Examination room', zone: 'west', kind: 'room', rects: [[-38, -31, -7, -1.2]], ceiling: C.room, required: false, ref: 'W5' },
  { id: 'W6', name: 'Imaging', zone: 'west', kind: 'room', rects: [[-31, -24, -7, -1.2]], ceiling: C.room, required: false, ref: 'W6' },
  { id: 'W6D', name: 'Darkroom', zone: 'west', kind: 'room', rects: [[-24, -21, -7, -3.5]], ceiling: C.room, required: false, ref: 'W6' },
  { id: 'W7', name: "West Sister's bay", zone: 'west', kind: 'room', rects: [[-21, -15, -5, -1.2]], ceiling: C.room, required: false, ref: 'W7' },
  { id: 'W9', name: 'Clean utility', zone: 'west', kind: 'room', rects: [[-15, -9, -7, -1.2]], ceiling: C.room, required: false },

  // ---- Lobby and office -----------------------------------------------------------------------
  { id: 'LOBBY', name: 'Central lobby', zone: 'lobby', kind: 'room', rects: [[-6, 6, -5, 5]], ceiling: C.lobby, required: true, ref: 'L' },
  { id: 'OFFICE', name: "Nurse's Office", zone: 'office', kind: 'room', rects: [[-3, 3, -10, -5]], ceiling: C.room, required: true, ref: 'O' },

  // ---- South ----------------------------------------------------------------------------------
  { id: 'SC', name: 'South corridor', zone: 'south', kind: 'corridor', rects: [[-1.2, 1.2, 5, 32.4], [1.2, 8, 30, 32.4]], ceiling: C.corridor, required: true, ref: 'S' },
  { id: 'S1', name: 'Staff changing', zone: 'south', kind: 'room', rects: [[-7, -1.2, 6, 12]], ceiling: C.room, required: false, ref: 'S1' },
  { id: 'S3', name: 'Physiotherapy', zone: 'south', kind: 'room', rects: [[-8, -1.2, 12, 20]], ceiling: C.room, required: false, ref: 'S3' },
  { id: 'S4', name: 'Store cupboard', zone: 'south', kind: 'room', rects: [[-6, -1.2, 20, 25]], ceiling: C.room, required: false },
  { id: 'S2', name: 'Dayroom', zone: 'south', kind: 'room', rects: [[1.2, 8, 6, 14]], ceiling: C.room, required: false, ref: 'S2' },
  { id: 'S5', name: 'Sluice', zone: 'south', kind: 'room', rects: [[1.2, 6, 14, 18]], ceiling: C.room, required: false, ref: 'S5' },
  { id: 'S6', name: "Relatives' room", zone: 'south', kind: 'room', rects: [[1.2, 7, 18, 24]], ceiling: C.room, required: false, ref: 'S6' },
  { id: 'ST1', name: 'Main store', zone: 'stores', kind: 'room', rects: [[8, 20, 25, 37]], ceiling: 3.2, required: true, ref: 'ST1' },
  { id: 'ST2', name: "Porters' room", zone: 'stores', kind: 'room', rects: [[20, 26, 27, 35]], ceiling: C.room, required: true, ref: 'ST2' },

  // ---- Service crawlway (two splits that each rejoin) ------------------------------------------
  { id: 'CE', name: 'Crawlway entrance', zone: 'crawl', kind: 'crawl', rects: [[26, 27, 31.5, 32.5]], ceiling: C.crawl, required: true, ref: 'V0' },
  { id: 'V1W', name: 'V1 split (west spine)', zone: 'crawl', kind: 'crawl', rects: [[27, 28, 28, 39]], ceiling: C.crawl, required: true, ref: 'V1' },
  { id: 'V1A', name: 'Run (a): grille run', zone: 'crawl', kind: 'crawl', rects: [[28, 32, 28, 29]], ceiling: C.crawl, required: false, ref: 'V1a' },
  { id: 'V1B', name: 'Run (b): steam run', zone: 'crawl', kind: 'crawl', rects: [[28, 32, 38, 39]], ceiling: C.crawl, required: false, ref: 'V1b' },
  { id: 'V2E', name: 'V2 rejoin / V3 split (east spine)', zone: 'crawl', kind: 'crawl', rects: [[32, 33, 26, 39]], ceiling: C.crawl, required: true, ref: 'V2/V3' },
  { id: 'V3C', name: 'Run (c): lower duct', zone: 'crawl', kind: 'crawl', rects: [[32, 33, 23.5, 26]], ceiling: C.crawl, required: false, ref: 'V3c' },
  { id: 'V3S', name: 'Run (d): upper run (south)', zone: 'crawl', kind: 'crawl', rects: [[29, 32, 26, 27]], ceiling: C.crawl, required: false, ref: 'V3d' },
  { id: 'V3W', name: 'Run (d): upper run (west)', zone: 'crawl', kind: 'crawl', rects: [[28, 29, 20, 27]], ceiling: C.crawl, required: false, ref: 'V3d' },
  { id: 'V3N', name: 'Run (d): upper run (north)', zone: 'crawl', kind: 'crawl', rects: [[29, 32, 20, 21]], ceiling: C.crawl, required: false, ref: 'V3d' },
  { id: 'V4', name: 'V4 rejoin', zone: 'crawl', kind: 'crawl', rects: [[32, 33, 20, 23.5]], ceiling: C.crawl, required: true, ref: 'V4' },
  { id: 'CX', name: 'Crawlway exit duct', zone: 'crawl', kind: 'crawl', rects: [[33, 35, 22.5, 23.5]], ceiling: C.crawl, required: true, ref: 'V4' },

  // ---- East corridor and loop -----------------------------------------------------------------
  { id: 'EC', name: 'East corridor', zone: 'east', kind: 'corridor', rects: [[6, 15, -1.5, 1.5]], ceiling: C.corridor, required: false, ref: 'E' },
  { id: 'EC1', name: 'Ward clerk', zone: 'east', kind: 'room', rects: [[6, 11, -6, -1.5]], ceiling: C.room, required: false },
  { id: 'EC2', name: 'Interview room', zone: 'east', kind: 'room', rects: [[6, 11, 1.5, 6]], ceiling: C.room, required: false },
  { id: 'LWC', name: 'Loop west corridor', zone: 'loop', kind: 'corridor', rects: [[15, 17.4, -15, 15]], ceiling: C.corridor, required: false, ref: 'EL' },
  { id: 'LEC', name: 'Loop east corridor', zone: 'loop', kind: 'corridor', rects: [[26.6, 29, -15, 15]], ceiling: C.corridor, required: true, ref: 'EL' },
  { id: 'LNC', name: 'Loop north corridor', zone: 'loop', kind: 'corridor', rects: [[17.4, 26.6, -15, -12.6]], ceiling: C.corridor, required: false, ref: 'EL' },
  { id: 'LSC', name: 'Loop south corridor', zone: 'loop', kind: 'corridor', rects: [[17.4, 26.6, 12.6, 15]], ceiling: C.corridor, required: false, ref: 'EL' },
  { id: 'LPW1', name: 'Loop room W1', zone: 'loop', kind: 'room', rects: [[11, 15, -15, -8.5]], ceiling: C.room, required: false },
  { id: 'LPW2', name: 'Loop room W2', zone: 'loop', kind: 'room', rects: [[11, 15, -8.5, -1.5]], ceiling: C.room, required: false },
  { id: 'LPW3', name: 'Loop room W3', zone: 'loop', kind: 'room', rects: [[11, 15, 1.5, 8.5]], ceiling: C.room, required: false },
  { id: 'LPW4', name: 'Loop room W4', zone: 'loop', kind: 'room', rects: [[11, 15, 8.5, 15]], ceiling: C.room, required: false },
  { id: 'LPE1', name: 'Loop room E1', zone: 'loop', kind: 'room', rects: [[29, 33, -15, -8.5]], ceiling: C.room, required: false },
  { id: 'LPE2', name: 'Loop room E2', zone: 'loop', kind: 'room', rects: [[29, 33, -8.5, -1.5]], ceiling: C.room, required: false },
  { id: 'LPE3', name: 'Loop room E3', zone: 'loop', kind: 'room', rects: [[29, 33, 1.5, 8.5]], ceiling: C.room, required: false },
  { id: 'LPE4', name: 'Loop room E4', zone: 'loop', kind: 'room', rects: [[29, 33, 8.5, 15]], ceiling: C.room, required: false },
  { id: 'LOFF', name: 'Ward office (core)', zone: 'loop', kind: 'room', rects: [[17.4, 26.6, -3, 3]], ceiling: C.room, required: true, ref: 'EL Office' },
  { id: 'LCU', name: 'Clean utility (core)', zone: 'loop', kind: 'room', rects: [[17.4, 22, -12.6, -3]], ceiling: C.room, required: false },
  { id: 'LLN', name: 'Linen store (core)', zone: 'loop', kind: 'room', rects: [[22, 26.6, -12.6, -3]], ceiling: C.room, required: false },
  { id: 'LTR', name: 'Treatment room (core)', zone: 'loop', kind: 'room', rects: [[17.4, 22, 3, 12.6]], ceiling: C.room, required: false },
  { id: 'LEQ', name: 'Equipment store (core)', zone: 'loop', kind: 'room', rects: [[22, 26.6, 3, 12.6]], ceiling: C.room, required: false },
  { id: 'LUS', name: 'Loop sluice', zone: 'loop', kind: 'room', rects: [[15, 22, -19, -15]], ceiling: C.room, required: false },
  { id: 'LKT', name: 'Ward kitchen', zone: 'loop', kind: 'room', rects: [[22, 29, -19, -15]], ceiling: C.room, required: false },
  { id: 'LISO', name: 'ISOLATION', zone: 'loop', kind: 'room', rects: [[15, 21, 15, 19]], ceiling: C.room, required: false, ref: 'EL-ISO' },
  { id: 'LBA', name: 'Loop bathroom', zone: 'loop', kind: 'room', rects: [[21, 25, 15, 19]], ceiling: C.room, required: false },
  { id: 'LST', name: 'Loop store', zone: 'loop', kind: 'room', rects: [[25, 29, 15, 19]], ceiling: C.room, required: false },

  // ---- Junction and branches ------------------------------------------------------------------
  { id: 'EJ', name: 'East junction', zone: 'east', kind: 'corridor', rects: [[29, 39.4, -1.5, 1.5]], ceiling: C.corridor, required: true, ref: 'EJ' },
  { id: 'SB', name: 'South branch', zone: 'branch-s', kind: 'corridor', rects: [[37, 39.4, 1.5, 22]], ceiling: C.corridor, required: true, ref: 'ES' },
  { id: 'ES1', name: 'Branch bathroom', zone: 'branch-s', kind: 'room', rects: [[33, 37, 4, 10]], ceiling: C.room, required: false },
  { id: 'ES3', name: 'Side room (traction)', zone: 'branch-s', kind: 'room', rects: [[33, 37, 10, 16]], ceiling: C.room, required: false, ref: 'ES3' },
  { id: 'ES4', name: 'Day bay', zone: 'branch-s', kind: 'room', rects: [[39.4, 45, 3, 10]], ceiling: C.room, required: false },
  { id: 'ES5', name: 'Branch store', zone: 'branch-s', kind: 'room', rects: [[39.4, 45, 10, 17]], ceiling: C.room, required: false },
  { id: 'ES2', name: 'Branch sluice (crawl exit)', zone: 'branch-s', kind: 'room', rects: [[35, 41, 22, 26]], ceiling: C.room, required: true, ref: 'ES2' },
  { id: 'NBR', name: 'North branch', zone: 'branch-n', kind: 'corridor', rects: [[37, 39.4, -26, -1.5]], ceiling: C.corridor, required: true, ref: 'EN' },
  { id: 'EN1', name: 'On-call room', zone: 'branch-n', kind: 'room', rects: [[33, 37, -8, -3]], ceiling: C.room, required: false, ref: 'EN1' },
  { id: 'EN2', name: 'Seminar room', zone: 'branch-n', kind: 'room', rects: [[33, 37, -16, -9]], ceiling: C.room, required: false, ref: 'EN2' },
  { id: 'EN3', name: 'Staff room', zone: 'branch-n', kind: 'room', rects: [[39.4, 45, -10, -3]], ceiling: C.room, required: false },
  { id: 'EN4', name: 'Records', zone: 'branch-n', kind: 'room', rects: [[39.4, 45, -20, -12]], ceiling: C.room, required: false },

  // ---- Maintenance passage (winds generally west) -----------------------------------------------
  { id: 'M0', name: 'Plant 2', zone: 'plant', kind: 'service', rects: [[33, 43, -34, -26]], ceiling: 3.2, required: true, ref: 'M0' },
  { id: 'M1A', name: 'M1 pipe corridor', zone: 'maintenance', kind: 'service', rects: [[37, 39.2, -44, -34]], ceiling: C.service, required: true, ref: 'M1' },
  { id: 'M1B', name: 'M1 pipe corridor (narrows)', zone: 'maintenance', kind: 'service', rects: [[29, 37, -44, -42.4]], ceiling: C.service, required: true, ref: 'M1' },
  { id: 'M2', name: 'M2 cable tunnel (1.4 m)', zone: 'maintenance', kind: 'service', rects: [[23, 29, -44, -42.4]], ceiling: C.low, required: true, ref: 'M2' },
  { id: 'M3', name: 'M3 pump chamber', zone: 'maintenance', kind: 'service', rects: [[15, 23, -47, -39]], ceiling: 3.0, required: true, ref: 'M3' },
  { id: 'M4', name: 'M4 transfer link', zone: 'maintenance', kind: 'service', rects: [[5, 15, -44, -42]], ceiling: C.service, required: true, ref: 'M4' },
  { id: 'M5', name: 'M5 bulkhead chamber', zone: 'maintenance', kind: 'service', rects: [[2, 5, -44.5, -41.5]], ceiling: C.service, required: true, ref: 'M5' },

  // ---- Chase run (single line, no parallel route) -----------------------------------------------
  { id: 'M6A', name: 'M6 pipe run (1)', zone: 'chase', kind: 'service', rects: [[-4, 2, -43.8, -42.2]], ceiling: C.service, required: true, ref: 'C1' },
  { id: 'M6B', name: 'M6 pipe run (2)', zone: 'chase', kind: 'service', rects: [[-5.6, -4, -50, -42.2]], ceiling: C.service, required: true, ref: 'C1' },
  { id: 'M6C', name: 'M6 pipe run (3)', zone: 'chase', kind: 'service', rects: [[-14, -5.6, -50, -48.4]], ceiling: C.service, required: true, ref: 'C1' },
  { id: 'M6D', name: 'M6 pipe run (4)', zone: 'chase', kind: 'service', rects: [[-15.6, -14, -50, -44]], ceiling: C.service, required: true, ref: 'C1' },
  { id: 'M6E', name: 'M6 pipe run (5)', zone: 'chase', kind: 'service', rects: [[-22, -15.6, -45.6, -44]], ceiling: C.service, required: true, ref: 'C1' },
  { id: 'M7', name: 'M7 past the barred door', zone: 'chase', kind: 'service', rects: [[-28, -22, -45.6, -44]], ceiling: C.service, required: true, ref: 'C2' },
  { id: 'M8', name: 'M8 low duct (1.2 m)', zone: 'chase', kind: 'service', rects: [[-31, -28, -45.4, -44.2]], ceiling: C.crawl, required: true, ref: 'C5' },
  { id: 'M8C', name: 'M8 riser hall (service stair omitted)', zone: 'chase', kind: 'service', rects: [[-34.6, -31, -46, -33]], ceiling: C.service, required: true, ref: 'C6' },
  { id: 'NL', name: 'Old north corridor (NOT IN USE)', zone: 'old-north', kind: 'corridor', rects: [[-36, -16, -33, -30]], ceiling: C.corridor, required: true, ref: 'C8' },

  // ---- North Wing (Chapter 2 begins here) -----------------------------------------------------
  { id: 'NB', name: 'North Wing corridor', zone: 'north-wing', kind: 'corridor', rects: [[-16, 1.2, -32.4, -30]], ceiling: C.corridor, required: true, ref: 'NB' },
  { id: 'NB1', name: 'North Wing spine (to the office door)', zone: 'north-wing', kind: 'corridor', rects: [[-1.2, 1.2, -30, -10]], ceiling: C.corridor, required: true, ref: 'NB1' },
  { id: 'NB3', name: 'North Wing reception', zone: 'north-wing', kind: 'room', rects: [[-12, -4, -41, -32.4]], ceiling: 3.2, required: false, ref: 'NB3' },
  { id: 'C2W', name: 'Chapter 2 stub (west)', zone: 'chapter2', kind: 'stub', rects: [[-18, -12, -39, -35]], ceiling: C.corridor, required: false },
  { id: 'C2E', name: 'Chapter 2 stub (east)', zone: 'chapter2', kind: 'stub', rects: [[1.2, 5, -32.4, -30]], ceiling: C.corridor, required: false },
];

// -----------------------------------------------------------------------------------------------
// Connections
// -----------------------------------------------------------------------------------------------

export type ConnectionKind = 'open' | 'door' | 'hatch' | 'window';
export type DoorInitial = 'open' | 'closed' | 'locked';

export interface DoorDef {
  readonly initial: DoorInitial;
  /** Requirement flag that must be set before the door will open (temporary progression control). */
  readonly requires?: string;
  readonly requiresText?: string;
  /** Two leaves splitting the opening (fire doors, NT doors, Chapter 2 doors). */
  readonly double?: boolean;
  readonly prompt?: string;
  readonly vision?: 'narrow' | 'wide' | 'none';
  /** Leaf swings into this space (defaults to `b`). */
  readonly swingInto?: string;
  readonly hinge?: 'min' | 'max';
}

export interface ConnectionDef {
  readonly id: string;
  readonly a: string;
  readonly b: string;
  readonly kind: ConnectionKind;
  /** 'x': the wall runs along x (the boundary is the line z = at). 'z': the boundary is x = at. */
  readonly axis: 'x' | 'z';
  readonly at: number;
  /** Centre of the opening along the wall. */
  readonly center: number;
  readonly width: number;
  /** Opening bottom/top (m). Defaults: open/door/hatch from the floor; windows 1.0–2.0. */
  readonly bottom?: number;
  readonly top?: number;
  readonly door?: DoorDef;
  /** Design note shown on the map and in the registry. */
  readonly note?: string;
  /** Designers' intent for the Chapter 1 build (the greybox may stand in with a placeholder). */
  readonly rule?: string;
}

const d = (initial: DoorInitial, extra: Omit<DoorDef, 'initial'> = {}): DoorDef => ({ initial, ...extra });

export const CONNECTIONS: readonly ConnectionDef[] = [
  // Lobby: exactly four connections (west, south, east, office).
  { id: 'lobby-west', a: 'LOBBY', b: 'WC', kind: 'open', axis: 'z', at: -6, center: 0, width: 2.4, note: 'Archway to the west ward' },
  { id: 'lobby-south', a: 'LOBBY', b: 'SC', kind: 'open', axis: 'x', at: 5, center: 0, width: 2.4, note: 'Archway to the south corridor' },
  { id: 'F1', a: 'LOBBY', b: 'EC', kind: 'door', axis: 'z', at: 6, center: 0, width: 2.6, door: d('closed', { double: true, requires: 'f1-open', requiresText: 'Push-bar on the east side', swingInto: 'LOBBY', vision: 'wide' }), rule: 'F1 fire doors: push-bar from the east only (optional shortcut)' },
  { id: 'office-lobby', a: 'LOBBY', b: 'OFFICE', kind: 'door', axis: 'x', at: -5, center: 0, width: 1.2, door: d('closed', { vision: 'narrow' }), rule: "Office door 1 of 2 (lobby side): open" },
  { id: 'office-north', a: 'OFFICE', b: 'NB1', kind: 'door', axis: 'x', at: -10, center: 0, width: 1.2, door: d('locked', { prompt: 'Barricaded from the far side', vision: 'wide', swingInto: 'NB1' }), rule: 'Office door 2 of 2 (North Wing side): barricaded from the North Wing side, never opens in Chapter 1' },

  // West ward.
  { id: 'R104-door', a: 'WC', b: 'R104', kind: 'door', axis: 'x', at: 1.2, center: -33.2, width: 1.2, door: d('open', { hinge: 'max' }) },
  { id: 'W2-door', a: 'WC', b: 'W2', kind: 'door', axis: 'x', at: 1.2, center: -28.2, width: 1.2, door: d('closed') },
  { id: 'W3-door', a: 'WC', b: 'W3', kind: 'door', axis: 'x', at: 1.2, center: -22, width: 1.4, door: d('open') },
  { id: 'W4-door', a: 'WC', b: 'W4', kind: 'door', axis: 'x', at: 1.2, center: -14.2, width: 1.0, door: d('closed') },
  { id: 'W8-door', a: 'WC', b: 'W8', kind: 'door', axis: 'x', at: 1.2, center: -11.8, width: 1.0, door: d('closed', { vision: 'none' }) },
  { id: 'W5-door', a: 'WC', b: 'W5', kind: 'door', axis: 'x', at: -1.2, center: -32.2, width: 1.2, door: d('closed') },
  { id: 'W6-door', a: 'WC', b: 'W6', kind: 'door', axis: 'x', at: -1.2, center: -25.2, width: 1.2, door: d('closed') },
  { id: 'W6D-door', a: 'W6', b: 'W6D', kind: 'door', axis: 'z', at: -24, center: -5.4, width: 1.0, door: d('closed', { vision: 'none' }) },
  { id: 'W7-bay', a: 'WC', b: 'W7', kind: 'open', axis: 'x', at: -1.2, center: -18, width: 4.0, note: "Sister's bay (open counter)" },
  { id: 'W9-door', a: 'WC', b: 'W9', kind: 'door', axis: 'x', at: -1.2, center: -10.2, width: 1.2, door: d('closed') },

  // South.
  { id: 'S1-door', a: 'SC', b: 'S1', kind: 'door', axis: 'z', at: -1.2, center: 9, width: 1.2, door: d('closed') },
  { id: 'S3-door', a: 'SC', b: 'S3', kind: 'door', axis: 'z', at: -1.2, center: 16, width: 1.4, door: d('closed') },
  { id: 'S4-door', a: 'SC', b: 'S4', kind: 'door', axis: 'z', at: -1.2, center: 22.5, width: 1.0, door: d('closed', { vision: 'none' }) },
  { id: 'S2-door', a: 'SC', b: 'S2', kind: 'door', axis: 'z', at: 1.2, center: 10, width: 1.4, door: d('closed') },
  { id: 'S5-door', a: 'SC', b: 'S5', kind: 'door', axis: 'z', at: 1.2, center: 16, width: 1.2, door: d('closed') },
  { id: 'S6-door', a: 'SC', b: 'S6', kind: 'door', axis: 'z', at: 1.2, center: 21, width: 1.2, door: d('closed') },
  { id: 'ST1-door', a: 'SC', b: 'ST1', kind: 'door', axis: 'z', at: 8, center: 31.2, width: 1.6, door: d('open', { vision: 'wide' }), rule: 'Stores: locked by Shaw only if the player is inside (E2 placeholder)' },
  { id: 'ST2-door', a: 'ST1', b: 'ST2', kind: 'door', axis: 'z', at: 20, center: 31, width: 1.2, door: d('open') },
  { id: 'hatch', a: 'ST2', b: 'CE', kind: 'hatch', axis: 'z', at: 26, center: 32, width: 0.9, top: 1.15, rule: 'Crawlway hatch: 4 wing nuts, about 5 s crouched (placeholder: always open)' },

  // Crawlway internal openings.
  { id: 'cw-1', a: 'CE', b: 'V1W', kind: 'open', axis: 'z', at: 27, center: 32, width: 1.0 },
  { id: 'cw-a1', a: 'V1W', b: 'V1A', kind: 'open', axis: 'z', at: 28, center: 28.5, width: 1.0 },
  { id: 'cw-a2', a: 'V1A', b: 'V2E', kind: 'open', axis: 'z', at: 32, center: 28.5, width: 1.0 },
  { id: 'cw-b1', a: 'V1W', b: 'V1B', kind: 'open', axis: 'z', at: 28, center: 38.5, width: 1.0 },
  { id: 'cw-b2', a: 'V1B', b: 'V2E', kind: 'open', axis: 'z', at: 32, center: 38.5, width: 1.0 },
  { id: 'cw-c1', a: 'V2E', b: 'V3C', kind: 'open', axis: 'x', at: 26, center: 32.5, width: 1.0, note: 'V3 split: run (c) lower duct' },
  { id: 'cw-c2', a: 'V3C', b: 'V4', kind: 'open', axis: 'x', at: 23.5, center: 32.5, width: 1.0 },
  { id: 'cw-d1', a: 'V2E', b: 'V3S', kind: 'open', axis: 'z', at: 32, center: 26.5, width: 1.0, note: 'V3 split: run (d) upper run' },
  { id: 'cw-d2', a: 'V3S', b: 'V3W', kind: 'open', axis: 'z', at: 29, center: 26.5, width: 1.0 },
  { id: 'cw-d3', a: 'V3W', b: 'V3N', kind: 'open', axis: 'z', at: 29, center: 20.5, width: 1.0 },
  { id: 'cw-d4', a: 'V3N', b: 'V4', kind: 'open', axis: 'z', at: 32, center: 20.5, width: 1.0 },
  { id: 'cw-3', a: 'V4', b: 'CX', kind: 'open', axis: 'z', at: 33, center: 23, width: 1.0 },
  { id: 'grille', a: 'CX', b: 'ES2', kind: 'hatch', axis: 'z', at: 35, center: 23, width: 0.9, top: 1.15, rule: 'ES2 grille: kicked out, one way, stays open (placeholder: always open)' },

  // East corridor.
  { id: 'EC1-door', a: 'EC', b: 'EC1', kind: 'door', axis: 'x', at: -1.5, center: 8.5, width: 1.2, door: d('closed') },
  { id: 'EC2-door', a: 'EC', b: 'EC2', kind: 'door', axis: 'x', at: 1.5, center: 8.5, width: 1.2, door: d('closed') },
  { id: 'EC-loop', a: 'EC', b: 'LWC', kind: 'open', axis: 'z', at: 15, center: 0, width: 3.0 },

  // Loop ring (a rectangle that reconnects at its east end).
  { id: 'ring-nw', a: 'LWC', b: 'LNC', kind: 'open', axis: 'z', at: 17.4, center: -13.8, width: 2.4 },
  { id: 'ring-ne', a: 'LNC', b: 'LEC', kind: 'open', axis: 'z', at: 26.6, center: -13.8, width: 2.4 },
  { id: 'ring-sw', a: 'LWC', b: 'LSC', kind: 'open', axis: 'z', at: 17.4, center: 13.8, width: 2.4 },
  { id: 'ring-se', a: 'LSC', b: 'LEC', kind: 'open', axis: 'z', at: 26.6, center: 13.8, width: 2.4 },
  { id: 'loop-east', a: 'LEC', b: 'EJ', kind: 'open', axis: 'z', at: 29, center: 0, width: 3.0, note: 'The loop rejoins the east corridor here' },
  // Patient rooms (8).
  { id: 'LPW1-door', a: 'LWC', b: 'LPW1', kind: 'door', axis: 'z', at: 15, center: -11.8, width: 1.2, door: d('open') },
  { id: 'LPW2-door', a: 'LWC', b: 'LPW2', kind: 'door', axis: 'z', at: 15, center: -5, width: 1.2, door: d('open') },
  { id: 'LPW3-door', a: 'LWC', b: 'LPW3', kind: 'door', axis: 'z', at: 15, center: 5, width: 1.2, door: d('open') },
  { id: 'LPW4-door', a: 'LWC', b: 'LPW4', kind: 'door', axis: 'z', at: 15, center: 11.8, width: 1.2, door: d('open') },
  { id: 'LPE1-door', a: 'LEC', b: 'LPE1', kind: 'door', axis: 'z', at: 29, center: -11.8, width: 1.2, door: d('open') },
  { id: 'LPE2-door', a: 'LEC', b: 'LPE2', kind: 'door', axis: 'z', at: 29, center: -5, width: 1.2, door: d('open') },
  { id: 'LPE3-door', a: 'LEC', b: 'LPE3', kind: 'door', axis: 'z', at: 29, center: 5, width: 1.2, door: d('open') },
  { id: 'LPE4-door', a: 'LEC', b: 'LPE4', kind: 'door', axis: 'z', at: 29, center: 11.8, width: 1.2, door: d('open') },
  // Core: ward office with two doors and an observation window on both long sides.
  { id: 'LOFF-west', a: 'LWC', b: 'LOFF', kind: 'door', axis: 'z', at: 17.4, center: -1.6, width: 1.2, door: d('open') },
  { id: 'LOFF-east', a: 'LEC', b: 'LOFF', kind: 'door', axis: 'z', at: 26.6, center: 1.6, width: 1.2, door: d('open') },
  { id: 'LOFF-win-w', a: 'LWC', b: 'LOFF', kind: 'window', axis: 'z', at: 17.4, center: 1.4, width: 2.4, note: 'Observation window (west long side)' },
  { id: 'LOFF-win-e', a: 'LEC', b: 'LOFF', kind: 'window', axis: 'z', at: 26.6, center: -1.4, width: 2.4, note: 'Observation window (east long side)' },
  { id: 'LTR-office', a: 'LOFF', b: 'LTR', kind: 'door', axis: 'x', at: 3, center: 19.7, width: 1.0, door: d('open'), note: 'Treatment room to office: approach C waiting position' },
  { id: 'LTR-door', a: 'LWC', b: 'LTR', kind: 'door', axis: 'z', at: 17.4, center: 8, width: 1.2, door: d('closed') },
  { id: 'LCU-door', a: 'LWC', b: 'LCU', kind: 'door', axis: 'z', at: 17.4, center: -8, width: 1.2, door: d('closed') },
  { id: 'LLN-door', a: 'LEC', b: 'LLN', kind: 'door', axis: 'z', at: 26.6, center: -8, width: 1.2, door: d('closed') },
  { id: 'LEQ-door', a: 'LEC', b: 'LEQ', kind: 'door', axis: 'z', at: 26.6, center: 8, width: 1.2, door: d('closed') },
  { id: 'LUS-door', a: 'LNC', b: 'LUS', kind: 'door', axis: 'x', at: -15, center: 19.5, width: 1.2, door: d('closed') },
  { id: 'LKT-door', a: 'LNC', b: 'LKT', kind: 'door', axis: 'x', at: -15, center: 24.5, width: 1.2, door: d('closed') },
  { id: 'LISO-door', a: 'LSC', b: 'LISO', kind: 'door', axis: 'x', at: 15, center: 19, width: 1.2, door: d('closed', { vision: 'wide' }), note: 'ISOLATION: door glass faces the south side' },
  { id: 'LBA-door', a: 'LSC', b: 'LBA', kind: 'door', axis: 'x', at: 15, center: 23, width: 1.0, door: d('closed') },
  { id: 'LST-door', a: 'LSC', b: 'LST', kind: 'door', axis: 'x', at: 15, center: 25.8, width: 1.0, door: d('closed') },

  // Junction and branches.
  { id: 'EJ-south', a: 'EJ', b: 'SB', kind: 'open', axis: 'x', at: 1.5, center: 38.2, width: 2.4 },
  { id: 'EJ-north', a: 'EJ', b: 'NBR', kind: 'open', axis: 'x', at: -1.5, center: 38.2, width: 2.4 },
  { id: 'ES1-door', a: 'SB', b: 'ES1', kind: 'door', axis: 'z', at: 37, center: 7, width: 1.2, door: d('closed') },
  { id: 'ES3-door', a: 'SB', b: 'ES3', kind: 'door', axis: 'z', at: 37, center: 13, width: 1.2, door: d('closed') },
  { id: 'ES4-door', a: 'SB', b: 'ES4', kind: 'door', axis: 'z', at: 39.4, center: 6.5, width: 1.2, door: d('closed') },
  { id: 'ES5-door', a: 'SB', b: 'ES5', kind: 'door', axis: 'z', at: 39.4, center: 13.5, width: 1.2, door: d('closed') },
  { id: 'ES2-door', a: 'SB', b: 'ES2', kind: 'door', axis: 'x', at: 22, center: 38.2, width: 1.2, door: d('open', { swingInto: 'ES2' }) },
  { id: 'EN1-door', a: 'NBR', b: 'EN1', kind: 'door', axis: 'z', at: 37, center: -5.5, width: 1.2, door: d('closed') },
  { id: 'EN2-door', a: 'NBR', b: 'EN2', kind: 'door', axis: 'z', at: 37, center: -12.5, width: 1.2, door: d('closed') },
  { id: 'EN3-door', a: 'NBR', b: 'EN3', kind: 'door', axis: 'z', at: 39.4, center: -6.5, width: 1.2, door: d('closed') },
  { id: 'EN4-door', a: 'NBR', b: 'EN4', kind: 'door', axis: 'z', at: 39.4, center: -16, width: 1.2, door: d('closed') },
  { id: 'plant2-door', a: 'NBR', b: 'M0', kind: 'door', axis: 'x', at: -26, center: 38.2, width: 1.2, door: d('closed', { requires: 'shaw-keys', requiresText: "Locked: Sr Shaw's key", vision: 'none' }), rule: 'Plant 2: needs the key; opens freely from inside (greybox: key required both ways)' },

  // Maintenance passage.
  { id: 'M0-M1', a: 'M0', b: 'M1A', kind: 'open', axis: 'x', at: -34, center: 38.1, width: 2.2 },
  { id: 'M1-turn', a: 'M1A', b: 'M1B', kind: 'open', axis: 'z', at: 37, center: -43.2, width: 1.6 },
  { id: 'M1-M2', a: 'M1B', b: 'M2', kind: 'open', axis: 'z', at: 29, center: -43.2, width: 1.6, note: 'Forced crouch: 1.4 m tunnel for 6 m' },
  { id: 'M2-M3', a: 'M2', b: 'M3', kind: 'open', axis: 'z', at: 23, center: -43.2, width: 1.6 },
  { id: 'steam', a: 'M3', b: 'M4', kind: 'door', axis: 'z', at: 15, center: -43, width: 1.6, door: d('closed', { requires: 'valve-open', requiresText: 'Steam blocks the way (valve)', vision: 'none', prompt: 'Steam (placeholder gate)' }), rule: 'Valve puzzle: steam blocks the way (placeholder gate)' },
  { id: 'M4-M5', a: 'M4', b: 'M5', kind: 'open', axis: 'z', at: 5, center: -43, width: 2.0 },
  { id: 'bulkhead', a: 'M5', b: 'M6A', kind: 'door', axis: 'z', at: 2, center: -43, width: 1.2, door: d('closed', { requires: 'bulkhead-cranked', requiresText: 'Crank the bulkhead (hold)', vision: 'none', swingInto: 'M6A' }), rule: 'Bulkhead: one way, after the bell (CP7)' },

  // Chase run.
  { id: 'C1-1', a: 'M6A', b: 'M6B', kind: 'open', axis: 'z', at: -4, center: -43, width: 1.6 },
  { id: 'C1-2', a: 'M6B', b: 'M6C', kind: 'open', axis: 'z', at: -5.6, center: -49.2, width: 1.6 },
  { id: 'C1-3', a: 'M6C', b: 'M6D', kind: 'open', axis: 'z', at: -14, center: -49.2, width: 1.6 },
  { id: 'C1-4', a: 'M6D', b: 'M6E', kind: 'open', axis: 'z', at: -15.6, center: -44.8, width: 1.6 },
  { id: 'barred', a: 'M6E', b: 'M7', kind: 'door', axis: 'z', at: -22, center: -44.8, width: 1.2, door: d('open', { vision: 'none', swingInto: 'M7' }), rule: 'Barred door: slammed and barred by the player (bar placeholder)' },
  { id: 'C5-in', a: 'M7', b: 'M8', kind: 'open', axis: 'z', at: -28, center: -44.8, width: 1.2, note: 'Low duct: forced crouch for 3 m' },
  { id: 'C5-out', a: 'M8', b: 'M8C', kind: 'open', axis: 'z', at: -31, center: -44.8, width: 1.2 },
  { id: 'M9', a: 'M8C', b: 'NL', kind: 'door', axis: 'x', at: -33, center: -32.8, width: 1.2, door: d('closed', { vision: 'none', swingInto: 'NL' }), rule: 'M9: shouldered open (tap or at a run)' },
  { id: 'NT', a: 'NL', b: 'NB', kind: 'door', axis: 'z', at: -16, center: -31.2, width: 2.0, door: d('closed', { double: true, vision: 'wide', swingInto: 'NB' }), rule: "NT doors (NOT IN USE): push, swing shut; Shaw won't open them" },

  // North Wing.
  { id: 'NB-NB1', a: 'NB', b: 'NB1', kind: 'open', axis: 'x', at: -30, center: 0, width: 2.4 },
  { id: 'NB-NB3', a: 'NB', b: 'NB3', kind: 'open', axis: 'x', at: -32.4, center: -8, width: 4.0 },
  { id: 'C2-west', a: 'NB3', b: 'C2W', kind: 'door', axis: 'z', at: -12, center: -37, width: 2.4, door: d('locked', { double: true, prompt: 'Chapter 2', vision: 'wide' }), rule: 'Chapter 2 continuation (locked in Chapter 1)' },
  { id: 'C2-east', a: 'NB', b: 'C2E', kind: 'door', axis: 'z', at: 1.2, center: -31.2, width: 1.6, door: d('locked', { prompt: 'Chapter 2', vision: 'wide' }), rule: 'Chapter 2 continuation (locked in Chapter 1)' },
];

// -----------------------------------------------------------------------------------------------
// Features: furniture blocks, hiding, temporary progression controls, markers
// -----------------------------------------------------------------------------------------------

export type MarkerCategory = 'story' | 'placeholder' | 'approach' | 'encounter' | 'mirror' | 'guidance';

export type FeatureDef =
  /** Patient bed (yaw 0: long axis along z). Under-bed hiding when `hide`. */
  | { readonly kind: 'bed'; readonly id: string; readonly space: string; readonly x: number; readonly z: number; readonly yaw?: number; readonly hide?: boolean }
  /** Bench or similar low furniture with an under-hiding spot (bed-type hiding). */
  | { readonly kind: 'bench'; readonly id: string; readonly space: string; readonly x: number; readonly z: number; readonly yaw?: number }
  /** Full-height locker; front faces local +z (rotated by yaw). Hiding when `hide` (default true). */
  | { readonly kind: 'locker'; readonly id: string; readonly space: string; readonly x: number; readonly z: number; readonly yaw: number; readonly hide?: boolean }
  /** Solid obstacle block (rack, cage, pump housing, desk, trolley, dust-sheeted bed). */
  | { readonly kind: 'block'; readonly id: string; readonly space: string; readonly x: number; readonly z: number; readonly w: number; readonly d: number; readonly h: number; readonly label?: string; readonly cover?: boolean }
  /** Temporary progression control (developer placeholder interaction). */
  | { readonly kind: 'control'; readonly id: string; readonly space: string; readonly x: number; readonly z: number; readonly label: string; readonly sets: string; readonly requires?: string; readonly requiresText?: string; readonly futureSeconds?: number; readonly futureNote?: string }
  /** Non-colliding labelled marker post. */
  | { readonly kind: 'marker'; readonly id: string; readonly space: string; readonly x: number; readonly z: number; readonly label: string; readonly category: MarkerCategory };

export const FEATURES: readonly FeatureDef[] = [
  // Room 104 (start).
  { kind: 'bed', id: 'r104-bed', space: 'R104', x: -36.6, z: 4.4, hide: true },
  { kind: 'marker', id: 'r104-chair', space: 'R104', x: -35.2, z: 5.8, label: "Mum's chair (empty) · glasses · crossword", category: 'story' },
  { kind: 'marker', id: 'r104-window', space: 'R104', x: -37.6, z: 2.4, label: 'Storm window (frozen storm, 15–16 Oct 1987)', category: 'story' },
  // West ward.
  { kind: 'bed', id: 'w2-bed', space: 'W2', x: -30.6, z: 4.4 },
  { kind: 'control', id: 'w2-call', space: 'W2', x: -31.6, z: 6.4, label: 'Call button (teaches approach B)', sets: 'call-taught', futureSeconds: 2, futureNote: 'Press; corridor call lamp lights' },
  { kind: 'bed', id: 'w3-bed-a', space: 'W3', x: -25.6, z: 4.6, hide: true },
  { kind: 'bed', id: 'w3-bed-b', space: 'W3', x: -23.0, z: 4.6, hide: true },
  { kind: 'bed', id: 'w3-bed-c', space: 'W3', x: -20.4, z: 4.6, hide: true },
  { kind: 'bed', id: 'w3-bed-d', space: 'W3', x: -18.0, z: 4.6, hide: true },
  { kind: 'locker', id: 'w8-locker', space: 'W8', x: -11.8, z: 3.4, yaw: Math.PI },
  { kind: 'block', id: 'w5-couch', space: 'W5', x: -36.5, z: -4.6, w: 0.8, d: 2.0, h: 0.75, label: 'Exam couch' },
  { kind: 'block', id: 'w6-xray', space: 'W6', x: -28, z: -5.2, w: 1.0, d: 2.2, h: 0.8, label: 'X-ray table' },
  { kind: 'block', id: 'w7-counter', space: 'W7', x: -18, z: -3.9, w: 4.0, d: 0.6, h: 1.05, label: "Sister's counter", cover: true },
  { kind: 'marker', id: 'w7-roundsheet', space: 'W7', x: -16.0, z: -4.4, label: 'Round sheet: 104 is the only name left', category: 'story' },
  { kind: 'marker', id: 'e1-start', space: 'WC', x: -37.0, z: 0, label: 'E1 Lights Out: beam starts (west-most doorway)', category: 'encounter' },
  { kind: 'marker', id: 'e1-trigger', space: 'WC', x: -15.0, z: 0.6, label: 'E1 trigger: past W7 heading east (placeholder)', category: 'encounter' },
  { kind: 'marker', id: 'e1-end', space: 'WC', x: -6.6, z: -0.8, label: 'E1 ends: beam fades at the lobby threshold', category: 'encounter' },

  // Lobby.
  { kind: 'control', id: 'payphone', space: 'LOBBY', x: -5.4, z: 3.6, label: 'Payphone (answer)', sets: 'payphone', futureSeconds: 45, futureNote: "Ruth's call, then Shaw (S04)" },
  { kind: 'marker', id: 'lobby-lifts', space: 'LOBBY', x: -5.4, z: -4.4, label: 'Lifts / stairwell: never open (signage only)', category: 'guidance' },
  { kind: 'marker', id: 'lobby-sign-south', space: 'LOBBY', x: 1.8, z: 4.4, label: 'Sign: STORES · PORTERS ↓', category: 'guidance' },
  { kind: 'marker', id: 'lobby-sign-east', space: 'LOBBY', x: 5.4, z: 2.2, label: 'F1 fire doors: push-bar from the east only', category: 'guidance' },
  { kind: 'block', id: 'lobby-desk', space: 'LOBBY', x: 3.6, z: -3.2, w: 2.4, d: 0.8, h: 1.05, label: 'Reception counter' },
  // Office.
  { kind: 'block', id: 'office-desk', space: 'OFFICE', x: -1.6, z: -7.6, w: 1.6, d: 0.8, h: 0.76, label: "Shaw's desk" },
  { kind: 'control', id: 'office-notice', space: 'OFFICE', x: 2.4, z: -6.4, label: 'Transfer notice ("via Porters — Stores")', sets: 'route-stores', futureSeconds: 20, futureNote: 'Read the notice; Standing Orders' },
  { kind: 'marker', id: 'office-barricade-view', space: 'OFFICE', x: 0.0, z: -9.3, label: 'North door: look through the glass (wheelchair beat)', category: 'story' },

  // South.
  { kind: 'locker', id: 's1-locker-a', space: 'S1', x: -6.5, z: 8.0, yaw: Math.PI / 2 },
  { kind: 'locker', id: 's1-locker-b', space: 'S1', x: -6.5, z: 9.0, yaw: Math.PI / 2, hide: false },
  { kind: 'block', id: 's2-tv', space: 'S2', x: 7.4, z: 10, w: 0.6, d: 1.0, h: 1.2, label: 'TV on a stand (frozen storm warning)' },
  { kind: 'block', id: 's3-bars', space: 'S3', x: -5, z: 15.5, w: 4.0, d: 0.7, h: 1.0, label: 'Parallel bars' },
  { kind: 'marker', id: 's5-knockcode', space: 'S5', x: 5.4, z: 16, label: 'Crawlway panel: knock code chalked', category: 'story' },
  { kind: 'marker', id: 's6-coat', space: 'S6', x: 4, z: 23.2, label: 'Your coat · visitors’ book 22:40', category: 'story' },
  { kind: 'marker', id: 'sc-sign', space: 'SC', x: 0.6, z: 28.4, label: 'Sign: STORES →', category: 'guidance' },
  // Stores (E2 arena).
  { kind: 'block', id: 'st1-rack', space: 'ST1', x: 14, z: 31, w: 3.0, d: 2.8, h: 2.2, label: 'Central rack (aisle loop)', cover: true },
  { kind: 'block', id: 'st1-cage-n', space: 'ST1', x: 10.2, z: 26.0, w: 1.6, d: 0.9, h: 1.8, label: 'Linen cage', cover: true },
  { kind: 'block', id: 'st1-cage-s', space: 'ST1', x: 17.6, z: 36.0, w: 1.6, d: 0.9, h: 1.8, label: 'Linen cage', cover: true },
  { kind: 'bench', id: 'st1-bench', space: 'ST1', x: 11.4, z: 35.8, yaw: Math.PI / 2 },
  { kind: 'marker', id: 'st1-trolley-bay', space: 'ST1', x: 9.0, z: 33.6, label: "E2: Shaw's trolley parks at the store door", category: 'encounter' },
  { kind: 'marker', id: 'st1-radio', space: 'ST1', x: 18.8, z: 26.0, label: 'Radio (lure placeholder)', category: 'placeholder' },
  { kind: 'control', id: 'porters-docket', space: 'ST2', x: 23.0, z: 27.6, label: 'Docket + sign-out sheet (Plant 2 — Sr Shaw)', sets: 'route-plant2', futureSeconds: 30, futureNote: 'Read the docket and sign-out sheet' },
  { kind: 'marker', id: 'st2-phone', space: 'ST2', x: 21.2, z: 28.2, label: 'E2 trigger: telephone rings on first entry (placeholder)', category: 'encounter' },
  { kind: 'block', id: 'st2-desk', space: 'ST2', x: 22.0, z: 27.8, w: 1.6, d: 0.8, h: 0.76, label: "Porters' desk" },
  { kind: 'locker', id: 'st2-locker', space: 'ST2', x: 25.4, z: 34.2, yaw: -Math.PI / 2 },
  { kind: 'block', id: 'st2-cage', space: 'ST2', x: 21.0, z: 34.2, w: 1.2, d: 0.8, h: 1.8, label: 'Linen cage (dark gap behind)', cover: true },
  { kind: 'marker', id: 'e2-shaw', space: 'ST1', x: 8.8, z: 30.4, label: "E2: Shaw's entrance (from the south corridor)", category: 'encounter' },
  { kind: 'marker', id: 'e2-stores-locked', space: 'SC', x: 7.4, z: 31.2, label: 'Stores locked by Shaw if player inside (placeholder)', category: 'placeholder' },

  // Crawlway.
  { kind: 'marker', id: 'cw-v1', space: 'V1W', x: 27.5, z: 31.0, label: 'V1 split · knock code', category: 'guidance' },
  { kind: 'marker', id: 'cw-steam', space: 'V1B', x: 30.0, z: 38.5, label: 'Steam burst every 6 s (placeholder)', category: 'placeholder' },
  { kind: 'marker', id: 'cw-grilles', space: 'V1A', x: 30.0, z: 28.5, label: 'Ceiling grilles over the south corridor (vertical layering deferred)', category: 'placeholder' },
  { kind: 'marker', id: 'cw-grate', space: 'V3C', x: 32.5, z: 24.6, label: 'V3 grate: Shaw stops beneath (placeholder)', category: 'encounter' },
  { kind: 'marker', id: 'cw-v4', space: 'V4', x: 32.5, z: 21.0, label: 'V4: the knocker (torch, Okafor badge, "7")', category: 'story' },

  // East corridor.
  { kind: 'control', id: 'f1-pushbar', space: 'EC', x: 6.6, z: -1.1, label: 'F1 push-bar (opens the lobby shortcut)', sets: 'f1-open', futureSeconds: 1.5 },

  // Loop (E4).
  { kind: 'bed', id: 'lpw1-bed', space: 'LPW1', x: 12.6, z: -11.8, hide: true },
  { kind: 'bed', id: 'lpw2-bed', space: 'LPW2', x: 12.6, z: -5, hide: true },
  { kind: 'bed', id: 'lpw3-bed', space: 'LPW3', x: 12.6, z: 5, hide: true },
  { kind: 'bed', id: 'lpw4-bed', space: 'LPW4', x: 12.6, z: 11.8, hide: true },
  { kind: 'bed', id: 'lpe1-bed', space: 'LPE1', x: 31.4, z: -11.8, hide: true },
  { kind: 'bed', id: 'lpe2-bed', space: 'LPE2', x: 31.4, z: -5, hide: true },
  { kind: 'bed', id: 'lpe3-bed', space: 'LPE3', x: 31.4, z: 5, hide: true },
  { kind: 'bed', id: 'lpe4-bed', space: 'LPE4', x: 31.4, z: 11.8, hide: true },
  { kind: 'block', id: 'loff-desk', space: 'LOFF', x: 22, z: 0, w: 2.4, d: 1.0, h: 0.76, label: 'Bed-state board desk', cover: true },
  { kind: 'control', id: 'key-theft', space: 'LOFF', x: 23.6, z: -2.3, label: "[DEV PLACEHOLDER] Take Shaw's keys (stands in for approaches A/B/C)", sets: 'shaw-keys', futureSeconds: 285, futureNote: 'E4 expected 4:45 (observe, choose an approach, take the keys)' },
  { kind: 'marker', id: 'approach-c-hook', space: 'LOFF', x: 24.4, z: -2.6, label: 'Approach C: office key hook (reserved)', category: 'approach' },
  { kind: 'marker', id: 'approach-c-wait', space: 'LTR', x: 19.7, z: 3.8, label: 'Approach C: waiting position (treatment room door)', category: 'approach' },
  { kind: 'marker', id: 'approach-b-call-w', space: 'LPW1', x: 11.6, z: -9.2, label: 'Approach B: call button (far side, west)', category: 'approach' },
  { kind: 'marker', id: 'approach-b-call-e', space: 'LPE4', x: 32.4, z: 14.2, label: 'Approach B: call button (far side, east)', category: 'approach' },
  { kind: 'marker', id: 'approach-a-stop-w', space: 'LWC', x: 16.6, z: -11.8, label: 'Approach A: trolley stop (patient room)', category: 'approach' },
  { kind: 'marker', id: 'approach-a-stop-e', space: 'LEC', x: 27.4, z: 5, label: 'Approach A: trolley stop (patient room)', category: 'approach' },
  { kind: 'marker', id: 'mirror-nw', space: 'LWC', x: 15.3, z: -14.7, label: 'Convex mirror (NW)', category: 'mirror' },
  { kind: 'marker', id: 'mirror-ne', space: 'LEC', x: 28.7, z: -14.7, label: 'Convex mirror (NE)', category: 'mirror' },
  { kind: 'marker', id: 'mirror-sw', space: 'LWC', x: 15.3, z: 14.7, label: 'Convex mirror (SW)', category: 'mirror' },
  { kind: 'marker', id: 'mirror-se', space: 'LEC', x: 28.7, z: 14.7, label: 'Convex mirror (SE)', category: 'mirror' },
  { kind: 'marker', id: 'loop-iso', space: 'LISO', x: 18, z: 17.4, label: 'ISOLATION: Shaw skips it (safe room)', category: 'encounter' },
  { kind: 'bed', id: 'liso-bed', space: 'LISO', x: 16.4, z: 17, yaw: Math.PI / 2, hide: true },
  { kind: 'locker', id: 'llu-locker', space: 'LCU', x: 21.4, z: -12.0, yaw: -Math.PI / 2 },

  // Branches.
  { kind: 'bed', id: 'es3-bed', space: 'ES3', x: 34.6, z: 13, hide: true },
  { kind: 'marker', id: 'es3-figure', space: 'ES3', x: 35.8, z: 11, label: 'A figure faces the wall', category: 'story' },
  { kind: 'marker', id: 'es2-exit', space: 'ES2', x: 36.2, z: 23, label: 'CP4 · crawlway exit grille', category: 'guidance' },
  { kind: 'marker', id: 'plant2-plate', space: 'NBR', x: 37.6, z: -24.8, label: 'Plant 2: engraved plate matches the empty hook', category: 'story' },
  { kind: 'marker', id: 'en1-pager', space: 'EN1', x: 34.2, z: -5.5, label: 'On-call: the pager shows 317', category: 'story' },
  { kind: 'marker', id: 'en2-slide', space: 'EN2', x: 34.2, z: -12.5, label: 'Seminar: "North Wing — Commissioning Schedule"', category: 'story' },

  // Maintenance (E5).
  { kind: 'block', id: 'm0-boiler', space: 'M0', x: 35.6, z: -30, w: 2.4, d: 3.2, h: 2.6, label: 'Boiler' },
  { kind: 'marker', id: 'm0-log', space: 'M0', x: 41.2, z: -27.2, label: 'Boiler log stops at 03:17', category: 'story' },
  { kind: 'marker', id: 'm2-crouch', space: 'M1B', x: 30.0, z: -43.2, label: 'CROUCH: 1.4 m cable tunnel ahead', category: 'guidance' },
  { kind: 'block', id: 'm3-pump', space: 'M3', x: 19, z: -43, w: 2.2, d: 2.0, h: 1.4, label: 'Pump housing (line-of-sight cover)', cover: true },
  { kind: 'locker', id: 'm3-alcove', space: 'M3', x: 22.4, z: -46.4, yaw: 0 },
  { kind: 'control', id: 'valve', space: 'M3', x: 16.0, z: -39.6, label: 'Valve (silver-and-red banded pipe)', sets: 'valve-open', futureSeconds: 45, futureNote: 'Follow the banded pipe to its valve' },
  { kind: 'marker', id: 'm3-shaw', space: 'M3', x: 22.0, z: -40.0, label: 'E5 phase 5: Shaw searches the pump chamber (~20 s)', category: 'encounter' },
  { kind: 'marker', id: 'm4-lamps', space: 'M4', x: 10, z: -42.4, label: 'Seven call lamps (go out as you pass)', category: 'story' },
  { kind: 'marker', id: 'm4-evidence', space: 'M4', x: 7.0, z: -43.6, label: 'Transfer trolley · slipper · incident slip', category: 'story' },
  { kind: 'control', id: 'bulkhead-crank', space: 'M5', x: 3.0, z: -42.0, label: 'Bulkhead crank (hold ~4 s in production)', sets: 'bulkhead-cranked', futureSeconds: 4, futureNote: 'Hold to crank; bell; chase starts' },

  // Chase (E6).
  { kind: 'marker', id: 'c1', space: 'M6B', x: -4.8, z: -46.0, label: 'C1: pipe run, 4 turns (Shaw enters behind at ~12 m)', category: 'encounter' },
  { kind: 'marker', id: 'c2-bar', space: 'M7', x: -23.0, z: -44.4, label: 'C2: drop the bar (placeholder)', category: 'placeholder' },
  { kind: 'marker', id: 'c5', space: 'M7', x: -27.0, z: -45.2, label: 'C5: CROUCH, low duct 3 m', category: 'guidance' },
  { kind: 'marker', id: 'c6', space: 'M8C', x: -32.8, z: -40, label: 'C6: service stair omitted (single-level greybox)', category: 'placeholder' },
  { kind: 'block', id: 'nl-bed-1', space: 'NL', x: -30, z: -32.45, w: 2.0, d: 0.9, h: 0.9, label: 'Dust-sheeted bed' },
  { kind: 'block', id: 'nl-bed-2', space: 'NL', x: -24, z: -32.45, w: 2.0, d: 0.9, h: 0.9, label: 'Dust-sheeted bed' },
  { kind: 'block', id: 'nl-trolley', space: 'NL', x: -20, z: -32.6, w: 1.2, d: 0.6, h: 1.4, label: 'C8: linen trolley (pull-down placeholder)' },
  { kind: 'marker', id: 'c9', space: 'NL', x: -16.8, z: -32.6, label: 'C9: Shaw stops at the glass (NOT IN USE)', category: 'encounter' },

  // North Wing.
  { kind: 'block', id: 'nb1-barricade-a', space: 'NB1', x: -0.5, z: -10.7, w: 0.6, d: 0.6, h: 0.9, label: 'Barricade (chairs)' },
  { kind: 'block', id: 'nb1-barricade-b', space: 'NB1', x: 0.4, z: -10.9, w: 0.7, d: 0.6, h: 1.2, label: 'Barricade (cabinet)' },
  { kind: 'control', id: 'barricade', space: 'NB1', x: 0, z: -12.2, label: 'Examine the barricade (chapter end, step 15)', sets: 'chapter-end', futureSeconds: 90, futureNote: 'S15: barricade, glass, PA, Ruth’s knitting' },
  { kind: 'marker', id: 'nb3-knitting', space: 'NB3', x: -8, z: -38, label: "Ruth's red knitting · 3:18 clock", category: 'story' },
  { kind: 'marker', id: 'c2-sign', space: 'NB3', x: -11.4, z: -34.4, label: 'Chapter 2 continues (locked)', category: 'guidance' },
];

// -----------------------------------------------------------------------------------------------
// Checkpoints, encounters, walkthrough
// -----------------------------------------------------------------------------------------------

export interface CheckpointDef {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly z: number;
  /** Contract yaw: 0 looks -z (north), positive turns left. */
  readonly yaw: number;
  /** Flags considered set when restoring here (developer teleport only). */
  readonly flags: readonly string[];
}

const EAST = -Math.PI / 2;
const WEST = Math.PI / 2;
const NORTH = 0;

export const CHECKPOINTS: readonly CheckpointDef[] = [
  { id: 'CP0', label: 'Start (Room 104)', x: -35.4, z: 4.4, yaw: NORTH, flags: [] },
  { id: 'CP1', label: 'After E1 (lobby threshold)', x: -7.6, z: 0, yaw: EAST, flags: [] },
  { id: 'CP2', label: 'Stores entrance', x: 6.2, z: 31.2, yaw: EAST, flags: ['route-stores'] },
  { id: 'CP3', label: 'Crawlway entrance', x: 24.8, z: 32, yaw: EAST, flags: ['route-stores', 'route-plant2'] },
  { id: 'CP4', label: 'ES2 exit', x: 37.2, z: 24.2, yaw: NORTH, flags: ['route-stores', 'route-plant2'] },
  { id: 'CP5', label: 'Loop entry', x: 31, z: 0, yaw: WEST, flags: ['route-stores', 'route-plant2'] },
  { id: 'CP6', label: 'Plant 2 interior', x: 38.2, z: -28, yaw: NORTH, flags: ['route-stores', 'route-plant2', 'shaw-keys'] },
  { id: 'CP7', label: 'Bulkhead', x: 4.2, z: -43, yaw: WEST, flags: ['route-stores', 'route-plant2', 'shaw-keys', 'valve-open'] },
  { id: 'CP8', label: 'Through the NT doors', x: -13.6, z: -31.2, yaw: EAST, flags: ['route-stores', 'route-plant2', 'shaw-keys', 'valve-open', 'bulkhead-cranked'] },
];

export interface EncounterDef {
  readonly id: string;
  readonly label: string;
  readonly rect: Rect;
  readonly spaces: readonly string[];
  readonly note: string;
}

export const ENCOUNTERS: readonly EncounterDef[] = [
  { id: 'E1', label: 'E1 Lights Out', rect: [-38, -6, -7, 7], spaces: ['WC', 'R104', 'W2', 'W3', 'W4', 'W5', 'W6', 'W6D', 'W7', 'W8', 'W9'], note: 'Beam route east along the west corridor; hide under Bay beds or in the W8 locker; stay ahead to the lobby' },
  { id: 'E2', label: 'E2 Stores', rect: [8, 26, 25, 37], spaces: ['ST1', 'ST2', 'CE'], note: 'Shaw enters from the south corridor; aisle loop around the rack; locker, bench, cage cover; hatch exit' },
  { id: 'E3', label: 'E3 Crawlway', rect: [26, 35, 20, 39], spaces: ['CE', 'V1W', 'V1A', 'V1B', 'V2E', 'V3C', 'V3S', 'V3W', 'V3N', 'V4', 'CX'], note: 'Two splits that rejoin; crouched only; Shaw cannot enter' },
  { id: 'E4', label: 'E4 Final Round', rect: [11, 33, -19, 19], spaces: ['LWC', 'LEC', 'LNC', 'LSC', 'LOFF', 'LTR', 'LPW1', 'LPW2', 'LPW3', 'LPW4', 'LPE1', 'LPE2', 'LPE3', 'LPE4', 'LISO'], note: 'Ring corridor with two routes; office windows on both long sides; mirrors at the corners' },
  { id: 'E5', label: 'E5 Maintenance', rect: [2, 43, -47, -26], spaces: ['M0', 'M1A', 'M1B', 'M2', 'M3', 'M4', 'M5'], note: 'Plant 2 → constriction → pump chamber (hiding) → link → bulkhead' },
  { id: 'E6', label: 'E6 Chase', rect: [-36, 2, -50, -30], spaces: ['M6A', 'M6B', 'M6C', 'M6D', 'M6E', 'M7', 'M8', 'M8C', 'NL'], note: 'Single line from the bulkhead to the NT doors; Shaw always behind' },
];

export interface WalkStep {
  readonly step: number;
  readonly scene: string;
  readonly label: string;
  /** Where the step is complete (the autopilot walks here). */
  readonly x: number;
  readonly z: number;
  /** Control to use on arrival. */
  readonly control?: string;
  /** Doors the player opens on the way (aimed at and opened with E). */
  readonly doors?: readonly string[];
}

export const WALKTHROUGH: readonly WalkStep[] = [
  { step: 1, scene: 'S01', label: 'Wake in Room 104', x: -35.4, z: 4.4 },
  { step: 2, scene: 'S02', label: 'Leave Room 104', x: -33.2, z: 0 },
  { step: 3, scene: 'S03', label: 'West ward; survive E1 (placeholder markers) to the lobby', x: -7.6, z: 0 },
  { step: 4, scene: 'S04', label: 'Answer the payphone (optional, encouraged)', x: -4.6, z: 3.2, control: 'payphone' },
  { step: 5, scene: 'S05', label: "Nurse's Office: try the north door; read the transfer notice", x: 1.8, z: -6.6, control: 'office-notice', doors: ['office-lobby'] },
  { step: 6, scene: 'S06', label: 'South corridor to the stores', x: 4.6, z: 31.2 },
  { step: 7, scene: 'S07', label: "Porters' room: docket and sign-out sheet", x: 23.0, z: 28.8, control: 'porters-docket' },
  { step: 8, scene: 'S08', label: 'E2 Stores (placeholder): to the crawlway hatch', x: 24.8, z: 32 },
  { step: 9, scene: 'S09', label: 'E3 Crawlway (crouched) to the ES2 grille', x: 37.2, z: 24.2 },
  { step: 10, scene: 'S10', label: 'Branches: Plant 2 is locked', x: 38.2, z: -24.6 },
  { step: 11, scene: 'S11', label: "E4 Loop: take Shaw's keys (developer placeholder)", x: 23.6, z: -1.4, control: 'key-theft' },
  { step: 12, scene: 'S12', label: 'Plant 2 and the maintenance passage; the valve', x: 16.8, z: -40.4, control: 'valve', doors: ['plant2-door'] },
  { step: 13, scene: 'S13', label: 'The bulkhead (crank placeholder)', x: 3.6, z: -42.6, control: 'bulkhead-crank', doors: ['steam'] },
  { step: 14, scene: 'S14', label: 'E6 Chase route to the NT doors', x: -13.6, z: -31.2, doors: ['bulkhead', 'M9', 'NT'] },
  { step: 15, scene: 'S15', label: 'North Wing: the far side of the barricade', x: 0, z: -12.8, control: 'barricade' },
];

/** Player spawn (CP0). */
export const SPAWN = CHECKPOINTS[0]!;

export const spaceById = (id: string): SpaceDef => {
  const space = SPACES.find((s) => s.id === id);
  if (!space) throw new Error(`Unknown greybox space "${id}"`);
  return space;
};
