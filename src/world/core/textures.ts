import { CanvasTexture, ClampToEdgeWrapping, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { createRandom, type Random } from './random';

/**
 * Procedural canvas textures. Everything is generated locally at setup, so the hospital ships with
 * no binary assets and works offline. In non-DOM environments (unit tests) every factory returns
 * null and materials fall back to flat colours.
 */
export const canUseCanvas = (): boolean => typeof document !== 'undefined' && typeof document.createElement === 'function';

type Ctx = CanvasRenderingContext2D;

function makeCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return { canvas, ctx };
}

/** Tileable value noise in [0,1]. */
function noiseField(width: number, height: number, period: number, rng: Random): (x: number, y: number) => number {
  const cells = Math.max(1, Math.round(period));
  const lattice = new Float32Array(cells * cells);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng.next();
  const sample = (ix: number, iy: number): number => lattice[(((iy % cells) + cells) % cells) * cells + (((ix % cells) + cells) % cells)] ?? 0;
  return (x, y) => {
    const fx = (x / width) * cells;
    const fy = (y / height) * cells;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = sample(x0, y0) + (sample(x0 + 1, y0) - sample(x0, y0)) * sx;
    const b = sample(x0, y0 + 1) + (sample(x0 + 1, y0 + 1) - sample(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

function fbm(width: number, height: number, rng: Random, periods: readonly number[]): (x: number, y: number) => number {
  const layers = periods.map((p) => noiseField(width, height, p, rng));
  return (x, y) => {
    let sum = 0;
    let weight = 0;
    let amp = 1;
    for (const layer of layers) {
      sum += layer(x, y) * amp;
      weight += amp;
      amp *= 0.5;
    }
    return sum / weight;
  };
}

/** Fill a canvas from a per-pixel RGB function (0-255). */
function paint(ctx: Ctx, width: number, height: number, fn: (x: number, y: number) => [number, number, number]): void {
  const image = ctx.createImageData(width, height);
  const data = image.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fn(x, y);
      const i = (y * width + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

function finish(canvas: HTMLCanvasElement, repeat: boolean, anisotropy = 1, color = true): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  if (color) texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}

const clamp255 = (v: number): number => Math.max(0, Math.min(255, v));

export interface SignStyle {
  readonly background: string;
  readonly foreground: string;
  readonly border?: string;
  readonly font?: string;
  readonly subtext?: string;
  readonly worn?: number;
}

export class TextureLibrary {
  private readonly cache = new Map<string, Texture>();
  private readonly owned: Texture[] = [];
  readonly enabled: boolean;

  constructor(private readonly seed: number, enabled = canUseCanvas()) {
    this.enabled = enabled;
  }

  private memo(key: string, factory: () => Texture): Texture | null {
    if (!this.enabled) return null;
    const existing = this.cache.get(key);
    if (existing) return existing;
    const texture = factory();
    this.cache.set(key, texture);
    this.owned.push(texture);
    return texture;
  }

  /** Track a texture created elsewhere (dynamic screens) for disposal. */
  adopt<T extends Texture>(texture: T): T {
    this.owned.push(texture);
    return texture;
  }

  private rng(salt: number): Random { return createRandom(this.seed * 7919 + salt); }

  /** Speckled vinyl composition tile, 4x4 tiles of 0.3 m = 1.2 m repeat. */
  floorVinyl(): Texture | null {
    return this.memo('floor', () => {
      const size = 512;
      const { canvas, ctx } = makeCanvas(size, size);
      const rng = this.rng(1);
      const grime = fbm(size, size, rng, [3, 7, 15]);
      const tileTint: number[] = [];
      for (let i = 0; i < 16; i++) tileTint.push(rng.range(-9, 7) + (rng.chance(0.12) ? -16 : 0));
      const tile = size / 4;
      paint(ctx, size, size, (x, y) => {
        const tx = Math.floor(x / tile);
        const ty = Math.floor(y / tile);
        const t = tileTint[ty * 4 + tx] ?? 0;
        const g = (grime(x, y) - 0.5) * 34;
        const speck = rng.next();
        const s = speck > 0.985 ? -55 : speck > 0.94 ? -22 : speck < 0.02 ? 18 : 0;
        const base = 176 + t + g + s;
        let r = base + 2, gg = base + 4, b = base - 4;
        const ex = x % tile;
        const ey = y % tile;
        if (ex < 1.6 || ey < 1.6 || ex > tile - 1.2 || ey > tile - 1.2) { r -= 48; gg -= 46; b -= 44; }
        return [clamp255(r), clamp255(gg), clamp255(b)];
      });
      // Black scuff arcs from trolley wheels and shoes.
      ctx.lineCap = 'round';
      for (let i = 0; i < 26; i++) {
        ctx.strokeStyle = `rgba(20,18,16,${rng.range(0.05, 0.22)})`;
        ctx.lineWidth = rng.range(0.8, 3.2);
        ctx.beginPath();
        const cx = rng.range(0, size);
        const cy = rng.range(0, size);
        const radius = rng.range(10, 70);
        const start = rng.range(0, Math.PI * 2);
        ctx.arc(cx, cy, radius, start, start + rng.range(0.2, 1.1));
        ctx.stroke();
      }
      return finish(canvas, true, 8);
    });
  }

  /** Painted gypsum wall with faint streaks and scuffs, 2 m repeat. */
  wallPaint(): Texture | null {
    return this.memo('wall', () => {
      const size = 512;
      const { canvas, ctx } = makeCanvas(size, size);
      const rng = this.rng(2);
      const n = fbm(size, size, rng, [4, 9, 24]);
      const streak = noiseField(size, size, 64, rng);
      paint(ctx, size, size, (x, y) => {
        const v = (n(x, y) - 0.5) * 22 + (streak(x, y * 0.04) - 0.5) * 16 * (y / size);
        const base = 205 + v;
        return [clamp255(base - 2), clamp255(base + 2), clamp255(base - 6)];
      });
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = `rgba(70,60,48,${rng.range(0.03, 0.09)})`;
        const x = rng.range(0, size);
        ctx.fillRect(x, rng.range(0, size * 0.6), rng.range(1, 3), rng.range(40, 220));
      }
      for (let i = 0; i < 10; i++) {
        ctx.strokeStyle = `rgba(40,36,32,${rng.range(0.08, 0.2)})`;
        ctx.lineWidth = rng.range(0.6, 1.4);
        ctx.beginPath();
        let x = rng.range(0, size);
        let y = rng.range(0, size);
        ctx.moveTo(x, y);
        for (let k = 0; k < 6; k++) { x += rng.range(-14, 14); y += rng.range(4, 18); ctx.lineTo(x, y); }
        ctx.stroke();
      }
      return finish(canvas, true, 4);
    });
  }

  /** Lower-wall protective sheet vinyl with seams and trolley scrapes, 1.2 m repeat. */
  wainscot(): Texture | null {
    return this.memo('wainscot', () => {
      const size = 256;
      const { canvas, ctx } = makeCanvas(size, size);
      const rng = this.rng(3);
      const n = fbm(size, size, rng, [4, 12]);
      paint(ctx, size, size, (x, y) => {
        const v = (n(x, y) - 0.5) * 20;
        const seam = x < 2 ? -30 : 0;
        return [clamp255(132 + v + seam), clamp255(160 + v + seam), clamp255(150 + v + seam)];
      });
      for (let i = 0; i < 18; i++) {
        ctx.strokeStyle = `rgba(30,32,30,${rng.range(0.08, 0.3)})`;
        ctx.lineWidth = rng.range(0.5, 2);
        const y = rng.range(size * 0.3, size);
        const x = rng.range(0, size);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rng.range(20, 90), y + rng.range(-3, 3)); ctx.stroke();
      }
      return finish(canvas, true, 4);
    });
  }

  /** 600 mm fissured acoustic tiles on a T-grid. Stained variant has water rings and sag. */
  ceilingTiles(stained: boolean): Texture | null {
    return this.memo(stained ? 'ceiling-stained' : 'ceiling', () => {
      const size = 512;
      const { canvas, ctx } = makeCanvas(size, size);
      const rng = this.rng(stained ? 5 : 4);
      const n = fbm(size, size, rng, [6, 16, 40]);
      // 4 x 4 tiles of 600 mm: the texture covers 2.4 m so stains and tint variation repeat rarely.
      const tile = size / 4;
      const tint: number[] = [];
      for (let i = 0; i < 16; i++) tint.push(rng.chance(0.2) ? rng.range(-16, -6) : rng.range(-4, 3));
      paint(ctx, size, size, (x, y) => {
        const fissure = rng.next() > 0.93 ? -22 : 0;
        const v = (n(x, y) - 0.5) * 14 + fissure;
        const ex = x % tile;
        const ey = y % tile;
        const grid = ex < 3 || ey < 3 || ex > tile - 3 || ey > tile - 3;
        if (grid) return [190, 192, 190];
        const edge = ex < 6 || ey < 6 || ex > tile - 6 || ey > tile - 6 ? -16 : 0;
        const t = tint[Math.floor(y / tile) * 4 + Math.floor(x / tile)] ?? 0;
        const base = 214 + v + edge + t;
        return [clamp255(base), clamp255(base - 1 + t * 0.1), clamp255(base - 6 + t * 0.4)];
      });
      if (stained) {
        for (let i = 0; i < 2; i++) {
          const cx = rng.range(40, size - 40);
          const cy = rng.range(40, size - 40);
          const radius = rng.range(26, 70);
          for (let ring = 0; ring < 4; ring++) {
            const r = radius * (1 - ring * 0.18);
            const gradient = ctx.createRadialGradient(cx, cy, r * 0.65, cx, cy, r);
            gradient.addColorStop(0, 'rgba(150,110,60,0.02)');
            gradient.addColorStop(0.85, `rgba(120,82,40,${0.18 + ring * 0.05})`);
            gradient.addColorStop(1, 'rgba(120,82,40,0)');
            ctx.fillStyle = gradient;
            ctx.beginPath(); ctx.arc(cx + ring * 3, cy + ring * 2, r, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      return finish(canvas, true, 4);
    });
  }

  /** Raw concrete for service spaces, 2 m repeat. */
  concrete(): Texture | null {
    return this.memo('concrete', () => {
      const size = 512;
      const { canvas, ctx } = makeCanvas(size, size);
      const rng = this.rng(6);
      const n = fbm(size, size, rng, [3, 8, 20, 64]);
      paint(ctx, size, size, (x, y) => {
        const v = (n(x, y) - 0.5) * 60 + (rng.next() - 0.5) * 14;
        const base = 118 + v;
        return [clamp255(base), clamp255(base), clamp255(base - 4)];
      });
      for (let i = 0; i < 7; i++) {
        const cx = rng.range(0, size);
        const cy = rng.range(0, size);
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, rng.range(30, 110));
        gradient.addColorStop(0, 'rgba(30,28,22,0.35)');
        gradient.addColorStop(1, 'rgba(30,28,22,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
      }
      return finish(canvas, true, 4);
    });
  }

  /** Birch-effect door laminate mapped once over a door face. */
  doorLaminate(): Texture | null {
    return this.memo('door', () => {
      const w = 256;
      const h = 512;
      const { canvas, ctx } = makeCanvas(w, h);
      const rng = this.rng(7);
      const grain = noiseField(w, h, 24, rng);
      const fine = noiseField(w, h, 90, rng);
      paint(ctx, w, h, (x, y) => {
        const g = Math.sin((x + grain(x, y * 0.08) * 60) * 0.35) * 8 + (fine(x, y * 0.1) - 0.5) * 14;
        return [clamp255(186 + g), clamp255(160 + g), clamp255(122 + g * 0.8)];
      });
      // Grime around the push zone and lower edge.
      const gradient = ctx.createLinearGradient(0, h * 0.85, 0, h);
      gradient.addColorStop(0, 'rgba(40,30,20,0)');
      gradient.addColorStop(1, 'rgba(40,30,20,0.35)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
      return finish(canvas, false, 4);
    });
  }

  brushedMetal(): Texture | null {
    return this.memo('metal', () => {
      const size = 256;
      const { canvas, ctx } = makeCanvas(size, size);
      const rng = this.rng(8);
      const lines = noiseField(size, size, 128, rng);
      const blotch = fbm(size, size, rng, [3, 8]);
      paint(ctx, size, size, (x, y) => {
        const v = (lines(x * 0.02, y) - 0.5) * 30 + (blotch(x, y) - 0.5) * 30;
        return [clamp255(170 + v), clamp255(174 + v), clamp255(176 + v)];
      });
      return finish(canvas, true, 2);
    });
  }

  /** Faded hospital privacy-curtain print. */
  curtainFabric(): Texture | null {
    return this.memo('curtain', () => {
      const size = 256;
      const { canvas, ctx } = makeCanvas(size, size);
      const rng = this.rng(9);
      const n = fbm(size, size, rng, [4, 10]);
      paint(ctx, size, size, (x, y) => {
        const v = (n(x, y) - 0.5) * 24;
        const diamond = (Math.abs(((x + 16) % 32) - 16) + Math.abs(((y + 16) % 32) - 16)) < 4 ? -22 : 0;
        return [clamp255(128 + v + diamond), clamp255(158 + v + diamond), clamp255(160 + v + diamond)];
      });
      // Brown tide line where something soaked the hem.
      const gradient = ctx.createLinearGradient(0, size * 0.82, 0, size);
      gradient.addColorStop(0, 'rgba(90,70,40,0)');
      gradient.addColorStop(0.3, 'rgba(90,70,40,0.25)');
      gradient.addColorStop(1, 'rgba(70,50,30,0.4)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      return finish(canvas, true, 2);
    });
  }

  /** Night sky with sodium haze and a few distant lit windows. */
  nightSky(): Texture | null {
    return this.memo('sky', () => {
      const w = 512;
      const h = 256;
      const { canvas, ctx } = makeCanvas(w, h);
      const rng = this.rng(10);
      const clouds = fbm(w, h, rng, [3, 7, 16]);
      paint(ctx, w, h, (x, y) => {
        const t = y / h;
        const c = clouds(x, y) * 26 * (1 - t);
        return [clamp255(10 + c + t * 26), clamp255(14 + c + t * 18), clamp255(26 + c * 1.2 + t * 10)];
      });
      // Distant building silhouettes and a handful of lit windows.
      ctx.fillStyle = '#05070a';
      let x = 0;
      while (x < w) {
        const bw = rng.range(30, 90);
        const bh = rng.range(30, 110);
        ctx.fillRect(x, h - bh, bw, bh);
        for (let i = 0; i < 4; i++) {
          if (!rng.chance(0.5)) continue;
          ctx.fillStyle = rng.chance(0.7) ? 'rgba(220,170,90,0.55)' : 'rgba(150,180,210,0.4)';
          ctx.fillRect(x + rng.range(4, bw - 8), h - bh + rng.range(6, bh - 10), 3, 4);
          ctx.fillStyle = '#05070a';
        }
        x += bw + rng.range(0, 30);
      }
      return finish(canvas, false, 1);
    });
  }

  /** Soft-edged stain decal (alpha in the texture). */
  stain(kind: 'water' | 'dark' | 'drag' | 'rust'): Texture | null {
    return this.memo(`stain-${kind}`, () => {
      const size = 256;
      const { canvas, ctx } = makeCanvas(size, size);
      const rng = this.rng(20 + ['water', 'dark', 'drag', 'rust'].indexOf(kind));
      const color = kind === 'water' ? '96,78,52' : kind === 'dark' ? '52,16,12' : kind === 'rust' ? '110,56,26' : '46,18,14';
      if (kind === 'drag') {
        for (let i = 0; i < 70; i++) {
          ctx.fillStyle = `rgba(${color},${rng.range(0.02, 0.07)})`;
          const y = size * 0.5 + rng.range(-30, 30);
          ctx.fillRect(rng.range(0, 30), y, size - rng.range(0, 80), rng.range(2, 9));
        }
      } else {
        for (let i = 0; i < 26; i++) {
          const cx = size / 2 + rng.range(-55, 55);
          const cy = size / 2 + rng.range(-55, 55);
          const r = rng.range(14, 70);
          const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
          const a = kind === 'water' ? 0.1 : 0.16;
          gradient.addColorStop(0, `rgba(${color},${a})`);
          gradient.addColorStop(kind === 'water' ? 0.9 : 0.6, `rgba(${color},${a * 0.8})`);
          gradient.addColorStop(1, `rgba(${color},0)`);
          ctx.fillStyle = gradient;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        }
      }
      return finish(canvas, false, 2);
    });
  }

  /** Sheets of paper: printed lines, some handwritten scrawl. */
  paper(): Texture | null {
    return this.memo('paper', () => {
      const w = 128;
      const h = 160;
      const { canvas, ctx } = makeCanvas(w, h);
      const rng = this.rng(30);
      ctx.fillStyle = '#e8e4d8';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#9a9a96';
      for (let y = 18; y < h - 10; y += 7) ctx.fillRect(10, y, rng.range(40, w - 20), 2);
      ctx.fillStyle = '#2a3a5a';
      ctx.fillRect(10, 6, 50, 5);
      return finish(canvas, false, 1);
    });
  }

  /** Radial glow for fixture halos and emergency lamps (white; tinted by material colour). */
  glow(): Texture | null {
    return this.memo('glow', () => {
      const size = 128;
      const { canvas, ctx } = makeCanvas(size, size);
      const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.18, 'rgba(255,255,255,0.45)');
      gradient.addColorStop(0.5, 'rgba(255,255,255,0.1)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      return finish(canvas, false, 1);
    });
  }

  /** Vertical fall-off used by window light shafts; slats cut the beam into bands. */
  lightShaft(slats: boolean): Texture | null {
    return this.memo(slats ? 'shaft-slats' : 'shaft', () => {
      const w = 128;
      const h = 256;
      const { canvas, ctx } = makeCanvas(w, h);
      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
      const side = ctx.createLinearGradient(0, 0, w, 0);
      side.addColorStop(0, 'rgba(0,0,0,1)');
      side.addColorStop(0.2, 'rgba(0,0,0,0)');
      side.addColorStop(0.8, 'rgba(0,0,0,0)');
      side.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = side;
      ctx.fillRect(0, 0, w, h);
      if (slats) {
        for (let y = 0; y < h; y += 16) ctx.fillRect(0, y, w, 6);
      }
      return finish(canvas, false, 1);
    });
  }

  /** Text sign rendered once and cached by its content. */
  sign(text: string, style: SignStyle, width = 512, height = 128): Texture | null {
    return this.memo(`sign:${text}:${style.background}:${style.foreground}:${style.subtext ?? ''}:${width}x${height}`, () => {
      const { canvas, ctx } = makeCanvas(width, height);
      const rng = this.rng(text.length * 13 + text.charCodeAt(0));
      ctx.fillStyle = style.background;
      ctx.fillRect(0, 0, width, height);
      if (style.border) {
        ctx.strokeStyle = style.border;
        ctx.lineWidth = Math.max(4, height * 0.05);
        ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, width - ctx.lineWidth * 2, height - ctx.lineWidth * 2);
      }
      ctx.fillStyle = style.foreground;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const mainSize = style.subtext ? height * 0.42 : height * 0.55;
      ctx.font = style.font ?? `600 ${mainSize}px "Helvetica Neue", Arial, sans-serif`;
      let fit = mainSize;
      while (ctx.measureText(text).width > width * 0.9 && fit > 8) {
        fit -= 2;
        ctx.font = `600 ${fit}px "Helvetica Neue", Arial, sans-serif`;
      }
      ctx.fillText(text, width / 2, style.subtext ? height * 0.38 : height / 2);
      if (style.subtext) {
        ctx.font = `400 ${height * 0.2}px "Helvetica Neue", Arial, sans-serif`;
        ctx.fillText(style.subtext, width / 2, height * 0.76);
      }
      const worn = style.worn ?? 0.3;
      for (let i = 0; i < 40 * worn; i++) {
        ctx.fillStyle = `rgba(30,25,20,${rng.range(0.03, 0.12)})`;
        ctx.beginPath(); ctx.arc(rng.range(0, width), rng.range(0, height), rng.range(2, 18), 0, Math.PI * 2); ctx.fill();
      }
      return finish(canvas, false, 4);
    });
  }

  /** Ward whiteboard: bed list with names crossed out — environmental story. */
  patientBoard(): Texture | null {
    return this.memo('patient-board', () => {
      const w = 1024;
      const h = 512;
      const { canvas, ctx } = makeCanvas(w, h);
      const rng = this.rng(40);
      ctx.fillStyle = '#e9ece8';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(80,90,110,0.35)';
      ctx.lineWidth = 2;
      for (let y = 90; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(w - 20, y); ctx.stroke(); }
      ctx.fillStyle = '#20304a';
      ctx.font = '700 44px "Marker Felt", "Comic Sans MS", sans-serif';
      ctx.fillText('WARD 4 WEST — NIGHT', 30, 60);
      ctx.font = '500 30px "Marker Felt", "Comic Sans MS", sans-serif';
      const rows: [string, string, string, boolean][] = [
        ['101', 'ISOLATION', 'DO NOT ENTER', false],
        ['102', 'M. ADEYEMI', 'obs 2hrly', true],
        ['103', 'R. HALE', 'sedated 22:40', true],
        ['104', '— — —', 'bed ready', false],
        ['105', 'D. & P. VOSS', 'family asked again', true],
        ['106', 'L. MORROW', 'transferred??', true],
        ['107', 'K. (no surname)', 'RESTRAINTS — 2 staff', false],
        ['108', 'E. TANAKA', 'missing from bed 03:10', true],
        ['110', 'A. QUINN', 'still on monitor', false],
      ];
      rows.forEach(([room, name, note, crossed], i) => {
        const y = 120 + i * 40;
        ctx.fillStyle = '#20304a';
        ctx.fillText(room, 40, y);
        ctx.fillStyle = crossed ? '#203048' : '#8a1d1d';
        ctx.fillText(name, 140, y);
        ctx.fillStyle = '#3c4a5c';
        ctx.fillText(note, 520, y);
        if (crossed) {
          ctx.strokeStyle = '#1a1a1a';
          ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(130, y - 10 + rng.range(-3, 3)); ctx.lineTo(470, y - 10 + rng.range(-3, 3)); ctx.stroke();
        }
      });
      ctx.fillStyle = '#8a1d1d';
      ctx.font = '700 34px "Marker Felt", "Comic Sans MS", sans-serif';
      ctx.save(); ctx.translate(820, 300); ctx.rotate(-0.12);
      ctx.fillText('DON\'T WAKE 107', -110, 0);
      ctx.restore();
      // Smudged erasures.
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = `rgba(120,130,150,${rng.range(0.05, 0.12)})`;
        ctx.fillRect(rng.range(0, w), rng.range(80, h), rng.range(60, 200), rng.range(18, 40));
      }
      return finish(canvas, false, 4);
    });
  }

  /** Cork board with pinned notices. */
  noticeBoard(): Texture | null {
    return this.memo('notice', () => {
      const w = 512;
      const h = 320;
      const { canvas, ctx } = makeCanvas(w, h);
      const rng = this.rng(41);
      const n = fbm(w, h, rng, [16, 40]);
      paint(ctx, w, h, (x, y) => {
        const v = (n(x, y) - 0.5) * 40 + (rng.next() - 0.5) * 20;
        return [clamp255(150 + v), clamp255(110 + v), clamp255(70 + v)];
      });
      const notes = ['HAND HYGIENE', 'FIRE ASSEMBLY B', 'ROTA — NOV', 'VISITING HOURS SUSPENDED', 'MISSING: HAVE YOU SEEN', 'NIGHT STAFF: LOCK 107'];
      for (const note of notes) {
        const pw = rng.range(90, 150);
        const ph = rng.range(90, 130);
        const x = rng.range(10, w - pw - 10);
        const y = rng.range(10, h - ph - 10);
        ctx.save();
        ctx.translate(x + pw / 2, y + ph / 2);
        ctx.rotate(rng.range(-0.12, 0.12));
        ctx.fillStyle = rng.pick(['#ece8da', '#f1ea9a', '#dfe9ee', '#f2d6d0']);
        ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
        ctx.fillStyle = '#2a2a30';
        ctx.font = '600 13px Arial, sans-serif';
        ctx.fillText(note, -pw / 2 + 6, -ph / 2 + 18);
        ctx.fillStyle = '#8a8a88';
        for (let l = 0; l < 5; l++) ctx.fillRect(-pw / 2 + 6, -ph / 2 + 30 + l * 12, pw - 16, 2);
        ctx.fillStyle = '#b01818';
        ctx.beginPath(); ctx.arc(0, -ph / 2 + 5, 4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      return finish(canvas, false, 2);
    });
  }

  /** A stopped analogue clock (03:17). */
  clockFace(): Texture | null {
    return this.memo('clock', () => {
      const size = 256;
      const { canvas, ctx } = makeCanvas(size, size);
      ctx.fillStyle = '#ecebe4';
      ctx.fillRect(0, 0, size, size);
      ctx.translate(size / 2, size / 2);
      ctx.fillStyle = '#1b1b1b';
      for (let i = 0; i < 60; i++) {
        ctx.save(); ctx.rotate((i / 60) * Math.PI * 2);
        ctx.fillRect(-1.5, -118, i % 5 === 0 ? 5 : 2, i % 5 === 0 ? 18 : 8);
        ctx.restore();
      }
      const hand = (angle: number, length: number, width: number, color: string): void => {
        ctx.save(); ctx.rotate(angle); ctx.fillStyle = color; ctx.fillRect(-width / 2, -length, width, length + 12); ctx.restore();
      };
      hand(((3 + 17 / 60) / 12) * Math.PI * 2, 66, 9, '#1b1b1b');
      hand((17 / 60) * Math.PI * 2, 98, 6, '#1b1b1b');
      hand((42 / 60) * Math.PI * 2, 104, 2, '#9a1b1b');
      return finish(canvas, false, 2);
    });
  }

  /** Vending machine front: faded product rows behind dirty glass. */
  vendingFront(): Texture | null {
    return this.memo('vending', () => {
      const w = 256;
      const h = 512;
      const { canvas, ctx } = makeCanvas(w, h);
      const rng = this.rng(42);
      ctx.fillStyle = '#101418';
      ctx.fillRect(0, 0, w, h);
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 5; col++) {
          if (rng.chance(0.3)) continue;
          ctx.fillStyle = rng.pick(['#a83a2c', '#2f5aa0', '#d0a030', '#3a8a50', '#c8c8c0', '#7a3a8a']);
          ctx.fillRect(14 + col * 36, 30 + row * 64, 26, 40);
        }
        ctx.fillStyle = '#5a6066';
        ctx.fillRect(8, 74 + row * 64, 190, 4);
      }
      ctx.fillStyle = '#20262c';
      ctx.fillRect(208, 0, 48, h);
      ctx.fillStyle = '#3c8a3c';
      ctx.fillRect(216, 60, 32, 18);
      ctx.fillStyle = '#0a0c0e';
      ctx.fillRect(8, h - 70, 190, 50);
      return finish(canvas, false, 1);
    });
  }

  /** Children's crayon drawing taped in a paediatric-overflow room. */
  drawing(): Texture | null {
    return this.memo('drawing', () => {
      const w = 256;
      const h = 192;
      const { canvas, ctx } = makeCanvas(w, h);
      const rng = this.rng(43);
      ctx.fillStyle = '#f1efe6';
      ctx.fillRect(0, 0, w, h);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#2f62b0';
      ctx.beginPath(); ctx.moveTo(10, 160); ctx.lineTo(246, 160); ctx.stroke();
      // Two small figures and one too-tall figure in a doorway.
      const figure = (x: number, height: number, color: string): void => {
        ctx.strokeStyle = color;
        ctx.beginPath(); ctx.arc(x, 160 - height, 10, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, 170 - height); ctx.lineTo(x, 130); ctx.lineTo(x - 10, 160); ctx.moveTo(x, 130); ctx.lineTo(x + 10, 160); ctx.stroke();
      };
      figure(50, 60, '#c0392b');
      figure(90, 55, '#27ae60');
      ctx.strokeStyle = '#111';
      ctx.strokeRect(170, 30, 50, 130);
      ctx.lineWidth = 5;
      figure(195, 125, '#111');
      ctx.fillStyle = '#111';
      ctx.font = '700 18px "Comic Sans MS", sans-serif';
      ctx.fillText('the tall nurse', 20, 30 + rng.range(0, 4));
      return finish(canvas, false, 1);
    });
  }

  dispose(): void {
    for (const texture of this.owned) texture.dispose();
    this.owned.length = 0;
    this.cache.clear();
  }
}
