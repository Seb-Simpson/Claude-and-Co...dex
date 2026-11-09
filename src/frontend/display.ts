import type { WebGLRenderer } from 'three';
import { QUALITY_PRESETS, type QualityPreset } from '../settings/settings';

/**
 * Applies the graphics preset (render resolution) to the live renderer.
 *
 * The engine sizes its canvas on resize with its own pixel-ratio cap. These listeners are added
 * after the engine's own, so the browser runs them later (same event, same ResizeObserver
 * ordering) and the preset wins, without changing the engine.
 */
export interface DisplayController {
  setQuality(preset: QualityPreset): void;
  dispose(): void;
}

export function attachDisplay(renderer: WebGLRenderer, container: HTMLElement, initial: QualityPreset, onResize?: () => void): DisplayController {
  let preset = initial;
  const apply = (): void => {
    const ratio = Math.min(window.devicePixelRatio || 1, QUALITY_PRESETS[preset].pixelRatio);
    if (Math.abs(renderer.getPixelRatio() - ratio) > 1e-3) {
      renderer.setPixelRatio(ratio);
      renderer.setSize(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight), false);
    }
    onResize?.();
  };
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(apply) : null;
  observer?.observe(container);
  window.addEventListener('resize', apply);
  apply();
  return {
    setQuality(next) { preset = next; apply(); },
    dispose() { observer?.disconnect(); window.removeEventListener('resize', apply); },
  };
}

export const fullscreen = {
  supported(): boolean { return typeof document !== 'undefined' && !!document.fullscreenEnabled; },
  active(): boolean { return typeof document !== 'undefined' && !!document.fullscreenElement; },
  async toggle(): Promise<boolean> {
    if (!this.supported()) return false;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch { /* denied or interrupted */ }
    return this.active();
  },
};
