import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { bootHospital, enterWard, positionPlayer, snapshot } from './application';

/**
 * NW-007B visual evidence in the real game (`/?test=1`): the shipped nurse.glb is loaded through
 * the game's own model library and posed with each authored clip at the published station bindings
 * (getStationStaging), inside the real world, sets and lights. Codex's Nurse instances are hidden
 * for these shots only, so exactly one Nurse is ever on screen; nothing here drives gameplay.
 * With NW007B_SHOTS=<dir> the screenshots and the report are written there (docs/nw-007b/shots).
 * Software rendering (SwiftShader): costs are relative only.
 */
const OUT = process.env.NW007B_SHOTS;
test.use({ launchOptions: { ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

type V = { x: number; y: number; z: number };
interface Shot {
  readonly name: string;
  readonly at: V;
  readonly look: V;
  /** Where to pose her: a staging action, or an explicit spot and yaw. */
  readonly nurse?: { readonly action?: 'panel' | 'records'; readonly spot?: V; readonly yaw?: number; readonly clip: string; readonly time: number } | null;
  readonly crouch?: boolean;
}
const SHOTS: readonly Shot[] = [
  { name: '01-station-arrival', at: { x: -0.8, y: 0, z: -2.6 }, look: { x: -4.4, y: 1.3, z: -5.6 }, nurse: { action: 'panel', clip: 'panel_check', time: 0.9 } },
  { name: '02-panel-reads-annunciator', at: { x: -2.4, y: 0, z: -4.9 }, look: { x: -4.6, y: 1.35, z: -5.7 }, nurse: { action: 'panel', clip: 'panel_check', time: 0.95 } },
  { name: '03-panel-presses-reset', at: { x: -2.4, y: 0, z: -4.9 }, look: { x: -4.5, y: 1.0, z: -5.7 }, nurse: { action: 'panel', clip: 'panel_check', time: 3.5 } },
  { name: '04-records-104', at: { x: -2.3, y: 0, z: -4.7 }, look: { x: -3.85, y: 1.0, z: -5.6 }, nurse: { action: 'records', clip: 'records_read', time: 2.2 } },
  { name: '05-walk', at: { x: -0.8, y: 0, z: -2.0 }, look: { x: -2.6, y: 1.0, z: -4.7 }, nurse: { spot: { x: -2.6, y: 0, z: -4.7 }, yaw: Math.PI / 2 + 0.35, clip: 'walk', time: 0.45 } },
  { name: '06-turn-and-look', at: { x: -0.8, y: 0, z: -2.0 }, look: { x: -3.4, y: 1.2, z: -4.6 }, nurse: { spot: { x: -3.6, y: 0, z: -4.6 }, yaw: -0.6, clip: 'look_around', time: 1.4 } },
  { name: '07-listen-brief', at: { x: -0.8, y: 0, z: -2.0 }, look: { x: -3.4, y: 1.3, z: -4.6 }, nurse: { spot: { x: -3.6, y: 0, z: -4.6 }, yaw: -2.4, clip: 'listen_brief', time: 1.2 } },
  { name: '08-investigate', at: { x: -0.8, y: 0, z: -2.0 }, look: { x: -2.2, y: 1.1, z: -4.0 }, nurse: { spot: { x: -2.2, y: 0, z: -4.0 }, yaw: Math.PI * 0.75, clip: 'investigate', time: 1.0 } },
  { name: '09-locker-behind-her', at: { x: -5.7, y: 0, z: -4.05 }, look: { x: -4.4, y: 1.25, z: -5.42 }, nurse: { action: 'panel', clip: 'panel_check', time: 3.4 } },
  { name: '10-crouched-at-trolley', at: { x: -4.6, y: 0, z: -0.42 }, look: { x: -4.0, y: 1.0, z: -4.6 }, crouch: true, nurse: { action: 'panel', clip: 'panel_check', time: 1.0 } },
  { name: '11-torch-by-lockers', at: { x: -3.6, y: 0, z: -3.3 }, look: { x: -6.2, y: 0.6, z: -4.0 }, nurse: null },
  { name: '12-annunciator', at: { x: -5.0, y: 0, z: -5.0 }, look: { x: -5.4, y: 1.72, z: -6.4 }, nurse: null },
  { name: '13-record-and-console', at: { x: -4.1, y: 0, z: -5.3 }, look: { x: -4.05, y: 0.76, z: -5.95 }, nurse: null },
  { name: '14-capture', at: { x: -3.0, y: 0, z: -4.3 }, look: { x: -3.0, y: 1.45, z: -5.2 }, nurse: { spot: { x: -3.0, y: 0, z: -5.22 }, yaw: Math.PI, clip: 'capture', time: 1.4 } },
];

test('NW-007B: Nurse Shaw posed with each authored clip at the station, in the real game', async ({ page }, testInfo) => {
  test.setTimeout(900_000);
  const errors = await bootHospital(page);
  await enterWard(page);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snapshot(page)).opening?.state.awakened, { timeout: 90_000 }).toBe(true);

  // Load the shipped Nurse through the game's own library; hide Codex's instances for the evidence.
  const setup = await page.evaluate(async () => {
    // Source modules served by the Vite dev server (string specifiers: resolved in the page, not by tsc).
    const load = (path: string) => import(/* @vite-ignore */ path) as Promise<Record<string, unknown>>;
    const lib = await load('/src/horror/entities/model/library.ts') as unknown as typeof import('../../src/horror/entities/model/library');
    const assets = await load('/src/horror/entities/model/assets.ts') as unknown as typeof import('../../src/horror/entities/model/assets');
    const visualMod = await load('/src/horror/entities/model/modelVisual.ts') as unknown as typeof import('../../src/horror/entities/model/modelVisual');
    const staging = await load('/src/world/stealth/nursesStation.ts') as unknown as typeof import('../../src/world/stealth/nursesStation');
    const app = (window as unknown as { nightWardTest: { services(): { scene: import('three').Scene } | null } }).nightWardTest;
    const scene = app.services()!.scene;
    const hidden: string[] = [];
    scene.traverse((o) => {
      if (o.name.startsWith('nw:opening:nurse') || o.name.startsWith('nw:entity-model:nurse') || o.name.startsWith('nw:entity-visual:nurse')) { o.visible = false; hidden.push(o.name); }
    });
    const library = await lib.loadModelLibrary({ urls: { nurse: assets.MODEL_URLS.nurse }, manifests: { nurse: assets.MODEL_MANIFESTS.nurse } });
    const model = library.get('nurse');
    if (!model) throw new Error('nurse.glb did not load');
    const visual = visualMod.createModelVisual('nurse', model, { seed: 7 });
    visual.object.name = 'nw:nw007b-evidence-nurse';
    const world = scene.getObjectByName('nw:hospital')!;
    world.add(visual.object);
    const st = staging.getStationStaging({ root: world } as never);
    let tris = 0;
    visual.object.traverse((o) => { const m = o as import('three').Mesh; if (m.isMesh) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3; });
    (window as unknown as Record<string, unknown>).__nw007b = {
      pose(p: { x: number; y: number; z: number } | null, yaw: number, clip: string, time: number) {
        if (!p) { visual.object.visible = false; return; }
        visual.object.visible = true;
        visual.object.position.set(p.x, p.y, p.z);
        visual.object.rotation.set(0, yaw, 0);
        visual.update(0.016, { behaviour: 'idle', speed: 0 });
        visual.playClip!(clip, { restart: true, fade: 0 });
        for (let t = 0; t < time; t += 1 / 30) visual.update(1 / 30, { behaviour: 'idle', speed: clip === 'walk' ? 0.9 : clip === 'investigate' ? 0.55 : 0 });
      },
      staging: st,
    };
    return { hidden, triangles: Math.round(tris), clips: [...model.clips.keys()] };
  });
  expect(setup.clips).toEqual(expect.arrayContaining(['panel_check', 'records_read', 'walk', 'turn', 'look_around', 'listen_brief', 'investigate', 'capture']));
  const staging = await page.evaluate(() => (window as unknown as { __nw007b: { staging: unknown } }).__nw007b.staging) as Record<'panel' | 'records', { stand: V; yaw: number }>;

  // Let the simulation settle with no keys held (the runtime waits for neutral input after a cinematic).
  const settled = (await snapshot(page)).performance.simulatedSeconds;
  await expect.poll(async () => (await snapshot(page)).performance.simulatedSeconds, { timeout: 90_000 }).toBeGreaterThan(settled + 0.5);

  if (OUT) mkdirSync(OUT, { recursive: true });
  const views: Record<string, unknown> = {};
  for (const shot of SHOTS) {
    const n = shot.nurse;
    const place = n ? (n.action ? staging[n.action].stand : n.spot!) : null;
    const yaw = n ? (n.action ? staging[n.action].yaw : n.yaw ?? 0) : 0;
    await page.evaluate(({ place, yaw, clip, time }) => (window as unknown as { __nw007b: { pose(p: unknown, y: number, c: string, t: number): void } }).__nw007b.pose(place, yaw, clip, time), { place, yaw, clip: n?.clip ?? 'idle', time: n?.time ?? 0 });
    await positionPlayer(page, shot.at, shot.look);
    if (shot.crouch) {
      await page.keyboard.press('KeyC');
      await expect.poll(async () => (await snapshot(page)).player!.crouching, { timeout: 60_000 }).toBe(true);
      await page.evaluate((t) => (window as unknown as { nightWardTest: { aimAt(v: unknown): void } }).nightWardTest.aimAt(t), shot.look);
    }
    await page.waitForTimeout(1500);
    await page.screenshot({ path: OUT ? `${OUT}/${shot.name}.png` : testInfo.outputPath(`${shot.name}.png`), timeout: 120_000 });
    const s = await snapshot(page);
    views[shot.name] = { clip: n?.clip ?? null, time: n?.time ?? null, calls: s.renderer.calls, triangles: s.renderer.triangles };
    expect(s.renderer.calls, shot.name).toBeLessThan(500);
    if (shot.crouch) {
      await page.keyboard.press('KeyC');
      await expect.poll(async () => (await snapshot(page)).player!.crouching, { timeout: 60_000 }).toBe(false);
    }
  }
  const report = { nurse: setup, views, renderer: (await snapshot(page)).renderer };
  if (OUT) writeFileSync(`${OUT}/browser-report.json`, `${JSON.stringify(report, null, 2)}\n`);
  testInfo.annotations.push({ type: 'nw-007b', description: JSON.stringify(report) });
  expect(errors).toEqual([]);
});
