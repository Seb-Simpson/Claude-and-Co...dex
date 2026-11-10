import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Box3, type Mesh, type MeshStandardMaterial, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createHospitalWorld } from '../createHospitalWorld';
import { STATION_PROPS } from '../stealth/layout';
import { PROTOTYPE_SUPPRESSION, STATION_REGIONS, STATION_SUPPRESSION } from './regions';
import { loadStationSet, STATION_SET_NODES, STATION_SET_URL, type StationSet } from './station';
import manifest from './assets/station_set.json';

/** NW-006A: the Blender Nurses' Station set, its budget, and its fit to the gameplay colliders. */
(globalThis as { self?: unknown }).self = globalThis;
vi.spyOn(console, 'warn').mockImplementation(() => undefined);
const PATH = fileURLToPath(STATION_SET_URL);
let set: StationSet;
beforeAll(async () => {
  const buf = readFileSync(PATH);
  set = await loadStationSet({ loadGltf: () => new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '') });
}, 60000);

const bounds = (name: string): Box3 => {
  const node = set.root.getObjectByName(name);
  expect(node, name).toBeDefined();
  set.root.updateMatrixWorld(true);
  return new Box3().setFromObject(node!);
};
const boxOf = (p: { centre: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } }): Box3 =>
  new Box3(new Vector3(p.centre.x - p.size.x / 2, p.centre.y - p.size.y / 2, p.centre.z - p.size.z / 2), new Vector3(p.centre.x + p.size.x / 2, p.centre.y + p.size.y / 2, p.centre.z + p.size.z / 2));

describe('Nurses’ Station set (Blender)', () => {
  it('stays inside its budget: under 40k triangles, 2 MiB, three materials', () => {
    expect(set.stats.triangles).toBeLessThan(40_000);
    expect(set.stats.triangles).toBe(manifest.triangles);
    expect(statSync(PATH).size).toBe(manifest.bytes);
    expect(manifest.bytes).toBeLessThan(2 * 1024 * 1024);
    expect(set.stats.materials).toBe(3);
  });

  it('ships every named prop node', () => {
    for (const name of STATION_SET_NODES) expect(set.root.getObjectByName(name), name).toBeDefined();
  });

  it('fits each floor prop\u2019s footprint to its gameplay collider (inside it, and filling it)', () => {
    const pairs = [
      ['station_linen_trolley', STATION_PROPS.trolley], ['station_cabinet_a', STATION_PROPS.cabinetA], ['station_cabinet_b', STATION_PROPS.cabinetB],
      ['station_supply_cupboard', STATION_PROPS.cupboard], ['station_obs_machine', STATION_PROPS.obsMachine],
    ] as const;
    for (const [name, prop] of pairs) {
      const art = bounds(name);
      // Footprint (x/z) within 3.5 cm of the collider; height is only bounded below (records left on
      // top of the cabinets stand above their collider; the trolley's height is pinned separately).
      const collider = boxOf(prop).expandByScalar(0.035);
      collider.max.y = Infinity;
      expect(collider.containsBox(art), `${name} ${JSON.stringify(art)}`).toBe(true);
      const a = art.getSize(new Vector3());
      expect(a.x / prop.size.x, `${name} x fill`).toBeGreaterThan(0.85);
      expect(a.z / prop.size.z, `${name} z fill`).toBeGreaterThan(0.85);
    }
  });

  it('keeps the trolley at the tested 1.2 m cover height, its cover on the station side', () => {
    const art = bounds('station_linen_trolley');
    expect(art.max.y).toBeLessThan(STATION_PROPS.trolley.size.y + 0.015);
    expect(art.max.y).toBeGreaterThan(STATION_PROPS.trolley.size.y - 0.02);
    expect(art.min.y).toBeGreaterThanOrEqual(-0.001);
  });

  it('lights the Room 104 call lamp and keeps the contact shadows transparent', () => {
    const led = (set.root.getObjectByName('station_call_led') as Mesh).material as MeshStandardMaterial;
    expect(led.emissiveIntensity).toBeGreaterThan(1);
    const shadow = (set.root.getObjectByName('station_contact_shadows') as Mesh).material as MeshStandardMaterial;
    expect(shadow.transparent).toBe(true);
    expect(shadow.depthWrite).toBe(false);
  });
});

describe('Nurses’ Station stand-in suppression', () => {
  const REFS = new Set(['object', 'material', 'canvas', 'redraw', 'leaf', 'mesh', 'left', 'right', 'group', 'panel']);
  const strip = (value: unknown): string => JSON.stringify(value, (k, v: unknown) => (REFS.has(k) ? '[ref]' : typeof v === 'function' ? '[fn]' : v));
  const base = createHospitalWorld({ textures: false });
  const dressed = createHospitalWorld({ textures: false, suppressVisuals: [...PROTOTYPE_SUPPRESSION, ...STATION_SUPPRESSION] });
  const roomOnly = createHospitalWorld({ textures: false, suppressVisuals: PROTOTYPE_SUPPRESSION });

  it('keeps every gameplay record identical (the colliders stay)', () => {
    for (const key of ['colliders', 'interactables', 'doors', 'hidingLocations', 'entitySpawns', 'patrolRoutes', 'rooms', 'bounds', 'playerSpawn'] as const) {
      expect(strip(dressed.world[key]), key).toBe(strip(base.world[key]));
    }
    expect(strip(dressed.extras.fixtures)).toBe(strip(base.extras.fixtures));
  });

  it('leaves out only the stand-ins, all inside the station regions', () => {
    const extra = dressed.suppressed.length - roomOnly.suppressed.length;
    // 12 trolley pieces, 2 x 5 cabinet pieces, 1 cupboard, 3 obs machine pieces.
    expect(extra).toBe(26);
    const regions = Object.values(STATION_REGIONS);
    const station = dressed.suppressed.filter((p) => regions.some((r) => r.containsPoint(p.center as never)));
    expect(station).toHaveLength(26);
    expect(station.some((p) => p.material === 'wall')).toBe(false);
  });
});
