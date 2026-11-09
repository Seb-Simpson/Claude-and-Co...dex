import { expect as baseExpect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { bootHospital, enterWard, positionPlayer, snapshot } from './application';
import type { DiagnosticWindow } from './application';

// Software WebGL is deliberately used in CI; simulation time remains capped.
const expect = baseExpect.configure({ timeout: 30_000 });
test.describe.configure({ timeout: 180_000 });
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus || page.isClosed()) return;
  try { await testInfo.attach('application-at-failure', { body: JSON.stringify(await snapshot(page), null, 2), contentType: 'application/json' }); }
  catch { /* A renderer teardown or crashed browser can make diagnostics unavailable. */ }
});
test.use({ viewport: { width: 800, height: 450 } });

async function walkUntil(page: Page, key: string, condition: () => Promise<boolean>): Promise<void> {
  await page.keyboard.down(key);
  try { await expect.poll(condition, { timeout: 20_000, intervals: [100, 200] }).toBe(true); }
  finally { await page.keyboard.up(key); }
}

async function aimAt(page: Page, point: { x: number; y: number; z: number }): Promise<void> {
  await page.evaluate(target => (window as DiagnosticWindow).nightWardTest.aimAt(target), point);
}

test('wake in room 104, walk into the real corridor, collide with a door, and open a route', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors = await bootHospital(page);
  const spawn = (await snapshot(page)).player!;
  expect(spawn.position.x).toBeCloseTo(-12.4, 1);
  expect(spawn.position.z).toBeCloseTo(4.1, 1);
  expect(spawn.captured).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('nw002a-room104-wakeup.png') });
  await enterWard(page);
  await expect.poll(async () => (await snapshot(page)).player!.grounded).toBe(true);
  await page.keyboard.down('Control');
  await expect.poll(async () => (await snapshot(page)).player!.crouching).toBe(true);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await snapshot(page)).player!.crouching).toBe(false);
  await page.keyboard.press('c');
  await expect.poll(async () => (await snapshot(page)).player!.crouching).toBe(true);
  await page.keyboard.press('c');
  await expect.poll(async () => (await snapshot(page)).player!.crouching).toBe(false);

  // This route uses real input from the authored spawn; no positioning hook is used.
  await walkUntil(page, 'd', async () => (await snapshot(page)).player!.position.x > -12.2);
  await page.keyboard.down('w');
  await expect.poll(async () => (await snapshot(page)).player!.velocity.z).toBeLessThan(-2.2);
  await page.keyboard.down('Shift');
  await expect.poll(async () => (await snapshot(page)).player!.velocity.z).toBeLessThan(-4);
  await expect.poll(async () => (await snapshot(page)).player!.position.z, { timeout: 20_000 }).toBeLessThan(0.3);
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  const corridor = (await snapshot(page)).player!;
  expect(corridor.position.x).toBeGreaterThan(-12.4);
  expect(corridor.position.z).toBeGreaterThan(-1);
  expect(corridor.position.y).toBeGreaterThan(-0.05);
  const originalYaw = corridor.rotation.yaw;
  await page.mouse.move(710, 360);
  await expect.poll(async () => (await snapshot(page)).player!.rotation.yaw).not.toBe(originalYaw);
  await aimAt(page, { x: -12, y: 1.65, z: -3 });
  await page.keyboard.down('w');
  await expect.poll(async () => (await snapshot(page)).player!.position.z).toBeLessThan(-0.7);
  await page.waitForTimeout(500);
  await page.keyboard.up('w');
  const blocked = (await snapshot(page)).player!;
  expect(blocked.position.z).toBeGreaterThan(-1.2);
  expect((await snapshot(page)).doorStates['nw:door:room-103']).toBe('closed');
  await aimAt(page, { x: -12, y: 1.15, z: -1.475 });
  await expect(page.locator('.nw-prompt')).toContainText('Open door');
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).doorStates['nw:door:room-103']).toBe('open');
  await aimAt(page, { x: -12, y: 1.65, z: -4 });
  await walkUntil(page, 'w', async () => (await snapshot(page)).player!.position.z < -2.65);
  expect((await snapshot(page)).player!.position.y).toBeGreaterThan(-0.05);
  await page.screenshot({ path: testInfo.outputPath('nw002a-room103-door-route.png') });
  const measured = await snapshot(page);
  await testInfo.attach('combined-game-metrics', { body: JSON.stringify({ renderer: measured.renderer, performance: measured.performance, frameCount: measured.frameCount }, null, 2), contentType: 'application/json' });
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
  expect(errors).toEqual([]);
});

