import { BufferAttribute, BufferGeometry, Group, Matrix4, Vector3 } from 'three';
import type { DoorMarker, DoorState, InteractionRequirement, ObjectId } from '../contracts';
import { box, cylinder, cylinderBetween, plane, yawQuaternion } from './core/geometry';
import type { MaterialKey } from './core/materials';
import type { Part, WorldBuilder } from './core/builder';
import type { FixtureState } from './extras';

export const WALL_HEIGHT = 3.0;
export const WALL_THICKNESS = 0.15;
export const DOOR_HEIGHT = 2.1;

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------------------------
// Floors & ceilings
// ---------------------------------------------------------------------------------------------

/** Subdivided floor with baked edge occlusion, plus its collision slab. */
export function floorRect(b: WorldBuilder, roomId: ObjectId, x0: number, x1: number, z0: number, z1: number, material: MaterialKey = 'floor', options: { collide?: boolean; aoStrength?: number; y?: number } = {}): void {
  const w = x1 - x0;
  const d = z1 - z0;
  const y = options.y ?? 0;
  const segX = Math.max(1, Math.round(w / 0.4));
  const segZ = Math.max(1, Math.round(d / 0.4));
  const geometry = plane(w, d, segX, segZ);
  geometry.rotateX(-Math.PI / 2);
  const strength = options.aoStrength ?? 0.42;
  b.add(material, geometry, new Matrix4().makeTranslation((x0 + x1) / 2, y, (z0 + z1) / 2), {
    shade: (x, _y, z) => {
      const edge = Math.min(x - x0, x1 - x, z - z0, z1 - z);
      return 1 - strength * (1 - smooth(0, 0.85, edge));
    },
  });
  if (options.collide ?? true) b.solid((x0 + x1) / 2, y - 0.1, (z0 + z1) / 2, w + 0.3, 0.2, d + 0.3, { roomId, kind: 'floor' });
}

export interface CeilingHole { readonly x: number; readonly z: number; readonly hanging?: boolean }

