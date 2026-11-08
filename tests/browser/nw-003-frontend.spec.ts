import { expect, type Page, test } from '@playwright/test';
import type { DiagnosticWindow } from './application';

/**
 * NW-003: title screen, real loading progress, pause, settings and the full session lifecycle in
 * the real game. `?test=1&menu=1` installs the QA bridge but keeps the title screen.
 */
type Snap = { fraction: number; complete: boolean; receivedBytes: number; totalBytes: number; tasks: { id: string; state: string }[] };
const snap = (page: Page) => page.evaluate(() => (window as DiagnosticWindow).nightWardTest.snapshot());
const mode = (page: Page) => page.evaluate(() => (window as unknown as { nightWardFrontend: { mode: string } }).nightWardFrontend.mode);
const history = (page: Page) => page.evaluate(() => (window as unknown as { nightWardFrontend: { loadingHistory: Snap[] } }).nightWardFrontend.loadingHistory);

async function countListeners(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const live = new Map<EventTarget, Map<string, Set<unknown>>>();
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (type: string, listener: unknown, options?: unknown) {
      if (this === window || this === document) {
        const byType = live.get(this) ?? new Map<string, Set<unknown>>();
        live.set(this, byType);
        const set = byType.get(type) ?? new Set();
        byType.set(type, set);
        set.add(listener);
      }
      return add.call(this, type, listener as EventListener, options as AddEventListenerOptions);
    };
    EventTarget.prototype.removeEventListener = function (type: string, listener: unknown, options?: unknown) {
      live.get(this)?.get(type)?.delete(listener);
      return remove.call(this, type, listener as EventListener, options as EventListenerOptions);
    };
    (window as unknown as { nwListeners: () => number }).nwListeners = () => [...live.values()].reduce((n, m) => n + [...m.values()].reduce((k, s) => k + s.size, 0), 0);
  });
}

async function openTitle(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?test=1&menu=1');
  await expect(page.getByRole('button', { name: /New Game/ })).toBeVisible({ timeout: 30_000 });
  return errors;
}

async function untilReady(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Enter ward', exact: true })).toBeVisible({ timeout: 150_000 });
  await expect.poll(async () => (await snap(page)).state, { timeout: 30_000 }).toBe('ready');
}

async function enter(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Enter ward', exact: true }).click();
  // Software WebGL in CI can take several seconds per frame under load.
  await expect.poll(async () => (await snap(page)).state, { timeout: 30_000 }).toBe('playing');
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName), { timeout: 30_000 }).toBe('CANVAS');
}

async function pauseGame(page: Page): Promise<void> {
  await page.evaluate(() => document.exitPointerLock());
  await expect.poll(async () => (await snap(page)).state, { timeout: 30_000 }).toBe('paused');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
}

