import { describe, expect, it } from 'vitest';
import { Group, Object3D } from 'three';
import type { DoorMarker, HospitalWorld, InteractableMarker } from '../../src/contracts';
import { validateWorld } from '../../src/integration/validateWorld';

function fixture(): HospitalWorld {
  const root = new Group();
  const doorObject = new Object3D();
  const lockerObject = new Object3D();
  root.add(doorObject, lockerObject);
  const pose = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
  const door: DoorMarker = {
    id: 'door', type: 'door', object: doorObject, prompt: 'Open door', range: 2,
    colliderIds: ['door-body'], initialState: 'closed', closedPose: pose, openPose: pose, durationSeconds: 1,
  };
  const locker: InteractableMarker = {
    id: 'locker', type: 'locker', object: lockerObject, prompt: 'Hide', range: 2,
  };
  return {
    id: 'fixture', root, bounds: { min: { x: -5, y: 0, z: -5 }, max: { x: 5, y: 3, z: 5 } },
    rooms: [{ id: 'test-region', name: 'Metadata fixture', bounds: { min: { x: -5, y: 0, z: -5 }, max: { x: 5, y: 3, z: 5 } }, tags: [] }],
    colliders: [{
      id: 'door-body', bodyType: 'kinematic', sensor: false, pose,
      shape: { type: 'box', halfExtents: { x: 0.5, y: 1, z: 0.1 } },
      roomId: 'test-region', interactableId: 'door',
    }],
    interactables: [door, locker], doors: [door],
    hidingLocations: [{
      id: 'hiding-spot', interactableId: 'locker', type: 'locker', capacity: 1,
      cameraPose: pose, playerPosition: { x: 0, y: 0, z: 0 },
      exitCandidates: [{ position: { x: 1, y: 0, z: 0 }, yaw: 0 }], colliderIds: [],
    }],
    entitySpawns: [{ id: 'spawn', entityId: 'patient-1', type: 'patient', position: { x: 2, y: 0, z: 2 }, yaw: 0, roomId: 'test-region', patrolRouteId: 'patrol' }],
    patrolRoutes: [{ id: 'patrol', points: [{ x: 2, y: 0, z: 2 }], loop: true }],
    playerSpawn: { position: { x: 0, y: 0, z: 0 }, yaw: 0 },
  };
}

describe('world metadata boundary', () => {
  it('accepts connected metadata with doors aliased in the interactable list', () => {
    expect(() => validateWorld(fixture())).not.toThrow();
  });

  it('rejects duplicate object IDs across collections', () => {
    const world = fixture();
    expect(() => validateWorld({ ...world, id: 'door' })).toThrow('duplicate object ID');
    expect(() => validateWorld({ ...world, colliders: [...world.colliders, ...world.colliders] })).toThrow('duplicate object ID');
  });

  it('rejects reversed bounds, nonfinite spawns and transformed roots', () => {
    const world = fixture();
    expect(() => validateWorld({ ...world, bounds: { min: { x: 6, y: 0, z: 0 }, max: { x: 5, y: 3, z: 5 } } })).toThrow('reversed');
    expect(() => validateWorld({ ...world, playerSpawn: { position: { x: NaN, y: 0, z: 0 }, yaw: 0 } })).toThrow('finite');
    world.root.position.x = 1;
    expect(() => validateWorld(world)).toThrow('identity transform');
  });

  it('validates collider dimensions, quaternion normalization and mesh indices', () => {
    const world = fixture();
    const body = world.colliders[0]!;
    expect(() => validateWorld({ ...world, colliders: [{ ...body, shape: { type: 'sphere', radius: -1 } }] })).toThrow('positive');
    expect(() => validateWorld({ ...world, colliders: [{ ...body, pose: { ...body.pose, rotation: { x: 0, y: 0, z: 0, w: 0 } } }] })).toThrow('unit quaternion');
    expect(() => validateWorld({ ...world, colliders: [{ ...body, shape: { type: 'trimesh', vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 3] } }] })).toThrow('index outside');
  });

  it('rejects dangling metadata references and detached interaction objects', () => {
    const world = fixture();
    expect(() => validateWorld({ ...world, colliders: [{ ...world.colliders[0]!, roomId: 'missing-room' }] })).toThrow('missing-room');
    expect(() => validateWorld({ ...world, entitySpawns: [{ ...world.entitySpawns[0]!, patrolRouteId: 'missing-route' }] })).toThrow('missing-route');
    world.interactables[1]!.object.removeFromParent();
    expect(() => validateWorld(world)).toThrow('not inside world.root');
  });

  it('requires authoritative shared door markers and movable collision metadata', () => {
    const world = fixture();
    expect(() => validateWorld({ ...world, doors: [{ ...world.doors[0]! }] })).toThrow('same marker objects');
    expect(() => validateWorld({ ...world, doors: [] })).toThrow('must also appear');
    expect(() => validateWorld({ ...world, colliders: [{ ...world.colliders[0]!, bodyType: 'fixed' }] })).toThrow('kinematic');
  });

  it('requires a matching hiding interactable and explicit exit candidates', () => {
    const world = fixture();
    expect(() => validateWorld({ ...world, hidingLocations: [{ ...world.hidingLocations[0]!, exitCandidates: [] }] })).toThrow('exit candidate');
    expect(() => validateWorld({ ...world, hidingLocations: [{ ...world.hidingLocations[0]!, type: 'bed' }] })).toThrow('type must match');
  });

  it('rejects duplicate entity identities and empty navigation routes', () => {
    const world = fixture();
    expect(() => validateWorld({ ...world, entitySpawns: [...world.entitySpawns, { ...world.entitySpawns[0]!, id: 'spawn-2' }] })).toThrow('entity IDs');
    expect(() => validateWorld({ ...world, patrolRoutes: [{ id: 'patrol', points: [], loop: true }] })).toThrow('must not be empty');
  });
});