/** Suspended tile ceiling (facing down). Holes punch a dark void with dangling cabling. */
export function ceilingRect(b: WorldBuilder, x0: number, x1: number, z0: number, z1: number, height: number, material: MaterialKey = 'ceiling', holes: readonly CeilingHole[] = []): void {
  const w = x1 - x0;
  const d = z1 - z0;
  const geometry = plane(w, d, Math.max(1, Math.round(w / 0.6)), Math.max(1, Math.round(d / 0.6)));
  geometry.rotateX(Math.PI / 2);
  b.add(material, geometry, new Matrix4().makeTranslation((x0 + x1) / 2, height, (z0 + z1) / 2), {
    shade: (x, _y, z) => {
      const edge = Math.min(x - x0, x1 - x, z - z0, z1 - z);
      return 0.72 + 0.28 * smooth(0, 0.7, edge);
    },
  });
  for (const hole of holes) {
    const voidPlane = plane(0.6, 0.6);
    voidPlane.rotateX(Math.PI / 2);
    b.add('ceilingVoid', voidPlane, new Matrix4().makeTranslation(hole.x, height - 0.004, hole.z), { shade: 'flat' });
    // Exposed cabling hanging out of the void.
    for (let i = 0; i < 3; i++) {
      const top = new Vector3(hole.x + b.rng.range(-0.25, 0.25), height + 0.05, hole.z + b.rng.range(-0.25, 0.25));
      const bottom = new Vector3(top.x + b.rng.range(-0.2, 0.2), height - b.rng.range(0.25, 0.8), top.z + b.rng.range(-0.2, 0.2));
      const wire = cylinderBetween(top, bottom, 0.006, 4);
      b.add(i === 0 ? 'redPaint' : 'rubber', wire.geometry, wire.matrix, { shade: 'flat' });
    }
    if (hole.hanging) {
      // The displaced tile hangs from one corner of the grid.
      const tile = box(0.58, 0.015, 0.58);
      const m = new Matrix4().makeRotationX(0.9).premultiply(new Matrix4().makeRotationY(b.rng.range(0, Math.PI)));
      m.setPosition(hole.x + 0.2, height - 0.32, hole.z);
      b.add(material, tile, m, { shade: 'flat', tint: 0.85 });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Walls
// ---------------------------------------------------------------------------------------------

export interface Opening {
  readonly from: number;
  readonly to: number;
  readonly bottom: number;
  readonly top: number;
  /** Keep collision across the opening (windows, sealed lift doors). Default: true when bottom > 0. */
  readonly collide?: boolean;
}

export interface WallFinish {
  readonly wainscot?: boolean;
  readonly rail?: boolean;
  readonly skirting?: boolean;
  /** Override core material on this face (thin skin). */
  readonly skin?: MaterialKey;
}

export interface WallSpec {
  /** 'x': wall runs along X at z = at. 'z': wall runs along Z at x = at. */
  readonly axis: 'x' | 'z';
  readonly at: number;
  readonly from: number;
  readonly to: number;
  readonly openings?: readonly Opening[];
  readonly height?: number;
  readonly thickness?: number;
  readonly core?: MaterialKey;
  /** Finish on the face pointing toward -axis-normal (-z for 'x' walls, -x for 'z' walls). */
  readonly neg?: WallFinish;
  readonly pos?: WallFinish;
  readonly roomId?: ObjectId;
}

export function wall(b: WorldBuilder, spec: WallSpec): void {
  const H = spec.height ?? WALL_HEIGHT;
  const T = spec.thickness ?? WALL_THICKNESS;
  const core = spec.core ?? 'wall';
  const openings = [...(spec.openings ?? [])].sort((a, c) => a.from - c.from);
  const place = (along: number, y: number, across: number, sizeAlong: number, sizeY: number, sizeAcross: number): [number, number, number, number, number, number] =>
    spec.axis === 'x'
      ? [along, y, spec.at + across, sizeAlong, sizeY, sizeAcross]
      : [spec.at + across, y, along, sizeAcross, sizeY, sizeAlong];
  const colliderOpts = { kind: 'wall', ...(spec.roomId ? { roomId: spec.roomId } : {}) };

  const solids: [number, number][] = [];
  let cursor = spec.from;
  for (const o of openings) {
    if (o.from > cursor + 1e-3) solids.push([cursor, o.from]);
    cursor = Math.max(cursor, o.to);
  }
  if (spec.to > cursor + 1e-3) solids.push([cursor, spec.to]);

  for (const [a, c] of solids) {
    const [x, y, z, sx, sy, sz] = place((a + c) / 2, H / 2, 0, c - a, H, T);
    b.block(core, x, y, z, sx, sy, sz);
    b.solid(x, y, z, sx, sy, sz, colliderOpts);
  }
  for (const o of openings) {
    if (o.top < H - 1e-3) {
      const [x, y, z, sx, sy, sz] = place((o.from + o.to) / 2, (o.top + H) / 2, 0, o.to - o.from, H - o.top, T);
      b.block(core, x, y, z, sx, sy, sz);
    }
    if (o.bottom > 1e-3) {
      const [x, y, z, sx, sy, sz] = place((o.from + o.to) / 2, o.bottom / 2, 0, o.to - o.from, o.bottom, T);
      b.block(core, x, y, z, sx, sy, sz);
    }
    if (o.collide ?? o.bottom > 1e-3) {
      const [x, y, z, sx, sy, sz] = place((o.from + o.to) / 2, H / 2, 0, o.to - o.from, H, T);
      b.solid(x, y, z, sx, sy, sz, colliderOpts);
    }
  }

  // Face finishes: skirting, protective wainscot and crash rail along solid runs and under sills.
  const runs: { a: number; c: number; maxY: number }[] = solids.map(([a, c]) => ({ a, c, maxY: H }));
  for (const o of openings) if (o.bottom > 0.3) runs.push({ a: o.from, c: o.to, maxY: o.bottom });
  for (const side of [-1, 1] as const) {
    const finish = side < 0 ? spec.neg : spec.pos;
    if (!finish) continue;
    const face = side * (T / 2);
    for (const run of runs) {
      const len = run.c - run.a;
      if (len < 0.05) continue;
      const mid = (run.a + run.c) / 2;
      if (finish.skin && run.maxY >= H) {
        const [x, y, z, sx, sy, sz] = place(mid, H / 2, face + side * 0.004, len, H, 0.008);
        b.block(finish.skin, x, y, z, sx, sy, sz);
      }
      if (finish.wainscot) {
        const top = Math.min(1.05, run.maxY);
        const [x, y, z, sx, sy, sz] = place(mid, (0.1 + top) / 2, face + side * 0.006, len, top - 0.1, 0.012);
        b.block('wainscot', x, y, z, sx, sy, sz);
      }
      if (finish.skirting ?? true) {
        const [x, y, z, sx, sy, sz] = place(mid, 0.05, face + side * 0.01, len, 0.1, 0.02);
        b.block('skirting', x, y, z, sx, sy, sz, 0, { shade: 'flat', tint: 0.9 });
      }
      if (finish.rail && run.maxY > 1.2) {
        const [x, y, z, sx, sy, sz] = place(mid, 0.92, face + side * 0.04, len, 0.13, 0.03);
        b.block('rail', x, y, z, sx, sy, sz);
        for (let s = run.a + 0.3; s < run.c - 0.1; s += 1.2) {
          const [bx, by, bz, bsx, bsy, bsz] = place(s, 0.92, face + side * 0.018, 0.04, 0.06, 0.03);
          b.block('chrome', bx, by, bz, bsx, bsy, bsz, 0, { shade: 'flat' });
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------------------------

export interface WindowSpec {
  readonly axis: 'x' | 'z';
  readonly at: number;
  readonly from: number;
  readonly to: number;
  readonly bottom: number;
  readonly top: number;
  /** +1 if the exterior lies on the positive side of the wall, -1 otherwise. */
  readonly outside: 1 | -1;
  readonly roomId: ObjectId;
  readonly blinds?: 'open' | 'half' | 'closed' | 'broken' | 'none';
  readonly boarded?: boolean;
  readonly shaft?: boolean;
  readonly moonIntensity?: number;
}

export function windowUnit(b: WorldBuilder, spec: WindowSpec): void {
  const T = WALL_THICKNESS;
  const w = spec.to - spec.from;
  const h = spec.top - spec.bottom;
  const mid = (spec.from + spec.to) / 2;
  const cy = (spec.bottom + spec.top) / 2;
  const inside = -spec.outside;
  const m = (along: number, y: number, across: number, yaw = 0): Matrix4 => {
    const pos = spec.axis === 'x' ? new Vector3(along, y, spec.at + across) : new Vector3(spec.at + across, y, along);
    return new Matrix4().makeRotationY((spec.axis === 'x' ? 0 : Math.PI / 2) + yaw).setPosition(pos);
  };
  const fw = 0.05;
  // Aluminium frame and central mullion.
  b.add('frame', box(w, fw, T + 0.02), m(mid, spec.top - fw / 2, 0));
  b.add('frame', box(w, fw, T + 0.02), m(mid, spec.bottom + fw / 2, 0));
  b.add('frame', box(fw, h, T + 0.02), m(spec.from + fw / 2, cy, 0));
  b.add('frame', box(fw, h, T + 0.02), m(spec.to - fw / 2, cy, 0));
  b.add('frame', box(0.035, h, 0.06), m(mid, cy, 0));
  // Interior sill ledge.
  b.add('laminate', box(w + 0.1, 0.03, 0.22), m(mid, spec.bottom - 0.015, inside * 0.1));
  // Glass and the night beyond it.
  const glass = plane(w - fw * 2, h - fw * 2);
  {
    const paneAlong = spec.from + w / 4 + fw * 0.25;
    const across = inside * 0.02;
    b.reflectiveSurfaces.push({
      id: b.id('glass', spec.roomId.split(':').pop() ?? 'room'), kind: 'window', roomId: spec.roomId,
      position: spec.axis === 'x' ? new Vector3(paneAlong, cy, spec.at + across) : new Vector3(spec.at + across, cy, paneAlong),
      normal: spec.axis === 'x' ? new Vector3(0, 0, inside) : new Vector3(inside, 0, 0),
      width: w / 2 - fw * 1.5, height: h - fw * 2,
    });
  }
  b.add('glass', glass, m(mid, cy, spec.outside * 0.01, spec.outside > 0 ? Math.PI : 0), { uv: 'local', shade: 'flat' });
  const sky = plane(w + 3.5, h + 2.4);
  b.add('sky', sky, m(mid, cy + 0.4, spec.outside * 1.4, spec.outside > 0 ? Math.PI : 0), { uv: 'local', shade: 'flat' });
  // Exterior reveal so the sky backdrop never shows a seam around the opening.
  b.add('concrete', box(w + 0.2, 0.02, 0.5), m(mid, spec.bottom - 0.02, spec.outside * 0.32), { tint: 0.4 });

  if (spec.boarded) {
    for (let i = 0; i < 5; i++) {
      const y = spec.bottom + 0.12 + i * (h / 5) + b.rng.range(-0.03, 0.03);
      b.add('darkWood', box(w + 0.18, 0.17, 0.025), m(mid, y, inside * (T / 2 + 0.02)).multiply(new Matrix4().makeRotationZ(b.rng.range(-0.06, 0.06))), { tint: b.rng.range(0.75, 1.05) });
    }
  }

  const blinds = spec.blinds ?? 'half';
  if (blinds !== 'none' && !spec.boarded) {
    const headY = spec.top - 0.03;
    b.add('blinds', box(w - 0.02, 0.04, 0.05), m(mid, headY, inside * (T / 2 + 0.05)));
    const drop = blinds === 'closed' ? h - 0.08 : blinds === 'half' ? h * 0.55 : blinds === 'open' ? 0.18 : h - 0.1;
    const slats = Math.floor(drop / 0.045);
    for (let i = 0; i < slats; i++) {
      const y = headY - 0.04 - i * 0.045;
      if (blinds === 'broken' && b.rng.chance(0.18)) continue;
      const tilt = blinds === 'closed' ? 0.2 : 0.9 + b.rng.range(-0.1, 0.1);
      const bend = blinds === 'broken' && b.rng.chance(0.25) ? b.rng.range(-0.35, 0.35) : 0;
      const slat = box(w - 0.04, 0.003, 0.048);
      const sm = m(mid, y, inside * (T / 2 + 0.05)).multiply(new Matrix4().makeRotationZ(bend)).multiply(new Matrix4().makeRotationX(tilt));
      b.add('blinds', slat, sm, { shade: 'flat', tint: b.rng.range(0.85, 1) });
    }
    // Pull cord.
    const cordTop = m(spec.to - 0.12, headY - 0.02, inside * (T / 2 + 0.07));
    const top = new Vector3().setFromMatrixPosition(cordTop);
    const bottom = top.clone().setY(headY - drop - 0.3);
    const cord = cylinderBetween(top, bottom, 0.003, 3);
    b.add('whitePlastic', cord.geometry, cord.matrix, { shade: 'flat' });
  }

  const inwardOffset = (d: number): Vector3 => spec.axis === 'x' ? new Vector3(mid, 0, spec.at + inside * d) : new Vector3(spec.at + inside * d, 0, mid);
  if (spec.shaft ?? true) {
    // Additive moonlight beam: a slanted quad from the window onto the floor plus a floor patch.
    const reach = 2.2;
    const geom = new BufferGeometry();
    const p = (along: number, y: number, across: number): number[] => spec.axis === 'x' ? [along, y, spec.at + inside * across] : [spec.at + inside * across, y, along];
    const verts = [
      ...p(spec.from + 0.1, spec.top - 0.1, 0.1), ...p(spec.to - 0.1, spec.top - 0.1, 0.1),
      ...p(spec.to - 0.1 + 0.3, 0.01, reach), ...p(spec.from + 0.1 + 0.3, 0.01, reach),
    ];
    geom.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
    geom.setAttribute('uv', new BufferAttribute(new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]), 2));
    geom.setIndex([0, 2, 1, 0, 3, 2]);
    geom.computeVertexNormals();
    b.add(spec.blinds === 'open' || spec.boarded ? 'shaft' : 'shaftSlats', geom, null, { uv: 'local', shade: 'flat', tint: spec.boarded ? 0.25 : 0.38 });
    const patch = plane(w * 0.9, 1.4);
    patch.rotateX(-Math.PI / 2);
    const c = inwardOffset(reach - 0.5);
    const pm = new Matrix4().makeRotationY(spec.axis === 'x' ? 0 : Math.PI / 2).setPosition(c.x + (spec.axis === 'x' ? 0.25 : 0), 0.012, c.z + (spec.axis === 'z' ? 0.25 : 0));
    b.add(spec.blinds === 'open' || spec.boarded ? 'shaft' : 'shaftSlats', patch, pm, { uv: 'local', shade: 'flat', tint: spec.boarded ? 0.2 : 0.32 });
  }
  const moon = inwardOffset(0.9);
  b.fixture({
    kind: 'moon', state: 'steady', roomId: spec.roomId, circuits: ['nw:lights:moon'],
    position: new Vector3(moon.x, spec.top - 0.3, moon.z), color: 0x7088c0,
    intensity: spec.moonIntensity ?? (spec.boarded ? 0.5 : 1.6), distance: 5.5,
  });
}

// ---------------------------------------------------------------------------------------------
// Doors
// ---------------------------------------------------------------------------------------------

export interface DoorSpec {
  readonly name: string;
  readonly roomId: ObjectId;
  readonly axis: 'x' | 'z';
  readonly at: number;
  /** Centre of the opening along the wall. */
  readonly center: number;
  readonly opening?: number;
  readonly hinge: 'min' | 'max';
  readonly swing: 'neg' | 'pos';
  readonly initial: DoorState;
  readonly vision?: 'narrow' | 'wide' | 'none';
  readonly requirements?: readonly InteractionRequirement[];
  readonly prompt?: string;
  readonly openAngle?: number;
  readonly duration?: number;
  readonly frame?: boolean;
  readonly chained?: boolean;
  readonly leafTint?: number;
}

export interface DoorResult {
  readonly marker: DoorMarker;
  readonly hinge: Vector3;
  readonly opening: { from: number; to: number };
}

/** Hinged door: static frame, kinematic collider, and an animatable hinge-origin group. */
export function door(b: WorldBuilder, spec: DoorSpec): DoorResult {
  const openingWidth = spec.opening ?? 1.2;
  const from = spec.center - openingWidth / 2;
  const to = spec.center + openingWidth / 2;
  const leafWidth = openingWidth - 0.1;
  const leafHeight = DOOR_HEIGHT - 0.02;
  const thickness = 0.045;
  const id = `nw:door:${spec.name}`;
  const pos = (along: number, y: number, across: number): Vector3 => spec.axis === 'x' ? new Vector3(along, y, spec.at + across) : new Vector3(spec.at + across, y, along);

  if (spec.frame ?? true) {
    const fm = (along: number, y: number, sx: number, sy: number): void => {
      const p = pos(along, y, 0);
      b.add('frame', box(spec.axis === 'x' ? sx : WALL_THICKNESS + 0.04, sy, spec.axis === 'x' ? WALL_THICKNESS + 0.04 : sx), new Matrix4().makeTranslation(p.x, p.y, p.z));
    };
    fm(from + 0.025, DOOR_HEIGHT / 2, 0.05, DOOR_HEIGHT);
    fm(to - 0.025, DOOR_HEIGHT / 2, 0.05, DOOR_HEIGHT);
    fm(spec.center, DOOR_HEIGHT + 0.03, openingWidth, 0.06);
  }

  const hinge = pos(spec.hinge === 'min' ? from + 0.05 : to - 0.05, 0, 0);
  const leafDir = spec.hinge === 'min' ? 1 : -1;
  const closedYaw = spec.axis === 'x' ? 0 : -Math.PI / 2;
  const roomNormal = spec.axis === 'x' ? new Vector3(0, 0, spec.swing === 'pos' ? 1 : -1) : new Vector3(spec.swing === 'pos' ? 1 : -1, 0, 0);
  const angle = spec.openAngle ?? Math.PI * 0.5;
  const worldDir = (yaw: number): Vector3 => new Vector3(leafDir * Math.cos(yaw), 0, -leafDir * Math.sin(yaw));
  const openYaw = worldDir(closedYaw + angle).dot(roomNormal) > 0 ? closedYaw + angle : closedYaw - angle;
  // NW-004A blockout review stage: every ordinary (closed, unlocked) door starts open.
  const initialState = b.layout === 'chapter1' && b.stage === 'review' && spec.initial === 'closed' ? 'open' : spec.initial;
  const initialOpen = initialState === 'open';
  const initialYaw = initialOpen ? openYaw : closedYaw;

  // Leaf with an optional vision panel cut out of it (built from four rails around the glass).
  const parts: Part[] = [];
  const lx = (x: number): number => leafDir * x;
  const vision = spec.vision ?? 'narrow';
  const panel = vision === 'none' ? null : vision === 'narrow'
    ? { x0: leafWidth - 0.38, x1: leafWidth - 0.2, y0: 1.15, y1: 1.85 }
    : { x0: 0.18, x1: leafWidth - 0.18, y0: 1.05, y1: 1.9 };
  const slab = (x0: number, x1: number, y0: number, y1: number): void => {
    if (x1 - x0 < 0.01 || y1 - y0 < 0.01) return;
    parts.push({ material: 'doorLeaf', geometry: box(x1 - x0, y1 - y0, thickness), matrix: new Matrix4().makeTranslation(lx((x0 + x1) / 2), (y0 + y1) / 2, 0), options: { tint: spec.leafTint ?? 1 } });
  };
  if (panel) {
    slab(0.01, panel.x0, 0.01, leafHeight);
    slab(panel.x1, leafWidth, 0.01, leafHeight);
    slab(panel.x0, panel.x1, 0.01, panel.y0);
    slab(panel.x0, panel.x1, panel.y1, leafHeight);
    parts.push({ material: 'glass', geometry: box(panel.x1 - panel.x0, panel.y1 - panel.y0, 0.012), matrix: new Matrix4().makeTranslation(lx((panel.x0 + panel.x1) / 2), (panel.y0 + panel.y1) / 2, 0), options: { shade: 'flat' } });
    parts.push({ material: 'frame', geometry: box(panel.x1 - panel.x0 + 0.04, 0.02, thickness + 0.01), matrix: new Matrix4().makeTranslation(lx((panel.x0 + panel.x1) / 2), panel.y0 - 0.01, 0), options: { shade: 'flat' } });
    parts.push({ material: 'frame', geometry: box(panel.x1 - panel.x0 + 0.04, 0.02, thickness + 0.01), matrix: new Matrix4().makeTranslation(lx((panel.x0 + panel.x1) / 2), panel.y1 + 0.01, 0), options: { shade: 'flat' } });
  } else {
    slab(0.01, leafWidth, 0.01, leafHeight);
  }
  // Kick plates, push plate and lever handles on both faces.
  for (const face of [-1, 1]) {
    parts.push({ material: 'steel', geometry: box(leafWidth - 0.06, 0.24, 0.004), matrix: new Matrix4().makeTranslation(lx(leafWidth / 2), 0.14, face * (thickness / 2 + 0.002)), options: { shade: 'flat' } });
    parts.push({ material: 'chrome', geometry: box(0.07, 0.2, 0.012), matrix: new Matrix4().makeTranslation(lx(leafWidth - 0.08), 1.0, face * (thickness / 2 + 0.006)), options: { shade: 'flat' } });
    const lever = cylinder(0.011, 0.011, 0.13, 6);
    lever.rotateZ(Math.PI / 2);
    parts.push({ material: 'chrome', geometry: lever, matrix: new Matrix4().makeTranslation(lx(leafWidth - 0.13), 1.0, face * (thickness / 2 + 0.045)), options: { shade: 'flat' } });
    parts.push({ material: 'chrome', geometry: cylinder(0.008, 0.008, 0.04, 6).rotateX(Math.PI / 2), matrix: new Matrix4().makeTranslation(lx(leafWidth - 0.08), 1.0, face * (thickness / 2 + 0.025)), options: { shade: 'flat' } });
  }
  // Hinge knuckles.
  for (const y of [0.25, 1.05, 1.85]) {
    parts.push({ material: 'chrome', geometry: cylinder(0.012, 0.012, 0.1, 6), matrix: new Matrix4().makeTranslation(0, y, 0), options: { shade: 'flat' } });
  }
  if (spec.chained) {
    // Chain looped through the lever and the push bar, with a heavy padlock.
    for (let i = 0; i < 9; i++) {
      const link = cylinder(0.02, 0.02, 0.008, 8);
      link.rotateX(Math.PI / 2);
      if (i % 2) link.rotateY(Math.PI / 2);
      for (const face of [-1, 1]) {
        parts.push({ material: 'steel', geometry: link.clone(), matrix: new Matrix4().makeTranslation(lx(leafWidth - 0.12 - i * 0.03), 1.0 - Math.sin((i / 8) * Math.PI) * 0.12, face * (thickness / 2 + 0.05)), options: { shade: 'flat', tint: 0.7 } });
      }
      link.dispose();
    }
    parts.push({ material: 'yellowPaint', geometry: box(0.07, 0.08, 0.035), matrix: new Matrix4().makeTranslation(lx(leafWidth - 0.24), 0.82, thickness / 2 + 0.06) });
    parts.push({ material: 'steel', geometry: box(0.04, 0.04, 0.012), matrix: new Matrix4().makeTranslation(lx(leafWidth - 0.24), 0.88, thickness / 2 + 0.06), options: { shade: 'flat' } });
  }

  const group = b.mergedObject(parts, id);
  group.position.copy(hinge);
  group.rotation.set(0, initialYaw, 0);
  b.attach(group);

  // Collider follows the leaf in its initial state.
  const localCenter = new Vector3(lx(leafWidth / 2), leafHeight / 2, 0);
  const worldCenter = localCenter.clone().applyAxisAngle(new Vector3(0, 1, 0), initialYaw).add(hinge);
  const colliderId = b.solid(worldCenter.x, worldCenter.y, worldCenter.z, leafWidth, leafHeight, thickness + 0.01, {
    yaw: initialYaw, roomId: spec.roomId, scope: 'door', kind: spec.name, bodyType: 'kinematic', interactableId: id,
  });

  const locked = spec.initial === 'locked';
  const marker: DoorMarker = {
    id,
    type: 'door',
    object: group,
    prompt: spec.prompt ?? (locked ? 'Locked' : 'Open door'),
    range: 2.2,
    colliderIds: [colliderId],
    initialState,
    closedPose: { position: { x: hinge.x, y: hinge.y, z: hinge.z }, rotation: yawQuaternion(closedYaw) },
    openPose: { position: { x: hinge.x, y: hinge.y, z: hinge.z }, rotation: yawQuaternion(openYaw) },
    durationSeconds: spec.duration ?? 0.9,
    ...(spec.requirements ? { requirements: spec.requirements } : {}),
  };
  b.interactables.push(marker);
  b.doors.push(marker);
  return { marker, hinge, opening: { from, to } };
}

// ---------------------------------------------------------------------------------------------
// Light fixtures
// ---------------------------------------------------------------------------------------------

/** Recessed 1200x600 fluorescent troffer with prismatic diffuser. */
export function troffer(b: WorldBuilder, roomId: ObjectId, x: number, z: number, ceiling: number, state: FixtureState, circuits: readonly string[], options: { rotate?: boolean; intensity?: number; color?: number; distance?: number } = {}): void {
  const yaw = options.rotate ? Math.PI / 2 : 0;
  const housing = new Matrix4().makeRotationY(yaw).setPosition(x, ceiling - 0.006, z);
  b.add('whitePlastic', box(1.2, 0.012, 0.6), housing, { shade: 'flat', tint: 0.9 });
  const panelMatrix = new Matrix4().makeRotationY(yaw).setPosition(x, ceiling - 0.016, z);
  b.fixture({
    kind: 'fluorescent', state, roomId, circuits,
    position: new Vector3(x, ceiling - 0.25, z),
    color: options.color ?? 0xdfeaf2,
    intensity: options.intensity ?? 5.5,
    distance: options.distance ?? 7,
    panel: { shape: 'troffer', matrix: panelMatrix },
  });
}

/** Wall-mounted emergency bulkhead with a red/amber glow. */
export function emergencyLight(b: WorldBuilder, roomId: ObjectId, position: Vector3, yaw: number, options: { color?: number; intensity?: number; state?: FixtureState } = {}): void {
  const m = new Matrix4().makeRotationY(yaw).setPosition(position);
  b.add('whitePlastic', box(0.32, 0.12, 0.08), m, { shade: 'flat', tint: 0.75 });
  const panel = new Matrix4().makeRotationY(yaw).multiply(new Matrix4().makeTranslation(0, -0.01, 0.045)).premultiply(new Matrix4().makeTranslation(position.x, position.y, position.z));
  const forward = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  b.fixture({
    kind: 'emergency', state: options.state ?? 'buzz', roomId, circuits: ['nw:lights:emergency'],
    position: position.clone().addScaledVector(forward, 0.25).add(new Vector3(0, -0.1, 0)),
    color: options.color ?? 0xff3a22, intensity: options.intensity ?? 2.2, distance: 6,
    panel: { shape: 'small', matrix: panel }, halo: 0.9, haloOpacity: 0.55,
  });
}

/** Caged bulkhead bulb for service spaces. */
export function cagedBulb(b: WorldBuilder, roomId: ObjectId, x: number, y: number, z: number, state: FixtureState, intensity = 3): void {
  b.add('steel', cylinder(0.06, 0.07, 0.04, 8), new Matrix4().makeTranslation(x, y + 0.08, z), { shade: 'flat', tint: 0.6 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const top = new Vector3(x + Math.cos(a) * 0.05, y + 0.07, z + Math.sin(a) * 0.05);
    const bottom = new Vector3(x + Math.cos(a) * 0.07, y - 0.08, z + Math.sin(a) * 0.07);
    const wire = cylinderBetween(top, bottom, 0.004, 3);
    b.add('rubber', wire.geometry, wire.matrix, { shade: 'flat' });
  }
  b.fixture({
    kind: 'caged', state, roomId, circuits: ['nw:lights:service'],
    position: new Vector3(x, y - 0.05, z), color: 0xffb46a, intensity, distance: 6,
    panel: { shape: 'bulb', matrix: new Matrix4().makeTranslation(x, y, z) }, halo: 0.7, haloOpacity: 0.45,
  });
}

/** Group helper used by props that should not merge (animated or interactive). */
export function newGroup(name: string): Group {
  const g = new Group();
  g.name = name;
  return g;
}
