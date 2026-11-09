import { validateCinematicDefinition } from './cinematics';
import type { CinematicCue, CinematicDefinition, CinematicKeyframe } from './cinematics';
import { CHAPTER_DIALOGUE } from './dialogue';
import type { ChapterDialogueId, DialogueCue } from './dialogue';
import type { ChapterSceneId } from './model';

/** Presentation-only cue vocabulary for Claude's scoped animation/audio/environment adapter. */
export const CHAPTER_CINEMATIC_CUES = [
  'c1.presentation.awakening-breath', 'c1.presentation.ventilation',
  'c1.presentation.bedside-monitor', 'c1.presentation.fixture-return',
  'c1.presentation.wristband', 'c1.presentation.corridor-movement',
  'c1.presentation.ledger-writing', 'c1.presentation.nurse-listens',
  'c1.presentation.nurse-enters', 'c1.presentation.tray-distraction',
  'c1.presentation.receiver-lift', 'c1.presentation.receiver-lower',
  'c1.presentation.release-handle', 'c1.presentation.emergency-route',
  'c1.presentation.egress-chime', 'c1.presentation.patient-emerges',
  'c1.presentation.stair-quiet', 'c1.presentation.reader-recognition',
  'c1.presentation.chapter-fade',
] as const;
export type ChapterCinematicCueId = typeof CHAPTER_CINEMATIC_CUES[number];
export const CHAPTER_CINEMATIC_DURATIONS = {
  'c1.cine.awakening': 55,
  'c1.cine.nurse-reveal': 28,
  'c1.cine.record': 42,
  'c1.cine.patient-release': 20,
  'c1.cine.ending': 38,
} as const satisfies Readonly<Record<ChapterSceneId, number>>;

type AuthoredCue =
  | { readonly atSeconds: number; readonly kind: 'dialogue'; readonly id: ChapterDialogueId }
  | { readonly atSeconds: number; readonly kind: 'animation' | 'environment' | 'sound'; readonly id: ChapterCinematicCueId };

/** Editorial timing only. No coordinates, actor staging, navigation routes or story commits. */
const TIMELINES = {
  'c1.cine.awakening': [
    { atSeconds: 0, kind: 'sound', id: 'c1.presentation.awakening-breath' },
    { atSeconds: 0, kind: 'sound', id: 'c1.presentation.ventilation' },
    { atSeconds: 0, kind: 'sound', id: 'c1.presentation.bedside-monitor' },
    { atSeconds: 6, kind: 'environment', id: 'c1.presentation.fixture-return' },
    { atSeconds: 23, kind: 'animation', id: 'c1.presentation.wristband' },
    { atSeconds: 35, kind: 'dialogue', id: 'c1.voice.intercom.awakening' },
    { atSeconds: 45, kind: 'sound', id: 'c1.presentation.corridor-movement' },
  ],
  'c1.cine.nurse-reveal': [
    { atSeconds: 0, kind: 'dialogue', id: 'c1.voice.intercom.review' },
    { atSeconds: 7, kind: 'environment', id: 'c1.presentation.ledger-writing' },
    { atSeconds: 13, kind: 'dialogue', id: 'c1.voice.protagonist.ledger' },
    { atSeconds: 17, kind: 'sound', id: 'c1.presentation.nurse-listens' },
    { atSeconds: 17, kind: 'animation', id: 'c1.presentation.nurse-enters' },
    { atSeconds: 24, kind: 'sound', id: 'c1.presentation.tray-distraction' },
  ],
  'c1.cine.record': [
    { atSeconds: 0, kind: 'dialogue', id: 'c1.voice.protagonist.signature' },
    { atSeconds: 9, kind: 'animation', id: 'c1.presentation.receiver-lift' },
    { atSeconds: 9, kind: 'dialogue', id: 'c1.voice.archive.slate' },
    { atSeconds: 16, kind: 'dialogue', id: 'c1.voice.archive.withdrawal' },
    { atSeconds: 27, kind: 'dialogue', id: 'c1.voice.archive.refusal' },
    { atSeconds: 33, kind: 'dialogue', id: 'c1.voice.protagonist.memory' },
    { atSeconds: 38, kind: 'animation', id: 'c1.presentation.receiver-lower' },
  ],
  'c1.cine.patient-release': [
    { atSeconds: 0, kind: 'animation', id: 'c1.presentation.release-handle' },
    { atSeconds: 5, kind: 'environment', id: 'c1.presentation.emergency-route' },
    { atSeconds: 5, kind: 'sound', id: 'c1.presentation.egress-chime' },
    { atSeconds: 5, kind: 'dialogue', id: 'c1.voice.intercom.release' },
    { atSeconds: 10, kind: 'animation', id: 'c1.presentation.patient-emerges' },
  ],
  'c1.cine.ending': [
    { atSeconds: 0, kind: 'sound', id: 'c1.presentation.stair-quiet' },
    { atSeconds: 8, kind: 'environment', id: 'c1.presentation.reader-recognition' },
    { atSeconds: 16, kind: 'dialogue', id: 'c1.voice.intercom.recognition' },
    { atSeconds: 30, kind: 'environment', id: 'c1.presentation.chapter-fade' },
  ],
} as const satisfies Readonly<Record<ChapterSceneId, readonly AuthoredCue[]>>;

export interface ChapterCinematicOptions {
  /** Approved assets can replace the script preview, preserving its exact identity/text. */
  readonly dialogue?: Partial<Readonly<Record<ChapterDialogueId, DialogueCue>>>;
  /** Retime to approved recordings/camera assets rather than stretching or delaying gameplay. */
  readonly durationSeconds?: number;
  readonly cueTimes?: Partial<Readonly<Record<ChapterCinematicCueId | ChapterDialogueId, number>>>;
  readonly skipBlendSeconds?: number;
}

/**
 * Binds a Chapter One timing template to an externally authored world-space camera path.
 * The caller resolves semantic map/camera anchors; this file deliberately contains no
 * hospital coordinates. It does not acquire control or alter progression/doors/entities.
 * Default speech remains not-recorded, so a production DialoguePlayer will reject it.
 */
export function createChapterCinematicDefinition(
  id: ChapterSceneId,
  camera: readonly CinematicKeyframe[],
  options: ChapterCinematicOptions = {},
): CinematicDefinition {
  const template: readonly AuthoredCue[] | undefined = TIMELINES[id];
  if (!template) throw new Error('Unknown Chapter One cinematic');
  for (const key of Object.keys(options.cueTimes ?? {})) {
    if (!template.some((cue) => cue.id === key)) throw new Error(`Cue ${key} does not belong to ${id}`);
  }
  const cues: CinematicCue[] = template.map((cue) => {
    const atSeconds = options.cueTimes?.[cue.id] ?? cue.atSeconds;
    if (cue.kind !== 'dialogue') return { ...cue, atSeconds };
    const dialogue = options.dialogue?.[cue.id] ?? CHAPTER_DIALOGUE[cue.id];
    if (dialogue.id !== cue.id || dialogue.text !== CHAPTER_DIALOGUE[cue.id].text) throw new Error(`Dialogue replacement does not match ${cue.id}`);
    return { kind: 'dialogue', atSeconds, dialogue };
  });
  // Stable sort allows deliberate retiming without depending on an editor's declaration order.
  cues.sort((a, b) => a.atSeconds - b.atSeconds);
  return validateCinematicDefinition({ id, camera, cues,
    durationSeconds: options.durationSeconds ?? CHAPTER_CINEMATIC_DURATIONS[id],
    ...(options.skipBlendSeconds === undefined ? {} : { skipBlendSeconds: options.skipBlendSeconds }),
  });
}
