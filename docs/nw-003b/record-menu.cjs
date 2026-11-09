/**
 * Records the title screen's lighting sequence to video (reproducible: fixed director seed).
 *
 *   npm run dev -- --port 5199 &
 *   node docs/nw-003b/record-menu.cjs http://localhost:5199 docs/nw-003b
 *
 * Writes title-sequence.webm (Playwright's recorder; it captures picture only, not sound), then:
 *   ffmpeg -i title-sequence.webm -c:v libx264 -pix_fmt yuv420p -crf 26 title-sequence.mp4
 * The sequence: the tube striking on, a flicker, a blackout with the figure in the end doorway,
 * the light returning without it, the exit sign pulsing, then moving through the menu.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const base = process.argv[2] || 'http://localhost:5199';
  const out = process.argv[3] || 'docs/nw-003b';
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: out, size: { width: 1280, height: 720 } } });
  const page = await context.newPage();
  const force = (kind) => page.evaluate((k) => window.nightWardFrontend.menu.director.force(k), kind);
  await page.goto(`${base}/?test=1&menu=1&menuSeed=104`);
  await page.waitForFunction(() => window.nightWardFrontend?.menu.corridor.mode === 'webgl', null, { timeout: 60000 });
  await page.waitForTimeout(3500); // the tube strikes on
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(1500);
  await force('stutter');
  await page.waitForTimeout(3500);
  await force('figure');
  await page.waitForTimeout(6000); // dark, the figure, the light comes back without it
  await force('exit-pulse');
  await page.waitForTimeout(2500);
  await force('buzz');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(1200);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(1200);
  await force('blackout');
  await page.waitForTimeout(4000);
  const video = page.video();
  await context.close();
  await browser.close();
  const file = await video.path();
  fs.renameSync(file, path.join(out, 'title-sequence.webm'));
  console.log('NW_RECORDED', path.join(out, 'title-sequence.webm'));
})();
