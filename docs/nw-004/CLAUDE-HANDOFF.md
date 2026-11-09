# Fractured Ward integration handoff

**Subsequent publication:** `475679d303993d9b192e73f4c5778953f455535c` on
Claude's same environment branch withdraws the Fractured Ward expansion and
proposes a focused story-driven ward layout. It is still a proposal, not an
approved map or automatic revision of the chapter specification. See
[PATIENT-CHASE.md](PATIENT-CHASE.md) for the current coordinate-independent chase
brief and narrative decisions. The historical publication below explains the
phase-one adapter compatibility; final room/route requirements await coordination.

## Observed publication, not a merge or map approval

Latest fetch found `origin/feat/nw-004a-environment` at
`6b9df6b1a8d6126da5742b51e8a96345b5a25b7c`. Its `docs/NW-004A.md` labels the
expanded Fractured Ward plan **PROPOSAL, awaiting approval**. This gameplay branch
remains based on integrated main `7db740e83a9bd6e8b2b5acd1423bf4114e3980c1`.
Neither branch has been merged here or automatically approved.

Only the published integration handoff and exported staging metadata were read
to identify compatibility, not to review Claude's implementation quality. Its
additive Records 112/Electrical 114 and staging are work on that feature branch;
the expanded atrium/gallery, Wing B and tower are not claimed installed on main.

## One source for semantic names

Consume `ChapterEnvironmentBindings` and the `CHAPTER_*` constants from
`src/gameplay/chapter/bindings.ts`. Publish a single configuration mapping those
semantic names to the actual environment revision. No gameplay file embeds the
old corridor coordinates or prescribes the final chase geography.

`createChapterBindingDraft(worldId, revision)` makes a deliberately incomplete
handoff; `validateChapterBindings(world, bindings, sources?)` reports individual
missing references. `metadataComplete` is **not** physical or chapter readiness:
the report always says `requiresSpatialPlaytest: true`. It cannot prove asset
fetching, collision/sweep safety, trigger geometry, acoustic behavior or routing.

### Reuse published staging data

Claude already exports `STAGING_ANCHORS`, `STAGING_SCENES` and
`getHospitalExtras(world).staging`. Data-only anchor IDs are accepted through
`ChapterBindingSources.anchors` as `{id, position}` records. The integration owner
can pass that existing array directly to preflight after branch assembly. Keep
the positions in the producer's metadata; do not copy them into a second map.
Named `Object3D` anchors under the world root are also accepted. A binding must
resolve uniquely through one source, not ambiguously through two declarations.

| Core scene ID | Published staging scene | Integration requirement |
| --- | --- | --- |
| `c1.cine.awakening` | `awakening` | Bind ceiling/fixture/monitor/wristband/door composition and continuous real player handoff; use first-person staging consistent with the treatment |
| `c1.cine.nurse-reveal` | `nurse-reveal` | Bind ledger, actual staff approach, distraction, fair retreat and return pose |
| `c1.cine.record` | `record-discovery` | Bind operating pack/file/receiver; preserve accessible transcript and quiet, safe playback |
| `c1.cine.patient-release` | `patient-introduction` | Re-stage on the approved map; real release door/chime; readable two-route choice and fair separation |
| `c1.cine.ending` | `stairwell-ending` | Re-stage at actual safe tower landing; recognition does not invalidate physical escape |

These scene-name translations do not approve every suggested camera/entity mark
as final choreography. Camera assets must still meet the required first-person
composition, collision clearance and handoff constraints. Unused optional staging
marks do not implicitly introduce extra enemies during the protected opening.

### Reuse published lighting profiles

The feature handoff documents the existing event transport:

```ts
events.emit('atmosphere:lighting', {
  targetId: 'nw:profile:nurse-encounter',
  effect: 'restore',
  durationSeconds: 1,
});
```

The semantic lighting names remain independent of actual fixture coordinates.
Suggested mapping, pending Claude's art approval:

| Chapter lighting key | Published profile candidate |
| --- | --- |
| `c1.light.awakening`, `c1.light.records`, `c1.light.recovery` | `nw:profile:exploration` |
| `c1.light.night-shift` | `nw:profile:nurse-encounter` |
| `c1.light.reserve-armed` | `nw:profile:supernatural` |
| `c1.light.patient-release`, `c1.light.chase` | `nw:profile:patient-chase` |
| `c1.light.stair-recognition` | Authored recognition variation; can reuse exploration if approved |

