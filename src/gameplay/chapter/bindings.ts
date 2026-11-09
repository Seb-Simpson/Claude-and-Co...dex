import type { HospitalWorld, Vec3 } from '../../contracts';
import { CHAPTER_CONTENT_REVISION, CHAPTER_SCENES, CHAPTER_SCHEMA_VERSION } from './model';
import type { ChapterSceneId } from './model';

/** Single proposed vocabulary for Claude's Fractured Ward export. No coordinates. */
export const CHAPTER_ROOMS = [
  'room-104', 'patient-wing-a', 'atrium', 'gallery', 'nurses-station',
  'treatment', 'patient-wing-b', 'records', 'electrical', 'maintenance',
  'release-vestibule', 'patient-observation', 'stairwell-b',
] as const;
export const CHAPTER_INTERACTIONS = [
  'wristband', 'bedside-notice', 'bedside-call', 'station-intake-copy',
  'station-call', 'night-ledger', 'round-board', 'release-procedure',
  'records-pack', 'archive-receiver', 'panel-schematic', 'observation-bridge',
  'reserve-switch', 'destination-selector', 'breaker-reset', 'bus-engage',
  'handle-socket', 'release-confirm', 'stair-reader',
] as const;
export const CHAPTER_TRIGGERS = [
  'station-entry', 'nurse-introduction-zone', 'review-safe-boundary',
  'records-safe-inspection', 'panel-approach', 'release-safe-boundary',
  'patient-introduction-zone', 'chase-route-a', 'chase-route-b', 'stair-safe-landing',
] as const;
export const CHAPTER_ANCHORS = [
  'checkpoint-start', 'checkpoint-after-nurse', 'checkpoint-after-records-power',
  'checkpoint-before-patient', 'checkpoint-complete',
  'awakening-start', 'awakening-ceiling', 'awakening-fixture', 'awakening-monitor',
  'awakening-wristband', 'awakening-door', 'awakening-handoff',
  'nurse-camera-start', 'nurse-ledger', 'nurse-emergence', 'nurse-diversion', 'nurse-handoff',
  'record-camera-start', 'record-identity', 'record-receiver', 'record-handoff',
  'patient-camera-start', 'patient-release-door', 'patient-emergence', 'patient-handoff',
  'ending-camera-start', 'ending-reader', 'ending-lower-stair', 'ending-handoff',
  'nurse-stage', 'patient-stage', 'egress-chime',
] as const;
export const CHAPTER_LIGHTING = [
  'c1.light.awakening', 'c1.light.night-shift', 'c1.light.records',
  'c1.light.reserve-armed', 'c1.light.patient-release', 'c1.light.chase',
  'c1.light.recovery', 'c1.light.stair-recognition',
] as const;
export const CHAPTER_VOICE_CUES = [
  'c1.voice.intercom.awakening', 'c1.voice.protagonist.appointment',
  'c1.voice.protagonist.call', 'c1.voice.intercom.review', 'c1.voice.protagonist.ledger',
  'c1.voice.protagonist.signature', 'c1.voice.archive.slate', 'c1.voice.archive.withdrawal',
  'c1.voice.archive.refusal', 'c1.voice.protagonist.memory', 'c1.voice.intercom.armed',
  'c1.voice.intercom.release', 'c1.voice.intercom.recognition',
] as const;

export type ChapterRoomKey = typeof CHAPTER_ROOMS[number];
export type ChapterInteractionKey = typeof CHAPTER_INTERACTIONS[number];
export type ChapterTriggerKey = typeof CHAPTER_TRIGGERS[number];
export type ChapterAnchorKey = typeof CHAPTER_ANCHORS[number];
export type ChapterLightingKey = typeof CHAPTER_LIGHTING[number];
export type ChapterVoiceCueId = typeof CHAPTER_VOICE_CUES[number];
export type ProductionStatus = 'not-recorded' | 'temporary' | 'recorded' | 'approved';
type Bindings<K extends string> = Readonly<Partial<Record<K, string>>>;

