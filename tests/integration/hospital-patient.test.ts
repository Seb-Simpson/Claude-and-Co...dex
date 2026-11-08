import RAPIER from '@dimforge/rapier3d-compat';
import { PerspectiveCamera } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { EntityBehaviourState, Vec3 } from '../../src/contracts';
import { createDoorNavigationAdapter, createEntitySystem, ENTITY_PROFILES } from '../../src/entities';
import type { EntityProfile, EntitySystem } from '../../src/entities';
import { createInteractionSystem } from '../../src/gameplay/interactions';
import { createPlayerController } from '../../src/gameplay/player';
import { createEventBus } from '../../src/integration/events';
import { createNavigationProvider, createPhysicsAdapter } from '../../src/physics';
import { createHospitalWorld } from '../../src/world';

beforeAll(async () => { await RAPIER.init(); });

function fixture(profile: Partial<EntityProfile> = {}) {
  const hospital = createHospitalWorld({ textures: false });
  const world = { ...hospital.world, entitySpawns: hospital.world.entitySpawns.filter((spawn) => spawn.type === 'patient') };
  const rapier = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const physics = createPhysicsAdapter(rapier, world.colliders);
  const events = createEventBus();
  const player = createPlayerController({
    body: physics.createCharacter({ position: world.playerSpawn.position, radius: 0.28, height: 1.8 }),
    camera: new PerspectiveCamera(), spawn: world.playerSpawn, events,
  });
  const navigation = createNavigationProvider(physics, world.bounds, { cellSize: 0.25 });
  let witnessEntities: EntitySystem | null = null;
  const interactions = createInteractionSystem({ world, player, physics, events,
    witnesses: (spot) => witnessEntities?.witnessesFor(spot) ?? [],
  });
  const doors = createDoorNavigationAdapter({ world, physics, navigation, agent: ENTITY_PROFILES.patient.agent,
    getDoorState: (id) => interactions.getDoorState(id), requestDoorOpen: (id) => interactions.requestDoorOpen(id),
  });
  const entities = createEntitySystem({ world, physics, navigation, player, events,
    profiles: { patient: profile }, ...doors,
  });
  witnessEntities = entities;
  const starts: string[] = [], ends: { id: string; reason: string }[] = [], captures: string[] = [];
  const states: EntityBehaviourState[] = [];
  events.on('chase:started', (event) => starts.push(event.chaseId));
  events.on('chase:ended', (event) => ends.push({ id: event.chaseId, reason: event.reason }));
  events.on('player:captured', (event) => { captures.push(event.entityId); player.setCaptured(true); });
  events.on('entity:state', (event) => states.push(event.current));
  let time = 0;
  return { world, physics, events, player, interactions, entities, starts, ends, captures, states,
    get time() { return time; },
    placePlayer(position: Vec3) {
      expect(player.body.canOccupy(position)).toBe(true);
      player.body.setPosition(position);
      player.update({ deltaSeconds: 1 / 60, elapsedSeconds: time });
    },
    tick(count: number, inspect?: (position: Vec3) => void) {
      for (let i = 0; i < count; i++) {
        time += 1 / 60;
        const frame = { deltaSeconds: 1 / 60, elapsedSeconds: time };
        interactions.fixedUpdate(frame);
        entities.fixedUpdate(frame);
        rapier.step();
        inspect?.(entities.getSnapshots()[0]!.position);
      }
    },
    dispose() { entities.dispose(); interactions.dispose(); player.dispose(); physics.dispose(); events.dispose(); rapier.free(); hospital.dispose(); },
  };
}

