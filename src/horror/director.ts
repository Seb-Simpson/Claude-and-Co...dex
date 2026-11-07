/**
 * Chooses when and where environmental anomalies happen. Deliberately sparse: long cooldowns,
 * never the same anomaly twice running, nothing during chases, and a quiet period afterwards.
 */
export interface DirectorCandidate {
  readonly id: string;
  readonly distance: number;
  /** Cosine between the camera forward vector and the direction to the anomaly. */
  readonly facing: number;
  readonly busy: boolean;
}

export interface DirectorOptions {
  readonly firstDelay?: readonly [number, number];
  readonly cooldown?: readonly [number, number];
  readonly minDistance?: number;
  readonly maxDistance?: number;
  readonly random?: () => number;
}

export class AnomalyDirector {
  private next: number;
  private last: string | null = null;
  private suspendedUntil = 0;
  private suspended = false;
  private readonly cooldown: readonly [number, number];
  private readonly minDistance: number;
  private readonly maxDistance: number;
  private readonly random: () => number;

  constructor(options: DirectorOptions = {}) {
    this.random = options.random ?? Math.random;
    const [a, b] = options.firstDelay ?? [22, 38];
    this.next = a + this.random() * (b - a);
    this.cooldown = options.cooldown ?? [32, 80];
    this.minDistance = options.minDistance ?? 3.5;
    this.maxDistance = options.maxDistance ?? 22;
  }

  /** Pause scheduling (e.g. during a chase). */
  suspend(): void { this.suspended = true; }

  /** Resume after `quietSeconds` of enforced calm. */
  resume(now: number, quietSeconds: number): void {
    this.suspended = false;
    this.suspendedUntil = now + quietSeconds;
    this.next = Math.max(this.next, this.suspendedUntil);
  }

  get isSuspended(): boolean { return this.suspended; }

  /** Push the next ambient anomaly back after an externally requested one. */
  noteTriggered(id: string, now: number): void {
    this.last = id;
    this.next = Math.max(this.next, now + this.cooldown[0] * 0.5);
  }

  /** Returns an anomaly ID to start now, or null. */
  tick(now: number, candidates: readonly DirectorCandidate[]): string | null {
    if (this.suspended || now < this.next || now < this.suspendedUntil) return null;
    const pool = candidates.filter((c) => !c.busy && c.id !== this.last && c.distance >= this.minDistance && c.distance <= this.maxDistance);
    const [min, max] = this.cooldown;
    if (pool.length === 0) {
      this.next = now + 6;
      return null;
    }
    // Prefer anomalies at the edge of vision or just out of it, at mid range.
    const weights = pool.map((c) => {
      const range = 1 - Math.abs(c.distance - 10) / 14;
      const vision = c.facing > 0.85 ? 0.6 : c.facing > 0.2 ? 1.6 : 1.0;
      return Math.max(0.05, range) * vision;
    });
    const total = weights.reduce((sum, w) => sum + w, 0);
    let roll = this.random() * total;
    let chosen = pool[pool.length - 1]!;
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i]!;
      if (roll <= 0) { chosen = pool[i]!; break; }
    }
    this.last = chosen.id;
    this.next = now + min + this.random() * (max - min);
    return chosen.id;
  }
}
