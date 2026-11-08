import { Color, InstancedMesh, Matrix4, MeshBasicMaterial, type Object3D, Quaternion, Shape, ShapeGeometry, Vector3 } from 'three';

/** Bare footprint outline (metres), toes toward -Z. */
function footprintShape(): Shape {
  const s = new Shape();
  s.moveTo(0, 0.13);
  s.bezierCurveTo(0.045, 0.13, 0.05, 0.06, 0.042, 0.0);
  s.bezierCurveTo(0.036, -0.06, 0.052, -0.11, 0.03, -0.14);
  s.bezierCurveTo(0.0, -0.16, -0.04, -0.14, -0.042, -0.1);
  s.bezierCurveTo(-0.046, -0.04, -0.03, 0.02, -0.038, 0.07);
  s.bezierCurveTo(-0.042, 0.11, -0.03, 0.13, 0, 0.13);
  return s;
}

/**
 * Wet, fading footprints left where the Patient walked: a trail you can follow — or flee —
 * after it has gone. Pure decoration: positions come from presented footstep events.
 */
export class FootprintTrail {
  readonly mesh: InstancedMesh;
  private readonly material: MeshBasicMaterial;
  private readonly born: Float32Array;
  private readonly active: Uint8Array;
  private cursor = 0;
  private time = 0;
  private readonly color = new Color();
  private readonly matrix = new Matrix4();

  constructor(parent: Object3D, private readonly capacity = 48, private readonly lifetime = 28) {
    const geometry = new ShapeGeometry(footprintShape(), 6);
    geometry.rotateX(-Math.PI / 2);
    this.material = new MeshBasicMaterial({ color: 0x050708, transparent: true, depthWrite: false, opacity: 1 });
    this.material.polygonOffset = true;
    this.material.polygonOffsetFactor = -3;
    // Per-instance colour channel R carries the fade (alpha), so one draw call holds every print.
    this.material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n#ifdef USE_COLOR\n  diffuseColor.a *= vColor.r;\n  diffuseColor.rgb = vec3(0.012, 0.016, 0.02);\n#endif',
      );
    };
    this.mesh = new InstancedMesh(geometry, this.material, capacity);
    this.mesh.name = 'nw:footprints';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.born = new Float32Array(capacity);
    this.active = new Uint8Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this.mesh.setMatrixAt(i, this.matrix.makeScale(0, 0, 0));
      this.mesh.setColorAt(i, this.color.setRGB(0, 0, 0));
    }
    parent.add(this.mesh);
  }

  /** Add a print at a floor point, facing `yaw` (contract convention), mirrored for the left foot. */
  add(position: Vector3, yaw: number, left: boolean): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.born[i] = this.time;
    this.active[i] = 1;
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
    this.matrix.compose(new Vector3(position.x, 0.006, position.z), q, new Vector3(left ? -1.15 : 1.15, 1, 1.15));
    this.mesh.setMatrixAt(i, this.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  get count(): number { return this.active.reduce((sum, v) => sum + v, 0); }

  update(dt: number): void {
    this.time += dt;
    let dirty = false;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.active[i]) continue;
      const age = this.time - this.born[i]!;
      const alpha = age >= this.lifetime ? 0 : 0.55 * Math.min(1, age / 0.3) * (1 - age / this.lifetime);
      if (age >= this.lifetime) {
        this.active[i] = 0;
        this.mesh.setMatrixAt(i, this.matrix.makeScale(0, 0, 0));
        this.mesh.instanceMatrix.needsUpdate = true;
      }
      this.mesh.setColorAt(i, this.color.setRGB(alpha, alpha, alpha));
      dirty = true;
    }
    if (dirty && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}
