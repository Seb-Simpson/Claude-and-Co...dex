import {
  type Group, type Material, type Mesh, type MeshStandardMaterial, NoColorSpace, type Object3D, type Texture, TextureLoader,
} from 'three';
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { type PreloadEntry, takePreloaded } from '../../assets/preload';
import setManifest from './assets/room104_set.json';

/** Built by src/world/dressing/pipeline (Blender): see README there. Vite fingerprints both files. */
export const ROOM104_SET_URL = new URL('./assets/room104_set.glb', import.meta.url).href;
export const ROOM104_LIGHTMAP_URL = new URL('./assets/room104_lightmap.jpg', import.meta.url).href;

export interface Room104Set {
  /** Static set: Room 104 shell + furniture and the west corridor, in world coordinates. */
  readonly root: Group;
  /** The Room 104 wheelchair in its own local frame (front +Z), to parent under the creep-anomaly group. */
  readonly wheelchair: Object3D | null;
  /**
   * NW-005A: the corridor door leaf in a door group's local frame (hinge at the origin, leaf along
   * +x, faces +/-z), to clone into each dressed door group (see dressing/doors.ts).
   */
  readonly doorLeaf: Object3D | null;
  /** NW-005A: the dropped staff access card, at its world position (named `nw:opening:access-card-prop`). */
  readonly accessCard: Object3D | null;
  readonly stats: { readonly triangles: number; readonly meshes: number; readonly materials: number; readonly textures: number };
  /** Slow pulse on the rot's cold glow. */
  update(dt: number): void;
  dispose(): void;
}

export interface LoadRoom104Options {
  readonly setUrl?: string;
  readonly lightmapUrl?: string;
  readonly timeoutMs?: number;
  /** Renderer anisotropy limit; tiling floor/wall/ceiling textures use up to 8. */
  readonly maxAnisotropy?: number;
  /** Injected for tests (Node has no fetch for file URLs). */
  readonly loadGltf?: (url: string) => Promise<GLTF>;
  readonly loadTexture?: (url: string) => Promise<Texture>;
}

const withTimeout = <T>(promise: Promise<T>, ms: number, what: string): Promise<T> => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
  promise.then((v) => { clearTimeout(timer); resolve(v); }, (e: unknown) => { clearTimeout(timer); reject(e instanceof Error ? e : new Error(String(e))); });
});

/**
 * The baked light/occlusion map normally only darkens indirect light (three applies aoMap to the
 * ambient term). Here it also attenuates direct light, so the bed, cabinet and corners keep their
 * baked contact shadows under the game's dynamic, unshadowed troffers. That stands in for
 * real-time shadow maps, which the engine leaves off.
 */
function bakeLightIntoDirect(material: MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <aomap_fragment>',
      `#include <aomap_fragment>
#ifdef USE_AOMAP
  reflectedLight.directDiffuse *= ambientOcclusion;
  reflectedLight.directSpecular *= mix( 1.0, ambientOcclusion, 0.85 );
#endif`,
    );
  };
  material.customProgramCacheKey = () => 'nw-room104-baked-light';
}

