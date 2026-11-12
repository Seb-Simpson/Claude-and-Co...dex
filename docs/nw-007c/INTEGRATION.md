# NW-007C integration architecture

Sources and merge audit: [AUDIT.md](AUDIT.md). The asset source is pinned; no geometry, Blender source, material authoring or NW-008 repair is performed in the integration changes.

## Ownership and action flow

The existing Narrative Director still owns the ordered seven opening milestones. The existing Encounter Director still owns `waiting → introduction → tension → stealth → escape → complete`. The Experience Coordinator still leases the one Nurse, camera and dialogue; no second director, actor or render loop is created.

`getStationStaging(world)` supplies the work stances, exact facing, reset key, lamp and record. `stationChoreography` consumes that published metadata, while the existing route and unseen staging checks retain authority over the entrance. A work-only optional `EntityDirective.arriveDistance` requests four-centimetre arrival along the real navigation path (contact eligibility tolerance: 6.5 centimetres); ordinary AI arrival remains unchanged. Movement uses the existing collision capsule. The actor must arrive and turn before the contact clip starts. A blocked stance retains A's nearby noncontact inspection fallback rather than moving through the player.

`createNursePresentation(visual, events, stationPoint)` owns authored playback on that same visual:

| Intent | Published clip | End / sound |
| --- | --- | --- |
| Physical approach | Existing speed-scaled gait; `turn` for an actual stationary turn | Contact events produce one heel sound each. |
| Panel action at verified work stance | `panel_check`, five seconds, one-shot | Actual clip completion; reset at the published 3.2-second press. |
| Record action at verified work stance | `records_read`, six seconds, loop | One full cycle, then explicitly clear; page at published three seconds. |
| Authored listening | `listen_brief`, 2.4 seconds, one-shot | Actual completion, then authored departure. |
| Autonomous investigation/search | `investigate` while moving; brief listening/idle breathing when stopped | Existing perception/navigation decides behavior and targets. |
| Capture | `capture`, 1.4 seconds, one-shot | Existing bounded camera/fade and public Retry; actual capture sound once. |

Durations/names come from the producer's `NURSE_CLIPS`; staging clip identifiers are checked against that contract. The director reads the live presentation clock/completion. Missing clips use their documented fallback and bounded timing; a stalled presentation cannot hold progression indefinitely. A noncontact fallback never plays a reset/page-contact sound or pretends to be the hand action.

The default visual wrapper forwards property descriptors rather than spreading a snapshot of `visual.clip`. The model's investigation gait now uses measured speed, including search/lost states; zero speed emits no phantom contacts. Animation never translates the actor. Capture preserves the real capture location (it does not teleport Shaw to the producer's isolated preview distance).

## Audio and lifecycle

All cues use the existing atmosphere event/mixer/context. No extra AudioContext or listener is installed. The published heels' synthesis gains a single-contact integration variant, `nw:shaw-step`; firing the original multi-step approaching burst for every gait event would duplicate footsteps. Keys/rustle accompany work, reset/page use actual clip times, and the station hum has one four-second repeat scheduler with its intended short tail overlap.

The presentation owns those Shaw-specific cues. `Ambience.stopCue` cancels active tails as well as future loop repeats, with global or positional addressing. Coordinator lease abortion, capture and disposal synchronously stop the station loop and gesture sounds before another owner starts playback. A capture emitted during an AI tick suppresses the stale normal presentation write at the end of that tick. Initial restored poses at setup delta zero do not request audio before atmosphere registration; the first real host tick starts the bed. Pause suspends the shared context and host clock. Capture lasts the published 1.4 seconds; its UI fade follows that same simulation clock instead of an independent CSS wall-clock animation. Reduced motion keeps the camera still, and skipping still exposes the public Retry button. Retry disposes the old mixer/clip/cue state and reconstructs from the validated semantic checkpoint.

Only A's narrative/encounter milestones are saved. No mixer, clip time, audio node, transient target memory or rendered object enters storage. New Game/Continue/Retry keep A's canonical byte-source and transactional world factory. No procedural-world fallback is restored.

## Read-only verification interfaces

- `OpeningSequence.nursePerformance()` / QA snapshot `opening.nurse`: actual requested/playing clip, time, duration, completion, availability, contact readiness, right/left wrist positions, foot-contact and action-sound counters, logical hum state.
- `world.root.userData.nwSoundDiagnostics()`: existing atmosphere owner's loop and voice summary. It is diagnostic metadata, not a story/save API.
- `OpeningSceneOptions.onNurseAction` remains an observation hook; integrated playback has one owner. A supplied `loadNurse` visual may omit optional clips and safely fall back.

The assisted contact audit freezes the real gameplay actor in its actual director-driven pose, measures weighted skinned hand vertices against the published targets, and moves only the observer/camera for inspection. Pause chrome is hidden only in those diagnostic close-up screenshots. It never poses/replaces/spawns the Nurse. The normal input-only walkthrough is separate and retains normal camera/input.

## Acceptance boundary

The initial B pin left head assembly and face/neck bake defects unresolved. Claude's later `ec4ed99` repair is now pinned and imported; independent integrated verification is required before removing that blocker. Actual director-driven close-ups also show hands hovering above the work surfaces. At the contact-cue sampling instants, the nearest strongly right-hand-weighted skinned vertex is 24.0 cm from the published reset-key point and 15.9 cm from the record point. These are point-distance samples, not a whole-clip collision/contact solve. No unreviewed IK, prop relocation or geometry deformation is applied to hide this; producer staging/animation alignment needs correction. Wrist/joint distances alone do not prove fingertip contact; use the skinned geometry measurements and close-up evidence. Overall NW-007 acceptance additionally requires the requested human playtest and hardware performance review. No automatic merge.
