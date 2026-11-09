import { beforeAll, describe, expect, it } from 'vitest';
import { CHAPTER1_NURSE_EXCLUDED_DOORS } from '../../../src/world';
import { initRapier, Sim, type Step } from './harness';
import { lastKnownIsHonest, record, summarise } from './report';

/**
 * NW-004A Step A, review condition 5: the Nurse encounter's three player responses, played on
 * Codex's real runtime (movement, footstep noise, hearing ×2.4, 7 m vision, doors, hiding).
 * Start: Act I world state; Shaw at `nurse-emergence` just inside the staff door (-1.2, -5.6),
 * facing the lobby; the player at `nurse-handoff` (-4.2, 0.2), 6.9 m away. The tray diversion is
 * Codex's cue and is not simulated here, so these are the harder, undiverted cases.
 */
beforeAll(initRapier);
const start = (): Sim => new Sim({ stage: 'act1', player: { x: -4.2, z: 0.2, yaw: 0 }, entities: ['nurse'], spawns: { nurse: { x: -1.2, z: -5.6, yaw: Math.PI } } });

const RETREAT_105: Step[] = [{ to: { x: -7.6, z: 0.1 } }, { to: { x: -7.6, z: -1.0 } }, { to: { x: -7.85, z: -2.95 } }, { hide: 'nw:hiding:room-105-bed-b' }, { wait: 40 }];
const QUIET_ROUTE: Step[] = [
  { to: { x: -5.7, z: 0.9 } }, { to: { x: -5.7, z: 5.0 } }, { door: 'nw:door:maintenance-west' }, { to: { x: -5.7, z: 7.2 } }, { to: { x: 2.8, z: 7.2 } },
  { door: 'nw:door:hall-service' }, { to: { x: 2.8, z: 5.0 } }, { wait: 30 },
];
const STAFF_LOCKER: Step[] = [{ to: { x: -5.85, z: -1.1 } }, { to: { x: -5.8, z: -3.9 } }, { to: { x: -5.65, z: -4.15 } }, { hide: 'nw:hiding:nurses-staff' }, { wait: 40 }];

describe('Condition 5 — Nurse encounter, all three responses', () => {
  it('1. retreat west and hide under the bed in 105: she never pursues; she continues her round', () => {
    const sim = start();
    try {
      const failed = sim.run(RETREAT_105);
      const s = summarise(sim, 'nurse');
      record('nurse', 'retreat-105', { failedStep: failed, ...s, lastKnownCheck: lastKnownIsHonest(sim, 'nurse') });
      expect(failed).toBe(-1);
      expect(sim.captured).toEqual([]);
      expect(s.firstPursuit).toBeNull();
    } finally { sim.dispose(); }
  }, 60_000);

  it('2. the quiet route (connector → maintenance → hall service door): out of her sight and hearing the whole way', () => {
    const sim = start();
    try {
      const failed = sim.run(QUIET_ROUTE);
      const s = summarise(sim, 'nurse');
      record('nurse', 'quiet-route', { failedStep: failed, ...s });
      expect(failed).toBe(-1);
      expect(sim.captured).toEqual([]);
      expect(s.firstPursuit).toBeNull();
      expect(sim.doorLog.filter((d) => d.to === 'opening' && (CHAPTER1_NURSE_EXCLUDED_DOORS as readonly string[]).includes(d.door) && d.t > 0)
        .every((d) => d.door === 'nw:door:maintenance-west' || d.door === 'nw:door:hall-service')).toBe(true);
    } finally { sim.dispose(); }
  }, 60_000);

  it('3a. the staff locker, crouched behind the counter: she does not see the player go in', () => {
    const sim = start();
    try {
      const failed = sim.run(STAFF_LOCKER.map((s) => ({ ...s, crouch: true })));
      const s = summarise(sim, 'nurse');
      record('nurse', 'staff-locker-crouched', { failedStep: failed, ...s });
      expect(sim.captured).toEqual([]);
      expect(sim.player.getSnapshot().hiding.state).toBe('hidden');
    } finally { sim.dispose(); }
  }, 60_000);

  it('3b. the staff locker, standing: she sees the player cross the station (6 m), watches them go in and opens the locker', () => {
    const sim = start();
    try {
      const failed = sim.run(STAFF_LOCKER);
      const s = summarise(sim, 'nurse');
      record('nurse', 'staff-locker-standing', { failedStep: failed, ...s });
      expect(sim.captured).toEqual(['nw:entity:nurse']);
      expect(sim.samples.some((x) => x.entities[0]!.lastKnownPlayer?.source === 'witnessed-hiding')).toBe(true);
    } finally { sim.dispose(); }
  }, 60_000);

  it('service-door policy: MEASURED — does she follow a heard player through a service door? (Codex has no per-actor door policy yet)', () => {
    // The player sprints in the maintenance passage just past the closed connector service door
    // while the Nurse stands in the connector, 3 m away on the other side.
    const sim = new Sim({ stage: 'act1', player: { x: -4.4, z: 7.25, yaw: Math.PI / 2 }, entities: ['nurse'], spawns: { nurse: { x: -5.7, z: 3.4, yaw: Math.PI } } });
    try {
      sim.run([{ to: { x: 2.0, z: 7.25 }, sprint: true }]);
      sim.idle(12);
      const opened = sim.doorLog.some((d) => d.door === 'nw:door:maintenance-west' && d.to === 'opening');
      record('nurse', 'service-door-policy', { nurseOpenedServiceDoor: opened, ...summarise(sim, 'nurse') });
      // Recorded either way; the requirement for Codex is in STEP-A.md.
      expect(typeof opened).toBe('boolean');
    } finally { sim.dispose(); }
  }, 60_000);
});
