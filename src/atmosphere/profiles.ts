import { Color } from 'three';

/**
 * NW-004A lighting profiles: environment-level presets that Codex's chapter orchestration can
 * switch between. Presentation only. They never change gameplay or tell entities anything, and
 * they contain no narrative triggers.
 *
 * Interface: the existing `atmosphere:lighting` event, so no contract changes:
 *
 *   events.emit('atmosphere:lighting', { targetId: 'nw:profile:nurse-encounter', effect: 'restore', durationSeconds: 2.5 })
 *
 *   targetId         'nw:profile:<id>' (ids below)
 *   effect           'restore' activates the profile (any effect is treated the same)
 *   durationSeconds  blend time from the current look (0 = cut)
 *   intensity        optional 0..1 strength of the profile over exploration (default 1)
 *
 * 'nw:profile:exploration' returns to the default look. Circuit and fixture events (dim, flicker,
 * blackout) keep working on top of any profile.
 */
export type LightingProfileId = 'exploration' | 'nurse-encounter' | 'supernatural' | 'patient-chase';
export const PROFILE_PREFIX = 'nw:profile:';

export interface LightingProfile {
  readonly id: LightingProfileId;
  readonly label: string;
  /** Multipliers on fixture brightness by kind. */
  readonly fluorescent: number;
  readonly emergency: number;
  readonly exit: number;
  /** 0..1 random electrical dips on fluorescents (localised instability, never a full flash). */
  readonly instability: number;
  /** 0..1 slow wave of dimming that travels along the ward ("the lights breathe"). */
  readonly breath: number;
  /** Emergency fixtures pulse (escape lighting). */
  readonly emergencyPulse: number;
  /** Multiplier on pooled light reach: < 1 gives isolated pools and long dark gaps. */
  readonly reach: number;
  /** Pool lights are tinted toward this colour by `tintAmount`. */
  readonly tint: number;
  readonly tintAmount: number;
  /** Multipliers on the zone's ambient floor and fog density. */
  readonly ambient: number;
  readonly fog: number;
  readonly sky: number;
  readonly ground: number;
  readonly fogColor: number;
  /** Camera fill (keeps the near field readable). */
  readonly fill: number;
  /** Multiplier on the rate of ambient disturbances (pops, waves, brownouts). */
  readonly disturbance: number;
  /** 0..1 screen-space distortion layer (supernatural only; scaled by the Screen effects setting). */
  readonly distortion: number;
}

export const LIGHTING_PROFILES: Readonly<Record<LightingProfileId, LightingProfile>> = {
  exploration: {
    id: 'exploration', label: 'Exploration — cold fluorescent, readable, isolated darkness',
    fluorescent: 1, emergency: 1, exit: 1, instability: 0, breath: 0, emergencyPulse: 0, reach: 1,
    tint: 0xdfeeff, tintAmount: 0, ambient: 1, fog: 1, sky: 0x50627a, ground: 0x17130f, fogColor: 0x06080b, fill: 1, disturbance: 1, distortion: 0,
  },
  'nurse-encounter': {
    id: 'nurse-encounter', label: 'Nurse encounter — reduced visibility, local pools, long shadows, electrical unease',
    fluorescent: 0.42, emergency: 0.8, exit: 0.7, instability: 0.35, breath: 0, emergencyPulse: 0, reach: 0.62,
    tint: 0xbcd2e8, tintAmount: 0.35, ambient: 0.5, fog: 1.45, sky: 0x2a3644, ground: 0x0c0a08, fogColor: 0x040506, fill: 0.85, disturbance: 1.8, distortion: 0,
  },
  supernatural: {
    id: 'supernatural', label: 'Supernatural event — lights breathe in a wave, sickly cast, light from below, distortion',
    fluorescent: 0.7, emergency: 0.5, exit: 0.4, instability: 0.15, breath: 0.75, emergencyPulse: 0, reach: 0.85,
    tint: 0x7fe0c8, tintAmount: 0.55, ambient: 0.75, fog: 1.6, sky: 0x101a1c, ground: 0x2c4a44, fogColor: 0x061412, fill: 0.7, disturbance: 0.4, distortion: 1,
  },
  'patient-chase': {
    id: 'patient-chase', label: 'Patient chase — emergency lighting, red pulses, exits bright, routes readable',
    fluorescent: 0.12, emergency: 2.4, exit: 2.2, instability: 0.5, breath: 0, emergencyPulse: 1, reach: 1.25,
    tint: 0xff3a24, tintAmount: 0.5, ambient: 0.85, fog: 0.8, sky: 0x4a1612, ground: 0x120606, fogColor: 0x0a0303, fill: 1.15, disturbance: 0.6, distortion: 0,
  },
};

