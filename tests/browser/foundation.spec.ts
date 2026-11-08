import { expect, test } from '@playwright/test';
import { bootHospital, enterWard, snapshot } from './application';

test.describe.configure({ timeout: 90_000 });

test('boots the renderer, Rapier and registered world, unlocks audio, and resizes the canvas', async ({ page }, testInfo) => {
  const errors = await bootHospital(page);
  await expect(page.locator('#status')).toContainText('World: nw:hospital:ward-4-west');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const initialSize = await canvas.evaluate(element => {
    if (!(element instanceof HTMLCanvasElement)) throw new Error('Expected canvas element');
    const gl = element.getContext('webgl2');
    if (!gl || gl.isContextLost()) throw new Error('No active WebGL2 context');
    if (gl.getError() !== gl.NO_ERROR) throw new Error('WebGL reported a rendering error');
    return { width: element.width, height: element.height, version: String(gl.getParameter(gl.VERSION)) };
  });
  expect(initialSize.width).toBeGreaterThan(0);
  expect(initialSize.height).toBeGreaterThan(0);
  expect(initialSize.version).toContain('WebGL');
  const before = (await snapshot(page)).frameCount;
  await expect.poll(async () => (await snapshot(page)).frameCount).toBeGreaterThan(before + 2);
  expect((await snapshot(page)).renderer.triangles).toBeGreaterThan(0);
  await enterWard(page);

  await page.screenshot({ path: testInfo.outputPath('foundation-hospital-ready.png') });
  await page.setViewportSize({ width: 800, height: 600 });
  await expect.poll(async () => canvas.evaluate(element => {
    if (!(element instanceof HTMLCanvasElement)) throw new Error('Expected canvas element');
    return {
      width: element.width,
      height: element.height,
      clientWidth: element.clientWidth,
      clientHeight: element.clientHeight,
    };
  })).toEqual({ width: 800, height: 600, clientWidth: 800, clientHeight: 600 });
  await page.screenshot({ path: testInfo.outputPath('foundation-resized.png') });
  expect(errors).toEqual([]);
});

test('reports WebGL context loss and disposes the registered modules and renderer', async ({ page }, testInfo) => {
  const errors = await bootHospital(page);
  await enterWard(page);
  await page.locator('canvas').evaluate(element => {
    if (!(element instanceof HTMLCanvasElement)) throw new Error('Expected canvas element');
    const extension = element.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Chromium did not expose WEBGL_lose_context');
    extension.loseContext();
  });
  await expect(page.getByRole('alert')).toContainText('WebGL context lost');
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('[data-night-ward-hud]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('foundation-context-loss.png') });
  // The handled context-loss message is deliberately reported by the application.
  expect(errors.filter(error => !error.includes('WebGL context lost'))).toEqual([]);
});
