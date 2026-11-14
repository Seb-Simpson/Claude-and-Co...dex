/**
 * Traversal instrumentation for the greybox. Measures only what the greybox can honestly measure:
 * distance, moving time, time per zone and space, time in optional spaces (exploring), time spent at
 * temporary progression controls, and time per walkthrough step. Future gameplay time (encounters,
 * puzzles, story beats that are placeholders here) is not measurable and is reported separately
 * from the design estimates in level.ts (`futureSeconds`).
 */
import type { GreyboxLayout } from './grid';
import { WALKTHROUGH, type ZoneId } from './level';

export interface StepRecord {
  readonly step: number;
  readonly scene: string;
  readonly reachedAt: number;
  readonly distance: number;
  readonly movingSeconds: number;
}

export interface TelemetrySnapshot {
  readonly totalSeconds: number;
  readonly movingSeconds: number;
  readonly idleSeconds: number;
  readonly crouchedSeconds: number;
  readonly exploringSeconds: number;
  readonly controlSeconds: number;
  readonly distance: number;
  readonly crouchedDistance: number;
  readonly teleports: number;
  readonly zoneSeconds: Readonly<Partial<Record<ZoneId, number>>>;
  readonly zoneDistance: Readonly<Partial<Record<ZoneId, number>>>;
  readonly spaceSeconds: Readonly<Record<string, number>>;
  readonly visited: readonly string[];
  readonly steps: readonly StepRecord[];
  readonly currentSpace: string | null;
  readonly currentZone: ZoneId | null;
}

export interface TelemetrySample {
  readonly x: number;
  readonly z: number;
  readonly crouching: boolean;
  /** Within reach of a temporary progression control that is still unused. */
  readonly atControl: boolean;
}

export interface Telemetry {
  sample(sample: TelemetrySample, dt: number): void;
  /** Mark a deliberate relocation (checkpoint teleport) so it never counts as distance. */
  teleported(): void;
  reset(): void;
  snapshot(): TelemetrySnapshot;
}

const MOVING_SPEED = 0.2;
const TELEPORT_STEP = 1.5;
const STEP_RADIUS = 1.4;

export function createTelemetry(layout: GreyboxLayout): Telemetry {
  let state = fresh();
  function fresh() {
    return {
      total: 0, moving: 0, idle: 0, crouched: 0, exploring: 0, control: 0, distance: 0, crouchedDistance: 0, teleports: 0,
      zoneSeconds: {} as Partial<Record<ZoneId, number>>, zoneDistance: {} as Partial<Record<ZoneId, number>>,
      spaceSeconds: {} as Record<string, number>, visited: new Set<string>(), steps: [] as StepRecord[],
      last: null as { x: number; z: number } | null, skip: false, space: null as string | null, zone: null as ZoneId | null,
    };
  }
  return {
    sample(sample, dt) {
      if (!(dt > 0) || !Number.isFinite(sample.x) || !Number.isFinite(sample.z)) return;
      const s = state;
      s.total += dt;
      const space = layout.spaceAt(sample.x, sample.z);
      s.space = space?.id ?? null;
      s.zone = space?.zone ?? null;
      let step = 0;
      if (s.last && !s.skip) {
        step = Math.hypot(sample.x - s.last.x, sample.z - s.last.z);
        if (step > TELEPORT_STEP) { s.teleports += 1; step = 0; }
      }
      s.skip = false;
      s.last = { x: sample.x, z: sample.z };
      const moving = step / dt > MOVING_SPEED;
      if (moving) {
        s.moving += dt;
        s.distance += step;
        if (sample.crouching) s.crouchedDistance += step;
      } else if (!sample.atControl) s.idle += dt;
      if (sample.crouching) s.crouched += dt;
      if (sample.atControl) s.control += dt;
      if (space) {
        s.visited.add(space.id);
        s.spaceSeconds[space.id] = (s.spaceSeconds[space.id] ?? 0) + dt;
        s.zoneSeconds[space.zone] = (s.zoneSeconds[space.zone] ?? 0) + dt;
        if (moving) s.zoneDistance[space.zone] = (s.zoneDistance[space.zone] ?? 0) + step;
        if (!space.required) s.exploring += dt;
      }
      const next = WALKTHROUGH[s.steps.length];
      if (next && Math.hypot(sample.x - next.x, sample.z - next.z) <= STEP_RADIUS) {
        s.steps.push({ step: next.step, scene: next.scene, reachedAt: s.total, distance: s.distance, movingSeconds: s.moving });
      }
    },
    teleported() { state.skip = true; state.teleports += 1; },
    reset() { state = fresh(); },
    snapshot() {
      const s = state;
      return {
        totalSeconds: s.total, movingSeconds: s.moving, idleSeconds: s.idle, crouchedSeconds: s.crouched,
        exploringSeconds: s.exploring, controlSeconds: s.control, distance: s.distance, crouchedDistance: s.crouchedDistance,
        teleports: s.teleports, zoneSeconds: { ...s.zoneSeconds }, zoneDistance: { ...s.zoneDistance },
        spaceSeconds: { ...s.spaceSeconds }, visited: [...s.visited], steps: [...s.steps],
        currentSpace: s.space, currentZone: s.zone,
      };
    },
  };
}
