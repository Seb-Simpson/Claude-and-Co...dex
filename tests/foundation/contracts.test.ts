import { Group, Object3D } from 'three';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  ColliderDefinition, DoorMarker, GameEvents, GameModule, HospitalWorld,
  InteractableMarker, NavigationProvider, PerceptionInput, SoundEvent,
} from '../../src/contracts';

/** A separate world producer compiles without importing gameplay or the engine runtime. */
function createFixtureWorld(): HospitalWorld {
  const root = new Group();
  const object = new Object3D();
  root.add(object);
  const door: DoorMarker = {
    id: 'fixture-door', type: 'door', object, prompt: 'Open', range: 2,
    colliderIds: ['fixture-door-collider'], initialState: 'closed', durationSeconds: 0.5,
    closedPose: { position: { x: 1, y: 1, z: -2 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    openPose: { position: { x: 1, y: 1, z: -2 }, rotation: { x: 0, y: 0.70710678, z: 0, w: 0.70710678 } },
  };
  return {
    id: 'fixture-world', root,
    bounds: { min: { x: -5, y: 0, z: -5 }, max: { x: 5, y: 3, z: 5 } },
    rooms: [], colliders: [{
      id: 'fixture-door-collider', shape: { type: 'box', halfExtents: { x: 0.45, y: 1, z: 0.05 } },
      pose: door.closedPose, bodyType: 'kinematic', sensor: false, interactableId: door.id,
    }],
    interactables: [door], doors: [door], hidingLocations: [], entitySpawns: [], patrolRoutes: [],
    playerSpawn: { position: { x: 0, y: 0, z: 0 }, yaw: 0 },
  };
}

describe('cross-module contracts', () => {
  it('lets independent producers expose collider and interaction metadata through a world module', async () => {
    const world = createFixtureWorld();
    const module = {
      id: 'fixture.world', kind: 'world',
      setup: () => ({ world, dispose: () => { world.root.clear(); } }),
    } satisfies GameModule;
    const instance = await module.setup();
    expect(instance.world.doors[0]).toBe(instance.world.interactables[0]);
    expect(instance.world.colliders[0]?.interactableId).toBe(instance.world.doors[0]?.id);
    expect(instance.world.root.children).toHaveLength(1);
    instance.dispose();
    expect(instance.world.root.children).toHaveLength(0);
    expectTypeOf<DoorMarker>().toExtend<InteractableMarker>();
  });

  it('requires navigation clearance and deliberate perception input rather than a full player reference', () => {
    expectTypeOf<NavigationProvider['findPath']>().parameter(0).toHaveProperty('agent');
    expectTypeOf<PerceptionInput>().not.toHaveProperty('player');
    expectTypeOf<PerceptionInput['visiblePlayer']>().toBeNullable();
  });
});

/** Negative checks are compiled by npm run typecheck; they are not runtime dispatches. */
function checkRejectedContracts(events: GameEvents): void {
  const sound: SoundEvent = { cueId: 'bell', action: 'play', volume: 0.5, loop: false };
  events.emit('atmosphere:sound', sound);
  // @ts-expect-error Audible audio cues do not automatically reveal the player to entities.
  events.emit('player:noise', sound);
  // @ts-expect-error There is no combat/attack channel in this game.
  events.emit('player:attack', {});
  // @ts-expect-error Unknown chase termination states cannot reach subscribers.
  events.emit('chase:ended', { chaseId: 'c', entityId: 'e', playerId: 'p', reason: 'killed', timeSeconds: 0 });
  // @ts-expect-error Box dimensions are mandatory; a type assertion cannot replace metadata.
  const incompleteCollider: ColliderDefinition = { id: 'wall', shape: { type: 'box' }, pose: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } }, bodyType: 'fixed', sensor: false };
  void incompleteCollider;
}
void checkRejectedContracts;
