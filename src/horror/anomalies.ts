import type { BufferAttribute, Vector3 } from 'three';
import type { AnomalyTarget } from '../world/extras';

/** A cue the anomaly wants played; the module forwards these as `atmosphere:sound` events. */
export interface CueRequest { readonly cueId: string; readonly position: Vector3; readonly volume: number }

/**
 * Runtime behaviour for one anomaly target. `start()` begins the disturbance; `update()` animates
 * it (and any idle behaviour, such as a live ECG trace) and reports whether it is still active.
 */
export interface AnomalyRuntime {
  readonly target: AnomalyTarget;
  readonly active: boolean;
  start(now: number): CueRequest[];
  update(now: number, dt: number, distanceToCamera: number): CueRequest[];
  reset(): void;
}

const ease = (t: number): number => t * t * (3 - 2 * t);
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

function curtain(target: Extract<AnomalyTarget, { kind: 'curtain' }>): AnomalyRuntime {
  let start = -Infinity;
  let duration = 0;
  let amplitude = 0;
  let settled = true;
  const position = target.mesh.geometry.getAttribute('position') as BufferAttribute;
  const width = (() => {
    let max = 0;
    for (let i = 0; i < target.rest.length; i += 3) max = Math.max(max, target.rest[i]!);
    return max;
  })();
  return {
    target,
    get active() { return amplitude > 0.001; },
    start(now) {
      start = now;
      duration = 4 + Math.random() * 3;
      return [{ cueId: 'nw:curtain', position: target.position, volume: 0.6 }];
    },
    update(now) {
      const t = (now - start) / duration;
      const env = t >= 0 && t <= 1 ? Math.sin(Math.PI * clamp01(t)) : 0;
      amplitude += (env - amplitude) * 0.08;
      if (amplitude < 0.001) {
        if (!settled) { position.array.set(target.rest); position.needsUpdate = true; target.mesh.geometry.computeVertexNormals(); settled = true; }
        amplitude = 0;
        return [];
      }
      settled = false;
      // Something brushes past behind the fabric: a travelling bulge plus a slow billow.
      const bulgeCenter = width * clamp01(t * 1.3 - 0.15);
      for (let i = 0; i < position.count; i++) {
        const rx = target.rest[i * 3]!;
        const ry = target.rest[i * 3 + 1]!;
        const rz = target.rest[i * 3 + 2]!;
        const hang = clamp01(-ry / target.height) ** 1.4;
        const bulge = Math.exp(-((rx - bulgeCenter) ** 2) / 0.12) * 0.22 * clamp01(1 - Math.abs(-ry / target.height - 0.55) * 1.6);
        const billow = Math.sin(rx * 5 + now * 2.1) * 0.05 * hang;
        position.setZ(i, rz + amplitude * (bulge + billow));
        position.setX(i, rx + amplitude * Math.sin(now * 1.3 + rx) * 0.03 * hang);
      }
      position.needsUpdate = true;
      target.mesh.geometry.computeVertexNormals();
      return [];
    },
    reset() { amplitude = 0; start = -Infinity; position.array.set(target.rest); position.needsUpdate = true; },
  };
}

function screen(target: Extract<AnomalyTarget, { kind: 'screen' }>): AnomalyRuntime {
  let start = -Infinity;
  let duration = 0;
  let lastDraw = -Infinity;
  let lastBeat = 0;
  let flatlineCued = false;
  const tv = target.mode === 'tv';
  const baseColor = target.material.color.clone();
  return {
    target,
    get active() { return Number.isFinite(start); },
    start(now) {
      start = now;
      flatlineCued = false;
      duration = tv ? 3 + Math.random() * 3 : 6;
      return tv ? [{ cueId: 'nw:static', position: target.position, volume: 0.55 }] : [];
    },
    update(now, _dt, distance) {
      const cues: CueRequest[] = [];
      const t = now - start;
      const running = t >= 0 && t <= duration;
      if (tv) {
        target.material.color.setScalar(running ? 0.65 + Math.random() * 0.35 : 0.02);
        if (running && target.redraw && now - lastDraw > 1 / 12) {
          target.redraw(now, t > duration - 0.6 || Math.random() < 0.08 ? 'glitch' : 'static');
          lastDraw = now;
        } else if (!running && lastDraw > start && target.redraw) {
          target.redraw(now, 'off');
          lastDraw = -Infinity;
          start = -Infinity;
        }
        return cues;
      }
      // ECG: always alive when near; an anomaly glitches then flatlines it before it recovers.
      if (!running && Number.isFinite(start) && t > duration) start = -Infinity;
      if (distance > 16) return cues;
      let state: 'normal' | 'glitch' | 'flatline' = 'normal';
      if (running) state = t < 1.6 ? 'glitch' : t < 4.4 ? 'flatline' : 'normal';
      if (running && state === 'flatline' && !flatlineCued) {
        flatlineCued = true;
        cues.push({ cueId: 'nw:flatline', position: target.position, volume: 0.5 });
      }
      target.material.color.copy(baseColor);
      if (target.redraw && now - lastDraw > 1 / 14) {
        target.redraw(now, state);
        lastDraw = now;
      }
      if (state === 'normal' && distance < 4.5 && now - lastBeat > 1.03) {
        lastBeat = now;
        cues.push({ cueId: 'nw:monitor-beep', position: target.position, volume: 0.3 });
      }
      return cues;
    },
    reset() { start = -Infinity; target.material.color.copy(baseColor); },
  };
}

