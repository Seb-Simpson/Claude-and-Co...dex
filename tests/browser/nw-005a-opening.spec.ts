import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { bootHospital, enterWard, positionPlayer, snapshot } from './application';

/**
 * NW-005A in the real playable game (`/?test=1`): the Blender opening loads, the player walks out
 * of Room 104 with the keyboard, walls hold, the Room 106 door opens with E, and the views a first-
 * time player sees are captured. With NW005A_SHOTS=<dir> the screenshots and measurements are also
 * written there (docs/nw-005a/shots). Software rendering (SwiftShader): costs are relative only.
 */
const OUT = process.env.NW005A_SHOTS;
const VIEWS: readonly { name: string; at: { x: number; y: number; z: number }; look: { x: number; y: number; z: number } }[] = [
  { name: '01-wake-door', at: { x: -12.4, y: 0, z: 4.1 }, look: { x: -12.0, y: 1.25, z: 1.4 } },
  { name: '02-room-104-bed', at: { x: -12.2, y: 0, z: 2.4 }, look: { x: -14.3, y: 0.85, z: 5.4 } },
  { name: '03-card-reader-intercom', at: { x: -12.3, y: 0, z: 3.0 }, look: { x: -12.5, y: 1.6, z: 1.55 } },
  { name: '04-access-card', at: { x: -12.6, y: 0, z: 3.75 }, look: { x: -12.9, y: 0.0, z: 3.2 } },
  { name: '05-step-out-east', at: { x: -12.0, y: 0, z: 0.5 }, look: { x: -1.2, y: 1.45, z: 0.0 } },
  { name: '06-corridor-west', at: { x: -11.0, y: 0, z: 0.0 }, look: { x: -19.6, y: 1.3, z: 0.0 } },
  { name: '07-room-106-door', at: { x: -8.6, y: 0, z: -0.4 }, look: { x: -7.8, y: 1.1, z: 1.4 } },
  { name: '08-doors-103-105', at: { x: -13.6, y: 0, z: 0.6 }, look: { x: -9.0, y: 1.2, z: -1.4 } },
  { name: '09-station-approach', at: { x: -8.0, y: 0, z: 0.2 }, look: { x: -3.0, y: 1.2, z: -2.4 } },
  { name: '10-station-counter', at: { x: -5.0, y: 0, z: 0.4 }, look: { x: -3.2, y: 1.1, z: -3.2 } },
  { name: '11-back-to-104', at: { x: -4.0, y: 0, z: 0.3 }, look: { x: -14.0, y: 1.3, z: 0.6 } },
];

/** Hold a key until the game state satisfies `done` (software rendering runs few frames a second). */
async function walkUntil(page: Page, key: string, done: () => Promise<boolean>, timeout = 120_000): Promise<void> {
  await page.keyboard.down(key);
  try { await expect.poll(done, { timeout, intervals: [250, 500] }).toBe(true); } finally { await page.keyboard.up(key); }
  await page.waitForTimeout(300);
}
const pos = async (page: Page) => (await snapshot(page)).player!.position;

async function aim(page: Page, target: { x: number; y: number; z: number }): Promise<void> {
  await page.evaluate((t) => (window as unknown as { nightWardTest: { aimAt(p: unknown): void } }).nightWardTest.aimAt(t), target);
}

