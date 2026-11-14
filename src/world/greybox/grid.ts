/**
 * Rasterises the greybox level onto a 0.1 m grid and derives every wall, lintel and sill from it.
 *
 * Pure data (no three.js): the world builder, the developer map and the tests all use the same
 * result, so the drawn map is the built geometry.
 */
import { CONNECTIONS, SPACES, type ConnectionDef, type SpaceDef } from './level';

export const GRID_RES = 0.1;
export const WALL_T = 0.15;
export const DOOR_TOP = 2.1;
export const WINDOW_BOTTOM = 1.0;
export const WINDOW_TOP = 2.0;

export type WallKind = 'wall' | 'lintel' | 'sill';

export interface WallSegment {
  /** Direction the wall runs: 'x' lies on a line z = at; 'z' lies on a line x = at. */
  readonly axis: 'x' | 'z';
  readonly at: number;
  readonly from: number;
  readonly to: number;
  readonly bottom: number;
  readonly top: number;
  readonly kind: WallKind;
  /** Space ids on the negative and positive sides (null: void). */
  readonly sides: readonly [string | null, string | null];
  readonly connection?: string;
}

export interface OpeningSpan {
  readonly connection: ConnectionDef;
  readonly bottom: number;
  readonly top: number;
  /** Highest ceiling on either side (the wall height at the opening). */
  readonly wallHeight: number;
}

export interface GreyboxLayout {
  readonly res: number;
  readonly x0: number;
  readonly z0: number;
  readonly nx: number;
  readonly nz: number;
  /** Space index per cell, -1 for void. Row-major: index = j * nx + i. */
  readonly cells: Int16Array;
  readonly spaces: readonly SpaceDef[];
  readonly walls: readonly WallSegment[];
  readonly openings: ReadonlyMap<string, OpeningSpan>;
  spaceAt(x: number, z: number): SpaceDef | null;
}

const snap = (value: number): number => Math.round(value / GRID_RES);

function openingProfile(connection: ConnectionDef, a: SpaceDef, b: SpaceDef): { bottom: number; top: number } {
  const lower = Math.min(a.ceiling, b.ceiling);
  switch (connection.kind) {
    case 'window': return { bottom: connection.bottom ?? WINDOW_BOTTOM, top: connection.top ?? WINDOW_TOP };
    case 'door': return { bottom: 0, top: Math.min(connection.top ?? DOOR_TOP, lower) };
    case 'hatch': return { bottom: connection.bottom ?? 0, top: Math.min(connection.top ?? 1.15, lower) };
    default: return { bottom: connection.bottom ?? 0, top: Math.min(connection.top ?? lower, lower) };
  }
}

