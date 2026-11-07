import RAPIER from '@dimforge/rapier3d-compat';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Quaternion } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ColliderDefinition, DoorMarker, HospitalWorld, InteractionEvent, InteractableMarker } from '../../src/contracts';
import { createEventBus } from '../../src/integration';
import { createInteractionSystem } from '../../src/gameplay/interactions';
import { createPlayerController } from '../../src/gameplay/player';
import { createPhysicsAdapter } from '../../src/physics';

beforeAll(async () => { await RAPIER.init(); });
const identity = { x: 0, y: 0, z: 0, w: 1 };
function fixture(options: { wall?: boolean; locked?: boolean; requirement?: boolean; inspect?: boolean } = {}) {
  const root = new Group();
  const pivot = new Group();
  pivot.position.set(0, 0, -2);
  root.add(pivot);
  const geometry = new BoxGeometry(1, 2, 0.1);
  const material = new MeshBasicMaterial();
  const doorMesh = new Mesh(geometry, material);
  doorMesh.position.set(0.5, 1, 0);
  pivot.add(doorMesh);
  const door: DoorMarker = {
    id: 'door', type: 'door', object: pivot, prompt: 'Open', range: 2.5, colliderIds: ['door-body'],
    initialState: options.locked ? 'locked' : 'closed', durationSeconds: 0.5,
    closedPose: { position: { x: 0, y: 0, z: -2 }, rotation: identity },
    openPose: { position: { x: 0, y: 0, z: -2 }, rotation: new Quaternion().setFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2) },
    ...(options.requirement ? { requirements: [{ id: 'power', description: 'Power is required' }] } : {}),
  };
  const marker: InteractableMarker = options.inspect
    ? { id: 'cabinet', type: 'cabinet', object: pivot, prompt: 'Inspect cabinet', range: 2.5, colliderIds: ['door-body'] }
    : door;
  const definitions: ColliderDefinition[] = [
    { id: 'floor', bodyType: 'fixed', sensor: false, pose: { position: { x: 0, y: -0.1, z: 0 }, rotation: identity }, shape: { type: 'box', halfExtents: { x: 5, y: 0.1, z: 5 } } },
    { id: 'door-body', bodyType: 'kinematic', sensor: false, pose: { position: { x: 0.5, y: 1, z: -2 }, rotation: identity }, shape: { type: 'box', halfExtents: { x: 0.5, y: 1, z: 0.05 } } },
  ];
  let wall: Mesh | null = null;
  if (options.wall) {
    wall = new Mesh(new BoxGeometry(2, 2, 0.1), material);
    wall.position.set(0.5, 1, -1);
    root.add(wall);
    definitions.push({ id: 'wall', bodyType: 'fixed', sensor: false, pose: { position: { x: 0.5, y: 1, z: -1 }, rotation: identity }, shape: { type: 'box', halfExtents: { x: 1, y: 1, z: 0.05 } } });
  }
  const metadata: HospitalWorld = {
    id: 'test-world', root, bounds: { min: { x: -5, y: 0, z: -5 }, max: { x: 5, y: 3, z: 5 } },
    rooms: [], colliders: definitions, interactables: [marker], doors: options.inspect ? [] : [door], hidingLocations: [], entitySpawns: [], patrolRoutes: [],
    playerSpawn: { position: { x: 0.5, y: 0.01, z: 0 }, yaw: 0 },
  };
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const physics = createPhysicsAdapter(world, definitions);
  const events = createEventBus();
  const body = physics.createCharacter({ position: metadata.playerSpawn.position, radius: 0.28, height: 1.8 });
  const player = createPlayerController({ body, camera: new PerspectiveCamera(70, 1, 0.05, 100), spawn: metadata.playerSpawn, events });
  const interactions = createInteractionSystem({ world: metadata, player, physics, events });
  return {
    root, pivot, metadata, world, physics, events, player, interactions,
    release() {
      interactions.dispose(); player.dispose(); physics.dispose(); events.dispose(); world.free();
      geometry.dispose(); material.dispose(); wall?.geometry.dispose();
    },
  };
}

