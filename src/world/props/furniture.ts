import { BufferAttribute, CanvasTexture, Group, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from 'three';
import type { ObjectId } from '../../contracts';
import type { Part, WorldBuilder } from '../core/builder';
import { box, cylinder, cylinderBetween, plane, sphere, torus } from '../core/geometry';
import type { MaterialKey } from '../core/materials';
import { canUseCanvas } from '../core/textures';
import { basis, collide, local, part, put, type Place, worldPoint } from './common';

// ---------------------------------------------------------------------------------------------
// Beds
// ---------------------------------------------------------------------------------------------

export type BedState = 'made' | 'unmade' | 'stripped' | 'lump' | 'restraints' | 'cot' | 'bare';

function caster(b: WorldBuilder, p: Place, x: number, z: number): void {
  put(b, p, 'chrome', cylinder(0.012, 0.012, 0.16, 5), x, 0.17, z);
  put(b, p, 'rubber', cylinder(0.045, 0.045, 0.03, 8), x, 0.05, z, 0, 0, Math.PI / 2);
}

/** Electric hospital bed. Local frame: head toward -Z, foot toward +Z, mattress top ~0.62 m. */
export function hospitalBed(b: WorldBuilder, p: Place, roomId: ObjectId, state: BedState = 'made', options: { collide?: boolean; railsUp?: boolean } = {}): ObjectId | null {
  const cot = state === 'cot';
  const L = cot ? 1.45 : 2.05;
  const W = cot ? 0.75 : 0.95;
  for (const [x, z] of [[-W / 2 + 0.08, -L / 2 + 0.1], [W / 2 - 0.08, -L / 2 + 0.1], [-W / 2 + 0.08, L / 2 - 0.1], [W / 2 - 0.08, L / 2 - 0.1]] as const) caster(b, p, x, z);
  put(b, p, 'steel', box(W - 0.1, 0.1, L - 0.12), 0, 0.3, 0, 0, 0, 0, { tint: 0.85 });
  put(b, p, 'steel', box(0.12, 0.2, 0.5), 0, 0.2, 0);
  put(b, p, 'beigePlastic', box(W - 0.04, 0.06, L - 0.1), 0, 0.42, 0);
  if (state !== 'bare') {
    put(b, p, 'mattress', box(W - 0.1, 0.15, L - 0.16), 0, 0.53, 0, 0, 0, 0, { tint: state === 'stripped' ? 0.8 : 1 });
  }
  put(b, p, 'beigePlastic', box(W, 0.55, 0.05), 0, 0.72, -L / 2 + 0.02);
  put(b, p, 'beigePlastic', box(W, 0.38, 0.05), 0, 0.62, L / 2 - 0.02);
  put(b, p, 'chrome', box(W - 0.1, 0.02, 0.02), 0, 0.82, L / 2 - 0.02, 0, 0, 0, { shade: 'flat' });
  // Side rails.
  const railY = options.railsUp ?? state === 'restraints' ? 0.78 : 0.56;
  for (const side of [-1, 1]) {
    put(b, p, 'chrome', box(0.025, 0.025, L * 0.42), side * (W / 2 + 0.01), railY, -L * 0.18, 0, 0, 0, { shade: 'flat' });
    put(b, p, 'chrome', box(0.025, 0.025, L * 0.42), side * (W / 2 + 0.01), railY - 0.12, -L * 0.18, 0, 0, 0, { shade: 'flat' });
    put(b, p, 'beigePlastic', box(0.03, 0.04, 0.3), side * (W / 2 + 0.012), railY - 0.06, L * 0.15);
  }
  if (state === 'made' || state === 'restraints' || state === 'lump' || state === 'cot') {
    put(b, p, 'linen', box(W * 0.62, 0.11, 0.34), 0, 0.66, -L / 2 + 0.28, 0.05, -0.12, 0, { tint: 0.98 });
  }
  if (state === 'made' || state === 'cot') {
    put(b, p, 'linen', box(W - 0.06, 0.025, L * 0.66), 0, 0.615, L * 0.12);
    put(b, p, 'linen', box(W - 0.04, 0.05, 0.22), 0, 0.63, -L * 0.2, 0, 0, 0, { tint: 0.94 });
    for (const side of [-1, 1]) put(b, p, 'linen', box(0.012, 0.22, L * 0.66), side * (W / 2 - 0.03), 0.52, L * 0.12);
  }
  if (state === 'unmade') {
    for (let i = 0; i < 5; i++) {
      put(b, p, 'linen', box(b.rng.range(0.3, 0.7), b.rng.range(0.04, 0.09), b.rng.range(0.3, 0.6)), b.rng.range(-0.2, 0.2), 0.63 + i * 0.012, b.rng.range(-0.3, 0.7), b.rng.range(-1, 1), b.rng.range(-0.2, 0.2), b.rng.range(-0.2, 0.2), { tint: b.rng.range(0.85, 1) });
    }
    // Sheet half dragged to the floor.
    put(b, p, 'linen', box(0.8, 0.012, 0.9), W / 2 + 0.25, 0.25, 0.4, 0.3, 0, 1.1, { tint: 0.9 });
    put(b, p, 'linen', box(0.9, 0.01, 0.6), W / 2 + 0.55, 0.01, 0.6, 0.6, 0, 0, { tint: 0.88 });
  }
  if (state === 'lump') {
    // A sheet draped over something body-length. Never revealed; never moves.
    const g = plane(W + 0.15, L - 0.3, 14, 22);
    g.rotateX(-Math.PI / 2);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const zn = (z + (L - 0.3) / 2) / (L - 0.3);
      const body = Math.exp(-((x * x) / 0.05)) * (0.13 * Math.exp(-((zn - 0.12) ** 2) / 0.004) + 0.17 * Math.exp(-((zn - 0.38) ** 2) / 0.03) + 0.1 * Math.exp(-((zn - 0.75) ** 2) / 0.06));
      const drop = Math.max(0, Math.abs(x) - W / 2 + 0.05) * 2.2;
      pos.setY(i, body - drop);
    }
    g.computeVertexNormals();
    put(b, p, 'linen', g, 0, 0.625, 0.08, 0, 0, 0, { tint: 0.96 });
  }
  if (state === 'restraints') {
    for (const z of [-0.35, 0.15, 0.7]) {
      put(b, p, 'rubber', box(W + 0.06, 0.012, 0.07), 0, 0.615, z, 0, 0, 0, { tint: [2.4, 2.1, 1.6] });
      put(b, p, 'chrome', box(0.05, 0.02, 0.05), W * 0.2, 0.625, z, 0, 0, 0, { shade: 'flat' });
      for (const side of [-1, 1]) put(b, p, 'rubber', box(0.012, 0.3, 0.07), side * (W / 2 + 0.02), 0.47, z, 0, 0, 0, { tint: [2.4, 2.1, 1.6] });
    }
    put(b, p, 'linen', box(W - 0.06, 0.02, 0.7), 0, 0.613, 0.45, 0.04, 0, 0, { tint: 0.9 });
  }
  if (options.collide ?? true) return collide(b, p, roomId, 0, 0.42, 0, W + 0.06, 0.84, L);
  return null;
}

/** A bed tipped onto its side, mattress slumped against it. */
export function overturnedBed(b: WorldBuilder, p: Place, roomId: ObjectId): void {
  const L = 2.05;
  put(b, p, 'steel', box(0.85, 0.1, L - 0.12), 0.36, 0.48, 0, 0, 0, Math.PI / 2, { tint: 0.85 });
  put(b, p, 'beigePlastic', box(0.92, 0.06, L - 0.1), 0.48, 0.48, 0, 0, 0, Math.PI / 2);
  put(b, p, 'beigePlastic', box(0.55, 0.95, 0.05), 0.15, 0.48, -L / 2 + 0.02, 0, 0, Math.PI / 2);
  put(b, p, 'beigePlastic', box(0.38, 0.95, 0.05), 0.2, 0.48, L / 2 - 0.02, 0, 0, Math.PI / 2);
  for (const [y, z] of [[0.1, -0.9], [0.86, -0.9], [0.1, 0.9], [0.86, 0.9]] as const) {
    put(b, p, 'rubber', cylinder(0.045, 0.045, 0.03, 8), 0.02, y, z, 0, 0, 0);
  }
  put(b, p, 'mattress', box(0.86, 0.15, 1.85), -0.35, 0.36, 0.1, 0.15, 0, -1.0, { tint: 0.8 });
  collide(b, p, roomId, 0.2, 0.48, 0, 0.6, 0.96, L);
  collide(b, p, roomId, -0.4, 0.3, 0.1, 0.6, 0.6, 1.8, 0.15);
}

// ---------------------------------------------------------------------------------------------
// Room furniture
// ---------------------------------------------------------------------------------------------

