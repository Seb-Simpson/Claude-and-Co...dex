# NW-005B — Room 104 opening gameplay

This branch is an independent draft based on main `e36a3a3161ccba2a508d0406a453eca619f15549`. It neither includes nor changes PR #15. The current main menu, renderer, character controller, physics, interaction raycast, world data and Blender sources remain in place.

## Activation and launch

```
npm install
npm run dev
```

The normal `/` entry keeps the existing NW-003B menu. Opening gameplay activates automatically when the registered world publishes all ten NW-005A scene bindings. Current main lacks those bindings and keeps its previous gameplay. To exercise this branch independently, open:

`http://localhost:5173/tests/browser/harness/room104-opening.html?test=1`

This deliberately labelled synthetic test room is development-only and is not a substitute hospital. Add `&menu=1` to exercise the existing title/Continue flow. It is not part of the production build.

Final integration: combine the reviewed NW-005A and NW-005B branches in a separate integration branch; no main.ts edits or asset copying are required. Read the complete scene contract below. Run both owners' tests, then repeat the walkthrough in the assembled hospital. No automatic merge is authorized.

## Walkthrough

Enter ward. A short dark-to-reclined-to-standing camera move plays on the existing camera. Space skips with a blend; Escape pauses, including access to settings. No dialogue or objective panel is shown during awakening.

Try Room104's locked exit. Its handle presses without moving the physical leaf; the lock clicks, then Shaw asks the patient to return to bed. Trying again gives mechanical feedback without another line. Examine existing furniture as before. Find and take E. Shaw's card. The card disappears and a short acquisition notice appears. A reader attempt before possession denies access. Using the reader with the card releases the lock, flashes its indicator and queues Shaw's second line. Speech is serialized, so a quick unlock never cuts off line one. The existing door interaction now opens/closes the actual leaf and kinematic collider.

Walk into the corridor. Room106's handle can be tried; its leaf stays closed. Looking toward the station from the published sightline can reveal the Nurse. This is a brief non-attacking presentation using the existing Blender Nurse asset, not an AI chase. She withdraws only while unobserved. Walk toward the lit station. Control continues freely at the handoff, with no completion overlay, artificial wall, journal or objective markers.

## Exact public APIs

- `bindings.ts`: `OPENING_KEYS`, `OpeningKey`, `OpeningAnchor`, `OpeningBindings`, `resolveOpeningBindings(world): OpeningBindings | null`, `openingPosition(anchor): Vector3`.
- `adapter.ts`: `OPENING_INTERACTIONS`, `createOpeningInteractionAdapter(world, bindings): {world: HospitalWorld; dispose(): void}`. The shallow world view adds owned raycast targets; source definitions are unchanged.
- `state.ts`: `createOpeningState()`, `validateOpeningState(unknown): OpeningState | null`, `reduceOpening(state, command): {state; effects}`. Commands: awaken, try-locked-door, take-card, use-reader, try-106, see-nurse, reach-station.
- `checkpoint.ts`: `OpeningCheckpoint {version:1; milestone:'room104-exit'|'station-approach'; state:OpeningState}`, `createOpeningCheckpoint`, `validateOpeningCheckpoint`.
- `controller.ts`: `createOpeningSequence(context, runtime, bindings, checkpoint, save?): Promise<OpeningSequence>`. Sequence exposes copied `state`, `cinematic`, `anchors()`, `setPlaying`, `skip`, `notify`, `handleInteraction`, `update`, `dispose`.
- `ui.ts`: `createOpeningUi(document, settingsStore, interactLabel?): OpeningUi`. Methods: `update(state, deltaSeconds)`, `notify`, `subtitle`, `setDarkness`, `dispose`.
- `audio.ts`: `OPENING_VOICES`, `createOpeningAudio(audioService, subtitleSink): Promise<OpeningAudio>`. Methods: `queue`, `effect`, `update`, `pause`, `resume`, `dispose`; `idle` waits for queued/active speech. Cue IDs: `nw005.voice.shaw.return-to-bed`, `nw005.voice.shaw.not-authorised`.
- `scene.ts`: `createOpeningScene(world, bindings, physics, options?): Promise<OpeningScene>`. Methods: `setCardTaken`, `feedback`, `update`, `restore`, `dispose`. Optional injected Nurse loader is for tests.
- Existing `InteractionSystem`: adds `setDoorLocked(id, locked): boolean`, restricted to fully closed doors. `InteractionOptions.initialDoorStates` initializes visual+collider poses together; `handleInteraction` runs only after authoritative camera/range/LOS/action validation. Camera leases now also block externally queued interaction requests.
- Existing `GameplayOptions`: adds `openingPersistence`, `initialDoorStates`, `handleInteraction`, `onNotification`. `GameplayRuntime.opening` is optional. Only the factory activates opening content; classic worlds remain unchanged.
- Existing `Application`: adds `setOpeningPersistence({load,save})`. Its state transitions pause/resume the opening; its existing teardown owns disposal. Test snapshots optionally include opening state, semantic anchors and camera position.
- Existing `SaveStore`: adds `checkpoint(opening)` and optional validated `SaveRecord.opening`. Existing version1 metadata and legacy saves remain supported. Corruption returns safely to Room104.
- `INTERACTION_BINDING` in input.ts is the current binding code/label source. There is no remapping system on main; input and opening prompt both consume this source.