export async function loadRoom104Set(options: LoadRoom104Options = {}): Promise<Room104Set> {
  const timeout = options.timeoutMs ?? 20000;
  // Bytes the loading screen already streamed are parsed from memory (no second download).
  const loadGltf = options.loadGltf ?? ((url: string) => {
    const buffer = takePreloaded(url);
    return buffer ? new GLTFLoader().parseAsync(buffer, '') : new GLTFLoader().loadAsync(url);
  });
  const loadTexture = options.loadTexture ?? (async (url: string) => {
    const buffer = takePreloaded(url);
    if (!buffer || typeof URL.createObjectURL !== 'function') return new TextureLoader().loadAsync(url);
    const blobUrl = URL.createObjectURL(new Blob([buffer], { type: 'image/jpeg' }));
    try { return await new TextureLoader().loadAsync(blobUrl); } finally { URL.revokeObjectURL(blobUrl); }
  });
  const [gltf, lightmap] = await Promise.all([
    withTimeout(loadGltf(options.setUrl ?? ROOM104_SET_URL), timeout, 'Room 104 set'),
    withTimeout(loadTexture(options.lightmapUrl ?? ROOM104_LIGHTMAP_URL), timeout, 'Room 104 light map'),
  ]);
  // Same orientation convention as the glTF textures (the exporter already flipped TEXCOORD_1).
  lightmap.flipY = false;
  lightmap.colorSpace = NoColorSpace;
  lightmap.channel = 1;
  lightmap.needsUpdate = true;

  const root = gltf.scene;
  root.name = 'nw:room104-set';
  // Blender may suffix the node (wheelchair.001 -> "wheelchair001" after GLTFLoader sanitising).
  const found: Object3D[] = [];
  root.traverse((o) => { if (o.name.toLowerCase().startsWith('wheelchair')) found.push(o); });
  const wheelchair: Object3D | null = found[0] ?? null;
  if (wheelchair) {
    wheelchair.removeFromParent();
    wheelchair.name = 'nw:room104-set:wheelchair';
  }
  // NW-005A nodes: the door leaf (moving: no baked light) and the access card (a pickup).
  const take = (prefix: string): Object3D | null => {
    let hit: Object3D | null = null;
    root.traverse((o) => { if (!hit && o.name.toLowerCase().startsWith(prefix)) hit = o; });
    return hit;
  };
  const doorLeaf = take('doorleaf');
  if (doorLeaf) {
    doorLeaf.removeFromParent();
    doorLeaf.name = 'nw:room104-set:door-leaf';
  }
  const accessCard = take('access_card');
  if (accessCard) {
    accessCard.name = 'nw:opening:access-card-prop';
    // The card shares the labels material with baked props (reader face, intercom badge). Those
    // get the light map on UV channel 1; the card is a pickup with no light-map UVs, so on the
    // shared material it sampled the map at nothing and rendered almost black. Its own material
    // (same textures) takes the room's real light instead.
    accessCard.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const own = (mesh.material as MeshStandardMaterial).clone();
      own.name = 'opening_labels_card';
      mesh.material = own;
    });
  }
  const materials = new Set<Material>();
  const textures = new Set<Texture>([lightmap]);
  const glow: MeshStandardMaterial[] = [];
  let triangles = 0;
  let meshes = 0;
  const visit = (object: Object3D, baked: boolean): void => {
    object.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      meshes += 1;
      const index = mesh.geometry.index;
      triangles += (index ? index.count : mesh.geometry.getAttribute('position').count) / 3;
      mesh.matrixAutoUpdate = baked ? false : mesh.matrixAutoUpdate;
      if (baked) mesh.updateMatrix();
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const m = material as MeshStandardMaterial;
        materials.add(m);
        for (const t of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.emissiveMap]) {
          if (!t) continue;
          textures.add(t);
          t.anisotropy = Math.min(8, options.maxAnisotropy ?? 1);
        }
        if (baked && mesh.geometry.getAttribute('uv1')) {
          m.aoMap = lightmap;
          m.aoMapIntensity = 1;
          bakeLightIntoDirect(m);
        }
        // The engine has no environment map, so fully metallic texels have nothing to reflect and
        // render black (door plates, corner guards, bed frame). Scaling metalness lets the steel's
        // own grey show under the ward's lights while keeping its highlights.
        if (m.name === 'props_atlas' || m.name === 'doorleaf_atlas' || m.name === 'wheelchair_atlas') m.metalness = 0.4;
        if (m.name === 'reader_led') { m.emissive.setRGB(1, 0.08, 0.05); m.emissiveIntensity = 1.6; }
        if (m.name === 'decals') {
          m.transparent = true;
          m.depthWrite = false;
          m.polygonOffset = true;
          m.polygonOffsetFactor = -2;
          m.polygonOffsetUnits = -2;
          m.alphaTest = 0.02;
          mesh.renderOrder = 2;
          glow.push(m);
        }
        m.needsUpdate = true;
      }
    });
  };
  visit(root, true);
  if (wheelchair) visit(wheelchair, false);
  if (doorLeaf) visit(doorLeaf, false);
  if (accessCard) accessCard.traverse((o) => { o.matrixAutoUpdate = true; });

  let time = 0;
  let disposed = false;
  return {
    root,
    wheelchair,
    doorLeaf,
    accessCard,
    stats: { triangles: Math.round(triangles), meshes, materials: materials.size, textures: textures.size },
    update(dt) {
      time += dt;
      // The rot breathes: a cold glow along its youngest veins, never bright enough to light the room.
      const pulse = 0.55 + 0.35 * Math.sin(time * 0.7) + 0.1 * Math.sin(time * 2.3);
      for (const m of glow) m.emissiveIntensity = pulse;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      wheelchair?.removeFromParent();
      doorLeaf?.removeFromParent();
      for (const o of [root, ...(wheelchair ? [wheelchair] : []), ...(doorLeaf ? [doorLeaf] : [])]) {
        o.traverse((c) => { const mesh = c as Mesh; if (mesh.isMesh) mesh.geometry.dispose(); });
      }
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
    },
  };
}

/** The Room 104 set files, with their manifest sizes, for the loading screen's byte-tracked preload. */
export function room104Preloads(): PreloadEntry[] {
  return [
    { url: ROOM104_SET_URL, bytes: setManifest.bytes, label: 'Room 104 set' },
    { url: ROOM104_LIGHTMAP_URL, bytes: setManifest.lightmapBytes, label: 'Room 104 light map' },
  ];
}
