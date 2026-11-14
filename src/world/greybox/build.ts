/**
 * Builds the NW-R02 greybox as a standard HospitalWorld (floors, walls, ceilings, doors, colliders,
 * hiding, temporary progression controls, labels) from the data in level.ts.
 */
import { AmbientLight, Color, HemisphereLight, Matrix4 } from 'three';
import type { HospitalWorld, InteractableMarker, ObjectId, SpawnPoseForExit } from '../../contracts';
import { door } from '../architecture';
import { WorldBuilder } from '../core/builder';
import type { MaterialKey } from '../core/materials';
import { sign, type Place } from '../props/common';
import type { SignStyle } from '../core/textures';
import { addBedHiding, addLockerHiding, proxy } from '../rooms/hiding';
import { buildLayout, WALL_T, type GreyboxLayout } from './grid';
import { CONNECTIONS, FEATURES, SPACES, SPAWN, ZONES, type ConnectionDef, type FeatureDef, type MarkerCategory, type SpaceDef } from './level';

export const GREYBOX_WORLD_ID = 'nw:world:greybox';
const FLOOR_OVERLAP = 0.07;
export const roomIdOf = (spaceId: string): ObjectId => `nw:gb:${spaceId}`;
export const doorIdsOf = (connectionId: string): ObjectId[] => {
  const connection = CONNECTIONS.find((c) => c.id === connectionId);
  if (!connection?.door) return [];
  return connection.door.double ? [`nw:door:gb-${connectionId}-a`, `nw:door:gb-${connectionId}-b`] : [`nw:door:gb-${connectionId}`];
};
export const controlIdOf = (featureId: string): ObjectId => `nw:inspect:gb-${featureId}`;

export interface GreyboxControl {
  readonly featureId: string;
  readonly interactableId: ObjectId;
  readonly sets: string;
  readonly requires?: string;
  readonly position: { x: number; z: number };
  readonly label: string;
}

export interface GreyboxWorldBuild {
  readonly world: HospitalWorld;
  readonly layout: GreyboxLayout;
  readonly controls: readonly GreyboxControl[];
  /** Hiding spot id -> feature id. */
  readonly hiding: ReadonlyMap<string, string>;
  dispose(): void;
}

const hex = (color: string): [number, number, number] => {
  const c = new Color(color);
  return [c.r, c.g, c.b];
};
const mix = (a: [number, number, number], t: number): [number, number, number] => a.map((v) => 1 - t + v * t) as [number, number, number];

const STYLE: Record<MarkerCategory | 'room' | 'control', SignStyle> = {
  room: { background: '#24476a', foreground: '#f2f4f2', border: '#d8dee2', worn: 0 },
  story: { background: '#3a5a3a', foreground: '#f2f4f2', worn: 0 },
  placeholder: { background: '#c6a22a', foreground: '#1b1b1b', border: '#1b1b1b', worn: 0 },
  approach: { background: '#7a2a7a', foreground: '#ffffff', worn: 0 },
  encounter: { background: '#9e1c1a', foreground: '#ffffff', worn: 0 },
  mirror: { background: '#2a6a8a', foreground: '#ffffff', worn: 0 },
  guidance: { background: '#0d8a3c', foreground: '#eaffea', worn: 0 },
  control: { background: '#f0d020', foreground: '#101010', border: '#101010', worn: 0 },
};

function labelSize(text: string, height: number): { w: number; canvas: [number, number] } {
  const w = Math.min(4.2, Math.max(0.7, text.length * height * 0.42));
  return { w, canvas: [Math.min(2048, Math.max(256, Math.round(text.length * 30))), 72] };
}

/** Double-sided label hanging at (x, y, z), facing along `yaw` (and its opposite). */
function hangingLabel(b: WorldBuilder, text: string, style: SignStyle, x: number, y: number, z: number, yaw: number, height = 0.22): void {
  const { w, canvas } = labelSize(text, height);
  for (const face of [0, Math.PI]) {
    sign(b, text, style, w, height, new Matrix4().makeRotationY(yaw + face).setPosition(x, y, z), { canvas, emissive: true });
  }
}