describe('camera interactions', () => {
  it('resolves descendant geometry and opens a door with colliders following its hinge', () => {
    const f = fixture();
    try {
      const results: InteractionEvent[] = [];
      f.events.on('interaction:completed', (event) => results.push(event));
      expect(f.interactions.getPrompt()).toMatchObject({ targetId: 'door', action: 'open', available: true });
      f.interactions.interact(0);
      expect(f.interactions.getDoorState('door')).toBe('opening');
      for (let frame = 1; frame <= 31; frame += 1) f.interactions.fixedUpdate({ deltaSeconds: 1 / 60, elapsedSeconds: frame / 60 });
      expect(f.interactions.getDoorState('door')).toBe('open');
      expect(f.physics.getColliderPose('door-body').position.x).toBeCloseTo(0, 3);
      expect(f.physics.getColliderPose('door-body').position.z).toBeCloseTo(-2.5, 3);
      expect(f.pivot.quaternion.y).toBeCloseTo(Math.SQRT1_2);
      expect(results.at(-1)?.outcome).toBe('completed');
    } finally { f.release(); }
  });

  it('blocks occluded, distant and forged external requests', () => {
    const f = fixture({ wall: true });
    try {
      const results: InteractionEvent[] = [];
      f.events.on('interaction:completed', (event) => results.push(event));
      expect(f.interactions.getPrompt()).toBeNull();
      f.events.emit('interaction:request', { playerId: 'player', targetId: 'door', action: 'open' });
      expect(results).toHaveLength(0);
      f.interactions.fixedUpdate({ deltaSeconds: 1 / 60, elapsedSeconds: 1 });
      expect(results.at(-1)).toMatchObject({ outcome: 'denied' });
      expect(f.interactions.getDoorState('door')).toBe('closed');
    } finally { f.release(); }
    const distant = fixture();
    try {
      distant.player.body.setPosition({ x: 0.5, y: 0.01, z: 2 });
      distant.player.update({ deltaSeconds: 1 / 60, elapsedSeconds: 1 });
      expect(distant.interactions.getPrompt()).toBeNull();
    } finally { distant.release(); }
  });

  it('enforces lock and optional requirements and exposes inspection without fabricated contents', () => {
    const locked = fixture({ locked: true });
    try {
      expect(locked.interactions.getPrompt()).toMatchObject({ available: false, reason: 'Locked' });
      locked.interactions.interact(0);
      expect(locked.interactions.getDoorState('door')).toBe('locked');
    } finally { locked.release(); }
    const required = fixture({ requirement: true });
    try { expect(required.interactions.getPrompt()).toMatchObject({ available: false, reason: 'Power is required' }); }
    finally { required.release(); }
    const cabinet = fixture({ inspect: true });
    try {
      const results: InteractionEvent[] = [];
      cabinet.events.on('interaction:completed', (event) => results.push(event));
      expect(cabinet.interactions.getPrompt()).toMatchObject({ targetId: 'cabinet', action: 'inspect' });
      cabinet.interactions.interact(0);
      expect(results.at(-1)).toMatchObject({ targetId: 'cabinet', action: 'inspect', outcome: 'completed' });
    } finally { cabinet.release(); }
  });

  it('stops a swinging door before another actor and allows reversing the blocked motion', () => {
    const f = fixture();
    try {
      const blocker = f.physics.createCharacter({ position: { x: 0.1, y: 0.01, z: -2.6 }, radius: 0.28, height: 1.8 });
      f.interactions.interact(0);
      for (let frame = 1; frame <= 40; frame += 1) f.interactions.fixedUpdate({ deltaSeconds: 1 / 60, elapsedSeconds: frame / 60 });
      expect(f.interactions.getDoorState('door')).toBe('blocked');
      expect(f.physics.getColliderPose('door-body').position.z).toBeGreaterThan(-2.5);
      // Aim at the partially opened leaf to reverse it.
      const target = f.physics.getColliderPose('door-body').position;
      f.player.getSnapshot().camera.lookAt(target.x, 1.4, target.z);
      expect(f.interactions.getPrompt()?.action).toBe('close');
      f.interactions.interact(1);
      for (let frame = 1; frame <= 40; frame += 1) f.interactions.fixedUpdate({ deltaSeconds: 1 / 60, elapsedSeconds: 1 + frame / 60 });
      expect(f.interactions.getDoorState('door')).toBe('closed');
      blocker.dispose();
    } finally { f.release(); }
  });
});
