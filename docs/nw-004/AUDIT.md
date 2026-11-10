> **Historical NW-004 proposal — superseded by NW-005D.** This is retained development history, not current Chapter 1 canon or an implementation brief. Nurse Shaw is Chapter 1’s antagonist; the Patient is reserved for much later. The Patient climax below is withdrawn. See [current opening policy](../nw-005d/NARRATIVE.md).

# NW-004: Chapter One — implementation audit

## Provenance and scope

This audit describes the repository before NW-004 implementation, at integrated main
**`7db740e83a9bd6e8b2b5acd1423bf4114e3980c1`**, which includes PR #12 / NW-003B
(`4ddf5f2`, the cinematic title screen, live corridor and original menu soundtrack).
The actual repository remote is
`https://github.com/Seb-Simpson/Claude-and-Co...dex.git`.
The NW-004 work branch starts from that integrated main, not the older NW-002A branch.

This is a feature and integration audit, not a review of Claude's implementation quality.
Statuses below describe source and asset evidence. Existing automated tests were inspected;
this audit did not execute tests or perform a browser playthrough. Baseline command results
are recorded separately when run. Existing evidence under `docs/evidence/` is historical and
does not establish NW-004 verification.

**Chapter One is not implemented or complete at this baseline.** There is no measured
20–30 minute Chapter One playthrough, complete chapter recording, or evidence that all
requested chapter recovery paths work.

## Capability matrix

