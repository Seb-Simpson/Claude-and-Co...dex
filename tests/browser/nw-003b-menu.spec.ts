import { expect, type Page, test } from '@playwright/test';
import type { DiagnosticWindow } from './application';

/**
 * NW-003B: the cinematic title screen in real Chromium.
 *
 * `?test=1&menu=1&menuSeed=104` keeps the title screen and seeds its lighting director, so every
 * event is reproducible; the QA bridge can also force an event or pin the lights. The checks
 * measure the picture itself (pixels read back from the corridor's WebGL canvas) and the sound
 * itself (the level leaving the mixer, after the volume settings), not just internal state.
 */
type Light = { ambient: number; main: number; sway: number; far: number; exit: number; figure: number };
type Sample = { mean: number; figure: number; red: number };
type MenuDiag = {
  corridor: { mode: string; frames: number; state: Light; sample(): Sample | null };
  director: { force(kind: string): void; freeze(s: Partial<Light> | null): void; time: number; sequences: { kind: string; at: number }[] };
  audio: { state: string; muted: boolean; debug: { played: string[]; bedPlaying: boolean; voices: number } };
  outputLevel(): number;
};
type W = Window & { nightWardFrontend: { mode: string; menu: MenuDiag } };

const mode = (page: Page) => page.evaluate(() => (window as unknown as W).nightWardFrontend.mode);
const snap = (page: Page) => page.evaluate(() => (window as DiagnosticWindow).nightWardTest.snapshot());
const corridorMode = (page: Page) => page.evaluate(() => (window as unknown as W).nightWardFrontend.menu.corridor.mode);
const audioState = (page: Page) => page.evaluate(() => (window as unknown as W).nightWardFrontend.menu.audio.state);
const light = (page: Page) => page.evaluate(() => (window as unknown as W).nightWardFrontend.menu.corridor.state);
const force = (page: Page, kind: string) => page.evaluate((k) => (window as unknown as W).nightWardFrontend.menu.director.force(k), kind);
const unfreeze = (page: Page) => page.evaluate(() => (window as unknown as W).nightWardFrontend.menu.director.freeze(null));

/** Pin the lights (optional), let two frames render, then read the canvas back. */
async function sample(page: Page, pin?: Partial<Light>): Promise<Sample> {
  const s = await page.evaluate(async (p) => {
    const m = (window as unknown as W).nightWardFrontend.menu;
    if (p) m.director.freeze(p);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return m.corridor.sample();
  }, pin ?? null);
  expect(s, 'the corridor renders with WebGL').not.toBeNull();
  return s!;
}

/** Mean output level over about a second (RMS after master/music/sfx gains). */
const level = (page: Page) => page.evaluate(async () => {
  const m = (window as unknown as W).nightWardFrontend.menu;
  let sum = 0;
  for (let i = 0; i < 10; i++) { sum += m.outputLevel(); await new Promise((r) => setTimeout(r, 100)); }
  return sum / 10;
});

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
const listeners = (page: Page) => page.evaluate(() => (window as unknown as { nwListeners: () => number }).nwListeners());

async function openTitle(page: Page, seed = 104): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`/?test=1&menu=1&menuSeed=${seed}`);
  await expect(page.getByRole('button', { name: /New Game/ })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => corridorMode(page), { timeout: 30_000 }).toBe('webgl');
  return errors;
}


