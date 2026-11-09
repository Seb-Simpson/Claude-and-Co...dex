/**
 * Subtitles for future voice lines and important sounds. Any module can call `emitSubtitle`
 * (no UI import needed); the frontend renders them when the Subtitles setting is on.
 */
export interface SubtitleLine {
  readonly text: string;
  /** Who is speaking, if anyone ("Night nurse"). */
  readonly speaker?: string;
  readonly seconds?: number;
}

export const SUBTITLE_EVENT = 'night-ward:subtitle';

export function emitSubtitle(line: SubtitleLine): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<SubtitleLine>(SUBTITLE_EVENT, { detail: line }));
}
