# NW-007A — verification and integration handoff

## Scope and status

The gameplay implementation follows [Shared Design Contract Revision 1](SHARED-DESIGN-CONTRACT.md). The complete public-game route and thirteen regressions passed; overall NW-007 acceptance is **not signed off**. Independent human playtesting, real-GPU verification and NW-007C integration of Claude's presentation remain outstanding.

Baseline: `0097264bf07a21b22ca7b5b1ac14ddaff951a046` (PR #21, includes #19/#20). Branch: `feat/nw-007a-cinematic-gameplay`. Draft [PR #23](https://github.com/Seb-Simpson/Claude-and-Co...dex/pull/23) targets `feat/nw-006b-nurse-stealth`. No merge, PR #15 integration, Patient activation, later chase, Blender edit or layout redesign.

## Implemented

- Canonical asset lifetime across New Game, Continue and Retry, with transactional world setup and no playable procedural fallback after critical browser asset failure.
- Quiet initial corridor; physical station register discovery makes Shaw's authored arrival eligible. The existing Encounter Director controls one physical Nurse through entrance, panel/record/listening routine, nonlethal hiding opportunity, existing autonomous stealth and escape.
- Narrative Director with ordered milestones, validated/migrated checkpoint state, and an Experience Coordinator for exclusive camera/Nurse/dialogue authority, interruption and clean attempt disposal. Small typed atmosphere cue interface; no adaptive Tension Director.
- Smooth relative bed/orient/sit/stand camera transport, safe skip/handoff, actual movement footsteps and restrained optional walking motion using existing settings/mixer. Reduced Motion remains available.
- Brief Nurse-specific captured focus/cloth/fade and accessible public checkpoint Retry. Presentation never revives the captured player; retry rebuilds the entire attempt.
- Minimal contextual prompts and brief printed feedback using existing UI assets/fonts. No permanent instruction rail, objective journal, menu redesign, combat or replacement controller.
- Optional producer animation metadata/hooks and a semantic-name shim for the actual published NW-007B station bindings. Existing assets work independently; new B clip/audio playback is not silently enabled.

Exact APIs, six-scene transitions, state diagram, cancellation, checkpoint migration and NW-007C steps: [DIRECTORS.md](DIRECTORS.md). Audit/root-cause detail: [IMPLEMENTATION.md](IMPLEMENTATION.md). Play instructions: [PLAY.md](PLAY.md).

## Restart regression: reproduced root cause

New Game/Continue preloaded binary sources, but the old one-shot cache was consumed. Retry then fetched again. A failed later room/station request entered a catch-and-warn path that reported a ready game with obsolete procedural visuals. The Blender card was absent; the clock's 03:17 artwork belongs to the canonical set, not a saved clock timer. World ID/collider counts alone missed this visual replacement.

A new browser regression **failed on the original baseline before production changes**: room, station and physical card initially existed, then disappeared after restart when later requests were blocked. [Original failure](evidence/baseline-failure/expected-failure.md). The original human network trace is unavailable, so its exact transport failure is not asserted.

Every parser now receives a fresh copy of retained immutable source bytes. Scene objects, pickup visibility and gameplay state are never cached across attempts. Critical loading errors reject setup; loaded owners are released. World/model edits are limited to this lifecycle boundary; binary art, textures, lightmaps, geometry and collider definitions are unchanged. This fix was committed/verified in Phase 1 before cinematic expansion (`5cd707e`).

## Verified automated results

| Check | Actual result |
| --- | --- |
| `npm run typecheck` | Passed. |
| `npm test` | **584 passed, 1 existing optional Blender sampler skipped; 72 files passed, 1 skipped.** |
| `npm run build` | Passed; existing large Three/Rapier chunk advisory remains. |
| Focused real-geometry station and B-name adapter tests | **17 passed.** |
| Later asset-request failure regression, current code | Passed. No ready legacy room. |
| Five actual AI captures + public UI retries + New Game/card pickup | Passed in **5.8 minutes**. No force-capture, actor writes or live phase mutation. |
| Fresh-page Continue of a completed milestone, then New Game | Passed in **45.5 seconds**. |
| Clue-gated discovery/arrival/pause fixture | Passed. Explicit diagnostic placement fixture, separate from the input-only walkthrough. |
| Unseen Room 105 bed entry after real sprint noise | Passed in **3.2 minutes**; twelve simulated seconds concealed, Nurse searched the heard position. |
| Retained public-game regressions and complete input-only route | **13 passed (32.9 minutes).** |
| Captured transport skip and native Space-key Retry after the keyboard guard fix | **1 passed (1.5 minutes).** |

All existing unit tests remain. Existing opening/browser tests were adapted where the shared contract intentionally removes the corridor Nurse. This is selected applicable browser coverage, not a claim that every historical sandbox spec was run.

Exact current browser commands (Chromium software rendering):

```sh
NW005_SOFTWARE_SCALE=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser -- tests/browser/nw-006b-encounter.spec.ts -g 'input-only normal game|autonomous stealth: real sprint'

NW005_SOFTWARE_SCALE=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser -- tests/browser/nw-006b-encounter.spec.ts tests/browser/nw-007a-reliability.spec.ts tests/browser/nw-007a-scenes.spec.ts -g 'input-only normal game|canonical assets survive|five real Nurse|a fresh page Continues|production discovery fixture'

NW005_REAL=1 NW005_SOFTWARE_SCALE=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser -- tests/browser/nw-006b-encounter.spec.ts tests/browser/nw-005b-opening.spec.ts tests/browser/foundation.spec.ts tests/browser/nw-005c-onboarding.spec.ts tests/browser/room104-prototype.spec.ts tests/browser/nw-005d-readability.spec.ts -g 'input-only normal game|awakening locks|locked door, two|saved station Continue|boots the renderer|context loss|literal normal|playable game shows|obsolete procedural|normal title-to-station|three minutes|assisted visual inspection|shipping Low checkpoint'
```

The first command yielded **1 passed, 1 failed (15.3 minutes)**: unseen bed entry passed; the old combined sightseeing route was captured between its prompt and delayed input. The second yielded **4 passed, 1 failed (18.2 minutes)**: reliability/discovery all passed, while the bot doubled back into pursuit. Those failures remain in [route-attempt evidence](evidence/final-route-attempt/) and [the core run log](evidence/final-reliability/run.log). The final normal route removes the unnecessary backtrack and, if caught, requires real public Retry before completing escape. Production AI detection, capture grace, navigation and memory were not weakened to satisfy the bot. The third command then passed all **13** cases, including both exploration orders, three minutes of safe exploration, actual plain-root startup, native Low, audio unlock, WebGL cleanup, and the complete opening/encounter/escape/Continue/New Game route. [Public run log](evidence/final-public/run.log).

Phase 1 evidence is retained separately: **565 unit passes/1 skip, three reliability browser passes and nine preserved-baseline browser passes**, including the earlier input-only route. Those are pre-cinematic proofs, not claimed as final six-scene acceptance. [Baseline route](evidence/baseline-normal-route/) · [Initial five-cycle evidence](evidence/reliability/).

## Resource and performance observations

The **current** five-cycle run reports the same **303 geometries, 84 textures, 258 draw calls and 155,719 triangles** in each fully rendered capture snapshot. Each restored attempt has **230 colliders**, one canonical room, one station, one physical card and one Nurse visual. UUIDs change each attempt. Saved possession/one-shot/unlock flags and narrative step 6 survive. New Game restores a visible usable card and locked exit. The post-initial-load fault route intercepted **zero requests**; no page errors were recorded.

[Raw current five-cycle telemetry](evidence/final-reliability/nw-007a-reliability-five-r-71c71-New-Game-resets-fresh-state/five-retries.json) · [Room 104 after five retries](evidence/final-reliability/nw-007a-reliability-five-r-71c71-New-Game-resets-fresh-state/03-room104-after-five-retries.png) · [Capture UI](evidence/final-reliability/nw-007a-reliability-five-r-71c71-New-Game-resets-fresh-state/01-real-capture.png).

These finite observations are evidence against resource growth over five attempts, not proof that every leak/spike is absent. Ready snapshots can precede the first new-world render; the comparison uses rendered capture frames, not transient loading-scene counters.

Passing [unseen-bed telemetry](evidence/unseen-bed/unseen-bed.json) records a median frame interval of **883.4 ms**, fixed work **1.2 ms**, physics **0.3 ms**, presentation update **0.5 ms**, maximum render submission/warmup **2138.4 ms**. The software GPU, tracing and recording are slow. This is **not** a hardware frame-rate benchmark or a verified resolution of the historic laptop slowdown. No `/dev/dri`/real GPU is available. Most functional cases change only renderer pixel ratio to 0.25; simulation, navigation, AI and input timings remain unchanged. Native Low cases explicitly assert the shipped 0.75 ratio. No new renderer, loop or AudioContext is added.

## Known limitations and next integration

- Claude's separate [PR #22](https://github.com/Seb-Simpson/Claude-and-Co...dex/pull/22), inspected at **`dbebd306dbe52e9f7142873995b7935ae83a502b`**, is not merged/cherry-picked. Its named stance/record nodes are supported, but bespoke panel/record/capture clip playback, producer durations and new audio cues await NW-007C. Current actors use baseline locomotion/observation states. Close-up Nurse mesh/head/cap presentation remains visibly imperfect; this branch does not author character geometry or start NW-008.
- The two Room 104 voice recordings remain explicitly temporary. No final voice performance is claimed; no new production asset or paid service is introduced. Existing image-based ink/rule UI and fonts are reused.
- No independent human playtest has occurred. Automated navigation/interaction evidence does not certify subjective pacing, clue discoverability or atmosphere. A first-time human review must assess those, especially the physical register and escape readability.
- Source bytes persist across menu returns for the frontend lifetime, trading bounded CPU memory for reliable retry; disposal clears them. A truly unavailable critical set gives an error, not old art. Corrupt retained bytes require a fresh page to refetch; no offline/service-worker installation is added.
- Browser recordings are silent automation evidence. They must not be presented as a human or real-GPU playthrough.

Launch through the normal root URL with `npm install && npm run dev`; New Game → Enter ward. No harness is needed. [PLAY.md](PLAY.md) gives the complete sequence, controls and retry/Continue behavior. Keep this and the asset draft separate and unmerged pending review.


## Complete normal-game walkthrough evidence

[Silent recording](evidence/cinematic-normal-route/video.webm) · [Raw phase snapshots](evidence/cinematic-normal-route/normal-route.json) · [Authored station action](evidence/cinematic-normal-route/01-authored-station.png) · [First locker concealment](evidence/cinematic-normal-route/02-first-locker-hide.png) · [Trolley](evidence/cinematic-normal-route/03-real-trolley-cover.png) · [Escape](evidence/cinematic-normal-route/04-escape.png).

This is the normal frontend/root game with the read-only QA snapshot bridge enabled. Position/aim shortcuts throw if called; movement, looking, interacting, hiding, pause, capture, public Retry and menu actions use normal inputs. It begins with New Game/full awakening, solves the door-first card puzzle, reads the physical register, observes the authored routine, hides in the locker and enters real stealth. The bot then makes one route mistake and is captured through actual sight/pursuit: the snapshot records vision knowledge, about 0.62 m separation and capture about eight simulated seconds after the first chase event. The public Retry restores the stealth checkpoint; the player escapes, saves step 7 with no remaining director leases, returns to menu, Continues the completed state and starts New Game again. There were no page errors. This is **one capture and recovery**, not a claim of a death-free human stealth run.

The recording is 800×450, 8 fps, **10:22.5** long, silently re-encoded from Playwright's 25 fps capture without cuts or speed changes (the frame-cadence rounding removes 0.06 seconds at the end). Most functional rendering uses the documented 0.25 pixel ratio for SwiftShader; native Low visual evidence is separate. Its wall duration must not be treated as an estimated first-time-player duration.

The final unit/typecheck/build run after the capture-keyboard guard change again passed **584 tests / 1 existing skip** and the production build. The keyboard follow-up verifies Escape advances the active captured transport and that Space activates the focused Retry button once the animation releases input. The guard now handles skip keys only while the captured transport is active; it no longer suppresses native button activation forever.


Final keyboard follow-up command:

```sh
NW005_SOFTWARE_SCALE=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser -- tests/browser/nw-006b-encounter.spec.ts -g 'real capture after a forgiving first alert'
```

**1 passed (1.5 minutes)** after the one-line skip-key guard correction; the prior 13-case public batch remained frozen until completion. [Keyboard run log](evidence/keyboard-retry/run.log) · [Actual capture and restored state](evidence/keyboard-retry/capture-retry.json). Across these final runs, **19 distinct selected Chromium scenarios passed** (13 public regressions, three reliability cases, discovery, unseen-bed concealment and keyboard capture/retry). Earlier failed bot attempts remain documented and are not counted as passes. Representative screenshots are retained with the complete logs/explicit JSON outputs; redundant view captures are omitted from the commit.
