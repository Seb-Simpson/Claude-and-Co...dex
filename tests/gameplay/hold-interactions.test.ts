import RAPIER from '@dimforge/rapier3d-compat';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { HospitalWorld, InteractableMarker, InteractionEvent, PlayerNoiseEvent } from '../../src/contracts';
import { createInteractionSystem } from '../../src/gameplay/interactions';
import { createPlayerController } from '../../src/gameplay/player';
import { createEventBus } from '../../src/integration';
import { createPhysicsAdapter } from '../../src/physics';

beforeAll(async () => { await RAPIER.init(); });

function fixture(marker: Partial<InteractableMarker>, options: { mode?: 'hold' | 'toggle'; met?: boolean } = {}) {
  const root = new Group();
  const mesh = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), new MeshBasicMaterial());
  mesh.position.set(0, 1.4, -1.5);
  root.add(mesh);
  root.updateMatrixWorld(true);
  const target: InteractableMarker = { id: 'nw:inspect:valve', type: 'inspect', object: mesh, prompt: 'Turn valve', range: 2.5, ...marker };
  const world: HospitalWorld = {
    id: 'test', root, bounds: { min: { x: -5, y: -1, z: -5 }, max: { x: 5, y: 4, z: 5 } }, rooms: [],
    colliders: [{ id: 'floor', shape: { type: 'box', halfExtents: { x: 5, y: 0.1, z: 5 } }, pose: { position: { x: 0, y: -0.1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } }, bodyType: 'fixed', sensor: false }],
    interactables: [target], doors: [], hidingLocations: [], entitySpawns: [], patrolRoutes: [],
    playerSpawn: { position: { x: 0, y: 0, z: 0 }, yaw: 0 },
  };
  const rapier = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const physics = createPhysicsAdapter(rapier, world.colliders);
  const events = createEventBus();
  const body = physics.createCharacter({ position: { x: 0, y: 0, z: 0 }, radius: 0.28, height: 1.8 });
  const player = createPlayerController({ body, camera: new PerspectiveCamera(70, 1, 0.05, 100), spawn: world.playerSpawn, events });
  let held = false;
  const interactions = createInteractionSystem({
    world, player, physics, events, isInteractHeld: () => held, holdMode: () => options.mode ?? 'hold',
    hasRequirement: () => options.met ?? true,
  });
  const results: InteractionEvent[] = [];
  const noises: PlayerNoiseEvent[] = [];
  events.on('interaction:completed', (e) => results.push(e));
  events.on('player:noise', (e) => { if (e.kind === 'interaction') noises.push(e); });
  let time = 0;
  const aim = (x: number, y: number, z: number) => { player.getSnapshot().camera.lookAt(x, y, z); player.getSnapshot().camera.updateMatrixWorld(true); };
  player.update({ deltaSeconds: 1 / 60, elapsedSeconds: 0 });
  aim(0, 1.4, -1.5);
  return {
    interactions, player, body, results, noises,
    hold(value: boolean) { held = value; },
    press() { interactions.interact(time); },
    aim,
    advance(seconds: number) {
      for (let i = 0; i < Math.round(seconds * 60); i += 1) { time += 1 / 60; interactions.fixedUpdate({ deltaSeconds: 1 / 60, elapsedSeconds: time }); }
    },
    release() { interactions.dispose(); player.dispose(); physics.dispose(); events.dispose(); rapier.free(); },
  };
}

describe('hold-to-interact primitives', () => {
  it('completes after the hold time while held, with the object’s own noise', () => {
    const f = fixture({ hold: { seconds: 1.5, progressLabel: 'Turning' }, noise: { radius: 10, intensity: 0.9 } });
    try {
      f.hold(true); f.press();
      f.advance(1.0);
      expect(f.results).toEqual([]);
      expect(f.interactions.getHold()?.progress).toBeCloseTo(1 / 1.5, 1);
      expect(f.interactions.getPrompt()?.text).toBe('Turning…');
      f.advance(0.6);
      expect(f.results.map((r) => r.outcome)).toEqual(['completed']);
      expect(f.noises.map((n) => n.radius)).toEqual([10]);
      expect(f.interactions.getHold()).toBeNull();
    } finally { f.release(); }
  });

  it('releasing the key, looking away or moving away cancels without completing or making noise', () => {
    for (const interrupt of ['release', 'look', 'move'] as const) {
      const f = fixture({ hold: { seconds: 1 } });
      try {
        f.hold(true); f.press(); f.advance(0.4);
        if (interrupt === 'release') f.hold(false);
        if (interrupt === 'look') f.aim(3, 1.4, 2);
        if (interrupt === 'move') f.body.setPosition({ x: 0.6, y: 0, z: 0 });
        f.advance(0.1);
        expect(f.results.map((r) => r.outcome), interrupt).toEqual(['cancelled']);
        expect(f.results[0]!.reason).toBe({ release: 'Released', look: 'Looked away', move: 'Moved away' }[interrupt]);
        f.advance(2);
        expect(f.results).toHaveLength(1);
        expect(f.noises).toHaveLength(0);
      } finally { f.release(); }
    }
  });

  it('toggle mode (accessibility): one press completes without holding; a second press cancels', () => {
    const a = fixture({ hold: { seconds: 1 } }, { mode: 'toggle' });
    try {
      a.press(); a.advance(1.1);
      expect(a.results.map((r) => r.outcome)).toEqual(['completed']);
    } finally { a.release(); }
    const b = fixture({ hold: { seconds: 1 } }, { mode: 'toggle' });
    try {
      b.press(); b.advance(0.3); b.press(); b.advance(1);
      expect(b.results.map((r) => [r.outcome, r.reason])).toEqual([['cancelled', 'Cancelled']]);
    } finally { b.release(); }
  });

  it('locked (unmet requirement) holds are denied; crouch-only holds say so; silent objects make no noise', () => {
    const locked = fixture({ hold: { seconds: 1 }, requirements: [{ id: 'item:shaw-keys', description: 'Needs Sister Shaw’s keys' }] }, { met: false });
    try {
      locked.hold(true); locked.press(); locked.advance(1.2);
      expect(locked.results.map((r) => [r.outcome, r.reason])).toEqual([['denied', 'Needs Sister Shaw’s keys']]);
    } finally { locked.release(); }
    const crouch = fixture({ hold: { seconds: 1, crouch: true } });
    try {
      expect(crouch.interactions.getPrompt()).toMatchObject({ available: false, reason: 'Crouch to reach it' });
    } finally { crouch.release(); }
    const silent = fixture({ noise: null });
    try {
      silent.press(); silent.advance(0.1);
      expect(silent.results.map((r) => r.outcome)).toEqual(['completed']);
      expect(silent.noises).toHaveLength(0);
    } finally { silent.release(); }
  });
});
