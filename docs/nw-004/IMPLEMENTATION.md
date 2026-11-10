> **Historical NW-004 proposal — superseded by NW-005D.** This is retained development history, not current Chapter 1 canon or an implementation brief. Nurse Shaw is Chapter 1’s antagonist; the Patient is reserved for much later. The Patient climax below is withdrawn. See [current opening policy](../nw-005d/NARRATIVE.md).

# NW-004 phase one implementation report

## Delivery status

**Chapter One remains incomplete.** This phase implements the independent gameplay
systems and complete production specification while Claude authors The Fractured
Ward. It does not enable an unfinished chapter in the main menu or claim a measured
20–30 minute story, finished acting, five produced cinematics or a full playthrough.

Branch: `feat/nw-004-chapter-one`. Base: integrated main
`7db740e83a9bd6e8b2b5acd1423bf4114e3980c1`. Actual remote:
`https://github.com/Seb-Simpson/Claude-and-Co...dex.git`. Latest observed environment
publication: `feat/nw-004a-environment` at
`6b9df6b1a8d6126da5742b51e8a96345b5a25b7c`; its expanded plan awaits approval.
No automatic merges or writes to Claude's branch.

The repository audit and full treatment/dialogue were written before chapter
implementation. Existing shared contracts, engine, main, world, atmosphere,
horror, frontend, settings, asset files and dependency declarations are unchanged.
Runtime edits are confined to Codex-owned gameplay/entities and dedicated tests.

## Implemented

| System | Implemented behavior | Production boundary |
| --- | --- | --- |
| Narrative | Complete four-act treatment, chronology, knowledge/identity evidence, cause-and-effect objectives and ending; no Chapter Two | Requires authored environment and performances |
| Progression | Deterministic semantic reducer, ordered objectives, one cinematic at a time, unique attempt tokens, duplicate-safe effects, fair intro/release gates, interruption/retry | Inputs must come from physically validated real interactions/triggers; no chapter host registered yet |
| Journal | Current goal, completion projection, retained readable clues/record transcript, optional graduated hints earned by clues/mistakes | Compact frontend presentation and journal pause policy remain to integrate |
| Power puzzle | Every selector order; one-unit load reasoning; reversible overload/reset; reserve engagement separate from physical local release; reusable handle; success latched | Real controls/labels/handle and collision-aware world mechanism remain to bind |
| Cinematic runtime | Existing shared camera; configurable quaternion/position/FOV paths; timed dialogue/animation/audio/environment cues; exclusive control; pause/resume; blended skip; external/lease cancellation; scoped cleanup | Claude supplies final paths, animation and presentation handlers; no coordinates/choreography guessed |
| Five cinematic templates | Awakening, Nurse, record, Patient and ending timelines with configurable retiming and semantic cue names | Editorial timings, not approved scenes or playtime padding |
| Dialogue | All 13 exact script lines; timeline subtitles, recording status, preview/production gate, cancellable handles, scoped ducking; predecoded-buffer Web Audio adapter using existing mixer; camera/subtitles resynchronize to native voice playhead after a capped frame | All chapter recordings remain `not-recorded`; subtitle sink/pause integration with frontend remains |
| Real player control lease | Player camera writes/look/movement/noise suppressed; collision retained; runtime blocks interactions and clears held input; safe same-body handoff checks occupancy/support; abort on capture/hiding/disposal | Host still validates camera path geometry and actor safety; input lock is not enemy invulnerability |
| Core checkpoints | Validated/copy-isolated v1 schema, causal invariants, all five safe core boundaries, corruption/future-version rejection, bounded JSON; legacy Room 104 metadata migrates only to chapter start | Does **not** restore live player, doors, AI, audio or lighting; current Continue remains the baseline behavior |
| Nurse | Staged/dormant/active lifecycle around existing real EntityAgent; sound sensitivity, close vision, obstacle-aware paths, search/recovery, witnessed hiding, capture grace/dwell, finite audio hooks, idempotent cleanup | Not enabled in the current game; actual new-map route, physical service boundary and presentation/audio hookup remain |
| Environment contract | One typed semantic vocabulary for rooms, triggers, anchors, puzzle controls, actor zones/routes, lighting, cameras and voices; metadata preflight; producer staging IDs accepted without coordinate copying | Cross-owner revision acknowledgement, trigger geometry/acoustics and final approved map are pending |

## Exact public entry points

Import chapter APIs from **`src/gameplay/chapter/index.ts`**. Source declarations
are canonical signatures; the list below includes every public value/function.

