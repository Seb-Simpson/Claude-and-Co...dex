import { CHAPTER_OBJECTIVES } from './model';
import type { ChapterClueId, ChapterObjectiveId, ChapterState } from './model';
import { getChapterHintLevel, getChapterObjective } from './progression';

export interface ChapterJournalEntry {
  readonly id: ChapterClueId;
  readonly title: string;
  readonly text: string;
}
export interface ChapterJournal {
  readonly objective: { readonly id: ChapterObjectiveId; readonly title: string; readonly detail: string };
  readonly completedObjectives: readonly ChapterObjectiveId[];
  readonly entries: readonly ChapterJournalEntry[];
  readonly hintAvailable: boolean;
  readonly hints: readonly { readonly level: 1 | 2; readonly text: string }[];
}

const OBJECTIVES: Readonly<Record<ChapterObjectiveId, { readonly title: string; readonly detail: string }>> = {
  orient: { title: 'Find out where you are', detail: 'Examine the admission information and try to reach someone.' },
  station: { title: 'Reach the nurses’ station', detail: 'The discharge notice directs enquiries to the station.' },
  'survive-nurse': { title: 'Survive the night round', detail: 'Keep quiet. Find a way back to the review desk after breaking contact.' },
  'release-procedure': { title: 'Find a way to open the secured exit', detail: 'Follow the emergency release procedure to the incident pack in Records.' },
  'arm-power': { title: 'Restore the emergency release supply', detail: 'Use the labelled reserve controls and the incident-pack diagram.' },
  'local-release': { title: 'Confirm the emergency release', detail: 'Take the operating handle to the local release mechanism. Check the route before confirming.' },
  stairwell: { title: 'Reach Emergency Stairwell B', detail: 'The retention barrier is released. Reach the stair landing.' },
  complete: { title: 'Chapter One complete — The Awakening', detail: 'The hospital recognised the returning admission. The discharge request is still pending.' },
};

const ENTRIES: Readonly<Record<ChapterClueId, Omit<ChapterJournalEntry, 'id'>>> = {
  wristband: { title: 'Patient 104', text: 'PATIENT 104\nADMITTED: YESTERDAY\nSTATUS: DO NOT DISCHARGE\nThe room clock is stopped at 03:17.' },
  'current-intake': { title: 'Current admission', text: 'Halden Vale Infirmary — West Ward. Permanent patient ID: HVI-000104. The intake carbon copy bears my signature. I remember arriving for an appointment. Discharge enquiries require review at the nurses’ station.' },
  'unanswered-call': { title: 'No reply', text: 'The call receives no answer. There may still be somebody working outside.' },
  'station-direction': { title: 'Nurses’ station', text: 'The ward notices direct patient and discharge enquiries to the nurses’ station.' },
  'night-ledger': { title: 'The night ledger', text: '104 — RETURNED — 03:17\nThe ink appeared while the pen remained untouched.' },
  'release-procedure': { title: 'Emergency release procedure', text: 'Emergency Stairwell B is behind the research retention barrier. Collect the emergency operating handle and instructions from the 2012 incident pack in Records. Arm the separate reserve supply, then confirm at the local mechanism. Local confirmation releases observation-bay latches as well as the stair barrier and sounds the egress chime. Reserve capacity: one load unit.' },
  'withdrawal-record': { title: 'My earlier withdrawal', text: '17 October 2012 — HVI-000104. The permanent ID, signature and wrist-scar diagram match the current intake. The request to withdraw consent was received.\n\nRECORDING TRANSCRIPT\nArchive slate: “West Ward. Withdrawal record. Seventeenth October, two thousand twelve.”\nMy recorded voice: “My patient number is one-zero-four. I am withdrawing consent. I want to leave.”\nNurse: “The consultant has not cleared your discharge.”\n\nLAST SEEN: EMERGENCY STAIRWELL B, 03:17\nDISCHARGE UNCONFIRMED\nREVIEW REQUIRED\n\nI do not remember this. The record does not establish what happened after the stairwell.' },
  'panel-schematic': { title: 'Reserve distribution', text: 'RESERVE CAPACITY: 1\nWARD: 1\nLIFT: 2\nEGRESS: 1\nOBSERVATION BRIDGE: +1 while bridged. Selectors are safe to change. RESET restores a tripped breaker; ENGAGE evaluates the selected load.' },
  'bridge-annotation': { title: '2012 bridge annotation', text: 'Observation remained bridged after isolation. Isolate that link before applying the one-unit reserve to another branch. Successful egress engagement arms the supply; the local mechanical release is a separate action.' },
  'nurse-note': { title: 'A patient’s note', text: 'Count her footsteps instead of calling for her. Keep doors quiet. The night nurse follows the last sound.' },
  'patient-chart': { title: 'Daniel Reed', text: 'Observation patient. The egress chime causes agitation and following behaviour. Maintain clear access when the emergency transfer releases observation bays.' },
};

const HINTS = [
  { level: 1, text: 'The reserve serves only one load. Compare the panel diagram with the incident annotation about the observation bridge.' },
  { level: 2, text: 'Isolate observation, select EGRESS and enable reserve. Reset the breaker if tripped, then ENGAGE. The local release still needs its operating handle.' },
] as const;

/** A fresh, read-only projection; journal rendering and pause policy belong to integration. */
export function projectChapterJournal(state: ChapterState): ChapterJournal {
  const id = getChapterObjective(state);
  const index = CHAPTER_OBJECTIVES.indexOf(id);
  return {
    objective: { id, ...OBJECTIVES[id] },
    completedObjectives: CHAPTER_OBJECTIVES.slice(0, index),
    entries: state.clues.map((clue) => ({ id: clue, ...ENTRIES[clue] })),
    hintAvailable: getChapterHintLevel(state) > state.viewedHintLevel,
    hints: HINTS.filter((hint) => hint.level <= state.viewedHintLevel).map((hint) => ({ ...hint })),
  };
}
