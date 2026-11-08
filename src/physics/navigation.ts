import type { Bounds3, NavigationAgent, NavigationPath, NavigationProvider, NavigationQuery, Vec3 } from '../contracts';
import type { PhysicsAdapter } from './adapter';

export interface NavigationOptions {
  /** Metres between search samples. Smaller values find narrower routes at higher cost. */
  readonly cellSize?: number;
  /** Maximum expanded A* nodes per query; unreachable/over-budget queries return null. */
  readonly maxNodes?: number;
}

interface Node {
  readonly key: string;
  readonly x: number;
  readonly z: number;
  readonly position: Vec3;
  cost: number;
  parent: Node | null;
}
interface HeapEntry { readonly node: Node; readonly score: number }

/**
 * Live, clearance-aware A* for one floor layer. It conservatively refuses stairs,
 * overlapping floors and unsupported gaps rather than inventing a route through them.
 * Queries ignore character capsules; actual character movement still resolves actors.
 */
export function createNavigationProvider(
  physics: PhysicsAdapter,
  bounds: Bounds3,
  options: NavigationOptions = {},
): NavigationProvider {
  const cellSize = options.cellSize ?? 0.5;
  const maxNodes = options.maxNodes ?? 4096;
  if (!Number.isFinite(cellSize) || cellSize <= 0 || !Number.isInteger(maxNodes) || maxNodes < 1) {
    throw new Error('Navigation requires a positive cellSize and integer maxNodes');
  }
  if (![bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z].every(Number.isFinite) ||
      bounds.min.x > bounds.max.x || bounds.min.y > bounds.max.y || bounds.min.z > bounds.max.z) {
    throw new Error('Navigation bounds must be finite and ordered');
  }

  // Actor capsules never participate in planning, so static clearance can be
  // reused until an imported obstacle (typically a door) changes pose. Providers
  // without a revision API retain the original live-query behavior.
  let cachedRevision: number | undefined;
  const positions = new Map<string, boolean>();
  const segments = new Map<string, boolean>();
  const paths = new Map<string, NavigationPath | null>();
  const pointKey = (value: Vec3): string => `${value.x},${value.y},${value.z}`;
  const agentKey = (value: NavigationAgent): string => `${value.radius},${value.height},${value.maxStepHeight},${value.maxSlopeRadians}`;
  function refreshCache(): void {
    const revision = physics.getObstacleRevision?.();
    if (revision === undefined || revision !== cachedRevision) {
      positions.clear(); segments.clear(); paths.clear(); cachedRevision = revision;
    }
    // Evict oldest entries independently. Unique chase endpoints must not flush
    // the expensive reusable grid clearance when the small path cache fills.
    trim(positions, 20000); trim(segments, 40000); trim(paths, 128);
  }
  function trim<T>(cache: Map<string, T>, limit: number): void {
    while (cache.size > limit) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }
  const distance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  function validAgent(agent: NavigationAgent): boolean {
    return [agent.radius, agent.height, agent.maxStepHeight, agent.maxSlopeRadians].every(Number.isFinite) &&
      agent.radius > 0 && agent.height >= agent.radius * 2 && agent.maxStepHeight >= 0 &&
      agent.maxSlopeRadians >= 0 && agent.maxSlopeRadians < Math.PI / 2;
  }
  function inside(position: Vec3, agent: NavigationAgent): boolean {
    return [position.x, position.y, position.z].every(Number.isFinite) &&
      position.x - agent.radius >= bounds.min.x && position.x + agent.radius <= bounds.max.x &&
      position.z - agent.radius >= bounds.min.z && position.z + agent.radius <= bounds.max.z &&
      position.y >= bounds.min.y - 0.05 && position.y + agent.height <= bounds.max.y + 0.05;
  }
  function supported(position: Vec3, agent: NavigationAgent): boolean {
    const rise = Math.max(0.08, agent.maxStepHeight + 0.03);
    const floor = physics.findGround({ x: position.x, y: position.y + rise, z: position.z }, rise * 2);
    // Flat-layer navigation tolerates the controller skin, not floating over a lower floor.
    return floor !== null && Math.abs(floor.y - position.y) <= 0.06;
  }
  function validPosition(position: Vec3, agent: NavigationAgent): boolean {
    const key = `${agentKey(agent)}:${pointKey(position)}`;
    let valid = positions.get(key);
    if (valid === undefined) {
      valid = inside(position, agent) && supported(position, agent) &&
        physics.isPositionFree(position, agent.radius, agent.height, [], false);
      positions.set(key, valid);
    }
    return valid;
  }
  function traversable(from: Vec3, to: Vec3, agent: NavigationAgent): boolean {
    const first = pointKey(from), second = pointKey(to);
    const key = `${agentKey(agent)}:${first < second ? `${first}:${second}` : `${second}:${first}`}`;
    let clear = segments.get(key);
    if (clear === undefined) { clear = testSegment(from, to, agent); segments.set(key, clear); }
    return clear;
  }
  function testSegment(from: Vec3, to: Vec3, agent: NavigationAgent): boolean {
    if (!physics.isSegmentFree(from, to, agent.radius, agent.height, [], false)) return false;
    const length = distance(from, to);
    const count = Math.max(1, Math.ceil(length / Math.min(agent.radius, cellSize / 2)));
    if (!Number.isFinite(count) || count > 8192) return false;
    for (let index = 0; index <= count; index += 1) {
      const fraction = index / count;
      const position = {
        x: from.x + (to.x - from.x) * fraction,
        y: from.y + (to.y - from.y) * fraction,
        z: from.z + (to.z - from.z) * fraction,
      };
      if (!supported(position, agent)) return false;
    }
    return true;
  }

  function search(query: NavigationQuery): NavigationPath | null {
    const { from, to, agent } = query;
    if (!validAgent(agent) || !validPosition(from, agent) || !validPosition(to, agent)) return null;
    // One query represents a single floor. A floor graph can compose these queries later.
    if (Math.abs(from.y - to.y) > 0.06) return null;
    if (traversable(from, to, agent)) return { waypoints: [{ ...from }, { ...to }], reachesGoal: true };

    const nodes = new Map<string, Node | null>();
    const closed = new Set<string>();
    const heap: HeapEntry[] = [];
    function push(entry: HeapEntry): void {
      heap.push(entry);
      let index = heap.length - 1;
      while (index > 0) {
        const parent = (index - 1) >> 1;
        if (heap[parent]!.score <= entry.score) break;
        heap[index] = heap[parent]!;
        index = parent;
      }
      heap[index] = entry;
    }
    function pop(): Node | undefined {
      const first = heap[0];
      const last = heap.pop();
      if (!first || !last) return undefined;
      if (heap.length > 0) {
        let index = 0;
        while (index * 2 + 1 < heap.length) {
          let child = index * 2 + 1;
          if (child + 1 < heap.length && heap[child + 1]!.score < heap[child]!.score) child += 1;
          if (heap[child]!.score >= last.score) break;
          heap[index] = heap[child]!;
          index = child;
        }
        heap[index] = last;
      }
      return first.node;
    }
    function nodeAt(x: number, z: number): Node | null {
      const key = `${x}:${z}`;
      const cached = nodes.get(key);
      if (cached !== undefined) return cached;
      const position = { x: bounds.min.x + x * cellSize, y: from.y, z: bounds.min.z + z * cellSize };
      const result = validPosition(position, agent) ? { key, x, z, position, cost: Infinity, parent: null } : null;
      nodes.set(key, result);
      return result;
    }
    const start: Node = {
      key: 'start', x: Math.round((from.x - bounds.min.x) / cellSize),
      z: Math.round((from.z - bounds.min.z) / cellSize), position: { ...from }, cost: 0, parent: null,
    };
    push({ node: start, score: distance(from, to) });
    let expanded = 0;
    while (heap.length > 0 && expanded < maxNodes) {
      const current = pop();
      if (!current || closed.has(current.key)) continue;
      closed.add(current.key);
      expanded += 1;
      if (distance(current.position, to) <= cellSize * 1.5 && traversable(current.position, to, agent)) {
        const route: Vec3[] = [{ ...to }];
        let ancestor: Node | null = current;
        while (ancestor) { route.push({ ...ancestor.position }); ancestor = ancestor.parent; }
        route.reverse();
        // Greedy continuous-clearance smoothing removes grid zigzags without cutting corners.
        const smooth: Vec3[] = [route[0]!];
        let anchor = 0;
        while (anchor < route.length - 1) {
          let next = route.length - 1;
          while (next > anchor + 1 && !traversable(route[anchor]!, route[next]!, agent)) next -= 1;
          smooth.push(route[next]!);
          anchor = next;
        }
        return { waypoints: smooth, reachesGoal: true };
      }
      for (let dx = -1; dx <= 1; dx += 1) for (let dz = -1; dz <= 1; dz += 1) {
        if (dx === 0 && dz === 0 && current.key !== 'start') continue;
        const next = nodeAt(current.x + dx, current.z + dz);
        if (!next || closed.has(next.key)) continue;
        if (current.key !== 'start' && dx !== 0 && dz !== 0) {
          // A diagonal cannot pass between two blocked cardinal cells.
          const sideX = nodeAt(current.x + dx, current.z);
          const sideZ = nodeAt(current.x, current.z + dz);
          if (!sideX || !sideZ || !traversable(current.position, sideX.position, agent) ||
              !traversable(current.position, sideZ.position, agent)) continue;
        }
        if (!traversable(current.position, next.position, agent)) continue;
        const cost = current.cost + distance(current.position, next.position);
        if (cost >= next.cost) continue;
        next.cost = cost;
        next.parent = current;
        push({ node: next, score: cost + distance(next.position, to) });
      }
    }
    return null;
  }

  return {
    findPath(query) {
      refreshCache();
      const key = `${agentKey(query.agent)}:${pointKey(query.from)}:${pointKey(query.to)}`;
      if (paths.has(key)) return paths.get(key)!;
      const result = search(query);
      paths.set(key, result);
      return result;
    },
    hasLineOfSight: (query) => physics.hasLineOfSight(query.from, query.to, query.ignoreColliderIds),
    isPositionValid(position, agent) { refreshCache(); return validAgent(agent) && validPosition(position, agent); },
  };
}
