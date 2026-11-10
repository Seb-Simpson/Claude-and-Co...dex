> **Historical NW-004 proposal — superseded by NW-005D.** This is retained development history, not current Chapter 1 canon or an implementation brief. Nurse Shaw is Chapter 1’s antagonist; the Patient is reserved for much later. The Patient climax below is withdrawn. See [current opening policy](../nw-005d/NARRATIVE.md).

# NW-004: dialogue, voice direction and cinematic cue sheet

## Production status

This is the proposed complete Chapter One script associated with [NARRATIVE.md](NARRATIVE.md).
No Chapter One voice recordings or camera/animation assets are delivered by this document.
All scene, cue and anchor IDs below are proposed semantic IDs pending the actual versioned
interface agreement with Claude. They do not assert that runtime markers already exist.

Do not call the chapter complete until essential performances and staging are present and
tested. A subtitle-only or temporary-recording preview is a production preview, not final
voice acting. Browser speech synthesis is not an approved final-performance substitute.

## Cast and direction

| Role ID | Direction |
| --- | --- |
| `c1.role.intercom` | Calm adult ward announcer, routine and credible rather than overtly monstrous. The opening initially sounds helpful. Final recognition uses the same performer, drier and clearer, without a volume-spike jump scare. |
| `c1.role.protagonist` | An ordinary adult; quiet, economical, confused and then frightened by recognition. No running commentary, quips or recitation of every visible clue. Casting is original and not tied to an existing performer's likeness. |
| `c1.role.protagonist-archive` | The same performer as the current protagonist. Tired and trying to be precise under stress. This is an identity clue; processing must preserve the relationship. |
| `c1.role.nurse-archive` | Nurse Evelyn Shaw, clinical and exhausted, committed to procedure. The refusal is administrative routine, not an evil speech. |
| `c1.role.nurse-nonverbal` | Original humming, breath, heels, keys and fabric. Humming stops when she listens. Primarily sound-sensitive gameplay does not assume total blindness from her visual design. |
| `c1.role.patient-nonverbal` | Strained breath and physical effort, synchronized to contact/movement. No intelligible villain monologue or repeated arbitrary screams. |

Intercom/receiver processing can use limited bandwidth, mild instability and room transmission.
Speech must remain intelligible at normal settings. Do not cover an unconvincing performance
with extreme distortion. Record dry masters and provide processed game renders separately.

## Scene 1: Awakening

**Scene:** `c1.cine.awakening`. Proposed duration approximately 55 seconds; final timing follows
the approved acting and camera assets. Darkness/closed-eye staging is part of the sequence,
not a timed objective gate.

| Editorial time | Camera/action | Cue |
| --- | --- | --- |
| 0–6 s | Black; close breathing, distant ventilation, monitor pulse. | `c1.sfx.awakening-breath`, `c1.ambience.ventilation`, `c1.sfx.bedside-monitor`. |
| 6–14 s | Vision returns toward ceiling and fluorescent; focus settles. | Restrained fixture buzz. |
| 14–23 s | Discover monitor and clock reading **03:17**. | Monitor remains a real source in the room. |
| 23–35 s | Forearm/wristband enters composition through authored motion; quietly establish wrist scar. | Legible wristband text below. |
| 35–45 s | Camera settles toward the nearby door. | Intercom opening line. |
| 45–55 s | Distant movement; camera completes the believable waking/standing path into the validated control pose. | Trolley/heel hint; no visible enemy. Smooth gameplay handoff. |

Wristband front text, exactly:

```text
PATIENT 104
ADMITTED: YESTERDAY
STATUS: DO NOT DISCHARGE
```

**`c1.voice.intercom.awakening` — INTERCOM**

> West Ward, night shift. Please remain in your rooms. The nurse will be with you shortly.

Subtitle segments preserve those words and punctuation:

1. `c1.subtitle.awakening.01`: “West Ward, night shift.”
2. `c1.subtitle.awakening.02`: “Please remain in your rooms.”
3. `c1.subtitle.awakening.03`: “The nurse will be with you shortly.”

The camera uses actual environment clearance and a single camera-control lease. It must not
clip through bed/furniture or snap from reclined composition to the controller. During skip,
a short fade and authored transition can resolve to the same valid handoff; normal and skipped
completion grant the band fact once. Physical threats remain inactive.

## Act I interaction lines

These occur at player actions, once per applicable narrative fact. Equivalent station evidence
is allowed if the player leaves Room 104 early; do not replay the lines on every inspection.

**`c1.voice.protagonist.appointment` — PROTAGONIST**, current intake/notice inspection:

> I came for an appointment.

**`c1.voice.protagonist.call` — PROTAGONIST**, unanswered bedside or station help attempt:

> Hello? Is anyone there?