const hidingSpots = [
  { name: 'nurses-staff', type: 'locker', standing: { x: -5.625, y: 0.01, z: -4.15 }, target: { x: -6.425, y: 1.2, z: -4.15 } },
  { name: 'storage-a', type: 'locker', standing: { x: 12.175, y: 0.01, z: -3.55 }, target: { x: 11.375, y: 1.2, z: -3.55 } },
  { name: 'storage-b', type: 'locker', standing: { x: 12.175, y: 0.01, z: -4.2 }, target: { x: 11.375, y: 1.2, z: -4.2 } },
  { name: 'storage-c', type: 'locker', standing: { x: 12.175, y: 0.01, z: -4.85 }, target: { x: 11.375, y: 1.2, z: -4.85 } },
  { name: 'room-105-bed-b', type: 'bed', standing: { x: -7.85, y: 0.01, z: -3.75 }, target: { x: -7.85, y: 0.45, z: -5.35 } },
  { name: 'room-106-bed', type: 'bed', standing: { x: -9, y: 0.01, z: 4.15 }, target: { x: -10.1, y: 0.45, z: 5.15 } },
] as const;

test('all four real lockers and both invisible under-bed markers conceal and return the player safely', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const errors = await bootHospital(page);
  await enterWard(page);
  for (const spot of hidingSpots) {
    await positionPlayer(page, spot.standing, spot.target);
    await expect(page.locator('.nw-prompt'), spot.name).toContainText(spot.type === 'bed' ? 'Hide under bed' : 'Hide in locker');
    await page.keyboard.press('e');
    await expect.poll(async () => (await snapshot(page)).player!.hiding.state, { message: spot.name }).toBe('hidden');
    expect((await snapshot(page)).player!.hiding.spotId).toBe(`nw:hiding:${spot.name}`);
    const concealed = (await snapshot(page)).player!.position;
    await page.keyboard.down('w');
    await page.waitForTimeout(250);
    await page.keyboard.up('w');
    expect((await snapshot(page)).player!.position).toEqual(concealed);
    await page.screenshot({ path: testInfo.outputPath(`nw002a-hidden-${spot.name}.png`) });
    await page.keyboard.press('e');
    await expect.poll(async () => (await snapshot(page)).player!.hiding.state).toBe('outside');
    const exited = (await snapshot(page)).player!;
    expect(exited.position.y).toBeGreaterThan(-0.05);
    expect(exited.position.x).toBeCloseTo(spot.standing.x, 1);
    expect(exited.position.z).toBeCloseTo(spot.standing.z, 1);
    await page.keyboard.down('s');
    await expect.poll(async () => {
      const moved = (await snapshot(page)).player!.position;
      return Math.hypot(moved.x - exited.position.x, moved.z - exited.position.z);
    }).toBeGreaterThan(0.1);
    await page.keyboard.up('s');
  }
  expect(errors).toEqual([]);
});

