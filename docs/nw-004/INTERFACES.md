# Chapter One interface proposal — revision 1

**Status: proposed; cross-owner acceptance pending.** This document is the
reviewable agreement requested before parallel dependent implementation. No
Claude acceptance is implied, and existing `src/contracts/` is unchanged.
Schema version 1 is for this proposal's serializable gameplay core. Accepting it
requires a recorded revision/commit acknowledgement from both implementation
owners and the coordinator before presentation/world adapters depend on it.

Claude's NW-004A **The Fractured Ward** is the target map. The authoritative
proposed semantic vocabulary and typed configuration are
`src/gameplay/chapter/bindings.ts` (`ChapterEnvironmentBindings`). They contain
no hospital coordinates. Wing A, atrium/gallery, station, treatment, Wing B,
Records/electrical, maintenance and multilevel Stairwell B are producer bindings,
not assumptions about the old corridor. Map-dependent choreography awaits approval.

## Dependency and registration

Keep the existing `GameModule` registry, one engine, scene, camera, Rapier world,
fixed simulation clock and rendering loop. The deterministic chapter core belongs
to `src/gameplay/chapter/`; it allocates no browser, physics or rendering resources.
Its commands are semantic inputs from validated adapters, not public permission
to bypass interaction range, collision, line of sight or story facts.

Do not add an unregistered `src/story/*.module.ts`: the actual discovery globs do
not include that directory. In the integration phase, the coordinator attaches a
chapter controller to the existing `createGameplayRuntime()` and application
session after world registration. The exact injection site is a shared change to
be accepted here, not a second composition root. Chapter mode must be opt-in until
required bindings and production assets pass preflight.

## Ownership for the proposed work

| Files | Single writer | Consumer / review |
| --- | --- | --- |
| `src/gameplay/chapter/**`, `tests/chapter/**` | Codex | Claude reads public exports only |
| Player camera/control leases, interaction unlock/restore in `src/gameplay/**` | Codex | Coordinator validates session lifecycle |
| Actor activation/reset and actual AI in `src/entities/**`; physics adapters | Codex | Claude uses public actor cues, never moves an active agent root |
| World geometry/metadata, new room/trigger/interaction/staging anchors in `src/world/**` | Claude | Codex validates collision/navigation/bindings |
| Camera path assets, entity animation, look/lighting profiles, dialogue audio in `src/horror/**`, `src/atmosphere/**` | Claude | Codex owns semantic completion and control handoff |
| New shared chapter port declarations, if accepted | Coordinator, one dedicated commit | Both acknowledge revision before consuming |
| Application checkpoint transaction / registration in `src/integration/**` | Codex acting as integration engineer, after agreement | Claude does not edit concurrently |
| Save-slot payload/Continue adapter in `src/frontend/saves.ts`, frontend bindings | Coordinator-assigned single writer, proposed Codex | Claude reviews preservation of NW-003B presentation |
| Journal visual presentation / frontend styles | Claude | Codex supplies read-only journal projection and commands |
| `src/main.ts`, existing foundation contracts/configuration | Coordinator only when necessary | No planned change for the isolated logic phase |

The new ownership rows supplement the foundation document; they do not grant
either agent permission to overwrite the other's existing implementation.

## Versioning and identifiers

Use a serializable envelope with a literal schema version and content revision.
Reject unsupported future versions and corrupt or causally impossible saves before
mutating the live session. Migrate the existing metadata-only Room 104 save to the
new chapter-start checkpoint, not to invented later progress. Keep settings and
the existing save slot; do not introduce a disconnected second Continue system.

Stable semantic names are defined with the chapter core's exports; production
bindings map those names to actual world IDs. Existing `nw:*` IDs are preserved.
Map additions and migrations are listed in [MAP-AND-ASSETS.md](MAP-AND-ASSETS.md).
Proposed checkpoint names: `chapter1.start`, `chapter1.after-nurse`,
`chapter1.after-records-power`, `chapter1.before-patient`, `chapter1.complete`.
Cinematic names use `c1.cine.awakening`, `c1.cine.nurse-reveal`, `c1.cine.record`,
`c1.cine.patient-release`, `c1.cine.ending`.

## Proposed ports for the production integration phase

These are behavioral requirements, not claims that the current runtime exposes
the ports. The first-phase core APIs are listed separately in IMPLEMENTATION.md.

### World bindings v1 — Claude produces; Codex validates

Publish the actual `ChapterEnvironmentBindings` fields from `bindings.ts` through
the agreed module adapter: schema/content versions, world ID, revision, rooms,
interactions, triggers, anchors, doors, actors, cameras, voices and lighting.
Each reference carries a unique semantic name and actual stable world ID. Anchors
and triggers resolve unique named Object3D nodes under `HospitalWorld.root`.
Data-only anchors such as Claude's published `HospitalExtras.staging` can instead
be supplied to `validateChapterBindings()` through `ChapterBindingSources.anchors`;
the binding keeps the original staging ID, with no copied coordinates.
The future spatial adapter resolves feet poses and authored trigger bounds from
those nodes/assets. Coordinates use metres, +Y up and yaw zero toward −Z. Camera
assets supply configurable eye paths. Acoustic portals, volume geometry and
floor-aware route segments need an agreed adapter extension, not guessed metadata.

