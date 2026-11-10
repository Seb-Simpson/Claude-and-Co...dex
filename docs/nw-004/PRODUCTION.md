> **Historical NW-004 proposal — superseded by NW-005D.** This is retained development history, not current Chapter 1 canon or an implementation brief. Nurse Shaw is Chapter 1’s antagonist; the Patient is reserved for much later. The Patient climax below is withdrawn. See [current opening policy](../nw-005d/NARRATIVE.md).

# Chapter One production and acceptance plan

This plan preserves the entire NW-004 specification. The isolated logic phase is
not a replacement for the authored chapter. Every later phase requires integration
against the same accepted interface revision and a separate, reviewable PR.

## Phases

| Phase | Deliverable | Independent acceptance | Dependencies / status |
| --- | --- | --- | --- |
| 1 — narrative and independent gameplay systems | Audit, treatment/timeline/dialogue, semantic map/asset handoff, proposed ports, deterministic puzzle/progression/journal/core checkpoints, real camera/input lease, reusable cinematic/dialogue transport and five timing templates, staged Nurse lifecycle and tests | Causal route succeeds; invalid/out-of-order input cannot bypass gates; no irreversible puzzle failure; normal/skip commits match; recovery rejects invalid state; camera/voice scopes clean up; Nurse uses actual navigation/perception; baseline game remains intact | This PR; no finished-chapter claim |
| 2 — production interfaces and adapters | Agreed v1 ports; chapter/encounter orchestration using phase-one APIs; collision-safe door unlock/restore; safe full-world checkpoint transaction; frontend subtitle/journal/pause and Save/Continue migration | Real registry lifecycle; same camera/loop; cancellation/restart/title/pause safe; atomic restore; no stale input, audio or listeners | Both owner acknowledgements required before map-dependent parallel work |
| 3 — West Ward authored content, in parallel with phase 2 after agreement | Claude's archive/electrical/release/observation spaces, Blender props, readable documents, camera paths/animation, act lighting, performed voices and audio | Binding preflight passes; all objectives physically reachable; two escape routes navigate; door/hide identities migrated explicitly; Low visibility/performance verified | Claude-owned production work; missing at baseline |
| 4 — complete chapter assembly | Opening → Nurse → record/power → Patient → ending, journal, full checkpoint and Continue flow | Actual start-to-finish controlled play; every scene skip; every checkpoint; capture/retry; no softlocks or unavoidable capture | Phases 1–3, no placeholder voice/staging accepted as final |
| 5 — polish and acceptance | Fresh and restarted recorded runs; pacing revision, accessibility/graphics checks, stability and performance report | Complete QA matrix below with measured first-time timing and evidence | Actual combined chapter, not a semantic test harness |

Do not automatically merge any phase. Branches start from the latest accepted
integrated main or explicitly recorded dependency base. Do not overwrite Claude's
concurrent work. If a new production binding is needed, revise the interface in
one coordinated commit rather than silently adding another protocol.

## Feature acceptance matrix

| Requirement | Implementation owner / phase | Required acceptance evidence |
| --- | --- | --- |
| Complete internally consistent narrative, knowledge, chronology and motivation | Codex / 1 | Treatment, causality table, exact readable document text; identity contradiction supported by more than room number |
| 20–30 minute first-time target, no filler | Both / 5 | Fresh player's actual route/recording; separate controlled play, document/journal, cinematic, pause/loading and retry times |
| Opening darkness, breathing/vent/monitor, natural ceiling/fixture/monitor/band/door staging, exact intercom | Claude assets + Codex playback / 2–4 | Real camera path in Room 104; no snap; subtitles and recording synchronized; normal, skip, restart and Continue tested |
| Act I natural tutorial, failed help attempt and reason to leave, no attack | Codex direction + Claude props / 3–4 | Early exit and station fallback work; movement/inspection teaching unobtrusive; both enemies dormant |
| Nurse supernatural introduction and fair survival | Codex AI/director + Claude staging/audio / 2–4 | Real nav/hearing/close vision/search/recovery; hide and quiet escape both work; witnessed hiding can be investigated; no teleport or hidden player lookup |
| Logical records/security puzzle with all clues | Codex logic + Claude world / 1, 3–4 | Clues physically readable; handle naturally exposes old record; resettable overload; optional exploration-based hints; no random order guessing or lost consumables |
| Patient climax with readable alternate paths | Codex AI/director + Claude map/reveal / 2–4 | Dormant physical staging; alarm/LOS/sound acquisition; real obstacle-aware pursuit, corner loss, search, hide, escape and continue; fair skip/retry grace |
| Ending recognition and completion | Both / 3–4 | Actual released stair threshold → safe landing; same permanent ID; physical escape remains earned; completion checkpoint and Continue; no Chapter Two |
| Believable extended West Ward with landmarks and equipment | Claude / 3 | Authored map, Blender sources/exports; logical doors/numbering; collision/interaction/hiding migrations and navigation tests |
| Act lighting, haze, controlled failures and emergency state | Claude / 3–5 | Distinct but playable acts; essential text/route visible on Low; visual screenshots; scoped effects reset on every checkpoint |
| Five reusable in-world cinematics | Codex transport/leases + Claude assets / 2–4 | Every normal/skip/interruption/pause/retry path; entity cues, timed subtitles/audio; no overlapping incompatible sequences or retained camera ownership |
| Human performed dialogue + direction sheet | Codex script, Claude production / 1, 3 | Required assets approved and intelligible; archived/current protagonist same actor; temporary status does not pass final acceptance |
| Room ambience, footstep acoustics, enemy direction, tension/chase/silence transitions | Claude audio + Codex cues / 2–4 | Settings affect all buses; gesture unlock; spatial listening tests; scoped ducking cleanup; pause/skip/restart correct |
| Objective notifications, compact journal, optional hints | Codex state + Claude presentation / 1–4 | Goals change only with causal facts/actions; transcripts retained; hint opportunities derive from exploration/mistakes rather than mandatory idle waits |
| Encounter director preserves genuine AI | Codex / 2–4 | Tutorial safe; no unfair cinema lock during pursuit; state-driven activation, staged introduction, tension recovery, no per-frame player-coordinate steering |
| All checkpoints + capture/retry | Codex / 1–4 | Start, after Nurse, after records/power, before Patient, completion; full doors/player/entity/puzzle/objective/cue restore before Ready; no duplicate loop/listener/audio |
| Preserve NW-003B frontend, settings, original assets and NW-002A verbs | Both / all | Existing suites plus menu → game → pause → resume → title, Low/laptop viewport and Save/Continue tests; no silent replacement |

