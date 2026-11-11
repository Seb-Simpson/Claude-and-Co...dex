import type {StationActorPose} from '../encounters/nursesStation';
import type {StationCheckpoint} from '../encounters/checkpoint';
import { Euler, Quaternion, Vector3 } from 'three';
import type { InteractionRequest, ModuleContext } from '../../contracts';
import { settings } from '../../settings/settings';
import type { GameplayRuntime } from '../runtime';
import { INTERACTION_BINDING } from '../input';
import { captureCinematicPose, createCinematicPlayer } from '../chapter/cinematics';
import type { CinematicPlayback, CinematicPose } from '../chapter/cinematics';
import { OPENING_INTERACTIONS } from './adapter';
import { openingPosition } from './bindings';
import type { OpeningBindings } from './bindings';
import { createOpeningState, reduceOpening } from './state';
import type { OpeningCommand, OpeningState } from './state';
import { createOpeningCheckpoint } from './checkpoint';
import type { OpeningCheckpoint } from './checkpoint';
import { createOpeningUi } from './ui';
import { createOpeningAudio } from './audio';
import { createOnboardingGate, createOpeningAssistance } from './onboarding';
import type { OnboardingGate } from './onboarding';
import { createOpeningScene } from './scene';

export interface OpeningPersistence {
  load(): OpeningCheckpoint | null;
  save(checkpoint: OpeningCheckpoint): void;
}
export interface OpeningSequence {
  directNurse(pose: StationActorPose): void;
  saveStation(checkpoint: StationCheckpoint): void;
  readonly onboarding: OnboardingGate;
  readonly state: OpeningState;
  readonly cinematic: boolean;
  anchors(): Readonly<Record<string, { position: { x: number; y: number; z: number }; stand?: { x: number; y: number; z: number }; target?: { x: number; y: number; z: number } }>>;
  setPlaying(value: boolean): void;
  skip(): void;
  notify(message: string): void;
  handleInteraction(request: InteractionRequest, timeSeconds: number): boolean;
  update(deltaSeconds: number): void;
  dispose(): void;
}
/** No new loop/controller: content consumes the existing runtime and exclusive camera transport. */
export async function createOpeningSequence(context: ModuleContext, runtime: GameplayRuntime, bindings: OpeningBindings,
  checkpoint: OpeningCheckpoint | null, save?: (checkpoint: OpeningCheckpoint) => void, onboarding: OnboardingGate = createOnboardingGate(), onRestart?: () => void): Promise<OpeningSequence> {
  const world = context.world!;
  const document = context.engine.renderer.domElement.ownerDocument;
  const ui = createOpeningUi(document, settings, () => INTERACTION_BINDING.label);
  let scene: Awaited<ReturnType<typeof createOpeningScene>> | undefined;
  let audio: Awaited<ReturnType<typeof createOpeningAudio>>;
  try {
    scene = await createOpeningScene(world, bindings, runtime.physics);
    audio = await createOpeningAudio(context.engine.audio, line => ui.subtitle(line));
  } catch (error) { scene?.dispose(); ui.dispose(); throw error; }
  const presentation = scene;
  let stationCheckpoint = checkpoint?.station;
  let pendingStationCheckpoint: StationCheckpoint | null = null;
  let state = checkpoint?.state ?? createOpeningState();
  onboarding.sync(state, checkpoint !== null);
  const assistance = createOpeningAssistance();
  let playing = false, started = state.awakened, disposed = false;
  let elapsed = 0, lastInteraction = -Infinity, exitSaved = checkpoint !== null;
  let pendingMilestone: 'room104-exit' | 'station-approach' | null = null;
  let playback: CinematicPlayback | null = null;
  const camera = context.engine.camera;
  const standingEyeHeight = camera.position.y - runtime.player.body.getPosition().y;
  presentation.setCardTaken(state.cardAcquired);
  presentation.restore(state);
  const pickup = world.interactables.find(marker => marker.id === OPENING_INTERACTIONS.card)?.object;
  if (pickup) pickup.visible = !state.cardAcquired;
  ui.setDarkness(state.awakened ? 0 : 1);
  const cinematic = createCinematicPlayer({ camera, acquireControl: () => runtime.acquireCinematicControl(),
    validateHandoff: pose => {
      const feet = runtime.player.body.getPosition();
      return Math.hypot(pose.position.x - feet.x, pose.position.z - feet.z) < 0.02 &&
        Math.abs(pose.position.y - feet.y - standingEyeHeight) < 0.02 && runtime.player.body.canOccupy(feet);
    },
    settled: result => {
      playback = null;
      ui.setDarkness(0);
      if (result.outcome !== 'interrupted') dispatch('awaken');
    },
  });
  function dispatch(command: OpeningCommand): void {
    const result = reduceOpening(state, command);
    // The physics authority must accept the unlock before progression/voice can commit.
    if (result.effects.includes('reader-accepted') && !runtime.interactions.setDoorLocked(bindings['room-104-door'].doorId!, false)) return;
    state = result.state;
    for (const effect of result.effects) {
      switch (effect) {
        case 'handle-104': presentation.feedback(effect); audio.effect('locked'); break;
        case 'handle-106': presentation.feedback(effect); audio.effect('locked'); break;
        case 'voice-return-to-bed': audio.queue('nw005.voice.shaw.return-to-bed'); break;
        case 'voice-not-authorised': audio.queue('nw005.voice.shaw.not-authorised'); break;
        case 'card-taken':
          presentation.setCardTaken(true); if (pickup) pickup.visible = false;
          ui.notify('Staff access card acquired.'); audio.effect('pickup'); break;
        case 'reader-denied': presentation.feedback(effect); audio.effect('denied'); ui.notify('Staff access card required.'); break;
        case 'reader-accepted': presentation.feedback(effect); audio.effect('accepted'); break;
        case 'station-handoff': pendingMilestone = 'station-approach'; break;
      }
    }
  }
  function awaken(): void {
    started = true;
    const handoff = captureCinematicPose(camera);
    // Producer may supply a bed-eye node without changing shared contracts. Otherwise the
    // short reclined-to-standing preview is relative to the published spawn, never map coordinates.
    const bed = world.root.getObjectByName('nw:opening:awakening-eye');
    const first: CinematicPose = bed ? {
      position: bed.getWorldPosition(new Vector3()), rotation: bed.getWorldQuaternion(new Quaternion()), fov: handoff.fov,
    } : {
      position: { ...handoff.position, y: handoff.position.y - 0.78 },
      rotation: new Quaternion().setFromEuler(new Euler(1.1, runtime.player.getSnapshot().rotation.yaw, 0, 'YXZ')), fov: handoff.fov,
    };
    camera.position.copy(first.position); camera.quaternion.copy(first.rotation); camera.updateMatrixWorld(true);
    const duration = settings.get().motion === 'reduce' ? 4 : 8;
    playback = cinematic.play({ id: 'nw005.cine.awakening', durationSeconds: duration, skipBlendSeconds: 0.35,
      camera: [{ atSeconds: 0, pose: first }, { atSeconds: duration * 0.25, pose: first },
        { atSeconds: duration * 0.58, pose: { ...handoff, position: { ...first.position, y: handoff.position.y } } },
        { atSeconds: duration, pose: handoff }], cues: [] });
    audio.effect('wake');
  }
  function key(event: KeyboardEvent): void {
    if (playing && playback && event.code === 'Space' && !event.repeat) { event.preventDefault(); playback.skip(); }
  }
  document.addEventListener('keydown', key);
  const offCapture = context.events.on('player:captured', event => {
    const player=runtime.player.getSnapshot();
    if(event.playerId===player.id && player.captured) {audio.pause();ui.capture(onRestart);}
  });
  return {
    onboarding,
    directNurse: pose => presentation.directNurse(pose),
    saveStation(cp) {
      if(cp.phase==='complete' && !state.stationReached) dispatch('reach-station');
      stationCheckpoint = cp;
      pendingStationCheckpoint = cp;
    },
    get state() { return { ...state }; }, get cinematic() { return playback !== null || !started; },
    anchors() { return Object.fromEntries(Object.entries(bindings).map(([key, anchor]) => {
      const position = openingPosition(anchor);
      return [key, { position: { x: position.x, y: position.y, z: position.z },
        ...(anchor.stand ? { stand: { ...anchor.stand } } : {}), ...(anchor.target ? { target: { ...anchor.target } } : {}) }];
    })); },
    setPlaying(value) {
      playing = value;
      if (value) {
        audio.resume();
        // Acquire the camera/input lease in the play transition, before the first fixed step.
        // Waiting until update() would allow input to move the body for one initial frame.
        if (!started) awaken();
        playback?.resume();
      }
      else { playback?.pause(); audio.pause(); }
      ui.update({ prompt: null, playing, cinematic: playback !== null }, 0);
    },
    skip() { if (playing) playback?.skip(); },
    notify(message) { ui.notify(message); },
    handleInteraction(request, timeSeconds) {
      const id = request.targetId;
      const command: OpeningCommand | null = id === bindings['room-104-door'].doorId && !state.doorUnlocked ? 'try-locked-door' :
        id === OPENING_INTERACTIONS.card ? 'take-card' : id === OPENING_INTERACTIONS.reader ? 'use-reader' :
        id === bindings['room-106-door'].doorId ? 'try-106' : null;
      if (!command && id !== OPENING_INTERACTIONS.intercom) return false;
      if (!playing || playback || !state.awakened || timeSeconds - lastInteraction < 0.55) return true;
      lastInteraction = timeSeconds;
      if (command === 'use-reader' && state.doorUnlocked) { presentation.feedback('reader-accepted'); audio.effect('accepted'); }
      else if (command) dispatch(command);
      else ui.notify('Ward intercom.');
      context.events.emit('interaction:completed', { ...request,
        outcome: command === 'try-locked-door' || command === 'try-106' || (command === 'use-reader' && !state.doorUnlocked) ? 'denied' : 'completed',
        position: runtime.player.getSnapshot().position });
      context.events.emit('player:noise', { playerId: request.playerId, position: runtime.player.getSnapshot().position,
        kind: 'interaction', radius: 4, intensity: 0.35, timeSeconds });
      return true;
    },
    update(delta) {
      if (disposed || !playing) return;
      if (!started) awaken();
      elapsed += delta;
      cinematic.update(delta);
      audio.update(delta);
      if (playback) ui.setDarkness(playback.state === 'skipping' ? 0 : Math.max(0, 1 - Math.max(0, elapsed - 0.8) / 2.8));
      if (state.awakened) {
        const encounter = presentation.update(delta, runtime.player.getSnapshot().position, camera, state.doorUnlocked);
        if (encounter.sawNurse) dispatch('see-nurse');
        if (encounter.atStation) dispatch('reach-station');
        if (!exitSaved && state.doorUnlocked && !state.stationReached) {
          const p = runtime.player.getSnapshot().position;
          const door = openingPosition(bindings['room-104-door']);
          const spawn = openingPosition(bindings['player-spawn']);
          const towardSpawn = new Vector3().subVectors(spawn, door).setY(0).normalize();
          if (new Vector3().subVectors(p, door).dot(towardSpawn) < -0.45) {
            exitSaved = true;
            pendingMilestone = 'room104-exit';
          }
        }
      }
      if (pendingMilestone && audio.idle) {
        save?.({...createOpeningCheckpoint(state, state.stationReached ? 'station-approach' : pendingMilestone),...(stationCheckpoint?{station:stationCheckpoint}:{})});
        pendingMilestone = null;
      }
      if (pendingStationCheckpoint && audio.idle) {
        save?.({...createOpeningCheckpoint(state,state.stationReached?'station-approach':'room104-exit'),station:pendingStationCheckpoint});
        pendingStationCheckpoint=null;
      }
      onboarding.sync(state, exitSaved);
      const snapshot = runtime.player.getSnapshot();
      if (snapshot.crouching) onboarding.recordSkill('crouch');
      if (snapshot.hiding.state === 'hidden') onboarding.recordSkill('hide');
      const hint = !playback && audio.idle ? assistance.update(delta, state) : null;
      if (hint) ui.notify(hint);
      const prompt = runtime.interactions.getPrompt();
      const crouchHint = prompt?.targetId === OPENING_INTERACTIONS.card && !snapshot.crouching
        ? 'Ctrl / C — Crouch for a closer look' : null;
      const text = prompt?.targetId === OPENING_INTERACTIONS.card ? 'Take staff access card' :
        prompt?.targetId === bindings['room-104-door'].doorId && !state.doorUnlocked ? 'Try door' :
        prompt?.targetId === bindings['room-106-door'].doorId ? 'Try handle' : prompt?.text;
      ui.update({ prompt: prompt && text ? { ...prompt, text } : null, playing, cinematic: playback !== null, guidance: crouchHint }, delta);
    },
    dispose() {
      if (disposed) return;
      disposed = true; document.removeEventListener('keydown', key);
      offCapture();
      try { cinematic.dispose(); } finally { try { audio.dispose(); } finally { try { presentation.dispose(); } finally { ui.dispose(); } } }
    },
  };
}