/** Label lying on the floor, readable from the south (text up = north). */
function floorLabel(b: WorldBuilder, text: string, style: SignStyle, x: number, z: number, height = 0.32, yaw = 0): void {
  const { w, canvas } = labelSize(text, height);
  const m = new Matrix4().makeRotationY(yaw).multiply(new Matrix4().makeRotationX(-Math.PI / 2));
  m.setPosition(x, 0.012, z);
  sign(b, text, style, w, height, m, { canvas, emissive: true });
}

function largestRect(space: SpaceDef): readonly [number, number, number, number] {
  return [...space.rects].sort((p, q) => (q[1] - q[0]) * (q[3] - q[2]) - (p[1] - p[0]) * (p[3] - p[2]))[0]!;
}

function buildSpaces(b: WorldBuilder): void {
  for (const space of SPACES) {
    const roomId = roomIdOf(space.id);
    const zone = ZONES.find((z) => z.id === space.zone)!;
    const tint = mix(hex(zone.color), space.required ? 0.55 : 0.32);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x0, x1, z0, z1] of space.rects) {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, dd = z1 - z0;
      b.block(space.kind === 'service' || space.kind === 'crawl' ? 'floorConcrete' : 'floor', cx, -0.05, cz, w, 0.1, dd, 0, { tint, shade: 'flat' });
      // Floor colliders overlap their neighbours by 0.14 m (inside the wall line) so support and
      // ground rays never fall through the seam between two slabs.
      b.solid(cx, -0.1, cz, w + FLOOR_OVERLAP * 2, 0.2, dd + FLOOR_OVERLAP * 2, { roomId, scope: 'gb', kind: 'floor' });
      b.block(space.kind === 'service' || space.kind === 'crawl' ? 'concrete' : 'ceiling', cx, space.ceiling + 0.03, cz, w, 0.06, dd, 0, { shade: 'flat' });
      b.solid(cx, space.ceiling + 0.1, cz, w, 0.2, dd, { roomId, scope: 'gb', kind: 'ceiling' });
      minX = Math.min(minX, x0); maxX = Math.max(maxX, x1); minZ = Math.min(minZ, z0); maxZ = Math.max(maxZ, z1);
    }
    b.room({
      id: roomId, name: space.name,
      bounds: { min: { x: minX, y: 0, z: minZ }, max: { x: maxX, y: space.ceiling, z: maxZ } },
      tags: ['greybox', `zone:${space.zone}`, `kind:${space.kind}`, space.required ? 'required' : 'optional'],
    });
    const [x0, x1, z0, z1] = largestRect(space);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const text = `${space.id} · ${space.name}${space.required ? '' : ' (optional)'}`;
    floorLabel(b, text, STYLE.room, cx, cz, space.kind === 'crawl' ? 0.18 : 0.3, (x1 - x0) >= (z1 - z0) ? 0 : Math.PI / 2);
    if (space.ceiling >= 2.5) hangingLabel(b, text, STYLE.room, cx, space.ceiling - 0.35, cz, (x1 - x0) >= (z1 - z0) ? 0 : Math.PI / 2);
  }
}

function buildWalls(b: WorldBuilder, layout: GreyboxLayout): void {
  for (const seg of layout.walls) {
    const len = seg.to - seg.from;
    const mid = (seg.from + seg.to) / 2;
    const h = seg.top - seg.bottom;
    const cy = (seg.top + seg.bottom) / 2;
    const [cx, cz, sx, sz] = seg.axis === 'z' ? [seg.at, mid, WALL_T, len] : [mid, seg.at, len, WALL_T];
    const roomId = roomIdOf(seg.sides[0] ?? seg.sides[1]!);
    const material: MaterialKey = seg.kind === 'sill' ? 'wainscot' : 'wall';
    b.block(material, cx, cy, cz, sx, h, sz, 0, { shade: 'flat', tint: seg.kind === 'lintel' ? 0.9 : 1 });
    b.solid(cx, cy, cz, sx, h, sz, { roomId, scope: 'gb', kind: seg.kind });
  }
}

