import RAPIER from '@dimforge/rapier3d-compat';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { ENTITY_PROFILES } from '../../../src/entities';
import { createNavigationProvider, createPhysicsAdapter } from '../../../src/physics';
import {
  CHAPTER1_ANCHORS, CHAPTER1_DOOR_BINDINGS, CHAPTER1_FIRE_DOORS, CHAPTER1_ROOM_BINDINGS, CHAPTER1_TRIGGERS, createHospitalWorld, getHospitalExtras,
} from '../../../src/world';
import { DT, Sim } from './harness';

/**
 * NW-004A Step A: the Chapter 1 blockout's structure, collision and door clearance, on Codex's
 * real physics and navigation (read-only). Numbers this file measures are printed with
 * `NW004A_REPORT=1` and copied into docs/nw-004a/STEP-A.md.
 */
beforeAll(async () => { await RAPIER.init(); });
const report = (label: string, value: unknown): void => { if (process.env.NW004A_REPORT) console.log(`[step-a] ${label}: ${JSON.stringify(value)}`); };

const CODEX_ANCHOR_KEYS = [
  'checkpoint-start', 'checkpoint-after-nurse', 'checkpoint-after-records-power', 'checkpoint-before-patient', 'checkpoint-complete',
  'awakening-start', 'awakening-ceiling', 'awakening-fixture', 'awakening-monitor', 'awakening-wristband', 'awakening-door', 'awakening-handoff',
  'nurse-camera-start', 'nurse-ledger', 'nurse-emergence', 'nurse-diversion', 'nurse-handoff',
  'record-camera-start', 'record-identity', 'record-receiver', 'record-handoff',
  'patient-camera-start', 'patient-release-door', 'patient-emergence', 'patient-handoff',
  'ending-camera-start', 'ending-reader', 'ending-lower-stair', 'ending-handoff', 'nurse-stage', 'patient-stage', 'egress-chime',
];
const CODEX_TRIGGER_KEYS = [
  'station-entry', 'nurse-introduction-zone', 'review-safe-boundary', 'records-safe-inspection', 'panel-approach',
  'release-safe-boundary', 'patient-introduction-zone', 'chase-route-a', 'chase-route-b', 'stair-safe-landing',
];

