import type {
  EntitySnapshot, EntitySpawnPoint, FrameContext, GameEventMap, GameEvents,
  HidingLocation, NavigationProvider, PatrolRoute, PlayerNoiseEvent, PlayerProvider,
  SpawnPose, Vec3,
} from '../contracts';
import type { PhysicsAdapter } from '../physics';
import { createEntityAgent } from './entityAgent';
import type { EntityAgent } from './entityAgent';
import { isEnvironmentalSoundStimulus } from './environmentalSound';
import type { EnvironmentalSoundStimulus } from './environmentalSound';
import { resolveEntityProfile } from './profiles';
import type { EntityProfile } from './profiles';

export type PatientEncounterPhase = 'dormant' | 'staged' | 'active' | 'settled' | 'disposed';
export interface PatientEncounterOptions {
  readonly spawn: EntitySpawnPoint;
  readonly route?: PatrolRoute;
  readonly hidingLocations?: readonly HidingLocation[];
  readonly physics: PhysicsAdapter;
  readonly navigation: NavigationProvider;
  readonly player: PlayerProvider;
  readonly events: GameEvents;
  readonly profile?: Partial<EntityProfile>;
  readonly playerEyeHeights?: { readonly standing: number; readonly crouching: number };
  readonly doors?: {
    readonly openNearbyDoor?: (position: Vec3, goal: Vec3) => boolean;
    readonly getDoorApproach?: (position: Vec3, goal: Vec3, localOnly?: boolean) => Vec3 | null;
  };
}
export interface PatientEncounter {
  readonly phase: PatientEncounterPhase;
  /** Dormant/staged only; validates the actual capsule, support and navigation. */
  stage(pose?: SpawnPose): void;
  /** Creates the real actor after the cinematic handoff; does not force pursuit. */
  activate(): void;
  /** Finite world sound, with no player identity. Dormant actors consume nothing. */
  offerSound(sound: EnvironmentalSoundStimulus): boolean;
  /** Only after the host verifies physical exit separation. Keeps the actual capsule/model pose. */
  settleEscape(): void;
  deactivate(): void;
  /** Fresh attempt placement, allowed only after deactivation. */
  reset(): void;
  getPlacement(): EntitySpawnPoint;
  getSnapshots(): readonly EntitySnapshot[];
  witnessesEntry(): boolean;
  fixedUpdate(frame: FrameContext): void;
  dispose(): void;
}

const copy = (p: Vec3): Vec3 => ({ x: p.x, y: p.y, z: p.z });
const copySpawn = (spawn: EntitySpawnPoint): EntitySpawnPoint => ({ ...spawn, position: copy(spawn.position) });

/**
 * Owns one Patient over the existing perception/navigation FSM. Exclude this ID from
 * a concurrently constructed EntitySystem. Staging is never an active-AI teleport.
 * No scene, model, rendering loop or audio context is allocated here.
 */
