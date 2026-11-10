import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { ENTITY_PROFILES } from '../../../src/entities';
import { createNavigationProvider, createPhysicsAdapter } from '../../../src/physics';
import { createHospitalWorld } from '../../../src/world';
import { ROOMS } from '../../../src/world/layout';
import { EYE, NURSE_EYE, STEALTH } from '../../../src/world/stealth/layout';
import { getNursesStationStealth } from '../../../src/world/stealth/nursesStation';

/**
 * NW-006A: the Nurses' Station stealth space, on Codex's real physics and navigation (read-only).
 * Measured numbers are written to docs/nw-006a/measurements.json when NW006A_REPORT=1.
 */
beforeAll(async () => { await RAPIER.init(); });

const PLAYER = { radius: 0.28, height: 1.8, maxSlopeRadians: Math.PI / 4, maxStepHeight: 0.25 } as const;
const NURSE = ENTITY_PROFILES.nurse.agent;
const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

function fixture() {
  const h = createHospitalWorld({ textures: false });
  const physics = createPhysicsAdapter(new RAPIER.World({ x: 0, y: -9.81, z: 0 }), h.world.colliders);
  const navigation = createNavigationProvider(physics, h.world.bounds, { cellSize: 0.25, maxNodes: 40_000 });
  return { h, physics, navigation, dispose() { physics.dispose(); h.dispose(); } };
}

describe('Nurses’ Station stealth: bindings', () => {
  it('publishes every binding once as a named node, resolved by the typed accessor', () => {
    const f = fixture();
    try {
      const s = getNursesStationStealth(f.h.world);
      for (const p of [s.entry, s.observation, s.crouchCover, s.screen, s.exit, ...s.patrolWaypoints]) {
        const found: unknown[] = [];
        f.h.world.root.traverse((o) => { if (o.name === p.node) found.push(o); });
        expect(found, p.node).toHaveLength(1);
      }
      expect(s.patrolWaypoints.map((p) => p.position)).toEqual(STEALTH.patrolWaypoints);
      expect(s.entry.position).toEqual(STEALTH.entry);
      expect(s.observation.position).toEqual(STEALTH.observation);
    } finally { f.dispose(); }
  });

  it('references real route, hiding, door and emitter records', () => {
    const f = fixture();
    try {
      const s = getNursesStationStealth(f.h.world);
      const route = f.h.world.patrolRoutes.find((r) => r.id === s.patrolRouteId);
      expect(route?.loop).toBe(true);
      expect(route?.points.map((p) => [p.x, p.z])).toEqual(s.patrolWaypoints.map((p) => [p.position.x, p.position.z]));
      expect(f.h.world.hidingLocations.map((h) => h.id)).toContain(s.hidingPrimary);
      for (const d of s.doorIds) expect(f.h.world.doors.map((x) => x.id), d).toContain(d);
      const kinds = f.h.extras.soundEmitters.filter((e) => s.emitterIds.includes(e.id)).map((e) => e.kind).sort();
      expect(kinds).toEqual(['intercom', 'trolley']);
    } finally { f.dispose(); }
  });
});

describe('Nurses’ Station stealth: walkability and clearance', () => {
  it('leaves every bound point free for the player body and supported underfoot', () => {
    const f = fixture();
    try {
      const s = getNursesStationStealth(f.h.world);
      for (const p of [s.entry, s.observation, s.crouchCover, s.exit]) {
        expect(f.physics.isPositionFree({ ...p.position, y: 0.003 }, PLAYER.radius, PLAYER.height), p.key).toBe(true);
        expect(f.physics.hasSupport({ ...p.position, y: 0.003 }, PLAYER.radius), p.key).toBe(true);
      }
    } finally { f.dispose(); }
  });

  it('keeps every patrol waypoint clear for the nurse’s own body (radius 0.3 m)', () => {
    const f = fixture();
    try {
      const s = getNursesStationStealth(f.h.world);
      for (const p of s.patrolWaypoints) {
        expect(f.physics.isPositionFree({ ...p.position, y: 0.003 }, NURSE.radius, NURSE.height), p.key).toBe(true);
      }
    } finally { f.dispose(); }
  });

  it('lets the player walk entry → observation → crouch cover → exit with the real body', () => {
    const f = fixture();
    try {
      const s = getNursesStationStealth(f.h.world);
      const legs = [[s.entry, s.observation], [s.observation, s.crouchCover], [s.crouchCover, s.exit]] as const;
      for (const [a, b] of legs) {
        const path = f.navigation.findPath({ from: { ...a.position, y: 0.003 }, to: { ...b.position, y: 0.003 }, agent: PLAYER });
        expect(path?.reachesGoal, `${a.key} → ${b.key}`).toBe(true);
      }
    } finally { f.dispose(); }
  });

  it('lets the nurse walk her whole patrol route (every leg reachable on her agent)', () => {
    const f = fixture();
    try {
      const s = getNursesStationStealth(f.h.world);
      const w = s.patrolWaypoints;
      for (let i = 0; i < w.length; i++) {
        const a = w[i]!;
        const b = w[(i + 1) % w.length]!;
        const path = f.navigation.findPath({ from: { ...a.position, y: 0.003 }, to: { ...b.position, y: 0.003 }, agent: NURSE });
        expect(path?.reachesGoal, `${a.key} → ${b.key}`).toBe(true);
      }
    } finally { f.dispose(); }
  });
});

