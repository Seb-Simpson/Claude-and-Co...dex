import {
  AmbientLight, BoxGeometry, Color, DirectionalLight, Group, Mesh, MeshStandardMaterial,
} from 'three';
import type {
  ColliderDefinition, EntitySnapshot, GameModule, HospitalWorld, NavigationAgent,
  NavigationProvider, SpawnPose, Vec3,
} from '../../../src/contracts';
import { createEngine } from '../../../src/engine';
import { createEventBus, createModuleRegistry } from '../../../src/integration';
import { createGameplayRuntime } from '../../../src/gameplay/runtime';
import type { GameplayRuntime } from '../../../src/gameplay/runtime';
import { createBrowserInput } from '../../../src/gameplay/input';
import { createNavigationProvider } from '../../../src/physics';
import { createPatientEncounter } from '../../../src/entities/patientEncounter';
import { createEntityPresentation } from '../../../src/entities/presentation';
import { resolveEntityProfile } from '../../../src/entities/profiles';
import { captureCinematicPose, createCinematicPlayer } from '../../../src/gameplay/chapter/cinematics';
import { createPatientChase } from '../../../src/gameplay/chapter/patientChase';
import type { PatientChaseCheckpoint, PatientChaseSnapshot } from '../../../src/gameplay/chapter/patientChase';
import type { PatientChaseLayout, PatientChaseReadiness } from '../../../src/gameplay/chapter/patientChaseLayout';
import { applyChapterCommand, createInitialChapterState } from '../../../src/gameplay/chapter/progression';
import type { ChapterCommand, ChapterSceneId, ChapterState } from '../../../src/gameplay/chapter/model';
import { audioOutput } from '../../../src/audio/mixer';

const rotation = { x: 0, y: 0, z: 0, w: 1 };
const feet = (x: number, z: number): Vec3 => ({ x, y: 0.005, z });
const handoff: SpawnPose = { position: feet(8, 0), yaw: Math.PI / 2 };
const enemySpawn: SpawnPose = { position: feet(-8, 0), yaw: -Math.PI / 2 };
const openDoor = { position: { x: 15, y: -10, z: 0 }, rotation };
const closedDoor = { position: { x: 15, y: 1.6, z: 0 }, rotation };
const layout: PatientChaseLayout = {
  revision: 'isolated-patient-qa-v1', playerHandoff: handoff, patientStage: enemySpawn,
  chime: feet(6, 0), exitApproach: feet(14, 0),
  routes: [
    { id: 'north', points: [handoff.position, feet(10, -4), feet(14, 0)] },
    { id: 'south', points: [handoff.position, feet(10, 4), feet(14, 0)] },
  ],
};
// Only loss/recovery is shortened to expose a corner-search cycle in this small fixture.
// Investigation/search, pursuit/capture speeds, grace/dwell and capsule use production defaults.
const profile = resolveEntityProfile('patient', {
  loseSightSeconds: 0.35, lostTargetSeconds: 0.15, recoverySeconds: 0.6,
});
const playerAgent: NavigationAgent = { radius: 0.28, height: 1.8, maxStepHeight: 0.25, maxSlopeRadians: Math.PI / 4 };
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function beforePatient(): ChapterState {
  let state = createInitialChapterState();
  const dispatch = (command: ChapterCommand): void => {
    const result = applyChapterCommand(state, command);
    if (!result.accepted) throw new Error(result.reason);
    state = result.state;
  };
  const scene = (id: ChapterSceneId): void => {
    dispatch({ type: 'request-scene', id, safe: true });
    dispatch({ type: 'settle-scene', token: state.activeScene!.token, outcome: 'skipped' });
  };
  scene('c1.cine.awakening');
  dispatch({ type: 'inspect', clue: 'current-intake' }); dispatch({ type: 'inspect', clue: 'unanswered-call' });
  dispatch({ type: 'reach-station' }); dispatch({ type: 'inspect', clue: 'night-ledger' }); scene('c1.cine.nurse-reveal');
  dispatch({ type: 'survive-nurse', method: 'quiet-route', contactBroken: true, atReviewDesk: true });
  dispatch({ type: 'inspect', clue: 'release-procedure' }); dispatch({ type: 'collect-operating-handle' }); scene('c1.cine.record');
  dispatch({ type: 'visit-panel' });
  for (const command of [
    { type: 'set-reserve', enabled: true }, { type: 'set-observation-link', value: 'isolated' },
    { type: 'select-destination', value: 'egress' }, { type: 'engage' },
  ] as const) dispatch({ type: 'puzzle', command });
  dispatch({ type: 'commit-checkpoint', id: 'chapter1.after-records-power', safe: true });
  dispatch({ type: 'install-operating-handle' }); dispatch({ type: 'commit-checkpoint', id: 'chapter1.before-patient', safe: true });
  return state;
}

