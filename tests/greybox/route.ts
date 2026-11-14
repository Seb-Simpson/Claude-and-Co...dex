/**
 * Builds the walkthrough route (steps 1–15) over the real greybox colliders: a wall-averse grid
 * search per leg, string-pulled with capsule sweeps, with doors crossed square through their centre
 * and crouch flags wherever the ceiling is below standing height. The browser autopilot walks it
 * with real input; nothing here moves the player.
 */
import type { DoorMarker } from '../../src/contracts';
import { doorIdsOf } from '../../src/world/greybox/build';
import { CONNECTIONS, FEATURES, WALKTHROUGH, type ConnectionDef } from '../../src/world/greybox/level';
import { CROUCHED, type Fixture } from './fixture';

export interface RoutePoint {
  readonly x: number;
  readonly z: number;
  /** Move crouched on the segment that ends at this point. */
  readonly crouch: boolean;
  /** Before continuing, open these door leaves (aim + E) from here. */
  readonly open?: readonly string[];
  readonly door?: string;
}

export interface RouteLeg {
  readonly step: number;
  readonly scene: string;
  readonly label: string;
  readonly points: readonly RoutePoint[];
  readonly control?: { readonly id: string; readonly interactableId: string; readonly x: number; readonly z: number; readonly sets: string };
  /** Straight-line route length of this leg (m). */
  readonly length: number;
}

const CELL = 0.2;
const STAND = 1.85;

function flagsBefore(stepIndex: number): Set<string> {
  const flags = new Set<string>();
  for (const step of WALKTHROUGH.slice(0, stepIndex)) {
    const control = FEATURES.find((f) => f.kind === 'control' && f.id === step.control);
    if (control?.kind === 'control') flags.add(control.sets);
  }
  return flags;
}

