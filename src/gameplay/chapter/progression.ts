import {
  CHAPTER_CHECKPOINTS, CHAPTER_CONTENT_REVISION, CHAPTER_OBJECTIVES, CHAPTER_SCHEMA_VERSION,
} from './model';
import type {
  ActiveChapterScene, ChapterCheckpointId, ChapterClueId, ChapterCommand, ChapterEffect,
  ChapterObjectiveId, ChapterResult, ChapterSceneId, ChapterState,
} from './model';
import { applyChapterPuzzleCommand, createChapterPuzzleState } from './puzzle';

export function createInitialChapterState(): ChapterState {
  return {
    schemaVersion: CHAPTER_SCHEMA_VERSION, contentRevision: CHAPTER_CONTENT_REVISION,
    clues: [], completedScenes: [], activeScene: null, nextSceneToken: 1,
    stationReached: false, nurseSurvived: false, panelVisited: false, stairReached: false,
    puzzle: createChapterPuzzleState(), viewedHintLevel: 0,
    checkpoints: ['chapter1.start'], atSafeBoundary: 'chapter1.start',
  };
}

function has(state: ChapterState, clue: ChapterClueId): boolean { return state.clues.includes(clue); }
function sceneDone(state: ChapterState, id: ChapterSceneId): boolean { return state.completedScenes.includes(id); }
function addClues(state: ChapterState, ...clues: ChapterClueId[]): ChapterState {
  return { ...state, clues: [...new Set([...state.clues, ...clues])] };
}

export function getChapterObjective(state: ChapterState): ChapterObjectiveId {
  if (!sceneDone(state, 'c1.cine.awakening') ||
      !['wristband', 'current-intake', 'unanswered-call', 'station-direction'].every((c) => has(state, c as ChapterClueId))) return 'orient';
  if (!state.stationReached) return 'station';
  if (!state.nurseSurvived) return 'survive-nurse';
  if (!has(state, 'release-procedure') || state.puzzle.handleLocation === 'incident-pack') return 'release-procedure';
  if (!state.puzzle.busArmed) return 'arm-power';
  if (!state.puzzle.releaseConfirmed) return 'local-release';
  return sceneDone(state, 'c1.cine.ending') ? 'complete' : 'stairwell';
}

export function getChapterHintLevel(state: ChapterState): 0 | 1 | 2 {
  if (state.puzzle.busArmed || !state.panelVisited || !has(state, 'release-procedure')) return 0;
  if (state.puzzle.failedAttempts >= 2) return 2;
  if (state.puzzle.failedAttempts >= 1 || (has(state, 'panel-schematic') && has(state, 'bridge-annotation'))) return 1;
  return 0;
}

/** Eligibility only. The live adapter must also validate actual safe poses and actors. */
export function canCommitChapterCheckpoint(state: ChapterState, id: ChapterCheckpointId): boolean {
  if (state.activeScene) return false;
  const index = CHAPTER_CHECKPOINTS.indexOf(id);
  if (index > 0 && !state.checkpoints.includes(CHAPTER_CHECKPOINTS[index - 1]!)) return false;
  switch (id) {
    case 'chapter1.start':
      return !state.nurseSurvived && !state.puzzle.busArmed && !state.puzzle.releaseConfirmed &&
        state.puzzle.handleLocation === 'incident-pack' && !state.stationReached;
    case 'chapter1.after-nurse':
      return state.nurseSurvived && !state.puzzle.releaseConfirmed && !state.puzzle.busArmed &&
        state.puzzle.handleLocation === 'incident-pack';
    case 'chapter1.after-records-power':
      return state.nurseSurvived && has(state, 'withdrawal-record') && state.puzzle.busArmed &&
        state.puzzle.handleLocation === 'held' && !state.puzzle.releaseConfirmed;
    case 'chapter1.before-patient':
      return state.nurseSurvived && state.puzzle.busArmed && state.puzzle.handleLocation === 'installed' && !state.puzzle.releaseConfirmed;
    case 'chapter1.complete':
      return state.stairReached && state.puzzle.releaseConfirmed && sceneDone(state, 'c1.cine.ending');
  }
}

