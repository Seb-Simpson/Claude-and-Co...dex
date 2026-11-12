# NW-007C integration audit and pinned sources

Audited before combining branches. The repository remote is `https://github.com/Seb-Simpson/Claude-and-Co...dex.git`.

- Start: NW-007A PR #23, `5f4b2c76a1dae44135b9cca1d4d560d30d96368d`.
- Pinned asset source: NW-007B PR #22, `dbebd306dbe52e9f7142873995b7935ae83a502b`, fetched and checked against the current PR head. No later asset changes are implicitly included.
- Common ancestor: `0097264bf07a21b22ca7b5b1ac14ddaff951a046`.
- New branch: `feat/nw-007c-cinematic-integration`. No main merge or NW-008 implementation.

## Overlap and compatibility work

The only overlapping source file is `src/world/dressing/station.ts`: A retains immutable byte-source loading and closes owned bitmap resources; B adds `station_print`/`station_call_lcd` nodes and their existing authored material treatment. Both changes must remain.

A's default Nurse visual wrapper spreads properties, which snapshots getters. B's live `clip` readout must be forwarded dynamically. A's 2.5/2.8/1.8-second fallback routine must instead honor the actual `NURSE_CLIPS` contract and clip completion. B's staging accessor provides real work poses, yaw and interaction targets; A's approximate target-facing poses must not substitute for them. The collision capsule and navigation remain authoritative.

B's approaching-steps cue is a multi-step sound, not a single foot contact. Do not fire that burst for every animation footstep. Contact events, station loops and action sounds need one owner and cancellation through the existing atmosphere module. Capture must use the physical Nurse's actual position, never relocate her for a close-up.

B's original staging browser spec deliberately adds an isolated evidence actor and hides the gameplay visual. It remains useful asset/staging coverage, but cannot count as the integrated director walkthrough. New coverage must inspect the actual sole gameplay Nurse.

## Release blocker

At the pinned head, B's report explicitly says the blindfold/cap/hair are displaced from the face and the face/neck albedo is streaked. No verified repair is present in that source history. Keep the integration draft and mark this blocker outstanding; inspect the integrated model independently. Do not repair/rebuild character geometry under this task or silently mark it fixed.

## Preserved systems

Canonical New Game/Continue/Retry lifecycle; source-byte ownership; ordered narrative checkpoints; per-attempt director leases; existing real Nurse perception/navigation/witnessed hiding; trolley cover; locker and Room 105 bed; actual Room 104 art/card/clock; menus/settings; no Patient. All source tests remain, with assertions adapted only for actual integrated behavior.