| Requested capability | Status | Baseline evidence and remaining work |
| --- | --- | --- |
| Vite / strict TypeScript / Three.js / Rapier / Vitest foundation | EXISTS | Existing `package.json`, `src/engine/`, shared `src/contracts/`, module registry and tests. Reuse the running application and shared services. |
| Actual hospital, Room 104 spawn and connected ward loop | EXISTS | `src/world/createHospitalWorld.ts`, `src/world/metadata.ts`, `src/world/layout.ts`, `src/world/rooms/`. Room 104 spawn is declared in `PLAYER_SPAWN`; the hospital has 19 semantic spaces, 223 colliders and 16 doors. |
| Required chapter map | PARTIAL | Room 104, other patient rooms, main corridor, nurses' station, treatment, maintenance passage and Stairwell B exist. `src/world/metadata.ts` has no dedicated records/archive or electrical/service room. Existing electrical panels are props in `src/world/rooms/service.ts`, not a security puzzle. Stairwell B is currently locked future expansion. |
| Integrated hiding locations | EXISTS | Four lockers and two beds are declared and used by gameplay. Child locker doors and invisible bed raycast markers are already handled. Existing actual-hospital interaction tests cover all six spots and safe exits. Chapter placement and encounter staging still need validation. |
| Blender-first asset pipeline and shipped assets | EXISTS | All five entity GLBs in `src/horror/entities/assets/` and the Room 104 / west-corridor visual set in `src/world/dressing/assets/` are present. `src/horror/entities/model/assets.ts` and `src/world/dressing/README.md` document loading/fallbacks. Blender and FFmpeg are available in the environment. Preserve these assets and their pipeline. |
| First-person movement, mouse look, sprint, crouch, collision | EXISTS | `createGameplayRuntime()` in `src/gameplay/runtime.ts` assembles the existing player, physics and interactions; `PlayerController` in `src/gameplay/player.ts` owns movement and camera updates. No combat is present. |
| Contextual door, drawer, cabinet and hiding interactions | EXISTS | `InteractionSystem` in `src/gameplay/interactions.ts` provides ray/range/LOS/requirements checks, door animation and collision-safe occupancy handling. Actual hospital tests cover inspection and door poses. |
| Narrative inspection / clues | PARTIAL | `GameplayOptions.inspectionText` and `src/integration/hospitalInspection.ts` show static inspection messages through the HUD. There is no collected-clue state. Room props include a stopped 03:17 clock (`src/world/core/textures.ts`) and decorative wristband (`src/world/rooms/patientRooms.ts`), but no required wristband text, discharge notice, failed call-button sequence or corresponding chapter inspections. |
| Complete narrative treatment and chronology | MISSING | No complete Chapter One treatment or causal act progression exists at the audited baseline. Write and agree it before building story content. |
| Objective / journal / hints / puzzle progression | MISSING | No chapter objective state, compact journal, timed optional hints, logical records/security-circuit puzzle or persistent story progression was found. |
| Patient obstacle-aware AI | EXISTS | `src/entities/entityAgent.ts`, `entitySystem.ts`, `perception.ts` and navigation integrate credible vision/hearing, waypoint paths, pursuit, loss, search, recovery and hiding witnesses. `tests/integration/hospital-patient.test.ts` exercises the authored hospital. This is the reusable foundation, not a chapter climax. |
| Nurse gameplay threat | PARTIAL | `ENTITY_PROFILES.nurse` in `src/entities/profiles.ts` configures shorter vision and stronger hearing over the genuine shared FSM. Secondary entries are expressly framework profiles. Current application integration defaults to `activeEntityTypes: ['patient']`; there is no Nurse chapter introduction or encounter progression. |
| Encounter director and staged actor lifecycle | MISSING | Agents are instantiated once from world spawns in `createEntitySystem()`. Public methods are update, snapshots, hiding witnesses and dispose; no reversible activation/staging/checkpoint interface exists. Patient currently starts with the session rather than the chapter climax. |
| Existing atmosphere and horror effects | EXISTS | `src/atmosphere/` and `src/horror/` handle fog, pooled lights, flicker, ambience, tension/chase effects, entity presentation and anomalies through shared events. Preserve these modules. |
| Distinct chapter act lighting and controlled scares | PARTIAL | Existing atmosphere can render effects; it has no chapter act protocol or authored Chapter One lighting states. `LightRig` defaults to a bounded pool of 10 lights. Room 104 has baked light/occlusion combined with dynamic unshadowed lights; dynamic shadow maps are not enabled. This is a useful hybrid baseline, not evidence that expensive shadows/post-processing should be enabled. |
| In-world story cinematic system | MISSING | Existing `src/horror/scares/cinematics.ts` schedules lighting, sound, overlay and silence beats; it does not own camera paths, player input, dialogue, entity animation, skip or checkpoints. NW-003B menu cinematics are title presentation, not in-world story playback. |
| Awakening / Nurse / record / Patient / ending cinematics | MISSING | No five Chapter One sequences or their narrative staging/skip/recovery states exist. |
| Subtitle support | PARTIAL | `emitSubtitle()` / `night-ward:subtitle` in `src/audio/subtitles.ts` reaches the frontend and respects subtitle settings. `src/frontend/frontend.ts` hides lines with a wall-clock timeout; no shared dialogue timeline, cancellation handle or pause/skip synchronization exists. |
| Dialogue script and chapter voice assets | MISSING | No complete chapter dialogue script, voice direction sheet, chapter voice manifest or chapter voice recordings exist. Existing original menu audio is not chapter voice acting. Do not present replacement placeholders as finished performances. |
| Audio settings / mixer / existing ambience | EXISTS | `src/audio/mixer.ts` routes music and SFX through master settings and reacts live to changes. NW-003B includes the original menu soundtrack and presentation. Reuse the mixer and existing audio services. |
| Chapter-specific acoustic / dialogue cues | PARTIAL | Existing world ambience, entity sounds and chase effects provide foundations. Chapter cue IDs, timings, dialogue handles, room/act transitions and replacement-asset status need an agreed manifest. |
| Capture and fresh restart | EXISTS | Existing application/runtime capture, overlay and restart paths dispose the attempt and rebuild the session. Existing lifecycle tests check clean restart and single-loop behavior. |
| Full chapter checkpoints and failure recovery | MISSING | There is no restore payload for objectives, puzzle, doors, actors, narrative triggers, cinematic completion, chapter lighting or audio. Fresh restart returns authored defaults. |
| Save / Continue | PARTIAL | `src/frontend/saves.ts` stores version-1 Room 104 checkpoint metadata, play time and sessions only. Continue invokes `app.newSession()` just like New Game; no chapter state is restored. |
| Menu → game → pause → resume → title, loading/settings | EXISTS | NW-003B builds on the existing application lifecycle. Preserve current title, corridor, soundtrack, loading plan, settings, pause/resume and engine reuse. Chapter persistence must connect to these systems explicitly. |
| Complete chapter QA and measured duration | MISSING | Existing foundation/gameplay/browser tests are substantial, but no chapter-specific tests, fresh/retry complete playthrough, full checkpoint matrix, chapter recording or player-controlled duration measurement exist. |