Required bindings include both copies of the intake notice, failed room/station
call, station ledger, release procedure, records operating pack and receiver,
panel controls/schematic, local mechanical release, stair recognition, all safe
checkpoint anchors, real Nurse/Patient routes and five cinematic paths. Missing
bindings fail chapter readiness with specific diagnostics; they are never replaced
by hidden triggers in unrelated props or colliders disabled globally.

### Camera/control lease v1 — Codex implements; Claude stages

Acquire one exclusive camera owner with an abortable lease. It suppresses mouse
look, locomotion, interaction and player noise while maintaining the real body
and collision. Do not use `setCaptured()` or fake hiding as an input lock.
The regular player render update yields camera ownership during the lease.

Start/end eye poses must match the actual player camera within agreed tolerances.
Skip blends to the same validated handoff pose; it does not snap to another room.
Reset velocity and held input before release. A lease is released exactly once
on complete, skip, interruption, capture, title transition, failed setup and dispose.
Frontend pause freezes the same cinematic clock, audio and entity state; resume
does not advance wall-clock subtitle time or replay already dispatched cues.

### Cinematic playback v1 — Claude renders; Codex commits story state

`play(id, {signal, startPose, context})` returns a handle with `skip()`, `pause()`,
`resume()`, `cancel(reason)` and a single settled result: completed, skipped or
interrupted. It owns camera sampling, animation, subtitles and scoped audio/effects.
It emits named presentation cues; no cue directly changes objective state.

Only the chapter controller applies the semantic terminal result. Complete/skip
share one idempotent commit; interrupted playback never commits completion and
releases all scoped resources. Before playing, validate staging/collision,
exclusive cinematic ownership and an appropriate AI safety policy. Never freeze
an already pursuing enemy in front of a locked player to play a document scene.

Skipping opening grants wristband knowledge. Skipping the record retains every
essential fact and transcript. Skipping the Patient scene commits door/alarm
release exactly once and gives the same fair separation/grace. Ending skip commits
completion. Loads restore a safe checkpoint, not half a camera path.

### Encounter actor v1 — Codex owns decisions and physical pose

Support dormant → staged → active lifecycle, scoped capture inhibition during
intro staging, and safe-checkpoint reset. Dormant agents consume no player noises.
Activation clears stale perception/timers. Staging may set a dormant/restoring
actor at a validated authored anchor; **it must reject teleporting an active AI**.

Normal active movement uses the existing physics/navigation/perception. The Nurse
uses local hearing, weak close vision and a documented real service-door boundary;
she can inspect witnessed hiding and lose an unseen concealed player. The Patient
investigates the release chime, acquires the player credibly, searches last known
position and can lose them. Director requests a tension phase, never a per-frame
player coordinate. If staging is unsafe, defer the encounter rather than warp it.

### Interaction / door state v1 — Codex owns collision authority

Provide explicit unlock and stable-state restore operations on the interaction
system. Restore locked/closed/open states before enabling play, updating collider
and hinge pose together from the actual initial pose. Reject occupied closure or
invalid IDs. Puzzle controls issue validated semantic commands; they do not rotate
world meshes themselves. The mechanical egress latch stays released after success.

### Checkpoint transaction v1 — Codex with coordinator

A snapshot contains chapter core state, validated player safe anchor/pose, all
relevant door stable states, puzzle/tool state, entity safe presets, act lighting/
audio profile, completed cinematics and consumed narrative triggers. Include
schema, content revision and world-binding revision. No arbitrary mid-chase save.

Restore order: validate complete candidate payload before disrupting the current
attempt → fade/input lease → cancel cinematic/dialogue/effects → dispose old
session resources/subscriptions → build world/physics
→ apply doors/puzzle before navigation → safe player placement → dormant/staged
actors → chapter/atmosphere/audio projection → release to ready/play. On failure,
stay in a recoverable menu/error state; never expose a partially restored game.
Reuse the engine and its one loop. Only replace the attempt-owned resources.

The pure gameplay checkpoint in phase one is **not** this full transaction. It
does not prove current Continue restores the world; that adapter remains required.

### Dialogue / audio v1 — Claude produces; shared mixer remains authoritative

Cue metadata: version, ID, speaker, exact text, subtitle segments, expected length,
spatial mode/anchor, existing mixer route, priority, production state and asset
reference. Status is not-recorded / temporary / recorded / approved. A filename
without a supplied recording is not an asset. Required acting blocks final chapter
acceptance until approved. No browser speech synthesis as finished presentation.

Route dialogue, Foley, ambience and chase music through `audioOutput()` and existing
settings. Playback handles stop/pause/resume and restore any ducking on every exit
path. Silence is scoped, not a permanent global volume mutation. Sound captions
are distinct from dialogue. Existing `emitSubtitle()` is a delivery mechanism,
not the cinematic clock; replace wall-clock hiding with timeline-owned cancellation
in the integration phase while preserving the subtitle preference.

### Journal / frontend projection v1

Codex projects main objective, newly completed objective, inspected clues, retained
document text and optional graduated hints. Claude renders a compact overlay and
keyboard-accessible journal. Opening it must follow a single agreed pause policy;
it must not silently stop a chase unless the entire game is paused. No giant arrows.

## Agreement checklist

Before cross-owner implementation, record both owner acknowledgements of: this
revision and source commit; the exact injection/port location; new and preserved
world IDs; checkpoint anchors; scene handoff poses; story/puzzle semantics; mixer
and voice statuses; save migration; and the single-writer table above. Amend the
proposal in one commit if production discovers a necessary change. Neither owner
should merge automatically.
