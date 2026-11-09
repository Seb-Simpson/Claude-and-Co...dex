# NW-004 Chapter One: map and production handoff

**Fractured Ward handoff proposal v1 — production is not complete.** Baseline:
integrated `main` commit `7db740e83a9bd6e8b2b5acd1423bf4114e3980c1`.
Section 1 records the old ward as audited. It does not prescribe the NW-004A
floorplan. Claude owns the new **Fractured Ward** environment: Wing A/Room 104,
atrium/gallery, nurses' station, treatment department, Wing B, records/electrical,
maintenance and multilevel Stairwell B. The former south-extension coordinate
proposal and old-loop chase prescription are withdrawn. Exact new geometry and
approved routes are deferred to that authored map and its validated manifest.

Claude owns hospital geometry, Blender assets, lighting, cinematic staging and
audio asset production. Codex owns story conditions, puzzle state, encounter
direction, checkpoint persistence and gameplay integration. Neither team should
replace the other's implementation or merge automatically. Agree the versioned
chapter adapter and its binding identifiers before parallel runtime work.

## 1. Audited old ward baseline and reusable interfaces

All coordinates, room IDs, counts, spawns and routes in this section describe
the audited baseline only. They are migration evidence, not fallback positions
or an approved plan for Fractured Ward. The new map must publish actual bindings.

The existing world is `nw:hospital:ward-4-west`. Units are metres, +Y is up,
north is -Z, and yaw zero faces -Z. Published world bounds are
`min(-20.4,-0.3,-15.7)` / `max(22.8,6.1,8.3)`.

`createHospitalWorld()` publishes 19 room records, 223 collider definitions,
16 doors, four hiding lockers and two under-bed hiding locations. Its existing
`GameModule` loads the Blender set before constructing the compatible world.
No additional scene, camera, physics world or animation loop is required.

| Existing space / stable room ID | X bounds | Z bounds | Current purpose |
| --- | --- | --- | --- |
| Room 104 / `nw:ward4:room-104` | -15.6 to -11.2 | 1.55 to 6.4 | Player start; Blender visual set |
| Main corridor / `nw:ward4:corridor-main` | -20 to 18 | -1.4 to 1.4 | Main east-west ward route |
| East corridor / `nw:ward4:corridor-east` | 18 to 20.85 | -11 to 7.95 | Lift and stair approach |
| Nurses' station / `nw:ward4:nurses-station` | -6.8 to 0.2 | -6.4 to -1.4 | Staff workstation and first Nurse staging |
| Treatment / `nw:ward4:treatment` | 0.2 to 6.6 | -6.4 to -1.55 | Clinical clues and route landmark |
| Storage / `nw:ward4:storage` | 11 to 18 | -6.4 to -1.55 | Three hiding lockers |
| Service connector / `nw:ward4:connector` | -6.8 to -4.6 | 1.4 to 6.4 | West entrance to maintenance |
| Maintenance / `nw:ward4:maintenance` | -6.8 to 18 | 6.55 to 7.95 | Existing southern alternate route |
| Stairwell B / `nw:ward4:stairwell-b` | 18.15 to 20.85 | -15.4 to -11.15 | Locked future-expansion geometry |

Additional patient rooms are 101, 102, 103, 105, 106, 107, 108 and 110. There is
no published Room 109. Room ceilings are generally 2.75 m, corridor ceilings
2.7 m, maintenance 2.98 m and the stairwell volume 6 m.

The actual standing spawn is `(-12.4,0,4.1), yaw 0`. It is not an authored
awakening camera pose. Room 104 already has a static 03:17 clock, monitor,
fluorescent fixture and a decorative wristband; the requested wristband
inspection, discharge notice and broken call-button interaction are missing.

Existing interaction bindings:

