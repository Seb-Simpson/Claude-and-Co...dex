import RAPIER from '@dimforge/rapier3d-compat';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Bounds3, ColliderDefinition, NavigationAgent, Pose } from '../../src/contracts';
import { createPhysicsAdapter } from '../../src/physics/adapter';
import { createNavigationProvider } from '../../src/physics/navigation';

const bounds: Bounds3 = { min: { x: -5, y: -1, z: -5 }, max: { x: 5, y: 4, z: 5 } };
const standing: NavigationAgent = { radius: 0.25, height: 1.8, maxSlopeRadians: Math.PI / 4, maxStepHeight: 0.2 };
const pose = (x: number, y: number, z: number): Pose => ({ position: { x, y, z }, rotation: { x: 0, y: 0, z: 0, w: 1 } });
function box(id: string, x: number, y: number, z: number, hx: number, hy: number, hz: number, bodyType: 'fixed' | 'kinematic' = 'fixed'): ColliderDefinition {
  return { id, shape: { type: 'box', halfExtents: { x: hx, y: hy, z: hz } }, pose: pose(x, y, z), bodyType, sensor: false };
}
const resources: { dispose(): void }[] = [];
beforeAll(async () => { await RAPIER.init(); });
afterEach(() => { for (const resource of resources.splice(0).reverse()) resource.dispose(); });
function fixture(extra: readonly ColliderDefinition[] = []) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  resources.push({ dispose: () => world.free() });
  const physics = createPhysicsAdapter(world, [box('floor', 0, -0.5, 0, 5, 0.5, 5), ...extra]);
  resources.push(physics);
  return { physics, navigation: createNavigationProvider(physics, bounds, { cellSize: 0.5, maxNodes: 2000 }) };
}

describe('live floor-layer navigation', () => {
  it('routes around a thin wall with continuously clear path segments', () => {
    const { physics, navigation } = fixture([box('wall', 0, 1.5, 0, 0.025, 1.5, 1.5)]);
    const route = navigation.findPath({ from: { x: -3, y: 0, z: 0 }, to: { x: 3, y: 0, z: 0 }, agent: standing });
    expect(route?.reachesGoal).toBe(true);
    expect(route!.waypoints.some(point => Math.abs(point.z) > 1.75)).toBe(true);
    for (let index = 1; index < route!.waypoints.length; index += 1) {
      expect(physics.isSegmentFree(route!.waypoints[index - 1]!, route!.waypoints[index]!, standing.radius, standing.height, [], false)).toBe(true);
    }
  });

  it('bounds search work and rejects invalid agent dimensions', () => {
    const { physics } = fixture([box('wall', 0, 1.5, 0, 0.025, 1.5, 1.5)]);
    const navigation = createNavigationProvider(physics, bounds, { cellSize: 0.5, maxNodes: 1 });
    const query = { from: { x: -3, y: 0, z: 0 }, to: { x: 3, y: 0, z: 0 }, agent: standing };
    expect(navigation.findPath(query)).toBeNull();
    expect(navigation.findPath({ ...query, agent: { ...standing, height: 0.1 } })).toBeNull();
    expect(() => createNavigationProvider(physics, bounds, { cellSize: 0 })).toThrow('cellSize');
  });

  it('returns no path across an unbroken divider instead of steering through it', () => {
    const { navigation } = fixture([box('divider', 0, 1.5, 0, 0.025, 1.5, 5)]);
    expect(navigation.findPath({ from: { x: -3, y: 0, z: 0 }, to: { x: 3, y: 0, z: 0 }, agent: standing })).toBeNull();
  });

  it('uses the configured agent height for low-clearance routes', () => {
    const { navigation } = fixture([box('ceiling', 0, 1.4, 0, 5, 0.2, 5)]);
    const query = { from: { x: -3, y: 0, z: 0 }, to: { x: 3, y: 0, z: 0 } };
    expect(navigation.findPath({ ...query, agent: standing })).toBeNull();
    expect(navigation.findPath({ ...query, agent: { ...standing, height: 0.8 } })?.reachesGoal).toBe(true);
  });

  it('reevaluates moving door collision metadata on the next query', () => {
    const { physics, navigation } = fixture([
      box('north', 0, 1.5, 3, 0.1, 1.5, 2),
      box('south', 0, 1.5, -3, 0.1, 1.5, 2),
      box('door', 0, 1.5, 0, 0.1, 1.5, 1, 'kinematic'),
    ]);
    const query = { from: { x: -3, y: 0, z: 0 }, to: { x: 3, y: 0, z: 0 }, agent: standing };
    expect(navigation.findPath(query)).toBeNull();
    expect(physics.trySetColliderPoses([{ id: 'door', pose: pose(3.5, 1.5, 3.5) }])).toBe(true);
    expect(navigation.findPath(query)?.reachesGoal).toBe(true);
  });

  it('ignores actor capsules for planning while actual occupancy still sees them', () => {
    const { physics, navigation } = fixture();
    const actor = physics.createCharacter({ position: { x: -3, y: 0, z: 0 }, radius: 0.25, height: 1.8 });
    expect(physics.isPositionFree(actor.getPosition(), 0.25, 1.8)).toBe(false);
    expect(navigation.findPath({ from: actor.getPosition(), to: { x: 3, y: 0, z: 0 }, agent: standing })?.reachesGoal).toBe(true);
  });

  it('refuses unsupported gaps and independent floor levels', () => {
    const { physics } = fixture();
    const navigation = createNavigationProvider(physics, bounds, { maxNodes: 1 });
    expect(navigation.findPath({ from: { x: -3, y: 0, z: 0 }, to: { x: 3, y: 2, z: 0 }, agent: standing })).toBeNull();
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    resources.push({ dispose: () => world.free() });
    const gapPhysics = createPhysicsAdapter(world, [
      box('left-floor', -3, -0.5, 0, 2, 0.5, 5),
      box('right-floor', 3, -0.5, 0, 2, 0.5, 5),
    ]);
    resources.push(gapPhysics);
    const gapNav = createNavigationProvider(gapPhysics, bounds);
    expect(gapNav.findPath({ from: { x: -3, y: 0, z: 0 }, to: { x: 3, y: 0, z: 0 }, agent: standing })).toBeNull();
  });
});
