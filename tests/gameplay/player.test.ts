import RAPIER from '@dimforge/rapier3d-compat';
import { PerspectiveCamera } from 'three';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ColliderDefinition, PlayerNoiseEvent } from '../../src/contracts';
import { createEventBus } from '../../src/integration/events';
import { createPhysicsAdapter } from '../../src/physics';
import { createPlayerController } from '../../src/gameplay/player';
import type { PlayerConfig, PlayerInput } from '../../src/gameplay/player';

const identity = { x: 0, y: 0, z: 0, w: 1 };
const floor: ColliderDefinition = {
  id: 'floor', shape: { type: 'box', halfExtents: { x: 50, y: 0.5, z: 50 } },
  pose: { position: { x: 0, y: -0.5, z: 0 }, rotation: identity }, bodyType: 'fixed', sensor: false,
};
const idle: PlayerInput = { forward: 0, right: 0, sprint: false, crouch: false };
const cleanups: (() => void)[] = [];
beforeAll(async () => { await RAPIER.init(); });
afterEach(() => { cleanups.splice(0).reverse().forEach((dispose) => dispose()); });

function fixture(extra: ColliderDefinition[] = [], config?: Partial<PlayerConfig>, headMotion?:()=>boolean) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const physics = createPhysicsAdapter(world, [floor, ...extra]);
  const camera = new PerspectiveCamera();
  const events = createEventBus();
  const noises: PlayerNoiseEvent[] = [];
  events.on('player:noise', (event) => noises.push(event));
  const body = physics.createCharacter({ position: { x: 0, y: 0.03, z: 0 }, radius: 0.28, height: 1.8 });
  const player = createPlayerController({
    ...(headMotion?{headMotion}:{}),body, camera, events, spawn: { position: { x: 0, y: 0.03, z: 0 }, yaw: 0 },
    ...(config ? { config } : {}),
  });
  let elapsedSeconds = 0;
  function advance(seconds: number, input = idle) {
    for (let i = 0; i < Math.round(seconds * 60); i += 1) {
      elapsedSeconds += 1 / 60;
      const frame = { deltaSeconds: 1 / 60, elapsedSeconds };
      player.fixedUpdate(frame, input);
      world.timestep = frame.deltaSeconds;
      world.step();
      player.update(frame);
    }
  }
  cleanups.push(() => { player.dispose(); physics.dispose(); events.dispose(); world.free(); });
  return { world, physics, camera, events, noises, body, player, advance };
}

