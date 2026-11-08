import { describe, expect, it, vi } from 'vitest';
import type { AudioService, ChaseStartedEvent, FrameContext, SoundEvent } from '../../src/contracts';
import { createEventBus } from '../../src/integration/events';
import { createPatientEncounter } from '../../src/integration/patientEncounter';

// The encounter's output joins the shared music bus (src/audio/mixer.ts, tested on its own). Here it
// is pointed at the destination so these assertions keep covering only the encounter's own nodes.
vi.mock('../../src/audio/mixer', () => ({ audioOutput: (context: { destination: unknown }) => context.destination }));

const frame: FrameContext = { deltaSeconds: 1 / 60, elapsedSeconds: 10 };
const chase: ChaseStartedEvent = {
  chaseId: 'chase:patient:1', entityId: 'nw:patient', playerId: 'player',
  position: { x: 6, y: 0, z: 7.2 }, timeSeconds: 10,
};

function audioHarness(initialState: AudioContextState = 'running') {
  const parameters = () => ({
    value: 0,
    cancelScheduledValues: vi.fn(),
    setTargetAtTime: vi.fn(),
  });
  const oscillators: Array<{
    frequency: ReturnType<typeof parameters>;
    type: OscillatorType;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
  }> = [];
  const gains: Array<{
    gain: ReturnType<typeof parameters>;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }> = [];
  const context = {
    currentTime: 20,
    state: initialState,
    destination: {},
    createOscillator: vi.fn(() => {
      const oscillator = {
        frequency: parameters(), type: 'sine' as OscillatorType,
        connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(),
        onended: null as (() => void) | null,
      };
      oscillators.push(oscillator);
      return oscillator;
    }),
    createGain: vi.fn(() => {
      const gain = { gain: parameters(), connect: vi.fn(), disconnect: vi.fn() };
      gains.push(gain);
      return gain;
    }),
  };
  const audio: { context: AudioContext | null; resume: AudioService['resume']; dispose: AudioService['dispose'] } = {
    context: context as unknown as AudioContext, resume: vi.fn(async () => {}), dispose: vi.fn(async () => {}),
  };
  return { audio, context, oscillators, gains };
}

