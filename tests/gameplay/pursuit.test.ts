import RAPIER from '@dimforge/rapier3d-compat';
import { Group, PerspectiveCamera } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ColliderDefinition, HospitalWorld, Vec3 } from '../../src/contracts';
import { createEventBus } from '../../src/integration';
import { createPhysicsAdapter, createNavigationProvider } from '../../src/physics';
import { createPlayerController } from '../../src/gameplay/player';
import { createEntitySystem } from '../../src/entities';

beforeAll(async () => { await RAPIER.init(); });
const rotation = { x: 0, y: 0, z: 0, w: 1 };
function fixture() {
  const rapier = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const colliders: ColliderDefinition[] = [
    { id: 'floor', bodyType: 'fixed', sensor: false, shape: { type: 'box', halfExtents: { x: 7, y: 0.25, z: 7 } }, pose: { position: { x: 0, y: -0.25, z: 0 }, rotation } },
    { id: 'divider', bodyType: 'fixed', sensor: false, shape: { type: 'box', halfExtents: { x: 0.05, y: 1.25, z: 2 } }, pose: { position: { x: 0, y: 1.25, z: 0 }, rotation } },
  ];
  const world: HospitalWorld = {
    id: 'pursuit-fixture', root: new Group(), bounds: { min: { x: -7, y: -1, z: -7 }, max: { x: 7, y: 4, z: 7 } },
    colliders, rooms: [], interactables: [], doors: [], hidingLocations: [], patrolRoutes: [],
    playerSpawn: { position: { x: -2, y: 0.005, z: -3 }, yaw: 0 },
    entitySpawns: [{ id: 'patient:spawn', entityId: 'patient', type: 'patient', position: { x: -2, y: 0.005, z: 3 }, yaw: 0 }],
  };
  const physics = createPhysicsAdapter(rapier, colliders);
  const events = createEventBus();
  const player = createPlayerController({
    body: physics.createCharacter({ position: world.playerSpawn.position, radius: 0.28, height: 1.8 }),
    camera: new PerspectiveCamera(), spawn: world.playerSpawn, events,
  });
  const system = createEntitySystem({
    world, physics, navigation: createNavigationProvider(physics, world.bounds), player, events,
    profiles: { patient: { detectionSeconds: 0.1, loseSightSeconds: 0.2, lostTargetSeconds: 0.1, searchSeconds: 8, recoverySeconds: 0.2 } },
  });
  let time = 0;
  const starts: string[] = [], ends: string[] = [];
  events.on('chase:started', (event) => starts.push(event.chaseId));
  events.on('chase:ended', (event) => ends.push(event.chaseId));
  return { physics, events, player, system, starts, ends,
    get time() { return time; },
    tick(count: number, onTick?: (position: Vec3) => void) {
      for (let i = 0; i < count; i++) {
        time += 1 / 60;
        system.fixedUpdate({ deltaSeconds: 1 / 60, elapsedSeconds: time });
        rapier.step();
        onTick?.(system.getSnapshots()[0]!.position);
      }
    },
    dispose() { system.dispose(); player.dispose(); physics.dispose(); events.dispose(); rapier.free(); },
  };
}

describe('Patient pursuit with actual Rapier and live navigation', () => {
  it('loses the player behind a corner and preserves the last visible location', () => {
    const f = fixture();
    try {
      f.tick(12);
      expect(f.starts).toHaveLength(1);
      const lastVisible = f.system.getSnapshots()[0]!.lastKnownPlayer!.position;
      const destination = { x: 2, y: 0.005, z: 0 };
      expect(f.player.body.canOccupy(destination)).toBe(true);
      f.player.body.setPosition(destination);
      f.tick(30);
      expect(f.ends).toEqual(f.starts);
      expect(f.system.getSnapshots()[0]!.lastKnownPlayer!.position).toEqual(lastVisible);
      expect(f.system.getSnapshots()[0]!.state).not.toBe('pursue');
    } finally { f.dispose(); }
  });

  it('investigates a heard source by going around the divider rather than through it', () => {
    const f = fixture();
    try {
      // Player is concealed before any observation; the sound alone gives a justified location.
      const destination = { x: 2, y: 0.005, z: 0 };
      f.player.body.setPosition(destination);
      f.player.setHiding('hidden', 'isolated:test-hide');
      f.events.emit('player:noise', { playerId: 'player', position: destination, kind: 'interaction', radius: 30, intensity: 1, timeSeconds: 0 });
      let crossed = false;
      f.tick(420, (position) => {
        if (position.x > 0.35) crossed = true;
        if (Math.abs(position.x) < 0.05) expect(Math.abs(position.z)).toBeGreaterThan(2.29);
        expect(f.physics.isPositionFree(position, 0.3, 1.8, [], false)).toBe(true);
      });
      expect(crossed).toBe(true);
      expect(f.system.getSnapshots()[0]!.lastKnownPlayer?.source).toBe('sound');
      expect(f.starts).toHaveLength(0);
    } finally { f.dispose(); }
  });
});
