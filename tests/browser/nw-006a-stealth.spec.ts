import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { bootHospital, enterWard, positionPlayer, snapshot } from './application';

/**
 * NW-006A in the real playable game (`/?test=1`), on the NW-005D integration (PR #19): the Nurses'
 * Station set loads next to the Room 104 set, the player walks into the station with the keyboard,
 * every stealth point is a supported, unoccupied position, and the views a player sees (observation,
 * crouch cover standing and crouched, the records corner, the way out) are captured with their
 * renderer cost. With NW006A_SHOTS=<dir> the screenshots and report are written there
 * (docs/nw-006a/shots). Software rendering (SwiftShader): costs are relative only.
 */
const OUT = process.env.NW006A_SHOTS;
// Without --enable-unsafe-swiftshader this container's software renderer advances the simulation by
// only ~0.05 s per real second, too slow for keyboard walking to finish (measured); this file only.
test.use({ launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });
type V = { x: number; y: number; z: number };
const VIEWS: readonly { name: string; at: V; look: V; crouch?: boolean }[] = [
  { name: '01-approach', at: { x: -9.6, y: 0, z: 0.2 }, look: { x: -4.0, y: 1.2, z: -1.6 } },
  { name: '02-observation', at: { x: -9.0, y: 0, z: 0.45 }, look: { x: -3.6, y: 1.3, z: -3.6 } },
  { name: '03-trolley-from-corridor', at: { x: -4.6, y: 0, z: 0.35 }, look: { x: -4.6, y: 0.75, z: -1.0 } },
  { name: '04-crouch-cover-standing', at: { x: -4.6, y: 0, z: -0.42 }, look: { x: -3.6, y: 1.0, z: -4.6 } },
  { name: '05-crouch-cover-crouched', at: { x: -4.6, y: 0, z: -0.42 }, look: { x: -3.6, y: 0.9, z: -4.6 }, crouch: true },
  { name: '06-trolley-station-side', at: { x: -3.8, y: 0, z: -3.4 }, look: { x: -4.6, y: 0.6, z: -1.0 } },
  { name: '07-records-corner', at: { x: -3.7, y: 0, z: -3.6 }, look: { x: -5.9, y: 1.0, z: -5.5 } },
  { name: '08-back-desk', at: { x: -3.7, y: 0, z: -4.9 }, look: { x: -4.2, y: 0.8, z: -6.1 } },
  { name: '09-east-side', at: { x: -2.0, y: 0, z: -3.3 }, look: { x: -0.4, y: 0.9, z: -5.3 } },
  { name: '10-east-gap-entry', at: { x: -0.8, y: 0, z: -0.6 }, look: { x: -2.6, y: 1.0, z: -4.6 } },
  { name: '11-concealment-105', at: { x: -7.85, y: 0, z: -3.75 }, look: { x: -7.85, y: 0.3, z: -5.35 } },
  { name: '12-exit-east', at: { x: 4.6, y: 0, z: 0.2 }, look: { x: 9.0, y: 1.3, z: 0.2 } },
];

async function walkUntil(page: Page, key: string, done: () => Promise<boolean>, timeout = 120_000): Promise<void> {
  await page.keyboard.down(key);
  try {
    await expect.poll(done, { timeout, intervals: [250, 500] }).toBe(true);
  } catch (error) {
    const s = await snapshot(page);
    throw new Error(`walk stalled at ${JSON.stringify(s.player?.position)} (phase ${s.opening?.phase}, cinematic ${s.opening?.cinematic}, state ${s.state}, sim ${s.performance.simulatedSeconds}, frames ${s.frameCount}, crouch ${s.player?.crouching}): ${String(error)}`);
  } finally { await page.keyboard.up(key); }
}
const pos = async (page: Page) => (await snapshot(page)).player!.position;
const aim = (page: Page, t: V) => page.evaluate((p) => (window as unknown as { nightWardTest: { aimAt(v: unknown): void } }).nightWardTest.aimAt(p), t);

test('NW-006A: the station set loads, the player walks in, and every stealth view renders', async ({ page }, testInfo) => {
  test.setTimeout(900_000);
  const logs: string[] = [];
  const assets: string[] = [];
  page.on('console', (m) => logs.push(`${m.type()} ${m.text()}`));
  page.on('response', (r) => { if (/(station_set|room104_set)\.glb/.test(r.url())) assets.push(`${r.status()} ${r.url().split('/').pop()}`); });
  const errors = await bootHospital(page);
  expect(assets.filter((a) => a.includes('station_set')).map((a) => a.split(' ')[0])).toEqual(['200']);
  expect(logs.some((l) => l.includes("Nurses' Station set loaded"))).toBe(true);
  expect(logs.some((l) => l.includes('Room 104 visual set loaded'))).toBe(true);
  expect(logs.some((l) => /set unavailable/.test(l))).toBe(false);
  await enterWard(page);
  // Skip the opening cinematic exactly as Codex's NW-005 specs do; positions are only accepted after it.
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snapshot(page)).opening?.state.awakened, { timeout: 90_000 }).toBe(true);
  // The runtime ignores movement after a cinematic until it sees neutral input (no key bleed-through,
  // gameplay/runtime.ts): let the simulation run with no keys held before the first walk.
  const settled = (await snapshot(page)).performance.simulatedSeconds;
  await expect.poll(async () => (await snapshot(page)).performance.simulatedSeconds, { timeout: 90_000 }).toBeGreaterThan(settled + 0.5);
  const report: Record<string, unknown> = {};

  // Walk (keyboard) from the corridor through the east gap, deep into the station, then west across it.
  await positionPlayer(page, { x: -0.78, y: 0, z: -0.9 }, { x: -0.78, y: 1.4, z: -4.6 });
  await walkUntil(page, 'KeyW', async () => (await pos(page)).z < -4.3);
  const inside = await pos(page);
  expect(inside.z).toBeLessThan(-4.3);
  await aim(page, { x: -4.0, y: 1.4, z: inside.z });
  await walkUntil(page, 'KeyW', async () => (await pos(page)).x < -3.4);
  report.walkedIntoStation = await pos(page);

  if (OUT) mkdirSync(OUT, { recursive: true });
  const views: Record<string, unknown> = {};
  for (const view of VIEWS) {
    await positionPlayer(page, view.at, view.look);
    if (view.crouch) {
      await page.keyboard.press('KeyC');
      await expect.poll(async () => (await snapshot(page)).player!.crouching, { timeout: 60_000 }).toBe(true);
      await aim(page, view.look);
    }
    await page.waitForTimeout(1800);
    await page.screenshot({ path: OUT ? `${OUT}/${view.name}.png` : testInfo.outputPath(`${view.name}.png`), timeout: 120_000 });
    const s = await snapshot(page);
    views[view.name] = { player: s.player!.position, crouching: s.player!.crouching, calls: s.renderer.calls, triangles: s.renderer.triangles };
    expect(s.renderer.calls, view.name).toBeLessThan(500);
    if (view.crouch) {
      await page.keyboard.press('KeyC');
      await expect.poll(async () => (await snapshot(page)).player!.crouching, { timeout: 60_000 }).toBe(false);
    }
  }
  const final = await snapshot(page);
  report.views = views;
  report.renderer = final.renderer;
  report.performance = final.performance;
  report.colliders = final.colliderCount;
  report.stationSet = logs.find((l) => l.includes("Nurses' Station set loaded"));
  if (OUT) writeFileSync(`${OUT}/browser-report.json`, `${JSON.stringify(report, null, 2)}\n`);
  testInfo.annotations.push({ type: 'nw-006a', description: JSON.stringify(report) });
  expect(errors).toEqual([]);
});
