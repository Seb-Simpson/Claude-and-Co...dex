import type { EntityType, NavigationAgent, PerceptionConfig } from '../contracts';

export interface EntityProfile extends PerceptionConfig {
  readonly agent: NavigationAgent;
  readonly eyeHeight: number;
  readonly patrolSpeed: number;
  readonly investigateSpeed: number;
  readonly pursuitSpeed: number;
  readonly searchSpeed: number;
  readonly searchRadius: number;
  readonly idleSeconds: number;
  readonly searchSeconds: number;
  readonly lostTargetSeconds: number;
  readonly recoverySeconds: number;
  readonly pathRefreshSeconds: number;
  readonly captureRange: number;
  readonly captureDwellSeconds: number;
  readonly captureGraceSeconds: number;
  readonly hearingMaxAgeSeconds: number;
  readonly hearingOcclusionMultiplier: number;
  readonly hidingMemorySeconds: number;
  readonly canCapture: boolean;
  readonly observationRule: 'unrestricted' | 'unobserved-only';
}

const patient: EntityProfile = {
  agent: { radius: 0.3, height: 1.8, maxSlopeRadians: Math.PI / 4, maxStepHeight: 0.25 },
  eyeHeight: 1.6, visionRange: 13, fieldOfViewRadians: Math.PI * 0.55,
  hearingMultiplier: 1, detectionSeconds: 0.45, loseSightSeconds: 1.25,
  patrolSpeed: 0.75, investigateSpeed: 1.35, pursuitSpeed: 4.1, searchSpeed: 1, searchRadius: 1.8,
  idleSeconds: 1, searchSeconds: 8, lostTargetSeconds: 0.6, recoverySeconds: 2,
  pathRefreshSeconds: 0.4, captureRange: 0.85, captureDwellSeconds: 0.6,
  captureGraceSeconds: 1.2, hearingMaxAgeSeconds: 1.5, hearingOcclusionMultiplier: 0.35,
  hidingMemorySeconds: 12, canCapture: true, observationRule: 'unrestricted',
};

/** Secondary entries are configurable framework profiles, not finished encounter content. */
export const ENTITY_PROFILES: Readonly<Record<EntityType, EntityProfile>> = {
  patient,
  nurse: { ...patient, visionRange: 7, hearingMultiplier: 2.4, detectionSeconds: 0.8, patrolSpeed: 0.9, pursuitSpeed: 3.4 },
  crawler: {
    ...patient, agent: { radius: 0.22, height: 0.65, maxSlopeRadians: Math.PI / 4, maxStepHeight: 0.1 },
    eyeHeight: 0.45, visionRange: 9, patrolSpeed: 0.65, pursuitSpeed: 3.2,
  },
  watcher: { ...patient, observationRule: 'unobserved-only', patrolSpeed: 0.55, pursuitSpeed: 2.7, detectionSeconds: 1 },
  reflection: { ...patient, canCapture: false, patrolSpeed: 0, investigateSpeed: 0, pursuitSpeed: 0, searchSpeed: 0 },
};

export function resolveEntityProfile(type: EntityType, overrides: Partial<EntityProfile> = {}): EntityProfile {
  const profile = { ...ENTITY_PROFILES[type], ...overrides };
  const nonnegative = [profile.patrolSpeed, profile.investigateSpeed, profile.pursuitSpeed, profile.searchSpeed,
    profile.eyeHeight, profile.idleSeconds, profile.recoverySeconds, profile.agent.maxStepHeight];
  const positive = [profile.visionRange, profile.fieldOfViewRadians, profile.hearingMultiplier,
    profile.detectionSeconds, profile.loseSightSeconds, profile.searchSeconds, profile.lostTargetSeconds,
    profile.pathRefreshSeconds, profile.searchRadius, profile.captureRange, profile.captureDwellSeconds,
    profile.captureGraceSeconds, profile.hearingMaxAgeSeconds, profile.hidingMemorySeconds,
    profile.agent.radius, profile.agent.height, profile.agent.maxSlopeRadians];
  if (nonnegative.some((v) => !Number.isFinite(v) || v < 0) ||
      positive.some((v) => !Number.isFinite(v) || v <= 0) ||
      profile.agent.height < 2 * profile.agent.radius || profile.fieldOfViewRadians > Math.PI * 2 ||
      !Number.isFinite(profile.hearingOcclusionMultiplier) || profile.hearingOcclusionMultiplier < 0 ||
      profile.hearingOcclusionMultiplier > 1) throw new Error(`Invalid ${type} entity profile`);
  return profile;
}
