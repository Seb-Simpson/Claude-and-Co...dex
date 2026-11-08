import { expect, test } from '@playwright/test';
import { bootHospital, enterWard } from './application';

test.describe.configure({ timeout: 90_000 });

/**
 * NW-001A hospital environment checks against the real renderer (software WebGL in CI).
 * They verify that the assembled app publishes and renders the hospital without errors, and
 * that each authored viewpoint renders a lit, non-empty image. They do not measure GPU speed.
 */
const WORLD_ID = 'nw:hospital:ward-4-west';

test('the game boots with the hospital world, atmosphere and horror modules', async ({ page }, testInfo) => {
  const errors = await bootHospital(page);
  await expect(page.locator('#status')).toContainText(`World: ${WORLD_ID}`, { timeout: 30_000 });
  await enterWard(page);
  await page.waitForTimeout(1500);
  const glError = await page.locator('canvas').evaluate((element) => {
    const gl = (element as HTMLCanvasElement).getContext('webgl2');
    return gl ? gl.getError() : -1;
  });
  expect(glError).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('hospital-boot.png') });
  expect(errors).toEqual([]);
});

const VIEWS = ['spawn', 'corridor-east', 'corridor-west', 'station', 'treatment', 'storage', 'maintenance', 'east', 'stair', 'r103', 'r106', 'r110'];

test('dev preview renders every authored viewpoint with visible light', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/src/world/dev/preview.html?hud=0');
  await page.waitForFunction(() => (window as unknown as { __nwPreview?: { ready: boolean } }).__nwPreview?.ready === true, null, { timeout: 60_000 });
  for (const view of VIEWS) {
    await page.evaluate((name) => (window as unknown as { __nwPreview: { setView(n: string): void } }).__nwPreview.setView(name), view);
    await page.waitForTimeout(600);
    const shot = await page.screenshot({ path: testInfo.outputPath(`view-${view}.png`) });
    const stats = await page.evaluate(async (png) => {
      const blob = new Blob([new Uint8Array(png)], { type: 'image/png' });
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(160, 90);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0, 160, 90);
      const data = ctx.getImageData(0, 0, 160, 90).data;
      const lum: number[] = [];
      for (let i = 0; i < data.length; i += 4) lum.push(0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!);
      lum.sort((a, b) => a - b);
      const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
      return { mean, p95: lum[Math.floor(lum.length * 0.95)]! };
    }, [...shot]);
    // Dark, but never black: every space keeps readable surfaces and is never washed out.
    expect(stats.mean, view).toBeGreaterThan(12);
    expect(stats.mean, view).toBeLessThan(150);
    expect(stats.p95, view).toBeGreaterThan(35);
  }
  const info = await page.evaluate(() => (window as unknown as { __nwPreview: { info(): { calls: number; triangles: number } } }).__nwPreview.info());
  expect(info.calls).toBeLessThan(600);
  expect(info.triangles).toBeLessThan(400_000);
  expect(errors).toEqual([]);
});

test('WebGL context loss tears down the hospital modules cleanly', async ({ page }) => {
  const pageErrors = await bootHospital(page);
  await enterWard(page);
  await page.waitForTimeout(500);
  await page.locator('canvas').evaluate((element) => {
    (element as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
  });
  await expect(page.getByRole('alert')).toContainText('WebGL context lost');
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(pageErrors.filter(error => !error.includes('WebGL context lost'))).toEqual([]);
});