describe('Chapter 1 blockout: structure', () => {
  it('leaves the classic ward untouched by default', () => {
    const classic = createHospitalWorld({ textures: false });
    try {
      expect(classic.world.colliders).toHaveLength(243);
      expect(classic.world.rooms.map((r) => r.id)).toContain('nw:ward4:storage');
      expect(classic.world.doors.find((d) => d.id === 'nw:door:stairwell-b')?.requirements?.[0]?.id).toBe('nw:key:stairwell-b');
    } finally { classic.dispose(); }
  });

  it('binds every Codex room, door, trigger and anchor key to one world object', () => {
    const h = createHospitalWorld({ textures: false, layout: 'chapter1' });
    try {
      const rooms = new Set(h.world.rooms.map((r) => r.id));
      expect(new Set(Object.values(CHAPTER1_ROOM_BINDINGS)).size).toBe(13);
      for (const id of Object.values(CHAPTER1_ROOM_BINDINGS)) expect(rooms.has(id), id).toBe(true);
      for (const retired of ['nw:ward4:room-108', 'nw:ward4:waiting-bay', 'nw:ward4:storage']) expect(rooms.has(retired), retired).toBe(false);
      const doors = new Map(h.world.doors.map((d) => [d.id, d]));
      for (const id of [...Object.values(CHAPTER1_DOOR_BINDINGS), ...CHAPTER1_FIRE_DOORS]) expect(doors.has(id), id).toBe(true);
      expect(doors.get('nw:door:stairwell-b')?.requirements ?? []).toEqual([]);
      expect(doors.get('nw:door:electrical-service')?.requirements ?? []).toEqual([]);
      expect(new Set(h.world.doors.map((d) => d.id)).size).toBe(h.world.doors.length);
      for (const key of CODEX_TRIGGER_KEYS) {
        const nodes: unknown[] = [];
        h.world.root.traverse((o) => { if (o.name === `nw:trigger:${key}`) nodes.push(o); });
        expect(nodes, key).toHaveLength(1);
      }
      expect(CHAPTER1_TRIGGERS.map((t) => t.key).sort()).toEqual([...CODEX_TRIGGER_KEYS].sort());
      const anchors = getHospitalExtras(h.world)!.staging;
      expect(anchors.map((a) => a.id).sort()).toEqual(CODEX_ANCHOR_KEYS.map((k) => `nw:c1:${k}`).sort());
      // Hiding: the kept spots, the moved/migrated ones (IDs kept) and the two new ones.
      expect(h.world.hidingLocations.map((s) => s.id).sort()).toEqual([
        'nw:hiding:nurses-staff', 'nw:hiding:records-cupboard', 'nw:hiding:room-105-bed-b', 'nw:hiding:room-106-bed',
        'nw:hiding:storage-a', 'nw:hiding:storage-b', 'nw:hiding:storage-c', 'nw:hiding:treatment-screen', 'nw:hiding:vestibule-linen',
      ]);
      report('counts', { rooms: h.world.rooms.length, colliders: h.world.colliders.length, doors: h.world.doors.length, interactables: h.world.interactables.length, hiding: h.world.hidingLocations.length });
    } finally { h.dispose(); }
  });

  it('puts every room-scoped collider inside its room and every trigger and anchor in its room', () => {
    const h = createHospitalWorld({ textures: false, layout: 'chapter1' });
    try {
      const rooms = new Map(h.world.rooms.map((r) => [r.id, r]));
      const inside = (roomId: string, x: number, z: number, slack: number): boolean => {
        const r = rooms.get(roomId)!;
        return x >= r.bounds.min.x - slack && x <= r.bounds.max.x + slack && z >= r.bounds.min.z - slack && z <= r.bounds.max.z + slack;
      };
      const offenders: string[] = [];
      for (const c of h.world.colliders) {
        if (!c.roomId || c.shape.type !== 'box' || /:(floor|wall|ceiling):/.test(c.id) || c.id.startsWith('nw:door:') || !rooms.has(c.roomId)) continue;
        const half = c.shape.halfExtents;
        const r = c.pose.rotation;
        const m = new Matrix4().compose(new Vector3(c.pose.position.x, c.pose.position.y, c.pose.position.z), new Quaternion(r.x, r.y, r.z, r.w), new Vector3(1, 1, 1));
        const box = new Box3(new Vector3(-half.x, -half.y, -half.z), new Vector3(half.x, half.y, half.z)).applyMatrix4(m);
        if (!inside(c.roomId, box.min.x, box.min.z, 0.1) || !inside(c.roomId, box.max.x, box.max.z, 0.1)) offenders.push(`${c.id} ${c.roomId}`);
      }
      expect(offenders, JSON.stringify(offenders)).toEqual([]);
      for (const t of CHAPTER1_TRIGGERS) expect(inside(t.roomId, t.center.x, t.center.z, 0), t.id).toBe(true);
      for (const a of CHAPTER1_ANCHORS) expect(inside(a.roomId, a.position.x, a.position.z, 0.1), a.id).toBe(true);
    } finally { h.dispose(); }
  });

  it('gives every feet anchor, spawn and hiding exit floor and room to stand', () => {
    const h = createHospitalWorld({ textures: false, layout: 'chapter1', chapter1Stage: 'alarm' });
    const rapier = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const physics = createPhysicsAdapter(rapier, h.world.colliders);
    try {
      const doorColliders = new Set(h.world.doors.flatMap((d) => d.colliderIds));
      const ignore = [...doorColliders];
      for (const a of CHAPTER1_ANCHORS.filter((x) => x.kind === 'player' || x.kind === 'entity')) {
        const p = { ...a.position, y: 0.003 };
        expect(physics.isPositionFree(p, 0.3, 1.8, ignore), a.id).toBe(true);
        expect(physics.hasSupport(p, 0.28), a.id).toBe(true);
      }
      for (const s of [h.world.playerSpawn, ...h.world.entitySpawns]) {
        expect(physics.isPositionFree({ ...s.position, y: 0.003 }, 0.3, 1.8, ignore), JSON.stringify(s.position)).toBe(true);
      }
      for (const spot of h.world.hidingLocations) {
        const free = spot.exitCandidates.filter((e) => physics.isPositionFree({ ...e.position, y: 0.003 }, 0.28, 1.8));
        expect(free.length, spot.id).toBeGreaterThan(0);
      }
      // Camera anchors stand in open air.
      for (const a of CHAPTER1_ANCHORS.filter((x) => x.kind === 'camera')) expect(physics.isPositionFree(a.position, 0.12, 0.3, ignore), a.id).toBe(true);
    } finally { physics.dispose(); rapier.free(); h.dispose(); }
  });
});

