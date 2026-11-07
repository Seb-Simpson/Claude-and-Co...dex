import {
  AdditiveBlending,
  Color,
  DoubleSide,
  type Material,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  type Side,
  type Texture,
} from 'three';
import type { TextureLibrary } from './textures';

/** Every reusable surface in the ward. World geometry is merged per key, so this list bounds draw calls. */
export type MaterialKey =
  | 'floor' | 'floorConcrete' | 'wall' | 'wallStained' | 'wainscot' | 'ceiling' | 'ceilingStained' | 'concrete' | 'ceilingVoid'
  | 'skirting' | 'rail' | 'frame' | 'steel' | 'chrome' | 'whitePlastic' | 'beigePlastic' | 'laminate' | 'darkWood'
  | 'rubber' | 'mattress' | 'linen' | 'fabricSeat' | 'cardboard' | 'redPaint' | 'yellowPaint' | 'lockerPaint'
  | 'cabinetBlue' | 'copper' | 'pipe' | 'paper' | 'glass' | 'blinds' | 'curtain' | 'plasticSheet' | 'sky'
  | 'screenOff' | 'whiteboard' | 'noticeboard' | 'clock' | 'vending' | 'drawing' | 'tile' | 'doorLeaf'
  | 'stainWater' | 'stainDark' | 'stainDrag' | 'stainRust' | 'puddle' | 'shaft' | 'shaftSlats' | 'black';

interface Spec {
  readonly kind: 'standard' | 'lambert' | 'basic';
  readonly color: string;
  readonly roughness?: number;
  readonly metalness?: number;
  readonly map?: (t: TextureLibrary) => Texture | null;
  /** World-space texture repeat size in metres (applied to texture.repeat). */
  readonly repeatMetres?: number;
  readonly side?: Side;
  readonly transparent?: boolean;
  readonly opacity?: number;
  readonly decal?: boolean;
  readonly additive?: boolean;
  readonly vertexColors?: boolean;
  readonly emissive?: string;
  readonly emissiveIntensity?: number;
}

const specs: Record<MaterialKey, Spec> = {
  floor: { kind: 'standard', color: '#d8d6cc', roughness: 0.42, metalness: 0, map: (t) => t.floorVinyl(), repeatMetres: 1.2 },
  floorConcrete: { kind: 'standard', color: '#8a8a86', roughness: 0.75, map: (t) => t.concrete(), repeatMetres: 2.4 },
  wall: { kind: 'lambert', color: '#d9ddd4', map: (t) => t.wallPaint(), repeatMetres: 2 },
  wallStained: { kind: 'lambert', color: '#c9c6b4', map: (t) => t.wallPaint(), repeatMetres: 1.6 },
  wainscot: { kind: 'lambert', color: '#b4c8bf', map: (t) => t.wainscot(), repeatMetres: 1.2 },
  ceiling: { kind: 'lambert', color: '#e2e2dc', map: (t) => t.ceilingTiles(false), repeatMetres: 2.4 },
  ceilingStained: { kind: 'lambert', color: '#d8d4c8', map: (t) => t.ceilingTiles(true), repeatMetres: 2.4 },
  concrete: { kind: 'lambert', color: '#9a9a94', map: (t) => t.concrete(), repeatMetres: 2.2 },
  ceilingVoid: { kind: 'basic', color: '#030304' },
  skirting: { kind: 'standard', color: '#3e4644', roughness: 0.6 },
  rail: { kind: 'standard', color: '#b8b0a0', roughness: 0.5 },
  frame: { kind: 'standard', color: '#7d8a90', roughness: 0.45, metalness: 0.2 },
  steel: { kind: 'standard', color: '#a4aaac', roughness: 0.42, metalness: 0.22, map: (t) => t.brushedMetal(), repeatMetres: 0.8 },
  chrome: { kind: 'standard', color: '#c4c8ca', roughness: 0.25, metalness: 0.6 },
  whitePlastic: { kind: 'standard', color: '#dcdcd4', roughness: 0.5 },
  beigePlastic: { kind: 'standard', color: '#c8bca4', roughness: 0.55 },
  laminate: { kind: 'standard', color: '#c8b08c', roughness: 0.5 },
  darkWood: { kind: 'standard', color: '#6a4c34', roughness: 0.6 },
  rubber: { kind: 'standard', color: '#1e2022', roughness: 0.85 },
  mattress: { kind: 'standard', color: '#5a7890', roughness: 0.55 },
  linen: { kind: 'lambert', color: '#d6d8d2', side: DoubleSide },
  fabricSeat: { kind: 'lambert', color: '#4e6a64' },
  cardboard: { kind: 'lambert', color: '#a88a62' },
  redPaint: { kind: 'standard', color: '#9a2420', roughness: 0.45, metalness: 0.1 },
  yellowPaint: { kind: 'standard', color: '#c8a02a', roughness: 0.5 },
  lockerPaint: { kind: 'standard', color: '#6c7e78', roughness: 0.5, metalness: 0.25 },
  cabinetBlue: { kind: 'standard', color: '#5e7a94', roughness: 0.5, metalness: 0.1 },
  copper: { kind: 'standard', color: '#8a5a3a', roughness: 0.45, metalness: 0.5 },
  pipe: { kind: 'standard', color: '#6e7470', roughness: 0.6, metalness: 0.3 },
  paper: { kind: 'lambert', color: '#e8e4d8', map: (t) => t.paper(), side: DoubleSide, vertexColors: false },
  glass: { kind: 'standard', color: '#4a5a66', roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.32, vertexColors: false },
  blinds: { kind: 'standard', color: '#b6b2a4', roughness: 0.5, side: DoubleSide },
  curtain: { kind: 'lambert', color: '#a8c8c8', map: (t) => t.curtainFabric(), side: DoubleSide, repeatMetres: 0.9 },
  plasticSheet: { kind: 'standard', color: '#c8d4d8', roughness: 0.2, transparent: true, opacity: 0.28, side: DoubleSide, vertexColors: false },
  sky: { kind: 'basic', color: '#ffffff', map: (t) => t.nightSky(), vertexColors: false },
  screenOff: { kind: 'standard', color: '#0c1012', roughness: 0.15, metalness: 0.3 },
  whiteboard: { kind: 'lambert', color: '#f0f0ea', map: (t) => t.patientBoard(), vertexColors: false },
  noticeboard: { kind: 'lambert', color: '#ffffff', map: (t) => t.noticeBoard(), vertexColors: false },
  clock: { kind: 'lambert', color: '#ffffff', map: (t) => t.clockFace(), vertexColors: false },
  vending: { kind: 'basic', color: '#8a8e90', map: (t) => t.vendingFront(), vertexColors: false },
  drawing: { kind: 'lambert', color: '#ffffff', map: (t) => t.drawing(), vertexColors: false, side: DoubleSide },
  tile: { kind: 'standard', color: '#cfd8d6', roughness: 0.25 },
  doorLeaf: { kind: 'standard', color: '#e2d2b8', roughness: 0.55, map: (t) => t.doorLaminate(), vertexColors: false },
  stainWater: { kind: 'lambert', color: '#ffffff', map: (t) => t.stain('water'), decal: true },
  stainDark: { kind: 'lambert', color: '#ffffff', map: (t) => t.stain('dark'), decal: true },
  stainDrag: { kind: 'lambert', color: '#ffffff', map: (t) => t.stain('drag'), decal: true },
  stainRust: { kind: 'lambert', color: '#ffffff', map: (t) => t.stain('rust'), decal: true },
  puddle: { kind: 'standard', color: '#3a4448', roughness: 0.04, metalness: 0.15, transparent: true, opacity: 0.5, vertexColors: false },
  shaft: { kind: 'basic', color: '#5a7eb0', map: (t) => t.lightShaft(false), additive: true, vertexColors: false },
  shaftSlats: { kind: 'basic', color: '#5a7eb0', map: (t) => t.lightShaft(true), additive: true, vertexColors: false },
  black: { kind: 'basic', color: '#000000' },
};

