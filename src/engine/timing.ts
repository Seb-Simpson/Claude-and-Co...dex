/** A bounded fixed-step clock. Excess time is dropped, never simulated in one jump. */
export interface FrameStep {
  deltaSeconds: number;
  elapsedSeconds: number;
  fixedSteps: readonly { deltaSeconds: number; elapsedSeconds: number }[];
}

export class FrameClock {
  private previousMilliseconds: number | null = null;
  private accumulator = 0;
  private elapsed = 0;
  private simulated = 0;

  constructor(
    readonly fixedDeltaSeconds = 1 / 60,
    readonly maxDeltaSeconds = 0.1,
    readonly maxSubsteps = 5,
  ) {
    if (!Number.isFinite(fixedDeltaSeconds) || fixedDeltaSeconds <= 0 ||
        !Number.isFinite(maxDeltaSeconds) || maxDeltaSeconds <= 0 ||
        !Number.isInteger(maxSubsteps) || maxSubsteps < 1) {
      throw new Error('Invalid frame clock configuration');
    }
  }

  /** Discard the pause gap and fractional step, while preserving elapsed simulation time. */
  reset(): void {
    this.previousMilliseconds = null;
    this.accumulator = 0;
  }

  tick(milliseconds: number): FrameStep {
    if (!Number.isFinite(milliseconds)) throw new Error('Frame timestamp must be finite');
    const deltaSeconds = this.previousMilliseconds === null ? 0 :
      Math.min(Math.max((milliseconds - this.previousMilliseconds) / 1000, 0), this.maxDeltaSeconds);
    this.previousMilliseconds = milliseconds;
    this.elapsed += deltaSeconds;
    this.accumulator += deltaSeconds;
    const fixedSteps: { deltaSeconds: number; elapsedSeconds: number }[] = [];
    while (this.accumulator + Number.EPSILON >= this.fixedDeltaSeconds && fixedSteps.length < this.maxSubsteps) {
      this.accumulator = Math.max(0, this.accumulator - this.fixedDeltaSeconds);
      this.simulated += this.fixedDeltaSeconds;
      fixedSteps.push({ deltaSeconds: this.fixedDeltaSeconds, elapsedSeconds: this.simulated });
    }
    // Bound work after a stall. Keep only the fractional remainder for the next frame.
    if (fixedSteps.length === this.maxSubsteps) this.accumulator %= this.fixedDeltaSeconds;
    return { deltaSeconds, elapsedSeconds: this.elapsed, fixedSteps };
  }
}
