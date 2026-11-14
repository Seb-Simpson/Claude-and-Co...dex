/**
 * NW-R03 — the foundations demonstration in `?level=greybox&r03=1`.
 *
 * A short, isolated slice in the maintenance passage (M3 → M5) that exercises the new systems with
 * real interactions: a valve (hold), a wrong valve (repeatable, loud), a document (knowledge and
 * objective), a padlock that needs an item (hold), a crank (long hold), a crawlway hatch (crouched
 * hold) and a temporary voice line. It is NOT an encounter: Shaw does not appear, and the chase
 * (E6) is not implemented. The scenario starts from a developer preset state.
 */
import type { DialogueCue } from '../gameplay/chapter/dialogue';
import type { VoiceLineDef } from '../audio/voiceDirector';
import type { DeviceDef } from './devices';
import type { Chapter1Event } from './state';

export interface DevicePlacement {
  readonly device: DeviceDef;
  readonly space: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly look: 'valve' | 'wrong-valve' | 'document' | 'padlock' | 'crank';
}

export const R03_DEVICES: readonly DevicePlacement[] = [
  {
    space: 'M3', x: 16.0, y: 1.3, z: -39.4, look: 'valve',
    device: {
      id: 'r03-valve', prompt: 'Turn the banded valve', once: true, requires: [],
      hold: { seconds: 2.5, progressLabel: 'Turning the valve' }, noise: { radius: 4, intensity: 0.3 },
      effects: [{ type: 'beat', beat: 'valve-closed' }],
      notify: 'The hiss dies. The steam thins out of the link.',
    },
  },
  {
    space: 'M3', x: 18.2, y: 1.3, z: -39.4, look: 'wrong-valve',
    device: {
      id: 'r03-wrong-valve', prompt: 'Turn the plain valve', once: false, requires: [],
      hold: { seconds: 1.5, progressLabel: 'Turning the valve' }, noise: { radius: 10, intensity: 0.9 },
      effects: [],
      notify: 'The pipes bang, loud enough to carry. Wrong valve.',
    },
  },
  {
    space: 'M4', x: 12.0, y: 1.2, z: -42.4, look: 'document',
    device: {
      id: 'r03-incident-slip', prompt: 'Read the slip pinned to the trolley', once: true,
      requires: [{ id: 'beat:valve-closed', description: 'Too much steam to read it' }], noise: null,
      effects: [{ type: 'knowledge', id: 'link-closure-order' }, { type: 'beat', beat: 'link-evidence-seen' }],
      reads: '"Transfer suspended 03:17. 7 not accounted for. Link CLOSED by order, M. Shaw, 03:20."',
    },
  },
  {
    space: 'M5', x: 2.35, y: 1.1, z: -42.45, look: 'padlock',
    device: {
      id: 'r03-padlock', prompt: 'Unlock the padlock', once: true,
      requires: [{ id: 'item:shaw-keys', description: 'Needs Sister Shaw’s keys' }, { id: 'beat:valve-closed', description: 'Steam blocks the way' }],
      hold: { seconds: 1.2, progressLabel: 'Trying her keys' }, noise: { radius: 7, intensity: 0.6 },
      effects: [{ type: 'beat', beat: 'bulkhead-unlocked' }],
      voiceLine: 'shaw.r03.reaction',
      notify: 'The chain drops. Somewhere behind you, a speaker clicks on.',
    },
  },
  {
    space: 'M5', x: 3.0, y: 1.0, z: -41.9, look: 'crank',
    device: {
      id: 'r03-crank', prompt: 'Crank the bulkhead', once: true,
      requires: [{ id: 'beat:bulkhead-unlocked', description: 'Chained and padlocked' }],
      hold: { seconds: 4, progressLabel: 'Cranking' }, noise: { radius: 25, intensity: 1 },
      effects: [{ type: 'beat', beat: 'bulkhead-opened' }],
      notify: '[R03] The link alarm would ring here and the chase (E6) begin. Neither is implemented in this milestone.',
    },
  },
];