/** Lazily creates shared materials; one instance per key, disposed with the world. */
export class MaterialLibrary {
  private readonly materials = new Map<MaterialKey, Material>();
  private readonly extra: Material[] = [];

  constructor(private readonly textures: TextureLibrary) {}

  get(key: MaterialKey): Material {
    const existing = this.materials.get(key);
    if (existing) return existing;
    const spec = specs[key];
    let map = spec.map ? spec.map(this.textures) : null;
    if (map && spec.repeatMetres) {
      // Repeat is per material; clone so different metric scales can share one canvas.
      map = this.textures.adopt(map.clone());
      map.repeat.set(1 / spec.repeatMetres, 1 / spec.repeatMetres);
      map.needsUpdate = true;
    }
    const vertexColors = spec.vertexColors ?? !spec.decal;
    const common = {
      color: new Color(spec.color),
      side: spec.side ?? (spec.decal ? DoubleSide : undefined) ?? 0,
      transparent: spec.transparent ?? (spec.decal || spec.additive) ?? false,
      opacity: spec.opacity ?? 1,
      vertexColors: spec.kind === 'basic' && spec.additive ? false : vertexColors,
      ...(map ? { map } : {}),
    };
    let material: Material;
    if (spec.kind === 'standard') {
      material = new MeshStandardMaterial({ ...common, roughness: spec.roughness ?? 0.6, metalness: spec.metalness ?? 0 });
    } else if (spec.kind === 'lambert') {
      material = new MeshLambertMaterial(common);
    } else {
      material = new MeshBasicMaterial({ ...common, fog: true });
    }
    if (spec.decal) {
      material.depthWrite = false;
      material.polygonOffset = true;
      material.polygonOffsetFactor = -2;
      material.polygonOffsetUnits = -2;
    }
    if (spec.additive) {
      material.blending = AdditiveBlending;
      material.depthWrite = false;
    }
    if (spec.transparent) material.depthWrite = false;
    material.name = `nw:${key}`;
    this.materials.set(key, material);
    return material;
  }

  isTransparent(key: MaterialKey): boolean {
    const spec = specs[key];
    return Boolean(spec.transparent || spec.decal || spec.additive);
  }

  /** Track a one-off material (signs, screens, fixture diffusers) for disposal. */
  adopt<T extends Material>(material: T): T {
    this.extra.push(material);
    return material;
  }

  dispose(): void {
    for (const material of this.materials.values()) material.dispose();
    for (const material of this.extra) material.dispose();
    this.materials.clear();
    this.extra.length = 0;
  }
}
