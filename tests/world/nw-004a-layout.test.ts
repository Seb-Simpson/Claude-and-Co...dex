import RAPIER from '@dimforge/rapier3d-compat';
import { Box3, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { createEventBus } from '../../src/integration';
import { createInteractionSystem } from '../../src/gameplay/interactions';
import { createPlayerController } from '../../src/gameplay/player';
import { createPhysicsAdapter } from '../../src/physics';
import { createHospitalWorld } from '../../src/world';

/**
 * NW-004A: Records 112 and Electrical 114 are physically reachable with the real player body,
 * Rapier and the real interaction system; the provisional service door stays locked; nothing
 * that existed before moved.
 */
beforeAll(async () => { await RAPIER.init(); });

function fixture(x: number, z: number) {
  const hospital = createHospitalWorld({ textures: false });
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const physics = createPhysicsAdapter(world, hospital.world.colliders);
  const events = createEventBus();
  const spawn = { position: { x, y: 0.003, z }, yaw: 0 };
  const body = physics.createCharacter({ position: spawn.position, radius: 0.28, height: 1.8 });
  const player = createPlayerController({ body, camera: new PerspectiveCamera(70, 1, 0.05, 100), spawn, events });
  const interactions = createInteractionSystem({ world: hospital.world, player, physics, events });
  const settle = (doorId: string): void => {
    for (let tick = 0; tick < 90; tick += 1) { interactions.fixedUpdate({ deltaSeconds: 1 / 60, elapsedSeconds: (tick + 1) / 60 }); world.step(); }
    void doorId;
  };
  return {
    hospital, physics, body, interactions, settle,
    dispose() { interactions.dispose(); player.dispose(); physics.dispose(); events.dispose(); world.free(); hospital.dispose(); },
  };
}

describe('NW-004A west ward additions', () => {
  it('declares Records 112 and Electrical 114 with their doors and connections', () => {
    const h = createHospitalWorld({ textures: false });
    try {
      const ids = h.world.rooms.map((r) => r.id);
      expect(ids).toEqual(expect.arrayContaining(['nw:ward4:records-112', 'nw:ward4:electrical-114']));
      const doors = new Map(h.world.doors.map((d) => [d.id, d]));
      expect(doors.get('nw:door:records-112')?.initialState).toBe('closed');
      expect(doors.get('nw:door:electrical-114')?.initialState).toBe('closed');
      expect(doors.get('nw:door:electrical-service')?.initialState).toBe('locked');
      expect(h.extras.connections).toEqual(expect.arrayContaining([
        ['nw:ward4:corridor-main', 'nw:ward4:records-112'],
        ['nw:ward4:corridor-main', 'nw:ward4:electrical-114'],
        ['nw:ward4:electrical-114', 'nw:ward4:maintenance'],
      ]));
      expect(h.world.hidingLocations.map((s) => s.id)).toContain('nw:hiding:records-cupboard');
      expect(h.world.interactables.map((i) => i.id)).toEqual(expect.arrayContaining(['nw:inspect:records-patient-file', 'nw:inspect:electrical-breakers']));
    } finally { h.dispose(); }
  });

  it.each([
    { door: 'nw:door:records-112', x: 11.95, endZ: 2.6, inside: [{ x: 12.85, z: 3.9 }, { x: 12.2, z: 6.0 }, { x: 11.4, z: 4.4 }, { x: 11.7, z: 2.2 }] },
    { door: 'nw:door:electrical-114', x: 16.4, endZ: 4.6, inside: [{ x: 15.0, z: 3.0 }, { x: 17.2, z: 5.0 }, { x: 16.5, z: 2.4 }] },
  ])('walks from the corridor through $door into the room', (c) => {
    const f = fixture(c.x, 0.4);
    try {
      expect(f.interactions.requestDoorOpen(c.door)).toBe(true);
      f.settle(c.door);
      expect(f.interactions.getDoorState(c.door)).toBe('open');
      for (let tick = 0; tick < 200 && f.body.getPosition().z < c.endZ; tick += 1) {
        const moved = f.body.move({ x: 0, y: -0.008333, z: 0.035 });
        expect(moved.grounded, `tick ${tick} ${JSON.stringify(moved.position)}`).toBe(true);
        expect(moved.position.y).toBeLessThan(0.015);
      }
      expect(f.body.getPosition().z).toBeGreaterThanOrEqual(c.endZ);
      for (const p of c.inside) {
        const position = { x: p.x, y: 0.003, z: p.z };
        expect(f.body.canOccupy(position), JSON.stringify(p)).toBe(true);
        expect(f.physics.hasSupport(position, 0.28), JSON.stringify(p)).toBe(true);
      }
    } finally { f.dispose(); }
  });

  it('keeps the electrical service door to the maintenance passage locked (provisional route)', () => {
    const f = fixture(16.6, 7.2);
    try {
      expect(f.interactions.requestDoorOpen('nw:door:electrical-service')).toBe(false);
      f.settle('nw:door:electrical-service');
      expect(f.interactions.getDoorState('nw:door:electrical-service')).toBe('locked');
      // The passage itself stays walkable past the door.
      for (const x of [15.6, 16.6, 17.6]) expect(f.body.canOccupy({ x, y: 0.003, z: 7.25 })).toBe(true);
    } finally { f.dispose(); }
  });

  it('adds nothing that intrudes on the corridor, other rooms or the patrol routes', () => {
    const h = createHospitalWorld({ textures: false });
    try {
      const mine = new Set(['nw:ward4:records-112', 'nw:ward4:electrical-114']);
      for (const c of h.world.colliders) {
        if (!c.roomId || !mine.has(c.roomId) || c.shape.type !== 'box' || /:(floor|wall|ceiling):/.test(c.id) || c.id.startsWith('nw:door:')) continue;
        // World-space bounds of the (possibly rotated) box.
        const half = c.shape.halfExtents;
        const r = c.pose.rotation;
        const m = new Matrix4().compose(new Vector3(c.pose.position.x, c.pose.position.y, c.pose.position.z), new Quaternion(r.x, r.y, r.z, r.w), new Vector3(1, 1, 1));
        const box = new Box3(new Vector3(-half.x, -half.y, -half.z), new Vector3(half.x, half.y, half.z)).applyMatrix4(m);
        // Furniture stays inside its room (allowing the wall line itself).
        expect(box.min.x, c.id).toBeGreaterThanOrEqual(10.4);
        expect(box.max.x, c.id).toBeLessThanOrEqual(18.0);
        expect(box.min.z, c.id).toBeGreaterThanOrEqual(1.55);
        expect(box.max.z, c.id).toBeLessThanOrEqual(6.4);
      }
      for (const route of h.world.patrolRoutes) {
        for (const point of route.points) {
          const inside = point.x > 10.4 && point.x < 18 && point.z > 1.55 && point.z < 6.4;
          expect(inside, `${route.id} ${JSON.stringify(point)}`).toBe(false);
        }
      }
    } finally { h.dispose(); }
  });
});