/** Only the isolated test page imports this fixture; no hospital assets/files are replaced. */
function fixture(): { world: HospitalWorld; gate: Mesh; dispose(): void } {
  const root = new Group(); root.name = 'patient-qa:world';
  const geometry = new BoxGeometry(1, 1, 1);
  const materials: MeshStandardMaterial[] = [];
  function box(name: string, position: Vec3, dimensions: Vec3, color: string): Mesh {
    const material = new MeshStandardMaterial({ color, roughness: 0.9 }); materials.push(material);
    const mesh = new Mesh(geometry, material); mesh.name = name; mesh.position.copy(position);
    mesh.scale.copy(dimensions); root.add(mesh); return mesh;
  }
  box('qa:floor', { x: 0, y: -0.1, z: 0 }, { x: 40, y: 0.2, z: 24 }, '#354a50');
  box('qa:divider', { x: 0, y: 1.6, z: 0 }, { x: 0.24, y: 3.2, z: 6 }, '#91a8a0');
  box('qa:cover', { x: 11.5, y: 1.6, z: 0 }, { x: 1.2, y: 3.2, z: 4.2 }, '#536c77');
  box('qa:north-marker', { x: 10, y: 0.04, z: -4 }, { x: 1, y: 0.08, z: 1 }, '#cfb078');
  box('qa:south-marker', { x: 10, y: 0.04, z: 4 }, { x: 1, y: 0.08, z: 1 }, '#8fa9c4');
  box('qa:safe-floor', { x: 17.5, y: 0.02, z: 0 }, { x: 3, y: 0.04, z: 4 }, '#73896b');
  const gate = box('qa:exit-gate', openDoor.position, { x: 0.24, y: 3.2, z: 24 }, '#283a45');
  root.add(new AmbientLight('#d8e4dd', 2));
  const light = new DirectionalLight('#f7e6cb', 2.5); light.position.set(5, 8, 2); root.add(light);
  const colliders: ColliderDefinition[] = [
    { id: 'qa:floor', bodyType: 'fixed', sensor: false, shape: { type: 'box', halfExtents: { x: 20, y: 0.1, z: 12 } }, pose: { position: { x: 0, y: -0.1, z: 0 }, rotation } },
    { id: 'qa:divider', bodyType: 'fixed', sensor: false, shape: { type: 'box', halfExtents: { x: 0.12, y: 1.6, z: 3 } }, pose: { position: { x: 0, y: 1.6, z: 0 }, rotation } },
    { id: 'qa:cover', bodyType: 'fixed', sensor: false, shape: { type: 'box', halfExtents: { x: 0.6, y: 1.6, z: 2.1 } }, pose: { position: { x: 11.5, y: 1.6, z: 0 }, rotation } },
    { id: 'qa:exit-gate', bodyType: 'kinematic', sensor: false, shape: { type: 'box', halfExtents: { x: 0.12, y: 1.6, z: 12 } }, pose: openDoor },
  ];
  return {
    world: { id: 'qa:patient-chase', root, bounds: { min: { x: -20, y: -0.2, z: -12 }, max: { x: 20, y: 4, z: 12 } },
      rooms: [], doors: [], interactables: [], hidingLocations: [], entitySpawns: [], patrolRoutes: [], colliders, playerSpawn: handoff },
    gate, dispose() { geometry.dispose(); for (const material of materials) material.dispose(); },
  };
}

export interface PatientHarnessSnapshot {
  ready: boolean;
  chase: PatientChaseSnapshot;
  patientPhase: string;
  patient: EntitySnapshot | null;
  player: { position: Vec3; captured: boolean; controlsLocked: boolean };
  core: ChapterState;
  released: boolean;
  sealed: boolean;
  frames: number;
  canvasCount: number;
  colliderCount: number;
  gpu: { geometries: number; textures: number };
  audioState: string;
  navQueries: number;
  noiseEvents: number;
  restoreCount: number;
  cues: readonly string[];
  events: readonly { type: string; state?: string; reason?: string; position?: Vec3 }[];
  trail: readonly Vec3[];
  profile: { pursuitSpeed: number; loseSightSeconds: number; captureGraceSeconds: number; captureDwellSeconds: number };
  performance: unknown;
}
export interface PatientChaseHarness {
  readonly ready: boolean;
  snapshot(): PatientHarnessSnapshot;
  prepare(): Promise<PatientChaseReadiness>;
  confirm(): boolean;
  skip(): void;
  walkRoute(id: 'north' | 'south'): void;
  stopWalking(): void;
  retry(): Promise<boolean>;
  dispose(): Promise<void>;
}
declare global { interface Window { nwPatientHarness: PatientChaseHarness } }