| Binding | Current identity / function |
| --- | --- |
| Room 104 door | `nw:door:room-104` |
| West service door | `nw:door:maintenance-west` |
| East service door | `nw:door:maintenance-east` |
| Stair door | `nw:door:stairwell-b`, initially locked by `nw:key:stairwell-b` |
| Ward board | `nw:inspect:ward-board` |
| Station drawer | `nw:drawer:station-drawer` |
| Drug cupboard | `nw:cabinet:drug-cupboard` |
| Treatment cabinet | `nw:cabinet:treatment-cabinet` |
| Lift | `nw:inspect:lift`, out of service |
| Stair notice | `nw:inspect:stairwell-notice` |

The maintenance electrical panels at x=-2 and x=3.6 on z=6.55 are decorative.
The nurses' records shelves are furniture. Neither is an implemented electrical
room, archive room or security puzzle.

Existing hiding bindings must be retained or deliberately migrated:

| Hiding ID | Location / current feet position |
| --- | --- |
| `nw:hiding:nurses-staff` | Nurses' station, approximately `(-6.425,0,-4.15)` |
| `nw:hiding:storage-a` | Storage, `(11.375,0,-3.55)` |
| `nw:hiding:storage-b` | Storage, `(11.375,0,-4.2)` |
| `nw:hiding:storage-c` | Storage, `(11.375,0,-4.85)` |
| `nw:hiding:room-105-bed-b` | Room 105, `(-7.85,0,-5.35)` |
| `nw:hiding:room-106-bed` | Room 106, `(-10.1,0,5.15)` |

Locker doors are child objects named `door`. Bed interaction markers are
invisible raycastable meshes. Authored hidden poses overlap their assigned
furniture colliders intentionally; preserve per-spot collider exemptions, not a
global collision bypass. Preserve all safe exit candidates and occupancy state.

## 2. Fractured Ward: semantic requirements, geometry deferred

Claude determines the actual layout, elevations, connections, room numbering,
door hinges and footprints. Codex builds independently testable chapter systems
against semantic bindings. There are no guessed new room bounds, substitute
coordinates, mandated cardinal directions or assumed old-map route segments.
The following keys come from `CHAPTER_ROOMS` in
[`bindings.ts`](../../src/gameplay/chapter/bindings.ts), the single proposed key
authority. They are not actual world IDs or claims that a space already exists.

| Required semantic room key | NW-004A space / responsibility |
| --- | --- |
| `room-104` | Awakening and protected introductory evidence inside Wing A |
| `patient-wing-a` | Legible early exploration and retreat from Room 104 |
| `atrium` | Central architectural landmark with floor/elevation metadata |
| `gallery` | Distinct gallery space with visible connections and wayfinding |
| `nurses-station` | Assistance attempt, ledger/release procedure and first Nurse approach |
| `treatment` | Credible treatment department with intentional clues and hiding opportunities |
| `patient-wing-b` | Distinct later ward spaces connected to the real progression route |
| `records` | 2012 operating pack and exposed Patient 104 record; quiet inspection staging |
| `electrical` | Reserve-bus panel, schematic and quiet observation/reasoning zone |
| `maintenance` | Actual service connections, sight breaks and acoustic/physical boundaries |
| `release-vestibule` | Manual release socket/confirmation and a readable first escape decision |
| `patient-observation` | Dormant Patient staging with a real release door and navigable entry |
| `stairwell-b` | Multilevel stair geometry, floor-aware navigation and safe landing |

Each room key must resolve a distinct published room ID under the current typed
proposal; triggers and camera staging may describe finer subzones. A semantic
key cannot invent a room or collapse two story actions into an unrelated prop.
Additional levels require supported ramps/stairs and valid enemy navigation,
not a planar X/Z shortcut through floors. Capsule, floor, door-sweep and
navigation tests determine clearance requirements for the final assets.

```text
CONTENT / SAFETY FLOW ONLY — NOT A FLOORPLAN OR APPROVED ROUTE

Wing A / Room 104 tutorial
             |
Fractured Ward exploration: atrium/gallery, station, treatment, Wing B
             |
Nurse introduction -> real hiding/quiet-route recovery
             |
Records and electrical investigation -> local release confirmation
             |
Patient holding area opens -> two authored valid escape approaches
             |
Multilevel Stairwell B -> protected exit landing -> ending
```

