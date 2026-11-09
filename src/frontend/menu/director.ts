/**
 * The title-screen corridor's lighting director: decides, moment to moment, how strongly each
 * light pass of the Blender corridor contributes, and announces what happened so the sound can
 * follow it (a crackle on every failure, the hum dropping out in a blackout, a swell when the
 * figure is there).
 *
 * Channels (multipliers on the light passes, see corridor.ts):
 *   main    the fluorescent hanging from its wires (mid corridor)
 *   sway    0..1 position of its swing between the two rendered extremes (moves its shadows)
 *   far     the tube at the far end
 *   exit    the exit sign and the red stair-lobby light
 *   figure  0..1 how much of the figure in the end doorway is there (only ever in the dark)
 *   ambient fill and Room 104 spill (constant)
 *
 * Nothing is a loop: sequences are drawn at random (seeded), with varied gaps, never the same kind
 * twice running. The first apparition comes early (a player should not need to wait a minute).
 *
 * Photosensitivity: every sequence keeps large light changes to at most three flashes in any one
 * second (WCAG 2.3.1); the unit tests check this over ten simulated minutes. With reduced motion,
 * there are no flashes at all: the light fades down and up, the figure fades, nothing sways.
 */
export interface LightState {
  readonly ambient: number;
  readonly main: number;
  readonly sway: number;
  readonly far: number;
  readonly exit: number;
  readonly figure: number;
}

export type CorridorEventType =
  | 'drop' // a tube cuts out (crackle)
  | 'return' // a tube strikes back on (crackle, ping)
  | 'buzz' // the ballast falters without going out (small crackle)
  | 'blackout' // the corridor goes dark (hum drops out)
  | 'figure-in'
  | 'figure-out'
  | 'exit-pulse'
  | 'door'; // a distant door; the hanging fixture swings after it

export interface CorridorEvent {
  readonly type: CorridorEventType;
  /** 0..1 */
  readonly intensity: number;
  /** Director time, seconds. */
  readonly at: number;
}

export type SequenceKind = 'strike' | 'stutter' | 'buzz' | 'blackout' | 'figure' | 'dim' | 'exit-pulse' | 'far-die' | 'door';

export interface Director {
  /** Advance by dt seconds; returns the light state for this frame. */
  update(dt: number): LightState;
  readonly state: LightState;
  readonly time: number;
  /** Run a sequence now (tests and the QA bridge). 'figure' is a blackout with the figure. */
  force(kind: SequenceKind): void;
  /** Pin channels (screenshots); `null` releases. */
  freeze(state: Partial<LightState> | null): void;
  setReducedMotion(reduced: boolean): void;
  /** Sequences started so far, oldest first (diagnostics). */
  readonly sequences: readonly { kind: SequenceKind; at: number }[];
  onEvent(listener: (event: CorridorEvent) => void): () => void;
}

export interface DirectorOptions {
  seed?: number;
  reducedMotion?: boolean;
  /** Seconds before the first figure (default 14-22 s, drawn from the seed). */
  firstFigureAt?: number;
}

/** Small, fast, seedable PRNG (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rough share of the frame's light each channel provides (used by the flash guard and tests). */
export function frameLuminance(s: LightState): number {
  return 0.03 * s.ambient + 0.78 * s.main + 0.12 * s.far + 0.07 * Math.min(2, s.exit);
}

interface Key { t: number; v: number; ramp: boolean }

/** A channel is a list of keys; between keys it holds (step) or ramps (linear). */
class Track {
  keys: Key[] = [];
  constructor(public base: number) {}
  at(t: number): number {
    const k = this.keys;
    if (k.length === 0 || t < k[0]!.t) return this.base;
    let i = k.length - 1;
    while (i > 0 && k[i]!.t > t) i--;
    const a = k[i]!;
    const b = k[i + 1];
    if (b && b.ramp) {
      const u = (t - a.t) / Math.max(1e-6, b.t - a.t);
      return a.v + (b.v - a.v) * u;
    }
    return a.v;
  }
  /** Drop keys after t and start a new shape from the current value. */
  cut(t: number): void {
    const v = this.at(t);
    this.keys = this.keys.filter((k) => k.t <= t);
    this.keys.push({ t, v, ramp: false });
  }
  step(t: number, v: number): void { this.keys.push({ t, v, ramp: false }); }
  ramp(t: number, v: number): void { this.keys.push({ t, v, ramp: true }); }
  /** Forget keys well in the past (keeps the arrays short over long sessions). */
  prune(t: number): void {
    let i = 0;
    while (i < this.keys.length - 1 && this.keys[i + 1]!.t <= t) i++;
    if (i > 0) this.keys.splice(0, i);
  }
}

