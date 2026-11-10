import RAPIER from '@dimforge/rapier3d-compat';
import { PerspectiveCamera } from 'three';
import { beforeAll, expect, it } from 'vitest';
import { createOpeningInteractionAdapter } from '../../src/gameplay/opening/adapter';
import { openingPosition, resolveOpeningBindings } from '../../src/gameplay/opening/bindings';
import { createInteractionSystem } from '../../src/gameplay/interactions';
import { createPlayerController } from '../../src/gameplay/player';
import { createEventBus } from '../../src/integration';
import { createPhysicsAdapter } from '../../src/physics';
import { createOpeningFixture } from './fixture';

beforeAll(async () => { await RAPIER.init(); });

it('opens the synthetic fixture exit through its full sweep and lets the real player walk into the corridor', () => {
  const fixture = createOpeningFixture();
  const bindings = resolveOpeningBindings(fixture.world)!;
  const adapted = createOpeningInteractionAdapter(fixture.world, bindings);
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const physics = createPhysicsAdapter(world, adapted.world.colliders);
  const events = createEventBus();
  const body = physics.createCharacter({ position: adapted.world.playerSpawn.position, radius: .28, height: 1.8 });
  const player = createPlayerController({ body, camera: new PerspectiveCamera(70, 1, .05, 100), spawn: adapted.world.playerSpawn, events });
  const door104 = bindings['room-104-door'].doorId!;
  const door106 = bindings['room-106-door'].doorId!;
  const interactions = createInteractionSystem({ world: adapted.world, player, physics, events,
    initialDoorStates: { [door104]: 'locked', [door106]: 'locked' } });
  try {
    const from = bindings['room-104-door'].stand!;
    const view = openingPosition(bindings['nurse-first-sight-view']);
    const to = { x: view.x, y: from.y, z: view.z };
    expect(physics.isSegmentFree(from, to, body.radius, body.height)).toBe(false);
    expect(interactions.setDoorLocked(door104, false)).toBe(true);
    expect(interactions.requestDoorOpen(door104)).toBe(true);
    for (let frame = 1; frame <= 60; frame += 1) {
      interactions.fixedUpdate({ deltaSeconds: 1 / 60, elapsedSeconds: frame / 60 });
    }
    expect(interactions.getDoorState(door104)).toBe('open');
    expect(interactions.getDoorState(door106)).toBe('locked');
    expect(physics.isSegmentFree(from, to, body.radius, body.height)).toBe(true);
    expect(body.canOccupy(from)).toBe(true);
    body.setPosition(from);
    for (let frame = 1; frame <= 60; frame += 1) {
      body.move({ x: (to.x - from.x) / 60, y: 0, z: (to.z - from.z) / 60 });
    }
    expect(body.getPosition().x).toBeCloseTo(to.x, 3);
    expect(body.getPosition().z).toBeCloseTo(to.z, 3);
  } finally {
    interactions.dispose(); player.dispose(); physics.dispose(); events.dispose(); world.free(); adapted.dispose(); fixture.dispose();
  }
});