describe('first-person movement', () => {
  it('accelerates, sprints faster, normalizes diagonal movement and decelerates to rest', () => {
    const f = fixture();
    f.advance(1, { ...idle, forward: 1 });
    const walkSpeed = Math.hypot(f.player.getSnapshot().velocity.x, f.player.getSnapshot().velocity.z);
    expect(walkSpeed).toBeCloseTo(2.4, 1);
    f.advance(1, { ...idle, forward: 1, right: 1, sprint: true });
    expect(Math.hypot(f.player.getSnapshot().velocity.x, f.player.getSnapshot().velocity.z)).toBeCloseTo(4.3, 1);
    f.advance(0.5);
    expect(Math.hypot(f.player.getSnapshot().velocity.x, f.player.getSnapshot().velocity.z)).toBeLessThan(0.01);
    expect(f.player.getSnapshot().movement).toBe('idle');
    expect(f.player.getSnapshot().grounded).toBe(true);
  });

  it('collides with a thin wall while sprinting and emits no footsteps while pushing it', () => {
    const f = fixture([{
      id: 'wall', shape: { type: 'box', halfExtents: { x: 5, y: 2, z: 0.05 } },
      pose: { position: { x: 0, y: 2, z: -2 }, rotation: identity }, bodyType: 'fixed', sensor: false,
    }]);
    f.advance(2, { ...idle, forward: 1, sprint: true });
    expect(f.player.getSnapshot().position.z).toBeGreaterThan(-1.7);
    const count = f.noises.length;
    f.advance(2, { ...idle, forward: 1, sprint: true });
    expect(f.noises).toHaveLength(count);
  });

  it('crouches smoothly and cannot stand under a low ceiling', () => {
    const f = fixture([{
      id: 'ceiling', shape: { type: 'box', halfExtents: { x: 1, y: 0.1, z: 1 } },
      pose: { position: { x: 0, y: 1.45, z: -3 }, rotation: identity }, bodyType: 'fixed', sensor: false,
    }]);
    f.advance(1, { ...idle, forward: 1, crouch: true });
    f.advance(1.7, { ...idle, forward: 1, crouch: true });
    expect(f.player.getSnapshot().crouching).toBe(true);
    expect(f.body.height).toBeCloseTo(1.05);
    f.advance(0.5);
    expect(f.player.getSnapshot().crouching).toBe(true);
    const eye = f.camera.position.y - f.player.getSnapshot().position.y;
    expect(eye).toBeCloseTo(0.9, 2);
  });

  it('keeps the easing camera below a low lintel immediately after crouch movement', () => {
    const f = fixture([{
      id: 'low-lintel', shape: { type: 'box', halfExtents: { x: 1, y: 0.1, z: 1 } },
      pose: { position: { x: 0, y: 1.45, z: -3 }, rotation: identity }, bodyType: 'fixed', sensor: false,
    }], { cameraHeightSharpness: 0.1 });
    f.advance(2.5, { ...idle, forward: 1, crouch: true });
    expect(f.player.getSnapshot().position.z).toBeLessThan(-2.2);
    expect(f.camera.position.y).toBeLessThan(1.35);
  });

  it('has immediate clamped look with no roll and uses yaw for movement direction', () => {
    const f = fixture();
    f.player.look(200, -10000);
    expect(f.player.getSnapshot().rotation.yaw).toBeCloseTo(-0.4);
    expect(f.player.getSnapshot().rotation.pitch).toBeLessThan(Math.PI / 2);
    f.player.setViewRotation({ yaw: Math.PI / 2, pitch: 0 });
    f.advance(0.5, { ...idle, forward: 1 });
    expect(f.player.getSnapshot().position.x).toBeLessThan(-0.5);
    expect(Math.abs(f.player.getSnapshot().position.z)).toBeLessThan(0.1);
  });

  it('applies a live look sensitivity from settings, including inverted vertical look', () => {
    const f = fixture();
    f.player.setLookSensitivity(0.004, -0.004);
    f.player.look(100, 50);
    expect(f.player.getSnapshot().rotation.yaw).toBeCloseTo(-0.4);
    expect(f.player.getSnapshot().rotation.pitch).toBeCloseTo(0.2);
    f.player.setLookSensitivity(Number.NaN);
    f.player.look(100, 0);
    expect(f.player.getSnapshot().rotation.yaw).toBeCloseTo(-0.8);
  });

  it('restricts hidden/captured movement and smoothly presents the hiding camera', () => {
    const f = fixture();
    f.advance(0.5);
    const previous = f.player.getSnapshot().position;
    const pose = { position: { x: 2, y: 0.5, z: 1 }, rotation: identity };
    f.player.setHiding('entering', 'spot', pose);
    f.advance(0.1, { ...idle, forward: 1, sprint: true });
    expect(f.camera.position.x).toBeGreaterThan(0);
    expect(f.camera.position.x).toBeLessThan(2);
    f.player.setHiding('hidden', 'spot');
    f.advance(1, { ...idle, forward: 1, sprint: true });
    expect(f.player.getSnapshot().position).toEqual(previous);
    expect(f.camera.position.x).toBeCloseTo(2, 3);
    f.player.setHiding('exiting', 'spot');
    f.advance(1);
    f.player.setHiding('outside', null);
    f.player.setCaptured(true);
    f.advance(1, { ...idle, forward: 1 });
    expect(f.player.getSnapshot().position).toEqual(previous);
    expect(f.player.getSnapshot().captured).toBe(true);
    expect(f.player.getSnapshot().movement).toBe('captured');
  });

  it('emits movement noise only for real grounded travel using simulation time', () => {
    const f = fixture();
    f.advance(1);
    expect(f.noises).toEqual([]);
    f.advance(1.5, { ...idle, forward: 1, sprint: true });
    expect(f.noises.length).toBeGreaterThan(1);
    expect(f.noises.every((event) => event.kind === 'sprint' && event.radius === 15)).toBe(true);
    expect(f.noises[0]!.timeSeconds).toBeGreaterThan(1);
    f.player.setHiding('hidden', 'spot', { position: { x: 0, y: 1, z: 0 }, rotation: identity });
    const count = f.noises.length;
    f.advance(2, { ...idle, forward: 1 });
    expect(f.noises).toHaveLength(count);
  });
});

it('permits a capture-only presentation lease after capture without restoring movement or reviving the player',()=>{
 const f=fixture();expect(f.player.acquireCameraControl('capture')).toBeNull();
 f.player.setCaptured(true);const lease=f.player.acquireCameraControl('capture')!;expect(lease).not.toBeNull();
 const before=f.player.getSnapshot().position;f.advance(.2,{...idle,forward:1,sprint:true});
 expect(f.player.getSnapshot().position).toEqual(before);
 const feet=f.body.getPosition();expect(lease.handoff({position:{x:feet.x,y:feet.y+1.65,z:feet.z},rotation:identity})).toBe(true);
 lease.release();expect(f.player.getSnapshot().captured).toBe(true);expect(f.player.controlsLocked).toBe(false);
 expect(f.player.acquireCameraControl()).toBeNull();
});

it('presents small walking motion only when enabled; reduced motion changes neither collision nor view rotation',()=>{
 let enabled=true;const f=fixture([],undefined,()=>enabled);f.advance(.25,{...idle,forward:1});
 const eye=f.camera.position.y-f.player.getSnapshot().position.y;
 expect(eye).toBeLessThan(1.65);expect(eye).toBeGreaterThan(1.64);
 const velocity=f.player.getSnapshot().velocity;enabled=false;f.advance(1/60,{...idle,forward:1});
 expect(f.camera.position.y-f.player.getSnapshot().position.y).toBeCloseTo(1.65,8);
 expect(f.player.getSnapshot().velocity).toEqual(velocity);expect(f.camera.rotation.z).toBeCloseTo(0,10);
});
