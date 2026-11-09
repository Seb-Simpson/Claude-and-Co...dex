import type { NavigationAgent, NavigationProvider, SpawnPose, Vec3 } from '../../contracts';
import type { EntityProfile } from '../../entities/profiles';

/** Resolved once from producer-owned semantic anchors. Never copy coordinates into gameplay. */
export interface PatientChaseLayout {
  readonly revision: string;
  /** Final physical mark of the reveal animation, not the player's current position. */
  readonly patientStage: SpawnPose;
  readonly playerHandoff: SpawnPose;
  readonly chime: Vec3;
  readonly exitApproach: Vec3;
  readonly routes: readonly { readonly id: string; readonly points: readonly Vec3[] }[];
  readonly minimumSeparationMetres?: number;
  readonly minimumDecisionLeadSeconds?: number;
  readonly playerSprintSpeed?: number;
}
export interface PatientChaseNavigation {
  readonly player: NavigationProvider;
  readonly patient: NavigationProvider;
  readonly playerAgent: NavigationAgent;
  readonly patientProfile: EntityProfile;
}
export interface PatientChaseRouteReport {
  readonly id: string;
  readonly lengthMetres: number;
  /** Earliest full-speed arrival at the first decision, without assuming door/detection delays. */
  readonly decisionLeadSeconds: number;
}
export interface PatientChaseReadiness {
  readonly valid: boolean;
  readonly issues: readonly string[];
  readonly routes: readonly PatientChaseRouteReport[];
}
const finite = (p: Vec3): boolean => !!p && [p.x, p.y, p.z].every(Number.isFinite);
const distance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function segmentDistance(p: Vec3, a: Vec3, b: Vec3): number {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const length = dx * dx + dy * dy + dz * dz;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / length)) : 0;
  return distance(p, { x: a.x + dx * t, y: a.y + dy * t, z: a.z + dz * t });
}
function pathLength(provider: NavigationProvider, from: Vec3, to: Vec3, agent: NavigationAgent): number | null {
  const path = provider.findPath({ from, to, agent });
  if (!path?.reachesGoal || !path.waypoints.length || path.waypoints.length > 8192 || path.waypoints.some(p => !finite(p))) return null;
  let length = 0, previous = from;
  for (const point of path.waypoints) { length += distance(previous, point); previous = point; }
  if (distance(previous, to) > 0.35) return null;
  return length + distance(previous, to);
}

/** Bounded preflight at preparation/handoff, never a per-frame route planner. */
export function inspectPatientChaseLayout(layout: PatientChaseLayout, navigation: PatientChaseNavigation): PatientChaseReadiness {
  const issues: string[] = [];
  const reports: PatientChaseRouteReport[] = [];
  const separation = layout.minimumSeparationMetres ?? 8;
  const lead = layout.minimumDecisionLeadSeconds ?? 1.5;
  const sprint = layout.playerSprintSpeed ?? 4.3;
  if (!layout.revision.trim() || !finite(layout.patientStage.position) || !finite(layout.playerHandoff.position) ||
      !finite(layout.chime) || !finite(layout.exitApproach) || !Number.isFinite(layout.patientStage.yaw) || !Number.isFinite(layout.playerHandoff.yaw) ||
      ![separation, lead, sprint, navigation.patientProfile.pursuitSpeed].every(n => Number.isFinite(n) && n > 0)) {
    return { valid: false, issues: ['Invalid chase revision, anchors or movement parameters.'], routes: [] };
  }
  if (distance(layout.patientStage.position, layout.playerHandoff.position) < separation) issues.push('Patient handoff separation is below the configured minimum.');
  if (!navigation.patient.isPositionValid(layout.patientStage.position, navigation.patientProfile.agent)) issues.push('Patient stage is not supported and navigable.');
  if (!navigation.player.isPositionValid(layout.playerHandoff.position, navigation.playerAgent)) issues.push('Player handoff is not supported and navigable.');
  if (layout.routes.length < 2 || layout.routes.length > 4) return { valid: false, issues: [...issues, 'Supply two to four authored escape approaches.'], routes: [] };
  const ids = new Set<string>();
  const routes = layout.routes.filter(r => r.points.length >= 3 && r.points.length <= 24 && r.points.every(finite)).map(r => r.points);
  for (const route of layout.routes) {
    if (!route.id.trim() || ids.has(route.id) || route.points.length < 3 || route.points.length > 24 || route.points.some(p => !finite(p))) {
      issues.push('Escape routes need unique IDs and three to twenty-four finite anchors.'); continue;
    }
    ids.add(route.id);
    const start = route.points[0]!, decision = route.points[1]!, end = route.points.at(-1)!;
    if (distance(start, decision) < 0.5) issues.push(`${route.id}: first decision must be a reachable place beyond the handoff.`);
    if (distance(start, layout.playerHandoff.position) > 0.35 || distance(end, layout.exitApproach) > 0.35) issues.push(`${route.id}: route does not join the real handoff and exit approach.`);
    let length = 0, firstLength = 0;
    for (let i = 1; i < route.points.length; i++) {
      const result = pathLength(navigation.player, route.points[i - 1]!, route.points[i]!, navigation.playerAgent);
      if (result === null) { issues.push(`${route.id}: player segment ${i} is blocked or unsupported.`); break; }
      if (pathLength(navigation.patient, route.points[i - 1]!, route.points[i]!, navigation.patientProfile.agent) === null) {
        issues.push(`${route.id}: Patient segment ${i} is blocked or lacks capsule clearance.`);
      }
      length += result;
      if (i === 1) firstLength = result;
    }
    const patientLength = pathLength(navigation.patient, layout.patientStage.position, decision, navigation.patientProfile.agent);
    if (patientLength === null) issues.push(`${route.id}: Patient cannot navigate to the decision area.`);
    const decisionLeadSeconds = patientLength === null ? 0 : patientLength / navigation.patientProfile.pursuitSpeed - firstLength / sprint;
    if (decisionLeadSeconds < lead) issues.push(`${route.id}: first decision lacks the configured reaction lead.`);
    reports.push({ id: route.id, lengthMetres: length, decisionLeadSeconds });
  }
  // Distinct names/resampling of one corridor are not alternate paths. Require a real divergence.
  const distinct = routes.some((a, i) => routes.some((b, j) => i !== j && a.some(p =>
    b.length > 1 && Math.min(...b.slice(1).map((end, k) => segmentDistance(p, b[k]!, end))) >= 1)));
  if (!distinct) issues.push('Escape approaches have no distinct authored branch.');
  return { valid: issues.length === 0, issues, routes: reports };
}
