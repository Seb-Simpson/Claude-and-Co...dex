import { expect, type Page, test } from '@playwright/test';

/**
 * NW-002C in the real playable game (`/`), not the dev showcase: NW-001B's gameplay spawns the
 * active entities and publishes their nodes, and the horror module dresses them in the Blender models.
 * NW-002A intentionally enables only The Patient; the all-four showcase remains covered by
 * nw-002c-models.spec.ts while secondary encounter logic stays a separate task.
 * Uses the horror module's dev-only `__nwHorrorDebug` probe (absent from production builds).
 */
type Probe = {
  modelFailures: Record<string, string> | null;
  procedural: boolean;
  entities(): { type: string; behaviour: string; state: string; model: boolean; node: [number, number, number]; lowest: number }[];
};
const probe = <T>(page: Page, fn: (d: Probe) => T) => page.evaluate(`(${fn.toString()})(window.__nwHorrorDebug)`) as Promise<T>;

async function enterWard(page: Page, query = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`/${query}`);
  await expect(page.locator('#status')).toContainText('modules ready', { timeout: 120_000 });
  await page.waitForFunction(() => (window as unknown as { __nwHorrorDebug?: unknown }).__nwHorrorDebug !== undefined, null, { timeout: 30_000 });
  const enter = page.getByRole('button', { name: 'Enter ward', exact: true });
  if (await enter.isVisible().catch(() => false)) await enter.click();
  return errors;
}

test('the playable game loads all five assets and dresses the active Patient in its Blender model', async ({ page }, testInfo) => {
  test.setTimeout(420_000);
  const glbs: string[] = [];
  // Entity models only (the world also loads the Room 104 set GLB).
  page.on('response', (response) => { if (/\/(patient|nurse|crawler|watcher|reflection)(-[\w-]+)?\.glb(\?|$)/.test(response.url())) glbs.push(`${response.status()} ${response.url().split('/').pop()}`); });
  const errors = await enterWard(page);
  expect(glbs.sort()).toEqual(['200 crawler.glb', '200 nurse.glb', '200 patient.glb', '200 reflection.glb', '200 watcher.glb']);
  expect(await probe(page, (d) => d.modelFailures)).toEqual({});
  const spawned = await probe(page, (d) => d.entities());
  expect(spawned.map((e) => e.type)).toEqual(['patient']);
  for (const e of spawned) {
    expect(e.model, `${e.type} uses its Blender model`).toBe(true);
    expect(Math.abs(e.lowest - e.node[1]), `${e.type} stands on the floor`).toBeLessThan(0.06);
  }
  await page.screenshot({ path: testInfo.outputPath('real-game-start.png') });

  // The Patient must leave its spawn in the maintenance passage (NW-002A's door-aware navigation
  // routes it through the closed service doors) and keep its animated model while it patrols.
  const spawn = spawned.find((e) => e.type === 'patient')!.node;
  await page.waitForFunction((from) => {
    const p = (window as unknown as { __nwHorrorDebug: Probe }).__nwHorrorDebug.entities().find((e) => e.type === 'patient');
    return !!p && Math.hypot(p.node[0] - from[0], p.node[2] - from[2]) > 1.5;
  }, spawn, { timeout: 300_000, polling: 1000 });
  const patient = (await probe(page, (d) => d.entities())).find((e) => e.type === 'patient')!;
  expect(patient.behaviour).toBe('patrol');
  expect(patient.model).toBe(true);
  expect(errors).toEqual([]);
});

test('?nwEntities=procedural keeps the development bodies in the playable game', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await enterWard(page, '?nwEntities=procedural');
  expect(await probe(page, (d) => d.procedural)).toBe(true);
  const spawned = await probe(page, (d) => d.entities());
  expect(spawned.map((e) => e.type)).toEqual(['patient']);
  expect(spawned.every((e) => !e.model)).toBe(true);
  expect(errors).toEqual([]);
});
