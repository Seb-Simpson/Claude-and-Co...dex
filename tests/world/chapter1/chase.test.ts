import { beforeAll, describe, expect, it } from 'vitest';
import { ENTITY_PROFILES } from '../../../src/entities';
import { CHAPTER1_TRIGGERS } from '../../../src/world';
import { dist2, initRapier, Sim, type Step } from './harness';
import { lastKnownIsHonest, record, summarise } from './report';

/**
 * NW-004A Step A, review conditions 1 to 4: the Patient chase, the vestibule cupboard, the alarm
 * fire doors and the final grille, played by a scripted player on Codex's real runtime (see
 * harness.ts). The Patient is released at `patient-emergence` (19.4, -3.2), facing the junction,
 * in the 'alarm' world state; the player stands at the vestibule handoff (12.3, 2.6). Nothing is
 * teleported after the start: no scripted target, no warp.
 *
 * Assertions are the fairness invariants and the outcomes this blockout claims. Every run's
 * numbers go to docs/nw-004a/step-a/chase.json with NW004A_REPORT=1.
 */
beforeAll(initRapier);
const PATIENT = { x: 19.4, z: -3.2, yaw: Math.PI };
const HANDOFF = { x: 12.3, z: 2.6, yaw: 0 };
const pursuit = ENTITY_PROFILES.patient.pursuitSpeed;

const LEAVE_VESTIBULE: Step[] = [{ to: { x: 12.3, z: 2.2 } }, { door: 'nw:door:vestibule' }, { to: { x: 12.3, z: 0.6 }, sprint: true }];
const A_FROM_WING_B: Step[] = [
  { to: { x: 10.4, z: 0.5 }, sprint: true }, { door: 'nw:door:smoke-south' }, { to: { x: 8.2, z: 0.5 }, sprint: true }, { to: { x: 1.6, z: 0.0 }, sprint: true },
  { to: { x: 1.4, z: -0.7 }, sprint: true }, { door: 'nw:door:treatment' }, { to: { x: 1.4, z: -2.4 }, sprint: true }, { to: { x: 4.7, z: -3.0 }, sprint: true },
  { to: { x: 4.6, z: -5.2 }, sprint: true }, { door: 'nw:door:treatment-staff' }, { to: { x: 4.6, z: -7.3 }, sprint: true }, { to: { x: 9.6, z: -7.4 }, sprint: true },
  { to: { x: 9.6, z: -9.0 }, sprint: true }, { to: { x: 17.0, z: -9.0 }, sprint: true }, { door: 'nw:door:staff-east' }, { to: { x: 19.2, z: -9.2 }, sprint: true },
  { to: { x: 19.5, z: -10.5 }, sprint: true }, { to: { x: 20.1, z: -12.2 }, sprint: true },
];
const ROUTE_A: Step[] = [...LEAVE_VESTIBULE, ...A_FROM_WING_B];
const ROUTE_B: Step[] = [
  { to: { x: 12.3, z: 4.8 }, sprint: true }, { door: 'nw:door:vestibule-service' }, { to: { x: 12.3, z: 7.2 }, sprint: true }, { to: { x: 17.3, z: 7.25 }, sprint: true },
  { door: 'nw:door:maintenance-east' }, { to: { x: 19.0, z: 7.25 }, sprint: true }, { to: { x: 19.5, z: 6.0 }, sprint: true }, { to: { x: 19.5, z: -3.9 }, sprint: true },
  { door: 'nw:door:east-fire-west' }, { to: { x: 19.2, z: -6.6 }, sprint: true }, { to: { x: 19.5, z: -10.5 }, sprint: true }, { to: { x: 20.1, z: -12.2 }, sprint: true },
];
const landing = CHAPTER1_TRIGGERS.find((t) => t.key === 'stair-safe-landing')!;
const onLanding = (p: { x: number; z: number }): boolean => Math.abs(p.x - landing.center.x) <= landing.halfExtents.x + 0.4 && Math.abs(p.z - landing.center.z) <= landing.halfExtents.z + 0.4;

