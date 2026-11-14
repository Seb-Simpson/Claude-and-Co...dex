/**
 * NW-R03 — Chapter 1 interactive devices: reusable data-driven objects (hatches, valves, padlocks,
 * cranks, documents) built on the interaction system's hold/cancel/noise primitives.
 *
 * A device declares requirements (beats, items, knowledge, flags, other devices), whether it is
 * one-time or repeatable, its hold and noise, and its consequences (Chapter 1 events, a voice line,
 * a notification). Requirements are exposed to the interaction system as requirement ids, so
 * locked devices and doors show their reason in the prompt and can't be operated.
 */
import type { InteractionHold, InteractionNoise, InteractionRequirement } from '../contracts';
import {
  applyChapter1Event, hasBeat, hasFlag, hasItem, hasKnowledge,
  type BeatId, type Chapter1Event, type Chapter1State, type ItemId, type KnowledgeId, type ProgressFlag,
} from './state';

/** Requirement ids: `beat:<id>`, `item:<id>`, `knowledge:<id>`, `flag:<id>`, `used:<device>`, `unused:<device>`. */
export type Chapter1RequirementId = `beat:${BeatId}` | `item:${ItemId}` | `knowledge:${KnowledgeId}` | `flag:${ProgressFlag}` | `used:${string}` | `unused:${string}`;

export function chapter1Requirement(state: Chapter1State, used: ReadonlySet<string>, id: string): boolean | undefined {
  const [kind, value] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)];
  switch (kind) {
    case 'beat': return hasBeat(state, value as BeatId);
    case 'item': return hasItem(state, value as ItemId);
    case 'knowledge': return hasKnowledge(state, value as KnowledgeId);
    case 'flag': return hasFlag(state, value as ProgressFlag);
    case 'used': return used.has(value);
    case 'unused': return !used.has(value);
    default: return undefined;
  }
}

export interface DeviceDef {
  readonly id: string;
  /** Prompt verb ("Turn the valve"). */
  readonly prompt: string;
  readonly requires: readonly InteractionRequirement[];
  /** One-time devices become unavailable after use; repeatable ones can be used again. */
  readonly once: boolean;
  readonly hold?: InteractionHold;
  /** `null` = silent. Omitted = the default interaction noise. */
  readonly noise?: InteractionNoise | null;
  readonly effects: readonly Chapter1Event[];
  /** Voice line requested on use (resolved by the voice director by Shaw's stage). */
  readonly voiceLine?: string;
  /** Short HUD notification on use. */
  readonly notify?: string;
  /** Journal-style text shown when a document is read. */
  readonly reads?: string;
}

/** The interactable id used for a device. */
export const deviceInteractableId = (id: string): string => `nw:inspect:gb-${id}`;

/** Requirements as the interaction system sees them (adds "already done" for one-time devices). */
export function deviceRequirements(device: DeviceDef): InteractionRequirement[] {
  return device.once ? [...device.requires, { id: `unused:${device.id}`, description: 'Already done' }] : [...device.requires];
}

export interface DeviceUseResult {
  readonly applied: boolean;
  readonly state: Chapter1State;
  readonly reason?: string;
}

/**
 * Applies a device's consequences atomically: every effect must be applied or already present, or
 * nothing changes. A one-time device that was already used is refused (duplicate-event protection).
 */
export function useDevice(device: DeviceDef, state: Chapter1State, used: ReadonlySet<string>): DeviceUseResult {
  if (device.once && used.has(device.id)) return { applied: false, state, reason: 'Already used' };
  for (const requirement of device.requires) {
    const met = chapter1Requirement(state, used, requirement.id);
    if (met === false) return { applied: false, state, reason: requirement.description };
  }
  let next = state;
  for (const effect of device.effects) {
    const result = applyChapter1Event(next, effect);
    if (result.outcome === 'rejected') return { applied: false, state, reason: result.reason };
    next = result.state;
  }
  return { applied: true, state: next };
}
