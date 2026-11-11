import {readAssetBytes} from '../../../assets/preload';
import type { AnimationClip, Group, Material, Mesh, Texture } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { JointName } from '../rig';

/** Entities that ship as Blender-built GLB models. */
export type ModelEntity = 'patient' | 'nurse' | 'crawler' | 'watcher' | 'reflection';
export const MODEL_ENTITIES: readonly ModelEntity[] = ['patient', 'nurse', 'crawler', 'watcher', 'reflection'];

/** Per-clip metadata written by the Blender pipeline (`*.manifest.json`). */
export interface ClipManifest {
  readonly name: string;
  readonly state: string;
  readonly duration: number;
  readonly loop: boolean;
  /** Speed (m/s) the clip was authored at; gait playback is scaled by actual speed / this. */
  readonly speed: number;
  readonly cycles: number;
  /** Contact events (footsteps, hand plants) in clip time. */
  readonly steps: readonly { readonly time: number; readonly bone: JointName }[];
}

export interface EntityModelManifest {
  readonly entity: ModelEntity;
  readonly glb: string;
  readonly triangles: number;
  readonly vertices: number;
  readonly bytes: number;
  readonly texture: number;
  readonly height: number;
  readonly bones: readonly string[];
  readonly clips: readonly ClipManifest[];
}

export interface LoadedModel {
  readonly entity: ModelEntity;
  /** Shared template; instances are cloned with SkeletonUtils, never mutated directly. */
  readonly scene: Group;
  readonly clips: ReadonlyMap<string, AnimationClip>;
  readonly manifest: EntityModelManifest;
}

export interface ModelLibrary {
  get(entity: ModelEntity): LoadedModel | undefined;
  /** Entities that failed to load, with the reason (they fall back to procedural bodies). */
  readonly failures: Readonly<Partial<Record<ModelEntity, string>>>;
  dispose(): void;
}

export type GltfLoad = (url: string) => Promise<GLTF>;

export interface LoadModelLibraryOptions {
  readonly urls: Readonly<Partial<Record<ModelEntity, string>>>;
  readonly manifests: Readonly<Partial<Record<ModelEntity, EntityModelManifest>>>;
  readonly load?: GltfLoad;
  /** Per-model timeout (ms). */
  readonly timeoutMs?: number;
}

const withTimeout = <T>(promise: Promise<T>, ms: number, what: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
    promise.then((v) => { clearTimeout(timer); resolve(v); }, (e: unknown) => { clearTimeout(timer); reject(e); });
  });

const defaultLoad: GltfLoad = async (url) => new GLTFLoader().parseAsync(await readAssetBytes(url), '');

/** Free every GPU-side resource reachable from a loaded scene. */
export function disposeScene(scene: Group): void {
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(m);
  });
  for (const m of materials) {
    for (const value of Object.values(m)) if (value && (value as Texture).isTexture) textures.add(value as Texture);
    m.dispose();
  }
  for (const t of textures) t.dispose();
}

/**
 * Loads every entity model in parallel. Each failure (missing file, bad data, timeout) is recorded
 * and does not stop the others; the caller falls back to the procedural body for that entity.
 */
export async function loadModelLibrary(options: LoadModelLibraryOptions): Promise<ModelLibrary> {
  const load = options.load ?? defaultLoad;
  const loaded = new Map<ModelEntity, LoadedModel>();
  const failures: Partial<Record<ModelEntity, string>> = {};
  await Promise.all(MODEL_ENTITIES.map(async (entity) => {
    const url = options.urls[entity];
    const manifest = options.manifests[entity];
    if (!url || !manifest) { failures[entity] = 'no asset registered'; return; }
    try {
      const gltf = await withTimeout(load(url), options.timeoutMs ?? 20000, `${entity} model`);
      const clips = new Map(gltf.animations.map((c) => [c.name, c] as const));
      const missing = manifest.clips.filter((c) => !clips.has(c.name)).map((c) => c.name);
      if (missing.length) throw new Error(`missing clips: ${missing.join(', ')}`);
      loaded.set(entity, { entity, scene: gltf.scene, clips, manifest });
    } catch (error) {
      failures[entity] = error instanceof Error ? error.message : String(error);
    }
  }));
  let disposed = false;
  return {
    get: (entity) => (disposed ? undefined : loaded.get(entity)),
    failures,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const model of loaded.values()) disposeScene(model.scene);
      loaded.clear();
    },
  };
}
