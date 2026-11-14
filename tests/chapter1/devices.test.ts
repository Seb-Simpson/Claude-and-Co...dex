import { describe, expect, it } from 'vitest';
import { chapter1Requirement, deviceRequirements, useDevice } from '../../src/chapter1/devices';
import { R03_DEVICES, R03_HATCH, R03_SCENARIO_EVENTS } from '../../src/chapter1/r03Demo';
import { applyChapter1Events, createChapter1State } from '../../src/chapter1/state';

const device = (id: string) => [...R03_DEVICES, R03_HATCH].find((p) => p.device.id === id)!.device;
const scenario = applyChapter1Events(createChapter1State(), R03_SCENARIO_EVENTS).state;

describe('Chapter 1 devices', () => {
  it('runs the demo chain: valve → slip → padlock (needs keys) → crank, each one-time', () => {
    const used = new Set<string>();
    let state = scenario;
    // The slip can't be read in the steam; the padlock needs the valve.
    expect(useDevice(device('r03-incident-slip'), state, used)).toMatchObject({ applied: false, reason: 'Too much steam to read it' });
    expect(useDevice(device('r03-padlock'), state, used)).toMatchObject({ applied: false, reason: 'Steam blocks the way' });
    for (const id of ['r03-valve', 'r03-incident-slip', 'r03-padlock', 'r03-crank']) {
      const result = useDevice(device(id), state, used);
      expect(result.applied, id).toBe(true);
      state = result.state;
      used.add(id);
      expect(useDevice(device(id), state, used), `${id} twice`).toMatchObject({ applied: false, reason: 'Already used' });
    }
    expect(state.beats).toEqual(expect.arrayContaining(['valve-closed', 'link-evidence-seen', 'bulkhead-unlocked', 'bulkhead-opened']));
    expect(state.knowledge).toContain('link-closure-order');
    expect(state.encounters.E6).toBe('active');
  });

  it('an item requirement blocks the padlock without Sister Shaw’s keys', () => {
    const noKeys = applyChapter1Events(createChapter1State(), R03_SCENARIO_EVENTS.filter((e) => e.type !== 'item' && !(e.type === 'beat' && ['keys-taken', 'plant2-opened'].includes(e.beat)))).state;
    expect(useDevice(device('r03-padlock'), noKeys, new Set())).toMatchObject({ applied: false, reason: 'Needs Sister Shaw’s keys' });
    expect(chapter1Requirement(noKeys, new Set(), 'item:shaw-keys')).toBe(false);
    expect(chapter1Requirement(scenario, new Set(), 'item:shaw-keys')).toBe(true);
  });

  it('repeatable devices stay usable and change nothing; one-time devices expose an "Already done" requirement', () => {
    const wrong = device('r03-wrong-valve');
    expect(wrong.once).toBe(false);
    const first = useDevice(wrong, scenario, new Set(['r03-wrong-valve']));
    expect(first).toMatchObject({ applied: true, state: scenario });
    expect(deviceRequirements(device('r03-valve')).map((r) => r.id)).toContain('unused:r03-valve');
    expect(chapter1Requirement(scenario, new Set(['r03-valve']), 'unused:r03-valve')).toBe(false);
    expect(chapter1Requirement(scenario, new Set(), 'something-else')).toBeUndefined();
  });

  it('device effects are atomic: a rejected effect changes nothing', () => {
    // The crank's beat needs the padlock's beat; forcing it early must leave state untouched.
    const crank = { ...device('r03-crank'), requires: [] };
    const result = useDevice(crank, scenario, new Set());
    expect(result.applied).toBe(false);
    expect(result.state).toBe(scenario);
  });
});