## Integration gaps that need explicit adapters

### Player control and camera ownership

`PlayerController` (`src/gameplay/player.ts`) exports `look()`, `setViewRotation()`,
`setCaptured()` and `setHiding()`. Its render update writes the shared camera every frame.
Captured and hiding are actual gameplay states, not general cinematic input locks.
`Application.pause()` stops the engine loop, which would also prevent a camera sequence
from advancing. Add a scoped control/camera ownership lease on the existing runtime;
do not create another camera, loop, fake hiding state or captured state for cinematics.

### Entity activation and checkpoint recovery

`EntitySystem` (`src/entities/entitySystem.ts`) has no activate/deactivate/stage/restore API.
`EntityAgent.stop()` permanently settles its active chase and stops the agent; it is not
a reversible encounter suspension mechanism. `EntitySnapshot` in
`src/contracts/entities.ts` contains identity/type/position/state/last known player only;
route cursor, timers, pending sounds, chase/capture bookkeeping and orientation are not
restorable from that snapshot. Agree a lifecycle and semantic checkpoint-reset port before
gating the Nurse and Patient by chapter state. Pursuit and searching must remain real AI.

### Door unlocking and restoration

`InteractionSystem` (`src/gameplay/interactions.ts`) exposes `getDoorState()` and
`requestDoorOpen()`, but no unlock or checkpoint restore operation.
`requestDoorOpen()` explicitly rejects an initially `locked` door before requirements
are evaluated: satisfying a requirement alone cannot unlock Stairwell B.
Door puzzle/restoration authority must update collision and visuals consistently and
respect occupancy. It must not directly rotate a Claude-owned mesh or globally disable
collision. Keep existing door IDs, initial hinge poses and hiding identities stable.

### Save and application lifecycle

`SaveRecord` v1 (`src/frontend/saves.ts`) contains only `version`, `checkpoint`, `label`,
`playSeconds`, `savedAt` and `sessions`. `SaveStore` has no checkpoint setter or payload.
`src/frontend/frontend.ts` calls `app.newSession()` for Continue and hardcodes the
Room 104 label in the pause display. `Application.restart()` / `newSession()` in
`src/integration/application.ts` recreate authored defaults; diagnostic snapshots are
not checkpoints. Restoration needs a validated transaction before ready/play, connected
to the existing frontend save slot with migration/fallback, not a disconnected second save.

### Module registration and event ownership

`src/integration/discovery.ts` discovers owned `*.module.ts` files in gameplay/entities/
physics/world/atmosphere/horror. A new `src/story/` module would not be discovered.
Existing `GameEvents` have gameplay/chase/atmosphere/horror events, not chapter/objective/
checkpoint/cutscene protocols. Extend the existing gameplay/integration architecture with
versioned ports and explicit ownership; keep one renderer, camera and application loop.

## Required versioned agreement before parallel implementation

The preproduction interface specification must define, at minimum:

1. Stable chapter, objective, inspection, puzzle, checkpoint, trigger and cinematic IDs;
   schema/content versions and a validated serializable progression state.
2. An environment manifest mapping those IDs to authored interaction anchors, trigger
   volumes, spawn/patrol/staging anchors and cinematic paths/animation references.
3. Cinematic playback handles with completed/skipped/interrupted results, cancellation,
   camera/control leases and deterministic once-only terminal state on skip.
4. Encounter activation/staging and safe checkpoint reset, with scoped capture inhibition
   during introductory staging while ordinary navigation/perception remain authoritative.
5. Collision-aware door unlock/restore authority and semantic puzzle commands.
6. A checkpoint envelope for player anchor, objectives/clues/puzzle, doors, actor state,
   cinematic completion, narrative triggers and atmosphere/audio act; apply before play.
7. Audio cue IDs, mixer bus, spatial anchor, speaker/subtitle, duration/completion/cancel,
   asset replacement status, and pause/skip behavior using the existing mixer.
8. A frontend save/Continue adapter and chapter/journal projection that preserve NW-003B.

Codex owns narrative progression, objectives/journal, encounter direction, AI integration,
checkpoint/puzzle logic and gameplay cinematic integration. Claude owns environment,
Blender assets, lighting/atmosphere, cinematic staging/animation and audio/presentation.
Shared adapter edits require an explicit file owner and agreed interface. Neither side
should replace the other's work or merge automatically.

