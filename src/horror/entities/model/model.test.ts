import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AnimationMixer, Group, type Mesh, type SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { JOINTS } from '../rig';
import type { BodiedEntityType } from '../visual';
import { MODEL_MANIFESTS, MODEL_URLS } from './assets';
import { type LoadedModel, loadModelLibrary, MODEL_ENTITIES, type ModelEntity } from './library';
import { CLIP_FOR_STATE, createModelVisual, fadeFor } from './modelVisual';

// GLTFLoader probes `self`; texture decoding is unavailable in Node, geometry/skins/clips are not.
(globalThis as { self?: unknown }).self = globalThis;
vi.spyOn(console, 'warn').mockImplementation(() => undefined);
vi.spyOn(console, 'error').mockImplementation(() => undefined);

const path = (entity: ModelEntity): string => fileURLToPath(MODEL_URLS[entity]);
async function parse(entity: ModelEntity) {
  const buf = readFileSync(path(entity));
  return new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
}
const models = new Map<ModelEntity, LoadedModel>();
beforeAll(async () => {
  const library = await loadModelLibrary({ urls: MODEL_URLS, manifests: MODEL_MANIFESTS, load: async (url) => parse(MODEL_ENTITIES.find((e) => MODEL_URLS[e] === url)!) });
  expect(library.failures).toEqual({});
  for (const e of MODEL_ENTITIES) models.set(e, library.get(e)!);
}, 60000);

const skinned = (root: { traverse(cb: (o: unknown) => void): void }): SkinnedMesh[] => {
  const out: SkinnedMesh[] = [];
  root.traverse((o) => { if ((o as SkinnedMesh).isSkinnedMesh) out.push(o as SkinnedMesh); });
  return out;
};

describe('entity GLB assets', () => {
  it.each(MODEL_ENTITIES)('%s ships one skinned mesh on the 19-joint skeleton with every manifest clip', (entity) => {
    const model = models.get(entity)!;
    const meshes = skinned(model.scene);
    expect(meshes).toHaveLength(1);
    const mesh = meshes[0]!;
    expect(Array.isArray(mesh.material)).toBe(false);
    expect(mesh.skeleton.bones.map((b) => b.name).sort()).toEqual([...JOINTS].sort());
    for (const clip of MODEL_MANIFESTS[entity].clips) {
      const anim = model.clips.get(clip.name)!;
      expect(anim, clip.name).toBeDefined();
      expect(Math.abs(anim.duration - clip.duration)).toBeLessThan(0.1);
      // In-place clips: only the hips may translate, and only a little (bob/sway, no root motion).
      for (const track of anim.tracks.filter((t) => t.name.endsWith('.position') && !t.name.startsWith('hips.'))) {
        const v = track.values;
        for (let i = 3; i < v.length; i += 3) expect(Math.abs(v[i]! - v[0]!) + Math.abs(v[i + 1]! - v[1]!) + Math.abs(v[i + 2]! - v[2]!)).toBeLessThan(1e-3);
      }
    }
  });

  it.each(MODEL_ENTITIES)('%s stays within the triangle and download budget', (entity) => {
    const m = MODEL_MANIFESTS[entity];
    expect(m.triangles).toBeLessThan(26000);
    expect(statSync(path(entity)).size).toBeLessThan(2.6 * 1024 * 1024);
    const index = skinned(models.get(entity)!.scene)[0]!.geometry.index;
    expect(index ? index.count / 3 : 0).toBeLessThanOrEqual(m.triangles + 10);
  });

  it('keeps the authored scale: heights match the Blender sculpts', () => {
    expect(MODEL_MANIFESTS.patient.height).toBeGreaterThan(2.1);
    expect(MODEL_MANIFESTS.watcher.height).toBeGreaterThan(2.3);
    expect(MODEL_MANIFESTS.nurse.height).toBeGreaterThan(1.75);
    expect(MODEL_MANIFESTS.nurse.height).toBeLessThan(2.05);
    expect(MODEL_MANIFESTS.crawler.height).toBeLessThan(0.95);
  });
});

describe('floor contact across every clip (CPU-skinned vertices)', () => {
  const lowestPoint = (entity: ModelEntity, clipName: string, t: number): number => {
    const model = models.get(entity)!;
    const root = cloneSkinned(model.scene);
    const mixer = new AnimationMixer(root);
    mixer.clipAction(model.clips.get(clipName)!).play();
    mixer.setTime(t);
    root.updateMatrixWorld(true);
    const mesh = skinned(root)[0]!;
    const position = mesh.geometry.getAttribute('position');
    const v = new Vector3();
    let lowest = Infinity;
    for (let i = 0; i < position.count; i += 5) {
      mesh.getVertexPosition(i, v);
      v.applyMatrix4(mesh.matrixWorld);
      lowest = Math.min(lowest, v.y);
    }
    mixer.uncacheRoot(root);
    return lowest;
  };

  it.each(MODEL_ENTITIES.flatMap((e) => MODEL_MANIFESTS[e].clips.map((c) => [e, c.name] as const)))('%s %s neither floats nor sinks', (entity, clipName) => {
    const clip = MODEL_MANIFESTS[entity].clips.find((c) => c.name === clipName)!;
    const samples = 8;
    for (let k = 0; k < samples; k++) {
      const t = (k / samples) * clip.duration;
      const lowest = lowestPoint(entity, clipName, t);
      expect(lowest, `${entity}/${clipName} @${t.toFixed(2)}s`).toBeGreaterThan(-0.045);
      expect(lowest, `${entity}/${clipName} @${t.toFixed(2)}s`).toBeLessThan(0.05);
    }
  });
});

