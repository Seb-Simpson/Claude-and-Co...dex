import { mkdirSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { bootHospital, enterWard, positionPlayer, snapshot } from './application';

/**
 * NW-006A in the real playable game (`/?test=1`): every stealth point is a supported, unoccupied
 * position the player can actually stand on, the observation and cover views are captured from the
 * player's eye, and the renderer cost of the space is recorded. Screenshots and the report are written
 * to NW006A_SHOTS when set. Software rendering (SwiftShader): costs are relative only.
 */
const OUT = process.env.NW006A_SHOTS;
const POINTS = [
  { name: 'entry', at: { x: -4.2, y: 0, z: 0.2 }, look: { x: -3.0, y: 1.2, z: -3.0 } },
  { name: 'observation', at: { x: -9.0, y: 0, z: 0.45 }, look: { x: -3.6, y: 1.3, z: -3.6 } },
  { name: 'observation-wide', at: { x: -9.0, y: 0, z: 0.45 }, look: { x: -6.0, y: 1.2, z: -2.6 } },
  { name: 'crouch-cover', at: { x: -4.6, y: 0, z: -0.42 }, look: { x: -3.6, y: 1.0, z: -3.6 } },
  { name: 'crouch-cover-screen', at: { x: -4.6, y: 0, z: -0.42 }, look: { x: -4.6, y: 0.8, z: -1.0 } },
  { name: 'station-counter', at: { x: -5.0, y: 0, z: -0.3 }, look: { x: -3.6, y: 1.1, z: -2.6 } },
  { name: 'exit', at: { x: 4.6, y: 0, z: 0.2 }, look: { x: 5.6, y: 1.3, z: 0.2 } },
];

test('NW-006A: stealth points are walkable in the playable game, and the space renders', async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  const errors = await bootHospital(page);
  await enterWard(page);
  if (OUT) mkdirSync(OUT, { recursive: true });
  const report: Record<string, unknown> = {};
  for (const point of POINTS) {
    await positionPlayer(page, point.at, point.look);
    await page.waitForTimeout(1500);
    const s = await snapshot(page);
    report[point.name] = { player: s.player?.position, calls: s.renderer.calls, triangles: s.renderer.triangles };
    await page.screenshot({ path: OUT ? `${OUT}/${point.name}.png` : testInfo.outputPath(`${point.name}.png`), timeout: 120_000 });
  }
  if (OUT) writeFileSync(`${OUT}/browser-report.json`, `${JSON.stringify(report, null, 2)}\n`);
  testInfo.annotations.push({ type: 'nw-006a', description: JSON.stringify(report) });
  expect(errors).toEqual([]);
});