export function bedsideCabinet(b: WorldBuilder, p: Place, roomId: ObjectId, options: { drawerOut?: boolean; items?: boolean } = {}): void {
  put(b, p, 'beigePlastic', box(0.45, 0.72, 0.45), 0, 0.4, 0);
  put(b, p, 'laminate', box(0.47, 0.03, 0.47), 0, 0.775, 0);
  put(b, p, 'rubber', box(0.4, 0.008, 0.005), 0, 0.62, 0.226, 0, 0, 0, { shade: 'flat' });
  if (options.drawerOut) {
    put(b, p, 'beigePlastic', box(0.4, 0.14, 0.4), 0, 0.68, 0.32, 0, 0, 0, { tint: 0.95 });
  }
  for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]] as const) put(b, p, 'rubber', cylinder(0.025, 0.025, 0.03, 6), x, 0.02, z, 0, 0, Math.PI / 2);
  if (options.items ?? true) {
    put(b, p, 'glass', cylinder(0.04, 0.035, 0.18, 8), -0.1, 0.88, -0.05);
    put(b, p, 'whitePlastic', cylinder(0.035, 0.03, 0.09, 8), 0.08, 0.835, 0.05);
    put(b, p, 'whitePlastic', box(0.22, 0.09, 0.11), 0.05, 0.835, -0.12, 0.3, 0, 0, { tint: [0.8, 0.9, 1] });
  }
  collide(b, p, roomId, 0, 0.4, 0, 0.47, 0.8, 0.47);
}

export function overbedTable(b: WorldBuilder, p: Place, roomId: ObjectId, options: { tipped?: boolean } = {}): void {
  if (options.tipped) {
    put(b, p, 'laminate', box(0.85, 0.025, 0.4), 0, 0.2, 0, 0.3, 0, 1.2);
    put(b, p, 'steel', box(0.04, 0.7, 0.04), -0.2, 0.05, 0.1, 0.3, 0, Math.PI / 2);
    put(b, p, 'steel', box(0.6, 0.04, 0.04), 0.25, 0.04, 0.2, 0.8);
    collide(b, p, roomId, 0, 0.2, 0, 0.8, 0.4, 0.5);
    return;
  }
  put(b, p, 'steel', box(0.06, 0.05, 0.62), -0.38, 0.05, 0);
  put(b, p, 'steel', box(0.04, 0.82, 0.04), -0.38, 0.45, 0);
  put(b, p, 'laminate', box(0.85, 0.025, 0.4), -0.02, 0.87, 0);
  put(b, p, 'beigePlastic', box(0.87, 0.04, 0.42), -0.02, 0.845, 0);
  put(b, p, 'whitePlastic', box(0.2, 0.03, 0.15), 0.12, 0.895, 0.05, 0.2, 0, 0, { tint: [0.9, 0.95, 1] });
  put(b, p, 'glass', cylinder(0.035, 0.03, 0.11, 8), -0.2, 0.94, -0.06);
}

export function visitorChair(b: WorldBuilder, p: Place, roomId: ObjectId, options: { tipped?: boolean; collide?: boolean } = {}): void {
  const tip = options.tipped ? Math.PI / 2 : 0;
  const lift = options.tipped ? 0.24 : 0;
  const m = (x: number, y: number, z: number): [number, number, number] => options.tipped ? [x, z + 0.3, -y + 0.42 - lift] : [x, y, z];
  const add = (mat: MaterialKey, sx: number, sy: number, sz: number, x: number, y: number, z: number): void => {
    const [lx, ly, lz] = m(x, y, z);
    put(b, p, mat, box(sx, sy, sz), lx, ly, lz, 0, -tip, 0);
  };
  add('fabricSeat', 0.5, 0.09, 0.48, 0, 0.45, 0);
  add('fabricSeat', 0.5, 0.48, 0.08, 0, 0.75, -0.23);
  for (const side of [-1, 1]) {
    add('darkWood', 0.05, 0.05, 0.5, side * 0.27, 0.66, 0);
    add('darkWood', 0.04, 0.62, 0.04, side * 0.27, 0.32, 0.2);
    add('darkWood', 0.04, 0.95, 0.04, side * 0.27, 0.47, -0.22);
  }
  if (options.collide ?? true) collide(b, p, roomId, 0, options.tipped ? 0.25 : 0.45, 0, 0.6, options.tipped ? 0.5 : 0.9, 0.55);
}

export function wardrobe(b: WorldBuilder, p: Place, roomId: ObjectId, options: { open?: boolean; tipped?: boolean } = {}): void {
  if (options.tipped) {
    put(b, p, 'laminate', box(0.6, 0.55, 1.9), 0, 0.28, 0, 0, 0, 0, { tint: 0.85 });
    put(b, p, 'linen', box(0.4, 0.06, 0.5), 0.5, 0.03, 0.4, 0.7, 0, 0, { tint: 0.8 });
    collide(b, p, roomId, 0, 0.28, 0, 0.62, 0.56, 1.9);
    return;
  }
  put(b, p, 'laminate', box(0.6, 1.9, 0.55), 0, 0.95, 0);
  put(b, p, 'rubber', box(0.005, 1.8, 0.005), 0, 0.95, 0.276, 0, 0, 0, { shade: 'flat' });
  if (options.open) {
    put(b, p, 'laminate', box(0.3, 1.82, 0.02), 0.43, 0.95, 0.4, -1.1);
    put(b, p, 'rubber', box(0.52, 0.85, 0.48), 0, 1.28, -0.01, 0, 0, 0, { tint: 0.4 });
    put(b, p, 'steel', cylinder(0.01, 0.01, 0.54, 6), 0, 1.7, 0, 0, 0, Math.PI / 2);
    put(b, p, 'beigePlastic', box(0.08, 0.7, 0.4), 0.12, 1.3, 0, 0.2, 0, 0, { tint: [0.6, 0.7, 0.9] });
  } else {
    put(b, p, 'chrome', box(0.015, 0.15, 0.02), -0.04, 1.05, 0.285, 0, 0, 0, { shade: 'flat' });
    put(b, p, 'chrome', box(0.015, 0.15, 0.02), 0.04, 1.05, 0.285, 0, 0, 0, { shade: 'flat' });
  }
  collide(b, p, roomId, 0, 0.95, 0, 0.62, 1.9, 0.57);
}

/** Wall-hung basin with mirror and dispensers. Place against a wall; front faces +Z. */
export function sinkUnit(b: WorldBuilder, p: Place, roomId: ObjectId, options: { mirror?: 'intact' | 'cracked' | 'covered' } = {}): void {
  put(b, p, 'whitePlastic', box(0.55, 0.16, 0.42), 0, 0.82, 0.21);
  put(b, p, 'tile', box(0.42, 0.04, 0.3), 0, 0.89, 0.22, 0, 0, 0, { tint: 0.6 });
  put(b, p, 'chrome', cylinder(0.015, 0.015, 0.22, 6), 0, 0.98, 0.06);
  put(b, p, 'chrome', cylinder(0.012, 0.012, 0.12, 6), 0, 1.07, 0.12, 0, Math.PI / 2, 0);
  put(b, p, 'whitePlastic', cylinder(0.025, 0.025, 0.55, 6), 0, 0.5, 0.06);
  put(b, p, 'tile', box(0.8, 0.6, 0.012), 0, 1.1, 0.006);
  const mirror = options.mirror ?? 'intact';
  put(b, p, 'frame', box(0.52, 0.72, 0.02), 0, 1.55, 0.015);
  if (mirror === 'covered') {
    put(b, p, 'cardboard', box(0.5, 0.7, 0.012), 0, 1.55, 0.03, 0, 0, 0.03);
    put(b, p, 'beigePlastic', box(0.5, 0.05, 0.003), 0, 1.86, 0.037, 0, 0, 0, { tint: 0.7 });
  } else {
    put(b, p, 'screenOff', box(0.46, 0.66, 0.01), 0, 1.55, 0.028, 0, 0, 0, { shade: 'flat', tint: [2.2, 2.3, 2.4] });
    b.reflectiveSurfaces.push({
      id: b.id('mirror', roomId.split(':').pop() ?? 'room'), kind: 'mirror', roomId,
      position: worldPoint(p, 0, 1.55, 0.034), normal: worldPoint(p, 0, 0, 1).sub(worldPoint(p, 0, 0, 0)).normalize(),
      width: 0.46, height: 0.66,
    });
    if (mirror === 'cracked') {
      for (let i = 0; i < 6; i++) {
        const a = b.rng.range(0, Math.PI * 2);
        const s = worldPoint(p, 0.05, 1.62, 0.035);
        const e = worldPoint(p, 0.05 + Math.cos(a) * b.rng.range(0.12, 0.3), 1.62 + Math.sin(a) * b.rng.range(0.12, 0.3), 0.035);
        const crack = cylinderBetween(s, e, 0.002, 3);
        b.add('linen', crack.geometry, crack.matrix, { shade: 'flat' });
      }
    }
  }
  put(b, p, 'whitePlastic', box(0.28, 0.32, 0.12), 0.55, 1.35, 0.06);
  put(b, p, 'whitePlastic', box(0.11, 0.2, 0.09), -0.42, 1.25, 0.05, 0, 0, 0, { tint: [0.85, 0.9, 1] });
  collide(b, p, roomId, 0, 0.82, 0.21, 0.55, 0.2, 0.42);
}

