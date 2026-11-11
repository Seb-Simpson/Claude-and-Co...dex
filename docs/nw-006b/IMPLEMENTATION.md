# NW-006B — first directed Nurse encounter

## Baseline and scope

Branch `feat/nw-006b-nurse-stealth` starts at PR20's verified head **0f4f0f30292361c9b1b040b2a8d365566a686491** on `claude/nw-006a-nurses-station`. That commit contains PR19/NW005D at25d5dfa. The earlier assumption that NW006B already existed was corrected before this work; no prior NW006B implementation or tests were discarded. This PR is stacked on PR20's branch. No PR is merged to main, and PR15 remains excluded.

The baseline already supplied the real world/Blender station set, directional trolley and both hiding locations; shared-camera Room104 awakening, card/reader/door puzzle, two temporary Shaw recordings, menus/settings, milestone save slot; Rapier movement/hiding/door/navigation systems; and a reusable sound-sensitive Nurse AI with lifecycle, search, capture grace and witnessed hiding. What was missing was a normal-game station director, authored movement authority, a continuous station actor and encounter checkpoint integration.

No environment, Blender model, texture, lightmap, pipeline, renderer, main entry point or shared foundation contract is replaced. All new encounter locations come through `getNursesStationStealth(world)` and its named scene nodes. Room104 interactions/dialogue/camera remain the existing implementations.

## The directed sequence

| Phase | Trigger and action | Threat policy |
|---|---|---|
| Waiting | Existing distant corridor sighting remains at its published pose. Locked-door/card progression alone does not start a station patrol. | One reserved Nurse capsule and the existing visual; no perception, hearing, hiding witnesses or capture. |
| A: Introduction | Unlocked/awakened player reaches the observation area. Segment crossing catches fast arrivals; already-past-entry recovery catches late/legacy checkpoints. Shaw walks from the existing sighting through the published east entrance route and spends3s checking the call panel from its visible entrance-side waypoint. | Authored targets use the existing navigation and capsule movement. Player input/camera remain free. No detection or capture. |
| B: Controlled tension | After that action, Shaw deliberately departs toward the back of the station and repositions along its west/centre route. Two short contextual notifications point out the linen cover and105/locker concealment. | At least8s of safe active play and a safe separation before autonomy. No mandatory random patrol cycle or forced hiding action. Slow or unusual approaches remain nonlethal here. |
| C: Autonomous stealth | The introduction and learning opportunity have completed, with at least3.5m separation or actual concealment. The same actor is released to its existing patrol/perception/search FSM. | Real vision/FOV/physics LOS, recent sound observations, real hiding witnesses. First alert gives6s of capture protection; ordinary capture also requires its grace and dwell. |
| D: Escape | Player reaches the semantic exit volume. The director settles any chase, orders a physical return to the station and commits completion. | Pursuit stops; no later chase starts. Normal exploration remains available. |

The Nurse is Chapter One's antagonist. The Patient is not instantiated by this opening. Generic later-game AI/chase infrastructure remains available.

The authored entrance **continues the existing first-sighting Nurse**, rather than spawning a second Nurse or visibly repositioning her. One model and capsule persist across A/B/C/D. No camera grab, cutscene panel, opacity trick or player teleport is used. During A/B the listening/observation animation is reused as a restrained checking beat; this is not a bespoke pen/clipboard performance.

## Authority and boundaries

`EntityAgent.setDirective({target,speed,yaw?})` temporarily gives story authority over its current capsule. Movement still goes through the same obstacle-aware navigation and physics. `null` hands control back to the original AI. Authority changes discard earlier detection, last-known coordinates, hiding evidence, path state and queued noises; story-phase sounds cannot poison the later stealth encounter. The actual player provider is never falsified or moved to make the enemy ignore them.

The Nurse wrapper retains its original staging, occupancy checks, unique chase IDs, audio hooks and synchronous cleanup safeguards. Existing callers without directives behave as before. Directed and autonomous actors share the existing entity snapshots; presentation does not own simulation.

The station director uses the union of the published station/105 room bounds and the authored corridor leg as its permitted enemy domain. It rejects out-of-domain AI navigation/search targets and stops pursuit when the player leaves the domain. The Nurse physically returns to the station; the player encounters no invisible movement barrier. Room104 remains outside this domain. The trolley is not converted into an invisibility flag: crouching is concealed from the station's west/centre, and the east gap remains exposed. Staff-locker and105-under-bed hiding use the unchanged occupancy, physical entry/exit checks and witnessed-entry logic.

Base `EntitySystem` agents remain disabled when this encounter owns the Nurse, preventing duplicate Nurse/Patient actors. In station-equipped worlds, `runtime.station.canCapture` is the authoritative capture policy; the older `opening.onboarding` gate continues to describe the preceding opening handoff and does not authorize a duplicate base-system actor. Hosts should use the station phase/capture port for this encounter; worlds without station bindings retain their previous gate behaviour. The existing corridor visual is driven by the directed actor. Random horror scheduling remains deferred during this authored encounter; the hospital atmosphere module continues to supply light pools, room ambience and chase music through shared events. No duplicate audio context/listener, animation loop or new audio asset is introduced.

