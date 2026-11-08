import { AnimationMixer, type AnimationAction, type Camera, Group, LoopOnce, LoopRepeat, type Material, type Mesh, type Object3D, Vector3 } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { ReflectiveSurface } from '../../../world/extras';
import type { LoadedModel } from './library';
import { disposeSkeletons } from './modelVisual';

interface MirrorUniforms {
  nwMirrorCenter: { value: Vector3 };
  nwMirrorRight: { value: Vector3 };
  nwMirrorUp: { value: Vector3 };
  nwMirrorNormal: { value: Vector3 };
  nwMirrorHalf: { value: Vector3 };
}

/**
 * The Reflection as a real 3D figure that exists only in glass.
 *
 * It stands in the mirror world on the sight line through the glass, facing the viewer and
 * mirror-flipped, so as the camera moves it shifts with parallax and stays mirror-reversed,
 * as a reflected figure would. A fragment-shader test keeps only the parts seen *through* the
 * mirror rectangle, and the depth buffer is cleared right before it draws so the wall the mirror
 * hangs on does not hide it. It has no collider and never moves through the ward.
 */
export class ReflectionModelPresenter {
  private readonly root = new Group();
  private readonly figure: Object3D;
  private readonly materials: Material[] = [];
  private readonly mixer: AnimationMixer;
  private readonly idle: AnimationAction | null;
  private readonly notice: AnimationAction | null;
  private readonly uniforms: MirrorUniforms = {
    nwMirrorCenter: { value: new Vector3() }, nwMirrorRight: { value: new Vector3(1, 0, 0) }, nwMirrorUp: { value: new Vector3(0, 1, 0) },
    nwMirrorNormal: { value: new Vector3(0, 0, 1) }, nwMirrorHalf: { value: new Vector3(0.2, 0.3, 0) },
  };
  private surface: ReflectiveSurface | null = null;
  private opacity = 0;
  private target = 0;
  private until = 0;
  private time = 0;
  private stareTime = 0;
  private readonly cam = new Vector3();
  private readonly dir = new Vector3();

