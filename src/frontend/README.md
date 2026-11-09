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
      ├─ ui/menu.ts       title screen: seal, NIGHT WARD title, nav, sound control (NW-003B)
      ├─ menu/            the live corridor: director.ts (lighting events) + corridor.ts (WebGL)
      ├─ menuAudio.ts     the title soundtrack, synced to the corridor's lights
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
- **The title screen is light.** The game engine is not created until New Game or Continue.
  The title screen has its own small WebGL context (one full-screen shader over six images; see
  "Title screen" below). That context is released whenever the title screen hides.
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
  - the title screen: lights fade instead of flickering, the fixture stops swaying, the haze and
    dust stand still, and the figure fades in and out;
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

## Title screen (NW-003B)

The approved concept was rebuilt from the game's own Blender corridor.

### How the corridor lights up

`media/pipeline/render_menu.py` dresses the west corridor for the title shot only. It adds:
- water damage, grime and stained ceiling tiles;
- a missing ceiling tile, with the fluorescent hanging from its wires;
- a wet floor;
- the wheelchair;
- the Room 104 flag sign;
- an end wall with an exit sign and a stair lobby;
- low haze (a Cycles volume).

It then renders the shot once per light group, as scene-linear EXR:
- `ambient`: fill light and the spill from Room 104;
- `exit`: the sign, its downlight and the red lobby lamp;
- `main_a` and `main_b`: the hanging tube at the two extremes of its swing;
- `far`: the far tube;
- `figure`: ambient and exit light with the figure standing in the end doorway;
- `figure_mask`: where the figure is.

`encode_menu.py` scales each pass into an 8-bit sRGB WebP and records the scale in
`media/corridor/corridor.json`. It also bakes three posters: lit, dark and figure.

Light adds linearly, so `menu/corridor.ts` relights the real render in a fragment shader.
- For each pass it decodes to linear light, multiplies by the director's current intensity and
  sums the passes.
- Where the mask covers the figure, and only while the figure is visible, it swaps in the figure
  pass.
- It adds haze drifting along the floor and dust in the tube's light cone (procedural).
- It then tonemaps (ACES fit), grades (cold and desaturated, sparing reds), and adds vignette and
  grain.

The flicker is a real change in the light, not a brightness filter:
- the wall the tube lights goes dark while the exit sign's red stays;
- blending `main_a` and `main_b` moves the hanging tube's shadows as it swings.

`menu/director.ts` decides what happens. It is seeded and testable, and has no DOM:
- **Opening:** the tube strikes on.
- **Events:**
  - stutters (2–4 drops);
  - shallow ballast buzz;
  - dims (the tube sinks to a sick glow);
  - blackouts;
  - the far tube dying and restriking;
  - exit sign pulses;
  - a distant door that sets the fixture swinging.
- **The figure:**
  - it stands in the end doorway only in the dark;
  - it is gone on the first flash of returning light;
  - the first appearance comes 14–22 s after the title screen opens, then about every 40 s or
    more.
- **No loop:** gaps are random (about 3 to 9.5 s), and the same sequence never runs twice in a row.
- **Photosensitivity:** big light changes never exceed three flashes in any one second (WCAG
  2.3.1). `tests/frontend/director.test.ts` checks this over ten simulated minutes for five seeds.
- **Reduced motion:** the same events happen as slow fades (at least 1 s), with no swaying.
- **Screen effects setting:** scales the grain, haze and dust.
- **Without WebGL:** the three posters are cross-faded by the same director.

### Sound

All sound is original, synthesised by `media/pipeline/make_menu_audio.py` with numpy, scipy and
ffmpeg. There are no samples.

| File | What it is | Bus |
|---|---|---|
| `bed` (48 s loop) | Sub drone on D, a slowly breathing bowed cluster (D, A, F and a faint B-flat), duct rumble and air, 50 Hz mains hum and ballast buzz, in a 4 s circular corridor reverb | music |
| `motif`, `motif_low` | The NIGHT WARD motif: D5 A4 F4 E4 … B-flat4, settling on an A a quarter-tone flat (glass celesta with tape wow); a detuned felt-piano fragment | music |
| `presence` | A reversed swell into a low thud, when the figure appears | music |
| `metal_1-3`, `door` | Distant pipe and trolley resonances, a far fire door (modal synthesis) | sfx |
| live (Web Audio) | A crackle on every tube failure, a ballast buzz whose level follows the hanging tube | sfx |

How the bed loops:
- Every component of the bed is periodic in 48 s, and its reverb is a circular convolution.
- The file carries 2 s of overlap, and the browser loops from 1 s to 49 s, so codec priming and
  padding never land on the loop point.
- The decoded files were checked: the jump at the loop point is within normal sample-to-sample
  variation, for both Opus and AAC.

How sound starts and stops:
- **Before a gesture:** nothing plays or downloads until the first click or key press, or the
  "Enable sound" control.
- **Mute:** the control turns sound off; that choice is remembered (`night-ward:menu-sound-muted`).
- **Volume:** the master, music and effects sliders apply live.
- **Files:** Opus in WebM, with an AAC fallback, chosen with `canPlayType`. About 690 KB is
  fetched, after a gesture only.
- **Leaving the title screen:** the sound fades and stops, and the decoded buffers are released.

### Test and QA hooks

In `?test=1` mode:
- `&menuSeed=N` seeds the director.
- `window.nightWardFrontend.menu` exposes:
  - `director.force(kind)` and `director.freeze(state)`;
  - `corridor.sample()`, which draws and then reads back the mean, red and figure-region
    luminance;
  - `audio` state;
  - `outputLevel()`, the RMS after the mixer's gains.

`tests/browser/nw-003b-menu.spec.ts` uses these hooks to check the acceptance list, measuring
pixels and audio levels. `docs/nw-003b/record-menu.cjs` records the sequence to video.
