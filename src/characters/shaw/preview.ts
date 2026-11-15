import {
  BackSide, Box3, Color, DirectionalLight, type Fog, type FogExp2, Group, HemisphereLight, type Material, Mesh,
  MeshBasicMaterial, type Object3D, SphereGeometry, Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GameModule } from '../../contracts';

/**
 * NW-R04A first visual checkpoint: an isolated, static preview of the new Nurse Shaw model inside
 * the real NIGHT WARD scene (`?preview=shaw`). It only adds a prop and a camera override; it does not
 * replace the gameplay nurse model, spawn AI or change any other module. The GLB is produced by
 * `tools/character/shaw` (MakeHuman CC0 base mesh + Blender).
 */
export const SHAW_PREVIEW_URL = new URL('./assets/shaw-r04a-preview.glb', import.meta.url).href;

/** Main corridor, west of the nurses' station (clear of props), near the south wall; she faces east (+X). */
export const SHAW_POSITION = new Vector3(-11.5, 0, 0.9);
export const SHAW_YAW = Math.PI / 2;

export type ShawView = 'front' | 'front34' | 'side' | 'back34' | 'back' | 'face' | 'head-side' | 'head-back' | 'hands' | 'skirt-side' | 'gameplay' | 'gameplay-near' | 'free';
export type ShawLighting = 'ward' | 'studio';

interface ViewPreset {
  /** Camera offset in Shaw's frame: x = her front, y = up, z = her left. */
  readonly eye: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fov: number;
}

// Her front is local +X after the yaw; her left side faces the corridor centre (-Z world).
export const SHAW_VIEWS: Readonly<Record<Exclude<ShawView, 'free'>, ViewPreset>> = {
  front: { eye: [2.4, 1.0, 0], target: [0, 0.95, 0], fov: 60 },
  front34: { eye: [1.95, 1.05, 1.35], target: [0, 0.95, 0], fov: 60 },
  side: { eye: [0, 1.0, 2.15], target: [0, 0.95, 0], fov: 60 },
  back34: { eye: [-1.95, 1.05, 1.35], target: [0, 0.95, 0], fov: 60 },
  back: { eye: [-2.4, 1.0, 0], target: [0, 0.95, 0], fov: 60 },
  face: { eye: [0.72, 1.74, 0.12], target: [0, 1.71, 0.02], fov: 38 },
  'head-side': { eye: [0.02, 1.76, 0.78], target: [0, 1.72, 0], fov: 38 },
  'head-back': { eye: [-0.74, 1.78, 0.14], target: [0, 1.72, 0], fov: 38 },
  hands: { eye: [0.62, 0.98, 0.55], target: [0.02, 0.84, 0.22], fov: 40 },
  'skirt-side': { eye: [0, 0.85, 1.55], target: [0, 0.82, 0], fov: 45 },
  gameplay: { eye: [7.0, 1.65, 0.9], target: [0, 1.2, 0], fov: 70 },
  'gameplay-near': { eye: [3.0, 1.65, 0.7], target: [0, 1.3, 0], fov: 70 },
};

export interface ShawPreviewDiagnostics {
  readonly ready: boolean;
  readonly error: string | null;
  readonly loadMs: number;
  readonly triangles: number;
  readonly meshes: number;
  readonly materials: number;
  readonly textures: number;
  readonly heightMetres: number;
  readonly view: ShawView;
  readonly lighting: ShawLighting;
}

export interface ShawPreviewApi {
  setView(view: ShawView): void;
  setLighting(lighting: ShawLighting): void;
  diagnostics(): ShawPreviewDiagnostics;
}

export interface ShawPreviewOptions {
  readonly url?: string;
  readonly onReady?: (api: ShawPreviewApi) => void;
}

/** Camera world pose for a preset (pure; unit-tested). */
export function shawViewPose(view: Exclude<ShawView, 'free'>, position = SHAW_POSITION, yaw = SHAW_YAW): { eye: Vector3; target: Vector3; fov: number } {
  const preset = SHAW_VIEWS[view];
  // Her frame: front = rotate(+Z, yaw), left = rotate(+X, yaw) (glTF model faces +Z, left is +X).
  const front = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const left = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const at = (p: readonly [number, number, number]) =>
    position.clone().addScaledVector(front, p[0]).add(new Vector3(0, p[1], 0)).addScaledVector(left, p[2]);
  return { eye: at(preset.eye), target: at(preset.target), fov: preset.fov };
}

function countTextures(materials: Set<Material>): number {
  const textures = new Set<unknown>();
  for (const material of materials) {
    for (const value of Object.values(material as unknown as Record<string, unknown>)) {
      if (value && typeof value === 'object' && (value as { isTexture?: boolean }).isTexture) textures.add(value);
    }
  }
  return textures.size;
}