Claude publishes final connections and route identities. The flow above does
not impose their geographical order, force redundant travel or bypass story
prerequisites. Final route approval remains pending production integration.

### Logical access and puzzle chain

1. Room 104 evidence motivates leaving to seek help. The ward board at the
   nurses' station explains why the normal lift/exit is unavailable and gives
   the documented emergency release procedure.
2. The electrical panel **arms the reserve bus only**. It neither opens the
   stairwell nor activates the Patient. Physical labels and a circuit diagram
   distinguish the reserve-security bus from nonessential ward loads.
3. Records contains the **2012 emergency operating pack** holding the removable
   mechanical release handle. Taking the handle exposes the old Patient 104
   record. This is the mandatory contradiction, not an unrelated collectible.
4. At the release vestibule, the player inserts the recovered handle and makes
   a separate, explicit final release confirmation. This action opens the
   stairwell and observation door and sounds the alarm. The reserve bus and
   handle are both required. An informative failure prompt explains a missing
   prerequisite without consuming the handle or leaving a half-released state.
5. The alarm introduces the Patient climax. The player escapes through the
   actual Fractured Ward routes to Stairwell B. Completion occurs on its
   validated protected exit landing, followed by the ending cinematic.

The environment must visibly support this mechanism: readable operating
instructions, correct circuit labels, a reserve-ready indicator and a deliberate
manual-confirmation affordance. Story owns why the shared emergency release
also opens observation; the set should contain corroborating labels instead of
silently treating it as an arbitrary malfunction. Do not retain a contradictory
key-and-padlock requirement on the stair once this migration is approved.

### Patient entry and two valid escape approaches

Use the typed `release-safe-boundary`, `patient-introduction-zone`,
`chase-route-a`, `chase-route-b` and `stair-safe-landing` trigger keys, with
`patient-stage` / `patient-emergence` anchors and the `observation-bay` door
binding. Actual Object3D names, rooms, routes and authored spatial data come
from the production handoff. The trigger references alone do not prove a path.
Neither escape approach is currently an approved or tested route. The old
maintenance/main-corridor loop is not a prescribed replacement for Claude's map.

Before enabling release, validate two physically continuous, readable approaches
from the release decision area to the exit landing using the actual player and
Patient capsules. Each needs real junctions/door states, sight breaks, floor
transitions and credible recovery opportunities. They may converge near the
stairs but cannot consist of two labels for one forced corridor. Neither may
require an optional item, unexplained timed door or unmarked crawl passage.
Publish route segments with actual room/portal/anchor IDs and measured traversal
results after map delivery, not speculative coordinates in this document.

The Patient remains dormant until final release, inside the authored holding
area. Open the real observation door and let him reach the authored emergence
anchor through navigation; do not move him directly to the player or reuse a legacy spawn
without validation. Reveal staging must give a real player-controlled escape
opportunity before high-speed pursuit. Measure both approaches with capsule
clearance, door times, speeds, elevations and difficulty parameters. Capture,
retry and genuine loss/search must work on the delivered routes.

### Nurse introduction and service boundary

Publish `nurse-introduction-zone` and `review-safe-boundary` triggers, the
`nurse-stage` and `checkpoint-after-nurse` anchors, a real Nurse route and nearby
concealment in the new map. Retain the existing entity identity where practical,
but do not require the old spawn or patrol coordinates. The first encounter begins only after tutorial evidence/exit
conditions permit it. Room 104 receives no unavoidable tutorial attack. Stage
the reveal with a visible retreat and an accessible hiding or quiet-route
choice; teach with environmental sound-dampening cues, not a wall of text.

