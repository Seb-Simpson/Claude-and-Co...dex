# NW-007 Shared Design Contract — Revision 1

Implementation reference transcribed from the user's authoritative contract, supplied during NW-007A on 11 November 2026. Baseline: `0097264bf07a21b22ca7b5b1ac14ddaff951a046` (PR #21). NW-007A and NW-007B remain independent draft PRs; NW-007C integrates after review. No automatic merges. NW-008 character-model overhaul is separate.

## Creative and scene requirements

Cinematic, story-driven supernatural horror. First-person control, environmental interaction, vulnerability and real hiding remain. No combat, no Patient in Chapter One and no finale chase in NW-007.

1. **Room 104: Awakening.** Believable orienting, sitting and standing. Preserve the staff card, reader, intercom, Room 104 and 03:17 motif. Environmental motivation to leave; no large instructional panel.
2. **The Empty Corridor.** Remove the early static Shaw appearance. Allow quiet exploration. Use call indicators, equipment, documents, distant sounds/intercom. No visible enemy waiting for a trigger.
3. **Nurses' Station Discovery.** A discoverable clue links 104 to the larger mystery. Narrative and spatial eligibility precede the introduction; tolerate different speeds, orders and angles.
4. **Shaw's Introduction.** Audible approach from a believable unseen point through a real doorway/corridor. Purposeful panel check, record inspection and listening pause. Optional short 104 line, retaining unsettling treatment. Restrained in-engine staging, no extended control lock, visible teleport, duplicate or abrupt pursuit.
5. **First Hiding Experience.** Teach primarily by footsteps, sightlines, subtle light and contextual prompts. Station locker is the immediate option; preserve Room 105 bed. A safe opportunity precedes Shaw's routine/reposition. No unfair immediate capture.
6. **Autonomous Stealth and Escape.** The existing Encounter Director releases the same physical Nurse to genuine patrol, navigation, LOS, sound investigation, search, directional trolley cover, both hiding choices, witnessed-entry memory and fair capture. Meaningful escape choices; no impossible player knowledge.

## Director ownership

- **Narrative Director:** story milestones, clue discovery, scene eligibility/progression and necessary checkpoint state.
- **Existing Encounter Director (extended):** authored entrance/actions, initial hiding opportunity, AI handoff and completion. Preserve actor identity, collision capsule, navigation and detection rules.
- **Experience Coordinator:** lightweight typed ownership, conflict prevention, cancellation/restoration and future atmosphere/tension extensibility. No adaptive/generative horror framework.
- **Atmospheric cues:** small deterministic sound/light/environment event interface; no full Tension Director.

## Animation requirements

Claude supplies exact clip names, durations, loop/one-shot mode, entry/exit poses, root-motion assumptions, required target and fallback for every new animation. Suggested categories are idle/breathing, walk, turn/look, panel check, records, alert/listen, investigation and capture. **Categories are not clip names.** Do not invent asset paths or animation names.

Gameplay navigation remains authoritative; animation cannot translate the actor through the level. Preserve one Nurse and her collision capsule. Use semantic bindings, safe loading/animation fallbacks, and release textures, skeletons and materials. NW-007A must run with current assets while optional NW-007B assets are pending.

## Ownership

Codex owns restart/lifecycle, directors/coordinator, triggers, movement/awakening, contextual UI, capture/retry and gameplay tests. Do not edit Blender sources, character geometry or material authoring.

Claude owns Nurse animation/visual assets, cinematic dressing, compatible audio/visual assets, semantic asset bindings and pipeline verification. Do not edit gameplay director logic. Both start from the same verified baseline, on separate branches.

## Reliability and presentation

Fix the reported obsolete Room 104 / incorrect clock / missing-card retry root cause before expanding gameplay. Verify New Game, Continue, Retry, five consecutive captures/retries, correct assets/03:17/card/checkpoints, no duplicate actors/stale worlds/resource leaks/progression softlocks.

Use restrained movement, actual footstep feedback, Reduced Motion, minimal prompts, no permanent instruction-heavy HUD, a short atmospheric Nurse-specific capture and polished quick retry. Preserve fair stealth.

## Acceptance and reporting

The normal route must work from New Game through completion; quiet exploration and purposeful Shaw staging must precede genuine hiding/stealth. Awakening and capture must visibly improve, instructions reduce and retries remain correct. Automated tests and an actual human playtest are required for overall NW-007 acceptance. Do not substitute automation for human review or claim missing final assets are finished.

Provide implementation, state/scene transitions, exact interfaces/animation hooks, tests, screenshots/recording where supported, limitations and play/integration instructions. Use existing assets now. Ambiguities use the smallest reversible documented choice. Keep A/B drafts separate and unmerged.
