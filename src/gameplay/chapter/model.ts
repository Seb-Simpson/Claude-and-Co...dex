/** Isolated Chapter One logic, proposal v1. No live world, camera or save-slot adapter. */
export const CHAPTER_SCHEMA_VERSION = 1 as const;
export const CHAPTER_CONTENT_REVISION = 'c1.1' as const;

export const CHAPTER_SCENES = [
  'c1.cine.awakening', 'c1.cine.nurse-reveal', 'c1.cine.record',
  'c1.cine.patient-release', 'c1.cine.ending',
] as const;
export type ChapterSceneId = typeof CHAPTER_SCENES[number];
export const CHAPTER_CHECKPOINTS = [
  'chapter1.start', 'chapter1.after-nurse', 'chapter1.after-records-power',
  'chapter1.before-patient', 'chapter1.complete',
] as const;
export type ChapterCheckpointId = typeof CHAPTER_CHECKPOINTS[number];
export const CHAPTER_CLUES = [
  'wristband', 'current-intake', 'unanswered-call', 'station-direction',
  'night-ledger', 'release-procedure', 'withdrawal-record', 'panel-schematic',
  'bridge-annotation', 'nurse-note', 'patient-chart',
] as const;
export type ChapterClueId = typeof CHAPTER_CLUES[number];
export const CHAPTER_OBJECTIVES = [
  'orient', 'station', 'survive-nurse', 'release-procedure', 'arm-power',
  'local-release', 'stairwell', 'complete',
] as const;
export type ChapterObjectiveId = typeof CHAPTER_OBJECTIVES[number];

export interface ChapterPuzzleState {
  readonly reserveEnabled: boolean;
  readonly observationLink: 'bridged' | 'isolated';
  readonly destination: 'ward' | 'lift' | 'egress';
  readonly breaker: 'ready' | 'tripped';
  readonly busArmed: boolean;
  readonly handleLocation: 'incident-pack' | 'held' | 'installed';
  readonly releaseConfirmed: boolean;
  /** Saturated at two: enough for graduated hints, never an unbounded event log. */
  readonly failedAttempts: 0 | 1 | 2;
}

export type PuzzleCommand =
  | { readonly type: 'set-reserve'; readonly enabled: boolean }
  | { readonly type: 'set-observation-link'; readonly value: 'bridged' | 'isolated' }
  | { readonly type: 'select-destination'; readonly value: 'ward' | 'lift' | 'egress' }
  | { readonly type: 'reset-breaker' }
  | { readonly type: 'engage' };
export type PuzzleFeedback = 'configured' | 'reset' | 'no-reserve' | 'breaker-tripped'
  | 'overload' | 'no-egress-supply' | 'bus-armed' | 'already-armed';
export interface PuzzleResult {
  readonly state: ChapterPuzzleState;
  readonly feedback: PuzzleFeedback;
}

export interface ActiveChapterScene {
  readonly id: ChapterSceneId;
  /** Stale completion/interruption callbacks cannot settle a later playback attempt. */
  readonly token: number;
}
export interface ChapterState {
  readonly schemaVersion: typeof CHAPTER_SCHEMA_VERSION;
  readonly contentRevision: typeof CHAPTER_CONTENT_REVISION;
  readonly clues: readonly ChapterClueId[];
  readonly completedScenes: readonly ChapterSceneId[];
  readonly activeScene: ActiveChapterScene | null;
  readonly nextSceneToken: number;
  readonly stationReached: boolean;
  readonly nurseSurvived: boolean;
  readonly panelVisited: boolean;
  readonly stairReached: boolean;
  readonly puzzle: ChapterPuzzleState;
  readonly viewedHintLevel: 0 | 1 | 2;
  /** Earned boundaries, in authored order. These are core state, not live-world saves. */
  readonly checkpoints: readonly ChapterCheckpointId[];
  /** Non-null only immediately at a semantic safe-boundary commit. */
  readonly atSafeBoundary: ChapterCheckpointId | null;
}

/** Future adapters must validate physical reach, safety and collision before these inputs. */
export type ChapterCommand =
  | { readonly type: 'inspect'; readonly clue: ChapterClueId }
  | { readonly type: 'reach-station' }
  | { readonly type: 'request-scene'; readonly id: ChapterSceneId; readonly safe: boolean }
  | { readonly type: 'settle-scene'; readonly token: number; readonly outcome: 'completed' | 'skipped' | 'interrupted' }
  | { readonly type: 'survive-nurse'; readonly method: 'hiding' | 'quiet-route'; readonly contactBroken: boolean; readonly atReviewDesk: boolean }
  | { readonly type: 'collect-operating-handle' }
  | { readonly type: 'visit-panel' }
  | { readonly type: 'puzzle'; readonly command: PuzzleCommand }
  | { readonly type: 'install-operating-handle' }
  | { readonly type: 'commit-checkpoint'; readonly id: ChapterCheckpointId; readonly safe: boolean }
  | { readonly type: 'confirm-release'; readonly safe: boolean }
  | { readonly type: 'reach-stair-landing'; readonly safe: boolean }
  | { readonly type: 'read-hint' };

export type ChapterEffect =
  | { readonly type: 'objective-completed'; readonly id: ChapterObjectiveId }
  | { readonly type: 'scene-requested'; readonly scene: ActiveChapterScene }
  | { readonly type: 'scene-interrupted'; readonly scene: ActiveChapterScene }
  | { readonly type: 'checkpoint-committed'; readonly id: ChapterCheckpointId }
  | { readonly type: 'activate-entity'; readonly entity: 'nurse' | 'patient' }
  | { readonly type: 'power-armed' }
  | { readonly type: 'release-confirmed' };
export interface ChapterResult {
  readonly state: ChapterState;
  readonly accepted: boolean;
  readonly reason?: string;
  readonly effects: readonly ChapterEffect[];
  readonly puzzleFeedback?: PuzzleFeedback;
}
