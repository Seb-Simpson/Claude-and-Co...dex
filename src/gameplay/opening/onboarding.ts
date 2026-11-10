/** Permanent chapter casting policy; the Patient remains available to later-game systems only. */
export const CHAPTER_ONE_ENTITY_TYPES = ['nurse'] as const;
import type { OpeningState } from './state';
export type OnboardingPhase = 'awakening' | 'room-104' | 'corridor' | 'stealth-onboarding' | 'active-play';
export type SurvivalSkill = 'crouch' | 'hide' | 'observe-patrol';
export interface OnboardingGate {
  readonly phase: OnboardingPhase;
  readonly safe: boolean;
  sync(state: OpeningState, exited: boolean): void;
  recordSkill(skill: SurvivalSkill): void;
  markPresentationReady(): void;
  /** Trusted next-section director only; no timer/position/input shortcut enables danger. */
  beginActivePlay(): boolean;
}
export function createOnboardingGate(): OnboardingGate {
  let phase: OnboardingPhase = 'awakening';
  const skills = new Set<SurvivalSkill>();
  let presentationReady = false;
  return {
    get phase() { return phase; }, get safe() { return phase !== 'active-play'; },
    sync(state, exited) {
      if (phase === 'active-play') return;
      phase = !state.awakened ? 'awakening' : state.stationReached ? 'stealth-onboarding' : exited ? 'corridor' : 'room-104';
    },
    recordSkill(skill) { if (['crouch', 'hide', 'observe-patrol'].includes(skill)) skills.add(skill); },
    markPresentationReady() { presentationReady = true; },
    beginActivePlay() {
      if (phase === 'active-play') return true;
      if (!presentationReady || phase !== 'stealth-onboarding' || !['crouch', 'hide', 'observe-patrol'].every(s => skills.has(s as SurvivalSkill))) return false;
      phase = 'active-play'; return true;
    },
  };
}

/** Small content-specific assistance; active host time excludes pause/cinematic time. */
export function createOpeningAssistance() {
  let seconds = 0, stage = 0;
  return {
    update(dt: number, state: OpeningState): string | null {
      if (!state.awakened || state.doorUnlocked || !Number.isFinite(dt) || dt < 0) return null;
      seconds += dt;
      if (state.cardAcquired && seconds >= 35 && stage < 3) { stage = 3; return 'The reader beside the door accepts staff cards.'; }
      if (!state.cardAcquired && seconds >= 45 && stage === 0) { stage = 1; return 'The door reader is marked STAFF ACCESS.'; }
      if (!state.cardAcquired && seconds >= 100 && stage === 1) { stage = 2; return 'A staff lanyard lies on the floor beside the bed.'; }
      return null;
    },
  };
}