Use `records-safe-inspection` and `panel-approach` trigger references for the
records and electrical areas; authored safe spatial zones and actual service
boundaries must support reading and solving. Claude supplies opaque door
leaves, matching live colliders, portals and acoustic seal/material metadata;
Codex uses them for sight obstruction, attenuated sound propagation and
navigation. A room tag cannot erase the Nurse's target or grant invulnerability.
Closed doors block pursuit and reduce sound; open doors expose real paths.
A blocked Nurse investigates credible evidence and recovers normally. Any
director-held door needs a visible reason, explicit release condition and a
checkpoint-restored state. Quiet puzzle zones must result from readable staging
and real boundaries, not freezing a pursuing enemy in front of the player.

The first Nurse checkpoint requires a resolved introductory encounter and a
validated quiet recovery position. Simply entering maintenance or pressing a
hiding key does not prove the player escaped. Normal sound-sensitive perception,
search and witnessed hiding continue to govern the Nurse thereafter; the
director must prevent an incompatible Nurse/Patient overlap during the climax
through staging and real boundaries, without teleporting an observed enemy.

## 3. Versioned adapter handoff

Use **one published `ChapterEnvironmentBindings` manifest**, defined by
[`src/gameplay/chapter/bindings.ts`](../../src/gameplay/chapter/bindings.ts).
That file is the sole proposed vocabulary, including `CHAPTER_ROOMS`,
`CHAPTER_INTERACTIONS`, `CHAPTER_TRIGGERS`, `CHAPTER_ANCHORS`,
`CHAPTER_LIGHTING` and `CHAPTER_VOICE_CUES`; `CHAPTER_SCENES` comes from
`model.ts`. This document explains those keys without defining another protocol.

The typed manifest carries `schemaVersion`, `contentRevision`, `worldId`,
`revision`, `rooms`, `interactions`, `triggers`, `anchors`, `doors`, `actors`,
`cameras`, `voices` and `lighting`. Room/interaction/door values reference actual
world declarations. Trigger values reference unique named `Object3D`s under
`HospitalWorld.root`. Anchor values can also resolve data-only producer staging
IDs through `ChapterBindingSources.anchors` (for example Claude's published
`HospitalExtras.staging`), without copying coordinates. They are **not typed trigger volumes,
camera zones or validated physical poses**. Actor bindings identify the actual
entity and nonempty route plus staging-anchor and introduction-trigger keys.
Camera bindings identify an asset and start/handoff anchor keys. Voice assets
carry their production status and a supplied asset reference.

`validateChapterBindings()` returns `metadataComplete`, `issues` and
`requiresSpatialPlaytest: true`. Metadata validation cannot assert floor support,
trigger extents, camera motion, audio loading, capsule clearance, navigability or
playable readiness. In particular, a named object called a safe boundary is not
evidence that the area is safe. Map-independent core tests do not resolve these
production requirements. Keep chapter mode inactive until the real adapters,
assets and spatial playtests pass; do not invent fallback positions.

| `CHAPTER_INTERACTIONS` keys | Required world-team content / gameplay use |
| --- | --- |
| `wristband`, `bedside-notice`, `bedside-call` | Readable introductory evidence and failed assistance request |
| `station-intake-copy`, `station-call`, `night-ledger`, `round-board`, `release-procedure` | Station evidence, unanswered assistance, shift information and emergency instructions |
| `records-pack`, `archive-receiver` | 2012 operating pack/handle, exposed file presentation and archival playback |
| `panel-schematic`, `observation-bridge`, `reserve-switch`, `destination-selector`, `breaker-reset`, `bus-engage` | Labelled reserve-bus reasoning puzzle with explicit control/state visuals |
| `handle-socket`, `release-confirm` | Handle insertion and separate atomic release/alarm confirmation |
| `stair-reader` | Recognition reveal at the protected exit landing |

| `CHAPTER_TRIGGERS` keys | Intended semantics; spatial production remains required |
| --- | --- |
| `station-entry` | Enter the actual nurses' station area |
| `nurse-introduction-zone`, `review-safe-boundary` | Fair Nurse reveal and evidence-based introductory recovery |
| `records-safe-inspection`, `panel-approach` | Records inspection and electrical approach/staging references |
| `release-safe-boundary`, `patient-introduction-zone` | Pre-release checkpoint boundary and real Patient reveal area |
| `chase-route-a`, `chase-route-b` | References associated with the two authored escape approaches; not navigation proof |
| `stair-safe-landing` | Protected, floor-specific Stairwell B completion landing |