Do not emit `c1.light.*` directly as current atmosphere target IDs. An adapter
resolves the binding to an actual profile/circuit through existing GameEvents.
Effects must restore the appropriate act/checkpoint state rather than accumulate
unreleased flicker/silence/ducking scopes.

### Interactions and puzzle compatibility

Published new marker IDs are `nw:inspect:records-patient-file` and
`nw:inspect:electrical-breakers`; the Records hiding spot is
`nw:hiding:records-cupboard`. Keep those producer IDs if suitable. One marker
cannot silently stand in for every distinct panel control or the physical pack.
Add/bind the semantic interaction keys explicitly as the props are produced.

The chapter's two-stage mechanism is authoritative proposed story logic:

1. The operating pack physically supplies a necessary reusable release handle
   and exposes the 2012 identity file. No unrelated random key fetch.
2. Correct panel ENGAGE **arms reserve only**. It wakes legacy control and lighting;
   it does not open observation/stair doors or release the Patient.
3. Safe release vestibule + installed handle → pre-Patient checkpoint.
4. Explicit local CONFIRM RELEASE latches stair/observation release and sounds
   the chime once. Then the reveal hands off to genuine Patient perception/AI.

Claude's provisional `nw:key:electrical-114` must not become an extra arbitrary
fetch gate. Decide its migration/access policy in the integration revision.
Normal doors/requirements remain collision-authoritative; do not rotate meshes
or globally suppress colliders to simulate release/hiding.

## Enemy and vertical-navigation requirements

The initial map decision is **not** to force current planar navigation onto the
gallery or L3/L5. Keep introductory Nurse and Patient gameplay routes on a
validated connected ward-floor graph until explicit floor-link navigation is
implemented and tested. The final Patient chase choreography remains unapproved.

Player-only gallery/stair routes still require physically traversable geometry:
the current defenceless controller has no jump/autostep mechanism. Author smooth
collision ramps under visible stair meshes or agree/test step support. Validate
headroom, falls, support, railing and door clearance using the actual capsule.
Do not call a higher landing reachable merely because it has a camera anchor.

If the intended climax requires the Patient to follow across floors, implement
explicit floor/portal links in navigation and test full routes before enabling
it. No X/Z path shortcut, teleport between levels or scripted camera masquerading
as pursuit. If stairs form the escape boundary, provide a fair reachable ward-floor
threshold and a real separation mechanism before the ending input lock. Simply
withdrawing collision or making an active pursuer disappear is not acceptable.

The Nurse factory is available independently from `src/entities/nurseEncounter.ts`.
It wraps the existing AI, consumes actual spawn/route/navigation/door policy and
exposes staged activation/reset. **One owner per actor ID**: exclude this Nurse
from a simultaneously constructed `EntitySystem` before enabling the factory.
Its hum/listen/footstep/chase/stop hooks need Claude's real assets/playback adapter.

## Needed before chapter activation

1. Approved map and actual semantic manifest/revision, preserved/migrated door,
   collider, hiding and actor IDs; valid trigger geometry and safe checkpoint poses.
2. Physical Nurse service/access and acoustic boundaries; two genuine escape
   approaches, Patient staging/entry and protected actual stair landing.
3. Approved paths/animations for all five templates and handlers for
   `CHAPTER_CINEMATIC_CUES` in `chapterCinematics.ts`. Presentation cues do not
   mutate story state or move an already active AI.
4. Human performed/approved recordings for the 13 `CHAPTER_DIALOGUE` lines;
   measured subtitles and retimed assets. They are all `not-recorded` currently.
5. Coordinator's chapter controller, door unlock/restore transaction, complete
   world checkpoint envelope, Save/Continue migration and frontend journal/subtitle
   integration. Core-state serialization is already implemented; live restoration
   is not.
6. Combined real-browser routes, captures/retries/skips, every checkpoint and
   recorded fresh/restarted full chapter with measured time/performance.

Codex/Claude/coordinator acknowledgements of the versioned ports and file-owner
table remain pending. This handoff makes the proposed boundary concrete without
overwriting Claude's branch or implying final map/chapter acceptance.