| Export | Signature / purpose |
| --- | --- |
| `createInitialChapterState` | `(): ChapterState` |
| `applyChapterCommand` | `(previous: ChapterState, command: ChapterCommand): ChapterResult` |
| `getChapterObjective` | `(state): ChapterObjectiveId` |
| `getChapterHintLevel` | `(state): 0 \| 1 \| 2` |
| `getAvailableChapterScenes` | `(state): readonly ChapterSceneId[]`; deferred record offered before later scenes |
| `canCommitChapterCheckpoint` | `(state, id: ChapterCheckpointId): boolean`; semantic eligibility only |
| `createChapterPuzzleState` | `(): ChapterPuzzleState` |
| `chapterReserveLoad` | `(state): number` |
| `applyChapterPuzzleCommand` | `(state, command: PuzzleCommand): PuzzleResult` |
| `projectChapterJournal` | `(state): ChapterJournal` |
| `createChapterCoreCheckpoint` | `(state): ChapterCheckpointResult<ChapterCoreCheckpoint>` |
| `validateChapterCoreCheckpoint` | `(unknown): ChapterCheckpointResult<ChapterCoreCheckpoint>` |
| `serializeChapterCoreCheckpoint` | `(state): ChapterCheckpointResult<string>` |
| `parseChapterCoreCheckpoint` | `(serialized: string): ChapterCheckpointResult<ChapterCoreCheckpoint>` |
| `migrateLegacyChapterSave` | `(unknown): ChapterCheckpointResult<ChapterCoreCheckpoint>`; pure migration, no storage writes |
| `createChapterBindingDraft` | `(worldId: string, revision: string): ChapterEnvironmentBindings` |
| `validateChapterBindings` | `(world: HospitalWorld, bindings, sources?: ChapterBindingSources): ChapterBindingReport`; metadata only |
| `createCinematicPlayer` | `(CinematicPlayerOptions): CinematicPlayer`; `play`, `update`, `dispose` |
| `captureCinematicPose` | `(camera: PerspectiveCamera): CinematicPose` |
| `validateCinematicDefinition` | `(CinematicDefinition): CinematicDefinition`; copied/validated data |
| `createChapterCinematicDefinition` | `(sceneId, externallyAuthoredCameraPath, options?): CinematicDefinition` |
| `createDialoguePlayer` | `(DialoguePlayerOptions): DialoguePlayer`; `play`, `update`, `dispose` |
| `validateDialogueCue` | `(DialogueCue): DialogueCue` |
| `createBufferedDialogueVoiceAdapter` | `(context: BaseAudioContext, recordings: ReadonlyMap<string, AudioBuffer>): (cue) => DialogueVoice` |

Public data: `CHAPTER_SCHEMA_VERSION` (1), `CHAPTER_CONTENT_REVISION` (`c1.1`),
`CHAPTER_SCENES`, `CHAPTER_CHECKPOINTS`, `CHAPTER_CLUES`, `CHAPTER_OBJECTIVES`,
`MAX_CHAPTER_CHECKPOINT_BYTES`, `CHAPTER_ROOMS`, `CHAPTER_INTERACTIONS`,
`CHAPTER_TRIGGERS`, `CHAPTER_ANCHORS`, `CHAPTER_LIGHTING`, `CHAPTER_VOICE_CUES`,
`CHAPTER_DIALOGUE`, `CHAPTER_CINEMATIC_DURATIONS`, `CHAPTER_CINEMATIC_CUES`.
Corresponding interfaces, unions and option/result types are exported by the
barrel. No module import allocates browser, audio, physics or rendering resources.

Existing public gameplay additions:

- `GameplayRuntime.acquireCinematicControl(): PlayerCameraControlLease | null`.
- `PlayerController.controlsLocked` and `acquireCameraControl()`.
- `PlayerCameraControlLease`: `signal`, `handoff(pose: Pose): boolean`, `release()`.
  The runtime-level handoff also checks real physics support; the lower-level
  player lease checks controller stance/occupancy. No body teleport.
- `BrowserInput.setSuppressed(boolean)`. Optional equivalent on `PlayerInputSource`.
  The runtime also waits for neutral custom-source input after release.

Import `createNurseEncounter` and its types from **`src/entities/index.ts`**.
Options: actual spawn, optional route/hides/profile/eye heights/door policy/audio
hook, physics, navigation, player and GameEvents. Result: `phase`, `stage(pose?)`,
`activate`, `deactivate`, `reset`, `getPlacement`, `getSnapshots`, `witnessesEntry`,
`fixedUpdate`, `dispose`. Staging/reset of an active Nurse is rejected. Do not
construct the same Nurse ID in both this factory and an EntitySystem.

## Integration instructions

1. Agree [INTERFACES.md](INTERFACES.md) and the concrete
   [Claude handoff](CLAUDE-HANDOFF.md); keep a single writer for shared adapters.
   The main runtime does not discover a second chapter module. Extend the existing
   gameplay/application session after world registration.
2. Claude supplies one `ChapterEnvironmentBindings` revision. Reuse stable room,
   interaction, hiding, door and actor IDs. Feed published staging arrays to
   preflight rather than copying positions. Bind semantic lighting names to the
   actual `nw:profile:*` transport. Resolve approved camera assets into keyframes.
