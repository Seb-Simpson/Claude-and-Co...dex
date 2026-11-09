import type { FrameContext, GameEvents, PlayerProvider, PlayerSnapshot, Vec3 } from '../../contracts';
import type { PatientEncounter } from '../../entities/patientEncounter';
import type { PhysicsAdapter } from '../../physics';
import { createChapterCoreCheckpoint } from './checkpoints';
import type { ChapterCoreCheckpoint } from './checkpoints';
import type { ChapterCommand, ChapterResult, ChapterState } from './model';
import { validateCinematicDefinition } from './cinematics';
import type { CinematicDefinition, CinematicPlayback, CinematicPlayer } from './cinematics';
import { inspectPatientChaseLayout } from './patientChaseLayout';
import type { PatientChaseLayout, PatientChaseNavigation, PatientChaseReadiness } from './patientChaseLayout';

export type PatientChasePhase = 'idle' | 'preparing' | 'ready' | 'revealing' | 'active'
  | 'captured' | 'retrying' | 'escaped' | 'interrupted' | 'disposed';
export type PatientChaseCueId = 'prepared' | 'release' | 'alarm-pulse' | 'pursuit'
  | 'search' | 'recovered' | 'capture' | 'retry' | 'escape';
export interface PatientChaseCue {
  readonly id: PatientChaseCueId;
  readonly attempt: number;
  readonly timeSeconds: number;
  readonly position: Vec3;
}
export interface PatientChaseCheckpoint {
  readonly schemaVersion: 1;
  readonly layoutRevision: string;
  readonly core: ChapterCoreCheckpoint;
}
/** Session-bound references are resolved again after a full checkpoint transaction. */
export interface PatientChaseSession {
  readonly id: string;
  readonly events: GameEvents;
  readonly player: PlayerProvider;
  readonly patient: PatientEncounter;
  readonly physics: PhysicsAdapter;
  readonly navigation: PatientChaseNavigation;
  readonly chapter: {
    getState(): ChapterState;
    dispatch(command: ChapterCommand): ChapterResult;
  };
  readonly cinematic: CinematicPlayer;
  /** Supplied approved scene, or explicitly labelled isolated-test preview. No default fake scene. */
  reveal(): CinematicDefinition;
  /** Actual physical Nurse separation, not merely a story flag. */
  nurseIsClear(): boolean;
  readonly world: {
    release(): void;
    isReleased(): boolean;
    isAtSafeLanding(player: PlayerSnapshot): boolean;
    /** Collision/occupancy-authoritative closure. Failure keeps the encounter live. */
    trySealExit(): boolean;
    /** Verify every actor-accessible landing portal is closed and cannot be reopened by this actor. */
    isExitContained(): boolean;
  };
}
export interface PatientChaseOptions {
  readonly layout: PatientChaseLayout;
  readonly session: () => PatientChaseSession;
  readonly checkpoints: {
    /** Must atomically save full player/doors/actors/puzzle/audio/lighting alongside this core. */
    save(checkpoint: PatientChaseCheckpoint): Promise<string>;
    /** Resolve only after full supported state restoration, potentially with a new session. */
    restore(reference: string): Promise<void>;
  };
  /** Scoped presentation only. Existing chase GameEvents remain the ordinary chase transport. */
  readonly cue?: (cue: PatientChaseCue) => (() => void) | PatientChasePresentationScope | void;
  readonly chimeRadius?: number;
  readonly chimeIntensity?: number;
}
export interface PatientChasePresentationScope {
  stop(): void;
  pause?(): void;
  resume?(): void;
}
export interface PatientChaseSnapshot {
  readonly phase: PatientChasePhase;
  readonly attempt: number;
  readonly pursuing: boolean;
  readonly error: string | null;
  readonly checkpointReference: string | null;
}
export interface PatientChase {
  prepare(): Promise<PatientChaseReadiness>;
  /** The player's actual local CONFIRM RELEASE interaction. */
  confirmRelease(): boolean;
  fixedUpdate(frame: FrameContext): void;
  /** Host supplies update exactly once; frontend pause uses these same scoped handles. */
  update(deltaSeconds: number): void;
  skipReveal(): void;
  interrupt(reason?: string): void;
  pause(): void;
  resume(): void;
  tryEscape(): boolean;
  retry(): Promise<boolean>;
  getSnapshot(): PatientChaseSnapshot;
  dispose(): void;
}
const distance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * Directs the one chapter climax. It never chooses per-frame AI targets, spawns an
 * enemy behind the player, creates a loop, or guesses hospital coordinates.
 */
