import { CanvasTexture, Color, type Scene, Sprite, SpriteMaterial, SRGBColorSpace } from 'three';
import type { HazeVolume } from '../world/rooms/chapter1';

/**
 * NW-004A local haze: soft sprites drifting inside the world's haze volumes. They hide the far end
 * of the main corridor, fill the stairwell and lie low along the maintenance run.
 *
 * Cost: about 30 sprites in all, depth writes off, with one shared 128 px texture. The scene fog
 * fades them with distance like everything else. They take the active lighting profile's tint and
 * density (thicker and cyan for the supernatural profile, red-lit in a chase). Without a DOM (unit
 * tests) they are not created.
 */
interface Puff { sprite: Sprite; base: { x: number; y: number; z: number }; phase: number; speed: number; opacity: number }

export class HazeField {
  private readonly puffs: Puff[] = [];
  private readonly texture: CanvasTexture | null;
  private readonly materials: SpriteMaterial[] = [];
  private readonly color = new Color();
  private readonly base = new Color(0x8c9aa2);

  constructor(private readonly scene: Scene, volumes: readonly HazeVolume[], random: () => number = Math.random) {
    this.texture = typeof document === 'undefined' ? null : makeTexture(random);
    if (!this.texture) return;
    for (const v of volumes) {
      const count = Math.min(10, 2 + Math.round((v.size.x * v.size.z) / 3));
      for (let i = 0; i < count; i++) {
        const material = new SpriteMaterial({ map: this.texture, color: this.base, transparent: true, depthWrite: false, opacity: 0, fog: true });
        this.materials.push(material);
        const sprite = new Sprite(material);
        sprite.name = `${v.id}:${i}`;
        sprite.renderOrder = 2;
        const s = 1.8 + random() * 1.8;
        sprite.scale.set(s * 1.4, s, 1);
        const base = {
          x: v.center.x + (random() - 0.5) * v.size.x,
          y: v.center.y + (random() - 0.5) * v.size.y * 0.6,
          z: v.center.z + (random() - 0.5) * v.size.z,
        };
        sprite.position.set(base.x, base.y, base.z);
        scene.add(sprite);
        this.puffs.push({ sprite, base, phase: random() * Math.PI * 2, speed: 0.05 + random() * 0.08, opacity: v.density * (0.06 + random() * 0.06) });
      }
    }
  }

  get count(): number { return this.puffs.length; }

  /** `density` multiplies the authored opacity; `tint`/`tintAmount` colour it (profile). */
  update(t: number, density: number, tint?: Color, tintAmount = 0): void {
    this.color.copy(this.base);
    if (tint && tintAmount > 0) this.color.lerp(tint, Math.min(1, tintAmount * 0.6));
    for (const p of this.puffs) {
      const a = t * p.speed + p.phase;
      p.sprite.position.set(p.base.x + Math.sin(a) * 0.6, p.base.y + Math.sin(a * 0.7) * 0.12, p.base.z + Math.cos(a * 0.8) * 0.3);
      const m = p.sprite.material;
      m.opacity = Math.min(0.35, p.opacity * density);
      m.color.copy(this.color);
      m.rotation = a * 0.2;
    }
  }

  dispose(): void {
    for (const p of this.puffs) this.scene.remove(p.sprite);
    for (const m of this.materials) m.dispose();
    this.texture?.dispose();
    this.puffs.length = 0;
  }
}

function makeTexture(random: () => number): CanvasTexture | null {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // A soft, lumpy blob: overlapping radial gradients.
  for (let i = 0; i < 14; i++) {
    const x = size / 2 + (random() - 0.5) * size * 0.45;
    const y = size / 2 + (random() - 0.5) * size * 0.3;
    const r = size * (0.18 + random() * 0.22);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