/** Bed-head service panel: gas outlets, light switch, call cord. Against wall, front +Z. */
export function headwall(b: WorldBuilder, p: Place, options: { width?: number; dangling?: boolean } = {}): void {
  const w = options.width ?? 1.6;
  put(b, p, 'beigePlastic', box(w, 0.26, 0.08), 0, 1.45, 0.04);
  put(b, p, 'whitePlastic', box(w, 0.04, 0.09), 0, 1.6, 0.045, 0, 0, 0, { tint: 0.8 });
  const outlet = (x: number, color: readonly [number, number, number]): void => {
    put(b, p, 'whitePlastic', cylinder(0.025, 0.025, 0.03, 8), x, 1.45, 0.095, 0, Math.PI / 2, 0, { tint: color });
  };
  outlet(-0.45, [0.3, 0.9, 0.4]);
  outlet(-0.35, [1, 1, 1]);
  outlet(-0.25, [1, 0.85, 0.2]);
  put(b, p, 'whitePlastic', box(0.08, 0.08, 0.02), 0.35, 1.45, 0.09, 0, 0, 0, { tint: 0.95 });
  put(b, p, 'redPaint', box(0.05, 0.05, 0.02), 0.5, 1.45, 0.09);
  const cordTop = worldPoint(p, 0.5, 1.4, 0.1);
  const cordBottom = worldPoint(p, 0.5 + (options.dangling ? 0.3 : 0.05), options.dangling ? 0.15 : 0.9, options.dangling ? 0.4 : 0.15);
  const cord = cylinderBetween(cordTop, cordBottom, 0.004, 3);
  b.add('whitePlastic', cord.geometry, cord.matrix, { shade: 'flat', tint: 0.8 });
  const handle = worldPoint(p, 0.5 + (options.dangling ? 0.3 : 0.05), options.dangling ? 0.12 : 0.87, options.dangling ? 0.4 : 0.15);
  b.add('redPaint', box(0.04, 0.06, 0.04), new Matrix4().makeTranslation(handle.x, handle.y, handle.z));
}

export function ivStand(b: WorldBuilder, p: Place, roomId: ObjectId, options: { bag?: 'full' | 'empty' | 'none'; tipped?: boolean } = {}): void {
  if (options.tipped) {
    put(b, p, 'chrome', cylinder(0.012, 0.012, 1.9, 6), 0, 0.06, 0, 0, 0, Math.PI / 2, { shade: 'flat' });
    put(b, p, 'steel', box(0.5, 0.04, 0.08), -0.95, 0.15, 0, 0, 0, 1.3);
    put(b, p, 'chrome', box(0.18, 0.01, 0.01), 0.95, 0.08, 0, 0.4, 0, 0, { shade: 'flat' });
    if (options.bag === 'full') put(b, p, 'plasticSheet', box(0.12, 0.03, 0.2), 0.7, 0.03, 0.25, 0.4);
    return;
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    put(b, p, 'steel', box(0.28, 0.025, 0.035), Math.cos(a) * 0.14, 0.07, Math.sin(a) * 0.14, -a);
    put(b, p, 'rubber', cylinder(0.025, 0.025, 0.02, 6), Math.cos(a) * 0.28, 0.03, Math.sin(a) * 0.28, 0, 0, Math.PI / 2);
  }
  put(b, p, 'chrome', cylinder(0.012, 0.012, 1.9, 6), 0, 1.03, 0, 0, 0, 0, { shade: 'flat' });
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    put(b, p, 'chrome', box(0.14, 0.008, 0.008), Math.cos(a) * 0.07, 1.96, Math.sin(a) * 0.07, -a, 0, 0, { shade: 'flat' });
  }
  if ((options.bag ?? 'none') !== 'none') {
    const full = options.bag === 'full';
    put(b, p, 'plasticSheet', box(0.12, full ? 0.22 : 0.18, full ? 0.05 : 0.015), 0.12, 1.82, 0);
    const top = worldPoint(p, 0.12, 1.7, 0);
    const bottom = worldPoint(p, 0.3, 0.8, 0.25);
    const line = cylinderBetween(top, bottom, 0.003, 3);
    b.add('plasticSheet', line.geometry, line.matrix, { shade: 'flat' });
    put(b, p, 'whitePlastic', box(0.06, 0.1, 0.05), 0, 1.25, 0.03, 0, 0, 0, { tint: [0.8, 0.85, 0.9] });
  }
  collide(b, p, roomId, 0, 0.9, 0, 0.3, 1.8, 0.3);
}

