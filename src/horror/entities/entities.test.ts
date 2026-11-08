import { Group, Mesh, PerspectiveCamera, Scene, SkinnedMesh, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { EntityBehaviourState } from '../../contracts';
import type { ReflectiveSurface } from '../../world/extras';
import { resolveVisualState, type VisualState } from './animator';
import { FootprintTrail } from './footprints';
import { EntityPresenter, sceneEntityNodes } from './presenter';
import { ReflectionPresenter } from './reflection';
import { type BodiedEntityType, createEntityVisual } from './visual';

const TYPES: readonly BodiedEntityType[] = ['patient', 'nurse', 'crawler', 'watcher'];
const run = (type: BodiedEntityType, state: VisualState, speed: number, seconds: number, step = 1 / 60) => {
  const v = createEntityVisual(type, { seed: 5 });
  v.forceState(state);
  let steps = 0;
  const heads: number[] = [];
  const soles: number[] = [];
  for (let t = 0; t < seconds; t += step) {
    steps += v.update(step, { behaviour: 'patrol', speed }).length;
    heads.push(v.bonePosition('head').y);
    soles.push(Math.min(v.bonePosition('footL').y, v.bonePosition('footR').y));
  }
  return { v, steps, heads, soles };
};

describe('entity visuals', () => {
  it.each(TYPES)('%s builds as a few skinned meshes and disposes everything', (type) => {
    const parent = new Group();
    const v = createEntityVisual(type);
    parent.add(v.object);
    const meshes: SkinnedMesh[] = [];
    v.object.traverse((o) => { if (o instanceof SkinnedMesh) meshes.push(o); });
    expect(meshes.length).toBeGreaterThanOrEqual(2);
    expect(meshes.length).toBeLessThanOrEqual(6);
    const spies = meshes.map((m) => vi.spyOn(m.geometry, 'dispose'));
    const materialSpies = meshes.map((m) => vi.spyOn(m.material as never as { dispose(): void }, 'dispose'));
    v.dispose();
    spies.forEach((s) => expect(s).toHaveBeenCalled());
    materialSpies.forEach((s) => expect(s).toHaveBeenCalled());
    expect(v.object.parent).toBeNull();
    expect(() => v.dispose()).not.toThrow();
  });

  it('gives each entity a distinct, recognisable height', () => {
    const top = (type: BodiedEntityType) => Math.max(...run(type, type === 'watcher' ? 'stand' : 'idle', 0, 1).heads);
    expect(top('patient')).toBeGreaterThan(1.9);
    expect(top('watcher')).toBeGreaterThan(2.1);
    expect(top('nurse')).toBeGreaterThan(1.55);
    expect(top('nurse')).toBeLessThan(1.85);
    expect(top('crawler')).toBeLessThan(0.8);
  });

  it.each([['patient', 'walk', 0.75], ['patient', 'run', 4], ['nurse', 'walk', 0.9], ['nurse', 'run', 3.2], ['watcher', 'walk', 0.5]] as const)(
    '%s %s keeps a foot planted on the floor', (type, state, speed) => {
      const { soles, v } = run(type, state, speed, 3);
      const ankle = type === 'patient' ? 0.07 : 0.06;
      for (const s of soles) expect(s - ankle).toBeGreaterThan(-0.03);
      expect(Math.min(...soles) - ankle).toBeLessThan(0.01);
      v.dispose();
    });

  it('keeps the crawler low with its hands reaching the floor', () => {
    const v = createEntityVisual('crawler', { seed: 2 });
    v.forceState('walk');
    let minHand = Infinity;
    let maxHead = 0;
    for (let i = 0; i < 300; i++) {
      v.update(1 / 60, { behaviour: 'patrol', speed: 0.6 });
      minHand = Math.min(minHand, v.bonePosition('handL').y, v.bonePosition('handR').y);
      if (i > 60) maxHead = Math.max(maxHead, v.bonePosition('head').y);
    }
    expect(minHand).toBeLessThan(0.12);
    expect(maxHead).toBeLessThan(0.95);
    v.dispose();
  });

  it('emits footsteps in proportion to speed, none while still', () => {
    expect(run('patient', 'idle', 0, 4).steps).toBe(0);
    const walk = run('patient', 'walk', 0.75, 4).steps;
    const sprint = run('patient', 'run', 4, 4).steps;
    expect(walk).toBeGreaterThanOrEqual(3);
    expect(walk).toBeLessThanOrEqual(6);
    expect(sprint).toBeGreaterThan(walk * 2);
    expect(run('crawler', 'walk', 0.6, 4).steps).toBeGreaterThan(3);
    expect(run('watcher', 'walk', 0.5, 4).steps).toBe(0);
  });

  it('never writes to the gameplay-owned parent transform', () => {
    const node = new Group();
    node.position.set(3, 0, -2);
    node.rotation.set(0, 1.1, 0);
    const v = createEntityVisual('patient');
    node.add(v.object);
    const before = { p: node.position.clone(), q: node.quaternion.clone() };
    for (const behaviour of ['patrol', 'pursue', 'search', 'investigate'] as EntityBehaviourState[]) {
      for (let i = 0; i < 60; i++) v.update(1 / 60, { behaviour, speed: behaviour === 'pursue' ? 4 : 0.8 });
    }
    expect(node.position.equals(before.p)).toBe(true);
    expect(node.quaternion.equals(before.q)).toBe(true);
    expect(v.object.position.lengthSq()).toBe(0);
    v.dispose();
  });

  it('only changes the Watcher pose while it is unobserved', () => {
    const v = createEntityVisual('watcher', { seed: 1 });
    const headRotation = () => v.object.getObjectByName('nw:visual:watcher:head')!.rotation.clone();
    for (let i = 0; i < 60; i++) v.update(0.1, { behaviour: 'idle', speed: 0, observed: true });
    const watched = headRotation();
    for (let i = 0; i < 400; i++) v.update(0.1, { behaviour: 'idle', speed: 0, observed: true });
    expect(headRotation().equals(watched)).toBe(true);
    let changed = false;
    for (let i = 0; i < 400 && !changed; i++) {
      v.update(0.1, { behaviour: 'idle', speed: 0, observed: false });
      changed = !headRotation().equals(watched);
    }
    expect(changed).toBe(true);
    v.dispose();
  });
});

describe('visual state mapping', () => {
  const r = (over: Partial<Parameters<typeof resolveVisualState>[3]> = {}) => ({ previous: 'idle' as VisualState, behaviourTime: 5, stillTime: 0, nearDoor: false, ...over });

  it('turns pursuit into an alert snap followed by a run', () => {
    expect(resolveVisualState('patient', 'pursue', 0, r({ behaviourTime: 0.2 }))).toBe('alert');
    expect(resolveVisualState('patient', 'pursue', 4, r({ behaviourTime: 1.2 }))).toBe('run');
    expect(resolveVisualState('nurse', 'pursue', 3, r({ behaviourTime: 1 }))).toBe('run');
    expect(resolveVisualState('crawler', 'pursue', 3, r({ behaviourTime: 0.1 }))).toBe('alert');
  });

  it('stalks while patrolling, idles when still, watches from doorways', () => {
    expect(resolveVisualState('patient', 'patrol', 0.8, r())).toBe('walk');
    expect(resolveVisualState('patient', 'patrol', 0, r())).toBe('idle');
    expect(resolveVisualState('patient', 'patrol', 0, r({ nearDoor: true, stillTime: 2 }))).toBe('observe');
    expect(resolveVisualState('patient', 'search', 0.4, r())).toBe('search');
    expect(resolveVisualState('patient', 'lost-target', 0, r())).toBe('lost');
  });

  it('makes the Nurse stop to listen when investigating', () => {
    expect(resolveVisualState('nurse', 'investigate', 0.9, r({ behaviourTime: 0.5 }))).toBe('listen');
    expect(resolveVisualState('nurse', 'investigate', 0, r({ behaviourTime: 4 }))).toBe('listen');
    expect(resolveVisualState('nurse', 'investigate', 1.2, r({ behaviourTime: 4 }))).toBe('walk');
  });

  it('keeps the Watcher motionless unless it is actually being moved', () => {
    expect(resolveVisualState('watcher', 'pursue', 0, r())).toBe('stand');
    expect(resolveVisualState('watcher', 'patrol', 0.4, r())).toBe('walk');
  });
});

describe('EntityPresenter', () => {
  const setup = () => {
    const scene = new Scene();
    const root = new Group();
    root.name = 'night-ward:entities';
    scene.add(root);
    const node = new Group();
    node.name = 'night-ward:entity:nw:entity:patient';
    node.userData = { entityId: 'nw:entity:patient', entityType: 'patient', behaviourState: 'patrol' };
    node.position.set(0, 0, -6);
    root.add(node);
    const camera = new PerspectiveCamera(70, 16 / 9, 0.05, 100);
    camera.position.set(0, 1.6, 0);
    camera.updateMatrixWorld();
    scene.add(camera);
    return { scene, root, node, camera };
  };

  it('attaches bodies to gameplay nodes, measures speed and reports footsteps', () => {
    const { scene, node, camera } = setup();
    const steps: string[] = [];
    const presenter = new EntityPresenter({ source: sceneEntityNodes(scene), camera, onFootstep: (_e, bone) => steps.push(bone) });
    presenter.update(1 / 60);
    const entity = presenter.get('nw:entity:patient')!;
    expect(entity.visual.object.parent).toBe(node);
    for (let i = 0; i < 240; i++) {
      node.position.z -= 0.8 / 60; // gameplay moves the node; presentation only reads it
      presenter.update(1 / 60);
    }
    expect(entity.speed).toBeGreaterThan(0.6);
    expect(entity.speed).toBeLessThan(1.0);
    expect(entity.visual.visualState).toBe('walk');
    expect(steps.length).toBeGreaterThan(2);
    expect(entity.observed).toBe(true);
    presenter.dispose();
  });

  it('disposes the body when gameplay removes the node and ignores the Reflection', () => {
    const { scene, root, node, camera } = setup();
    const reflection = new Group();
    reflection.userData = { entityId: 'nw:entity:reflection', entityType: 'reflection', behaviourState: 'idle' };
    root.add(reflection);
    const presenter = new EntityPresenter({ source: sceneEntityNodes(scene), camera });
    presenter.update(1 / 60);
    expect(presenter.list.map((e) => e.id)).toEqual(['nw:entity:patient']);
    const visual = presenter.get('nw:entity:patient')!.visual;
    const spy = vi.spyOn(visual, 'dispose');
    node.removeFromParent();
    presenter.update(1 / 60);
    expect(spy).toHaveBeenCalled();
    expect(presenter.list).toHaveLength(0);
    presenter.dispose();
  });

  it('reports a reveal when something far away comes into view after a long absence', () => {
    const { scene, node, camera } = setup();
    node.position.set(0, 0, -20);
    let blocked = true;
    const reveals: string[] = [];
    const presenter = new EntityPresenter({ source: sceneEntityNodes(scene), camera, sightInterval: 0, lineOfSight: () => !blocked, onReveal: (e) => reveals.push(e.id) });
    for (let i = 0; i < 30; i++) presenter.update(1);
    expect(reveals).toEqual([]);
    blocked = false;
    presenter.update(0.1);
    expect(reveals).toEqual(['nw:entity:patient']);
    presenter.dispose();
  });
});

describe('ReflectionPresenter', () => {
  const surface: ReflectiveSurface = { id: 'nw:mirror:test:01', kind: 'mirror', roomId: 'r', position: new Vector3(0, 1.6, -2), normal: new Vector3(0, 0, 1), width: 0.46, height: 0.66 };
  const camera = new PerspectiveCamera(70, 1, 0.05, 100);
  camera.position.set(0.3, 1.6, 0);
  camera.lookAt(-0.8, 1.6, -2);
  camera.updateMatrixWorld();

  it('appears in a mirror the camera faces and fades out when hidden', () => {
    const parent = new Group();
    const reflection = new ReflectionPresenter(parent, [surface], camera);
    expect(reflection.show(null, 2)).toBe(true);
    expect(reflection.state.surfaceId).toBe(surface.id);
    for (let i = 0; i < 30; i++) reflection.update(1 / 30);
    expect(reflection.state.opacity).toBeGreaterThan(0.3);
    const mesh = parent.getObjectByName('nw:reflection') as Mesh;
    expect(mesh.position.distanceTo(surface.position)).toBeLessThan(0.01);
    for (let i = 0; i < 120; i++) reflection.update(1 / 30);
    expect(reflection.state.visible).toBe(false);
    reflection.dispose();
    expect(parent.children).toHaveLength(0);
  });

  it('vanishes when stared at directly from close by', () => {
    const staring = new PerspectiveCamera(70, 1, 0.05, 100);
    staring.position.set(0, 1.6, 0);
    staring.lookAt(surface.position);
    staring.updateMatrixWorld();
    const reflection = new ReflectionPresenter(new Group(), [surface], staring);
    reflection.show(surface.id, 10);
    for (let i = 0; i < 90; i++) reflection.update(1 / 30);
    expect(reflection.state.visible).toBe(false);
    reflection.dispose();
  });

  it('refuses surfaces behind the camera and resolves exact anchors', () => {
    const behind: ReflectiveSurface = { ...surface, id: 'b', position: new Vector3(0, 1.6, 3), normal: new Vector3(0, 0, -1) };
    const reflection = new ReflectionPresenter(new Group(), [behind], camera);
    expect(reflection.show(null, 1)).toBe(false);
    expect(reflection.show('b', 1)).toBe(true);
    reflection.dispose();
  });
});

describe('FootprintTrail', () => {
  it('lays prints that fade and recycle', () => {
    const trail = new FootprintTrail(new Group(), 4, 2);
    trail.add(new Vector3(1, 0, 1), 0, true);
    trail.add(new Vector3(1.4, 0, 0.4), 0, false);
    expect(trail.count).toBe(2);
    trail.update(1);
    expect(trail.count).toBe(2);
    trail.update(1.5);
    expect(trail.count).toBe(0);
    for (let i = 0; i < 6; i++) trail.add(new Vector3(i, 0, 0), 0, i % 2 === 0);
    expect(trail.count).toBe(4);
    trail.dispose();
  });
});