  constructor(
    parent: Object3D,
    private readonly surfaces: readonly ReflectiveSurface[],
    private readonly camera: Camera,
    model: LoadedModel,
    /** Returns true when nothing solid blocks the line between two points. */
    private readonly lineOfSight: (from: Vector3, to: Vector3) => boolean = () => true,
  ) {
    this.root.name = 'nw:reflection-model';
    this.figure = cloneSkinned(model.scene);
    this.root.add(this.figure);
    this.root.visible = false;
    const u = this.uniforms;
    this.figure.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const material = (Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material).clone();
      material.transparent = true;
      material.opacity = 0;
      material.depthWrite = true;
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, u);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vNwWorld;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvNwWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vNwWorld;\nuniform vec3 nwMirrorCenter;\nuniform vec3 nwMirrorRight;\nuniform vec3 nwMirrorUp;\nuniform vec3 nwMirrorNormal;\nuniform vec3 nwMirrorHalf;')
          .replace('void main() {', `void main() {
  vec3 nwRay = vNwWorld - cameraPosition;
  float nwDen = dot(nwRay, nwMirrorNormal);
  if (abs(nwDen) < 1e-5) discard;
  float nwT = dot(nwMirrorCenter - cameraPosition, nwMirrorNormal) / nwDen;
  if (nwT <= 0.0 || nwT >= 1.0) discard;
  vec3 nwHit = cameraPosition + nwRay * nwT - nwMirrorCenter;
  if (abs(dot(nwHit, nwMirrorRight)) > nwMirrorHalf.x || abs(dot(nwHit, nwMirrorUp)) > nwMirrorHalf.y) discard;`);
      };
      material.customProgramCacheKey = () => 'nw-reflection-mirror';
      mesh.material = material;
      mesh.frustumCulled = false;
      mesh.renderOrder = 100000;
      // Ignore the wall behind the glass: clear depth just before the figure draws (it is last).
      // clear() does not touch the depth write mask, which an earlier depthWrite:false draw may
      // have left off — enable it first or the clear is silently skipped.
      mesh.onBeforeRender = (renderer) => { renderer.state.buffers.depth.setMask(true); renderer.clearDepth(); };
      this.materials.push(material);
    });
    this.mixer = new AnimationMixer(this.figure);
    const idleClip = model.clips.get('idle');
    const noticeClip = model.clips.get('notice');
    this.idle = idleClip ? this.mixer.clipAction(idleClip).setLoop(LoopRepeat, Infinity) : null;
    this.notice = noticeClip ? this.mixer.clipAction(noticeClip).setLoop(LoopOnce, 1) : null;
    if (this.notice) this.notice.clampWhenFinished = true;
    this.idle?.play();
    parent.add(this.root);
  }

  get state(): { visible: boolean; surfaceId: string | null; opacity: number } {
    return { visible: this.root.visible && this.opacity > 0.01, surfaceId: this.surface?.id ?? null, opacity: this.opacity };
  }

  /** Exact surface ID, else the best mirror/glass the camera can currently see. */
  resolve(anchorId: string | null): ReflectiveSurface | null {
    const exact = anchorId ? this.surfaces.find((s) => s.id === anchorId) : undefined;
    if (exact) return exact;
    this.camera.getWorldPosition(this.cam);
    this.camera.getWorldDirection(this.dir);
    let best: ReflectiveSurface | null = null;
    let bestScore = -Infinity;
    for (const s of this.surfaces) {
      const to = s.position.clone().sub(this.cam);
      const d = to.length();
      if (d > 9 || d < 0.6 || s.normal.dot(to) > -0.2) continue;
      const facing = to.normalize().dot(this.dir);
      if (facing < 0.55 || !this.lineOfSight(this.cam, s.position)) continue;
      const score = facing * 2 - d * 0.15 + (s.kind === 'mirror' ? 0.6 : 0);
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  show(anchorId: string | null, durationSeconds: number): boolean {
    const surface = this.resolve(anchorId);
    if (!surface) return false;
    this.surface = surface;
    this.target = surface.kind === 'mirror' ? 0.92 : 0.6;
    this.until = this.time + Math.max(0.3, durationSeconds);
    this.stareTime = 0;
    const right = new Vector3(0, 1, 0).cross(surface.normal).normalize();
    this.uniforms.nwMirrorCenter.value.copy(surface.position);
    this.uniforms.nwMirrorNormal.value.copy(surface.normal);
    this.uniforms.nwMirrorRight.value.copy(right);
    this.uniforms.nwMirrorUp.value.copy(surface.normal.clone().cross(right).normalize());
    this.uniforms.nwMirrorHalf.value.set(surface.width / 2, surface.height / 2, 0);
    if (this.notice && this.idle) {
      this.notice.reset().play();
      this.notice.crossFadeFrom(this.idle, 0.6, false);
      this.mixer.addEventListener('finished', this.backToIdle);
    }
    this.root.visible = true;
    this.place();
    return true;
  }

  private readonly backToIdle = (): void => {
    this.mixer.removeEventListener('finished', this.backToIdle);
    if (this.idle && this.notice) { this.idle.reset().play(); this.idle.crossFadeFrom(this.notice, 1.2, false); }
  };

  hide(): void { this.target = 0; this.until = this.time; }

  /**
   * Stand inside the mirror world on the sight line through the glass, 0.8 m past it: its real
   * counterpart is a figure standing in the room behind/beside the viewer. Faces the viewer.
   */
  private place(): void {
    const s = this.surface;
    if (!s) return;
    this.camera.getWorldPosition(this.cam);
    const camFloor = this.cam.clone().setY(0);
    const through = s.position.clone().setY(0).sub(camFloor);
    const reach = through.length();
    if (reach < 1e-4) through.copy(s.normal).negate(); else through.divideScalar(reach);
    const image = camFloor.clone().addScaledVector(through, reach + 0.8);
    // Keep it behind the glass even at grazing angles.
    const depth = image.clone().sub(s.position.clone().setY(0)).dot(s.normal);
    if (depth > -0.5) image.addScaledVector(s.normal, -0.5 - depth);
    this.root.position.copy(image);
    // Object3D.lookAt aims +Z; the model faces -Z, so aim +Z away from the viewer. Then mirror-flip.
    this.root.lookAt(image.clone().multiplyScalar(2).sub(camFloor));
    this.root.scale.set(-1, 1, 1);
  }

  update(dt: number): void {
    this.time += dt;
    if (!this.surface || !this.root.visible) return;
    if (this.time >= this.until) this.target = 0;
    this.camera.getWorldPosition(this.cam);
    this.camera.getWorldDirection(this.dir);
    const to = this.surface.position.clone().sub(this.cam);
    if (to.clone().normalize().dot(this.dir) > 0.985 && to.length() < 3) this.stareTime += dt; else this.stareTime = 0;
    if (this.stareTime > 0.6 || !this.lineOfSight(this.cam, this.surface.position)) this.target = 0;
    const rate = this.target > this.opacity ? 1.2 : 4;
    this.opacity += (this.target - this.opacity) * Math.min(1, dt * rate);
    for (const m of this.materials) m.opacity = this.opacity;
    this.place();
    this.mixer.update(dt);
    if (this.opacity < 0.005 && this.target === 0) { this.root.visible = false; this.surface = null; }
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.figure);
    for (const m of this.materials) m.dispose();
    disposeSkeletons(this.figure);
    this.root.removeFromParent();
  }
}
