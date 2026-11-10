import RAPIER from '@dimforge/rapier3d-compat';
import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { createPhysicsAdapter } from '../physics';
import { createHospitalWorld } from './createHospitalWorld';
import { getHospitalExtras } from './extras';
import { OPENING_BINDINGS } from './opening';

/**
 * NW-005A: the opening's semantic references resolve, sit where the player can use them, do not
 * intersect collision, and the walk from the bed to the station is open for the real player body.
 */
const byKey = (key: string) => OPENING_BINDINGS.find((b) => b.key === key)!;

describe('opening bindings', () => {
  const h = createHospitalWorld({ textures: false });
  let physics: ReturnType<typeof createPhysicsAdapter>;
  beforeAll(async () => {
    await RAPIER.init();
    physics = createPhysicsAdapter(new RAPIER.World({ x: 0, y: -9.81, z: 0 }), h.world.colliders);
  });

  it('publishes every binding as data and as exactly one named node under the world root', () => {
    expect(getHospitalExtras(h.world)?.opening).toBe(OPENING_BINDINGS);
    expect(new Set(OPENING_BINDINGS.map((b) => b.id)).size).toBe(OPENING_BINDINGS.length);
    for (const b of OPENING_BINDINGS) {
      const found: unknown[] = [];
      h.world.root.traverse((o) => { if (o.name === b.node) found.push(o); });
      expect(found, b.node).toHaveLength(1);
    }
  });

  it('matches the world it describes: spawn, doors, rooms', () => {
    const spawn = byKey('player-spawn');
    expect(spawn.position).toEqual(h.world.playerSpawn.position);
    expect(spawn.yaw).toBe(h.world.playerSpawn.yaw);
    const doors = new Set(h.world.doors.map((d) => d.id));
    for (const b of OPENING_BINDINGS) if (b.doorId) expect(doors.has(b.doorId), b.doorId).toBe(true);
    const rooms = new Map(h.world.rooms.map((r) => [r.id, r]));
    for (const b of OPENING_BINDINGS) {
      const r = rooms.get(b.roomId)!;
      expect(r, b.roomId).toBeDefined();
      const p = b.position;
      expect(p.x >= r.bounds.min.x - 0.1 && p.x <= r.bounds.max.x + 0.1 && p.z >= r.bounds.min.z - 0.1 && p.z <= r.bounds.max.z + 0.1, b.key).toBe(true);
    }
  });

  it('gives every usable prop a free, supported standing spot within reach', () => {
    for (const b of OPENING_BINDINGS.filter((x) => x.stand)) {
      const stand = { ...b.stand!, y: 0.003 };
      expect(physics.isPositionFree(stand, 0.28, 1.8), b.key).toBe(true);
      expect(physics.hasSupport(stand, 0.28), b.key).toBe(true);
      const eye = new Vector3(stand.x, 1.6, stand.z);
      const target = new Vector3(b.position.x, b.position.y, b.position.z);
      if (b.position.y < 0.1) {
        // Floor pickups: within a step of the standing spot (the player looks down at it).
        expect(Math.hypot(stand.x - target.x, stand.z - target.z), b.key).toBeLessThan(0.8);
      } else {
        // Doors from the doorway approach; wall props from arm's length.
        expect(eye.distanceTo(target), b.key).toBeLessThan(b.kind === 'door' ? 2.2 : 1.6);
      }
    }
  });

  it('keeps the access card out of every collider (it lies on the open floor)', () => {
    const card = byKey('access-card').position;
    expect(physics.isPositionFree({ x: card.x, y: 0.003, z: card.z }, 0.12, 0.3)).toBe(true);
  });

  it('moves the Room 106 handle node with the 106 door and starts it on the corridor face', () => {
    const door = h.world.doors.find((d) => d.id === 'nw:door:room-106')!;
    const node = h.world.root.getObjectByName('nw:opening:room-106-handle')!;
    expect(node.parent).toBe(door.object);
    h.world.root.updateMatrixWorld(true);
    const p = node.getWorldPosition(new Vector3());
    const want = byKey('room-106-handle').position;
    expect(p.distanceTo(new Vector3(want.x, want.y, want.z))).toBeLessThan(0.02);
    expect(p.z).toBeLessThan(1.475);
  });

  it('frames Nurse Shaw’s first appearance in a clear line of sight from the Room 104 doorway', () => {
    const view = byKey('nurse-first-sight-view').position;
    const mark = byKey('nurse-first-sight').position;
    expect(physics.hasLineOfSight(view, { ...mark, y: 1.55 })).toBe(true);
    expect(physics.isPositionFree({ ...mark, y: 0.003 }, 0.3, 1.8)).toBe(true);
    const d = Math.hypot(view.x - mark.x, view.z - mark.z);
    expect(d).toBeGreaterThan(8);
    expect(d).toBeLessThan(13);
  });

  it('lets the real player body walk from the bed to the station lobby along the published path', () => {
    const path = byKey('station-approach').points!;
    const body = physics.createCharacter({ position: { ...path[0]!, y: 0.003 }, radius: 0.28, height: 1.8 });
    try {
      for (const target of path.slice(1)) {
        for (let tick = 0; tick < 600; tick++) {
          const p = body.getPosition();
          const dx = target.x - p.x;
          const dz = target.z - p.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.05) break;
          const step = Math.min(d, 0.04);
          body.move({ x: (dx / d) * step, y: -0.004, z: (dz / d) * step });
        }
        const p = body.getPosition();
        expect(Math.hypot(target.x - p.x, target.z - p.z), JSON.stringify(target)).toBeLessThan(0.1);
      }
    } finally { body.dispose(); }
  });
});
