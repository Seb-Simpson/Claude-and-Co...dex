import type { Vector3 } from 'three';
import type { LightingEvent } from '../../contracts';
import type { OverlayPulse } from './overlay';

/** The reusable cinematic beats. None of them move entities, capture the player or decide AI. */
export type CinematicKind = 'distant-reveal' | 'lighting-failure' | 'chase-initiation' | 'disappear' | 'near-miss' | 'post-chase-silence';
export const CINEMATIC_KINDS: readonly CinematicKind[] = ['distant-reveal', 'lighting-failure', 'chase-initiation', 'disappear', 'near-miss', 'post-chase-silence'];

/** Everything a cinematic may touch, injected so the director is testable and reusable. */
export interface CinematicServices {
  lighting(event: LightingEvent): void;
  sound(cueId: string, position?: Vector3 | null, volume?: number, duration?: number): void;
  /** Light fixture IDs near a point (mains fixtures only unless `kinds` says otherwise). */
  fixturesNear(position: Vector3, radius: number): readonly string[];
  overlay(pulse: OverlayPulse): void;
  /** Muffle ambience + entity audio to `level` for `seconds`. */
  duck(level: number, seconds: number): void;
  /** Hard cut of ambience and score, then a slow return. */
  silence(seconds: number): void;
  clearOverlay(): void;
}

export interface CinematicRequest {
  readonly position?: Vector3 | null;
  /** 0..1 scales the strength of the beat. */
  readonly intensity?: number;
  /** Ignore the cooldown (explicit requests from other modules). */
  readonly force?: boolean;
}

interface Step { readonly at: number; readonly run: () => void }

const COOLDOWNS: Record<CinematicKind, number> = {
  'distant-reveal': 28,
  'lighting-failure': 45,
  'chase-initiation': 3,
  disappear: 18,
  'near-miss': 12,
  'post-chase-silence': 4,
};

/**
 * Plays timed, event-driven presentation beats. Each beat is a small timeline of lighting,
 * sound and screen-overlay steps run on the presentation clock.
 */
export class CinematicDirector {
  private time = 0;
  private readonly steps: Step[] = [];
  private readonly lastPlayed = new Map<CinematicKind, number>();
  /** Log of played beats (most recent last), useful for debugging and tests. */
  readonly history: { kind: CinematicKind; time: number }[] = [];

  constructor(private readonly services: CinematicServices) {}

  /** Returns false when the beat is still cooling down. */
  play(kind: CinematicKind, request: CinematicRequest = {}): boolean {
    const last = this.lastPlayed.get(kind);
    if (!request.force && last !== undefined && this.time - last < COOLDOWNS[kind]) return false;
    this.lastPlayed.set(kind, this.time);
    this.history.push({ kind, time: this.time });
    if (this.history.length > 50) this.history.shift();
    const s = this.services;
    const k = Math.max(0, Math.min(1, request.intensity ?? 1));
    const at = request.position ?? null;
    const schedule = (delay: number, run: () => void): void => { this.steps.push({ at: this.time + delay, run }); };
    const lights = (radius: number, effect: LightingEvent['effect'], duration: number, intensity?: number): void => {
      if (!at) return;
      for (const id of s.fixturesNear(at, radius)) s.lighting({ targetId: id, effect, durationSeconds: duration, ...(intensity !== undefined ? { intensity } : {}) });
    };
    switch (kind) {
      case 'distant-reveal':
        // Something is standing down there. The lights near it sag; a slow swell; nothing else.
        lights(6, 'dim', 3.5, 0.35);
        s.sound('nw:reveal', null, 0.6 * k);
        s.overlay({ vignette: 0.32 * k, attack: 1.2, hold: 1.4, release: 2.2 });
        break;
      case 'lighting-failure':
        lights(16, 'flicker', 0.6);
        schedule(0.55, () => {
          lights(16, 'blackout', 3.4 + k * 1.5);
          s.lighting({ targetId: 'nw:lights:emergency', effect: 'dim', durationSeconds: 4.5 + k * 1.5, intensity: 1.8 });
          s.sound('nw:power-down', at, 0.8 * k);
          s.overlay({ vignette: 0.45 * k, attack: 0.3, hold: 3, release: 2 });
        });
        schedule(4.0 + k * 1.5, () => {
          lights(16, 'flicker', 0.9);
          s.sound('nw:power-up', at, 0.5 * k);
        });
        schedule(4.9 + k * 1.5, () => lights(16, 'restore', 0));
        break;
      case 'chase-initiation':
        s.sound('nw:chase-stinger', null, 0.85 * k);
        lights(9, 'flicker', 1.3);
        s.overlay({ vignette: 0.55 * k, tint: '#4a0000', tintStrength: 0.22 * k, attack: 0.06, hold: 0.7, release: 2.6 });
        break;
      case 'disappear':
        // A short dropout around where it was; when the light returns, it is gone.
        lights(5, 'blackout', 0.4);
        s.sound('nw:presence-out', at, 0.5 * k);
        break;
      case 'near-miss':
        s.duck(0.3, 3.2);
        s.sound('nw:heartbeat', null, 0.75 * k, 4);
        s.overlay({ vignette: 0.6 * k, attack: 0.4, hold: 2.2, release: 2.5 });
        break;
      case 'post-chase-silence':
        // Everything stops at once. The quiet is the point.
        s.clearOverlay();
        s.silence(6);
        s.overlay({ vignette: 0.35, attack: 0.02, hold: 1.5, release: 4 });
        schedule(6.5, () => s.sound('nw:distant-steps', null, 0.25));
        break;
    }
    return true;
  }

  /** Cancel scheduled steps (e.g. on dispose or a hard state change). */
  cancel(): void { this.steps.length = 0; }

  get pending(): number { return this.steps.length; }

  update(dt: number): void {
    this.time += dt;
    for (let i = 0; i < this.steps.length;) {
      const step = this.steps[i]!;
      if (step.at <= this.time) {
        this.steps.splice(i, 1);
        step.run();
      } else i++;
    }
  }
}