export function getAvailableChapterScenes(state: ChapterState): readonly ChapterSceneId[] {
  if (state.activeScene || sceneDone(state, 'c1.cine.ending')) return [];
  const scenes: ChapterSceneId[] = [];
  if (!sceneDone(state, 'c1.cine.awakening')) return ['c1.cine.awakening'];
  if (!sceneDone(state, 'c1.cine.nurse-reveal') && state.stationReached && has(state, 'night-ledger') &&
      has(state, 'current-intake') && has(state, 'unanswered-call')) scenes.push('c1.cine.nurse-reveal');
  if (!sceneDone(state, 'c1.cine.record') && has(state, 'withdrawal-record')) scenes.push('c1.cine.record');
  if (!sceneDone(state, 'c1.cine.patient-release') && state.puzzle.releaseConfirmed) scenes.push('c1.cine.patient-release');
  if (state.stairReached && sceneDone(state, 'c1.cine.patient-release')) scenes.push('c1.cine.ending');
  return scenes;
}

function beginScene(state: ChapterState, id: ChapterSceneId): { state: ChapterState; scene: ActiveChapterScene } {
  if (!Number.isSafeInteger(state.nextSceneToken) || state.nextSceneToken >= Number.MAX_SAFE_INTEGER) {
    throw new Error('Chapter cinematic token space exhausted');
  }
  const scene = { id, token: state.nextSceneToken };
  return { state: { ...state, activeScene: scene, nextSceneToken: state.nextSceneToken + 1 }, scene };
}

/**
 * Pure semantic reducer. Effects describe intentions; this does not play a cinematic,
 * move an enemy, open a mesh, save the live world or replace existing GameEvents.
 */
