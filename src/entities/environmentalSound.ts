import type { Vec3 } from '../contracts';

/** An observed world sound. It carries no player identity or privileged target location. */
export interface EnvironmentalSoundStimulus {
  readonly id: string;
  readonly position: Vec3;
  readonly radius: number;
  readonly intensity: number;
  /** Authoritative fixed simulation time, in the same domain as entity updates. */
  readonly timeSeconds: number;
}

export function isEnvironmentalSoundStimulus(sound: EnvironmentalSoundStimulus): boolean {
  return Boolean(sound && typeof sound.id === 'string' && sound.id.trim() && sound.id.length <= 256 &&
    sound.position && [sound.position.x, sound.position.y, sound.position.z, sound.radius,
      sound.intensity, sound.timeSeconds].every(Number.isFinite) && sound.radius > 0 &&
    sound.intensity > 0 && sound.intensity <= 1 && sound.timeSeconds >= 0);
}
