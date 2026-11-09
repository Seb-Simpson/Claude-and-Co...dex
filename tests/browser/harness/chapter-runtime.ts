import { AmbientLight, BoxGeometry, Color, DirectionalLight, Euler, Group, Mesh, MeshStandardMaterial, Quaternion } from 'three';
import type { GameModule, HospitalWorld } from '../../../src/contracts';
import { createEngine } from '../../../src/engine';
import type { Engine } from '../../../src/engine/createEngine';
import type { EnginePerformanceSnapshot } from '../../../src/engine/performance';
import { outputLevel } from '../../../src/audio/mixer';
import { createEventBus, createModuleRegistry } from '../../../src/integration';
import type { EventBus } from '../../../src/integration/events';
import type { ModuleRegistry } from '../../../src/integration/registry';
import { createGameplayRuntime } from '../../../src/gameplay/runtime';
import type { GameplayRuntime } from '../../../src/gameplay/runtime';
import { captureCinematicPose, createCinematicPlayer } from '../../../src/gameplay/chapter/cinematics';
import type { CinematicDefinition, CinematicPlayback, CinematicPlayer, CinematicResult } from '../../../src/gameplay/chapter/cinematics';
import { CHAPTER_DIALOGUE, createBufferedDialogueVoiceAdapter, createDialoguePlayer } from '../../../src/gameplay/chapter/dialogue';
import type { DialogueCue, DialoguePlayer } from '../../../src/gameplay/chapter/dialogue';

const identity = { x: 0, y: 0, z: 0, w: 1 };
const stage = document.querySelector<HTMLElement>('#stage')!;
const status = document.querySelector<HTMLElement>('#status')!;
const subtitle = document.querySelector<HTMLElement>('#subtitle')!;
const errorElement = document.querySelector<HTMLElement>('#error')!;

export interface ChapterHarnessSnapshot {
  readonly ready: boolean;
  readonly disposed: boolean;
  readonly generation: number;
  readonly frameCount: number;
  readonly canvasCount: number;
  readonly worldCount: number;
  readonly colliderCount: number;
  readonly bodyCount: number;
  readonly moduleSetups: number;
  readonly moduleDisposals: number;
  readonly locked: boolean;
  readonly controlsLocked: boolean;
  readonly position: { x: number; y: number; z: number };
  readonly rotation: { yaw: number; pitch: number };
  readonly camera: { x: number; y: number; z: number };
  readonly phase: string;
  readonly elapsedSeconds: number;
  readonly noiseCount: number;
  readonly noiseDuringControl: number;
  readonly previewCount: number;
  readonly audioState: string;
  readonly draws: number;
  readonly triangles: number;
  readonly pixelRatio: number;
  readonly gpuResources: { geometries: number; textures: number; programs: number };
  readonly performance: EnginePerformanceSnapshot | null;
  readonly outcomes: readonly CinematicResult[];
}
export interface NativeAudioClockProbe {
  readonly fixture: 'generated diagnostic sine tone; not a chapter voice';
  readonly audioAdvanceSeconds: number;
  readonly timelineSeconds: number;
  readonly caption: string;
  readonly cameraDeltaX: number;
  readonly outputRms: number;
  readonly stoppedFrameCount: number;
  readonly sampledFrameCount: number;
  readonly cameraIdentityPreserved: boolean;
  readonly canvasIdentityPreserved: boolean;
  readonly collidersBefore: number;
  readonly collidersAfter: number;
  readonly audioState: string;
}
export interface ChapterRuntimeHarness {
  readonly ready: boolean;
  snapshot(): ChapterHarnessSnapshot;
  play(durationSeconds?: number): void;
  pause(): void;
  resume(): void;
  skip(): void;
  cancel(): void;
  restart(): Promise<void>;
  dispose(): Promise<void>;
  nativeAudioClockProbe(): Promise<NativeAudioClockProbe>;
  productionRejections(): readonly { id: string; reason: string }[];
}
declare global { interface Window { nwChapterHarness: ChapterRuntimeHarness } }

