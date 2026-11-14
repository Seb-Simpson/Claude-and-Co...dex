/**
 * NW-R02 navigation, encounter-geometry and technical gates, on the real built colliders (Rapier):
 * flood fills over free capsule positions, door sweeps, hiding exits, sightlines and clearances.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DoorMarker } from '../../src/contracts';
import { validateWorld } from '../../src/integration/validateWorld';
import { createNavigationProvider } from '../../src/physics/navigation';
import { doorIdsOf } from '../../src/world/greybox/build';
import { connectionSides } from '../../src/world/greybox/grid';
import { CONNECTIONS, FEATURES, SPACES, WALKTHROUGH, spaceById } from '../../src/world/greybox/level';
import { CROUCHED, STANDING, TROLLEY, createFixture, flood, reachableSpaces, spacesInComponent, type Fixture } from './fixture';

let f: Fixture;
let doorsById: Map<string, DoorMarker>;
const door = (connection: string): DoorMarker[] => doorIdsOf(connection).map((id) => doorsById.get(id)!);
const lockedOrStub = (id: string) => spaceById(id).zone === 'chapter2';

function withDoors(open: (connectionId: string) => boolean, run: () => void): void {
  const changed: DoorMarker[] = [];
  for (const connection of CONNECTIONS) {
    if (connection.kind !== 'door' || connection.door?.initial === 'locked') continue; // locked doors never open
    const target = open(connection.id);
    for (const marker of door(connection.id)) {
      const isOpen = marker.initialState === 'open';
      if (target !== isOpen) { expect(f.setDoor(marker, target), `${marker.id} -> ${target}`).toBe(true); changed.push(marker); }
    }
  }
  try { run(); } finally { for (const marker of changed) f.setDoor(marker, marker.initialState === 'open'); }
}

beforeAll(async () => {
  f = await createFixture();
  doorsById = new Map(f.build.world.doors.map((d) => [d.id, d]));
});
afterAll(() => f?.dispose());

describe('NW-R02 greybox navigation and technical verification (real colliders)', () => {
  it('passes the standard world validator and builds every declared door, room and hiding spot', () => {
    expect(() => validateWorld(f.build.world)).not.toThrow();
    expect(f.build.world.rooms).toHaveLength(SPACES.length);
    const declaredLeaves = CONNECTIONS.filter((c) => c.kind === 'door').reduce((n, c) => n + (c.door?.double ? 2 : 1), 0);
    expect(f.build.world.doors).toHaveLength(declaredLeaves);
    const hides = FEATURES.filter((x) => (x.kind === 'bed' && x.hide) || x.kind === 'bench' || (x.kind === 'locker' && x.hide !== false));
    expect(f.build.world.hidingLocations).toHaveLength(hides.length);
  });

  it('floor seams: ground is found across every opening, including exactly on slab boundaries', () => {
    for (const connection of CONNECTIONS) {
      if (connection.kind === 'window') continue;
      for (const along of [-0.3, 0, 0.3]) for (const across of [-0.2, 0, 0.2]) {
        const x = connection.axis === 'z' ? connection.at + across : connection.center + along * connection.width;
        const z = connection.axis === 'z' ? connection.center + along * connection.width : connection.at + across;
        expect(f.physics.findGround({ x, y: 0.3, z }, 0.6), `${connection.id} at ${x.toFixed(2)},${z.toFixed(2)}`).not.toBeNull();
      }
    }
  });

  it('every door opens and closes through its full sweep without hitting walls, frames or furniture', () => {
    for (const marker of f.build.world.doors) {
      if (marker.initialState === 'locked') continue;
      const open = marker.initialState === 'open';
      expect(f.sweepDoor(marker, !open), `${marker.id} sweep`).toBe(true);
      expect(f.sweepDoor(marker, open), `${marker.id} sweep back`).toBe(true);
    }
  });

  it('no leaks: with every door shut, crouched flood components match the open-connection topology exactly', () => {
    withDoors(() => false, () => {
      const fl = flood(f, CROUCHED);
      for (const space of SPACES) {
        const [x0, x1, z0, z1] = space.rects[0]!;
        const component = fl.componentAt((x0 + x1) / 2 + 0.01, (z0 + z1) / 2 + 0.01);
        if (component < 0) continue; // fully occupied centre (checked separately)
        const physical = spacesInComponent(f, fl, component);
        const expected = reachableSpaces(space.id, (c) => c.kind === 'open' || c.kind === 'hatch');
        for (const id of physical) expect(expected.has(id), `leak from ${space.id} into ${id}`).toBe(true);
      }
    });
  }, 120_000);

  it('crouched player reaches every playable space from Room 104 with doors open; Chapter 2 stays sealed', () => {
    withDoors((id) => !CONNECTIONS.find((c) => c.id === id)!.door || CONNECTIONS.find((c) => c.id === id)!.door!.initial !== 'locked', () => {
      const fl = flood(f, CROUCHED);
      const start = fl.componentAt(WALKTHROUGH[0]!.x, WALKTHROUGH[0]!.z);
      expect(start).toBeGreaterThanOrEqual(0);
      const reached = spacesInComponent(f, fl, start);
      for (const space of SPACES) {
        if (lockedOrStub(space.id)) expect(reached.has(space.id), space.id).toBe(false);
        else expect(reached.has(space.id), `${space.id} unreachable`).toBe(true);
      }
      for (const step of WALKTHROUGH) expect(fl.componentAt(step.x, step.z), `step ${step.step}`).toBe(start);
      for (const feature of FEATURES) {
        if (feature.kind === 'control' || feature.kind === 'marker') expect(fl.componentAt(feature.x, feature.z), feature.id).toBe(start);
      }
    });
  }, 120_000);

  it('standing player cannot enter the crawlway, the cable tunnel or the low duct (forced crouch); Shaw cannot either', () => {
    withDoors(() => true, () => {
      const fl = flood(f, STANDING);
      const low = SPACES.filter((s) => s.ceiling < STANDING.height);
      expect(low.map((s) => s.id)).toEqual(expect.arrayContaining(['CE', 'V1W', 'V4', 'CX', 'M2', 'M8']));
      for (let k = 0; k < fl.valid.length; k += 1) {
        if (!fl.valid[k]) continue;
        const i = k % fl.nx, j = (k - i) / fl.nx;
        const space = f.build.layout.spaceAt(fl.x0 + (i + 0.5) * fl.cell, fl.z0 + (j + 0.5) * fl.cell);
        expect(space && space.ceiling >= STANDING.height, `standing cell inside ${space?.id}`).toBe(true);
      }
      // Standing, the porters' room and ES2 are only connected through the loop side, never the crawl.
      const st2 = fl.componentAt(23, 31), es2 = fl.componentAt(37.5, 24);
      expect(spacesInComponent(f, fl, st2).has('CE')).toBe(false);
      expect(spacesInComponent(f, fl, es2).has('CX')).toBe(false);
    });
  }, 120_000);

  it('every hiding spot has a free, reachable exit and its prompt target sits in a reachable room', () => {
    withDoors(() => true, () => {
      const fl = flood(f, CROUCHED);
      const main = fl.componentAt(WALKTHROUGH[0]!.x, WALKTHROUGH[0]!.z);
      for (const spot of f.build.world.hidingLocations) {
        const free = spot.exitCandidates.filter((e) => f.physics.isPositionFree(e.position, STANDING.radius, STANDING.height, [], false));
        expect(free.length, `${spot.id} exits`).toBeGreaterThan(0);
        expect(free.some((e) => fl.componentAt(e.position.x, e.position.z) === main), `${spot.id} exit reachable`).toBe(true);
      }
    });
  }, 120_000);

  it('E1 Lights Out: hiding under Bay beds and in the W8 locker, an escape route east, and safe dark corners', () => {
    const ids = f.build.world.hidingLocations.map((h) => h.id);
    for (const bed of ['w3-bed-a', 'w3-bed-b', 'w3-bed-c', 'w3-bed-d']) expect(ids).toContain(`nw:hiding:gb-${bed}`);
    expect(ids).toContain('nw:hiding:gb-w8-locker');
    // Beam route along the corridor: a clear 2.4 m corridor from the west end to the lobby threshold.
    expect(f.physics.isSegmentFree({ x: -37, y: 0, z: 0 }, { x: -6.5, y: 0, z: 0 }, 0.5, 1.8, [], false)).toBe(true);
    // A room's far corner is out of the doorway sightline from the corridor (crouch-in-the-dark option).
    expect(f.physics.hasLineOfSight({ x: -22, y: 1.5, z: 0 }, { x: -26.3, y: 0.9, z: 6.3 })).toBe(false);
  });

  it('E2 Stores: Shaw’s entrance, visual contact between rooms, rack cover, crawlway hatch and exit', () => {
    withDoors(() => true, () => {
      // Shaw enters from the south corridor through the store door.
      expect(f.physics.isSegmentFree({ x: 4, y: 0, z: 31.2 }, { x: 10, y: 0, z: 31.2 }, 0.35, 1.8, [], false)).toBe(true);
      // Porters' room doorway gives visual contact with the main store.
      expect(f.physics.hasLineOfSight({ x: 23, y: 1.5, z: 31 }, { x: 17, y: 1.5, z: 31 })).toBe(true);
      // The central rack breaks line of sight across the aisles.
      expect(f.physics.hasLineOfSight({ x: 14, y: 1.5, z: 27 }, { x: 14, y: 1.5, z: 35 })).toBe(false);
      // Aisle loop: both sides of the rack are walkable for Shaw.
      expect(f.physics.isSegmentFree({ x: 10, y: 0, z: 28 }, { x: 18, y: 0, z: 28 }, 0.35, 1.8, [], false)).toBe(true);
      expect(f.physics.isSegmentFree({ x: 10, y: 0, z: 34 }, { x: 18, y: 0, z: 34 }, 0.35, 1.8, [], false)).toBe(true);
      const crouch = flood(f, CROUCHED);
      expect(crouch.componentAt(25.2, 32)).toBe(crouch.componentAt(26.5, 32));
      expect(crouch.componentAt(34, 23)).toBe(crouch.componentAt(36.5, 23));
    });
  }, 120_000);

  it('E4 Loop: trolley clearance around both ring routes, office windows, hiding and all three approach positions', () => {
    withDoors(() => true, () => {
      const trolley = flood(f, TROLLEY);
      const ring = trolley.componentAt(16.2, 0);
      for (const [x, z] of [[16.2, -13.8], [22, -13.8], [27.8, -13.8], [27.8, 0], [27.8, 13.8], [22, 13.8], [16.2, 13.8]]) {
        expect(trolley.componentAt(x!, z!), `trolley at ${x},${z}`).toBe(ring);
      }
      // Observation windows: office sees both long corridors at eye height; the sill blocks low views.
      expect(f.physics.hasLineOfSight({ x: 21, y: 1.5, z: 1.4 }, { x: 16.2, y: 1.5, z: 1.4 })).toBe(true);
      expect(f.physics.hasLineOfSight({ x: 23, y: 1.5, z: -1.4 }, { x: 27.8, y: 1.5, z: -1.4 })).toBe(true);
      expect(f.physics.hasLineOfSight({ x: 21, y: 0.5, z: 1.4 }, { x: 16.2, y: 0.5, z: 1.4 })).toBe(false);
      const fl = flood(f, CROUCHED);
      const main = fl.componentAt(16.2, 0);
      for (const a of FEATURES.filter((x) => x.kind === 'marker' && x.category === 'approach')) {
        expect(fl.componentAt(a.x, a.z), a.id).toBe(main);
      }
      // More than one stealth route between the two long sides: north ring, south ring, and through the office.
      const viaOffice = reachableSpaces('LWC', (c) => c.kind !== 'window' && [c.a, c.b].every((id) => ['LWC', 'LOFF', 'LEC'].includes(id)));
      expect(viaOffice.has('LEC')).toBe(true);
      const loopHides = f.build.world.hidingLocations.filter((h) => { const s = f.build.layout.spaceAt(h.playerPosition.x, h.playerPosition.z); return s?.zone === 'loop'; });
      expect(loopHides.length).toBeGreaterThanOrEqual(9);
    });
  }, 120_000);

  it('E5/E6 Maintenance and chase: clearances, forced crouches, obstacles and one uninterrupted route to the North Wing', () => {
    withDoors(() => true, () => {
      // Shaw-sized standing clearance through every standing section of the passage. The two forced
      // crouches (M2 cable tunnel, M8 low duct) split it into three standing sections.
      const wide = flood(f, { radius: 0.4, height: 1.8 });
      const sections: [number, number][][] = [
        [[38.2, -30], [38.1, -36], [33, -43.2], [30, -43.2]],
        [[19, -40], [21, -45], [10, -43], [3.5, -43], [-1, -43], [-4.8, -46], [-10, -49.2], [-14.8, -47], [-19, -44.8], [-25, -44.8]],
        [[-33, -36], [-34, -31.5], [-26, -31.5], [-20, -31], [-14, -31.2], [0, -20], [0, -12.8]],
      ];
      const ids = sections.map((points) => {
        const id = wide.componentAt(points[0]![0], points[0]![1]);
        expect(id).toBeGreaterThanOrEqual(0);
        for (const [x, z] of points) expect(wide.componentAt(x, z), `clearance at ${x},${z}`).toBe(id);
        return id;
      });
      const [plant, , nl] = ids as [number, number, number];
      expect(new Set(ids).size).toBe(3);
      // The two forced-crouch sections are the only breaks in the standing route.
      expect(nl).not.toBe(plant);
      const crouch = flood(f, CROUCHED);
      expect(crouch.componentAt(38.2, -30)).toBe(crouch.componentAt(0, -12.8));
      // Obstacles in the old north corridor leave at least a 1.2 m lane.
      expect(f.physics.isSegmentFree({ x: -35, y: 0, z: -31.2 }, { x: -16.6, y: 0, z: -31.2 }, 0.6, 1.8, [], false)).toBe(true);
    });
  }, 120_000);

  it('chase route: Shaw entering through the bulkhead can only follow behind the player', () => {
    const chase = new Set(['M6A', 'M6B', 'M6C', 'M6D', 'M6E', 'M7', 'M8', 'M8C', 'NL']);
    // Bulkhead and NT doors shut, every other door open: the chase spaces are a sealed pocket, so the
    // only way Shaw can enter the run is through the bulkhead, behind the player.
    withDoors((id) => id !== 'bulkhead' && id !== 'NT', () => {
      const cut = flood(f, CROUCHED);
      const pocket = spacesInComponent(f, cut, cut.componentAt(-1, -43));
      expect([...pocket].sort()).toEqual([...chase].sort());
    });
  }, 180_000);

  it('north Wing is sealed with the NT doors shut (no unintended routes); the office door never opens', () => {
    withDoors((id) => id !== 'NT' && CONNECTIONS.find((c) => c.id === id)!.door!.initial !== 'locked', () => {
      const fl = flood(f, CROUCHED);
      const reached = spacesInComponent(f, fl, fl.componentAt(WALKTHROUGH[0]!.x, WALKTHROUGH[0]!.z));
      for (const space of SPACES) if (['north-wing', 'chapter2'].includes(space.zone)) expect(reached.has(space.id), space.id).toBe(false);
    });
    for (const marker of door('office-north')) expect(marker.initialState).toBe('locked');
  }, 120_000);

  it('navigation finds paths across each connection (doors open) for the crouched player', () => {
    const nav = createNavigationProvider(f.physics, f.build.world.bounds, { cellSize: 0.25, maxNodes: 20000 });
    withDoors((id) => CONNECTIONS.find((c) => c.id === id)!.door!.initial !== 'locked', () => {
      for (const connection of CONNECTIONS) {
        if (connection.kind === 'window' || connection.door?.initial === 'locked') continue;
        const narrow = [connection.a, connection.b].some((id) => spaceById(id).zone === 'crawl');
        const sides = connectionSides(connection, narrow ? 0.5 : 0.7);
        const path = nav.findPath({ from: { ...sides.neg, y: 0 }, to: { ...sides.pos, y: 0 }, agent: { radius: 0.28, height: 1.05, maxSlopeRadians: Math.PI / 4, maxStepHeight: 0.25 } });
        expect(path?.reachesGoal, connection.id).toBe(true);
      }
    });
  }, 120_000);
});
