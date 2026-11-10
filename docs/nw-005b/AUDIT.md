# NW-005B pre-implementation audit — 9 November 2026

Inspected before implementation. Branch `feat/nw-005b-room104-gameplay` starts at latest fetched main `e36a3a3` (PR #16). Actual remote: https://github.com/Seb-Simpson/Claude-and-Co...dex.git. Main includes NW-004 phase one (#13), NW-003B and NW-002A. PR #14's rejected Chapter One layout was reverted in `2768b05`, merged by #16. PR #15 remains separate; none of its Patient chase changes are included.

## Existing systems and intended reuse

| System | Actual main implementation | NW-005B decision |
|---|---|---|
| Movement/camera | gameplay/player.ts, Rapier character, pointer-lock input | Reuse; no new controller. Existing camera lease suppresses look, movement, noise and interactions. |
| Interactions | gameplay/interactions.ts, camera raycast, range and physics LOS, debounced KeyE | Extend with validated custom actions and trusted closed-door lock restoration; keep normal doors/hiding. |
| Inventory | No inventory; optional requirement predicate | One card possession flag in bounded opening state, no inventory UI/framework. |
| Cinematics | Merged gameplay/chapter/cinematics.ts, exclusive shared camera, skip blend, lifecycle cleanup | Reuse transport with a short opening-specific path; do not launch old 55-second chapter cinematic. |
| Narrative | Merged chapter pure state/checkpoint codecs/dialogue/Nurse library; not registered automatically | Reuse dialogue/cinematic infrastructure. Opening is a small versioned content extension; no whole-chapter objectives or journal. |
| Dialogue/subtitles | chapter/dialogue.ts + dialogueAudio.ts; frontend subtitles use wall-clock timeout | Timeline-owned opening subtitle sink respects settings, avoiding timeout drift while paused. Exactly two new Shaw cues, no old intercom/protagonist lines. |
| Audio | Lazy engine AudioContext, shared master/music/SFX mixer | Same context/mixer; intercom filtering, cancellable playback. No final Shaw recordings found. Temporary assets must be explicitly documented. |
| Checkpoints | Chapter core codec is progression only; frontend SaveStore v1 stores metadata only | Extend existing slot with optional validated opening payload. Save at meaningful exit/handoff milestones, never every click. |
| Pause/menu | Existing frontend stops engine and suspends audio, handles settings and restart | Preserve main menu, same renderer/session teardown. Forward opening pause/cancellation with no second RAF. |
| In-game HUD | gameplay/hud.ts has generic system font panels and permanent intro hint | Opening-specific understated image-based treatment, dynamic text, transient prompts/subtitles/item messages. |
| Keys | KeyE hardcoded in input; settings contain no remapping system | Share interaction binding label/code rather than inventing a remapping framework. |
| UI assets | NW-003B image-led corridor/menu artwork; Rock Salt, IBM Plex Mono, Barlow Condensed, Cormorant Garamond | Keep title unchanged. Reuse fonts and small original decorative gameplay assets. |

## Claude integration target (read-only inspection)

Fetched `claude/nw-hospital-environment-72phif` at `8e879de`. Read `docs/NW-005A.md`, `src/world/opening.ts` and related dressing. No environment commits are imported.

Published data: `world.root.userData.nightWardHospital.opening` (also exposed by `getHospitalExtras`). Named nodes: `nw:opening:<key>`. Keys: player-spawn, room-104-door, card-reader, access-card, intercom-speaker, room-106-door, room-106-handle, nurse-first-sight, nurse-first-sight-view, station-approach. Data includes stable IDs, room IDs, node, optional doorId/stand/target/points/yaw/pitch. Read actual node world transforms, especially the child 106 handle. No copied hospital coordinates.

Room104 is authored OPEN: startup must close both visual and physical door before locking it. Card visual is `nw:opening:access-card-prop`. Reader/card have no gameplay markers. Reader has no separate lamp node. The 106 handle marker is empty and the visible lever is fused into the Blender hardware mesh; rotating the marker alone is insufficient. An isolated owned presentation adapter must provide feedback without editing Blender files. Existing main Nurse GLB can be reused for a non-chasing sighting. Claude has no Shaw voice recordings.

## Scope and verification boundary

Main does not yet publish the opening markers. Production activation must require the complete semantic contract; incomplete contracts fail clearly instead of guessing coordinates. A dedicated development/browser fixture will exercise the same adapter independently. Final combined visual verification awaits NW-005A integration; a read-only temporary combined checkout may additionally verify compatibility. No changes to world, atmosphere, horror, Blender assets or scripts; no Patient chase or Chapter One layout work.
