import { BoxGeometry, BufferGeometry, CylinderGeometry, Quaternion, SphereGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Small geometry builders in bone-local space. Limbs hang from the joint along -Y. */

const nonIndexed = (g: BufferGeometry): BufferGeometry => {
  if (!g.index) return g;
  const n = g.toNonIndexed();
  g.dispose();
  return n;
};

export function merge(parts: BufferGeometry[]): BufferGeometry {
  const list = parts.map((p) => {
    const g = nonIndexed(p);
    for (const key of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(key)) g.deleteAttribute(key);
    return g;
  });
  const merged = mergeGeometries(list, false);
  list.forEach((g) => g.dispose());
  return merged;
}

/** Tapered limb from y=0 down to y=-length, with rounded ends. */
export function limb(length: number, rTop: number, rBottom: number, segments = 8, options: { offset?: Vector3; caps?: boolean } = {}): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const shaft = new CylinderGeometry(rTop, rBottom, length, segments, 3, true);
  shaft.translate(0, -length / 2, 0);
  parts.push(shaft);
  if (options.caps ?? true) {
    parts.push(new SphereGeometry(rTop, segments, 5).translate(0, 0, 0));
    parts.push(new SphereGeometry(rBottom, segments, 5).translate(0, -length, 0));
  }
  const g = merge(parts);
  if (options.offset) g.translate(options.offset.x, options.offset.y, options.offset.z);
  return g;
}

/** Ellipsoid centred at (x, y, z) with radii (rx, ry, rz). */
export function blob(rx: number, ry: number, rz: number, x = 0, y = 0, z = 0, w = 10, h = 7): BufferGeometry {
  const g = nonIndexed(new SphereGeometry(1, w, h));
  g.scale(rx, ry, rz);
  g.translate(x, y, z);
  return g;
}

export function block(sx: number, sy: number, sz: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): BufferGeometry {
  const g = nonIndexed(new BoxGeometry(sx, sy, sz));
  g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

/** Open tapered tube (cloth). y from 0 down to -length, radius X/Z can differ (ellipse). */
export function skirt(length: number, topRx: number, topRz: number, bottomRx: number, bottomRz: number, rings = 6, segments = 14, flare = 0): BufferGeometry {
  const g = new CylinderGeometry(1, 1, length, segments, rings, true);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = (length / 2 - y) / length; // 0 top, 1 bottom
    const rx = topRx + (bottomRx - topRx) * t;
    const rz = topRz + (bottomRz - topRz) * t;
    const angle = Math.atan2(pos.getZ(i), pos.getX(i));
    const ripple = flare * t * Math.sin(angle * 7);
    pos.setX(i, Math.cos(angle) * (rx + ripple));
    pos.setZ(i, Math.sin(angle) * (rz + ripple));
    pos.setY(i, y - length / 2);
  }
  g.computeVertexNormals();
  return nonIndexed(g);
}

/** A hand with long fingers: palm block plus finger cylinders, hanging down. */
export function hand(palm: number, finger: number, width: number, splay = 0.08, curl = 0.25): BufferGeometry {
  const parts: BufferGeometry[] = [nonIndexed(new BoxGeometry(width, palm, width * 0.38)).translate(0, -palm / 2, 0)];
  for (let i = 0; i < 4; i++) {
    const x = -width / 2 + width * 0.12 + i * (width * 0.76) / 3;
    const f = new CylinderGeometry(0.008, 0.006, finger, 5, 1);
    f.translate(0, -finger / 2, 0);
    f.rotateX(curl);
    f.rotateZ((i - 1.5) * splay);
    f.translate(x, -palm, 0);
    parts.push(f);
  }
  const thumb = new CylinderGeometry(0.009, 0.007, finger * 0.6, 5, 1);
  thumb.translate(0, -finger * 0.3, 0);
  thumb.rotateZ(0.6);
  thumb.rotateX(0.4);
  thumb.translate(-width / 2, -palm * 0.3, -0.01);
  parts.push(thumb);
  return merge(parts);
}

/** Foot extending forward (-Z) from the ankle. */
export function foot(length: number, width: number, height: number, ankle: number): BufferGeometry {
  return merge([
    nonIndexed(new BoxGeometry(width, height, length)).translate(0, -ankle + height / 2, -length * 0.32),
    nonIndexed(new SphereGeometry(width * 0.55, 6, 4)).translate(0, -ankle * 0.4, 0.02),
  ]);
}

/** Thin strand (hair, straps, wires) between two bone-local points. */
export function strand(a: Vector3, b: Vector3, radius: number): BufferGeometry {
  const d = new Vector3().subVectors(b, a);
  const length = Math.max(1e-4, d.length());
  const g = new CylinderGeometry(radius * 0.6, radius, length, 4, 1, true);
  g.translate(0, length / 2, 0);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize()));
  g.translate(a.x, a.y, a.z);
  return nonIndexed(g);
}