## Real-browser QA matrix

This table is an acceptance prescription, **not executed results**. Execution
results belong in IMPLEMENTATION.md and the evidence directory with commit and
environment. Automated command-state tests do not establish a playable chapter.

| Run | Procedure | Pass condition |
| --- | --- | --- |
| Fresh first-time route | New Game, normal cinematics, environmental clues, Nurse survival, record, circuit reasoning, Patient escape, stair ending | Coherent goals, no unreachable actions, agency, fair reaction windows; measured duration; full recording |
| Second run | Title → New Game, skip each cinematic, choose alternate Nurse/chase route | All terminal effects once; no camera/input/audio leak; same viable ending |
| Checkpoint matrix | Restart/Continue independently from each of five checkpoints; repeat after capture/title/reload | Stable matching doors, puzzle/tool, clues/objective, actors, lighting/audio, consumed triggers; no half-scene restoration |
| Invalid puzzle states | Every destination/bridge/reserve/breaker combination, repeated reset and engage | Labelled reversible feedback; only correct armed state succeeds; release requires physical handle; later success stays latched |
| Nurse | Crouch/quiet path, sprint noise, corner, hidden entry unseen and witnessed, two different hiding spots | Credible hearing/LOS/approach; genuine search/recovery; cannot detect through all geometry or trap novice unfairly |
| Patient | Primary and maintenance route, closed doors/obstacles, corner loss, hide, capture, retry and escape | Valid paths; no direct wall crossing/teleport; no unavoidable instant capture; chase lifecycle and audio/lighting settle |
| Cinema matrix | All five normal, skip early/mid/late, pause/resume, interrupt to title, checkpoint reload | Exclusive lease, stable clock, cancellable voices/subtitles, validated same handoff pose; semantic commit exactly once |
| Frontend / audio | Menu/loading; gesture unlock; all sliders/mute/subtitle toggles; pause/resume/title; Continue | Preserved NW-003B appearance; all sound obeys mixer; no stuck silent/ducked bus or duplicate context/loop |
| Visibility / laptop | Low quality, 1280×720 and 1366×768; captions/journal; keyboard controls | Essential clues/doors/routes readable; HUD doesn't obstruct play; no giant waypoints or effect overload |
| Stability | Complete run + retries + at least 10 title/session cycles and a sustained active AI soak | No listener/physics/scene growth; bounded pathfinding; WebGL context cleanup; stable memory/frames after warm-up |

## Performance investigation protocol

Keep the current bounded local light pool and baked Room 104 shading as the first
hybrid candidate. Measure before adding shadows or post-processing. If selectively
adding shadowed key lights, compare matched camera/act captures at Low and High;
retain only changes that preserve navigation/text legibility and fit the measured
frame budget. A global shadow switch or arbitrary darkening is not acceptance.

Record engine stats, renderer calls/triangles/textures/geometries, simulation step
cost, navigation queries/cache hit/miss/plan duration and long frames during the
same route, including first-load versus warmed-up behavior. Record browser/GPU,
viewport, quality, duration and commit. Software Chromium/SwiftShader timings do
not represent ordinary laptop hardware; report them as automation capacity only.

Profile unexplained sustained slowdown with browser performance tooling: separate
GPU render cost, JS allocation/GC, pathfinding/physics, asset decoding and leaked
listeners/voices. Bound work without sacrificing reliable AI/collision. Test real
capture/restart/title cleanup and background-tab timing. The chapter core must not
add another RAF, wall-clock polling loop or unbounded event history.

## Required final delivery

The accepted chapter PR set must link the narrative/timeline, complete dialogue,
map, produced asset manifest with approvals, exact public APIs/integration changes,
test results, representative screenshots, **full actual chapter recording**, timing
breakdown, performance measurements and remaining known issues. All essential
voice acting, five cinematics, puzzle, genuine threats and progression must be
implemented before describing Chapter One as complete.
