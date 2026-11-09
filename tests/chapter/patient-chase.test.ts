import RAPIER from '@dimforge/rapier3d-compat';
import { Group, PerspectiveCamera, Scene } from 'three';
import type { WebGLRenderer } from 'three';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EngineServices, HospitalWorld, Vec3 } from '../../src/contracts';
import { createEventBus } from '../../src/integration/events';
import { createGameplayRuntime } from '../../src/gameplay/runtime';
import { createNavigationProvider } from '../../src/physics';
import { createPatientEncounter } from '../../src/entities/patientEncounter';
import { resolveEntityProfile } from '../../src/entities/profiles';
import { captureCinematicPose, createCinematicPlayer } from '../../src/gameplay/chapter/cinematics';
import type { CinematicPlayback } from '../../src/gameplay/chapter/cinematics';
import { createPatientChase } from '../../src/gameplay/chapter/patientChase';
import type { PatientChaseCheckpoint, PatientChaseCue, PatientChasePresentationScope, PatientChaseSession } from '../../src/gameplay/chapter/patientChase';
import type { PatientChaseLayout } from '../../src/gameplay/chapter/patientChaseLayout';
import { applyChapterCommand, createInitialChapterState } from '../../src/gameplay/chapter/progression';
import type { ChapterCommand, ChapterSceneId, ChapterState } from '../../src/gameplay/chapter/model';

beforeAll(async () => { await RAPIER.init(); });
const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); });
const rotation = { x: 0, y: 0, z: 0, w: 1 };
const p = (x: number, z: number): Vec3 => ({ x, y: 0.005, z });

function preparedChapter(): ChapterState {
  let state = createInitialChapterState();
  const dispatch = (command: ChapterCommand) => {
    const result = applyChapterCommand(state, command);
    if (!result.accepted) throw new Error(result.reason);
    state = result.state;
  };
  const scene = (id: ChapterSceneId) => {
    dispatch({ type: 'request-scene', id, safe: true });
    dispatch({ type: 'settle-scene', token: state.activeScene!.token, outcome: 'skipped' });
  };
  scene('c1.cine.awakening');
  dispatch({ type: 'inspect', clue: 'current-intake' });
  dispatch({ type: 'inspect', clue: 'unanswered-call' });
  dispatch({ type: 'reach-station' }); dispatch({ type: 'inspect', clue: 'night-ledger' });
  scene('c1.cine.nurse-reveal');
  dispatch({ type: 'survive-nurse', method: 'quiet-route', contactBroken: true, atReviewDesk: true });
  dispatch({ type: 'inspect', clue: 'release-procedure' }); dispatch({ type: 'collect-operating-handle' });
  scene('c1.cine.record'); dispatch({ type: 'visit-panel' });
  for (const command of [{ type: 'set-reserve', enabled: true }, { type: 'set-observation-link', value: 'isolated' },
    { type: 'select-destination', value: 'egress' }, { type: 'engage' }] as const) dispatch({ type: 'puzzle', command });
  dispatch({ type: 'commit-checkpoint', id: 'chapter1.after-records-power', safe: true });
  dispatch({ type: 'install-operating-handle' });
  dispatch({ type: 'commit-checkpoint', id: 'chapter1.before-patient', safe: true });
  return state;
}

