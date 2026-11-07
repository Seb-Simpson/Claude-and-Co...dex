import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';

/** Centered box. UVs are replaced by the batcher (world or local metric projection). */
export function box(width: number, height: number, depth: number): BufferGeometry {
  return new BoxGeometry(width, height, depth);
}

export function cylinder(radiusTop: number, radiusBottom: number, height: number, segments = 10, openEnded = false): BufferGeometry {
  return new CylinderGeometry(radiusTop, radiusBottom, height, segments, 1, openEnded);
}

export function sphere(radius: number, widthSegments = 10, heightSegments = 6): BufferGeometry {
  return new SphereGeometry(radius, widthSegments, heightSegments);
}

export function torus(radius: number, tube: number, radialSegments = 6, tubularSegments = 14, arc = Math.PI * 2): BufferGeometry {
  return new TorusGeometry(radius, tube, radialSegments, tubularSegments, arc);
}

/** Vertical plane facing +Z. */
export function plane(width: number, height: number, widthSegments = 1, heightSegments = 1): BufferGeometry {
  return new PlaneGeometry(width, height, widthSegments, heightSegments);
}

/** Cylinder spanning two world points (pipes, rails, wires). */
export function cylinderBetween(a: Vector3, b: Vector3, radius: number, segments = 8): { geometry: BufferGeometry; matrix: Matrix4 } {
  const direction = new Vector3().subVectors(b, a);
  const length = Math.max(direction.length(), 1e-4);
  const geometry = cylinder(radius, radius, length, segments, true);
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize());
  const matrix = new Matrix4().compose(new Vector3().addVectors(a, b).multiplyScalar(0.5), q, new Vector3(1, 1, 1));
  return { geometry, matrix };
}

const tmpEuler = new Euler();
const tmpQuat = new Quaternion();
const tmpPos = new Vector3();
const tmpScale = new Vector3();

/** Compose a transform: translation, then YXZ-ordered rotation (radians), optional scale. */
export function at(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1): Matrix4 {
  tmpEuler.set(rx, ry, rz, 'YXZ');
  tmpQuat.setFromEuler(tmpEuler);
  return new Matrix4().compose(tmpPos.set(x, y, z), tmpQuat, tmpScale.set(sx, sy, sz));
}

/** Combine a parent transform with a child transform (parent * child). */
export function chain(parent: Matrix4, child: Matrix4): Matrix4 {
  return new Matrix4().multiplyMatrices(parent, child);
}

export function yawQuaternion(yaw: number): { x: number; y: number; z: number; w: number } {
  const half = yaw / 2;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

export const IDENTITY_QUATERNION = { x: 0, y: 0, z: 0, w: 1 } as const;
