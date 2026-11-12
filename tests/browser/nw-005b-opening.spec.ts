import { expect, test, type Page } from '@playwright/test';
import type { Application } from '../../src/integration/application';
import type { ApplicationSnapshot } from '../../src/integration/testing';
import type { Vec3 } from '../../src/contracts';

declare global { interface Window { nwOpeningEvidence?: unknown } }
const real = process.env.NW005_REAL === '1';
const softwareScale = process.env.NW005_SOFTWARE_SCALE === '1';
async function scaleForSoftware(page: Page) {
  if (softwareScale) await page.evaluate(() => (window.nightWardTest as Application).services()!.renderer.setPixelRatio(0.25));
}
const entry = real ? '/?test=1' : '/tests/browser/harness/room104-opening.html?test=1';
const snap = (page: Page): Promise<ApplicationSnapshot> => page.evaluate(() => window.nightWardTest!.snapshot());
const wait = { timeout: 40_000 };
async function boot(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => localStorage.setItem('night-ward:settings:v1', JSON.stringify({ quality: 'low', motion: 'full', subtitles: true })));
  await page.goto(entry);
  await expect.poll(async () => (await snap(page)).state, { timeout: 120_000 }).toBe('ready');
  expect((await snap(page)).opening).toBeDefined();
  await scaleForSoftware(page);
  await page.getByRole('button', { name: 'Enter ward', exact: true }).click();
  await expect.poll(async () => (await snap(page)).state, wait).toBe('playing');
  return errors;
}
async function awaken(page: Page) {
  await expect.poll(async () => (await snap(page)).opening!.cinematic, wait).toBe(true);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snap(page)).opening!.state.awakened, wait).toBe(true);
}
async function place(page: Page, key: string, targetKey = key) {
  const data = (await snap(page)).opening!.anchors;
  const anchor = data[key]!;
  expect(anchor.stand).toBeDefined();
  let stand = anchor.stand!;
  if (key === 'room-104-door') {
    // Leave space for the physical swing; standing within it must correctly block a door.
    const dx = stand.x - anchor.position.x, dz = stand.z - anchor.position.z;
    const length = Math.hypot(dx, dz);
    stand = { x: anchor.position.x + dx / length * 1.55, y: stand.y, z: anchor.position.z + dz / length * 1.55 };
  }
  const ok = await page.evaluate(({ point, target }) => {
    const app = window.nightWardTest!;
    const moved = app.teleport(point); if (moved) app.aimAt(target); return moved;
  }, { point: stand, target: data[targetKey]!.position });
  expect(ok, `valid authored standing point for ${key}`).toBe(true);
  // Debounce uses simulation time; wait for simulated progress rather than a wall-clock delay.
  const begin = (await snap(page)).performance.simulatedSeconds;
  await expect.poll(async () => (await snap(page)).performance.simulatedSeconds, wait).toBeGreaterThan(begin + 0.65);
}
async function press(page: Page, contains: string) {
  try { await expect(page.locator('.nw-opening-ui__prompt')).toContainText(contains, wait); }
  catch (error) { console.log('Opening interaction failure snapshot:', JSON.stringify(await snap(page))); throw error; }
  const before = (await snap(page)).performance.simulatedSeconds;
  await expect.poll(async () => (await snap(page)).performance.simulatedSeconds, wait).toBeGreaterThan(before + 0.6);
  const completed = (await snap(page)).events.filter(e => e.type === 'interaction:completed').length;
  await page.keyboard.press('e');
  await expect.poll(async () => (await snap(page)).events.filter(e => e.type === 'interaction:completed').length, wait).toBeGreaterThan(completed);
}
async function solve(page: Page) {
  await place(page, 'access-card'); await press(page, 'Take');
  await expect.poll(async () => (await snap(page)).opening!.state.cardAcquired, wait).toBe(true);
  await place(page, 'card-reader'); await press(page, 'reader');
  await expect.poll(async () => (await snap(page)).opening!.state.doorUnlocked, wait).toBe(true);
}