export function createPatientEncounter(options: PatientEncounterOptions): PatientEncounter {
  if (options.spawn.type !== 'patient' || !options.spawn.id.trim() || !options.spawn.entityId.trim()) {
    throw new Error('Patient encounter requires a named Patient spawn');
  }
  const initial = copySpawn(options.spawn);
  const profile = resolveEntityProfile('patient', options.profile);
  const route = options.route ? { ...options.route, points: options.route.points.map(copy) } : undefined;
  if (route && (!route.id.trim() || route.points.length === 0 ||
      route.points.some(p => ![p.x, p.y, p.z].every(Number.isFinite)))) throw new Error('Invalid Patient patrol route');
  let placement = copySpawn(initial);
  let phase: PatientEncounterPhase = 'dormant';
  let agent: EntityAgent | null = null;
  let playerNoises: PlayerNoiseEvent[] = [];
  let worldSounds: EnvironmentalSoundStimulus[] = [];
  const soundIds = new Set<string>();
  let run = 0;
  let now = 0;
  let captured = false;
  let depth = 0;
  let releasing = false;
  let deferredRelease: EntityAgent | null = null;
  const unsubscribers: (() => void)[] = [];

  function clearPerception(): void {
    playerNoises = []; worldSounds = []; soundIds.clear(); captured = false;
  }
  function assertInactive(): void {
    if (phase === 'disposed') throw new Error('Patient encounter disposed');
    if (depth || releasing) throw new Error('Cannot stage or activate Patient inside a lifecycle callback');
    if (phase === 'active') throw new Error('Cannot stage or reset an active Patient');
    if (phase === 'settled') throw new Error('A settled Patient must be deactivated before staging, activation or reset');
  }
  function validate(spawn: EntitySpawnPoint): void {
    const { radius, height } = profile.agent;
    if (![spawn.position.x, spawn.position.y, spawn.position.z, spawn.yaw].every(Number.isFinite) ||
        !options.navigation.isPositionValid(spawn.position, profile.agent) ||
        !options.physics.isPositionFree(spawn.position, radius, height) ||
        !options.physics.hasSupport(spawn.position, radius)) throw new Error('Patient staging position is unsupported, obstructed or outside navigation');
  }
  function release(previous: EntityAgent): void {
    releasing = true;
    try { previous.dispose(); } finally { releasing = false; }
  }
  function deactivate(): void {
    if (phase === 'disposed' || phase === 'dormant') return;
    const previous = agent; agent = null;
    phase = 'dormant'; clearPerception();
    if (previous) {
      if (depth) {
        deferredRelease = previous;
        // Settle capture authority now, but keep its capsule alive until the
        // current agent call unwinds. A synchronous encounter listener may end it.
        previous.stop('cancelled');
      }
      else release(previous);
    }
  }
  function invoke(operation: (current: EntityAgent) => void): void {
    const current = agent;
    if (!current) return;
    depth++;
    try { operation(current); } finally {
      depth--;
      if (!depth && deferredRelease) {
        const previous = deferredRelease; deferredRelease = null; release(previous);
      }
    }
  }
  try {
    unsubscribers.push(options.events.on('player:noise', noise => {
      if (phase !== 'active' || captured || playerNoises.length >= 128) return;
      playerNoises.push({ ...noise, position: copy(noise.position) });
    }));
    unsubscribers.push(options.events.on('hiding:state', event => {
      if (phase === 'active' && !captured) invoke(current => current.observeHiding(event));
    }));
    unsubscribers.push(options.events.on('player:captured', event => {
      if (phase !== 'active' || captured || event.playerId !== options.player.getSnapshot().id) return;
      captured = true; playerNoises = []; worldSounds = [];
      invoke(current => current.stop('captured'));
    }));
  } catch (error) {
    for (const unsubscribe of unsubscribers.reverse()) unsubscribe();
    throw error;
  }
  return {
    get phase() { return phase; },
    stage(pose = initial) {
      assertInactive();
      const next = { ...initial, position: copy(pose.position), yaw: pose.yaw };
      validate(next); placement = next; clearPerception(); phase = 'staged';
    },
    activate() {
      if (phase === 'active') return;
      assertInactive();
      if (options.player.getSnapshot().captured) throw new Error('Cannot activate Patient for a captured player');
      validate(placement);
      if (!Number.isSafeInteger(run + 1)) throw new Error('Patient activation sequence exhausted');
      const activation = run + 1;
      const events: GameEvents = {
        on: (type, listener) => options.events.on(type, listener),
        emit(type, payload) {
          if (type === 'chase:started') {
            const event = payload as GameEventMap['chase:started'];
            options.events.emit('chase:started', { ...event, chaseId: `${event.chaseId}:patient-run:${activation}` });
          } else if (type === 'chase:ended') {
            const event = payload as GameEventMap['chase:ended'];
            options.events.emit('chase:ended', { ...event, chaseId: `${event.chaseId}:patient-run:${activation}` });
          } else options.events.emit(type, payload);
        },
      };
      agent = createEntityAgent({
        spawn: copySpawn(placement), profile, physics: options.physics, navigation: options.navigation,
        player: options.player, events,
        ...(route ? { route } : {}),
        ...(options.hidingLocations ? { hidingLocations: options.hidingLocations } : {}),
        ...(options.playerEyeHeights ? { playerEyeHeights: options.playerEyeHeights } : {}),
        ...(options.doors?.openNearbyDoor ? { openNearbyDoor: options.doors.openNearbyDoor } : {}),
        ...(options.doors?.getDoorApproach ? { getDoorApproach: options.doors.getDoorApproach } : {}),
      });
      run = activation; clearPerception(); phase = 'active';
    },
    offerSound(sound) {
      if (phase !== 'active' || captured || !isEnvironmentalSoundStimulus(sound) || soundIds.has(sound.id) ||
          worldSounds.length >= 128 || now - sound.timeSeconds > profile.hearingMaxAgeSeconds) return false;
      worldSounds.push({ ...sound, position: copy(sound.position) }); soundIds.add(sound.id);
      // Deduplicate a bounded recent window, not the first 128 sounds for the
      // actor's entire lifetime. A long chase must not become permanently deaf.
      if (soundIds.size > 128) {
        const oldest = soundIds.values().next().value;
        if (oldest !== undefined) soundIds.delete(oldest);
      }
      return true;
    },
    settleEscape() {
      if (phase === 'settled') return;
      if (phase !== 'active' || captured) throw new Error('Only an active, uncaptured Patient can settle an escape');
      phase = 'settled'; clearPerception();
      invoke(current => current.stop('escaped'));
    },
    deactivate,
    reset() {
      assertInactive();
      if (phase !== 'dormant') throw new Error('Patient reset requires dormant lifecycle');
      placement = copySpawn(initial); clearPerception(); now = 0;
    },
    getPlacement: () => copySpawn(placement),
    getSnapshots: () => agent ? [agent.getSnapshot()] : [],
    witnessesEntry: () => phase === 'active' && !captured && Boolean(agent?.witnessesEntry()),
    fixedUpdate(frame) {
      if (phase === 'disposed') return;
      if (!Number.isFinite(frame.deltaSeconds) || frame.deltaSeconds < 0 || !Number.isFinite(frame.elapsedSeconds) || frame.elapsedSeconds < 0) throw new Error('Invalid Patient frame');
      now = frame.elapsedSeconds;
      if (phase !== 'active' || captured) return;
      const noises = playerNoises; const sounds = worldSounds;
      playerNoises = []; worldSounds = [];
      invoke(current => current.fixedUpdate(frame, noises, sounds));
    },
    dispose() {
      if (phase === 'disposed') return;
      const errors: unknown[] = [];
      try { deactivate(); } catch (error) { errors.push(error); }
      phase = 'disposed';
      for (const unsubscribe of unsubscribers.splice(0).reverse()) {
        try { unsubscribe(); } catch (error) { errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, 'Patient encounter cleanup failed');
    },
  };
}