export function createPatientChase(options: PatientChaseOptions): PatientChase {
  if (options.layout.routes.length < 2 || options.layout.routes.length > 4 ||
      options.layout.routes.some(r => r.points.length < 3 || r.points.length > 24)) throw new Error('Chase route configuration exceeds the bounded authoring schema');
  // Snapshot owner configuration so an editor mutation cannot restage an active encounter.
  const layout: PatientChaseLayout = { ...options.layout,
    patientStage: { ...options.layout.patientStage, position: { ...options.layout.patientStage.position } },
    playerHandoff: { ...options.layout.playerHandoff, position: { ...options.layout.playerHandoff.position } },
    chime: { ...options.layout.chime }, exitApproach: { ...options.layout.exitApproach },
    routes: options.layout.routes.map(r => ({ id: r.id, points: r.points.map(p => ({ ...p })) })),
  };
  const radius = options.chimeRadius ?? 20, intensity = options.chimeIntensity ?? 0.8;
  if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(intensity) || intensity <= 0 || intensity > 1) throw new Error('Invalid release-chime parameters');
  let phase: PatientChasePhase = 'idle', attempt = 0, generation = 0, now = 0;
  let error: string | null = null, checkpointReference: string | null = null;
  let session: PatientChaseSession | null = null;
  let playback: CinematicPlayback | null = null;
  let revealToken: number | null = null;
  let pursuing = false, paused = false;
  let unsubscribers: (() => void)[] = [];
  const scopes = new Map<PatientChaseCueId, PatientChasePresentationScope>();

  function stopScope(id: PatientChaseCueId): void {
    const old = scopes.get(id); scopes.delete(id); old?.stop();
  }

  function stopScopes(): void {
    const cleanup = [...scopes.values()]; scopes.clear();
    const failures: unknown[] = [];
    for (const scope of cleanup.reverse()) { try { scope.stop(); } catch (e) { failures.push(e); } }
    if (failures.length) throw new AggregateError(failures, 'Patient chase presentation cleanup failed');
  }
  function cue(id: PatientChaseCueId): void {
    const token = generation, phaseAtStart = phase;
    stopScope(id);
    if (generation !== token || phase !== phaseAtStart) return;
    const at = ['alarm-pulse', 'release', 'prepared', 'retry'].includes(id) ? layout.chime
      : session?.patient.getSnapshots()[0]?.position ?? layout.chime;
    const result = options.cue?.({ id, attempt, timeSeconds: now, position: { ...at } });
    const scope = typeof result === 'function' ? { stop: result } : result;
    if (scope) {
      if (generation !== token || phase !== phaseAtStart) scope.stop();
      else scopes.set(id, scope);
    }
  }
  function detach(): void { for (const off of unsubscribers.splice(0).reverse()) off(); }
  function interrupt(reason: string): void {
    if (phase === 'disposed') return;
    error = reason; phase = 'interrupted'; pursuing = false; generation++;
    const failures: unknown[] = [];
    try { playback?.cancel(reason); } catch (e) { failures.push(e); }
    playback = null;
    try {
      if (session && revealToken !== null) session.chapter.dispatch({ type: 'settle-scene', token: revealToken, outcome: 'interrupted' });
    } catch (e) { failures.push(e); }
    revealToken = null;
    try { session?.patient.deactivate(); } catch (e) { failures.push(e); }
    try { stopScopes(); } catch (e) { failures.push(e); }
    if (failures.length) error += ' Cleanup reported an error; keep the checkpoint recovery screen active.';
  }
  function guarded(operation: () => void): void {
    try { operation(); } catch (e) { interrupt(e instanceof Error ? e.message : 'Patient chase callback failed.'); }
  }
  function readiness(current: PatientChaseSession, freshCheckpoint = true): PatientChaseReadiness {
    const report = inspectPatientChaseLayout(layout, current.navigation);
    const issues = [...report.issues];
    const state = current.chapter.getState(), player = current.player.getSnapshot();
    if (freshCheckpoint) {
      const core = createChapterCoreCheckpoint(state);
      if (!core.ok || core.value.checkpointId !== 'chapter1.before-patient') issues.push('A fresh supported before-Patient checkpoint is required.');
    } else if (!state.checkpoints.includes('chapter1.before-patient') || state.activeScene || state.puzzle.releaseConfirmed ||
        !state.puzzle.busArmed || state.puzzle.handleLocation !== 'installed') issues.push('The prepared emergency release is no longer valid.');
    if (!state.completedScenes.includes('c1.cine.record')) issues.push('Play or skip the deferred record scene at a safe opportunity before preparing the climax.');
    if (current.patient.phase !== 'dormant' && current.patient.phase !== 'staged') issues.push('Patient is already active or settled.');
    if (!current.nurseIsClear()) issues.push('The Nurse encounter is not physically separated.');
    if (player.captured || player.hiding.state !== 'outside' || distance(player.position, layout.playerHandoff.position) > 0.35 ||
        !current.physics.hasSupport(player.position, current.navigation.playerAgent.radius) ||
        !current.physics.isPositionFree(player.position, current.navigation.playerAgent.radius, current.navigation.playerAgent.height, [], false)) issues.push('Player is not at the valid, unoccupied release handoff.');
    return { ...report, valid: issues.length === 0, issues };
  }
  function bind(current: PatientChaseSession): void {
    detach(); session = current;
    const entityId = current.patient.getPlacement().entityId;
    unsubscribers.push(current.events.on('chase:started', event => {
      if (phase !== 'active' || event.entityId !== entityId) return;
      guarded(() => { stopScope('search'); stopScope('recovered'); pursuing = true; cue('pursuit'); });
    }));
    unsubscribers.push(current.events.on('chase:ended', event => {
      if (phase !== 'active' || event.entityId !== entityId) return;
      guarded(() => { pursuing = false; stopScope('pursuit'); if (event.reason === 'escaped') cue('search'); });
    }));
    unsubscribers.push(current.events.on('entity:state', event => {
      if (phase === 'active' && event.entityId === entityId && event.current === 'return-to-patrol') guarded(() => { stopScope('search'); cue('recovered'); });
    }));
    unsubscribers.push(current.events.on('player:captured', event => {
      if (phase !== 'active' || event.playerId !== current.player.getSnapshot().id) return;
      guarded(() => { phase = 'captured'; pursuing = false; stopScopes(); cue('capture'); });
    }));
  }
  function finishReveal(token: number, outcome: 'completed' | 'skipped' | 'interrupted', reason?: string): void {
    if (generation !== token || phase !== 'revealing' || !session || revealToken === null) return;
    playback = null;
    if (outcome === 'interrupted') { interrupt(reason ?? 'Patient reveal interrupted; restore the checkpoint before retrying.'); return; }
    try {
      const player = session.player.getSnapshot();
      if (player.captured || player.hiding.state !== 'outside' || !session.nurseIsClear() ||
          distance(player.position, layout.playerHandoff.position) > 0.35 ||
          distance(player.position, layout.patientStage.position) < (layout.minimumSeparationMetres ?? 8) || !session.world.isReleased()) throw new Error('Reveal no longer has a fair physical handoff.');
      const report = inspectPatientChaseLayout(layout, session.navigation);
      if (!report.valid) throw new Error(report.issues.join(' '));
      const result = session.chapter.dispatch({ type: 'settle-scene', token: revealToken, outcome });
      if (!result.accepted) throw new Error(result.reason ?? 'Chapter rejected the Patient handoff.');
      revealToken = null;
      session.patient.activate(); phase = 'active';
      // A fresh pulse from the continuing physical alarm, not a replayed player noise.
      cue('alarm-pulse');
      session.patient.offerSound({ id: `c1:egress-pulse:${attempt}`, position: { ...layout.chime }, radius, intensity, timeSeconds: now });
    } catch (e) { interrupt(e instanceof Error ? e.message : 'Patient handoff failed.'); }
  }
  return {
    async prepare() {
      if (phase !== 'idle') return { valid: false, issues: ['Chase preparation is already in progress or settled.'], routes: [] };
      const token = ++generation; phase = 'preparing';
      try {
        const current = options.session(), report = readiness(current);
        if (!report.valid) { phase = 'idle'; return report; }
        const core = createChapterCoreCheckpoint(current.chapter.getState());
        if (!core.ok) throw new Error(core.error);
        const reference = await options.checkpoints.save({ schemaVersion: 1, layoutRevision: layout.revision, core: core.value });
        if (generation !== token) return { valid: false, issues: ['Preparation cancelled.'], routes: [] };
        if (!reference.trim()) throw new Error('Checkpoint storage did not return a reference.');
        checkpointReference = reference;
        if (options.session().id !== current.id || !readiness(current).valid) throw new Error('Session or safety changed during checkpoint creation.');
        bind(current); current.patient.stage(layout.patientStage);
        phase = 'ready'; error = null; cue('prepared');
        return generation === token ? report : { valid: false, issues: ['Preparation cancelled by its owner.'], routes: [] };
      } catch (e) {
        interrupt(e instanceof Error ? e.message : 'Patient preparation failed.');
        return { valid: false, issues: [error!], routes: [] };
      }
    },
    confirmRelease() {
      if (phase !== 'ready' || !session || paused) return false;
      try {
        if (!readiness(session, false).valid) return false;
        stopScope('prepared'); stopScope('retry');
        const definition = validateCinematicDefinition(session.reveal());
        if (definition.id !== 'c1.cine.patient-release') throw new Error('Wrong Patient reveal definition.');
        const result = session.chapter.dispatch({ type: 'confirm-release', safe: true });
        if (!result.accepted || !result.state.activeScene) throw new Error(result.reason ?? 'Local release was rejected.');
        revealToken = result.state.activeScene.token; attempt++; phase = 'revealing';
        const token = ++generation;
        playback = session.cinematic.play(definition);
        if (playback.state === 'interrupted') throw new Error('Patient cinematic could not start.');
        session.world.release();
        if (!session.world.isReleased()) throw new Error('The actual emergency release did not open.');
        cue('release');
        void playback.finished.then(result => finishReveal(token, result.outcome, result.reason));
        return true;
      } catch (e) { interrupt(e instanceof Error ? e.message : 'Patient release failed.'); return false; }
    },
    fixedUpdate(frame) {
      if (phase === 'disposed' || paused) return;
      if (!Number.isFinite(frame.elapsedSeconds) || frame.elapsedSeconds < 0 || !Number.isFinite(frame.deltaSeconds) || frame.deltaSeconds < 0) throw new Error('Invalid chase frame.');
      now = frame.elapsedSeconds;
      if (phase === 'ready' || phase === 'revealing' || phase === 'active') guarded(() => session?.patient.fixedUpdate(frame));
    },
    update(deltaSeconds) { if (phase === 'revealing' && !paused) guarded(() => session?.cinematic.update(deltaSeconds)); },
    skipReveal() { if (phase === 'revealing') playback?.skip(); },
    interrupt(reason = 'Patient encounter interrupted') {
      if (['ready', 'revealing', 'active'].includes(phase)) interrupt(reason);
    },
    pause() {
      if (phase !== 'disposed' && !paused) guarded(() => { paused = true; playback?.pause(); for (const scope of scopes.values()) scope.pause?.(); });
    },
    resume() {
      if (phase !== 'disposed' && paused) guarded(() => { paused = false; playback?.resume(); for (const scope of scopes.values()) scope.resume?.(); });
    },
    tryEscape() {
      if (phase !== 'active' || paused || !session) return false;
      try {
        const player = session.player.getSnapshot(), actor = session.patient.getSnapshots()[0];
        if (player.captured || player.hiding.state !== 'outside' || !actor || !session.world.isAtSafeLanding(player) || !session.world.trySealExit() || !session.world.isExitContained()) return false;
        const eye = { ...player.position, y: player.position.y + (player.crouching ? 0.9 : 1.65) };
        const enemyEye = { ...actor.position, y: actor.position.y + session.navigation.patientProfile.eyeHeight };
        const portalEye = { ...layout.exitApproach, y: layout.exitApproach.y + (player.crouching ? 0.9 : 1.65) };
        // Test the actual aperture as well as the enemy ray: a distant corner alone
        // cannot masquerade as a sealed exit. The producer verifies all landing
        // portals/door permissions. A world-wide over-budget A* null is not proof
        // of disconnection and would cause a large cold search at the exit beat.
        if (!session.physics.hasSupport(player.position, session.navigation.playerAgent.radius) ||
            session.physics.hasLineOfSight(enemyEye, eye) || session.physics.hasLineOfSight(portalEye, eye) ||
            session.physics.isSegmentFree(layout.exitApproach, player.position,
              session.navigation.playerAgent.radius, session.navigation.playerAgent.height, [], false)) return false;
        const result = session.chapter.dispatch({ type: 'reach-stair-landing', safe: true });
        if (!result.accepted) return false;
        phase = 'escaped'; pursuing = false; session.patient.settleEscape(); stopScopes(); cue('escape');
        return true;
      } catch (e) { interrupt(e instanceof Error ? e.message : 'Stairwell containment failed.'); return false; }
    },
    async retry() {
      if (!['captured', 'interrupted'].includes(phase) || !checkpointReference) return false;
      const token = ++generation; phase = 'retrying'; error = null;
      try {
        playback?.cancel('Checkpoint retry'); playback = null; detach(); session?.patient.deactivate(); stopScopes();
        await options.checkpoints.restore(checkpointReference);
        if (generation !== token) return false;
        const current = options.session(), report = readiness(current);
        if (!report.valid) throw new Error(report.issues.join(' '));
        bind(current); current.patient.stage(layout.patientStage); now = 0; paused = false;
        phase = 'ready'; revealToken = null; pursuing = false; cue('retry'); return true;
      } catch (e) { interrupt(e instanceof Error ? e.message : 'Checkpoint restore failed.'); return false; }
    },
    getSnapshot: () => ({ phase, attempt, pursuing, error, checkpointReference }),
    dispose() {
      if (phase === 'disposed') return;
      generation++; phase = 'disposed'; playback?.cancel('Patient chase disposed'); playback = null;
      const failures: unknown[] = [];
      try { detach(); } catch (e) { failures.push(e); }
      try {
        if (session && revealToken !== null) session.chapter.dispatch({ type: 'settle-scene', token: revealToken, outcome: 'interrupted' });
      } catch (e) { failures.push(e); }
      revealToken = null;
      try { session?.patient.deactivate(); } catch (e) { failures.push(e); }
      try { stopScopes(); } catch (e) { failures.push(e); }
      session = null;
      if (failures.length) throw new AggregateError(failures, 'Patient chase cleanup failed');
    },
  };
}