test.describe.configure({ timeout: real ? 600_000 : 240_000 });
test('awakening locks movement, pauses with settings, skips smoothly and hands back control', async ({ page }, info) => {
  const errors = await boot(page);
  const start = await snap(page);
  const feet = start.player!.position;
  await page.keyboard.down('w');
  await page.waitForTimeout(500);
  await page.keyboard.up('w');
  expect((await snap(page)).player!.position.x).toBeCloseTo(feet.x, 2);
  expect((await snap(page)).player!.position.z).toBeCloseTo(feet.z, 2);
  await expect.poll(async () => (await snap(page)).state, wait).toBe('playing');
  await page.evaluate(() => document.exitPointerLock());
  await expect.poll(async () => (await snap(page)).state, wait).toBe('paused');
  await expect.poll(async () => (await snap(page)).state, wait).toBe('paused');
  const paused = await snap(page);
  await page.waitForTimeout(700);
  expect((await snap(page)).frameCount).toBe(paused.frameCount);
  await page.getByRole('button', { name: /^Settings/ }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: /^Resume/ }).click();
  await expect.poll(async () => (await snap(page)).state, wait).toBe('playing');
  await awaken(page);
  const handed = await snap(page);
  expect(handed.opening!.camera.y - handed.player!.position.y).toBeCloseTo(1.65, 2);
  expect(handed.audioState).toBe('running');
  await page.screenshot({ path: info.outputPath('01-awake.png') });
  await page.keyboard.down('d');
  await expect.poll(async () => Math.abs((await snap(page)).player!.position.x - handed.player!.position.x), wait).toBeGreaterThan(0.15);
  await page.keyboard.up('d');
  expect(errors).toEqual([]);
});

test('locked door, two one-shot Shaw cues, card reader, normal door, corridor and checkpoint retry', async ({ page }, info) => {
  const errors = await boot(page); await awaken(page);
  const initial = await snap(page);
  const doorId = Object.keys(initial.doorStates).find(id => /room-104|test:104/.test(id))!;
  const door106 = Object.keys(initial.doorStates).find(id => /room-106|test:106/.test(id))!;
  expect(initial.doorStates[doorId]).toBe('locked');
  await place(page, 'room-104-door'); await press(page, 'Try door');
  await expect.poll(async () => (await snap(page)).opening!.state.firstLinePlayed, wait).toBe(true);
  await expect(page.locator('.nw-opening-ui__subtitle')).toContainText('Please return to your bed.', wait);
  await page.screenshot({ path: info.outputPath('02-first-intercom.png') });
  await press(page, 'Try door');
  expect((await snap(page)).doorStates[doorId]).toBe('locked');
  await place(page, 'card-reader'); await press(page, 'reader');
  expect((await snap(page)).opening!.state.doorUnlocked).toBe(false);
  await solve(page);
  await expect(page.locator('.nw-opening-ui__subtitle')).toContainText('You have not been authorised to leave.', wait);
  await page.screenshot({ path: info.outputPath('03-reader-release.png') });
  expect((await snap(page)).doorStates[doorId]).toBe('closed');
  await place(page, 'room-104-door'); await press(page, 'Open');
  await expect.poll(async () => (await snap(page)).doorStates[doorId], wait).toBe('open');
  // Walk through the real door using movement; no teleport across its collider.
  const origin = (await snap(page)).player!.position;
  const door = initial.opening!.anchors['room-104-door']!.position;
  const beyond = { x: door.x + (door.x - origin.x), y: 1.65, z: door.z + (door.z - origin.z) };
  await page.evaluate(target => window.nightWardTest!.aimAt(target), beyond);
  await page.keyboard.down('w');
  await expect.poll(async () => {
    const p = (await snap(page)).player!.position;
    return Math.hypot(p.x - origin.x, p.z - origin.z);
  }, wait).toBeGreaterThan(2.2);
  await page.keyboard.up('w');
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('night-ward:save:v1')!).opening?.milestone), wait).toBe('room104-exit');
  await place(page, 'room-106-door'); await press(page, 'Try handle');
  await expect.poll(async () => (await snap(page)).opening!.state.room106Tried, wait).toBe(true);
  expect((await snap(page)).doorStates[door106]).toBe('locked');
  const data = (await snap(page)).opening!.anchors;
  const view = data['nurse-first-sight-view']!.position;
  await page.evaluate(({ view, target }) => {
    window.nightWardTest!.teleport({ x: view.x, y: 0.005, z: view.z });
    window.nightWardTest!.aimAt(target);
  }, { view, target: { ...data['nurse-first-sight']!.position, y: data['nurse-first-sight']!.position.y + 1.35 } });
  expect((await snap(page)).opening!.state.sightingSeen).toBe(false);
  expect((await snap(page)).station?.phase??'waiting').toBe('waiting');
  await page.screenshot({ path: info.outputPath('04-empty-corridor.png') });
  // Retry the exit checkpoint: possession and one-shots remain, no second awakening.
  const before = await snap(page);
  await page.evaluate(() => window.nightWardTest!.restart());
  await expect.poll(async () => (await snap(page)).state, wait).toBe('ready');
  expect((await snap(page)).sessionId).toBe(before.sessionId + 1);
  expect((await snap(page)).colliderCount).toBe(before.colliderCount);
  expect((await snap(page)).opening!.state).toMatchObject({ awakened: true, cardAcquired: true, doorUnlocked: true, firstLinePlayed: true, secondLinePlayed: true });
  await scaleForSoftware(page);
  await page.getByRole('button', { name: 'Enter ward', exact: true }).click();
  const point = data['station-approach']!.position;
  await page.evaluate((p: Vec3) => window.nightWardTest!.teleport(p), point);
  await expect.poll(async () => (await snap(page)).opening!.narrative?.scene,wait).toBe('station-discovery');
  expect((await snap(page)).opening!.state.stationReached).toBe(true);
  await page.screenshot({ path: info.outputPath('05-station-handoff.png') });
  const evidence = await snap(page);
  await info.attach('opening-runtime-snapshot.json', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  expect(evidence.entities).toEqual([]);
  expect(await page.locator('canvas').count()).toBe(1);
  await page.setViewportSize({ width: 1024, height: 640 });
  await page.screenshot({ path: info.outputPath('06-laptop.png') });
  await page.evaluate(() => (window.nightWardTest as Application).dispose());
  expect(await page.locator('[data-night-ward-opening-ui]').count()).toBe(0);
  expect(await page.locator('canvas').count()).toBe(0);
  expect(errors).toEqual([]);
});

