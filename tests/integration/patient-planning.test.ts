import RAPIER from '@dimforge/rapier3d-compat';
import { PerspectiveCamera } from 'three';
import { beforeAll, expect, it } from 'vitest';
import type { NavigationQuery, Vec3 } from '../../src/contracts';
import { createDoorNavigationAdapter, createEntityAgent, ENTITY_PROFILES } from '../../src/entities';
import { createInteractionSystem } from '../../src/gameplay/interactions';
import { createPlayerController } from '../../src/gameplay/player';
import { createEventBus } from '../../src/integration/events';
import { createNavigationProvider, createPhysicsAdapter } from '../../src/physics';
import { createHospitalWorld } from '../../src/world';

beforeAll(async () => { await RAPIER.init(); });

it('plans locally around moving maintenance doors over two minutes of real Patient patrol', () => {
  const build = createHospitalWorld({ textures: false });
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const physics = createPhysicsAdapter(world, build.world.colliders);
  const events = createEventBus();
  const player = createPlayerController({
    body: physics.createCharacter({ position: build.world.playerSpawn.position, radius: 0.28, height: 1.8 }),
    camera: new PerspectiveCamera(), spawn: build.world.playerSpawn, events,
  });
  const interactions = createInteractionSystem({ world: build.world, player, physics, events });
  const base = createNavigationProvider(physics, build.world.bounds, { cellSize: 0.25 });
  const approaching: { door: string; from: Vec3; to: Vec3 }[] = [];
  let count = 0, tickQueries = 0, maximumTickQueries = 0;
  const navigation = { ...base, findPath(query: NavigationQuery) {
    count += 1; tickQueries += 1;
    // A moving leaf invalidates collision caches each fixed tick. The actor
    // should wait at a safe nearby approach instead of repeatedly searching a
    // complete hospital detour around that temporary obstruction.
    if (interactions.getDoorState('nw:door:maintenance-east') === 'opening') {
      approaching.push({ door: 'east', from: query.from, to: query.to });
      expect(query.to).not.toEqual({ x: 17, y: 0, z: 7.2 });
    }
    if (interactions.getDoorState('nw:door:maintenance-west') === 'opening') {
      approaching.push({ door: 'west', from: query.from, to: query.to });
      expect(query.to).not.toEqual({ x: -5.7, y: 0, z: 4 });
    }
    return base.findPath(query);
  } };
  const doors = createDoorNavigationAdapter({ world: build.world, physics, navigation, agent: ENTITY_PROFILES.patient.agent,
    getDoorState: id => interactions.getDoorState(id), requestDoorOpen: id => interactions.requestDoorOpen(id),
  });
  let setupTime = 0;
  // Exercise user-closed doors while preserving the accepted world's initially
  // open metadata. Closure uses the same camera prompts and swept animation.
  for (const [id, position] of [
    ['nw:door:maintenance-west', { x: -5.7, y: 0, z: 4.8 }],
    ['nw:door:maintenance-east', { x: 19.5, y: 0, z: 7.25 }],
  ] as const) {
    expect(player.body.canOccupy(position)).toBe(true);
    player.body.setPosition(position);
    player.update({ deltaSeconds: 1, elapsedSeconds: setupTime });
    const marker = build.world.doors.find(door => door.id === id)!;
    const center = physics.getColliderPose(marker.colliderIds[0]!).position;
    player.getSnapshot().camera.lookAt(center.x, 1.4, center.z);
    expect(interactions.getPrompt()).toMatchObject({ targetId: id, action: 'close' });
    interactions.interact(setupTime);
    for (let tick = 0; tick < 75; tick += 1) {
      setupTime += 1 / 60;
      interactions.fixedUpdate({ deltaSeconds: 1 / 60, elapsedSeconds: setupTime });
      world.step();
    }
    expect(interactions.getDoorState(id)).toBe('closed');
  }
  player.body.setPosition(build.world.playerSpawn.position);
  player.setHiding('hidden', 'test:unwitnessed');
  const spawn = build.world.entitySpawns.find(spawn => spawn.type === 'patient')!;
  const agent = createEntityAgent({ spawn, profile: ENTITY_PROFILES.patient,
    route: build.world.patrolRoutes.find(route => route.id === spawn.patrolRouteId)!,
    physics, navigation, player, events, ...doors,
  });
  try {
    for (let tick = 0; tick < 7200; tick += 1) {
      tickQueries = 0;
      const frame = { deltaSeconds: 1 / 60, elapsedSeconds: setupTime + (tick + 1) / 60 };
      interactions.fixedUpdate(frame); agent.fixedUpdate(frame); world.step();
      maximumTickQueries = Math.max(maximumTickQueries, tickQueries);
      if (tick % 60 === 0) expect(physics.isPositionFree(agent.getSnapshot().position, 0.3, 1.8, [], false)).toBe(true);
    }
    expect(approaching.some(query => query.door === 'east')).toBe(true);
    expect(approaching.some(query => query.door === 'west')).toBe(true);
    expect(maximumTickQueries).toBeLessThanOrEqual(2);
    expect(count).toBeLessThan(400);
    expect(interactions.getDoorState('nw:door:maintenance-east')).toBe('open');
    expect(interactions.getDoorState('nw:door:maintenance-west')).toBe('open');
    expect(agent.getSnapshot().state).toBe('patrol');
  } finally {
    agent.dispose(); interactions.dispose(); player.dispose(); physics.dispose(); events.dispose(); world.free(); build.dispose();
  }
}, 15000);
