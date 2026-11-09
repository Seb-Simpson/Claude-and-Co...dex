import RAPIER from '@dimforge/rapier3d-compat';
import { BoxGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { HidingStateEvent, InteractionEvent, PlayerNoiseEvent, Pose, SpawnPose, Vec3 } from '../../src/contracts';
import { createEventBus } from '../../src/integration';
import { createInteractionSystem } from '../../src/gameplay/interactions';
import { createPlayerController } from '../../src/gameplay/player';
import { createPhysicsAdapter } from '../../src/physics';
import { createHospitalWorld } from '../../src/world';

beforeAll(async () => { await RAPIER.init(); });

function fixture(witnesses?: () => readonly string[]) {
  const hospital = createHospitalWorld({ textures: false });
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const physics = createPhysicsAdapter(world, hospital.world.colliders);
  const events = createEventBus();
  const body = physics.createCharacter({ position: hospital.world.playerSpawn.position, radius: 0.28, height: 1.8 });
  const player = createPlayerController({ body, camera: new PerspectiveCamera(70, 1, 0.05, 100), spawn: hospital.world.playerSpawn, events });
  const interactions = createInteractionSystem({ world: hospital.world, player, physics, events, ...(witnesses ? { witnesses } : {}) });
  let time = 0;
  return {
    hospital, world, physics, events, body, player, interactions,
    get time() { return time; },
    moveTo(pose: SpawnPose) {
      expect(body.canOccupy(pose.position), `Standing position ${JSON.stringify(pose.position)}`).toBe(true);
      body.setPosition(pose.position); player.setViewRotation({ yaw: pose.yaw, pitch: 0 });
      player.update({ deltaSeconds: 1 / 60, elapsedSeconds: time });
    },
    aimAt(point: Vec3) { player.getSnapshot().camera.lookAt(point.x, point.y, point.z); },
    advance(seconds: number) {
      const steps = Math.ceil(seconds * 60);
      for (let index = 0; index < steps; index += 1) {
        time += 1 / 60;
        const frame = { deltaSeconds: 1 / 60, elapsedSeconds: time };
        interactions.fixedUpdate(frame); player.update(frame);
      }
    },
    release() { interactions.dispose(); player.dispose(); physics.dispose(); events.dispose(); world.free(); hospital.dispose(); },
  };
}

const matrixFor = (pose: Pose): Matrix4 => new Matrix4().compose(
  new Vector3(pose.position.x, pose.position.y, pose.position.z),
  new Quaternion(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w), new Vector3(1, 1, 1),
);
function expectPose(actual: Pose, matrix: Matrix4): void {
  const expectedPosition = new Vector3();
  const expectedRotation = new Quaternion();
  matrix.decompose(expectedPosition, expectedRotation, new Vector3());
  expect(new Vector3(actual.position.x, actual.position.y, actual.position.z).distanceTo(expectedPosition)).toBeLessThan(0.00001);
  const rotation = new Quaternion(actual.rotation.x, actual.rotation.y, actual.rotation.z, actual.rotation.w).normalize();
  expect(rotation.angleTo(expectedRotation.normalize())).toBeLessThan(0.00001);
}

describe('real hospital interactions and hiding', () => {
  it('enters and safely exits every authored locker and invisible bed marker through the camera interaction ray', () => {
    const f = fixture(() => ['patient']);
    try {
      const changes: HidingStateEvent[] = [];
      const results: InteractionEvent[] = [];
      f.events.on('hiding:state', (event) => changes.push(event));
      f.events.on('interaction:completed', (event) => results.push(event));
      expect(f.hospital.world.hidingLocations).toHaveLength(7); // NW-004A: + Records 112 archive cupboard
      expect(f.hospital.world.hidingLocations.filter((spot) => spot.type === 'locker')).toHaveLength(5);
      for (const spot of f.hospital.world.hidingLocations) {
        const marker = f.hospital.world.interactables.find((candidate) => candidate.id === spot.interactableId)!;
        const firstExit = spot.exitCandidates[0]!;
        f.moveTo(firstExit);
        f.aimAt({ x: spot.playerPosition.x, y: spot.type === 'bed' ? 0.45 : 1.2, z: spot.playerPosition.z });
        if (spot.type === 'bed') {
          expect(marker.object).toBeInstanceOf(Mesh);
          expect((marker.object as Mesh).material).toMatchObject({ visible: false });
        }
        expect(f.interactions.getPrompt(), spot.id).toMatchObject({ targetId: marker.id, action: 'enter-hiding', available: true });
        f.interactions.interact(f.time);
        expect(f.player.getSnapshot().hiding, spot.id).toEqual({ state: 'entering', spotId: spot.id });
        expect(f.body.getPosition()).toMatchObject(spot.playerPosition);
        // A reservation remains present for other actors; only this spot's authored
        // furniture envelope may overlap the concealed player.
        expect(f.physics.isPositionFree(spot.playerPosition, f.body.radius, f.body.height, spot.colliderIds, false)).toBe(true);
        expect(f.physics.isPositionFree(spot.playerPosition, f.body.radius, f.body.height, spot.colliderIds, true)).toBe(false);
        const position = f.body.getPosition();
        f.player.fixedUpdate({ deltaSeconds: 1 / 60, elapsedSeconds: f.time }, { forward: 1, right: 1, sprint: true, crouch: false });
        expect(f.body.getPosition()).toEqual(position);
        f.advance(0.1);
        const lockerDoor = spot.type === 'locker' ? marker.object.getObjectByName('door') : undefined;
        if (lockerDoor) expect(Math.abs(lockerDoor.rotation.y)).toBeGreaterThan(0.5);
        f.advance(0.9);
        expect(f.player.getSnapshot().hiding.state).toBe('hidden');
        expect(f.player.getSnapshot().camera.position.distanceTo(new Vector3().copy(spot.cameraPose.position))).toBeLessThan(0.001);
        if (lockerDoor) expect(Math.abs(lockerDoor.rotation.y)).toBeLessThan(0.00001);
        expect(f.interactions.getPrompt()).toMatchObject({ action: 'exit-hiding', available: true });
        f.interactions.interact(f.time);
        expect(f.player.getSnapshot().hiding.state).toBe('exiting');
        expect(f.body.getPosition()).toMatchObject(firstExit.position);
        expect(f.body.canOccupy(f.body.getPosition())).toBe(true);
        expect(f.physics.hasSupport(f.body.getPosition(), f.body.radius)).toBe(true);
        f.advance(0.1);
        if (lockerDoor) expect(Math.abs(lockerDoor.rotation.y)).toBeGreaterThan(0.5);
        f.advance(0.6);
        expect(f.player.getSnapshot().hiding.state).toBe('outside');
        expect(f.interactions.hiding.getOccupancy(spot.id).occupantId).toBeNull();
        if (lockerDoor) expect(Math.abs(lockerDoor.rotation.y)).toBeLessThan(0.00001);
      }
      expect(results.filter((event) => event.outcome === 'completed')).toHaveLength(14);
      expect(changes).toHaveLength(28);
      expect(changes.every((event) => event.witnessedBy.join(',') === 'patient')).toBe(true);
    } finally { f.release(); }
  });

  it('keeps a player hidden while every exit is occupied, then restores a valid supported exit', () => {
    const f = fixture();
    try {
      const spot = f.hospital.world.hidingLocations.find((candidate) => candidate.id === 'nw:hiding:storage-b')!;
      f.moveTo(spot.exitCandidates[0]!);
      f.aimAt({ x: spot.playerPosition.x, y: 1.2, z: spot.playerPosition.z });
      f.interactions.interact(f.time); f.advance(0.5);
      const blockers = spot.exitCandidates.map((candidate) => f.physics.createCharacter({ position: candidate.position, radius: 0.3, height: 1.8 }));
      f.interactions.interact(f.time);
      expect(f.player.getSnapshot().hiding.state).toBe('hidden');
      expect(f.body.getPosition()).toMatchObject(spot.playerPosition);
      for (const blocker of blockers) blocker.dispose();
      f.interactions.interact(f.time); f.advance(0.5);
      expect(f.player.getSnapshot().hiding.state).toBe('outside');
      expect(f.body.canOccupy(f.body.getPosition())).toBe(true);
    } finally { f.release(); }
  });

  it('does not resolve a nearby locker through the actual room partition', () => {
    const f = fixture();
    try {
      f.moveTo({ position: { x: 10.5, y: 0, z: -3.55 }, yaw: 0 });
      f.aimAt({ x: 11.375, y: 1.2, z: -3.55 });
      expect(f.interactions.getPrompt()).toBeNull();
    } finally { f.release(); }
  });

  it('inspects the actual drawer and cabinets with their own contextual prompts and events', () => {
    const f = fixture();
    try {
      const results: InteractionEvent[] = [];
      f.events.on('interaction:completed', (event) => results.push(event));
      for (const [id, x, z] of [
        ['nw:drawer:station-drawer', -4.7, -4.8],
        ['nw:cabinet:drug-cupboard', -1.25, -4.3],
        ['nw:cabinet:treatment-cabinet', 4.9, -4.9],
      ] as const) {
        const marker = f.hospital.world.interactables.find((candidate) => candidate.id === id)!;
        f.moveTo({ position: { x, y: 0, z }, yaw: 0 });
        f.aimAt(marker.object.position);
        expect(f.interactions.getPrompt()).toMatchObject({ targetId: id, action: 'inspect', text: marker.prompt, available: true });
        f.interactions.interact(f.time);
        expect(results.at(-1)).toMatchObject({ targetId: id, action: 'inspect', outcome: 'completed' });
      }
      expect(results).toHaveLength(3);
    } finally { f.release(); }
  });

  it('chooses the nearest registered marker and skips targets with an invisible ancestor', () => {
    const f = fixture();
    const geometry = new BoxGeometry(0.12, 0.12, 0.12);
    const material = new MeshBasicMaterial();
    const ancestor = new Group();
    const near = new Mesh(geometry, material);
    ancestor.add(near); f.hospital.world.root.add(ancestor);
    near.position.set(-4.7, 1.125, -5.26);
    f.interactions.dispose();
    const interactions = createInteractionSystem({
      world: { ...f.hospital.world, interactables: [...f.hospital.world.interactables, {
        id: 'test:near-marker', type: 'inspect', object: near, prompt: 'Inspect nearby object', range: 2,
      }] },
      player: f.player, physics: f.physics, events: f.events,
    });
    try {
      f.moveTo({ position: { x: -4.7, y: 0, z: -4.8 }, yaw: 0 });
      f.aimAt({ x: -4.7, y: 0.6, z: -5.72 });
      expect(interactions.getPrompt()).toMatchObject({ targetId: 'test:near-marker' });
      ancestor.visible = false;
      expect(interactions.getPrompt()).toMatchObject({ targetId: 'nw:drawer:station-drawer' });
    } finally {
      interactions.dispose(); ancestor.removeFromParent(); geometry.dispose(); material.dispose(); f.release();
    }
  });

  it('preserves initial door collider poses and keeps a real initially open leaf aligned through closing and reopening', () => {
    const f = fixture();
    try {
      expect(f.hospital.world.colliders.length).toBeGreaterThanOrEqual(220);
      for (const door of f.hospital.world.doors) for (const id of door.colliderIds) {
        const definition = f.hospital.world.colliders.find((collider) => collider.id === id)!;
        expectPose(f.physics.getColliderPose(id), matrixFor(definition.pose));
      }
      const door = f.hospital.world.doors.find((candidate) => candidate.id === 'nw:door:room-104')!;
      const initialCollider = matrixFor(f.physics.getColliderPose(door.colliderIds[0]!));
      f.moveTo({ position: { x: -12.05, y: 0, z: 0.5 }, yaw: 0 });
      const initialCenter = f.physics.getColliderPose(door.colliderIds[0]!).position;
      f.aimAt({ ...initialCenter, y: 1.4 });
      expect(f.interactions.getPrompt()).toMatchObject({ targetId: door.id, action: 'close' });
      f.interactions.interact(f.time); f.advance(1.1);
      expect(f.interactions.getDoorState(door.id)).toBe('closed');
      const expectedClosed = matrixFor(door.closedPose).multiply(matrixFor(door.openPose).invert()).multiply(initialCollider);
      expectPose(f.physics.getColliderPose(door.colliderIds[0]!), expectedClosed);
      const throughDoor = () => f.physics.isSegmentFree({ x: -12.05, y: 0, z: 0.5 }, { x: -12.05, y: 0, z: 2.7 }, f.body.radius, f.body.height, [], false);
      expect(throughDoor()).toBe(false);
      const closedCenter = f.physics.getColliderPose(door.colliderIds[0]!).position;
      f.aimAt({ ...closedCenter, y: 1.4 });
      expect(f.interactions.getPrompt()).toMatchObject({ targetId: door.id, action: 'open' });
      f.interactions.interact(f.time); f.advance(1.1);
      expect(f.interactions.getDoorState(door.id)).toBe('open');
      expectPose(f.physics.getColliderPose(door.colliderIds[0]!), initialCollider);
      expect(throughDoor()).toBe(true);
    } finally { f.release(); }
  });

  it('allows trusted entity door requests through real collision animation without inventing player noise or bypassing locks', () => {
    const f = fixture();
    try {
      const noise: PlayerNoiseEvent[] = [];
      const results: InteractionEvent[] = [];
      f.events.on('player:noise', (event) => noise.push(event));
      f.events.on('interaction:completed', (event) => results.push(event));
      const door = f.hospital.world.doors.find((candidate) => candidate.id === 'nw:door:maintenance-west')!;
      const original = matrixFor(f.physics.getColliderPose(door.colliderIds[0]!));
      door.object.updateWorldMatrix(true, false);
      const colliderLocal = door.object.matrixWorld.clone().invert().multiply(original);
      expect(f.interactions.getDoorState(door.id)).toBe(door.initialState);
      if (door.initialState === 'open') {
        f.moveTo({ position: { x: -5.7, y: 0, z: 7.2 }, yaw: 0 });
        const initialCenter = f.physics.getColliderPose(door.colliderIds[0]!).position;
        f.aimAt({ ...initialCenter, y: 1.4 });
        expect(f.interactions.getPrompt()).toMatchObject({ targetId: door.id, action: 'close' });
        f.interactions.interact(f.time); f.advance(1.1);
        expect(results.at(-1)).toMatchObject({ targetId: door.id, action: 'close', outcome: 'completed' });
        expect(noise).toHaveLength(1);
      }
      expect(f.interactions.getDoorState(door.id)).toBe('closed');
      expectPose(f.physics.getColliderPose(door.colliderIds[0]!), matrixFor(door.closedPose).multiply(colliderLocal));
      const throughDoor = () => f.physics.isSegmentFree({ x: -5.7, y: 0, z: 7.2 }, { x: -5.7, y: 0, z: 5.4 }, f.body.radius, f.body.height, [], false);
      expect(throughDoor()).toBe(false);
      // Isolate the trusted actor request from the real player interaction that
      // closed the leaf when its authored starting state was open.
      noise.length = 0; results.length = 0;
      expect(f.interactions.requestDoorOpen('nw:door:stairwell-b')).toBe(false);
      expect(f.interactions.getDoorState('nw:door:stairwell-b')).toBe('locked');
      expect(f.interactions.requestDoorOpen('missing')).toBe(false);
      expect(f.interactions.requestDoorOpen(door.id)).toBe(true);
      f.advance(1.1);
      expect(f.interactions.getDoorState(door.id)).toBe('open');
      expectPose(f.physics.getColliderPose(door.colliderIds[0]!), matrixFor(door.openPose).multiply(colliderLocal));
      if (door.initialState === 'open') expectPose(f.physics.getColliderPose(door.colliderIds[0]!), original);
      expect(throughDoor()).toBe(true);
      expect(noise).toHaveLength(0);
      expect(results).toHaveLength(0);
      f.interactions.dispose();
      expect(f.interactions.requestDoorOpen(door.id)).toBe(false);
    } finally { f.release(); }
  });
});
