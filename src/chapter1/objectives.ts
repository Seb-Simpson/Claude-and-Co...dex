/**
 * Player-facing objectives, derived from Chapter 1 state (never stored in it). The text is what the
 * player character would reasonably want next, written as a journal line rather than a waypoint.
 */
import { hasBeat, hasItem, hasKnowledge, type Chapter1State } from './state';

export interface Chapter1Objective {
  readonly id: string;
  readonly text: string;
}

const O = (id: string, text: string): Chapter1Objective => ({ id, text });

/** First matching rule wins; rules are ordered from the end of the chapter backwards. */
export function currentObjective(state: Chapter1State): Chapter1Objective {
  const b = (beat: Parameters<typeof hasBeat>[1]) => hasBeat(state, beat);
  if (b('chapter-complete')) return O('done', 'Answer the call? Not yet.');
  if (b('north-wing-reached')) return O('find-ruth-north', 'Mum came this way. Follow her.');
  if (b('bulkhead-opened')) return O('escape', 'Get away from Sister Shaw. Get to the North Wing.');
  if (b('bulkhead-unlocked')) return O('open-bulkhead', 'Crank the bulkhead open. The alarm will bring her.');
  if (b('valve-closed')) {
    return hasKnowledge(state, 'link-closure-order')
      ? O('unlock-bulkhead', 'She closed the link herself. Unlock the bulkhead with her keys.')
      : O('reach-link', 'Follow the passage to the link door.');
  }
  if (b('plant2-opened')) return O('clear-steam', 'Steam blocks the passage. Find the valve on the banded pipe.');
  if (b('keys-taken') || hasItem(state, 'shaw-keys')) return O('open-plant2', 'Use Sister Shaw’s keys on the Plant 2 door.');
  if (b('link-office-found') || hasKnowledge(state, 'plant2-key-signed-out')) return O('take-keys', 'Sister Shaw has the Plant 2 key. Get it from her round.');
  if (b('crawlway-exited')) return O('find-link', 'Find the way into the link.');
  if (b('stores-encounter-resolved')) return O('crawlway', 'Follow the porters’ crawlway east.');
  if (b('stores-entered')) return O('stores', 'Don’t let her find you.');
  if (hasKnowledge(state, 'transfer-route') || hasKnowledge(state, 'payphone-ruth')) return O('to-stores', 'They took Mum through the stores. Find the porters.');
  if (b('lights-out-survived')) return O('find-out', 'Find out where they took Mum.');
  if (b('left-room-104')) return O('lobby', 'Get to the lobby.');
  return O('find-mum', 'Find Mum.');
}