describe('Patient encounter atmosphere adapter', () => {
  it('connects a real chase to hospital cues and a quiet pulse without owning a loop or context', () => {
    const events = createEventBus();
    const harness = audioHarness();
    const sound = vi.fn();
    const lighting = vi.fn();
    const message = vi.fn();
    events.on('atmosphere:sound', sound);
    events.on('atmosphere:lighting', lighting);
    const encounter = createPatientEncounter({ events, audio: harness.audio, onMessage: message });

    events.emit('chase:started', chase);
    encounter.update(frame);
    events.emit('chase:started', chase);

    expect(encounter.activeChases).toBe(1);
    expect(lighting).toHaveBeenCalledExactlyOnceWith({
      targetId: 'nw:lights:corridor-main', effect: 'flicker', durationSeconds: 1.6,
    });
    expect(sound).toHaveBeenCalledExactlyOnceWith({
      cueId: 'nw:metal-creak', action: 'play', position: chase.position, volume: 0.46, loop: false,
    });
    expect(message).toHaveBeenCalledTimes(1);
    expect(harness.oscillators).toHaveLength(2);
    expect(harness.oscillators.every((oscillator) => oscillator.start.mock.calls.length === 1)).toBe(true);
    expect(harness.gains[2]?.gain.setTargetAtTime).toHaveBeenCalledWith(0.38, 20, 0.2);
    expect(harness.audio.resume).not.toHaveBeenCalled();
    encounter.dispose();
    expect(harness.audio.dispose).not.toHaveBeenCalled();
  });

  it('waits for gesture unlock and never starts queued chase sound after escape', () => {
    const events = createEventBus();
    const harness = audioHarness('suspended');
    harness.audio.context = null;
    const sounds: SoundEvent[] = [];
    events.on('atmosphere:sound', (event) => sounds.push(event));
    const encounter = createPatientEncounter({ events, audio: harness.audio });
    events.emit('chase:started', chase);
    encounter.update(frame);
    expect(harness.oscillators).toHaveLength(0);
    expect(sounds).toHaveLength(0);
    harness.audio.context = harness.context as unknown as AudioContext;
    encounter.update(frame);
    expect(harness.oscillators).toHaveLength(0);
    harness.context.state = 'running';
    encounter.update(frame);
    encounter.update(frame);
    expect(harness.oscillators).toHaveLength(2);
    expect(sounds).toHaveLength(1);
    encounter.dispose();

    const next = createPatientEncounter({ events, audio: { ...harness.audio, context: null } });
    events.emit('chase:started', chase);
    events.emit('chase:ended', { ...chase, reason: 'escaped', timeSeconds: 12 });
    next.update(frame);
    expect(sounds).toHaveLength(1);
    next.dispose();
  });

  it('keeps one pulse for concurrent chases and fades only after the final chase ends', () => {
    const events = createEventBus();
    const harness = audioHarness();
    const encounter = createPatientEncounter({ events, audio: harness.audio });
    events.emit('chase:started', chase);
    const other = { ...chase, chaseId: 'chase:patient:2' };
    events.emit('chase:started', other);
    events.emit('chase:ended', { ...chase, chaseId: 'unknown', reason: 'escaped' });
    events.emit('chase:ended', { ...chase, reason: 'escaped' });
    expect(encounter.activeChases).toBe(1);
    expect(harness.oscillators[0]?.stop).not.toHaveBeenCalled();
    events.emit('chase:ended', { ...other, reason: 'escaped' });
    expect(encounter.activeChases).toBe(0);
    expect(harness.oscillators).toHaveLength(2);
    expect(harness.oscillators[0]?.stop).toHaveBeenCalledExactlyOnceWith(20.32);
    expect(harness.gains[2]?.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 20, 0.055);
    harness.oscillators[0]?.onended?.();
    expect(harness.gains.every((gain) => gain.disconnect.mock.calls.length === 1)).toBe(true);
    encounter.dispose();
  });

  it('silences on capture, ignores stale events, and releases every source and subscription on restart', () => {
    const events = createEventBus();
    const harness = audioHarness();
    const sound = vi.fn();
    events.on('atmosphere:sound', sound);
    const encounter = createPatientEncounter({ events, audio: harness.audio, playerId: 'player' });
    events.emit('chase:started', { ...chase, playerId: 'another-player' });
    expect(encounter.activeChases).toBe(0);
    events.emit('chase:started', chase);
    events.emit('player:captured', {
      playerId: 'player', entityId: chase.entityId, position: chase.position, timeSeconds: 11,
    });
    events.emit('chase:ended', { ...chase, reason: 'captured' });
    events.emit('chase:started', { ...chase, chaseId: 'late-start' });
    encounter.update(frame);
    expect(encounter.activeChases).toBe(0);
    expect(harness.oscillators).toHaveLength(2);
    encounter.dispose();
    encounter.dispose();
    expect(harness.oscillators.every((oscillator) => oscillator.disconnect.mock.calls.length === 1)).toBe(true);
    expect(harness.gains.every((gain) => gain.disconnect.mock.calls.length === 1)).toBe(true);
    events.emit('chase:started', { ...chase, chaseId: 'after-dispose' });
    encounter.update(frame);
    expect(sound).toHaveBeenCalledTimes(1);
    expect(harness.oscillators).toHaveLength(2);
  });

  it('cleans partial Web Audio allocation and leaves gameplay usable when optional audio fails', () => {
    const events = createEventBus();
    const harness = audioHarness();
    harness.context.createGain.mockImplementationOnce(() => { throw new Error('Audio device unavailable'); });
    const encounter = createPatientEncounter({ events, audio: harness.audio });
    expect(() => events.emit('chase:started', chase)).not.toThrow();
    encounter.update(frame);
    expect(encounter.activeChases).toBe(1);
    expect(harness.oscillators).toHaveLength(2);
    expect(harness.oscillators.every((oscillator) => oscillator.disconnect.mock.calls.length === 1)).toBe(true);
    expect(harness.oscillators.every((oscillator) => oscillator.start.mock.calls.length === 0)).toBe(true);
    expect(() => encounter.dispose()).not.toThrow();
  });

  it('retains chase tracking and HUD messages without duplicating a registered presentation module', () => {
    const events = createEventBus();
    const harness = audioHarness('suspended');
    const sound = vi.fn(), lighting = vi.fn(), message = vi.fn();
    events.on('atmosphere:sound', sound);
    events.on('atmosphere:lighting', lighting);
    const encounter = createPatientEncounter({ events, audio: harness.audio,
      presentationProvided: true, onMessage: message,
    });
    events.emit('chase:started', chase);
    events.emit('chase:started', chase);
    const other = { ...chase, chaseId: 'second-entity-chase' };
    events.emit('chase:started', other);
    expect(encounter.activeChases).toBe(2);
    expect(message).toHaveBeenCalledExactlyOnceWith('The Patient has seen you. Break its line of sight.');
    harness.context.state = 'running';
    encounter.update(frame);
    events.emit('chase:ended', { ...chase, reason: 'escaped' });
    expect(encounter.activeChases).toBe(1);
    expect(message).toHaveBeenCalledTimes(1);
    events.emit('chase:ended', { ...other, reason: 'escaped' });
    expect(encounter.activeChases).toBe(0);
    expect(message).toHaveBeenLastCalledWith('The Patient lost your trail. Move quietly.');

    events.emit('chase:started', { ...chase, chaseId: 'next-encounter' });
    events.emit('player:captured', { playerId: chase.playerId, entityId: chase.entityId,
      position: chase.position, timeSeconds: 14,
    });
    encounter.update(frame);
    expect(encounter.activeChases).toBe(0);
    encounter.dispose();
    events.emit('chase:started', { ...chase, chaseId: 'after-dispose' });
    expect(message).toHaveBeenCalledTimes(3);
    expect(sound).not.toHaveBeenCalled();
    expect(lighting).not.toHaveBeenCalled();
    expect(harness.context.createOscillator).not.toHaveBeenCalled();
    expect(harness.context.createGain).not.toHaveBeenCalled();
    expect(harness.audio.resume).not.toHaveBeenCalled();
    expect(harness.audio.dispose).not.toHaveBeenCalled();
  });
});
