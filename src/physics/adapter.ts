import RAPIER from '@dimforge/rapier3d-compat';
import type { ColliderDefinition, Pose, Vec3 } from '../contracts';

export interface CharacterOptions {
  position: Vec3;
  radius: number;
  height: number;
}
export interface CharacterBody {
  readonly radius: number;
  readonly height: number;
  getPosition(): Vec3;
  move(displacement: Vec3): { position: Vec3; grounded: boolean };
  canOccupy(position: Vec3, height?: number, ignoreColliderIds?: readonly string[]): boolean;
  setHeight(height: number): boolean;
  /** Only call after validating a destination. Does not sweep or add gravity. */
  setPosition(position: Vec3): void;
  setEnabled(enabled: boolean): void;
  dispose(): void;
}
export interface PhysicsAdapter {
  createCharacter(options: CharacterOptions): CharacterBody;
  isPositionFree(position: Vec3, radius: number, height: number, ignoreColliderIds?: readonly string[], includeCharacters?: boolean): boolean;
  isSegmentFree(from: Vec3, to: Vec3, radius: number, height: number, ignoreColliderIds?: readonly string[], includeCharacters?: boolean): boolean;
  /** World-solid visibility; actor capsules are deliberately excluded. */
  hasLineOfSight(from: Vec3, to: Vec3, ignoreColliderIds?: readonly string[]): boolean;
  /** Downward ray; origin is supplied by caller, returned point is on a walkable solid. */
  findGround(origin: Vec3, maxDrop?: number): Vec3 | null;
  hasSupport(position: Vec3, radius: number, maxDrop?: number): boolean;
  getColliderPose(id: string): Pose;
  /** Atomic prospective pose check. Rotating doors must also sample their angular sweep. */
  trySetColliderPoses(poses: readonly { id: string; pose: Pose }[]): boolean;
  dispose(): void;
}

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };
const ZERO = { x: 0, y: 0, z: 0 };
const SKIN = 0.003;
const PENETRATION_TOLERANCE = 0.001;
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: Vec3, n: number): Vec3 => ({ x: a.x * n, y: a.y * n, z: a.z * n });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
function finiteVector(value: Vec3): void {
  if (![value.x, value.y, value.z].every(Number.isFinite)) throw new Error('Physics vector must be finite');
}
function dimensions(radius: number, height: number): void {
  if (!Number.isFinite(radius) || !Number.isFinite(height) || radius <= 0 || height < 2 * radius) {
    throw new Error('Capsule requires positive radius and height >= diameter');
  }
}
function capsule(radius: number, height: number): RAPIER.Capsule {
  dimensions(radius, height);
  return new RAPIER.Capsule(height / 2 - radius, radius);
}
function center(feet: Vec3, height: number): Vec3 { return { x: feet.x, y: feet.y + height / 2, z: feet.z }; }
function rotate(v: Vec3, q: RAPIER.Rotation): Vec3 {
  // q * (v, 0) * inverse(q), for Rapier's normalized shape quaternions.
  const uv = { x: q.y * v.z - q.z * v.y, y: q.z * v.x - q.x * v.z, z: q.x * v.y - q.y * v.x };
  const uuv = { x: q.y * uv.z - q.z * uv.y, y: q.z * uv.x - q.x * uv.z, z: q.x * uv.y - q.y * uv.x };
  return add(v, add(scale(uv, 2 * q.w), scale(uuv, 2)));
}
/** Separating-plane rejection for a translated upright capsule and a rotated box. */
function boxSeparates(obstacle: RAPIER.Collider, shape: RAPIER.Capsule, from: Vec3, to: Vec3, clearance: number): boolean {
  const box = obstacle.shape;
  if (!(box instanceof RAPIER.Cuboid)) return false;
  const origin = obstacle.translation();
  const axes: readonly [Vec3, number][] = [
    [{ x: 1, y: 0, z: 0 }, box.halfExtents.x],
    [{ x: 0, y: 1, z: 0 }, box.halfExtents.y],
    [{ x: 0, y: 0, z: 1 }, box.halfExtents.z],
  ];
  for (const [axis, extent] of axes) for (const sign of [-1, 1]) {
    const normal = rotate(scale(axis, sign), obstacle.rotation());
    const plane = dot(origin, normal) + extent;
    const support = shape.radius + shape.halfHeight * Math.abs(normal.y);
    if (Math.min(dot(from, normal), dot(to, normal)) - support >= plane + clearance - 1e-7) return true;
  }
  return false;
}
function shapeDescriptor(definition: ColliderDefinition): RAPIER.ColliderDesc {
  const shape = definition.shape;
  switch (shape.type) {
    case 'box': return RAPIER.ColliderDesc.cuboid(shape.halfExtents.x, shape.halfExtents.y, shape.halfExtents.z);
    case 'sphere': return RAPIER.ColliderDesc.ball(shape.radius);
    case 'capsule': return RAPIER.ColliderDesc.capsule(shape.halfHeight, shape.radius);
    case 'trimesh': return RAPIER.ColliderDesc.trimesh(new Float32Array(shape.vertices), new Uint32Array(shape.indices));
  }
}

