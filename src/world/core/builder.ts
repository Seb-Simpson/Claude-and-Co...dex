import {
  BufferAttribute,
  type BufferGeometry,
  Color,
  Group,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  Sprite,
  SpriteMaterial,
  AdditiveBlending,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {
  ColliderDefinition,
  DoorMarker,
  EntitySpawnPoint,
  HidingLocation,
  InteractableMarker,
  ObjectId,
  PatrolRoute,
  RoomMetadata,
} from '../../contracts';
import type { AnomalyTarget, FixtureKind, FixtureState, LightFixture, ReflectiveSurface, SightlineAnchor, SoundEmitter, SoundEmitterKind } from '../extras';
import { box, yawQuaternion } from './geometry';
import { MaterialLibrary, type MaterialKey } from './materials';
import { createRandom, type Random } from './random';
import { TextureLibrary } from './textures';

export type UvMode = 'world' | 'local';
export type ShadeFn = (x: number, y: number, z: number) => number;

export interface AddOptions {
  readonly uv?: UvMode;
  /** Vertex shade: 'height' grounds objects (darker near the floor); a function computes custom AO. */
  readonly shade?: 'height' | 'flat' | ShadeFn;
  /** RGB multiplier for colour variation without extra materials. */
  readonly tint?: readonly [number, number, number] | number;
}

const smooth = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

export const heightShade: ShadeFn = (_x, y) => (0.58 + 0.42 * smooth(0, 1.1, y)) * (1 - 0.16 * smooth(2.2, 3.0, y));

/** Bake transform, metric UVs and vertex shade so heterogeneous pieces can be merged. */
export function prepareGeometry(source: BufferGeometry, matrix: Matrix4 | null, options: AddOptions = {}): BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source;
  if (geometry !== source) source.dispose();
  if (matrix) geometry.applyMatrix4(matrix);
  const position = geometry.getAttribute('position') as BufferAttribute;
  const normal = geometry.getAttribute('normal') as BufferAttribute | undefined;
  if (!normal) geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal') as BufferAttribute;
  const count = position.count;
  if ((options.uv ?? 'world') === 'world' || !geometry.getAttribute('uv')) {
    const uv = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      const ax = Math.abs(normals.getX(i));
      const ay = Math.abs(normals.getY(i));
      const az = Math.abs(normals.getZ(i));
      if (ay >= ax && ay >= az) { uv[i * 2] = x; uv[i * 2 + 1] = -z; }
      else if (ax >= az) { uv[i * 2] = z * Math.sign(normals.getX(i) || 1) * -1; uv[i * 2 + 1] = y; }
      else { uv[i * 2] = x * Math.sign(normals.getZ(i) || 1); uv[i * 2 + 1] = y; }
    }
    geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  }
  const colors = new Float32Array(count * 3);
  const tint = options.tint === undefined ? [1, 1, 1] : typeof options.tint === 'number' ? [options.tint, options.tint, options.tint] : options.tint;
  const shade = options.shade ?? 'height';
  for (let i = 0; i < count; i++) {
    const s = shade === 'flat' ? 1 : shade === 'height'
      ? heightShade(position.getX(i), position.getY(i), position.getZ(i))
      : shade(position.getX(i), position.getY(i), position.getZ(i));
    colors[i * 3] = s * (tint[0] ?? 1);
    colors[i * 3 + 1] = s * (tint[1] ?? 1);
    colors[i * 3 + 2] = s * (tint[2] ?? 1);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  for (const name of Object.keys(geometry.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') geometry.deleteAttribute(name);
  }
  geometry.morphAttributes = {};
  geometry.clearGroups();
  return geometry;
}

export interface Part {
  readonly material: MaterialKey;
  readonly geometry: BufferGeometry;
  readonly matrix?: Matrix4;
  readonly options?: AddOptions;
}

interface PendingFixture {
  readonly fixture: LightFixture;
  readonly panel: { readonly shape: 'troffer' | 'strip' | 'bulb' | 'small'; readonly matrix: Matrix4 } | null;
  readonly haloScale: number;
}

const PANEL_SHAPES = {
  troffer: () => box(1.12, 0.02, 0.52),
  strip: () => box(1.18, 0.05, 0.08),
  bulb: () => box(0.09, 0.12, 0.09),
  small: () => box(0.26, 0.07, 0.05),
} as const;

/**
 * Accumulates hospital geometry and metadata. Static surfaces are merged per material and spatial
 * cell (frustum culling still works); dynamic objects (doors, curtains, lockers) stay separate.
 */
export class WorldBuilder {
  readonly root = new Group();
  readonly textures: TextureLibrary;
  readonly materials: MaterialLibrary;
  readonly rng: Random;
  readonly rooms: RoomMetadata[] = [];
  readonly colliders: ColliderDefinition[] = [];
  readonly interactables: InteractableMarker[] = [];
  readonly doors: DoorMarker[] = [];
  readonly hidingLocations: HidingLocation[] = [];
  readonly entitySpawns: EntitySpawnPoint[] = [];
  readonly patrolRoutes: PatrolRoute[] = [];
  readonly anomalies: AnomalyTarget[] = [];
  readonly soundEmitters: SoundEmitter[] = [];
  readonly connections: [ObjectId, ObjectId][] = [];
  readonly reflectiveSurfaces: ReflectiveSurface[] = [];
  readonly sightlines: SightlineAnchor[] = [];
  readonly fixtures: LightFixture[] = [];
  private readonly pendingFixtures: PendingFixture[] = [];
  private readonly buckets = new Map<string, { material: MaterialKey; geometries: BufferGeometry[] }>();
  private readonly ownedGeometries: BufferGeometry[] = [];
  private readonly counters = new Map<string, number>();
  private finalized = false;

  constructor(seed: number, options: { textures?: boolean } = {}) {
    this.textures = new TextureLibrary(seed, options.textures);
    this.materials = new MaterialLibrary(this.textures);
    this.rng = createRandom(seed);
    this.root.name = 'nw:hospital';
  }

  /** Stable sequential IDs: `nw:<scope>:<kind>:<nn>`. */
  id(scope: string, kind: string): ObjectId {
    const key = `${scope}:${kind}`;
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return `nw:${scope}:${kind}:${String(next).padStart(2, '0')}`;
  }

  /** Add static geometry to the merged batch. Takes ownership of `geometry`. */
  add(material: MaterialKey, geometry: BufferGeometry, matrix: Matrix4 | null = null, options: AddOptions = {}): void {
    if (this.finalized) throw new Error('World already finalised');
    const prepared = prepareGeometry(geometry, matrix, options);
    prepared.computeBoundingBox();
    const center = prepared.boundingBox!.getCenter(new Vector3());
    const cell = `${Math.floor(center.x / 16)},${Math.floor(center.z / 12)}`;
    const key = `${material}|${cell}`;
    let bucket = this.buckets.get(key);
    if (!bucket) { bucket = { material, geometries: [] }; this.buckets.set(key, bucket); }
    bucket.geometries.push(prepared);
  }

  /** Axis-aligned (optionally yawed) static box: centre + full size. */
  block(material: MaterialKey, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, yaw = 0, options: AddOptions = {}): void {
    const m = new Matrix4().makeRotationY(yaw).setPosition(cx, cy, cz);
    this.add(material, box(sx, sy, sz), m, options);
  }

  /** Fixed box collider. Size is full extents; yaw rotates about +Y around the centre. */
  solid(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, options: {
    yaw?: number; roomId?: ObjectId; scope?: string; kind?: string; interactableId?: ObjectId; friction?: number; bodyType?: 'fixed' | 'kinematic';
  } = {}): ObjectId {
    const id = this.id(options.scope ?? 'ward4', options.kind ?? 'collider');
    this.colliders.push({
      id,
      shape: { type: 'box', halfExtents: { x: Math.max(sx / 2, 0.005), y: Math.max(sy / 2, 0.005), z: Math.max(sz / 2, 0.005) } },
      pose: { position: { x: cx, y: cy, z: cz }, rotation: yawQuaternion(options.yaw ?? 0) },
      bodyType: options.bodyType ?? 'fixed',
      sensor: false,
      ...(options.friction !== undefined ? { friction: options.friction } : {}),
      ...(options.roomId !== undefined ? { roomId: options.roomId } : {}),
      ...(options.interactableId !== undefined ? { interactableId: options.interactableId } : {}),
    });
    return id;
  }

  /** Visual block plus matching collider. */
  solidBlock(material: MaterialKey, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, roomId: ObjectId, yaw = 0, options: AddOptions = {}): ObjectId {
    this.block(material, cx, cy, cz, sx, sy, sz, yaw, options);
    return this.solid(cx, cy, cz, sx, sy, sz, { yaw, roomId });
  }

  /** Build an independent mesh group from parts (used for doors, lockers and animated props). */
  mergedObject(parts: readonly Part[], name: string): Group {
    const group = new Group();
    group.name = name;
    const byMaterial = new Map<MaterialKey, BufferGeometry[]>();
    for (const part of parts) {
      const prepared = prepareGeometry(part.geometry, part.matrix ?? null, { uv: 'local', ...part.options });
      const list = byMaterial.get(part.material) ?? [];
      list.push(prepared);
      byMaterial.set(part.material, list);
    }
    for (const [material, list] of byMaterial) {
      const merged = list.length === 1 ? list[0]! : mergeGeometries(list, false);
      if (list.length > 1) list.forEach((g) => g.dispose());
      this.ownedGeometries.push(merged);
      const mesh = new Mesh(merged, this.materials.get(material));
      mesh.name = `${name}:${material}`;
      if (this.materials.isTransparent(material)) mesh.renderOrder = 2;
      group.add(mesh);
    }
    return group;
  }

  /** Track a geometry owned by a dynamic object. */
  own<T extends BufferGeometry>(geometry: T): T {
    this.ownedGeometries.push(geometry);
    return geometry;
  }

  attach(object: Object3D): void { this.root.add(object); }

  room(room: RoomMetadata): void { this.rooms.push(room); }

  connect(a: ObjectId, b: ObjectId): void { this.connections.push([a, b]); }

  emitter(kind: SoundEmitterKind, roomId: ObjectId, x: number, y: number, z: number): void {
    this.soundEmitters.push({ id: this.id('sound', kind), kind, roomId, position: new Vector3(x, y, z) });
  }

  /**
   * Register a light fixture. `panel` describes the visible emissive part (instanced per shape);
   * fixtures with `intensity` > 0 may be given a real PointLight by the atmosphere light pool.
   */
  fixture(spec: {
    kind: FixtureKind; state: FixtureState; roomId: ObjectId; circuits: readonly string[];
    position: Vector3; color: number; intensity: number; distance: number;
    panel?: { shape: 'troffer' | 'strip' | 'bulb' | 'small'; matrix: Matrix4 } | null;
    halo?: number; haloOpacity?: number; material?: MeshBasicMaterial;
  }): LightFixture {
    const fixture: LightFixture = {
      id: this.id('light', spec.kind),
      roomId: spec.roomId,
      circuits: ['nw:lights:all', `nw:lights:${spec.roomId.split(':').pop() ?? 'room'}`, ...spec.circuits],
      kind: spec.kind,
      state: spec.state,
      position: spec.position.clone(),
      color: spec.color,
      intensity: spec.intensity,
      distance: spec.distance,
      panels: spec.material ? [{ type: 'material', material: spec.material, color: spec.material.color.clone() }] : [],
      halo: null,
      haloOpacity: spec.haloOpacity ?? 0.5,
    };
    this.fixtures.push(fixture);
    this.pendingFixtures.push({ fixture, panel: spec.panel ?? null, haloScale: spec.halo ?? 0 });
    return fixture;
  }

  /** Merge all batches and create instanced emissive panels. */
  finalize(): void {
    if (this.finalized) return;
    this.finalized = true;
    const staticGroup = new Group();
    staticGroup.name = 'nw:static';
    for (const [key, bucket] of this.buckets) {
      const merged = bucket.geometries.length === 1 ? bucket.geometries[0]! : mergeGeometries(bucket.geometries, false);
      if (bucket.geometries.length > 1) bucket.geometries.forEach((g) => g.dispose());
      this.ownedGeometries.push(merged);
      const mesh = new Mesh(merged, this.materials.get(bucket.material));
      mesh.name = `nw:static:${key}`;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      if (this.materials.isTransparent(bucket.material)) mesh.renderOrder = 1;
      staticGroup.add(mesh);
    }
    this.buckets.clear();
    this.root.add(staticGroup);
    this.buildPanels();
  }

  private buildPanels(): void {
    const panelsGroup = new Group();
    panelsGroup.name = 'nw:light-panels';
    const shapes = new Map<string, PendingFixture[]>();
    for (const pending of this.pendingFixtures) {
      if (!pending.panel) continue;
      const list = shapes.get(pending.panel.shape) ?? [];
      list.push(pending);
      shapes.set(pending.panel.shape, list);
    }
    for (const [shape, list] of shapes) {
      const geometry = this.own(PANEL_SHAPES[shape as keyof typeof PANEL_SHAPES]());
      const material = this.materials.adopt(new MeshBasicMaterial({ color: 0xffffff, fog: true }));
      material.name = `nw:panel:${shape}`;
      const mesh = new InstancedMesh(geometry, material, list.length);
      mesh.name = `nw:panels:${shape}`;
      list.forEach((pending, index) => {
        mesh.setMatrixAt(index, pending.panel!.matrix);
        const color = new Color(pending.fixture.color);
        mesh.setColorAt(index, pending.fixture.state === 'dead' ? new Color(0x1a1c1c) : color);
        pending.fixture.panels.push({ type: 'instance', mesh, index, color });
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      panelsGroup.add(mesh);
    }
    const glow = this.textures.glow();
    for (const pending of this.pendingFixtures) {
      if (pending.haloScale <= 0 || !glow) continue;
      const material = this.materials.adopt(new SpriteMaterial({
        map: glow, color: pending.fixture.color, transparent: true, depthWrite: false, blending: AdditiveBlending,
        opacity: pending.fixture.state === 'dead' ? 0 : pending.fixture.haloOpacity, fog: true,
      }));
      const sprite = new Sprite(material);
      sprite.position.copy(pending.fixture.position);
      sprite.scale.setScalar(pending.haloScale);
      sprite.renderOrder = 3;
      sprite.name = `${pending.fixture.id}:halo`;
      pending.fixture.halo = sprite;
      panelsGroup.add(sprite);
    }
    this.root.add(panelsGroup);
  }

  sharedMaterials(): Material[] { return []; }

  dispose(): void {
    for (const geometry of this.ownedGeometries) geometry.dispose();
    this.ownedGeometries.length = 0;
    for (const bucket of this.buckets.values()) bucket.geometries.forEach((g) => g.dispose());
    this.buckets.clear();
    this.materials.dispose();
    this.textures.dispose();
  }
}
