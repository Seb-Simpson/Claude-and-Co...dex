import RAPIER from '@dimforge/rapier3d-compat';
import { mkdirSync, writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ENTITY_PROFILES } from '../../../src/entities';
import { createNavigationProvider, createPhysicsAdapter } from '../../../src/physics';
import { createHospitalWorld } from '../../../src/world';
import { ROOMS } from '../../../src/world/layout';
import { EYE, NURSE_EYE, STATION_INTERACTIONS, STATION_PROPS, STEALTH } from '../../../src/world/stealth/layout';
import { NURSE_CLIP_NAMES } from '../../../src/horror/entities/nurseClips';
import { getNursesStationStealth, getStationStaging } from '../../../src/world/stealth/nursesStation';

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

const measurements: Record<string, unknown> = {};
const record = (section: string, value: unknown): void => { measurements[section] = value; };
afterAll(() => {
  if (!process.env.NW006A_REPORT) return;
  mkdirSync('docs/nw-006a', { recursive: true });
  writeFileSync('docs/nw-006a/measurements.json', `${JSON.stringify(measurements, null, 2)}\n`);
});

/** Her route as she walks it: a point every 0.25 m along each leg (waypoints alone miss what she passes). */
function routeSamples(w: readonly { x: number; z: number }[]): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < w.length; i++) {
    const a = w[i]!;
    const b = w[(i + 1) % w.length]!;
    const n = Math.max(1, Math.ceil(dist(a, b) / 0.25));
    for (let k = 0; k < n; k++) out.push({ x: a.x + (b.x - a.x) * k / n, z: a.z + (b.z - a.z) * k / n });
  }
  return out;
}

describe('Nurses’ Station stealth: along her whole route (sampled every 0.25 m)', () => {
  it('hides a crouched player at the trolley from everywhere inside the station except the east gap', () => {
    const f = fixture();
    try {
      const c = STEALTH.crouchCover;
      const inside = routeSamples(STEALTH.patrolWaypoints).filter((p) => p.z < -1.6);
      const seen = inside.filter((p) => f.physics.hasLineOfSight({ x: p.x, y: NURSE_EYE, z: p.z }, { x: c.x, y: EYE.crouching, z: c.z }));
      const standing = inside.filter((p) => f.physics.hasLineOfSight({ x: p.x, y: NURSE_EYE, z: p.z }, { x: c.x, y: EYE.standing, z: c.z }));
      record('crouchCoverRoute', { samplesInsideStation: inside.length, crouchedSeenFrom: seen.length, standingSeenFrom: standing.length, crouchedSeenMinX: Math.min(...seen.map((p) => p.x)) });
      expect(inside.length).toBeGreaterThan(30);
      // Every sample that sees a crouched player is at the east gap (east of the counter's end, x -1.3).
      for (const p of seen) expect(p.x, JSON.stringify(p)).toBeGreaterThan(-1.3);
      // Standing, she sees the player from most of the station.
      expect(standing.length).toBeGreaterThan(inside.length / 2);
    } finally { f.dispose(); }
  });

  it('second concealment: Room 105’s bed hiding is near the observation point, and the open floor beside it is not safe', () => {
    const f = fixture();
    try {
      const s = getNursesStationStealth(f.h.world);
      expect(s.hidingSecondary).toBe('nw:hiding:room-105-bed-b');
      const spot = f.h.world.hidingLocations.find((h) => h.id === s.hidingSecondary)!;
      expect(spot.type).toBe('bed');
      for (const e of spot.exitCandidates) expect(f.physics.isPositionFree({ ...e.position, y: 0.003 }, PLAYER.radius, PLAYER.height), JSON.stringify(e.position)).toBe(true);
      const at = s.concealment.position;
      expect(dist(at, spot.exitCandidates[0]!.position)).toBeLessThan(0.05);
      const path = f.navigation.findPath({ from: { ...s.observation.position, y: 0.003 }, to: { ...at, y: 0.003 }, agent: PLAYER });
      expect(path?.reachesGoal).toBe(true);
      let length = 0;
      let prev = s.observation.position;
      for (const w of path!.waypoints) { length += dist(prev, w); prev = w; }
      // As she walks past the open door she can see the floor beside the bed: the player must hide, not just stand there.
      const route = routeSamples(STEALTH.patrolWaypoints);
      const seenFrom = route.filter((p) => dist(p, at) <= ENTITY_PROFILES.nurse.visionRange && f.physics.hasLineOfSight({ x: p.x, y: NURSE_EYE, z: p.z }, { x: at.x, y: EYE.standing, z: at.z }));
      record('concealment105', { pathFromObservation: Number(length.toFixed(2)), routeSamplesSeeingOpenFloor: seenFrom.length });
      expect(length).toBeLessThan(6);
      expect(seenFrom.length).toBeGreaterThan(0);
    } finally { f.dispose(); }
  });

  it('places a solid collider under every station prop, and keeps her legs and the locker exit clear of them', () => {
    const f = fixture();
    try {
      for (const [name, p] of Object.entries(STATION_PROPS)) {
        const match = f.h.world.colliders.find((c) => c.shape.type === 'box'
          && Math.abs(c.pose.position.x - p.centre.x) < 0.01 && Math.abs(c.pose.position.y - p.centre.y) < 0.01 && Math.abs(c.pose.position.z - p.centre.z) < 0.01
          && Math.abs(c.shape.halfExtents.x - p.size.x / 2) < 0.01 && Math.abs(c.shape.halfExtents.z - p.size.z / 2) < 0.01);
        expect(match, name).toBeDefined();
      }
      // Her body clears every prop along her route.
      for (const p of routeSamples(STEALTH.patrolWaypoints).filter((q) => q.z < -1.6)) {
        expect(f.physics.isPositionFree({ x: p.x, y: 0.003, z: p.z }, NURSE.radius, NURSE.height), JSON.stringify(p)).toBe(true);
      }
    } finally { f.dispose(); }
  });
});

