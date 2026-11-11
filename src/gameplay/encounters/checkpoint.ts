export const STATION_PHASES = ['waiting', 'introduction', 'tension', 'stealth', 'escape', 'complete'] as const;
export type StationPhase = typeof STATION_PHASES[number];
/** Milestone restore, never a serialization of a pursuer's privileged perception/memory. */
export interface StationCheckpoint {
  readonly version: 1;
  readonly phase: Exclude<StationPhase, 'waiting' | 'escape'>;
}
export function validateStationCheckpoint(raw: unknown): StationCheckpoint | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const proto: unknown = Object.getPrototypeOf(raw);
  if (proto !== Object.prototype && proto !== null) return null;
  const keys = Reflect.ownKeys(raw);
  if (keys.length !== 2 || keys.some(k => k !== 'version' && k !== 'phase') ||
      keys.some(k => !('value' in Object.getOwnPropertyDescriptor(raw, k)!))) return null;
  const value = raw as Record<string, unknown>;
  if (value.version !== 1 || typeof value.phase !== 'string' || !['introduction', 'tension', 'stealth', 'complete'].includes(value.phase)) return null;
  return {version: 1, phase: value.phase as StationCheckpoint['phase']};
}
