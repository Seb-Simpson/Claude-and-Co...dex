import type {
  EntitySnapshot, EntitySpawnPoint, FrameContext, GameEventMap, GameEvents, HidingLocation,
  NavigationProvider, PatrolRoute, PlayerNoiseEvent, PlayerProvider, SpawnPose, Vec3,
} from '../contracts';
import type { PhysicsAdapter } from '../physics';
import { createEntityAgent } from './entityAgent';
import type { EntityAgent, EntityDirective } from './entityAgent';
import { resolveEntityProfile } from './profiles';
import type { EntityProfile } from './profiles';

export type NurseEncounterPhase = 'dormant' | 'staged' | 'active' | 'disposed';
export type NurseAudioCueKind = 'patrol-hum' | 'listen' | 'footstep' | 'chase' | 'stop';

/** Semantic presentation hook; no recording or finished sound is supplied by this module. */
export interface NurseAudioCue {
  readonly kind: NurseAudioCueKind;
  readonly entityId: string;
  readonly activation: number;
  readonly position: Vec3;
  readonly timeSeconds: number;
}

/**
 * The owner supplies its real navigation and permitted-door adapter. A restricted service
 * boundary requires authored physical doors/obstacles and validated routes: this module
 * never clamps an agent at an invisible boundary or steers around the navigation provider.
 */
export interface NurseDoorPolicy {
  readonly openNearbyDoor?: (position: Vec3, goal: Vec3) => boolean;
  readonly getDoorApproach?: (position: Vec3, goal: Vec3, localOnly?: boolean) => Vec3 | null;
}

export interface NurseEncounterOptions {
  readonly perceptionEnabled?: () => boolean;
  readonly captureEnabled?: () => boolean;
  readonly spawn: EntitySpawnPoint;
  readonly route?: PatrolRoute;
  readonly hidingLocations?: readonly HidingLocation[];
  readonly physics: PhysicsAdapter;
  readonly navigation: NavigationProvider;
  readonly player: PlayerProvider;
  readonly events: GameEvents;
  /** Overrides the actual sound-sensitive Nurse profile, including capture grace/dwell. */
  readonly profile?: Partial<EntityProfile>;
  readonly playerEyeHeights?: { readonly standing: number; readonly crouching: number };
  readonly doors?: NurseDoorPolicy;
  readonly onAudioCue?: (cue: NurseAudioCue) => void;
}

export interface NurseEncounter {
  setDirective(directive: EntityDirective | null): void;
  getYaw(): number;
  readonly phase: NurseEncounterPhase;
  /** Stage only an inactive actor. No body is allocated until activation. */
  stage(pose?: SpawnPose): void;
  /** Idempotent while active; revalidates staging against current world/actor occupancy. */
  activate(): void;
  /** End a chase, release the capsule and discard all pending perception. Idempotent. */
  deactivate(): void;
  /** Return to the configured spawn only while dormant; checkpoint placement is separate. */
  reset(): void;
  getPlacement(): EntitySpawnPoint;
  /** Active snapshots can feed the existing entity presentation bridge. */
  getSnapshots(): readonly EntitySnapshot[];
  witnessesEntry(): boolean;
  fixedUpdate(frame: FrameContext): void;
  dispose(): void;
}

const copy = (point: Vec3): Vec3 => ({ x: point.x, y: point.y, z: point.z });
const copySpawn = (spawn: EntitySpawnPoint): EntitySpawnPoint => ({ ...spawn, position: copy(spawn.position) });
const finite = (point: Vec3): boolean => [point.x, point.y, point.z].every(Number.isFinite);
const distance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * Chapter-ready activation of the existing perception/navigation FSM, not a second AI.
 * Keep this actor out of any concurrently constructed EntitySystem (one owner per ID).
 * Dormant/staged actors have no physical body, hear nothing and cannot capture. Activation
 * starts fresh perception. Staging/reset are deliberately forbidden for an active actor.
 * Introductory tray/distraction audio is not fabricated as a player-noise event here.
 */
