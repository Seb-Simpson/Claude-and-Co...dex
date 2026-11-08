import { expect, type Page, test } from '@playwright/test';

/**
 * NW-002C animated Blender entities in real (software) WebGL, in hospital lighting.
 * Uses the dev preview's showcase (stand-in nodes in NW-001B's binding format) and the horror
 * module's dev-only `__nwHorrorDebug` probe.
 */
type Preview = {
  ready: boolean;
  showcase(entries: unknown[]): void;
  setCamera(x: number, y: number, z: number, yaw: number, pitch: number): void;
  emit(type: string, payload: unknown): void;
  info(): { calls: number; triangles: number; geometries: number };
};
type EntityProbe = { id: string; type: string; state: string; model: boolean; node: [number, number, number]; speed: number; lowest: number };
type Debug = { modelFailures: Record<string, string> | null; procedural: boolean; entities(): EntityProbe[]; reflection(): { visible: boolean; opacity: number } };

const w = (page: Page) => ({
  preview: <T>(fn: (p: Preview) => T) => page.evaluate(`(${fn.toString()})(window.__nwPreview)`) as Promise<T>,
  debug: <T>(fn: (d: Debug) => T) => page.evaluate(`(${fn.toString()})(window.__nwHorrorDebug)`) as Promise<T>,
});

async function boot(page: Page, query: string, errors: string[]): Promise<void> {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`/src/world/dev/preview.html?hud=0&view=lineup&showcase=lineup${query}`);
  await page.waitForFunction(() => {
    const win = window as unknown as { __nwPreview?: Preview; __nwHorrorDebug?: unknown };
    return win.__nwPreview?.ready === true && win.__nwHorrorDebug !== undefined;
  }, null, { timeout: 90_000 });
  await page.waitForTimeout(1500);
}

test('loads every GLB, animates it in hospital light and keeps feet on the floor', async ({ page }, testInfo) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  await boot(page, '', errors);
  const { preview, debug } = w(page);
  expect(await debug((d) => d.modelFailures)).toEqual({});
  const lineup = await debug((d) => d.entities());
  expect(lineup.map((e) => e.type).sort()).toEqual(['crawler', 'nurse', 'patient', 'watcher']);
  for (const e of lineup) {
    expect(e.model, e.id).toBe(true);
    expect(e.lowest - e.node[1], `${e.id} floor contact`).toBeGreaterThan(-0.05);
    expect(e.lowest - e.node[1], `${e.id} floor contact`).toBeLessThan(0.06);
  }
  await page.screenshot({ path: testInfo.outputPath('models-lineup.png') });
  const info = await preview((p) => p.info());
  testInfo.annotations.push({ type: 'render', description: JSON.stringify(info) });
  expect(info.calls).toBeLessThan(600);

  // Stalk, then the gameplay node switches to pursuit: alert snap, then the sprint.
  await preview((p) => p.showcase([{ id: 'patient', type: 'patient', x: -8.6, z: 0.3, yaw: -Math.PI / 2, behaviour: 'patrol', dx: 1, dz: 0, speed: 0.75, range: 2.5 }]));
  // Software WebGL in CI renders roughly one frame a second, so wait on states, not wall time.
  await page.waitForFunction(() => (window as unknown as { __nwHorrorDebug: Debug }).__nwHorrorDebug.entities()[0]?.state === 'walk', null, { timeout: 60_000 });
  await page.screenshot({ path: testInfo.outputPath('patient-stalk.png') });
  await preview((p) => p.showcase([{ id: 'patient', type: 'patient', x: -8.6, z: 0.3, yaw: -Math.PI / 2, behaviour: 'pursue', dx: 1, dz: 0, speed: 4, range: 3 }]));
  await page.waitForFunction(() => (window as unknown as { __nwHorrorDebug: Debug }).__nwHorrorDebug.entities()[0]?.state === 'run', null, { timeout: 90_000 });
  const running = (await debug((d) => d.entities()))[0]!;
  expect(running.lowest - running.node[1]).toBeGreaterThan(-0.05);
  expect(running.lowest - running.node[1]).toBeLessThan(0.08);
  await page.screenshot({ path: testInfo.outputPath('patient-pursuit.png') });

  // Frame time with all four animated models in view (software WebGL, so only a loose bound).
  await preview((p) => p.showcase([
    { id: 'patient', type: 'patient', x: -8.6, z: 0.55, yaw: -Math.PI / 2, behaviour: 'patrol', dx: 0, dz: 1, speed: 0.75, range: 1 },
    { id: 'nurse', type: 'nurse', x: -7.2, z: -0.65, yaw: -Math.PI / 2, behaviour: 'search' },
    { id: 'crawler', type: 'crawler', x: -5.9, z: 0.45, yaw: -Math.PI / 2 - 0.3, behaviour: 'patrol', dx: 0, dz: 1, speed: 0.6, range: 1 },
    { id: 'watcher', type: 'watcher', x: -10.6, z: -0.5, yaw: -Math.PI / 2, behaviour: 'idle' },
  ]));
  await page.waitForTimeout(1000);
  const frameMs = await page.evaluate(() => new Promise<number>((resolve) => {
    let n = 0; const start = performance.now();
    const tick = () => { if (++n === 6) resolve((performance.now() - start) / 6); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }));
  testInfo.annotations.push({ type: 'frame-ms', description: frameMs.toFixed(1) });
  await page.screenshot({ path: testInfo.outputPath('models-moving.png') });

  // The Reflection: a 3D figure clipped to the treatment-room mirror.
  await preview((p) => {
    p.showcase([]);
    // Glancing at the treatment-room mirror (staring straight into it makes the figure vanish).
    p.setCamera(5.0, 1.62, -3.3, -1.75, 0.0);
    p.emit('horror:reflection', { id: 'r1', anchorId: 'any', visible: true, durationSeconds: 6 });
  });
  await page.waitForFunction(() => (window as unknown as { __nwHorrorDebug: Debug }).__nwHorrorDebug.reflection().opacity > 0.6, null, { timeout: 90_000 });
  await page.screenshot({ path: testInfo.outputPath('reflection-model.png') });
  expect(errors).toEqual([]);
});

test('falls back to the procedural bodies when a model fails to load', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.route('**/nurse*.glb*', (route) => route.abort());
  const errors: string[] = [];
  await boot(page, '', errors);
  const { debug } = w(page);
  const failures = await debug((d) => d.modelFailures);
  expect(Object.keys(failures ?? {})).toEqual(['nurse']);
  const byType = Object.fromEntries((await debug((d) => d.entities())).map((e) => [e.type, e.model]));
  expect(byType).toEqual({ patient: true, nurse: false, crawler: true, watcher: true });
  await page.screenshot({ path: testInfo.outputPath('fallback-nurse.png') });
  // Only the failed fetch itself may log.
  expect(errors.filter((e) => !/nurse|Failed to load resource|net::ERR/.test(e))).toEqual([]);
});

test('?nwEntities=procedural keeps the development figures', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  await boot(page, '&nwEntities=procedural', errors);
  const { debug } = w(page);
  expect(await debug((d) => d.procedural)).toBe(true);
  expect((await debug((d) => d.entities())).every((e) => !e.model)).toBe(true);
  expect(errors).toEqual([]);
});
