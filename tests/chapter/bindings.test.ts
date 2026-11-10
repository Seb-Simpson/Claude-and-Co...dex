import { Group, Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import type { DoorMarker, HospitalWorld } from '../../src/contracts';
import {
  CHAPTER_ANCHORS, CHAPTER_INTERACTIONS, CHAPTER_LIGHTING, CHAPTER_ROOMS,
  CHAPTER_TRIGGERS, CHAPTER_VOICE_CUES, createChapterBindingDraft, validateChapterBindings,
} from '../../src/gameplay/chapter/bindings';
import type { ChapterEnvironmentBindings } from '../../src/gameplay/chapter/bindings';
import { CHAPTER_SCENES } from '../../src/gameplay/chapter/model';

/** Metadata fixture only: no claim of authored rooms, voices or physical readiness. */
function fixture() {
  const root = new Group();
  const named = (name: string) => { const o = new Object3D(); o.name = name; root.add(o); return o; };
  const pose = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
  const bounds = { min: { x: -10, y: -1, z: -10 }, max: { x: 10, y: 5, z: 10 } };
  const doors: DoorMarker[] = ['stair-barrier', 'observation-bay', 'service-boundary'].map(key => ({
    id: `test:door:${key}`, type: 'door', object: named(`test:door-object:${key}`),
    prompt: 'Open', range: 2, colliderIds: [], initialState: 'closed',
    closedPose: pose, openPose: pose, durationSeconds: 1,
  }));
  const world: HospitalWorld = {
    id: 'test:fractured-ward', root, bounds,
    rooms: CHAPTER_ROOMS.map(key => ({ id: `test:room:${key}`, name: key, bounds, tags: [] })),
    colliders: [], doors,
    interactables: [
      ...CHAPTER_INTERACTIONS.map(key => ({ id: `test:inspect:${key}`, type: 'inspect' as const,
        object: named(`test:inspect-object:${key}`), prompt: 'Inspect', range: 2 })), ...doors,
    ],
    hidingLocations: [],
    entitySpawns: ['nurse', 'patient'].map(type => ({ id: `test:spawn:${type}`, entityId: `test:${type}`,
      type: type as 'nurse' | 'patient', position: pose.position, yaw: 0, patrolRouteId: `test:route:${type}` })),
    patrolRoutes: ['nurse', 'patient'].map(type => ({ id: `test:route:${type}`, points: [pose.position], loop: true })),
    playerSpawn: { position: pose.position, yaw: 0 },
  };
  const bindings: ChapterEnvironmentBindings = {
    ...createChapterBindingDraft(world.id, 'test-only-v1'),
    rooms: Object.fromEntries(CHAPTER_ROOMS.map(k => [k, `test:room:${k}`])),
    interactions: Object.fromEntries(CHAPTER_INTERACTIONS.map(k => [k, `test:inspect:${k}`])),
    anchors: Object.fromEntries(CHAPTER_ANCHORS.map(k => [k, named(`test:anchor:${k}`).name])),
    triggers: Object.fromEntries(CHAPTER_TRIGGERS.map(k => [k, named(`test:trigger:${k}`).name])),
    doors: Object.fromEntries(doors.map(d => [d.id.split(':').at(-1), d.id])),
    actors: {
      nurse: { entityId: 'test:nurse', routeId: 'test:route:nurse', stageAnchor: 'nurse-stage', introductionZone: 'nurse-introduction-zone' },
    },
    cameras: Object.fromEntries(CHAPTER_SCENES.map(k => [k, { status: 'approved', asset: `test-only:${k}`,
      startAnchor: 'awakening-start', handoffAnchor: 'awakening-handoff' }])),
    voices: Object.fromEntries(CHAPTER_VOICE_CUES.map(k => [k, { status: 'approved', asset: `test-only:${k}` }])),
    lighting: Object.fromEntries(CHAPTER_LIGHTING.map(k => [k, 'test:lighting:shared-profile'])),
  };
  return { world, bindings };
}

describe('Fractured Ward chapter binding preflight', () => {
  it('reports every missing production category without creating fallback objects', () => {
    const { world } = fixture();
    const count = world.root.children.length;
    const result = validateChapterBindings(world, createChapterBindingDraft(world.id, 'draft'));
    expect(result.metadataComplete).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'rooms.records' }),
      expect.objectContaining({ path: 'rooms.electrical' }),
      expect.objectContaining({ path: 'triggers.chase-route-b' }),
      expect.objectContaining({ path: 'anchors.checkpoint-before-confrontation' }),
      expect.objectContaining({ path: 'voices.c1.voice.intercom.awakening' }),
      expect.objectContaining({ path: 'cameras.c1.cine.ending' }),
    ]));
    expect(world.root.children.length).toBe(count);
  });

  it('accepts complete metadata while explicitly retaining physical/playtest requirements', () => {
    const { world, bindings } = fixture();
    const result = validateChapterBindings(world, bindings);
    expect(result).toEqual({ metadataComplete: true, issues: [], requiresSpatialPlaytest: true });
    // Shared lighting is deliberate, unlike aliasing distinct props/anchors.
    expect(new Set(Object.values(bindings.lighting)).size).toBe(1);
  });

  it('rejects old or wrong-world bindings and unknown interaction IDs', () => {
    const { world, bindings } = fixture();
    const invalid = { ...bindings, worldId: 'old:ward', contentRevision: 'future',
      interactions: { ...bindings.interactions, 'records-pack': 'old:drawer' } };
    const report = validateChapterBindings(world, invalid as ChapterEnvironmentBindings);
    expect(report.issues.map(i => i.path)).toEqual(expect.arrayContaining(['worldId', 'contentRevision', 'interactions.records-pack']));
  });

  it('rejects named duplicates, accidental semantic aliasing and wrong actor types', () => {
    const { world, bindings } = fixture();
    const duplicate = new Object3D();
    duplicate.name = bindings.anchors['checkpoint-start']!;
    world.root.add(duplicate);
    const report = validateChapterBindings(world, {
      ...bindings,
      interactions: { ...bindings.interactions, 'records-pack': bindings.interactions['night-ledger']! },
      actors: { ...bindings.actors, nurse: { ...bindings.actors.nurse!, entityId: 'test:patient' } },
    });
    expect(report.issues.map(i => i.path)).toEqual(expect.arrayContaining([
      'anchors.checkpoint-start', 'interactions.records-pack', 'actors.nurse.entityId',
    ]));
  });

  it('never approves silent, temporary or missing voice/camera assets as production', () => {
    const { world, bindings } = fixture();
    const report = validateChapterBindings(world, {
      ...bindings,
      voices: { ...bindings.voices,
        'c1.voice.archive.withdrawal': { status: 'temporary', asset: 'test-only:temp' },
        'c1.voice.intercom.recognition': { status: 'approved', asset: null },
      },
      cameras: { ...bindings.cameras, 'c1.cine.nurse-confrontation': {
        ...bindings.cameras['c1.cine.nurse-confrontation']!, status: 'recorded',
      } },
    });
    expect(report.metadataComplete).toBe(false);
    expect(report.issues.map(i => i.path)).toEqual(expect.arrayContaining([
      'voices.c1.voice.archive.withdrawal', 'voices.c1.voice.intercom.recognition', 'cameras.c1.cine.nurse-confrontation',
    ]));
  });

  it('consumes producer staging data by ID without requiring duplicate scene nodes or coordinates', () => {
    const { world, bindings } = fixture();
    const old = world.root.getObjectByName(bindings.anchors['awakening-start']!)!;
    old.removeFromParent();
    const adapted = { ...bindings, anchors: { ...bindings.anchors, 'awakening-start': 'producer:stage:bed-pov' } };
    expect(validateChapterBindings(world, adapted).metadataComplete).toBe(false);
    const source = { anchors: [{ id: 'producer:stage:bed-pov', position: { x: 1, y: 1.1, z: 2 } }] };
    expect(validateChapterBindings(world, adapted, source).metadataComplete).toBe(true);
    expect(validateChapterBindings(world, adapted, { anchors: [...source.anchors, ...source.anchors] }).metadataComplete).toBe(false);
    expect(validateChapterBindings(world, adapted, { anchors: [{ ...source.anchors[0]!, position: { x: NaN, y: 0, z: 0 } }] }).metadataComplete).toBe(false);
    expect(world.root.getObjectByName('producer:stage:bed-pov')).toBeUndefined();
  });
});
