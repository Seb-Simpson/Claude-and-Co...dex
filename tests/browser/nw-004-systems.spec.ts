import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { ChapterRuntimeHarness } from './harness/chapter-runtime';
import { writeFile } from 'node:fs/promises';

type HarnessWindow = Window & { nwChapterHarness: ChapterRuntimeHarness };
const snapshot = (page: Page) => page.evaluate(() => (window as HarnessWindow).nwChapterHarness.snapshot());

test.use({ viewport: { width: 1366, height: 768 }, video: 'on' });
test.describe('NW-004 isolated systems: not a Chapter One playthrough', () => {
  async function boot(page: Page): Promise<string[]> {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/tests/browser/harness/chapter-runtime.html');
    await page.waitForFunction(() => (window as HarnessWindow).nwChapterHarness?.ready);
    await expect.poll(async () => (await snapshot(page)).frameCount).toBeGreaterThan(3);
    await expect(page.getByRole('heading')).toContainText('isolated systems test harness');
    await expect(page.getByText('PREVIEW — NO RECORDED VOICES.', { exact: false })).toBeVisible();
    await expect(page.getByRole('alert')).toBeHidden();
    return errors;
  }

  test('real shared-camera lease suppresses input/noise, pauses and skips with preview subtitles', async ({ page }, testInfo) => {
    const errors = await boot(page);
    expect((await snapshot(page)).audioState).toBe('not-created');
    await page.getByRole('button', { name: 'Unlock audio (diagnostic only)', exact: true }).click();
    await expect.poll(async () => (await snapshot(page)).audioState).toBe('running');
    await page.locator('canvas').click({ position: { x: 700, y: 500 } });
    await expect.poll(async () => (await snapshot(page)).locked).toBe(true);
    const before = await snapshot(page);
    await page.evaluate(() => (window as HarnessWindow).nwChapterHarness.play(5));
    await page.keyboard.down('w');
    await page.keyboard.down('Shift');
    await page.mouse.move(730, 500);
    await expect.poll(async () => (await snapshot(page)).elapsedSeconds).toBeGreaterThan(1.3);
    const during = await snapshot(page);
    expect(during.controlsLocked).toBe(true);
    expect(during.position.x).toBeCloseTo(before.position.x, 4);
    expect(during.position.z).toBeCloseTo(before.position.z, 4);
    expect(during.rotation).toEqual(before.rotation);
    expect(during.camera.x - before.camera.x).toBeGreaterThan(0.85);
    expect(during.noiseCount).toBe(before.noiseCount);
    expect(during.noiseDuringControl).toBe(0);
    await page.evaluate(() => (window as HarnessWindow).nwChapterHarness.pause());
    const paused = await snapshot(page);
    await expect.poll(async () => (await snapshot(page)).frameCount).toBeGreaterThan(paused.frameCount + 4);
    const still = await snapshot(page);
    expect(still.phase).toBe('paused');
    expect(still.elapsedSeconds).toBe(paused.elapsedSeconds);
    expect(still.camera).toEqual(paused.camera);
    await expect(page.locator('#subtitle')).toContainText('PREVIEW — NOT RECORDED');
    const gl = await page.locator('canvas').evaluate(canvas => {
      const context = (canvas as HTMLCanvasElement).getContext('webgl2');
      return { active: !!context && !context.isContextLost(), error: context?.getError(), width: (canvas as HTMLCanvasElement).width };
    });
    expect(gl.active).toBe(true); expect(gl.error).toBe(0);
    expect(gl.width).toBeLessThanOrEqual(1025);
    expect(still.pixelRatio).toBe(0.75); expect(still.draws).toBeGreaterThan(0); expect(still.triangles).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath('nw004-isolated-camera-preview.png') });
    await page.evaluate(() => { const api = (window as HarnessWindow).nwChapterHarness; api.resume(); api.skip(); });
    await expect.poll(async () => (await snapshot(page)).phase).toBe('skipped');
    const after = await snapshot(page);
    expect(after.controlsLocked).toBe(false);
    expect(after.camera.x).toBeCloseTo(before.camera.x, 4);
    expect(after.camera.z).toBeCloseTo(before.camera.z, 4);
    await expect(page.locator('#subtitle')).toBeEmpty();
    await page.keyboard.up('w'); await page.keyboard.up('Shift');
    await page.keyboard.down('w');
    await expect.poll(async () => (await snapshot(page)).position.z).toBeLessThan(before.position.z - 0.4);
    await expect.poll(async () => (await snapshot(page)).noiseCount).toBeGreaterThan(before.noiseCount);
    await page.keyboard.up('w');
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  });

  test('completion, interruption and repeated active-scene restarts retain one engine and release physics/audio', async ({ page }, testInfo) => {
    const errors = await boot(page);
    await page.getByRole('button', { name: 'Unlock audio (diagnostic only)', exact: true }).click();
    await expect.poll(async () => (await snapshot(page)).audioState).toBe('running');
    const baseline = await snapshot(page);
    const restartEvidence = [];
    await page.evaluate(() => (window as HarnessWindow).nwChapterHarness.play(0.7));
    await expect.poll(async () => (await snapshot(page)).phase).toBe('completed');
    expect((await snapshot(page)).controlsLocked).toBe(false);
    await page.evaluate(() => (window as HarnessWindow).nwChapterHarness.play(2));
    await expect.poll(async () => (await snapshot(page)).elapsedSeconds).toBeGreaterThan(0.3);
    await page.evaluate(() => (window as HarnessWindow).nwChapterHarness.cancel());
    await expect.poll(async () => (await snapshot(page)).phase).toBe('interrupted');
    await expect.poll(async () => (await snapshot(page)).camera.x).toBeCloseTo(baseline.camera.x, 4);
    await expect(page.locator('#subtitle')).toBeEmpty();
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.evaluate(() => (window as HarnessWindow).nwChapterHarness.play(2));
      await expect.poll(async () => (await snapshot(page)).elapsedSeconds).toBeGreaterThan(0.1);
      await page.evaluate(() => (window as HarnessWindow).nwChapterHarness.restart());
      const restartedFrame = (await snapshot(page)).frameCount;
      await expect.poll(async () => (await snapshot(page)).frameCount).toBeGreaterThan(restartedFrame + 2);
      const current = await snapshot(page);
      restartEvidence.push(current);
      expect(current.generation).toBe(attempt + 2);
      expect(current.canvasCount).toBe(1); expect(current.worldCount).toBe(1);
      expect(current.colliderCount).toBe(baseline.colliderCount);
      expect(current.bodyCount).toBe(baseline.bodyCount);
      expect(current.moduleSetups - current.moduleDisposals).toBe(2);
      expect(current.controlsLocked).toBe(false); expect(current.audioState).toBe('running');
      expect(current.gpuResources).toEqual(baseline.gpuResources);
    }
    await page.evaluate(() => (window as HarnessWindow).nwChapterHarness.play(0.7));
    await expect.poll(async () => (await snapshot(page)).phase).toBe('completed');
    const evidence = await snapshot(page);
    expect(evidence.outcomes.filter(result => result.outcome === 'completed')).toHaveLength(2);
    expect(evidence.outcomes.filter(result => result.outcome === 'interrupted')).toHaveLength(4);
    const evidencePath = testInfo.outputPath('isolated-session-lifecycle.json');
    await writeFile(evidencePath, JSON.stringify({ baseline, restarts: restartEvidence, final: evidence }, null, 2));
    await testInfo.attach('isolated-session-lifecycle.json', { path: evidencePath, contentType: 'application/json' });
    await page.evaluate(() => (window as HarnessWindow).nwChapterHarness.dispose());
    const disposed = await snapshot(page);
    expect(disposed.disposed).toBe(true); expect(disposed.canvasCount).toBe(0);
    expect(disposed.colliderCount).toBe(0); expect(disposed.bodyCount).toBe(0); expect(disposed.worldCount).toBe(0);
    expect(disposed.moduleSetups).toBe(disposed.moduleDisposals); expect(disposed.audioState).toBe('closed');
    await page.waitForTimeout(100);
    expect((await snapshot(page)).frameCount).toBe(disposed.frameCount);
    expect(errors).toEqual([]);
  });

  test('production rejects every unrecorded chapter voice without acquiring gameplay control', async ({ page }, testInfo) => {
    const errors = await boot(page);
    const rejections = await page.evaluate(() => (window as HarnessWindow).nwChapterHarness.productionRejections());
    expect(rejections).toHaveLength(13);
    expect(new Set(rejections.map(result => result.id)).size).toBe(13);
    expect(rejections.every(result => result.reason.includes('no approved recording'))).toBe(true);
    const after = await snapshot(page);
    expect(after.controlsLocked).toBe(false); expect(after.phase).toBe('idle'); expect(after.audioState).toBe('not-created');
    await expect(page.locator('#subtitle')).toBeEmpty();
    await testInfo.attach('unrecorded-voice-production-rejections.json', { body: JSON.stringify(rejections, null, 2), contentType: 'application/json' });
    expect(errors).toEqual([]);
  });

  test('native diagnostic audio clock catches camera and captions up after a capped host frame', async ({ page }, testInfo) => {
    const errors = await boot(page);
    await page.getByRole('button', { name: 'Unlock audio (diagnostic only)', exact: true }).click();
    await expect.poll(async () => (await snapshot(page)).audioState).toBe('running');
    const before = await snapshot(page);
    const evidence = await page.evaluate(() => (window as HarnessWindow).nwChapterHarness.nativeAudioClockProbe());
    expect(evidence.fixture).toBe('generated diagnostic sine tone; not a chapter voice');
    expect(evidence.audioAdvanceSeconds).toBeGreaterThanOrEqual(1.8);
    expect(evidence.timelineSeconds).toBeGreaterThanOrEqual(1.8);
    expect(Math.abs(evidence.timelineSeconds - evidence.audioAdvanceSeconds)).toBeLessThan(0.2);
    expect(evidence.caption).toContain('DIAGNOSTIC TONE — NOT A CHAPTER VOICE');
    expect(evidence.caption).toContain('Diagnostic clock segment two.');
    expect(evidence.cameraDeltaX).toBeGreaterThan(0.75);
    expect(evidence.outputRms).toBeGreaterThan(0.00001);
    expect(evidence.sampledFrameCount).toBe(evidence.stoppedFrameCount);
    expect(evidence.cameraIdentityPreserved).toBe(true); expect(evidence.canvasIdentityPreserved).toBe(true);
    expect(evidence.collidersAfter).toBe(evidence.collidersBefore); expect(evidence.audioState).toBe('running');
    await expect.poll(async () => (await snapshot(page)).frameCount).toBeGreaterThan(before.frameCount + 2);
    const after = await snapshot(page);
    expect(after.controlsLocked).toBe(false); expect(after.canvasCount).toBe(1); expect(after.worldCount).toBe(1);
    expect(after.colliderCount).toBe(before.colliderCount); expect(after.bodyCount).toBe(before.bodyCount);
    expect(after.gpuResources).toEqual(before.gpuResources);
    await expect(page.locator('#subtitle')).toBeEmpty();
    const rejections = await page.evaluate(() => (window as HarnessWindow).nwChapterHarness.productionRejections());
    expect(rejections).toHaveLength(13);
    const evidencePath = testInfo.outputPath('native-audio-clock-diagnostic.json');
    await writeFile(evidencePath, JSON.stringify({ probe: evidence, before, after, unrecordedChapterLinesRejected: rejections.length }, null, 2));
    await testInfo.attach('native-audio-clock-diagnostic.json', { path: evidencePath, contentType: 'application/json' });
    expect(errors).toEqual([]);
  });
});
