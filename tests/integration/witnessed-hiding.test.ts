import RAPIER from '@dimforge/rapier3d-compat';
import { PerspectiveCamera } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Vec3 } from '../../src/contracts';
import { createEntitySystem } from '../../src/entities';
import type { EntitySystem } from '../../src/entities';
import { createInteractionSystem } from '../../src/gameplay/interactions';
import { createPlayerController } from '../../src/gameplay/player';
import { createEventBus } from '../../src/integration/events';
import { createNavigationProvider, createPhysicsAdapter } from '../../src/physics';
import { createHospitalWorld } from '../../src/world';

beforeAll(async () => { await RAPIER.init(); });
const distance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe('actual hospital witnessed hiding inspection', () => {
  for (const scenario of [
    { id: 'nw:hiding:room-105-bed-b', position: { x: -7.85, y: 0, z: -2.95 }, yaw: 0 },
    { id: 'nw:hiding:room-106-bed', position: { x: -8.3, y: 0, z: 4.15 }, yaw: Math.PI / 2 },
    { id: 'nw:hiding:storage-b', position: { x: 12.975, y: 0, z: -4.2 }, yaw: Math.PI / 2 },
    { id: 'nw:hiding:room-106-bed', position: { x: -8.3, y: 0, z: 4.15 }, yaw: Math.PI / 2, blockExits: true },
    { id: 'nw:hiding:room-106-bed', position: { x: -7.4, y: 0, z: 2.3 }, yaw: Math.atan2(1.6, -1.85), remoteExit: true },
  ]) it(`inspects a witnessed entry into ${scenario.id}${'blockExits' in scenario ? ' only after the blocked approach clears' : 'remoteExit' in scenario ? ' without accepting a remote inspection pose' : ''}`, () => {
    const hospital = createHospitalWorld({ textures: false });
    const authoredSpot = hospital.world.hidingLocations.find((value) => value.id === scenario.id)!;
    // Deliberately malformed integration metadata must not grant an inspection
    // from a distant part of this same room, even when that pose is navigable.
    const spot = 'remoteExit' in scenario ? { ...authoredSpot,
      exitCandidates: [{ position: scenario.position, yaw: scenario.yaw }],
    } : authoredSpot;
    const source = hospital.world.entitySpawns.find((value) => value.type === 'patient')!;
    // Only the antagonist spawn is relocated for this encounter fixture. All
    // furniture, authored exit poses, hiding metadata and collision stay real.
    const world = { ...hospital.world, entitySpawns: [{ ...source, position: scenario.position, yaw: scenario.yaw }],
      hidingLocations: hospital.world.hidingLocations.map((value) => value.id === spot.id ? spot : value),
    };
    const rapier = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const physics = createPhysicsAdapter(rapier, world.colliders);
    const events = createEventBus();
    expect(physics.isPositionFree(scenario.position, 0.3, 1.8)).toBe(true);
    const exit = authoredSpot.exitCandidates[0]!;
    expect(physics.isPositionFree(exit.position, 0.28, 1.8)).toBe(true);
    const player = createPlayerController({
      body: physics.createCharacter({ position: exit.position, radius: 0.28, height: 1.8 }),
      camera: new PerspectiveCamera(), spawn: exit, events,
    });
    let witnessEntities: EntitySystem | null = null;
    const interactions = createInteractionSystem({ world, physics, player, events,
      witnesses: (location) => witnessEntities?.witnessesFor(location) ?? [],
    });
    const navigation = createNavigationProvider(physics, world.bounds, { cellSize: 0.25 });
    const entities = createEntitySystem({ world, physics, navigation, player, events });
    witnessEntities = entities;
    const captured: string[] = [];
    const blockers: ReturnType<typeof physics.createCharacter>[] = [];
    events.on('player:captured', (event) => { captured.push(event.entityId); player.setCaptured(true); });
    try {
      player.update({ deltaSeconds: 1 / 60, elapsedSeconds: 0 });
      expect(entities.witnessesFor(spot)).toEqual([source.entityId]);
      expect(interactions.hiding.enter(spot.id, 0)).toBe(true);
      expect(entities.getSnapshots()[0]?.lastKnownPlayer?.source).toBe('witnessed-hiding');
      if ('blockExits' in scenario) {
        for (const candidate of spot.exitCandidates) {
          blockers.push(physics.createCharacter({ position: candidate.position, radius: 0.35, height: 1.8 }));
        }
      }
      for (let tick = 1; tick <= 360; tick++) {
        const frame = { deltaSeconds: 1 / 60, elapsedSeconds: tick / 60 };
        interactions.fixedUpdate(frame); entities.fixedUpdate(frame); rapier.step();
        if (tick === 60) expect(captured).toHaveLength(0);
      }
      const patient = entities.getSnapshots()[0]!;
      const eye = { ...patient.position, y: patient.position.y + 1.6 };
      const concealed = { ...spot.playerPosition, y: spot.playerPosition.y + 0.7 };
      const diagnosis = JSON.stringify({ patient: patient.position, state: patient.state,
        exitDistance: distance(patient.position, exit.position), anchorDistance: distance(patient.position, spot.playerPosition),
        inspectionLineOfSight: physics.hasLineOfSight(eye, concealed, spot.colliderIds), captured });
      if ('remoteExit' in scenario) {
        expect(captured, diagnosis).toHaveLength(0);
        expect(distance(patient.position, spot.playerPosition)).toBeGreaterThan(3);
        return;
      }
      if ('blockExits' in scenario) {
        // A witnessed location is insufficient while a solid actor occupies its
        // inspection approach. AI may not capture remotely through that actor.
        expect(captured, diagnosis).toHaveLength(0);
        expect(Math.min(...spot.exitCandidates.map((candidate) => distance(patient.position, candidate.position)))).toBeGreaterThan(0.4);
        for (const blocker of blockers) blocker.dispose();
        for (let tick = 361; tick <= 540; tick++) {
          const frame = { deltaSeconds: 1 / 60, elapsedSeconds: tick / 60 };
          interactions.fixedUpdate(frame); entities.fixedUpdate(frame); rapier.step();
        }
      }
      expect(captured, diagnosis).toEqual([source.entityId]);
    } finally {
      for (const blocker of blockers) blocker.dispose();
      entities.dispose(); interactions.dispose(); player.dispose(); physics.dispose(); events.dispose(); rapier.free(); hospital.dispose();
    }
  });
});