test('an initially open hospital door closes at its authored hinge, blocks passage, and opens again', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors = await bootHospital(page);
  await enterWard(page);
  await positionPlayer(page, { x: -12.05, y: 0.01, z: 0.5 }, { x: -11.45, y: 1.4, z: 2.025 });
  await expect(page.locator('.nw-prompt')).toContainText('Close door');
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).doorStates['nw:door:room-104']).toBe('closed');
  await aimAt(page, { x: -12, y: 1.4, z: 1.475 });
  await page.keyboard.down('w');
  await expect.poll(async () => (await snapshot(page)).player!.position.z).toBeGreaterThan(0.95);
  await page.waitForTimeout(400);
  await page.keyboard.up('w');
  expect((await snapshot(page)).player!.position.z).toBeLessThan(1.2);
  await expect(page.locator('.nw-prompt')).toContainText('Open door');
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).doorStates['nw:door:room-104']).toBe('open');
  await aimAt(page, { x: -12.05, y: 1.65, z: 4 });
  await walkUntil(page, 'w', async () => (await snapshot(page)).player!.position.z > 2.4);
  await page.screenshot({ path: testInfo.outputPath('nw002a-door104-reopened.png') });
  expect(errors).toEqual([]);
});

test('real drawer and cabinet markers produce completed inspections through E', async ({ page }) => {
  const errors = await bootHospital(page);
  await enterWard(page);
  const targets = [
    { standing: { x: -4.7, y: 0.01, z: -4.8 }, target: { x: -4.7, y: 0.6, z: -5.72 }, type: 'drawer' },
    { standing: { x: -1.25, y: 0.01, z: -4.3 }, target: { x: -0.3, y: 1.35, z: -4.3 }, type: 'cabinet' },
    { standing: { x: 4.9, y: 0.01, z: -4.9 }, target: { x: 4.9, y: 1.35, z: -5.95 }, type: 'cabinet' },
  ];
  for (const target of targets) {
    await positionPlayer(page, target.standing, target.target);
    await expect.poll(async () => (await snapshot(page)).prompt?.available).toBe(true);
    const prompt = (await snapshot(page)).prompt!;
    expect(prompt.targetId).toContain(`nw:${target.type}:`);
    const before = (await snapshot(page)).events.filter(event => event.type === 'interaction:completed').length;
    await page.keyboard.press('e');
    await expect.poll(async () => (await snapshot(page)).events.filter(event => event.type === 'interaction:completed').length).toBeGreaterThan(before);
    const result = (await snapshot(page)).events.filter(event => event.type === 'interaction:completed').at(-1)!;
    expect(result.payload).toMatchObject({ targetId: prompt.targetId, outcome: 'completed', action: 'inspect' });
  }
  expect(errors).toEqual([]);
});

