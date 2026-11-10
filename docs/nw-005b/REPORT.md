# NW-005B implementation report

## Delivered scope

Room104-specific content now composes the existing GameModule, first-person controller, physics, authoritative interaction ray, cinematic camera lease, dialogue transport, mixer, settings and frontend save slot. It implements a short awakening, card possession/pickup, a locked exit and reader puzzle, exactly two one-shot Shaw intercom cues, physical handle feedback, a Room106 attempt and an optional Nurse sighting before the station handoff. No player journal, mission HUD, new menu/controller, Patient chase or Chapter One expansion is included.

The implementation is independent of unfinished world imports. See AUDIT.md for the pre-code repository audit, INTEGRATION.md for exact exports, launch/walkthrough, lifecycle and producer requirements, and VOICE.md for dialogue direction and replacement instructions. The opening public barrel is `src/gameplay/opening/index.ts`.

## Files and asset ownership

New gameplay content and presentation live under `src/gameplay/opening/`. Dedicated tests/fixture live under `tests/opening/` and `tests/browser/harness/room104-opening.*`, with `tests/browser/nw-005b-opening.spec.ts`.

Small existing-system extensions affect gameplay input/interactions/runtime, integration application/testing, frontend saves/frontend wiring and pause checkpoint wording. The main menu's design, assets and controls are retained. No source files under world, atmosphere, horror or contracts, no Blender assets/pipeline, and no main.ts edits are included. PR #15 is untouched.

New assets: two original decorative SVGs, two explicitly temporary local FLite WAVs with source/license notices. Existing fonts and the existing Nurse GLB are reused. No external runtime service or paid API is required.

## Verification already completed

On the independent gameplay branch based on main `e36a3a3`:

- `npm run typecheck`: passed.
- `npm test`: **496 passed, 1 skipped** (the optional Blender pose-output sampler).
- `npm run build`: passed; existing large Three/Rapier chunk advisory remains.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser -- tests/browser/nw-005b-opening.spec.ts`: **3 passed** in the isolated synthetic fixture. Covers awakening/movement lock, pause/settings/skip/handoff; locked exit, denial, pickup, both cues and unlock; actual door traversal,106/Nurse, retry, station handoff, laptop viewport and disposal; existing menu/Continue/reload/NewGame.

A separate detached verification checkout combines these owned changes with Claude's published NW-005A `8e879de237de2200ff022f387383111af8b96a30`, without adding its files to this branch. In that checkout `npm run typecheck`, `npm test` (**506 passed, 1 skipped**) and `npm run build` passed. Browser compatibility results are recorded below when completed.

The route automation uses QA positioning for individual interaction stations, and real movement/collision through the exit. It is an assisted integration route, not a claimed unassisted human playthrough. Screenshots under evidence/fixture are explicitly labelled synthetic geometry, not hospital visual approval. Browser tests use Chromium/ANGLE SwiftShader and do not establish hardware GPU performance.

## Remaining limitations and integration work

1. Normal main currently lacks NW-005A semantic anchors, so it retains its prior gameplay. This branch's independent opening is available through the documented development harness. After reviewed NW-005A integration, production activation is automatic with no entry-point changes.
2. Final British Nurse Shaw voice acting is **incomplete**. Current US-accent synthetic recordings are replaceable development timing assets. They must not be described as approved performances.
3. The producer's published spawn is beside the bed. Publish `nw:opening:awakening-eye` for approved lying-in-bed camera composition. The fixture includes this pose; without it the adapter uses a short spawn-relative reclined preview. Final bed/path staging requires environment review.
4. No authored Nurse retreat route is supplied. This nonphysical sighting stays while observed and withdraws only out of view/behind occlusion. A natural walk-off requires an additional producer path. Later Nurse AI is preserved but intentionally not activated here.
5. Milestones save at exit and station after queued dialogue finishes. Before exit, retry restarts the awakening; later retries restore card/unlock/one-shot state atomically. Progress since a milestone is intentionally replayable. This is not a click-by-click autosave.
6. Low-quality browser coverage is available; real GPU performance and extended human playtesting remain unverified. All audio nodes, observers, presentation resources and physics use the existing session lifetime, with no additional RAF or AudioContext.

The draft is for integration review, not release approval. No automatic merge is performed.

## Coverage map

| Requirement | Evidence |
|---|---|
| Awakening, control handoff, skip, pause/settings | Opening Chromium test1; existing camera-lease unit/browser suites |
| Locked exit, first cue once, card pickup, reader deny/accept, second cue once, ordering | state/audio/interaction unit suites; opening Chromium test2 |
| Range, LOS, forged actions and cinematic request protection | real Rapier interaction tests |
| Door collider initialization, normal motion and traversal | interaction/fixture unit tests; opening Chromium test2 |
|106handle and optional sighting | scene unit tests; opening Chromium test2 |
| Milestone corruption/restart/card/one-shot restoration | checkpoint/save tests; opening Chromium tests2–3 |
| Subtitles, volume routing, serial speech, denied audio unlock | audio tests; browser dialogue assertions/settings journey |
| Menu/Continue/reload/NewGame, viewport, teardown | opening Chromium tests1–3; existing lifecycle tests |

The source assets and geometry are not reviewed for Claude's coding quality; verification checks functional compatibility only.
