# NW-004A Step A — Chapter 1 gameplay blockout (for review)

**Status: blockout for review. No detailed environment art. Do not merge automatically.**

## Preview

- Blockout: `?nwLayout=chapter1`. The classic ward is still the default and does not change.
- Door states: `&nwStage=act1` (default), `act3`, `alarm` or `review` (every ordinary door open, for the walkthrough only).
- QA bridge: add `&test=1`.
- In code: `createHospitalWorld({ layout: 'chapter1', chapter1Stage })`.
- Placeholders: grey "BLOCKOUT:" stand-ins mark the Step B props (handle socket and CONFIRM, band reader).

| Deliverable | Where |
|---|---|
| Player-perspective screenshots (17) | `docs/nw-004a/step-a/shots/*.png` |
| Walkthrough recording, 110 s, player camera, Room 104 to the stair landing | `docs/nw-004a/step-a/walkthrough-chapter1-blockout.mp4` |
| Collision and door-clearance tests | `tests/world/chapter1/layout.test.ts` → `step-a/layout.json` |
| Patient chase, cupboard and grille tests | `tests/world/chapter1/chase.test.ts` → `step-a/chase.json` |
| Nurse tests | `tests/world/chapter1/nurse.test.ts` → `step-a/nurse.json` |
| Browser performance | `step-a/browser-performance.json` |
| AI step cost | `tests/world/chapter1/ai-cost.test.ts` → `step-a/ai-cost.json` |
| Temporary dialogue (13 cues): audio, subtitles, manifest | `src/assets/nw-004a/temp-vo/` |

Every test runs on Codex's real runtime, wired the way `src/gameplay/runtime.ts` wires it and used read-only:

- Rapier and the physics adapter;
- the player controller (real movement and footstep noise);
- the interaction system (swept doors, hiding, witnesses);
- the navigation grid and the door-navigation adapter;
- the entity system (perception, hearing, search, pursuit).

The "player" is a script. It steers with `setViewRotation` plus forward input, and opens doors with `interact()` after aiming at the leaf. Nothing is teleported after a run starts. `NW004A_REPORT=1 npx vitest run tests/world/chapter1` regenerates every JSON file.

## Changes the tests forced on the v2 plan

These are all blockout geometry, and each one is in a test.

| Change | Why (measured) |
|---|---|
| The staff passage dog-legs north behind the observation suite (link at x 9–10.2; east run at z −9.6…−8.4) | As drawn, it was one straight 24 m line of sight. The longest views are now 9.5 m and 8.5 m. |
| Fire-door leaves are 1.2 m, not 1.4 m; short pilasters fill the corridor | With 1.4 m leaves, the Patient's door navigation could not open the pair from its swing side: his approach point sits 1.9 m from the leaf and his reach is 1.8 m, so he stood there forever. |
| Smoke doors moved from x 8.4 to 9.4 and now swing west; hall-west doors swing east | Held open, the old leaves covered the 107 door and the station's way in. |
| Push-bar fire doors take 0.6 s to swing (ward doors take 0.9 s) | Every door the player opens costs them about 3.7 m of lead (see condition 1). |
| East-corridor fire door moved from z −1.9 to z −5.2 (north of the cell door) | Route B now runs past the cell and then the fire door, as the narrative says. |
| Treatment's two doors are wedged open in the alarm state | At 0.9 s a door, with five doors on route A, the player was caught at the treatment staff door with a 7.8 m lead. |
| Vestibule door swings out into Wing B and is hinged on its west side | Swinging inward, the player at the handoff stood inside its arc and could not open it. Hinged east, the open leaf hid the doorway from the junction and broke the reveal sightline. |
| Station counter shortened at its west end, leaving a 1.4 m way behind it | It is the only way to the staff locker that does not pass the staff door. |
| Staff doors swing into rooms, never into the narrow passages | An open leaf in a 1.4–1.75 m passage pinched it to 0.65 m. |

## Results against the seven review conditions

### 1. Patient chase — partly met

Setup: the Patient is released at `patient-emergence` and the player stands at the vestibule handoff.

**Route A after being seen at 7.8 m and at 8.9 m: escaped (passes).**

- He pursues through the smoke doors and loses sight in the hall at 10.4 s.
- He then follows real footsteps: investigate by sound, into treatment and the staff-passage side.
- He searches at (5.5, −7.2) while the player reaches the landing at about 21 s.
- His closest approach was 2.3 m.
- Every "last known" position he used matched where the player really was: the worst error was 0.2 m over 49 checks. He never tracked from a hidden locator.
- His top speed was 4.1 m/s, his pursuit speed, so he never warped.
- He is not neutralised after one corner: he is still in pursuit past the smoke doors.

**Route A at once: FAILED (known gap).**

- On patrol speed (0.75 m/s), with no chime lure, he never notices the player.
- Tension here depends on Codex: see integration change 1.

**Route B at once ("the gamble"): caught.**

