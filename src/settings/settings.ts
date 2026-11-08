/**
 * Player settings: one validated, versioned record persisted in browser storage.
 *
 * Storage may be missing (private browsing, sandboxed iframes, disabled cookies), full or throw
 * on access. Every access is guarded: the game then runs on in-memory settings and reports
 * `persistent: false` so the UI can say so.
 */
export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra';
export type MotionPreference = 'system' | 'reduce' | 'full';

export interface Settings {
  /** 0..1 */
  readonly masterVolume: number;
  readonly musicVolume: number;
  readonly sfxVolume: number;
  /** Multiplier on the gameplay look sensitivity, 0.25..3. */
  readonly mouseSensitivity: number;
  readonly invertY: boolean;
  readonly quality: QualityPreset;
  readonly subtitles: boolean;
  readonly motion: MotionPreference;
  /** Strength of screen effects (grain, vignette pulses, flashes), 0..1. */
  readonly effects: number;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  masterVolume: 0.8,
  musicVolume: 0.7,
  sfxVolume: 0.9,
  mouseSensitivity: 1,
  invertY: false,
  quality: 'high',
  subtitles: true,
  motion: 'system',
  effects: 1,
});

export const QUALITY_PRESETS: Readonly<Record<QualityPreset, { readonly label: string; readonly pixelRatio: number; readonly description: string }>> = {
  low: { label: 'Low', pixelRatio: 0.75, description: 'Renders at three-quarter resolution. For older laptops.' },
  medium: { label: 'Medium', pixelRatio: 1, description: 'Native resolution on standard displays.' },
  high: { label: 'High', pixelRatio: 1.5, description: 'Sharper on high-density displays.' },
  ultra: { label: 'Ultra', pixelRatio: 2, description: 'Full Retina resolution. Needs a dedicated GPU.' },
};

const KEY = 'night-ward:settings:v1';
const clamp = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback);

/** Accept anything, return a valid Settings (unknown or out-of-range values fall back to defaults). */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    masterVolume: clamp(r.masterVolume, 0, 1, d.masterVolume),
    musicVolume: clamp(r.musicVolume, 0, 1, d.musicVolume),
    sfxVolume: clamp(r.sfxVolume, 0, 1, d.sfxVolume),
    mouseSensitivity: clamp(r.mouseSensitivity, 0.25, 3, d.mouseSensitivity),
    invertY: typeof r.invertY === 'boolean' ? r.invertY : d.invertY,
    quality: oneOf(r.quality, ['low', 'medium', 'high', 'ultra'], d.quality),
    subtitles: typeof r.subtitles === 'boolean' ? r.subtitles : d.subtitles,
    motion: oneOf(r.motion, ['system', 'reduce', 'full'], d.motion),
    effects: clamp(r.effects, 0, 1, d.effects),
  };
}

export interface SettingsStore {
  get(): Settings;
  update(patch: Partial<Settings>): Settings;
  reset(): Settings;
  subscribe(listener: (settings: Settings) => void): () => void;
  /** False when browser storage is unavailable: changes last for this visit only. */
  readonly persistent: boolean;
}

function safeStorage(candidate?: Storage | null): Storage | null {
  try {
    const storage = candidate === undefined ? globalThis.localStorage : candidate;
    if (!storage) return null;
    const probe = `${KEY}:probe`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

export function createSettingsStore(storage?: Storage | null): SettingsStore {
  const backing = safeStorage(storage);
  let current: Settings = DEFAULT_SETTINGS;
  if (backing) {
    try {
      const raw = backing.getItem(KEY);
      if (raw) current = sanitizeSettings(JSON.parse(raw));
    } catch {
      current = DEFAULT_SETTINGS;
    }
  }
  const listeners = new Set<(s: Settings) => void>();
  let persistent = backing !== null;
  const commit = (next: Settings): Settings => {
    current = next;
    if (backing) {
      try {
        backing.setItem(KEY, JSON.stringify(next));
      } catch {
        persistent = false; // quota exceeded or revoked mid-session
      }
    }
    for (const listener of [...listeners]) listener(current);
    return current;
  };
  return {
    get: () => current,
    update: (patch) => commit(sanitizeSettings({ ...current, ...patch })),
    reset: () => commit(DEFAULT_SETTINGS),
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    get persistent() { return persistent; },
  };
}

/** Whether motion should be reduced: the explicit setting, else the OS preference. */
export function prefersReducedMotion(settings: Settings, media: { matches: boolean } | null = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null): boolean {
  if (settings.motion === 'reduce') return true;
  if (settings.motion === 'full') return false;
  return media?.matches ?? false;
}

/** The game-wide store. Modules read it; only the frontend writes it. */
export const settings: SettingsStore = createSettingsStore();
