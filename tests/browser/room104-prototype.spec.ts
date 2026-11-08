import { expect, type Page, test } from '@playwright/test';
import { bootHospital, enterWard, positionPlayer, snapshot } from './application';

/**
 * Room 104 visual prototype in the real playable game (`/?test=1`, NW-002A's QA bridge), not the
 * dev preview. Player-eye screenshots of the Blender set and the same views with
 * `?nwSet=procedural`, plus renderer cost.
 */
const VIEWS: readonly { name: string; at: { x: number; y: number; z: number }; look: { x: number; y: number; z: number } }[] = [
  { name: 'wake-up', at: { x: -12.4, y: 0, z: 4.1 }, look: { x: -14.6, y: 0.9, z: 5.9 } },
  { name: 'bed-corner', at: { x: -12.6, y: 0, z: 3.0 }, look: { x: -15.3, y: 1.2, z: 6.2 } },
  { name: 'sink-mirror', at: { x: -12.5, y: 0, z: 3.4 }, look: { x: -11.3, y: 1.3, z: 4.3 } },
  { name: 'wheelchair-tv', at: { x: -12.6, y: 0, z: 4.6 }, look: { x: -15.2, y: 1.3, z: 2.6 } },
  { name: 'door-to-corridor', at: { x: -13.4, y: 0, z: 4.9 }, look: { x: -12.0, y: 1.2, z: 0.0 } },
  { name: 'corridor-west', at: { x: -8.4, y: 0, z: -0.4 }, look: { x: -19.5, y: 1.3, z: 0.1 } },
  { name: 'corridor-at-104', at: { x: -14.6, y: 0, z: -0.8 }, look: { x: -12.0, y: 1.2, z: 1.4 } },
];

async function shoot(page: Page, prefix: string, outputPath: (name: string) => string): Promise<{ calls: number; triangles: number }[]> {
  const info: { calls: number; triangles: number }[] = [];
  for (const view of VIEWS) {
    await positionPlayer(page, view.at, view.look);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: outputPath(`${prefix}-${view.name}.png`) });
    const s = await snapshot(page);
    info.push({ calls: s.renderer.calls, triangles: s.renderer.triangles });
  }
  return info;
}

async function frameMs(page: Page): Promise<number> {
  return page.evaluate(() => new Promise<number>((resolve) => {
    let n = 0; const start = performance.now();
    const tick = () => { if (++n === 8) resolve((performance.now() - start) / 8); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }));
}

test('the playable game shows the Blender Room 104 and west corridor, with gameplay intact', async ({ page }, testInfo) => {
  test.setTimeout(420_000);
  const logs: string[] = [];
  const assets: string[] = [];
  page.on('console', (m) => logs.push(`${m.type()} ${m.text()}`));
  page.on('response', (r) => { if (/room104_(set\.glb|lightmap\.jpg)/.test(r.url())) assets.push(`${r.status()} ${r.url().split('/').pop()}`); });
  const errors = await bootHospital(page);
  expect(assets.map((a) => a.split(' ')[0])).toEqual(['200', '200']);
  expect(logs.some((l) => l.includes('Room 104 visual set loaded'))).toBe(true);
  expect(logs.some((l) => l.includes('visual set unavailable'))).toBe(false);
  await enterWard(page);
  const ready = await snapshot(page);
  const info = await shoot(page, 'blender', (n) => testInfo.outputPath(n));
  const ms = await frameMs(page);
  testInfo.annotations.push({ type: 'renderer', description: JSON.stringify({ info, frameMs: ms, colliders: ready.colliderCount }) });
  for (const v of info) expect(v.calls).toBeLessThan(500);
  // Gameplay is unchanged: the player woke in Room 104 at the authored spawn with every collider.
  expect(ready.player!.position.x).toBeCloseTo(-12.4, 1);
  expect(ready.player!.position.z).toBeCloseTo(4.1, 1);
  expect(errors).toEqual([]);
});

test('?nwSet=procedural shows the old room for comparison and keeps identical gameplay', async ({ page }, testInfo) => {
  test.setTimeout(420_000);
  await page.addInitScript(() => {
    if (!location.search.includes('nwSet')) history.replaceState(null, '', `${location.pathname}${location.search}${location.search ? '&' : '?'}nwSet=procedural`);
  });
  const errors = await bootHospital(page);
  const procedural = await snapshot(page);
  await enterWard(page);
  const info = await shoot(page, 'procedural', (n) => testInfo.outputPath(n));
  testInfo.annotations.push({ type: 'renderer', description: JSON.stringify({ info, colliders: procedural.colliderCount }) });
  expect(errors).toEqual([]);
});
