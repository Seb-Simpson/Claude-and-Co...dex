import { expect, test } from '@playwright/test';

/**
 * NW-002B entity visuals and horror presentation, rendered in real (software) WebGL.
 * Uses the dev preview's showcase, which publishes stand-in nodes in NW-001B's entity
 * binding format so the production presenter attaches the bodies.
 */
type Preview = {
  ready: boolean;
  showcase(entries: unknown[]): void;
  setCamera(x: number, y: number, z: number, yaw: number, pitch: number): void;
  emit(type: string, payload: unknown): void;
  info(): { calls: number; triangles: number; geometries: number };
};
const preview = (page: import('@playwright/test').Page) => page.evaluate.bind(page);

test('renders all four bodied entities and survives every cinematic beat', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/src/world/dev/preview.html?hud=0&view=lineup&showcase=lineup');
  await page.waitForFunction(() => (window as unknown as { __nwPreview?: Preview }).__nwPreview?.ready === true, null, { timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: testInfo.outputPath('entity-lineup.png') });
  const info = await preview(page)(() => (window as unknown as { __nwPreview: Preview }).__nwPreview.info());
  expect(info.calls).toBeLessThan(600);

  // A chase, a lighting failure, a reflection and the post-chase silence, driven by events only.
  await preview(page)(() => {
    const p = (window as unknown as { __nwPreview: Preview }).__nwPreview;
    p.showcase([{ id: 'patient', type: 'patient', x: -8.6, z: 0.3, yaw: -Math.PI / 2, behaviour: 'pursue', dx: 1, dz: 0, speed: 3.5, range: 3 }]);
    p.emit('chase:started', { chaseId: 'c', entityId: 'patient', playerId: 'p', position: { x: -8.6, y: 0, z: 0.3 }, timeSeconds: 1 });
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: testInfo.outputPath('chase-initiation.png') });
  await preview(page)(() => {
    const p = (window as unknown as { __nwPreview: Preview }).__nwPreview;
    p.emit('chase:ended', { chaseId: 'c', entityId: 'patient', playerId: 'p', reason: 'escaped', timeSeconds: 8 });
    p.emit('horror:scare', { triggerId: 'nw:scare:lighting-failure', position: { x: -6, y: 1, z: 0 }, intensity: 1 });
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: testInfo.outputPath('lighting-failure.png') });
  await preview(page)(() => {
    const p = (window as unknown as { __nwPreview: Preview }).__nwPreview;
    p.showcase([]);
    // Treatment-room mirror, seen from beside the sink.
    p.setCamera(5.2, 1.62, -1.9, -1.15, 0.0);
    p.emit('horror:reflection', { id: 'r1', anchorId: 'any', visible: true, durationSeconds: 4 });
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: testInfo.outputPath('reflection.png') });
  for (const kind of ['distant-reveal', 'disappear', 'near-miss', 'post-chase-silence']) {
    await preview(page)((k) => (window as unknown as { __nwPreview: Preview }).__nwPreview.emit('horror:scare', { triggerId: `nw:scare:${k}`, position: { x: 3, y: 1, z: -3 }, intensity: 1 }), kind);
  }
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});
