# NIGHT WARD — NW-R02: Chapter 1 Architectural Greybox

**Status: delivered for human review (gate E). Not merged. Chapter 1 is not complete.**

| | |
|---|---|
| Branch | `claude/nw-r02-chapter1-greybox` |
| Based on | `origin/main` at `e36a3a3`, plus the NW-R00 and NW-R01 design documents (cherry-picked from `claude/nw-r01-chapter1-revision`) |
| Run it | `npm run dev`, then open `/?level=greybox` (add `&test=1` to skip the title screen). The normal game at `/` is unchanged. |
| Controls | WASD move, Shift sprint, C or Ctrl crouch, E interact, **M** developer map (click a CP to teleport), **K** collider overlay |
| Design sources | `docs/NW-R00-CHAPTER-1-DESIGN.md`, `docs/NW-R01-CHAPTER-1-REVISION.md` and the four approved decisions in the NW-R02 brief |

## Contents

1. [Summary and gate status](#1-summary-and-gate-status)
2. [Branch and dependencies](#2-branch-and-dependencies)
3. [What was built](#3-what-was-built)
4. [Developer map](#4-developer-map)
5. [Walkthrough, steps 1–15](#5-walkthrough-steps-115)
6. [Traversal measurements](#6-traversal-measurements)
7. [Encounter geometry validation](#7-encounter-geometry-validation)
8. [Tests](#8-tests)
9. [Placeholder list](#9-placeholder-list)
10. [QA report](#10-qa-report)
11. [Deviations from R00/R01 and open questions](#11-deviations-from-r00r01-and-open-questions)

Deliverables in the repository:

| # | Deliverable | Where |
|---|---|---|
| 1 | Greybox | `src/world/greybox/` (`level.ts` data, `grid.ts` wall generator, `build.ts` world builder, `greyboxModule.ts`, `devMap.ts`, `telemetry.ts`), entry in `src/main.ts` |
| 2 | Room and corridor registry | `docs/nw-r02/registry.md` §1 (generated from the data) |
| 3 | Door and connection registry | `docs/nw-r02/registry.md` §2 (generated) |
| 4 | Developer map | in game (M); image `docs/nw-r02/screenshots/00-developer-map.png` |
| 5 | Walkthrough | §5 below; route `tests/browser/greybox-route.json` |
| 6 | Tests | `tests/greybox/*.test.ts`, `tests/browser/nw-r02-greybox.spec.ts` |
| 7 | Traversal measurements | §6 below; raw data `docs/nw-r02/measurements.json` |
| 8 | Screenshots from the running game | `docs/nw-r02/screenshots/` (21 images) |
| 9 | Placeholder list | §9 below |
| 10 | QA report | §10 below |

---

## 1. Summary and gate status

The whole Chapter 1 layout exists as a playable greybox: 91 spaces, 99 connections (59 doors, 62 leaves), floors, walls, ceilings, doors, colliders, hiding spots, the crawlway, the maintenance passage, the chase run, the North Wing and its Chapter 2 continuation. An autopilot walked all 15 steps in the running game, using real input and no teleports: 425 m in 208 s of simulated time.

| Gate | Status | Basis |
|---|---|---|
| **A Architecture** | **Passed (automated); awaiting human review** | All the topology rules in the brief are encoded as tests on the same data that builds the geometry (§8). The layout generator rejects overlapping spaces and any opening that isn't on its two spaces' shared boundary. |
| **B Navigation** | **Passed (automated); awaiting human play** | Flood fills on the real colliders, per-connection pathfinding, and the full walkthrough in the running game. No human has played it yet. Tested on SwiftShader only. |
| **C Encounter suitability** | **Partially verified** | The geometry checks pass: sightlines, cover, clearances, hiding exits, the two loop routes, the chase being a single line, and the approach positions. **No encounter is implemented.** Shaw and her AI don't run in the greybox, the trolley isn't simulated, and the beam, steam, knocks and phone are markers only. Whether the spaces *play* well is unverified. |
| **D Technical verification** | **Passed (automated), with listed gaps** | World validator, door sweeps, no leaks with doors shut, floor seams, typecheck, the full existing suite (unchanged, all passing), and no console errors. Gaps: real-GPU performance, and a systematic camera check in narrow spaces (§10.3). |
| **E Human approval** | **Not passed (Claude can't pass it)** | Waiting on your review. |

---

## 2. Branch and dependencies

- **Base:** `origin/main` (`e36a3a3`), the latest approved implementation. The open draft PRs #17–#24 (NW-005A through NW-007C) are **not** included, because none is approved.
- **Docs:** the two design-only commits for NW-R00 and NW-R01 were cherry-picked onto the branch unchanged.
- **Consequences of leaving the drafts out:**
  - Shaw's stealth AI, her model and animations, and the newer checkpoint work from those branches aren't here.
  - The greybox doesn't need them: it runs the world and gameplay modules only, with no entities.
  - When those branches land, the greybox can host Shaw for encounter prototyping. That is a later task.
- **No merge conflicts** were created or resolved. Changes outside new files:
  - one block in `src/main.ts`, active only with `?level=greybox`;
  - no edits to existing tests.
- **Unclear dependency to report:** R01 §7.3 says Chapter 1 needs a new checkpoint schema. The greybox uses developer teleport checkpoints (CP0–CP8) instead, and doesn't touch the existing schema.

---

## 3. What was built

### 3.1 Data-driven level

`src/world/greybox/level.ts` is the single source for everything below:

| Table | Contents |
|---|---|
| `SPACES` | Rooms, corridors, crawl and service spaces. Each is a union of rectangles on a 0.1 m grid, with a zone, a ceiling height, and a required/optional flag. |
| `CONNECTIONS` | Open archways, doors (single or double; open, closed or locked; optional requirement flag; swing side), hatches and windows. |
| `FEATURES` | Beds and benches (under-bed hiding), lockers (hiding), obstacle and cover blocks, developer progression controls, and labelled markers. |
| `CHECKPOINTS`, `ENCOUNTERS`, `WALKTHROUGH` | Teleport checkpoints CP0–CP8, encounter areas E1–E6, and steps 1–15. |

How `grid.ts` turns the data into walls:
- It rasterises the spaces onto a 0.1 m grid.
- It generates a 0.15 m wall on every boundary between two different spaces, or between a space and the void, except where a connection opens it.
- Over openings it adds lintels up to the higher ceiling, and sills under windows.

`build.ts` turns the result into a standard `HospitalWorld`:
- It reuses the existing `door()`, `addLockerHiding()` and `addBedHiding()`.
- Every surface has a collider.
- Floors are tinted by zone; required spaces are brighter.
- Spaces are labelled on the floor and on hanging signs.
- Developer controls are yellow posts with a "DEV CONTROL" sign.

### 3.2 Topology (as approved)

| Area | What was built |
|---|---|
| **Lobby** | Connects to exactly four places: west (archway), south (archway), east (F1 fire doors, push-bar from the east only) and the Nurse's Office, directly north. |
| **West** | Room 104 is at the west end and opens only onto the west corridor. The corridor reaches the rest of the level only through the lobby. Ten rooms, including Bay 105–108 (four under-bed hides), the linen cupboard locker and the Sister's bay. |
| **South** | The corridor runs south, then turns east into the **main store** (ST1: two aisles looping around a central rack). Farther east is the smaller **porters' room** (ST2: desk, locker, cage cover and the crawlway hatch). |
| **Crawlway** | Runs from the ST2 hatch to the ES2 grille at the south end of the southern branch. Ceiling 1.2 m (crouch only). **Two splits, each of which rejoins:** V1 has the grille run and the steam run; V3 has the lower duct and the upper run. |
| **East** | A corridor with rooms, then the **loop**: a 14 × 30 m ring that is taller than wide. It has eight patient rooms on its long sides, utilities north, ISOLATION south, and a core office with a door and an observation window on each long side, plus a treatment room. The loop reconnects at its east end into the junction. That junction splits into the **southern branch** (rooms, crawlway exit) and the **northern branch** (rooms, Plant 2). |
| **Maintenance** | Starts at Plant 2 (beyond the northern branch) and winds generally west: M1 narrows from 2.2 to 1.6 m; M2 is a 1.4 m cable tunnel (forced crouch); then the M3 pump chamber (cover, alcove locker, valve), the M4 link and the M5 bulkhead. |
| **Chase** | M6 has 4 turns. Then the barred door, M7, the M8 low duct (1.2 m, crouch), the M8C riser hall, the M9 door, the old north corridor, and the NT doors into the North Wing. **A single line with no parallel route.** |
| **North Wing** | Corridor, reception and the spine down to the office's north door, with Chapter 2 continuations behind two locked doors. |
| **Nurse's Office** | **Exactly two doors.** The lobby door works. The North Wing door is locked and barricaded on the North Wing side, so it's visible early and reachable from the far side at the end. |

---

## 4. Developer map

![Developer map](nw-r02/screenshots/00-developer-map.png)

The map (M in game) is drawn from the same layout that builds the geometry, including the generated walls themselves. It shows:
- rooms by zone, with required spaces brighter and crouch-only spaces hatched;
- doors coloured by live state (open, closed, needs a flag, locked);
- hatches, low openings and windows;
- encounter areas E1–E6;
- checkpoints CP0–CP8 (click to teleport);
- developer controls (turning green when used) and hiding spots (H);
- walkthrough steps 1–15, the player position, and live telemetry.

---

## 5. Walkthrough, steps 1–15

The route was generated over the real colliders: a wall-averse grid search, string-pulled with capsule sweeps. Doors are crossed squarely, and the route crouches wherever the ceiling is below 1.85 m. The autopilot walked it in the running game with real key events (W, C, E). Distances and times are measured, at walking speed with no sprinting.

| Step | Scene | What happens in the greybox | Route m | Measured m | Sim s | Crouched s | At control s |
|---|---|---|---|---|---|---|---|
| 1 | S01 | Wake in Room 104 (CP0) | 0 | 0 | 0 | 0 | 0 |
| 2 | S02 | Leave Room 104 | 5.5 | 5.1 | 2.4 | 0 | 0 |
| 3 | S03 | West corridor past the E1 markers to the lobby threshold (CP1) | 25.6 | 25.5 | 10.8 | 0 | 0 |
| 4 | S04 | Payphone (dev control `payphone`) | 5.1 | 5.2 | 2.5 | 0 | 0.8 |
| 5 | S05 | Open the office door; try the north door (locked); transfer notice (`route-stores`) | 12.5 | 12.2 | 6.7 | 0 | 0.7 |
| 6 | S06 | South corridor to the stores (CP2) | 43.5 | 42.9 | 18.2 | 0 | 0 |
| 7 | S07 | Porters' room: docket and sign-out sheet (`route-plant2`) | 20.9 | 20.7 | 9.3 | 0 | 0.6 |
| 8 | S08 | E2 placeholder: to the hatch (CP3) | 3.7 | 3.3 | 1.5 | 0 | 0 |
| 9 | S09 | Crawlway, crouched, to the ES2 grille (CP4) | 21.0 | 20.1 | 18.4 | 17.4 | 0 |
| 10 | S10 | Southern branch, junction, northern branch: Plant 2 is locked | 49.4 | 49.2 | 20.7 | 0 | 0 |
| 11 | S11 | Loop (CP5) into the core office: key theft (dev placeholder `shaw-keys`) | 40.9 | 40.1 | 17.5 | 0 | 0.6 |
| 12 | S12 | Open Plant 2 (CP6); M1, M2 (crouch), M3: valve (`valve-open`) | 80.2 | 79.6 | 38.9 | 6.7 | 0.6 |
| 13 | S13 | Through the steam gate to the bulkhead (CP7): crank (`bulkhead-cranked`) | 16.1 | 15.7 | 8.5 | 0 | 0.7 |
| 14 | S14 | Bulkhead, M6 (4 turns), barred door, M8 (crouch), M9, old north corridor, NT doors (CP8) | 75.6 | 74.7 | 39.6 | 4.0 | 0 |
| 15 | S15 | North Wing spine to the far side of the barricade (`chapter-end`) | 31.0 | 31.0 | 13.1 | 0 | 0.6 |
| | | **Total** | **431** | **425.3** | **208.1** | **28.1** | **4.6** |

The route goes back on itself in the east, as R01 intends:
1. Step 10 checks Plant 2 at the end of the northern branch.
2. Step 11 goes back to the loop for the keys.
3. Step 12 returns to Plant 2.

The northern branch therefore carries the most distance of any zone (70 m).

Screenshots (from the running game, `docs/nw-r02/screenshots/`):

| | |
|---|---|
| ![](nw-r02/screenshots/01-room104.png) 01 Room 104 | ![](nw-r02/screenshots/02-west-corridor-e1.png) 02 West corridor (E1) |
| ![](nw-r02/screenshots/03-lobby.png) 03 Lobby | ![](nw-r02/screenshots/04-office-north-door.png) 04 Office north door |
| ![](nw-r02/screenshots/05-south-corridor.png) 05 South corridor | ![](nw-r02/screenshots/06-main-store.png) 06 Main store (rack loop) |
| ![](nw-r02/screenshots/07-porters-hatch.png) 07 Porters' room hatch | ![](nw-r02/screenshots/08-crawlway.png) 08 Crawlway (crouched) |
| ![](nw-r02/screenshots/09-es2-exit.png) 09 ES2 grille | ![](nw-r02/screenshots/10-loop-west.png) 10 Loop west corridor |
| ![](nw-r02/screenshots/11-loop-office.png) 11 Loop office | ![](nw-r02/screenshots/12-plant2.png) 12 Plant 2 |
| ![](nw-r02/screenshots/13-cable-tunnel.png) 13 M2 cable tunnel | ![](nw-r02/screenshots/14-pump-chamber.png) 14 M3 pump chamber |
| ![](nw-r02/screenshots/15-bulkhead.png) 15 Bulkhead | ![](nw-r02/screenshots/16-chase-run.png) 16 M6 chase run |
| ![](nw-r02/screenshots/17-old-north-corridor.png) 17 Old north corridor | ![](nw-r02/screenshots/18-north-wing.png) 18 North Wing |
| ![](nw-r02/screenshots/19-barricade.png) 19 Far side of the barricade | ![](nw-r02/screenshots/20-collider-overlay-loop.png) 20 Collider overlay (K) |

---

## 6. Traversal measurements

### 6.1 What is measurable, and what isn't

| Quantity | Status | Value |
|---|---|---|
| Raw traversal: distance | **Measured** | 425.3 m (route 431 m) |
| Raw traversal: moving time (walk 2.4 m/s, crouch 1.1 m/s) | **Measured** | 197.8 s |
| Crouched time and distance | **Measured** | 28.1 s, 29.8 m |
| Greybox interaction time (door opening, time near unused controls) | **Measured** | 4.6 s at controls; about 10.4 s stationary in total, including door swings |
| Exploring time (in optional rooms) | **Measured** | 6.1 s. The autopilot only crosses optional rooms (the loop office's doorways). It doesn't explore. |
| Total greybox traversal | **Measured** | **208.1 s (3 min 28 s)** of simulated time. The telemetry matches the simulation clock to within 1 s. |
| Time per zone | **Measured** | Table below |
| Future gameplay time (encounters, puzzles, story beats, exploration) | **Not measurable** | Placeholders only. Only design estimates exist: R01 §5 expects 32:20 in total (mandatory-only 25:50). |
| Actual future play time | **Not measurable** | Needs implemented encounters and human playtests. |

No artificial waiting: the autopilot doesn't pause or idle, and nothing in the greybox imposes a delay. The time spent stationary is door swings (0.9 s each) and aiming at controls.

### 6.2 Per zone (measured)

| Zone | Seconds | Metres |
|---|---|---|
| West ward | 14.1 | 32.6 |
| Lobby | 11.4 | 22.8 |
| Nurse's Office | 2.8 | 5.8 |
| South corridor | 14.1 | 33.3 |
| Stores | 10.5 | 21.9 |
| Crawlway | 15.9 | 16.5 |
| East corridor and junction | 9.5 | 22.1 |
| Loop | 7.0 | 14.7 |
| Southern branch | 11.2 | 25.6 |
| Northern branch | 30.7 | 70.3 |
| Plant 2 | 3.4 | 8.0 |
| Maintenance | 27.6 | 48.0 |
| Chase run | 26.1 | 52.9 |
| Old north corridor | 9.9 | 17.7 |
| North Wing | 14.0 | 33.0 |

### 6.3 Reading the numbers (candidly)

**1. Raw traversal is only about 11% of the expected first play.**

| | Time |
|---|---|
| Greybox traversal | 3:28 |
| R01 expected first play | about 32:20 |
| Remainder, which must come from encounters, puzzles, story and exploration | about 29 minutes |

None of that remainder can be checked yet. The greybox gives the floor, not the duration.

**2. Some greybox distances are much shorter than R01 assumed.** Decide whether this matters before production.

| Section | R01 assumed | Greybox | Why |
|---|---|---|---|
| Crawlway | about 60 m | 20 m (the main route) | The splits are compact. |
| Maintenance (E5) | about 100 m | about 56 m, Plant 2 to the bulkhead | |
| Chase (E6) | about 160 m | about 75 m, bulkhead to the NT doors | The parallel cut-off is removed (approved decision 4) and the service stair is omitted. |

At sprint speed (4.3 m/s) the chase's running part is about 17 s, against R01's 46 s.

**3. If the R01 durations are to hold, the remedy is geometry, not waiting.** Options:
- lengthen M6 and the crawlway;
- add the service stair as a second level;
- add optional rooms.

All three are cheap in this data format: one rectangle and one connection each.

---

## 7. Encounter geometry validation

Every check below runs on the real colliders (Rapier) in `tests/greybox/greybox-navigation.test.ts`, unless it is marked as human-only.

| Encounter | Checked | Result |
|---|---|---|
| **E1 Lights Out** | The beam route is a clear 2.4 m corridor from the west end to the lobby. There are under-bed hides in Bay 105–108 and the W8 locker. A room's far corner is out of the corridor sightline (the crouch-in-the-dark option). The escape route east is open. Every hiding exit is free and reachable. | Pass |
| **E2 Stores** | Shaw's entrance from the south corridor is clear for her. The porters' doorway gives visual contact with the main store. The central rack breaks line of sight. Both aisles of the rack loop are walkable. There is a locker, an under-bench hide and cage cover. The hatch is reachable crouched; the crawlway is unreachable standing. | Pass |
| **E3 Crawlway** | Two splits that each rejoin (graph and geometry). Crouch-only. Exactly two ways in or out (hatch, grille). Shaw (standing) can't enter. | Pass |
| **E4 Loop** | A 0.5 m-radius trolley footprint fits around the whole ring, both routes. Office windows see both long corridors at eye height, and the sill blocks low views. More than one stealth route: north ring, south ring, and through the office. Nine loop hides. All three key-approach positions are reachable: A (trolley stops), B (far-side call buttons), C (office hook, and the waiting spot at the treatment-room door). | Pass (geometry only) |
| **E5 Maintenance** | Shaw-sized (0.4 m radius) standing clearance through every standing section. The forced crouches (M2, M8) are the only breaks. The pump cover and alcove locker are reachable. One uninterrupted route, Plant 2 to the North Wing. | Pass |
| **E6 Chase** | Every chase link is a cut edge (no parallel route). With the bulkhead and NT doors shut, the chase spaces form a sealed pocket, so Shaw can only come in through the bulkhead, behind the player. The old north corridor keeps a 1.2 m lane past its obstacles. | Pass |
| *All* | Turn visibility, guidance readability, the beam/steam/knock timings, and whether a chase from behind feels fair | **Human playtest needed** |

---

## 8. Tests

New tests:

| File | Tests | Covers |
|---|---|---|
| `tests/greybox/greybox-architecture.test.ts` | 15 | Lobby has four connections; **office has exactly two doors** (lobby usable, North Wing locked, barricade on the far side); west section only via the lobby; south turn into the stores; **loop connectivity** (two routes, rejoins east, office doors and windows, eight rooms); branches; crawlway splits; maintenance as a single line; chase cut edges; North Wing only via NT; no unreachable rooms; progression without softlock (keys before Plant 2, valve before steam, crank before the North Wing, F1 optional); walkthrough, checkpoint and encounter data; three key approaches reserved |
| `tests/greybox/greybox-navigation.test.ts` | 14 | World validator; every door sweeps open and closed without collision; **no leaks** with every door shut; floor seams; full crouched reachability; standing can't enter the low spaces; hiding exits; E1, E2, E4, E5 and E6 geometry (§7); North Wing sealed; pathfinding across every connection |
| `tests/greybox/greybox-route.test.ts` | 1 | The committed walkthrough route still matches the geometry |
| `tests/greybox/registry.test.ts` | 1 | The committed registry matches the data |
| `tests/browser/nw-r02-greybox.spec.ts` | 2 | The autopilot walkthrough of steps 1–15 in the running game, and the screenshot pass |

Results on this branch:
- `npx vitest run`: **51 files passed, 1 skipped** (that skip was there before this work). **464 tests passed.** No existing test was changed, removed or weakened.
- `npx tsc --noEmit`: clean.
- `npx playwright test tests/browser/nw-r02-greybox.spec.ts --trace off`: 2 passed, with no console errors.

The other browser specs weren't re-run, because the default game path is unchanged.

To regenerate the evidence:
- route and registry: `GREYBOX_WRITE_ROUTE=1` and `GREYBOX_WRITE_DOCS=1`;
- screenshots and measurements: `NW_R02_EVIDENCE=1` with the browser spec.

---

## 9. Placeholder list

Everything here is a clearly labelled stand-in. None of it is final behaviour.

| # | Placeholder | Where | Stands in for | Production estimate (design) |
|---|---|---|---|---|
| P1 | `[DEV] Payphone (answer)` control | Lobby | S04 call (Ruth, then Shaw) | 45 s |
| P2 | `[DEV] Transfer notice` control | Office | S05 notice and Standing Orders | 20 s |
| P3 | `[DEV] Docket + sign-out sheet` control | Porters' room | S07 route clues | 30 s |
| P4 | **`[DEV PLACEHOLDER] Take Shaw's keys`** control | Loop office | **E4 key theft by approach A, B or C** | 4:45 (E4 expected) |
| P5 | `[DEV] Valve` control, plus the steam gate (a door needing `valve-open`) | M3 / M3–M4 | Valve puzzle and steam block | 45 s |
| P6 | `[DEV] Bulkhead crank` control, plus the bulkhead (a door needing `bulkhead-cranked`) | M5 | Hold-to-crank, bell and chase start | 4 s hold, plus the chase |
| P7 | `[DEV] Examine the barricade` control | North Wing spine | S15 chapter end | 1:30–2:00 |
| P8 | `[DEV] Call button` control | Room 103 (W2) | Call-lamp teaching (approach B) | 2 s |
| P9 | `[DEV] F1 push-bar` control | East corridor | F1 fire doors, push-bar from the east | 1.5 s |
| P10 | E1 markers (start, trigger, end) | West corridor | Lights Out director, beam and volume test | about 75 s |
| P11 | E2 markers (phone ring, Shaw's entrance, trolley bay, radio lure, stores locked) | Stores | E2 director and Shaw | 2:45 |
| P12 | Crawlway markers (steam, ceiling grilles, the V3 grate where Shaw stops, the knocker at V4) | Crawlway | Knocking, steam timing, the stop beneath the grate | 3:15 |
| P13 | Hatch and grille are plain openings | ST2, ES2 | Wing-nut hatch (5 s) and one-way kicked grille | — |
| P14 | Convex-mirror markers (four corners) | Loop | Mirrors | — |
| P15 | Approach A/B/C markers | Loop | Trolley stops, call buttons, office hook and waiting spot | — |
| P16 | E5 markers (seven lamps, evidence, Shaw's search) | M3, M4 | Lamps, evidence, near miss | 3:30 |
| P17 | Chase markers (C1, C2 bar, C5, C6 stair omitted, C9 stop at the glass), plus a linen-trolley block | Chase, old north corridor | Chase director, bar, pull-down trolley, Shaw's stop | 2:00 |
| P18 | Under-bench hiding uses the under-bed prompt | ST1 bench | Bench variant (**NEW** in R01) | — |
| P19 | Story markers (green signs) | Various | Story props and inspections | — |
| P20 | Lift and stair signage | Lobby | Lifts and stairwell (never open) | — |
| P21 | Chapter 2 stubs (two small rooms behind locked doors) | North Wing | Chapter 2 area | — |
| P22 | Developer checkpoints CP0–CP8 (teleport and flags) | Map | The Chapter 1 checkpoint schema (R01 §7.3) | — |
| P23 | Neutral hemisphere lighting, tinted floors, signage | Everywhere | Production lighting and dressing | — |
| P24 | Storm windows, "aftermath outside" | Room 104, North Wing | Exterior views (the greybox has no exterior) | — |

---

## 10. QA report

### 10.1 Defects found and fixed during the build

| Defect | How it was found | Fix |
|---|---|---|
| Wall-end extensions at T-junctions reached into a neighbouring door opening, so the F1 hinge leaf intersected the wall. | Door-sweep test | The generator no longer extends a wall end where a perpendicular opening starts. |
| Double doors exactly as wide as their corridor: the corridor's side walls overlapped the leaves (F1, NT). | Door-sweep test | Openings narrowed (F1 2.6 m, NT 2.0 m), so both have jambs. |
| A ground ray exactly on the seam between two floor slabs missed both (a support and navigation hole at every opening). | Pathfinding test | Floor colliders overlap by 0.07 m on each side, under the wall line. A seam regression test was added. |
| Obstacles in the old north corridor staggered across the corridor and left less than a 1.2 m lane. | Clearance test | Obstacles moved to one side. |
| Teleporting a standing capsule into the crawlway is refused. | Screenshot pass | Correct behaviour, not a defect: the shot now walks in crouched. |

### 10.2 Verified

| Check | Result |
|---|---|
| Bypassable walls and collision gaps | None. With all doors shut, every flood component equals the open-connection topology exactly. |
| Doors through geometry | All 58 unlocked leaves sweep fully both ways. |
| Unreachable rooms | None, except the two Chapter 2 stubs, which are locked by design. |
| Trapping | No leg of the walkthrough got stuck. The stuck detector never fired. Every hiding spot has a free exit. |
| Unintended routes into the North Wing | None. It is sealed when the NT doors are shut, and the office door is locked. |
| Forced crouch | Enforced by the ceiling (1.2 m and 1.4 m against 1.8 m standing). |
| Console errors | None. |

### 10.3 Not verified, or known limitations

| Area | Gap |
|---|---|
| **Camera in narrow spaces** | Checked only by the crouched autopilot traversal of the crawlway, M2 and M8, plus one screenshot. There is no systematic near-plane or clipping test. The crouched eye is at 0.9 m under a 1.2 m ceiling, and the crawl's clear width is 0.85 m. A human should check these spaces. |
| **Performance** | SwiftShader only: 765 colliders, about 6.7 k triangles, about 250 draw calls. There is no real-GPU measurement. The greybox isn't representative of production cost anyway. |
| **Single-level simplification** | R01's crawlway runs over the south corridor ceiling and under the east corridor, and the chase climbs a service stair. Here everything is on one level; the layering is marked as a placeholder (P12, P17). |
| **Autopilot steering** | Uses the test bridge's `aimAt` to point the camera. Movement, crouching, doors and interactions use real key events. |
| **Navigation limit** | The game's default navigation limit (`maxNodes` 4096) can't plan across the whole level in one query. That's fine for local AI pursuit, but it's a constraint on any future level-wide Shaw navigation. |
| **Hiding prompts** | The bench uses the bed prompt (P18). |

---

## 11. Deviations from R00/R01 and open questions

**Applied (approved decisions):**
- Shaw stays behind the player for the whole chase. The parallel passage (C3), the fork interception (C4) and any route ahead have been removed.
- The night is 15–16 Oct 1987; the storm is unnamed. This affects only the marker text.
- Lights Out and the invisible beam are kept, as markers.
- All three key approaches are reserved, as positions.

**Greybox simplifications (for review):**

| # | Simplification |
|---|---|
| 1 | Service stair (C6) omitted. The M8C riser hall stands in for it. |
| 2 | Crawlway, maintenance and chase lengths are shorter than R01's timing assumptions (§6.3). |
| 3 | Crawlway V3: the "lower duct with floor grates looking up into the lobby's east doors" isn't physically under the lobby. |
| 4 | The F1 opening is 2.6 m and the NT doors 2.0 m, so both have jambs. |
| 5 | Plant 2's key requirement applies in both directions. R01: "opens freely from inside". |

**Questions for the reviewer:**
1. Should the greybox be lengthened toward R01's distances (crawlway about 60 m, chase about 160 m), or should R01's timings be revised down?
2. Should the service stair, and a second level for the crawlway's over-and-under runs, be added now, or deferred to production?
3. Is the loop's size (ring of 14 × 30 m, patient rooms on the outer long sides) right for a 3:20 lap?

---

*Prepared for human review. Do not merge. Gate E outstanding.*
