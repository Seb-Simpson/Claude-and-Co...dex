import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  Group,
  type Material,
  Matrix4,
  Skeleton,
  SkinnedMesh,
  Sphere,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Procedural humanoid skeleton shared by every entity. Bodies are built from simple parts that
 * are rigidly (or softly near joints) skinned to bones, then merged into one SkinnedMesh per
 * material: four entities cost a handful of draw calls instead of dozens of loose meshes.
 *
 * Model convention: feet at y = 0, facing -Z (the same convention as Codex's entity nodes, whose
 * rotation points -Z along the direction of travel).
 */
export const JOINTS = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'upperArmL', 'forearmL', 'handL',
  'shoulderR', 'upperArmR', 'forearmR', 'handR',
  'thighL', 'shinL', 'footL',
  'thighR', 'shinR', 'footR',
] as const;
export type JointName = (typeof JOINTS)[number];

const PARENT: Record<JointName, JointName | null> = {
  hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  shoulderL: 'chest', upperArmL: 'shoulderL', forearmL: 'upperArmL', handL: 'forearmL',
  shoulderR: 'chest', upperArmR: 'shoulderR', forearmR: 'upperArmR', handR: 'forearmR',
  thighL: 'hips', shinL: 'thighL', footL: 'shinL',
  thighR: 'hips', shinR: 'thighR', footR: 'shinR',
};

export interface BodyDims {
  readonly hipHeight: number;
  readonly hipWidth: number;
  readonly thigh: number;
  readonly shin: number;
  readonly spine: number;
  readonly chest: number;
  readonly neck: number;
  readonly head: number;
  readonly shoulderWidth: number;
  /** Height of the shoulder joints above the chest bone, as a fraction of chest length. */
  readonly shoulderHeight?: number;
  readonly upperArm: number;
  readonly forearm: number;
  /** Ankle height above the sole (used for ground contact). */
  readonly ankle: number;
}

export type Euler3 = readonly [number, number, number];
/** Joint rotations (radians, XYZ order) plus an optional hips offset. Missing joints are zero. */
export type Pose = { readonly [K in JointName]?: Euler3 } & { readonly hipsOffset?: Euler3 };

export interface RigPart {
  readonly bone: JointName;
  readonly material: string;
  /** Geometry in bone-local space (bone origin at the joint, limbs extend toward -Y). */
  readonly geometry: BufferGeometry;
  /**
   * Soft skinning near the joint: vertices within `blend` metres of the bone origin share weight
   * with the parent bone. Ignored when `weights` is supplied.
   */
  readonly blend?: number;
  /** Custom weighting for cloth that spans bones (local position in model space at bind). */
  readonly weights?: (modelPosition: Vector3) => readonly [JointName, number, JointName, number];
  /** Per-part vertex tint multiplier. */
  readonly tint?: readonly [number, number, number];
}

export interface ContactSpec {
  readonly bone: JointName;
  /** Offset in bone-local space of the point that touches the floor. */
  readonly offset: Vector3;
}

export interface Rig {
  readonly model: Group;
  readonly bones: Readonly<Record<JointName, Bone>>;
  readonly meshes: readonly SkinnedMesh[];
  readonly dims: BodyDims;
  readonly rest: Readonly<Record<JointName, Vector3>>;
  readonly contacts: readonly ContactSpec[];
  /** Apply a pose, then drop/raise the hips so the lowest contact sits on the floor. */
  apply(pose: Pose, groundClamp?: boolean): void;
  /** Model-space position of a bone-local point (after the last apply). */
  pointOf(bone: JointName, offset?: Vector3, target?: Vector3): Vector3;
  dispose(): void;
}

function restPositions(d: BodyDims): Record<JointName, Vector3> {
  const sh = d.shoulderHeight ?? 0.85;
  return {
    hips: new Vector3(0, d.hipHeight, 0),
    spine: new Vector3(0, 0.04, 0),
    chest: new Vector3(0, d.spine, 0),
    neck: new Vector3(0, d.chest, 0),
    head: new Vector3(0, d.neck, 0),
    shoulderL: new Vector3(-d.shoulderWidth / 2, d.chest * sh, 0),
    upperArmL: new Vector3(0, 0, 0),
    forearmL: new Vector3(0, -d.upperArm, 0),
    handL: new Vector3(0, -d.forearm, 0),
    shoulderR: new Vector3(d.shoulderWidth / 2, d.chest * sh, 0),
    upperArmR: new Vector3(0, 0, 0),
    forearmR: new Vector3(0, -d.upperArm, 0),
    handR: new Vector3(0, -d.forearm, 0),
    thighL: new Vector3(-d.hipWidth / 2, -0.02, 0),
    shinL: new Vector3(0, -d.thigh, 0),
    footL: new Vector3(0, -d.shin, 0),
    thighR: new Vector3(d.hipWidth / 2, -0.02, 0),
    shinR: new Vector3(0, -d.thigh, 0),
    footR: new Vector3(0, -d.shin, 0),
  };
}

const tmp = new Vector3();
const tmpMatrix = new Matrix4();

