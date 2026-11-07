import RAPIER from '@dimforge/rapier3d-compat';
import { PerspectiveCamera } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ColliderDefinition, HidingLocation, HidingStateEvent } from '../../src/contracts';
import { createEventBus } from '../../src/integration';
import { createHidingSystem } from '../../src/gameplay/hiding';
import { createPlayerController } from '../../src/gameplay/player';
import { createPhysicsAdapter } from '../../src/physics';

beforeAll(async () => { await RAPIER.init(); });
const identity = { x: 0, y: 0, z: 0, w: 1 };
function setup(exitCandidates: HidingLocation['exitCandidates'] = [{ position: { x: 0, y: 0, z: 0 }, yaw: Math.PI / 2 }]) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const definitions: ColliderDefinition[] = [
    { id: 'floor', bodyType: 'fixed', sensor: false, pose: { position: { x: 0, y: -0.1, z: 0 }, rotation: identity }, shape: { type: 'box', halfExtents: { x: 5, y: 0.1, z: 5 } } },
    { id: 'locker-envelope', bodyType: 'fixed', sensor: false, pose: { position: { x: 0, y: 1, z: -1.5 }, rotation: identity }, shape: { type: 'box', halfExtents: { x: 0.6, y: 1, z: 0.5 } } },
  ];
  const physics = createPhysicsAdapter(world, definitions);
  const events = createEventBus();
  const body = physics.createCharacter({ position: { x: 0, y: 0.01, z: 0 }, radius: 0.28, height: 1.8 });
  const player = createPlayerController({ camera: new PerspectiveCamera(), body, spawn: { position: body.getPosition(), yaw: 0 }, events });
  const spot: HidingLocation = {
    id: 'spot', interactableId: 'locker', type: 'locker', capacity: 1,
    playerPosition: { x: 0, y: 0.01, z: -1.5 }, cameraPose: { position: { x: 0, y: 0.9, z: -1.5 }, rotation: identity },
    colliderIds: ['locker-envelope'], exitCandidates,
  };
  return { world, physics, events, player, spot, release() { player.dispose(); physics.dispose(); events.dispose(); world.free(); } };
}

describe('hiding occupancy and safe exits', () => {
  it('captures witnesses before entry and preserves their justified knowledge through transitions', () => {
    const f = setup();
    try {
      const changes: HidingStateEvent[] = [];
      f.events.on('hiding:state', (event) => changes.push(event));
      let observedEntryZ = 99;
      const hiding = createHidingSystem({
        locations: [f.spot], player: f.player, physics: f.physics, events: f.events,
        witnesses: () => { observedEntryZ = f.player.getSnapshot().position.z; return ['patient', 'patient']; },
      });
      expect(hiding.enter('spot', 1)).toBe(true);
      expect(observedEntryZ).toBe(0);
      expect(hiding.enter('spot', 1.1)).toBe(false);
      expect(hiding.getOccupancy('spot')).toEqual({ spotId: 'spot', occupantId: 'player', state: 'entering' });
      hiding.fixedUpdate({ deltaSeconds: 1 / 60, elapsedSeconds: 1.36 });
      expect(f.player.getSnapshot().hiding.state).toBe('hidden');
      expect(hiding.exit(2)).toBe(true);
      expect(f.player.getSnapshot().rotation.yaw).toBeCloseTo(Math.PI / 2);
      hiding.fixedUpdate({ deltaSeconds: 1 / 60, elapsedSeconds: 2.36 });
      expect(hiding.getOccupancy('spot')).toEqual({ spotId: 'spot', occupantId: null, state: 'outside' });
      expect(changes.map((event) => event.current)).toEqual(['entering', 'hidden', 'exiting', 'outside']);
      expect(changes.every((event) => event.witnessedBy.join(',') === 'patient')).toBe(true);
      hiding.dispose();
    } finally { f.release(); }
  });

  it('keeps the player concealed when another actor blocks the exit', () => {
    const f = setup();
    try {
      const hiding = createHidingSystem({ locations: [f.spot], player: f.player, physics: f.physics, events: f.events });
      expect(hiding.enter('spot', 0)).toBe(true);
      hiding.fixedUpdate({ deltaSeconds: 1 / 60, elapsedSeconds: 0.4 });
      const blocker = f.physics.createCharacter({ position: { x: 0, y: 0.01, z: 0 }, radius: 0.3, height: 1.8 });
      expect(hiding.exit(1)).toBe(false);
      expect(f.player.getSnapshot().hiding.state).toBe('hidden');
      expect(f.player.getSnapshot().position.z).toBe(-1.5);
      blocker.dispose();
      expect(hiding.exit(2)).toBe(true);
      hiding.dispose();
    } finally { f.release(); }
  });

  it('keeps a concealed capsule reserved against other actors', () => {
    const f = setup();
    try {
      const spot: HidingLocation = { ...f.spot, colliderIds: [],
        playerPosition: { x: 2, y: 0.01, z: 0 },
        cameraPose: { position: { x: 2, y: 0.9, z: 0 }, rotation: identity },
      };
      const hiding = createHidingSystem({ locations: [spot], player: f.player, physics: f.physics, events: f.events });
      expect(hiding.enter('spot', 0)).toBe(true);
      hiding.fixedUpdate({ deltaSeconds: 1 / 60, elapsedSeconds: 0.4 });
      const other = f.physics.createCharacter({ position: { x: 3, y: 0.01, z: 0 }, radius: 0.3, height: 1.8 });
      expect(other.move({ x: -3, y: 0, z: 0 }).position.x).toBeGreaterThan(2.55);
      other.dispose(); hiding.dispose();
    } finally { f.release(); }
  });

  it('rejects unsupported exits, captured exits and obstructed entry corridors', () => {
    const f = setup([{ position: { x: 6, y: 0.01, z: 0 }, yaw: 0 }]);
    try {
      const hiding = createHidingSystem({ locations: [f.spot], player: f.player, physics: f.physics, events: f.events });
      const blocker = f.physics.createCharacter({ position: { x: 0, y: 0.01, z: -0.7 }, radius: 0.3, height: 1.8 });
      expect(hiding.enter('spot', 0)).toBe(false);
      expect(hiding.getOccupancy('spot').occupantId).toBeNull();
      blocker.dispose();
      expect(hiding.enter('spot', 1)).toBe(true);
      hiding.fixedUpdate({ deltaSeconds: 1 / 60, elapsedSeconds: 1.4 });
      expect(hiding.exit(2)).toBe(false);
      f.player.setCaptured(true);
      expect(hiding.exit(3)).toBe(false);
      expect(hiding.enter('spot', 3)).toBe(false);
      hiding.dispose();
    } finally { f.release(); }
  });
});
