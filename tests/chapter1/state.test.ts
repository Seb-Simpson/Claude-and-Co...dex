import { describe, expect, it } from 'vitest';
import { currentObjective } from '../../src/chapter1/objectives';
import {
  BEATS, BEAT_REQUIRES, applyChapter1Event, applyChapter1Events, createChapter1State, shawStage, validateChapter1State,
  type BeatId, type Chapter1Event, type Chapter1State,
} from '../../src/chapter1/state';

const beat = (b: BeatId): Chapter1Event => ({ type: 'beat', beat: b });
const run = (events: readonly Chapter1Event[], from: Chapter1State = createChapter1State()) => {
  const result = applyChapter1Events(from, events);
  expect(result.rejected, JSON.stringify(result.rejected)).toBeNull();
  return result.state;
};
/** The critical path in order, with the items it needs. */
const CRITICAL: Chapter1Event[] = [
  beat('woke'), beat('left-room-104'), beat('lights-out-survived'), beat('office-visited'), beat('stores-entered'),
  beat('stores-encounter-resolved'), beat('crawlway-exited'), beat('link-office-found'),
  { type: 'item', id: 'shaw-keys', op: 'add' }, beat('keys-taken'), beat('plant2-opened'), beat('valve-closed'),
  beat('link-evidence-seen'), beat('bulkhead-unlocked'), beat('bulkhead-opened'), beat('chase-escalated'),
  beat('north-wing-reached'), beat('chapter-complete'),
];