export function createNurseEncounter(options: NurseEncounterOptions): NurseEncounter {
  if (options.spawn.type !== 'nurse' || !options.spawn.id.trim() || !options.spawn.entityId.trim()) {
    throw new Error('Nurse encounter requires a named Nurse spawn');
  }
  const initial = copySpawn(options.spawn);
  const profile = resolveEntityProfile('nurse', options.profile);
  // Snapshot mutable owner data, so a later editor/adapter mutation cannot warp a live actor.
  const route = options.route ? { ...options.route, points: options.route.points.map(copy) } : undefined;
  if (route && (!route.id.trim() || route.points.some((point) => !finite(point)))) {
    throw new Error('Nurse patrol route must contain finite authored points');
  }
  let placement = copySpawn(initial);
  let phase: NurseEncounterPhase = 'dormant';
  let agent: EntityAgent | null = null;
  let pendingNoises: PlayerNoiseEvent[] = [];
  let captured = false;
  let authored = false;
  let activation = 0;
  let time = 0;
  let stepDistance = 0;
  let lastHum = -Infinity;
  let ticking = false;
  let releasing = false;
  let deferredRelease: EntityAgent | null = null;
  let stopCueIssued = false;
  const unsubscribers: (() => void)[] = [];

  function assertUsable(): void {
    if (phase === 'disposed') throw new Error('Nurse encounter disposed');
  }
  function validate(spawn: EntitySpawnPoint): void {
    const { radius, height } = profile.agent;
    if (!finite(spawn.position) || !Number.isFinite(spawn.yaw) ||
        !options.navigation.isPositionValid(spawn.position, profile.agent) ||
        !options.physics.isPositionFree(spawn.position, radius, height) ||
        !options.physics.hasSupport(spawn.position, radius)) {
      throw new Error('Nurse staging position is unsupported, obstructed or outside navigation');
    }
  }
  function cue(kind: NurseAudioCueKind, position: Vec3): void {
    if (kind !== 'stop' && (phase !== 'active' || captured)) return;
    options.onAudioCue?.({ kind, entityId: initial.entityId, activation, position: copy(position), timeSeconds: time });
  }
  function stopAudio(position: Vec3): void {
    if (stopCueIssued) return;
    stopCueIssued = true;
    cue('stop', position);
  }
  function finishRelease(previous: EntityAgent): void {
    const at = previous.getSnapshot().position;
    releasing = true;
    try {
      try { previous.dispose(); } finally { stopAudio(at); }
    } finally { releasing = false; }
  }
  function releaseAgent(): void {
    const previous = agent;
    agent = null;
    pendingNoises = [];
    captured = false;
    stepDistance = 0;
    if (phase !== 'disposed') phase = 'dormant';
    // Event listeners may end the encounter inside the synchronous agent tick. The
    // agent must finish its stack before its Rapier body is released underneath it.
    if (previous) {
      if (ticking) deferredRelease = previous;
      else finishRelease(previous);
    }
  }

  try {
    unsubscribers.push(options.events.on('player:noise', (noise) => {
      if (phase !== 'active' || captured || options.perceptionEnabled?.() === false || pendingNoises.length >= 128) return;
      pendingNoises.push({ ...noise, position: copy(noise.position) });
    }));
    unsubscribers.push(options.events.on('hiding:state', (event) => {
      if (phase !== 'active' || captured || !agent || options.perceptionEnabled?.() === false) return;
      const outerTick = ticking;
      ticking = true;
      try { agent.observeHiding(event); } finally {
        ticking = outerTick;
        if (!outerTick && deferredRelease) {
          const previous = deferredRelease;
          deferredRelease = null;
          finishRelease(previous);
        }
      }
    }));
    unsubscribers.push(options.events.on('player:captured', (event) => {
      if (phase !== 'active' || captured || event.playerId !== options.player.getSnapshot().id) return;
      captured = true;
      pendingNoises = [];
      try { agent?.stop('captured'); } finally {
        const at = agent?.getSnapshot().position;
        if (at) stopAudio(at);
      }
    }));
  } catch (error) {
    for (const unsubscribe of unsubscribers.reverse()) unsubscribe();
    throw error;
  }

  return {
    get phase() { return phase; },
    setDirective(directive) { if (directive || authored) pendingNoises = []; authored = directive !== null; agent?.setDirective(directive); },
    getYaw: () => agent?.getYaw() ?? placement.yaw,
    stage(pose = initial) {
      assertUsable();
      if (ticking || releasing) throw new Error('Cannot stage Nurse inside an active lifecycle callback');
      if (phase === 'active') throw new Error('Cannot stage an active Nurse');
      const next = { ...initial, position: copy(pose.position), yaw: pose.yaw };
      validate(next);
      placement = next;
      pendingNoises = [];
      phase = 'staged';
    },
    activate() {
      assertUsable();
      if (phase === 'active') return;
      if (ticking || releasing) throw new Error('Cannot activate Nurse inside an active lifecycle callback');
      if (options.player.getSnapshot().captured) throw new Error('Cannot activate Nurse for a captured player');
      validate(placement);
      const run = activation + 1;
      // EntityAgent sequences are local to an agent. Qualify their IDs across resets so
      // lifecycle consumers cannot mistake a later chase for an earlier completed one.
      const events: GameEvents = {
        on: (type, listener) => options.events.on(type, listener),
        emit(type, payload) {
          if (type === 'chase:started') {
            const event = payload as GameEventMap['chase:started'];
            options.events.emit('chase:started', { ...event, chaseId: `${event.chaseId}:nurse-run:${run}` });
          } else if (type === 'chase:ended') {
            const event = payload as GameEventMap['chase:ended'];
            options.events.emit('chase:ended', { ...event, chaseId: `${event.chaseId}:nurse-run:${run}` });
          } else options.events.emit(type, payload);
        },
      };
      agent = createEntityAgent({
        spawn: copySpawn(placement), profile, physics: options.physics, navigation: options.navigation,
        player: options.player, events,
        ...(options.perceptionEnabled ? {perceptionEnabled: options.perceptionEnabled} : {}),
        ...(options.captureEnabled ? {captureEnabled: options.captureEnabled} : {}),
        ...(route ? { route } : {}),
        ...(options.hidingLocations ? { hidingLocations: options.hidingLocations } : {}),
        ...(options.playerEyeHeights ? { playerEyeHeights: options.playerEyeHeights } : {}),
        ...(options.doors?.openNearbyDoor ? { openNearbyDoor: options.doors.openNearbyDoor } : {}),
        ...(options.doors?.getDoorApproach ? { getDoorApproach: options.doors.getDoorApproach } : {}),
      });
      activation = run;
      phase = 'active';
      captured = false;
      pendingNoises = [];
      stepDistance = 0;
      lastHum = -Infinity;
      stopCueIssued = false;
    },
    deactivate() {
      if (phase === 'disposed' || phase === 'dormant') return;
      releaseAgent();
    },
    reset() {
      assertUsable();
      if (ticking || releasing) throw new Error('Cannot reset Nurse inside an active lifecycle callback');
      if (phase !== 'dormant') throw new Error('Nurse reset requires dormant lifecycle');
      placement = copySpawn(initial);
      pendingNoises = [];
      captured = false;
    },
    getPlacement: () => copySpawn(placement),
    getSnapshots: () => agent ? [agent.getSnapshot()] : [],
    witnessesEntry: () => phase === 'active' && !captured && Boolean(agent?.witnessesEntry()),
    fixedUpdate(frame) {
      if (phase === 'disposed') return;
      if (!Number.isFinite(frame.deltaSeconds) || frame.deltaSeconds < 0 || !Number.isFinite(frame.elapsedSeconds)) {
        throw new Error('Invalid Nurse encounter frame');
      }
      time = frame.elapsedSeconds;
      if (phase !== 'active' || !agent || captured) return;
      const current = agent;
      const before = current.getSnapshot();
      const noises = pendingNoises;
      pendingNoises = [];
      ticking = true;
      try { current.fixedUpdate(frame, noises); } finally {
        ticking = false;
        const previous = deferredRelease;
        deferredRelease = null;
        if (previous) finishRelease(previous);
      }
      // Capture/deactivation listeners may have run synchronously during the agent tick.
      if (agent !== current || phase !== 'active' || captured) return;
      const after = current.getSnapshot();
      if (after.state !== before.state) {
        if (after.state === 'pursue') cue('chase', after.position);
        else if (after.state === 'investigate' || after.state === 'search') cue('listen', after.position);
      }
      if (agent !== current || phase !== 'active' || captured) return;
      stepDistance += distance(before.position, after.position);
      if (stepDistance >= 0.9) {
        stepDistance %= 0.9;
        cue('footstep', after.position);
      }
      if (agent !== current || phase !== 'active' || captured) return;
      if ((after.state === 'idle' || after.state === 'patrol') && time - lastHum >= 10) {
        lastHum = time;
        cue('patrol-hum', after.position);
      }
    },
    dispose() {
      if (phase === 'disposed') return;
      phase = 'disposed';
      const errors: unknown[] = [];
      try { releaseAgent(); } catch (error) { errors.push(error); }
      for (const unsubscribe of unsubscribers.splice(0).reverse()) {
        try { unsubscribe(); } catch (error) { errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, 'Nurse encounter cleanup failed');
    },
  };
}