/** All geometry is test-only. Nothing imports or replaces Claude's hospital assets. */
function fixture(): { world: HospitalWorld; dispose(): void } {
  const root = new Group(); root.name = 'nw004:isolated-world';
  const geometry = new BoxGeometry(1, 1, 1);
  const materials: MeshStandardMaterial[] = [];
  function box(size: readonly [number, number, number], position: readonly [number, number, number], color: string): void {
    const material = new MeshStandardMaterial({ color, roughness: 0.85 }); materials.push(material);
    const mesh = new Mesh(geometry, material); mesh.scale.set(...size); mesh.position.set(...position); root.add(mesh);
  }
  box([14, 0.2, 14], [0, -0.1, 0], '#4b6169');
  box([12, 3, 0.2], [0, 1.5, -3], '#9db4b2');
  box([0.5, 1.6, 0.5], [-1.5, 0.8, -1.8], '#dcaa71');
  box([0.5, 1.6, 0.5], [1.5, 0.8, -1.8], '#638cba');
  root.add(new AmbientLight('#d9e6e3', 1.8));
  const light = new DirectionalLight('#ffe8c8', 2.5); light.position.set(3, 6, 4); root.add(light);
  const world: HospitalWorld = {
    id: 'nw004:isolated-systems-fixture', root,
    bounds: { min: { x: -7, y: -0.2, z: -7 }, max: { x: 7, y: 4, z: 7 } },
    rooms: [], interactables: [], doors: [], hidingLocations: [], entitySpawns: [], patrolRoutes: [],
    playerSpawn: { position: { x: 0, y: 0.005, z: 3 }, yaw: 0 },
    colliders: [
      { id: 'nw004:test:floor', bodyType: 'fixed', sensor: false,
        shape: { type: 'box', halfExtents: { x: 7, y: 0.1, z: 7 } }, pose: { position: { x: 0, y: -0.1, z: 0 }, rotation: identity } },
      { id: 'nw004:test:wall', bodyType: 'fixed', sensor: false,
        shape: { type: 'box', halfExtents: { x: 6, y: 1.5, z: 0.1 } }, pose: { position: { x: 0, y: 1.5, z: -3 }, rotation: identity } },
    ],
  };
  return { world, dispose() { geometry.dispose(); for (const material of materials) material.dispose(); } };
}

