import { expect, test } from '@playwright/test';

test('boots real renderer and Rapier, unlocks audio, and resizes the canvas', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`${message.text()} (${message.location().url})`);
  });

  await page.goto('/');
  await expect(page.locator('#status')).toHaveText(
    'Renderer and Rapier ready. Neutral test scene · no game modules installed.',
  );
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

  const audioButton = page.getByRole('button', { name: 'Enable audio', exact: true });
  await expect(audioButton).toBeEnabled();
  await audioButton.click();
  await expect(page.getByRole('button', { name: 'Audio enabled', exact: true })).toBeDisabled();

  await page.screenshot({ path: testInfo.outputPath('foundation-ready.png') });
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

test('reports WebGL context loss and disposes the renderer', async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#status')).toContainText('Renderer and Rapier ready');
  await page.locator('canvas').evaluate(element => {
    if (!(element instanceof HTMLCanvasElement)) throw new Error('Expected canvas element');
    const extension = element.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Chromium did not expose WEBGL_lose_context');
    extension.loseContext();
  });
  await expect(page.getByRole('alert')).toContainText('WebGL context lost');
  await expect(page.getByRole('button', { name: 'Enable audio', exact: true })).toBeDisabled();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('foundation-context-loss.png') });
  expect(pageErrors).toEqual([]);
});