/**
 * Queries use current Rapier shapes directly rather than a one-step-old broad phase.
 * This guarantees fresh doors and spawn checks before the shared engine's physics step.
 * Cost is linear in the number of owned colliders; no extra world.step() is performed.
 */
export function createPhysicsAdapter(world: RAPIER.World, definitions: readonly ColliderDefinition[]): PhysicsAdapter {
  interface Entry { definition: ColliderDefinition; collider: RAPIER.Collider; body: RAPIER.RigidBody | null }
  const entries = new Map<string, Entry>();
  const actors = new Set<RAPIER.Collider>();
  const actorDisposers = new Set<() => void>();
  let disposed = false;
  function assertActive(): void { if (disposed) throw new Error('Physics adapter disposed'); }
  function* obstacles(ignore: readonly string[], includeCharacters: boolean, exclude?: RAPIER.Collider): Generator<RAPIER.Collider> {
    for (const [id, entry] of entries) {
      if (!ignore.includes(id) && !entry.collider.isSensor() && entry.collider.isEnabled()) yield entry.collider;
    }
    if (includeCharacters) for (const actor of actors) {
      if (actor !== exclude && actor.isEnabled()) yield actor;
    }
  }
  function free(position: Vec3, radius: number, height: number, ignore: readonly string[], includeCharacters: boolean, exclude?: RAPIER.Collider): boolean {
    assertActive(); finiteVector(position);
    dimensions(radius, height);
    // Shrink the contact skin instead of relying on penetration depth. Rapier GJK
    // can return distance=0 for deeply overlapping, exactly coincident capsules.
    const shape = new RAPIER.Capsule(height / 2 - radius, Math.max(radius * 0.99, radius - PENETRATION_TOLERANCE));
    const shapePosition = center(position, height);
    for (const obstacle of obstacles(ignore, includeCharacters, exclude)) {
      if (boxSeparates(obstacle, shape, shapePosition, shapePosition, 0)) continue;
      if (obstacle.intersectsShape(shape, shapePosition, IDENTITY)) return false;
    }
    return true;
  }
  function sweep(position: Vec3, displacement: Vec3, shape: RAPIER.Shape, ignore: readonly string[], includeCharacters: boolean, exclude?: RAPIER.Collider, contactSkin = SKIN): { toi: number; normal: Vec3 } | null {
    let nearest: { toi: number; normal: Vec3 } | null = null;
    for (const obstacle of obstacles(ignore, includeCharacters, exclude)) {
      // Exact separating planes reject GJK's near-tangential box false positives.
      if (shape instanceof RAPIER.Capsule && boxSeparates(obstacle, shape, position, add(position, displacement), contactSkin)) continue;
      const hit = obstacle.castShape(ZERO, shape, position, IDENTITY, displacement, contactSkin, 1, false);
      if (!hit) continue;
      let localNormal: Vec3 = hit.normal1;
      const box = obstacle.shape;
      if (box instanceof RAPIER.Cuboid) {
        // Recover the exact flat-face normal from its local contact witness.
        // Near-tangent GJK normals can be inaccurate on large floors. Interior
        // face witnesses are unambiguous; edge/corner witnesses keep Rapier's normal.
        const faces: Vec3[] = [];
        const point = hit.witness1;
        const epsilon = 1e-4;
        if (Math.abs(Math.abs(point.x) - box.halfExtents.x) < epsilon) faces.push({ x: Math.sign(point.x), y: 0, z: 0 });
        if (Math.abs(Math.abs(point.y) - box.halfExtents.y) < epsilon) faces.push({ x: 0, y: Math.sign(point.y), z: 0 });
        if (Math.abs(Math.abs(point.z) - box.halfExtents.z) < epsilon) faces.push({ x: 0, y: 0, z: Math.sign(point.z) });
        if (faces.length === 1) localNormal = faces[0]!;
      }
      const normal = rotate(localNormal, obstacle.rotation());
      // Tangential floor contact must not block horizontal travel or upward escape.
      if (dot(displacement, normal) >= -1e-7) continue;
      if (!nearest || hit.time_of_impact < nearest.toi) nearest = { toi: Math.max(0, hit.time_of_impact), normal };
    }
    return nearest;
  }
  function segmentFree(from: Vec3, to: Vec3, radius: number, height: number, ignore: readonly string[], includeCharacters: boolean, exclude?: RAPIER.Collider): boolean {
    if (!free(from, radius, height, ignore, includeCharacters, exclude) || !free(to, radius, height, ignore, includeCharacters, exclude)) return false;
    const delta = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
    // Destination may exactly touch its support surface. Movement keeps a skin,
    // but corridor validation must not reject a nonpenetrating endpoint merely
    // because it approaches that skin during the last few millimetres.
    const queryShape = capsule(radius, height);
    const hit = sweep(center(from, height), delta, queryShape, ignore, includeCharacters, exclude, 0);
    return !hit || hit.toi >= 1 - 1e-5;
  }
  function setPose(entry: Entry, pose: Pose): void {
    if (entry.body) {
      entry.body.setTranslation(pose.position, true);
      entry.body.setRotation(pose.rotation, true);
      entry.body.setNextKinematicTranslation(pose.position);
      entry.body.setNextKinematicRotation(pose.rotation);
      world.propagateModifiedBodyPositionsToColliders();
    } else {
      entry.collider.setTranslation(pose.position);
      entry.collider.setRotation(pose.rotation);
    }
  }
  function dispose(): void {
    if (disposed) return;
    for (const release of [...actorDisposers]) release();
    for (const { body, collider } of entries.values()) {
      if (body) world.removeRigidBody(body); else world.removeCollider(collider, false);
    }
    entries.clear();
    disposed = true;
  }
  try {
    for (const definition of definitions) {
      if (!definition.id || entries.has(definition.id)) throw new Error(`Duplicate or empty collider ID: ${definition.id}`);
      finiteVector(definition.pose.position);
      const desc = shapeDescriptor(definition).setSensor(definition.sensor);
      if (definition.friction !== undefined) desc.setFriction(definition.friction);
      if (definition.restitution !== undefined) desc.setRestitution(definition.restitution);
      const body = definition.bodyType === 'kinematic'
        ? world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
          .setTranslation(definition.pose.position.x, definition.pose.position.y, definition.pose.position.z)
          .setRotation(definition.pose.rotation))
        : null;
      if (!body) desc.setTranslation(definition.pose.position.x, definition.pose.position.y, definition.pose.position.z).setRotation(definition.pose.rotation);
      let collider: RAPIER.Collider;
      try { collider = world.createCollider(desc, body ?? undefined); } catch (error) { if (body) world.removeRigidBody(body); throw error; }
      entries.set(definition.id, { definition, collider, body });
    }
    world.propagateModifiedBodyPositionsToColliders();
  } catch (error) { dispose(); throw error; }

  const adapter: PhysicsAdapter = {
    isPositionFree(position, radius, height, ignore = [], includeCharacters = true) { return free(position, radius, height, ignore, includeCharacters); },
    isSegmentFree(from, to, radius, height, ignore = [], includeCharacters = true) { assertActive(); return segmentFree(from, to, radius, height, ignore, includeCharacters); },
    hasLineOfSight(from, to, ignore = []) {
      assertActive(); finiteVector(from); finiteVector(to);
      const delta = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
      if (length(delta) < 1e-8) return true;
      const ray = new RAPIER.Ray(from, delta);
      for (const obstacle of obstacles(ignore, false)) {
        const toi = obstacle.castRay(ray, 1, true);
        if (toi !== null && toi >= 0 && toi < 1 - 1e-5) return false;
      }
      return true;
    },
    findGround(origin, maxDrop = 0.35) {
      assertActive(); finiteVector(origin);
      if (!Number.isFinite(maxDrop) || maxDrop < 0) throw new Error('maxDrop must be finite and nonnegative');
      const ray = new RAPIER.Ray(origin, { x: 0, y: -1, z: 0 });
      let closest = maxDrop + 1;
      for (const obstacle of obstacles([], false)) {
        const hit = obstacle.castRayAndGetNormal(ray, maxDrop, false);
        if (hit && hit.normal.y >= 0.65 && hit.timeOfImpact < closest) closest = hit.timeOfImpact;
      }
      return closest <= maxDrop ? { x: origin.x, y: origin.y - closest, z: origin.z } : null;
    },
    hasSupport(position, radius, maxDrop = 0.15) {
      assertActive();
      return [[0, 0], [radius * 0.7, 0], [-radius * 0.7, 0], [0, radius * 0.7], [0, -radius * 0.7]].every(([x, z]) =>
        adapter.findGround({ x: position.x + x!, y: position.y + 0.02, z: position.z + z! }, maxDrop + 0.02) !== null);
    },
    getColliderPose(id) {
      assertActive(); const entry = entries.get(id);
      if (!entry) throw new Error(`Unknown collider ${id}`);
      return { position: { ...entry.collider.translation() }, rotation: { ...entry.collider.rotation() } };
    },
    trySetColliderPoses(poses) {
      assertActive();
      const ignore = poses.map((entry) => entry.id);
      if (new Set(ignore).size !== ignore.length) throw new Error('Duplicate moving collider IDs');
      for (const { id, pose } of poses) {
        finiteVector(pose.position);
        if (![pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w].every(Number.isFinite)) throw new Error('Rotation must be finite');
        const entry = entries.get(id);
        if (!entry) throw new Error(`Unknown collider ${id}`);
        if (entry.definition.bodyType !== 'kinematic') throw new Error(`Collider ${id} is not kinematic`);
        for (const obstacle of obstacles(ignore, true)) {
          const contact = obstacle.contactShape(entry.collider.shape, pose.position, pose.rotation, 0);
          if (contact && contact.distance < -PENETRATION_TOLERANCE) return false;
        }
      }
      for (const { id, pose } of poses) setPose(entries.get(id)!, pose);
      return true;
    },
    createCharacter(options) {
      assertActive(); finiteVector(options.position); dimensions(options.radius, options.height);
      if (!free(options.position, options.radius, options.height, [], true)) throw new Error('Character spawn intersects solid geometry');
      let feet = { ...options.position };
      let height = options.height;
      let enabled = true;
      let released = false;
      const collider = world.createCollider(RAPIER.ColliderDesc.capsule(height / 2 - options.radius, options.radius)
        .setTranslation(feet.x, feet.y + height / 2, feet.z));
      actors.add(collider);
      function assertCharacter(): void { assertActive(); if (released) throw new Error('Character disposed'); }
      function place(value: Vec3): void { feet = { ...value }; collider.setTranslation(center(feet, height)); }
      const release = (): void => {
        if (released) return;
        released = true;
        actors.delete(collider); actorDisposers.delete(release);
        world.removeCollider(collider, false);
      };
      actorDisposers.add(release);
      const character: CharacterBody = {
        get radius() { return options.radius; }, get height() { return height; },
        getPosition() { assertCharacter(); return { ...feet }; },
        canOccupy(position, candidateHeight = height, ignore = []) { assertCharacter(); return free(position, options.radius, candidateHeight, ignore, true, collider); },
        setHeight(candidate) {
          assertCharacter(); dimensions(options.radius, candidate);
          if (!free(feet, options.radius, candidate, [], true, collider)) return false;
          height = candidate; collider.setShape(capsule(options.radius, height)); place(feet); return true;
        },
        setPosition(position) { assertCharacter(); finiteVector(position); place(position); },
        setEnabled(value) { assertCharacter(); enabled = value; collider.setEnabled(value); },
        move(displacement) {
          assertCharacter(); finiteVector(displacement);
          if (!enabled) return { position: { ...feet }, grounded: false };
          const previous = { ...feet };
          let grounded = false;
          const shape = capsule(options.radius, height);
          // Resolve gravity before planar travel. Near-tangent diagonal casts
          // against broad floors can produce unstable GJK contacts; separating
          // the vertical component keeps support and wall sliding predictable.
          for (const component of [
            { x: 0, y: displacement.y, z: 0 },
            { x: displacement.x, y: 0, z: displacement.z },
          ]) {
            let remaining = component;
            for (let iteration = 0; iteration < 5 && length(remaining) > 1e-7; iteration += 1) {
              const hit = sweep(center(feet, height), remaining, shape, [], true, collider);
              if (!hit) { place(add(feet, remaining)); break; }
              const fraction = Math.max(0, Math.min(1, hit.toi - 1e-5));
              place(add(feet, scale(remaining, fraction)));
              remaining = scale(remaining, 1 - fraction);
              const inward = Math.min(0, dot(remaining, hit.normal));
              remaining = add(remaining, scale(hit.normal, -inward));
            }
          }
          grounded = displacement.y <= 0 && adapter.hasSupport(feet, options.radius, 0.04);
          if (grounded && displacement.y <= 0) {
            // Stabilize millimetre-scale GJK drift at a resting support plane. This
            // is a bounded contact correction, not an autostep or a jump.
            const support = adapter.findGround({ x: feet.x, y: feet.y + 0.02, z: feet.z }, 0.04);
            if (support) {
              const corrected = { ...feet, y: support.y + SKIN };
              if (Math.abs(corrected.y - feet.y) <= SKIN * 4 && free(corrected, options.radius, height, [], true, collider)) place(corrected);
            }
          }
          // Conservatively reject a numerically invalid solution rather than
          // leave a capsule penetrating a wall, corner, floor, or another actor.
          if (!free(feet, options.radius, height, [], true, collider)) {
            place(previous);
            grounded = adapter.hasSupport(feet, options.radius, 0.04);
          }
          return { position: { ...feet }, grounded };
        },
        dispose: release,
      };
      return character;
    },
    dispose,
  };
  return adapter;
}
