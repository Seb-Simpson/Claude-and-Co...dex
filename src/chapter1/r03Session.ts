/**
 * NW-R03 — Chapter 1 session controller for the greybox demonstration. Owns the authoritative
 * Chapter 1 state for the attempt and connects it to real interactions, door requirements, the
 * voice director, objectives and checkpoints. Created by the greybox module only with `r03=1`.
 */
import type { DoorState, GameEvents, InteractionEvent } from '../contracts';
import { createVoiceDirector, type VoiceDirector, type VoiceListener } from '../audio/voiceDirector';
import manifest from '../../tools/voice/r03-audition.lines.json';
import {
  CH1_CHECKPOINTS, createCh1Checkpoint, createCh1CheckpointStore, type Ch1Checkpoint, type Ch1CheckpointContext, type Ch1CheckpointStore,
} from './checkpoint';
import { chapter1Requirement, deviceInteractableId, useDevice, type DeviceDef } from './devices';
import { currentObjective, type Chapter1Objective } from './objectives';
import {
  R03_AUDITION_IDS, R03_DEVICES, R03_HATCH, R03_LEGACY_REQUIREMENTS, R03_SCENARIO_EVENTS, R03_SCENARIO_SPAWN, r03VoiceLines, type VoiceProvenance,
} from './r03Demo';
import { applyChapter1Event, applyChapter1Events, createChapter1State, hasBeat, shawStage, type Chapter1State } from './state';

export const R03_CHECKPOINT_KEY = 'night-ward:greybox:ch1-checkpoint';
export const R03_HATCH_DOOR = 'nw:door:gb-r03-hatch';

export interface R03Restore {
  readonly state: Chapter1State;
  readonly used: ReadonlySet<string>;
  readonly openDoors: ReadonlySet<string>;
  readonly spawn: { x: number; z: number; yaw: number };
  readonly source: 'checkpoint' | 'scenario';
  readonly checkpointId: string | null;
  readonly refused: string | null;
}

/** Decides the starting point: a valid saved checkpoint, otherwise the developer scenario. */
export function loadR03Restore(store: Ch1CheckpointStore, context: Ch1CheckpointContext): R03Restore {
  const loaded = store.load(context);
  if (loaded?.ok) {
    const cp = loaded.value;
    return {
      state: cp.state, used: new Set(cp.usedInteractions.map(fromInteractableId)), openDoors: new Set(cp.openDoors),
      spawn: { x: cp.pose.x, z: cp.pose.z, yaw: cp.pose.yaw }, source: 'checkpoint', checkpointId: cp.checkpointId, refused: null,
    };
  }
  const scenario = applyChapter1Events(createChapter1State(), R03_SCENARIO_EVENTS);
  if (scenario.rejected) throw new Error(`R03 scenario preset is invalid: ${scenario.rejected.reason}`);
  return { state: scenario.state, used: new Set(), openDoors: new Set(), spawn: { ...R03_SCENARIO_SPAWN }, source: 'scenario', checkpointId: null, refused: loaded && !loaded.ok ? loaded.error : null };
}

const ALL_DEVICES: readonly DeviceDef[] = [...R03_DEVICES.map((p) => p.device), R03_HATCH.device];
const fromInteractableId = (id: string): string => id.replace(/^nw:inspect:gb-/, '');

export function r03CheckpointContext(spaceAt: (x: number, z: number) => string | null, doorIds: Iterable<string>): Ch1CheckpointContext {
  return { spaceAt, doorIds: new Set(doorIds), interactionIds: new Set(ALL_DEVICES.map((d) => deviceInteractableId(d.id))) };
}

export interface R03SessionOptions {
  readonly restore: R03Restore;
  readonly events: GameEvents;
  readonly store: Ch1CheckpointStore;
  readonly checkpointContext: Ch1CheckpointContext;
  readonly audioContext: () => AudioContext | null;
  readonly provenance: ReadonlyMap<string, VoiceProvenance>;
  readonly subtitle: (line: { speaker: string; text: string } | null) => void;
  readonly directionalCaptions: () => boolean;
  readonly notify: (message: string) => void;
  readonly doorState: (id: string) => DoorState | undefined;
  readonly fetchAudio?: (url: string) => Promise<ArrayBuffer>;
}

export interface R03Session {
  readonly state: Chapter1State;
  readonly used: ReadonlySet<string>;
  readonly objective: Chapter1Objective;
  readonly voice: VoiceDirector;
  readonly lastCheckpoint: Ch1Checkpoint | null;
  readonly restoredFrom: R03Restore['source'];
  /** Interaction requirements resolved from Chapter 1 state (undefined: not a Chapter 1 requirement). */
  hasRequirement(id: string): boolean | undefined;
  update(deltaSeconds: number, player: { x: number; y: number; z: number; yaw: number } | null, listener?: VoiceListener): void;
  clearCheckpoint(): void;
  dispose(): void;
}

