import { type Group, type Material, type Mesh, type MeshStandardMaterial, type Object3D, type Texture } from 'three';
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { type PreloadEntry, takePreloaded } from '../../assets/preload';
import stationManifest from './assets/station_set.json';

/**
 * NW-006A: the Nurses' Station set (built by dressing/pipeline/station_set.py in Blender): the
 * linen trolley over the crouch-cover collider, the records corner (filing cabinets, supply
 * cupboard, nurse-call annunciator), the observations machine, the glove dispenser and the
 * paperwork. One baked atlas (AO in the colour), lit at runtime by the station's own lights.
 * The colliders and the procedural stand-ins live in src/world/rooms/stealthStation.ts.
 */
export const STATION_SET_URL = new URL('./assets/station_set.glb', import.meta.url).href;

/** Named nodes in the set (game coordinates). */
export const STATION_SET_NODES = [
  'station_linen_trolley', 'station_cabinet_a', 'station_cabinet_b', 'station_supply_cupboard', 'station_annunciator',
  'station_obs_machine', 'station_glove_dispenser', 'station_paperwork', 'station_call_led', 'station_contact_shadows',
  // NW-007B: readable print (annunciator faceplate, Room 104 record, keypad) and the console display.
  'station_print', 'station_call_lcd',
] as const;

export interface StationSet {
  readonly root: Group;
  readonly stats: { readonly triangles: number; readonly meshes: number; readonly materials: number; readonly textures: number };
  update(dt: number): void;
  dispose(): void;
}

export interface LoadStationSetOptions {
  readonly url?: string;
  readonly timeoutMs?: number;
  readonly maxAnisotropy?: number;
  /** Injected for tests (Node has no fetch for file URLs). */
  readonly loadGltf?: (url: string) => Promise<GLTF>;
}

export async function loadStationSet(options: LoadStationSetOptions = {}): Promise<StationSet> {
  const url = options.url ?? STATION_SET_URL;
  const load = options.loadGltf ?? ((u: string) => {
    const buffer = takePreloaded(u);
    return buffer ? new GLTFLoader().parseAsync(buffer, '') : new GLTFLoader().loadAsync(u);
  });
  const timeout = options.timeoutMs ?? 20000;
  const gltf = await new Promise<GLTF>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Nurses' Station set timed out after ${timeout} ms`)), timeout);
    load(url).then((v) => { clearTimeout(timer); resolve(v); }, (e: unknown) => { clearTimeout(timer); reject(e instanceof Error ? e : new Error(String(e))); });
  });
  const root = gltf.scene;
  root.name = 'nw:station-set';
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  const leds: MeshStandardMaterial[] = [];
  let triangles = 0;
  let meshes = 0;
  root.traverse((o: Object3D) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    meshes += 1;
    const index = mesh.geometry.index;
    triangles += (index ? index.count : mesh.geometry.getAttribute('position').count) / 3;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const m = material as MeshStandardMaterial;
      materials.add(m);
      for (const t of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.emissiveMap]) {
        if (!t) continue;
        textures.add(t);
        t.anisotropy = Math.min(8, options.maxAnisotropy ?? 1);
      }
      // No environment map: let the steel's own grey show (same treatment as the Room 104 set).
      if (m.name === 'station_atlas') m.metalness = 0.4;
      if (m.name === 'call_led') { m.emissive.setRGB(1, 0.08, 0.04); m.emissiveIntensity = 1.4; leds.push(m); }
      // NW-007B: the console display glows faintly (never enough to light the desk).
      if (m.name === 'station_lcd') { m.emissive.setRGB(1, 1, 1); m.emissiveIntensity = 0.9; m.roughness = 0.3; }
      if (m.name === 'station_labels') m.metalness = 0;
      if (m.name === 'station_contact_shadow') {
        m.transparent = true;
        m.depthWrite = false;
        m.polygonOffset = true;
        m.polygonOffsetFactor = -2;
        m.polygonOffsetUnits = -2;
        mesh.renderOrder = 1;
      }
      m.needsUpdate = true;
    }
  });
  let time = 0;
  let disposed = false;
  return {
    root,
    stats: { triangles: Math.round(triangles), meshes, materials: materials.size, textures: textures.size },
    update(dt) {
      // Room 104's call lamp: a slow, steady blink (a call nobody answered), never bright enough to light the wall.
      time += dt;
      const on = Math.sin(time * Math.PI * 0.8) > -0.2;
      for (const m of leds) m.emissiveIntensity = on ? 1.4 : 0.25;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      root.traverse((c) => { const mesh = c as Mesh; if (mesh.isMesh) mesh.geometry.dispose(); });
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
    },
  };
}

export function stationPreloads(): PreloadEntry[] {
  return [{ url: STATION_SET_URL, bytes: stationManifest.bytes, label: 'Nurses’ Station set' }];
}
