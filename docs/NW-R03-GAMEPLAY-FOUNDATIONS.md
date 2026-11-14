# NIGHT WARD — NW-R03: Chapter 1 gameplay foundations and local voice pipeline

**Status: implemented and tested for review (gate F). Not merged.** This milestone builds systems, not the chapter. Shaw's AI, the encounters, the chase and final voice acting are not implemented, and nothing here makes Chapter 1 playable from beginning to end.

| | |
|---|---|
| Branch | `claude/nw-r03-gameplay-foundations` |
| Based on | `claude/nw-r02b-gameplay-narrative-design` at `fc092f9`. Verified: it is directly on the R02 greybox (`b213165`), and `origin/main` is an ancestor. No draft branches were merged or cherry-picked. |
| Run the demo | `npm run dev`, then open `/?level=greybox&r03=1`. Add `&test=1` to skip the title screen. Default game: `/`. R02 greybox: `/?level=greybox`. |
| Voice workflow | `docs/voice/CHATTERBOX.md` |
| Evidence | `docs/nw-r03/screenshots/`, `docs/nw-r03/browser-log.json` |

---

## 1. Summary

| Gate | Status | Evidence |
|---|---|---|
| **A State** | **Passed (automated)** | 8 state tests: the full path, Shaw's stage order, skip rejection, duplicates, suspicion clamp, choices, objectives, items and encounters |
| **B Persistence** | **Passed (automated and in browser)** | 5 checkpoint unit tests. In the browser, save → game restart → page reload all resume the same state, doors and position. |
| **C Interaction** | **Passed (automated and in browser)** | 4 hold tests and 4 device tests. In the browser: release-cancel, toggle mode, item-gated padlock, crouched hatch, long crank. |
| **D Audio** | **Passed for routing, subtitles and status controls; the voice quality target is not met** | Voice bus, ducking, director (5 tests). A temporary Chatterbox line played in game through the intercom chain, labelled "(temp voice)". The built-in Chatterbox voice measures as male (§6), so no audition-ready Shaw voice exists yet. |
| **E Integration** | **Passed, with one spec unrunnable here** | The demo runs in the real greybox. The default game and the R02 greybox boot unchanged. Unit suite: 494 passed. Browser suite: 40 passed. 4 tests in one spec couldn't run (missing Playwright ffmpeg in this container, §8). |
| **F Human approval** | **Not passed (Claude can't pass it)** | — |

---

## 2. What was built

### A. Chapter 1 state director: `src/chapter1/state.ts`, `objectives.ts`

**What the state holds:**

| Part | Detail |
|---|---|
| Beats | 17 mandatory beats, each with physical-order prerequisites (no information gates, so no softlocks) |
| Knowledge | 13 knowledge flags |
| Items | 3 |
| Choices | 7 one-time choices, with their allowed values |
| Suspicion | Hidden, clamped to 0–4. Each source applies once, or up to its `max` (`seen-escaped` × 2). Waiting at the grate lowers it. |
| Other | Progress flags; encounter status E1–E6; one-time voice lines played; a revision counter |

**How it changes:**
- **Only through `applyChapter1Event`.** Every event returns `applied`, `duplicate` (same object back, no revision change) or `rejected` (with a reason, state untouched).
- **Rejected events include:**
  - skipped beats;
  - items before they're reachable;
  - Shaw's keys dropped before the bulkhead;
  - re-made choices;
  - completing an encounter except through its beat.
- **Shaw's stage is derived, never stored**, so it can't contradict the beats: composure → suspicion → anxiety → desperation → aggression → fear.
- **Encounter status follows the beats.**

**Restored state is validated:** `validateChapter1State` checks beats are closed under their prerequisites, items are reachable, encounters agree with the beats, and suspicion is within range and its sources.

**Objectives are separate presentation** (`currentObjective(state)`), and change with knowledge as well as beats. For example, after reading the incident slip the objective becomes "She closed the link herself. Unlock the bulkhead with her keys."

### B. Chapter 1 checkpoints: `src/chapter1/checkpoint.ts`

**Schema:**
- `night-ward.ch1.checkpoint`, **version 1**, at most 32 KB.
- Stores the pose (x, y, z, yaw), the full Chapter 1 state, the door leaves left open, and one-time interactions used.
- Never stores Shaw's perception.

**Barrier safety:**
- Each of CP0–CP8 declares the beats it **requires**, the beats it must come **before**, and the **spaces** the pose must lie in.
- A save that would put the player behind a barrier without the state that opens it is refused.
- So are positions outside the checkpoint, unknown door or interaction ids, and tampered states.

**Damaged or foreign saves** each give an explicit refusal:
- corrupted JSON;
- a truncated file;
- a foreign schema;
- a future version;
- an oversize file;
- storage that throws (treated as "no save").

**Separation from the existing game:**
- The existing chapter save (`frontend/saves.ts`) is **untouched**.
- The greybox uses its own key, `night-ward:greybox:ch1-checkpoint`.
- Developer teleport checkpoints (map clicks) remain separate and are never written to storage.

### C. Interaction foundations

**Engine changes** (`src/contracts/interactions.ts`, `src/gameplay/interactions.ts`, `input.ts`, `runtime.ts`, `hud.ts`):

| Feature | Detail |
|---|---|
| **Hold-to-interact** (`marker.hold`) | Completes after N seconds of holding E while looking at the target, in range and in place |
| **Cancellation** | Releasing, looking away, moving more than 0.35 m, hiding, capture or a cinematic each emit `outcome: 'cancelled'` with a reason |
| **Crouch-only holds** | The prompt says "Crouch to reach it" |
| **Toggle mode** (accessibility) | Settings → Accessibility → *Long interactions: Press E*. One press runs the hold to completion; another press cancels. |
| **Per-object noise** | `marker.noise`; `null` is silent |
| **HUD** | Prompt and progress bar ("Turning the valve… (keep holding E)"), with ARIA progressbar values |

**Device layer** (`src/chapter1/devices.ts`). Data-driven objects declare:
- requirements (`beat:`, `item:`, `knowledge:`, `flag:`, `used:`/`unused:`);
- one-time or repeatable;
- hold and noise;
- consequences.

Consequences are Chapter 1 events, applied **atomically** (all or nothing), plus a voice line and a notification. Locked devices and doors show their reason in the prompt.

**Built for validation in the greybox** (R03 mode only):

| Device | Behaviour |
|---|---|
| Banded valve | Hold 2.5 s; quiet. Clears the steam gate. |
| Wrong valve | Repeatable; hold 1.5 s; loud (10 m). Nothing else happens. |
| Incident slip | Silent. Readable only once the steam has cleared. |
| Padlock | Hold 1.2 s. **Needs Sister Shaw's keys.** |
| Bulkhead crank | Hold 4 s; very loud |
| Crawlway hatch | Its **wing nuts** are a crouched 5 s hold. They gate a new hinged hatch cover (a real door with a collider and swing). |

### D. Audio and dialogue foundations

**Built on the existing systems** (no competing audio manager):

| Change | Where | Detail |
|---|---|---|
| **Voice bus** | `src/audio/mixer.ts` | `voice`, with a *Voices* volume slider |
| **Ducking** | `src/audio/mixer.ts` | `duckBuses`: overlapping ducks take the deepest; release is idempotent; dialogue ducks music by −8 dB and effects by −4 dB |
| Lazy creation | `src/audio/mixer.ts` | The voice bus and duck stages are created on first use, so other contexts keep the original graph. The existing mixer tests pass unchanged. |
| Dialogue player | `src/gameplay/chapter/dialogue.ts` | The existing `DialoguePlayer` now accepts the `voice` bus. The buffered voice adapter takes an optional destination chain. |

**Voice director** (`src/audio/voiceDirector.ts`), on top of the single-channel player:

| Feature | Detail |
|---|---|
| Stage variants | Line variants chosen by **Shaw's stage** |
| Duplicate-event protection | Event keys; a line already active or queued; one-time lines remembered in Chapter 1 state, so they survive checkpoints |
| Priority and interruption | A higher-priority line marked `interrupts` stops a lower one. Others queue, one deep. Lower-priority overflow is dropped. |
| Presentation chains | Positional (HRTF panner; distance 1.5–25 m); **intercom** (320–3200 Hz band-pass plus light saturation); **telephone** (300–3400 Hz). Chain nodes are released when a line ends. |
| Subtitles | Speaker, an `[intercom]`/`[telephone]` tag, and optional **directional captions** (`[behind]`, `[left]`…; Accessibility setting). Captions clear when a line ends: an empty subtitle now hides the caption. |
| Recording status | Visible in every subtitle: "(temp voice)", "(subtitle only)", "(unapproved recording)". In production mode a non-approved line returns `refused`. It never plays and never crashes. |
| Graceful degradation | A recording that can't play (no audio context, not decoded, files missing) degrades to subtitle-only |

### E. Local Chatterbox workflow

- A reproducible offline generator with manifest, seed, provenance (including model revision and SHA-256) and watermark.
- A consent registry for reference recordings: empty, so references are refused.
- Generated audio is git-ignored.
- Full details, measured requirements and the audition analysis: `docs/voice/CHATTERBOX.md`.

### F. Greybox integration (`?level=greybox&r03=1`)

`src/chapter1/r03Demo.ts` and `r03Session.ts`, wired through the greybox module and `main.ts`. Without `r03=1`, nothing changes.

**The demonstration, all through real game interactions:**
1. **Start:** a developer scenario, **labelled DEV SCENARIO START in the HUD**: the Chapter 1 state at Plant 2, built through the reducer. The player starts in the M3 pump chamber.
2. The steam gate is **locked by state**. Trying it is refused with "Steam blocks the way (valve)".
3. **Hold** the banded valve. Releasing early cancels it. When it completes, the **state changes** (`valve-closed`) and the **objective updates**. The steam gate's requirement is now satisfied, so the **previously inaccessible door opens** with E.
4. **Discover a document:** the incident slip. It adds knowledge (`link-closure-order`) and the objective updates again.
5. Entering the bulkhead chamber **reaches checkpoint CP7** (saved, "Checkpoint: Bulkhead").
6. **Hold** the padlock. It needs the **item** Shaw's keys. A **temporary Chatterbox voice line** plays on the passage intercom. The stage-selected variant is "pleading", subtitled "Sister Shaw (temp voice): [intercom] …". The checkpoint is re-saved.
7. **Restart** (game restart) and **reload the page:** both restore the state, the opened doors, the one-time line (it won't replay), and the position.
8. **Hold** the crank for 4 s. The bulkhead opens by state.
   - The HUD says plainly that the link alarm and the chase (E6) **are not implemented**.
   - E6 is marked `active` in state, and no Shaw appears.

The R02 developer flag posts for the valve and crank are replaced by real devices in this mode. The doors' R02 requirement ids are mapped onto Chapter 1 state, so they open only through real progress.

---

## 3. Implemented and tested

| Area | Tests |
|---|---|
| State transitions, skip rejection, duplicates, suspicion bounds, choice consequences, softlock check (the minimal path completes), objectives | `tests/chapter1/state.test.ts` (8) |
| Checkpoint round-trip, barrier safety, corrupted/foreign/future/tampered saves, throwing storage | `tests/chapter1/checkpoint.test.ts` (5) |
| Hold completion, cancellation (release/look/move), toggle mode, locked and crouch-only holds, silent objects | `tests/gameplay/hold-interactions.test.ts` (4) |
| Device chain, item requirement, repeatable vs one-time, atomic effects | `tests/chapter1/devices.test.ts` (4) |
| Voice variants by stage, once-only across restore, duplicate keys, priority interruption and queueing, direction captions, production refusal | `tests/chapter1/voice-director.test.ts` (5) |
| Voice bus creation and volume, overlapping ducks | `tests/chapter1/mixer-voice.test.ts` (2) |
| R03 world validates; the hatch cover sweeps without collision; restored doors are built open | `tests/greybox/r03-world.test.ts` (2) |
| **In the running game:** the full demo (steps 1–8); the crouched hatch; the default game and the R02 greybox still boot | `tests/browser/nw-r03-foundations.spec.ts` (3) |

**Results:**
- `npx tsc --noEmit`: clean.
- `npx vitest run`: 494 passed (§8).
- The NW-R03 browser spec: **3/3 passed**: about 1.0 min for the demo, 17.5 s for the hatch, 16.5 s for the boot checks.

## 4. Implemented but unverified

| Area | Gap |
|---|---|
| **Audible quality of any voice output** | Nobody has listened to it. Only objective measurements exist (§6). |
| **Positional (HRTF) chain** | Built and unit-covered for selection, but the demo line uses the intercom chain. No in-game listening test of positional voice. |
| **Ducking by ear** | The duck targets are tested; the audible result is not. |
| **Directional captions in game** | Unit-tested; not exercised in the browser test |
| Telephone chain | Built; no line uses it yet |
| The settings UI for *Voices*, *Directional captions* and *Long interactions* | Wired to the settings store and used by the game. The panel itself wasn't visually checked in the browser. |
| Screen-reader behaviour of the hold progress bar | Not tested |

## 5. Blocked

**A Shaw audition with the right voice.** Chatterbox can only produce a different speaker from a reference recording. We have no consented recording of a British woman of the right age, and the built-in voice measures as male (§6).
- **Needed:** a consented reference, registered in `tools/voice/references.json`.
- No workaround was attempted: no cloning, no paid service.

## 6. Voice pipeline result (honest)

**Install and network:**
- Installed and ran locally on CPU (4 cores, no GPU).
- The download hosts had to be allowed in a new personal environment, "night-ward (voice pipeline)":

| Hosts | For |
|---|---|
| `huggingface.co` and three Hugging Face storage hosts | Model weights |
| `download.pytorch.org`, `download-r2.pytorch.org` | CPU PyTorch |

- The model is 3.0 GB; the Python environment 1.6 GB.
- One compatibility fix was needed: `setuptools<81` for the watermarker.

**Generation:** five audition lines in 13–36 s each (about 4–7× slower than real time). Objective analysis:

| Line | Median pitch | Rate | Loudness |
|---|---|---|---|
| calm | 112 Hz | 2.8 w/s | −18.6 LUFS |
| suspicious | 102 Hz | 4.2 w/s | −19.0 LUFS |
| pleading | 125 Hz | 4.1 w/s | −18.9 LUFS |
| shouting | 144 Hz | 3.6 w/s | −16.3 LUFS |
| fear | 126 Hz | 3.7 w/s | −17.7 LUFS |

**What this means:**
- Pitch is consistent with an adult **male** voice, wrong for Shaw.
- "Fear" and "pleading" are not slower or quieter as directed.
- **Chatterbox's built-in voice does not meet the target and must not be auditioned as Shaw.** Whether Chatterbox can meet it **with a proper consented reference** is unknown until that test is run.

**In game:** the line decoded and played through the intercom chain on the voice bus, subtitled "(temp voice)" (browser log).

## 7. Planned for later (out of scope here, by design)

- Shaw's AI, trolley navigation, stages in behaviour.
- Lights Out; the stores encounter; the crawlway encounter; the three key approaches; maintenance events; the alarm and the chase; the North Wing transition.
- ES3's moving figure (kept, per the locked decisions).
- Final voices; Blender assets; environment art; cinematics.

The demo's crank stops at "chase not implemented" deliberately.

## 8. Test runs (actual)

All runs were on this branch, in this container (4 CPU cores, Chromium with SwiftShader).

| Run | Result |
|---|---|
| `npx tsc --noEmit` | Clean |
| `npx vitest run` | **58 files passed, 1 skipped. 494 tests passed, 1 skipped.** The skip existed before this work. No existing test was changed, removed or weakened. |
| `npx playwright test tests/browser/nw-r03-foundations.spec.ts` | **3 passed** |
| `npx playwright test` (full browser suite) | **40 passed, 4 failed** (29.1 min) |
| Chatterbox reproducibility | Regenerating `shaw.r03.calm` with the same seed gave a **byte-identical** WAV (same SHA-256), with the model revision `5bb1f6ee58e5…` recorded |

**The 4 browser failures are all in `tests/browser/nw-004-systems.spec.ts`, and they can't run in this container:**
- The spec records video, which needs Playwright's ffmpeg (`/opt/pw-browsers/ffmpeg-1013/ffmpeg-linux`), which isn't installed here.
- Every one fails in `browserContext.newPage` before any game code runs.
- I didn't install it: the environment rules say not to reinstall Playwright components.
- **Not verified on this branch.** It needs a machine with Playwright's ffmpeg.

The R02 greybox autopilot spec (`nw-r02-greybox.spec.ts`) is among the 40 that passed, so the R02 greybox is intact.

## 9. Changes to shared code

Each shared-code change was checked against the existing tests, which pass unmodified:

| File | Change |
|---|---|
| `contracts/interactions.ts` | Optional `hold` and `noise` on markers; `'cancelled'` outcome |
| `gameplay/interactions.ts` | Hold state machine, `getHold()`, per-object noise. Nothing changes for markers without `hold`/`noise`. |
| `gameplay/input.ts`, `player.ts` | `interact` is present in the input snapshot **only while E is held** (snapshot shape unchanged otherwise) |
| `gameplay/runtime.ts` | `holdMode` and `onRuntime` options; passes the held state; HUD hold bar |
| `audio/mixer.ts` | Lazy voice bus and duck stages; `duckBuses`/`duckLevels` |
| `gameplay/chapter/dialogue.ts` | Accepts the `voice` bus; optional output chain for the buffered adapter |
| `settings/settings.ts`, `frontend/ui/settingsPanel.ts` | `voiceVolume`, `directionalCaptions`, `holdInteractions` (validated, with defaults) |
| `frontend/frontend.ts` | An empty subtitle clears the caption |
| `world/greybox/*` | R03 options (devices, hatch cover, restored doors, spawn), only with `r03=1` |
| `main.ts` | `r03` flag; greybox gameplay options (hold mode, runtime hook) |

**Note:** the existing (non-greybox) game passes no `holdMode`. It gets the hold behaviour only from markers that declare `hold`, and none do yet.

## 10. Decisions and questions for approval

1. **The voice reference.** Who provides a consented British female reference recording for Shaw, and under what written consent? Until then, Chatterbox auditions can't test the real target.
2. **Model weight provenance.** The built-in voice's speaker isn't documented by the vendor. I've kept generated audio out of git. Should temporary audio ever be committed, for example for team listening, or shared another way?
3. **The new environment** "night-ward (voice pipeline)" now allows the Hugging Face and PyTorch download hosts. Keep it, or remove it after this milestone?
4. **The hatch cover** exists only in R03 mode. Should it become part of the standard greybox (it changes the R02 route, which would then need a crouched hold)?
5. **Settings migration.** Three new settings were added to the existing `night-ward:settings:v1` record, with validated defaults. Older saved settings load fine. OK to keep the key unversioned?
6. **Next milestone:** Shaw's agent in the greybox (NW-R02B milestone M2), which needs decision D9 (merge order of the draft branches) first.