test('saved station Continue, menu return, reload and New Game use the existing frontend slot', async ({ page }, info) => {
  await page.addInitScript(() => {
    localStorage.setItem('night-ward:settings:v1', JSON.stringify({ quality: 'low', motion: 'reduce', subtitles: false }));
    if (!localStorage.getItem('night-ward:save:v1')) localStorage.setItem('night-ward:save:v1', JSON.stringify({ version: 1, checkpoint: 'nw:checkpoint:station-approach',
      label: 'Nurses’ Station · West Ward', playSeconds: 42, savedAt: 1, sessions: 1,
      opening: { version: 1, milestone: 'station-approach', state: { version: 1, awakened: true, cardAcquired: true,
        doorUnlocked: true, firstLinePlayed: true, secondLinePlayed: true, room106Tried: true, sightingSeen: true, stationReached: true } } }));
  });
  await page.goto(`${entry}&menu=1`);
  await page.getByRole('button', { name: /^Continue/ }).click();
  await expect.poll(async () => (await snap(page)).state, { timeout: 120_000 }).toBe('ready');
  await scaleForSoftware(page);
  await page.getByRole('button', { name: 'Enter ward', exact: true }).click();
  await expect.poll(async () => (await snap(page)).state, wait).toBe('playing');
  const restored = await snap(page);
  expect(restored.opening!.state.stationReached).toBe(true);
  expect(restored.opening!.cinematic).toBe(false);
  expect(restored.player!.position.x).toBeCloseTo(restored.opening!.anchors['station-approach']!.position.x, 2);
  await expect(page.locator('.nw-opening-ui__subtitle')).toBeHidden();
  await expect.poll(async () => (await snap(page)).state, wait).toBe('playing');
  await page.evaluate(() => document.exitPointerLock());
  await expect.poll(async () => (await snap(page)).state, wait).toBe('paused');
  await page.getByRole('button', { name: /^Return to Main Menu/ }).click();
  await page.getByRole('button', { name: 'Leave the ward', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Continue/ })).toBeVisible();
  await expect(page.locator('[data-night-ward-opening-ui]')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('07-existing-menu.png') });
  // Reload uses the saved extension; no second inventory/save namespace.
  await page.reload();
  await page.getByRole('button', { name: /^Continue/ }).click();
  await expect.poll(async () => (await snap(page)).state, { timeout: 120_000 }).toBe('ready');
  expect((await snap(page)).opening!.state.cardAcquired).toBe(true);
  expect((await snap(page)).colliderCount).toBe(restored.colliderCount);
  await scaleForSoftware(page);
  await page.getByRole('button', { name: 'Enter ward', exact: true }).click();
  await expect.poll(async () => (await snap(page)).state, wait).toBe('playing');
  await page.evaluate(() => document.exitPointerLock());
  await expect.poll(async () => (await snap(page)).state, wait).toBe('paused');
  await page.getByRole('button', { name: /^Return to Main Menu/ }).click();
  await page.getByRole('button', { name: 'Leave the ward', exact: true }).click();
  await page.getByRole('button', { name: /^New Game/ }).click();
  await page.getByRole('button', { name: 'Start new game', exact: true }).click();
  await expect.poll(async () => (await snap(page)).state, { timeout: 120_000 }).toBe('ready');
  expect((await snap(page)).opening!.state).toMatchObject({ awakened: false, cardAcquired: false, doorUnlocked: false });
});
