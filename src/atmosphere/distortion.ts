import { prefersReducedMotion, settings } from '../settings/settings';

/**
 * NW-004A supernatural distortion: a controlled screen-space layer over the game canvas.
 * - Toward the screen edges, the image smears and shifts toward a sick cyan (a backdrop blur and
 *   hue shift, masked to the edges so the centre stays sharp and readable).
 * - A breathing vignette.
 *
 * It costs nothing when idle: the element is not displayed. Its strength is the profile's
 * `distortion` times the player's Screen effects setting. Reduced motion keeps the colour shift
 * but stops the breathing.
 */
export interface DistortionLayer {
  set(amount: number, time: number): void;
  readonly amount: number;
  dispose(): void;
}

export function createDistortionLayer(container: HTMLElement | null): DistortionLayer {
  if (!container || typeof document === 'undefined') return { set() { /* no DOM */ }, amount: 0, dispose() { /* no DOM */ } };
  const layer = document.createElement('div');
  layer.dataset.nwDistortion = '';
  layer.setAttribute('aria-hidden', 'true');
  const edge = 'radial-gradient(ellipse 70% 62% at 50% 52%, transparent 46%, #000 100%)';
  Object.assign(layer.style, {
    position: 'absolute', inset: '0', pointerEvents: 'none', display: 'none', zIndex: '1',
    background: 'radial-gradient(ellipse 75% 65% at 50% 52%, transparent 42%, rgba(8, 40, 36, 0.62) 100%)',
    webkitMaskImage: edge, maskImage: edge,
  } satisfies Partial<CSSStyleDeclaration>);
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.append(layer);
  let current = 0;
  return {
    get amount() { return current; },
    set(amount, time) {
      const s = settings.get();
      const strength = Math.max(0, Math.min(1, amount)) * s.effects;
      current = strength;
      if (strength < 0.01) { layer.style.display = 'none'; return; }
      layer.style.display = 'block';
      const breathe = prefersReducedMotion(s) ? 0.5 : 0.5 + 0.5 * Math.sin(time * 0.9);
      const blur = (1.2 + 1.6 * breathe) * strength;
      layer.style.opacity = (0.55 + 0.45 * breathe * strength).toFixed(3);
      const filter = `blur(${blur.toFixed(2)}px) hue-rotate(${(-28 * strength).toFixed(1)}deg) saturate(${(1 + 0.35 * strength).toFixed(2)})`;
      layer.style.backdropFilter = filter;
      layer.style.setProperty('-webkit-backdrop-filter', filter);
    },
    dispose() { layer.remove(); },
  };
}