test('the complete journey: title, real loading, Room 104, pause, settings, resume, restart, menu, new game', async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  await countListeners(page);
  const errors = await openTitle(page);
  const shot = (name: string) => page.screenshot({ path: testInfo.outputPath(`${name}.png`) });

  // 1-2. The title screen, with nothing running behind it.
  const idle = await snap(page);
  expect(idle.frameCount).toBe(0);
  expect(idle.player).toBeNull();
  await expect(page.locator('#app canvas')).toHaveCount(0);
  const cont = page.getByRole('button', { name: /Continue/ });
  await expect(cont).toHaveAttribute('aria-disabled', 'true');
  await expect(page).toHaveTitle('NIGHT WARD');
  await page.waitForTimeout(2500);
  await shot('01-title');

  // 3-4. New Game from the keyboard; the loading bar follows real work.
  await expect(page.getByRole('button', { name: /New Game/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-screen="loading"]')).toBeVisible();
  await page.waitForTimeout(1200);
  await shot('02-loading');
  await untilReady(page);
  await page.waitForTimeout(1000);
  await shot('03-loading-ready');
  const h = await history(page);
  expect(h.length).toBeGreaterThan(10);
  for (let i = 1; i < h.length; i++) expect(h[i]!.fraction).toBeGreaterThanOrEqual(h[i - 1]!.fraction - 1e-9);
  expect(h.some((s) => s.fraction > 0.05 && s.fraction < 0.9)).toBe(true);
  expect(h.at(-1)).toMatchObject({ fraction: 1, complete: true });
  expect(h.at(-1)!.totalBytes).toBeGreaterThan(10 * 1024 * 1024);
  expect(h.at(-1)!.receivedBytes).toBe(h.at(-1)!.totalBytes);
  for (const id of ['engine:renderer', 'module:nw:world:hospital', 'module:night-ward:gameplay', 'shaders:scene']) {
    expect(h.at(-1)!.tasks.find((t) => t.id === id)?.state, id).toBe('done');
  }
  await expect(page.locator('#status')).toContainText('World: nw:hospital:ward-4-west');

  // 5. Enter Room 104.
  await enter(page);
  const start = await snap(page);
  expect(start.player!.position.x).toBeCloseTo(-12.4, 1);
  expect(start.player!.position.z).toBeCloseTo(4.1, 1);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW');
  await page.waitForTimeout(500);
  await shot('04-room-104');
  const firstTextures = (await snap(page)).renderer.textures;
  const firstListeners = await page.evaluate(() => (window as unknown as { nwListeners: () => number }).nwListeners());

  // 6. Escape (pointer lock released) pauses; everything holds still.
  await pauseGame(page);
  const paused = await snap(page);
  await page.waitForTimeout(2500);
  const still = await snap(page);
  expect(still.frameCount).toBe(paused.frameCount);
  expect(still.player!.position).toEqual(paused.player!.position);
  expect(still.entities).toEqual(paused.entities);
  await shot('05-pause');

  // 7. Settings change, apply and persist.
  await page.getByRole('button', { name: /Settings/ }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings).toBeVisible();
  await page.getByLabel('Master volume').focus();
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowLeft');
  await page.getByText('Low', { exact: true }).click();
  await page.waitForTimeout(600);
  await shot('06-settings');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('night-ward:settings:v1') ?? '{}'));
  expect(stored.masterVolume).toBeCloseTo(0.6, 2);
  expect(stored.quality).toBe('low');
  expect(await page.evaluate(() => (window as DiagnosticWindow).nightWardTest.snapshot().state)).toBe('paused');
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();

  // 8. Resume continues the same session exactly where it stopped.
  await page.getByRole('button', { name: /Resume/ }).click();
  await expect.poll(async () => (await snap(page)).state, { timeout: 30_000 }).toBe('playing');
  const resumed = await snap(page);
  expect(resumed.sessionId).toBe(paused.sessionId);
  expect(resumed.player!.position).toEqual(paused.player!.position);

  // 9. Pause and restart (confirmed): a clean session in Room 104.
  await pauseGame(page);
  await page.getByRole('button', { name: /Restart Session/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Restart' }).click();
  await untilReady(page);
  await enter(page);
  const restarted = await snap(page);
  expect(restarted.sessionId).toBe(paused.sessionId + 1);
  expect(restarted.player!.position.x).toBeCloseTo(-12.4, 1);

  // 10. Return to the main menu: the session is disposed, the checkpoint kept.
  await pauseGame(page);
  await page.getByRole('button', { name: /Return to Main Menu/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Leave the ward' }).click();
  await expect.poll(async () => (await snap(page)).state, { timeout: 30_000 }).toBe('menu');
  expect((await snap(page)).player).toBeNull();
  expect(await mode(page)).toBe('title');
  await expect(page.getByRole('button', { name: /Continue/ })).not.toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('button', { name: /Continue/ })).toContainText('Room 104');
  await page.waitForTimeout(1200);
  await shot('07-title-with-save');

  // 11. A new game again (confirmed overwrite), on the same single engine.
  await page.getByRole('button', { name: /New Game/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Start new game' }).click();
  await untilReady(page);
  await enter(page);
  const again = await snap(page);
  expect(again.state).toBe('playing');
  await expect(page.locator('#app canvas')).toHaveCount(1);
  await expect(page.locator('canvas')).toHaveCount(1); // the title scene's and pause still's canvases are gone
  await expect(page.locator('[data-night-ward-hud]')).toHaveCount(1);

  // 12. No leaked listeners or textures across the round trip.
  await page.waitForTimeout(800);
  expect((await snap(page)).renderer.textures).toBeLessThanOrEqual(firstTextures + 2);
  expect(await page.evaluate(() => (window as unknown as { nwListeners: () => number }).nwListeners())).toBe(firstListeners);
  expect(errors).toEqual([]);
});

test('settings persist across a reload and set the render resolution', async ({ page }) => {
  test.setTimeout(300_000);
  await openTitle(page);
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByText('Low', { exact: true }).click();
  await page.getByLabel('Invert vertical look').check();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: /New Game/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Settings/ }).click();
  await expect(page.getByLabel('Invert vertical look')).toBeChecked();
  await expect(page.locator('#nw-set-quality-low')).toBeChecked();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: /New Game/ }).click();
  await untilReady(page);
  // Low renders at 0.75 device pixels per CSS pixel.
  const ratio = await page.locator('#app canvas').evaluate((c) => (c as HTMLCanvasElement).width / (c as HTMLCanvasElement).clientWidth);
  expect(ratio).toBeCloseTo(0.75, 2);
});

test('missing assets fall back cleanly and the loading screen says so', async ({ page }) => {
  test.setTimeout(300_000);
  await page.route('**/room104_set*.glb*', (route) => route.abort());
  await openTitle(page);
  await page.getByRole('button', { name: /New Game/ }).click();
  await untilReady(page);
  await expect(page.locator('.nw-step', { hasText: 'Ward data' })).toHaveAttribute('data-state', 'failed');
  await enter(page);
  expect((await snap(page)).state).toBe('playing');
});

test('reduced motion stills the title scene and the loading plates', async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openTitle(page);
  await expect(page.locator('html')).toHaveClass(/nw-reduce-motion/);
  await expect(page.locator('.nw-scene')).toHaveClass(/is-still/);
  const animation = await page.locator('.nw-scene__camera').evaluate((n) => getComputedStyle(n).animationName);
  expect(animation).toBe('none');
});

for (const viewport of [{ name: 'phone', width: 390, height: 844 }, { name: 'laptop-small', width: 1024, height: 600 }]) {
  test(`screens adapt to a ${viewport.name} viewport`, async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openTitle(page);
    await page.waitForTimeout(1500);
    const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(await noOverflow()).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-title.png`) });
    await page.getByRole('button', { name: /Settings/ }).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-settings.png`) });
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: /New Game/ }).click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-loading.png`) });
    await untilReady(page);
    await enter(page);
    await pauseGame(page);
    await page.waitForTimeout(900);
    expect(await noOverflow()).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-pause.png`) });
  });
}
