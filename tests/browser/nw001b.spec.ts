import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { GameplayHarness } from '../gameplay/harness';

type HarnessWindow = Window & { nwTest: GameplayHarness };
async function start(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/tests/gameplay/harness.html');
  await page.waitForFunction(() => (window as HarnessWindow).nwTest?.ready);
  await page.getByRole('button', { name: 'Enter ward', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS');
  return errors;
}

test('actual pointer-lock controls move, sprint, crouch and collide with isolated walls', async ({ page }, testInfo) => {
  const errors = await start(page);
  await page.keyboard.down('w');
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).nwTest.getSnapshot().velocity.z)).toBeLessThan(-2.2);
  await page.keyboard.down('Shift');
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).nwTest.getSnapshot().velocity.z)).toBeLessThan(-4);
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).nwTest.getSnapshot().position.z), { timeout: 12_000 }).toBeLessThan(-2.5);
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  const blocked = await page.evaluate(() => (window as HarnessWindow).nwTest.getSnapshot().position.z);
  expect(blocked).toBeGreaterThan(-2.7);
  await page.keyboard.down('Control');
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).nwTest.getSnapshot().crouching)).toBe(true);
  await page.keyboard.up('Control');
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).nwTest.getSnapshot().crouching)).toBe(false);
  await page.keyboard.press('c');
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).nwTest.getSnapshot().crouching)).toBe(true);
  await page.keyboard.press('c');
  const yaw = await page.evaluate(() => (window as HarnessWindow).nwTest.getSnapshot().rotation.yaw);
  await page.mouse.move(700, 360);
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).nwTest.getSnapshot().rotation.yaw)).not.toBe(yaw);
  await page.screenshot({ path: testInfo.outputPath('nw001b-movement.png') });
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
  expect(errors).toEqual([]);
});

test('E opens and closes a raycast door and enters/exits a hiding spot safely', async ({ page }, testInfo) => {
  const errors = await start(page);
  await page.evaluate(() => {
    const test = (window as HarnessWindow).nwTest;
    test.moveTo({ x: 3, y: 0.003, z: 1.7 });
    test.aimAt({ x: 3, y: 1.65, z: 0 });
  });
  await expect(page.locator('.nw-prompt')).toContainText('Open door');
  await page.screenshot({ path: testInfo.outputPath('nw001b-door-prompt.png') });
  await page.keyboard.press('e');
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).nwTest.getDoorState())).toBe('open');
  await page.evaluate(() => {
    const test = (window as HarnessWindow).nwTest;
    test.moveTo({ x: 4.1, y: 0.003, z: -0.5 });
    test.aimAt({ x: 2.5, y: 1.2, z: -0.5 });
  });
  await expect(page.locator('.nw-prompt')).toContainText('Close door');
  await page.keyboard.press('e');
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).nwTest.getDoorState())).toBe('closed');
  await page.evaluate(() => {
    const test = (window as HarnessWindow).nwTest;
    test.moveTo({ x: -3, y: 0.003, z: 1 });
    test.aimAt({ x: -3, y: 1.65, z: -0.5 });
  });
  await expect(page.locator('.nw-prompt')).toContainText('Hide in locker');
  await page.keyboard.press('e');
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).nwTest.getSnapshot().hiding.state)).toBe('hidden');
  const concealed = await page.evaluate(() => (window as HarnessWindow).nwTest.getSnapshot().position);
  await page.keyboard.down('w');
  await page.waitForTimeout(250);
  await page.keyboard.up('w');
  expect(await page.evaluate(() => (window as HarnessWindow).nwTest.getSnapshot().position)).toEqual(concealed);
  await page.screenshot({ path: testInfo.outputPath('nw001b-hidden.png') });
  await page.keyboard.press('e');
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).nwTest.getSnapshot().hiding.state)).toBe('outside');
  const exited = await page.evaluate(() => (window as HarnessWindow).nwTest.getSnapshot().position);
  expect(exited.x).toBeCloseTo(-3, 1);
  expect(exited.z).toBeCloseTo(1, 1);
  expect(errors).toEqual([]);
});