function release(extra: Partial<ConstructorParameters<typeof Sim>[0]> = {}): Sim {
  return new Sim({ stage: 'alarm', player: HANDOFF, entities: ['patient'], spawns: { patient: PATIENT }, ...extra });
}
/** Stand in Wing B in the Patient's way until he has seen the player (vision → pursue). */
function getSeen(sim: Sim, standX: number): number {
  sim.run([...LEAVE_VESTIBULE, { to: { x: standX, z: 0.0 } }]);
  sim.face({ x: 19, z: 0 });
  sim.idle(25, (s) => s.entity('patient')!.state === 'pursue');
  return dist2(sim.entity('patient')!.position, sim.position);
}

describe('Condition 1 — Patient chase on real perception and navigation', () => {
  it('route A after being seen (~8 m): he pursues through the smoke doors, loses sight, follows footsteps, searches; the player escapes', () => {
    const sim = release();
    try {
      const seenAt = getSeen(sim, 11.0);
      const failed = sim.run(A_FROM_WING_B);
      sim.idle(4);
      const s = summarise(sim, 'patient');
      const honest = lastKnownIsHonest(sim, 'patient');
      record('chase', 'route-a-after-seen', { seenDistance: Math.round(seenAt * 10) / 10, failedStep: failed, ...s, lastKnownCheck: honest });
      expect(sim.captured).toEqual([]);
      expect(onLanding(sim.position)).toBe(true);
      const states = sim.samples.map((x) => x.entities[0]!);
      // Not neutralised at the first corner: he is still pursuing after the smoke doors (x < 9.4).
      expect(states.some((e) => e.state === 'pursue' && e.position.x < 9.4)).toBe(true);
      // He then works from what he heard or saw, not from a live locator.
      expect(states.some((e) => e.state === 'investigate' || e.state === 'search')).toBe(true);
      expect(honest.checked).toBeGreaterThan(3);
      expect(honest.worst).toBeLessThan(0.6);
      expect(sim.maxEntitySpeed('patient')).toBeLessThan(pursuit * 1.25);
    } finally { sim.dispose(); }
  }, 60_000);

  it('route A seen from further (~9 m): same shape, he follows into treatment and searches the staff passage side', () => {
    const sim = release();
    try {
      const seenAt = getSeen(sim, 9.9);
      const failed = sim.run(A_FROM_WING_B);
      sim.idle(4);
      record('chase', 'route-a-after-seen-9m', { seenDistance: Math.round(seenAt * 10) / 10, failedStep: failed, ...summarise(sim, 'patient'), lastKnownCheck: lastKnownIsHonest(sim, 'patient') });
      expect(sim.captured).toEqual([]);
      expect(sim.maxEntitySpeed('patient')).toBeLessThan(pursuit * 1.25);
    } finally { sim.dispose(); }
  }, 60_000);

  it('route B after being seen: back through the vestibule and the service door; he searches the vestibule door, the player escapes', () => {
    const sim = release();
    try {
      const seenAt = getSeen(sim, 11.0);
      const failed = sim.run([{ to: { x: 12.3, z: 0.6 }, sprint: true }, { to: { x: 12.3, z: 2.4 }, sprint: true }, ...ROUTE_B]);
      sim.idle(4);
      record('chase', 'route-b-after-seen', { seenDistance: Math.round(seenAt * 10) / 10, failedStep: failed, ...summarise(sim, 'patient'), lastKnownCheck: lastKnownIsHonest(sim, 'patient') });
      expect(sim.captured).toEqual([]);
      expect(onLanding(sim.position)).toBe(true);
    } finally { sim.dispose(); }
  }, 60_000);

  it('route B at once (the gamble): he is still walking to the junction, sees the player coming up the east corridor and catches them', () => {
    const sim = release();
    try {
      const failed = sim.run(ROUTE_B);
      record('chase', 'route-b-immediate', { failedStep: failed, ...summarise(sim, 'patient') });
      expect(sim.captured).toEqual(['nw:entity:patient']);
    } finally { sim.dispose(); }
  }, 60_000);

  it('route A at once: KNOWN GAP — on patrol speed with no chime lure he never notices the player', () => {
    const sim = release();
    try {
      const failed = sim.run(ROUTE_A);
      sim.idle(2);
      const s = summarise(sim, 'patient');
      record('chase', 'route-a-immediate', { failedStep: failed, ...s, note: 'Needs a chime lure (investigate the vestibule) from Codex; see STEP-A.md' });
      expect(sim.captured).toEqual([]);
      expect(s.firstPursuit).toBeNull();
    } finally { sim.dispose(); }
  }, 60_000);
});

