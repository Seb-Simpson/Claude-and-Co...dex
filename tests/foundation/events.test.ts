import { describe, expect, it, vi } from 'vitest';
import type { PlayerNoiseEvent } from '../../src/contracts';
import { createEventBus } from '../../src/integration/events';

const noise: PlayerNoiseEvent = {
  playerId: 'player', position: { x: 0, y: 0, z: 0 }, kind: 'footstep',
  radius: 4, intensity: 0.4, timeSeconds: 1,
};

describe('typed event bus', () => {
  it('delivers the exact payload only to subscribers of that event', () => {
    const bus = createEventBus();
    const listener = vi.fn();
    const unrelated = vi.fn();
    bus.on('player:noise', listener);
    bus.on('chase:started', unrelated);
    bus.emit('player:noise', noise);
    expect(listener).toHaveBeenCalledExactlyOnceWith(noise);
    expect(unrelated).not.toHaveBeenCalled();
  });

  it('gives duplicate subscriptions independent, idempotent unsubscribe handles', () => {
    const bus = createEventBus();
    const listener = vi.fn();
    const first = bus.on('player:noise', listener);
    const second = bus.on('player:noise', listener);
    first();
    first();
    bus.emit('player:noise', noise);
    expect(listener).toHaveBeenCalledTimes(1);
    second();
    bus.emit('player:noise', noise);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('uses a snapshot so subscription changes affect the next emission', () => {
    const bus = createEventBus();
    const received: string[] = [];
    let unsubscribeSecond = (): void => {};
    bus.on('player:noise', () => {
      received.push('first');
      unsubscribeSecond();
      bus.on('player:noise', () => received.push('new'));
    });
    unsubscribeSecond = bus.on('player:noise', () => received.push('second'));
    bus.emit('player:noise', noise);
    expect(received).toEqual(['first', 'second']);
    received.length = 0;
    bus.emit('player:noise', noise);
    expect(received).toEqual(['first', 'new']);
  });

  it('attempts every listener and reports their errors to the emitter', () => {
    const bus = createEventBus();
    const failure = new Error('audio failed');
    const survivor = vi.fn();
    bus.on('player:noise', () => { throw failure; });
    bus.on('player:noise', survivor);
    try {
      bus.emit('player:noise', noise);
      expect.fail('Expected listener errors');
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual([failure]);
    }
    expect(survivor).toHaveBeenCalledOnce();
  });

  it('clears subscriptions and rejects use after idempotent disposal', () => {
    const bus = createEventBus();
    const listener = vi.fn();
    const oldUnsubscribe = bus.on('player:noise', listener);
    bus.clear();
    bus.on('player:noise', listener);
    oldUnsubscribe();
    bus.emit('player:noise', noise);
    expect(listener).toHaveBeenCalledOnce();
    bus.dispose();
    bus.dispose();
    expect(() => bus.emit('player:noise', noise)).toThrow('disposed');
    expect(() => bus.on('player:noise', listener)).toThrow('disposed');
  });
});