function lift(target: Extract<AnomalyTarget, { kind: 'lift' }>): AnomalyRuntime {
  let start = -Infinity;
  let hold = 0;
  let cuedClose = false;
  const leftBase = target.left.position.clone();
  const rightBase = target.right.position.clone();
  const travel = 1.6;
  const set = (open: number): void => {
    const o = ease(clamp01(open)) * target.travel;
    target.left.position.copy(leftBase);
    target.right.position.copy(rightBase);
    target.left.position[target.axis] -= o;
    target.right.position[target.axis] += o;
  };
  return {
    target,
    get active() { return Number.isFinite(start); },
    start(now) {
      start = now;
      hold = 3 + Math.random() * 2.5;
      cuedClose = false;
      return [
        { cueId: 'nw:lift-chime', position: target.position, volume: 0.55 },
        { cueId: 'nw:lift-doors', position: target.position, volume: 0.6 },
      ];
    },
    update(now) {
      if (!Number.isFinite(start)) return [];
      const t = now - start - 0.6;
      const cues: CueRequest[] = [];
      if (t < 0) set(0);
      else if (t < travel) set(t / travel);
      else if (t < travel + hold) set(1);
      else if (t < travel * 2 + hold) {
        if (!cuedClose) { cuedClose = true; cues.push({ cueId: 'nw:lift-doors', position: target.position, volume: 0.55 }); }
        set(1 - (t - travel - hold) / travel);
      } else {
        set(0);
        start = -Infinity;
      }
      return cues;
    },
    reset() { start = -Infinity; set(0); },
  };
}

function sway(target: Extract<AnomalyTarget, { kind: 'sway' }>): AnomalyRuntime {
  let start = -Infinity;
  const duration = 6;
  return {
    target,
    get active() { return Number.isFinite(start); },
    start(now) {
      start = now;
      return [{ cueId: 'nw:metal-creak', position: target.position, volume: 0.25 }];
    },
    update(now) {
      // Idle: an almost imperceptible drift so it never looks frozen.
      const idle = Math.sin(now * 0.7) * 0.012;
      let swing = 0;
      if (Number.isFinite(start)) {
        const t = now - start;
        if (t > duration) start = -Infinity;
        else swing = Math.sin(t * 2.6) * target.amplitude * Math.exp(-t * 0.45);
      }
      target.object.rotation.x = idle + swing;
      target.object.rotation.z = swing * 0.4;
      return [];
    },
    reset() { start = -Infinity; target.object.rotation.set(0, 0, 0); },
  };
}

function creep(target: Extract<AnomalyTarget, { kind: 'creep' }>): AnomalyRuntime {
  let start = -Infinity;
  let from = target.object.rotation.y;
  let to = from;
  const base = from;
  const duration = 3.2;
  return {
    target,
    get active() { return Number.isFinite(start); },
    start(now) {
      start = now;
      from = target.object.rotation.y;
      // Alternate: drift away from rest, next time drift back. Changes are meant to be noticed later.
      to = Math.abs(from - base) < 1e-3 ? base + target.amplitude * (Math.random() < 0.5 ? -1 : 1) : base;
      return [{ cueId: 'nw:wheel-creak', position: target.position, volume: 0.4 }];
    },
    update(now) {
      if (!Number.isFinite(start)) return [];
      const t = clamp01((now - start) / duration);
      target.object.rotation.y = from + (to - from) * ease(t);
      if (t >= 1) start = -Infinity;
      return [];
    },
    reset() { start = -Infinity; target.object.rotation.y = base; },
  };
}

export function createAnomaly(target: AnomalyTarget): AnomalyRuntime {
  switch (target.kind) {
    case 'curtain': return curtain(target);
    case 'screen': return screen(target);
    case 'lift': return lift(target);
    case 'sway': return sway(target);
    case 'creep': return creep(target);
  }
}