/** Small dynamic monitor screen with optional animated canvas (ECG trace or TV static). */
export function screen(b: WorldBuilder, matrix: Matrix4, width: number, height: number, mode: 'ecg' | 'tv' | 'off', name: string): {
  material: MeshBasicMaterial; canvas: HTMLCanvasElement | null;
  redraw: ((time: number, state: 'normal' | 'glitch' | 'flatline' | 'static' | 'off') => void) | null;
} {
  let canvas: HTMLCanvasElement | null = null;
  let texture: CanvasTexture | null = null;
  let redraw: ((time: number, state: 'normal' | 'glitch' | 'flatline' | 'static' | 'off') => void) | null = null;
  if (mode !== 'off' && canUseCanvas()) {
    canvas = document.createElement('canvas');
    canvas.width = mode === 'tv' ? 96 : 128;
    canvas.height = mode === 'tv' ? 72 : 96;
    const ctx = canvas.getContext('2d');
    texture = b.textures.adopt(new CanvasTexture(canvas));
    texture.colorSpace = SRGBColorSpace;
    if (ctx) {
      const c = canvas;
      const t = texture;
      const noise = ctx.createImageData(c.width, c.height);
      redraw = (time, state) => {
        if (mode === 'tv') {
          if (state === 'off') { ctx.fillStyle = '#020303'; ctx.fillRect(0, 0, c.width, c.height); }
          else {
            const d = noise.data;
            const bright = state === 'static' ? 1 : 0.45;
            for (let i = 0; i < d.length; i += 4) {
              const v = Math.random() * 200 * bright;
              d[i] = v; d[i + 1] = v; d[i + 2] = v * 1.05; d[i + 3] = 255;
            }
            ctx.putImageData(noise, 0, 0);
            if (state === 'glitch') {
              ctx.fillStyle = 'rgba(0,0,0,0.7)';
              ctx.fillRect(0, (time * 40) % c.height, c.width, 12);
            }
          }
        } else {
          ctx.fillStyle = '#020806';
          ctx.fillRect(0, 0, c.width, c.height);
          if (state === 'off') { t.needsUpdate = true; return; }
          ctx.strokeStyle = state === 'flatline' ? '#e04a3a' : '#3ef08a';
          ctx.lineWidth = 2;
          ctx.beginPath();
          const base = c.height * 0.45;
          for (let x = 0; x < c.width; x++) {
            const phase = ((x / c.width) * 3 + time * 1.1) % 1;
            let y = base;
            if (state === 'normal' || state === 'glitch') {
              if (phase > 0.42 && phase < 0.46) y = base - 30;
              else if (phase >= 0.46 && phase < 0.5) y = base + 12;
              else if (phase > 0.6 && phase < 0.7) y = base - 6 * Math.sin((phase - 0.6) * Math.PI * 10);
              if (state === 'glitch') y += (Math.random() - 0.5) * 16;
            }
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.fillStyle = state === 'flatline' ? '#e04a3a' : '#3ef08a';
          ctx.font = '600 16px monospace';
          ctx.fillText(state === 'flatline' ? '---' : String(58 + Math.floor(Math.sin(time * 0.3) * 4)), 6, c.height - 10);
          ctx.fillStyle = '#5ab0f0';
          ctx.fillText('SpO2 9' + String(4 + Math.floor((time * 0.1) % 3)), 56, c.height - 10);
        }
        t.needsUpdate = true;
      };
      redraw(0, mode === 'tv' ? 'off' : 'normal');
    }
  }
  const material = b.materials.adopt(new MeshBasicMaterial({ color: mode === 'off' ? 0x070909 : 0xffffff, ...(texture ? { map: texture } : {}), fog: true }));
  if (!texture && mode !== 'off') material.color.set(mode === 'tv' ? 0x2a2e30 : 0x0a3a1e);
  const mesh = new Mesh(b.own(new PlaneGeometry(width, height)), material);
  mesh.name = name;
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(matrix);
  b.attach(mesh);
  return { material, canvas, redraw };
}

/** Patient vitals monitor on a wall bracket. Registers glow + optional anomaly. */
export function vitalsMonitor(b: WorldBuilder, p: Place, roomId: ObjectId, mode: 'ecg' | 'off', anomalyId?: string): void {
  put(b, p, 'steel', box(0.05, 0.05, 0.3), 0, 1.75, 0.15, 0, 0, 0, { tint: 0.6 });
  put(b, p, 'beigePlastic', box(0.36, 0.3, 0.14), 0, 1.75, 0.35, 0, -0.15, 0);
  const m = local(p, 0, 1.755, 0.422, 0, -0.15, 0);
  const s = screen(b, m, 0.3, 0.22, mode, `nw:screen:${roomId}`);
  if (mode === 'ecg') {
    b.fixture({
      kind: 'monitor', state: 'steady', roomId, circuits: ['nw:lights:monitors'],
      position: worldPoint(p, 0, 1.7, 0.7), color: 0x39d07a, intensity: 0.35, distance: 2.6,
      material: s.material, halo: 0.55, haloOpacity: 0.18,
    });
  }
  if (anomalyId) {
    b.anomalies.push({ kind: 'screen', id: anomalyId, roomId, position: worldPoint(p, 0, 1.75, 0.4), mode: 'ecg', material: s.material, canvas: s.canvas, redraw: s.redraw });
  }
}

/** Wall-arm television. */
export function wallTv(b: WorldBuilder, p: Place, roomId: ObjectId, mode: 'tv' | 'off', anomalyId?: string): void {
  put(b, p, 'rubber', box(0.08, 0.12, 0.04), 0, 2.05, 0.02);
  put(b, p, 'rubber', box(0.04, 0.04, 0.4), 0, 2.05, 0.22);
  put(b, p, 'rubber', box(0.62, 0.4, 0.08), 0, 2.0, 0.45, 0, -0.18, 0);
  const m = local(p, 0, 2.003, 0.492, 0, -0.18, 0);
  const s = screen(b, m, 0.56, 0.34, mode, `nw:tv:${roomId}`);
  if (anomalyId && mode === 'tv') {
    // The horror module owns this screen's brightness (it is off until an anomaly switches it on).
    s.material.color.set(0x050606);
    b.anomalies.push({ kind: 'screen', id: anomalyId, roomId, position: worldPoint(p, 0, 2, 0.5), mode: 'tv', material: s.material, canvas: s.canvas, redraw: s.redraw });
  }
}

/** Curtain on a ceiling track; vertices can be animated by the horror module. */
export function curtain(b: WorldBuilder, start: Vector3, end: Vector3, ceiling: number, roomId: ObjectId, options: { gathered?: number; anomalyId?: string; drop?: number } = {}): void {
  const length = start.distanceTo(end);
  const gathered = options.gathered ?? 0;
  const width = Math.max(0.3, length * (1 - gathered));
  const height = options.drop ?? ceiling - 0.35;
  // Track.
  const dir = new Vector3().subVectors(end, start).normalize();
  const yaw = Math.atan2(-dir.z, dir.x);
  const trackMid = new Vector3().addVectors(start, end).multiplyScalar(0.5);
  b.add('chrome', box(length, 0.025, 0.03), new Matrix4().makeRotationY(yaw).setPosition(trackMid.x, ceiling - 0.02, trackMid.z), { shade: 'flat' });
  const segX = Math.max(12, Math.round(width / 0.02));
  const geometry = b.own(new PlaneGeometry(width, height, segX, 10));
  const pos = geometry.getAttribute('position');
  const folds = width / 0.14;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const u = (x + width / 2) / width;
    const depth = 0.045 + gathered * 0.05;
    pos.setZ(i, Math.sin(u * Math.PI * 2 * folds) * depth * (0.8 + 0.2 * (1 - (y + height / 2) / height)));
    pos.setY(i, y + (y < -height / 2 + 0.01 ? Math.sin(u * 13) * 0.02 : 0));
  }
  geometry.translate(width / 2, -height / 2, 0);
  geometry.computeVertexNormals();
  const material = b.materials.get('curtain');
  const mesh = new Mesh(geometry, material);
  mesh.name = `nw:curtain:${roomId}`;
  mesh.position.set(start.x, ceiling - 0.05, start.z);
  mesh.rotation.y = yaw;
  b.attach(mesh);
  // Without vertex colours the shared curtain material would read black; add a white colour attr.
  const colors = new Float32Array(pos.count * 3).fill(1);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const shade = 0.55 + 0.45 * Math.min(1, Math.max(0, (y + height) / height));
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = shade;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  const rings = Math.max(3, Math.round(width / 0.15));
  for (let s = 0; s <= rings; s++) {
    const u = s / rings;
    const ring = new Vector3().copy(start).addScaledVector(dir, u * width);
    b.add('chrome', torus(0.018, 0.003, 4, 8), new Matrix4().makeRotationY(yaw).setPosition(ring.x, ceiling - 0.04, ring.z), { shade: 'flat' });
  }
  if (options.anomalyId) {
    const center = new Vector3().copy(start).addScaledVector(dir, width / 2).setY(1.4);
    b.anomalies.push({ kind: 'curtain', id: options.anomalyId, roomId, position: center, mesh, rest: Float32Array.from(pos.array as ArrayLike<number>), height });
  }
}

export function wheelchair(b: WorldBuilder, p: Place, roomId: ObjectId, options: { anomalyId?: string; folded?: boolean } = {}): void {
  const parts: Part[] = [];
  const add = (mat: MaterialKey, g: ReturnType<typeof box>, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0): void => { parts.push(part(mat, g, x, y, z, ry, rx, rz)); };
  const fold = options.folded ? 0.35 : 1;
  for (const side of [-1, 1]) {
    add('rubber', torus(0.29, 0.022, 6, 22), side * 0.3 * fold, 0.31, -0.05, Math.PI / 2);
    add('chrome', torus(0.25, 0.008, 4, 18), side * (0.3 * fold + 0.03), 0.31, -0.05, Math.PI / 2);
    add('rubber', cylinder(0.06, 0.06, 0.025, 8), side * 0.22 * fold, 0.06, 0.32, 0, 0, Math.PI / 2);
    add('chrome', box(0.025, 0.025, 0.55), side * 0.22 * fold, 0.52, 0.05);
    add('chrome', box(0.025, 0.55, 0.025), side * 0.22 * fold, 0.75, -0.2, 0, 0.15);
    add('chrome', box(0.025, 0.4, 0.025), side * 0.22 * fold, 0.3, 0.3);
    add('rubber', box(0.12, 0.012, 0.16), side * 0.12 * fold, 0.12, 0.42, 0, 0.3);
    add('rubber', box(0.03, 0.03, 0.12), side * 0.22 * fold, 1.0, -0.28, 0, 0.15);
  }
  add('rubber', box(0.44 * fold, 0.02, 0.44), 0, 0.5, 0.05);
  add('rubber', box(0.44 * fold, 0.42, 0.02), 0, 0.76, -0.22, 0, 0.15);
  const group = b.mergedObject(parts, `nw:wheelchair:${roomId}`);
  group.position.set(p.x, p.y ?? 0, p.z);
  group.rotation.y = p.yaw;
  b.attach(group);
  collide(b, p, roomId, 0, 0.5, 0.02, 0.68 * fold, 1.0, 0.75);
  if (options.anomalyId) {
    b.anomalies.push({ kind: 'creep', id: options.anomalyId, roomId, position: new Vector3(p.x, 0.6, p.z), object: group, amplitude: 0.16 });
  }
}

export function gurney(b: WorldBuilder, p: Place, roomId: ObjectId, options: { sheet?: boolean } = {}): void {
  for (const [x, z] of [[-0.25, -0.85], [0.25, -0.85], [-0.25, 0.85], [0.25, 0.85]] as const) {
    put(b, p, 'chrome', cylinder(0.015, 0.015, 0.7, 6), x, 0.42, z);
    put(b, p, 'rubber', cylinder(0.06, 0.06, 0.03, 8), x, 0.06, z, 0, 0, Math.PI / 2);
  }
  put(b, p, 'steel', box(0.6, 0.05, 1.9), 0, 0.2, 0, 0, 0, 0, { tint: 0.7 });
  put(b, p, 'steel', box(0.62, 0.06, 1.95), 0, 0.78, 0);
  put(b, p, 'mattress', box(0.56, 0.08, 1.85), 0, 0.85, 0, 0, 0, 0, { tint: [0.7, 0.6, 0.55] });
  if (options.sheet) {
    put(b, p, 'linen', box(0.66, 0.012, 1.3), 0, 0.9, 0.2, 0.05, 0, 0, { tint: 0.92 });
    put(b, p, 'linen', box(0.012, 0.35, 1.0), 0.33, 0.73, 0.35, 0, 0, -0.1, { tint: 0.9 });
  }
  for (const side of [-1, 1]) put(b, p, 'chrome', box(0.02, 0.02, 1.4), side * 0.33, 1.0, 0, 0, 0, 0, { shade: 'flat' });
  collide(b, p, roomId, 0, 0.5, 0, 0.66, 1.0, 1.95);
}

