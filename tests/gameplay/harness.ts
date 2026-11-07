import {
  AmbientLight, BoxGeometry, Color, DirectionalLight, DoubleSide, Group, Mesh,
  MeshStandardMaterial, Vector3,
} from 'three';
import type { DoorMarker, GameModule, HospitalWorld, PlayerSnapshot, Vec3 } from '../../src/contracts';
import { createEngine } from '../../src/engine';
import { createEventBus, createModuleRegistry } from '../../src/integration';
import { createGameplayRuntime } from '../../src/gameplay/runtime';
import type { GameplayRuntime } from '../../src/gameplay/runtime';

export interface GameplayHarness {
  ready: boolean;
  getSnapshot(): PlayerSnapshot;
  getDoorState(): string | undefined;
  moveTo(position: Vec3): void;
  aimAt(position: Vec3): void;
}
declare global { interface Window { nwTest: GameplayHarness } }

const identity = { x: 0, y: 0, z: 0, w: 1 };
function createFixture(): { world: HospitalWorld; dispose(): void } {
  const root = new Group();
  const geometries: BoxGeometry[] = [];
  const materials: MeshStandardMaterial[] = [];
  function box(width: number, height: number, depth: number, color: string): Mesh {
    const geometry = new BoxGeometry(width, height, depth);
    const material = new MeshStandardMaterial({ color, roughness: 0.9, side: DoubleSide });
    geometries.push(geometry); materials.push(material);
    return new Mesh(geometry, material);
  }
  const floor = box(16, 0.2, 16, '#425962'); floor.position.y = -0.1; root.add(floor);
  const wall = box(12, 3, 0.15, '#8b9fa4'); wall.position.set(0, 1.5, -3); root.add(wall);
  const doorObject = new Group(); doorObject.position.set(2.5, 0, 0);
  const leaf = box(1, 2.3, 0.12, '#a08c68'); leaf.position.set(0.5, 1.15, 0); doorObject.add(leaf); root.add(doorObject);
  const door: DoorMarker = {
    id: 'test:door', type: 'door', object: doorObject, prompt: 'Open door', range: 2.2,
    colliderIds: ['test:door-body'], initialState: 'closed', durationSeconds: 0.5,
    closedPose: { position: { x: 2.5, y: 0, z: 0 }, rotation: identity },
    openPose: { position: { x: 2.5, y: 0, z: 0 }, rotation: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 } },
  };
  const locker = box(1, 2, 0.7, '#42667b'); locker.position.set(-3, 1, -0.5); root.add(locker);
  root.add(new AmbientLight('#e5f1f5', 1.6));
  const light = new DirectionalLight('#fff0d6', 2.4); light.position.set(2, 6, 4); root.add(light);
  const world: HospitalWorld = {
    id: 'nw001b:isolated-fixture', root,
    bounds: { min: { x: -8, y: -0.2, z: -8 }, max: { x: 8, y: 4, z: 8 } }, rooms: [],
    colliders: [
      { id: 'test:floor', bodyType: 'fixed', sensor: false, shape: { type: 'box', halfExtents: { x: 8, y: 0.1, z: 8 } }, pose: { position: { x: 0, y: -0.1, z: 0 }, rotation: identity } },
      { id: 'test:wall', bodyType: 'fixed', sensor: false, shape: { type: 'box', halfExtents: { x: 6, y: 1.5, z: 0.075 } }, pose: { position: { x: 0, y: 1.5, z: -3 }, rotation: identity } },
      { id: 'test:door-body', bodyType: 'kinematic', sensor: false, interactableId: 'test:door', shape: { type: 'box', halfExtents: { x: 0.5, y: 1.15, z: 0.06 } }, pose: { position: { x: 3, y: 1.15, z: 0 }, rotation: identity } },
      { id: 'test:locker-body', bodyType: 'fixed', sensor: false, interactableId: 'test:locker', shape: { type: 'box', halfExtents: { x: 0.5, y: 1, z: 0.35 } }, pose: { position: { x: -3, y: 1, z: -0.5 }, rotation: identity } },
    ],
    interactables: [door, { id: 'test:locker', type: 'locker', object: locker, prompt: 'Hide', range: 2.2, colliderIds: ['test:locker-body'] }],
    doors: [door],
    hidingLocations: [{
      id: 'test:hiding', interactableId: 'test:locker', type: 'locker', capacity: 1,
      colliderIds: ['test:locker-body'], playerPosition: { x: -3, y: 0.003, z: -0.5 },
      cameraPose: { position: { x: -3, y: 1.55, z: -0.5 }, rotation: identity },
      exitCandidates: [{ position: { x: -3, y: 0.003, z: 1 }, yaw: 0 }],
    }],
    entitySpawns: [], patrolRoutes: [], playerSpawn: { position: { x: 0, y: 0.003, z: 3 }, yaw: 0 },
  };
  return { world, dispose() { for (const geometry of geometries) geometry.dispose(); for (const material of materials) material.dispose(); } };
}

async function start(): Promise<void> {
  const container = document.querySelector<HTMLElement>('#stage');
  if (!container) throw new Error('Missing harness stage');
  const engine = await createEngine({ container, maxPixelRatio: 1 });
  engine.services.scene.background = new Color('#172329');
  const events = createEventBus();
  const registry = createModuleRegistry(engine.services, events);
  registry.register({ id: 'nw001b:test-world', kind: 'world', setup: () => createFixture() } satisfies GameModule);
  let runtime: GameplayRuntime | undefined;
  registry.register({
    id: 'nw001b:test-gameplay', kind: 'gameplay',
    setup(context) { runtime = createGameplayRuntime(context); return runtime; },
  });
  await registry.start();
  if (!runtime) throw new Error('Gameplay did not start');
  const game = runtime;
  window.nwTest = {
    ready: true,
    getSnapshot: () => game.player.getSnapshot(),
    getDoorState: () => game.interactions.getDoorState('test:door'),
    moveTo(position) {
      if (!game.player.body.canOccupy(position)) throw new Error('Harness destination is obstructed');
      game.player.body.setPosition(position);
      game.player.setViewRotation({ yaw: 0, pitch: 0 });
      game.update({ deltaSeconds: 0, elapsedSeconds: 0 });
    },
    aimAt(position) {
      const eye = game.player.getSnapshot().camera.getWorldPosition(new Vector3());
      const x = position.x - eye.x, y = position.y - eye.y, z = position.z - eye.z;
      game.player.setViewRotation({ yaw: Math.atan2(-x, -z), pitch: Math.atan2(y, Math.hypot(x, z)) });
    },
  };
  engine.start({ fixedUpdate: (frame) => registry.fixedUpdate(frame), update: (frame) => registry.update(frame) });
  window.addEventListener('pagehide', () => {
    engine.stop();
    void registry.dispose().finally(() => { events.dispose(); void engine.dispose(); });
  }, { once: true });
}
void start().catch((error: unknown) => {
  console.error(error);
  const alert = document.querySelector('#error');
  if (alert) alert.textContent = error instanceof Error ? error.message : String(error);
});