/** The crawlway hatch device (ST2), gating the hatch cover added in R03 mode. */
export const R03_HATCH: DevicePlacement = {
  space: 'ST2', x: 25.75, y: 0.45, z: 32.65, look: 'padlock',
  device: {
    id: 'r03-hatch-nuts', prompt: 'Undo the wing nuts', once: true, requires: [],
    hold: { seconds: 5, crouch: true, progressLabel: 'Undoing the wing nuts' }, noise: { radius: 7, intensity: 0.5 },
    effects: [{ type: 'flag', id: 'hatch-unfastened' }],
    notify: 'The last wing nut comes away. The hatch cover is loose.',
  },
};

/**
 * Requirement ids used by the R02 greybox doors, mapped onto Chapter 1 state in R03 mode so the
 * same doors are opened by real progress instead of developer flag posts.
 */
export const R03_LEGACY_REQUIREMENTS: Readonly<Record<string, string>> = {
  'valve-open': 'beat:valve-closed',
  'bulkhead-cranked': 'beat:bulkhead-opened',
  'shaw-keys': 'item:shaw-keys',
};

/** R02 developer flag posts replaced by real devices in R03 mode. */
export const R03_REPLACED_DEV_CONTROLS: readonly string[] = ['valve', 'bulkhead-crank'];

/** Developer preset for the scenario start (labelled DEV in the HUD): the state at Plant 2. */
export const R03_SCENARIO_EVENTS: readonly Chapter1Event[] = [
  { type: 'beat', beat: 'woke' }, { type: 'beat', beat: 'left-room-104' }, { type: 'beat', beat: 'lights-out-survived' },
  { type: 'beat', beat: 'stores-entered' }, { type: 'beat', beat: 'stores-encounter-resolved' }, { type: 'beat', beat: 'crawlway-exited' },
  { type: 'item', id: 'shaw-keys', op: 'add' }, { type: 'beat', beat: 'keys-taken' }, { type: 'beat', beat: 'plant2-opened' },
];
export const R03_SCENARIO_SPAWN = { x: 21.8, z: -43.2, yaw: Math.PI / 2 };

/** Line ids of the R03 audition set (tools/voice/r03-audition.lines.json). */
export const R03_AUDITION_IDS = ['shaw.r03.calm', 'shaw.r03.suspicious', 'shaw.r03.pleading', 'shaw.r03.shouting', 'shaw.r03.fear'] as const;

const STAGE_OF: Readonly<Record<(typeof R03_AUDITION_IDS)[number], string>> = {
  'shaw.r03.calm': 'composure', 'shaw.r03.suspicious': 'suspicion', 'shaw.r03.pleading': 'desperation',
  'shaw.r03.shouting': 'aggression', 'shaw.r03.fear': 'fear',
};

export interface VoiceProvenance { readonly id: string; readonly text: string; readonly speaker: string; readonly durationSeconds: number; readonly file: string; readonly status: string }

/** Subtitle-only fallback timing: about 2.6 words per second plus a beat. */
const estimate = (text: string): number => Math.max(1.5, text.split(/\s+/).length / 2.6 + 0.6);

export function r03Cue(id: string, text: string, provenance?: VoiceProvenance, base = '/voice-temp/'): DialogueCue {
  if (provenance && provenance.status === 'temporary' && provenance.durationSeconds > 0) {
    return {
      id, speaker: 'Sister Shaw', text, durationSeconds: provenance.durationSeconds, bus: 'voice', recordingStatus: 'temporary',
      assetUrl: `${base}${provenance.file}`, segments: [{ startSeconds: 0, endSeconds: provenance.durationSeconds, text }],
    };
  }
  const seconds = estimate(text);
  return { id, speaker: 'Sister Shaw', text, durationSeconds: seconds, bus: 'voice', recordingStatus: 'not-recorded', segments: [{ startSeconds: 0, endSeconds: seconds, text }] };
}

/** The demo line: Shaw on the passage intercom, variant chosen by her stage. */
export function r03VoiceLines(texts: Readonly<Record<string, string>>, provenance: ReadonlyMap<string, VoiceProvenance>): VoiceLineDef[] {
  return [{
    id: 'shaw.r03.reaction', priority: 6, interrupts: true, once: true, presentation: 'intercom',
    variants: R03_AUDITION_IDS.map((id) => ({ stages: [STAGE_OF[id]], cue: r03Cue(id, texts[id] ?? '…', provenance.get(id)) })),
  }];
}
