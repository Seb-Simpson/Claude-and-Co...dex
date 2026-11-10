import RAPIER from '@dimforge/rapier3d-compat';
import { PerspectiveCamera } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { createEventBus } from '../../src/integration';
import { createInteractionSystem } from '../../src/gameplay/interactions';
import { createPlayerController } from '../../src/gameplay/player';
import { createPhysicsAdapter } from '../../src/physics';
import { createHospitalWorld } from '../../src/world';

beforeAll(async () => { await RAPIER.init(); });

function fixture(x: number, y = 0.003, z = 0) {
  const hospital = createHospitalWorld({ textures: false });
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const physics = createPhysicsAdapter(world, hospital.world.colliders);
  const events = createEventBus();
  const spawn = { position: { x, y, z }, yaw: 0 };
  const body = physics.createCharacter({ position: spawn.position, radius: 0.28, height: 1.8 });
  const player = createPlayerController({ body, camera: new PerspectiveCamera(70, 1, 0.05, 100), spawn, events });
  const interactions = createInteractionSystem({ world: hospital.world, player, physics, events });
  return {
    hospital, world, physics, events, body, player, interactions,
    dispose() { interactions.dispose(); player.dispose(); physics.dispose(); events.dispose(); world.free(); hospital.dispose(); },
  };
}

interface SeamCase { x: number; y: number; z: number; step: boolean; door?: string; endZ?: number }
const offsets = [-12.0031805, -12.003, -12, -11.997, -11.9968195];
const cases: SeamCase[] = [
  ...offsets.map(x => ({ x, y: 0.003, z: 0, step: false })),
  ...offsets.map(x => ({ x, y: 0.0029999985, z: -1.3981481, step: true })),
  { x: -12.0031805, y: 0.0029999985, z: -1.3981481, step: false },
  { x: -12.0031805, y: 0.0029999985, z: 0, step: true },
  { x: -5.949, y: 0.003, z: 6.554616, step: true, door: 'nw:door:maintenance-west', endZ: 3.65 },
];

describe('actual hospital doorway floor seams', () => {
  it.each(cases)('walks through an open doorway without sticking or gaining height: %j', (test) => {
    const f = fixture(test.x, test.y);
    try {
      // 228: NW-006A deliberate colliders (see tests/world/stealth): +1 linen trolley (crouch cover),
      // +2 filing cabinets, +1 supply cupboard, +1 observations machine (rooms/stealthStation.ts).
      expect(f.hospital.world.colliders).toHaveLength(228);
      const doorId = test.door ?? 'nw:door:room-103';
      expect(f.interactions.requestDoorOpen(doorId)).toBe(true);
      for (let tick = 0; tick < 75; tick += 1) {
        f.interactions.fixedUpdate({ deltaSeconds: 1 / 60, elapsedSeconds: (tick + 1) / 60 });
        if (test.step) f.world.step();
      }
      expect(f.interactions.getDoorState(doorId)).toBe('open');
      if (test.z !== 0) {
        const position = { x: test.x, y: test.y, z: test.z };
        expect(f.body.canOccupy(position)).toBe(true);
        f.body.setPosition(position);
      }
      for (let tick = 0; tick < 120; tick += 1) {
        const moved = f.body.move({ x: 0.000052, y: -0.008333, z: -0.04 });
        expect(moved.grounded, `tick ${tick}, ${JSON.stringify(moved.position)}`).toBe(true);
        expect(moved.position.y).toBeGreaterThanOrEqual(-0.001);
        expect(moved.position.y).toBeLessThan(0.015);
        expect(f.body.canOccupy(moved.position)).toBe(true);
        if (test.step) f.world.step();
      }
      expect(f.body.getPosition().z).toBeLessThan(test.endZ ?? -2.65);
    } finally { f.dispose(); }
  });
});