/** Parse 'nw:profile:<id>' (returns null for any other target). */
export function profileFromTarget(targetId: string): LightingProfileId | null {
  if (!targetId.startsWith(PROFILE_PREFIX)) return null;
  const id = targetId.slice(PROFILE_PREFIX.length) as LightingProfileId;
  return id in LIGHTING_PROFILES ? id : null;
}

type Numeric = Exclude<keyof LightingProfile, 'id' | 'label' | 'tint' | 'sky' | 'ground' | 'fogColor'>;
const NUMERIC: readonly Numeric[] = ['fluorescent', 'emergency', 'exit', 'instability', 'breath', 'emergencyPulse', 'reach', 'tintAmount', 'ambient', 'fog', 'fill', 'disturbance', 'distortion'];
const COLOURS = ['tint', 'sky', 'ground', 'fogColor'] as const;

/** The live, blended look: numbers plus colours (THREE.Color, linear). */
export type ProfileState = { -readonly [K in Numeric]: number } & { -readonly [K in (typeof COLOURS)[number]]: Color } & { id: LightingProfileId };

export function stateOf(profile: LightingProfile): ProfileState {
  const s = { id: profile.id } as ProfileState;
  for (const k of NUMERIC) s[k] = profile[k];
  for (const k of COLOURS) s[k] = new Color(profile[k]);
  return s;
}

/** Blends from whatever is showing to a target profile over a duration (smoothstep). */
export class ProfileBlender {
  private from: ProfileState;
  private to: ProfileState;
  private start = 0;
  private duration = 0;
  readonly current: ProfileState;

  constructor(initial: LightingProfileId = 'exploration') {
    this.current = stateOf(LIGHTING_PROFILES[initial]);
    this.from = stateOf(LIGHTING_PROFILES[initial]);
    this.to = stateOf(LIGHTING_PROFILES[initial]);
  }

  get target(): LightingProfileId { return this.to.id; }

  /** Start blending to `id` at time `now`; `strength` mixes it with exploration (0..1). */
  activate(id: LightingProfileId, now: number, duration: number, strength = 1): void {
    this.from = cloneState(this.current);
    const target = stateOf(LIGHTING_PROFILES[id]);
    const base = stateOf(LIGHTING_PROFILES.exploration);
    const k = Math.max(0, Math.min(1, strength));
    for (const key of NUMERIC) target[key] = base[key] + (target[key] - base[key]) * k;
    for (const key of COLOURS) target[key] = base[key].clone().lerp(target[key], k);
    this.to = target;
    this.start = now;
    this.duration = Math.max(0, duration);
  }

  update(now: number): ProfileState {
    const t = this.duration <= 0 ? 1 : Math.max(0, Math.min(1, (now - this.start) / this.duration));
    const e = t * t * (3 - 2 * t);
    for (const key of NUMERIC) this.current[key] = this.from[key] + (this.to[key] - this.from[key]) * e;
    for (const key of COLOURS) this.current[key].copy(this.from[key]).lerp(this.to[key], e);
    this.current.id = e >= 1 ? this.to.id : this.from.id;
    return this.current;
  }
}

function cloneState(s: ProfileState): ProfileState {
  const c = { id: s.id } as ProfileState;
  for (const k of NUMERIC) c[k] = s[k];
  for (const k of COLOURS) c[k] = s[k].clone();
  return c;
}