test('capture transitions to restart and recreates a clean session repeatedly', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  // Count active global/canvas input registrations across whole-session recreation.
  // Detached HUD nodes are checked separately below; the renderer canvas is reused.
  await page.addInitScript(() => {
    const listeners = new Map<EventTarget, Map<string, Map<EventListenerOrEventListenerObject, Set<boolean>>>>();
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    const tracked = (target: EventTarget): boolean => target === window || target === document || target instanceof HTMLCanvasElement;
    const capture = (options?: boolean | EventListenerOptions): boolean => typeof options === 'boolean' ? options : options?.capture ?? false;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (listener && tracked(this)) {
        let types = listeners.get(this);
        if (!types) { types = new Map(); listeners.set(this, types); }
        let callbacks = types.get(type);
        if (!callbacks) { callbacks = new Map(); types.set(type, callbacks); }
        let phases = callbacks.get(listener);
        if (!phases) { phases = new Set(); callbacks.set(listener, phases); }
        phases.add(capture(options));
      }
      add.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function(type, listener, options) {
      if (listener && tracked(this)) listeners.get(this)?.get(type)?.get(listener)?.delete(capture(options));
      remove.call(this, type, listener, options);
    };
    Object.assign(window, {
      nightWardListenerCount: () => [...listeners.values()].reduce((total, types) => total + [...types.values()].reduce((subtotal, callbacks) =>
        subtotal + [...callbacks.values()].reduce((count, phases) => count + phases.size, 0), 0), 0),
    });
  });
  const errors = await bootHospital(page);
  const spawn = (await snapshot(page)).player!.position;
  async function freshRenderedFrames(): Promise<void> {
    // Capture the counter after ready/positioning. Counting from before a click
    // can accidentally count frames from the old captured session.
    const current = (await snapshot(page)).frameCount;
    await expect.poll(async () => (await snapshot(page)).frameCount, { timeout: 30_000 }).toBeGreaterThan(current + 2);
  }
  async function prewarmPatient(): Promise<void> {
    expect((await snapshot(page)).state).toBe('ready');
    await freshRenderedFrames();
    await positionPlayer(page, { x: -1, y: 0.01, z: 7.2 }, { x: 6, y: 1.65, z: 7.2 });
    await freshRenderedFrames();
    const visible = await snapshot(page);
    await testInfo.attach(`session-${visible.sessionId}-visible-patient`, {
      body: JSON.stringify({ frameCount: visible.frameCount, state: visible.state, player: visible.player!.position,
        patient: visible.entities.find(entity => entity.type === 'patient'), renderer: visible.renderer,
        performance: visible.performance }, null, 2), contentType: 'application/json',
    });
    // Preserve one identical spawn-camera view for each resource comparison.
    await positionPlayer(page, spawn);
    await freshRenderedFrames();
  }
  await prewarmPatient();
  await enterWard(page);
  const initial = await snapshot(page);
  const initialListeners = await page.evaluate(() => (window as unknown as Window & { nightWardListenerCount(): number }).nightWardListenerCount());
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.evaluate(() => (window as DiagnosticWindow).nightWardTest.captureForTest());
    await expect.poll(async () => (await snapshot(page)).state).toBe('captured');
    await expect(page.getByRole('button', { name: /restart/i })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
    if (attempt === 1) await page.screenshot({ path: testInfo.outputPath('nw002a-captured.png') });
    await page.getByRole('button', { name: /restart/i }).click();
    await expect.poll(async () => (await snapshot(page)).sessionId, { timeout: 60_000 }).toBe(initial.sessionId + attempt);
    await expect.poll(async () => (await snapshot(page)).state).toBe('ready');
    // Render the actual model before testing GPU resource release on each reset.
    await prewarmPatient();
    const restarted = await snapshot(page);
    expect(restarted.player!.captured).toBe(false);
    expect(restarted.player!.hiding.state).toBe('outside');
    expect(restarted.player!.position.x).toBeCloseTo(-12.4, 1);
    expect(restarted.player!.position.z).toBeCloseTo(4.1, 1);
    expect(restarted.colliderCount).toBe(initial.colliderCount);
    expect(restarted.entities).toHaveLength(initial.entities.length);
    expect(restarted.renderer.geometries).toBeLessThanOrEqual(initial.renderer.geometries + 4);
    expect(restarted.renderer.textures).toBeLessThanOrEqual(initial.renderer.textures + 2);
    await testInfo.attach(`session-${attempt}-resources`, { body: JSON.stringify({ sessionId: restarted.sessionId, colliderCount: restarted.colliderCount, renderer: restarted.renderer, performance: restarted.performance }, null, 2), contentType: 'application/json' });
    await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.locator('[data-night-ward-hud]')).toHaveCount(1);
    await enterWard(page);
    const listenerCount = await page.evaluate(() => (window as unknown as Window & { nightWardListenerCount(): number }).nightWardListenerCount());
    expect(listenerCount).toBe(initialListeners);
    await testInfo.attach(`session-${attempt}-listeners`, { body: JSON.stringify({ baseline: initialListeners, current: listenerCount }, null, 2), contentType: 'application/json' });
  }
  await page.screenshot({ path: testInfo.outputPath('nw002a-restarted-room104.png') });
  await page.evaluate(() => (window as DiagnosticWindow).nightWardTest.dispose());
  const final = await snapshot(page);
  expect(final.state).toBe('disposed');
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('[data-night-ward-hud]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('The Patient sees the player, pursues physically, loses an occluded trail and searches its last observation', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const errors = await bootHospital(page);
  // Position only the initial test scenario. The actual hospital modules, perception,
  // navigation, event bus, lighting, and audio run unchanged in this browser page.
  await positionPlayer(page, { x: -1, y: 0.01, z: 7.2 }, { x: 6, y: 1.35, z: 7.2 });
  await enterWard(page);
  await page.screenshot({ path: testInfo.outputPath('nw002a-patient-introduction.png') });
  await page.waitForFunction(() => (window as DiagnosticWindow).nightWardTest.snapshot().events.some(event => event.type === 'chase:started'), null, { timeout: 30_000 });
  const chase = await snapshot(page);
  const patient = chase.entities.find(entity => entity.type === 'patient')!;
  expect(patient.state).toBe('pursue');
  expect(patient.position.x).toBeLessThan(6);
  expect(chase.events.some(event => event.type === 'atmosphere:lighting')).toBe(true);
  expect(chase.events.some(event => event.type === 'atmosphere:sound')).toBe(true);
  expect(chase.player!.captured).toBe(false);
  // A deterministic occlusion setup tests honest loss of information. The walked
  // room104→corridor route is verified separately; this is not a full escape run.
  await positionPlayer(page, { x: -12.4, y: 0.01, z: 4.1 }, { x: -12, y: 1.65, z: 0 });
  await expect.poll(async () => (await snapshot(page)).events.some(event =>
    event.type === 'chase:ended' && (event.payload as { reason?: string }).reason === 'escaped'), { timeout: 30_000 }).toBe(true);
  await expect.poll(async () => (await snapshot(page)).entities.find(entity => entity.type === 'patient')!.state, { timeout: 30_000 }).toBe('search');
  const escaped = await snapshot(page);
  expect(escaped.player!.captured).toBe(false);
  expect(escaped.entities.find(entity => entity.type === 'patient')!.lastKnownPlayer!.position.x).toBeGreaterThan(-3);
  expect(escaped.events.some(event => event.type === 'entity:state' && (event.payload as { current?: string }).current === 'lost-target')).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('nw002a-escaped-room104.png') });
  await testInfo.attach('real-chase-events', { body: JSON.stringify(escaped.events, null, 2), contentType: 'application/json' });
  expect(errors).toEqual([]);
});