async function start(): Promise<void> {
  const stage = document.querySelector<HTMLElement>('#stage')!;
  const status = document.querySelector<HTMLElement>('#status')!;
  const errorBox = document.querySelector<HTMLElement>('#error')!;
  const fail = (error: unknown) => { errorBox.hidden = false; errorBox.textContent = String(error); console.error(error); };
  const engine = await createEngine({ container: stage, maxPixelRatio: 0.75, onError: fail });
  engine.services.scene.background = new Color('#14232c');
  engine.services.renderer.domElement.setAttribute('aria-label', 'Patient chase isolated WebGL test scene');
  const events = createEventBus();
  const registry = createModuleRegistry(engine.services, events);
  const build = fixture();
  let game!: GameplayRuntime;
  let state = beforePatient();
  let ready = false, disposed = false, released = false, sealed = false;
  let finalSnapshot: PatientHarnessSnapshot | null = null;
  let closedAudio: AudioContext | null = null;
  let frames = 0, navQueries = 0, noiseEvents = 0, restoreCount = 0;
  const eventLog: { type: string; state?: string; reason?: string; position?: Vec3 }[] = [];
  const trail: Vec3[] = [], cues: string[] = [];
  let assistedGoals: Vec3[] = [], assistedPath: Vec3[] = [];
  let navigation!: NavigationProvider;
  let chase!: ReturnType<typeof createPatientChase>;
  const browser = createBrowserInput({ element: engine.services.renderer.domElement,
    onLook: (x, y) => game?.player.look(x, y),
    onInteract: () => { if (chase?.getSnapshot().phase === 'ready') chase.confirmRelease(); else chase?.tryEscape(); },
  });
  const input = {
    get locked() { return browser.locked; },
    setSuppressed(value: boolean) { browser.setSuppressed(value); },
    read() {
      if (!browser.locked || (!assistedGoals.length && !assistedPath.length)) return browser.read();
      const at = game.player.getSnapshot().position;
      while (assistedPath.length && distance(at, assistedPath[0]!) < 0.22) assistedPath.shift();
      while (!assistedPath.length && assistedGoals.length) {
        const target = assistedGoals.shift()!;
        if (distance(at, target) < 0.22) continue;
        const path = navigation.findPath({ from: at, to: target, agent: playerAgent });
        if (!path?.reachesGoal) throw new Error('QA player route is physically blocked');
        assistedPath = path.waypoints.map(p => ({ ...p }));
        while (assistedPath.length && distance(at, assistedPath[0]!) < 0.22) assistedPath.shift();
      }
      const target = assistedPath[0];
      if (!target) return browser.read();
      game.player.setViewRotation({ yaw: Math.atan2(at.x - target.x, at.z - target.z), pitch: 0 });
      return { forward: 1, right: 0, sprint: true, crouch: false };
    },
    dispose() { browser.dispose(); },
  };
  registry.register({ id: 'qa:patient-world-module', kind: 'world', setup: () => ({ world: build.world, dispose: build.dispose }) } satisfies GameModule);
  registry.register({ id: 'qa:patient-gameplay-module', kind: 'gameplay', setup(context) {
    game = createGameplayRuntime(context, { showHud: false, activeEntityTypes: [], input });
    return game;
  } } satisfies GameModule);
  await registry.start();
  const actualNavigation = createNavigationProvider(game.physics, build.world.bounds, { cellSize: 0.25, maxNodes: 4096 });
  navigation = { findPath(query) { navQueries++; return actualNavigation.findPath(query); },
    isPositionValid: (p, a) => actualNavigation.isPositionValid(p, a), hasLineOfSight: q => actualNavigation.hasLineOfSight(q) };
  const patient = createPatientEncounter({
    spawn: { id: 'qa:patient-spawn', entityId: 'qa:patient', type: 'patient', ...enemySpawn },
    route: { id: 'qa:patient-round', points: [enemySpawn.position], loop: true },
    physics: game.physics, navigation, player: game.player, events, profile,
  });
  // Replace the empty runtime bridge in this isolated fixture; never own one actor twice.
  game.presentation.dispose();
  const presentation = createEntityPresentation(engine.services.scene, patient);
  const cinematic = createCinematicPlayer({ camera: engine.services.camera,
    acquireControl: () => game.acquireCinematicControl(), validateHandoff: () => true });
  for (const type of ['chase:started', 'chase:ended', 'entity:state', 'player:captured'] as const) events.on(type, event => {
    const entry = { type, ...('current' in event ? { state: event.current } : {}),
      ...('reason' in event ? { reason: event.reason } : {}), ...('position' in event ? { position: { ...event.position } } : {}) };
    eventLog.push(entry); if (eventLog.length > 128) eventLog.shift();
    if (type === 'player:captured' && document.pointerLockElement) document.exitPointerLock();
  });
  events.on('player:noise', () => { noiseEvents++; });
  let saved: PatientChaseCheckpoint | null = null;
  const setGate = (close: boolean): boolean => {
    const pose = close ? closedDoor : openDoor;
    if (!game.physics.trySetColliderPoses([{ id: 'qa:exit-gate', pose }])) return false;
    build.gate.position.copy(pose.position); sealed = close; return true;
  };
  chase = createPatientChase({ layout, chimeRadius: 60,
    session: () => ({ id: 'qa:patient-session', events, player: game.player, patient, physics: game.physics,
      navigation: { player: navigation, patient: navigation, playerAgent, patientProfile: profile },
      chapter: { getState: () => state, dispatch(command) { const result = applyChapterCommand(state, command); state = result.state; return result; } },
      cinematic, nurseIsClear: () => true,
      reveal() {
        const pose = captureCinematicPose(engine.services.camera);
        return { id: 'c1.cine.patient-release', durationSeconds: 0.8, skipBlendSeconds: 0.15,
          camera: [{ atSeconds: 0, pose }, { atSeconds: 0.8, pose }], cues: [] };
      },
      world: {
        release() { released = true; }, isReleased: () => released,
        isAtSafeLanding: p => p.position.x >= 16.5 && Math.abs(p.position.z) <= 2,
        trySealExit() {
          if ((patient.getSnapshots()[0]?.position.x ?? 100) > 14.4) return false;
          return setGate(true);
        },
        isExitContained: () => sealed,
      },
    }),
    checkpoints: {
      async save(checkpoint) { saved = structuredClone(checkpoint); return 'qa:before-patient'; },
      async restore(reference) {
        if (reference !== 'qa:before-patient' || !saved) throw new Error('Missing real QA checkpoint payload');
        patient.deactivate(); patient.reset();
        assistedGoals = []; assistedPath = [];
        if (!setGate(false)) throw new Error('Exit restoration is obstructed');
        game.player.setCaptured(false);
        if (!game.player.body.canOccupy(handoff.position) || !game.physics.hasSupport(handoff.position, playerAgent.radius)) throw new Error('Checkpoint position became invalid');
        game.player.body.setPosition(handoff.position); game.player.setViewRotation({ yaw: handoff.yaw, pitch: 0 });
        game.player.update({ deltaSeconds: 0.1, elapsedSeconds: 0 });
        state = structuredClone(saved.core.state); released = false; restoreCount++;
      },
    },
    cue(cue) {
      cues.push(cue.id); if (cues.length > 64) cues.shift();
      if (cue.id !== 'release' && cue.id !== 'alarm-pulse') return;
      const context = engine.services.audio.context;
      if (!context || context.state !== 'running') return;
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.frequency.value = cue.id === 'release' ? 440 : 660;
      gain.gain.setValueAtTime(0.025, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.14);
      oscillator.connect(gain); gain.connect(audioOutput(context, 'sfx')); oscillator.start(); oscillator.stop(context.currentTime + 0.15);
      let stopped = false;
      return () => { if (stopped) return; stopped = true; oscillator.onended = null; try { oscillator.stop(); } catch { /* One-shot already ended. */ } oscillator.disconnect(); gain.disconnect(); };
    },
  });
  const api: PatientChaseHarness = {
    get ready() { return ready; },
    snapshot() {
      if (disposed && finalSnapshot) return { ...finalSnapshot, ready: false, chase: chase.getSnapshot(),
        patientPhase: patient.phase, patient: null, canvasCount: stage.querySelectorAll('canvas').length,
        colliderCount: 0, audioState: closedAudio?.state ?? 'not-created' };
      const player = game.player.getSnapshot(), actor = patient.getSnapshots()[0];
      return { ready, chase: chase.getSnapshot(), patientPhase: patient.phase, patient: actor ?? null,
        player: { position: { ...player.position }, captured: player.captured, controlsLocked: game.player.controlsLocked }, core: structuredClone(state),
        released, sealed, frames, canvasCount: stage.querySelectorAll('canvas').length,
        colliderCount: disposed ? 0 : engine.services.physics.colliders.len(),
        gpu: { geometries: engine.services.renderer.info.memory.geometries, textures: engine.services.renderer.info.memory.textures },
        audioState: engine.services.audio.context?.state ?? 'not-created', navQueries, noiseEvents, restoreCount,
        cues: [...cues], events: structuredClone(eventLog), trail: trail.map(p => ({ ...p })),
        profile: { pursuitSpeed: profile.pursuitSpeed, loseSightSeconds: profile.loseSightSeconds, captureGraceSeconds: profile.captureGraceSeconds, captureDwellSeconds: profile.captureDwellSeconds },
        performance: engine.getPerformanceSnapshot?.() ?? null,
      };
    },
    prepare: () => chase.prepare(), confirm: () => chase.confirmRelease(), skip: () => chase.skipReveal(),
    walkRoute(id) {
      const route = layout.routes.find(r => r.id === id);
      if (!route) throw new Error('Unknown QA route');
      assistedGoals = [...route.points.slice(1).map(p => ({ ...p })), feet(17.5, 0)]; assistedPath = [];
    },
    stopWalking() { assistedGoals = []; assistedPath = []; }, retry: () => chase.retry(),
    async dispose() {
      if (disposed) return;
      finalSnapshot = api.snapshot();
      ready = false; engine.stop(); chase.dispose(); patient.dispose(); cinematic.dispose(); presentation.dispose();
      await registry.dispose(); events.dispose();
      if (engine.services.physics.colliders.len() !== 0) throw new Error('Patient QA teardown leaked physics');
      closedAudio = engine.services.audio.context;
      await engine.dispose(); disposed = true;
    },
  };
  window.nwPatientHarness = api;
  engine.start({
    fixedUpdate(frame) {
      registry.fixedUpdate(frame); chase.fixedUpdate(frame);
      const at = patient.getSnapshots()[0]?.position;
      if (at && frames % 6 === 0) { trail.push({ ...at }); if (trail.length > 256) trail.shift(); }
      if (chase.getSnapshot().phase === 'active') chase.tryEscape();
    },
    update(frame) {
      registry.update(frame); chase.update(frame.deltaSeconds); presentation.update(); frames++;
      const snapshot = chase.getSnapshot(); status.textContent = `QA encounter: ${snapshot.phase} · Patient: ${patient.getSnapshots()[0]?.state ?? patient.phase} · ${snapshot.error ?? 'E confirms release; both labelled branches are traversable.'}`;
    },
  });
  const action = (fn: () => void | Promise<unknown>) => () => { try { void Promise.resolve(fn()).catch(fail); } catch (e) { fail(e); } };
  document.querySelector('#audio')!.addEventListener('click', action(() => engine.services.audio.resume()));
  document.querySelector('#prepare')!.addEventListener('click', action(async () => { const result = await api.prepare(); if (!result.valid) throw new Error(result.issues.join(' ')); }));
  document.querySelector('#confirm')!.addEventListener('click', action(() => { if (!api.confirm()) throw new Error('Release is not ready'); }));
  document.querySelector('#skip')!.addEventListener('click', () => api.skip());
  document.querySelector('#west')!.addEventListener('click', () => api.walkRoute('north'));
  document.querySelector('#east')!.addEventListener('click', () => api.walkRoute('south'));
  document.querySelector('#retry')!.addEventListener('click', action(async () => { if (!await api.retry()) throw new Error('Retry has no safe saved checkpoint'); }));
  for (const button of document.querySelectorAll<HTMLButtonElement>('button')) button.disabled = false;
  window.addEventListener('pagehide', () => { void api.dispose().catch(fail); }, { once: true });
  ready = true;
}
void start().catch(error => {
  const box = document.querySelector<HTMLElement>('#error')!; box.hidden = false; box.textContent = String(error); console.error(error);
});