/** Side ('neg' | 'pos') of the connection line on which `spaceId` lies. */
function sideOf(layout: GreyboxLayout, connection: ConnectionDef, spaceId: string): 'neg' | 'pos' {
  const probe = connection.axis === 'z' ? layout.spaceAt(connection.at + 0.2, connection.center) : layout.spaceAt(connection.center, connection.at + 0.2);
  return probe?.id === spaceId ? 'pos' : 'neg';
}

function buildConnections(b: WorldBuilder, layout: GreyboxLayout): void {
  for (const connection of CONNECTIONS) {
    if (connection.kind === 'door' && connection.door) {
      const spec = connection.door;
      const into = spec.swingInto ?? connection.b;
      const swing = sideOf(layout, connection, into);
      const leaves = spec.double
        ? [
          { name: `gb-${connection.id}-a`, center: connection.center - connection.width / 4, opening: connection.width / 2, hinge: 'min' as const },
          { name: `gb-${connection.id}-b`, center: connection.center + connection.width / 4, opening: connection.width / 2, hinge: 'max' as const },
        ]
        : [{ name: `gb-${connection.id}`, center: connection.center, opening: connection.width, hinge: spec.hinge ?? 'min' as const }];
      for (const leaf of leaves) {
        door(b, {
          name: leaf.name, roomId: roomIdOf(into), axis: connection.axis, at: connection.at, center: leaf.center, opening: leaf.opening,
          hinge: leaf.hinge, swing, initial: spec.initial, vision: spec.vision ?? 'narrow',
          ...(spec.requires ? { requirements: [{ id: spec.requires, description: spec.requiresText ?? `Requires ${spec.requires}` }] } : {}),
          ...(spec.prompt ? { prompt: spec.prompt } : {}),
          leafTint: spec.requires ? 0.75 : spec.initial === 'locked' ? 0.55 : 1,
        });
      }
      const label = `${connection.id}${spec.initial === 'locked' ? ' · LOCKED' : ''}${spec.requires ? ` · needs ${spec.requires}` : ''}`;
      const style = spec.initial === 'locked' ? STYLE.encounter : spec.requires ? STYLE.placeholder : STYLE.room;
      const [lx, lz] = connection.axis === 'z' ? [connection.at, connection.center] : [connection.center, connection.at];
      const span = layout.openings.get(connection.id)!;
      if (span.wallHeight > 2.45) hangingLabel(b, label, style, lx, 2.32, lz, connection.axis === 'x' ? 0 : Math.PI / 2, 0.16);
    } else if (connection.kind === 'window') {
      const span = layout.openings.get(connection.id)!;
      const h = span.top - span.bottom;
      const [cx, cz, sx, sz] = connection.axis === 'z' ? [connection.at, connection.center, 0.02, connection.width] : [connection.center, connection.at, connection.width, 0.02];
      b.block('glass', cx, span.bottom + h / 2, cz, sx, h, sz, 0, { shade: 'flat' });
    } else if (connection.kind === 'hatch') {
      const span = layout.openings.get(connection.id)!;
      const [cx, cz] = connection.axis === 'z' ? [connection.at, connection.center] : [connection.center, connection.at];
      const along = (v: number): [number, number] => (connection.axis === 'z' ? [cx, cz + v] : [cx + v, cz]);
      for (const end of [-1, 1]) {
        const [px, pz] = along(end * (connection.width / 2 + 0.03));
        b.block('yellowPaint', px, span.top / 2, pz, connection.axis === 'z' ? WALL_T + 0.04 : 0.06, span.top, connection.axis === 'z' ? 0.06 : WALL_T + 0.04, 0, { shade: 'flat' });
      }
      b.block('yellowPaint', cx, span.top + 0.03, cz, connection.axis === 'z' ? WALL_T + 0.04 : connection.width + 0.12, 0.06, connection.axis === 'z' ? connection.width + 0.12 : WALL_T + 0.04, 0, { shade: 'flat' });
      if (span.wallHeight > 2) hangingLabel(b, `${connection.id.toUpperCase()} (crouch)`, STYLE.placeholder, cx, Math.min(span.top + 0.35, span.wallHeight - 0.2), cz, connection.axis === 'x' ? 0 : Math.PI / 2, 0.16);
    }
  }
}