export function crashCart(b: WorldBuilder, p: Place, roomId: ObjectId, options: { drawersOut?: boolean } = {}): void {
  put(b, p, 'redPaint', box(0.6, 0.9, 0.5), 0, 0.55, 0);
  for (let i = 0; i < 5; i++) {
    const y = 0.25 + i * 0.16;
    const out = options.drawersOut && (i === 1 || i === 3) ? 0.18 : 0;
    put(b, p, 'redPaint', box(0.56, 0.14, 0.02), 0, y, 0.26 + out, 0, 0, 0, { tint: 1.08 });
    put(b, p, 'steel', box(0.3, 0.02, 0.025), 0, y + 0.04, 0.28 + out, 0, 0, 0, { shade: 'flat' });
    if (out) put(b, p, 'redPaint', box(0.56, 0.12, 0.18), 0, y, 0.18 + out / 2, 0, 0, 0, { tint: 0.7 });
  }
  put(b, p, 'whitePlastic', box(0.64, 0.03, 0.54), 0, 1.015, 0, 0, 0, 0, { tint: 0.85 });
  put(b, p, 'yellowPaint', box(0.32, 0.18, 0.24), -0.08, 1.12, 0, 0.1, 0, 0, { tint: [0.4, 0.45, 0.4] });
  put(b, p, 'screenOff', box(0.12, 0.08, 0.01), -0.08, 1.16, 0.12, 0.1);
  put(b, p, 'rubber', box(0.08, 0.03, 0.12), 0.18, 1.045, 0.05, 0.4);
  for (const [x, z] of [[-0.25, -0.2], [0.25, -0.2], [-0.25, 0.2], [0.25, 0.2]] as const) put(b, p, 'rubber', cylinder(0.04, 0.04, 0.03, 8), x, 0.04, z, 0, 0, Math.PI / 2);
  put(b, p, 'steel', box(0.6, 0.03, 0.03), 0, 0.95, -0.28);
  collide(b, p, roomId, 0, 0.55, 0, 0.66, 1.1, 0.56);
}

export function shelvingUnit(b: WorldBuilder, p: Place, roomId: ObjectId, options: { width?: number; depth?: number; height?: number; fill?: number; tipped?: boolean } = {}): void {
  const w = options.width ?? 1.2;
  const d = options.depth ?? 0.5;
  const h = options.height ?? 2.0;
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]] as const) put(b, p, 'steel', box(0.03, h, 0.03), x, h / 2, z, 0, 0, 0, { tint: 0.85 });
  const levels = 5;
  for (let i = 0; i < levels; i++) {
    const y = 0.12 + (i * (h - 0.2)) / (levels - 1);
    put(b, p, 'steel', box(w, 0.02, d), 0, y, 0);
    if (b.rng.next() > (options.fill ?? 0.75)) continue;
    let x = -w / 2 + 0.05;
    while (x < w / 2 - 0.15) {
      const bw = b.rng.range(0.18, 0.42);
      const bh = Math.min(b.rng.range(0.14, 0.32), (h - 0.2) / (levels - 1) - 0.06);
      if (x + bw > w / 2 - 0.03) break;
      if (b.rng.chance(0.8)) {
        const kind = b.rng.next();
        if (kind < 0.6) put(b, p, 'cardboard', box(bw, bh, d * b.rng.range(0.6, 0.9)), x + bw / 2, y + bh / 2 + 0.01, b.rng.range(-0.03, 0.03), b.rng.range(-0.08, 0.08), 0, 0, { tint: b.rng.range(0.7, 1.1) });
        else if (kind < 0.8) put(b, p, 'whitePlastic', box(bw, bh * 0.8, d * 0.7), x + bw / 2, y + bh * 0.4 + 0.01, 0, 0, 0, 0, { tint: [b.rng.range(0.7, 1), b.rng.range(0.8, 1), 1] });
        else {
          for (let k = 0; k < 4; k++) put(b, p, 'whitePlastic', cylinder(0.035, 0.035, 0.16, 6), x + 0.05 + (k % 2) * 0.08, y + 0.09, (k < 2 ? -0.06 : 0.06), 0, 0, 0, { tint: [0.9, 0.95, 1] });
        }
      }
      x += bw + 0.02;
    }
  }
  collide(b, p, roomId, 0, h / 2, 0, w + 0.04, h, d + 0.04);
}

/** Static bank of lockers (not hiding spots). */
export function lockerBank(b: WorldBuilder, p: Place, roomId: ObjectId, count: number, options: { ajar?: readonly number[] } = {}): void {
  const w = 0.42;
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * w;
    lockerBody(b, (mat, g, lx, ly, lz, ry = 0) => put(b, p, mat, g, x + lx, ly, lz, ry), w, (options.ajar ?? []).includes(i), b.rng.range(0.85, 1.05));
  }
  collide(b, p, roomId, 0, 0.95, 0, count * w, 1.9, 0.52);
}

type Adder = (material: MaterialKey, geometry: ReturnType<typeof box>, x: number, y: number, z: number, ry?: number) => void;

function lockerBody(_b: WorldBuilder, add: Adder, w: number, ajar: boolean, tint: number): void {
  add('lockerPaint', box(w - 0.01, 1.85, 0.5), 0, 0.975, 0);
  if (ajar) {
    add('rubber', box(w - 0.06, 1.75, 0.01), 0, 0.97, 0.245);
    add('lockerPaint', box(w - 0.04, 1.78, 0.02), (w - 0.04) / 2 * 0.3 + 0.12, 0.97, 0.42, -1.0);
  } else {
    add('lockerPaint', box(w - 0.04, 1.78, 0.02), 0, 0.97, 0.255);
    for (const y of [1.65, 1.7, 1.75, 0.25, 0.3, 0.35]) add('rubber', box(w * 0.55, 0.012, 0.005), 0, y, 0.268);
    add('chrome', box(0.03, 0.12, 0.03), w * 0.32, 1.05, 0.275);
    add('whitePlastic', box(0.08, 0.035, 0.004), 0, 1.5, 0.268);
  }
  void tint;
}

/** Hiding locker: a separate interactable object whose door is a child pivot named `door`. */
export function hidingLocker(b: WorldBuilder, p: Place, name: string): Group {
  const w = 0.62;
  const body: Part[] = [
    part('lockerPaint', box(w, 1.95, 0.025), 0, 0.975, -0.27),
    part('lockerPaint', box(0.025, 1.95, 0.56), -w / 2, 0.975, 0),
    part('lockerPaint', box(0.025, 1.95, 0.56), w / 2, 0.975, 0),
    part('lockerPaint', box(w, 0.025, 0.56), 0, 1.95, 0),
    part('lockerPaint', box(w, 0.06, 0.56), 0, 0.03, 0),
    part('steel', box(0.02, 0.02, 0.45), 0, 1.75, 0, 0, 0, 0, { shade: 'flat' }),
    part('rubber', box(w - 0.06, 0.004, 0.5), 0, 0.065, 0, 0, 0, 0, { shade: 'flat' }),
  ];
  const group = b.mergedObject(body, `nw:locker:${name}`);
  const door = b.mergedObject([
    part('lockerPaint', box(w - 0.03, 1.86, 0.02), (w - 0.03) / 2, 0.97, 0, 0, 0, 0, { tint: 1.05 }),
    ...[1.7, 1.66, 1.62, 1.58, 0.4, 0.36, 0.32].map((y) => part('rubber', box(0.3, 0.012, 0.006), (w - 0.03) / 2, y, 0.012)),
    part('chrome', box(0.03, 0.14, 0.035), w - 0.1, 1.05, 0.02),
    part('whitePlastic', box(0.09, 0.04, 0.004), (w - 0.03) / 2, 1.5, 0.012, 0, 0, 0, { tint: 0.85 }),
  ], `nw:locker:${name}:door`);
  door.name = 'door';
  door.position.set(-w / 2 + 0.015, 0, 0.29);
  door.userData.nwHinge = { axis: 'y', openAngle: -1.9 };
  group.add(door);
  group.position.set(p.x, p.y ?? 0, p.z);
  group.rotation.y = p.yaw;
  b.attach(group);
  return group;
}