test('a physical Patient approach captures after a response window and offers restart', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors = await bootHospital(page);
  await positionPlayer(page, { x: 4.7, y: 0.01, z: 7.2 }, { x: 6, y: 1.65, z: 7.2 });
  await enterWard(page);
  const first = await snapshot(page);
  expect(first.player!.captured).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('nw002a-patient-closeup.png') });
  expect((await snapshot(page)).player!.captured).toBe(false);
  await expect.poll(async () => (await snapshot(page)).state, { timeout: 30_000 }).toBe('captured');
  const captured = await snapshot(page);
  expect(captured.events.some(event => event.type === 'player:captured')).toBe(true);
  expect(captured.events.some(event => event.type === 'chase:ended' && (event.payload as { reason?: string }).reason === 'captured')).toBe(true);
  expect(captured.entities.find(entity => entity.type === 'patient')!.position.x).toBeLessThan(6);
  await expect(page.getByRole('button', { name: /restart/i })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('nw002a-patient-capture.png') });
  expect(errors).toEqual([]);
});

test('the player genuinely escapes The Patient by sprinting around the hospital corner and keeps exploring', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const errors = await bootHospital(page);
  // Prepare an available route with the real interaction before this encounter.
  // Positioning is limited to scenario setup; every escape step below uses WASD.
  await positionPlayer(page, { x: -5.7, y: 0.01, z: 4.8 }, { x: -5.7, y: 1.2, z: 6.475 });
  await enterWard(page);
  if ((await snapshot(page)).doorStates['nw:door:maintenance-west'] === 'open') {
    await aimAt(page, { x: -6.25, y: 1.2, z: 5.925 });
    await expect(page.locator('.nw-prompt')).toContainText('Close door');
    await page.keyboard.press('e');
    await expect.poll(async () => (await snapshot(page)).doorStates['nw:door:maintenance-west']).toBe('closed');
  }
  await aimAt(page, { x: -5.7, y: 1.2, z: 6.475 });
  await expect(page.locator('.nw-prompt')).toContainText('Open door');
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).doorStates['nw:door:maintenance-west']).toBe('open');
  await positionPlayer(page, { x: -1, y: 0.01, z: 7.2 }, { x: 6, y: 1.35, z: 7.2 });
  await page.screenshot({ path: testInfo.outputPath('nw002a-escape-patient-visible.png') });
  await aimAt(page, { x: -20, y: 1.65, z: 7.2 });

  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  let route: { phase: number; x: number; y: number; z: number; frame: number; patientState: string; movement: string }[];
  try {
    route = await page.evaluate(async () => {
      const diagnostics = (window as DiagnosticWindow).nightWardTest;
      const samples: { phase: number; x: number; y: number; z: number; frame: number; patientState: string; movement: string }[] = [];
      const deadline = performance.now() + 120_000;
      let phase = 0;
      let lastFrame = -1;
      while (phase < 3) {
        const current = diagnostics.snapshot();
        const player = current.player!;
        if (current.state !== 'playing' || player.captured) throw new Error(`Escape interrupted: ${current.state}`);
        if (current.frameCount !== lastFrame) {
          samples.push({ phase, ...player.position, frame: current.frameCount, patientState: current.entities[0]!.state, movement: player.movement });
          lastFrame = current.frameCount;
        }
        // Turn before the door frame so ordinary acceleration can carry the
        // capsule through the corner. Looking corrects the approach each frame.
        if (phase === 0 && player.position.x < -4.7) phase = 1;
        if (phase === 1 && player.position.z < 4) phase = 2;
        if (phase === 2 && player.position.z < 0.3) { phase = 3; break; }
        const target = phase === 0 ? { x: -20, y: 1.65, z: 7.2 }
          : phase === 1 ? { x: -5.55, y: 1.65, z: 3.7 }
          : { x: -5.7, y: 1.65, z: 0 };
        diagnostics.aimAt(target);
        if (performance.now() > deadline) throw new Error(`Escape movement stalled at ${JSON.stringify(player.position)}`);
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
      return samples;
    });
  } finally {
    await page.keyboard.up('w');
    await page.keyboard.up('Shift');
  }
  await expect.poll(async () => (await snapshot(page)).events.some(event => event.type === 'chase:started')).toBe(true);
  await expect.poll(async () => (await snapshot(page)).events.some(event =>
    event.type === 'chase:ended' && (event.payload as { reason?: string }).reason === 'escaped'), { timeout: 45_000 }).toBe(true);
  const escaped = await snapshot(page);
  expect(escaped.player!.captured).toBe(false);
  expect(escaped.player!.position.z).toBeLessThan(0.4);
  expect(escaped.player!.position.x).toBeCloseTo(-5.7, 0);
  expect(escaped.player!.position.y).toBeGreaterThan(-0.05);
  expect(route.some(point => point.patientState === 'pursue')).toBe(true);
  expect(route.every(point => point.y > -0.05)).toBe(true);
  expect(route.some(point => point.movement === 'sprinting')).toBe(true);
  await aimAt(page, { x: -9, y: 1.65, z: 0 });
  await walkUntil(page, 'w', async () => (await snapshot(page)).player!.position.x < -7.5);
  expect((await snapshot(page)).player!.captured).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('nw002a-genuine-escape-corridor.png') });
  const continued = await snapshot(page);
  await testInfo.attach('walked-escape-route', { body: JSON.stringify({ route, events: continued.events, performance: continued.performance, renderer: continued.renderer, frameCount: continued.frameCount }, null, 2), contentType: 'application/json' });
  expect(errors).toEqual([]);
});