test('NW-005A: wake in Room 104, walk into the corridor, try locked 106; the integrated opening set loads and renders', async ({ page }, testInfo) => {
  test.setTimeout(900_000);
  const logs: string[] = [];
  const assets: string[] = [];
  page.on('console', (m) => logs.push(`${m.type()} ${m.text()}`));
  page.on('response', (r) => { if (/room104_(set\.glb|lightmap\.jpg)/.test(r.url())) assets.push(`${r.status()} ${r.url().split('/').pop()}`); });
  const errors = await bootHospital(page);
  expect(assets.map((a) => a.split(' ')[0])).toEqual(['200', '200']);
  expect(logs.some((l) => l.includes('Room 104 visual set loaded'))).toBe(true);
  expect(logs.some((l) => l.includes('visual set unavailable'))).toBe(false);
  await enterWard(page);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snapshot(page)).opening!.state.awakened, { timeout: 120_000 }).toBe(true);
  const report: Record<string, unknown> = {};

  // 1. Spawn and camera orientation.
  const start = await snapshot(page);
  expect(start.player!.position.x).toBeCloseTo(-12.4, 1);
  expect(start.player!.position.z).toBeCloseTo(4.1, 1);
  expect(start.player!.rotation.yaw).toBeCloseTo(0, 2);
  report.spawn = start.player!.position;

  // 2. Walls hold: walk into Room 104's west wall along the clear strip between the wheelchair and the bed.
  await positionPlayer(page, { x: -12.6, y: 0, z: 3.7 }, { x: -16.0, y: 1.2, z: 3.7 });
  // Walk west until pressed against the wall (frame stalls under software rendering make
  // "stopped moving" unreliable, so wait for the position, then keep pushing and re-check).
  await walkUntil(page, 'KeyW', async () => (await pos(page)).x < -15.15, 90_000);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(3000); await page.keyboard.up('KeyW');
  const wall = await pos(page);
  expect(wall.x).toBeGreaterThan(-15.55 + 0.27);
  expect(wall.x).toBeLessThan(-15.1);
  expect(wall.x).toBeGreaterThan(-15.32);
  report.westWallStop = wall;

  // Integration now owns the lock; retain the environment sweep checks after real card use.
  const anchors = (await snapshot(page)).opening!.anchors;
  for (const key of ['access-card', 'card-reader'] as const) {
    await positionPlayer(page, anchors[key]!.stand!, anchors[key]!.position);
    await expect.poll(async () => (await snapshot(page)).prompt?.targetId).toBe(key === 'access-card' ? 'nw:opening:take-staff-card' : 'nw:opening:use-card-reader');
    const begin = (await snapshot(page)).performance.simulatedSeconds;
    await expect.poll(async () => (await snapshot(page)).performance.simulatedSeconds, { timeout: 120_000 }).toBeGreaterThan(begin + .6);
    await page.keyboard.press('KeyE');
    await expect.poll(async () => (await snapshot(page)).opening!.state[key === 'access-card' ? 'cardAcquired' : 'doorUnlocked']).toBe(true);
  }
  const door = anchors['room-104-door']!;
  const toward = { x: door.stand!.x - door.position.x, z: door.stand!.z - door.position.z };
  const length = Math.hypot(toward.x, toward.z);
  await positionPlayer(page, { x: door.position.x + toward.x/length*1.55, y: door.stand!.y, z: door.position.z+toward.z/length*1.55 }, door.position);
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await snapshot(page)).doorStates['nw:door:room-104'], { timeout: 120_000 }).toBe('open');

  // 3. Walk out of Room 104 (through the open door) and along the corridor to the station.
  await positionPlayer(page, { x: -12.4, y: 0, z: 4.1 }, { x: -12.0, y: 1.2, z: 1.0 });
  await aim(page, { x: -12.0, y: 1.2, z: -1.0 });
  await walkUntil(page, 'KeyW', async () => (await pos(page)).z < 0.4);
  const outside = await pos(page);
  expect(outside.z).toBeLessThan(1.4);
  report.outOfRoom104 = outside;
  await aim(page, { x: -2.0, y: 1.4, z: outside.z });
  await walkUntil(page, 'KeyW', async () => (await pos(page)).x > -4.5);
  const corridor = await pos(page);
  expect(corridor.x).toBeGreaterThan(-4.5);
  expect(Math.abs(corridor.z)).toBeLessThan(1.4 - 0.27);
  report.alongCorridor = corridor;

  // 4. The scripted Room106 handle responds, with its real collider remaining closed.
  await positionPlayer(page, { x: -8.05, y: 0, z: 0.55 }, { x: -7.6, y: 1.0, z: 1.48 });
  await page.waitForTimeout(400);
  const before = (await snapshot(page)).doorStates['nw:door:room-106'];
  const prompt = (await snapshot(page)).prompt;
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await snapshot(page)).opening!.state.room106Tried, { timeout: 120_000 }).toBe(true);
  expect((await snapshot(page)).doorStates['nw:door:room-106']).toBe('locked');
  report.room106 = { before, prompt: prompt?.text ?? null, after: 'locked' };

  // 5. Views and renderer cost.
  const views: Record<string, unknown> = {};
  if (OUT) mkdirSync(OUT, { recursive: true });
  for (const view of VIEWS) {
    await positionPlayer(page, view.at, view.look);
    await page.waitForTimeout(1800);
    const path = OUT ? `${OUT}/${view.name}.png` : testInfo.outputPath(`${view.name}.png`);
    await page.screenshot({ path, timeout: 120_000 });
    const s = await snapshot(page);
    views[view.name] = { calls: s.renderer.calls, triangles: s.renderer.triangles };
    expect(s.renderer.calls, view.name).toBeLessThan(500);
  }
  const final = await snapshot(page);
  report.views = views;
  report.renderer = final.renderer;
  report.performance = final.performance;
  report.colliders = final.colliderCount;
  if (OUT) writeFileSync(`${OUT}/browser-report.json`, `${JSON.stringify(report, null, 2)}\n`);
  testInfo.annotations.push({ type: 'nw-005a', description: JSON.stringify(report) });
  expect(errors).toEqual([]);
});