export function examTable(b: WorldBuilder, p: Place, roomId: ObjectId): void {
  put(b, p, 'beigePlastic', box(0.6, 0.55, 1.4), 0, 0.3, 0.1);
  put(b, p, 'rubber', box(0.56, 0.02, 0.02), 0, 0.35, 0.81, 0, 0, 0, { shade: 'flat' });
  put(b, p, 'mattress', box(0.7, 0.1, 1.85), 0, 0.63, 0, 0, 0, 0, { tint: [0.55, 0.42, 0.36] });
  put(b, p, 'mattress', box(0.7, 0.09, 0.62), 0, 0.78, -0.72, 0, -0.45, 0, { tint: [0.55, 0.42, 0.36] });
  put(b, p, 'paper', box(0.5, 0.004, 1.6), 0, 0.684, 0.1, 0, 0, 0, { uv: 'local' });
  put(b, p, 'whitePlastic', cylinder(0.05, 0.05, 0.56, 10), 0, 0.62, 0.98, 0, 0, Math.PI / 2, { tint: 0.95 });
  put(b, p, 'chrome', box(0.04, 0.04, 0.2), -0.36, 0.5, 0.7);
  put(b, p, 'chrome', box(0.04, 0.04, 0.2), 0.36, 0.5, 0.7);
  collide(b, p, roomId, 0, 0.42, 0, 0.75, 0.85, 1.9);
}

/** Articulated surgical lamp hanging from the ceiling. Returns lamp head position. */
export function surgicalLamp(b: WorldBuilder, x: number, z: number, ceiling: number, roomId: ObjectId, state: 'dead' | 'flicker' | 'dying'): void {
  const top = new Vector3(x, ceiling, z);
  const elbow = new Vector3(x + 0.5, ceiling - 0.55, z + 0.15);
  const head = new Vector3(x + 0.25, 1.85, z + 0.3);
  b.add('whitePlastic', cylinder(0.1, 0.12, 0.08, 12), new Matrix4().makeTranslation(top.x, ceiling - 0.04, top.z));
  for (const [a, c] of [[top, elbow], [elbow, head]] as const) {
    const arm = cylinderBetween(a, c, 0.025, 8);
    b.add('whitePlastic', arm.geometry, arm.matrix, { tint: 0.92 });
  }
  b.add('whitePlastic', cylinder(0.32, 0.22, 0.14, 16), new Matrix4().makeRotationX(0.35).setPosition(head.x, head.y, head.z));
  b.fixture({
    kind: 'lamp', state, roomId, circuits: ['nw:lights:treatment-lamp'],
    position: head.clone().setY(head.y - 0.2), color: 0xf2f0e6, intensity: 6, distance: 4.5,
    panel: { shape: 'troffer', matrix: new Matrix4().makeRotationX(0.35).multiply(new Matrix4().makeScale(0.4, 1, 0.8)).setPosition(head.x, head.y - 0.075, head.z) },
  });
}

export function glassCabinet(b: WorldBuilder, p: Place, roomId: ObjectId, options: { width?: number; disturbed?: boolean } = {}): void {
  const w = options.width ?? 0.9;
  put(b, p, 'whitePlastic', box(w, 1.9, 0.4), 0, 0.95, -0.02, 0, 0, 0, { tint: 0.9 });
  put(b, p, 'rubber', box(w - 0.06, 1.0, 0.01), 0, 1.35, 0.17, 0, 0, 0, { tint: 2.5 });
  for (let s = 0; s < 4; s++) {
    const y = 0.95 + s * 0.24;
    put(b, p, 'glass', box(w - 0.08, 0.008, 0.32), 0, y, 0);
    for (let i = 0; i < 6; i++) {
      if (b.rng.chance(options.disturbed ? 0.5 : 0.25)) continue;
      const tipped = options.disturbed && b.rng.chance(0.3);
      put(b, p, b.rng.chance(0.5) ? 'glass' : 'whitePlastic', cylinder(0.03, 0.03, 0.12, 6), -w / 2 + 0.1 + i * ((w - 0.2) / 5), y + (tipped ? 0.035 : 0.065), b.rng.range(-0.08, 0.08), 0, 0, tipped ? Math.PI / 2 : 0, { tint: [b.rng.range(0.6, 1), b.rng.range(0.7, 1), b.rng.range(0.7, 1)] });
    }
  }
  put(b, p, 'glass', box(w - 0.04, 1.02, 0.01), 0, 1.36, 0.19);
  put(b, p, 'frame', box(0.02, 1.04, 0.02), 0, 1.36, 0.19, 0, 0, 0, { shade: 'flat' });
  collide(b, p, roomId, 0, 0.95, 0, w, 1.9, 0.42);
}

export function oxygenCylinders(b: WorldBuilder, p: Place, roomId: ObjectId, count = 3, toppled = false): void {
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * 0.2;
    const fallen = toppled && i === count - 1;
    if (fallen) {
      put(b, p, 'whitePlastic', cylinder(0.085, 0.085, 1.1, 10), x + 0.5, 0.085, 0.2, 0.6, 0, Math.PI / 2, { tint: [0.35, 0.6, 0.4] });
      continue;
    }
    put(b, p, 'whitePlastic', cylinder(0.085, 0.085, 1.1, 10), x, 0.58, 0, 0, 0, 0, { tint: [0.35, 0.6, 0.4] });
    put(b, p, 'whitePlastic', sphere(0.085, 10, 5), x, 1.13, 0, 0, 0, 0, { tint: 0.95 });
    put(b, p, 'chrome', cylinder(0.02, 0.025, 0.1, 6), x, 1.24, 0, 0, 0, 0, { shade: 'flat' });
  }
  put(b, p, 'steel', box(count * 0.2 + 0.05, 0.03, 0.2), 0, 0.85, 0.05, 0, 0, 0, { tint: 0.7 });
  collide(b, p, roomId, 0, 0.6, 0, count * 0.2 + 0.06, 1.2, 0.24);
}

export function vendingMachine(b: WorldBuilder, p: Place, roomId: ObjectId, state: 'flicker' | 'buzz' | 'dying'): void {
  put(b, p, 'rubber', box(0.9, 1.85, 0.8), 0, 0.925, 0, 0, 0, 0, { tint: [1.6, 1.4, 1.4] });
  put(b, p, 'redPaint', box(0.92, 0.25, 0.82), 0, 1.75, 0);
  put(b, p, 'glass', box(0.62, 1.2, 0.01), -0.08, 1.05, 0.42);
  const material = b.materials.adopt(new MeshBasicMaterial({ color: 0xffffff, fog: true }));
  const map = b.textures.vendingFront();
  if (map) material.map = map;
  const front = new Mesh(b.own(new PlaneGeometry(0.85, 1.55)), material);
  front.matrixAutoUpdate = false;
  front.matrix.copy(local(p, 0, 1.0, 0.405));
  front.name = `nw:vending:${roomId}`;
  b.attach(front);
  b.fixture({
    kind: 'vending', state, roomId, circuits: ['nw:lights:vending'],
    position: worldPoint(p, 0, 1.2, 0.8), color: 0xbfd8ff, intensity: 1.4, distance: 4,
    material, halo: 0, haloOpacity: 0,
  });
  collide(b, p, roomId, 0, 0.925, 0, 0.92, 1.85, 0.82);
}

export function beamSeating(b: WorldBuilder, p: Place, roomId: ObjectId, seats: number, options: { missing?: readonly number[] } = {}): void {
  const pitch = 0.58;
  const w = seats * pitch;
  put(b, p, 'steel', box(w, 0.06, 0.06), 0, 0.3, -0.05, 0, 0, 0, { tint: 0.6 });
  for (const x of [-w / 2 + 0.2, w / 2 - 0.2]) {
    put(b, p, 'steel', box(0.06, 0.3, 0.45), x, 0.15, -0.05, 0, 0, 0, { tint: 0.6 });
  }
  for (let i = 0; i < seats; i++) {
    if ((options.missing ?? []).includes(i)) continue;
    const x = -w / 2 + pitch / 2 + i * pitch;
    put(b, p, 'fabricSeat', box(0.5, 0.06, 0.45), x, 0.44, 0, 0, 0, 0, { tint: [0.9, 0.7, 0.6] });
    put(b, p, 'fabricSeat', box(0.5, 0.45, 0.06), x, 0.72, -0.24, 0, 0.12, 0, { tint: [0.9, 0.7, 0.6] });
    put(b, p, 'steel', box(0.04, 0.12, 0.04), x, 0.38, -0.05, 0, 0, 0, { tint: 0.6 });
  }
  collide(b, p, roomId, 0, 0.45, -0.02, w, 0.9, 0.55);
}

export function wetFloorSign(b: WorldBuilder, p: Place, fallen = false): void {
  if (fallen) {
    put(b, p, 'yellowPaint', box(0.3, 0.02, 0.62), 0, 0.02, 0, 0.2);
    put(b, p, 'yellowPaint', box(0.3, 0.02, 0.62), 0.05, 0.05, 0.05, 0.3, 0, 0.1);
    return;
  }
  put(b, p, 'yellowPaint', box(0.3, 0.62, 0.015), 0, 0.31, 0.09, 0, -0.28);
  put(b, p, 'yellowPaint', box(0.3, 0.62, 0.015), 0, 0.31, -0.09, 0, 0.28);
}

