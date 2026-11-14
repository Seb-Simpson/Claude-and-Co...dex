/**
 * NW-R03 — Chapter 1 state director.
 *
 * A typed, serialisable, deterministic record of the player's progress through Chapter 1 (R02B
 * design), changed only through `applyChapter1Event`. Every event is validated against the story's
 * prerequisites, applied at most once (duplicates are explicit no-ops), and never produces a
 * contradictory state. Player-facing objective text lives in objectives.ts, not here.
 */

// ---------------------------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------------------------

/** Mandatory story beats, in chapter order (R02B §6.1). */
export const BEATS = [
  'woke', 'left-room-104', 'lights-out-survived', 'office-visited', 'stores-entered',
  'stores-encounter-resolved', 'crawlway-exited', 'link-office-found', 'keys-taken', 'plant2-opened',
  'valve-closed', 'link-evidence-seen', 'bulkhead-unlocked', 'bulkhead-opened', 'chase-escalated',
  'north-wing-reached', 'chapter-complete',
] as const;
export type BeatId = typeof BEATS[number];

/**
 * Physical-order prerequisites only: a beat requires what the player must already have done to be
 * able to stand where it happens. Information the player could miss never gates a beat (no softlocks).
 */
export const BEAT_REQUIRES: Readonly<Record<BeatId, readonly BeatId[]>> = {
  'woke': [],
  'left-room-104': ['woke'],
  'lights-out-survived': ['left-room-104'],
  'office-visited': ['lights-out-survived'],
  'stores-entered': ['lights-out-survived'],
  'stores-encounter-resolved': ['stores-entered'],
  'crawlway-exited': ['stores-encounter-resolved'],
  'link-office-found': ['crawlway-exited'],
  'keys-taken': ['crawlway-exited'],
  'plant2-opened': ['keys-taken'],
  'valve-closed': ['plant2-opened'],
  'link-evidence-seen': ['valve-closed'],
  'bulkhead-unlocked': ['valve-closed'],
  'bulkhead-opened': ['bulkhead-unlocked'],
  'chase-escalated': ['bulkhead-opened'],
  'north-wing-reached': ['bulkhead-opened'],
  'chapter-complete': ['north-wing-reached'],
};

/** Optional discoveries that change play (R02B §6.3) plus story knowledge. */
export const KNOWLEDGE = [
  'payphone-ruth', 'transfer-route', 'standing-orders', 'call-lamps', 'knock-code', 'porters-docket',
  'plant2-key-signed-out', 'link-closure-order', 'seven-names', 'okafor-torch', 'shaw-notebook',
  'sedation-tray', 'link-alarm-warning',
] as const;
export type KnowledgeId = typeof KNOWLEDGE[number];

export const ITEMS = ['ruth-bag', 'shaw-keys', 'okafor-torch'] as const;
export type ItemId = typeof ITEMS[number];

/** One-time player choices with their allowed values (R02B §6.5). */
export const CHOICES = {
  'payphone': ['answered', 'ignored'],
  'stores-phone': ['answered', 'let-ring'],
  'ruth-bag': ['taken', 'left'],
  'crawl-run-1': ['grille', 'steam'],
  'crawl-run-2': ['lower-duct', 'upper-run'],
  'key-approach': ['trolley', 'call-lamp', 'office-hook'],
  'e5-hide': ['alcove-locker', 'pump-cover', 'none'],
} as const;
export type ChoiceId = keyof typeof CHOICES;
export type ChoiceValue<C extends ChoiceId> = typeof CHOICES[C][number];

/** Suspicion sources (R02B §6.2). Each applies once, except where `max` allows repeats. */
export const SUSPICION_SOURCES = {
  'beam-found': { delta: 1, max: 1 },
  'stores-phone-answered': { delta: 1, max: 1 },
  'ruth-bag-taken': { delta: 1, max: 1 },
  'hatch-left-open': { delta: 1, max: 1 },
  'seen-escaped': { delta: 1, max: 2 },
  'keys-quick-take': { delta: 1, max: 1 },
  'steam-stagger-heard': { delta: 1, max: 1 },
  'call-lamp-empty': { delta: 1, max: 1 },
  'waited-at-grate': { delta: -1, max: 1 },
} as const;
export type SuspicionSource = keyof typeof SUSPICION_SOURCES;
export const SUSPICION_MIN = 0;
export const SUSPICION_MAX = 4;

