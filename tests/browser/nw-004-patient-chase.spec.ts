import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import type { PatientChaseHarness } from './harness/patient-chase';

type HarnessWindow = Window & { nwPatientHarness: PatientChaseHarness };
const snapshot = (page: Page) => page.evaluate(() => (window as HarnessWindow).nwPatientHarness.snapshot());

test.use({ viewport: { width: 1366, height: 768 }, video: 'on' });
test.describe('NW-004 isolated Patient chase — not approved hospital choreography', () => {
  test.setTimeout(90_000);
  async function boot(page: Page): Promise<string[]> {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/tests/browser/harness/patient-chase.html');
    await page.waitForFunction(() => (window as HarnessWindow).nwPatientHarness?.ready);
    await expect(page.getByRole('heading')).toContainText('isolated Patient chase QA');
    await expect(page.getByRole('alert')).toBeHidden();
    await expect.poll(async () => (await snapshot(page)).frames).toBeGreaterThan(3);
    await page.getByRole('button', { name: 'Unlock diagnostic audio', exact: true }).click();
    await expect.poll(async () => (await snapshot(page)).audioState).toBe('running');
    const prepared = await page.evaluate(() => (window as HarnessWindow).nwPatientHarness.prepare());
    expect(prepared.valid, prepared.issues.join(' ')).toBe(true);
    expect(prepared.routes).toHaveLength(2);
    expect(prepared.routes.every(r => r.decisionLeadSeconds >= 1.5)).toBe(true);
    await page.locator('canvas').click({ position: { x: 700, y: 500 } });
    await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS');
    return errors;
  }
  async function release(page: Page, skip: boolean): Promise<void> {
    const before = await snapshot(page);
    expect(before.patient).toBeNull();
    const started = await page.evaluate(() => {
      const api = (window as HarnessWindow).nwPatientHarness;
      return { accepted: api.confirm(), snapshot: api.snapshot() };
    });
    expect(started.accepted).toBe(true);
    expect(started.snapshot.chase.phase).toBe('revealing');
    expect(started.snapshot.patient).toBeNull();
    expect(started.snapshot.player.controlsLocked).toBe(true);
    if (skip) await page.evaluate(() => (window as HarnessWindow).nwPatientHarness.skip());
    await expect.poll(async () => (await snapshot(page)).chase.phase).toBe('active');
    await expect.poll(async () => (await snapshot(page)).patient?.state).toBe('investigate');
    const investigation = await snapshot(page);
    expect(investigation.patient?.lastKnownPlayer).toBeNull();
    expect(investigation.cues.filter(id => id === 'release')).toHaveLength(1);
    expect(investigation.noiseEvents).toBe(before.noiseEvents);
  }

  test('anonymous alarm, physical navigation, corner loss and north-branch escape', async ({ page }, testInfo) => {
    const errors = await boot(page);
    await release(page, true);
    await expect.poll(async () => (await snapshot(page)).chase.pursuing, { timeout: 25_000 }).toBe(true);
    const acquired = await snapshot(page);
    expect(acquired.patient?.lastKnownPlayer?.source).toBe('vision');
    expect(acquired.patient!.position.x).toBeGreaterThan(-7);
    expect(acquired.patient!.position.x).toBeLessThan(8);
    expect(acquired.trail.some(p => Math.abs(p.x) < 1 && Math.abs(p.z) > 3.2)).toBe(true);
    expect(acquired.trail.every(p => Math.abs(p.x) >= 0.4 || Math.abs(p.z) > 3.2)).toBe(true);
    await page.evaluate(() => (window as HarnessWindow).nwPatientHarness.walkRoute('north'));
    // Flee before screenshot readback: AI keeps moving while Playwright captures pixels.
    await page.screenshot({ path: testInfo.outputPath('patient-real-navigation-and-pursuit.png') });
    await expect.poll(async () => (await snapshot(page)).chase.phase, { timeout: 25_000 }).toBe('escaped');
    const escaped = await snapshot(page);
    expect(escaped.player.captured).toBe(false); expect(escaped.player.controlsLocked).toBe(false);
    expect(escaped.player.position.x).toBeGreaterThanOrEqual(16.5);
    expect(escaped.sealed).toBe(true); expect(escaped.released).toBe(true);
    expect(escaped.patientPhase).toBe('settled');
    expect(escaped.patient).not.toBeNull();
    expect(escaped.patient!.position.x).toBeLessThan(15);
    expect(escaped.core.stairReached).toBe(true);
    expect(escaped.events.some(e => e.state === 'lost-target' || e.state === 'search')).toBe(true);
    expect(escaped.events.filter(e => e.type === 'chase:started').length).toBeGreaterThanOrEqual(1);
    expect(escaped.events.some(e => e.type === 'chase:ended' && e.reason === 'escaped')).toBe(true);
    expect(escaped.navQueries).toBeLessThan(300);
    await page.screenshot({ path: testInfo.outputPath('patient-safe-physical-exit.png') });
    const path = testInfo.outputPath('patient-north-escape-evidence.json');
    await writeFile(path, JSON.stringify({ acquired, escaped }, null, 2));
    await testInfo.attach('patient-north-escape-evidence.json', { path, contentType: 'application/json' });
    await page.evaluate(() => (window as HarnessWindow).nwPatientHarness.dispose());
    const disposed = await snapshot(page);
    expect(disposed.chase.phase).toBe('disposed'); expect(disposed.canvasCount).toBe(0);
    expect(disposed.colliderCount).toBe(0); expect(disposed.audioState).toBe('closed');
    expect(errors).toEqual([]);
  });

  test('real capture restores the prepared checkpoint, then south branch can escape', async ({ page }, testInfo) => {
    const errors = await boot(page);
    const baseline = await snapshot(page);
    await release(page, false);
    await expect.poll(async () => (await snapshot(page)).chase.phase, { timeout: 30_000 }).toBe('captured');
    const captured = await snapshot(page);
    expect(captured.player.captured).toBe(true);
    expect(captured.events.some(e => e.type === 'chase:started')).toBe(true);
    expect(captured.events.some(e => e.type === 'player:captured')).toBe(true);
    expect(captured.core.puzzle.releaseConfirmed).toBe(true);
    await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
    await page.screenshot({ path: testInfo.outputPath('patient-real-capture.png') });
    expect(await page.evaluate(() => (window as HarnessWindow).nwPatientHarness.retry())).toBe(true);
    await expect.poll(async () => (await snapshot(page)).chase.phase).toBe('ready');
    const restored = await snapshot(page);
    expect(restored.restoreCount).toBe(1);
    expect(restored.player.captured).toBe(false);
    expect(restored.player.controlsLocked).toBe(false);
    expect(restored.player.position.x).toBeCloseTo(8, 2);
    expect(restored.player.position.z).toBeCloseTo(0, 2);
    expect(restored.patient).toBeNull(); expect(restored.patientPhase).toBe('staged');
    expect(restored.core).toEqual(baseline.core);
    expect(restored.released).toBe(false); expect(restored.sealed).toBe(false);
    expect(restored.canvasCount).toBe(1); expect(restored.colliderCount).toBe(baseline.colliderCount);
    await page.locator('canvas').click({ position: { x: 700, y: 500 } });
    await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS');
    // Second attempt uses the exact safe state but a fresh reveal/AI activation.
    const accepted = await page.evaluate(() => (window as HarnessWindow).nwPatientHarness.confirm());
    expect(accepted).toBe(true);
    await page.evaluate(() => (window as HarnessWindow).nwPatientHarness.skip());
    await expect.poll(async () => (await snapshot(page)).chase.pursuing, { timeout: 25_000 }).toBe(true);
    await page.evaluate(() => (window as HarnessWindow).nwPatientHarness.walkRoute('south'));
    await expect.poll(async () => (await snapshot(page)).chase.phase, { timeout: 25_000 }).toBe('escaped');
    const escaped = await snapshot(page);
    expect(escaped.chase.attempt).toBe(2);
    expect(escaped.patientPhase).toBe('settled'); expect(escaped.player.captured).toBe(false);
    expect(escaped.core.puzzle.busArmed).toBe(true); expect(escaped.core.puzzle.handleLocation).toBe('installed');
    expect(escaped.core.completedScenes).toContain('c1.cine.record');
    expect(escaped.sealed).toBe(true); expect(escaped.canvasCount).toBe(1);
    const path = testInfo.outputPath('patient-capture-retry-south-evidence.json');
    await writeFile(path, JSON.stringify({ baseline, captured, restored, escaped }, null, 2));
    await testInfo.attach('patient-capture-retry-south-evidence.json', { path, contentType: 'application/json' });
    await page.screenshot({ path: testInfo.outputPath('patient-retry-south-escape.png') });
    expect(errors).toEqual([]);
  });
});
