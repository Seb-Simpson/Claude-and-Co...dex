import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { bootHospital, enterWard, snapshot } from './application';

/**
 * NW-007B head check in the actual game: the shipped nurse.glb, loaded through the game's model
 * library, rendered by the game's renderer in the game's scene and lights, from the same relative
 * camera as the Blender comparison renders (0.9 m in front of her, eye 1.72 m, aimed at 1.66 m,
 * 39.6 degree field of view, square crop): bind pose, then the look-around, capture and panel frames.
 * With NW007B_HEAD=<dir> the crops are written there. Codex's staged Nurse is hidden for these
 * renders only.
 */
const OUT = process.env.NW007B_HEAD;
test.use({ launchOptions: { ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

const SHOTS: readonly { name: string; clip: string | null; seconds: number }[] = [
  { name: 'game_rest', clip: null, seconds: 0 },
  { name: 'game_look_around_46', clip: 'look_around', seconds: 45 / 30 },
  { name: 'game_capture_43', clip: 'capture', seconds: 42 / 30 },
  { name: 'game_panel_check_28', clip: 'panel_check', seconds: 27 / 30 },
];

test('NW-007B: Nurse Shaw head assembly renders aligned in the actual game', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = await bootHospital(page);
  await enterWard(page);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snapshot(page)).opening?.state.awakened, { timeout: 90_000 }).toBe(true);
  if (OUT) mkdirSync(OUT, { recursive: true });
  for (const shot of SHOTS) {
    const png = await page.evaluate(async ({ clip, seconds }) => {
      const load = (path: string) => import(/* @vite-ignore */ path) as Promise<Record<string, unknown>>;
      const lib = await load('/src/horror/entities/model/library.ts') as unknown as typeof import('../../src/horror/entities/model/library');
      const assets = await load('/src/horror/entities/model/assets.ts') as unknown as typeof import('../../src/horror/entities/model/assets');
      const visualMod = await load('/src/horror/entities/model/modelVisual.ts') as unknown as typeof import('../../src/horror/entities/model/modelVisual');
      const app = (window as unknown as { nightWardTest: { services(): { scene: import('three').Scene; camera: import('three').PerspectiveCamera; renderer: import('three').WebGLRenderer } | null } }).nightWardTest;
      const { scene, camera, renderer } = app.services()!;
      scene.traverse((o) => { if (o.name.startsWith('nw:opening:nurse')) o.visible = false; });
      const library = await lib.loadModelLibrary({ urls: { nurse: assets.MODEL_URLS.nurse }, manifests: { nurse: assets.MODEL_MANIFESTS.nurse } });
      const visual = visualMod.createModelVisual('nurse', library.get('nurse')!, { seed: 5 });
      // In the station by the records stand, facing +Z into the lit room.
      const at = { x: -3.8, z: -5.2 };
      visual.object.position.set(at.x, 0, at.z);
      visual.object.rotation.set(0, Math.PI, 0);
      scene.getObjectByName('nw:hospital')!.add(visual.object);
      if (clip) {
        visual.update(0.016, { behaviour: 'idle', speed: 0 });
        visual.playClip!(clip, { restart: true, fade: 0 });
        for (let t = 0; t < seconds - 1e-6; t += 1 / 30) visual.update(1 / 30, { behaviour: 'idle', speed: 0 });
      }
      visual.object.updateMatrixWorld(true);
      // Same relative camera as the Blender renders: in front of her (+Z here), centred on her origin.
      const Camera = camera.constructor as new (fov: number, aspect: number, near: number, far: number) => import('three').PerspectiveCamera;
      const canvas = renderer.domElement;
      const cam = new Camera(39.6, canvas.width / canvas.height, 0.05, 50);
      cam.position.set(at.x, 1.72, at.z + 0.9);
      cam.lookAt(at.x, 1.66, at.z);
      cam.updateMatrixWorld(true);
      renderer.setRenderTarget(null);
      renderer.render(scene, cam);
      const gl = renderer.getContext();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const pixels = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      visual.dispose();
      library.dispose();
      // Centre square crop, flipped to image orientation.
      const side = h, x0 = Math.floor((w - side) / 2);
      const out = document.createElement('canvas');
      out.width = side; out.height = side;
      const ctx = out.getContext('2d')!;
      const img = ctx.createImageData(side, side);
      for (let y = 0; y < side; y++) {
        const row = (h - 1 - y) * w * 4 + x0 * 4;
        img.data.set(pixels.subarray(row, row + side * 4), y * side * 4);
      }
      ctx.putImageData(img, 0, 0);
      return out.toDataURL('image/png');
    }, { clip: shot.clip, seconds: shot.seconds });
    expect(png.startsWith('data:image/png;base64,')).toBe(true);
    if (OUT) writeFileSync(`${OUT}/${shot.name}.png`, Buffer.from(png.split(',')[1]!, 'base64'));
  }
  expect(errors).toEqual([]);
});