`doors` uses `stair-barrier`, `observation-bay` and `service-boundary` as keys.
Each resolves a distinct published door ID. Actor bindings use `nurse-stage` /
`patient-stage` anchors and appropriate typed introduction triggers. No named
trigger completes a story action without core prerequisites and live
interaction, perception and safety checks.

### Required spatial/acoustic extensions beyond typed phase one

The current typed manifest does **not** contain acoustic portals, trigger extent
payloads, camera-zone geometry, detailed escape route segments or world-state
restore implementations. These remain explicit production adapter requirements,
to be added through an agreed extension rather than untyped surprise fields.
Claude must publish actual 3D trigger bounds/floors, camera paths and safe motion
zones, feet-pose transforms, door-linked acoustic seals and physical navigation
connections. Codex validates and consumes them. Multilevel regions cannot be
inferred from an old X/Z range or from a semantic name. Approval of metadata
vocabulary does not imply approval of this future extension or the final map.

No current shared `HospitalWorld` contract has chapter camera paths, dialogue,
puzzle state or checkpoint restore methods. Reuse its world metadata and the
existing atmosphere contracts; add the chapter adapter explicitly rather than
encoding unversioned story meaning in arbitrary mesh names or coordinates.

## 4. Checkpoint and cinematic anchor requirements

Claude supplies authored poses/paths; Codex validates them and restores state.
Each safe gameplay pose must pass capsule clearance, floor support, standing or
crouching requirements and door-sweep tests against the loaded production world.
Save a safe camera-to-player return transform, not just a camera position.

| Existing core checkpoint name | `CHAPTER_ANCHORS` key | Required authored state / spatial validation |
| --- | --- | --- |
| `chapter1.start` | `checkpoint-start` | Room 104 waking/standing return; initial doors, ward lighting and monitor state |
| `chapter1.after-nurse` | `checkpoint-after-nurse` | Quiet reachable recovery, resolved lesson, coherent Nurse location/search recovery and boundary-door states |
| `chapter1.after-records-power` | `checkpoint-after-records-power` | Handle acquired, record revealed, reserve bus armed; clearance outside panel/pack collision; no alarm or released Patient |
| `chapter1.before-patient` | `checkpoint-before-patient` | Release-vestibule pre-confirmation, handle/bus prerequisites retained, observation/stair doors still unreleased; repeatable retry |
| `chapter1.complete` | `checkpoint-complete` | Protected floor-specific exit landing; finale completed/skipped consistently; Patient cannot capture during completion |

Cinematic bindings reference the following existing core scene names and typed
anchor keys. They still need actual animation assets, spatial camera zones and
safe physical handoffs; reference validation does not establish those poses.

| `CHAPTER_SCENES` ID | `CHAPTER_ANCHORS` staging keys |
| --- | --- |
| `c1.cine.awakening` | `awakening-start`, `awakening-ceiling`, `awakening-fixture`, `awakening-monitor`, `awakening-wristband`, `awakening-door`, `awakening-handoff` |
| `c1.cine.nurse-reveal` | `nurse-camera-start`, `nurse-ledger`, `nurse-emergence`, `nurse-diversion`, `nurse-handoff` |
| `c1.cine.record` | `record-camera-start`, `record-identity`, `record-receiver`, `record-handoff` |
| `c1.cine.patient-release` | `patient-camera-start`, `patient-release-door`, `patient-emergence`, `patient-handoff` |
| `c1.cine.ending` | `ending-camera-start`, `ending-reader`, `ending-lower-stair`, `ending-handoff` |

`nurse-stage` and `patient-stage` locate dormant/restoring actors; `egress-chime`
locates the release sound that can attract attention. These are the remaining
typed anchor keys. They are not permissions to teleport active AI.