- He is still walking to the junction and sees the player coming up the east corridor.
- This is the designed risk.

**Route B after being seen: caught, recorded as a measurement rather than asserted.**

- He detoured south through the east corridor and maintenance instead of following through the vestibule, and met the player head-on.
- With the earlier door geometry he lost the player in this run. The outcome is sensitive to door state and timing, so it needs a human playtest.

### 2. Vestibule cupboard — FAILED on "not a guaranteed escape"

Both of these outcomes are fair and readable:

- **Witnessed entry: caught.** He saw the player from 4.2 m and inspected the cupboard.
- **Leaving the cupboard while he is in the vestibule: caught.** He re-engages on sight.

But:

- **Unwitnessed entry is 100 % safe.** He walked past at 1.5 m and left.
- **Seen at the door, then out of sight before entering: also safe.** He searched the corridor instead.

Codex's hiding rules only inspect witnessed entries, and entering a hiding place makes no noise. No geometry change can make an unwitnessed hide risky. See integration change 2.

### 3. Fire doors — met

- **Viable route.** In the alarm state there is a walkable route from the vestibule, the hall, Records and Wing A to the landing, for both the player radius and the Patient radius.
- **No softlock.** Every fire door opens and closes from both sides with the player's real input. Standing in the arc blocks the door, and stepping back resolves it.
- **Same rules for both.** The Patient crosses every closed fire door from both sides in 6.2–7.9 s. He uses the same swept door check as the player and never warps.
- **Clearance.** Clear widths are 1.08–1.14 m for single doors and 1.40–1.42 m per pair leaf.

### 4. Final grille — physical close works; the latch is MISSING

| Patient lead | Closed? | Ending gate | Then |
|---|---|---|---|
| 3.6 m | No | — | He reached the arc: the close was blocked, no crushing, and he caught the player. |
| 7 m | Yes, at 1.9 s | Opened at 1.9 s | He reopened the unlocked grille and caught the player. |
| 10 m | Yes, at 1.9 s | Opened at 1.9 s | He reopened the unlocked grille and caught the player. |

The swept close never shuts through him. A separation-confirmed gate is defined in the test: grille closed, player on the landing, Patient on the corridor side. Codex has to add a latch on close (integration change 3).

### 5. Nurse encounter — met; the policy gap is measured

The tray diversion is a Codex cue and was not simulated, so these are the harder, undiverted cases.

| Response | Outcome |
|---|---|
| 1. Retreat west, hide under the 105 bed | Safe. She never pursues and carries on her round. Closest approach 2.9 m. |
| 2. Quiet route (connector → maintenance → hall service door) | Safe. Never closer than 6 m. |
| 3a. Staff locker, crouched behind the counter | Safe. She does not see the player go in. |
| 3b. Staff locker, standing | Caught. She sees the player at about 6 m and watches them enter the locker. Fair, and readable. |

**Policy gap.** If she hears the player on the service side, she opens `maintenance-west` and catches them. Codex has no per-actor door policy yet, and the quiet route relies on one (integration change 4).

### 6. Readability — UNVERIFIED

This needs first-time players, which a test cannot provide. What the blockout offers:

- **Wayfinding by signs only.** Hanging signs read NURSES' STATION · RECORDS 112 · DAY ROOM, and ELECTRICAL 114 · STAIRS B. There are door plaques for 112, 107 OBSERVATION and RELEASE VESTIBULE, plus DAY ROOM, STAIRWELL B — EXIT, and an EXIT sign pointing toward Stairwell B.
- **Landmarks.** The lit station; the piano and the clock stopped at 03:17 in the hall; the gallery glass.

Screenshots 01–17 show what a player sees at each decision point. Weak spots I can already see:

- Records reads as a dark store.
- The pump bay is very dark.
- The Electrical door looks like any other door.

All three are lighting and dressing work for Step C/D. A human playtest is needed.

### 7. Performance — measured; one regression for Codex

**Browser.** SwiftShader is software WebGL in this container, so the numbers are relative only and fps is not meaningful.

- Draw calls and triangles per view are similar to the classic ward: Wing A 48 calls / 94 k triangles; the station view 186 calls / 63 k triangles, against 166 / 66 k classic.
- Menu-to-ready is 11.6–14 s for both layouts. Entering the ward takes 0.4–0.5 s.
- Software-rendering stalls of 1–7 s per frame appear in both layouts.

**Gameplay.** `fixedMaxMs` is 164–241 ms in the blockout against 23–30 ms in the classic ward. The node measurement (`ai-cost.json`) traces the spikes to the Patient's AI step:

| World | Median | p99 | Max | Steps over 16.7 ms |
|---|---|---|---|---|
| Classic | 0.15 ms | 2.1 ms | 9 ms | 0 of 1800 |
| Blockout, cell latched | 0.08 ms | 0.7 ms | 228 ms | 1 of 1800 |
| Blockout, released | 0.08 ms | 4.2 ms | 280 ms | 10 of 1800 |

