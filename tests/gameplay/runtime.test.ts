import RAPIER from '@dimforge/rapier3d-compat';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene } from 'three';
import type { WebGLRenderer } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ColliderDefinition, EngineServices, GameModule, HospitalWorld } from '../../src/contracts';
import { createEventBus, createModuleRegistry } from '../../src/integration';
import { createGameplayModule, createGameplayRuntime } from '../../src/gameplay';
import type { GameplayRuntime, PlayerInput } from '../../src/gameplay';

beforeAll(async () => { await RAPIER.init(); });
const rotation = { x: 0, y: 0, z: 0, w: 1 };
function fixture(): HospitalWorld {
  const root = new Group();
  const hinge = new Group(); hinge.position.set(-0.5, 0, 0);
  const panel = new Mesh(new BoxGeometry(1, 2, 0.12), new MeshBasicMaterial());
  panel.position.set(0.5, 1, 0); hinge.add(panel); root.add(hinge);
  const door = {
    id: 'test:door', type: 'door' as const, object: hinge, prompt: 'Open', range: 3,
    colliderIds: ['test:door-body'], initialState: 'closed' as const, durationSeconds: 0.5,
    closedPose: { position: { x: -0.5, y: 0, z: 0 }, rotation },
    openPose: { position: { x: -0.5, y: 0, z: 0 }, rotation: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 } },
  };
  return {
    id: 'test:world', root, bounds: { min: { x: -8, y: -1, z: -8 }, max: { x: 8, y: 4, z: 8 } }, rooms: [],
    colliders: [
      { id: 'test:floor', shape: { type: 'box', halfExtents: { x: 8, y: 0.25, z: 8 } }, pose: { position: { x: 0, y: -0.25, z: 0 }, rotation }, bodyType: 'fixed', sensor: false },
      { id: 'test:door-body', shape: { type: 'box', halfExtents: { x: 0.5, y: 1, z: 0.06 } }, pose: { position: { x: 0, y: 1, z: 0 }, rotation }, bodyType: 'kinematic', sensor: false, interactableId: door.id },
    ],
    interactables: [door], doors: [door], hidingLocations: [], entitySpawns: [], patrolRoutes: [],
    playerSpawn: { position: { x: 0, y: 0.005, z: 2 }, yaw: 0 },
  };
}
function engine(physics: RAPIER.World): EngineServices {
  return {
    scene: new Scene(), camera: new PerspectiveCamera(70, 1, 0.05, 100), physics,
    renderer: { domElement: {} } as unknown as WebGLRenderer,
    audio: { context: null, resume: async () => {}, dispose: async () => {} },
  };
}
function worldModule(world: HospitalWorld): GameModule {
  return { id: 'test:world-module', kind: 'world', setup: () => ({ world, dispose() {
    world.root.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      }
    });
  } }) };
}

describe('NW-001B shared GameModule integration', () => {
  it('remains inert without a world so the foundation fixture can still boot', async () => {
    const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const events = createEventBus();
    const registry = createModuleRegistry(engine(physics), events);
    try {
      registry.register(createGameplayModule());
      await registry.start();
      expect(registry.player).toBeNull();
      expect(physics.colliders.len()).toBe(0);
    } finally { await registry.dispose(); events.dispose(); physics.free(); }
  });

  it('publishes the real player, opens a raycast door, moves through it and releases all owned physics', async () => {
    const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const events = createEventBus();
    const services = engine(physics);
    const registry = createModuleRegistry(services, events);
    let runtime: GameplayRuntime | undefined;
    let input: PlayerInput = { forward: 0, right: 0, sprint: false, crouch: false };
    registry.register(worldModule(fixture()));
    registry.register({ id: 'test:gameplay', kind: 'gameplay', setup(context) {
      runtime = createGameplayRuntime(context, { input: { read: () => input, dispose() {} }, attachControls: false, showHud: false });
      return runtime;
    } });
    try {
      await registry.start();
      expect(registry.player).toBe(runtime?.player);
      if (!runtime) throw new Error('Gameplay did not start');
      expect(runtime.interactions.getPrompt()?.action).toBe('open');
      runtime.interactions.interact(0);
      for (let step = 1; step <= 45; step++) {
        const frame = { deltaSeconds: 1 / 60, elapsedSeconds: step / 60 };
        registry.fixedUpdate(frame); physics.step(); registry.update(frame);
      }
      expect(runtime.interactions.getDoorState('test:door')).toBe('open');
      input = { forward: 1, right: 0, sprint: false, crouch: false };
      for (let step = 46; step <= 165; step++) {
        const frame = { deltaSeconds: 1 / 60, elapsedSeconds: step / 60 };
        registry.fixedUpdate(frame); physics.step(); registry.update(frame);
      }
      expect(runtime.player.getSnapshot().position.z).toBeLessThan(-2);
      expect(runtime.player.getSnapshot().position.y).toBeGreaterThanOrEqual(-0.005);
      events.emit('player:captured', { playerId: 'player', entityId: 'test:entity', position: runtime.player.getSnapshot().position, timeSeconds: 3 });
      expect(runtime.player.getSnapshot().captured).toBe(true);
    } finally {
      await registry.dispose(); events.dispose();
      expect(physics.colliders.len()).toBe(0);
      expect(services.scene.children).toHaveLength(0);
      physics.free();
    }
  });

  it('rejects an obstructed spawn and rolls back imported colliders without editing the world', async () => {
    const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const events = createEventBus();
    const services = engine(physics);
    const registry = createModuleRegistry(services, events);
    const world = fixture();
    const obstruction: ColliderDefinition = {
      id: 'test:spawn-blocker', shape: { type: 'sphere', radius: 1 },
      pose: { position: { x: 0, y: 1, z: 2 }, rotation }, bodyType: 'fixed', sensor: false,
    };
    registry.register(worldModule({ ...world, colliders: [...world.colliders, obstruction] }));
    registry.register(createGameplayModule({ attachControls: false, showHud: false }));
    try {
      await expect(registry.start()).rejects.toMatchObject({
        cause: { message: expect.stringContaining('obstructed or unsupported') },
      });
      expect(physics.colliders.len()).toBe(0);
      expect(registry.player).toBeNull();
      expect(services.scene.children).toHaveLength(0);
    } finally { await registry.dispose(); events.dispose(); physics.free(); }
  });
});