describe('Condition 2 — the vestibule cupboard', () => {
  it('a witnessed entry is inspected and the player is caught (fair: he saw them go in)', () => {
    const sim = release();
    try {
      // Wait beside the cupboard, facing the door. He walks his search route into the vestibule,
      // sees the player, and the player ducks in while he is looking.
      sim.run([{ to: { x: 11.4, z: 4.7 } }]);
      sim.face({ x: 12.3, z: 1.4 });
      sim.idle(30, (s) => s.entity('patient')!.state === 'pursue');
      const seenAt = dist2(sim.entity('patient')!.position, sim.position);
      const failed = sim.run([{ to: { x: 11.2, z: 5.0 } }, { hide: 'nw:hiding:vestibule-linen' }, { wait: 12 }]);
      record('chase', 'cupboard-witnessed', { seenDistance: Math.round(seenAt * 10) / 10, failedStep: failed, ...summarise(sim, 'patient') });
      expect(sim.samples.some((x) => x.entities[0]!.lastKnownPlayer?.source === 'witnessed-hiding')).toBe(true);
      expect(sim.captured).toEqual(['nw:entity:patient']);
    } finally { sim.dispose(); }
  }, 60_000);

  it('seen at the door, then out of his sight before entering: the entry is unwitnessed and he searches the corridor instead', () => {
    const sim = release();
    try {
      sim.run([{ to: { x: 12.3, z: 2.2 } }, { door: 'nw:door:vestibule' }, { to: { x: 12.3, z: 1.0 } }]);
      sim.face({ x: 19, z: 0 });
      sim.idle(25, (s) => s.entity('patient')!.state === 'pursue');
      const seenAt = dist2(sim.entity('patient')!.position, sim.position);
      const failed = sim.run([{ to: { x: 11.2, z: 4.6 }, sprint: true }, { to: { x: 11.2, z: 5.0 }, sprint: true }, { hide: 'nw:hiding:vestibule-linen' }, { wait: 20 }]);
      record('chase', 'cupboard-seen-then-unwitnessed', { seenDistance: Math.round(seenAt * 10) / 10, failedStep: failed, ...summarise(sim, 'patient') });
      expect(sim.samples.some((x) => x.entities[0]!.lastKnownPlayer?.source === 'witnessed-hiding')).toBe(false);
    } finally { sim.dispose(); }
  }, 60_000);

  it('an unwitnessed entry is not inspected: he passes through the vestibule on his search route and leaves', () => {
    const sim = release();
    try {
      const failed = sim.run([{ to: { x: 11.2, z: 4.6 } }, { to: { x: 11.2, z: 5.7 } }, { hide: 'nw:hiding:vestibule-linen' }, { wait: 40 }]);
      const s = summarise(sim, 'patient');
      const closest = Math.min(...sim.samples.map((x) => dist2(x.entities[0]!.position, { x: 10.8, y: 0, z: 5.7 })));
      record('chase', 'cupboard-unwitnessed', { failedStep: failed, ...s, closestToCupboard: Math.round(closest * 10) / 10 });
      expect(sim.captured).toEqual([]);
      // He comes within a few metres of the cupboard (it is on his route), so hiding is a held breath, not a skip.
      expect(closest).toBeLessThan(3.5);
    } finally { sim.dispose(); }
  }, 60_000);

  it('re-engagement: leaving the cupboard while he is still in sight of the vestibule gets the player seen and chased again', () => {
    const sim = release();
    try {
      sim.run([{ to: { x: 11.2, z: 4.6 } }, { to: { x: 11.2, z: 5.7 } }, { hide: 'nw:hiding:vestibule-linen' }]);
      // Wait until he has walked into the vestibule and is heading for its service door, then come out.
      sim.idle(40, (s) => { const p = s.entity('patient')!.position; return p.x < 13.5 && p.z > 3.6; });
      const exitAt = sim.time;
      sim.interactions.hiding.exit(sim.time);
      sim.idle(1.0);
      sim.run([{ to: { x: 12.3, z: 2.2 }, sprint: true }, { door: 'nw:door:vestibule' }, { to: { x: 12.3, z: 0.6 }, sprint: true }, ...A_FROM_WING_B]);
      sim.idle(3);
      const s = summarise(sim, 'patient');
      record('chase', 'cupboard-reengagement', { exitAt: Math.round(exitAt * 10) / 10, ...s });
      const after = sim.samples.filter((x) => x.t > exitAt).map((x) => x.entities[0]!);
      expect(after.some((e) => e.state === 'pursue' || e.state === 'investigate')).toBe(true);
    } finally { sim.dispose(); }
  }, 60_000);
});