export function applyChapterCommand(previous: ChapterState, command: ChapterCommand): ChapterResult {
  const reject = (reason: string): ChapterResult => ({ state: previous, accepted: false, reason, effects: [] });
  const unchanged = (): ChapterResult => ({ state: previous, accepted: true, effects: [] });
  if (sceneDone(previous, 'c1.cine.ending')) return reject('Chapter One is already complete');
  if (previous.activeScene && command.type !== 'settle-scene') return reject('A cinematic owns input');
  if (!sceneDone(previous, 'c1.cine.awakening') && command.type !== 'request-scene' && command.type !== 'settle-scene' && command.type !== 'commit-checkpoint') {
    return reject('The awakening has not handed control to the player');
  }
  let state: ChapterState = { ...previous, atSafeBoundary: null };
  const effects: ChapterEffect[] = [];
  let puzzleFeedback: ChapterResult['puzzleFeedback'];
  switch (command.type) {
    case 'inspect': {
      if (has(previous, command.clue)) return unchanged();
      if (command.clue === 'withdrawal-record') return reject('The incident pack must expose the record');
      state = addClues(state, command.clue);
      // The two physical copies of the intake notice carry the same destination fact.
      if (command.clue === 'current-intake') state = addClues(state, 'station-direction');
      break;
    }
    case 'reach-station':
      if (previous.stationReached) return unchanged();
      state = { ...state, stationReached: true };
      break;
    case 'request-scene': {
      if (sceneDone(previous, command.id)) return unchanged();
      if (!command.safe) return reject('Cinematic staging is not safe');
      if (!getAvailableChapterScenes(previous).includes(command.id)) return reject('Cinematic story conditions are not met');
      const started = beginScene(state, command.id);
      state = started.state;
      effects.push({ type: 'scene-requested', scene: started.scene });
      break;
    }
    case 'settle-scene': {
      const active = previous.activeScene;
      if (!active || active.token !== command.token) return reject('Stale or absent cinematic result');
      state = { ...state, activeScene: null };
      if (command.outcome === 'interrupted') {
        effects.push({ type: 'scene-interrupted', scene: active });
        break;
      }
      state = { ...state, completedScenes: [...state.completedScenes, active.id] };
      if (active.id === 'c1.cine.awakening') state = addClues(state, 'wristband');
      if (active.id === 'c1.cine.nurse-reveal') effects.push({ type: 'activate-entity', entity: 'nurse' });
      if (active.id === 'c1.cine.patient-release') effects.push({ type: 'activate-entity', entity: 'patient' });
      if (active.id === 'c1.cine.ending') {
        state = { ...state, checkpoints: [...state.checkpoints, 'chapter1.complete'], atSafeBoundary: 'chapter1.complete' };
        effects.push({ type: 'checkpoint-committed', id: 'chapter1.complete' });
      }
      break;
    }
    case 'survive-nurse':
      if (previous.nurseSurvived) return unchanged();
      if (!sceneDone(previous, 'c1.cine.nurse-reveal')) return reject('The first Nurse encounter has not begun');
      if (!command.contactBroken || !command.atReviewDesk) return reject('Break contact and reach the safe review desk');
      state = { ...state, nurseSurvived: true, checkpoints: [...state.checkpoints, 'chapter1.after-nurse'], atSafeBoundary: 'chapter1.after-nurse' };
      effects.push({ type: 'checkpoint-committed', id: 'chapter1.after-nurse' });
      break;
    case 'collect-operating-handle':
      if (previous.puzzle.handleLocation !== 'incident-pack') return unchanged();
      if (!previous.nurseSurvived || !has(previous, 'release-procedure')) return reject('Follow the station emergency procedure to Records');
      state = addClues({ ...state, puzzle: { ...state.puzzle, handleLocation: 'held' } }, 'withdrawal-record', 'bridge-annotation');
      break;
    case 'visit-panel':
      if (previous.panelVisited) return unchanged();
      if (!previous.nurseSurvived) return reject('The night round has not been survived');
      state = { ...state, panelVisited: true };
      break;
    case 'puzzle': {
      if (!previous.nurseSurvived || !previous.panelVisited) return reject('The operator has not reached the panel');
      const result = applyChapterPuzzleCommand(previous.puzzle, command.command);
      state = { ...state, puzzle: result.state };
      puzzleFeedback = result.feedback;
      if (!previous.puzzle.busArmed && result.state.busArmed) effects.push({ type: 'power-armed' });
      if (result.state === previous.puzzle) return { ...unchanged(), puzzleFeedback };
      break;
    }
    case 'install-operating-handle':
      if (previous.puzzle.handleLocation === 'installed') return unchanged();
      if (!previous.checkpoints.includes('chapter1.after-records-power')) return reject('Reach the solved-power checkpoint before local release');
      if (!previous.puzzle.busArmed || previous.puzzle.handleLocation !== 'held') return reject('The armed supply and operating handle are required');
      state = { ...state, puzzle: { ...state.puzzle, handleLocation: 'installed' } };
      break;
    case 'commit-checkpoint': {
      if (!command.safe || !canCommitChapterCheckpoint(previous, command.id)) return reject('Checkpoint requires its supported safe story boundary');
      const last = previous.checkpoints.at(-1)!;
      if (CHAPTER_CHECKPOINTS.indexOf(command.id) < CHAPTER_CHECKPOINTS.indexOf(last)) return reject('Cannot regress the checkpoint sequence');
      state = { ...state, checkpoints: previous.checkpoints.includes(command.id) ? previous.checkpoints : [...previous.checkpoints, command.id], atSafeBoundary: command.id };
      if (previous.atSafeBoundary !== command.id) effects.push({ type: 'checkpoint-committed', id: command.id });
      break;
    }
    case 'confirm-release': {
      if (previous.puzzle.releaseConfirmed) return unchanged();
      if (!command.safe || !previous.checkpoints.includes('chapter1.before-patient') || !previous.puzzle.busArmed || previous.puzzle.handleLocation !== 'installed') {
        return reject('Release requires the handle, armed supply and safe pre-Patient checkpoint');
      }
      state = { ...state, puzzle: { ...state.puzzle, releaseConfirmed: true } };
      effects.push({ type: 'release-confirmed' });
      const started = beginScene(state, 'c1.cine.patient-release');
      state = started.state;
      effects.push({ type: 'scene-requested', scene: started.scene });
      break;
    }
    case 'reach-stair-landing':
      if (previous.stairReached) return unchanged();
      if (!command.safe || !previous.puzzle.releaseConfirmed || !sceneDone(previous, 'c1.cine.patient-release')) return reject('Reach the released stair landing after the Patient handoff');
      state = { ...state, stairReached: true };
      break;
    case 'read-hint': {
      const level = getChapterHintLevel(previous);
      if (level === 0) return reject('No further puzzle hint is available from exploration yet');
      if (previous.viewedHintLevel >= level) return unchanged();
      state = { ...state, viewedHintLevel: level };
      break;
    }
  }
  const oldObjective = CHAPTER_OBJECTIVES.indexOf(getChapterObjective(previous));
  const nextObjective = CHAPTER_OBJECTIVES.indexOf(getChapterObjective(state));
  for (let index = oldObjective; index < nextObjective; index++) {
    effects.push({ type: 'objective-completed', id: CHAPTER_OBJECTIVES[index]! });
  }
  return { state, accepted: true, effects, ...(puzzleFeedback === undefined ? {} : { puzzleFeedback }) };
}
