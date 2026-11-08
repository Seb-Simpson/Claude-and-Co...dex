import { Group, Mesh, Scene } from 'three';
import { expect, it, vi } from 'vitest';
import type { EntitySnapshot } from '../../src/contracts';
import { createEntityPresentation } from '../../src/entities';

it('binds shared entity snapshots to named scene nodes without taking model resource ownership', () => {
  const scene = new Scene();
  let actors: EntitySnapshot[] = [{ id: 'patient', type: 'patient', position: { x: 1, y: 0, z: 2 }, state: 'patrol', lastKnownPlayer: null }];
  const bridge = createEntityPresentation(scene, { getSnapshots: () => actors });
  const node = scene.getObjectByName('night-ward:entity:patient');
  expect(node).toBe(bridge.getObject('patient'));
  expect(node?.position.toArray()).toEqual([1, 0, 2]);
  const proxy = node?.getObjectByName('night-ward:patient:temporary-proxy');
  expect(proxy?.visible).toBe(true);
  const model = new Group(); node?.add(model);
  actors = [{ ...actors[0]!, position: { x: 2, y: 0, z: 2 }, state: 'pursue' }];
  bridge.update();
  expect(node?.position.x).toBe(2);
  expect(node?.rotation.y).toBeCloseTo(-Math.PI / 2);
  expect(node?.userData.behaviourState).toBe('pursue');
  expect(node?.children).toContain(model);
  expect(proxy?.visible).toBe(false);
  bridge.dispose(); bridge.dispose();
  expect(scene.children).toHaveLength(0);
  expect(model.parent).toBe(node);
});

it('owns and disposes only the temporary Patient geometry and can restore it when an external model leaves', () => {
  const scene = new Scene();
  const actors: EntitySnapshot[] = [{ id: 'patient', type: 'patient', position: { x: 0, y: 0, z: 0 }, state: 'idle', lastKnownPlayer: null }];
  const bridge = createEntityPresentation(scene, { getSnapshots: () => actors });
  const node = bridge.getObject('patient')!;
  const proxy = node.getObjectByName('night-ward:patient:temporary-proxy')!;
  const meshes: Mesh[] = [];
  proxy.traverse((object) => { if (object instanceof Mesh) meshes.push(object); });
  expect(meshes.length).toBeGreaterThan(0);
  const geometries = meshes.map((mesh) => vi.spyOn(mesh.geometry, 'dispose'));
  const external = new Group();
  node.add(external); bridge.update();
  expect(proxy.visible).toBe(false);
  external.removeFromParent(); bridge.update();
  expect(proxy.visible).toBe(true);
  node.userData.nwEntityModelReady = true; bridge.update();
  expect(proxy.visible).toBe(false);
  bridge.dispose(); bridge.dispose();
  for (const dispose of geometries) expect(dispose).toHaveBeenCalledTimes(1);
});
