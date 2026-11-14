/**
 * NW-R03 — Voice director: the one place character lines are requested from. It sits on top of
 * the existing single-channel DialoguePlayer (no competing audio manager) and adds:
 *
 * - line variants chosen by Shaw's story stage;
 * - duplicate-event protection (event keys; one-time lines remembered in Chapter 1 state);
 * - priority and interruption rules (a higher-priority interrupting line stops a lower one; others
 *   queue, one deep);
 * - presentation chains (positional HRTF, intercom, telephone) ending on the `voice` bus;
 * - ducking of music and effects while a voice plays;
 * - subtitles with speaker, an optional direction caption, and a visible label for any recording
 *   that isn't approved ("temp voice", "subtitle only").
 */
import { createBufferedDialogueVoiceAdapter, createDialoguePlayer, type DialogueCue, type DialoguePlayback, type DialoguePlayer, type DialoguePlayerOptions, type DialogueVoice } from '../gameplay/chapter/dialogue';
import { audioOutput, duckBuses } from './mixer';

export type VoicePresentation = 'direct' | 'positional' | 'intercom' | 'telephone';

export interface VoiceVariant {
  /** Shaw stages this variant serves; omitted = any stage. First match wins. */
  readonly stages?: readonly string[];
  readonly cue: DialogueCue;
}

export interface VoiceLineDef {
  readonly id: string;
  /** 0 (ambient bark) … 10 (story-critical). */
  readonly priority: number;
  /** May stop a lower-priority line that is playing. */
  readonly interrupts: boolean;
  /** Plays at most once per chapter (remembered through checkpoints). */
  readonly once: boolean;
  readonly presentation: VoicePresentation;
  readonly variants: readonly VoiceVariant[];
}

export interface VoiceRequest {
  readonly lineId: string;
  readonly stage: string;
  /** Source position for positional lines (and direction captions). */
  readonly position?: { readonly x: number; readonly y: number; readonly z: number };
  /** Event identity: a second request with the same key is ignored (duplicate events). */
  readonly key?: string;
}

export type VoiceRequestOutcome = 'played' | 'queued' | 'duplicate' | 'already-played' | 'no-variant' | 'dropped' | 'unknown-line' | 'refused';

export interface VoiceListener {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  /** Horizontal forward direction (unit). */
  readonly forward: { readonly x: number; readonly z: number };
}

export interface VoiceDirectorOptions {
  readonly lines: readonly VoiceLineDef[];
  readonly mode: 'production' | 'preview';
  /** Subtitle sink (e.g. `emitSubtitle`). Receives null to clear. */
  readonly subtitle: (line: { speaker: string; text: string } | null) => void;
  /** Lines already played (one-time) from saved state. */
  readonly alreadyPlayed?: Iterable<string>;
  /** Called when a one-time line starts, so the host can persist it. */
  readonly onOnceLinePlayed?: (lineId: string) => void;
  readonly directionalCaptions?: () => boolean;
  /** Web Audio, when available. Without it lines are subtitle-only. */
  readonly audio?: {
    readonly context: () => AudioContext | null;
    readonly recordings: ReadonlyMap<string, AudioBuffer>;
  };
  /** Test seam. */
  readonly createPlayer?: (options: DialoguePlayerOptions) => DialoguePlayer;
}

export interface VoiceDirector {
  request(request: VoiceRequest): VoiceRequestOutcome;
  /** Host frame update: advances subtitles and the listener. */
  update(deltaSeconds: number, listener?: VoiceListener): void;
  readonly activeLineId: string | null;
  readonly queuedLineId: string | null;
  stop(reason?: string): void;
  dispose(): void;
}

/** "ahead" | "behind" | "left" | "right" relative to the listener's facing. */
export function directionWord(listener: VoiceListener, source: { x: number; z: number }): 'ahead' | 'behind' | 'left' | 'right' | 'close' {
  const dx = source.x - listener.position.x, dz = source.z - listener.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 1) return 'close';
  const forward = (dx * listener.forward.x + dz * listener.forward.z) / distance;
  const side = (dx * -listener.forward.z + dz * listener.forward.x) / distance;
  if (forward > 0.7) return 'ahead';
  if (forward < -0.7) return 'behind';
  return side > 0 ? 'right' : 'left';
}

export function recordingLabel(cue: DialogueCue): string {
  switch (cue.recordingStatus) {
    case 'approved': return '';
    case 'recorded': return ' (unapproved recording)';
    case 'temporary': return ' (temp voice)';
    default: return ' (subtitle only)';
  }
}

interface Pending { readonly def: VoiceLineDef; readonly cue: DialogueCue; readonly request: VoiceRequest }