describe('Chapter 1 state director', () => {
  it('runs the full critical path deterministically, with encounters and Shaw’s stage following the beats', () => {
    const a = run(CRITICAL);
    const b = run(CRITICAL);
    expect(a).toEqual(b);
    expect(a.beats).toEqual([...BEATS]);
    expect(Object.values(a.encounters).every((s) => s === 'completed')).toBe(true);
    expect(shawStage(a)).toBe('fear');
    expect(validateChapter1State(JSON.parse(JSON.stringify(a)))).toEqual({ ok: true, state: a });
  });

  it('Shaw’s stage advances composure → suspicion → anxiety → desperation → aggression → fear', () => {
    const stages: string[] = [];
    let state = createChapter1State();
    for (const event of CRITICAL) { state = applyChapter1Event(state, event).state; stages.push(shawStage(state)); }
    const order = stages.filter((s, i) => s !== stages[i - 1]);
    expect(order).toEqual(['composure', 'suspicion', 'anxiety', 'desperation', 'aggression', 'fear']);
  });

  it('rejects attempted sequence skipping without changing state', () => {
    const start = createChapter1State();
    for (const b of BEATS) {
      if (BEAT_REQUIRES[b].length === 0) continue;
      const result = applyChapter1Event(start, beat(b));
      expect(result.outcome, b).toBe('rejected');
      expect(result.state).toBe(start);
    }
    // Keys taken without holding the keys, the keys before the crawlway, a bulkhead before the valve.
    const mid = run(CRITICAL.slice(0, 7));
    expect(applyChapter1Event(mid, beat('keys-taken')).outcome).toBe('rejected');
    expect(applyChapter1Event(run(CRITICAL.slice(0, 6)), { type: 'item', id: 'shaw-keys', op: 'add' }).outcome).toBe('rejected');
    expect(applyChapter1Event(run(CRITICAL.slice(0, 11)), beat('bulkhead-unlocked')).outcome).toBe('rejected');
  });

  it('duplicate events are explicit no-ops (same object, no revision change)', () => {
    const state = run(CRITICAL.slice(0, 4));
    for (const event of [beat('office-visited'), { type: 'knowledge', id: 'transfer-route' } as const]) {
      const once = applyChapter1Event(state, event).state;
      const twice = applyChapter1Event(once, event);
      expect(twice.outcome).toBe(event.type === 'beat' ? 'duplicate' : 'duplicate');
      expect(twice.state).toBe(once);
    }
    const played = applyChapter1Event(state, { type: 'line-played', lineId: 'shaw.L1' }).state;
    expect(applyChapter1Event(played, { type: 'line-played', lineId: 'shaw.L1' }).outcome).toBe('duplicate');
  });

  it('suspicion is clamped to 0–4, sources apply once (seen-escaped twice) and waiting lowers it', () => {
    let state = run(CRITICAL.slice(0, 5));
    const sources = ['beam-found', 'stores-phone-answered', 'ruth-bag-taken', 'hatch-left-open', 'seen-escaped', 'seen-escaped', 'keys-quick-take'] as const;
    for (const source of sources) state = applyChapter1Event(state, { type: 'suspicion', source }).state;
    expect(state.suspicion).toBe(4);
    expect(applyChapter1Event(state, { type: 'suspicion', source: 'seen-escaped' }).outcome).toBe('duplicate');
    expect(applyChapter1Event(state, { type: 'suspicion', source: 'beam-found' }).outcome).toBe('duplicate');
    state = applyChapter1Event(state, { type: 'suspicion', source: 'waited-at-grate' }).state;
    expect(state.suspicion).toBe(3);
    let low = createChapter1State();
    low = applyChapter1Event(low, { type: 'suspicion', source: 'waited-at-grate' }).state;
    expect(low.suspicion).toBe(0);
    expect(validateChapter1State({ ...state, suspicion: 5 }).ok).toBe(false);
    expect(validateChapter1State({ ...state, suspicion: -1 }).ok).toBe(false);
  });

  it('choices are made once; alternate sequences produce different, valid states', () => {
    const base = run(CRITICAL.slice(0, 5));
    const answered = run([{ type: 'choice', id: 'stores-phone', value: 'answered' }, { type: 'suspicion', source: 'stores-phone-answered' }], base);
    const letRing = run([{ type: 'choice', id: 'stores-phone', value: 'let-ring' }], base);
    expect(answered.suspicion).toBe(1);
    expect(letRing.suspicion).toBe(0);
    expect(applyChapter1Event(answered, { type: 'choice', id: 'stores-phone', value: 'let-ring' }).outcome).toBe('rejected');
    expect(applyChapter1Event(answered, { type: 'choice', id: 'stores-phone', value: 'shouted' }).outcome).toBe('rejected');
    // Different key approaches reach the same story position.
    for (const approach of ['trolley', 'call-lamp', 'office-hook'] as const) {
      const s = run([...CRITICAL.slice(5, 10), { type: 'choice', id: 'key-approach', value: approach }], base);
      expect(s.choices['key-approach']).toBe(approach);
      expect(shawStage(s)).toBe('anxiety');
      expect(currentObjective(s).id).toBe('open-plant2');
    }
    // Skipping every optional beat and knowledge still completes the chapter (no softlock).
    const minimal = run(CRITICAL.filter((e) => e.type !== 'beat' || !['office-visited', 'link-office-found', 'link-evidence-seen', 'chase-escalated'].includes(e.beat)));
    expect(minimal.beats).toContain('chapter-complete');
  });

  it('objectives follow state and react to knowledge', () => {
    let state = run(CRITICAL.slice(0, 3));
    expect(currentObjective(state).id).toBe('find-out');
    state = run([{ type: 'knowledge', id: 'transfer-route' }], state);
    expect(currentObjective(state).id).toBe('to-stores');
    state = run(CRITICAL.slice(3, 12), state);
    expect(currentObjective(state).id).toBe('reach-link');
    state = run([{ type: 'knowledge', id: 'link-closure-order' }], state);
    expect(currentObjective(state).id).toBe('unlock-bulkhead');
  });

  it('items: keys can’t be dropped before the bulkhead; unknown ids and contradictory encounters are rejected', () => {
    const withKeys = run(CRITICAL.slice(0, 10));
    expect(applyChapter1Event(withKeys, { type: 'item', id: 'shaw-keys', op: 'remove' }).outcome).toBe('rejected');
    expect(applyChapter1Event(withKeys, { type: 'item', id: 'ruth-bag', op: 'remove' }).outcome).toBe('rejected');
    expect(applyChapter1Event(withKeys, { type: 'beat', beat: 'flying' as BeatId }).outcome).toBe('rejected');
    expect(applyChapter1Event(withKeys, { type: 'encounter', id: 'E6', status: 'active' }).outcome).toBe('rejected');
    expect(applyChapter1Event(withKeys, { type: 'encounter', id: 'E5', status: 'completed' }).outcome).toBe('rejected');
    const tampered = { ...withKeys, encounters: { ...withKeys.encounters, E2: 'active' } };
    expect(validateChapter1State(tampered).ok).toBe(false);
    expect(validateChapter1State({ ...withKeys, beats: ['keys-taken'] }).ok).toBe(false);
    expect(validateChapter1State({ ...withKeys, items: [] }).ok).toBe(false);
  });
});