export function buildRoute(f: Fixture): RouteLeg[] {
  const { physics } = f;
  const layout = f.build.layout;
  const doorsById = new Map(f.build.world.doors.map((d) => [d.id, d]));
  // Open every unlocked door so leaves stand in their open pose (as the player will leave them).
  const opened: DoorMarker[] = [];
  for (const marker of f.build.world.doors) {
    if (marker.initialState === 'closed') { if (!f.setDoor(marker, true)) throw new Error(`cannot open ${marker.id}`); opened.push(marker); }
  }
  try {
    const b = f.build.world.bounds;
    const nx = Math.ceil((b.max.x - b.min.x) / CELL), nz = Math.ceil((b.max.z - b.min.z) / CELL);
    const valid = new Uint8Array(nx * nz);
    // Cell centres sit 0.05 m off the 0.1 m layout grid so no centre lies exactly on a wall line.
    const wx = (i: number) => b.min.x + (i + 0.5) * CELL + 0.05, wz = (j: number) => b.min.z + (j + 0.5) * CELL + 0.05;
    for (let j = 0; j < nz; j += 1) for (let i = 0; i < nx; i += 1) {
      const x = wx(i), z = wz(j);
      if (!layout.spaceAt(x, z)) continue;
      const ground = physics.findGround({ x, y: 0.3, z }, 0.6);
      if (ground && Math.abs(ground.y) < 0.05 && physics.isPositionFree({ x, y: 0, z }, CROUCHED.radius, CROUCHED.height, [], false)) valid[j * nx + i] = 1;
    }
    // Distance (in cells, capped) to the nearest invalid cell: paths prefer corridor centres.
    const clearance = new Uint8Array(nx * nz);
    for (let k = 0; k < valid.length; k += 1) {
      if (!valid[k]) continue;
      const i = k % nx, j = (k - i) / nx;
      let d = 4;
      for (let r = 1; r <= 3 && d === 4; r += 1) {
        for (let dj = -r; dj <= r && d === 4; dj += 1) for (let di = -r; di <= r; di += 1) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= nz || !valid[jj * nx + ii]) { d = r; break; }
        }
      }
      clearance[k] = d;
    }
    const cellOf = (x: number, z: number) => Math.floor((z - b.min.z - 0.05) / CELL) * nx + Math.floor((x - b.min.x - 0.05) / CELL);

    function search(from: { x: number; z: number }, to: { x: number; z: number }, blocked: (k: number) => boolean): { x: number; z: number }[] {
      const start = cellOf(from.x, from.z), goal = cellOf(to.x, to.z);
      const cost = new Float64Array(nx * nz).fill(Infinity);
      const prev = new Int32Array(nx * nz).fill(-1);
      const heap: [number, number][] = [[0, start]];
      const push = (e: [number, number]) => {
        heap.push(e);
        let n = heap.length - 1;
        while (n > 0) { const p = (n - 1) >> 1; if (heap[p]![0] <= e[0]) break; heap[n] = heap[p]!; n = p; }
        heap[n] = e;
      };
      const pop = (): [number, number] => {
        const top = heap[0]!, last = heap.pop()!;
        if (heap.length) {
          let n = 0;
          for (;;) {
            let c = n * 2 + 1;
            if (c >= heap.length) break;
            if (c + 1 < heap.length && heap[c + 1]![0] < heap[c]![0]) c += 1;
            if (heap[c]![0] >= last[0]) break;
            heap[n] = heap[c]!; n = c;
          }
          heap[n] = last;
        }
        return top;
      };
      cost[start] = 0;
      while (heap.length) {
        const [c, k] = pop();
        if (c > cost[k]!) continue;
        if (k === goal) break;
        const i = k % nx, j = (k - i) / nx;
        for (const [di, dj, w] of [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]] as const) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
          const n = jj * nx + ii;
          if (!valid[n] || blocked(n)) continue;
          if (di && dj && (!valid[j * nx + ii] || !valid[jj * nx + i])) continue;
          const nc = c + w * (1 + (4 - clearance[n]!) * 0.9);
          if (nc < cost[n]!) { cost[n] = nc; prev[n] = k; push([nc, n]); }
        }
      }
      if (prev[goal] === -1 && goal !== start) throw new Error(`no route ${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
      const cells: number[] = [];
      for (let k = goal; k !== -1; k = prev[k]!) cells.push(k);
      cells.reverse();
      return cells.map((k) => ({ x: wx(k % nx), z: wz((k - (k % nx)) / nx) }));
    }

    const free = (p: { x: number; z: number }, q: { x: number; z: number }) =>
      physics.isSegmentFree({ x: p.x, y: 0, z: p.z }, { x: q.x, y: 0, z: q.z }, CROUCHED.radius + 0.04, CROUCHED.height, [], false);
    function pull(points: { x: number; z: number }[]): { x: number; z: number }[] {
      const out = [points[0]!];
      let anchor = 0;
      while (anchor < points.length - 1) {
        let far = anchor + 1;
        for (let t = points.length - 1; t > anchor + 1; t -= 1) if (free(points[anchor]!, points[t]!)) { far = t; break; }
        out.push(points[far]!);
        anchor = far;
      }
      return out;
    }
    const lowAt = (x: number, z: number) => (layout.spaceAt(x, z)?.ceiling ?? 9) < STAND;
    function crouchSegment(p: { x: number; z: number }, q: { x: number; z: number }): boolean {
      const len = Math.hypot(q.x - p.x, q.z - p.z) || 1;
      const ux = (q.x - p.x) / len, uz = (q.z - p.z) / len;
      for (let s = -1.0; s <= len + 1.0; s += 0.1) if (lowAt(p.x + ux * s, p.z + uz * s)) return true;
      return false;
    }
    const crossed = (connection: ConnectionDef, p: { x: number; z: number }, q: { x: number; z: number }): boolean => {
      const [pa, qa, pl, ql] = connection.axis === 'z' ? [p.x, q.x, p.z, q.z] : [p.z, q.z, p.x, q.x];
      if ((pa - connection.at) * (qa - connection.at) >= 0) return false;
      const t = (connection.at - pa) / (qa - pa);
      const along = pl + (ql - pl) * t;
      return Math.abs(along - connection.center) <= connection.width / 2 + 0.05;
    };

    const legs: RouteLeg[] = [];
    let here = { x: WALKTHROUGH[0]!.x, z: WALKTHROUGH[0]!.z };
    WALKTHROUGH.forEach((step, index) => {
      const flags = flagsBefore(index);
      const gated = CONNECTIONS.filter((c) => c.kind === 'door' && c.door && (c.door.initial === 'locked' || (c.door.requires && !flags.has(c.door.requires))));
      const blockedCells = new Set<number>();
      for (const c of gated) {
        for (let s = -c.width / 2; s <= c.width / 2; s += CELL / 2) for (let a = -0.5; a <= 0.5; a += CELL / 2) {
          blockedCells.add(c.axis === 'z' ? cellOf(c.at + a, c.center + s) : cellOf(c.center + s, c.at + a));
        }
      }
      const target = { x: step.x, z: step.z };
      const raw = index === 0 ? [here, target] : search(here, target, (k) => blockedCells.has(k));
      // Doors and hatches are passed square through their centre: approach point, then exit point.
      const doors = CONNECTIONS.filter((c) => c.kind === 'door' || c.kind === 'hatch');
      const anchors: { x: number; z: number; open?: readonly string[]; door?: string; through?: boolean }[] = [{ ...raw[0]! }];
      for (let n = 1; n < raw.length; n += 1) {
        const p = raw[n - 1]!, q = raw[n]!;
        const c = doors.find((d) => crossed(d, p, q));
        if (!c) continue;
        const side = Math.sign((c.axis === 'z' ? q.x : q.z) - c.at);
        const leafIds = doorIdsOf(c.id);
        const leaf = leafIds.length ? doorsById.get(leafIds[0]!) : undefined;
        const approachDist = c.kind === 'hatch' ? 0.55 : Math.max(1.3, (leafIds.length > 1 ? c.width / 2 : c.width) + 0.45);
        const exitDist = c.kind === 'hatch' ? 0.55 : 0.9;
        const pt = (dd: number) => (c.axis === 'z' ? { x: c.at + dd, z: c.center } : { x: c.center, z: c.at + dd });
        const needsOpening = Boolean(leaf) && leaf!.initialState !== 'open';
        anchors.push({ ...pt(-side * approachDist), door: c.id, ...(needsOpening ? { open: leafIds } : {}) });
        anchors.push({ ...pt(side * exitDist), through: true });
      }
      anchors.push({ ...target });
      const points: RoutePoint[] = [];
      let last = raw[0]!;
      for (let a = 1; a < anchors.length; a += 1) {
        const anchor = anchors[a]!;
        const goal = { x: anchor.x, z: anchor.z };
        const pulled = anchor.through ? [last, goal] : pull(search(last, goal, (k) => blockedCells.has(k)));
        pulled[0] = last;
        pulled[pulled.length - 1] = goal;
        for (let m = 1; m < pulled.length; m += 1) {
          const pt = pulled[m]!;
          const isAnchor = m === pulled.length - 1;
          points.push({ x: pt.x, z: pt.z, crouch: crouchSegment(pulled[m - 1]!, pt),
            ...(isAnchor && anchor.door ? { door: anchor.door } : {}), ...(isAnchor && anchor.open ? { open: anchor.open } : {}) });
        }
        last = goal;
      }
      let length = 0;
      let prev = here;
      for (const p of points) { length += Math.hypot(p.x - prev.x, p.z - prev.z); prev = p; }
      const control = FEATURES.find((x) => x.kind === 'control' && x.id === step.control);
      legs.push({
        step: step.step, scene: step.scene, label: step.label, points, length,
        ...(control?.kind === 'control' ? { control: { id: control.id, interactableId: `nw:inspect:gb-${control.id}`, x: control.x, z: control.z, sets: control.sets } } : {}),
      });
      here = target;
    });
    return legs;
  } finally {
    for (const marker of opened) f.setDoor(marker, false);
  }
}
