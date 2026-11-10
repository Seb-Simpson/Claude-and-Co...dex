import RAPIER from '@dimforge/rapier3d-compat';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Quaternion } from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ColliderDefinition, DoorMarker, HospitalWorld, InteractionEvent, InteractionRequest } from '../../src/contracts';
import { createInteractionSystem } from '../../src/gameplay/interactions';
import type { InteractionOptions } from '../../src/gameplay/interactions';
import { createPlayerController } from '../../src/gameplay/player';
import { createEventBus } from '../../src/integration';
import { createPhysicsAdapter } from '../../src/physics';

beforeAll(async () => { await RAPIER.init(); });
const identity = { x: 0, y: 0, z: 0, w: 1 };
const quarterTurn = new Quaternion().setFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2);

/** Isolated test door. The authored open collider really starts at its hinge's open pose. */
function fixture(options: {
  authoredOpen?: boolean;
  locked?: boolean;
  wall?: boolean;
  blocker?: boolean;
  initialDoorStates?: InteractionOptions['initialDoorStates'];
  handleInteraction?: InteractionOptions['handleInteraction'];
} = {}) {
  const root = new Group(), pivot = new Group();
  pivot.position.set(0, 0, -2);
  if (options.authoredOpen) pivot.quaternion.copy(quarterTurn);
  root.add(pivot);
  const geometry = new BoxGeometry(1, 2, 0.1), material = new MeshBasicMaterial();
  const leaf = new Mesh(geometry, material);
  leaf.position.set(0.5, 1, 0);
  pivot.add(leaf);
  const door: DoorMarker = {
    id: 'opening-door', type: 'door', object: pivot, prompt: 'Open', range: 2.5,
    colliderIds: ['opening-door-body'], initialState: options.authoredOpen ? 'open' : options.locked ? 'locked' : 'closed',
    durationSeconds: 0.5,
    closedPose: { position: { x: 0, y: 0, z: -2 }, rotation: identity },
    openPose: { position: { x: 0, y: 0, z: -2 }, rotation: quarterTurn },
  };
  const definitions: ColliderDefinition[] = [
    { id: 'floor', bodyType: 'fixed', sensor: false, shape: { type: 'box', halfExtents: { x: 5, y: 0.1, z: 5 } }, pose: { position: { x: 0, y: -0.1, z: 0 }, rotation: identity } },
    { id: 'opening-door-body', bodyType: 'kinematic', sensor: false, shape: { type: 'box', halfExtents: { x: 0.5, y: 1, z: 0.05 } },
      pose: options.authoredOpen
        ? { position: { x: 0, y: 1, z: -2.5 }, rotation: quarterTurn }
        : { position: { x: 0.5, y: 1, z: -2 }, rotation: identity } },
  ];
  if (options.wall) definitions.push({ id: 'occluding-wall', bodyType: 'fixed', sensor: false,
    shape: { type: 'box', halfExtents: { x: 1, y: 1, z: 0.05 } }, pose: { position: { x: 0.5, y: 1, z: -1 }, rotation: identity } });
  const metadata: HospitalWorld = {
    id: 'opening-interaction-fixture', root, bounds: { min: { x: -5, y: 0, z: -5 }, max: { x: 5, y: 3, z: 5 } },
    rooms: [], colliders: definitions, interactables: [door], doors: [door], hidingLocations: [], entitySpawns: [], patrolRoutes: [],
    playerSpawn: { position: { x: 0.5, y: 0.01, z: 0 }, yaw: 0 },
  };
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const physics = createPhysicsAdapter(world, definitions), events = createEventBus();
  const body = physics.createCharacter({ position: metadata.playerSpawn.position, radius: 0.28, height: 1.8 });
  const player = createPlayerController({ id: 'opening-player', body, camera: new PerspectiveCamera(70, 1, 0.05, 100), spawn: metadata.playerSpawn, events });
  const blocker = options.blocker ? physics.createCharacter({ position: { x: 0.5, y: 0.01, z: -2 }, radius: 0.28, height: 1.8 }) : null;
  function releaseBase(): void {
    blocker?.dispose(); player.dispose(); physics.dispose(); events.dispose(); world.free(); geometry.dispose(); material.dispose();
  }
  let interactions: ReturnType<typeof createInteractionSystem>;
  try {
    interactions = createInteractionSystem({ world: metadata, player, physics, events,
      ...(options.initialDoorStates ? { initialDoorStates: options.initialDoorStates } : {}),
      ...(options.handleInteraction ? { handleInteraction: options.handleInteraction } : {}),
    });
  } catch (error) { releaseBase(); throw error; }
  return {
    root, pivot, leaf, physics, events, player, interactions,
    tick(count = 1): void {
      for (let index = 0; index < count; index += 1) interactions.fixedUpdate({ deltaSeconds: 1 / 60, elapsedSeconds: (index + 1) / 60 });
    },
    release(): void { interactions.dispose(); releaseBase(); },
  };
}

