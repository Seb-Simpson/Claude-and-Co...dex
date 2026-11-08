import { Color, HemisphereLight, type InstancedMesh, PointLight, type Scene, Vector3 } from 'three';
import type { LightingEvent } from '../contracts';
import type { HospitalExtras, LightFixture } from '../world/extras';
import { applyOverride, fixtureBrightness, hash01, type LightOverride, seedFromId } from './flicker';

export interface LightRigOptions {
  /** Number of real PointLights reassigned to the nearest fixtures every frame. Constant to avoid shader recompiles. */
  readonly poolSize?: number;
  /** Ambient hemisphere intensity: the floor of visibility so the ward stays navigable. */
  readonly ambient?: number;
  /** Seconds between ambient lighting disturbances (min, max). */
  readonly disturbanceInterval?: readonly [number, number];
  readonly random?: () => number;
}

interface FixtureRuntime {
  readonly fixture: LightFixture;
  readonly seed: number;
  /** Ambient disturbance that killed the tube outright until `until`. */
  poppedUntil: number;
  brightness: number;
}

export type RigEvent = { readonly type: 'pop' | 'surge' | 'wave' | 'brownout'; readonly position: Vector3; readonly fixtureId?: string };

/** Pick the indices of the `count` nearest candidates (stable for equal distances). Exposed for tests. */
export function nearestIndices(distances: readonly number[], count: number): number[] {
  return distances
    .map((d, i) => [d, i] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .slice(0, count)
    .map(([, i]) => i);
}

/**
 * Drives fixture emissive panels, halos and a constant-size pool of PointLights. Many virtual
 * fixtures share a few real lights: the pool follows the camera and fades lights at the edge of
 * the selection, so swaps never pop.
 */
export class LightRig {
  readonly lights: PointLight[] = [];
  readonly ambient: HemisphereLight;
  /** Dim, short-range fill that follows the camera so nearby surfaces stay readable in darkness. */
  readonly fill: PointLight;
  private darknessLevel = 0;
  private readonly runtimes: FixtureRuntime[];
  private readonly lit: FixtureRuntime[];
  private readonly overrides = new Map<string, LightOverride>();
  private readonly dirtyMeshes = new Set<InstancedMesh>();
  private readonly tmpColor = new Color();
  private readonly random: () => number;
  private nextDisturbance: number;
  private readonly interval: readonly [number, number];
  private time = 0;
  private chaseIntensity = 0;
  private readonly listeners = new Set<(event: RigEvent) => void>();
  private disposed = false;

  constructor(private readonly scene: Scene, extras: HospitalExtras, options: LightRigOptions = {}) {
    this.random = options.random ?? Math.random;
    this.interval = options.disturbanceInterval ?? [28, 75];
    this.nextDisturbance = this.interval[0] * 0.6 + this.random() * 10;
    this.runtimes = extras.fixtures.map((fixture) => ({ fixture, seed: seedFromId(fixture.id), poppedUntil: 0, brightness: 1 }));
    this.lit = this.runtimes.filter((r) => r.fixture.intensity > 0 && r.fixture.state !== 'dead');
    const size = Math.min(options.poolSize ?? 10, Math.max(1, this.lit.length));
    for (let i = 0; i < size; i++) {
      const light = new PointLight(0xffffff, 0, 6, 2);
      light.name = `nw:light-pool:${i}`;
      this.lights.push(light);
      scene.add(light);
    }
    this.ambient = new HemisphereLight(0x50627a, 0x17130f, options.ambient ?? 0.4);
    this.ambient.name = 'nw:ambient';
    scene.add(this.ambient);
    this.fill = new PointLight(0x8aa0b8, 0.28, 3.2, 2);
    this.fill.name = 'nw:camera-fill';
    scene.add(this.fill);
  }

  on(listener: (event: RigEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: RigEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  /** Resolve a lighting event against fixture IDs and circuit names. Returns affected count. */
  apply(event: LightingEvent): number {
    const targets = this.runtimes.filter((r) => r.fixture.id === event.targetId || r.fixture.circuits.includes(event.targetId));
    for (const r of targets) {
      if (event.effect === 'restore') {
        this.overrides.delete(r.fixture.id);
        r.poppedUntil = 0;
        continue;
      }
      this.overrides.set(r.fixture.id, {
        effect: event.effect,
        start: this.time,
        end: this.time + Math.max(0.05, event.durationSeconds),
        intensity: event.intensity ?? (event.effect === 'dim' ? 0.35 : 1),
        seed: r.seed + Math.floor(this.time * 10),
      });
    }
    return targets.length;
  }

  /** Raise disturbance pressure while a chase is active (0 = calm, 1 = chase). */
  setChaseIntensity(value: number): void {
    this.chaseIntensity = Math.max(0, Math.min(1, value));
  }

  /** Brief flicker of fixtures near a point (used for scares and chase starts). */
  flickerNear(position: Vector3, radius: number, duration: number): void {
    for (const r of this.runtimes) {
      if (r.fixture.position.distanceTo(position) > radius) continue;
      this.overrides.set(r.fixture.id, { effect: 'flicker', start: this.time + this.random() * 0.2, end: this.time + duration, intensity: 1, seed: r.seed + 17 });
    }
  }

  update(deltaSeconds: number, elapsed: number, camera: Vector3): void {
    if (this.disposed) return;
    this.time = elapsed;
    this.maybeDisturb(camera);
    const emergencyBoost = 1 + this.darknessLevel * 1.3;
    const chasePulse = this.chaseIntensity > 0 ? 0.65 + 0.35 * Math.sin(elapsed * 3.4) : 1;
    let litWeight = 0;
    let totalWeight = 0;
    for (const r of this.runtimes) {
      let b = r.poppedUntil > elapsed ? 0 : fixtureBrightness(r.fixture.state, elapsed, r.seed);
      const override = this.overrides.get(r.fixture.id);
      if (override && elapsed >= override.end) this.overrides.delete(r.fixture.id);
      else b = applyOverride(b, override, elapsed);
      if (r.fixture.kind === 'emergency') b *= emergencyBoost * (this.chaseIntensity > 0 ? chasePulse : 1);
      r.brightness = b;
      this.paint(r, b);
      if (r.fixture.kind === 'fluorescent' && r.fixture.state !== 'dead') {
        const d = r.fixture.position.distanceTo(camera);
        if (d < 11) {
          const w = 1 - d / 11;
          totalWeight += w;
          litWeight += w * Math.min(1, b);
        }
      }
    }
    // How dark it has become around the camera compared with how lit it should be (0..1).
    const target = totalWeight > 0.01 ? 1 - litWeight / totalWeight : 0;
    this.darknessLevel += (target - this.darknessLevel) * Math.min(1, deltaSeconds * 2.5);
    this.fill.position.copy(camera);
    this.fill.intensity = 0.22 + this.darknessLevel * 0.18;
    for (const mesh of this.dirtyMeshes) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.dirtyMeshes.clear();
    this.assignPool(camera);
  }

  /** 0 when the mains lighting near the camera is working, 1 when it has all failed. */
  get darkness(): number { return this.darknessLevel; }

  /** Fixture IDs within `radius` of a point (optionally filtered by kind). */
  fixturesNear(position: Vector3, radius: number, kinds?: readonly LightFixture['kind'][]): string[] {
    return this.runtimes
      .filter((r) => (!kinds || kinds.includes(r.fixture.kind)) && r.fixture.position.distanceTo(position) <= radius)
      .map((r) => r.fixture.id);
  }

  private paint(r: FixtureRuntime, b: number): void {
    const f = r.fixture;
    const floor = f.state === 'dead' ? 0.05 : 0.07;
    const level = floor + (1 - floor) * Math.min(1.15, b);
    for (const panel of f.panels) {
      this.tmpColor.copy(panel.color).multiplyScalar(level);
      if (panel.type === 'instance') {
        panel.mesh.setColorAt(panel.index, this.tmpColor);
        this.dirtyMeshes.add(panel.mesh);
      } else {
        panel.material.color.copy(this.tmpColor);
      }
    }
    if (f.halo) f.halo.material.opacity = f.haloOpacity * Math.min(1, b);
  }

  private assignPool(camera: Vector3): void {
    const n = this.lights.length;
    if (n === 0) return;
    const distances = this.lit.map((r) => r.fixture.position.distanceTo(camera));
    const order = nearestIndices(distances, n + 1);
    const cutoff = order.length > n ? distances[order[n]!]! : Infinity;
    for (let i = 0; i < n; i++) {
      const light = this.lights[i]!;
      const index = order[i];
      if (index === undefined) { light.intensity = 0; continue; }
      const r = this.lit[index]!;
      const d = distances[index]!;
      const edgeFade = Number.isFinite(cutoff) ? Math.min(1, Math.max(0, (cutoff - d) / 2.5)) : 1;
      light.position.copy(r.fixture.position);
      light.color.setHex(r.fixture.color);
      light.distance = r.fixture.distance;
      light.intensity = r.fixture.intensity * r.brightness * edgeFade;
    }
  }

  /** Ambient disturbances: rare, varied, and always recoverable. */
  private maybeDisturb(camera: Vector3): void {
    if (this.time < this.nextDisturbance) return;
    const [min, max] = this.interval;
    const pressure = 1 - this.chaseIntensity * 0.6;
    this.nextDisturbance = this.time + (min + this.random() * (max - min)) * pressure;
    const nearby = this.runtimes
      .filter((r) => r.fixture.kind === 'fluorescent' && r.fixture.state !== 'dead' && r.poppedUntil <= this.time)
      .map((r) => ({ r, d: r.fixture.position.distanceTo(camera) }))
      .filter((e) => e.d < 22)
      .sort((a, b) => a.d - b.d);
    if (nearby.length === 0) return;
    const roll = this.random();
    if (roll < 0.35) {
      // Wave: tubes die one after another moving away from the camera, then return in reverse.
      const wave = nearby.filter((e) => e.d > 3).slice(0, 5);
      wave.forEach((e, i) => {
        const start = this.time + i * 0.35;
        const hold = 2.2 + this.random() * 2.0;
        this.overrides.set(e.r.fixture.id, { effect: 'blackout', start, end: start + hold + (wave.length - i) * 0.35, intensity: 0, seed: e.r.seed });
      });
      if (wave[0]) this.emit({ type: 'wave', position: wave[0].r.fixture.position.clone() });
    } else if (roll < 0.6) {
      // Surge and pop: one tube flares, then dies for a while.
      const pick = nearby[Math.min(nearby.length - 1, 1 + Math.floor(this.random() * Math.min(4, nearby.length - 1)))]!;
      this.overrides.set(pick.r.fixture.id, { effect: 'dim', start: this.time, end: this.time + 0.35, intensity: 1.35, seed: pick.r.seed });
      pick.r.poppedUntil = this.time + 0.35 + 18 + this.random() * 25;
      this.emit({ type: 'pop', position: pick.r.fixture.position.clone(), fixtureId: pick.r.fixture.id });
    } else if (roll < 0.8) {
      // Brownout: everything sags for a few seconds.
      const duration = 2.5 + this.random() * 2;
      for (const r of this.runtimes) {
        if (r.fixture.kind === 'moon') continue;
        this.overrides.set(r.fixture.id, { effect: 'dim', start: this.time, end: this.time + duration, intensity: 0.3 + this.random() * 0.1, seed: r.seed });
      }
      this.emit({ type: 'brownout', position: camera.clone() });
    } else {
      // A burst of flicker in the tube nearest the camera.
      const pick = nearby[0]!;
      this.overrides.set(pick.r.fixture.id, { effect: 'flicker', start: this.time, end: this.time + 1.2 + this.random() * 1.6, intensity: 1, seed: pick.r.seed + 3 });
      this.emit({ type: 'surge', position: pick.r.fixture.position.clone(), fixtureId: pick.r.fixture.id });
    }
  }

  /** Current brightness of a fixture (for audio buzz modulation). */
  brightnessOf(fixtureId: string): number {
    return this.runtimes.find((r) => r.fixture.id === fixtureId)?.brightness ?? 0;
  }

  /** Nearest fixture that would audibly buzz (flickering/buzzing tubes), within range. */
  nearestBuzzing(camera: Vector3, range = 9): { fixture: LightFixture; brightness: number } | null {
    let best: FixtureRuntime | null = null;
    let bestD = range;
    for (const r of this.runtimes) {
      if (r.fixture.kind !== 'fluorescent' && r.fixture.kind !== 'vending') continue;
      if (r.fixture.state === 'dead' || r.fixture.state === 'steady') continue;
      const d = r.fixture.position.distanceTo(camera);
      if (d < bestD) { best = r; bestD = d; }
    }
    return best ? { fixture: best.fixture, brightness: best.brightness } : null;
  }

  /** Deterministic hash exposed for consistent per-fixture choices elsewhere. */
  static hash(a: number, b: number): number { return hash01(a, b); }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const light of this.lights) { this.scene.remove(light); light.dispose(); }
    this.scene.remove(this.ambient);
    this.ambient.dispose();
    this.scene.remove(this.fill);
    this.fill.dispose();
    this.listeners.clear();
    this.overrides.clear();
  }
}