const MIN_FLASH_GAP = 0.36; // seconds between the starts of two big drops (< 3 flashes/s)

export function createDirector(options: DirectorOptions = {}): Director {
  const random = seededRandom(options.seed ?? (Date.now() & 0xffffffff));
  const r = (lo: number, hi: number): number => lo + (hi - lo) * random();
  const ri = (lo: number, hi: number): number => Math.floor(r(lo, hi + 1));
  let reduced = options.reducedMotion ?? false;
  let time = 0;
  const main = new Track(1);
  const far = new Track(0.72);
  const exit = new Track(1);
  const figure = new Track(0);
  let swayAmp = 0.12;
  const swayPhase = r(0, Math.PI * 2);
  const flutterSeed = r(0, 1000);
  let busyUntil = 0;
  let nextAt = 0;
  let lastKind: SequenceKind | null = null;
  let lastBlackout = -1e9;
  let lastFigure = -1e9;
  let firstFigureAt = options.firstFigureAt ?? r(14, 22);
  let figuresShown = 0;
  let farDeadUntil = -1;
  let frozen: Partial<LightState> | null = null;
  const pending: CorridorEvent[] = [];
  const listeners = new Set<(event: CorridorEvent) => void>();
  const sequences: { kind: SequenceKind; at: number }[] = [];
  let current: LightState = { ambient: 1, main: 0, sway: 0.5, far: 0, exit: 1, figure: 0 };

  const emit = (type: CorridorEventType, at: number, intensity = 1): void => {
    pending.push({ type, at, intensity: Math.max(0, Math.min(1, intensity)) });
  };

  // ---- Sequences ------------------------------------------------------------------------------
  // Each returns the time it finishes. `t` is when it starts.

  /** A tube striking on: two or three starts, never faster than the flash limit. */
  function strike(track: Track, t: number, level: number, events: boolean): number {
    track.cut(t);
    track.step(t, 0);
    const tries = ri(1, 2);
    let at = t + r(0.12, 0.3);
    for (let i = 0; i < tries; i++) {
      track.step(at, r(0.45, 0.85) * level);
      if (events) emit('return', at, 0.6);
      track.step(at + r(0.05, 0.1), r(0, 0.12));
      at += MIN_FLASH_GAP + r(0.02, 0.25);
    }
    track.step(at, level);
    if (events) emit('return', at, 1);
    return at + 0.2;
  }

  function stutter(t: number): number {
    main.cut(t);
    const drops = ri(2, 4);
    let at = t;
    for (let i = 0; i < drops; i++) {
      const depth = r(0, 0.35);
      const length = r(0.06, 0.22);
      main.step(at, depth);
      emit('drop', at, 1 - depth);
      main.step(at + length, i === drops - 1 ? 1 : r(0.75, 1));
      at += Math.max(MIN_FLASH_GAP, length + r(0.12, 0.5));
    }
    return at;
  }

  function buzz(t: number): number {
    // Shallow, fast faltering: never deeper than 10% (not a flash), audible as crackle.
    main.cut(t);
    let at = t;
    const n = ri(4, 9);
    for (let i = 0; i < n; i++) {
      main.step(at, r(0.9, 0.96));
      main.step(at + r(0.03, 0.07), 1);
      if (i % 2 === 0) emit('buzz', at, 0.5);
      at += r(0.08, 0.2);
    }
    return at + 0.2;
  }

  function blackout(t: number, withFigure: boolean): number {
    let at = t;
    if (!reduced) {
      main.cut(at);
      // A last falter, then out.
      main.step(at, r(0.05, 0.25));
      emit('drop', at, 0.8);
      main.step(at + r(0.06, 0.14), r(0.7, 1));
      at += MIN_FLASH_GAP + r(0.05, 0.3);
      main.step(at, 0);
    } else {
      main.cut(at);
      at += 1.4;
      main.ramp(at, 0);
    }
    emit('blackout', at, 1);
    const farOut = withFigure || random() < 0.55;
    if (farOut) { far.cut(at); if (reduced) far.ramp(at + 1.2, 0); else far.step(at + r(0, 0.15), 0); }
    const hold = withFigure ? r(2.6, 3.6) : r(1.4, 3.2);
    if (withFigure) {
      const appear = at + r(0.55, 0.9);
      figure.cut(appear);
      figure.ramp(appear + (reduced ? 1.2 : 0.35), 1);
      emit('figure-in', appear, 1);
      // A slow exit-sign pulse while it stands there.
      exit.cut(appear + 0.6);
      exit.ramp(appear + (reduced ? 1.6 : 0.8), 1.35);
      exit.ramp(at + hold, 1);
      lastFigure = appear;
      figuresShown++;
    }
    at += hold;
    // The light comes back; the figure is gone the instant it does.
    let end: number;
    if (reduced) {
      if (withFigure) { figure.cut(at - 1.0); figure.ramp(at, 0); emit('figure-out', at, 0.6); }
      main.cut(at);
      main.ramp(at + 1.6, 1);
      emit('return', at, 0.4);
      if (farOut) { far.cut(at + 0.6); far.ramp(at + 2.2, 0.72); }
      end = at + 1.6;
    } else {
      end = strike(main, at, 1, true);
      if (withFigure) {
        // Gone on the first flash of returning light.
        const first = main.keys.find((k) => k.t > at && k.v > 0.3)?.t ?? at;
        figure.cut(first);
        figure.step(first, 0);
        emit('figure-out', first, 1);
      }
      if (farOut) {
        if (random() < 0.35) farDeadUntil = end + r(6, 16); // stays dead for a while
        else strike(far, end + r(0.4, 1.4), 0.72, false);
      }
      swayAmp = Math.min(0.5, swayAmp + 0.25);
    }
    lastBlackout = t;
    return end;
  }

  function dim(t: number): number {
    // The ballast weakens: the tube sinks to a sick glow and wavers.
    main.cut(t);
    let at = t + (reduced ? 1.2 : 0.15);
    main.ramp(at, r(0.3, 0.5));
    const n = ri(3, 6);
    for (let i = 0; i < n; i++) {
      at += r(0.5, 1.1);
      main.ramp(at, r(0.28, 0.55));
    }
    if (reduced) { at += 1.2; main.ramp(at, 1); return at; }
    emit('buzz', at, 0.7);
    main.step(at, 1);
    emit('return', at, 0.5);
    return at + 0.2;
  }

  function exitPulse(t: number): number {
    exit.cut(t);
    const up = reduced ? 1.0 : 0.12;
    const down = reduced ? 1.4 : 0.7;
    exit.ramp(t + up, 1.85);
    emit('exit-pulse', t, 1);
    exit.ramp(t + up + down, 1);
    if (!reduced && random() < 0.4) {
      const t2 = t + up + down + 0.15;
      exit.ramp(t2 + up, 1.5);
      exit.ramp(t2 + up + down, 1);
      return t2 + up + down;
    }
    return t + up + down;
  }

  function farDie(t: number): number {
    far.cut(t);
    if (reduced) far.ramp(t + 1.5, 0);
    else { far.step(t, 0.2); far.step(t + 0.09, 0.6); far.step(t + MIN_FLASH_GAP + 0.05, 0); }
    emit('drop', t, 0.35);
    farDeadUntil = t + r(7, 18);
    return t + 0.6;
  }

  function door(t: number): number {
    emit('door', t, 1);
    // The fixture swings a moment after the distant slam.
    if (!reduced) setTimeoutAt(t + 0.35, () => { swayAmp = Math.min(0.5, swayAmp + 0.3); });
    return t + 1.0;
  }

  const timers: { t: number; fn: () => void }[] = [];
  function setTimeoutAt(t: number, fn: () => void): void { timers.push({ t, fn }); }

  function run(kind: SequenceKind, t: number): number {
    sequences.push({ kind, at: t });
    if (sequences.length > 200) sequences.splice(0, sequences.length - 200);
    lastKind = kind;
    switch (kind) {
      case 'strike':
        if (!reduced) return strike(main, t, 1, true);
        main.cut(t);
        main.ramp(t + 2.0, 1);
        return t + 2.0;
      case 'stutter': return reduced ? dim(t) : stutter(t);
      case 'buzz': return reduced ? t : buzz(t);
      case 'blackout': return blackout(t, false);
      case 'figure': return blackout(t, true);
      case 'dim': return dim(t);
      case 'exit-pulse': return exitPulse(t);
      case 'far-die': return farDie(t);
      case 'door': return door(t);
    }
  }

  function choose(t: number): SequenceKind {
    if (figuresShown === 0 && t >= firstFigureAt) return 'figure';
    const figureReady = t - lastFigure > (reduced ? 50 : 38) && t - lastBlackout > 14;
    const weights: [SequenceKind, number][] = [
      ['stutter', reduced ? 0 : 0.26],
      ['buzz', reduced ? 0 : 0.16],
      ['dim', 0.13],
      ['blackout', t - lastBlackout > 14 ? 0.12 : 0],
      ['figure', figureReady ? 0.14 : 0],
      ['exit-pulse', 0.1],
      ['far-die', t > farDeadUntil ? 0.06 : 0],
      ['door', 0.05],
    ];
    const options = weights.filter(([k, w]) => w > 0 && k !== lastKind);
    const total = options.reduce((s, [, w]) => s + w, 0);
    let pick = random() * total;
    for (const [k, w] of options) { pick -= w; if (pick <= 0) return k; }
    return options[options.length - 1]![0];
  }

  function gap(): number { return reduced ? r(6, 15) : r(2.8, 9.5); }

  // Opening: the corridor starts dark and the tube strikes on as the title screen appears.
  main.step(0, 0);
  far.step(0, 0);
  busyUntil = run('strike', 0.25);
  if (!reduced) strike(far, 0.9, 0.72, false); else { far.cut(0); far.ramp(2.5, 0.72); }
  nextAt = busyUntil + r(2.5, 5);

  function sample(t: number): LightState {
    // Fluorescent flutter: a little unsteadiness on top of whatever the tube is doing.
    const m = main.at(t);
    const flutter = reduced ? 1 : 1 - 0.025 * (0.5 + 0.5 * Math.sin(t * 13.1 + flutterSeed) * Math.sin(t * 3.7));
    const swing = reduced ? 0.5 : 0.5 + swayAmp * Math.sin((t / 3.4) * Math.PI * 2 + swayPhase);
    return {
      ambient: 1,
      main: Math.max(0, m * flutter),
      sway: Math.max(0, Math.min(1, swing)),
      far: Math.max(0, far.at(t)),
      exit: Math.max(0, exit.at(t)),
      figure: Math.max(0, Math.min(1, figure.at(t))),
    };
  }

  const api: Director = {
    update(dt) {
      const step = Math.max(0, Math.min(0.25, dt));
      time += step;
      if (farDeadUntil > 0 && time >= farDeadUntil) {
        farDeadUntil = -1;
        if (reduced) { far.cut(time); far.ramp(time + 1.5, 0.72); } else strike(far, time, 0.72, false);
        emit('return', time, 0.3);
      }
      for (let i = timers.length - 1; i >= 0; i--) if (timers[i]!.t <= time) { const fn = timers[i]!.fn; timers.splice(i, 1); fn(); }
      if (time >= nextAt && time >= busyUntil) {
        const kind = choose(time);
        busyUntil = run(kind, time);
        nextAt = busyUntil + gap();
      }
      swayAmp = Math.max(reduced ? 0 : 0.08, swayAmp * Math.exp(-step / 22));
      current = sample(time);
      if (frozen) current = { ...current, ...frozen };
      for (const tr of [main, far, exit, figure]) tr.prune(time - 1);
      // Deliver events whose moment has come.
      if (pending.length) {
        pending.sort((a, b) => a.at - b.at);
        while (pending.length && pending[0]!.at <= time) {
          const e = pending.shift()!;
          for (const l of listeners) l(e);
        }
      }
      return current;
    },
    get state() { return current; },
    get time() { return time; },
    force(kind) {
      for (const tr of [main, far, exit, figure]) tr.cut(time);
      pending.length = 0;
      farDeadUntil = -1;
      busyUntil = run(kind, time);
      nextAt = busyUntil + gap();
    },
    freeze(state) { frozen = state; current = state ? { ...current, ...state } : current; },
    setReducedMotion(value) {
      if (value === reduced) return;
      reduced = value;
      // Settle to steady light; the next sequence follows the new preference.
      for (const tr of [main, far, exit, figure]) tr.cut(time);
      main.ramp(time + 0.8, 1); far.ramp(time + 0.8, 0.72); exit.ramp(time + 0.8, 1); figure.ramp(time + 0.4, 0);
      pending.length = 0;
      farDeadUntil = -1;
      busyUntil = time + 0.8;
      nextAt = busyUntil + gap();
      if (figuresShown === 0) firstFigureAt = Math.max(firstFigureAt, time + 6);
    },
    get sequences() { return sequences; },
    onEvent(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
  return api;
}
