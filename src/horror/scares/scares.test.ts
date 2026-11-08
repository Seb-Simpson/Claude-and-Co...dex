import { Group, PerspectiveCamera, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { tensionFrom } from '../../atmosphere/score';
import type { GameModule, LightingEvent, ModuleContext, SoundEvent } from '../../contracts';
import { createEventBus } from '../../integration';
import { createHospitalWorld } from '../../world/createHospitalWorld';
import horrorModule from '../horror.module';
import { CinematicDirector, type CinematicServices } from './cinematics';
import { SilhouetteMirage } from './mirage';
import { ScreenOverlay } from './overlay';

function fakeServices() {
  const log = { lighting: [] as LightingEvent[], sounds: [] as string[], overlays: 0, ducks: 0, silences: 0, clears: 0 };
  const services: CinematicServices = {
    lighting: (e) => log.lighting.push(e),
    sound: (cue) => log.sounds.push(cue),
    fixturesNear: () => ['a', 'b', 'c'],
    overlay: () => { log.overlays++; },
    duck: () => { log.ducks++; },
    silence: () => { log.silences++; },
    clearOverlay: () => { log.clears++; },
  };
  return { log, services };
}

describe('CinematicDirector', () => {
  it('plays a chase initiation stinger with local flicker and a red-tinged vignette', () => {
    const { log, services } = fakeServices();
    const director = new CinematicDirector(services);
    expect(director.play('chase-initiation', { position: new Vector3() })).toBe(true);
    expect(log.sounds).toContain('nw:chase-stinger');
    expect(log.lighting.every((e) => e.effect === 'flicker')).toBe(true);
    expect(log.lighting).toHaveLength(3);
    expect(log.overlays).toBe(1);
  });

  it('runs the lighting failure as a timeline that always restores', () => {
    const { log, services } = fakeServices();
    const director = new CinematicDirector(services);
    director.play('lighting-failure', { position: new Vector3(), intensity: 1 });
    expect(log.lighting.map((e) => e.effect)).toEqual(['flicker', 'flicker', 'flicker']);
    director.update(0.6);
    expect(log.lighting.some((e) => e.effect === 'blackout')).toBe(true);
    expect(log.lighting.some((e) => e.targetId === 'nw:lights:emergency' && (e.intensity ?? 0) > 1)).toBe(true);
    expect(log.sounds).toContain('nw:power-down');
    for (let i = 0; i < 80; i++) director.update(0.1);
    expect(log.lighting.at(-1)?.effect).toBe('restore');
    expect(director.pending).toBe(0);
  });

  it('cuts to silence after a chase, then lets something move far away', () => {
    const { log, services } = fakeServices();
    const director = new CinematicDirector(services);
    director.play('post-chase-silence');
    expect(log.silences).toBe(1);
    expect(log.clears).toBe(1);
    expect(log.sounds).toEqual([]);
    for (let i = 0; i < 70; i++) director.update(0.1);
    expect(log.sounds).toEqual(['nw:distant-steps']);
  });

  it('rate-limits each beat independently', () => {
    const { services } = fakeServices();
    const director = new CinematicDirector(services);
    expect(director.play('near-miss')).toBe(true);
    expect(director.play('near-miss')).toBe(false);
    expect(director.play('disappear', { position: new Vector3() })).toBe(true);
    expect(director.play('near-miss', { force: true })).toBe(true);
    director.update(13);
    expect(director.play('near-miss')).toBe(true);
  });
});

describe('ScreenOverlay', () => {
  it('blends pulses over a baseline and clears them', () => {
    const overlay = new ScreenOverlay(null);
    overlay.base = 0.1;
    overlay.pulse({ vignette: 0.6, tintStrength: 0.2, attack: 0.1, hold: 0.5, release: 1 });
    overlay.update(0.3);
    expect(overlay.vignetteValue).toBeCloseTo(0.6);
    expect(overlay.tintValue).toBeCloseTo(0.2);
    overlay.update(2);
    expect(overlay.vignetteValue).toBeCloseTo(0.1);
    overlay.pulse({ vignette: 0.9, attack: 0, hold: 5, release: 1 });
    overlay.clear();
    overlay.update(0.1);
    expect(overlay.vignetteValue).toBeCloseTo(0.1);
  });
});

describe('tension score mapping', () => {
  it('derives tension from announced behaviour only', () => {
    expect(tensionFrom([], 0)).toBe('calm');
    expect(tensionFrom(['patrol', 'investigate'], 0)).toBe('uneasy');
    expect(tensionFrom(['investigate', 'search'], 0)).toBe('search');
    expect(tensionFrom(['patrol'], 1)).toBe('chase');
    expect(tensionFrom(['pursue'], 0)).toBe('chase');
  });
});

describe('SilhouetteMirage', () => {
  const anchors = [{ id: 'a', roomId: 'r', position: new Vector3(0, 0, -20), yaw: 0 }];
  const ctx = (over: Partial<Parameters<SilhouetteMirage['update']>[1]> = {}) => ({
    camera: new Vector3(0, 1.6, 0), forward: new Vector3(0, 0, -1), clearLine: () => true, entities: [], calm: true, ...over,
  });

  it('appears only at a clear, distant sight line away from real entities', () => {
    const mirage = new SilhouetteMirage(new Group(), anchors, () => 0);
    expect(mirage.trigger(ctx({ entities: [new Vector3(0, 0, -18)] }))).toBeNull();
    expect(mirage.trigger(ctx({ clearLine: () => false }))).toBeNull();
    expect(mirage.trigger(ctx({ forward: new Vector3(0, 0, 1) }))).toBeNull();
    expect(mirage.trigger(ctx())?.id).toBe('a');
    mirage.dispose();
  });

  it('vanishes when approached and then waits a long time', () => {
    const mirage = new SilhouetteMirage(new Group(), anchors, () => 0);
    mirage.trigger(ctx());
    mirage.update(0.5, ctx());
    const event = mirage.update(0.1, ctx({ camera: new Vector3(0, 1.6, -12) }));
    expect(event?.type).toBe('vanish');
    for (let i = 0; i < 30; i++) mirage.update(0.1, ctx({ camera: new Vector3(0, 1.6, -12) }));
    expect(mirage.showing).toBeNull();
    for (let i = 0; i < 100; i++) expect(mirage.update(0.5, ctx())?.type).not.toBe('appear');
    mirage.dispose();
  });
});

describe('horror module (event-driven integration)', () => {
  const makeContext = () => {
    const build = createHospitalWorld({ textures: false });
    const events = createEventBus();
    const scene = new Scene();
    scene.add(build.world.root);
    const camera = new PerspectiveCamera(70, 16 / 9, 0.05, 250);
    camera.position.set(-12.4, 1.6, 0);
    const context = {
      engine: { scene, camera, renderer: { domElement: { parentElement: null } }, physics: null, audio: { context: null } },
      events, world: build.world, player: null,
    } as unknown as ModuleContext;
    return { build, events, scene, context };
  };

  it('answers chase start/end and scare requests through the event bus', async () => {
    const { build, events, scene, context } = makeContext();
    const lighting: LightingEvent[] = [];
    const sounds: SoundEvent[] = [];
    events.on('atmosphere:lighting', (e) => lighting.push(e));
    events.on('atmosphere:sound', (e) => sounds.push(e));
    const instance = await (horrorModule as GameModule).setup(context);
    instance.update?.({ deltaSeconds: 1 / 60, elapsedSeconds: 0 });
    events.emit('chase:started', { chaseId: 'c1', entityId: 'nw:entity:patient', playerId: 'p', position: { x: -11, y: 0, z: 0 }, timeSeconds: 1 });
    expect(sounds.map((s) => s.cueId)).toContain('nw:chase-stinger');
    expect(lighting.length).toBeGreaterThan(0);
    events.emit('chase:ended', { chaseId: 'c1', entityId: 'nw:entity:patient', playerId: 'p', reason: 'escaped', timeSeconds: 9 });
    expect(sounds.map((s) => s.cueId)).toContain('nw:mix:silence');
    lighting.length = 0;
    events.emit('horror:scare', { triggerId: 'nw:scare:lighting-failure', position: { x: -11, y: 1, z: 0 }, intensity: 1 });
    for (let i = 0; i < 120; i++) instance.update?.({ deltaSeconds: 1 / 15, elapsedSeconds: 0.1 + i / 15 });
    expect(lighting.some((e) => e.effect === 'blackout')).toBe(true);
    expect(lighting.some((e) => e.effect === 'restore')).toBe(true);
    // The Reflection appears in an anchored mirror on request and nowhere else.
    const mirror = build.extras.reflectiveSurfaces.find((s) => s.kind === 'mirror')!;
    events.emit('horror:reflection', { id: 'nw:reflection:1', anchorId: mirror.id, visible: true, durationSeconds: 2 });
    instance.update?.({ deltaSeconds: 0.1, elapsedSeconds: 10 });
    const layer = scene.getObjectByName('nw:horror-layer')!;
    const reflectionMesh = layer.getObjectByName('nw:reflection')!;
    expect(reflectionMesh.visible).toBe(true);
    expect(reflectionMesh.position.distanceTo(mirror.position)).toBeLessThan(0.02);
    await instance.dispose();
    expect(scene.getObjectByName('nw:horror-layer')).toBeUndefined();
    build.dispose();
  });

  it('attaches bodies to gameplay entity nodes without moving them', async () => {
    const { build, events, scene, context } = makeContext();
    const root = new Group();
    root.name = 'night-ward:entities';
    const node = new Group();
    node.userData = { entityId: 'nw:entity:nurse', entityType: 'nurse', behaviourState: 'patrol' };
    node.position.set(-8, 0, 0.2);
    root.add(node);
    scene.add(root);
    const instance = await (horrorModule as GameModule).setup(context);
    for (let i = 0; i < 30; i++) instance.update?.({ deltaSeconds: 1 / 30, elapsedSeconds: i / 30 });
    expect(node.children.some((c) => c.name === 'nw:entity-visual:nurse')).toBe(true);
    expect(node.position.toArray()).toEqual([-8, 0, 0.2]);
    await instance.dispose();
    expect(node.children).toHaveLength(0);
    void events;
    build.dispose();
  });
});