export function createRig(name: string, dims: BodyDims, parts: readonly RigPart[], materials: Readonly<Record<string, Material>>, contacts?: readonly ContactSpec[]): Rig {
  const rest = restPositions(dims);
  const bones = {} as Record<JointName, Bone>;
  for (const joint of JOINTS) {
    const bone = new Bone();
    bone.name = `${name}:${joint}`;
    bone.position.copy(rest[joint]);
    bones[joint] = bone;
  }
  for (const joint of JOINTS) {
    const parent = PARENT[joint];
    if (parent) bones[parent].add(bones[joint]);
  }
  const model = new Group();
  model.name = `${name}:model`;
  model.add(bones.hips);
  model.updateMatrixWorld(true);

  const index = new Map<JointName, number>(JOINTS.map((j, i) => [j, i]));
  const byMaterial = new Map<string, BufferGeometry[]>();
  for (const part of parts) {
    const source = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
    part.geometry.dispose();
    const bindMatrix = bones[part.bone].matrixWorld;
    const local = source.getAttribute('position') as BufferAttribute;
    const count = local.count;
    const skinIndex = new Uint16Array(count * 4);
    const skinWeight = new Float32Array(count * 4);
    const colors = new Float32Array(count * 3);
    const parent = PARENT[part.bone] ?? part.bone;
    for (let i = 0; i < count; i++) {
      tmp.fromBufferAttribute(local, i);
      let a: JointName = part.bone;
      let wa = 1;
      let b: JointName = parent;
      let wb = 0;
      if (part.weights) {
        const world = tmp.clone().applyMatrix4(bindMatrix);
        [a, wa, b, wb] = part.weights(world);
      } else if (part.blend && part.blend > 0) {
        // Bone-local y: 0 at the joint, negative along the limb.
        const t = Math.min(1, Math.max(0, -tmp.y / part.blend));
        wb = 0.5 * (1 - t);
        wa = 1 - wb;
      }
      skinIndex[i * 4] = index.get(a)!;
      skinIndex[i * 4 + 1] = index.get(b)!;
      skinWeight[i * 4] = wa;
      skinWeight[i * 4 + 1] = wb;
      const tint = part.tint ?? [1, 1, 1];
      colors[i * 3] = tint[0]; colors[i * 3 + 1] = tint[1]; colors[i * 3 + 2] = tint[2];
    }
    source.applyMatrix4(bindMatrix);
    source.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4));
    source.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4));
    source.setAttribute('color', new BufferAttribute(colors, 3));
    if (!source.getAttribute('uv')) source.setAttribute('uv', new BufferAttribute(new Float32Array(count * 2), 2));
    for (const key of Object.keys(source.attributes)) {
      if (!['position', 'normal', 'uv', 'color', 'skinIndex', 'skinWeight'].includes(key)) source.deleteAttribute(key);
    }
    const list = byMaterial.get(part.material) ?? [];
    list.push(source);
    byMaterial.set(part.material, list);
  }

  const skeleton = new Skeleton(JOINTS.map((j) => bones[j]));
  const meshes: SkinnedMesh[] = [];
  const height = dims.hipHeight + dims.spine + dims.chest + dims.neck + dims.head;
  for (const [key, list] of byMaterial) {
    const material = materials[key];
    if (!material) throw new Error(`Entity material "${key}" missing`);
    const geometry = list.length === 1 ? list[0]! : mergeGeometries(list, false);
    if (list.length > 1) list.forEach((g) => g.dispose());
    const mesh = new SkinnedMesh(geometry, material);
    mesh.name = `${name}:${key}`;
    mesh.bind(skeleton, new Matrix4());
    // Animated limbs leave the bind-pose bounds; use a generous fixed sphere for culling.
    mesh.boundingSphere = new Sphere(new Vector3(0, height * 0.5, 0), Math.max(1.6, height));
    mesh.frustumCulled = true;
    model.add(mesh);
    meshes.push(mesh);
  }

  const contactList: readonly ContactSpec[] = contacts ?? [
    { bone: 'footL', offset: new Vector3(0, -dims.ankle, 0) },
    { bone: 'footR', offset: new Vector3(0, -dims.ankle, 0) },
  ];
  const inverseModel = new Matrix4();
  let disposed = false;

  const rig: Rig = {
    model,
    bones,
    meshes,
    dims,
    rest,
    contacts: contactList,
    apply(pose, groundClamp = true) {
      for (const joint of JOINTS) {
        const r = pose[joint];
        if (r) bones[joint].rotation.set(r[0], r[1], r[2]);
        else bones[joint].rotation.set(0, 0, 0);
      }
      const o = pose.hipsOffset ?? [0, 0, 0];
      bones.hips.position.set(rest.hips.x + o[0], rest.hips.y + o[1], rest.hips.z + o[2]);
      if (!groundClamp) return;
      bones.hips.updateMatrixWorld(true);
      let lowest = Infinity;
      for (const c of contactList) lowest = Math.min(lowest, rig.pointOf(c.bone, c.offset, tmp).y);
      if (Number.isFinite(lowest)) bones.hips.position.y -= lowest;
      bones.hips.updateMatrixWorld(true);
    },
    pointOf(bone, offset, target = new Vector3()) {
      // Model-space: hips' parent is the model, so walk matrices relative to the model.
      model.updateMatrixWorld(false);
      inverseModel.copy(model.matrixWorld).invert();
      tmpMatrix.multiplyMatrices(inverseModel, bones[bone].matrixWorld);
      return target.copy(offset ?? new Vector3()).applyMatrix4(tmpMatrix);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const mesh of meshes) mesh.geometry.dispose();
      skeleton.dispose();
      model.removeFromParent();
    },
  };
  rig.apply({}, true);
  return rig;
}