export function createVoiceDirector(options: VoiceDirectorOptions): VoiceDirector {
  const lines = new Map(options.lines.map((line) => [line.id, line]));
  const played = new Set(options.alreadyPlayed ?? []);
  const keys = new Set<string>();
  let listener: VoiceListener | null = null;
  let active: { readonly pending: Pending; readonly playback: DialoguePlayback; readonly release: () => void } | null = null;
  let queued: Pending | null = null;
  let current: Pending | null = null;
  let chain: AudioNode[] = [];
  let disposed = false;

  const caption = (pending: Pending): string => {
    const where = pending.def.presentation === 'intercom' ? 'intercom' : pending.def.presentation === 'telephone' ? 'telephone' : null;
    if (where) return `[${where}] `;
    if (options.directionalCaptions?.() && listener && pending.request.position) return `[${directionWord(listener, pending.request.position)}] `;
    return '';
  };

  function buildChain(context: AudioContext, pending: Pending): AudioNode {
    const output = audioOutput(context, 'voice');
    const nodes: AudioNode[] = [];
    const filter = (type: BiquadFilterType, frequency: number): BiquadFilterNode => {
      const node = context.createBiquadFilter(); node.type = type; node.frequency.value = frequency; node.Q.value = 0.7; nodes.push(node); return node;
    };
    let head: AudioNode;
    switch (pending.def.presentation) {
      case 'intercom': {
        const hp = filter('highpass', 320), lp = filter('lowpass', 3200);
        const drive = context.createWaveShaper(); nodes.push(drive);
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i += 1) { const x = (i / 255) * 2 - 1; curve[i] = Math.tanh(1.6 * x) / Math.tanh(1.6); }
        drive.curve = curve;
        hp.connect(lp).connect(drive).connect(output);
        head = hp;
        break;
      }
      case 'telephone': {
        const hp = filter('highpass', 300), lp = filter('lowpass', 3400);
        hp.connect(lp).connect(output);
        head = hp;
        break;
      }
      case 'positional': {
        const panner = context.createPanner(); nodes.push(panner);
        panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse';
        panner.refDistance = 1.5; panner.maxDistance = 25; panner.rolloffFactor = 1;
        const p = pending.request.position ?? listener?.position ?? { x: 0, y: 1.6, z: 0 };
        panner.positionX.value = p.x; panner.positionY.value = p.y; panner.positionZ.value = p.z;
        panner.connect(output);
        head = panner;
        break;
      }
      default:
        head = output;
    }
    chain = nodes;
    return head;
  }
  function releaseChain(): void {
    for (const node of chain) { try { node.disconnect(); } catch { /* already disconnected */ } }
    chain = [];
  }

  const playerOptions: DialoguePlayerOptions = {
    mode: options.mode,
    subtitle: (line) => {
      if (!line || !current) { options.subtitle(null); return; }
      options.subtitle({ speaker: `${line.speaker}${recordingLabel(current.cue)}`, text: `${caption(current)}${line.text}` });
    },
    ...(options.audio ? {
      playVoice: (cue: DialogueCue): DialogueVoice => {
        const context = options.audio!.context();
        if (!context || context.state !== 'running' || !current) throw new Error('Voice audio is not available');
        const adapter = createBufferedDialogueVoiceAdapter(context, options.audio!.recordings, () => buildChain(context, current!));
        return adapter(cue);
      },
      duck: () => {
        const context = options.audio!.context();
        return context ? duckBuses(context, { music: -8, sfx: -4 }) : () => undefined;
      },
    } : {}),
  };
  const player = (options.createPlayer ?? createDialoguePlayer)(playerOptions);

  function start(pending: Pending): void {
    current = pending;
    let cue = pending.cue;
    // A recording that can't play here (no audio, not decoded) degrades to subtitle-only rather
    // than throwing: the line still happens.
    const context = options.audio?.context();
    const decoded = cue.assetUrl !== undefined && options.audio?.recordings.has(cue.assetUrl);
    if (cue.recordingStatus !== 'not-recorded' && (!options.audio || !context || context.state !== 'running' || !decoded)) {
      const { assetUrl: _drop, ...rest } = cue;
      void _drop;
      cue = { ...rest, recordingStatus: 'not-recorded' };
      current = { ...pending, cue };
    }
    const playback = player.play(cue);
    if (pending.def.once) { played.add(pending.def.id); options.onOnceLinePlayed?.(pending.def.id); }
    const handle = { pending: current, playback, release: releaseChain };
    active = handle;
    void playback.finished.then(() => {
      if (active !== handle) return;
      active = null;
      current = null;
      releaseChain();
      const next = queued;
      queued = null;
      if (next && !disposed) start(next);
    });
  }

  return {
    get activeLineId() { return active?.pending.def.id ?? null; },
    get queuedLineId() { return queued?.def.id ?? null; },
    request(request) {
      if (disposed) return 'dropped';
      const def = lines.get(request.lineId);
      if (!def) return 'unknown-line';
      if (request.key !== undefined) {
        if (keys.has(request.key)) return 'duplicate';
      }
      if (active?.pending.def.id === def.id || queued?.def.id === def.id) return 'duplicate';
      if (def.once && played.has(def.id)) return 'already-played';
      const variant = def.variants.find((v) => !v.stages || v.stages.includes(request.stage));
      if (!variant) return 'no-variant';
      if (request.key !== undefined) keys.add(request.key);
      const pending: Pending = { def, cue: variant.cue, request };
      if (options.mode === 'production' && variant.cue.recordingStatus !== 'approved') return 'refused';
      if (!active) { start(pending); return 'played'; }
      if (def.interrupts && def.priority > active.pending.def.priority) {
        const interrupted = active;
        active = null;
        current = null;
        interrupted.playback.stop(`Interrupted by ${def.id}`);
        releaseChain();
        start(pending);
        return 'played';
      }
      if (!queued || def.priority > queued.def.priority) { queued = pending; return 'queued'; }
      return 'dropped';
    },
    update(deltaSeconds, nextListener) {
      if (disposed) return;
      if (nextListener) {
        listener = nextListener;
        const context = options.audio?.context();
        if (context && active?.pending.def.presentation === 'positional') {
          const l = context.listener;
          if (l.positionX) {
            l.positionX.value = listener.position.x; l.positionY.value = listener.position.y; l.positionZ.value = listener.position.z;
            l.forwardX.value = listener.forward.x; l.forwardY.value = 0; l.forwardZ.value = listener.forward.z;
            l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
          }
        }
      }
      player.update(Math.max(0, deltaSeconds));
    },
    stop(reason = 'Stopped') {
      queued = null;
      active?.playback.stop(reason);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      queued = null;
      player.dispose();
      releaseChain();
    },
  };
}
