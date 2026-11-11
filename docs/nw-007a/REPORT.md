# NW-007A verification and handoff

## Scope

**Phase 1 verified; remaining NW-007 implementation in progress.** The authoritative Shared Design Contract Revision 1 has now been supplied. The six-scene/director/presentation work will continue on this same branch after the verified restart fix; no Claude assets are required to begin that work.

Baseline: `0097264bf07a21b22ca7b5b1ac14ddaff951a046` (PR #21, containing PRs #19/#20). Branch: `feat/nw-007a-cinematic-gameplay`. Draft targets `feat/nw-006b-nurse-stealth`. No merge and no PR #15 integration.

## Verified cause and correction

New Game/Continue preloaded binary sources; Retry consumed that one-shot cache and attempted fresh network loads. Failure/timing out silently published procedural Room 104/Station visuals. The physical access card was missing because it belongs to the Blender set. A browser regression fails on the original code and passes after the fix. See [implementation details](IMPLEMENTATION.md) and [original failure evidence](evidence/baseline-failure/expected-failure.md).

All entry paths now parse fresh scene instances from retained immutable asset bytes. Critical canonical-world failures reject setup; loaded owners are rolled back. This is a loader/lifecycle correction, not a missing-card respawn or reuse of stale Three.js scenes. Models, textures, lightmaps, layout, collision metadata and canonical clock artwork are unchanged.

## Commands and results

- `npm run typecheck` — passed.
- `npm test` — **565 passed, 1 skipped; 67 files passed, 1 skipped.** The skip is the existing optional Blender sampler. All previous unit tests retained.
- `npx vitest run tests/encounters/asset-lifetime.test.ts tests/encounters/canonical-world.test.ts tests/frontend/services.test.ts` — **23 passed**.
- `npm run build` — passed; existing Three/Rapier chunk-size advisory.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser -- tests/browser/nw-007a-reliability.spec.ts` (original one-test baseline repro) — **failed as intended** before the runtime fix; 1 passed after the fix.
- `NW005_SOFTWARE_SCALE=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser -- tests/browser/nw-007a-reliability.spec.ts` — **3 passed (6.3 minutes)**: original later-request failure regression, five actual AI capture/UI retry cycles followed by New Game, and fresh-page Continue of a completed milestone followed by New Game.
- `NW005_REAL=1 NW005_SOFTWARE_SCALE=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser -- tests/browser/nw-006b-encounter.spec.ts tests/browser/room104-prototype.spec.ts tests/browser/foundation.spec.ts tests/browser/nw-005b-opening.spec.ts tests/browser/nw-005c-onboarding.spec.ts -g 'input-only normal game|playable game shows|obsolete procedural|boots the renderer|context loss|awakening locks|locked door, two|saved station Continue|literal normal'` — **9 passed (18.5 minutes)**. Includes the complete input-only baseline opening/stealth/escape/Continue route, a literal public-root launch without QA bridge, opening dialogue/card/reader/pause/restart, canonical views/obsolete query, audio unlock, resize and WebGL cleanup.

These Phase 1 runs establish the preserved baseline before cinematic changes. They do not verify the pending redesigned six scenes.

The first extended retry test reached all five actual capture/retry assertions, then failed because the automation immediately requested pointer-lock exit before waiting for Enter ward to reach `playing`. It is not counted as a passing test. The test now awaits the actual lifecycle state before pausing. See its [retained error context](evidence/retry-exploration/automation-pause-race.md).

## What the new tests measure

Unit tests protect immutable source ownership, mutation isolation, six repeated reads without another fetch, concurrent read deduplication, retry after HTTP failure, cache release/generation invalidation, failure of either canonical visual set, missing card bindings, transactional setup cleanup and idempotent disposal.

The resource-fault browser test uses the actual frontend/game and blocks later canonical asset retrieval after initial successful loading. Its diagnostic restart call isolates the original lifecycle fault. Separate capture scenarios exercise real Nurse AI and the public retry button; no force-capture or actor-position writes are used in those scenarios. Saved checkpoint fixtures are explicitly identified as fixtures, not represented as a new full playthrough.

A canonical scene check counts the room, station, physical card and one Nurse model, compares graph shape across attempts and verifies new object UUIDs. A saved acquired card must remain hidden; New Game must show a fresh card and reset unlock/voice flags. GPU resource observations and scene/collider counts are finite-run checks, not proof of absence of every memory/listener leak.

## Capture/retry measurements

The five real capture snapshots each report **303 renderer geometries and 84 textures**; all five restored attempts report **230 colliders**, one canonical room, one station, one physical card and one Nurse model. Every restored object UUID differs from the previous attempt. The saved acquired card remains hidden, and New Game restores a visible card and a locked exit. The post-initial-load asset-fault route intercepted **zero requests** during those retries/New Game: parsers used retained source bytes. No page errors were recorded.

Ready-state snapshots can precede the next rendered world frame (some therefore report the loading scene's 1 geometry/1 texture); those samples must not be interpreted as a measured GPU allocation reduction. The 303/84 comparison uses the fully rendered capture snapshots. This is evidence against growth over five attempts, not a long-session leak or hardware-performance certification.

[Raw five-cycle telemetry](evidence/reliability/nw-007a-reliability-five-r-71c71-New-Game-resets-fresh-state/five-retries.json) · [Real capture UI](evidence/reliability/nw-007a-reliability-five-r-71c71-New-Game-resets-fresh-state/01-real-capture.png)

## Limitations

- Remaining NW-007 phases are in progress using the now-supplied shared contract. Quiet opening, six new scenes, Narrative Director/Experience Coordinator, new awakening/head-bob and new capture scare/UI are not claimed.
- Existing Room 104 voice assets are temporary. No new animation/audio asset path or clip name was invented.
- Chromium uses ANGLE SwiftShader; there is no real GPU (`/dev/dri` unavailable). Most functional routes reduce only renderer pixel ratio to 0.25 via the QA bridge; game input, fixed-step simulation, physics, navigation and AI clocks remain real. Real-GPU performance and the historic laptop lag report remain unverified.
- No independent human playtest has occurred. Browser recordings, when present, are silent automation evidence.
- Resident source bytes intentionally persist across menu returns for the application lifetime; frontend disposal clears them. This uses bounded CPU memory for the current eight binary asset URLs, not persistent GPU scenes.
- A genuinely unavailable/corrupt canonical set now produces the existing error presentation instead of a misleading ready game. An uncached network/HTTP failure can recover when subsequent retrieval succeeds. A corrupt retained source requires a page reload to retry from a fresh byte store. No offline installation/service worker is added.

## Launch and next integration

See [PLAY.md](PLAY.md). Use the normal root route, New Game/Continue, Enter ward; no harness required.

Continue this same branch/PR under Shared Design Contract Revision 1; extend the existing Encounter Director/cinematic transport using its agreed scenes and ownership. Claude's pending assets should be bound through documented optional semantic hooks once their actual names and manifests exist. Do not merge automatically.