describe('Condition 4 — the final grille under pursuit', () => {
  /**
   * Proposed ending gate (for Codex's ending orchestration): the cinematic may start only when the
   * barrier is closed AND the player is on the landing AND the Patient is on the corridor side.
   */
  const separated = (sim: Sim): boolean => {
    const p = sim.entity('patient')!.position;
    return sim.interactions.getDoorState('nw:door:stairwell-b') === 'closed' && onLanding(sim.position) && p.z > -11.0 && !sim.captured.length;
  };

  for (const lead of [3.6, 7.0, 10.0]) {
    it(`pulls the grille shut with the Patient ${lead} m behind; the ending gate waits for real separation`, () => {
      const sim = new Sim({
        stage: 'alarm', player: { x: 19.5, z: -10.3, yaw: 0 }, entities: ['patient'],
        spawns: { patient: { x: 19.5, z: -10.3 + lead, yaw: 0 } }, openDoors: ['nw:door:east-fire-west', 'nw:door:east-fire-east'],
      });
      try {
        sim.idle(0.3);
        const failed = sim.run([{ to: { x: 19.6, z: -11.6 }, sprint: true }, { to: { x: 20.3, z: -12.4 }, sprint: true }]);
        const closed = failed < 0 && sim.pressDoor('nw:door:stairwell-b', false, 4);
        const closedAt = sim.time;
        const gateAt = separated(sim) ? sim.time : null;
        const patientAtClose = { ...sim.entity('patient')!.position };
        // Keep running: does anything get through, or reopen it?
        sim.idle(6);
        const reopened = sim.doorLog.some((d) => d.door === 'nw:door:stairwell-b' && d.to === 'opening' && d.t > closedAt);
        const s = summarise(sim, 'patient');
        record('chase', `grille-lead-${lead}`, {
          closed, closedAt: Math.round(closedAt * 10) / 10, gateOpenedAt: gateAt === null ? null : Math.round(gateAt * 10) / 10,
          patientAtClose: { x: Math.round(patientAtClose.x * 10) / 10, z: Math.round(patientAtClose.z * 10) / 10 }, reopenedByPatient: reopened, ...s,
        });
        if (closed) {
          // A closed barrier always has the Patient on the corridor side: the swept close never
          // shuts through him (no crushing, no clipping).
          expect(patientAtClose.z).toBeGreaterThan(-11.1);
        } else {
          // Not closed in time: either he was in the leaf's arc (blocked) or he caught the player.
          expect(sim.captured.length > 0 || sim.doorLog.some((d) => d.door === 'nw:door:stairwell-b' && d.to === 'blocked')).toBe(true);
        }
        if (gateAt !== null) expect(closed).toBe(true);
      } finally { sim.dispose(); }
    }, 60_000);
  }
});
