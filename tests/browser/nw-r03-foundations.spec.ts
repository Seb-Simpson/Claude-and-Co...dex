/**
 * NW-R03 — Chapter 1 foundations, in the running game (`?level=greybox&r03=1`).
 *
 * Real input only for the demonstration: walking (W), crouching (C), interacting (E, held or
 * pressed). Steering aims the camera through the test bridge. Writes docs/nw-r03/ evidence when
 * NW_R03_EVIDENCE=1.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { GreyboxApi } from '../../src/world/greybox/greyboxModule';
import type { DiagnosticWindow } from './application';

const exe = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
test.use({ launchOptions: { ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] } });

const EVIDENCE = process.env.NW_R03_EVIDENCE === '1';
const OUT = 'docs/nw-r03';
type W = DiagnosticWindow & { nightWardGreybox: GreyboxApi; __gbWalk?: (x: number, z: number, tolerance: number) => Promise<{ ok: boolean; reason?: string; x: number; z: number }> };
const log: Record<string, unknown>[] = [];

async function enter(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as Partial<W>).nightWardTest?.snapshot().state === 'ready', null, { timeout: 120_000 });
  await page.waitForFunction(() => Boolean((window as unknown as Partial<W>).nightWardGreybox), null, { timeout: 10_000 });
  await page.getByRole('button', { name: 'Enter ward', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS');
  await expect.poll(() => page.evaluate(() => (window as unknown as W).nightWardTest.snapshot().state)).toBe('playing');
  await page.evaluate(() => {
    const w = window as unknown as W;
    const key = (type: 'keydown' | 'keyup', code: string) => document.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    const low = (x: number, z: number) => (w.nightWardGreybox.build.layout.spaceAt(x, z)?.ceiling ?? 9) < 1.85;
    w.__gbWalk = (tx, tz, tolerance) => new Promise((resolve) => {
      let last = performance.now(), best = Infinity, forward = false;
      const tick = () => {
        const p = w.nightWardTest.snapshot().player!;
        const dx = tx - p.position.x, dz = tz - p.position.z, dist = Math.hypot(dx, dz);
        const want = low(p.position.x, p.position.z) || low(tx, tz);
        if (want !== p.crouching) { key('keydown', 'KeyC'); key('keyup', 'KeyC'); }
        const done = (ok: boolean, reason?: string) => { if (forward) key('keyup', 'KeyW'); resolve({ ok, ...(reason ? { reason } : {}), x: p.position.x, z: p.position.z }); };
        if (dist <= tolerance) { done(true); return; }
        w.nightWardTest.aimAt({ x: tx, y: p.crouching ? 0.9 : 1.65, z: tz });
        const wait = want && !p.crouching;
        if (!wait && !forward) { key('keydown', 'KeyW'); forward = true; }
        if (wait && forward) { key('keyup', 'KeyW'); forward = false; }
        if (dist < best - 0.05) { best = dist; last = performance.now(); }
        if (performance.now() - last > 8000) { done(false, `stuck ${dist.toFixed(2)} m away`); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  });
}
const walk = async (page: Page, x: number, z: number, tolerance = 0.3) => {
  const r = await page.evaluate(({ x, z, t }) => (window as unknown as W).__gbWalk!(x, z, t), { x, z, t: tolerance });
  expect(r.ok, `walk to ${x},${z}: ${r.reason ?? ''} at ${r.x.toFixed(2)},${r.z.toFixed(2)}`).toBe(true);
};
const aim = (page: Page, x: number, y: number, z: number) => page.evaluate((t) => (window as unknown as W).nightWardTest.aimAt(t), { x, y, z });
const key = (page: Page, type: 'keydown' | 'keyup', code: string) => page.evaluate(({ type, code }) => document.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true })), { type, code });
const chapter = (page: Page) => page.evaluate(() => {
  const s = (window as unknown as W).nightWardGreybox.r03!;
  return { beats: [...s.state.beats], knowledge: [...s.state.knowledge], items: [...s.state.items], flags: [...s.state.flags], suspicion: s.state.suspicion,
    encounters: { ...s.state.encounters }, linesPlayed: [...s.state.linesPlayed], objective: s.objective.id, objectiveText: s.objective.text, restoredFrom: s.restoredFrom,
    checkpoint: s.lastCheckpoint?.checkpointId ?? null, activeLine: s.voice.activeLineId };
});
const outcomes = (page: Page, targetId: string) => page.evaluate((id) => (window as unknown as W).nightWardTest.snapshot().events
  .filter((e) => e.type === 'interaction:completed' && (e.payload as { targetId: string }).targetId === id)
  .map((e) => { const p = e.payload as { outcome: string; reason?: string }; return `${p.outcome}${p.reason ? `:${p.reason}` : ''}`; }), targetId);
const doorState = (page: Page, id: string) => page.evaluate((d) => (window as unknown as W).nightWardTest.snapshot().doorStates[d], id);
const shot = async (page: Page, name: string) => { if (EVIDENCE) { mkdirSync(`${OUT}/screenshots`, { recursive: true }); await page.screenshot({ path: `${OUT}/screenshots/${name}.png` }); } };
const sim = (page: Page) => page.evaluate(() => (window as unknown as W).nightWardTest.snapshot().performance.simulatedSeconds);
async function holdE(page: Page, seconds: number): Promise<void> {
  await key(page, 'keydown', 'KeyE');
  const start = await sim(page);
  await expect.poll(async () => (await sim(page)) - start, { timeout: 60_000, intervals: [100] }).toBeGreaterThan(seconds);
  await key(page, 'keyup', 'KeyE');
}
async function openDoor(page: Page, id: string, x: number, z: number, y = 1.2): Promise<void> {
  await aim(page, x, y, z);
  await key(page, 'keydown', 'KeyE'); await key(page, 'keyup', 'KeyE');
  await expect.poll(() => doorState(page, id), { timeout: 10_000 }).toBe('open');
}

test.describe('NW-R03 Chapter 1 foundations (greybox demo)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { if (!sessionStorage.getItem('nw-r03-keep')) { localStorage.removeItem('night-ward:greybox:ch1-checkpoint'); sessionStorage.setItem('nw-r03-keep', '1'); } });
  });

  test('document → state → objective → hold interactions → door → voice → checkpoint → restart and reload restore', async ({ page }) => {
    test.setTimeout(15 * 60_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/?test=1&level=greybox&r03=1');
    await enter(page);
    let c = await chapter(page);
    expect(c.restoredFrom).toBe('scenario');
    expect(c.items).toEqual(['shaw-keys']);
    expect(c.objective).toBe('clear-steam');
    expect(await doorState(page, 'nw:door:gb-steam')).toBe('closed');
    await shot(page, '01-scenario-start');

    // The steam door is locked by state: trying it is refused with the reason. (Round the pump housing.)
    await walk(page, 21.0, -40.6);
    await walk(page, 16.9, -40.6);
    await walk(page, 16.9, -43);
    await aim(page, 15, 1.2, -43);
    await key(page, 'keydown', 'KeyE'); await key(page, 'keyup', 'KeyE');
    await expect.poll(() => outcomes(page, 'nw:door:gb-steam')).toEqual(['denied:Steam blocks the way (valve)']);

    // Hold cancellation: release early, nothing changes.
    await walk(page, 16.6, -40.4);
    await aim(page, 16.0, 1.3, -39.3);
    await holdE(page, 1.0);
    await expect.poll(() => outcomes(page, 'nw:inspect:gb-r03-valve')).toEqual(['cancelled:Released']);
    expect((await chapter(page)).beats).not.toContain('valve-closed');
    await shot(page, '02-valve-hold-cancelled');

    // Repeatable, loud wrong valve in toggle mode (accessibility): one press, no hold.
    await page.evaluate(async (path) => { const { settings } = await import(/* @vite-ignore */ path) as typeof import('../../src/settings/settings'); settings.update({ holdInteractions: 'toggle' }); }, '/src/settings/settings.ts');
    await aim(page, 18.2, 1.3, -39.3);
    await key(page, 'keydown', 'KeyE'); await key(page, 'keyup', 'KeyE');
    await expect.poll(() => outcomes(page, 'nw:inspect:gb-r03-wrong-valve'), { timeout: 20_000 }).toEqual(['completed']);
    const noise = await page.evaluate(() => (window as unknown as W).nightWardTest.snapshot().events.filter((e) => e.type === 'interaction:completed').length);
    expect(noise).toBeGreaterThan(0);
    await page.evaluate(async (path) => { const { settings } = await import(/* @vite-ignore */ path) as typeof import('../../src/settings/settings'); settings.update({ holdInteractions: 'hold' }); }, '/src/settings/settings.ts');

    // The real valve, held to completion: state and objective change, the steam door unlocks.
    await aim(page, 16.0, 1.3, -39.3);
    await holdE(page, 2.8);
    await expect.poll(async () => (await chapter(page)).beats).toContain('valve-closed');
    c = await chapter(page);
    expect(c.objective).toBe('reach-link');
    await shot(page, '03-valve-done-objective');
    await walk(page, 16.9, -43);
    await openDoor(page, 'nw:door:gb-steam', 15, -43.4);

    // The document: knowledge and objective.
    await walk(page, 12.8, -43.2);
    await aim(page, 12.0, 1.2, -42.3);
    await key(page, 'keydown', 'KeyE'); await key(page, 'keyup', 'KeyE');
    await expect.poll(async () => (await chapter(page)).knowledge).toContain('link-closure-order');
    expect((await chapter(page)).objective).toBe('unlock-bulkhead');
    await shot(page, '04-document-read');

    // Checkpoint on reaching the bulkhead chamber.
    await walk(page, 3.8, -42.7);
    await expect.poll(async () => (await chapter(page)).checkpoint).toBe('CP7');
    expect(await page.evaluate(() => localStorage.getItem('night-ward:greybox:ch1-checkpoint'))).toContain('"CP7"');

    // Padlock (item requirement satisfied: Shaw's keys) → temporary voice line on the intercom.
    await aim(page, 2.35, 1.1, -42.45);
    await holdE(page, 1.5);
    await expect.poll(async () => (await chapter(page)).beats).toContain('bulkhead-unlocked');
    await expect.poll(async () => (await chapter(page)).activeLine, { timeout: 10_000 }).toBe('shaw.r03.reaction');
    const caption = (await page.locator('.nw-subtitles').textContent()) ?? '';
    expect(caption).toMatch(/^Sister Shaw \((temp voice|subtitle only)\): \[intercom\] /);
    log.push({ step: 'voice', caption });
    await shot(page, '05-padlock-voice-subtitle');
    await expect.poll(async () => (await chapter(page)).linesPlayed).toContain('shaw.r03.reaction');
    // Duplicate protection: the one-time line can't play again.
    expect(await page.evaluate(() => (window as unknown as W).nightWardGreybox.r03!.voice.request({ lineId: 'shaw.r03.reaction', stage: 'desperation' }))).toMatch(/duplicate|already-played/);
    // Checkpoint re-saved with the new state.
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('night-ward:greybox:ch1-checkpoint') ?? '{}').state?.beats ?? [])).toContain('bulkhead-unlocked');
    const before = await chapter(page);

    // Restart (game restart, same page): state, doors and position restored.
    await page.evaluate(() => (window as unknown as W).nightWardTest.restart());
    await enter(page);
    c = await chapter(page);
    expect(c.restoredFrom).toBe('checkpoint');
    expect(c.beats).toEqual(before.beats);
    expect(c.knowledge).toEqual(before.knowledge);
    expect(c.linesPlayed).toContain('shaw.r03.reaction');
    expect(await doorState(page, 'nw:door:gb-steam')).toBe('open');
    const pos = await page.evaluate(() => (window as unknown as W).nightWardTest.snapshot().player!.position);
    expect(Math.hypot(pos.x - 3.8, pos.z + 42.7)).toBeLessThan(0.6);
    await shot(page, '06-restored-after-restart');

    // Exit and reload the page: the same checkpoint resumes.
    await page.reload();
    await enter(page);
    c = await chapter(page);
    expect(c.restoredFrom).toBe('checkpoint');
    expect(c.beats).toContain('bulkhead-unlocked');
    expect(c.objective).toBe('open-bulkhead');

    // Crank (long hold) → the bulkhead opens by state. E6 is marked active but not implemented.
    await aim(page, 3.0, 1.0, -41.85);
    await holdE(page, 4.3);
    await expect.poll(async () => (await chapter(page)).beats).toContain('bulkhead-opened');
    expect((await chapter(page)).encounters.E6).toBe('active');
    await walk(page, 3.6, -43);
    await openDoor(page, 'nw:door:gb-bulkhead', 2, -43);
    await shot(page, '07-bulkhead-open');
    expect(errors).toEqual([]);
    if (EVIDENCE) { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/browser-log.json`, `${JSON.stringify({ final: await chapter(page), log }, null, 1)}\n`); }
  });

  test('crouched hold: the crawlway hatch cover opens only after its wing nuts are undone', async ({ page }) => {
    test.setTimeout(6 * 60_000);
    await page.goto('/?test=1&level=greybox&r03=1');
    await enter(page);
    expect(await page.evaluate(() => (window as unknown as W).nightWardGreybox.checkpoint('CP3'))).toBe(true);
    await walk(page, 25.1, 32.65);
    await aim(page, 26, 0.6, 32);
    await key(page, 'keydown', 'KeyE'); await key(page, 'keyup', 'KeyE');
    await expect.poll(() => outcomes(page, 'nw:door:gb-r03-hatch')).toEqual(['denied:Held shut by wing nuts']);
    // Standing: the prompt asks to crouch.
    await aim(page, 25.75, 0.45, 32.65);
    await expect.poll(() => page.evaluate(() => (window as unknown as W).nightWardTest.snapshot().prompt?.reason)).toBe('Crouch to reach it');
    await key(page, 'keydown', 'KeyC'); await key(page, 'keyup', 'KeyC');
    await expect.poll(() => page.evaluate(() => (window as unknown as W).nightWardTest.snapshot().player!.crouching)).toBe(true);
    await aim(page, 25.75, 0.45, 32.65);
    await holdE(page, 5.3);
    await expect.poll(async () => (await chapter(page)).flags).toContain('hatch-unfastened');
    await openDoor(page, 'nw:door:gb-r03-hatch', 26, 32, 0.6);
    await shot(page, '08-hatch-open');
  });

  test('the original game and the R02 greybox still boot unchanged', async ({ page }) => {
    await page.goto('/?test=1&level=greybox');
    await page.waitForFunction(() => (window as unknown as Partial<W>).nightWardTest?.snapshot().state === 'ready', null, { timeout: 120_000 });
    expect(await page.evaluate(() => (window as unknown as W).nightWardGreybox.r03)).toBeNull();
    expect(await page.evaluate(() => (window as unknown as W).nightWardTest.snapshot().worldId)).toBe('nw:world:greybox');
    await page.goto('/?test=1');
    await page.waitForFunction(() => (window as unknown as Partial<W>).nightWardTest?.snapshot().state === 'ready', null, { timeout: 120_000 });
    expect(await page.evaluate(() => (window as unknown as W).nightWardTest.snapshot().worldId)).toBe('nw:hospital:ward-4-west');
  });
});