## Existing test coverage inspected, not executed for this audit

| Existing test source | Relevant assertions found |
| --- | --- |
| `tests/gameplay/entities.test.ts` | Credible sustained sight; one chase lifecycle; loss/search/recovery; provider waypoints; blocked routes; bounded recent hearing; capture grace/dwell; unseen hiding; witnessed hiding approach; cleanup; secondary profile support. |
| `tests/gameplay/perception.test.ts` | Range/FOV/LOS; authoritative eye height; hidden/captured visibility; stale/invalid noises; occlusion; observation rules. |
| `tests/gameplay/pursuit.test.ts` | Actual Rapier/navigation pursuit, corner loss and sound investigation around a divider. |
| `tests/integration/hospital-patient.test.ts` | Authored Patient spawn and initial Room 104 safety; real vision/pursuit; maintenance door operation; hiding and full ward-loop patrol. |
| `tests/integration/patient-planning.test.ts` | Actual hospital patrol with moving maintenance doors over a sustained simulation. |
| `tests/integration/hospital-interactions.test.ts` | All six authored hiding spots; supported safe exits; LOS; actual drawer/cabinet inspection; initial door collider poses; trusted door requests respecting locks. |
| `tests/integration/witnessed-hiding.test.ts` | Real hiding approach, occupancy and blocked/unreachable inspection cases. |
| `tests/integration/lifecycle-frontend.test.ts` | Loading milestones; pause freezes player/entities/physics/audio; same-session resume; no duplicate loop; title teardown/engine reuse; clean restart; one-frame redraw. |
| `tests/frontend/services.test.ts` | Settings validation/persistence/fallback; mixer buses/settings; loading/preload behavior; Room 104 metadata save validation and play-time accounting. |
| `tests/browser/nw002a-integration.spec.ts` | Existing combined gameplay browser routes, doors/hiding, Patient pursuit/loss/capture/restart and cleanup coverage. |
| `tests/browser/nw-003-frontend.spec.ts` | Existing frontend/session flow. |
| `tests/browser/nw-003b-menu.spec.ts` | Latest title/corridor presentation, menu soundtrack/settings, loading into ward, return to title and reduced motion. |

NW-004 must add coverage for causal objective/puzzle transitions, duplicate/idempotent
triggers, actor lifecycle, every checkpoint restore, cinematic skip/interruption/restart,
Nurse survival/hiding, Patient climax escape/capture, chapter completion and Continue.
Browser automation should accompany real player-controlled playtesting and a recording;
it cannot establish first-time pacing or a 20–30 minute duration by itself.

## Baseline verification executed by the coordinator

The coordinator ran the following against the branch based on fetched integrated main
`7db740e83a9bd6e8b2b5acd1423bf4114e3980c1`, before chapter implementation:

| Command / check | Result |
| --- | --- |
| Fetch and verify latest integrated main | PASS — NW-003B is included at the full commit above. |
| `npm ci` | PASS — installed the committed, pinned dependency tree; `package.json` and `package-lock.json` remain unchanged. |
| `npm run typecheck` | PASS. |
| `npm test` | PASS — 307 tests passed and one optional pose-export test skipped across 38 test files. |
| `npm run build` | PASS — production output generated; Vite reports the existing large Three.js/Rapier chunk warning. |

An initially missing local font dependency came from stale `node_modules`; `npm ci`
resolved it without a repository change. It is not a source or lockfile defect.
The optional pose-export skip is not a verified pose-export result. The build warning
does not itself measure browser frame time, GPU performance or memory stability.

No new browser-success claim is made by this subsection. Browser baseline testing is
separate work; none of these checks verifies Chapter One content, pacing or completion.

## Preservation and acceptance boundary

Keep NW-003B menu/loading/audio/settings and existing shipped GLBs unchanged in the
gameplay implementation phase. Keep the world colliders, door IDs, interaction/hiding
anchors and navigation stable until a deliberate authored migration is agreed.
Investigate lighting cost against the existing bounded pooled/baked baseline before
adding shadows or post-processing. New assets and staging remain Claude-owned.

The baseline is a playable integrated survival-horror foundation. Chapter One still
requires coordinated implementation and full-chapter evidence; it must not be reported
complete based on the presence of reusable gameplay or presentation systems alone.
