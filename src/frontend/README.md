# NIGHT WARD frontend (NW-003)

The title screen, loading screen, pause menu, settings, credits and error screens. The frontend
is DOM and CSS laid over the game canvas. It drives the single existing `Application`
(`src/integration/application.ts`) and never runs gameplay of its own.

## Architecture

```
main.ts
 ├─ createApplication(...)          one engine, one session ("attempt") at a time
 │    onState / onStatus / onProgress ─┐
 └─ createFrontend({ app, ... })  <────┘   src/frontend/frontend.ts
      ├─ ui/menu.ts       title screen: seal, NIGHT WARD title, nav, ui/scene.ts (corridor view)
      ├─ ui/loading.ts    progress bar, stage list, rotating plates and ward records
      ├─ ui/pause.ts      blurred still of the frozen frame, Resume / Settings / Restart / Main menu
      ├─ ui/settingsPanel.ts, ui/dialogs.ts (confirm, credits, error)
      ├─ loading/         LoadingTracker + createLoadingPlan (weights)
      ├─ saves.ts         checkpoint save (Continue)
      ├─ sound.ts         UI cues on its own AudioContext, routed through the sfx bus
      └─ display.ts       graphics preset (pixel ratio), fullscreen
shared services (no frontend dependency):
  src/settings/settings.ts    persistent settings store (guarded localStorage)
  src/audio/mixer.ts          master / music / sfx gain buses per AudioContext
  src/audio/subtitles.ts      subtitle event for future voice lines
  src/assets/preload.ts       byte-tracked downloads consumed by the real loaders
```

- **One lifecycle.** The application gained `pause`, `resume`, `endSession`, `newSession`,
  `redraw`, `setLookSensitivity` and `services`. These sit beside the existing `start`, `play` and
  `restart`, and use the same attempt and teardown paths, so there is no second loop or registry.
- **The title screen is light.** No engine or WebGL context is created until New Game or
  Continue. The title scene is three still renders plus CSS and a small 2D dust canvas.
- **Going back to the title screen disposes the session.** `endSession()` waits for any start that
  is still in flight, then runs the normal `clearAttempt()` teardown (modules, physics, entities,
  listeners and GPU resources). The engine and its canvas stay, so the next New Game reuses them.
- **The QA bridge still works.** `?test=1` starts straight into the game as before, so the Codex
  browser tests are unchanged. `?test=1&menu=1` keeps the title screen. In test mode,
  `window.nightWardFrontend` exposes `mode`, `loadingHistory` and `stateHistory`.

## Loading methodology (no timers)

The bar is a weighted sum of real, tracked operations (`loading/plan.ts`):

| Share | Operation | How it is measured |
|---|---|---|
| 55% | Downloads: Room 104 set GLB, lightmap, entity GLBs | Streamed `fetch`; bytes received out of the known size in `assets/room104_set.json` and the GLB sizes. The bytes go into an in-memory cache that the real loaders use (`takePreloaded`), so nothing is downloaded twice. |
| 8% | Engine (renderer, physics) | The `engine` begin and done events |
| 30% | Each game module's `setup()` | `module` begin and done events from a wrapped `setup` (world, gameplay, atmosphere, horror) |
| 7% | Shader compilation | `renderer.compileAsync(scene, camera)`. Skipped (and counted as done) where it is unsupported. |

- **Steps without a byte count.** These show as stages (pending, in progress, done) and advance
  only when their event arrives.
- **Failed downloads count as finished, marked "fallback".** The existing fallbacks (the
  procedural room and procedural entities) take over.
- **The bar never goes backwards.** The browser test asserts this from `loadingHistory`.
- **The game starts only when the application reports `ready`.** That is when "Enter ward"
  appears.

## Pause: what each subsystem does

| Subsystem | While paused |
|---|---|
| Physics (Rapier), player controller | Frozen: `engine.stop()` stops fixed steps. The frame clock resets on `start()`, so there is no time jump on resume. |
| Entity AI, patrol navigation, encounter timers | Frozen: they run in fixed or frame updates, which stop. |
| Animation mixers, flicker, scares, overlay pulses | Frozen: frame updates stop. |
| Game audio (score, ambience, entity sounds) | The engine `AudioContext` is suspended, then resumed on Resume. |
| UI sounds | Play (separate context) |
| Rendering | Stops. The pause screen shows a single blurred still of the frozen frame (`redraw()` then a 2D copy), so the GPU is idle while paused. |
| Pointer lock | Released. Resume asks for it again, and if the browser refuses, the screen shows a hint and pausing continues. |

The game pauses when you press Esc or lose pointer lock, when the window loses focus, and when the
tab is hidden. Pause and resume reuse the engine's single loop. The browser test checks that
listener and texture counts stay flat across pause, restart and returning to the title screen.

## Settings

- **Audio:** master, music and sfx volume.
- **Controls:** mouse sensitivity and invert Y, applied live to the player.
- **Display:** graphics preset (pixel ratio cap: Low 0.75, Medium 1, High 1.5, Ultra 2) and
  fullscreen.
- **Accessibility:** subtitles, motion (System / Reduced / Full) and screen-effects strength,
  which scales the horror vignette and colour wash.
- **Reduced motion** affects:
  - the title screen: no flicker, dust, push-in or apparition;
  - loading: slower rotation, no transitions;
  - scares: vignette and tint pulses fade in over 0.35 s or more instead of flashing.
- **Storage:** settings are stored under `night-ward:settings:v1`. If storage is blocked they last
  for the page, and the panel says so.

## Media

Every image is our own render, made in Blender Cycles from the game's own Room 104 set and entity
GLBs. They are generated by `media/pipeline/render_media.py` and encoded to WebP by
`media/pipeline/encode_media.py`. Every image has alt text (`media.ts`).

## Known limitations

- **Saves:** there is one checkpoint (Room 104). Continue starts a fresh session from it, because
  the game has no mid-run state serialisation yet.
- **Pointer lock:** Chrome will not re-lock the pointer from an Esc keypress, and requires a click.
  The pause menu's Resume button provides that click.
- **Shader warm-up:** under software WebGL (headless CI), `compileAsync` can log a warning and fall
  back to compiling on first draw.
- **Edits to Codex-owned files, each kept to the minimum:**
  - `application.ts`: lifecycle methods and progress events, because there must not be a second
    lifecycle;
  - `testing.ts`: the state union;
  - `player.ts`: `setLookSensitivity`, because the configuration is copied when the player is
    created;
  - `patientEncounter.ts`: one line routing its audio to the music bus;
  - `patient-effects.test.ts`: a mock of the mixer.