describe('Chapter 1 blockout: doors', () => {
  it('opens every unlocked door fully (no leaf hits furniture) and walks the player body through it both ways', () => {
    const h = createHospitalWorld({ textures: false, layout: 'chapter1', chapter1Stage: 'act3' });
    const ids = h.world.doors.filter((d) => d.initialState !== 'locked').map((d) => d.id);
    h.dispose();
    const failures: string[] = [];
    const widths: Record<string, number> = {};
    for (const id of ids) {
      const sim = new Sim({ stage: 'act3', player: { x: -12.4, z: 4.1, yaw: 0 } });
      try {
        sim.interactions.requestDoorOpen(id);
        sim.idle(1.6);
        if (sim.interactions.getDoorState(id) !== 'open') { failures.push(`${id}: ${sim.interactions.getDoorState(id)}`); continue; }
        // Walk through along the door normal, from 1.2 m one side to 1.2 m the other side, and back.
        const marker = sim.world.doors.find((d) => d.id === id)!;
        const c = sim.doorCenter(id);
        const q = marker.closedPose.rotation;
        const normal = new Vector3(0, 0, 1).applyQuaternion(new Quaternion(q.x, q.y, q.z, q.w));
        // Approach points on each side: 1.2 m out, or closer where the space is narrow.
        const side = (sign: number): { x: number; z: number } | null => {
          for (const d of [1.2, 1.0, 0.85, 0.7]) {
            const p = { x: c.x + normal.x * d * sign, z: c.z + normal.z * d * sign };
            if (sim.physics.isPositionFree({ ...p, y: 0.003 }, 0.28, 1.8, [], false)) return p;
          }
          return null;
        };
        const a = side(-1);
        const b = side(1);
        if (!a || !b) { failures.push(`${id}: no free approach (${JSON.stringify({ a, b })})`); continue; }
        // Clear width: slide a probe across the opening at the threshold.
        const tangent = new Vector3(-normal.z, 0, normal.x);
        let clear = 0;
        for (let s = -0.9; s <= 0.9; s += 0.02) {
          if (sim.physics.isPositionFree({ x: c.x + tangent.x * s, y: 0.003, z: c.z + tangent.z * s }, 0.02, 1.8)) clear += 0.02;
        }
        widths[id] = Math.round(clear * 100) / 100;
        for (const [from, to] of [[a, b], [b, a]] as const) {
          sim.player.body.setPosition({ x: from.x, y: 0.003, z: from.z });
          sim.idle(0.1);
          if (!sim.navigateTo(to, { timeout: 4 })) failures.push(`${id}: stuck crossing to ${JSON.stringify(to)} at ${JSON.stringify(sim.position)}`);
        }
      } finally { sim.dispose(); }
    }
    report('door clear widths (m, at the threshold with the leaf open)', widths);
    expect(failures, JSON.stringify(failures, null, 1)).toEqual([]);
    for (const [id, w] of Object.entries(widths)) expect(w, id).toBeGreaterThanOrEqual(0.9);
  }, 120_000);

  it('opens and closes every alarm fire door from both sides, for the player (interact) and the Patient (door navigation)', () => {
    const results: Record<string, unknown> = {};
    for (const id of CHAPTER1_FIRE_DOORS) {
      for (const side of [-1, 1]) {
        const sim = new Sim({ stage: 'alarm', player: { x: -3.0, z: 0.4, yaw: 0 } });
        try {
          const marker = sim.world.doors.find((d) => d.id === id)!;
          const c = sim.doorCenter(id);
          const q = marker.closedPose.rotation;
          const n = new Vector3(0, 0, 1).applyQuaternion(new Quaternion(q.x, q.y, q.z, q.w));
          const stand = { x: c.x + n.x * side * 0.85, y: 0.003, z: c.z + n.z * side * 0.85 };
          sim.player.body.setPosition(stand);
          sim.idle(0.1);
          expect(sim.interactions.getDoorState(id), id).toBe('closed');
          let opened = sim.pressDoor(id, true, 2);
          if (!opened) {
            // Standing in the leaf's arc blocks it (the swept check): step back and push again.
            sim.player.body.setPosition({ x: c.x + n.x * side * 1.6, y: 0.003, z: c.z + n.z * side * 1.6 });
            sim.idle(0.6);
            opened = sim.pressDoor(id, true, 3);
          }
          // Close it again with the same input, standing on the side the leaf swung to, clear of its arc.
          const leaf = new Box3().setFromObject(marker.object).getCenter(new Vector3());
          const swing = Math.sign((leaf.x - c.x) * n.x + (leaf.z - c.z) * n.z) || 1;
          sim.player.body.setPosition({ x: c.x + n.x * swing * 1.7, y: 0.003, z: c.z + n.z * swing * 1.7 });
          sim.idle(0.1);
          const closed = sim.pressDoor(id, false, 3);
          results[`${id} side ${side}`] = { opened, closed };
          expect(opened, `${id} side ${side} open`).toBe(true);
          expect(closed, `${id} side ${side} close`).toBe(true);
        } finally { sim.dispose(); }
      }
    }
    report('fire doors (player)', results);
  }, 120_000);

  it('lets the Patient path through every closed alarm fire door from both sides with the same swept-door rules', () => {
    const results: Record<string, number> = {};
    for (const id of CHAPTER1_FIRE_DOORS) {
      for (const side of [-1, 1]) {
        const probe = new Sim({ stage: 'alarm', player: { x: -12.4, z: 4.1, yaw: 0 } });
        const marker = probe.world.doors.find((d) => d.id === id)!;
        const c = probe.doorCenter(id);
        const q = marker.closedPose.rotation;
        const n = new Vector3(0, 0, 1).applyQuaternion(new Quaternion(q.x, q.y, q.z, q.w));
        const at = (sign: number) => {
          for (const d of [2.0, 1.8, 1.6]) {
            const p = { x: c.x + n.x * sign * d, z: c.z + n.z * sign * d };
            if (probe.physics.isPositionFree({ ...p, y: 0.003 }, 0.35, 1.8, [], false)) return p;
          }
          throw new Error(`${id}: no free test position on side ${sign}`);
        };
        const from = at(side);
        const to = at(-side);
        probe.dispose();
        // The Patient patrols across the closed door; the player is far away in Room 104.
        const sim = new Sim({
          stage: 'alarm', player: { x: -12.4, z: 4.1, yaw: 0 }, entities: ['patient'],
          spawns: { patient: { x: from.x, z: from.z, yaw: 0 } }, routes: { patient: [{ x: to.x, y: 0, z: to.z }, { x: from.x, y: 0, z: from.z }] },
        });
        try {
          let crossed = -1;
          for (let t = 0; t < 12 * 60 && crossed < 0; t++) {
            sim.step();
            const p = sim.entity('patient')!.position;
            if (Math.hypot(p.x - to.x, p.z - to.z) < 0.6) crossed = sim.time;
          }
          results[`${id} side ${side}`] = Math.round(crossed * 10) / 10;
          expect(crossed, `${id} side ${side}: patient never crossed (door ${sim.interactions.getDoorState(id)})`).toBeGreaterThan(0);
          expect(sim.maxEntitySpeed('patient'), `${id}: warp`).toBeLessThan(ENTITY_PROFILES.patient.pursuitSpeed * 1.25);
          expect(sim.doorLog.some((e) => e.door === id && e.to === 'open'), `${id}: crossed without opening`).toBe(true);
        } finally { sim.dispose(); }
      }
    }
    report('fire doors (Patient crossing time, s)', results);
  }, 180_000);

  it('keeps a walkable route from the vestibule to the stair landing in the alarm state, through closed fire doors, for both actors', () => {
    const h = createHospitalWorld({ textures: false, layout: 'chapter1', chapter1Stage: 'alarm' });
    const rapier = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const doorIds = new Set(h.world.doors.flatMap((d) => d.colliderIds));
    // With every door collider removed, the floor is one connected space: a path exists.
    const open = createPhysicsAdapter(rapier, h.world.colliders.filter((c) => !doorIds.has(c.id)));
    try {
      const nav = createNavigationProvider(open, h.world.bounds, { cellSize: 0.25, maxNodes: 80_000 });
      for (const agent of [{ radius: 0.28, height: 1.8, maxSlopeRadians: Math.PI / 4, maxStepHeight: 0.25 }, ENTITY_PROFILES.patient.agent]) {
        for (const [label, from] of [['vestibule', { x: 12.3, y: 0, z: 2.6 }], ['hall', { x: 3.0, y: 0, z: 0 }], ['records', { x: -2.4, y: 0, z: 2.6 }], ['wing-a', { x: -12, y: 0, z: 0 }]] as const) {
          const path = nav.findPath({ from, to: { x: 19.9, y: 0, z: -12.1 }, agent });
          expect(path?.reachesGoal, `${label} r=${agent.radius}`).toBe(true);
        }
      }
    } finally { open.dispose(); rapier.free(); h.dispose(); }
  });

  it('reaches every room from Room 104 with the player body once its doors are open', () => {
    const h = createHospitalWorld({ textures: false, layout: 'chapter1', chapter1Stage: 'alarm' });
    const rapier = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const doorIds = new Set(h.world.doors.flatMap((d) => d.colliderIds));
    const physics = createPhysicsAdapter(rapier, h.world.colliders.filter((c) => !doorIds.has(c.id)));
    try {
      // A larger A* budget than Codex's runtime default (4096 nodes): these are whole-ward queries.
      const nav = createNavigationProvider(physics, h.world.bounds, { cellSize: 0.25, maxNodes: 80_000 });
      const agent = { radius: 0.28, height: 1.8, maxSlopeRadians: Math.PI / 4, maxStepHeight: 0.25 };
      const probes: Record<string, { x: number; z: number }> = {
        'nw:ward4:corridor-main': { x: -8, z: 0 }, 'nw:ward4:ward-hall': { x: 1.5, z: 4.5 }, 'nw:ward4:wing-b': { x: 13, z: 0 },
        'nw:ward4:corridor-east': { x: 19.5, z: -6 }, 'nw:ward4:staff-passage': { x: 14, z: -9.0 }, 'nw:ward4:connector': { x: -5.7, z: 4 },
        'nw:ward4:maintenance': { x: 10, z: 7.25 }, 'nw:ward4:pump-bay': { x: 5.1, z: 8.4 }, 'nw:ward4:stairwell-b': { x: 19.9, z: -12.1 },
        'nw:ward4:nurses-station': { x: -3.6, z: -4.6 }, 'nw:ward4:treatment': { x: 4.7, z: -3.3 }, 'nw:ward4:room-107': { x: 8.6, z: -3.6 },
        'nw:ward4:observation-bay': { x: 14.5, z: -4.0 }, 'nw:ward4:room-101': { x: -17.0, z: -3.2 }, 'nw:ward4:room-103': { x: -12.0, z: -2.8 },
        'nw:ward4:room-105': { x: -7.85, z: -2.95 }, 'nw:ward4:room-102': { x: -16.4, z: 2.8 }, 'nw:ward4:room-104': { x: -12.4, z: 4.1 },
        'nw:ward4:room-106': { x: -8.3, z: 4.15 }, 'nw:ward4:records-112': { x: -2.4, z: 2.6 }, 'nw:ward4:room-110': { x: 7.0, z: 2.6 },
        'nw:ward4:release-vestibule': { x: 12.3, z: 3.0 }, 'nw:ward4:electrical-114': { x: 16.4, z: 3.0 },
      };
      const unreached: string[] = [];
      const lengths: Record<string, number> = {};
      for (const room of h.world.rooms) {
        if (room.id === 'nw:ward4:lift-car') continue;
        const p = probes[room.id];
        expect(p, room.id).toBeDefined();
        const path = nav.findPath({ from: { x: -12.4, y: 0, z: 4.1 }, to: { x: p!.x, y: 0, z: p!.z }, agent });
        if (!path?.reachesGoal) unreached.push(room.id);
        else lengths[room.id] = Math.round(path.waypoints.reduce((acc, q, i, all) => i ? acc + Math.hypot(q.x - all[i - 1]!.x, q.z - all[i - 1]!.z) : 0, 0) * 10) / 10;
      }
      report('path length from Room 104 (m)', lengths);
      expect(unreached, JSON.stringify(unreached)).toEqual([]);
    } finally { physics.dispose(); rapier.free(); h.dispose(); }
  });

  it('measures the longest unbroken views along each circulation space (sightline audit)', () => {
    const h = createHospitalWorld({ textures: false, layout: 'chapter1', chapter1Stage: 'act3' });
    const rapier = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const physics = createPhysicsAdapter(rapier, h.world.colliders);
    try {
      const march = (from: { x: number; z: number }, dir: { x: number; z: number }, max = 30): number => {
        const eye = { x: from.x, y: 1.6, z: from.z };
        let d = 0;
        for (let s = 0.25; s <= max; s += 0.25) {
          if (!physics.hasLineOfSight(eye, { x: from.x + dir.x * s, y: 1.6, z: from.z + dir.z * s })) break;
          d = s;
        }
        return d;
      };
      const views = {
        'wing-a west from station lobby': march({ x: -4.2, z: 0.3 }, { x: -1, z: 0 }),
        'wing-a east from 104 door (to the hall-west doors, act3 open)': march({ x: -12, z: 0.4 }, { x: 1, z: 0 }),
        'wing-b west from vestibule door': march({ x: 12.3, z: 0.6 }, { x: -1, z: 0 }),
        'wing-b east from vestibule door': march({ x: 12.3, z: 0.6 }, { x: 1, z: 0 }),
        'east corridor north from maintenance door': march({ x: 19.5, z: 7.2 }, { x: 0, z: -1 }),
        'east corridor south from stair door': march({ x: 19.5, z: -10.6 }, { x: 0, z: 1 }),
        'staff passage east from west end (boundary door opened)': -1,
        'staff passage east from boundary door': march({ x: 0.5, z: -7.42 }, { x: 1, z: 0 }),
        'staff passage west from east door': march({ x: 17.5, z: -9.0 }, { x: -1, z: 0 }),
        'maintenance east from west door': march({ x: -5.7, z: 7.25 }, { x: 1, z: 0 }),
        'maintenance west from east door': march({ x: 17.5, z: 7.25 }, { x: -1, z: 0 }),
        'hall: lobby to treatment door line': march({ x: 0.4, z: 0 }, { x: 1, z: 0 }),
      };
      report('sightlines (m, eye height 1.6)', views);
      // The design's promise: only Wing A keeps a long (>12 m) view.
      expect(views['wing-a west from station lobby']).toBeGreaterThan(12);
      expect(views['staff passage east from boundary door']).toBeLessThan(10);
      expect(views['staff passage west from east door']).toBeLessThan(9);
    } finally { physics.dispose(); rapier.free(); h.dispose(); }
  });
});

void DT;
