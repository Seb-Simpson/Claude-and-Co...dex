import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Bone, type BufferAttribute, Matrix4, type SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { MODEL_MANIFESTS, MODEL_URLS } from './assets';
import { type LoadedModel, loadModelLibrary } from './library';
import { createModelVisual } from './modelVisual';

/**
 * NW-007B regression: Nurse Shaw's face coverings stay on her face in the shipped GLB.
 *
 * The exporter tags every vertex with its part (`_NW_PART`: 0 skin, 1 dress/other, 2 blindfold,
 * 3 cap, 4 hair/knot). In each pose the blindfold, cap, hair and the upper face must follow the
 * head bone rigidly, and in the head's own frame the blindfold must sit centred across the front
 * of the face with the cap on top. Before the fix the blindfold, cap and hair sat ~10 cm to one
 * side of the face (shrink-wrapped onto an already-rotated head during export).
 */
(globalThis as { self?: unknown }).self = globalThis;
vi.spyOn(console, 'warn').mockImplementation(() => undefined);
let model: LoadedModel;
beforeAll(async () => {
  const buf = readFileSync(fileURLToPath(MODEL_URLS.nurse));
  const library = await loadModelLibrary({
    urls: { nurse: MODEL_URLS.nurse }, manifests: { nurse: MODEL_MANIFESTS.nurse },
    load: async () => new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), ''),
  });
  model = library.get('nurse')!;
}, 60000);

const PART = { skin: 0, blindfold: 2, cap: 3, hair: 4 } as const;
const POSES: readonly (readonly [string, number])[] = [
  ['idle', 2.0], ['look_around', 1.5], ['look_around', 3.6], ['listen_brief', 1.2], ['panel_check', 0.9], ['panel_check', 3.5], ['capture', 1.4],
];

function posed(clip: string | null, seconds: number) {
  const visual = createModelVisual('nurse', model, { seed: 3 });
  if (clip) {
    visual.update(0.016, { behaviour: 'idle', speed: 0 });
    visual.playClip!(clip, { restart: true, fade: 0 });
    for (let t = 0; t < seconds; t += 1 / 30) visual.update(1 / 30, { behaviour: 'idle', speed: 0 });
  }
  visual.object.updateMatrixWorld(true);
  let mesh: SkinnedMesh | null = null;
  visual.object.traverse((o) => { if ((o as SkinnedMesh).isSkinnedMesh) mesh = o as SkinnedMesh; });
  const m = mesh! as SkinnedMesh;
  m.skeleton.update();
  return { visual, mesh: m };
}

/** Vertices of the head assembly, by part, with their bind-pose (raw) positions. */
function headVertices(mesh: SkinnedMesh) {
  const part = mesh.geometry.getAttribute('_nw_part') as BufferAttribute | undefined;
  const pos = mesh.geometry.getAttribute('position') as BufferAttribute;
  expect(part, 'nurse.glb carries the _NW_PART attribute').toBeDefined();
  const out: { i: number; part: number; bind: Vector3 }[] = [];
  for (let i = 0; i < pos.count; i++) {
    const p = part!.getX(i);
    const bind = new Vector3().fromBufferAttribute(pos, i);
    if (p === PART.blindfold || p === PART.cap || p === PART.hair || (p === PART.skin && bind.y > 1.7)) out.push({ i, part: p, bind });
  }
  return out;
}

const centroid = (pts: Vector3[]): Vector3 => pts.reduce((a, b) => a.add(b), new Vector3()).divideScalar(Math.max(1, pts.length));

describe('Nurse Shaw head assembly (nurse.glb)', () => {
  it('ships every head part (blindfold, cap, hair, face)', () => {
    const { visual, mesh } = posed(null, 0);
    try {
      const counts = new Map<number, number>();
      for (const v of headVertices(mesh)) counts.set(v.part, (counts.get(v.part) ?? 0) + 1);
      for (const p of [PART.skin, PART.blindfold, PART.cap, PART.hair]) expect(counts.get(p) ?? 0, `part ${p}`).toBeGreaterThan(50);
    } finally { visual.dispose(); }
  });

  it('binds cleanly: with no animation, skinned positions equal the raw mesh (bind matrices are sane)', () => {
    const { visual, mesh } = posed(null, 0);
    try {
      mesh.pose();
      mesh.skeleton.update();
      let worst = 0;
      const v = new Vector3();
      for (const h of headVertices(mesh)) {
        mesh.getVertexPosition(h.i, v);
        worst = Math.max(worst, v.distanceTo(h.bind));
      }
      expect(worst).toBeLessThan(0.001);
    } finally { visual.dispose(); }
  });

  it('places the blindfold across the front of the face and the cap on top (bind pose)', () => {
    const { visual, mesh } = posed(null, 0);
    try {
      const vs = headVertices(mesh);
      const face = centroid(vs.filter((v) => v.part === PART.skin).map((v) => v.bind.clone()));
      const band = vs.filter((v) => v.part === PART.blindfold).map((v) => v.bind.clone());
      const cap = centroid(vs.filter((v) => v.part === PART.cap).map((v) => v.bind.clone()));
      const bandC = centroid(band.map((p) => p.clone()));
      // Centred on the face side to side (the defect put it ~10 cm off).
      expect(Math.abs(bandC.x - face.x), 'blindfold lateral offset').toBeLessThan(0.015);
      // It wraps the head: it reaches further forward (-Z) than the face skin's front at eye height.
      const eyeSkin = vs.filter((v) => v.part === PART.skin && Math.abs(v.bind.y - bandC.y) < 0.02).map((v) => v.bind.z);
      expect(Math.min(...band.map((p) => p.z)), 'blindfold in front of the face').toBeLessThan(Math.min(...eyeSkin));
      expect(cap.y, 'cap above the blindfold').toBeGreaterThan(bandC.y + 0.04);
      expect(Math.abs(cap.x - face.x), 'cap lateral offset').toBeLessThan(0.025);
    } finally { visual.dispose(); }
  });

  it.each(POSES)('keeps the blindfold, cap, hair and face together on the head bone in %s at %s s', (clip, seconds) => {
    const { visual, mesh } = posed(clip, seconds);
    try {
      const head = mesh.skeleton.bones.find((b: Bone) => b.name === 'head')!;
      const index = mesh.skeleton.bones.indexOf(head);
      // Rigid head transform in the skinning formula: bindMatrixInverse * boneMatrix * boneInverse * bindMatrix.
      const rigid = new Matrix4().copy(mesh.matrixWorld).multiply(mesh.bindMatrixInverse).multiply(head.matrixWorld)
        .multiply(mesh.skeleton.boneInverses[index]!).multiply(mesh.bindMatrix);
      const world = new Vector3();
      let worst = 0;
      let worstPart = -1;
      for (const h of headVertices(mesh)) {
        mesh.getVertexPosition(h.i, world).applyMatrix4(mesh.matrixWorld);
        const expected = h.bind.clone().applyMatrix4(rigid);
        const d = world.distanceTo(expected);
        if (d > worst) { worst = d; worstPart = h.part; }
      }
      expect(worst, `worst drift ${(worst * 1000).toFixed(1)} mm on part ${worstPart}`).toBeLessThan(0.003);
      // And the head really moved in this pose (the check is not vacuous).
      const still = new Matrix4().copy(mesh.matrixWorld);
      expect(new Vector3(0, 1.75, 0).applyMatrix4(rigid).distanceTo(new Vector3(0, 1.75, 0).applyMatrix4(still)), 'head moved').toBeGreaterThan(0.005);
    } finally { visual.dispose(); }
  });
});