export function fireExtinguisher(b: WorldBuilder, p: Place): void {
  put(b, p, 'steel', box(0.18, 0.06, 0.08), 0, 1.05, 0.04, 0, 0, 0, { tint: 0.6 });
  put(b, p, 'redPaint', cylinder(0.075, 0.075, 0.5, 10), 0, 0.8, 0.12);
  put(b, p, 'rubber', cylinder(0.03, 0.04, 0.08, 8), 0, 1.09, 0.12);
  put(b, p, 'rubber', box(0.02, 0.3, 0.02), 0.08, 0.92, 0.18, 0, 0, 0.3);
}

export function sanitizer(b: WorldBuilder, p: Place): void {
  put(b, p, 'whitePlastic', box(0.12, 0.24, 0.1), 0, 1.3, 0.05);
  put(b, p, 'glass', box(0.08, 0.1, 0.005), 0, 1.33, 0.103);
  put(b, p, 'whitePlastic', box(0.04, 0.02, 0.04), 0, 1.17, 0.08, 0, 0, 0, { tint: 0.8 });
}

export function wallClock(b: WorldBuilder, p: Place, y = 2.2): void {
  put(b, p, 'rubber', cylinder(0.17, 0.17, 0.05, 20), 0, y, 0.025, 0, Math.PI / 2, 0, { tint: 1.4 });
  const face = cylinder(0.155, 0.155, 0.01, 20);
  put(b, p, 'clock', face, 0, y, 0.052, 0, Math.PI / 2, 0, { uv: 'local', shade: 'flat' });
}

export function bin(b: WorldBuilder, p: Place, kind: 'general' | 'clinical' | 'sharps', roomId?: ObjectId): void {
  if (kind === 'sharps') {
    put(b, p, 'yellowPaint', box(0.2, 0.25, 0.14), 0, 1.15, 0.07);
    put(b, p, 'redPaint', box(0.21, 0.04, 0.15), 0, 1.29, 0.07);
    return;
  }
  const color: [number, number, number] = kind === 'clinical' ? [1, 0.9, 0.2] : [0.5, 0.5, 0.52];
  put(b, p, 'whitePlastic', box(0.36, 0.55, 0.3), 0, 0.275, 0, 0, 0, 0, { tint: color });
  put(b, p, 'whitePlastic', box(0.38, 0.04, 0.32), 0, 0.57, 0, 0, 0, 0, { tint: color.map((c) => c * 0.85) as [number, number, number] });
  if (roomId) collide(b, p, roomId, 0, 0.3, 0, 0.38, 0.6, 0.32);
}

export function cardboardBox(b: WorldBuilder, p: Place, roomId: ObjectId | null, size: readonly [number, number, number], open = false): void {
  const [w, h, d] = size;
  put(b, p, 'cardboard', box(w, h, d), 0, h / 2, 0, 0, 0, 0, { tint: b.rng.range(0.75, 1.05) });
  if (open) {
    put(b, p, 'cardboard', box(w, 0.005, d * 0.5), 0, h + 0.1, d * 0.45, 0, -0.9, 0, { tint: 0.9 });
    put(b, p, 'cardboard', box(w, 0.005, d * 0.5), 0, h + 0.1, -d * 0.45, 0, 0.9, 0, { tint: 0.9 });
  }
  if (roomId) collide(b, p, roomId, 0, h / 2, 0, w, h, d);
}

export function scatteredPapers(b: WorldBuilder, cx: number, cz: number, radius: number, count: number, y = 0.004): void {
  for (let i = 0; i < count; i++) {
    const a = b.rng.range(0, Math.PI * 2);
    const r = Math.sqrt(b.rng.next()) * radius;
    const sheet = plane(0.21, 0.297);
    sheet.rotateX(-Math.PI / 2);
    const m = new Matrix4().makeRotationY(b.rng.range(0, Math.PI * 2));
    m.multiply(new Matrix4().makeRotationX(b.rng.range(-0.05, 0.05)));
    m.setPosition(cx + Math.cos(a) * r, y + i * 0.0006, cz + Math.sin(a) * r);
    b.add('paper', sheet, m, { uv: 'local', shade: 'flat', tint: b.rng.range(0.7, 1) });
  }
}

export function decal(b: WorldBuilder, kind: 'stainWater' | 'stainDark' | 'stainDrag' | 'stainRust', matrix: Matrix4, w: number, h: number): void {
  b.add(kind, plane(w, h), matrix, { uv: 'local', shade: 'flat' });
}

export function floorDecal(b: WorldBuilder, kind: 'stainWater' | 'stainDark' | 'stainDrag' | 'stainRust', x: number, z: number, w: number, h: number, yaw = 0): void {
  const g = plane(w, h);
  g.rotateX(-Math.PI / 2);
  b.add(kind, g, new Matrix4().makeRotationY(yaw).setPosition(x, 0.003, z), { uv: 'local', shade: 'flat' });
}

export function puddle(b: WorldBuilder, x: number, z: number, w: number, d: number): void {
  const g = plane(1, 1, 16, 16);
  g.rotateX(-Math.PI / 2);
  // Irregular outline: collapse outer vertices toward the centre using a noisy radius.
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const pz = pos.getZ(i);
    const a = Math.atan2(pz, px);
    const radius = 0.42 + Math.sin(a * 3 + x) * 0.05 + Math.sin(a * 7 + z) * 0.03;
    const r = Math.hypot(px, pz);
    if (r > radius) { pos.setX(i, (px / r) * radius); pos.setZ(i, (pz / r) * radius); }
  }
  b.add('puddle', g, new Matrix4().makeScale(w, 1, d).setPosition(x, 0.004, z), { uv: 'local', shade: 'flat' });
}

export function plasticSheeting(b: WorldBuilder, x0: number, z0: number, x1: number, z1: number, ceiling: number, torn = false): void {
  const length = Math.hypot(x1 - x0, z1 - z0);
  const yaw = Math.atan2(-(z1 - z0), x1 - x0);
  const drop = torn ? ceiling - 0.7 : ceiling - 0.02;
  const g = plane(length, drop, 16, 6);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i);
    const v = pos.getY(i);
    pos.setZ(i, Math.sin(u * 4.1) * 0.05 + Math.sin(u * 9 + v * 2) * 0.02 * (1 - (v + drop / 2) / drop));
  }
  g.computeVertexNormals();
  b.add('plasticSheet', g, new Matrix4().makeRotationY(yaw).setPosition((x0 + x1) / 2, ceiling - drop / 2, (z0 + z1) / 2), { uv: 'local', shade: 'flat' });
  b.add('steel', box(length, 0.02, 0.02), new Matrix4().makeRotationY(yaw).setPosition((x0 + x1) / 2, ceiling - 0.01, (z0 + z1) / 2), { shade: 'flat' });
}

export function teddyBear(b: WorldBuilder, p: Place): void {
  const fur: [number, number, number] = [0.62, 0.44, 0.3];
  put(b, p, 'cardboard', sphere(0.09, 10, 6), 0, 0.09, 0, 0, 0, 0, { tint: fur });
  put(b, p, 'cardboard', sphere(0.065, 10, 6), 0, 0.2, -0.04, 0, 0, 0, { tint: fur });
  for (const side of [-1, 1]) {
    put(b, p, 'cardboard', sphere(0.025, 6, 4), side * 0.045, 0.26, -0.05, 0, 0, 0, { tint: fur });
    put(b, p, 'cardboard', sphere(0.035, 6, 4), side * 0.08, 0.04, 0.06, 0, 0, 0, { tint: fur });
  }
}

export function flowersVase(b: WorldBuilder, p: Place, dead: boolean): void {
  put(b, p, 'glass', cylinder(0.05, 0.04, 0.2, 8), 0, 0.1, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const top = worldPoint(p, Math.cos(a) * 0.08, dead ? 0.3 : 0.38, Math.sin(a) * 0.08);
    const bottom = worldPoint(p, 0, 0.05, 0);
    const stem = cylinderBetween(bottom, top, 0.003, 3);
    b.add('fabricSeat', stem.geometry, stem.matrix, { tint: dead ? [0.7, 0.6, 0.35] : [0.5, 1, 0.5] });
    const head = new Matrix4().makeTranslation(top.x, top.y - (dead ? 0.04 : 0), top.z);
    b.add('cardboard', sphere(0.025, 6, 4), head, { tint: dead ? [0.45, 0.3, 0.25] : [1.2, 0.6, 0.7] });
  }
}

export function noticeBoard(b: WorldBuilder, matrix: Matrix4, w: number, h: number): void {
  b.add('darkWood', box(w + 0.05, h + 0.05, 0.02), matrix.clone().multiply(new Matrix4().makeTranslation(0, 0, 0.01)));
  b.add('noticeboard', plane(w, h), matrix.clone().multiply(new Matrix4().makeTranslation(0, 0, 0.022)), { uv: 'local', shade: 'flat' });
}

