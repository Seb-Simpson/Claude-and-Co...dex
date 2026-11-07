import { type BufferGeometry, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry, Vector3 } from 'three';
import type { ObjectId } from '../../contracts';
import type { AddOptions, Part, WorldBuilder } from '../core/builder';
import { at } from '../core/geometry';
import type { MaterialKey } from '../core/materials';
import type { SignStyle } from '../core/textures';

/** Placement of a prop: floor position and facing yaw (prop front faces local +Z). */
export interface Place { readonly x: number; readonly z: number; readonly yaw: number; readonly y?: number }

export const basis = (p: Place): Matrix4 => new Matrix4().makeRotationY(p.yaw).setPosition(p.x, p.y ?? 0, p.z);

/** World matrix for a local transform inside a placed prop. */
export function local(p: Place, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0): Matrix4 {
  return basis(p).multiply(at(x, y, z, ry, rx, rz));
}

export function put(b: WorldBuilder, p: Place, material: MaterialKey, geometry: BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, options: AddOptions = {}): void {
  b.add(material, geometry, local(p, x, y, z, ry, rx, rz), options);
}

export function worldPoint(p: Place, x: number, y: number, z: number): Vector3 {
  return new Vector3(x, y, z).applyMatrix4(basis(p));
}

/** Box collider in prop-local coordinates. */
export function collide(b: WorldBuilder, p: Place, roomId: ObjectId, x: number, y: number, z: number, sx: number, sy: number, sz: number, extraYaw = 0): ObjectId {
  const c = worldPoint(p, x, y, z);
  return b.solid(c.x, c.y, c.z, sx, sy, sz, { yaw: p.yaw + extraYaw, roomId, kind: 'prop' });
}

/** Local-space part for mergedObject groups. */
export function part(material: MaterialKey, geometry: BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, options?: AddOptions): Part {
  return { material, geometry, matrix: at(x, y, z, ry, rx, rz), ...(options ? { options } : {}) };
}

/** A flat sign with its own canvas texture (falls back to a flat colour without DOM). */
export function sign(b: WorldBuilder, text: string, style: SignStyle, width: number, height: number, matrix: Matrix4, options: { emissive?: boolean; canvas?: [number, number] } = {}): Mesh {
  const [cw, ch] = options.canvas ?? [512, Math.max(64, Math.round((512 * height) / width))];
  const texture = b.textures.sign(text, style, cw, ch);
  const material = options.emissive
    ? new MeshBasicMaterial({ color: 0xffffff, ...(texture ? { map: texture } : { color: style.background }), fog: true })
    : new MeshLambertMaterial({ color: 0xffffff, ...(texture ? { map: texture } : { color: style.background }) });
  b.materials.adopt(material);
  const geometry = b.own(new PlaneGeometry(width, height));
  const mesh = new Mesh(geometry, material);
  mesh.name = `nw:sign:${text}`;
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(matrix);
  mesh.matrixWorldNeedsUpdate = true;
  b.attach(mesh);
  return mesh;
}

export const SIGN_ROOM: SignStyle = { background: '#24476a', foreground: '#f2f4f2', border: '#d8dee2', worn: 0.4 };
export const SIGN_WARNING: SignStyle = { background: '#c6a22a', foreground: '#1b1b1b', border: '#1b1b1b', worn: 0.6 };
export const SIGN_DANGER: SignStyle = { background: '#9e1c1a', foreground: '#f4efe8', border: '#f4efe8', worn: 0.5 };
export const SIGN_EXIT: SignStyle = { background: '#0d8a3c', foreground: '#eaffea', worn: 0.1 };
export const SIGN_PAPER: SignStyle = { background: '#ece7d6', foreground: '#2a2a2a', worn: 0.8, font: '600 40px "Marker Felt", "Comic Sans MS", sans-serif' };