Call interaction sound: a dry switch click; no answer. The disconnected bedside lead is
inspectable. The notice and station copy carry the current intake signature and permanent ID.

## Scene 2: The night round

**Scene:** `c1.cine.nurse-reveal`. Proposed duration approximately 28 seconds. Start after the
player voluntarily examines the night ledger and safe staging/retreat is available.

| Editorial time | Camera/action | Cue |
| --- | --- | --- |
| 0–7 s | Call panel blinks 104, initially plausible hospital automation. | Station acknowledgement. |
| 7–13 s | Fresh ink writes the ledger entry while the pen remains visibly untouched. | Quiet pen/ink detail; no large sting. |
| 13–17 s | Give the impossible change space to register. | Protagonist reaction. |
| 17–24 s | Humming stops; heels/keys precede the Nurse emerging from the real staff passage. Compose a visible retreat. | Nurse physical cues; no teleport. |
| 24–28 s | A tray rattles farther along her route; she turns toward it as control returns. | One introduction distraction and a fair response window. |

**`c1.voice.intercom.review` — INTERCOM**

> Room one-zero-four. Night review requested.

Ledger writing, inspectable and journalled:

```text
104 — RETURNED — 03:17
```

**`c1.voice.protagonist.ledger` — PROTAGONIST**

> That wasn’t there.

Nurse-round board text:

> Keep doors quiet. The night nurse follows the last sound.

The Nurse's ordinary pursuit is not a camera animation. After handoff her actual perception,
route, investigation and recovery take over. Hiding or a quiet alternate escape can succeed.
Skip performs the same distraction/grace setup once and returns to the same safe player pose.

## Scene 3: The contradictory record

**Scene:** `c1.cine.record`. Proposed duration approximately 42 seconds. Removing the necessary
operating handle from the incident pack physically exposes the identity record. Its pickup
and discovered facts are not silently gated on watching the scene. If danger makes input
locking unfair, retain the item/facts and defer playback to a valid safe opportunity.

Use an archive dictation receiver/headset. Its compulsory speech must not become an unexpected
room-wide noise that attracts the Nurse to a player who cannot move. Keep inspectable pages and
an exact journal transcription available afterward.

| Editorial time | Camera/action | Cue |
| --- | --- | --- |
| 0–9 s | Handle lifts; aged date, permanent ID, signature and scar diagram become clear. | Protagonist recognition. |
| 9–16 s | Receiver lifts; recording begins. | Clinical slate. |
| 16–27 s | Hold withdrawal form and received stamp. | Archived protagonist. |
| 27–33 s | Administrative response over the recording. | Archived Nurse. |
| 33–38 s | Reveal evacuation reconciliation. | Present protagonist reaction. |
| 38–42 s | Receiver lowers; restore the same actual inspection/control pose. | Recording stops; room sound returns. |

**`c1.voice.protagonist.signature` — PROTAGONIST**

> That’s my signature.

**`c1.voice.archive.slate` — CLINICAL ARCHIVE SLATE**

> West Ward. Withdrawal record. Seventeenth October, two thousand twelve.

**`c1.voice.archive.withdrawal` — ARCHIVED PROTAGONIST**

> My patient number is one-zero-four. I am withdrawing consent. I want to leave.

**`c1.voice.archive.refusal` — ARCHIVED NURSE SHAW**

> The consultant has not cleared your discharge.

Reconciliation text:

```text
HVI-000104
LAST SEEN: EMERGENCY STAIRWELL B, 03:17
DISCHARGE UNCONFIRMED
REVIEW REQUIRED
```

**`c1.voice.protagonist.memory` — PROTAGONIST**

> I don’t remember this.

Normal completion and skip commit the same identity/procedure facts and transcription, stop
the owned recording, restore the mix and return control without duplicating the item pickup.

## Power engagement acknowledgement

This belongs to successful **ENGAGE**, not to the Patient release cinematic.

Panel feedback:

```text
EGRESS SUPPLY ARMED
LOCAL CONFIRMATION REQUIRED
```

**`c1.voice.intercom.armed` — INTERCOM**

> West Ward control restored. Emergency release awaiting local confirmation.

The legacy controller and emergency lighting wake. No observation door opens and no egress
chime sounds yet. This supports the separate after-records/power and pre-Patient checkpoints.

## Scene 4: Local release and the Patient

**Scene:** `c1.cine.patient-release`. Proposed duration approximately 20 seconds. It begins only
after the handle is installed, reserve is armed, safe pre-Patient checkpoint is committed and
the player operates the clearly labelled local **CONFIRM RELEASE** control.