describe('NW-007B: Nurse Shaw’s station staging', () => {
  it('publishes the panel and records actions and their props as named nodes, with known clips', () => {
    const f = fixture();
    try {
      const st = getStationStaging(f.h.world);
      for (const key of ['panel', 'records'] as const) {
        const a = st[key];
        expect(a.stand).toEqual(STATION_INTERACTIONS[key].stand);
        expect(NURSE_CLIP_NAMES).toContain(a.clip);
        // Facing (gameplay convention, 0 = -Z) points at the target.
        const facing = Math.atan2(-(a.target.x - a.stand.x), -(a.target.z - a.stand.z));
        expect(Math.abs(facing - a.yaw), key).toBeLessThan(0.15);
      }
      expect(dist(st.callConsole, st.panel.target)).toBe(0);
      expect(dist(st.record104, st.records.target)).toBe(0);
    } finally { f.dispose(); }
  });

  it('lets her stand at both actions (radius 0.3 m), within reach of the desk, and walk there from her route and back', () => {
    const f = fixture();
    try {
      const st = getStationStaging(f.h.world);
      const s = getNursesStationStealth(f.h.world);
      const reach: Record<string, number> = {};
      for (const key of ['panel', 'records'] as const) {
        const a = st[key];
        expect(f.physics.isPositionFree({ ...a.stand, y: 0.003 }, NURSE.radius, NURSE.height), key).toBe(true);
        expect(f.physics.hasSupport({ ...a.stand, y: 0.003 }, NURSE.radius), key).toBe(true);
        // Horizontal hand reach from a 0.3 m body to the target: under 0.65 m (arm + hand).
        reach[key] = Math.hypot(a.target.x - a.stand.x, a.target.z - a.stand.z);
        expect(reach[key], key).toBeLessThan(0.65);
        for (const w of [s.patrolWaypoints[0]!, s.patrolWaypoints[1]!]) {
          expect(f.navigation.findPath({ from: { ...w.position, y: 0.003 }, to: { ...a.stand, y: 0.003 }, agent: NURSE })?.reachesGoal, `${w.key} → ${key}`).toBe(true);
          expect(f.navigation.findPath({ from: { ...a.stand, y: 0.003 }, to: { ...w.position, y: 0.003 }, agent: NURSE })?.reachesGoal, `${key} → ${w.key}`).toBe(true);
        }
      }
      record('stationActions', { reach });
    } finally { f.dispose(); }
  });

  it('leaves the station locker behind her shoulder while she works the panel (outside her field of view)', () => {
    const f = fixture();
    try {
      const st = getStationStaging(f.h.world);
      const locker = f.h.world.hidingLocations.find((h) => h.id === STEALTH.hidingPrimary)!;
      const approach = locker.exitCandidates[0]!.position;
      const fov = ENTITY_PROFILES.nurse.fieldOfViewRadians;
      const angleTo = (p: { x: number; z: number }) => {
        const a = st.panel;
        const fx = -Math.sin(a.yaw);
        const fz = -Math.cos(a.yaw);
        const dx = p.x - a.stand.x;
        const dz = p.z - a.stand.z;
        return Math.acos((fx * dx + fz * dz) / Math.hypot(dx, dz));
      };
      const lockerAngle = angleTo(approach);
      record('panelVsLocker', { lockerApproachAngleDeg: Number((lockerAngle * 180 / Math.PI).toFixed(1)), halfFovDeg: Number((fov * 90 / Math.PI).toFixed(1)) });
      expect(lockerAngle).toBeGreaterThan(fov / 2);
    } finally { f.dispose(); }
  });
});