export interface ChapterAssetBinding {
  readonly status: ProductionStatus;
  /** Producer-supplied asset reference, not an invented expected filename. */
  readonly asset: string | null;
}
export interface ChapterCameraBinding extends ChapterAssetBinding {
  readonly startAnchor: ChapterAnchorKey;
  readonly handoffAnchor: ChapterAnchorKey;
}
export interface ChapterActorBinding {
  readonly entityId: string;
  readonly routeId: string;
  readonly stageAnchor: ChapterAnchorKey;
  readonly introductionZone: ChapterTriggerKey;
}
/**
 * Proposal v1. Claude resolves semantic keys to actual exported world IDs/names.
 * Anchor references can be named Object3D nodes or IDs in a supplied data-only source.
 * This supports Claude's existing HospitalExtras.staging without copying coordinates.
 * Trigger extents and camera animation are authored assets, not guessed here.
 */
export interface ChapterEnvironmentBindings {
  readonly schemaVersion: typeof CHAPTER_SCHEMA_VERSION;
  readonly contentRevision: typeof CHAPTER_CONTENT_REVISION;
  readonly worldId: string;
  readonly revision: string;
  readonly rooms: Bindings<ChapterRoomKey>;
  readonly interactions: Bindings<ChapterInteractionKey>;
  readonly triggers: Bindings<ChapterTriggerKey>;
  readonly anchors: Bindings<ChapterAnchorKey>;
  readonly doors: Bindings<'stair-barrier' | 'observation-bay' | 'service-boundary'>;
  readonly actors: Readonly<Partial<Record<'nurse' | 'patient', ChapterActorBinding>>>;
  readonly cameras: Readonly<Partial<Record<ChapterSceneId, ChapterCameraBinding>>>;
  readonly voices: Readonly<Partial<Record<ChapterVoiceCueId, ChapterAssetBinding>>>;
  /** Maps semantic event names to authored atmosphere profile IDs. */
  readonly lighting: Bindings<ChapterLightingKey>;
}
export interface ChapterBindingIssue {
  readonly path: string;
  readonly reason: string;
}
export interface ChapterBindingReport {
  /** Metadata only. This never asserts collision, audio loading or playable readiness. */
  readonly metadataComplete: boolean;
  readonly issues: readonly ChapterBindingIssue[];
  readonly requiresSpatialPlaytest: true;
}
export interface ChapterBindingSources {
  /** For example, the producer's data-only HospitalExtras.staging. No private world import. */
  readonly anchors?: readonly { readonly id: string; readonly position: Vec3 }[];
}

/** Blank handoff: intentionally incomplete, never a fallback map. */
export function createChapterBindingDraft(worldId: string, revision: string): ChapterEnvironmentBindings {
  return {
    schemaVersion: CHAPTER_SCHEMA_VERSION, contentRevision: CHAPTER_CONTENT_REVISION,
    worldId, revision, rooms: {}, interactions: {}, triggers: {}, anchors: {}, doors: {},
    actors: {}, cameras: {}, voices: {}, lighting: {},
  };
}

