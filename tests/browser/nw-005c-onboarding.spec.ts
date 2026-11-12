import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import type { Application } from '../../src/integration/application';
import type { Vec3 } from '../../src/contracts';
const snap = (page: Page) => page.evaluate(() => window.nightWardTest!.snapshot());
const wait = { timeout: 90_000 };
async function boot(page: Page) {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  await page.addInitScript(() => localStorage.setItem('night-ward:settings:v1', JSON.stringify({ quality: 'low', motion: 'full', subtitles: true })));
  await page.goto('/?test=1&menu=1');
  await page.getByRole('button', { name: /^New Game/ }).click();
  await expect.poll(async () => (await snap(page)).state, { timeout: 150_000 }).toBe('ready');
  // Only rendering is scaled for the software GPU; this never changes movement/physics clocks.
  if (process.env.NW005_SOFTWARE_SCALE === '1') await page.evaluate(() => (window.nightWardTest as Application).services()!.renderer.setPixelRatio(.25));
  await page.getByRole('button', { name: 'Enter ward', exact: true }).click();
  await expect.poll(async () => (await snap(page)).state, wait).toBe('playing');
  return errors;
}
async function look(page: Page, target: Vec3) {
  const s = await snap(page), p = s.opening!.camera;
  const dx = target.x - p.x, dy = target.y - p.y, dz = target.z - p.z;
  const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
  const delta = Math.atan2(Math.sin(yaw - s.player!.rotation.yaw), Math.cos(yaw - s.player!.rotation.yaw));
  await page.evaluate(({ x, y }) => document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: x, movementY: y })),
    { x: -delta / .002, y: -(pitch - s.player!.rotation.pitch) / .002 });
}
/** Uses only normal look + keyboard input. No teleport, aimAt, body or camera writes. */
async function walk(page: Page, target: Vec3) {
  const begin = Date.now();
  try {
    while (Date.now() - begin < 90_000) {
      const s = await snap(page), p = s.player!.position;
      if (Math.hypot(target.x - p.x, target.z - p.z) < .23) return;
      await look(page, { ...target, y: s.opening!.camera.y });
      await page.keyboard.down('w'); await page.waitForTimeout(80);
    }
    throw new Error(`Walk did not reach ${JSON.stringify(target)}; ${JSON.stringify((await snap(page)).player)}`);
  } finally { await page.keyboard.up('w');
    await expect.poll(async () => { const v = (await snap(page)).player!.velocity; return Math.hypot(v.x, v.z); }, wait).toBeLessThan(.03); }
}
async function interact(page: Page, text: string) {
  await expect(page.locator('.nw-opening-ui__prompt')).toContainText(text, wait);
  await expect(page.locator('.nw-opening-ui__prompt')).toBeVisible(wait);
  const s = await snap(page); const count = s.events.filter(e => e.type === 'interaction:completed').length;
  const now = s.performance.simulatedSeconds;
  await expect.poll(async () => (await snap(page)).performance.simulatedSeconds, wait).toBeGreaterThan(now + .6);
  await page.keyboard.press('e');
  await expect.poll(async () => (await snap(page)).events.filter(e => e.type === 'interaction:completed').length, wait).toBeGreaterThan(count);
}
test.describe.configure({ timeout: 900_000 });
test('normal title-to-station keyboard route: no teleport, safe card-first exploration, crouching, reader and empty corridor', async ({ page }, info) => {
  const errors = await boot(page);
  // Disable positioning shortcuts so accidental future use fails this playthrough.
  await page.evaluate(() => { window.nightWardTest!.teleport = () => { throw new Error('Teleport forbidden in keyboard route'); }; window.nightWardTest!.aimAt = () => { throw new Error('Aim shortcut forbidden in keyboard route'); }; });
  await expect.poll(async () => (await snap(page)).opening!.state.awakened, wait).toBe(true);
  const neutral=(await snap(page)).performance.simulatedSeconds;
  await expect.poll(async () => (await snap(page)).performance.simulatedSeconds,wait).toBeGreaterThan(neutral+.5);
  expect((await snap(page)).opening!.phase).toBe('room-104');
  await page.screenshot({ path: info.outputPath('01-awake.png') });
  const a = (await snap(page)).opening!.anchors;
  await walk(page, a['access-card']!.stand!); await look(page, a['access-card']!.position);
  await expect(page.locator('.nw-opening-ui__guidance')).toContainText('Crouch', wait);
  await page.keyboard.press('c'); await expect.poll(async () => (await snap(page)).player!.crouching, wait).toBe(true);
  await expect.poll(async () => { const s = await snap(page); return s.opening!.camera.y - s.player!.position.y; }, wait).toBeLessThan(1.02);
  await look(page, a['access-card']!.position);
  await interact(page, 'Take'); await page.keyboard.press('c');
  await expect.poll(async () => (await snap(page)).player!.crouching, wait).toBe(false);
  expect((await snap(page)).opening!.state.firstLinePlayed).toBe(false);
  await walk(page, a['card-reader']!.stand!); await look(page, a['card-reader']!.position); await interact(page, 'reader');
  await expect.poll(async () => (await snap(page)).opening!.state.doorUnlocked, wait).toBe(true);
  for (let i = 0; i < 3; i++) await interact(page, 'reader');
  expect((await snap(page)).opening!.state.secondLinePlayed).toBe(true);
  const d = a['room-104-door']!.position, stand = a['room-104-door']!.stand!;
  const length = Math.hypot(stand.x - d.x, stand.z - d.z);
  await walk(page, { x: d.x + (stand.x-d.x)/length*1.55, y: 0, z: d.z+(stand.z-d.z)/length*1.55 });
  await look(page, d); await interact(page, 'Open');
  await expect.poll(async () => (await snap(page)).doorStates['nw:door:room-104'], wait).toBe('open');
  const view = a['nurse-first-sight-view']!.position;
  await walk(page, { ...view, y: 0 });
  await look(page, { ...a['nurse-first-sight']!.position, y: 1.4 });
  expect((await snap(page)).opening!.state.sightingSeen).toBe(false);
  expect((await snap(page)).station!.active).toBe(false);
  await page.screenshot({ path: info.outputPath('02-corridor.png') });
  await walk(page, a['room-106-door']!.stand!); await look(page, a['room-106-door']!.position); await interact(page, 'Try handle');
  await page.keyboard.down('Shift'); await walk(page, a['station-approach']!.position); await page.keyboard.up('Shift');
  await expect.poll(async () => (await snap(page)).opening!.phase, wait).toBe('stealth-onboarding');
  expect((await snap(page)).opening!.narrative?.scene).toBe('station-discovery');
  expect((await snap(page)).station!.active).toBe(false);
  await page.evaluate(() => window.nightWardTest!.captureForTest());
  const final = await snap(page);
  expect(final.state).toBe('playing'); expect(final.player!.captured).toBe(false); expect(final.entities).toEqual([]);
  expect(final.events.filter(e => e.type === 'chase:started')).toEqual([]);
  await page.screenshot({ path: info.outputPath('03-station-handoff.png') });
  await writeFile(info.outputPath('route-evidence.json'), JSON.stringify({ route: 'normal game, keyboard and mouse input only, no positioning shortcuts', final }, null, 2));
  expect(errors).toEqual([]);
});