export function createR03Session(options: R03SessionOptions): R03Session {
  let state = options.restore.state;
  const used = new Set(options.restore.used);
  let objective = currentObjective(state);
  let lastCheckpoint: Ch1Checkpoint | null = null;
  let lastSavedRevision = options.restore.source === 'checkpoint' ? state.revision : -1;
  let lastSavedDoors = '';
  const recordings = new Map<string, AudioBuffer>();
  const texts = Object.fromEntries(manifest.lines.map((l) => [l.id, l.text]));
  const voice = createVoiceDirector({
    lines: r03VoiceLines(texts, options.provenance), mode: 'preview', subtitle: options.subtitle,
    alreadyPlayed: state.linesPlayed, directionalCaptions: options.directionalCaptions,
    onOnceLinePlayed: (lineId) => { state = applyChapter1Event(state, { type: 'line-played', lineId }).state; },
    audio: { context: options.audioContext, recordings },
  });
  let decoding = false;
  const fetchAudio = options.fetchAudio ?? (async (url: string) => (await fetch(url)).arrayBuffer());
  function decodeRecordings(context: AudioContext): void {
    if (decoding) return;
    decoding = true;
    for (const id of R03_AUDITION_IDS) {
      const p = options.provenance.get(id);
      if (!p) continue;
      const url = `/voice-temp/${p.file}`;
      void fetchAudio(url).then((data) => context.decodeAudioData(data)).then((buffer) => { recordings.set(url, buffer); }).catch(() => { /* subtitle-only */ });
    }
  }

  const setState = (next: Chapter1State): void => {
    state = next;
    const nextObjective = currentObjective(state);
    if (nextObjective.id !== objective.id) { objective = nextObjective; options.notify(`Objective: ${objective.text}`); }
  };

  const offInteraction = options.events.on('interaction:completed', (event: InteractionEvent) => {
    if (event.outcome !== 'completed') return;
    const device = ALL_DEVICES.find((d) => deviceInteractableId(d.id) === event.targetId);
    if (!device) return;
    const result = useDevice(device, state, used);
    if (!result.applied) { if (result.reason) options.notify(result.reason); return; }
    if (device.once) used.add(device.id);
    setState(result.state);
    if (device.voiceLine) voice.request({ lineId: device.voiceLine, stage: shawStage(state), key: `${device.id}:${state.revision}` });
  });

  const openDoorIds = (): string[] => [...options.checkpointContext.doorIds].filter((id) => {
    const s = options.doorState(id);
    return s === 'open' || s === 'opening';
  });
  function maybeCheckpoint(player: { x: number; y: number; z: number; yaw: number }): void {
    const space = options.checkpointContext.spaceAt(player.x, player.z);
    const definition = CH1_CHECKPOINTS.find((c) => c.spaces.includes(space ?? '') && c.requires.every((b) => hasBeat(state, b)) && !(c.before ?? []).some((b) => hasBeat(state, b)));
    if (!definition) return;
    const doors = openDoorIds();
    const doorKey = doors.join('|');
    if (state.revision === lastSavedRevision && doorKey === lastSavedDoors) return;
    const firstTime = lastSavedRevision === -1 || lastCheckpoint?.checkpointId !== definition.id;
    const created = createCh1Checkpoint({
      checkpointId: definition.id, pose: { x: player.x, y: 0, z: player.z, yaw: player.yaw }, state,
      openDoors: doors, usedInteractions: [...used].map(deviceInteractableId),
    }, options.checkpointContext);
    if (!created.ok) return;
    if (options.store.save(created.value)) {
      lastCheckpoint = created.value;
      lastSavedRevision = state.revision;
      lastSavedDoors = doorKey;
      if (firstTime) options.notify(`Checkpoint: ${definition.label}`);
    }
  }

  if (options.restore.refused) options.notify(`Saved checkpoint not used: ${options.restore.refused}`);

  return {
    get state() { return state; },
    get used() { return used; },
    get objective() { return objective; },
    get lastCheckpoint() { return lastCheckpoint; },
    get restoredFrom() { return options.restore.source; },
    voice,
    hasRequirement(id) {
      return chapter1Requirement(state, used, R03_LEGACY_REQUIREMENTS[id] ?? id);
    },
    update(deltaSeconds, player, listener) {
      const context = options.audioContext();
      if (context && context.state === 'running') decodeRecordings(context);
      voice.update(deltaSeconds, listener);
      if (player) maybeCheckpoint(player);
    },
    clearCheckpoint() { options.store.clear(); lastSavedRevision = -1; lastCheckpoint = null; },
    dispose() { offInteraction(); voice.dispose(); },
  };
}

export { createCh1CheckpointStore };
