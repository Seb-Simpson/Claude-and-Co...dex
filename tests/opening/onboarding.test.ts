import { describe, expect, it } from 'vitest';
import { createOnboardingGate, createOpeningAssistance } from '../../src/gameplay/opening/onboarding';
import { createOpeningState, reduceOpening } from '../../src/gameplay/opening/state';
const start = () => reduceOpening(createOpeningState(), 'awaken').state;
const unlock = () => reduceOpening(reduceOpening(start(), 'take-card').state, 'use-reader').state;
describe('authored survival onboarding', () => {
  it('remains nonlethal through awakening, room exploration, exit and station arrival', () => {
    const gate = createOnboardingGate(); expect(gate.safe).toBe(true);
    gate.sync(start(), false); expect(gate.phase).toBe('room-104');
    gate.sync(unlock(), true); expect(gate.phase).toBe('corridor');
    gate.sync(reduceOpening(unlock(), 'reach-station').state, true);
    expect(gate.phase).toBe('stealth-onboarding'); expect(gate.beginActivePlay()).toBe(false);
  });
  it('requires real skills and an explicit next-section transition, never elapsed time/position', () => {
    const gate = createOnboardingGate(); gate.recordSkill('crouch'); gate.recordSkill('hide'); gate.recordSkill('observe-patrol');
    expect(gate.beginActivePlay()).toBe(false);
    gate.sync(reduceOpening(unlock(), 'reach-station').state, true);
    expect(gate.safe).toBe(true); expect(gate.beginActivePlay()).toBe(false);
    gate.markPresentationReady(); expect(gate.beginActivePlay()).toBe(true); expect(gate.safe).toBe(false);
    gate.sync(createOpeningState(), false); expect(gate.phase).toBe('active-play');
    expect(createOnboardingGate().safe).toBe(true);
  });
  it('restores the safe station handoff without restoring authorization to kill', () => {
    const gate = createOnboardingGate(); gate.sync(reduceOpening(unlock(), 'reach-station').state, true);
    expect(gate.beginActivePlay()).toBe(false);
  });
  it('uses progressively specific, bounded environmental assistance without a timer puzzle', () => {
    const hints = createOpeningAssistance();
    expect(hints.update(180, createOpeningState())).toBeNull();
    expect(hints.update(44, start())).toBeNull(); expect(hints.update(1, start())).toContain('STAFF ACCESS');
    expect(hints.update(54, start())).toBeNull(); expect(hints.update(1, start())).toContain('lanyard');
    expect(hints.update(500, start())).toBeNull();
    expect(hints.update(1, reduceOpening(start(), 'take-card').state)).toContain('reader');
    expect(hints.update(500, unlock())).toBeNull();
  });
});

it('casts only Nurse Shaw in Chapter One even after onboarding permission', async () => {
  const {CHAPTER_ONE_ENTITY_TYPES} = await import('../../src/gameplay/opening/onboarding');
  expect([...CHAPTER_ONE_ENTITY_TYPES]).toEqual(['nurse']);
  expect(CHAPTER_ONE_ENTITY_TYPES.includes('patient' as never)).toBe(false);
});