function bedExits(layout: GreyboxLayout, space: string, x: number, z: number, yaw: number, offset: number): SpawnPoseForExit[] {
  // Long axis along local z; exits beside the bed, along local x.
  const exits: SpawnPoseForExit[] = [];
  for (const side of [1, -1]) {
    for (const slide of [0, 0.6, -0.6]) {
      const ex = x + Math.cos(yaw) * side * offset + Math.sin(yaw) * slide;
      const ez = z - Math.sin(yaw) * side * offset + Math.cos(yaw) * slide;
      if (layout.spaceAt(ex, ez)?.id !== space) continue;
      exits.push({ position: { x: ex, y: 0, z: ez }, yaw: Math.atan2(side * Math.cos(yaw), -side * Math.sin(yaw)) });
    }
  }
  return exits;
}

function buildFeatures(b: WorldBuilder, layout: GreyboxLayout, controls: GreyboxControl[], hiding: Map<string, string>): void {
  for (const feature of FEATURES as readonly FeatureDef[]) {
    const roomId = roomIdOf(feature.space);
    if (layout.spaceAt(feature.x, feature.z)?.id !== feature.space) throw new Error(`Feature "${feature.id}" is not inside ${feature.space}`);
    switch (feature.kind) {
      case 'bed': {
        const yaw = feature.yaw ?? 0;
        b.block('steel', feature.x, 0.2, feature.z, 0.9, 0.4, 2.0, yaw, { tint: 0.8 });
        b.block('mattress', feature.x, 0.5, feature.z, 0.92, 0.2, 2.0, yaw);
        b.block('linen', feature.x, 0.62, feature.z - Math.cos(yaw) * 0.75, 0.6, 0.1, 0.35, yaw);
        const collider = b.solid(feature.x, 0.31, feature.z, 0.95, 0.62, 2.05, { yaw, roomId, scope: 'gb', kind: 'bed' });
        if (feature.hide) {
          addBedHiding(b, `gb-${feature.id}`, { x: feature.x, z: feature.z, yaw }, roomId, collider, bedExits(layout, feature.space, feature.x, feature.z, yaw, 0.95));
          hiding.set(`nw:hiding:gb-${feature.id}`, feature.id);
        }
        break;
      }
      case 'bench': {
        const yaw = feature.yaw ?? 0;
        b.block('laminate', feature.x, 0.42, feature.z, 0.7, 0.06, 1.9, yaw);
        b.block('steel', feature.x, 0.2, feature.z, 0.66, 0.4, 1.86, yaw, { tint: 0.6 });
        const collider = b.solid(feature.x, 0.225, feature.z, 0.7, 0.45, 1.9, { yaw, roomId, scope: 'gb', kind: 'bench' });
        addBedHiding(b, `gb-${feature.id}`, { x: feature.x, z: feature.z, yaw }, roomId, collider, bedExits(layout, feature.space, feature.x, feature.z, yaw, 0.8));
        hiding.set(`nw:hiding:gb-${feature.id}`, feature.id);
        break;
      }
      case 'locker': {
        const place: Place = { x: feature.x, z: feature.z, yaw: feature.yaw };
        if (feature.hide === false) {
          b.solidBlock('lockerPaint', feature.x, 0.975, feature.z, 0.64, 1.95, 0.58, roomId, feature.yaw);
        } else {
          addLockerHiding(b, `gb-${feature.id}`, place, roomId);
          hiding.set(`nw:hiding:gb-${feature.id}`, feature.id);
        }
        break;
      }
      case 'block': {
        b.solidBlock(feature.cover ? 'cabinetBlue' : 'beigePlastic', feature.x, feature.h / 2, feature.z, feature.w, feature.h, feature.d, roomId, 0, { tint: 0.95 });
        if (feature.label) hangingLabel(b, feature.label, STYLE.room, feature.x, feature.h + 0.2, feature.z, feature.w >= feature.d ? 0 : Math.PI / 2, 0.14);
        break;
      }
      case 'control': {
        const id = controlIdOf(feature.id);
        b.block('yellowPaint', feature.x, 0.6, feature.z, 0.06, 1.2, 0.06, 0, { shade: 'flat' });
        b.block('yellowPaint', feature.x, 1.2, feature.z, 0.34, 0.34, 0.34, 0, { shade: 'flat' });
        b.block('black', feature.x, 1.2, feature.z, 0.36, 0.08, 0.36, 0, { shade: 'flat' });
        const object = proxy(b, id, { x: feature.x, z: feature.z, yaw: 0 }, [0.6, 0.6, 0.6], 1.2);
        const marker: InteractableMarker = {
          id, type: 'inspect', object, prompt: `[DEV] ${feature.label}`, range: 2.4,
          ...(feature.requires ? { requirements: [{ id: feature.requires, description: feature.requiresText ?? `Requires ${feature.requires}` }] } : {}),
        };
        b.interactables.push(marker);
        controls.push({ featureId: feature.id, interactableId: id, sets: feature.sets, ...(feature.requires ? { requires: feature.requires } : {}), position: { x: feature.x, z: feature.z }, label: feature.label });
        hangingLabel(b, `DEV CONTROL: ${feature.label}`, STYLE.control, feature.x, 1.68, feature.z, 0, 0.14);
        break;
      }
      case 'marker': {
        const style = STYLE[feature.category];
        const top = Math.min(2.2, layout.spaceAt(feature.x, feature.z)!.ceiling - 0.15);
        b.block(feature.category === 'mirror' ? 'chrome' : 'black', feature.x, top / 2, feature.z, 0.04, top, 0.04, 0, { shade: 'flat' });
        if (feature.category === 'mirror') b.block('chrome', feature.x, Math.min(2.3, top), feature.z, 0.5, 0.5, 0.05, Math.PI / 4, { shade: 'flat' });
        hangingLabel(b, feature.label, style, feature.x, Math.max(0.5, top - 0.1), feature.z, 0, top < 1.5 ? 0.1 : 0.14);
        break;
      }
    }
  }
}

