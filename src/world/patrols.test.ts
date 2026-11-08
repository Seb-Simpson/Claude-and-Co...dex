import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { resolveEntityProfile } from '../entities/profiles';
import type { NavigationProvider } from '../contracts';
import { createNavigationProvider, createPhysicsAdapter } from '../physics';
import { createHospitalWorld } from './createHospitalWorld';

/**
 * Entities cannot open doors, so every patrol leg must be walkable with the world in its initial
 * state. A sealed leg leaves the entity standing in `patrol` forever (the Patient was shut in
 * the maintenance passage behind two closed doors and never reached the ward).
 */
const world = createHospitalWorld({ textures: false }).world;
let navigation: NavigationProvider;

beforeAll(async () => {
  await RAPIER.init();
  const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const adapter = createPhysicsAdapter(physics, world.colliders);
  physics.step();
  // Same defaults the gameplay runtime uses.
  navigation = createNavigationProvider(adapter, world.bounds);
}, 60_000);

describe('patrol routes are walkable from the initial world state', () => {
  const patrolling = world.entitySpawns.filter((s) => s.patrolRouteId);

  it('declares patrols for the roaming entities', () => {
    expect(patrolling.map((s) => s.type).sort()).toEqual(['nurse', 'patient']);
  });

  it.each(patrolling.map((s) => [s.type, s] as const))('%s can walk every leg of its route, from its spawn', (_type, spawn) => {
    const route = world.patrolRoutes.find((r) => r.id === spawn.patrolRouteId)!;
    const agent = resolveEntityProfile(spawn.type).agent;
    const stops = [spawn.position, ...route.points, ...(route.loop ? [route.points[0]!] : [])];
    for (let i = 1; i < stops.length; i++) {
      const from = stops[i - 1]!;
      const to = stops[i]!;
      const path = navigation.findPath({ from, to, agent });
      expect(path, `${spawn.type}: (${from.x}, ${from.z}) -> (${to.x}, ${to.z})`).not.toBeNull();
    }
  });
});
