import RAPIER from '@dimforge/rapier3d-compat';
import { Matrix4, Quaternion, Vector3 } from 'three';
import type { DoorMarker, Pose } from '../../src/contracts';
import { createPhysicsAdapter, type PhysicsAdapter } from '../../src/physics/adapter';
import { createGreyboxWorld, type GreyboxWorldBuild } from '../../src/world/greybox/build';
import { CONNECTIONS, type ConnectionDef } from '../../src/world/greybox/level';

export interface Agent { readonly radius: number; readonly height: number }
export const STANDING: Agent = { radius: 0.28, height: 1.8 };
export const CROUCHED: Agent = { radius: 0.28, height: 1.05 };
/** Shaw's trolley footprint approximated as a disc (0.7 x 1.4 m trolley turning). */
export const TROLLEY: Agent = { radius: 0.5, height: 1.8 };

export interface Fixture {
  readonly build: GreyboxWorldBuild;
  readonly physics: PhysicsAdapter;
  setDoor(door: DoorMarker, open: boolean): boolean;
  sweepDoor(door: DoorMarker, open: boolean): boolean;
  dispose(): void;
}

function matrix(pose: Pose): Matrix4 {
  return new Matrix4().compose(new Vector3().copy(pose.position), new Quaternion().copy(pose.rotation), new Vector3(1, 1, 1));
}

export async function createFixture(): Promise<Fixture> {
  await RAPIER.init();
  const build = createGreyboxWorld({ textures: false });
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const physics = createPhysicsAdapter(world, build.world.colliders);
  const progress = new Map(build.world.doors.map((door) => [door.id, door.initialState === 'open' ? 1 : 0]));
  const local = new Map(build.world.doors.map((door) => {
    const initial = door.initialState === 'open' ? door.openPose : door.closedPose;
    return [door.id, door.colliderIds.map((id) => ({ id, matrix: matrix(initial).invert().multiply(matrix(build.world.colliders.find((c) => c.id === id)!.pose)) }))];
  }));
  const poseAt = (door: DoorMarker, t: number) => {
    const position = new Vector3().copy(door.closedPose.position).lerp(new Vector3().copy(door.openPose.position), t);
    const rotation = new Quaternion().copy(door.closedPose.rotation).slerp(new Quaternion().copy(door.openPose.rotation), t);
    const target = matrix({ position, rotation });
    return local.get(door.id)!.map((entry) => {
      const p = new Vector3(), q = new Quaternion();
      target.clone().multiply(entry.matrix).decompose(p, q, new Vector3());
      return { id: entry.id, pose: { position: p, rotation: q } };
    });
  };
  return {
    build, physics,
    setDoor(door, open) {
      const ok = physics.trySetColliderPoses(poseAt(door, open ? 1 : 0));
      if (ok) progress.set(door.id, open ? 1 : 0);
      return ok;
    },
    sweepDoor(door, open) {
      const start = progress.get(door.id)!;
      const goal = open ? 1 : 0;
      for (let index = 1; index <= 45; index += 1) {
        if (!physics.trySetColliderPoses(poseAt(door, start + (goal - start) * index / 45))) return false;
      }
      progress.set(door.id, goal);
      return true;
    },
    dispose() { physics.dispose(); world.free(); build.dispose(); },
  };
}

export interface Flood {
  readonly cell: number;
  readonly x0: number;
  readonly z0: number;
  readonly nx: number;
  readonly nz: number;
  /** Component label per cell (-1 invalid). */
  readonly label: Int32Array;
  readonly valid: Uint8Array;
  componentAt(x: number, z: number): number;
}

/** Labels connected free cells for an agent (4-neighbour flood over the real colliders). */
export function flood(f: Fixture, agent: Agent, cell = 0.25): Flood {
  const b = f.build.world.bounds;
  const x0 = b.min.x, z0 = b.min.z;
  const nx = Math.ceil((b.max.x - b.min.x) / cell), nz = Math.ceil((b.max.z - b.min.z) / cell);
  const valid = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const x = x0 + (i + 0.5) * cell, z = z0 + (j + 0.5) * cell;
      const space = f.build.layout.spaceAt(x, z);
      if (!space || space.ceiling < agent.height + 0.02) continue;
      const position = { x, y: 0, z };
      const ground = f.physics.findGround({ x, y: 0.3, z }, 0.6);
      if (!ground || Math.abs(ground.y) > 0.05) continue;
      if (f.physics.isPositionFree(position, agent.radius, agent.height, [], false)) valid[j * nx + i] = 1;
    }
  }
  const label = new Int32Array(nx * nz).fill(-1);
  let next = 0;
  const stack: number[] = [];
  for (let start = 0; start < valid.length; start += 1) {
    if (!valid[start] || label[start] !== -1) continue;
    label[start] = next;
    stack.push(start);
    while (stack.length) {
      const k = stack.pop()!;
      const i = k % nx, j = (k - i) / nx;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const n = jj * nx + ii;
        if (valid[n] && label[n] === -1) { label[n] = next; stack.push(n); }
      }
    }
    next += 1;
  }
  return {
    cell, x0, z0, nx, nz, label, valid,
    componentAt(x, z) {
      // Nearest valid cell within 0.5 m (points such as marker posts may sit in a wall's skin).
      const ci = Math.floor((x - x0) / cell), cj = Math.floor((z - z0) / cell);
      let best = -1, bestD = Infinity;
      for (let dj = -2; dj <= 2; dj += 1) for (let di = -2; di <= 2; di += 1) {
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
        const l = label[j * nx + i]!;
        if (l < 0) continue;
        const d = di * di + dj * dj;
        if (d < bestD) { bestD = d; best = l; }
      }
      return best;
    },
  };
}

/** Space ids that contain at least one cell of `component`. */
export function spacesInComponent(f: Fixture, fl: Flood, component: number): Set<string> {
  const out = new Set<string>();
  for (let k = 0; k < fl.label.length; k += 1) {
    if (fl.label[k] !== component) continue;
    const i = k % fl.nx, j = (k - i) / fl.nx;
    const space = f.build.layout.spaceAt(fl.x0 + (i + 0.5) * fl.cell, fl.z0 + (j + 0.5) * fl.cell);
    if (space) out.add(space.id);
  }
  return out;
}

/** Space graph over connections passing `use`. */
export function reachableSpaces(start: string, use: (connection: ConnectionDef) => boolean): Set<string> {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const current = queue.shift()!;
    for (const connection of CONNECTIONS) {
      if (connection.kind === 'window' || !use(connection)) continue;
      const other = connection.a === current ? connection.b : connection.b === current ? connection.a : null;
      if (other && !seen.has(other)) { seen.add(other); queue.push(other); }
    }
  }
  return seen;
}
