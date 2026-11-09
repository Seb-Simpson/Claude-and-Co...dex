import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Box3, type Mesh, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createHospitalWorld } from '../createHospitalWorld';
import { OPENING_BINDINGS } from '../opening';
import { dressDoors } from './doors';
import { DRESSED_DOORS, PROTOTYPE_SUPPRESSION } from './regions';
import { loadRoom104Set, ROOM104_SET_URL, type Room104Set } from './room104';

/** NW-005A door kit: the Blender leaf replaces the procedural leaf visuals inside each door group. */
(globalThis as { self?: unknown }).self = globalThis;
vi.spyOn(console, 'warn').mockImplementation(() => undefined);
vi.spyOn(console, 'error').mockImplementation(() => undefined);
let set: Room104Set;
beforeAll(async () => {
  const buf = readFileSync(fileURLToPath(ROOM104_SET_URL));
  set = await loadRoom104Set({
    loadGltf: () => new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), ''),
    loadTexture: async () => new Texture(),
  });
}, 60000);

const localBounds = (group: { children: unknown[] }, filter: (m: Mesh) => boolean): Box3 => {
  const box = new Box3();
  for (const c of group.children as Mesh[]) {
    c.updateMatrixWorld(true);
    c.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh || !filter(m)) return;
      m.geometry.computeBoundingBox();
      // Child-to-group transform.
      const rel = c.matrix.clone().multiply(c.matrixWorld.clone().invert()).multiply(m.matrixWorld);
      box.union(m.geometry.boundingBox!.clone().applyMatrix4(rel));
    });
  }
  return box;
};

describe('door kit', () => {
  it('ships one shared leaf in the door-group frame (hinge at the origin, 1.1 x 2.08 m)', () => {
    expect(set.doorLeaf).toBeTruthy();
    const b = new Box3().setFromObject(set.doorLeaf!);
    expect(b.min.x).toBeGreaterThan(-0.05);
    expect(b.max.x).toBeGreaterThan(1.05);
    expect(b.max.x).toBeLessThan(1.15);
    expect(b.max.y).toBeGreaterThan(2.0);
    expect(b.min.y).toBeGreaterThan(-0.01);
    expect(Math.max(-b.min.z, b.max.z)).toBeLessThan(0.15);
  });

  it('dresses every corridor door of the set, matching each procedural leaf, and restores cleanly', () => {
    const h = createHospitalWorld({ textures: false, suppressVisuals: PROTOTYPE_SUPPRESSION });
    try {
      const procedural = new Map(h.world.doors.map((d) => [d.id, localBounds(d.object, () => true)]));
      const dressed = dressDoors(h.world, set.doorLeaf!);
      expect([...dressed.doors].sort()).toEqual(Object.keys(DRESSED_DOORS).sort());
      for (const id of dressed.doors) {
        const group = h.world.doors.find((d) => d.id === id)!.object;
        const hidden = group.children.filter((c) => (c as Mesh).isMesh && !c.visible);
        expect(hidden.length, id).toBeGreaterThan(0);
        const leaf = group.children.find((c) => c.name === `nw:door-leaf:${id}`)!;
        expect(leaf, id).toBeDefined();
        // The Blender leaf runs from the hinge the same way as the procedural leaf did.
        const before = procedural.get(id)!.getCenter(new Vector3());
        const after = new Box3().setFromObject(leaf).applyMatrix4(group.matrixWorld.clone().invert()).getCenter(new Vector3());
        expect(Math.sign(after.x), id).toBe(Math.sign(before.x));
        expect(Math.abs(after.x - before.x), id).toBeLessThan(0.1);
      }
      // Colliders and markers are untouched: the door records are the same objects as before.
      const undressed = h.world.doors.filter((d) => !dressed.doors.includes(d.id));
      for (const d of undressed) expect(d.object.children.every((c) => c.visible), d.id).toBe(true);
      dressed.restore();
      for (const id of dressed.doors) {
        const group = h.world.doors.find((d) => d.id === id)!.object;
        expect(group.children.some((c) => c.name.startsWith('nw:door-leaf:')), id).toBe(false);
        expect(group.children.every((c) => c.visible), id).toBe(true);
      }
    } finally { h.dispose(); }
  });

  it('places the access card prop where the binding says, named for gameplay to hide on pickup', () => {
    const card = set.root.getObjectByName('nw:opening:access-card-prop');
    expect(card).toBeTruthy();
    const c = new Box3().setFromObject(card!).getCenter(new Vector3());
    const want = OPENING_BINDINGS.find((b) => b.key === 'access-card')!.position;
    expect(Math.hypot(c.x - want.x, c.z - want.z)).toBeLessThan(0.15);
    expect(c.y).toBeLessThan(0.02);
  });
});
