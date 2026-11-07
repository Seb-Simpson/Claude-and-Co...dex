import { CanvasTexture, ClampToEdgeWrapping, Color, Mesh, MeshBasicMaterial, PlaneGeometry, type Camera, type Object3D, SRGBColorSpace, Vector3 } from 'three';
import type { ReflectiveSurface } from '../../world/extras';

/** Paints the figure once: a smeared head-and-shoulders silhouette with a pale, blurred face. */
function figureTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, 128, 256);
  ctx.filter = 'blur(3px)';
  ctx.fillStyle = 'rgba(46,50,52,0.92)';
  ctx.beginPath();
  ctx.ellipse(64, 62, 22, 30, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(30, 256); ctx.quadraticCurveTo(24, 120, 52, 96); ctx.lineTo(76, 96); ctx.quadraticCurveTo(104, 120, 98, 256);
  ctx.fill();
  // Long hair falling past the shoulders.
  ctx.fillRect(38, 50, 10, 110);
  ctx.fillRect(80, 50, 10, 120);
  ctx.filter = 'blur(5px)';
  const face = ctx.createRadialGradient(64, 66, 2, 64, 66, 20);
  face.addColorStop(0, 'rgba(196,198,186,0.85)');
  face.addColorStop(1, 'rgba(150,152,144,0)');
  ctx.fillStyle = face;
  ctx.beginPath(); ctx.ellipse(64, 66, 16, 22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.filter = 'blur(2px)';
  ctx.fillStyle = 'rgba(0,0,0,0.9)';
  ctx.beginPath(); ctx.ellipse(56, 62, 4, 5, 0, 0, Math.PI * 2); ctx.ellipse(72, 62, 4, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.filter = 'none';
  // Keep a transparent border so clamp-to-edge sampling outside the figure stays empty.
  ctx.clearRect(0, 0, 128, 2); ctx.clearRect(0, 254, 128, 2); ctx.clearRect(0, 0, 2, 256); ctx.clearRect(126, 0, 2, 256);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
  return texture;
}

export interface ReflectionState {
  readonly visible: boolean;
  readonly surfaceId: string | null;
  readonly opacity: number;
}

/**
 * The Reflection: visual only. It exists solely as an image inside a mirror or a pane of glass,
 * standing just behind the viewer. It has no body, no collider and never moves through the ward.
 *
 * The image is drawn on a quad that exactly covers the reflective surface; the figure is placed
 * by shifting the texture, so it is always clipped to the glass. Its position follows real mirror
 * geometry (it appears where a figure standing behind the camera would be reflected).
 */
export class ReflectionPresenter {
  private readonly texture: CanvasTexture | null;
  private readonly material: MeshBasicMaterial;
  private readonly geometry = new PlaneGeometry(1, 1);
  private readonly mesh: Mesh;
  private surface: ReflectiveSurface | null = null;
  private opacity = 0;
  private target = 0;
  private until = 0;
  private time = 0;
  private stareTime = 0;
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();

  constructor(parent: Object3D, private readonly surfaces: readonly ReflectiveSurface[], private readonly camera: Camera) {
    this.texture = figureTexture();
    this.material = new MeshBasicMaterial({
      color: this.texture ? new Color(0xffffff) : new Color(0x050607), transparent: true, opacity: 0, depthWrite: false, fog: true,
      ...(this.texture ? { map: this.texture } : {}),
    });
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.name = 'nw:reflection';
    this.mesh.visible = false;
    this.mesh.renderOrder = 4;
    parent.add(this.mesh);
  }

  get state(): ReflectionState { return { visible: this.mesh.visible && this.opacity > 0.01, surfaceId: this.surface?.id ?? null, opacity: this.opacity }; }

  /**
   * Resolve an anchor: an exact surface ID, otherwise the best surface the camera can see now
   * (in front of it, facing it, close enough to notice).
   */
  resolve(anchorId: string | null): ReflectiveSurface | null {
    const exact = anchorId ? this.surfaces.find((s) => s.id === anchorId) : undefined;
    if (exact) return exact;
    const cam = this.camera.getWorldPosition(this.tmp);
    const forward = this.camera.getWorldDirection(this.tmp2);
    let best: ReflectiveSurface | null = null;
    let bestScore = -Infinity;
    for (const s of this.surfaces) {
      const to = s.position.clone().sub(cam);
      const d = to.length();
      if (d > 9 || d < 0.6) continue;
      if (s.normal.dot(to) > -0.2) continue; // must face the camera
      const facing = to.normalize().dot(forward);
      if (facing < 0.55) continue;
      const score = facing * 2 - d * 0.15 + (s.kind === 'mirror' ? 0.6 : 0);
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  show(anchorId: string | null, durationSeconds: number): boolean {
    const surface = this.resolve(anchorId);
    if (!surface) return false;
    this.surface = surface;
    this.target = surface.kind === 'mirror' ? 0.8 : 0.5;
    this.until = this.time + Math.max(0.3, durationSeconds);
    this.stareTime = 0;
    const n = surface.normal;
    this.mesh.position.copy(surface.position).addScaledVector(n, 0.004);
    this.mesh.lookAt(this.mesh.position.clone().add(n));
    this.mesh.scale.set(surface.width, surface.height, 1);
    this.mesh.visible = true;
    return true;
  }

  hide(): void { this.target = 0; this.until = this.time; }

  update(dt: number): void {
    this.time += dt;
    if (!this.surface || !this.mesh.visible) return;
    if (this.time >= this.until) this.target = 0;
    const cam = this.camera.getWorldPosition(this.tmp);
    const s = this.surface;
    // Staring straight at it from close by makes it go (controlled visibility).
    const to = s.position.clone().sub(cam);
    const facing = to.clone().normalize().dot(this.camera.getWorldDirection(this.tmp2));
    if (facing > 0.985 && to.length() < 3) this.stareTime += dt; else this.stareTime = 0;
    if (this.stareTime > 0.5) this.target = 0;
    const rate = this.target > this.opacity ? 1.4 : 3.5;
    this.opacity += (this.target - this.opacity) * Math.min(1, dt * rate);
    this.material.opacity = this.opacity;
    if (this.opacity < 0.005 && this.target === 0) { this.mesh.visible = false; this.surface = null; return; }
    if (!this.texture) return;
    // Figure ~0.7 m behind the camera, reflected through the surface plane.
    const n = s.normal;
    const behind = cam.clone().addScaledVector(this.camera.getWorldDirection(this.tmp2), -0.7).setY(cam.y - 0.1);
    const reflected = behind.clone().addScaledVector(n, -2 * behind.clone().sub(s.position).dot(n));
    const ray = reflected.clone().sub(cam);
    const denom = ray.dot(n);
    if (Math.abs(denom) < 1e-4) return;
    const t = s.position.clone().sub(cam).dot(n) / denom;
    const hit = cam.clone().addScaledVector(ray, t);
    // Local surface axes.
    const right = new Vector3(0, 1, 0).cross(n).normalize();
    const up = n.clone().cross(right).normalize();
    const local = hit.sub(s.position);
    const u = 0.5 + local.dot(right) / s.width;
    const v = 0.5 + local.dot(up) / s.height;
    // Apparent size shrinks with the reflected distance.
    const apparent = Math.min(2.5, Math.max(0.25, 1.15 * (cam.distanceTo(s.position) / Math.max(0.5, cam.distanceTo(reflected)))));
    const figureW = apparent * 0.55;
    const figureH = apparent * 1.1;
    const rx = s.width / figureW;
    const ry = s.height / figureH;
    const drift = Math.sin(this.time * 0.7) * 0.01;
    this.texture.repeat.set(rx, ry);
    this.texture.offset.set(0.5 - (u + drift) * rx, 0.6 - v * ry);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this.texture?.dispose();
  }
}