## Checkpoints and recovery

The existing opening save extension gains optional `station: {version:1, phase:'introduction'|'tension'|'stealth'|'complete'}`. Old Room104/exit/station records remain valid. Invalid phase/accessor/extra-field data is rejected and uses the existing safe-slot fallback. Phase transitions are milestones, not per-frame autosaves. Writes wait until queued Room104 dialogue has finished.

- Incomplete A resumes at the observation point and replays the unfinished entrance.
- B resumes safely with Shaw at the station; completed A is not replayed.
- C resumes at the observation point with fresh AI at the station and a capture-safe initial grace. No remembered concealed player position is serialized.
- Completion resumes at the exit with no hostile station AI or repeated introduction.

Restoration occurs during the existing loading/restart transition. There is no live player/actor relocation during the encounter. Room104 card, unlock, one-shot voice and106 state remain part of the same record. Doors/furniture are reconstructed from authored initial poses, with104's unlocked state restored by its existing adapter; arbitrary transient door swings are not serialized. The105 doorway is restored open, preserving the authored hiding access.

The existing frontend Continue/New Game/Restart and module lifecycle are reused. A real capture now reveals a restrained gameplay fade and focused restart control in the existing opening UI; the protected baseline had no capture screen because danger was never enabled. The control invokes the existing attempt restart, removes its listener on disposal and adds no second canvas or loop. One attempt disposes the station's event subscriptions/AI capsule before its shared physics world, UI and scene are released. Pause suspends game fixed updates and the existing audio context, so authored time and body movement do not advance.

## APIs and future reuse

- `src/gameplay/encounters/director.ts`: `createEncounterDirector<P>(phases, restored?, transition?)` → `EncounterDirector<P>` with `phase`, `elapsed`, `tick(dt)` and ordered/idempotent `advance(expected)`. No world/camera/AI dependency. Different future authored/stalking/survival/chase styles can provide their own phase lists/adapters without replacing this state authority.
- `src/gameplay/encounters/nursesStation.ts`: `createStationEncounter(StationOptions)` → `StationEncounter`, exposing `canCapture`, `snapshot()`, `fixedUpdate(frame)`, `witnesses()` and `dispose()`. GameplayRuntime gains optional `station` and exposes its existing `navigation` provider.
- `src/gameplay/encounters/stationBindings.ts`: `resolveStationBindings(world)` validates/adapts the producer's accessor and computes the encounter domain. No copied hospital coordinates.
- `src/gameplay/encounters/checkpoint.ts`: `StationCheckpoint`, `StationPhase`, `STATION_PHASES`, `validateStationCheckpoint(raw)`.
- `src/entities/entityAgent.ts`: `EntityDirective`, `EntityAgent.setDirective()`, `getYaw()`, optional perception/capture policy callbacks. `NurseEncounter` forwards these capabilities.
- `OpeningSequence.directNurse(pose)` and `saveStation(checkpoint)` connect the existing opening's model/save owner; the UI and camera lease remain unchanged.
- Opt-in QA snapshot `station` reports phase, actor, elapsed time, first-alert state, semantic locations and read-only navigation waypoints. It has no advance-phase or move-actor command. Existing `entities` lists base-system agents; the one managed Nurse is reported separately as `station.actor`.

The physical pose is simulation state, never inferred from a mesh animation. Sound hooks reuse existing spatial `nw:wheel-creak`, `nw:curtain` and rate-limited `nw:distant-steps` cues through `atmosphere:sound`. Real chase start/end events drive the existing atmosphere score/lighting. Master/SFX/music volume settings remain authoritative. No new spoken lines are added.

## Deliberate compromises and unfinished production

- The existing first-sighting pose is the entrance's starting pose. A wholly new unseen entrance would require an approved authored staging anchor; no hidden room coordinates are invented here. The existing visual is never respawned in front of the player.
- Important phases are ordered and deterministic, but the player's view is free. Looking away can miss a visual beat; sound and movement invite attention without forcing the camera.
- The exit remains physically open. A very fast player can leave the encounter domain during the safe authored section; its ordered beats settle and completion commits after the learning opportunity. We do not add an arbitrary wall or punish fast exploration with a surprise capture. The standard walkthrough deliberately observes the introduction and exercises actual stealth/hiding.
- The panel-check beat faces the authored call-panel lamp when loaded (or the published back-station landmark in procedural fixtures) and uses the existing observation pose, not a new authored arm/pen animation. Bespoke staging/voice production remains an art follow-up. The two Room104 recordings are still explicitly temporary.
- Checkpoints restore canonical safe milestone placements and initial door poses, not an exact in-flight chase or every incidental door state.
- No later Chapter One chase, records puzzle, new enemy type or full chapter ending is implemented.
- Browser/real-GPU/human-playtest results must be read in REPORT.md; unit results alone are not a claim of final playability or performance.