/** Typed authoring preflight; untrusted JSON must first be decoded by its adapter. */
export function validateChapterBindings(world: HospitalWorld, bindings: ChapterEnvironmentBindings, sources: ChapterBindingSources = {}): ChapterBindingReport {
  const issues: ChapterBindingIssue[] = [];
  const issue = (path: string, reason: string): void => { issues.push({ path, reason }); };
  const nonempty = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;
  if (bindings.schemaVersion !== CHAPTER_SCHEMA_VERSION) issue('schemaVersion', 'Unsupported binding schema.');
  if (bindings.contentRevision !== CHAPTER_CONTENT_REVISION) issue('contentRevision', 'Chapter content revision mismatch.');
  if (bindings.worldId !== world.id) issue('worldId', 'Bindings belong to a different world.');
  if (!nonempty(bindings.revision)) issue('revision', 'An authored binding revision is required.');

  function declarations<K extends string>(keys: readonly K[], values: Bindings<K>, category: string, ids?: ReadonlySet<string>): void {
    const used = new Set<string>();
    for (const key of keys) {
      const value = values[key];
      if (!nonempty(value)) issue(`${category}.${key}`, 'Missing authored binding.');
      else {
        if (used.has(value)) issue(`${category}.${key}`, 'Distinct semantic bindings must not alias one declaration.');
        used.add(value);
        if (ids && !ids.has(value)) issue(`${category}.${key}`, `Unknown world declaration: ${value}`);
      }
    }
  }
  declarations(CHAPTER_ROOMS, bindings.rooms, 'rooms', new Set(world.rooms.map(r => r.id)));
  declarations(CHAPTER_INTERACTIONS, bindings.interactions, 'interactions', new Set(world.interactables.map(i => i.id)));
  declarations(['stair-barrier', 'observation-bay', 'service-boundary'], bindings.doors, 'doors', new Set(world.doors.map(d => d.id)));
  // Require unique named objects: getObjectByName alone silently accepts duplicate names.
  const named = new Map<string, number>();
  world.root.traverse(object => { if (object.name) named.set(object.name, (named.get(object.name) ?? 0) + 1); });
  const anchorIds = new Map(named);
  for (const anchor of sources.anchors ?? []) {
    if (!nonempty(anchor.id) || ![anchor.position?.x, anchor.position?.y, anchor.position?.z].every(Number.isFinite)) {
      issue('sources.anchors', 'Published staging anchors need unique IDs and finite positions.');
      continue;
    }
    anchorIds.set(anchor.id, (anchorIds.get(anchor.id) ?? 0) + 1);
  }
  declarations(CHAPTER_ANCHORS, bindings.anchors, 'anchors', new Set(anchorIds.keys()));
  declarations(CHAPTER_TRIGGERS, bindings.triggers, 'triggers', new Set(named.keys()));
  for (const [category, values] of [['anchors', bindings.anchors], ['triggers', bindings.triggers]] as const) {
    for (const [key, name] of Object.entries(values)) {
      const ids = category === 'anchors' ? anchorIds : named;
      if (name && (ids.get(name) ?? 0) > 1) issue(`${category}.${key}`, 'Published world binding is ambiguous.');
    }
  }
  for (const type of ['nurse', 'patient'] as const) {
    const binding = bindings.actors[type];
    const path = `actors.${type}`;
    if (!binding) { issue(path, 'Missing actor binding.'); continue; }
    const spawn = world.entitySpawns.find(s => s.entityId === binding.entityId);
    if (!spawn || spawn.type !== type) issue(`${path}.entityId`, 'No matching actor of the required type.');
    if (!world.patrolRoutes.some(r => r.id === binding.routeId && r.points.length > 0)) issue(`${path}.routeId`, 'Missing nonempty authored patrol route.');
    if (!bindings.anchors[binding.stageAnchor]) issue(`${path}.stageAnchor`, 'Actor staging anchor is unbound.');
    if (!bindings.triggers[binding.introductionZone]) issue(`${path}.introductionZone`, 'Actor introduction zone is unbound.');
  }
  function asset(path: string, binding: ChapterAssetBinding | undefined): void {
    if (!binding || binding.status !== 'approved' || !nonempty(binding.asset)) {
      issue(path, 'An approved, supplied production asset is required.');
    }
  }
  for (const id of CHAPTER_SCENES) {
    const binding = bindings.cameras[id];
    asset(`cameras.${id}`, binding);
    if (binding && !bindings.anchors[binding.startAnchor]) issue(`cameras.${id}.startAnchor`, 'Camera start anchor is unbound.');
    if (binding && !bindings.anchors[binding.handoffAnchor]) issue(`cameras.${id}.handoffAnchor`, 'Camera handoff anchor is unbound.');
  }
  for (const id of CHAPTER_VOICE_CUES) asset(`voices.${id}`, bindings.voices[id]);
  // Multiple narrative states may intentionally reuse one authored lighting profile.
  for (const id of CHAPTER_LIGHTING) if (!nonempty(bindings.lighting[id])) issue(`lighting.${id}`, 'Missing authored lighting profile.');
  return { metadataComplete: issues.length === 0, issues, requiresSpatialPlaytest: true };
}
