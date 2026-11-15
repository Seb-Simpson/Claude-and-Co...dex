/**
 * NW-R04A — Nurse Shaw first visual checkpoint, in the running game (`?preview=shaw`): the static
 * model inside the real ward (actual lighting, fog, fixtures) and in the neutral studio, through
 * fixed camera presets. Writes docs/nw-r04a/preview/ evidence when NW_R04A_EVIDENCE=1.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { ShawPreviewApi, ShawView } from '../../src/characters/shaw/preview';
import type { DiagnosticWindow } from './application';

const exe = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
test.use({ launchOptions: { ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

const EVIDENCE = process.env.NW_R04A_EVIDENCE === '1';
const OUT = 'docs/nw-r04a/preview';
type W = DiagnosticWindow & { nightWardShawPreview?: ShawPreviewApi };

test('the Shaw preview loads the static model into the real ward and renders every view', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?test=1&preview=shaw');
  await page.waitForFunction(() => (window as unknown as W).nightWardTest?.snapshot().state === 'ready', null, { timeout: 240_000 });
  await page.waitForFunction(() => Boolean((window as unknown as W).nightWardShawPreview), null, { timeout: 60_000 });
  await page.getByRole('button', { name: 'Enter ward', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as W).nightWardTest.snapshot().state), { timeout: 30_000 }).toBe('playing');

  const diagnostics = await page.evaluate(() => (window as unknown as W).nightWardShawPreview!.diagnostics());
  expect(diagnostics.error).toBeNull();
  expect(diagnostics.ready).toBe(true);
  expect(diagnostics.heightMetres).toBeGreaterThan(1.85);
  expect(diagnostics.heightMetres).toBeLessThan(1.95);
  // No AI in the preview: the gameplay nurse/patient are not spawned.
  expect(await page.evaluate(() => (window as unknown as W).nightWardTest.snapshot().entities.length)).toBe(0);

  if (EVIDENCE) mkdirSync(OUT, { recursive: true });
  const frames: Record<string, unknown>[] = [];
  const shoot = async (lighting: 'ward' | 'studio', view: ShawView) => {
    await page.evaluate(([l, v]) => { const p = (window as unknown as W).nightWardShawPreview!; p.setLighting(l as 'ward' | 'studio'); p.setView(v as ShawView); }, [lighting, view]);
    // Let the light rig reassign its point lights to the fixtures nearest the new camera.
    await page.waitForTimeout(1500);
    const snap = await page.evaluate(() => (window as unknown as W).nightWardTest.snapshot());
    frames.push({ lighting, view, calls: snap.renderer.calls, triangles: snap.renderer.triangles, frameDeltaMaxMs: snap.performance.frameDeltaMaxMs });
    if (EVIDENCE) await page.locator('canvas').first().screenshot({ path: `${OUT}/${lighting}-${view}.png` });
  };
  for (const view of ['front', 'front34', 'side', 'back34', 'back', 'face', 'head-side', 'head-back', 'hands', 'skirt-side'] as const) await shoot('studio', view);
  for (const view of ['front', 'front34', 'side', 'back34', 'back', 'face', 'head-side', 'head-back', 'hands', 'skirt-side', 'gameplay-near', 'gameplay'] as const) await shoot('ward', view);

  if (EVIDENCE) writeFileSync(`${OUT}/diagnostics.json`, `${JSON.stringify({ diagnostics, frames }, null, 2)}\n`);
  expect(errors).toEqual([]);
});