1. **`c1.cine.awakening`** — ceiling/fixture → bedside monitor → wristband →
   door → safe standing return. Starts dark; authored eyelid/fade and camera path
   reveal the real Room 104. No visible teleport on skip or normal completion.
2. **`c1.cine.nurse-reveal`** — player-safe reaction framing, Nurse entry and
   nearby concealment sightlines; normal navigation resumes from her real pose.
3. **`c1.cine.record`** — emergency pack and exposed archival file;
   readable detail framing without moving the player into archive furniture.
4. **`c1.cine.patient-release`** — release confirmation, observation-door
   sightline/reveal and readable escape opening; return control before pursuit
   can capture the player.
5. **`c1.cine.ending`** — protected exit landing, hospital-recognition
   revelation and chapter end. Does not create Chapter Two geometry or gameplay.

Each delivered anchor set needs a version, room binding, camera keyframes/targets,
entity animation cues, durations, effects/audio/subtitle cue IDs, entry guards,
safe return pose, skip result and interrupt/restore policy. These are missing
production deliverables. The existing `CinematicDirector` only schedules
presentation beats; it does not already implement this camera/dialogue system.

## 5. Required asset manifest and ownership

Status meanings: **EXISTS** = present at the audited commit; **ADAPT** = an
existing asset/system needs explicit chapter work; **MISSING** = new production
deliverable. A row marked ADAPT is not a completed chapter feature.

| Asset / deliverable | Owner | Status | Acceptance requirement |
| --- | --- | --- | --- |
| Room 104 + west-corridor Blender set and lightmap | Claude | EXISTS | Reuse or deliberately migrate for Wing A; retain existing game while new map is pending |
| Existing old ward architecture and furniture | Claude | EXISTS | Baseline assets only; preserve or explicitly migrate identities when redesigned |
| Fractured Ward Wing A, atrium/gallery, station, treatment department and Wing B | Claude | MISSING | Publish actual production geometry and room/portal metadata; old map is not proof of delivery |
| Fractured Ward records/electrical, maintenance and release/Patient staging zones | Claude | MISSING | Blender-first sets with colliders/doors/room metadata and validated paths |
| Multilevel Stairwell B and protected exit landing | Claude | MISSING | Walkable floor transitions, floor-aware navigation and validated landing trigger |
| One versioned production map/cue manifest | Claude produces; Codex validates | MISSING | Resolve typed declarations and named-object references; deliver spatial/acoustic adapters separately before physical readiness |
| Chapter wayfinding and emergency procedure diagrams | Claude | MISSING | Readable at ordinary laptop viewports and low quality |
| Wristband with PATIENT 104 / ADMITTED: YESTERDAY / STATUS: DO NOT DISCHARGE | Claude | ADAPT | First-person/inspection presentation; decorative wristband alone is insufficient |
| 03:17 room clock | Claude | EXISTS | Maintain visibility in awakening composition |
| Discharge notice and broken call-button affordance | Claude | MISSING | Inspectable, legible narrative props and cue anchors |
| 2012 operating pack, removable release handle and Patient 104 file | Claude | MISSING | Separate pack/reveal states with readable records and animation cues |
| Reserve-bus panel, labels, indicators and handle socket | Claude | ADAPT | Decorative panels are only a starting asset; authored puzzle state visuals required |
| Stair release hardware and observation door | Claude | ADAPT | Coherent emergency procedure; remove/migrate contradictory padlock state |
| Original Patient and Nurse rigged GLBs | Claude | EXISTS | Preserve animation and scene-node conventions |
| Five required cinematic anchor sets / staging assets | Claude | MISSING | Camera, animation, dialogue/effects timing and safe return data |
| Four act atmosphere presets and restore state | Claude | ADAPT | Deliberate narrative progression and deterministic checkpoint restore |
| Room ambience, footsteps, directional enemy audio, tension score | Claude | EXISTS | Existing systems; tune and connect chapter cues through mixer |
| Monitor, ventilation, alarm and release mechanical sounds | Claude | ADAPT | Synchronize with physical/cinematic state, not unrelated recurring scares |
| Chapter intercom performed voice | Claude | MISSING | Original convincing performance, intelligible distortion, timed subtitle data |
| Sparse protagonist performed lines | Claude | MISSING | Use only justified lines from approved script; avoid robotic final placeholders |
| Archival performed recording(s) | Claude | MISSING | Approved chronology, original performance, recorded-source treatment |
| Hospital-recognition ending voice, if approved by script | Claude | MISSING | Original performance matching ending cue and subtitle timing |
| Dialogue manifest, playback and subtitle sequencing | Codex | ADAPT | Independent runtime and 13-line manifest implemented in this phase; production frontend, recordings and scene bindings remain |
| Live chapter progression/journal/puzzle/encounter/checkpoint adapters | Codex | MISSING | Independent core logic does not supply production world, camera, save or AI bindings |
| NW-003B title/loading/audio/settings media | Claude/shared integration | EXISTS | Preserve current production experience and user settings |

