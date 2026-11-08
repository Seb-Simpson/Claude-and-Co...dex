export interface PerformanceSummary {
  readonly last: number;
  readonly mean: number;
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
}

/** CPU timings cover one rendered frame, including every fixed simulation substep. */
export interface EnginePerformanceSnapshot {
  readonly sampleCount: number;
  readonly capacity: number;
  readonly totalFrames: number;
  readonly totalSubsteps: number;
  /** Unclamped RAF timestamp gaps. The first frame after a pause has no interval sample. */
  readonly frameIntervalMs: PerformanceSummary;
  readonly frameCpuMs: PerformanceSummary;
  readonly fixedMs: PerformanceSummary;
  readonly physicsMs: PerformanceSummary;
  readonly updateMs: PerformanceSummary;
  /** CPU submission time; this does not measure GPU execution time. */
  readonly renderMs: PerformanceSummary;
  readonly substeps: PerformanceSummary;
}

type Metric = Exclude<keyof EnginePerformanceSnapshot, 'sampleCount' | 'capacity' | 'totalFrames' | 'totalSubsteps'>;

/** Fixed storage with no sample allocations; percentile work runs only when inspected. */
export class FrameProfiler {
  private readonly samples: Record<Metric, Float64Array>;
  private nextIndex = 0;
  private count = 0;
  private totalFrames = 0;
  private totalSubsteps = 0;
  private previousRafMilliseconds: number | null = null;

  constructor(readonly capacity = 240) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Profiler capacity must be a positive integer');
    this.samples = {
      frameIntervalMs: new Float64Array(capacity), frameCpuMs: new Float64Array(capacity),
      fixedMs: new Float64Array(capacity), physicsMs: new Float64Array(capacity),
      updateMs: new Float64Array(capacity), renderMs: new Float64Array(capacity),
      substeps: new Float64Array(capacity),
    };
  }

  /** Exclude time spent stopped or in a background tab, while retaining current diagnostics. */
  resetInterval(): void { this.previousRafMilliseconds = null; }

  /** A newly started session must not inherit earlier session measurements. */
  clear(): void {
    this.count = 0; this.nextIndex = 0; this.totalFrames = 0; this.totalSubsteps = 0; this.resetInterval();
  }

  record(
    rafMilliseconds: number, frameCpuMs: number, fixedMs: number, physicsMs: number,
    updateMs: number, renderMs: number, substeps: number,
  ): void {
    const index = this.nextIndex;
    this.samples.frameIntervalMs[index] = this.previousRafMilliseconds === null
      ? NaN : Math.max(0, rafMilliseconds - this.previousRafMilliseconds);
    this.previousRafMilliseconds = rafMilliseconds;
    this.samples.frameCpuMs[index] = frameCpuMs;
    this.samples.fixedMs[index] = fixedMs;
    this.samples.physicsMs[index] = physicsMs;
    this.samples.updateMs[index] = updateMs;
    this.samples.renderMs[index] = renderMs;
    this.samples.substeps[index] = substeps;
    this.totalFrames += 1;
    this.totalSubsteps += substeps;
    this.nextIndex = (index + 1) % this.capacity;
    this.count = Math.min(this.capacity, this.count + 1);
  }

  private summarize(metric: Metric): PerformanceSummary {
    const samples = this.samples[metric];
    const values: number[] = [];
    let sum = 0;
    for (let index = 0; index < this.count; index++) {
      const value = samples[index]!;
      if (Number.isFinite(value)) { values.push(value); sum += value; }
    }
    const latest = samples[(this.nextIndex + this.capacity - 1) % this.capacity] ?? 0;
    if (values.length === 0) return { last: 0, mean: 0, p50: 0, p95: 0, max: 0 };
    values.sort((a, b) => a - b);
    return {
      last: Number.isFinite(latest) ? latest : 0,
      mean: sum / values.length,
      p50: values[Math.max(0, Math.ceil(values.length * 0.5) - 1)]!,
      p95: values[Math.max(0, Math.ceil(values.length * 0.95) - 1)]!,
      max: values[values.length - 1]!,
    };
  }

  snapshot(): EnginePerformanceSnapshot {
    return {
      sampleCount: this.count, capacity: this.capacity,
      totalFrames: this.totalFrames, totalSubsteps: this.totalSubsteps,
      frameIntervalMs: this.summarize('frameIntervalMs'), frameCpuMs: this.summarize('frameCpuMs'),
      fixedMs: this.summarize('fixedMs'), physicsMs: this.summarize('physicsMs'),
      updateMs: this.summarize('updateMs'), renderMs: this.summarize('renderMs'),
      substeps: this.summarize('substeps'),
    };
  }
}
