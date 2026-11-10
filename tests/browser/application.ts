import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { ApplicationDiagnostics } from '../../src/integration/testing';
import type { Vec3 } from '../../src/contracts';

export type DiagnosticWindow = Window & { nightWardTest: ApplicationDiagnostics };

export async function snapshot(page: Page) {
  return page.evaluate(() => (window as DiagnosticWindow).nightWardTest.snapshot());
}

export async function bootHospital(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`${message.text()} (${message.location().url})`);
  });
  await page.goto('/?test=1');
  await page.waitForFunction(() => (window as Partial<DiagnosticWindow>).nightWardTest?.snapshot().state === 'ready', null, { timeout: 60_000 });
  const initialFrame = (await snapshot(page)).frameCount;
  await expect.poll(async () => (await snapshot(page)).frameCount, { timeout: 30_000 }).toBeGreaterThan(initialFrame + 1);
  await expect.poll(async () => (await snapshot(page)).renderer.triangles, { timeout: 30_000 }).toBeGreaterThan(0);
  const ready = await snapshot(page);
  expect(ready.worldId).toBe('nw:hospital:ward-4-west');
  expect(ready.colliderCount).toBeGreaterThanOrEqual(220);
  expect(ready.entities.map(entity => entity.type)).toEqual(ready.opening ? [] : ['patient']);
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator(ready.opening ? '[data-night-ward-opening-ui]' : '[data-night-ward-hud]')).toHaveCount(1);
  return errors;
}

export async function enterWard(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Enter ward', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS');
  await expect.poll(async () => (await snapshot(page)).state).toBe('playing');
  await expect.poll(async () => (await snapshot(page)).audioState).toBe('running');
}

export async function positionPlayer(page: Page, position: Vec3, lookAt?: Vec3): Promise<void> {
  const moved = await page.evaluate(({ point, target }) => {
    const diagnostics = (window as DiagnosticWindow).nightWardTest;
    const valid = diagnostics.teleport(point);
    if (valid && target) diagnostics.aimAt(target);
    return valid;
  }, { point: position, target: lookAt });
  expect(moved, `Supported, unoccupied player position ${JSON.stringify(position)}`).toBe(true);
}