These production status rows use integrated main as the installed baseline.
The later observed NW-004A feature publication already contains additive Records,
Electrical and staging work, while its enlarged plan is still a proposal. See
[CLAUDE-HANDOFF.md](CLAUDE-HANDOFF.md) for that actual branch/revision and the
compatibility mapping. Its existence does not imply those additions are merged
into this gameplay branch or that the final Fractured Ward layout is approved.

Use the exact `CHAPTER_VOICE_CUES` IDs from `bindings.ts`, including
`c1.voice.intercom.awakening`, `c1.voice.archive.withdrawal` and
`c1.voice.intercom.recognition`. Do not add alternative aliases in the map.
The typed asset status is `not-recorded`, `temporary`, `recorded` or `approved`,
with a supplied asset reference; recorded does not automatically mean approved.
Production dialogue data additionally needs speaker, language, exact text,
duration, format/URL, subtitle timings and mixer bus through the agreed audio
adapter. Do not mark these cues ready merely because subtitles or synthesized
sound effects exist. If performed audio cannot be produced, ship playback/
manifest work as an incomplete phase and state missing recordings explicitly.

## 6. Asset pipeline, lighting and performance plan

The existing Room 104 set is about 56,446 triangles, nine material meshes,
6,103,100 GLB bytes and a 930,138-byte 2048-square lightmap. Its manifest reports
129.3 MB uncompressed GPU texture memory. The five original animated entity
models total approximately 6.11 MB; do not replace them with temporary figures.
Blender, FFmpeg and FFprobe are available. Existing original title-audio scripts
produce effects/music through NumPy/SciPy and FFmpeg, not performed dialogue.

Retain the existing hybrid approach: baked static occlusion/lighting in the
Blender set, emissive fluorescent panels and a bounded pool of nearby dynamic
lights for flicker and story changes. Existing atmosphere uses approximately ten
pooled point lights plus ambient/fill, rather than an unbounded light per fixture.
Do not blindly enable shadows on every hospital light or rebuild shader/material
variants each frame. Consider only a measured, optional nearby dynamic shadow
source after testing actual hardware and capture its GPU/frame-time cost.

| `CHAPTER_LIGHTING` key | Proposed lighting/audio direction | Essential visibility |
| --- | --- | --- |
| `c1.light.awakening` | Pale bedside pool, weak fluorescent, ventilation/monitor, gradual visual recovery | Wristband, notice and exit readable |
| `c1.light.night-shift` | Uneven station/ward pools; credible shift activity before explicit wrongness | Hiding entrances and retreat landmarks |
| `c1.light.records` | Cooler service/task lights and restrained deep gaps | Circuit labels, pack/file and diagrams |
| `c1.light.reserve-armed` | Deliberate reserve-ready visual change; no Patient release | Ready indicator and local release destination |
| `c1.light.patient-release` | Alarm and controlled mains response | Escape decision and Patient emergence |
| `c1.light.chase` | Readable emergency route lighting and dynamic tension | Both escape approaches and stair access |
| `c1.light.recovery` | Recoverable quiet lighting/audio projection after appropriate state restore | Objective and surroundings remain legible |
| `c1.light.stair-recognition` | Restrained ending focus and recognition response | Reader, landing and composed stair view |