/** Real physics, camera lease and A*. Temporary geometry exists only in this test. */
function fixture(config: { sealedDivider?: boolean; nurseClear?: boolean } = {}) {
  const rapier = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const events = createEventBus();
  const camera = new PerspectiveCamera(70, 1, 0.05, 100);
  const engine: EngineServices = { scene: new Scene(), camera, physics: rapier,
    renderer: { domElement: {} } as WebGLRenderer,
    audio: { context: null, resume: async () => {}, dispose: async () => {} } };
  const start = { position: p(8, 0), yaw: Math.PI / 2 };
  const exitOpen = { position: { x: 15, y: -10, z: 0 }, rotation };
  const exitClosed = { position: { x: 15, y: 1.5, z: 0 }, rotation };
  const world: HospitalWorld = { id: 'test:chase-loop', root: new Group(),
    bounds: { min: { x: -20, y: -1, z: -12 }, max: { x: 20, y: 4, z: 12 } },
    rooms: [], interactables: [], doors: [], hidingLocations: [], entitySpawns: [], patrolRoutes: [], playerSpawn: start,
    colliders: [
      { id: 'test:floor', bodyType: 'fixed', sensor: false, shape: { type: 'box', halfExtents: { x: 20, y: 0.25, z: 12 } }, pose: { position: { x: 0, y: -0.25, z: 0 }, rotation } },
      { id: 'test:divider', bodyType: 'fixed', sensor: false, shape: { type: 'box', halfExtents: { x: 0.12, y: 1.5, z: config.sealedDivider ? 12 : 3 } }, pose: { position: { x: 0, y: 1.5, z: 0 }, rotation } },
      { id: 'test:exit', bodyType: 'kinematic', sensor: false, shape: { type: 'box', halfExtents: { x: 0.12, y: 1.5, z: 12 } }, pose: exitOpen },
    ] };
  const runtime = createGameplayRuntime({ engine, events, world, player: null }, { attachControls: false, showHud: false, activeEntityTypes: [] });
  const navigation = createNavigationProvider(runtime.physics, world.bounds, { cellSize: 0.5, maxNodes: 4096 });
  const profile = resolveEntityProfile('patient', { detectionSeconds: 0.1, captureGraceSeconds: 0.3, captureDwellSeconds: 0.2,
    idleSeconds: 0.1, searchSeconds: 0.7, lostTargetSeconds: 0.15, loseSightSeconds: 0.2, recoverySeconds: 0.3 });
  const stage = { position: p(-8, 0), yaw: -Math.PI / 2 };
  const patient = createPatientEncounter({ spawn: { ...stage, id: 'test:patient-spawn', entityId: 'test:patient', type: 'patient' },
    physics: runtime.physics, navigation, player: runtime.player, events, profile,
    route: { id: 'test:patrol', points: [stage.position], loop: true } });
  let state = preparedChapter(), saved: PatientChaseCheckpoint | null = null;
  let released = false, sealAllowed = true, sealed = false, fakeSeal = false, nurseClear = config.nurseClear ?? true;
  let playback: CinematicPlayback | null = null;
  const cinematic = createCinematicPlayer({ camera,
    acquireControl: () => runtime.acquireCinematicControl(), validateHandoff: () => true });
  const release = vi.fn(() => { released = true; });
  const cues: PatientChaseCue[] = [], started: string[] = [], ended: string[] = [];
  let cueHook: ((cue: PatientChaseCue) => void) | undefined;
  let resourceHook: ((cue: PatientChaseCue) => PatientChasePresentationScope | undefined) | undefined;
  const cueStops = vi.fn();
  events.on('chase:started', event => started.push(event.chaseId));
  events.on('chase:ended', event => ended.push(event.reason));
  const chapter = { getState: () => state, dispatch(command: ChapterCommand) {
    const result = applyChapterCommand(state, command); if (result.accepted) state = result.state; return result;
  } };
  const session: PatientChaseSession = { id: 'test:attempt-session', events, player: runtime.player, patient, physics: runtime.physics,
    navigation: { player: navigation, patient: navigation, playerAgent: { ...profile.agent, radius: 0.28 }, patientProfile: profile }, chapter,
    cinematic: { ...cinematic, play(definition, options) { playback = cinematic.play(definition, options); return playback; } },
    reveal() { const pose = captureCinematicPose(camera); return { id: 'c1.cine.patient-release', durationSeconds: 0.3,
      camera: [{ atSeconds: 0, pose }, { atSeconds: 0.3, pose }], cues: [] }; },
    nurseIsClear: () => nurseClear,
    world: { release, isReleased: () => released,
      isAtSafeLanding: player => player.position.x >= 16.5 && Math.abs(player.position.z) <= 2,
      trySealExit() {
        if (!sealAllowed) return false;
        if (fakeSeal) return true;
        sealed = runtime.physics.trySetColliderPoses([{ id: 'test:exit', pose: exitClosed }]); return sealed;
      }, isExitContained: () => fakeSeal || sealed } };
  const layout: PatientChaseLayout = { revision: 'test:loop-v1', patientStage: stage, playerHandoff: start, chime: p(8, 0), exitApproach: p(14, 0),
    routes: [{ id: 'test:north', points: [p(8, 0), p(10, -4), p(14, 0)] }, { id: 'test:south', points: [p(8, 0), p(10, 4), p(14, 0)] }] };
  let elapsed = 0;
  const position = (point: Vec3) => {
    expect(runtime.physics.isPositionFree(point, runtime.player.body.radius, runtime.player.body.height, [], false)).toBe(true);
    expect(runtime.physics.hasSupport(point, runtime.player.body.radius)).toBe(true);
    runtime.player.body.setPosition(point); runtime.player.update({ deltaSeconds: 0.1, elapsedSeconds: elapsed });
  };
  const save = vi.fn(async (checkpoint: PatientChaseCheckpoint) => { saved = structuredClone(checkpoint); return 'test:checkpoint-ref'; });
  const restore = vi.fn(async () => {
    if (!saved) throw new Error('No checkpoint');
    state = structuredClone(saved.core.state); released = false; sealed = false; fakeSeal = false;
    runtime.physics.trySetColliderPoses([{ id: 'test:exit', pose: exitOpen }]);
    runtime.player.setCaptured(false); runtime.player.setHiding('outside', null);
    position(start.position); runtime.player.setViewRotation({ yaw: start.yaw, pitch: 0 });
  });
  const chase = createPatientChase({ layout, session: () => session, checkpoints: { save, restore }, chimeRadius: 80,
    cue: cue => { cues.push(cue); cueHook?.(cue); return resourceHook?.(cue) ?? (() => cueStops(cue.id)); } });
  const tick = (count = 1) => { for (let i = 0; i < count; i++) {
    elapsed += 1 / 60; const frame = { deltaSeconds: 1 / 60, elapsedSeconds: elapsed };
    runtime.fixedUpdate(frame); chase.fixedUpdate(frame); rapier.step(); runtime.update(frame); chase.update(frame.deltaSeconds);
  } };
  tick(3);
  cleanups.push(() => { chase.dispose(); cinematic.dispose(); patient.dispose(); runtime.dispose(); events.dispose(); rapier.free(); });
  return { chase, patient, runtime, camera, rapier, events, navigation, session, layout, save, restore, release, cues, started, ended, cueStops,
    tick, position, get state() { return state; }, get playback() { return playback; },
    get saved() { return saved; }, get released() { return released; },
    nurseClear: (value: boolean) => { nurseClear = value; },
    allowSeal: (value: boolean) => { sealAllowed = value; }, fakeSeal: (value: boolean) => { fakeSeal = value; },
    hook: (fn: (cue: PatientChaseCue) => void) => { cueHook = fn; },
    resource: (fn: (cue: PatientChaseCue) => PatientChasePresentationScope | undefined) => { resourceHook = fn; },
  };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
async function handoff(f: ReturnType<typeof fixture>, skipped = false) {
  expect((await f.chase.prepare()).valid).toBe(true);
  expect(f.chase.confirmRelease()).toBe(true);
  if (skipped) f.chase.skipReveal();
  f.chase.update(0.3); await flush();
  expect(f.chase.getSnapshot().phase).toBe('active');
}

describe('Patient chapter climax controller with real physics and perception', () => {
  it.each(['pause', 'resume'] as const)('releases input and permits checkpoint retry when a presentation %s callback throws', async method => {
    const f = fixture();
    f.resource(cue => cue.id === 'release' ? {
      stop: vi.fn(),
      pause() { if (method === 'pause') throw new Error('test: pause failed'); },
      resume() { if (method === 'resume') throw new Error('test: resume failed'); },
    } : undefined);
    expect((await f.chase.prepare()).valid).toBe(true);
    expect(f.chase.confirmRelease()).toBe(true);
    expect(() => { f.chase.pause(); if (method === 'resume') f.chase.resume(); }).not.toThrow();
    expect(f.chase.getSnapshot()).toMatchObject({ phase: 'interrupted', error: `test: ${method} failed` });
    expect(f.runtime.player.controlsLocked).toBe(false);
    expect(f.state.activeScene).toBeNull();
    expect(f.patient.getSnapshots()).toEqual([]);
    expect(await f.chase.retry()).toBe(true);
  });

  it('stays dormant until a safe normal handoff, then investigates an anonymous chime', async () => {
    const f = fixture();
    expect(f.patient.getSnapshots()).toEqual([]);
    expect(f.chase.confirmRelease()).toBe(false);
    expect((await f.chase.prepare()).valid).toBe(true);
    expect(f.save).toHaveBeenCalledOnce();
    const bodyCount = f.rapier.colliders.len();
    expect(f.chase.confirmRelease()).toBe(true);
    expect(f.chase.confirmRelease()).toBe(false);
    expect(f.patient.getSnapshots()).toEqual([]);
    expect(f.runtime.player.controlsLocked).toBe(true);
    expect(f.release).toHaveBeenCalledOnce();
    f.chase.update(0.3); await flush(); f.tick();
    expect(f.patient.getSnapshots()[0]).toMatchObject({ state: 'investigate', lastKnownPlayer: null });
    expect(f.rapier.colliders.len()).toBe(bodyCount + 1);
    expect(f.started).toEqual([]);
    expect(f.runtime.player.controlsLocked).toBe(false);
    expect(f.cues.map(cue => cue.id)).toContain('alarm-pulse');
  });

  it('skips to the same one-time release and safe active actor', async () => {
    const f = fixture(); await handoff(f, true); f.tick();
    expect(f.release).toHaveBeenCalledOnce();
    expect(f.state.completedScenes).toContain('c1.cine.patient-release');
    expect(f.patient.getSnapshots()[0]?.lastKnownPlayer).toBeNull();
    f.playback!.skip(); f.chase.update(1); await flush();
    expect(f.release).toHaveBeenCalledOnce();
    expect(f.chase.getSnapshot().attempt).toBe(1);
  });

  it('rejects Nurse overlap, an unexpected live handoff and disconnected Patient approach before saving', async () => {
    const f = fixture({ nurseClear: false });
    expect((await f.chase.prepare()).valid).toBe(false);
    expect(f.save).not.toHaveBeenCalled();
    f.nurseClear(true); f.position(p(11, 0));
    expect((await f.chase.prepare()).valid).toBe(false);
    expect(f.save).not.toHaveBeenCalled();
    const blocked = fixture({ sealedDivider: true });
    expect((await blocked.chase.prepare()).valid).toBe(false);
    expect(blocked.release).not.toHaveBeenCalled();
  });

  it('uses real sight and movement for pursuit and grace/dwell capture, then restores the prepared checkpoint', async () => {
    const f = fixture(); await handoff(f);
    f.position(p(-6, 0)); f.tick(3);
    expect(f.chase.getSnapshot().phase).toBe('active');
    expect(f.runtime.player.getSnapshot().captured).toBe(false);
    for (let i = 0; i < 120 && f.chase.getSnapshot().phase !== 'captured'; i++) f.tick();
    expect(f.chase.getSnapshot().phase).toBe('captured');
    expect(f.started).toHaveLength(1);
    expect(f.cues.filter(cue => cue.id === 'capture')).toHaveLength(1);
    expect(await f.chase.retry()).toBe(true);
    expect(f.restore).toHaveBeenCalledWith('test:checkpoint-ref');
    expect(f.chase.getSnapshot()).toMatchObject({ phase: 'ready', pursuing: false, error: null });
    expect(f.patient.getSnapshots()).toEqual([]);
    expect(f.runtime.player.getSnapshot().captured).toBe(false);
    expect(f.state.puzzle).toMatchObject({ busArmed: true, handleLocation: 'installed', releaseConfirmed: false });
    expect(f.state.clues).toContain('withdrawal-record');
    expect(f.state.completedScenes).not.toContain('c1.cine.patient-release');
    expect(f.state.atSafeBoundary).toBe('chapter1.before-patient');
    expect(f.save).toHaveBeenCalledOnce();
    expect(f.chase.confirmRelease()).toBe(true); f.chase.update(0.3); await flush();
    expect(f.chase.getSnapshot().attempt).toBe(2);
    expect(f.patient.getSnapshots()).toHaveLength(1);
  });

  it('lets an unseen concealed player break pursuit while AI searches its last true observation', async () => {
    const f = fixture(); await handoff(f); f.position(p(-6, 0));
    for (let i = 0; i < 30 && f.started.length === 0; i++) f.tick();
    expect(f.started).toHaveLength(1);
    f.position(p(8, 0)); f.runtime.player.setHiding('hidden', 'test:unseen-hide');
    f.events.emit('hiding:state', { playerId: 'player', spotId: 'test:unseen-hide', previous: 'outside', current: 'entering', witnessedBy: [] });
    f.tick(180);
    expect(f.chase.getSnapshot()).toMatchObject({ phase: 'active', pursuing: false });
    expect(f.runtime.player.getSnapshot().captured).toBe(false);
    expect(f.ended).toContain('escaped');
    expect(f.patient.getSnapshots()[0]?.lastKnownPlayer?.position.x).toBeLessThan(0);
    expect(f.cues.map(cue => cue.id)).toContain('search');
  });

  it('requires actual landing, occupancy-safe closure, blocked LOS and blocked navigation before escape', async () => {
    const f = fixture(); await handoff(f); f.tick();
    expect(f.chase.tryEscape()).toBe(false);
    f.position(p(17, 0)); f.allowSeal(false);
    expect(f.chase.tryEscape()).toBe(false);
    expect(f.chase.getSnapshot().phase).toBe('active');
    expect(f.runtime.player.controlsLocked).toBe(false);
    f.allowSeal(true); f.fakeSeal(true);
    // The adapter claims containment, but the real route is still open.
    expect(f.chase.tryEscape()).toBe(false);
    f.fakeSeal(false);
    const actor = f.patient.getSnapshots()[0]!;
    const count = f.rapier.colliders.len();
    expect(f.chase.tryEscape()).toBe(true);
    expect(f.started).toEqual([]); // An active chase is not required to earn escape.
    expect(f.chase.getSnapshot()).toMatchObject({ phase: 'escaped', pursuing: false });
    expect(f.patient.phase).toBe('settled');
    expect(f.patient.getSnapshots()[0]?.position).toEqual(actor.position);
    expect(f.rapier.colliders.len()).toBe(count);
    expect(f.state.stairReached).toBe(true);
    expect(f.state.completedScenes).not.toContain('c1.cine.ending');
    expect(f.chase.tryEscape()).toBe(false);
    expect(f.cues.filter(cue => cue.id === 'escape')).toHaveLength(1);
  });

  it('does not activate or commit a stale cinematic result after disposal', async () => {
    const f = fixture();
    expect((await f.chase.prepare()).valid).toBe(true); expect(f.chase.confirmRelease()).toBe(true);
    f.chase.update(0.3); f.chase.dispose(); await flush();
    expect(f.chase.getSnapshot().phase).toBe('disposed');
    expect(f.patient.getSnapshots()).toEqual([]);
    expect(f.started).toEqual([]);
    expect(f.runtime.player.controlsLocked).toBe(false);
    expect(f.state.completedScenes).not.toContain('c1.cine.patient-release');
  });

  it('stops an interrupted reveal and retries without duplicating release listeners or physics', async () => {
    const f = fixture();
    expect((await f.chase.prepare()).valid).toBe(true);
    const count = f.rapier.colliders.len();
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(f.chase.confirmRelease()).toBe(true);
      f.playback!.cancel('test: interrupted reveal'); await flush();
      expect(f.chase.getSnapshot().phase).toBe('interrupted');
      expect(f.runtime.player.controlsLocked).toBe(false);
      expect(await f.chase.retry()).toBe(true);
      expect(f.rapier.colliders.len()).toBe(count);
      expect(f.patient.getSnapshots()).toEqual([]);
    }
    expect(f.release).toHaveBeenCalledTimes(3);
    expect(f.save).toHaveBeenCalledOnce();
    expect(f.restore).toHaveBeenCalledTimes(3);
    expect(f.cues.filter(cue => cue.id === 'retry')).toHaveLength(3);
  });

  it('fails closed if restore rejects and never permits an active actor in a half-restored attempt', async () => {
    const f = fixture();
    expect((await f.chase.prepare()).valid).toBe(true); expect(f.chase.confirmRelease()).toBe(true);
    f.playback!.cancel('test: reveal interrupted'); await flush();
    f.restore.mockRejectedValueOnce(new Error('test: restore failed'));
    expect(await f.chase.retry()).toBe(false);
    expect(f.chase.getSnapshot()).toMatchObject({ phase: 'interrupted', error: 'test: restore failed' });
    expect(f.patient.getSnapshots()).toEqual([]);
    expect(f.chase.confirmRelease()).toBe(false);
  });

  it('ignores checkpoint completion after the director has been disposed', async () => {
    const f = fixture();
    let finish!: (reference: string) => void;
    f.save.mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve; }));
    const preparing = f.chase.prepare(); f.chase.dispose(); finish('test:late-checkpoint');
    expect((await preparing).valid).toBe(false);
    expect(f.chase.getSnapshot().phase).toBe('disposed');
    expect(f.patient.getSnapshots()).toEqual([]);
    expect(f.release).not.toHaveBeenCalled();
  });

  it('pauses the real reveal, active AI and owned presentation while preserving the same resume/cleanup scope', async () => {
    const f = fixture();
    const scope = { stop: vi.fn(), pause: vi.fn(), resume: vi.fn() };
    f.resource(cue => cue.id === 'release' ? scope : undefined);
    expect((await f.chase.prepare()).valid).toBe(true); expect(f.chase.confirmRelease()).toBe(true);
    f.chase.update(0.1);
    const camera = captureCinematicPose(f.camera), elapsed = f.playback!.elapsedSeconds;
    f.chase.pause(); f.chase.pause();
    f.chase.update(10);
    f.chase.fixedUpdate({ deltaSeconds: 1 / 60, elapsedSeconds: 1 / 60 });
    expect(f.playback!.elapsedSeconds).toBe(elapsed);
    expect(captureCinematicPose(f.camera)).toEqual(camera);
    expect(f.patient.getSnapshots()).toEqual([]);
    expect(scope.pause).toHaveBeenCalledOnce();
    f.chase.resume(); f.chase.resume(); f.chase.update(0.2); await flush(); f.tick();
    expect(f.chase.getSnapshot().phase).toBe('active');
    expect(scope.resume).toHaveBeenCalledOnce();
    const at = f.patient.getSnapshots()[0]!.position;
    f.chase.pause();
    for (let i = 0; i < 30; i++) f.chase.fixedUpdate({ deltaSeconds: 1 / 60, elapsedSeconds: 0.1 });
    expect(f.patient.getSnapshots()[0]!.position).toEqual(at);
    f.chase.resume(); f.tick(3);
    expect(f.patient.getSnapshots()[0]!.position).not.toEqual(at);
    f.chase.interrupt('test: end scope');
    expect(scope.stop).toHaveBeenCalledOnce();
    expect(f.runtime.player.controlsLocked).toBe(false);
  });

  it('retains recovery authority when the real release adapter fails and clears the pending core scene', async () => {
    const f = fixture(); expect((await f.chase.prepare()).valid).toBe(true);
    f.release.mockImplementationOnce(() => { throw new Error('test: release motor failed'); });
    expect(f.chase.confirmRelease()).toBe(false); await flush();
    expect(f.chase.getSnapshot()).toMatchObject({ phase: 'interrupted', error: 'test: release motor failed', checkpointReference: 'test:checkpoint-ref' });
    expect(f.state.activeScene).toBeNull();
    expect(f.state.completedScenes).not.toContain('c1.cine.patient-release');
    expect(f.runtime.player.controlsLocked).toBe(false); expect(f.patient.getSnapshots()).toEqual([]);
    expect(await f.chase.retry()).toBe(true);
    expect(f.state.puzzle.releaseConfirmed).toBe(false);
    expect(f.chase.confirmRelease()).toBe(true); f.chase.update(0.3); await flush();
    expect(f.chase.getSnapshot().phase).toBe('active');
  });

  it('permits optional route inspection after preparation without losing the saved release boundary', async () => {
    const f = fixture(); expect((await f.chase.prepare()).valid).toBe(true);
    expect(f.session.chapter.dispatch({ type: 'inspect', clue: 'patient-chart' }).accepted).toBe(true);
    expect(f.state.atSafeBoundary).toBeNull();
    expect(f.chase.confirmRelease()).toBe(true); f.chase.update(0.3); await flush();
    expect(f.chase.getSnapshot().phase).toBe('active');
    expect(f.save).toHaveBeenCalledOnce();
    expect(f.state.clues).toContain('patient-chart');
  });

  it('settles safely when a presentation callback disposes the director or fails during real perception', async () => {
    const disposed = fixture(); expect((await disposed.chase.prepare()).valid).toBe(true);
    disposed.hook(cue => { if (cue.id === 'release') disposed.chase.dispose(); });
    expect(() => disposed.chase.confirmRelease()).not.toThrow(); await flush();
    expect(disposed.chase.getSnapshot().phase).toBe('disposed');
    expect(disposed.state.activeScene).toBeNull(); expect(disposed.patient.getSnapshots()).toEqual([]);
    expect(disposed.runtime.player.controlsLocked).toBe(false);

    const failed = fixture(); await handoff(failed);
    const noActorCount = failed.rapier.colliders.len() - 1;
    failed.hook(cue => { if (cue.id === 'pursuit') throw new Error('test: render adapter failed'); });
    failed.position(p(-6, 0));
    expect(() => failed.tick(12)).not.toThrow();
    expect(failed.chase.getSnapshot()).toMatchObject({ phase: 'interrupted', error: 'test: render adapter failed' });
    expect(failed.patient.getSnapshots()).toEqual([]); expect(failed.rapier.colliders.len()).toBe(noActorCount);
    expect(failed.runtime.player.controlsLocked).toBe(false);
    expect(await failed.chase.retry()).toBe(true);
    expect(failed.chase.getSnapshot().phase).toBe('ready');
  });
});
