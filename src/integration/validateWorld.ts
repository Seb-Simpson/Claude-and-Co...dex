import type { Object3D } from 'three';
import type { Bounds3, HospitalWorld, Pose, SpawnPose, Vec3 } from '../contracts';

/** Validate the metadata boundary before any physics/gameplay module consumes a world. */
export function validateWorld(world: HospitalWorld): void {
  const fail = (message: string): never => { throw new Error(`Invalid world "${world.id}": ${message}`); };
  const ids = new Set<string>();
  function declare(id: string): void {
    if (!id.trim() || ids.has(id)) fail(`empty or duplicate object ID "${id}"`);
    ids.add(id);
  }
  function finite(value: number, label: string): void {
    if (!Number.isFinite(value)) fail(`${label} must be finite`);
  }
  function positive(value: number, label: string): void {
    finite(value, label);
    if (value <= 0) fail(`${label} must be positive`);
  }
  function vector(value: Vec3, label: string): void {
    finite(value.x, `${label}.x`); finite(value.y, `${label}.y`); finite(value.z, `${label}.z`);
  }
  function pose(value: Pose, label: string): void {
    vector(value.position, `${label}.position`);
    const q = value.rotation;
    [q.x, q.y, q.z, q.w].forEach((v) => finite(v, `${label}.rotation`));
    if (Math.abs(Math.hypot(q.x, q.y, q.z, q.w) - 1) > 0.001) fail(`${label} requires a unit quaternion`);
  }
  function spawn(value: SpawnPose, label: string): void {
    vector(value.position, `${label}.position`); finite(value.yaw, `${label}.yaw`);
  }
  function bounds(value: Bounds3, label: string): void {
    vector(value.min, `${label}.min`); vector(value.max, `${label}.max`);
    if (value.min.x > value.max.x || value.min.y > value.max.y || value.min.z > value.max.z) {
      fail(`${label} has reversed min/max bounds`);
    }
  }
  function reference(id: string, collection: ReadonlySet<string>, label: string): void {
    if (!collection.has(id)) fail(`${label} references missing ID "${id}"`);
  }
  function inHierarchy(object: Object3D): boolean {
    let current: Object3D | null = object;
    while (current) {
      if (current === world.root) return true;
      current = current.parent;
    }
    return false;
  }

  declare(world.id);
  bounds(world.bounds, 'bounds');
  spawn(world.playerSpawn, 'playerSpawn');
  // World-space metadata cannot follow an arbitrarily transformed/scaled root.
  const root = world.root;
  vector(root.position, 'root position');
  vector(root.scale, 'root scale');
  pose({ position: root.position, rotation: root.quaternion }, 'root pose');
  if (root.position.lengthSq() > 1e-12 || Math.abs(root.scale.x - 1) + Math.abs(root.scale.y - 1) + Math.abs(root.scale.z - 1) > 1e-6 ||
      Math.abs(root.quaternion.x) + Math.abs(root.quaternion.y) + Math.abs(root.quaternion.z) > 1e-6 ||
      Math.abs(Math.abs(root.quaternion.w) - 1) > 1e-6) {
    fail('root must have an identity transform; bake transforms into children and metadata');
  }
  for (const room of world.rooms) { declare(room.id); bounds(room.bounds, `room ${room.id}`); }
  const rooms = new Set(world.rooms.map((room) => room.id));
  for (const collider of world.colliders) {
    declare(collider.id);
    pose(collider.pose, `collider ${collider.id}`);
    if (collider.roomId !== undefined) reference(collider.roomId, rooms, 'collider roomId');
    if (collider.friction !== undefined) {
      finite(collider.friction, 'friction');
      if (collider.friction < 0) fail('friction must be nonnegative');
    }
    if (collider.restitution !== undefined) {
      finite(collider.restitution, 'restitution');
      if (collider.restitution < 0 || collider.restitution > 1) fail('restitution must be in [0,1]');
    }
    const shape = collider.shape;
    switch (shape.type) {
      case 'box':
        positive(shape.halfExtents.x, 'box halfExtents.x');
        positive(shape.halfExtents.y, 'box halfExtents.y');
        positive(shape.halfExtents.z, 'box halfExtents.z');
        break;
      case 'sphere': positive(shape.radius, 'sphere radius'); break;
      case 'capsule':
        positive(shape.radius, 'capsule radius'); finite(shape.halfHeight, 'capsule halfHeight');
        if (shape.halfHeight < 0) fail('capsule halfHeight must be nonnegative');
        break;
      case 'trimesh':
        if (shape.vertices.length < 9 || shape.vertices.length % 3 !== 0 ||
            shape.indices.length < 3 || shape.indices.length % 3 !== 0) fail('trimesh requires vertex/triangle triples');
        shape.vertices.forEach((v) => finite(v, 'trimesh vertex'));
        if (shape.indices.some((v) => !Number.isInteger(v) || v < 0 || v >= shape.vertices.length / 3)) {
          fail('trimesh index outside vertex array');
        }
        break;
      default: fail('unknown collider shape');
    }
  }
  const colliders = new Set(world.colliders.map((collider) => collider.id));
  for (const marker of world.interactables) {
    declare(marker.id);
    positive(marker.range, 'interaction range');
    if (!inHierarchy(marker.object)) fail(`interactable "${marker.id}" is not inside world.root`);
    marker.colliderIds?.forEach((id) => reference(id, colliders, 'interactable colliderIds'));
  }
  const interactables = new Set(world.interactables.map((marker) => marker.id));
  for (const collider of world.colliders) {
    if (collider.interactableId !== undefined) reference(collider.interactableId, interactables, 'collider interactableId');
  }
  const doorIds = new Set<string>();
  for (const door of world.doors) {
    if (doorIds.has(door.id)) fail(`duplicate door "${door.id}"`);
    doorIds.add(door.id);
    if (door.type !== 'door' || !world.interactables.includes(door)) fail('doors must be the same marker objects listed in interactables');
    pose(door.closedPose, 'door closedPose'); pose(door.openPose, 'door openPose');
    positive(door.durationSeconds, 'door durationSeconds');
    if (door.colliderIds.length === 0) fail(`door "${door.id}" needs collision metadata`);
    for (const id of door.colliderIds) {
      reference(id, colliders, 'door colliderIds');
      if (world.colliders.find((c) => c.id === id)?.bodyType !== 'kinematic') fail('door colliders must be kinematic');
    }
  }
  if (world.interactables.some((marker) => marker.type === 'door' && !doorIds.has(marker.id))) {
    fail('every door interactable must also appear in doors');
  }
  for (const spot of world.hidingLocations) {
    declare(spot.id);
    reference(spot.interactableId, interactables, 'hiding interactableId');
    if (world.interactables.find((m) => m.id === spot.interactableId)?.type !== spot.type) fail('hiding type must match its interactable');
    if (spot.capacity !== 1 || spot.exitCandidates.length === 0) fail('hiding requires capacity 1 and at least one exit candidate');
    pose(spot.cameraPose, 'hiding cameraPose'); vector(spot.playerPosition, 'hiding playerPosition');
    spot.exitCandidates.forEach((value) => spawn(value, 'hiding exit'));
    spot.colliderIds.forEach((id) => reference(id, colliders, 'hiding colliderIds'));
  }
  for (const route of world.patrolRoutes) {
    declare(route.id);
    if (route.points.length === 0) fail('patrol routes must not be empty');
    route.points.forEach((point) => vector(point, 'patrol point'));
  }
  const routes = new Set(world.patrolRoutes.map((route) => route.id));
  const entityIds = new Set<string>();
  for (const point of world.entitySpawns) {
    declare(point.id);
    spawn(point, 'entity spawn');
    if (!point.entityId.trim() || entityIds.has(point.entityId)) fail('entity IDs must be nonempty and unique');
    entityIds.add(point.entityId);
    if (point.roomId !== undefined) reference(point.roomId, rooms, 'spawn roomId');
    if (point.patrolRouteId !== undefined) reference(point.patrolRouteId, routes, 'spawn patrolRouteId');
  }
}