const request: InteractionRequest = { playerId: 'opening-player', targetId: 'opening-door', action: 'open' };

describe('opening actions retain shared interaction authority', () => {
  it('denies queued content interactions throughout a real camera lease and restores them on release', () => {
    const handle = vi.fn(() => true);
    const f = fixture({ locked: true, handleInteraction: handle });
    try {
      const results: InteractionEvent[] = [];
      f.events.on('interaction:completed', event => results.push(event));
      expect(f.interactions.getPrompt()?.targetId).toBe(request.targetId);
      // Even a request queued just before the lease must be checked again at execution.
      f.events.emit('interaction:request', request);
      const lease = f.player.acquireCameraControl();
      expect(lease).not.toBeNull();
      expect(f.player.controlsLocked).toBe(true);
      expect(f.interactions.getPrompt()).toBeNull();
      f.tick();
      f.interactions.interact(0.5);
      expect(handle).not.toHaveBeenCalled();
      expect(results).toContainEqual(expect.objectContaining({ targetId: request.targetId, outcome: 'denied' }));
      expect(f.interactions.getDoorState(request.targetId)).toBe('locked');
      lease!.release();
      expect(f.player.controlsLocked).toBe(false);
      expect(f.interactions.getPrompt()?.targetId).toBe(request.targetId);
      f.interactions.interact(1);
      expect(handle).toHaveBeenCalledExactlyOnceWith(request, 1);
    } finally { f.release(); }
  });

  it('lets content respond physically to a valid locked attempt without opening the door', () => {
    const handle = vi.fn(() => true);
    const f = fixture({ locked: true, handleInteraction: handle });
    try {
      const results: InteractionEvent[] = [];
      f.events.on('interaction:completed', event => results.push(event));
      expect(f.interactions.getPrompt()).toMatchObject({ targetId: request.targetId, available: false, reason: 'Locked' });
      f.interactions.interact(4.25);
      expect(handle).toHaveBeenCalledExactlyOnceWith(request, 4.25);
      expect(f.interactions.getDoorState(request.targetId)).toBe('locked');
      expect(results).toEqual([]);
    } finally { f.release(); }
  });

  it('falls back to ordinary lock enforcement if the content hook declines a valid request', () => {
    const handle = vi.fn(() => false);
    const f = fixture({ locked: true, handleInteraction: handle });
    try {
      const results: InteractionEvent[] = [];
      f.events.on('interaction:completed', event => results.push(event));
      f.interactions.interact(1);
      expect(handle).toHaveBeenCalledOnce();
      expect(results).toContainEqual(expect.objectContaining({ outcome: 'denied', reason: 'Locked' }));
      expect(f.interactions.requestDoorOpen(request.targetId)).toBe(false);
    } finally { f.release(); }
  });

  it('rejects through-wall requests before any content hook sees them', () => {
    const handle = vi.fn(() => true);
    const f = fixture({ locked: true, wall: true, handleInteraction: handle });
    try {
      expect(f.interactions.getPrompt()).toBeNull();
      f.events.emit('interaction:request', request);
      f.tick();
      expect(handle).not.toHaveBeenCalled();
      expect(f.interactions.getDoorState(request.targetId)).toBe('locked');
    } finally { f.release(); }
  });

  it('rejects out-of-range and invisible target requests before the content hook', () => {
    const handle = vi.fn(() => true);
    const f = fixture({ locked: true, handleInteraction: handle });
    try {
      f.player.body.setPosition({ x: 0.5, y: 0.01, z: 2 });
      f.player.update({ deltaSeconds: 0.1, elapsedSeconds: 1 });
      f.events.emit('interaction:request', request);
      f.tick();
      expect(handle).not.toHaveBeenCalled();
      f.player.body.setPosition({ x: 0.5, y: 0.01, z: 0 });
      f.player.update({ deltaSeconds: 0.1, elapsedSeconds: 2 });
      f.leaf.visible = false;
      f.events.emit('interaction:request', request);
      f.tick();
      expect(handle).not.toHaveBeenCalled();
    } finally { f.release(); }
  });

  it('rejects forged player, object and action identities before reaching trusted content', () => {
    const handle = vi.fn(() => true);
    const f = fixture({ locked: true, handleInteraction: handle });
    try {
      const results: InteractionEvent[] = [];
      f.events.on('interaction:completed', event => results.push(event));
      for (const forged of [
        { ...request, playerId: 'another-player' },
        { ...request, targetId: 'reader-behind-wall' },
        { ...request, action: 'close' as const },
      ]) f.events.emit('interaction:request', forged);
      f.tick();
      expect(handle).not.toHaveBeenCalled();
      expect(results).toHaveLength(3);
      expect(results.every(event => event.outcome === 'denied')).toBe(true);
    } finally { f.release(); }
  });
});

