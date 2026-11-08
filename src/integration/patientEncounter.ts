import type { AudioService, ChaseStartedEvent, FrameContext, GameEvents } from '../contracts';

export interface PatientEncounterOptions {
  readonly events: GameEvents;
  readonly audio: AudioService;
  /** Restrict effects to this session's player when more than one player is present. */
  readonly playerId?: string;
  readonly onMessage?: (message: string) => void;
  /** A registered presentation module already owns chase lighting and audio. */
  readonly presentationProvided?: boolean;
}

export interface PatientEncounter {
  readonly activeChases: number;
  /** Called by the existing engine loop. Also handles audio unlocked after a chase starts. */
  update(frame: FrameContext): void;
  dispose(): void;
}

interface Pulse {
  readonly context: AudioContext;
  readonly carrier: OscillatorNode;
  readonly beat: OscillatorNode;
  readonly envelope: GainNode;
  readonly modulation: GainNode;
  readonly output: GainNode;
  carrierStarted: boolean;
  beatStarted: boolean;
  stopped: boolean;
  disconnected: boolean;
}

/**
 * Connects real chase lifecycle events to hospital cues and a quiet procedural pulse.
 * It owns no game loop, renderer, AudioContext, entity movement, or capture logic.
 * The hospital atmosphere module already handles chase-wide lighting and its hush.
 */
export function createPatientEncounter(options: PatientEncounterOptions): PatientEncounter {
  const { events, audio } = options;
  const chases = new Set<string>();
  const pulses = new Set<Pulse>();
  let currentPulse: Pulse | null = null;
  let pendingCue: ChaseStartedEvent | null = null;
  let failedContext: AudioContext | null = null;
  let captured = false;
  let disposed = false;

  const accepts = (playerId: string): boolean => options.playerId === undefined || options.playerId === playerId;

  function disconnect(pulse: Pulse): void {
    if (pulse.disconnected) return;
    pulse.disconnected = true;
    pulse.carrier.onended = null;
    pulse.beat.onended = null;
    pulse.carrier.disconnect();
    pulse.beat.disconnect();
    pulse.envelope.disconnect();
    pulse.modulation.disconnect();
    pulse.output.disconnect();
    pulses.delete(pulse);
    if (currentPulse === pulse) currentPulse = null;
  }

  function stop(pulse: Pulse, immediately: boolean): void {
    if (pulse.disconnected || (pulse.stopped && !immediately)) return;
    pulse.stopped = true;
    const now = pulse.context.currentTime;
    if (!immediately && pulse.context.state === 'running') {
      pulse.output.gain.cancelScheduledValues(now);
      pulse.output.gain.setTargetAtTime(0, now, 0.055);
      if (pulse.carrierStarted) pulse.carrier.stop(now + 0.32);
      if (pulse.beatStarted) pulse.beat.stop(now + 0.32);
    } else {
      if (pulse.carrierStarted) pulse.carrier.stop();
      if (pulse.beatStarted) pulse.beat.stop();
      disconnect(pulse);
    }
    if (currentPulse === pulse) currentPulse = null;
  }

  function stopAll(immediately: boolean): void {
    for (const pulse of pulses) stop(pulse, immediately);
  }

  function startPulse(context: AudioContext): void {
    // Maximum unattenuated gain is below .02. No prerecorded or remote audio is used.
    const allocated: AudioNode[] = [];
    const own = <T extends AudioNode>(node: T): T => { allocated.push(node); return node; };
    let pulse: Pulse | null = null;
    try {
      const carrier = own(context.createOscillator());
      const beat = own(context.createOscillator());
      const envelope = own(context.createGain());
      const modulation = own(context.createGain());
      const output = own(context.createGain());
      pulse = {
        context, carrier, beat, envelope, modulation, output,
        carrierStarted: false, beatStarted: false, stopped: false, disconnected: false,
      };
      pulses.add(pulse);
      const now = context.currentTime;
      carrier.type = 'sine';
      carrier.frequency.value = 56;
      beat.type = 'sine';
      beat.frequency.value = 1.85;
      envelope.gain.value = 0.025;
      modulation.gain.value = 0.022;
      output.gain.value = 0;
      output.gain.setTargetAtTime(0.38, now, 0.2);
      carrier.connect(envelope);
      envelope.connect(output);
      output.connect(context.destination);
      beat.connect(modulation);
      modulation.connect(envelope.gain);
      const startedPulse = pulse;
      carrier.onended = () => disconnect(startedPulse);
      carrier.start(now);
      pulse.carrierStarted = true;
      beat.start(now);
      pulse.beatStarted = true;
      currentPulse = pulse;
    } catch (error) {
      if (pulse) stop(pulse, true);
      else for (const node of allocated) node.disconnect();
      throw error;
    }
  }

  function syncAudio(): void {
    if (options.presentationProvided || disposed || captured || chases.size === 0) return;
    const context = audio.context;
    if (!context || context.state !== 'running') return;
    if (pendingCue) {
      const { position } = pendingCue;
      pendingCue = null;
      events.emit('atmosphere:sound', {
        cueId: 'nw:metal-creak', action: 'play', position, volume: 0.46, loop: false,
      });
    }
    if (currentPulse?.context === context || failedContext === context) return;
    if (currentPulse) stop(currentPulse, true);
    try {
      startPulse(context);
    } catch {
      // Optional audio failure must not interrupt gameplay or repeatedly allocate nodes.
      failedContext = context;
      stopAll(true);
    }
  }

  const subscriptions = [
    events.on('chase:started', (event) => {
      if (disposed || captured || !accepts(event.playerId) || chases.has(event.chaseId)) return;
      const wasQuiet = chases.size === 0;
      chases.add(event.chaseId);
      if (wasQuiet) {
        if (!options.presentationProvided) {
          pendingCue = event;
          events.emit('atmosphere:lighting', {
            targetId: 'nw:lights:corridor-main', effect: 'flicker', durationSeconds: 1.6,
          });
        }
        options.onMessage?.('The Patient has seen you. Break its line of sight.');
      }
      syncAudio();
    }),
    events.on('chase:ended', (event) => {
      if (disposed || !accepts(event.playerId) || !chases.delete(event.chaseId)) return;
      if (event.reason === 'captured') {
        captured = true;
        chases.clear();
      }
      if (chases.size > 0) return;
      pendingCue = null;
      stopAll(false);
      if (!captured && event.reason === 'escaped') options.onMessage?.('The Patient lost your trail. Move quietly.');
    }),
    events.on('player:captured', (event) => {
      if (disposed || !accepts(event.playerId)) return;
      captured = true;
      chases.clear();
      pendingCue = null;
      stopAll(false);
    }),
  ];

  return {
    get activeChases() { return chases.size; },
    update(_frame) { syncAudio(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const unsubscribe of subscriptions) unsubscribe();
      chases.clear();
      pendingCue = null;
      stopAll(true);
    },
  };
}