The cause is pathfinding that fails or comes close to failing:

- A Patient latched in his cell repeatedly searches 4096 A* nodes for an unreachable patrol.
- Door-approach queries run once per candidate door, and the blockout has more closed doors.

See integration change 5.

**Sightlines (act 3, fire doors held open).** The design's "every view broken within about 10 m" does **not** hold yet:

| Space | Longest view |
|---|---|
| Wing A to Wing B | 30 m |
| Maintenance | 24 m |
| East corridor | 18 m |
| Hall front | 20 m |

The fire doors break these views only in the alarm state. **Open design item:** add staggers or obstructions in maintenance and the east corridor, or keep the hall-west pair closed (not held open).

## Failed or unverified criteria

1. **FAILED.** Route A at once: the Patient never notices the player. Needs integration change 1.
2. **FAILED.** The cupboard is a guaranteed escape whenever entry is unwitnessed. Needs integration change 2.
3. **FAILED.** The grille cannot latch, so he reopens it. Needs integration change 3.
4. **MARGINAL.** Route B after being seen depends on his detour choice. Needs a playtest.
5. **FAILED.** The Nurse opens service doors; the quiet route relies on her not doing so. Needs integration change 4.
6. **FAILED.** Sightline targets in Acts I–III: 18–30 m views remain in Wing A/B, maintenance and the east corridor. This is a blockout follow-up of mine, awaiting your call on the remedy.
7. **REGRESSION.** AI frame spikes of up to 280 ms. Needs integration change 5.
8. **UNVERIFIED.** Readability with first-time players.
9. **UNVERIFIED.** Real-GPU frame rate. Only SwiftShader is available here.
10. **NOT SIMULATED.** The Nurse's tray diversion and the chime are Codex cues.
11. **TEMPORARY.** All 13 voice lines are synthetic placeholders: espeak-ng with intercom and archive band-limiting, and subtitles prefixed `[TEMP]`. They are not performances.

## Integration changes Codex must make

None of these are made here: they are in Codex-owned files.

1. **Chime lure on release.** On `c1.cine.patient-release` handoff, give the Patient an `investigate` target at `nw:c1:egress-chime` (investigate speed 1.35 m/s, or pursuit while in view), instead of plain patrol. Without it, leaving at once is a free escape.
2. **Hiding entry noise or suspicion.** Emit a `player:noise` (or equivalent) on locker or cupboard entry, with a radius of about 4 m. An entity that hears it within hiding-inspection range should inspect that spot. The design's own Nurse rule says this ("if she hears the locker door, she inspects").
3. **Door transactions.** Codex needs to own these:
   - `closeDoor`, `latchDoor` / `lockDoor` and `unlockDoor` on `InteractionSystem`, with the same swept checks as opening;
   - the alarm closing `CHAPTER1_FIRE_DOORS` and opening `stairwell-b` and `observation-bay`;
   - the grille latching on a player close;
   - Records unlocking from the station control.

   Until then, `chapter1Stage` sets these states statically.
4. **Per-actor door policy.** The Nurse must never open `CHAPTER1_NURSE_EXCLUDED_DOORS`. This could be a door-access predicate on the door-navigation adapter.
5. **AI cost.** Don't tick the dormant Patient's navigation while he is latched (`patient-stage` dormant). Cache or limit door-approach `findPath` calls per step (at most one candidate per tick, or reuse the last plan).
6. **Ending gate.** Start `c1.cine.ending` only when `stairwell-b` is `closed` (latched), the player is inside `nw:trigger:stair-safe-landing`, and the Patient is on the corridor side (z > −11). The predicate is in `chase.test.ts`.
7. **Door-navigation reach.** Leaves wider than about 1.2 m cannot be operated from their swing side, because the approach clearance (leaf + radius + 0.1) sits beyond the 1.8 m reach. Either fix the adapter, or keep the world rule that leaves are at most 1.2 m (the blockout follows this rule).
8. **Bindings.** Use these exports from `src/world`:
   - `CHAPTER1_ROOM_BINDINGS`, `CHAPTER1_DOOR_BINDINGS` and `CHAPTER1_FIRE_DOORS`;
   - triggers as `nw:trigger:<key>` nodes with `userData.nwTrigger`;
   - anchors as `nw:c1:<key>` in `HospitalExtras.staging`;
   - routes `nw:route:night-round` and `nw:route:wing-b-search`.

   The Nurse spawns in the staff passage; the Patient spawns in the observation bay.
9. **Temporary VO.** `src/assets/nw-004a/temp-vo/manifest.json` maps each `c1.voice.*` cue to its file, duration and subtitle segments. It is for previews only.

## Not done in Step A (on purpose)

- Detailed art, Blender sets and KTX2 (Step D).
- Lighting states per act (Step C).
- Story props as interactables (Step B).
- No Codex-owned gameplay, physics or AI file was changed.
- No shared contract or engine file was changed.