describe('Patient in the authored hospital', () => {
  it('uses the real maintenance spawn, joins the nearby patrol leg and leaves room104 initially safe', () => {
    const f = fixture();
    try {
      expect(f.entities.getSnapshots()[0]?.position).toEqual({ x: 6, y: 0, z: 7.2 });
      expect(f.player.getSnapshot().position).toEqual(f.world.playerSpawn.position);
      f.tick(120);
      const patient = f.entities.getSnapshots()[0]!;
      expect(patient.state).toBe('patrol');
      expect(patient.position.x).toBeGreaterThan(6.5);
      expect(f.starts).toHaveLength(0);
      expect(f.captures).toHaveLength(0);
    } finally { f.dispose(); }
  });

  it('requires real sight, pursues, then loses an occluded player without learning the new location', () => {
    const f = fixture();
    try {
      f.placePlayer({ x: 2, y: 0, z: 7.2 });
      f.tick(20);
      expect(f.starts).toHaveLength(0);
      f.tick(20);
      expect(f.starts).toHaveLength(1);
      expect(f.entities.getSnapshots()[0]?.state).toBe('pursue');
      expect(f.entities.getSnapshots()[0]!.position.x).toBeLessThan(6);
      const observed = f.entities.getSnapshots()[0]!.lastKnownPlayer!.position;
      // Scenario setup moves the player behind actual room walls. Perception
      // must keep the earlier observation; no new noise or hint is published.
      f.placePlayer(f.world.playerSpawn.position);
      f.tick(140);
      expect(f.ends).toEqual([{ id: f.starts[0], reason: 'escaped' }]);
      expect(f.entities.getSnapshots()[0]?.lastKnownPlayer?.position).toEqual(observed);
      expect(f.states).toEqual(expect.arrayContaining(['pursue', 'lost-target', 'search']));
      expect(f.captures).toHaveLength(0);
    } finally { f.dispose(); }
  });

  it('investigates a heard source around actual walls and operates the maintenance door before passing', () => {
    const f = fixture({ searchSeconds: 30 });
    try {
      f.player.setHiding('hidden', 'test:unwitnessed');
      f.events.emit('player:noise', { playerId: 'player', position: { x: -5.7, y: 0, z: 4 },
        kind: 'interaction', radius: 50, intensity: 1, timeSeconds: 0 });
      let passedDoor = false;
      f.tick(1100, (position) => {
        if (position.z < 6.1) {
          passedDoor = true;
          expect(f.interactions.getDoorState('nw:door:maintenance-west')).toBe('open');
        }
        expect(f.physics.isPositionFree(position, 0.3, 1.8, [], false)).toBe(true);
      });
      expect(passedDoor).toBe(true);
      expect(f.entities.getSnapshots()[0]?.lastKnownPlayer?.source).toBe('sound');
      expect(f.starts).toHaveLength(0);
      expect(f.captures).toHaveLength(0);
    } finally { f.dispose(); }
  }, 60000);

  it('gives a close visible player pursuit grace and contact dwell, then settles capture once', () => {
    const f = fixture();
    try {
      f.placePlayer({ x: 4.7, y: 0, z: 7.2 });
      f.tick(60);
      expect(f.starts).toHaveLength(1);
      expect(f.captures).toHaveLength(0);
      f.tick(120);
      expect(f.captures).toEqual(['nw:entity:patient']);
      expect(f.ends).toEqual([{ id: f.starts[0], reason: 'captured' }]);
      expect(f.player.getSnapshot().captured).toBe(true);
      f.tick(120);
      expect(f.captures).toHaveLength(1);
    } finally { f.dispose(); }
  });

  it('loses a player entering an actual under-bed spot without a witness and allows a safe exit', () => {
    const f = fixture();
    try {
      f.placePlayer({ x: 2, y: 0, z: 7.2 });
      f.tick(40);
      expect(f.starts).toHaveLength(1);
      const observed = f.entities.getSnapshots()[0]!.lastKnownPlayer!.position;
      const bed = f.world.hidingLocations.find((spot) => spot.id === 'nw:hiding:room-106-bed')!;
      f.placePlayer(bed.exitCandidates[0]!.position);
      expect(f.entities.witnessesFor(bed)).toEqual([]);
      expect(f.interactions.hiding.enter(bed.id, f.time)).toBe(true);
      f.tick(160);
      expect(f.player.getSnapshot().hiding).toEqual({ state: 'hidden', spotId: bed.id });
      expect(f.entities.getSnapshots()[0]?.lastKnownPlayer?.position).toEqual(observed);
      expect(f.ends).toEqual([{ id: f.starts[0], reason: 'escaped' }]);
      expect(f.captures).toHaveLength(0);
      expect(f.interactions.hiding.exit(f.time)).toBe(true);
      f.tick(30);
      expect(f.player.getSnapshot().hiding.state).toBe('outside');
      expect(f.player.body.canOccupy(f.player.getSnapshot().position)).toBe(true);
      expect(f.physics.hasSupport(f.player.getSnapshot().position, f.player.body.radius)).toBe(true);
    } finally { f.dispose(); }
  });

  it('patrols the complete authored loop using both maintenance doors and collision-safe paths', () => {
    // Accelerate patrol travel only; the same radius, physics and authored route
    // are used by the slower playable Patient.
    const f = fixture({ patrolSpeed: 3 });
    try {
      f.player.setHiding('hidden', 'test:unwitnessed');
      let westMain = false, westConnector = false, eastMain = false, eastPassage = false;
      let tick = 0;
      f.tick(3600, (position) => {
        westMain ||= position.x < -16 && Math.abs(position.z) < 0.8;
        westConnector ||= Math.abs(position.x + 5.7) < 0.5 && position.z > 2 && position.z < 5;
        eastMain ||= position.x > 19 && Math.abs(position.z) < 0.8;
        eastPassage ||= position.x > 19 && position.z > 6.8;
        if (++tick % 30 === 0) expect(f.physics.isPositionFree(position, 0.3, 1.8, [], false)).toBe(true);
      });
      expect({ westMain, westConnector, eastMain, eastPassage }).toEqual({ westMain: true, westConnector: true, eastMain: true, eastPassage: true });
      expect(f.interactions.getDoorState('nw:door:maintenance-west')).toBe('open');
      expect(f.interactions.getDoorState('nw:door:maintenance-east')).toBe('open');
      expect(f.starts).toHaveLength(0);
      expect(f.captures).toHaveLength(0);
    } finally { f.dispose(); }
  }, 60000);
});