test('1, 2, 9: the redesigned title screen, readable, with nothing running behind it', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  const errors = await openTitle(page);
  // 1. No gameplay: no engine frame, no player, no game canvas. Only the corridor's own canvas.
  expect(await mode(page)).toBe('title');
  const idle = await snap(page);
  expect(idle.frameCount).toBe(0);
  expect(idle.player).toBeNull();
  await expect(page.locator('#app canvas')).toHaveCount(0);
  await expect(page.locator('.nw-corridor__canvas')).toHaveCount(1);

  // 2. Title, seal, wristband, the four items and the tagline, all on screen.
  await expect(page.getByRole('heading', { level: 1, name: 'Night Ward' })).toBeVisible();
  await expect(page.locator('.nw-brand__seal')).toBeVisible();
  await expect(page.locator('.nw-brand__house')).toHaveText(/Halden Vale Infirmary/i);
  await expect(page.locator('.nw-band')).toContainText('Do not discharge');
  for (const name of [/Continue/, /New Game/, /Settings/, /Credits/]) await expect(page.getByRole('button', { name })).toBeVisible();
  await expect(page.locator('.nw-tagline')).toContainText('never leave');
  // Nothing overlaps or leaves the 1366x768 screen.
  const boxes = await page.evaluate(() => ['.nw-brand', '.nw-menu .nw-nav__list', '.nw-tagline', '.nw-menu__footer .nw-sound'].map((s) => {
    const r = document.querySelector(s)!.getBoundingClientRect();
    return { s, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  }));
  for (const b of boxes) { expect(b.top, b.s).toBeGreaterThanOrEqual(0); expect(b.bottom, b.s).toBeLessThanOrEqual(768); expect(b.right, b.s).toBeLessThanOrEqual(1366); }
  for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.top, `${boxes[i]!.s} below ${boxes[i - 1]!.s}`).toBeGreaterThanOrEqual(boxes[i - 1]!.bottom - 1);
  // Menu labels are light on a dark surface.
  const labelColour = await page.locator('.nw-menu .nw-nav__label').nth(1).evaluate((n) => getComputedStyle(n).color);
  const [r, g, b] = labelColour.match(/\d+/g)!.map(Number);
  expect((0.2126 * r! + 0.7152 * g! + 0.0722 * b!) / 255).toBeGreaterThan(0.7);

  // 9. Continue is disabled without a save: it says so, shows a lock and does nothing.
  const cont = page.getByRole('button', { name: /Continue/ });
  await expect(cont).toHaveAttribute('aria-disabled', 'true');
  await expect(cont).toContainText('No records on file');
  await expect(cont.locator('.nw-nav__lock')).toBeVisible();
  await cont.click({ force: true }); // a real click on the aria-disabled item
  await page.waitForTimeout(400);
  expect(await mode(page)).toBe('title');
  await expect(page.locator('[data-screen="loading"]')).toBeHidden();

  // Selected state: New Game burns red with its heartbeat trace (keyboard focus).
  await page.getByRole('button', { name: /New Game/ }).focus();
  await sample(page, { main: 1, far: 0.72, exit: 1, figure: 0, sway: 0.5 });
  await page.waitForTimeout(900);
  const selected = page.getByRole('button', { name: /New Game/ });
  await expect(selected.locator('.nw-nav__ecg')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: testInfo.outputPath('menu-selected-new-game-1366x768.png') });
  expect(errors).toEqual([]);
});

test('3, 4: the corridor really relights: flicker, blackout, the figure, the exit pulse', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = await openTitle(page);
  await page.mouse.move(5, 5);

  // Lit vs blackout, pinned: the rendered picture itself changes, not a filter over it.
  const lit = await sample(page, { main: 1, far: 0.72, exit: 1, figure: 0, sway: 0.5 });
  await page.screenshot({ path: testInfo.outputPath('menu-normal.png') });
  const dim = await sample(page, { main: 0.35, far: 0.72, exit: 1, figure: 0 });
  const dark = await sample(page, { main: 0, far: 0, exit: 1, figure: 0 });
  await page.screenshot({ path: testInfo.outputPath('menu-blackout.png') });
  expect(dark.mean).toBeLessThan(lit.mean * 0.6);
  expect(dim.mean).toBeGreaterThan(dark.mean);
  expect(dim.mean).toBeLessThan(lit.mean);
  // In the blackout the exit sign's red dominates.
  expect(dark.red).toBeGreaterThan(lit.red);

  // 3. A real flicker sequence, unpinned: the measured brightness drops and recovers repeatedly.
  await unfreeze(page);
  await page.waitForTimeout(1500);
  await force(page, 'stutter');
  const series: number[] = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 5000) series.push((await sample(page)).mean);
  const lo = Math.min(...series);
  const hi = Math.max(...series);
  expect(hi - lo).toBeGreaterThan((lit.mean - dark.mean) * 0.3);
  let reversals = 0;
  for (let i = 2; i < series.length; i++) if ((series[i]! - series[i - 1]!) * (series[i - 1]! - series[i - 2]!) < 0 && Math.abs(series[i]! - series[i - 1]!) > 0.01) reversals++;
  expect(reversals).toBeGreaterThanOrEqual(2);

  // 4. The figure: it appears in the dark, in the end doorway, and is gone when the light returns.
  await force(page, 'figure');
  await expect.poll(async () => (await light(page)).figure, { timeout: 8_000 }).toBeGreaterThan(0.95);
  const there = await sample(page, { main: 0, far: 0, figure: 1 });
  await page.screenshot({ path: testInfo.outputPath('menu-figure.png') });
  const gone = await sample(page, { main: 0, far: 0, figure: 0 });
  expect(Math.abs(there.figure - gone.figure)).toBeGreaterThan(0.01);
  await unfreeze(page);
  await expect.poll(async () => (await light(page)).main, { timeout: 10_000 }).toBeGreaterThan(0.8);
  expect((await light(page)).figure).toBe(0);

  // The exit sign pulses.
  const base = await sample(page, { main: 0, far: 0, exit: 1, figure: 0 });
  const pulse = await sample(page, { main: 0, far: 0, exit: 1.85, figure: 0 });
  expect(pulse.red).toBeGreaterThan(base.red);
  await unfreeze(page);
  expect(errors).toEqual([]);
});