3. Create the chapter state and journal projection. Translate only real completed
   interaction/volume/survival evidence into `ChapterCommand`; range/LOS/occupancy,
   actual contact loss and floor-aware safe zones belong to the adapters.
4. Host one `CinematicPlayer` using the existing camera and
   `runtime.acquireCinematicControl()`. Validate full camera clearance, the supported
   terminal controller pose and appropriate gameplay FOV. Call `update` once from
   the existing host update, never a second RAF. Freeze/resume its timeline with
   frontend pause and cancel on checkpoint/title/session teardown.
5. Use one dialogue channel and engine AudioContext. Supply preloaded approved
   recordings and frontend subtitle sink; preserve subtitle/master/SFX settings.
   Production refuses the default unrecorded script. Preview is explicitly labelled.
   Native buffered voices expose their audio playhead, which becomes the cinematic
   clock during speech after dropped frames. Clockless custom adapters fall back to
   host time; they must expose `timeSeconds` for the same resynchronization behavior.
6. A scene result settles only its matching core attempt token. Complete and skip
   commit the same semantic state once. Presentation cues never change objectives.
   Play a deferred record at the earliest safe opportunity before the climax;
   handle/facts are retained during danger without forcing an unfair camera lock.
7. Instantiate Nurse through one actor owner, keep both threats dormant during
   tutorial, then activate Nurse only at its safe handoff. Use normal navigation/
   hearing thereafter. Keep Patient dormant until local release/handoff. The
   chapter director must coordinate real boundaries and staging, not freeze an
   already pursuing enemy in front of an input-locked player.
8. Apply release/door effects through the interaction/physics authority. Implement
   explicit unlock/stable restore; satisfying the old lock requirement alone does
   not unlock a door. Preserve initial hinge poses and per-hide collision rules.
9. Extend the actual save slot/Continue adapter with the complete world checkpoint
   transaction: validate first; cancel scopes; replace attempt; restore doors,
   physics/navigation, safe player/actors, core, act audio/light; then Ready.
   Never expose half-restored state or mistake the core codec for that transaction.
10. Complete the acceptance matrix in [PRODUCTION.md](PRODUCTION.md), including
    measured fresh/restarted real chapter recordings and all safe checkpoints.

## Verification and evidence

Command and browser results are recorded in the phase evidence README. All
evidence is explicitly classified as existing-game preservation or isolated
systems QA. Neither is a completed Chapter One playthrough.

The new logic has no pathfinding implementation, recurring wall-clock timer,
animation loop, context allocation or unbounded history. Nurse reuses existing
bounded navigation. Camera keyframes/cues and persistence arrays are bounded;
noise queues cap at 128. Production bundle/assets and engine still use the
existing renderer and mixer. Full new-map/chapter hardware performance and memory
stability remain unmeasured until assembled content exists.

The isolated real-hospital capture/restart rerun kept **39 tracked listeners,
359 geometries and 77 textures** across three restarts, with 225 live collider
instances per attempt. Scene draw calls were 183 at the matched Room 104 view and
235 with the Patient in view. Software WebGL recorded first-visibility render
spikes of roughly 4–9.6 seconds; these are renderer/asset costs, with fixed-stage
maxima at 0–0.1 ms in those ready-state samples. This is not an AI chase benchmark
or evidence of smooth laptop performance. The new map's asset/lighting work still
needs a hardware route/soak profile. Earlier frame-wait and flicker sampling
failures under software rendering are retained in the evidence report.

## Remaining work and blockers

- **Claude dependencies:** approved Fractured Ward map, usable floor transitions,
  actual interaction/trigger/route/zone/checkpoint bindings, physical Nurse service
  separation, five camera/animation assets, art-directed act lighting and original
  approved voice/audio production. See MAP-AND-ASSETS.md and CLAUDE-HANDOFF.md.
- **Codex integration:** chapter/encounter controller, Patient lifecycle staging,
  collision-authoritative door unlock/restore, full checkpoint transaction and
  live Save/Continue integration; frontend journal/subtitles and pause wiring.
- **Multi-level traversal:** current AI navigation is planar. Do not enable the
  Patient across gallery/tower levels without explicit floor links and tests.
  Validate player stair collision ramps/steps: there is no jump/autostep feature.
- **Recovery obligations:** interrupted release must replay its safe reveal or
  restore the pre-Patient snapshot before free control; don't abandon a committed
  mechanism with no actor handoff. Keep completed checkpoint state terminal.
- **Acceptance evidence:** no new-player measured chapter duration, full fresh or
  restarted chapter playthrough, final low-quality visibility review or hardware
  chapter performance/memory soak. Voice recordings are not delivered by this phase.

No modification to Claude-owned production files and no merge to main is required
to review/test this independently useful phase.
