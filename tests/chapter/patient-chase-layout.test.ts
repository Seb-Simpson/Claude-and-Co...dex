import RAPIER from '@dimforge/rapier3d-compat';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ColliderDefinition, Vec3 } from '../../src/contracts';
import { createNavigationProvider, createPhysicsAdapter } from '../../src/physics';
import { resolveEntityProfile } from '../../src/entities/profiles';
import { inspectPatientChaseLayout } from '../../src/gameplay/chapter/patientChaseLayout';
import type { PatientChaseLayout } from '../../src/gameplay/chapter/patientChaseLayout';

beforeAll(async () => { await RAPIER.init(); });
const cleanups: (() => void)[] = [];
afterEach(() => { for (const dispose of cleanups.splice(0).reverse()) dispose(); });
const p = (x: number, z: number): Vec3 => ({ x, y: 0.005, z });

/** Deliberately isolated geometry, not coordinates for either proposed hospital map. */
function fixture(sealed = false) {
  const rapier = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const rotation = { x: 0, y: 0, z: 0, w: 1 };
  const colliders: ColliderDefinition[] = [
    { id: 'test:floor', bodyType: 'fixed', sensor: false, shape: { type: 'box', halfExtents: { x: 20, y: 0.25, z: 12 } }, pose: { position: { x: 0, y: -0.25, z: 0 }, rotation } },
    { id: 'test:divider', bodyType: 'fixed', sensor: false, shape: { type: 'box', halfExtents: { x: 0.12, y: 1.5, z: sealed ? 12 : 3 } }, pose: { position: { x: 0, y: 1.5, z: 0 }, rotation } },
  ];
  const physics = createPhysicsAdapter(rapier, colliders);
  const provider = createNavigationProvider(physics, { min: { x: -20, y: -1, z: -12 }, max: { x: 20, y: 4, z: 12 } }, { cellSize: 0.5, maxNodes: 4096 });
  const profile = resolveEntityProfile('patient');
  const navigation = { player: provider, patient: provider,
    playerAgent: { ...profile.agent, radius: 0.28 }, patientProfile: profile };
  const layout: PatientChaseLayout = {
    revision: 'test:loop-v1', patientStage: { position: p(-8, 0), yaw: -Math.PI / 2 },
    playerHandoff: { position: p(8, 0), yaw: Math.PI / 2 }, chime: p(8, 0), exitApproach: p(14, 0),
    routes: [{ id: 'test:north', points: [p(8, 0), p(10, -4), p(14, 0)] },
      { id: 'test:south', points: [p(8, 0), p(10, 4), p(14, 0)] }],
  };
  cleanups.push(() => { physics.dispose(); rapier.free(); });
  return { layout, navigation, physics };
}

describe('Patient chase authored route preflight', () => {
  it('measures two distinct real traversable choices without relying on detection or door delays', () => {
    const f = fixture();
    const report = inspectPatientChaseLayout(f.layout, f.navigation);
    expect(report.issues).toEqual([]);
    expect(report.valid).toBe(true);
    expect(report.routes).toHaveLength(2);
    for (const route of report.routes) {
      expect(route.lengthMetres).toBeGreaterThan(9);
      expect(route.decisionLeadSeconds).toBeGreaterThan(2);
    }
  });

  it('rejects unreachable Patient approaches instead of accepting an imagined wall-crossing route', () => {
    const f = fixture(true);
    const result = inspectPatientChaseLayout(f.layout, f.navigation);
    expect(result.valid).toBe(false);
    expect(result.issues.some(issue => issue.includes('Patient cannot navigate'))).toBe(true);
  });

  it('rejects two names or different sample spacing for the same corridor', () => {
    const f = fixture();
    const result = inspectPatientChaseLayout({ ...f.layout, routes: [
      { id: 'test:one', points: [p(8, 0), p(10, 0), p(14, 0)] },
      { id: 'test:two', points: [p(8, 0), p(11, 0), p(14, 0)] },
    ] }, f.navigation);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('Escape approaches have no distinct authored branch.');
  });

  it('rejects short spawn separation and an insufficient measured response window', () => {
    const f = fixture();
    const close = inspectPatientChaseLayout({ ...f.layout,
      patientStage: { position: p(6, 0), yaw: -Math.PI / 2 } }, f.navigation);
    expect(close.valid).toBe(false);
    expect(close.issues.some(issue => issue.includes('minimum'))).toBe(true);
    const tooFast = inspectPatientChaseLayout(f.layout, { ...f.navigation,
      patientProfile: { ...f.navigation.patientProfile, pursuitSpeed: 100 } });
    expect(tooFast.valid).toBe(false);
    expect(tooFast.issues.some(issue => issue.includes('reaction lead'))).toBe(true);
  });

  it('rejects unsupported gaps, non-finite anchors and disconnected route endpoints', () => {
    const f = fixture();
    const unsupported = inspectPatientChaseLayout({ ...f.layout, routes: [
      { id: 'test:gap', points: [p(8, 0), p(10, 20), p(14, 0)] }, f.layout.routes[1]!,
    ] }, f.navigation);
    expect(unsupported.valid).toBe(false);
    expect(unsupported.issues.some(issue => issue.includes('blocked or unsupported'))).toBe(true);
    expect(inspectPatientChaseLayout({ ...f.layout, chime: p(NaN, 0) }, f.navigation).valid).toBe(false);
    const disconnected = inspectPatientChaseLayout({ ...f.layout, exitApproach: p(17, 0) }, f.navigation);
    expect(disconnected.valid).toBe(false);
    expect(disconnected.issues.some(issue => issue.includes('exit approach'))).toBe(true);
  });
});