`lighting` maps these semantic keys to producer-authored profile IDs. Current
metadata validation checks that references are nonempty; it does not load or
verify a lighting profile, effect duration, visibility or restore implementation.

The baseline offers circuits such as `nw:lights:all`, `nw:lights:corridor-main`,
`nw:lights:corridor-east`, `nw:lights:emergency` and room-suffix circuits. Reuse
their event semantics; resolve actual Fractured Ward lighting groups through
the manifest instead of assuming those old corridors still exist. Persist the
chapter's intended mood and restore it after transient flickers or reloads.
Avoid a baked image implying a live light is on while all of its authored
fixtures are off; bake indirect shading conservatively and test transitions.

Preserve quality presets (pixel-ratio caps low .75, medium 1, high 1.5, ultra 2),
reduced-motion preference, effects amount, subtitle toggle and master/music/SFX
mixing. New voices and cinematics must route through the existing mixer; all
relevant sound must respect those settings. Low quality may reduce resolution,
haze, extra shadowing and decorative effects, but cannot remove navigation cues,
puzzle labels, inspection proxies or enemy readability. Texture compression and
shared atlases should be measured before repeating the current large texture
budget across every added room.

Capture representative hardware/browser, viewport, quality, draw calls,
triangles, texture/geometry counts, active lights/audio voices and frame-time
percentiles. Compare fresh start, multiple checkpoint retries, a full chapter and
menu round trips. Track navigation work and resource/listener counts over time;
no long-session regression is accepted on the strength of a short screenshot.

## 7. Migration and production acceptance

Preserve current world, door, interaction, hiding and entity identities whenever
possible. For every deliberate replacement, publish old ID → new ID, pose and
state migration, affected saved checkpoint versions and navigation changes.
Keep dynamic door colliders at their actual hinge transforms, including the
starting open pose. Revalidate newly blocked door swings, bed/locker exemptions,
safe exits and floor support with the production assets loaded.

The audited Patient spawn `nw:spawn:patient` / route `nw:route:ward-loop` and Nurse
spawn `nw:spawn:nurse` / route `nw:route:station-round` describe the old generic
world only. They do not approve routes or positions for the redesigned chapter.
The Fractured Ward manifest supplies actual spawns/routes or explicit migrations
and must restore them correctly after checkpoints.

Before accepting the environment handoff:

- Adapter validation finds every required room, control, cinematic anchor, safe
  pose, cue and restore capability, with no fabricated fallback coordinates.
- One manifest resolves the Fractured Ward rooms, Nurse introduction/recovery,
  quiet puzzle zones, Patient release/entry, two alternative escape routes and
  protected stair exit landing. Route approval follows real navigation tests.
- The actual player and both enemy capsules traverse each required connection;
  doors update physics and navigation consistently.
- Every checkpoint and cinematic skip restores puzzle, doors, enemies, lighting,
  subtitles and audio without replaying completed releases or consuming an item
  twice.
- The Nurse introduction supports concealment, credible search and recovery;
  the Patient can follow either escape route without wall clipping or teleporting.
- An ordinary laptop viewport and low graphics preserve interaction readability.
- Existing Blender assets, NW-003B menu/loading/settings and module cleanup remain
  intact; no duplicate renderer, physics world or animation loop is introduced.

**Readiness:** existing production sets, models and atmosphere are reusable.
Codex can build and verify independent core systems while Claude authors the
Fractured Ward. Its actual map bindings, semantic story props, camera staging,
performed voices and live chapter adapters remain production dependencies.
Approved routing is deferred; no previous map proposal substitutes for it.
The chapter cannot be called finished until these are integrated and a real
start-to-finish playthrough verifies the intended experience and duration.