describe('model visual', () => {
  const visual = (type: BodiedEntityType) => {
    const node = new Group();
    node.position.set(4, 0, -3);
    node.rotation.y = 0.8;
    const v = createModelVisual(type, models.get(type)!, { seed: 1 });
    node.add(v.object);
    return { node, v };
  };

  it('maps every presentation state of every entity to a shipped clip', () => {
    for (const type of ['patient', 'nurse', 'crawler', 'watcher'] as const) {
      const names = new Set(MODEL_MANIFESTS[type].clips.map((c) => c.name));
      for (const clip of Object.values(CLIP_FOR_STATE[type])) expect(names.has(clip), `${type}:${clip}`).toBe(true);
    }
  });

  it('never moves the gameplay-owned node and keeps its own root in place', () => {
    const { node, v } = visual('patient');
    const before = { p: node.position.clone(), q: node.quaternion.clone() };
    for (const [behaviour, speed] of [['patrol', 0.75], ['pursue', 4.1], ['search', 0.4], ['idle', 0]] as const) {
      for (let i = 0; i < 90; i++) v.update(1 / 60, { behaviour, speed });
    }
    expect(node.position.equals(before.p)).toBe(true);
    expect(node.quaternion.equals(before.q)).toBe(true);
    expect(v.object.position.lengthSq()).toBe(0);
    v.dispose();
  });

  it('stalks, snaps to alert, then lunges into the sprint', () => {
    const { v } = visual('patient');
    for (let i = 0; i < 60; i++) v.update(1 / 60, { behaviour: 'patrol', speed: 0.75 });
    expect(v.visualState).toBe('walk');
    v.update(1 / 60, { behaviour: 'pursue', speed: 0 });
    expect(v.visualState).toBe('alert');
    expect(fadeFor('patient', 'walk', 'alert')).toBeLessThan(0.1);
    for (let i = 0; i < 50; i++) v.update(1 / 60, { behaviour: 'pursue', speed: 4.1 });
    expect(v.visualState).toBe('run');
    v.dispose();
  });

  it('times footsteps from the clips and scales them with gameplay speed', () => {
    const count = (speed: number) => {
      const { v } = visual('patient');
      let steps = 0;
      for (let i = 0; i < 4 * 60; i++) steps += v.update(1 / 60, { behaviour: 'patrol', speed }).length;
      v.dispose();
      return steps;
    };
    const slow = count(0.75);
    const fast = count(1.4);
    expect(slow).toBeGreaterThanOrEqual(3);
    expect(slow).toBeLessThanOrEqual(5);
    expect(fast).toBeGreaterThan(slow);
  });

  it('changes the Watcher pose only while unobserved, instantly', () => {
    const { v } = visual('watcher');
    const head = () => v.bonePosition('head').clone();
    for (let i = 0; i < 30; i++) v.update(0.1, { behaviour: 'idle', speed: 0, observed: true });
    const watched = head();
    for (let i = 0; i < 200; i++) v.update(0.1, { behaviour: 'idle', speed: 0, observed: true });
    expect(head().distanceTo(watched)).toBeLessThan(0.03);
    let moved = false;
    for (let i = 0; i < 300 && !moved; i++) {
      v.update(0.1, { behaviour: 'idle', speed: 0, observed: false });
      moved = head().distanceTo(watched) > 0.05;
    }
    expect(moved).toBe(true);
    expect(fadeFor('watcher', 'stand', 'stand')).toBe(0);
    v.dispose();
  });

  it('frees its mixer, per-instance materials and skeleton bone textures on dispose', () => {
    const { node, v } = visual('crawler');
    const mats: { dispose(): void }[] = [];
    v.object.traverse((o) => { if ((o as Mesh).isMesh) mats.push((o as Mesh).material as never); });
    const spies = mats.map((m) => vi.spyOn(m, 'dispose'));
    // Cloned skeletons own a bone-matrix texture once rendered; leaking it grew GPU textures on every restart.
    const skeletons = skinned(v.object).map((m) => vi.spyOn(m.skeleton, 'dispose'));
    expect(skeletons.length).toBeGreaterThan(0);
    v.update(0.1, { behaviour: 'patrol', speed: 0.6 });
    v.dispose();
    spies.forEach((s) => expect(s).toHaveBeenCalled());
    skeletons.forEach((s) => expect(s).toHaveBeenCalled());
    expect(node.children).toHaveLength(0);
  });
});

describe('model library failures', () => {
  it('reports a failed model and still loads the others', async () => {
    const library = await loadModelLibrary({
      urls: MODEL_URLS, manifests: MODEL_MANIFESTS,
      load: async (url) => {
        if (url === MODEL_URLS.nurse) throw new Error('404 Not Found');
        return parse(MODEL_ENTITIES.find((e) => MODEL_URLS[e] === url)!);
      },
    });
    expect(library.failures.nurse).toContain('404');
    expect(library.get('nurse')).toBeUndefined();
    expect(library.get('patient')).toBeDefined();
    library.dispose();
    expect(library.get('patient')).toBeUndefined();
  });

  it('times out a model that never arrives', async () => {
    const library = await loadModelLibrary({ urls: MODEL_URLS, manifests: MODEL_MANIFESTS, timeoutMs: 50, load: () => new Promise(() => undefined) });
    expect(Object.keys(library.failures).sort()).toEqual([...MODEL_ENTITIES].sort());
  });
});
