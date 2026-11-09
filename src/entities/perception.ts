import type { PerceptionConfig, PlayerNoiseEvent, PlayerSnapshot, Vec3 } from '../contracts';
import { isEnvironmentalSoundStimulus } from './environmentalSound';
import type { EnvironmentalSoundStimulus } from './environmentalSound';

export interface VisionOptions {
  readonly observerPosition: Vec3;
  readonly observerForward: Vec3;
  readonly eyeHeight: number;
  readonly player: PlayerSnapshot;
  readonly config: PerceptionConfig;
  readonly hasLineOfSight: (from: Vec3, to: Vec3) => boolean;
  readonly standingEyeHeight?: number;
  readonly crouchingEyeHeight?: number;
}

export interface HearingOptions {
  readonly observerPosition: Vec3;
  readonly noise: PlayerNoiseEvent;
  readonly config: PerceptionConfig;
  readonly timeSeconds: number;
  readonly maxAgeSeconds: number;
  readonly hasLineOfSight: (from: Vec3, to: Vec3) => boolean;
  readonly occludedMultiplier?: number;
}
export interface EnvironmentalHearingOptions extends Omit<HearingOptions, 'noise'> {
  readonly sound: EnvironmentalSoundStimulus;
}

export interface ObservationOptions {
  readonly observerPosition: Vec3;
  readonly eyeHeight: number;
  readonly player: PlayerSnapshot;
  readonly hasLineOfSight: (from: Vec3, to: Vec3) => boolean;
  readonly maxRange?: number;
  readonly fieldOfViewRadians?: number;
  readonly standingEyeHeight?: number;
  readonly crouchingEyeHeight?: number;
}

const finiteVector = (value: Vec3): boolean =>
  Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
const withHeight = (position: Vec3, height: number): Vec3 => ({
  x: position.x, y: position.y + height, z: position.z,
});
const distance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function inVisionCone(from: Vec3, forward: Vec3, to: Vec3, range: number, fov: number): boolean {
  if (!finiteVector(from) || !finiteVector(forward) || !finiteVector(to) ||
      !Number.isFinite(range) || range <= 0 || !Number.isFinite(fov) || fov <= 0 || fov > Math.PI * 2) return false;
  const length = Math.hypot(forward.x, forward.y, forward.z);
  if (length < 1e-8) return false;
  const separation = distance(from, to);
  if (separation > range) return false;
  if (separation < 1e-8) return true;
  const dot = ((to.x - from.x) * forward.x + (to.y - from.y) * forward.y +
    (to.z - from.z) * forward.z) / (separation * length);
  return dot + 1e-10 >= Math.cos(fov / 2);
}

function eyePosition(player: PlayerSnapshot, standing: number, crouching: number): Vec3 | null {
  const height = player.crouching ? crouching : standing;
  if (!finiteVector(player.position) || !Number.isFinite(height) || height < 0) return null;
  return withHeight(player.position, height);
}

/** Current visible observation only; never grants sight of any concealed player state. */
export function canSeePlayer(options: VisionOptions): boolean {
  const { observerPosition, observerForward, eyeHeight, player, config, hasLineOfSight } = options;
  if (player.captured || player.hiding.state !== 'outside' || !Number.isFinite(eyeHeight) || eyeHeight < 0) return false;
  const target = eyePosition(player, options.standingEyeHeight ?? 1.65, options.crouchingEyeHeight ?? 0.9);
  if (!target) return false;
  const from = withHeight(observerPosition, eyeHeight);
  return inVisionCone(from, observerForward, target, config.visionRange, config.fieldOfViewRadians) &&
    hasLineOfSight(from, target);
}

/** Hearing is a finite, recent observation; obstruction attenuates rather than grants exact vision. */
export function canHearNoise(options: HearingOptions): boolean {
  if (typeof options.noise.playerId !== 'string' || !options.noise.playerId.trim()) return false;
  return canHearSample({ ...options, sample: options.noise });
}

/** Same acoustic rules as footsteps, without claiming that a world sound identifies a player. */
export function canHearEnvironmentalSound(options: EnvironmentalHearingOptions): boolean {
  if (!isEnvironmentalSoundStimulus(options.sound)) return false;
  return canHearSample({ ...options, sample: options.sound });
}

function canHearSample(options: Omit<HearingOptions, 'noise'> & {
  readonly sample: Pick<PlayerNoiseEvent, 'position' | 'radius' | 'intensity' | 'timeSeconds'>;
}): boolean {
  const { observerPosition, sample: noise, config, timeSeconds, maxAgeSeconds, hasLineOfSight } = options;
  const occludedMultiplier = options.occludedMultiplier ?? 0.35;
  if (!finiteVector(observerPosition) || !finiteVector(noise.position) ||
      !Number.isFinite(timeSeconds) || !Number.isFinite(noise.timeSeconds) ||
      !Number.isFinite(maxAgeSeconds) || maxAgeSeconds < 0 || timeSeconds < noise.timeSeconds ||
      timeSeconds - noise.timeSeconds > maxAgeSeconds ||
      !Number.isFinite(noise.radius) || noise.radius <= 0 ||
      !Number.isFinite(noise.intensity) || noise.intensity <= 0 || noise.intensity > 1 ||
      !Number.isFinite(config.hearingMultiplier) || config.hearingMultiplier <= 0 ||
      !Number.isFinite(occludedMultiplier) || occludedMultiplier < 0 || occludedMultiplier > 1) return false;
  const effectiveRadius = noise.radius * noise.intensity * config.hearingMultiplier;
  if (!Number.isFinite(effectiveRadius)) return false;
  const separation = distance(observerPosition, noise.position);
  if (separation > effectiveRadius) return false;
  // The noise and actor coordinates are feet positions; lift the occlusion ray off the floor.
  const unobstructed = hasLineOfSight(withHeight(observerPosition, 0.1), withHeight(noise.position, 0.1));
  return separation <= effectiveRadius * (unobstructed ? 1 : occludedMultiplier);
}

/** Watcher movement rule: a direct, unoccluded player view freezes the observer. */
export function isObserverSeenByPlayer(options: ObservationOptions): boolean {
  const { observerPosition, eyeHeight, player, hasLineOfSight } = options;
  if (player.captured || player.hiding.state !== 'outside' || !Number.isFinite(eyeHeight) || eyeHeight < 0 ||
      !Number.isFinite(player.rotation.yaw) || !Number.isFinite(player.rotation.pitch)) return false;
  const from = eyePosition(player, options.standingEyeHeight ?? 1.65, options.crouchingEyeHeight ?? 0.9);
  if (!from) return false;
  const { yaw, pitch } = player.rotation;
  const forward = {
    x: -Math.sin(yaw) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * Math.cos(pitch),
  };
  const target = withHeight(observerPosition, eyeHeight);
  return inVisionCone(from, forward, target, options.maxRange ?? 18, options.fieldOfViewRadians ?? Math.PI * 80 / 180) &&
    hasLineOfSight(from, target);
}
