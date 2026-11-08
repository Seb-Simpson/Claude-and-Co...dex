import {
  CanvasTexture, Color, DoubleSide, type Material, MeshBasicMaterial, MeshLambertMaterial, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace,
} from 'three';

const canvasAvailable = (): boolean => typeof document !== 'undefined' && typeof document.createElement === 'function';

/** Faded hospital gown print with a tide-mark at the hem. Returns null without a DOM. */
function gownTexture(base: string, print: string, seed: number): CanvasTexture | null {
  if (!canvasAvailable()) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 256);
  let s = seed;
  const rnd = (): number => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  ctx.fillStyle = print;
  for (let y = 6; y < 256; y += 16) {
    for (let x = (y / 16) % 2 ? 8 : 0; x < 128; x += 16) {
      ctx.globalAlpha = 0.35 + rnd() * 0.25;
      ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 3); ctx.lineTo(x - 3, y); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  // Grime, wear and a stained hem (brown, not red: restrained).
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(70,58,40,${0.04 + rnd() * 0.08})`;
    ctx.beginPath(); ctx.arc(rnd() * 128, rnd() * 256, 3 + rnd() * 16, 0, Math.PI * 2); ctx.fill();
  }
  const hem = ctx.createLinearGradient(0, 180, 0, 256);
  hem.addColorStop(0, 'rgba(80,60,36,0)');
  hem.addColorStop(1, 'rgba(70,50,30,0.55)');
  ctx.fillStyle = hem;
  ctx.fillRect(0, 0, 128, 256);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}

export interface EntityMaterialSet {
  readonly materials: Readonly<Record<string, Material>>;
  /** Fade every material (1 = solid). Used for reveals, disappearances and reflections. */
  setOpacity(value: number): void;
  dispose(): void;
}

type Spec =
  | { readonly kind: 'standard'; readonly color: string; readonly roughness?: number; readonly emissive?: string; readonly double?: boolean }
  | { readonly kind: 'lambert'; readonly color: string; readonly emissive?: string; readonly double?: boolean; readonly texture?: readonly [string, string, number] }
  | { readonly kind: 'basic'; readonly color: string; readonly opacity?: number };

/** Per-entity material set so each visual can fade independently. */
export function createMaterialSet(specs: Readonly<Record<string, Spec>>): EntityMaterialSet {
  const materials: Record<string, Material> = {};
  const textures: CanvasTexture[] = [];
  const baseOpacity = new Map<Material, number>();
  for (const [key, spec] of Object.entries(specs)) {
    let material: Material;
    if (spec.kind === 'standard') {
      material = new MeshStandardMaterial({
        color: new Color(spec.color), roughness: spec.roughness ?? 0.75, metalness: 0, vertexColors: true,
        emissive: new Color(spec.emissive ?? '#000000'), side: spec.double ? DoubleSide : 0,
      });
    } else if (spec.kind === 'lambert') {
      const map = spec.texture ? gownTexture(...spec.texture) : null;
      if (map) textures.push(map);
      material = new MeshLambertMaterial({
        color: new Color(spec.color), vertexColors: true, emissive: new Color(spec.emissive ?? '#000000'),
        side: spec.double ? DoubleSide : 0, ...(map ? { map } : {}),
      });
    } else {
      material = new MeshBasicMaterial({ color: new Color(spec.color), vertexColors: true, transparent: spec.opacity !== undefined, opacity: spec.opacity ?? 1 });
    }
    material.name = `nw:entity:${key}`;
    baseOpacity.set(material, material.opacity);
    materials[key] = material;
  }
  let current = 1;
  return {
    materials,
    setOpacity(value) {
      const v = Math.max(0, Math.min(1, value));
      if (Math.abs(v - current) < 1e-4) return;
      current = v;
      for (const material of Object.values(materials)) {
        const base = baseOpacity.get(material) ?? 1;
        const fading = v < 0.999;
        material.transparent = fading || base < 1;
        material.depthWrite = !fading;
        material.opacity = base * v;
      }
    },
    dispose() {
      for (const material of Object.values(materials)) material.dispose();
      for (const texture of textures) texture.dispose();
    },
  };
}

export const PATIENT_MATERIALS = {
  skin: { kind: 'standard', color: '#8f8b7e', roughness: 0.86, emissive: '#060706' },
  gown: { kind: 'lambert', color: '#aab4b0', emissive: '#060808', double: true, texture: ['#7d908d', '#4c6168', 11] },
  bandage: { kind: 'lambert', color: '#cdc6b0' },
  dark: { kind: 'basic', color: '#030303' },
  glint: { kind: 'basic', color: '#c9d6c4', opacity: 0.4 },
} as const satisfies Record<string, Spec>;

export const NURSE_MATERIALS = {
  skin: { kind: 'standard', color: '#9c9184', roughness: 0.75, emissive: '#070606' },
  dress: { kind: 'lambert', color: '#bdbaae', emissive: '#080807', double: true, texture: ['#b9b5a6', '#9c9888', 23] },
  stocking: { kind: 'lambert', color: '#2e2a2a' },
  shoe: { kind: 'standard', color: '#151313', roughness: 0.35 },
  bandage: { kind: 'lambert', color: '#d8d0bb' },
  dark: { kind: 'basic', color: '#050404' },
} as const satisfies Record<string, Spec>;

export const CRAWLER_MATERIALS = {
  skin: { kind: 'standard', color: '#77786f', roughness: 0.5, emissive: '#070807' },
  rag: { kind: 'lambert', color: '#8d8e82', double: true, texture: ['#8c8f86', '#6d7570', 37] },
  dark: { kind: 'basic', color: '#020202' },
  glint: { kind: 'basic', color: '#b8c4b0', opacity: 0.5 },
} as const satisfies Record<string, Spec>;

export const WATCHER_MATERIALS = {
  coat: { kind: 'lambert', color: '#1a1b1d', double: true },
  skin: { kind: 'standard', color: '#c9c7bf', roughness: 0.35, emissive: '#0c0c0c' },
  dark: { kind: 'basic', color: '#060606' },
} as const satisfies Record<string, Spec>;