describe('Nurses’ Station stealth: cover and observation (real line of sight)', () => {
  it('hides a crouched player behind the linen screen from the station’s west and centre, and not from the east gap', () => {
    const f = fixture();
    try {
      const s = getNursesStationStealth(f.h.world);
      const station = s.patrolWaypoints.filter((p) => p.position.z < -1.6);
      const cover = s.crouchCover.position;
      const rows = station.map((p) => {
        const from = { x: p.position.x, y: NURSE_EYE, z: p.position.z };
        return {
          waypoint: p.key,
          standingSeen: f.physics.hasLineOfSight(from, { x: cover.x, y: EYE.standing, z: cover.z }),
          crouchedSeen: f.physics.hasLineOfSight(from, { x: cover.x, y: EYE.crouching, z: cover.z }),
        };
      });
      if (process.env.NW006A_REPORT) record('cover', rows);
      // Standing, the player is seen from every station waypoint: the screen is cover only when crouched.
      expect(rows.every((r) => r.standingSeen)).toBe(true);
      // Crouched, the screen hides the player from the west and centre of the station ...
      const eastGap = (x: { waypoint: string }): boolean => x.waypoint === 'patrol-2' || x.waypoint === 'patrol-8';
      for (const r of rows.filter((x) => !eastGap(x))) expect(r.crouchedSeen, r.waypoint).toBe(false);
      // ... but not from the east gap (patrol-2 and -8, the same spot): cover is directional, and that is the lesson.
      for (const r of rows.filter(eastGap)) expect(r.crouchedSeen, r.waypoint).toBe(true);
    } finally { f.dispose(); }
  });

  it('keeps the observation point unseen from the station while the nurse is inside, and visible to the player', () => {
    const f = fixture();
    try {
      const s = getNursesStationStealth(f.h.world);
      const o = s.observation.position;
      // Only the nurse's station waypoints count: on the corridor leg she is on the player's doorstep (see layout.ts).
      const station = s.patrolWaypoints.filter((p) => p.position.z < -1.6);
      const rows = station.map((p) => {
        const from = { x: p.position.x, y: NURSE_EYE, z: p.position.z };
        const to = { x: o.x, y: EYE.standing, z: o.z };
        return { waypoint: p.key, distance: dist(p.position, o), nurseSeesPlayer: f.physics.hasLineOfSight(from, to) };
      });
      if (process.env.NW006A_REPORT) record('observation', rows);
      // Vision range of the nurse profile.
      const vision = ENTITY_PROFILES.nurse.visionRange;
      expect(vision).toBe(7);
      for (const r of rows) if (r.distance < vision) expect(r.nurseSeesPlayer, `${r.waypoint} at ${r.distance.toFixed(1)} m`).toBe(false);
      // The player can see her from at least one station point (the sightline is open both ways).
      expect(station.some((p) => f.physics.hasLineOfSight({ x: o.x, y: EYE.standing, z: o.z }, { x: p.position.x, y: NURSE_EYE, z: p.position.z }))).toBe(true);
      // And the corridor leg does pass the observation point: the player must leave before she turns into it.
      const corridorLeg = s.patrolWaypoints.filter((p) => p.position.z > -1.6 && p.position.x < -3).map((p) => dist(p.position, o));
      expect(Math.min(...corridorLeg)).toBeLessThan(3);
    } finally { f.dispose(); }
  });
});

describe('Nurses’ Station stealth: hiding, lighting and geometry', () => {
  it('provides the staff locker as an obvious hiding place inside the station, with a free exit', () => {
    const f = fixture();
    try {
      const s = getNursesStationStealth(f.h.world);
      const spot = f.h.world.hidingLocations.find((h) => h.id === s.hidingPrimary)!;
      expect(spot.type).toBe('locker');
      const room = f.h.world.rooms.find((r) => r.id === ROOMS.nurses)!;
      const p = spot.playerPosition;
      expect(p.x >= room.bounds.min.x && p.x <= room.bounds.max.x && p.z >= room.bounds.min.z && p.z <= room.bounds.max.z).toBe(true);
      expect(spot.exitCandidates.some((e) => f.physics.isPositionFree({ ...e.position, y: 0.003 }, PLAYER.radius, PLAYER.height))).toBe(true);
    } finally { f.dispose(); }
  });

  it('keeps the station lit: a working ceiling fixture and a desk lamp over the workstations', () => {
    const f = fixture();
    try {
      const lit = f.h.extras.fixtures.filter((x) => x.roomId === ROOMS.nurses && x.intensity > 0 && x.state !== 'dead');
      expect(lit.length).toBeGreaterThanOrEqual(2);
      expect(lit.some((x) => x.kind === 'lamp')).toBe(true);
    } finally { f.dispose(); }
  });

  it('adds the linen screen as a solid collider at the bound position', () => {
    const f = fixture();
    try {
      const s = getNursesStationStealth(f.h.world);
      expect(f.physics.isPositionFree({ ...s.screen.position, y: 0.003 }, PLAYER.radius, EYE.crouching + 0.2)).toBe(false);
      expect(f.physics.isPositionFree({ ...s.crouchCover.position, y: 0.003 }, PLAYER.radius, PLAYER.height)).toBe(true);
    } finally { f.dispose(); }
  });
});

const record = (section: string, value: unknown): void => {
  // Intentionally silent in tests; measurements are gathered by scripts/nw006a-measure (see docs).
  void section; void value;
};
