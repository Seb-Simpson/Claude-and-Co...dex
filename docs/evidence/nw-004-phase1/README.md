# NW-004 phase-one verification evidence

**Scope:** independent Chapter One systems and preservation of the existing
integrated game. **This is not a Chapter One playthrough or final chapter approval.**
There is no measured 20–30 minute fresh-player route or full-chapter recording yet.

Environment: managed Linux, `/usr/bin/chromium`, ANGLE **SwiftShader software
WebGL**, Playwright. No hardware laptop GPU performance claim. Install was
`npm ci` against the existing committed lock; dependency files were not changed.
Playwright's local FFmpeg recording dependency was installed with
`npx playwright install ffmpeg`.

## Commands

| Verification | Actual result |
| --- | --- |
| Baseline `npm run typecheck`, `npm test`, `npm run build` | Pass; 307 tests passed, 1 optional pose-export test skipped |
| Final implementation `npm run typecheck` | Pass |
| Final implementation `npm test` | **433 passed, 1 optional pose-export skip**; 47 passing files and 1 skipped file |
| Final implementation `npm run build` | Pass; existing large Three/Rapier chunk warning |
| `git diff --check` | Pass |
| New isolated systems browser suite | **4 passed in 22.6 seconds**, including native Web Audio synchronization |
| Selected existing-game browser preservation suite | First run **5 passed / 1 failed** in 9.6 minutes; details below |
| Isolated rerun of existing capture/restart test | **1 passed** in 2.5 minutes; no assertion/timeout changed |

Final unit suite includes every previous active test plus new meaningful coverage:
four-act semantic route, five core checkpoints, all 24 panel configurations and
selector orders, reversible failures, exploration hints, cinematic arbitration/
skip/interruption/stale handles, corrupted saves, migration, native voice-clock
simulation after stalls, actual player camera/control leases and real Rapier/A*
Nurse perception/navigation/hiding/capture/cleanup. These do not prove live story
triggers, real-map cinematics or full Save/Continue restoration.

Reproduce isolated systems checks:

```sh
npm ci
npx playwright install chromium ffmpeg
npm run typecheck
npm test
npm run build
npm run test:browser -- tests/browser/nw-004-systems.spec.ts
```

For the installed system browser, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium` before the browser command.

## Browser preservation and retained failures

The selected real-game run verified engine/Rapier/world startup, audio gesture
unlock, responsive canvas, WebGL context-loss cleanup, NW-003B New Game/title
round trips, Room 104 movement/collision/doors and **all four lockers/two beds**.
Its sixth test (existing repeated capture/restart) stalled waiting for three new
rendered frames after a restart. It remained ready at frame 46 while the 30-second
predicate timed out. No test or renderer assertion was weakened.

That exact capture/restart test passed alone on rerun, including three captures,
restarts, visible Patient model prewarming, matched resource comparisons, pointer
lock, listener counts and disposal. See
[existing-hospital-restart-metrics.json](existing-hospital-restart-metrics.json).
This establishes successful recovery in that rerun, not absence of frame stalls.

An earlier broad baseline attempt also failed the existing NW-003B relighting
test at its five-second reversal sampler: expected at least 2, observed 1 at
1440×900 software WebGL. Its lit/dark comparisons had passed. That test was not
edited or deleted, and no final full browser-suite pass is claimed. Treat the
software-rendering sampling sensitivity as an outstanding QA finding.

## Measured resources and performance limits

In the isolated hospital capture/restart rerun:

| Matched observation | Across three restarts |
| --- | --- |
| Global/canvas tracked listeners | **39 → 39 → 39 → 39** |
| Renderer geometries / textures | **359 / 77**, stable |
| Live collider instances per restarted attempt | **225**, stable |
| Draw calls at Room 104 comparison view | **183** |
| Draw calls with Patient in view | **235** |
| Observed first-visibility render spikes | About **3,985–9,639 ms**, software WebGL |

Ready-state fixed-stage maxima were 0–0.1 ms in those render samples; no live
chase simulation was advancing. The stalls are dominated by render work in this
environment. Do not interpret mean cold-start frame intervals as sustained FPS,
or infer final chapter/laptop performance from this run. New-map asset loading,
GPU memory, act lighting, full chase routing and a sustained hardware soak still
need measurements after assembly.

The new systems create no second RAF, scene, camera or AudioContext. The harness
tests restart the real module registry while retaining one engine, then dispose
its renderer/physics/audio. This is limited lifecycle evidence, not a long full
chapter memory-stability test.

The final isolated harness kept one geometry, one texture and one shader program
across three active-scene restarts; one world/canvas and three live collider
instances remained constant. See [isolated-session-lifecycle.json](isolated-session-lifecycle.json).
The native diagnostic tone advanced **2.061 seconds** while the existing engine
was stopped; after a `.1` host update, camera/subtitle timeline was also at
**2.061 seconds**, with the second subtitle segment and mixer RMS **0.01477**.
Frame count stayed 7 during that stopped interval. The same camera/canvas and
three colliders survived cleanup/resume. This is test-only generated audio, not
an approved chapter voice. See [native-audio-clock-probe.json](native-audio-clock-probe.json).

## Images and recordings

| File | What it actually shows |
| --- | --- |
| [baseline-menu-selected-1366x768.png](baseline-menu-selected-1366x768.png) | NW-003B title baseline before chapter implementation |
| [baseline-foundation-room104.png](baseline-foundation-room104.png) | Existing Room 104 browser baseline; not the chapter awakening scene |
| [baseline-foundation-800x600.png](baseline-foundation-800x600.png) | Existing responsive renderer baseline |
| [isolated-systems-camera-preview.png](isolated-systems-camera-preview.png) | Real WebGL/camera/control/subtitle QA using explicitly labelled test geometry and unrecorded preview |
| [isolated-systems-camera-and-skip.webm](isolated-systems-camera-and-skip.webm) | Silent browser recording of the camera/input/pause/skip systems test |
| [isolated-systems-restart.webm](isolated-systems-restart.webm) | Silent browser recording of isolated repeated session cleanup |
| [native-audio-clock-probe.webm](native-audio-clock-probe.webm) | Browser image recording of the labelled native diagnostic-tone clock test; video does not include system audio |

The recordings are short automated QA sessions. They contain no completed chapter
or performed Chapter One voice audio. All actual chapter voice lines remain
unrecorded; production playback rejects them.

## Acceptance still outstanding

Approved Fractured Ward route/trigger/anchor bindings, all five produced in-world
cinematics and acting, real Nurse chapter survival, Patient climax/escape, full
door/puzzle/entity/audio checkpoint restoration, frontend journal and Continue,
fresh/restarted actual chapter runs, full recording and measured pacing remain
required. See [the implementation report](../../nw-004/IMPLEMENTATION.md) and
[full production QA matrix](../../nw-004/PRODUCTION.md).
