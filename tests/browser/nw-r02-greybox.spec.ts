/**
 * NW-R02 — Chapter 1 greybox walkthrough in the running game (`?level=greybox`).
 *
 * An autopilot walks steps 1–15 from Room 104 to the far side of the office barricade with real
 * input (W to walk, C to crouch, E to open doors and use the temporary progression controls),
 * steering by aiming the camera at the next route point. The player is never teleported during the
 * measured run. Measurements come from the greybox telemetry; screenshots are taken in a second,
 * separate pass (checkpoint teleports), so they never pollute the timings.
 *
 * Writes docs/nw-r02/measurements.json and docs/nw-r02/screenshots/*.png when NW_R02_EVIDENCE=1.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { CONNECTIONS, FEATURES, ZONES } from '../../src/world/greybox/level';
import type { GreyboxApi } from '../../src/world/greybox/greyboxModule';
import type { DiagnosticWindow } from './application';

const exe = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
test.use({ launchOptions: { ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

interface RoutePoint { x: number; z: number; crouch: boolean; open?: string[]; door?: string }
interface RouteLeg { step: number; scene: string; label: string; points: RoutePoint[]; length: number; control?: { id: string; interactableId: string; x: number; z: number; sets: string } }
const route = JSON.parse(readFileSync('tests/browser/greybox-route.json', 'utf8')) as { totalLength: number; legs: RouteLeg[] };
const EVIDENCE = process.env.NW_R02_EVIDENCE === '1';
const OUT = 'docs/nw-r02';
type GreyboxWindow = DiagnosticWindow & { nightWardGreybox: GreyboxApi; __gbWalk?: (x: number, z: number, tolerance: number) => Promise<{ ok: boolean; reason?: string; x: number; z: number }> };

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?test=1&level=greybox');
  await page.waitForFunction(() => (window as unknown as Partial<GreyboxWindow>).nightWardTest?.snapshot().state === 'ready', null, { timeout: 120_000 });
  await page.waitForFunction(() => Boolean((window as unknown as Partial<GreyboxWindow>).nightWardGreybox), null, { timeout: 10_000 });
  await page.getByRole('button', { name: 'Enter ward', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS');
  await expect.poll(() => page.evaluate(() => (window as unknown as GreyboxWindow).nightWardTest.snapshot().state)).toBe('playing');
  // Install the in-page autopilot: steer at the target every frame, hold W, crouch where the ceiling is low.
  await page.evaluate(() => {
    const w = window as unknown as GreyboxWindow;
    const key = (type: 'keydown' | 'keyup', code: string) => document.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    const low = (x: number, z: number) => (w.nightWardGreybox.build.layout.spaceAt(x, z)?.ceiling ?? 9) < 1.85;
    w.__gbWalk = (tx, tz, tolerance) => new Promise((resolve) => {
      let lastProgress = performance.now();
      let best = Infinity;
      let forward = false;
      const sim0 = w.nightWardTest.snapshot().performance.simulatedSeconds;
      const tick = () => {
        const snap = w.nightWardTest.snapshot();
        const p = snap.player!.position;
        const dx = tx - p.x, dz = tz - p.z;
        const dist = Math.hypot(dx, dz);
        const ux = dist > 0 ? dx / dist : 0, uz = dist > 0 ? dz / dist : 0;
        const wantCrouch = low(p.x, p.z) || low(p.x + ux * Math.min(1.1, dist + 0.6), p.z + uz * Math.min(1.1, dist + 0.6)) || low(tx, tz);
        if (wantCrouch !== snap.player!.crouching) { key('keydown', 'KeyC'); key('keyup', 'KeyC'); }
        const crouched = snap.player!.crouching;
        const finish = (ok: boolean, reason?: string) => { if (forward) key('keyup', 'KeyW'); resolve({ ok, ...(reason ? { reason } : {}), x: p.x, z: p.z }); };
        if (dist <= tolerance) { finish(true); return; }
        w.nightWardTest.aimAt({ x: tx, y: (crouched ? 0.9 : 1.65), z: tz });
        // Wait for the crouch transition before entering a low space.
        const blockedByStance = wantCrouch && !crouched;
        if (!blockedByStance && !forward) { key('keydown', 'KeyW'); forward = true; }
        if (blockedByStance && forward) { key('keyup', 'KeyW'); forward = false; }
        if (dist < best - 0.05) { best = dist; lastProgress = performance.now(); }
        const simElapsed = w.nightWardTest.snapshot().performance.simulatedSeconds - sim0;
        if (performance.now() - lastProgress > 8000 && simElapsed > 3) { finish(false, `stuck ${dist.toFixed(2)} m from target`); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  });
  return errors;
}

async function pressE(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', bubbles: true }));
  });
}

function leafCentres(connectionId: string): { id: string; x: number; z: number }[] {
  const c = CONNECTIONS.find((x) => x.id === connectionId)!;
  const along = c.door?.double ? [[`nw:door:gb-${c.id}-a`, -c.width / 4], [`nw:door:gb-${c.id}-b`, c.width / 4]] as const : [[`nw:door:gb-${c.id}`, 0]] as const;
  return along.map(([id, off]) => (c.axis === 'z' ? { id, x: c.at, z: c.center + off } : { id, x: c.center + off, z: c.at }));
}

async function openDoor(page: Page, connectionId: string): Promise<void> {
  for (const leaf of leafCentres(connectionId)) {
    const state = () => page.evaluate((id) => (window as unknown as GreyboxWindow).nightWardGreybox.doorState(id), leaf.id);
    if (['open', 'opening'].includes((await state()) ?? '')) continue;
    await page.evaluate((target) => (window as unknown as GreyboxWindow).nightWardTest.aimAt(target), { x: leaf.x, y: 1.2, z: leaf.z });
    await page.waitForTimeout(150);
    await pressE(page);
    await expect.poll(state, { timeout: 10_000, message: `door ${leaf.id} opens` }).toBe('open');
  }
}

async function useControl(page: Page, control: NonNullable<RouteLeg['control']>): Promise<void> {
  await page.evaluate((target) => (window as unknown as GreyboxWindow).nightWardTest.aimAt(target), { x: control.x, y: 1.2, z: control.z });
  await page.waitForTimeout(150);
  await pressE(page);
  await expect.poll(() => page.evaluate((flag) => (window as unknown as GreyboxWindow).nightWardGreybox.progress.has(flag), control.sets), { timeout: 10_000, message: `control ${control.id}` }).toBe(true);
}

test.describe('NW-R02 Chapter 1 greybox', () => {
  test('autopilot walks steps 1–15 with real input and records traversal measurements', async ({ page }) => {
    test.setTimeout(40 * 60_000);
    const errors = await boot(page);
    await page.evaluate(() => (window as unknown as GreyboxWindow).nightWardGreybox.resetTelemetry());
    const sim0 = await page.evaluate(() => (window as unknown as GreyboxWindow).nightWardTest.snapshot().performance.simulatedSeconds);
    const wall0 = Date.now();
    const legs: unknown[] = [];
    for (const leg of route.legs) {
      const before = await page.evaluate(() => (window as unknown as GreyboxWindow).nightWardGreybox.telemetry());
      for (const point of leg.points) {
        if (point.open && point.door) {
          const result = await page.evaluate(({ x, z }) => (window as unknown as GreyboxWindow).__gbWalk!(x, z, 0.3), point);
          expect(result.ok, `step ${leg.step}: reach door ${point.door} (${result.reason ?? ''} at ${result.x.toFixed(2)},${result.z.toFixed(2)})`).toBe(true);
          await openDoor(page, point.door);
        } else {
          const result = await page.evaluate(({ x, z }) => (window as unknown as GreyboxWindow).__gbWalk!(x, z, 0.35), point);
          expect(result.ok, `step ${leg.step}: reach ${point.x.toFixed(2)},${point.z.toFixed(2)} (${result.reason ?? ''} at ${result.x.toFixed(2)},${result.z.toFixed(2)})`).toBe(true);
        }
      }
      if (leg.control) await useControl(page, leg.control);
      const after = await page.evaluate(() => (window as unknown as GreyboxWindow).nightWardGreybox.telemetry());
      legs.push({
        step: leg.step, scene: leg.scene, label: leg.label, routeLength: Math.round(leg.length * 10) / 10,
        distance: Math.round((after.distance - before.distance) * 10) / 10,
        seconds: Math.round((after.totalSeconds - before.totalSeconds) * 10) / 10,
        movingSeconds: Math.round((after.movingSeconds - before.movingSeconds) * 10) / 10,
        controlSeconds: Math.round((after.controlSeconds - before.controlSeconds) * 10) / 10,
        crouchedSeconds: Math.round((after.crouchedSeconds - before.crouchedSeconds) * 10) / 10,
      });
    }
    const t = await page.evaluate(() => (window as unknown as GreyboxWindow).nightWardGreybox.telemetry());
    const sim = await page.evaluate(() => (window as unknown as GreyboxWindow).nightWardTest.snapshot().performance.simulatedSeconds);
    const flags = await page.evaluate(() => (window as unknown as GreyboxWindow).nightWardGreybox.progress.list());
    expect(t.steps.map((s) => s.step)).toEqual(route.legs.map((l) => l.step));
    expect(t.teleports).toBe(0);
    expect(t.currentSpace).toBe('NB1');
    expect(flags).toEqual(expect.arrayContaining(['route-stores', 'route-plant2', 'shaw-keys', 'valve-open', 'bulkhead-cranked', 'chapter-end']));
    expect(errors).toEqual([]);
    // Telemetry integrates the same fixed steps the simulation runs.
    expect(Math.abs(t.totalSeconds - (sim - sim0))).toBeLessThan(1);
    const zones = Object.fromEntries(ZONES.map((z) => [z.id, { seconds: Math.round((t.zoneSeconds[z.id] ?? 0) * 10) / 10, distance: Math.round((t.zoneDistance[z.id] ?? 0) * 10) / 10 }]));
    const futureControls = FEATURES.filter((f) => f.kind === 'control' && route.legs.some((l) => l.control?.id === f.id))
      .map((f) => (f.kind === 'control' ? { id: f.id, sets: f.sets, futureSeconds: f.futureSeconds ?? null, note: f.futureNote ?? null } : null));
    const measurements = {
      generated: new Date().toISOString().slice(0, 10),
      method: 'Autopilot in the running game (Chromium, SwiftShader), real input, walk speed 2.4 m/s, crouch 1.1 m/s; no teleports; no artificial waiting.',
      routeLength: route.totalLength,
      measured: {
        totalSeconds: Math.round(t.totalSeconds * 10) / 10, movingSeconds: Math.round(t.movingSeconds * 10) / 10,
        idleSeconds: Math.round(t.idleSeconds * 10) / 10, controlSeconds: Math.round(t.controlSeconds * 10) / 10,
        exploringSeconds: Math.round(t.exploringSeconds * 10) / 10, crouchedSeconds: Math.round(t.crouchedSeconds * 10) / 10,
        distance: Math.round(t.distance * 10) / 10, crouchedDistance: Math.round(t.crouchedDistance * 10) / 10,
        simulatedSeconds: Math.round((sim - sim0) * 10) / 10, wallClockSeconds: Math.round((Date.now() - wall0) / 100) / 10,
      },
      legs, zones, visited: t.visited, flags, futureControls,
    };
    if (EVIDENCE) { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/measurements.json`, `${JSON.stringify(measurements, null, 1)}\n`); }
    test.info().annotations.push({ type: 'measurements', description: JSON.stringify(measurements.measured) });
  });

  test('screenshots from the running greybox at each checkpoint and encounter space', async ({ page }) => {
    test.setTimeout(10 * 60_000);
    const errors = await boot(page);
    const shots: [string, string, { x: number; z: number; yaw?: number; look: { x: number; y: number; z: number }; flags?: string[]; walk?: { x: number; z: number }[] }][] = [
      ['01-room104', 'S01 Room 104 (start): bed, door to the west corridor', { x: -35.2, z: 5.6, look: { x: -33.2, y: 1.3, z: 1.2 } }],
      ['02-west-corridor-e1', 'S03 West corridor (E1 Lights Out route) toward the lobby', { x: -36.5, z: 0, look: { x: -6, y: 1.5, z: 0 } }],
      ['03-lobby', 'S04 Lobby: office door north, F1 east, payphone', { x: -4.5, z: 3.5, look: { x: 0, y: 1.4, z: -5 } }],
      ['04-office-north-door', 'S05 Nurse’s Office: the barricaded north door', { x: 0.6, z: -6.0, look: { x: 0, y: 1.4, z: -10 } }],
      ['05-south-corridor', 'S06 South corridor toward the stores turn', { x: 0, z: 6.5, look: { x: 0, y: 1.5, z: 31 } }],
      ['06-main-store', 'S08 E2 main store: rack loop, cages, porters’ doorway', { x: 9.2, z: 31.2, look: { x: 20, y: 1.3, z: 31 } }],
      ['07-porters-hatch', 'S08 Porters’ room: the crawlway hatch', { x: 23.8, z: 32, look: { x: 26, y: 0.6, z: 32 } }],
      ['08-crawlway', 'S09 Crawlway (crouched), V1 split', { x: 25.3, z: 32, look: { x: 27.5, y: 0.8, z: 28.5 }, walk: [{ x: 26.6, z: 32 }, { x: 27.5, z: 32 }, { x: 27.5, z: 33.6 }] }],
      ['09-es2-exit', 'S09 ES2: crawlway exit grille', { x: 38.5, z: 24.4, look: { x: 35, y: 0.6, z: 23 } }],
      ['10-loop-west', 'S11 Loop west corridor: office observation window and patient doors', { x: 16.2, z: 12.5, look: { x: 16.2, y: 1.5, z: -10 } }],
      ['11-loop-office', 'S11 Loop office: desk, key placeholder, windows to both sides', { x: 19.2, z: -2.2, look: { x: 26.6, y: 1.4, z: -1 } }],
      ['12-plant2', 'S12 Plant 2 interior', { x: 41.5, z: -27.2, look: { x: 38, y: 1.2, z: -34 }, flags: ['shaw-keys'] }],
      ['13-cable-tunnel', 'S12 M2 cable tunnel (1.4 m, forced crouch)', { x: 30.5, z: -43.2, look: { x: 23, y: 0.8, z: -43.2 }, flags: ['shaw-keys'] }],
      ['14-pump-chamber', 'S12 M3 pump chamber: pump cover, alcove locker, valve', { x: 22, z: -40, look: { x: 17, y: 1.0, z: -45 }, flags: ['shaw-keys'] }],
      ['15-bulkhead', 'S13 M5 bulkhead and crank', { x: 7, z: -43, look: { x: 2, y: 1.2, z: -43 }, flags: ['shaw-keys', 'valve-open'] }],
      ['16-chase-run', 'S14 M6 pipe run (chase, single line)', { x: 1.5, z: -43, look: { x: -5, y: 1.4, z: -43 }, flags: ['shaw-keys', 'valve-open', 'bulkhead-cranked'] }],
      ['17-old-north-corridor', 'S14 Old north corridor toward the NT doors', { x: -34.5, z: -31.2, look: { x: -16, y: 1.4, z: -31.2 }, flags: ['shaw-keys', 'valve-open', 'bulkhead-cranked'] }],
      ['18-north-wing', 'S15 North Wing: corridor, reception, Chapter 2 doors', { x: -14, z: -31.2, look: { x: 0, y: 1.4, z: -31 }, flags: ['shaw-keys', 'valve-open', 'bulkhead-cranked'] }],
      ['19-barricade', 'S15 Far side of the barricade (chapter end)', { x: 0, z: -14, look: { x: 0, y: 1.0, z: -10 }, flags: ['shaw-keys', 'valve-open', 'bulkhead-cranked'] }],
    ];
    if (EVIDENCE) mkdirSync(`${OUT}/screenshots`, { recursive: true });
    for (const [name, , spec] of shots) {
      const moved = await page.evaluate(({ s }) => {
        const w = window as unknown as GreyboxWindow;
        for (const flag of s.flags ?? []) w.nightWardGreybox.progress.set(flag);
        const ok = w.nightWardTest.teleport({ x: s.x, y: 0, z: s.z });
        if (ok) w.nightWardTest.aimAt(s.look);
        return ok;
      }, { s: spec });
      expect(moved, name).toBe(true);
      for (const point of spec.walk ?? []) {
        const result = await page.evaluate(({ x, z }) => (window as unknown as GreyboxWindow).__gbWalk!(x, z, 0.25), point);
        expect(result.ok, `${name}: walk in`).toBe(true);
      }
      await page.waitForTimeout(400);
      await page.evaluate((look) => (window as unknown as GreyboxWindow).nightWardTest.aimAt(look), spec.look);
      await page.waitForTimeout(100);
      if (EVIDENCE) await page.screenshot({ path: `${OUT}/screenshots/${name}.png` });
    }
    // Collider overlay and the developer map (drawn from the built layout).
    await page.evaluate(() => { const w = window as unknown as GreyboxWindow; w.nightWardTest.teleport({ x: 16.2, y: 0, z: 13.5 }); w.nightWardTest.aimAt({ x: 22, y: 1.2, z: 0 }); w.nightWardGreybox.toggleColliders(true); });
    await page.waitForTimeout(300);
    if (EVIDENCE) await page.screenshot({ path: `${OUT}/screenshots/20-collider-overlay-loop.png` });
    await page.evaluate(() => { const w = window as unknown as GreyboxWindow; w.nightWardGreybox.toggleColliders(false); w.nightWardGreybox.toggleMap(true); });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.waitForTimeout(400);
    if (EVIDENCE) await page.screenshot({ path: `${OUT}/screenshots/00-developer-map.png` });
    expect(errors).toEqual([]);
  });
});