export function buildLayout(spaces: readonly SpaceDef[] = SPACES, connections: readonly ConnectionDef[] = CONNECTIONS): GreyboxLayout {
  const ids = new Map<string, number>();
  spaces.forEach((space, index) => {
    if (ids.has(space.id)) throw new Error(`Duplicate space id "${space.id}"`);
    ids.set(space.id, index);
  });
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const space of spaces) {
    for (const [x0, x1, z0, z1] of space.rects) {
      for (const v of [x0, x1, z0, z1]) {
        if (Math.abs(v / GRID_RES - Math.round(v / GRID_RES)) > 1e-6) throw new Error(`${space.id}: ${v} is off the 0.1 m grid`);
      }
      if (!(x1 > x0 && z1 > z0)) throw new Error(`${space.id}: empty rectangle`);
      minX = Math.min(minX, x0); maxX = Math.max(maxX, x1); minZ = Math.min(minZ, z0); maxZ = Math.max(maxZ, z1);
    }
  }
  const pad = 1;
  const gx0 = snap(minX) - pad, gz0 = snap(minZ) - pad;
  const nx = snap(maxX) - gx0 + pad, nz = snap(maxZ) - gz0 + pad;
  const x0 = gx0 * GRID_RES, z0 = gz0 * GRID_RES;
  const cells = new Int16Array(nx * nz).fill(-1);
  spaces.forEach((space, index) => {
    for (const [rx0, rx1, rz0, rz1] of space.rects) {
      for (let j = snap(rz0) - gz0; j < snap(rz1) - gz0; j += 1) {
        for (let i = snap(rx0) - gx0; i < snap(rx1) - gx0; i += 1) {
          const k = j * nx + i;
          if (cells[k] !== -1 && cells[k] !== index) throw new Error(`Spaces "${spaces[cells[k]!]!.id}" and "${space.id}" overlap near (${(x0 + i * GRID_RES).toFixed(1)}, ${(z0 + j * GRID_RES).toFixed(1)})`);
          cells[k] = index;
        }
      }
    }
  });
  const cell = (i: number, j: number): number => (i < 0 || j < 0 || i >= nx || j >= nz ? -1 : cells[j * nx + i]!);
  const ceiling = (index: number): number => (index < 0 ? 0 : spaces[index]!.ceiling);
  const name = (index: number): string | null => (index < 0 ? null : spaces[index]!.id);

  // Openings: key `${axis}:${line}:${edge}` -> connection index.
  const openingEdges = new Map<string, number>();
  const openings = new Map<string, OpeningSpan>();
  connections.forEach((connection, index) => {
    const a = ids.get(connection.a), b = ids.get(connection.b);
    if (a === undefined || b === undefined) throw new Error(`Connection "${connection.id}" names an unknown space`);
    if (openings.has(connection.id)) throw new Error(`Duplicate connection id "${connection.id}"`);
    const line = connection.axis === 'z' ? snap(connection.at) - gx0 : snap(connection.at) - gz0;
    const origin = connection.axis === 'z' ? gz0 : gx0;
    const start = snap(connection.center - connection.width / 2) - origin;
    const end = snap(connection.center + connection.width / 2) - origin;
    if (end <= start) throw new Error(`Connection "${connection.id}" has no width`);
    for (let e = start; e < end; e += 1) {
      const neg = connection.axis === 'z' ? cell(line - 1, e) : cell(e, line - 1);
      const pos = connection.axis === 'z' ? cell(line, e) : cell(e, line);
      const ok = (neg === a && pos === b) || (neg === b && pos === a);
      if (!ok) throw new Error(`Connection "${connection.id}" is not on the ${connection.a}/${connection.b} boundary at edge ${e} (found ${name(neg)}/${name(pos)})`);
      const key = `${connection.axis}:${line}:${e}`;
      if (openingEdges.has(key)) throw new Error(`Connections "${connections[openingEdges.get(key)!]!.id}" and "${connection.id}" overlap`);
      openingEdges.set(key, index);
    }
    const profile = openingProfile(connection, spaces[a]!, spaces[b]!);
    openings.set(connection.id, { connection, ...profile, wallHeight: Math.max(ceiling(a), ceiling(b)) });
  });

  const walls: WallSegment[] = [];
  // One pass per direction. For axis 'z' walls, lines are x = const (i) and edges run along j.
  for (const axis of ['z', 'x'] as const) {
    const lines = axis === 'z' ? nx + 1 : nz + 1;
    const edges = axis === 'z' ? nz : nx;
    const lineOrigin = axis === 'z' ? x0 : z0;
    const edgeOrigin = axis === 'z' ? z0 : x0;
    for (let line = 0; line < lines; line += 1) {
      type Edge = { kind: 'none' } | { kind: 'wall'; h: number; neg: number; pos: number } | { kind: 'open'; c: number; neg: number; pos: number };
      const edgeAt = (e: number): Edge => {
        if (e < 0 || e >= edges) return { kind: 'none' };
        const neg = axis === 'z' ? cell(line - 1, e) : cell(e, line - 1);
        const pos = axis === 'z' ? cell(line, e) : cell(e, line);
        if (neg === pos) return { kind: 'none' };
        const c = openingEdges.get(`${axis}:${line}:${e}`);
        if (c !== undefined) return { kind: 'open', c, neg, pos };
        return { kind: 'wall', h: Math.max(ceiling(neg), ceiling(pos)), neg, pos };
      };
      const sameRun = (p: Edge, q: Edge): boolean => p.kind === q.kind && (p.kind === 'none'
        || (p.kind === 'wall' && q.kind === 'wall' && p.h === q.h && p.neg === q.neg && p.pos === q.pos)
        || (p.kind === 'open' && q.kind === 'open' && p.c === q.c));
      let e = 0;
      while (e < edges) {
        const first = edgeAt(e);
        let end = e + 1;
        while (end < edges && sameRun(first, edgeAt(end))) end += 1;
        if (first.kind !== 'none') {
          const at = lineOrigin + line * GRID_RES;
          let from = edgeOrigin + e * GRID_RES;
          let to = edgeOrigin + end * GRID_RES;
          const sides: [string | null, string | null] = [name(first.neg), name(first.pos)];
          if (first.kind === 'wall') {
            // Extend past corners by half a wall so L-corners close; never into an opening on this
            // line or on the perpendicular line through the endpoint (door hinges sit there).
            const perpendicularOpening = (point: number): boolean => {
              const other = axis === 'z' ? 'x' : 'z';
              return openingEdges.has(`${other}:${point}:${line - 1}`) || openingEdges.has(`${other}:${point}:${line}`);
            };
            if (edgeAt(e - 1).kind !== 'open' && !perpendicularOpening(e)) from -= WALL_T / 2;
            if (edgeAt(end).kind !== 'open' && !perpendicularOpening(end)) to += WALL_T / 2;
            walls.push({ axis, at, from, to, bottom: 0, top: first.h, kind: 'wall', sides });
          } else {
            const connection = connections[first.c]!;
            const span = openings.get(connection.id)!;
            if (span.wallHeight - span.top > 0.01) walls.push({ axis, at, from, to, bottom: span.top, top: span.wallHeight, kind: 'lintel', sides, connection: connection.id });
            if (span.bottom > 0.01) walls.push({ axis, at, from, to, bottom: 0, top: span.bottom, kind: 'sill', sides, connection: connection.id });
          }
        }
        e = end;
      }
    }
  }

  return {
    res: GRID_RES, x0, z0, nx, nz, cells, spaces, walls, openings,
    spaceAt(x, z) {
      const i = Math.floor((x - x0) / GRID_RES), j = Math.floor((z - z0) / GRID_RES);
      const index = cell(i, j);
      return index < 0 ? null : spaces[index]!;
    },
  };
}

/** Centre of a connection opening (floor level). */
export function connectionPoint(connection: ConnectionDef): { x: number; z: number } {
  return connection.axis === 'z' ? { x: connection.at, z: connection.center } : { x: connection.center, z: connection.at };
}

/** Points just inside each side of an opening (`offset` metres from the wall line). */
export function connectionSides(connection: ConnectionDef, offset = 0.6): { neg: { x: number; z: number }; pos: { x: number; z: number } } {
  const p = connectionPoint(connection);
  return connection.axis === 'z'
    ? { neg: { x: p.x - offset, z: p.z }, pos: { x: p.x + offset, z: p.z } }
    : { neg: { x: p.x, z: p.z - offset }, pos: { x: p.x, z: p.z + offset } };
}