export const PROGRESS_FLAGS = ['f1-open', 'stores-locked', 'hatch-unfastened', 'grille-kicked', 'barred-door-barred'] as const;
export type ProgressFlag = typeof PROGRESS_FLAGS[number];

export const ENCOUNTERS = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6'] as const;
export type EncounterId = typeof ENCOUNTERS[number];
export type EncounterStatus = 'pending' | 'active' | 'completed';

export const SHAW_STAGES = ['composure', 'suspicion', 'anxiety', 'desperation', 'aggression', 'fear'] as const;
export type ShawStage = typeof SHAW_STAGES[number];

// ---------------------------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------------------------

export interface Chapter1State {
  readonly beats: readonly BeatId[];
  readonly knowledge: readonly KnowledgeId[];
  readonly items: readonly ItemId[];
  readonly choices: Readonly<Partial<{ [C in ChoiceId]: ChoiceValue<C> }>>;
  readonly suspicion: number;
  /** Times each suspicion source has applied (for once/max rules). */
  readonly suspicionSources: Readonly<Partial<Record<SuspicionSource, number>>>;
  readonly flags: readonly ProgressFlag[];
  readonly encounters: Readonly<Record<EncounterId, EncounterStatus>>;
  /** Voice lines flagged `once` that have already played (survives checkpoints). */
  readonly linesPlayed: readonly string[];
  /** Applied event count; the deterministic revision of this state. */
  readonly revision: number;
}

export function createChapter1State(): Chapter1State {
  return {
    beats: [], knowledge: [], items: [], choices: {}, suspicion: 0, suspicionSources: {}, flags: [],
    encounters: { E1: 'pending', E2: 'pending', E3: 'pending', E4: 'pending', E5: 'pending', E6: 'pending' },
    linesPlayed: [], revision: 0,
  };
}

/** Shaw's emotional stage, derived (never stored) so it can't contradict the beats (R02B §2.3). */
export function shawStage(state: Chapter1State): ShawStage {
  const has = (beat: BeatId) => state.beats.includes(beat);
  if (has('north-wing-reached')) return 'fear';
  if (has('chase-escalated')) return 'aggression';
  if (has('plant2-opened')) return 'desperation';
  if (has('keys-taken')) return 'anxiety';
  if (has('stores-entered') || state.suspicion >= 2) return 'suspicion';
  return 'composure';
}

export const hasBeat = (state: Chapter1State, beat: BeatId): boolean => state.beats.includes(beat);
export const hasKnowledge = (state: Chapter1State, id: KnowledgeId): boolean => state.knowledge.includes(id);
export const hasItem = (state: Chapter1State, id: ItemId): boolean => state.items.includes(id);
export const hasFlag = (state: Chapter1State, id: ProgressFlag): boolean => state.flags.includes(id);

// ---------------------------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------------------------

export type Chapter1Event =
  | { readonly type: 'beat'; readonly beat: BeatId }
  | { readonly type: 'knowledge'; readonly id: KnowledgeId }
  | { readonly type: 'item'; readonly id: ItemId; readonly op: 'add' | 'remove' }
  | { readonly type: 'choice'; readonly id: ChoiceId; readonly value: string }
  | { readonly type: 'suspicion'; readonly source: SuspicionSource }
  | { readonly type: 'flag'; readonly id: ProgressFlag }
  | { readonly type: 'encounter'; readonly id: EncounterId; readonly status: 'active' | 'completed' }
  | { readonly type: 'line-played'; readonly lineId: string };

export type Chapter1EventResult =
  | { readonly outcome: 'applied'; readonly state: Chapter1State }
  | { readonly outcome: 'duplicate'; readonly state: Chapter1State }
  | { readonly outcome: 'rejected'; readonly state: Chapter1State; readonly reason: string };

