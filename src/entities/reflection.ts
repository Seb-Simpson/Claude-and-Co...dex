import type { FrameContext, GameEvents } from '../contracts';

export interface ReflectionEncounterController {
  show(anchorId: string, durationSeconds: number, timeSeconds: number): string;
  hide(): void;
  fixedUpdate(frame: FrameContext): void;
  dispose(): void;
}

/** Nonphysical presentation interface. The atmosphere owner resolves anchor IDs and visuals. */
export function createReflectionEncounterController(events: GameEvents): ReflectionEncounterController {
  let sequence = 0;
  let active: { id: string; anchorId: string; until: number; durationSeconds: number } | null = null;
  let disposed = false;
  function hide(): void {
    if (!active) return;
    const encounter = active;
    active = null;
    events.emit('horror:reflection', { id: encounter.id, anchorId: encounter.anchorId, visible: false, durationSeconds: 0 });
  }
  return {
    show(anchorId, durationSeconds, timeSeconds) {
      if (disposed) throw new Error('Reflection controller disposed');
      if (!anchorId.trim() || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isFinite(timeSeconds)) {
        throw new Error('Invalid reflection encounter');
      }
      hide();
      active = { id: `nw:reflection:${++sequence}`, anchorId, durationSeconds, until: timeSeconds + durationSeconds };
      events.emit('horror:reflection', { id: active.id, anchorId, visible: true, durationSeconds });
      return active.id;
    },
    hide,
    fixedUpdate(frame) { if (active && frame.elapsedSeconds >= active.until) hide(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      hide();
    },
  };
}
