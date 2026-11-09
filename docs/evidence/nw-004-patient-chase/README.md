# Patient chase increment — actual verification

This is **isolated systems QA**, not the approved hospital route or a completed
Chapter One playthrough. The test page uses temporary geometry, a labelled model
proxy and diagnostic alarm tones. Production camera animation, voice recordings,
world bindings and full chapter integration remain outstanding.

The complete intended sequence, production beats, exact APIs and interface
requirements are in [PATIENT-CHASE.md](../../nw-004/PATIENT-CHASE.md).

## What ran

- `npm run typecheck`: pass.
- `npm test`: 469 passed; one optional pose-export test skipped.
- `npm run build`: pass; existing large Three/Rapier chunk warning remains.
- Final Chromium run of `nw-004-patient-chase.spec.ts` and `nw-004-systems.spec.ts`:
  **6/6 passed in about one minute**, including both Patient routes and previous
  camera/input/audio-clock/cleanup checks.
- `git diff --check`: pass.

Browser: installed Chromium, ANGLE SwiftShader software WebGL, 1366×768 viewport,
pixel ratio capped at .75. This is not ordinary laptop GPU performance evidence.
No hospital or Claude-owned source/asset file was modified.

## Confirmed behavior

The north-route browser test starts from a real before-Patient core checkpoint,
opens the mechanism once, skips the reveal through the real camera lease, and
activates a single physical Patient. A spatial environmental alarm initially
produces investigation with `lastKnownPlayer: null`. The Patient navigates around
an actual divider; only genuine sight starts pursuit. The player then moves using
the existing input/motion/physics controller around cover, breaks contact and
reaches the safe exit. Real gate collision and the exit aperture checks settle
escape, retaining the Patient capsule/model behind the barrier.

The capture/retry test lets the Patient approach and capture through the real
grace/dwell rules. The host fixture's checkpoint transaction restores the player,
capture flag, door/gate, solved puzzle/handle, preceding story facts, reveal flag
and dormant actor. The next attempt skips its fresh reveal, then escapes through
the other branch. There are no active-enemy teleports or forced pursuit states.
QA route assistance produces normal player input following valid navigation;
it does not assign player positions during pursuit.

QA shortens loss/recovery to expose a search cycle in this small fixture
(`loseSightSeconds .35`, `lostTargetSeconds .15`, `recoverySeconds .6`).
Investigation/search, pursuit speed 4.1 m/s, capture grace 1.2 s, dwell .6 s and
capsule dimensions retain Patient defaults. These timings are not approval of
the final hospital difficulty. Unit tests also cover unseen hiding, witnessed
entry, blocked routes, sounds, stale callbacks and failing presentation/restore.

## Recordings and measurements

| Artifact | Actual content |
| --- | --- |
| [North-route recording](patient-north-route.webm) | Alarm investigation, navigation/pursuit, corner loss and physical escape |
| [Capture/retry recording](patient-capture-retry.webm) | Real capture, restored prepared state, second attempt and south-route escape |
| [Pursuit screenshot](patient-real-navigation-and-pursuit.png) | Real first-person QA movement during the pursuit |
| [Capture screenshot](patient-real-capture.png) | Proxy at its genuine capture position |
| [Safe exit screenshot](patient-safe-physical-exit.png) | Physical containment after north escape |
| [Retry exit screenshot](patient-retry-south-escape.png) | Successful second attempt |
| [North raw measurements](patient-north-escape-evidence.json) | Actual observed positions, events, navigation calls, resources and frame profiler |
| [Retry raw measurements](patient-capture-retry-south-evidence.json) | Before/captured/restored/escaped state and resource comparisons |

The videos are image recordings; they do not include system audio. They are
short automated QA runs, not a full chapter recording or first-time pacing test.

Final measured values:

| Metric | Observation |
| --- | --- |
| Engine/canvas | One throughout |
| Collider instances | 5 prepared → 6 active → 5 restored → 6 active/settled |
| Renderer geometries / textures | 1 / 1 prepared → 7 / 1 active → 1 / 1 restored → 7 / 1 active |
| Navigation queries | 94 for north attempt; 147 total for capture/retry/south run |
| Fixed work, p50 | About .8 ms |
| Fixed work, p95 | About 17–18 ms |
| Cold fixed-work maximum | About 203–242 ms; still requires production/hardware profiling |

The first implementation performed a global negative A* query at the sealed exit,
causing roughly 500–556 ms cold fixed work. It was replaced with bounded actual
aperture LOS/capsule checks plus the producer's explicit verification of every
landing portal and actor door permission. A max-node `null` path cannot prove
disconnection. The final exit needs physical evidence; a boolean-only door or a
distant occluding corner fails. This removes that unnecessary exit search without
changing active enemy navigation or allowing geometry bypass.

Cold navigation work remains measurable in this software environment. There is
no claim of zero frame spikes, a finished hardware performance budget or a long
chapter memory soak. The final map must still be profiled and playtested.

## Corrections found during browser testing

Initial tests failed because the QA profile cut investigation off after two
seconds, before the Patient could reach the divider. Default investigation/search
settings restored credible behavior. A second run exposed the fixture's restore
query treating the player's own capsule as an obstruction; restore now uses the
real character's self-excluding `canOccupy()` query. The escape test also now
starts fleeing before screenshot readback, since the AI continues advancing during
capture. No navigation, pursuit, capture, checkpoint or escape assertion was removed.

## Reproduce

```sh
npm ci
npx playwright install chromium ffmpeg
npm run dev
```

Open `http://localhost:5173/tests/browser/harness/patient-chase.html`. Prepare,
unlock audio, click the scene, press E to confirm, then move with WASD/Shift.
Use the labelled QA branch buttons only for assisted testing. Retry restores the
prepared checkpoint after capture. This URL is a test harness, not Chapter mode.

Automated checks:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser -- tests/browser/nw-004-patient-chase.spec.ts tests/browser/nw-004-systems.spec.ts
```

The executable can be omitted when using Playwright's installed Chromium.