export function officeChair(b: WorldBuilder, p: Place, roomId: ObjectId, tipped = false): void {
  if (tipped) {
    put(b, p, 'rubber', box(0.48, 0.48, 0.08), 0, 0.26, -0.1, 0, 0, Math.PI / 2, { tint: 1.3 });
    put(b, p, 'rubber', box(0.48, 0.08, 0.48), 0.24, 0.26, 0.2, 0, 0, Math.PI / 2, { tint: 1.3 });
    put(b, p, 'chrome', cylinder(0.025, 0.025, 0.4, 6), 0.0, 0.28, 0.45, 0, Math.PI / 2, 0);
    collide(b, p, roomId, 0.1, 0.25, 0.1, 0.55, 0.5, 0.7);
    return;
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    put(b, p, 'rubber', box(0.3, 0.03, 0.04), Math.cos(a) * 0.15, 0.06, Math.sin(a) * 0.15, -a);
    put(b, p, 'rubber', sphere(0.025, 6, 4), Math.cos(a) * 0.3, 0.025, Math.sin(a) * 0.3);
  }
  put(b, p, 'chrome', cylinder(0.025, 0.025, 0.36, 6), 0, 0.26, 0);
  put(b, p, 'rubber', box(0.48, 0.08, 0.46), 0, 0.48, 0, 0, 0, 0, { tint: 1.4 });
  put(b, p, 'rubber', box(0.44, 0.5, 0.06), 0, 0.8, -0.24, 0, 0.12, 0, { tint: 1.4 });
  collide(b, p, roomId, 0, 0.5, 0, 0.6, 1.0, 0.6);
}

export function computerMonitor(b: WorldBuilder, p: Place, roomId: ObjectId, state: 'off' | 'on' | 'flicker'): void {
  put(b, p, 'beigePlastic', box(0.2, 0.02, 0.16), 0, 0.01, 0);
  put(b, p, 'beigePlastic', box(0.05, 0.22, 0.04), 0, 0.12, -0.02);
  put(b, p, 'beigePlastic', box(0.44, 0.32, 0.06), 0, 0.33, 0);
  put(b, p, 'beigePlastic', box(0.42, 0.13, 0.03), 0, 0.03, 0.22, 0, 0, 0, { tint: 0.9 });
  const m = local(p, 0, 0.335, 0.031);
  if (state === 'off') {
    put(b, p, 'screenOff', box(0.39, 0.26, 0.004), 0, 0.335, 0.03, 0, 0, 0, { shade: 'flat' });
    return;
  }
  const material = b.materials.adopt(new MeshBasicMaterial({ color: 0x5a8ab8, fog: true }));
  const mesh = new Mesh(b.own(new PlaneGeometry(0.39, 0.26)), material);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(m);
  b.attach(mesh);
  b.fixture({
    kind: 'monitor', state: state === 'flicker' ? 'flicker' : 'buzz', roomId, circuits: ['nw:lights:monitors'],
    position: worldPoint(p, 0, 0.4, 0.5), color: 0x6a9ad0, intensity: 0.5, distance: 2.4, material,
  });
}

export function phone(b: WorldBuilder, p: Place, offHook = false): void {
  put(b, p, 'beigePlastic', box(0.2, 0.06, 0.22), 0, 0.03, 0);
  if (offHook) {
    put(b, p, 'beigePlastic', box(0.05, 0.04, 0.2), 0.25, -0.75, 0.1, 0.4, 0, 0.3);
    const top = worldPoint(p, -0.05, 0.03, 0);
    const bottom = worldPoint(p, 0.24, -0.78, 0.1);
    const cord = cylinderBetween(top, bottom, 0.004, 3);
    b.add('beigePlastic', cord.geometry, cord.matrix, { shade: 'flat', tint: 0.8 });
  } else {
    put(b, p, 'beigePlastic', box(0.05, 0.04, 0.2), -0.06, 0.08, 0, 0, 0, 0, { tint: 0.95 });
  }
}

export function binders(b: WorldBuilder, p: Place, count: number): void {
  for (let i = 0; i < count; i++) {
    const lean = i === count - 1 ? 0.3 : 0;
    put(b, p, 'whitePlastic', box(0.05, 0.3, 0.24), i * 0.055, 0.15, 0, 0, 0, lean, { tint: [b.rng.range(0.3, 1), b.rng.range(0.3, 0.9), b.rng.range(0.3, 1)] });
  }
}

export function pipeRun(b: WorldBuilder, points: readonly Vector3[], radius: number, material: MaterialKey = 'pipe'): void {
  for (let i = 0; i < points.length - 1; i++) {
    const seg = cylinderBetween(points[i]!, points[i + 1]!, radius, 8);
    b.add(material, seg.geometry, seg.matrix);
    if (i > 0) b.add(material, sphere(radius * 1.15, 8, 5), new Matrix4().makeTranslation(points[i]!.x, points[i]!.y, points[i]!.z));
  }
}

export function stepLadder(b: WorldBuilder, p: Place, roomId: ObjectId): void {
  for (const side of [-1, 1]) {
    put(b, p, 'steel', box(0.04, 1.6, 0.03), side * 0.22, 0.78, 0.15, 0, -0.18, 0);
    put(b, p, 'steel', box(0.04, 1.6, 0.03), side * 0.22, 0.78, -0.25, 0, 0.18, 0);
  }
  for (let i = 0; i < 5; i++) put(b, p, 'steel', box(0.44, 0.02, 0.1), 0, 0.25 + i * 0.3, 0.13 - i * 0.055, 0, 0, 0, { tint: 0.9 });
  collide(b, p, roomId, 0, 0.8, -0.05, 0.5, 1.6, 0.6);
}

export function mopBucket(b: WorldBuilder, p: Place, roomId: ObjectId): void {
  put(b, p, 'yellowPaint', box(0.42, 0.3, 0.32), 0, 0.2, 0);
  put(b, p, 'rubber', box(0.36, 0.01, 0.26), 0, 0.33, 0, 0, 0, 0, { tint: [1, 1.4, 1.2] });
  put(b, p, 'whitePlastic', cylinder(0.012, 0.012, 1.3, 5), 0.1, 0.8, 0.05, 0, 0.25, 0.1, { tint: [0.4, 0.5, 0.9] });
  for (const [x, z] of [[-0.18, -0.13], [0.18, -0.13], [-0.18, 0.13], [0.18, 0.13]] as const) put(b, p, 'rubber', cylinder(0.025, 0.025, 0.02, 6), x, 0.025, z, 0, 0, Math.PI / 2);
  collide(b, p, roomId, 0, 0.2, 0, 0.44, 0.4, 0.34);
}

export function linenCart(b: WorldBuilder, p: Place, roomId: ObjectId): void {
  put(b, p, 'steel', box(0.6, 0.02, 1.0), 0, 0.2, 0, 0, 0, 0, { tint: 0.8 });
  for (const [x, z] of [[-0.28, -0.48], [0.28, -0.48], [-0.28, 0.48], [0.28, 0.48]] as const) {
    put(b, p, 'steel', box(0.025, 1.3, 0.025), x, 0.75, z);
    put(b, p, 'rubber', cylinder(0.04, 0.04, 0.03, 8), x, 0.04, z, 0, 0, Math.PI / 2);
  }
  put(b, p, 'linen', box(0.58, 0.95, 0.98), 0, 0.7, 0, 0, 0, 0, { tint: [0.55, 0.65, 0.75] });
  put(b, p, 'linen', box(0.5, 0.25, 0.6), 0.02, 1.3, 0.1, 0.1, 0, 0.05, { tint: 0.95 });
  collide(b, p, roomId, 0, 0.7, 0, 0.62, 1.4, 1.02);
}

/** Electrical distribution board; door optionally hanging open. */
export function electricalPanel(b: WorldBuilder, p: Place, open: boolean): void {
  put(b, p, 'lockerPaint', box(0.6, 0.9, 0.18), 0, 1.45, 0.09, 0, 0, 0, { tint: [0.8, 0.82, 0.85] });
  if (open) {
    put(b, p, 'rubber', box(0.52, 0.8, 0.01), 0, 1.45, 0.18, 0, 0, 0, { tint: 1.8 });
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) put(b, p, 'whitePlastic', box(0.05, 0.1, 0.03), -0.18 + c * 0.075, 1.2 + r * 0.17, 0.19, 0, 0, 0, { tint: b.rng.chance(0.15) ? [1, 0.3, 0.2] : 0.9 });
    put(b, p, 'lockerPaint', box(0.6, 0.9, 0.02), 0.33, 1.45, 0.42, -1.3, 0, 0, { tint: [0.8, 0.82, 0.85] });
  } else {
    put(b, p, 'yellowPaint', box(0.12, 0.1, 0.003), 0, 1.75, 0.182);
  }
}

export { basis };