export function createGreyboxWorld(options: { textures?: boolean } = {}): GreyboxWorldBuild {
  const layout = buildLayout();
  const b = new WorldBuilder(0x6772, { ...(options.textures === undefined ? {} : { textures: options.textures }) });
  b.root.name = 'nw:greybox';
  const controls: GreyboxControl[] = [];
  const hiding = new Map<string, string>();
  try {
    buildSpaces(b);
    buildWalls(b, layout);
    buildConnections(b, layout);
    buildFeatures(b, layout, controls, hiding);
    // Neutral greybox lighting only (no production lighting).
    const hemi = new HemisphereLight(0xf4f2ea, 0x55524a, 2.2);
    hemi.name = 'nw:greybox:hemisphere';
    const ambient = new AmbientLight(0xffffff, 0.45);
    ambient.name = 'nw:greybox:ambient';
    b.attach(hemi);
    b.attach(ambient);
    b.finalize();
  } catch (error) {
    b.dispose();
    throw error;
  }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = 0;
  for (const space of SPACES) for (const [x0, x1, z0, z1] of space.rects) {
    minX = Math.min(minX, x0); maxX = Math.max(maxX, x1); minZ = Math.min(minZ, z0); maxZ = Math.max(maxZ, z1); maxY = Math.max(maxY, space.ceiling);
  }
  const world: HospitalWorld = {
    id: GREYBOX_WORLD_ID,
    root: b.root,
    bounds: { min: { x: minX - 0.5, y: -0.3, z: minZ - 0.5 }, max: { x: maxX + 0.5, y: maxY + 0.5, z: maxZ + 0.5 } },
    rooms: b.rooms,
    colliders: b.colliders,
    interactables: b.interactables,
    doors: b.doors,
    hidingLocations: b.hidingLocations,
    entitySpawns: [],
    patrolRoutes: [],
    playerSpawn: { position: { x: SPAWN.x, y: 0, z: SPAWN.z }, yaw: SPAWN.yaw },
  };
  b.root.updateMatrixWorld(true);
  let disposed = false;
  return {
    world, layout, controls, hiding,
    dispose() {
      if (disposed) return;
      disposed = true;
      b.root.removeFromParent();
      b.dispose();
    },
  };
}