| Editorial time | Camera/action | Cue |
| --- | --- | --- |
| 0–5 s | Real local mechanism moves. Stair retention barrier mechanically latches open. | Release motor/relay contact; no repeated ENGAGE acknowledgement. |
| 5–10 s | Observation latches release and emergency route lighting establishes direction. | Egress chime and transfer announcement. |
| 10–16 s | Patient emerges along the authored collision-valid path, reacting to the chime. | Breath, fabric and actual foot contacts. |
| 16–20 s | Return to the existing player pose with readable route and response separation. | Gameplay handoff; perception-driven pursuit can begin. |

**`c1.voice.intercom.release` — INTERCOM**

> Emergency transfer active. Observation bays releasing.

The Patient has no spoken line. His introduction uses the actual actor/model and a validated
path. Normal AI is not allowed to close the distance or capture while input is locked. Skip
fast-forwards only cinematic-managed staging and one-time mechanism/alarm effects; it cannot
teleport an already active pursuer. The subsequent chase must work without a scripted target
coordinate or forced capture.

## Scene 5: Recognition at the stairwell

**Scene:** `c1.cine.ending`. Proposed duration approximately 38 seconds, after the player reaches
the safe landing beyond the actual released threshold.

| Editorial time | Camera/action | Cue |
| --- | --- | --- |
| 0–8 s | Pursuit sound falls away behind the boundary; exertion resolves. | Player breath and stair ambience. |
| 8–16 s | Powered band-reader pairs current admission with the old permanent ID. | Quiet scanner/print mechanism. |
| 16–30 s | Hold recognition rather than cutting to an unexplained monster. | Final intercom, same performer as opening. |
| 30–38 s | Rest toward the lower infirmary; fade to chapter completion. | No Chapter Two encounter or playable space. |

Reader text:

```text
HVI-000104
RETURN ADMISSION CONFIRMED
```

**`c1.voice.intercom.recognition` — INTERCOM**

> Patient one-zero-four. Return admission confirmed. Your discharge request is still pending.

Completion text:

```text
CHAPTER ONE COMPLETE
THE AWAKENING
```

The mechanical override remains latched open. The earned escape is real; the reader cannot
retroactively relock it. Normal completion or skip writes `chapter1.complete` exactly once.

## Subtitle, pause and audio behaviour

- Every spoken line has exact text, a stable `c1.subtitle.*` ID and measured segments tied to
  the approved recording. Essential documents also have text transcriptions.
- Optional sound captions identify monitor, approaching heels, humming stopping and mechanism
  events without revealing an unseen enemy's exact coordinates.
- Pause freezes the cinematic clock and owned audio. Resume preserves synchronization.
- Skip/interruption stops owned cues, cancels queued segments and restores previous mixer
  ducking. No wall-clock timeout may hide the next scene's subtitle.
- Narration, sound, ambience and music route through the existing mixer/master settings.
  Voice uses the agreed mixer route; it must not bypass sound settings or create a separate
  uncontrolled context. Subtitle settings continue to work with muted audio.
- Dialogue can modestly duck ambience/music for intelligibility. Preserve useful directional
  enemy cues while the player has control. Silence around recognition is deliberate, not an
  audio initialization failure.

## Replaceable recording manifest requirements

For each cue record: schema version, stable cue ID, role, exact text, subtitle segments,
expected duration, spatial mode/anchor, mixer route, priority, recording status, temporary
asset reference, approved asset reference and replacement relationship. A planned filename
is not an existing asset.

| Recording status | Meaning |
| --- | --- |
| `not-recorded` | No playable voice asset exists; preview may show the script/subtitles only. |
| `temporary` | A clearly identified replaceable recording exists; it is not approved final acting. |
| `recorded` | Original performance exists and awaits editorial/mix acceptance. |
| `approved` | Performance, intelligibility, subtitles, mix and scene synchronization are accepted. |

All Chapter One voice cues in this proposal currently have **not-recorded** status. Any future
temporary recordings must be identified in the manifest and implementation report. Do not
ship robotic voices as the final presentation or describe silent timing slots as completed VO.

## Acceptance checklist

Claude supplies original performances, final animation/camera staging and environmental cues
through the agreed interfaces. Codex supplies reusable playback coordination, progression,
exclusive control ownership, skip/recovery, journal evidence and checkpoints. Acceptance needs:

1. Each scene plays in the actual environment with no visible camera snap or geometry clipping.
2. Every skip point and checkpoint interruption reaches the same valid semantic state once.
3. Voices are intelligible, settings-controlled and synchronized to their approved subtitles.
4. The Nurse and Patient handoffs leave fair control and real navigable survival choices.
5. The panel ENGAGE and local CONFIRM RELEASE remain distinct, understandable actions.
6. The ending commits completion without entering an unfinished chapter.
7. Measured fresh/retry playthrough recordings exist; editorial durations above are not used
   as proof of a 20–30 minute player-controlled chapter.