test('three minutes of safe Room104 exploration, locked-door introduction, denial, pause and puzzle restart', async ({ page }, info) => {
  const errors = await boot(page); await page.keyboard.press('Space');
  await expect.poll(async () => (await snap(page)).opening!.state.awakened, wait).toBe(true);
  const before = await snap(page);
  // Real elapsed exploration period, not a fabricated progression-clock jump.
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(30_000);
    const s = await snap(page); expect(s.player!.captured).toBe(false); expect(s.entities).toEqual([]);
    expect(s.opening!.state.doorUnlocked).toBe(false);
  }
  expect((await snap(page)).colliderCount).toBe(before.colliderCount);
  const a = (await snap(page)).opening!.anchors, d = a['room-104-door']!;
  const direction = { x: d.stand!.x - d.position.x, z: d.stand!.z - d.position.z };
  const length = Math.hypot(direction.x, direction.z);
  const p = { x: d.position.x + direction.x/length*1.55, y: d.stand!.y, z: d.position.z + direction.z/length*1.55 };
  await walk(page, p); await look(page, d.position); await interact(page, 'Try door');
  await expect.poll(async () => (await snap(page)).opening!.state.firstLinePlayed, wait).toBe(true);
  await expect(page.locator('.nw-opening-ui__subtitle')).toContainText('Please return to your bed.', wait);
  await page.evaluate(() => document.exitPointerLock());
  await expect.poll(async () => (await snap(page)).state, wait).toBe('paused');
  const frames = (await snap(page)).frameCount; await page.waitForTimeout(1000); expect((await snap(page)).frameCount).toBe(frames);
  await page.getByRole('button', { name: /^Resume/ }).click();
  await expect.poll(async () => (await snap(page)).state, wait).toBe('playing');
  await walk(page, a['card-reader']!.stand!); await look(page, a['card-reader']!.position); await interact(page, 'reader');
  expect((await snap(page)).opening!.state.doorUnlocked).toBe(false);
  await page.evaluate(() => window.nightWardTest!.restart());
  await expect.poll(async () => (await snap(page)).state, wait).toBe('ready');
  expect((await snap(page)).opening!.state).toMatchObject({ awakened: false, cardAcquired: false, firstLinePlayed: false });
  expect((await snap(page)).colliderCount).toBe(before.colliderCount);
  await writeFile(info.outputPath('safe-exploration.json'), JSON.stringify({ elapsedSeconds: 180, before, after: await snap(page) }, null, 2));
  expect(errors).toEqual([]);
});

test('literal normal URL launches the integrated opening without a QA bridge or development harness', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem('night-ward:settings:v1', JSON.stringify({quality:'low',motion:'reduce'})));
  await page.goto('/');
  expect(await page.evaluate(() => window.nightWardTest)).toBeUndefined();
  await page.getByRole('button',{name:/^New Game/}).click();
  await page.getByRole('button',{name:'Enter ward',exact:true}).click({timeout:150_000});
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName), wait).toBe('CANVAS');
  await expect(page.locator('[data-night-ward-opening-ui]')).toHaveCount(1);
  await expect(page.locator('.nw-opening-ui__skip')).toBeVisible(wait);
  await page.keyboard.press('Space');
  await expect(page.locator('.nw-opening-ui__skip')).toBeHidden(wait);
  await expect(page.locator('[data-night-ward-hud]')).toHaveCount(0);
  await page.screenshot({path:info.outputPath('normal-url.png')});
});
