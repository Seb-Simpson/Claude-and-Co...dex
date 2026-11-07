import { Group, Scene } from 'three';
import { expect, it } from 'vitest';
import type { EntitySnapshot } from '../../src/contracts';
import { createEntityPresentation } from '../../src/entities';

it('binds shared entity snapshots to named scene nodes without taking model resource ownership', () => {
  const scene = new Scene();
  let actors: EntitySnapshot[] = [{ id: 'patient', type: 'patient', position: { x: 1, y: 0, z: 2 }, state: 'patrol', lastKnownPlayer: null }];
  const bridge = createEntityPresentation(scene, { getSnapshots: () => actors });
  const node = scene.getObjectByName('night-ward:entity:patient');
  expect(node).toBe(bridge.getObject('patient'));
  expect(node?.position.toArray()).toEqual([1, 0, 2]);
  const model = new Group(); node?.add(model);
  actors = [{ ...actors[0]!, position: { x: 2, y: 0, z: 2 }, state: 'pursue' }];
  bridge.update();
  expect(node?.position.x).toBe(2);
  expect(node?.rotation.y).toBeCloseTo(-Math.PI / 2);
  expect(node?.userData.behaviourState).toBe('pursue');
  expect(node?.children).toContain(model);
  bridge.dispose(); bridge.dispose();
  expect(scene.children).toHaveLength(0);
  expect(model.parent).toBe(node);
});