/** Encounters that start/complete with beats; their status must agree with the beats. */
const ENCOUNTER_GATES: Readonly<Record<EncounterId, { readonly startAfter: BeatId; readonly completeWith: BeatId }>> = {
  E1: { startAfter: 'left-room-104', completeWith: 'lights-out-survived' },
  E2: { startAfter: 'stores-entered', completeWith: 'stores-encounter-resolved' },
  E3: { startAfter: 'stores-encounter-resolved', completeWith: 'crawlway-exited' },
  E4: { startAfter: 'crawlway-exited', completeWith: 'keys-taken' },
  E5: { startAfter: 'plant2-opened', completeWith: 'bulkhead-unlocked' },
  E6: { startAfter: 'bulkhead-opened', completeWith: 'north-wing-reached' },
};

/** Item rules: what can be gained and when (no item may appear before the player can reach it). */
const ITEM_REQUIRES: Readonly<Record<ItemId, BeatId>> = {
  'ruth-bag': 'stores-entered',
  'shaw-keys': 'crawlway-exited',
  'okafor-torch': 'stores-encounter-resolved',
};

const sorted = <T extends string>(values: readonly T[], order: readonly T[]): T[] => [...values].sort((a, b) => order.indexOf(a) - order.indexOf(b));

function reject(state: Chapter1State, reason: string): Chapter1EventResult { return { outcome: 'rejected', state, reason }; }
function next(state: Chapter1State, patch: Partial<Chapter1State>): Chapter1EventResult {
  return { outcome: 'applied', state: { ...state, ...patch, revision: state.revision + 1 } };
}

export function applyChapter1Event(state: Chapter1State, event: Chapter1Event): Chapter1EventResult {
  switch (event.type) {
    case 'beat': {
      if (!BEATS.includes(event.beat)) return reject(state, `Unknown beat "${String(event.beat)}"`);
      if (hasBeat(state, event.beat)) return { outcome: 'duplicate', state };
      const missing = BEAT_REQUIRES[event.beat].filter((b) => !hasBeat(state, b));
      if (missing.length) return reject(state, `Beat "${event.beat}" requires ${missing.join(', ')}`);
      if (event.beat === 'keys-taken' && !hasItem(state, 'shaw-keys')) return reject(state, 'Beat "keys-taken" requires the item shaw-keys');
      const beats = sorted([...state.beats, event.beat], BEATS);
      // Encounters advance with their beats.
      const encounters = { ...state.encounters };
      for (const id of ENCOUNTERS) {
        const gate = ENCOUNTER_GATES[id];
        if (event.beat === gate.completeWith) encounters[id] = 'completed';
        else if (event.beat === gate.startAfter && encounters[id] === 'pending') encounters[id] = 'active';
      }
      return next(state, { beats, encounters });
    }
    case 'knowledge': {
      if (!KNOWLEDGE.includes(event.id)) return reject(state, `Unknown knowledge "${String(event.id)}"`);
      if (hasKnowledge(state, event.id)) return { outcome: 'duplicate', state };
      return next(state, { knowledge: sorted([...state.knowledge, event.id], KNOWLEDGE) });
    }
    case 'item': {
      if (!ITEMS.includes(event.id)) return reject(state, `Unknown item "${String(event.id)}"`);
      if (event.op === 'add') {
        if (hasItem(state, event.id)) return { outcome: 'duplicate', state };
        if (!hasBeat(state, ITEM_REQUIRES[event.id])) return reject(state, `Item "${event.id}" can't be obtained before "${ITEM_REQUIRES[event.id]}"`);
        return next(state, { items: sorted([...state.items, event.id], ITEMS) });
      }
      if (!hasItem(state, event.id)) return reject(state, `Item "${event.id}" is not held`);
      if (event.id === 'shaw-keys' && !hasBeat(state, 'bulkhead-unlocked')) return reject(state, 'Shaw’s keys are needed until the bulkhead is unlocked');
      return next(state, { items: state.items.filter((i) => i !== event.id) });
    }
    case 'choice': {
      const allowed = CHOICES[event.id] as readonly string[] | undefined;
      if (!allowed) return reject(state, `Unknown choice "${String(event.id)}"`);
      if (!allowed.includes(event.value)) return reject(state, `Invalid value "${event.value}" for choice "${event.id}"`);
      const current = state.choices[event.id];
      if (current === event.value) return { outcome: 'duplicate', state };
      if (current !== undefined) return reject(state, `Choice "${event.id}" was already made ("${current}")`);
      return next(state, { choices: { ...state.choices, [event.id]: event.value } });
    }
    case 'suspicion': {
      const rule = SUSPICION_SOURCES[event.source];
      if (!rule) return reject(state, `Unknown suspicion source "${String(event.source)}"`);
      const count = state.suspicionSources[event.source] ?? 0;
      if (count >= rule.max) return { outcome: 'duplicate', state };
      const suspicion = Math.min(SUSPICION_MAX, Math.max(SUSPICION_MIN, state.suspicion + rule.delta));
      return next(state, { suspicion, suspicionSources: { ...state.suspicionSources, [event.source]: count + 1 } });
    }
    case 'flag': {
      if (!PROGRESS_FLAGS.includes(event.id)) return reject(state, `Unknown flag "${String(event.id)}"`);
      if (hasFlag(state, event.id)) return { outcome: 'duplicate', state };
      return next(state, { flags: sorted([...state.flags, event.id], PROGRESS_FLAGS) });
    }
    case 'encounter': {
      if (!ENCOUNTERS.includes(event.id)) return reject(state, `Unknown encounter "${String(event.id)}"`);
      const current = state.encounters[event.id];
      const gate = ENCOUNTER_GATES[event.id];
      if (current === event.status) return { outcome: 'duplicate', state };
      if (current === 'completed') return reject(state, `Encounter ${event.id} is already completed`);
      if (event.status === 'completed') return reject(state, `Encounter ${event.id} completes only through the beat "${gate.completeWith}"`);
      if (!hasBeat(state, gate.startAfter)) return reject(state, `Encounter ${event.id} can't start before "${gate.startAfter}"`);
      return next(state, { encounters: { ...state.encounters, [event.id]: 'active' } });
    }
    case 'line-played': {
      if (typeof event.lineId !== 'string' || !event.lineId) return reject(state, 'Invalid line id');
      if (state.linesPlayed.includes(event.lineId)) return { outcome: 'duplicate', state };
      return next(state, { linesPlayed: [...state.linesPlayed, event.lineId].sort() });
    }
  }
}

