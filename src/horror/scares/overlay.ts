import { prefersReducedMotion, settings } from '../../settings/settings';

/**
 * Screen-space vignette and colour wash using two absolutely positioned DOM layers over the
 * canvas. Costs no extra render pass. Without a DOM it records values only (unit tests).
 */
export interface OverlayPulse {
  /** Vignette strength in [0, 1]. */
  readonly vignette: number;
  /** Optional colour wash, e.g. '#5a0000', with its strength in [0, 1]. */
  readonly tint?: string;
  readonly tintStrength?: number;
  readonly attack: number;
  readonly hold: number;
  readonly release: number;
}

interface ActivePulse extends OverlayPulse { start: number }

export class ScreenOverlay {
  private readonly vignetteEl: HTMLDivElement | null = null;
  private readonly tintEl: HTMLDivElement | null = null;
  private pulses: ActivePulse[] = [];
  private time = 0;
  /** Persistent baseline vignette (e.g. rises with darkness). */
  base = 0.18;
  /** Values after the last update (exposed for tests and debugging). */
  vignetteValue = 0;
  tintValue = 0;

  constructor(container: HTMLElement | null) {
    if (!container || typeof document === 'undefined') return;
    const layer = (z: string): HTMLDivElement => {
      const el = document.createElement('div');
      el.setAttribute('aria-hidden', 'true');
      el.dataset.nwOverlay = z;
      Object.assign(el.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '1', opacity: '0', transition: 'none' });
      container.appendChild(el);
      return el;
    };
    this.vignetteEl = layer('vignette');
    this.vignetteEl.style.background = 'radial-gradient(ellipse at center, rgba(0,0,0,0) 38%, rgba(0,0,0,0.55) 72%, rgba(0,0,0,0.95) 100%)';
    this.tintEl = layer('tint');
    this.tintEl.style.mixBlendMode = 'multiply';
  }

  pulse(p: OverlayPulse): void {
    this.pulses.push({ ...p, start: this.time });
    if (p.tint && this.tintEl) this.tintEl.style.background = `radial-gradient(ellipse at center, transparent 30%, ${p.tint} 100%)`;
  }

  /** Remove every running pulse immediately (hard cut). */
  clear(): void { this.pulses = []; }

  update(dt: number): void {
    this.time += dt;
    let vignette = this.base;
    let tint = 0;
    // Player settings: Screen effects scales every pulse; reduced motion turns sudden flashes into fades.
    const preferences = settings.get();
    const strength = preferences.effects;
    const minAttack = prefersReducedMotion(preferences) ? 0.35 : 0;
    this.pulses = this.pulses.filter((p) => this.time - p.start < Math.max(p.attack, minAttack) + p.hold + p.release);
    for (const p of this.pulses) {
      const t = this.time - p.start;
      const attack = Math.max(p.attack, minAttack);
      const k = t < attack ? t / Math.max(0.001, attack) : t < attack + p.hold ? 1 : Math.max(0, 1 - (t - attack - p.hold) / Math.max(0.001, p.release));
      vignette = Math.max(vignette, this.base + (p.vignette * k - this.base) * strength);
      tint = Math.max(tint, (p.tintStrength ?? 0) * k * strength);
    }
    this.vignetteValue = vignette;
    this.tintValue = tint;
    if (this.vignetteEl) this.vignetteEl.style.opacity = vignette.toFixed(3);
    if (this.tintEl) this.tintEl.style.opacity = tint.toFixed(3);
  }

  dispose(): void {
    this.vignetteEl?.remove();
    this.tintEl?.remove();
    this.pulses = [];
  }
}