## Producer contract and remaining staging work

The consumer imports no files from Claude's unfinished branch. It reads `world.root.userData.nightWardHospital.opening` structurally and resolves unique named nodes. Every key must resolve exactly once; partial, duplicate, nonfinite or invalid door bindings fail clearly.

Required keys/nodes are `nw:opening:` followed by: player-spawn, room-104-door, card-reader, access-card, intercom-speaker, room-106-door, room-106-handle, nurse-first-sight, nurse-first-sight-view, station-approach. Published data may include `doorId`, `stand`, `target`, `points`. Node world transforms are authoritative, including the parented106handle. Door IDs come from data/metadata, never copied coordinates. Card visual: `nw:opening:access-card-prop`.

The existing contract's player-spawn is **beside** the bed. For final lying-in-bed composition publish one additional optional pose node, `nw:opening:awakening-eye`, at the patient's reclined eye, with its camera quaternion (+Y up, camera local forward −Z). The synthetic fixture supplies it. Without it the consumer provides a short spawn-relative reclined preview; this fallback is not final bed staging. The final handoff always returns to the real supported player body, with no camera snap. Keep the path to the standing spawn clear of close furniture; the final path requires visual review with approved assets.

The fused Blender lever hardware is adapted locally: only nearby visible hardware vertices are cloned/pressed and restored. Door leaf geometry/colliders do not jiggle or diverge. The106emptymarker alone is never treated as visible hardware. Reader feedback is an owned tiny indicator plane. A future independently parented lever/indicator would simplify this adapter; no source asset modification is required now.

No Nurse retreat route is published. The sighting is staged before entry and retires only when the full silhouette is unobserved/occluded; it does not invent a route or teleport in front of the player. She is nonphysical and can remain indefinitely if watched. An authored retreat route/animation can replace this presentation in the next section without changing AI or this puzzle state.

## Lifecycle, persistence and threat policy

Only the existing engine RAF/fixed loop runs. `Application` forwards playing/paused/captured/menu state to the opening. The camera transport owns input locking and validated handoff. Pausing stops the engine and suspends its shared context; subtitles and notices use host time. Skip still blends. Restart disposes the complete previous attempt and recreates physics, subscriptions, targets, camera/audio/presentation. Settings are live, including subtitle and SFX/master volume changes.

The existing frontend slot saves at exit and station handoff, after required queued speech finishes. Card/door/one-shot/corridor state is stored atomically. No checkpoint is created on each click. Before the exit milestone, retry returns to the fresh opening. Exit retry starts safely at the semantic player spawn with the card and released lock, omitting the awakening and completed lines. Station retry uses the supported station anchor. New Game resets everything. Malformed progress falls back to the legacy Room104 checkpoint. Audio-unlock/decode failure uses explicitly degraded subtitle preview after a short active-time grace; it cannot prevent checkpoint creation.

For an opening-bound world, gameplay AI spawns are disabled and the autonomous sandbox horror director is intentionally dormant. The separate hospital lighting/atmosphere module is preserved. The only actor is the authored Nurse sighting. This prevents unrelated Patient captures or random scares during the safe introduction; later Nurse AI remains available unchanged for the next assignment. Classic worlds retain their previous AI and horror module.

## Assets

Two original hand-authored decorative SVGs (ink strip, worn rule) contain no text. Dynamic lettering uses the existing local OFL font packages. No menu imagery or typography is replaced. Two local temporary FLite speech WAVs are development timing stand-ins; see VOICE.md and their source/license manifest. They are not final voice acting and introduce no paid runtime/API dependency. Mechanical feedback is synthesized on the existing AudioContext/SFX bus. Existing Nurse GLB is reused read-only.