async function start(): Promise<void> {
  let ready = false;
  let disposed = false;
  let restarting = false;
  let probing = false;
  let generation = 0;
  let frameCount = 0;
  let moduleSetups = 0;
  let moduleDisposals = 0;
  let noiseCount = 0;
  let noiseDuringControl = 0;
  let previewCount = 0;
  let registry: ModuleRegistry | undefined;
  let events: EventBus | undefined;
  let game: GameplayRuntime | undefined;
  let cinematic: CinematicPlayer | undefined;
  let dialogue: DialoguePlayer | undefined;
  let playback: CinematicPlayback | undefined;
  let oldAudio: AudioContext | null = null;
  const outcomes: CinematicResult[] = [];
  const fail = (error: unknown): void => {
    errorElement.hidden = false;
    errorElement.textContent = error instanceof Error ? error.message : String(error);
    console.error(error);
  };
  const engine: Engine = await createEngine({ container: stage, maxPixelRatio: 0.75, onError: fail });
  engine.services.scene.background = new Color('#24343e');
  engine.services.renderer.domElement.setAttribute('aria-label', 'Isolated cinematic systems WebGL test scene');
  const hooks = {
    fixedUpdate: (frame: Parameters<ModuleRegistry['fixedUpdate']>[0]) => registry?.fixedUpdate(frame),
    update(frame: Parameters<ModuleRegistry['update']>[0]) { registry?.update(frame); cinematic?.update(frame.deltaSeconds); frameCount++; },
  };
  const startLoop = (): void => { engine.start(hooks); };

  async function buildSession(): Promise<void> {
    generation++;
    events = createEventBus();
    registry = createModuleRegistry(engine.services, events);
    registry.register({
      id: 'nw004:test-world', kind: 'world', setup() {
        moduleSetups++;
        const build = fixture();
        return { world: build.world, dispose() { moduleDisposals++; build.dispose(); } };
      },
    } satisfies GameModule);
    registry.register({
      id: 'nw004:test-gameplay', kind: 'gameplay', setup(context) {
        moduleSetups++;
        game = createGameplayRuntime(context, { showHud: false, activeEntityTypes: [] });
        const runtime = game;
        return { ...runtime, dispose() { moduleDisposals++; runtime.dispose(); } };
      },
    } satisfies GameModule);
    await registry.start();
    if (!game) throw new Error('Gameplay module did not publish a runtime');
    const runtime = game;
    events.on('player:noise', () => { noiseCount++; if (runtime.player.controlsLocked) noiseDuringControl++; });
    dialogue = createDialoguePlayer({
      mode: 'preview',
      subtitle: line => { subtitle.textContent = line ? `${line.speaker} · PREVIEW — NOT RECORDED: ${line.text}` : ''; },
      onPreview: () => { previewCount++; },
    });
    cinematic = createCinematicPlayer({
      camera: engine.services.camera,
      acquireControl: () => runtime.acquireCinematicControl(),
      validateHandoff: pose => {
        const eye = runtime.player.getSnapshot();
        return Math.abs(pose.position.x - eye.position.x) < 0.02 && Math.abs(pose.position.z - eye.position.z) < 0.02;
      },
      dialogue,
      settled: result => { outcomes.push(result); },
    });
    ready = true;
    status.textContent = 'Ready · one engine, camera and loop · isolated test fixture';
  }

  async function clearSession(): Promise<void> {
    ready = false;
    cinematic?.dispose(); dialogue?.dispose();
    await registry?.dispose();
    events?.dispose();
    cinematic = undefined; dialogue = undefined; playback = undefined;
    registry = undefined; events = undefined; game = undefined;
    subtitle.textContent = '';
  }

  const api: ChapterRuntimeHarness = {
    get ready() { return ready; },
    snapshot() {
      const player = game?.player.getSnapshot();
      const camera = engine.services.camera.position;
      return {
        ready, disposed, generation, frameCount, canvasCount: stage.querySelectorAll('canvas').length,
        worldCount: engine.services.scene.children.filter(child => child.name === 'nw004:isolated-world').length,
        colliderCount: disposed ? 0 : engine.services.physics.colliders.len(),
        bodyCount: disposed ? 0 : engine.services.physics.bodies.len(), moduleSetups, moduleDisposals,
        locked: document.pointerLockElement === engine.services.renderer.domElement,
        controlsLocked: game?.player.controlsLocked ?? false,
        position: player ? { ...player.position } : { x: 0, y: 0, z: 0 },
        rotation: player ? { ...player.rotation } : { yaw: 0, pitch: 0 },
        camera: { x: camera.x, y: camera.y, z: camera.z },
        phase: playback?.state ?? 'idle', elapsedSeconds: playback?.elapsedSeconds ?? 0,
        noiseCount, noiseDuringControl, previewCount,
        audioState: engine.services.audio.context?.state ?? oldAudio?.state ?? 'not-created',
        draws: engine.services.renderer.info.render.calls,
        triangles: engine.services.renderer.info.render.triangles,
        pixelRatio: engine.services.renderer.getPixelRatio(), outcomes: [...outcomes],
        gpuResources: { geometries: engine.services.renderer.info.memory.geometries,
          textures: engine.services.renderer.info.memory.textures, programs: engine.services.renderer.info.programs?.length ?? 0 },
        performance: engine.getPerformanceSnapshot?.() ?? null,
      };
    },
    play(durationSeconds = 3) {
      if (!ready || !cinematic || !game) throw new Error('Harness session is not ready');
      if (!Number.isFinite(durationSeconds) || durationSeconds < 0.5 || durationSeconds > 20) throw new Error('Test path duration must be 0.5–20 seconds');
      const original = captureCinematicPose(engine.services.camera);
      const rotation = new Quaternion().setFromEuler(new Euler(0.05, 0.2, 0, 'YXZ'));
      const middle = { ...original, position: { x: original.position.x + 0.9, y: original.position.y + 0.1, z: original.position.z - 0.3 },
        rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w } };
      const length = durationSeconds * 0.9;
      const preview: DialogueCue = {
        id: 'test:preview:unrecorded', speaker: 'Harness', text: 'Camera and subtitle transport preview; no voice recording is supplied.',
        durationSeconds: length, recordingStatus: 'not-recorded', bus: 'sfx',
        segments: [{ startSeconds: 0, endSeconds: length, text: 'Camera and subtitle transport preview; no voice recording is supplied.' }],
      };
      const definition: CinematicDefinition = {
        id: `test:systems:${generation}:${outcomes.length}`, durationSeconds, skipBlendSeconds: 0.2,
        camera: [{ atSeconds: 0, pose: original }, { atSeconds: durationSeconds * 0.25, pose: middle },
          { atSeconds: durationSeconds * 0.75, pose: middle }, { atSeconds: durationSeconds, pose: original }],
        cues: [{ atSeconds: 0, kind: 'dialogue', dialogue: preview }],
      };
      playback = cinematic.play(definition);
    },
    pause() { playback?.pause(); }, resume() { playback?.resume(); }, skip() { playback?.skip(); },
    cancel() { playback?.cancel('Test interruption'); },
    async restart() {
      if (disposed || restarting || probing) throw new Error('Harness cannot restart now');
      restarting = true;
      try {
        await clearSession();
        if (engine.services.physics.colliders.len() !== 0 || engine.services.physics.bodies.len() !== 0) throw new Error('Session leaked physics objects');
        await buildSession();
      } finally { restarting = false; }
    },
    async dispose() {
      if (disposed) return;
      engine.stop();
      await clearSession();
      if (engine.services.physics.colliders.len() !== 0 || engine.services.physics.bodies.len() !== 0) throw new Error('Disposal leaked physics objects');
      oldAudio = engine.services.audio.context;
      await engine.dispose();
      disposed = true;
      status.textContent = 'Disposed · renderer, physics, controls and audio released';
    },
    async nativeAudioClockProbe() {
      if (!ready || !game || disposed || probing || restarting || game.player.controlsLocked) throw new Error('Native clock probe needs an idle live session');
      const context = engine.services.audio.context;
      if (!context || context.state !== 'running') throw new Error('Unlock the real engine AudioContext first');
      const runtime = game;
      const camera = engine.services.camera;
      const canvas = engine.services.renderer.domElement;
      const original = captureCinematicPose(camera);
      const collidersBefore = engine.services.physics.colliders.len();
      const sampleRate = context.sampleRate;
      const buffer = context.createBuffer(1, sampleRate * 4, sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) {
        const envelope = Math.min(1, i / (sampleRate * 0.02), (samples.length - i) / (sampleRate * 0.02));
        samples[i] = Math.sin(i / sampleRate * Math.PI * 2 * 220) * 0.04 * envelope;
      }
      // Approval applies only to this original test tone. Every chapter line stays unrecorded.
      const diagnostic: DialogueCue = {
        id: 'test:clocktone', speaker: 'Diagnostic tone, not a voice', durationSeconds: 4,
        text: 'Diagnostic clock segment one. Diagnostic clock segment two.',
        recordingStatus: 'approved', assetUrl: 'test-only:generated-clock-tone', bus: 'sfx',
        segments: [
          { startSeconds: 0, endSeconds: 1.5, text: 'Diagnostic clock segment one.' },
          { startSeconds: 1.5, endSeconds: 4, text: 'Diagnostic clock segment two.' },
        ],
      };
      const probeDialogue = createDialoguePlayer({
        mode: 'production',
        playVoice: createBufferedDialogueVoiceAdapter(context, new Map([[diagnostic.assetUrl!, buffer]])),
        subtitle: line => { subtitle.textContent = line ? `DIAGNOSTIC TONE — NOT A CHAPTER VOICE: ${line.text}` : ''; },
      });
      const probeCinematic = createCinematicPlayer({
        camera, acquireControl: () => runtime.acquireCinematicControl(),
        validateHandoff: pose => Math.abs(pose.position.x - original.position.x) < 0.02 && Math.abs(pose.position.z - original.position.z) < 0.02,
        dialogue: probeDialogue,
      });
      const middle = { ...original, position: { ...original.position, x: original.position.x + 0.9 } };
      let handle: CinematicPlayback | undefined;
      probing = true;
      ready = false;
      engine.stop();
      const stoppedFrameCount = frameCount;
      status.textContent = 'Native audio-clock diagnostic: original sine tone, not a chapter voice';
      try {
        // Install the actual master-bus analyser before the source starts so it can collect samples.
        outputLevel(context);
        handle = probeCinematic.play({
          id: 'test:native-clock', durationSeconds: 4.25,
          camera: [{ atSeconds: 0, pose: original }, { atSeconds: 2, pose: middle },
            { atSeconds: 3.5, pose: middle }, { atSeconds: 4.25, pose: original }],
          cues: [{ atSeconds: 0, kind: 'dialogue', dialogue: diagnostic }],
        });
        const audioBegin = context.currentTime;
        // Test-only nonblocking stall: audio continues while the host renderer/simulation is stopped.
        await new Promise<void>(resolve => { window.setTimeout(resolve, 2100); });
        if (disposed) throw new Error('Harness disposed during native audio-clock probe');
        probeCinematic.update(0.1);
        engine.services.renderer.render(engine.services.scene, camera);
        return {
          fixture: 'generated diagnostic sine tone; not a chapter voice',
          audioAdvanceSeconds: context.currentTime - audioBegin,
          timelineSeconds: handle.elapsedSeconds, caption: subtitle.textContent ?? '',
          cameraDeltaX: camera.position.x - original.position.x, outputRms: outputLevel(context),
          stoppedFrameCount, sampledFrameCount: frameCount,
          cameraIdentityPreserved: camera === engine.services.camera,
          canvasIdentityPreserved: canvas === engine.services.renderer.domElement,
          collidersBefore, collidersAfter: engine.services.physics.colliders.len(), audioState: context.state,
        };
      } finally {
        try { handle?.cancel('Native diagnostic complete'); }
        finally {
          try { probeCinematic.dispose(); }
          finally {
            probeDialogue.dispose();
            subtitle.textContent = '';
            probing = false;
            if (!disposed) {
              ready = true;
              status.textContent = 'Ready · one engine, camera and loop · isolated test fixture';
              startLoop();
            }
          }
        }
      }
    },
    productionRejections() {
      const production = createDialoguePlayer({ mode: 'production', subtitle() {} });
      const failures: { id: string; reason: string }[] = [];
      try {
        for (const cue of Object.values(CHAPTER_DIALOGUE)) {
          try {
            const handle = production.play(cue);
            handle.stop('Unexpected production acceptance');
          } catch (error) { failures.push({ id: cue.id, reason: error instanceof Error ? error.message : String(error) }); }
        }
      } finally { production.dispose(); }
      return failures;
    },
  };
  window.nwChapterHarness = api;
  await buildSession();
  startLoop();
  for (const button of document.querySelectorAll<HTMLButtonElement>('button')) button.disabled = false;
  document.querySelector('#audio')!.addEventListener('click', () => { void engine.services.audio.resume().catch(fail); });
  document.querySelector('#play')!.addEventListener('click', () => { try { api.play(); } catch (error) { fail(error); } });
  document.querySelector('#pause')!.addEventListener('click', () => { if (playback?.state === 'paused') api.resume(); else api.pause(); });
  document.querySelector('#skip')!.addEventListener('click', () => api.skip());
  document.querySelector('#cancel')!.addEventListener('click', () => api.cancel());
  document.querySelector('#restart')!.addEventListener('click', () => { void api.restart().catch(fail); });
  window.addEventListener('pagehide', () => { void api.dispose().catch(fail); }, { once: true });
}

void start().catch((error: unknown) => {
  errorElement.hidden = false;
  errorElement.textContent = error instanceof Error ? error.message : String(error);
  console.error(error);
});
