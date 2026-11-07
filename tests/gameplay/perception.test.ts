import { PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { PerceptionConfig, PlayerNoiseEvent, PlayerSnapshot } from '../../src/contracts';
import { canHearNoise, canSeePlayer, isObserverSeenByPlayer } from '../../src/entities/perception';

const config: PerceptionConfig = {
  visionRange: 10, fieldOfViewRadians: Math.PI / 2, hearingMultiplier: 1,
  detectionSeconds: 0.4, loseSightSeconds: 1,
};
function player(overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    id: 'player', position: { x: 0, y: 0, z: -5 }, rotation: { yaw: 0, pitch: 0 },
    velocity: { x: 0, y: 0, z: 0 }, movement: 'idle', crouching: false, grounded: true,
    hiding: { state: 'outside', spotId: null }, captured: false, camera: new PerspectiveCamera(), ...overrides,
  };
}
const observer = { observerPosition: { x: 0, y: 0, z: 0 }, observerForward: { x: 0, y: 0, z: -1 }, eyeHeight: 1.65 };
function noise(overrides: Partial<PlayerNoiseEvent> = {}): PlayerNoiseEvent {
  return { playerId: 'player', position: { x: 0, y: 0, z: -5 }, kind: 'sprint', radius: 10, intensity: 1, timeSeconds: 2, ...overrides };
}

describe('credible vision', () => {
  it('requires range, a forward field of view and clear line of sight', () => {
    const hasLineOfSight = vi.fn(() => true);
    const options = { ...observer, player: player(), config, hasLineOfSight };
    expect(canSeePlayer(options)).toBe(true);
    expect(canSeePlayer({ ...options, player: player({ position: { x: 0, y: 0, z: -11 } }) })).toBe(false);
    expect(canSeePlayer({ ...options, player: player({ position: { x: 0, y: 0, z: 5 } }) })).toBe(false);
    expect(canSeePlayer({ ...options, player: player({ position: { x: 6, y: 0, z: -2 } }) })).toBe(false);
    expect(canSeePlayer({ ...options, hasLineOfSight: () => false })).toBe(false);
    expect(hasLineOfSight).toHaveBeenCalledTimes(1);
  });

  it('uses authoritative eye heights rather than the presentation camera', () => {
    const snapshot = player({ crouching: true });
    snapshot.camera.position.set(900, 900, 900);
    const hasLineOfSight = vi.fn(() => true);
    expect(canSeePlayer({ ...observer, player: snapshot, config, hasLineOfSight })).toBe(true);
    expect(hasLineOfSight).toHaveBeenCalledWith({ x: 0, y: 1.65, z: 0 }, { x: 0, y: 0.9, z: -5 });
  });

  it('cannot see concealed transitions or captured players', () => {
    for (const state of ['entering', 'hidden', 'exiting'] as const) {
      expect(canSeePlayer({ ...observer, player: player({ hiding: { state, spotId: 'locker' } }), config, hasLineOfSight: () => true })).toBe(false);
    }
    expect(canSeePlayer({ ...observer, player: player({ captured: true }), config, hasLineOfSight: () => true })).toBe(false);
  });

  it('rejects invalid positions, orientation and vision settings', () => {
    const options = { ...observer, player: player(), config, hasLineOfSight: () => true };
    expect(canSeePlayer({ ...options, observerForward: { x: 0, y: 0, z: 0 } })).toBe(false);
    expect(canSeePlayer({ ...options, player: player({ position: { x: NaN, y: 0, z: -1 } }) })).toBe(false);
    expect(canSeePlayer({ ...options, config: { ...config, visionRange: Infinity } })).toBe(false);
    expect(canSeePlayer({ ...options, config: { ...config, fieldOfViewRadians: Math.PI * 3 } })).toBe(false);
  });
});

describe('recent sound perception', () => {
  const hearing = { observerPosition: { x: 0, y: 0, z: 0 }, config, timeSeconds: 2.5, maxAgeSeconds: 1, hasLineOfSight: () => true };
  it('scales audible range by intensity and profile sensitivity', () => {
    expect(canHearNoise({ ...hearing, noise: noise() })).toBe(true);
    expect(canHearNoise({ ...hearing, noise: noise({ intensity: 0.4 }) })).toBe(false);
    expect(canHearNoise({ ...hearing, config: { ...config, hearingMultiplier: 2 }, noise: noise({ intensity: 0.4 }) })).toBe(true);
  });

  it('attenuates sound behind obstacles and allows sufficiently close obstructed sound', () => {
    expect(canHearNoise({ ...hearing, noise: noise(), hasLineOfSight: () => false })).toBe(false);
    expect(canHearNoise({ ...hearing, noise: noise({ position: { x: 0, y: 0, z: -3 } }), hasLineOfSight: () => false })).toBe(true);
  });

  it('rejects stale, future, silent and invalid noise events', () => {
    for (const event of [noise({ timeSeconds: 0 }), noise({ timeSeconds: 3 }), noise({ radius: NaN }), noise({ intensity: 0 }), noise({ intensity: 2 }), noise({ position: { x: Infinity, y: 0, z: 0 } })]) {
      expect(canHearNoise({ ...hearing, noise: event })).toBe(false);
    }
  });
});

describe('Watcher observation rule', () => {
  const options = { observerPosition: { x: 0, y: 0, z: -5 }, eyeHeight: 1.65, player: player({ position: { x: 0, y: 0, z: 0 } }), hasLineOfSight: () => true };
  it('sees the observer only while facing it through clear geometry', () => {
    expect(isObserverSeenByPlayer(options)).toBe(true);
    expect(isObserverSeenByPlayer({ ...options, hasLineOfSight: () => false })).toBe(false);
    expect(isObserverSeenByPlayer({ ...options, player: player({ position: { x: 0, y: 0, z: 0 }, rotation: { yaw: Math.PI, pitch: 0 } }) })).toBe(false);
  });

  it('uses yaw and pitch rather than a stale camera, and obeys distance limits', () => {
    options.player.camera.rotation.y = Math.PI;
    expect(isObserverSeenByPlayer(options)).toBe(true);
    expect(isObserverSeenByPlayer({ ...options, maxRange: 3 })).toBe(false);
    expect(isObserverSeenByPlayer({ ...options, player: player({ position: { x: 0, y: 0, z: 0 }, rotation: { yaw: 0, pitch: Math.PI / 2 } }) })).toBe(false);
  });
});
