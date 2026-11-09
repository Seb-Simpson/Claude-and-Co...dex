import { Box3, type Mesh, type Object3D, Vector3 } from 'three';
import type { HospitalWorld } from '../../contracts';
import { DRESSED_DOORS } from './regions';

export interface DressedDoors {
  /** Door IDs that now show the Blender leaf. */
  readonly doors: readonly string[];
  /** Puts the procedural leaves back and removes the Blender ones. Idempotent. */
  restore(): void;
}

/**
 * NW-005A: swap the procedural door-leaf meshes of the corridor doors for the Blender leaf.
 *
 * Gameplay animates each door by rotating its group (`DoorMarker.object`) about the hinge, and
 * moves the door's kinematic collider with it. Both stay exactly as they are: the Blender leaf is
 * parented *inside* the same group, and the procedural meshes are only hidden. The group's local
 * frame has the hinge at the origin and the leaf along +x or -x (by hinge side) with faces +/-z;
 * the side is read from the procedural leaf's own bounds, so no door metadata is duplicated here.
 */
export function dressDoors(world: HospitalWorld, leaf: Object3D, ids: readonly string[] = Object.keys(DRESSED_DOORS)): DressedDoors {
  const hidden: Object3D[] = [];
  const added: Object3D[] = [];
  const dressed: string[] = [];
  for (const id of ids) {
    const group = world.doors.find((d) => d.id === id)?.object;
    if (!group) continue;
    const visible = group.children.filter((c) => c.visible && (c as Mesh).isMesh);
    if (visible.length === 0) continue;
    // Local bounds of the procedural leaf: which way does it run from the hinge?
    const bounds = new Box3();
    for (const c of visible) {
      const mesh = c as Mesh;
      mesh.geometry.computeBoundingBox();
      const b = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrix);
      bounds.union(b);
    }
    const centre = bounds.getCenter(new Vector3());
    const dir = centre.x >= 0 ? 1 : -1;
    for (const c of visible) { c.visible = false; hidden.push(c); }
    const clone = leaf.clone(true);
    clone.name = `nw:door-leaf:${id}`;
    clone.position.set(0, 0, 0);
    clone.rotation.set(0, 0, 0);
    // Mirroring flips the triangle winding; three.js compensates for a negative-determinant matrix.
    clone.scale.set(dir, 1, 1);
    group.add(clone);
    added.push(clone);
    dressed.push(id);
  }
  let restored = false;
  return {
    doors: dressed,
    restore() {
      if (restored) return;
      restored = true;
      for (const o of added) o.removeFromParent();
      for (const o of hidden) o.visible = true;
    },
  };
}