export function createShawPreviewModule(options: ShawPreviewOptions = {}): GameModule {
  return {
    id: 'night-ward:shaw-preview',
    kind: 'horror',
    async setup({ engine }) {
      const { scene, camera } = engine;
      const started = performance.now();
      let view: ShawView = 'front';
      let lighting: ShawLighting = 'ward';
      let error: string | null = null;
      let model: Object3D | null = null;
      let stats = { triangles: 0, meshes: 0, materials: 0, textures: 0, heightMetres: 0 };
      const previousFov = camera.fov;

      // Neutral studio: grey cyclorama + key/fill/rim, used to judge form and colour without the ward.
      const studio = new Group();
      studio.name = 'shaw-preview-studio';
      const backdrop = new Mesh(new SphereGeometry(3.2, 32, 16), new MeshBasicMaterial({ color: 0x3a3b3d, side: BackSide, fog: false }));
      backdrop.position.copy(SHAW_POSITION).add(new Vector3(0, 1, 0));
      const key = new DirectionalLight(0xfff4e8, 2.4); key.position.set(2, 3, 2);
      const fill = new DirectionalLight(0xdfe6ff, 0.8); fill.position.set(-2.5, 1.5, 1.5);
      const rim = new DirectionalLight(0xffffff, 1.4); rim.position.set(-1, 2.5, -3);
      const sky = new HemisphereLight(0xd8dce4, 0x2a2622, 0.6);
      for (const light of [key, fill, rim]) {
        light.position.applyAxisAngle(new Vector3(0, 1, 0), SHAW_YAW).add(SHAW_POSITION);
        light.target.position.copy(SHAW_POSITION).add(new Vector3(0, 1, 0));
        studio.add(light.target);
      }
      studio.add(backdrop, key, fill, rim, sky);
      studio.visible = false;
      scene.add(studio);
      let savedFog: Fog | FogExp2 | null = null;
      let savedBackground: typeof scene.background = null;
      // Studio mode hides the ward itself (walls are within 2 m of her) and restores it afterwards.
      const hidden: Object3D[] = [];

      try {
        const gltf = await new GLTFLoader().loadAsync(options.url ?? SHAW_PREVIEW_URL);
        model = gltf.scene;
        model.name = 'shaw-preview';
        model.position.copy(SHAW_POSITION);
        model.rotation.y = SHAW_YAW;
        const materials = new Set<Material>();
        let triangles = 0, meshes = 0;
        model.traverse((node) => {
          if (!(node instanceof Mesh)) return;
          meshes += 1;
          const geometry = node.geometry;
          triangles += (geometry.index ? geometry.index.count : geometry.attributes.position!.count) / 3;
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
        });
        scene.add(model);
        model.updateMatrixWorld(true);
        const size = new Box3().setFromObject(model).getSize(new Vector3());
        stats = { triangles, meshes, materials: materials.size, textures: countTextures(materials), heightMetres: size.y };
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
        console.error('[shaw-preview] model failed to load', cause);
      }
      const loadMs = performance.now() - started;

      const api: ShawPreviewApi = {
        setView(next) { view = next; if (next === 'free') { camera.fov = previousFov; camera.updateProjectionMatrix(); } },
        setLighting(next) {
          if (next === lighting) return;
          lighting = next;
          studio.visible = next === 'studio';
          if (next === 'studio') {
            savedFog = scene.fog as Fog | FogExp2 | null; savedBackground = scene.background;
            scene.fog = null; scene.background = new Color(0x3a3b3d);
            for (const child of scene.children) {
              if (child === model || child === studio || child === camera || !child.visible) continue;
              child.visible = false; hidden.push(child);
            }
          } else {
            scene.fog = savedFog; scene.background = savedBackground;
            for (const child of hidden.splice(0)) child.visible = true;
          }
        },
        diagnostics: () => ({ ready: model !== null, error, loadMs, ...stats, view, lighting }),
      };
      options.onReady?.(api);

      return {
        update() {
          if (view === 'free') return;
          // Runs after the player module (appended last), so the preset wins for this frame's render.
          const pose = shawViewPose(view);
          camera.position.copy(pose.eye);
          camera.lookAt(pose.target);
          if (camera.fov !== pose.fov) { camera.fov = pose.fov; camera.updateProjectionMatrix(); }
        },
        dispose() {
          if (lighting === 'studio') api.setLighting('ward');
          scene.remove(studio);
          backdrop.geometry.dispose(); (backdrop.material as Material).dispose();
          if (model) {
            scene.remove(model);
            model.traverse((node) => {
              if (!(node instanceof Mesh)) return;
              node.geometry.dispose();
              for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
                for (const value of Object.values(material as unknown as Record<string, unknown>)) {
                  if (value && typeof value === 'object' && (value as { isTexture?: boolean }).isTexture) (value as { dispose(): void }).dispose();
                }
                material.dispose();
              }
            });
          }
          camera.fov = previousFov; camera.updateProjectionMatrix();
        },
      };
    },
  };
}
