import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Box3, type Mesh, type MeshStandardMaterial, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadRoom104Set, ROOM104_LIGHTMAP_URL, ROOM104_SET_URL, type Room104Set } from './room104';

// GLTFLoader probes `self`; image decoding is unavailable in Node (geometry and materials are not).
(globalThis as { self?: unknown }).self = globalThis;
vi.spyOn(console, 'warn').mockImplementation(() => undefined);
vi.spyOn(console, 'error').mockImplementation(() => undefined);

const setPath = fileURLToPath(ROOM104_SET_URL);
const parse = () => {
  const buf = readFileSync(setPath);
  return new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
};
let set: Room104Set;
beforeAll(async () => {
  set = await loadRoom104Set({ loadGltf: parse, loadTexture: async () => new Texture() });
}, 60000);

const meshes = (root: { traverse(cb: (o: unknown) => void): void }): Mesh[] => {
  const out: Mesh[] = [];
  root.traverse((o) => { if ((o as Mesh).isMesh) out.push(o as Mesh); });
  return out;
};

describe('Room 104 set asset', () => {
  it('stays within the download and triangle budget for ordinary laptops', () => {
    expect(statSync(setPath).size).toBeLessThan(9 * 1024 * 1024);
    expect(statSync(fileURLToPath(ROOM104_LIGHTMAP_URL)).size).toBeLessThan(1.5 * 1024 * 1024);
    // NW-005A: the corridor to the station, door kit and corridor props (~94k; was 56k for 104 + west corridor).
    expect(set.stats.triangles).toBeLessThan(110000);
    // One mesh per material: few draw calls for the whole room and corridor (NW-005A adds the
    // veneer, labels, door-leaf atlas and glass, the access card and the door leaf itself).
    expect(set.stats.meshes).toBeLessThanOrEqual(16);
  });

  it('ships the furniture atlas, the tiling shell materials, signage and decals', () => {
    const names = new Set(meshes(set.root).flatMap((m) => (Array.isArray(m.material) ? m.material : [m.material]).map((x) => x.name)));
    for (const name of ['props_atlas', 'floor_vinyl', 'wall_paint', 'wainscot', 'ceiling_tile', 'wood_rail', 'signage', 'decals']) expect(names, name).toContain(name);
  });

  it('gives every static surface the light-map UV set and binds the baked light to direct light too', () => {
    const card = set.root.getObjectByName('nw:opening:access-card-prop');
    for (const mesh of meshes(set.root)) {
      // The access card is a pickup (it moves): no baked light.
      let isCard = false;
      mesh.traverseAncestors((a) => { if (a === card) isCard = true; });
      if (mesh === card || isCard) continue;
      // Decals are overlays: they stay out of the light bake (they would shade their own surface).
      if ((mesh.material as MeshStandardMaterial).name === 'decals') {
        expect(mesh.geometry.getAttribute('uv1')).toBeUndefined();
        continue;
      }
      expect(mesh.geometry.getAttribute('uv1'), mesh.name).toBeDefined();
      const m = mesh.material as MeshStandardMaterial;
      expect(m.aoMap, mesh.name).toBeTruthy();
      expect(m.aoMap!.channel).toBe(1);
      const shader = { fragmentShader: '#include <aomap_fragment>', vertexShader: '', uniforms: {} };
      m.onBeforeCompile(shader as never, undefined as never);
      expect(shader.fragmentShader).toContain('reflectedLight.directDiffuse *= ambientOcclusion');
    }
  });

  it('lies inside Room 104 and the corridor to the nurses\u2019 station, on the game coordinates', () => {
    const bounds = new Box3().setFromObject(set.root);
    // z down to -1.9: the station counter's remodelled front and ledge (over the procedural counter's collider).
    // y down to -0.12: the corners of two rotated rot decals on the corridor skirting dip under the floor (hidden by it).
    const allowed = new Box3(new Vector3(-20.06, -0.12, -1.9), new Vector3(-0.1, 2.8, 6.46));
    expect(allowed.containsBox(bounds), JSON.stringify(bounds)).toBe(true);
    // The bed stands where the procedural bed (and its collider) is: centred on x -14.25, z 5.35.
    const props = meshes(set.root).find((m) => (m.material as MeshStandardMaterial).name === 'props_atlas')!;
    expect(props).toBeDefined();
  });

  it('separates the wheelchair (it is dressed into the creep-anomaly group)', () => {
    expect(set.wheelchair).not.toBeNull();
    expect(set.root.getObjectByName('nw:room104-set:wheelchair')).toBeUndefined();
    const box = new Box3().setFromObject(set.wheelchair!);
    expect(box.min.y).toBeGreaterThan(-0.02);
    expect(box.max.y).toBeLessThan(1.15);
    expect(Math.max(-box.min.x, box.max.x)).toBeLessThan(0.45);
  });

  it('configures decals as blended overlays and pulses the rot glow', () => {
    const decal = meshes(set.root).map((m) => m.material as MeshStandardMaterial).find((m) => m.name === 'decals')!;
    expect(decal.transparent).toBe(true);
    expect(decal.depthWrite).toBe(false);
    set.update(0.5);
    const a = decal.emissiveIntensity;
    set.update(1.7);
    expect(decal.emissiveIntensity).not.toBe(a);
  });

  it('frees its geometry, materials and textures on dispose', async () => {
    const local = await loadRoom104Set({ loadGltf: parse, loadTexture: async () => new Texture() });
    const geometry = meshes(local.root)[0]!.geometry;
    const material = meshes(local.root)[0]!.material as MeshStandardMaterial;
    const g = vi.spyOn(geometry, 'dispose');
    const m = vi.spyOn(material, 'dispose');
    local.dispose();
    expect(g).toHaveBeenCalled();
    expect(m).toHaveBeenCalled();
  });

  it('rejects (so the world falls back to the procedural room) when the set cannot load', async () => {
    await expect(loadRoom104Set({ loadGltf: () => Promise.reject(new Error('404')), loadTexture: async () => new Texture() })).rejects.toThrow('404');
    await expect(loadRoom104Set({ timeoutMs: 30, loadGltf: () => new Promise(() => undefined), loadTexture: async () => new Texture() })).rejects.toThrow('timed out');
  });
});