test('3, 4: left alone, the corridor fails within seconds and the figure comes early', async ({ page }) => {
  test.setTimeout(180_000);
  await openTitle(page, 104);
  // Director time runs with the page; with this seed the first apparition is due within ~25 s.
  await expect.poll(() => page.evaluate(() => (window as unknown as W).nightWardFrontend.menu.director.sequences.map((s) => s.kind)), { timeout: 60_000, intervals: [1000] })
    .toContain('figure');
  const kinds = await page.evaluate(() => (window as unknown as W).nightWardFrontend.menu.director.sequences.map((s) => s.kind));
  expect(kinds[0]).toBe('strike');
  expect(kinds.length).toBeGreaterThanOrEqual(3);
});

test('5, 6: the title soundtrack starts after a gesture and follows the volume settings', async ({ page }) => {
  test.setTimeout(180_000);
  await openTitle(page);
  // Nothing plays (or downloads) before the player interacts.
  expect(await audioState(page)).toBe('locked');
  const sound = page.locator('.nw-sound');
  await expect(sound).toHaveText(/Enable sound/);

  // 5. One click on the control: the ambience plays.
  await sound.click();
  await expect.poll(() => audioState(page), { timeout: 30_000 }).toBe('playing');
  await expect(sound).toHaveText(/Sound on/);
  await expect.poll(() => level(page), { timeout: 20_000 }).toBeGreaterThan(0.002);
  const full = await level(page);
  // Lighting failures are heard: the figure brings its swell.
  await force(page, 'figure');
  await expect.poll(() => page.evaluate(() => (window as unknown as W).nightWardFrontend.menu.audio.debug.played), { timeout: 15_000 }).toContain('presence');

  // 6. Master volume to zero silences it; music down lowers it; back up restores it.
  await page.getByRole('button', { name: /Settings/ }).click();
  const master = page.getByLabel('Master volume');
  await master.focus();
  await page.keyboard.press('Home');
  await expect.poll(() => level(page), { timeout: 10_000 }).toBeLessThan(0.0005);
  await page.keyboard.press('End');
  await expect.poll(() => level(page), { timeout: 10_000 }).toBeGreaterThan(full * 0.5);
  const music = page.getByLabel('Music');
  await music.focus();
  await page.keyboard.press('Home');
  await expect.poll(() => level(page), { timeout: 10_000 }).toBeLessThan(full * 0.6);
  await page.keyboard.press('End');
  await page.getByRole('button', { name: 'Done' }).click();

  // Muting is remembered.
  await sound.click();
  await expect.poll(() => audioState(page)).toBe('muted');
  await expect.poll(() => level(page), { timeout: 10_000 }).toBeLessThan(0.0005);
  await page.reload();
  await expect(page.getByRole('button', { name: /New Game/ })).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => audioState(page)).toBe('muted');
  await expect(sound).toHaveText(/Sound off/);
  await sound.click();
  await expect.poll(() => audioState(page), { timeout: 30_000 }).toBe('playing');
});