describe('opening door startup and lifecycle', () => {
  it('closes an authored-open hinge and collider together before locking', () => {
    const f = fixture({ authoredOpen: true, initialDoorStates: { 'opening-door': 'locked' } });
    try {
      expect(f.interactions.getDoorState(request.targetId)).toBe('locked');
      expect(f.pivot.quaternion.angleTo(new Quaternion())).toBeLessThan(1e-6);
      expect(f.physics.getColliderPose('opening-door-body').position).toMatchObject({ x: expect.closeTo(0.5), y: expect.closeTo(1), z: expect.closeTo(-2) });
      expect(f.physics.hasLineOfSight({ x: 0.5, y: 1, z: -1 }, { x: 0.5, y: 1, z: -3 })).toBe(false);
      f.interactions.interact(0);
      f.tick(40);
      expect(f.interactions.getDoorState(request.targetId)).toBe('locked');
    } finally { f.release(); }
  });

  it('unlocks without changing pose, then uses normal swept door operation', () => {
    const f = fixture({ authoredOpen: true, initialDoorStates: { 'opening-door': 'locked' } });
    try {
      const closedPose = f.physics.getColliderPose('opening-door-body');
      expect(f.interactions.setDoorLocked(request.targetId, false)).toBe(true);
      expect(f.interactions.getDoorState(request.targetId)).toBe('closed');
      expect(f.physics.getColliderPose('opening-door-body')).toEqual(closedPose);
      f.interactions.interact(0);
      expect(f.interactions.getDoorState(request.targetId)).toBe('opening');
      f.tick(40);
      expect(f.interactions.getDoorState(request.targetId)).toBe('open');
      expect(f.pivot.quaternion.angleTo(quarterTurn)).toBeLessThan(1e-6);
      expect(f.physics.getColliderPose('opening-door-body').position.x).toBeCloseTo(0);
      expect(f.physics.getColliderPose('opening-door-body').position.z).toBeCloseTo(-2.5);
    } finally { f.release(); }
  });

  it('cannot lock an opening or open door, or silently invent missing doors', () => {
    const f = fixture();
    try {
      f.interactions.interact(0);
      expect(f.interactions.setDoorLocked(request.targetId, true)).toBe(false);
      expect(f.interactions.getDoorState(request.targetId)).toBe('opening');
      f.tick(40);
      expect(f.interactions.setDoorLocked(request.targetId, true)).toBe(false);
      expect(f.interactions.getDoorState(request.targetId)).toBe('open');
      expect(f.interactions.setDoorLocked('missing-door', true)).toBe(false);
    } finally { f.release(); }
  });

  it('refuses startup restoration that would close a door through an actor', () => {
    expect(() => fixture({ authoredOpen: true, blocker: true, initialDoorStates: { 'opening-door': 'locked' } }))
      .toThrow('Opening door pose obstructed');
  });

  it('restores owned visual transforms and unregisters content handling on dispose', () => {
    const handle = vi.fn(() => true);
    const f = fixture({ authoredOpen: true, initialDoorStates: { 'opening-door': 'locked' }, handleInteraction: handle });
    try {
      f.interactions.dispose();
      f.interactions.dispose();
      expect(f.pivot.quaternion.angleTo(quarterTurn)).toBeLessThan(1e-6);
      f.events.emit('interaction:request', request);
      f.tick();
      f.interactions.interact(0);
      expect(handle).not.toHaveBeenCalled();
      expect(f.interactions.setDoorLocked(request.targetId, false)).toBe(false);
      expect(f.interactions.requestDoorOpen(request.targetId)).toBe(false);
    } finally { f.release(); }
  });
});
