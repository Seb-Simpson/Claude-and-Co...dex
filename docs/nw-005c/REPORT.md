> Continued by [NW-005D](../nw-005d/REPORT.md): pinned final environment, Nurse-only Chapter One casting and fresh test evidence. This document records the earlier NW-005C delivery.

# NW-005C delivery report

## Scope and assembly

This separate integration branch begins at latest fetched main e36a3a3, locally merges PR #17 at 30a90dc and PR #18 at 66302f1, and preserves PR #16's explicit layout revert. Both merges were conflict-free. PR #15's Patient chase commit is not an ancestor; no Chapter 1 blockout paths returned. No PR was merged into main and neither developer's branch was overwritten.

The normal root URL now runs the actual hospital with the opening GameModule. The existing title/loading/pause/settings/save slot, renderer, physics, input and enemy constructors are reused. A small optional bed-eye metadata anchor supplies actual reclined staging; no model, collider or furniture was moved. The safe floor-card inspection introduces crouching contextually. Device denial, repeat-reader feedback and delayed environmental assistance improve discoverability without a quest tracker or new spoken lines.

Enemy suppression is now authored phase policy rather than a permanently empty spawn list. World entity metadata remains available. Enemies allocate only after the next director has verified crouch, hiding and patrol observation, installed presentation/listeners and explicitly authorized active play. Reaching the station does not authorize danger. The station stealth encounter itself is deliberately not implemented. Original horror presentation is prepared safely before AI can emit chase events, then updated only when authorized. Capture/noise provocation cannot kill the untrained player.

See AUDIT.md for repository/source state and INTEGRATION.md for exact launch, walkthrough, phase APIs and next-section integration.

## Verification to date

- Typecheck and production build passed after integration and gameplay changes.
- Unit suite: 512 passed, one optional Blender pose sampler skipped at the earlier recorded build. Additional readiness/resize coverage is tracked in the final results below.
- Normal title-to-station keyboard/mouse route passed (3.5m automation wall time). Test positioning helpers throw if called. Only ordinary input changes the player/camera; read-only diagnostics supply observations/semantic targets. Card-first order, real crouch, repeated reader attempts, physical door traversal,106 handle, distant Nurse, sprint/provocation and safe station handoff passed. This is automated play, not a claimed human playthrough.
- Three real minutes of safe104 dwell followed by physical exploration passed (4.1m total test): no hostile body/capture, stable collider count, first locked-door line, denial without card, pause during dialogue and puzzle restart.
- Literal `/` startup with no QA bridge or development harness passed (41.4s): existing NewGame/menu, actual world, awakening skip and gameplay UI.
- Raw screenshots and JSON are under evidence/. The safety dwell is wall time, not an artificial clock jump. Later input/skills progression never depends on that test wait.

## Performance and evidence limits

Chromium uses ANGLE SwiftShader. Most functional route tests explicitly set test-only pixel ratio 0.25 to keep software rendering manageable; physics/input/game clocks are unchanged. The literal normal URL test uses the shipping Low preset with no QA override. Screenshots/telemetry are marked accordingly; they do not establish real-GPU performance.

Recorded keyboard route:224 colliders, 185 draw calls, 152150 triangles, 394 resident geometries and 94 textures at the observed handoff. Sampled p95 fixed work 2.7ms, physics 0.8ms and gameplay/presentation update 3.5ms. Software frame intervals were much slower (p95 roughly 1417ms); a cold render sample reached 1844ms. The first route predated safe station presentation preparation; values are observations, not shipping frame-rate guarantees or a claim that the prior lag concern is fixed. Hardware profiling and extended human playtesting remain required.

## Outstanding voice/animation/content work

The two Shaw WAVs remain explicitly temporary synthetic timing assets, not final British performances. The camera now uses the actual bed anchor and rises before standing beside it; a body getting-out-of-bed animation is not created. The Nurse remains a nonphysical distant sighting with conservative unobserved withdrawal; an authored walk-off route is still absent. The full station stealth/hiding lesson and subsequent dangerous encounters remain next-section work. No Patient climax or Stairwell sequence is included.

Legacy sandbox browser suites that require an immediately active Patient represent a different gameplay phase; they are not evidence of this protected opening. Applicable opening, engine and cinematic suites are listed with exact outcomes below. Tests were not deleted to hide incompatible expectations; the environment visual test was adapted to the real card lock and106scripted state.

## Final command results

- `npm run typecheck`: passed.
- `npm test`: **515 passed, 1 skipped** (optional external Blender pose sampler).
- `npm run build`: passed; existing large Three/Rapier chunk advisory retained.
- `NW005_SOFTWARE_SCALE=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser -- tests/browser/nw-005c-onboarding.spec.ts -g 'keyboard route'`: **1 passed**, physical title-to-station route with positioning shortcuts disabled.
- Same command with `-g 'three minutes|literal normal'`: **2 passed**, including the real180-second safe dwell and literal root URL.
- `NW005_REAL=1 NW005_SOFTWARE_SCALE=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser -- tests/browser/nw-005b-opening.spec.ts tests/browser/foundation.spec.ts tests/browser/nw-004-systems.spec.ts`: opening3, context-loss1 and cinematic4 passed; the resize scenario failed its short assertion deadline. Display synchronization was strengthened to update stale buffer dimensions even with unchanged pixel density, with a unit regression. A native resize probe confirmed correct800×600 dimensions/aspect. The final production rerun below supersedes that failure.
- `PLAYWRIGHT_PREVIEW=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser -- tests/browser/foundation.spec.ts tests/browser/nw-005c-onboarding.spec.ts -g 'boots the renderer|context loss|literal normal'`: **3 passed (2.9m)**. Buffer800×600 and camera aspect4:3 are both asserted, plus audio, cleanup and actual root startup. The resize assertion allows30s for software-renderer trace overhead rather than removing coverage.

This verifies12 distinct applicable browser scenarios across successful runs. The full historical sandbox browser suite was not run; its immediate-Patient assumptions differ from the authored opening. The adapted NW-005A visual sweep was typechecked but not executed in this pass. No test was deleted. A first automation attempt aimed at the floor before crouching changed camera height; the route now waits for the existing crouch camera transition and aims through normal mouse input before interacting.

Additional compatibility fix: chase fallback audio now checks presentation availability dynamically, so the original horror module prepared at the station can take over without a duplicate pulse/effect layer. Unit coverage verifies a late handoff disconnects fallback nodes and preserves later original presentation.

All work is for a new draft PR. No merge to main is authorized or performed.