test('7, 8: New Game reaches the ward; returning restores the title without leaks', async ({ page }) => {
  test.setTimeout(600_000);
  await countListeners(page);
  const errors = await openTitle(page);
  await page.keyboard.press('ArrowDown'); // a gesture: the soundtrack starts
  await expect.poll(() => audioState(page), { timeout: 30_000 }).toBe('playing');
  await page.getByRole('button', { name: /New Game/ }).focus();

  const roundTrip = async (confirmOverwrite: boolean): Promise<void> => {
    await page.keyboard.press('Enter');
    if (confirmOverwrite) await page.getByRole('alertdialog').getByRole('button', { name: 'Start new game' }).click();
    // 7. Loading screen, then the game. The title's canvas, GPU context and sound are released.
    await expect(page.locator('[data-screen="loading"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.nw-corridor__canvas')).toHaveCount(0);
    expect(await audioState(page)).toBe('stopped');
    await expect(page.getByRole('button', { name: 'Enter ward', exact: true })).toBeVisible({ timeout: 150_000 });
    await page.getByRole('button', { name: 'Enter ward', exact: true }).click();
    await expect.poll(async () => (await snap(page)).state, { timeout: 30_000 }).toBe('playing');
    await expect(page.locator('canvas')).toHaveCount(1);
    // Pause and go back to the title.
    await page.evaluate(() => document.exitPointerLock());
    await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /Return to Main Menu/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Leave the ward' }).click();
    // 8. The title is back, relit, with its sound, and nothing of the session is left running.
    await expect.poll(() => mode(page), { timeout: 30_000 }).toBe('title');
    await expect.poll(() => corridorMode(page), { timeout: 30_000 }).toBe('webgl');
    await expect.poll(() => audioState(page), { timeout: 30_000 }).toBe('playing');
    expect((await snap(page)).player).toBeNull();
    await expect(page.locator('canvas')).toHaveCount(2); // the (hidden) game canvas and the corridor's
    await page.getByRole('button', { name: /New Game/ }).focus();
  };

  await roundTrip(false);
  await page.waitForTimeout(1000);
  const afterFirst = await listeners(page);
  const texturesFirst = (await snap(page)).renderer.textures;
  await roundTrip(true);
  await page.waitForTimeout(1000);
  expect(await listeners(page)).toBe(afterFirst);
  expect((await snap(page)).renderer.textures).toBeLessThanOrEqual(texturesFirst + 2);
  expect(errors).toEqual([]);
});

test('10: reduced motion keeps the events but turns flashes into slow fades', async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openTitle(page);
  await expect(page.locator('.nw-corridor')).toHaveClass(/is-still/);
  const lit = await sample(page, { main: 1, far: 0.72, exit: 1, figure: 0 });
  const dark = await sample(page, { main: 0, far: 0, exit: 1, figure: 0 });
  await unfreeze(page);
  await page.waitForTimeout(2500);
  await force(page, 'figure');
  const series: { t: number; mean: number }[] = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 4500) series.push({ t: Date.now() - t0, mean: (await sample(page)).mean });
  // It does go dark...
  expect(Math.min(...series.map((s) => s.mean))).toBeLessThan(lit.mean * 0.7);
  // ...but gradually: no jump between consecutive frames is larger than a quarter of the range
  // scaled to the time between samples (a fade of ~1.4 s).
  const range = lit.mean - dark.mean;
  for (let i = 1; i < series.length; i++) {
    const dt = Math.max(0.05, (series[i]!.t - series[i - 1]!.t) / 1000);
    expect(Math.abs(series[i]!.mean - series[i - 1]!.mean)).toBeLessThan(range * Math.max(0.25, dt * 1.2));
  }
  const sways = new Set<number>();
  for (let i = 0; i < 5; i++) { sways.add((await light(page)).sway); await page.waitForTimeout(200); }
  expect([...sways]).toEqual([0.5]);
});
