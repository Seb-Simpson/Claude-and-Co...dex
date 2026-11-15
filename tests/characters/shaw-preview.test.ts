import { describe, expect, it } from 'vitest';
import { SHAW_POSITION, SHAW_VIEWS, shawViewPose, type ShawView } from '../../src/characters/shaw/preview';

// Main corridor walls (src/world/layout.ts Z.corridorN / Z.corridorS).
const CORRIDOR_N = -1.4, CORRIDOR_S = 1.4;

describe('NW-R04A Shaw preview camera presets', () => {
  const views = Object.keys(SHAW_VIEWS) as Exclude<ShawView, 'free'>[];

  it('keeps every camera inside the main corridor, clear of the walls', () => {
    for (const view of views) {
      const { eye } = shawViewPose(view);
      expect(eye.z, view).toBeGreaterThan(CORRIDOR_N + 0.05);
      expect(eye.z, view).toBeLessThan(CORRIDOR_S - 0.05);
    }
  });

  it('places front views in front of her (+X, the way she faces) and rear views behind', () => {
    expect(shawViewPose('front').eye.x).toBeGreaterThan(SHAW_POSITION.x + 2);
    expect(shawViewPose('back').eye.x).toBeLessThan(SHAW_POSITION.x - 2);
    expect(Math.abs(shawViewPose('side').eye.x - SHAW_POSITION.x)).toBeLessThan(1e-6);
  });

  it('frames the full 1.9 m figure in the full-body views', () => {
    for (const view of ['front', 'front34', 'side', 'back34', 'back'] as const) {
      const { eye, target, fov } = shawViewPose(view);
      const distance = Math.hypot(eye.x - target.x, eye.z - target.z);
      const visible = 2 * distance * Math.tan((fov * Math.PI) / 360);
      expect(visible, view).toBeGreaterThan(1.9 * 1.15);
    }
  });
});