/** Applies a sequence; stops at the first rejection. */
export function applyChapter1Events(state: Chapter1State, events: readonly Chapter1Event[]): { state: Chapter1State; rejected: { index: number; reason: string } | null } {
  let current = state;
  for (let index = 0; index < events.length; index += 1) {
    const result = applyChapter1Event(current, events[index]!);
    if (result.outcome === 'rejected') return { state: current, rejected: { index, reason: result.reason } };
    current = result.state;
  }
  return { state: current, rejected: null };
}

/**
 * Validates a state from outside (a checkpoint): every field known, beats closed under their
 * prerequisites, encounters consistent with beats, suspicion in range and consistent with sources.
 * Returns a normalised copy, or the first problem found.
 */
export function validateChapter1State(raw: unknown): { ok: true; state: Chapter1State } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'State is not an object' };
  const r = raw as Record<string, unknown>;
  const list = <T extends string>(value: unknown, vocab: readonly T[], name: string): T[] | string => {
    if (!Array.isArray(value)) return `${name} must be an array`;
    for (const v of value) if (!vocab.includes(v as T)) return `${name} contains unknown "${String(v)}"`;
    if (new Set(value).size !== value.length) return `${name} contains duplicates`;
    return sorted(value as T[], vocab);
  };
  const beats = list(r.beats, BEATS, 'beats'); if (typeof beats === 'string') return { ok: false, error: beats };
  const knowledge = list(r.knowledge, KNOWLEDGE, 'knowledge'); if (typeof knowledge === 'string') return { ok: false, error: knowledge };
  const items = list(r.items, ITEMS, 'items'); if (typeof items === 'string') return { ok: false, error: items };
  const flags = list(r.flags, PROGRESS_FLAGS, 'flags'); if (typeof flags === 'string') return { ok: false, error: flags };
  for (const beat of beats) {
    const missing = BEAT_REQUIRES[beat].filter((b) => !beats.includes(b));
    if (missing.length) return { ok: false, error: `Beat "${beat}" present without ${missing.join(', ')}` };
  }
  for (const item of items) if (!beats.includes(ITEM_REQUIRES[item])) return { ok: false, error: `Item "${item}" present before "${ITEM_REQUIRES[item]}"` };
  if (beats.includes('keys-taken') && !beats.includes('bulkhead-unlocked') && !items.includes('shaw-keys')) return { ok: false, error: 'Keys taken but not held before the bulkhead' };
  const choices: Record<string, string> = {};
  if (!r.choices || typeof r.choices !== 'object' || Array.isArray(r.choices)) return { ok: false, error: 'choices must be an object' };
  for (const [key, value] of Object.entries(r.choices as Record<string, unknown>)) {
    const allowed = CHOICES[key as ChoiceId] as readonly string[] | undefined;
    if (!allowed || typeof value !== 'string' || !allowed.includes(value)) return { ok: false, error: `Invalid choice ${key}=${String(value)}` };
    choices[key] = value;
  }
  if (!r.suspicionSources || typeof r.suspicionSources !== 'object' || Array.isArray(r.suspicionSources)) return { ok: false, error: 'suspicionSources must be an object' };
  const sources: Partial<Record<SuspicionSource, number>> = {};
  let expected = 0;
  for (const [key, value] of Object.entries(r.suspicionSources as Record<string, unknown>)) {
    const rule = SUSPICION_SOURCES[key as SuspicionSource];
    if (!rule || typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > rule.max) return { ok: false, error: `Invalid suspicion source ${key}` };
    sources[key as SuspicionSource] = value;
  }
  // Replay sources in a fixed order is not enough (clamping is order dependent); accept any value
  // reachable within [0, 4] and bounded by the sum of positive sources.
  for (const [key, count] of Object.entries(sources)) expected += Math.max(0, SUSPICION_SOURCES[key as SuspicionSource].delta) * (count ?? 0);
  const suspicion = r.suspicion;
  if (typeof suspicion !== 'number' || !Number.isInteger(suspicion) || suspicion < SUSPICION_MIN || suspicion > SUSPICION_MAX || suspicion > expected) {
    return { ok: false, error: 'Suspicion out of range or inconsistent with its sources' };
  }
  if (!r.encounters || typeof r.encounters !== 'object') return { ok: false, error: 'encounters must be an object' };
  const encounters = {} as Record<EncounterId, EncounterStatus>;
  for (const id of ENCOUNTERS) {
    const status = (r.encounters as Record<string, unknown>)[id];
    if (status !== 'pending' && status !== 'active' && status !== 'completed') return { ok: false, error: `Encounter ${id} has an invalid status` };
    const gate = ENCOUNTER_GATES[id];
    if ((status === 'completed') !== beats.includes(gate.completeWith)) return { ok: false, error: `Encounter ${id} status contradicts beat "${gate.completeWith}"` };
    if (status === 'active' && !beats.includes(gate.startAfter)) return { ok: false, error: `Encounter ${id} active before "${gate.startAfter}"` };
    encounters[id] = status;
  }
  if (!Array.isArray(r.linesPlayed) || r.linesPlayed.some((l) => typeof l !== 'string' || !l) || new Set(r.linesPlayed).size !== r.linesPlayed.length) {
    return { ok: false, error: 'linesPlayed must be unique strings' };
  }
  if (typeof r.revision !== 'number' || !Number.isInteger(r.revision) || r.revision < 0) return { ok: false, error: 'Invalid revision' };
  return {
    ok: true,
    state: {
      beats, knowledge, items, flags, choices: choices as Chapter1State['choices'], suspicion,
      suspicionSources: sources, encounters, linesPlayed: [...(r.linesPlayed as string[])].sort(), revision: r.revision,
    },
  };
}
