# NIGHT WARD — NW-R02B: Gameplay, Narrative and Voice Performance Design

**Chapter 1: The Final Round.** Design only. Nothing in this document is implemented, recorded or playtested.

| | |
|---|---|
| Branch | `claude/nw-r02b-gameplay-narrative-design`, from `claude/nw-r02-chapter1-greybox` (`b213165`) |
| Builds on | `docs/NW-R00-CHAPTER-1-DESIGN.md`, `docs/NW-R01-CHAPTER-1-REVISION.md`, `docs/NW-R02-CHAPTER-1-GREYBOX.md`, `docs/nw-r02/registry.md` |
| Authority | The NW-R02B brief (Shaw's revised direction, the chase rules, the 70/30 split) and the user's NW-R02 playtest notes override R00/R01 where they conflict. The approved NW-R02 map is kept **unchanged**. |
| Status | For human review. Gate: approval before implementation. |

Room IDs (`WC`, `W7`, `ST2`, `LOFF`, `M5`…), connection IDs (`office-north`, `bulkhead`, `NT`…) and coordinates refer to the greybox data in `src/world/greybox/level.ts` and the generated `docs/nw-r02/registry.md`.

## Contents

1. [Executive design summary](#1-executive-design-summary)
2. [Nurse Shaw: character bible (revised)](#2-nurse-shaw-character-bible-revised)
3. [Chapter 1 critical path, scene by scene](#3-chapter-1-critical-path-scene-by-scene)
4. [Player motivation and objective flow (the 15 steps)](#4-player-motivation-and-objective-flow-the-15-steps)
5. [Progression gates](#5-progression-gates)
6. [Choice and consequence matrix](#6-choice-and-consequence-matrix)
7. [The final chase: script and encounter direction](#7-the-final-chase-script-and-encounter-direction)
8. [Shaw dialogue and voice-acting guide](#8-shaw-dialogue-and-voice-acting-guide)
9. [Voice production options (with sources)](#9-voice-production-options-with-sources)
10. [Room purpose audit](#10-room-purpose-audit)
11. [The 24 placeholders: replacement decisions](#11-the-24-placeholders-replacement-decisions)
12. [Timing and pacing budget](#12-timing-and-pacing-budget)
13. [Technical dependencies and risks](#13-technical-dependencies-and-risks)
14. [Implementation milestones](#14-implementation-milestones)
15. [Decisions that need human approval](#15-decisions-that-need-human-approval)
16. [Self-critique](#16-self-critique)

---

## 1. Executive design summary

**The problem the playtest found.** The NW-R02 greybox proved the building works. Large, winding and believable, it already produces uncertainty. But a building isn't yet a game. The player reported four gaps:
- exploration that could dominate;
- some rooms that feel arbitrary;
- objectives that aren't clear;
- a chase with no cause.

The 24 developer placeholders stand where the game will be.

**The answer in one line.** Chapter 1 becomes **a search for Ruth that the night sister is trying, more and more desperately, to stop, because she believes she is saving you.** Every mandatory scene answers one question: *where did they take Mum, and why won't Shaw let me follow?*

**Key changes from R01:**

| Area | R01 | R02B |
|---|---|---|
| **Shaw's motive** | A ghost finishing her round. "That is not my ward." | A frightened, guilt-driven protector. She closed the link herself at 03:20 after seven patients didn't come back. She will do anything to stop another patient going through, **except enter the North Wing herself**. |
| **Why she stops at the North Wing** | A supernatural rule (rule 4, NOT IN USE). | **Her fear** (§2.5). She can push the doors. She can't make herself do it. |
| **The chase trigger** | Cranking the bulkhead. | A **story event** (§7): <ul><li>the player finds the order she wrote to close the link, and the sedation tray she prepared for 104;</li><li>unlocks the bulkhead padlock with **her own key**;</li><li>cranks it open, which rings the link-door alarm the player was warned about;</li><li>Shaw, already searching for her keys, arrives **behind**;</li><li>a short confrontation, then the pursuit.</li></ul> |
| **The chase route** | — | Unchanged and still a single line. The barred door and the low duct shape the gap. Her lines escalate through stages 4 → 5 → 6 (§2.3). |
| **The ending** | Shaw seen in her office through the barricade glass. | **Shaw's last appearance is at the NT doors.** She physically couldn't reach her office in time without teleporting. Her last words, *"Don't answer it when it calls you,"* set up the North Wing PA voice that ends the chapter. |
| **Choices** | — | One persistent value, **Shaw's suspicion (0–4)**, plus four knowledge flags. They change how she searches E2, E4 and E5 and the chase's opening gap. They change gameplay, not just dialogue (§6). |
| **Rooms** | — | W7 becomes the west **nurses' station**, which triggers Lights Out. W8's staff locker becomes a **linen press**. ES3 becomes **Side Room 7**: the bed of one of the seven, with the transfer list. EN3 becomes the **link office** (key board, alarm panel, link log), which also removes a backtrack. No geometry changes are required. |
| **Voice** | Robotic synthesised voices (FFmpeg Flite, US accent). | **Record Shaw with a professional British actress.** Use a paid, commercially licensed neural TTS (ElevenLabs, with a designed voice, never a clone) only for **temporary** lines during implementation, and possibly for minor PA voices. A local open-source option (Chatterbox, MIT) is the free fallback for scratch audio (§9). |

**Pacing.** The target is about 30 minutes of first play, budgeted at 32:00 (§12), with exploration at about 14% (cap 30%). Measured greybox traversal (3:28) is the only verified number. Everything else is a design estimate until people play it.

---

## 2. Nurse Shaw: character bible (revised)

This section overrides R00 §C and R01 §1.4 wherever they conflict.

### 2.1 Who she is

**Sister Margaret Shaw**, 58. Night sister of Ward 4, Halden Vale General, for 31 years. She trained in 1947, at 18, under the old Nightingale discipline: starch, the Standing Orders, never run except for fire or haemorrhage. She is unmarried. The ward has been her whole life.

**What happened (the authorial truth, mostly hidden in Chapter 1):**
1. At 03:00 on 16 October 1987, the storm had closed the road, so the porters began moving the last patients to the new North Wing through the service link.
2. Shaw escorted the first trolleys.
3. At 03:17 the power failed in the link. When the lamps came back, **seven patients were not on their trolleys**. Ruth Avery was one of them.
4. Shaw went to the North Wing doors. **She saw, or heard, something on the other side** that she has never let herself describe. Chapter 1 doesn't reveal what.
5. At 03:20 she closed the link: padlock, chain, and her own handwritten order. Then she went back to her ward and **began her round again, so that nobody else would be lost**.
6. The old block has been held at 03:17 ever since. Her round is the only thing she can still control.

**What she believes about you.** You are patient 104 (you're wearing Ruth's wristband) and you are out of bed. Patients who go towards the North Wing are lost, so keeping you on the ward is keeping you alive. Every escalation in Chapter 1 comes from that belief, not from malice.

**Physical presence:**
- Her eyes are bandaged; this isn't explained. She is short-sighted in play (vision 7 m) and her hearing is sharp (×2.4), both existing values in `ENTITY_PROFILES.nurse`.
- Starched cap, cape, fob watch, a ring of keys that clinks, and rubber-soled shoes with a slight squeak.
- She walks the round (0.9 m/s). She almost never runs until stage 4.

### 2.2 What makes her coherent (her rules)

These are both her character and the game's rules. They're taught by play, and written in her **Standing Orders**, framed in `OFFICE`.

| # | Rule (in her words) | Why she holds it | Gameplay |
|---|---|---|---|
| 1 | "A patient out of bed is returned to bed." | Safety, routine, control | She captures, sedates (implied) and returns. The fail state goes to the checkpoint. |
| 2 | "A calling patient comes first." | Duty; guilt over the seven who called and weren't answered | Call lamps divert her (key approach B). |
| 3 | "Isolation is not entered without the consultant." | Infection discipline | `LISO` is a safe room in E4. |
| 4 | "The link is closed by order. No patient goes through." | **Guilt and fear (new)** | The motive of the whole chapter. Replaces R01's NOT IN USE rule. |
| 5 | "The keys stay with Sister." | Control; the Plant 2 key and the link padlock key are on her ring | E4's objective |
| 6 | "Patients do not use the crawlway." | Dignity, age, uniform: she won't crawl. Practical, not supernatural. | The crawlway is safe. She looks in through grilles. |

**Removed from R01:** "she does not open a door marked NOT IN USE." She stops at the NT doors **because she is afraid**, not because of a rule. The NOT IN USE signs stay as 1987 fiction, and she ignores them everywhere else: she walks through the `M9` door, which is signed NOT IN USE, during the chase.

### 2.3 Emotional progression (six stages)

Each stage has a trigger, a behaviour, a voice and an AI tuning. Stages only ever advance, and a checkpoint restores the stage reached.

| Stage | Trigger | Where | Behaviour | Voice | AI / director parameters |
|---|---|---|---|---|---|
| **1. Professional composure** | Chapter start | Intercom (S01), payphone (S04), first sight (S08) | Routine. Addresses the player as "one-oh-four". She is never seen hurrying. | Measured, warm-firm, clipped consonants | Patrol 0.9 m/s; investigates noises at walking pace; no pursuit outside an encounter |
| **2. Suspicion** | Any of: found by the Lights Out beam; answering the stores phone; Ruth's bag missing; the open hatch | E2 Stores, E3 below the grate | She notices disturbances and checks hiding places she heard. She speaks to herself, testing the room: *"Someone's been in here."* | Lower, slower, listening between words | Search radius +25%; listen pauses 2.5 s → 4 s |
| **3. Protective anxiety** | **Her keys are taken (E4).** She realises the Plant 2 and link keys are on the ring, so the player is heading for the link. | E4 search; intercom from `LOFF` | Her round stops. She searches the loop, then the branches. She speaks **to** the player over the ward intercom. First use of "love". | Composure cracking: pitch up, breath audible, sentences unfinished | Search mode; walk 1.2 m/s; checks `NBR` and `M0` within 90 s |
| **4. Desperation** | The player passes Plant 2 into the maintenance passage | E5 (`M3` search), the S13 confrontation | She follows into the passage, searches the pump chamber, pleads into the dark. At the bulkhead she **begs** before she pursues. | Open emotion, pleading, voice breaking | Pursuit speed held 0.3 m/s below the player's sprint; never closer than 6 m (§7.4) |
| **5. Aggression** | The barred door gives way (C2 → C3) | `M6E` → `NL` | Panic shows as force: she shouts, hammers, shoulders doors, kicks the fallen trolley aside. | Loud, sharp, ragged. Commands, not threats. | Pursuit 3.4 m/s (existing), with the gap limiter; door-hit and obstacle-clear animations |
| **6. Fear** | The player passes the NT doors | `NL` at the NT doors (x = −16) | She slows over 4 m, then stops at the glass. Her palm flattens against the push plate and doesn't push. She backs away. | Whispered, shaking, almost tender | Director-owned: an authored stop pose and a retreat route back east along `NL` |

### 2.4 Speech rules (for writers and actors)

- **She is a 1987 ward sister, not a horror villain.** Clinical vocabulary ("observations", "obs", "porters", "Staff", "the link", "consultant"); institutional address ("one-oh-four", "young lady/young man" is avoided because the player's gender isn't fixed); personal address only when breaking ("love").
- **No threats of harm.** Every line is an instruction, a plea or a fear. The menace is in what she *does* (the sedation tray, the capture), never in what she says.
- **She never explains the North Wing.** At most, three oblique references in the chapter (§8.2).
- **Breath and silence are written into the script.** She is 58 and running. From stage 4, lines are allowed to break mid-word.
- **Line budget:** about 34 authored lines plus about 30 short barks and efforts (§8). R01 had 12. More lines are justified, because the brief makes her a character, not a mechanic. Every line still has a gameplay job.

### 2.5 Why she does not enter the North Wing

She is not stopped by a barrier, a rule, or any inability. She stops because **she has been at those doors once before, at 03:17, and saw what took the seven**. Her terror is greater than her duty, and that conflict is the climax of her arc:
- **Shown, not told:**
  - She gets **slower** over the last 4 m.
  - Her hand is on the push plate, and the door moves a centimetre. **She takes her hand away.**
  - She doesn't look through the glass at the player. **She looks past them**, down the North Wing corridor.
  - She backs away without turning her back on the doors.
- **Her last words** (§7.6) make the player realise she knows something they don't.
- **Consistency elsewhere:** she enters every other space on the map except the crawlway (rule 6, which is practical) and `LISO` (rule 3). She has never been seen avoiding a door for supernatural reasons.

### 2.6 Her relationship to Ruth

Shaw liked Ruth (planted in the office: a get-well card from Ruth to "Sister", thanking her for the extra blanket). She blames herself for Ruth. That's why the property bag matters to her in E2 ("I'll keep it safe for her"), and why she uses Ruth's name only once, at the bulkhead (§7.3).

---

## 3. Chapter 1 critical path, scene by scene

Fifteen scenes, following the 15 greybox walkthrough steps. **Bold** marks fixed narrative events that every player experiences. Room IDs are the greybox's.

| # | Scene | Spaces | Reason to begin | Objective | Obstacle | Interaction / decision | Consequence | Transition |
|---|---|---|---|---|---|---|---|---|
| S01 | **Waking** | `R104` | You wake in Mum's bed, in her wristband, at 3:17 | Find Mum | Disorientation; the frozen storm | Look; read the wristband (AVERY R. 104) | You know you're "104" | The door is open; the corridor light is on |
| S02 | Mum's things | `R104`, `WC` | Her chair is empty; her glasses are on it | Find where she went | None (a calm beat) | Inspect the glasses and the crossword ("3:17" written in her hand) | The intercom calls the final round: *"All patients will be in their beds."* | The corridor and the light at the lobby end |
| S03 | **Lights Out (E1)** | `WC`, `W2`–`W9` | Passing the west nurses' station (`W7`), the lighting panel clicks the banks off one by one | Reach the lobby unseen | A torch beam with no holder checks every room east-bound | Hide (Bay beds, the W8 linen press, the W7 counter), outrun it, or crouch in a checked room | Caught: you wake in `R104` (soft fail), **suspicion +1** | The beam fades at the lobby threshold; the payphone is ringing |
| S04 | **The payphone** | `LOBBY` | The phone rings whenever you're in the lobby | Answer it | None | Answer (strongly encouraged; can be ignored) | You hear Ruth: *"...they're taking us through the stores way... the link... don't let her..."* Then Shaw: *"Replace the receiver, one-oh-four."* | Two leads: Shaw's office (north), the stores (south sign) |
| S05 | **The barricaded door** | `OFFICE` | It's her office: answers might be in it | Learn where Mum was taken | The north door (`office-north`) is barricaded from the far side | Look through the glass (an empty wheelchair rolls away); read the transfer notice and the Standing Orders | You learn: transfers are *"via porters, Stores, then the link"*; rule 4, *"the link is closed by order"* | The lobby's south sign: STORES · PORTERS |
| S06 | South corridor | `SC`, `S1`–`S6` (optional) | Follow the transfer route | Reach the stores | Distance only (deliberately low tension) | Optional rooms: the dayroom TV, your coat in the relatives' room | Optional knowledge (§6) | The STORES sign and lit doors at the turn |
| S07 | **The porters' room** | `ST1`, `ST2` | The transfer route names the porters | Find the docket for 104 | None | Read the docket (*"AVERY R., 104, via link to North Wing, escort Sr Shaw"*) and the sign-out sheet (Plant 2 key: Sr Shaw, 02:40). Optionally take Ruth's bag. | Entering `ST2` makes the **phone ring**. Shaw is coming for the property. | Her trolley squeak from the corridor |
| S08 | **First sight of Shaw (E2)** | `ST1`, `ST2`, `CE` | She's coming here | Don't be found | Shaw, searching | Answer the phone or let it ring; take the bag or leave it; hide, watch or go into the crawlway | Suspicion changes; she **locks the stores** if you're inside | The only way on is the hatch |
| S09 | **The crawlway (E3)** | `CE` → `CX` | Locked in, or choosing the hatch | Get out the other side | Steam (run b), Shaw below the V3 grate | Knock and get answers; choose runs a/b and c/d; wait or move at the grate | Finding Okafor's torch and badge at `V4`; suspicion ±1 (§6) | The ES2 grille, which is one-way |
| S10 | **The link office** | `SB`, `EJ`, `NBR`, `EN3`, `ES3` | The docket said "the link"; the junction sign points to PLANT 2 / LINK | Get into Plant 2 | **The key board's PLANT 2 hook is empty; the sign-out sheet says Sr Shaw.** The link alarm warning is posted. | Read the link log (Shaw's 03:20 closure entry); optional `ES3` (Side Room 7: the transfer list of seven, with Ruth on it) | Objective: Shaw's keys. You know she's on her round in the east loop. | Her handbell and trolley squeak carry from `LEC` |
| S11 | **Her keys (E4)** | Loop: `LWC`, `LEC`, `LNC`, `LSC`, `LOFF`, `LTR`, `LP*` | She has the key, on her ring | Take the keys | Shaw on her round (about a 3:20 lap) | Approach **A** (trolley), **B** (call-lamp lure) or **C** (office hook) | *"My keys."* **Stage 3.** Her intercom plea. The search begins. | Back to `NBR` and Plant 2, now with the key |
| S12 | **The passage (E5)** | `M0` → `M4` | Plant 2 opens with her key; the link is beyond | Reach the link door | M2 forced crouch; steam (valve); **Shaw follows in** | Valve puzzle; evidence in `M4` (link order, trolley, slipper, sedation tray "104"); hide in `M3` while she searches (stage 4) | You understand what she's protecting you from, and what she'll do. | The bulkhead (`M5`), padlocked with a key on her ring |
| S13 | **The bulkhead (confrontation)** | `M5`, `M4` | The link is the only way to Mum | Open it | Padlock, chain, crank (4 s hold); **the alarm rings**; Shaw arrives behind | Unlock with her key, crank while she pleads from 10–14 m; she reaches for you as it opens | **The chase begins** | Through the bulkhead, westward |
| S14 | **The chase (E6)** | `M6A` → `NL` | Shaw pursuing, stages 4 → 5 | Reach the North Wing | Turns, the barred door, the low duct, `M9`, dust-sheet obstacles | Bar the door (optional), crouch the duct, shoulder `M9`, pull the linen trolley (optional) | The **NT doors**. Stage 6: she stops. | Her last words; the North Wing's moving clocks |
| S15 | **The North Wing** | `NB`, `NB3`, `NB1` | Mum came this way | Find her | Silence; years of dust; locked Chapter 2 doors | Ruth's knitting (`NB3`); the far side of the barricade (`NB1`); Ruth's note | The PA calls *"the relative of patient one-zero-four"*. The voice is calm. You remember Shaw's warning. | Chapter 2 |

---

## 4. Player motivation and objective flow (the 15 steps)

The same 15 steps as `WALKTHROUGH` in `level.ts`. "Prevents premature progression" names the real architectural or story mechanism. None of them is an invisible wall.

| Step | What the player knows | What the player wants | Why the next location matters | What prevents premature progression | Action that advances | What changes | How the next objective is discovered |
|---|---|---|---|---|---|---|---|
| 1 Wake (`R104`) | Nothing. They're in Mum's bed, in her band. | Find Mum | The door is the only exit | — | Stand; look | Control is handed over | The open door; the lit corridor |
| 2 Leave 104 | Mum is "104"; it's 3:17; the storm is frozen | Find her or a nurse | The corridor leads to the lit lobby | — | Leave the room | The intercom: the round begins | The lobby light at the east end; the only way out of the west ward |
| 3 West ward and Lights Out | Something is doing a round | Not be "put back to bed"; reach help | The lobby is where the phone and offices are | The beam: being found resets you to `R104` | Survive E1 | The lights come back warm; **CP1** | The ringing payphone, audible from `WC` |
| 4 Payphone (`LOBBY`) | A round is happening | Find Mum; answer the phone | Ruth's voice: *"the stores way… the link"* | — (optional) | Answer | Ruth is alive and being moved; Shaw is named by voice | Two leads: her office (the door is in sight), and STORES |
| 5 Office (`OFFICE`) | Shaw runs the round | Find where Mum was taken | Her office has the transfer paperwork | The north door is barricaded; the wheelchair is seen through the glass | Read the notice | **Route: stores → porters → link.** Rule 4 is known. | The notice, and the lobby's south sign |
| 6 South corridor (`SC`) | The route | Follow Mum | The porters handled the transfer | F1 (east) is closed from the lobby side: a push-bar door, no handle on this side | Walk south | — | The STORES sign at the turn; lit doors |
| 7 Porters' room (`ST2`) | Porters moved her | The transfer record for 104 | The docket names the link and its key | — | Read the docket and sign-out | **"Plant 2 key: Sr Shaw."** The phone rings. | The phone; the squeak in the corridor (she's coming) |
| 8 E2 (`ST1`/`ST2`) | Shaw is coming | Not be caught | The hatch (chalked *"PORTERS' LINK – EAST WARD"*) is the porters' own way east | **If you're inside, she locks the stores.** The stores door is locked from her side (a real lock). | Hide or escape; she leaves | Stage 2; the stores locked; **CP3** | The only exit is the hatch, where the knock code is chalked |
| 9 Crawlway | The porters' way leads east | Get out; follow the route | ES2 is in the east ward, near the link | The crawl is one-way at the grille (kicked out from inside); the hatch can be closed behind | Reach and kick the grille | **CP4.** Okafor's badge: someone guided you. | The junction sign: ← EAST LOOP · LINK / PLANT 2 ↑ |
| 10 Link office (`EN3`) | The link is through Plant 2 | Get into Plant 2 | `EN3` shows the key situation without walking to the door first | **The Plant 2 door is locked** (a real lock); the key is signed out to Shaw | Read the key board and the link log | **Objective: Shaw's keys.** You know she closed the link herself (03:20). | The handbell and squeak from the loop; the link log: *"Sr Shaw on round (east)"* |
| 11 E4 (loop) | She has the keys; she's on a round | Take the keys | Plant 2 opens with them | Shaw's patrol; capture → **CP5** | Take the keys by A, B or C | **Stage 3.** Her intercom plea. Search mode. | You hold the key; Plant 2 is north up `NBR` (already seen in S10) |
| 12 Passage (`M0`–`M4`) | She closed the link; Mum is beyond | Reach the link | The link door is at the end of the passage | M2 (1.4 m, crouch); **the steam valve** (a real mechanical obstacle); Shaw's search behind | Turn the right valve; hide from her at `M3` | **Evidence:** the closure order, the sedation tray "104", the slipper. **CP7.** | The passage is a single line west; stencils read LINK → |
| 13 Bulkhead (`M5`) | What she'll do if she catches you | Open the link | Mum went through here | Padlock and chain (her key opens them); the crank; the alarm | Unlock, then crank (hold) | **The alarm.** Shaw arrives behind, stage 4. The door opens. | The open bulkhead, and the only way away from her |
| 14 Chase (`M6A`–`NL`) | She's behind you | Escape; reach Mum | The NT doors: the North Wing | Turns, the bar, the duct, `M9`, obstacles: physical, all passable | Run, bar, crouch, shoulder, push | **Stage 6**: she stops. **CP8.** | The North Wing corridor ahead; Ruth's red wool on the floor |
| 15 North Wing (`NB`, `NB1`) | Shaw is afraid of this place | Find Mum | The trail of wool leads to the office door, from this side | Chapter 2 doors are locked (story, signed "OPENING POSTPONED") | Examine the barricade; read Ruth's note | **The PA call.** The end of Chapter 1. | The chapter ends |

**Coincidence check.** Three potentially coincidental beats, each with a stated cause:
- **The payphone ringing:** Ruth is calling the ward's public phone from the North Wing reception. Chapter 2 confirms it.
- **The stores phone ringing:** it's Shaw's routine call before collecting property.
- **The knocking that guides you:** it's established, through Okafor's chalk and badge, as the porter who never left the link. It remains a mystery.

---

## 5. Progression gates

Every gate is physical or informational, and is introduced before it blocks.

| Gate | Space / connection | Type | How the player learns about it | How it opens | Softlock analysis |
|---|---|---|---|---|---|
| Office north door | `office-north` | Barricade (story) | Seen in S05 | Never in Chapter 1 | Not on the critical path |
| F1 fire doors | `F1` | One-way push-bar | No handle on the lobby side; the sign says PUSH BAR — EAST SIDE | From `EC` (optional shortcut back) | Optional |
| Stores locked by Shaw | `ST1-door` | A key lock, used by an NPC | Her line *"Stores secured."* and the key sound | Doesn't open again in Chapter 1 | The hatch is inside `ST2`. If the player is outside when she locks up, she **doesn't** lock (R01 rule), so `ST2` stays reachable. |
| Crawlway hatch | `hatch` | 4 wing nuts, about 5 s crouched hold, noise radius 7 m | Chalked knock code; *"PORTERS' LINK – EAST WARD"* | Hold interaction | Always openable from `ST2` |
| ES2 grille | `grille` | One-way (kicked from inside) | The light through its slats | Kick (tap) | Once open, it stays open; going back to the crawl is allowed |
| Plant 2 | `plant2-door` | Mortice lock, Shaw's key | The `EN3` key board with the empty hook; the sign-out sheet | **Shaw's key ring** (E4) | Three ways to get the keys; the windows repeat every lap |
| Steam | `steam` (M3 → M4) | Live steam leak from a pressure line | Hiss, vapour, a warning stencil | Close the **silver-and-red banded** valve. The wrong valve is loud. **A 90 s fail-safe vents the steam on its own.** | The fail-safe guarantees progress |
| Bulkhead | `bulkhead` | Padlock and chain, then a crank (4 s hold) | The `EN3` alarm panel: *"Link door — alarm sounds on opening"*; Shaw's tag on the chain | Shaw's key, then the crank | The alarm is the chase trigger |
| Barred door | `barred` | Drop-bar (optional for the player) | The bar is lit, hanging on hooks beside the door | Tap to slam and bar | Never blocks the player, who is on the far side |
| M9 | `M9` | Swollen door | It sticks when tried slowly | A shoulder tap, or running into it | Opens within 1.5 s whatever the approach |
| NT doors | `NT` | Push doors, swing shut | NOT IN USE signs | Push | — |
| Chapter 2 doors | `C2-west`, `C2-east` | Locked; "OPENING POSTPONED" | — | Chapter 2 | Not required |

**Backtracking.** Only one reversal remains on the critical path: `NBR` → loop → `NBR`, about 40 m each way. That's down from R02's Plant-2-first route, because `EN3` sits beside the junction and replaces walking to the locked Plant 2 door first (§10). After the keys, the return to Plant 2 is short and motivated: the player knows exactly where the door is.

---

## 6. Choice and consequence matrix

### 6.1 Fixed narrative events (every player)

1. Waking in `R104`.
2. Lights Out.
3. Shaw's voice: the intercom and the payphone. The payphone is answered by about 95% of players, and its lines are repeated by the office notice if they don't answer.
4. The barricaded door seen from the office.
5. The docket naming the link.
6. **First sight of Shaw (E2).**
7. The crawlway.
8. The link office: her closure order and the empty key hook.
9. **Getting her keys** (by some approach).
10. The passage evidence.
11. **The bulkhead confrontation.**
12. **The chase.**
13. **Shaw stops at the North Wing.**
14. Ruth's note and the PA call.

### 6.2 Shaw's suspicion (the one persistent value)

| Source | Δ |
|---|---|
| Found by the Lights Out beam | +1 |
| Answering the stores phone (she hears a voice that isn't the porter's) | +1 |
| Taking Ruth's bag | +1 (she finds hook 104 empty) |
| The hatch left open when she searches `ST2` | +1 |
| Seen but escaped, in E2 or E4 | +1 each (cap +2) |
| Quick-take of the keys in A (jingle) | +1 |
| Crawlway run (b) steam stagger, heard below | +1 |
| Waiting at the three knocks (crawlway V3) | −1 (she passes, reassured) |
| Approach B: she finds the lamp room empty | +1 (she knows someone pressed it) |

The value is clamped to 0–4. It's never displayed. Her lines and her behaviour reveal it.

| Suspicion | E2 | E4 | E5 (`M3` search) | Confrontation and chase-start distance |
|---|---|---|---|---|
| 0–1 | Collects property, short check of `ST2` | Standard round; office-window glances every second stop | 15 s search; she doesn't open the alcove locker | She stops 14 m from the player at `M4`/`M5` |
| 2 | Checks behind both cages; listens 4 s at the hatch | Window glances every stop; one under-bed check per lap | 20 s; opens the alcove locker if she heard entry | 12 m |
| 3–4 | Opens the `ST2` locker if she heard someone near it | Doubles back once per lap; call lamps answered 30% faster | 25 s; checks behind the pump housing | 10 m (the gap limiter still guarantees a 6 m minimum) |

**Fairness.** No value makes any scene impossible. The highest suspicion adds about 30–45 s of risk across the chapter. Exploring never raises suspicion by itself; only being noticed does.

### 6.3 Knowledge flags (information that changes play)

| Flag | Source (optional) | Effect |
|---|---|---|
| `knows-call-lamps` | `W2` call button (lights the corridor lamp) | Approach B is introduced. Without it, B is still discoverable in the loop: lamps are visible above every door. |
| `knows-knock-code` | `S5` sluice panel (also chalked at `CE`, so it's redundant) | Knock replies are understood sooner |
| `okafor-torch` | `V4` (the upper run d **or** the lower duct c; both pass it) | A hand torch for the chase's failing-light section (`M6C`–`M6D`). The emergency lamps alone still suffice. |
| `seven-names` | `ES3` Side Room 7 | The `M4` evidence names Ruth among the seven. At the NT doors, Shaw gets one extra line (§7.6). |
| `standing-orders` | `OFFICE` | The player knows rules 2, 3 and 6 before E4, which makes approaches B and C and the crawlway readable earlier |

### 6.4 The three key approaches (E4)

These are kept from R01 and rebalanced so none dominates.

| | **A. Lift from the trolley** | **B. The call-lamp lure** | **C. The office hook** |
|---|---|---|---|
| How | While she's inside a patient room (bell, then silence, then the bed check), approach the parked trolley crouched and take the ring | Press a call button in a room on the **opposite** long side (`LPW*` while she's east, or `LPE*` while she's west); take the keys from the parked trolley | Wait in the treatment room (`LTR`) or the office's other doorway; take the ring from the hook behind her while she writes the board (about 15 s) |
| Window | 8–12 s × 8 stops per lap | 20–30 s, once per lamp. She won't answer the same room twice. | About 15 s, once per lap |
| Risk | Medium. A careful take is a 1.2 s hold. A quick take jingles (heard at about 7 m), which brings her out early. | Low during the take. **But** she checks the lamp room, finds it empty, and *knows* someone pressed it, so suspicion goes +1 and the next lamp is ignored. | **High.** She's within 3 m. Crouched footsteps are heard at about 0.9 m. |
| Lead before discovery | Long. She notices at the end of the room check: about 10–25 s. | Longest. She's on the far side, and returns about 30–45 s later. | Short. She notices when she reaches for the hook: about 5–15 s. |
| Extra reward | — | — | **Her notebook is open on the desk.** The player reads the last entry (§8.2, L21) and learns her motive early: the most informed chase. |
| Search start | Where the trolley is | At the lamp room, so she's far from the player | **In the office, near the player.** The hardest escape. |
| Who it suits | Patient observers | Planners, and players who found `W2` | Bold players who want the story |

### 6.5 Other variable gameplay

| Choice | Options | Consequence |
|---|---|---|
| E1 response | Hide under a bed or in the linen press, stay ahead, crouch in a checked room | Caught: +1 suspicion and the walk back. Not caught: nothing changes. |
| Payphone | Answer, or ignore | Answer: Ruth's voice (motivation) and Shaw's first words. Ignore: the same information through the office notice, but no Ruth voice until Chapter 2. |
| Stores phone | Answer, or let it ring | Answer: she comes alert (1.35 m/s) and checks `ST2` first, +1. Ring: routine; she collects the property first. |
| Ruth's bag | Take, or leave | Take: the cardigan and note go into the journal (Ruth's handwriting is the emotional anchor), +1. Leave: she takes it, and it's **seen again** on her trolley in E4 (it can be retrieved with approach A). |
| Crawlway run 1 | (a) grille run: watch Shaw pass below, heading east; (b) steam run: faster, but a stagger risk | (a) information: you know where she's going. (b) about 10 s faster, risk +1. |
| Crawlway run 2 | (c) lower duct: the grate moment (wait, or move); (d) upper run: longer, quiet | (c) the tension beat; waiting −1, moving +1. (d) safe, about 20 s longer. |
| E5 hiding | Alcove locker, or crouch behind the pump | The locker is safer if she didn't hear the entry; the pump cover is better at high suspicion |
| Chase options | Bar the door; pull the linen trolley | Each adds about 1.5–3 s to the gap. Never required. |
| Optional rooms | Any | Knowledge flags only. Optional rooms never raise suspicion. |

---

## 7. The final chase: script and encounter direction

The geometry is unchanged: `M4` → `M5` (bulkhead) → `M6A`–`M6E` → `barred` → `M7` → `M8` (low duct) → `M8C` → `M9` → `NL` → `NT` → `NB`. In the greybox it measures about 75 m and is a single line (proved by `tests/greybox`: every chase link is a cut edge).

### 7.1 Build-up: evidence before the trigger (S12, `M4`)

Seven call lamps are fitted along `M4`'s wall. Each goes out as the player passes it (the seven).

| Evidence | Where | What it says | What the player learns |
|---|---|---|---|
| Transfer trolley, abandoned; Ruth's slipper on it | `M4` east end | — | The transfer stopped here |
| Incident slip | `M4` | *"Transfer suspended 03:17. 7 not accounted for. Link CLOSED by order, M. Shaw, 03:20."* | She closed it herself |
| **Sedation tray, prepared** | `M4`, on a dressing trolley | Kidney dish, syringe, ampoule box; a label in her hand: *"104 — if will not settle."* | What "back to bed" means. Staying is dangerous. |
| The chain and padlock on the bulkhead, with her tag | `M5` | *"DO NOT OPEN. NO TRANSFERS. Sr M. Shaw"* | She keeps people **away** from the North Wing deliberately |
| Alarm panel repeater | `M5` | *"LINK DOOR: ALARM SOUNDS WHEN OPENED"* (the same notice as `EN3`) | Opening will bring her. It's an informed choice. |

### 7.2 The trigger (S13)

1. The player unlocks the padlock with her key: a 1 s hold, quiet. The chain drops: loud, and heard about 7 m away. Shaw is not yet near.
2. **Cranking** is a hold, about 4 s, with a ratchet and the door groaning open. At 50%, the **link alarm** rings: an electric bell throughout the block.
3. The alarm is the cause. Shaw is already searching for her keys (since E4) and has reached `M0`–`M3` (stage 4, from E5). The bell tells her exactly where the player is.
4. **The confrontation.** She arrives from the east, along `M4`, **behind** the player:
   - She stops 10–14 m away (by suspicion, §6.2; director-held), lit by the call lamps' last glow.
   - She does not rush. She **pleads** (L24–L26).
   - The player can keep cranking. The crank isn't interrupted; releasing it pauses it.
5. On *"Please, love"* she starts walking forward: 1.2 m/s, hands open, not attacking.
6. The bulkhead reaches 100% and the player can go through. If the player doesn't move within 3 s, she breaks into a run. Capture leads to **CP7**.

**Why this is earned:**
- The player chose to open a door they **knew** was alarmed.
- They know why she wants them back (the tray), and why she's afraid (the closure order).
- She arrives along the path they came by, so they understand *how* she got there.

### 7.3 Confrontation lines (S13)

Stage 4. These are delivered from 10–14 m, over the alarm bell, which the director ducks to 40% under her voice.

> **L24.** *(breathless, controlled)* Stop that. Stop — take your hands off that.
>
> **L25.** You don't know what's on the other side of that door. I do. I was there.
>
> **L26.** *(the composure goes)* Your mother went through. Ruth went through, and I couldn't — *(breath)* Please, love. Come back to the ward. I'll take you back to bed and none of this—

She is interrupted by the bulkhead opening. Her line is cut: the dialogue player's interrupt is a real stop, not a fade.

### 7.4 The pursuit rules (system)

- **She is always behind.** There is one route, the player's.
- **No teleporting, and no appearing ahead.** She navigates the real grid (existing `createNavigationProvider`, with local queries). The chase director **only** modulates her speed:
  - She never closes within 6 m: her speed falls to the player's own when she does.
  - She never falls more than 16 m behind: her speed rises to 3.6 m/s.
- **Capture is real**, but only from these causes:
  - stopping for more than 2 s;
  - running back towards her;
  - repeated failure at the bar or the door, if the player chooses to fumble.
- **Assistance after failures** (unannounced): after 2 failures her speed cap is −5%; after 4 failures it's −15%, and `barred`/`M9` auto-complete.

### 7.5 Segment by segment

| Seg | Space | Player action | Shaw (stage, action) | Escalation device | Lines (§8.3) |
|---|---|---|---|---|---|
| C1 | `M6A`–`M6D` (4 turns) | Run | Stage 4. Starts from where she stood at the confrontation (10–14 m behind) and follows through the bulkhead. | Footsteps on grating; her breathing. **The lights fail bank by bank ahead** (`M6C`–`M6D`), leaving only red emergency lamps. The torch helps if found. | L27 *"Come back! I'm trying to help you!"*, then barks B1–B4 |
| C2 | `M6E` → `barred` → `M7` | Optional: slam and bar (tap; door 1.2 s, bar 0.6 s) | She hits the door; hammers 2 s; **silence** for 3 s (uncertainty); then shoulders it (3 hits) | The silence is the scare. *Is she gone? Is there another way?* (There isn't. The player doesn't know that.) | L28 (through the door), L29 |
| C3 | `M7` | Run | **Stage 5.** The bar splinters on the third hit. She's through, louder. | Bar crack, door slam, her shout | L30 *"STOP!"* |
| C4 | `M8` low duct (1.2 m, 3 m) | Forced crouch (1.1 m/s) | She has to stoop too. Her pace is held; her effort is audible. | Claustrophobia; she's close behind but slowed | B5–B6 (efforts) |
| C5 | `M8C` → `M9` | Shoulder the swollen door (tap, or run into it) | About 7 m behind | The door sticks for 0.5 s at a run; the timing is tolerant | L31 |
| C6 | `NL` (20 m, dust sheets) | Run; optional: pull the linen trolley (`nl-trolley`) behind | Stage 5, at full voice. **Her first full view of the player in light.** She kicks the trolley aside (+1.5 s). | Daylight-grey light from the NT doors' glass ahead; her loudest line | L32 *"YOU ARE NOT GOING THROUGH THOSE DOORS!"* |
| C7 | `NT` | Push through; the doors swing shut | **Stage 6.** She slows over 4 m and stops at the glass. | Her footsteps slow and stop. The player hears her breathing through the doors. | L33–L35 |

### 7.6 The ending (S14 → S15)

**At the doors** (director-owned; the camera stays with the player):
1. The player turns, freely, to see her through the wired glass. She has stopped at the doors.
2. Her palm is flat on the push plate. The door gives a centimetre. **She takes her hand away.**

> **L33.** *(whispered, shaking)* No. No, no — please. Not in there.
>
> **L34.** *(her face turned past the player, down the North Wing corridor)* Listen to me. Whatever you hear in there... *(breath)* ...don't answer it when it calls you.
>
> **L35.** *(only if `seven-names`)* They all answered.

3. She backs away four steps without turning her back on the doors, then walks east along `NL`, out of sight. Her footsteps fade. She isn't seen again in Chapter 1.

**In the North Wing (S15):**
1. The clocks read 3:18 and are moving. There are years of dust, and an *"OPENING POSTPONED"* notice.
2. Ruth's red wool leads along `NB` and into `NB3`, where her knitting bag lies. The trail continues down `NB1` to the back of the office door. The chairs are stacked against it, wedged with her knitting needles. Scratched into the paint: ***"DON'T OPEN THIS DOOR FOR ANYONE. NOT EVEN ME. — R."*** (§15, D7).
3. Through the barricade glass, the office is empty: her chair, her cape on its hook, the lamp on.
4. **The PA chime.** A calm voice the player has never heard: *"Would the relative of patient one-zero-four please come to North Wing reception."*
5. The player has just been told not to answer it. Fade. End of Chapter 1.

**Why this replaces R01's "Shaw in her office" image:** from `NL` to `OFFICE` by any walkable route is about 350 m. She couldn't be there within the 30–60 s the player takes, so showing her there would be a teleport. It is cut.

---

## 8. Shaw dialogue and voice-acting guide

### 8.1 Line list (sequenced)

**Stage 1. Composure**

> **L1.** *(intercom, S02)* Night staff. The final round begins at three-seventeen. All patients will be in their beds.
>
> **L2.** *(intercom, if the player loiters in `R104` longer than 60 s)* Lights will be going out shortly. Into bed now, please.
>
> **L3.** *(payphone, S04, after Ruth is cut off)* Replace the receiver, one-oh-four. *(beat)* There's a good — just put it down.
>
> **L4.** *(stores phone answered, S08)* Stores? It's Sister. Have you got bed one-oh-four's property? I'll be down for it directly. *(beat)* ...Who is this?
>
> **L5.** *(E2 entrance, to herself)* Right. One-oh-three... one-oh-six... one-oh-four.

**Stage 2. Suspicion**

> **L6.** *(hook 104 empty)* One-oh-four. *(beat; quieter)* Now where have you gone.
>
> **L7.** *(searching `ST2`)* I know someone's been in here. The lamp's still warm.
>
> **L8.** *(at the open hatch, crouched, face to the grille)* Patients do not use the crawlway. *(long pause, listening)* ...You'll catch your death down there.
>
> **L9.** *(leaving)* Stores secured. *(keys)* Back to bed when you're ready, one-oh-four. I'll be on the ward.
>
> **L10.** *(below the V3 grate, to herself, if the player waits)* ...Nothing. It's the pipes. It's always the pipes.

**E4 routine.** These are short, in-world and repeatable per lap.

> **L11.** *(at a bedside, singing two bars very softly, wordless; once per lap)*
>
> **L12.** *(at the office board)* Four... five... six. *(pause)* Six.
>
> **L13.** *(answering a call lamp)* Coming. I'm coming.
>
> **L14.** *(the lamp room is empty, approach B)* ...Who rang this? *(beat)* Who's playing games on my ward?

**Stage 3. Protective anxiety**

> **L15.** *(the keys are gone)* My keys. *(beat; then, understanding)* Oh, no. No. Not the link.
>
> **L16.** *(intercom from `LOFF`, about 20 s later)* One-oh-four. I know you can hear me. *(breath)* Whatever you think you're doing — whoever you think you're looking for — the link is closed. It is closed for a reason.
>
> **L17.** *(intercom, 60 s later if the keys are still not at Plant 2)* Please. Come back to the office. I won't be cross. Just bring me the keys and we'll say no more about it.
>
> **L18.** *(searching the branches)* You're frightened. I know. I'm — *(stops herself)* ...Come out, love.

**Stage 4. Desperation (E5 and S13)**

> **L19.** *(Plant 2's door bangs; her voice from `M0`)* I know you're down here.
>
> **L20.** *(searching `M3`, close)* There's nothing through there for you. Do you understand me? Nothing.
>
> **L21.** *(her notebook, approach C only; read, not spoken: a journal text in her hand)* "16th. 03:20. Link closed. I will not lose another one through that door. I will not. I will not."
>
> **L22.** *(leaving `M3`, quieter, almost to herself)* Seven. I counted them on and I counted them... *(stops)*
>
> **L23.** *(if seen during E5, before the chase: an early chase start)* No — stay there. STAY THERE.
>
> L24–L26: see §7.3.

**Chase (stages 4 → 5).** The key lines are below. Barks B1–B12 are separate short efforts.

> **L27.** *(C1)* Come back! I am trying to help you!
>
> **L28.** *(C2, through the barred door, hammering)* Open this door. Open it! *(silence)*
>
> **L29.** *(C2, after the silence, low and close to the door)* ...I won't let it have you as well.
>
> **L30.** *(C3, the bar breaks)* STOP!
>
> **L31.** *(C5, behind at `M9`)* Don't you dare — don't you dare go up there!
>
> **L32.** *(C6, in `NL`, full voice)* STOP! YOU ARE NOT GOING THROUGH THOSE DOORS!

**Stage 6. Fear:** L33–L35, see §7.6.

**Barks and efforts (variants for the system):**
- **B1–B4, pursuit breath:** short breaths; her name for the player, "one-oh-four!"; *"Wait!"*; *"Please!"*
- **B5–B6, stooping in the duct:** strained exhale; *"Oh, God—"*
- **B7–B8, door impacts:** effort grunts, ×3 intensities.
- **B9–B10, hearing a noise in search:** *"Hello?"*; *"I heard that."*
- **B11–B12, losing track:** *"Where are you?"*; *"Don't hide from me."*
- **Capture lines, by stage:**
  - stage 1–2: *"There you are. Back to bed."*
  - stage 3–4: *"Got you. Got you, love. It's all right now."*
  - stage 5: *(breathless)* *"I've got you — stop fighting me — I've got you."*

**Count:** 35 authored lines plus about 30 barks and efforts. Ruth: 3 lines (payphone). PA voice: 1 line. Intercom variants are covered by L1 and L2.

### 8.2 Information discipline

She refers to the North Wing three times, each obliquely: L25 *"I was there"*, L29 *"I won't let it have you as well"*, and L34 *"don't answer it when it calls you."* L35 is optional. She never names what "it" is, never describes it, and never explains 3:17.

### 8.3 Voice-acting guide: Sister Margaret Shaw

| Aspect | Direction |
|---|---|
| **Vocal age** | A woman of 55–65 (playing 58). Lived-in, not frail. The actor's natural age may be 45–65; the voice must not sound young or theatrical-old. |
| **Character in one line** | A competent, kind-hearted ward sister who has been terrified for a very long time and holds it down with routine. |
| **Accent** | Educated Northern English or North Midlands; a softened regional base under nursing-school Received Pronunciation. Think a ward sister trained in the 1940s–50s who has lost most of her accent, except under stress, when it **comes back**. Avoid stage RP, "posh villain", Cockney and any celebrity likeness. |
| **Rhythm (stages 1–2)** | Unhurried, even, a slight lift at the end of instructions (the nurse's "please" cadence). Clean consonants. Sentences finished. Short pauses at commas, never dramatic ones. |
| **Rhythm (stages 3–4)** | Sentences start composed and break. Pauses grow; she restarts lines. Audible inhale before difficult words ("Ruth", "link"). |
| **Rhythm (stage 5)** | Short, loud, clipped imperatives, ragged with exertion. **Volume from panic, not hate.** The voice cracks at the top; no growls and no villain laughs. |
| **Rhythm (stage 6)** | Barely voiced. Breath carries half of it. Pitch drops; tremor on stressed syllables. Long silences are allowed (L34 can take 8 s). |
| **Emotional range** | Restraint → irritation → concern → pleading → panic → dread. The audition must prove that **restraint and dread** sound like the same person. |
| **Intensity scale** | Use a 1–5 scale in the script: L1 = 1, L16 = 2, L26 = 4, L32 = 5, L34 = 2 (quiet but maximal emotion). |
| **Breath and hesitation** | Breaths are performed, not removed in editing. The chase barks are recorded **after** physical exertion (the actor moves, or does a stair run if comfortable) for honest breath. |
| **What to avoid** | Whispering for spookiness; uniform loudness in the chase; sobbing in L26 (she holds it); camp. |

**Recording specification:**
- **Room:** treated, dead (under about 0.3 s RT60). A professional studio or a vetted home studio.
- **Microphone:** large-diaphragm condenser at about 20–25 cm for stages 1–4. For stage 5, back off to about 40–60 cm, or use a dynamic microphone as a second channel, to avoid clipping. A pop filter.
- **Format:** 48 kHz / 24-bit WAV, mono, peaks about −10 to −6 dBFS on shouts and −18 dBFS on normal lines. Noise floor below −60 dBFS. No processing on the recording itself.
- **Session:**
  - Two sessions of at most 2 hours each. Equity's AAA guidance treats "vocally stressful" work as at most 2 hours per session (VGC 2024).
  - The shouted lines (L28–L32, barks) go **at the end of session 2**.
  - Three takes per line, plus alternates. Slate every take.
- **Delivery:** edited WAV per line (heads and tails trimmed, 150 ms room tone), plus the raw session files. File names: `shaw_L26_t2.wav`.

**Processing and integration** (the game side; see §13 for the work needed):

| Context | Treatment |
|---|---|
| In-world (Shaw present) | A positional source with distance attenuation (1 → 25 m). Line-of-sight occlusion: a low-pass at 1.2–2 kHz when no line of sight. Zone reverb: tile (wards), hard metallic (`M*`), very tight (`CE`–`CX`). |
| Through doors (L28, L29) | Low-pass at about 900 Hz, plus door resonance. |
| **Intercom (L1, L2, L16, L17)** | Band-limit 320–3200 Hz (the existing Room 104 treatment); light saturation; small-speaker reverb per ward. Plays from the ceiling speakers in the player's zone. |
| Telephone (L3, L4; Ruth) | Band-limit 300–3400 Hz, line hiss; the receiver is close to the ear (head-locked). |
| Mastering | Dialogue at about −23 LUFS integrated for normal lines, so peaks stay under −1 dBTP after positional gain. A loudness-matched set for the chase. |
| Ducking | Dialogue ducks music by 6 dB and ambience by 3 dB (the existing `duck` hook). The alarm bell ducks by 6 dB under L24–L26. |
| Captions | Every line and bark, with speaker and direction (existing subtitles): *"[Shaw, behind — shouting] STOP!"* |
| Format shipped | AAC `.m4a` (like the existing menu audio) or Ogg Opus; mono; 48 kHz. |

### 8.4 Audition script (Shaw)

About 2 minutes. Six contrasting states. The same script is used for **every** option compared in §9: human actors and TTS candidates alike.

> **A1 (composure, intercom):** "Night staff. The final round begins at three-seventeen. All patients will be in their beds."
>
> **A2 (dry authority):** "Replace the receiver, one-oh-four. ...There's a good — just put it down."
>
> **A3 (suspicion, listening):** "I know someone's been in here. *(pause)* The lamp's still warm."
>
> **A4 (anxiety cracking):** "Whatever you think you're doing — whoever you think you're looking for — the link is closed. It is closed for a reason."
>
> **A5 (pleading, held back):** "Your mother went through. Ruth went through, and I couldn't — *(breath)* Please, love. Come back to the ward."
>
> **A6 (panic, full voice):** "STOP! YOU ARE NOT GOING THROUGH THOSE DOORS!"
>
> **A7 (dread, whispered):** "Listen to me. Whatever you hear in there... don't answer it when it calls you."

### 8.5 How performances are evaluated

Do this before committing to a production approach.

**Panel:**
- At least three listeners: the director, an audio lead, and one person unfamiliar with the project.
- **Blind**: file names randomised, with no indication of whether a take is human or synthetic.

**Playback, in three contexts:**
1. Studio headphones, dry.
2. **In engine:** through the intercom chain (A1, A4), and through positional and occlusion audio at 12 m (A5, A6).
3. On laptop speakers.

**Criteria (each scored 1–5):**

| # | Criterion |
|---|---|
| 1 | Emotional truth: do you believe her? |
| 2 | Same person across A1–A7 |
| 3 | British 1987 plausibility: accent, vocabulary, delivery |
| 4 | Restraint: emotion held, not displayed |
| 5 | Breath and timing: natural pauses, interruption, recovery |
| 6 | Shout quality (A6): no clipping, distortion or artefacts |
| 7 | Whisper quality (A7): intelligible, intimate, not "spooky" |
| 8 | Artefacts: glitches, metallic tone, mispronunciation, prosody errors |
| 9 | Directability: does a second take change as directed? Tested with two notes per line. |
| 10 | Consistency across sessions: re-record A1 and A5 a week later, and compare |

**Pass:** an average of at least 4.0, with no criterion under 3, and criteria 1, 2 and 4 at 4 or above. Shaw must pass **all** criteria. Minor voices (PA, intercom chime) need criteria 3 and 8 at 4 or above.

**Rule:** if no synthetic candidate passes, Shaw is human-voiced. There is no compromise on the lead.

---

## 9. Voice production options (with sources)

**What exists today:**
- The repository has two temporary Shaw lines made with FFmpeg's Flite SLT voice (US accent, robotic), documented in `docs/nw-005b/VOICE.md` on the draft branches.
- The engine's `DialogueCue.recordingStatus` (`not-recorded` | `temporary` | `recorded` | `approved`) already prevents unapproved audio from being treated as final.
- Production mode rejects unapproved performances.

**Research limits:**
- The comparisons below rely on current web sources, cited.
- **I have not listened to any of these systems for this project.** Quality judgements about TTS are provisional until the §8.5 audition is run.
- Prices change. Re-check before purchase.

| | **1. Professional British voice actress (recommended for Shaw)** | **2. ElevenLabs (cloud neural TTS, v3 audio tags)** | **3. Chatterbox (Resemble AI, open source, local)** | **4. Kokoro-82M (open source, local)** | **5. Microsoft Azure Neural TTS (en-GB)** |
|---|---|---|---|---|---|
| **Emotional realism** | Highest: real fear, breath and broken lines | High for generated speech. v3 supports inline tags such as `[whispers]` and `[shouts]`, plus emotion tags. A newer v4 is described by ElevenLabs as more emotive. Unverified by ear here. | A single "exaggeration" control (default 0.5; higher for drama). Expressive range is promising but coarse. Unverified by ear. | Low. Neutral narration voices. | Styles exist for a subset of voices. I couldn't confirm which en-GB voices support them (needs checking in Speech Studio). |
| **British accent** | Exactly what we direct, including regional undertones | `[British accent]` tag; voice design; British voices in the library | Zero-shot from a reference clip: the accent follows the reference | British voices (`bf_emma`, `bf_isabella`, …), rated about B/B− by the community | en-GB neural voices exist (e.g. Sonia) |
| **Character consistency** | High with one actor; session-to-session drift is manageable | Good with a fixed designed voice and settings; v3 is less deterministic | Depends on the reference clip; variable | High (it's deterministic) | High |
| **Fear / restraint / urgency / desperation** | All four | Plausibly urgency and whispering via tags; **restraint and broken desperation are the hardest** for TTS | Intensity, yes; nuance, uncertain | No | Limited |
| **Cost** | Equity's AAA guidance is £300/hr minimum (2024). Indie and market rates are around £150–300/hr. Shaw: 2 × 2 h sessions, so about **£600–1,200**, plus a studio or remote session (about £100–300) and the usage buyout, negotiated. | Starter $6/mo includes a commercial licence; Creator $22/mo; API about $0.04–0.08 per 1k characters. Shaw's whole script is under 10k characters. | Free (MIT) | Free (Apache 2.0) | Pay as you go; free tier |
| **Licensing / commercial games** | A contract with buyout for the game and marketing, a no-AI-training clause, and the actor's consent terms | Paid plans include a commercial licence for output. The free plan is non-commercial. You may not clone a voice without consent. Check the Service-Specific Terms for games. | MIT allows commercial use. Outputs carry an imperceptible PerTh watermark. **The reference voice needs consent.** | Apache 2.0 weights. **The phonemiser dependency espeak-ng is GPLv3**: check the distribution model (offline generation only, so nothing ships). | Commercial use per Azure terms |
| **Local or cloud** | Studio, or remote (Source-Connect) | Cloud | Local GPU (or CPU, slowly) | Local CPU | Cloud |
| **Export** | WAV 48/24 → our m4a/opus | MP3, or PCM/WAV at 44.1 kHz on higher tiers (API PCM on Pro) | WAV | WAV | WAV/MP3/Opus |
| **Workflow** | Casting call → auditions (§8.4) → 2 sessions → edit → integrate | Script with tags → generate takes → select → edit | Reference clip + text → generate → select | Text → generate | SSML → generate |
| **Limitations** | Cost, scheduling, and pick-up sessions for script changes | Non-deterministic takes; tag artefacts; **may not hold restraint**; vendor dependency | Reference voice rights; quality variance; GPU setup | Too flat for Shaw | en-GB style support unclear; generic |
| **Role in NIGHT WARD** | **Shaw (all lines). Ruth (3 lines, the same casting session or a second actor).** | **Temporary dialogue during implementation** (replacing Flite), marked `temporary`. Possibly the **North Wing PA voice** if it passes §8.5 for minor voices. **Never a clone of anyone.** | The free fallback for scratch audio and timing temps, using a reference voice we own (e.g. a team member's consented recording) | Tannoy and announcement temps only | Not recommended |

### 9.1 Recommendation

1. **Shaw is human-voiced.** Cast a British actress aged about 50–65 through Spotlight/Equity-listed agents, or a curated audition platform, using the §8.4 script.
   - Shortlist three. Run the blind evaluation (§8.5). Book two sessions.
   - Budget: about £1,000–2,000, all-in, for Shaw and Ruth.
   - **Why:** her arc *is* the chapter. Restraint breaking into panic and then dread is the hardest thing for current TTS to deliver consistently, and it's the thing the player will judge the game by.
2. **Temporary VO during implementation:** ElevenLabs on a paid plan (Starter or Creator), with a **designed** voice (not cloned from anyone).
   - Marked `temporary` in `recordingStatus`, so production mode keeps rejecting it.
   - This gives designers believable timing and emotion to build the chase and E4 against. The current Flite voice can't.
   - Also audition ElevenLabs for the PA voice through §8.5.
3. **If the budget is zero for now:** use Chatterbox locally for temps, with a consented reference recording, and keep the human-actor plan for final.
4. **Never:** imitate a real actor's voice; use the free ElevenLabs tier for anything shipped; or describe temporary audio as final.
5. **Unverified until tested:** whether any TTS can hold A5 and A7 at the §8.5 pass mark. The recommendation for Shaw doesn't depend on that.

**Note on Hume Octave**, an emotion-directed TTS:
- A competitor's page claims Hume ended its TTS and EVI API access on 13 November 2026. I couldn't confirm this on Hume's own site.
- Hume's FAQ says its Free and Starter tiers are non-commercial.
- Given that uncertainty, it's excluded.

**Sources** (accessed 14 November 2026):

**ElevenLabs:**
- pricing summaries: [bigvu](https://bigvu.tv/blog/elevenlabs-pricing-2026-plan-worth/), [Cartesia](https://www.cartesia.ai/learn/elevenlabs-pricing), [toolhunter](https://toolhunter.ai/blog/elevenlabs-pricing). Third-party; confirm at elevenlabs.io/pricing.
- audio tags: [v3 audio tags](https://elevenlabs.io/blog/v3-audiotags), [accents](https://elevenlabs.io/de/blog/eleven-v3-audio-tags-emulating-accents-with-precision), [help: audio tags](https://help.elevenlabs.io/hc/en-us/articles/35869142561297-How-do-audio-tags-work-with-Eleven-v3), [character direction](https://elevenlabs.io/blog/eleven-v3-character-direction)
- terms: [terms of use](https://elevenlabs.io/terms-of-use), [can I publish](https://elevenlabs.io/docs/help-center/legal/can-i-publish-the-content-i-generate-on-the-platform/llms.txt)

**Chatterbox:** [Resemble AI](https://resemble.ai/chatterbox), [model page](https://www.resemble.ai/learn/models/chatterbox), [Hugging Face README](https://huggingface.co/ResembleAI/chatterbox/blob/refs%2Fpr%2F1/README.md)

**Kokoro:** [model card](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/README.md?code=true), [bf_emma rating](https://offlinetts.com/voice/bf-emma/)

**Azure:** [SSML voice and styles](https://learn.microsoft.com/azure/ai-services/speech-service/speech-synthesis-markup-voice), [en-GB Mia](https://json2video.com/ai-voices/azure/voices/en-gb-mianeural/), [HD voices update](https://techcommunity.microsoft.com/t5/microsoft-foundry-blog/azure-speech-neural-hd-text-to-speech-recent-voice-updates/ba-p/4505380)

**Hume:** [FAQ](https://dev.hume.ai/docs/text-to-speech-tts/faq), [shutdown claim (competitor page, unverified)](https://fish.audio/hume-tts-alternative)

**Equity and UK rates:** [VGC on Equity minimum rates](https://www.videogameschronicle.com/news/uk-entertainment-union-equity-recommends-minimum-rates-for-game-performers-for-the-first-time/), [Bigmouth Audio](http://www.bigmouthaudio.com/blog/2024/11/4/equity-sets-new-standards-recommended-minimum-rates-for-video-game-performers), [Gravy for the Brain rate guide](https://rates.gravyforthebrain.com/?view=1&country=en_GB)

---

## 10. Room purpose audit

**Method.** Every accessible space in `docs/nw-r02/registry.md` was checked against five questions:
1. Its current function.
2. Does that function make architectural sense here?
3. Are its contents believable for a 1987 NHS district general hospital?
4. Does it support gameplay?
5. What should it be?

**No geometry changes are required.** Every proposal below is dressing and interaction.

### 10.1 The four rooms the user flagged

| Room | Current (R02) | Problem | Decision |
|---|---|---|---|
| **W7** "West Sister's bay" (6 × 3.8 m open bay, counter, round-sheet marker) | A Sister's bay with a counter | "Bay" reads as a patient bay. Its purpose is vague. The `OFFICE` already serves as "Sister's" space. | **Repurpose as the Ward 4 West nurses' station.** It's an open counter: correct for 1987, where stations were open desks facing the corridor. Contents: <ul><li>the Kardex;</li><li>a drugs trolley chained to the wall;</li><li>the ward telephone;</li><li>**the corridor lighting panel** (a row of Bakelite switches);</li><li>the round sheet (104 is the only name left).</li></ul>**Gameplay:** Lights Out begins here. As the player passes, the panel's switches clunk down one by one, so the event has a visible, believable cause. The counter (`w7-counter`) is crouch cover during E1. |
| **W8** "Linen cupboard" (2.4 × 2.8 m, a staff locker as the hide) | A linen cupboard with a staff changing locker | A changing locker doesn't belong in a linen cupboard | **Keep it as the linen cupboard. Replace the locker with a tall slatted linen press** (a double-door wooden cupboard), using the same locker-hiding system with a new model. It's the hide nearest the lobby end, for players caught late by the beam. Dressing: folded blankets, red-striped NHS linen, a laundry skip. |
| **ES3** "Side room (traction)" with a figure that moves closer when you return | A side room with a traction bed and a single unexplained escalation | Arbitrary: the figure isn't tied to the story, and a traction bed is odd on a medical ward | **Repurpose as Side Room 7**: the room of one of the seven, packed for transfer. Contents: <ul><li>a stripped bed, with the mattress still dented and warm;</li><li>a transfer label on the locker: *"Mr A. Hollis — 7 — to North Wing via link"*;</li><li>the **transfer list of seven** on the clipboard, with Ruth's name on it (`seven-names` flag).</li></ul>**Remove the moving figure.** The bed hide stays. The room now pays off the story: it's the first time the player learns the transfer involved seven people. |
| **EN3** "Staff room" | A staff room (duplicates `LKT` kitchen and `EN1` on-call) | A duplicate; it has no reason to exist | **Repurpose as the link office (porters' east lodge).** Contents: <ul><li>the **key board** with an engraved PLANT 2 / LINK plate over an **empty hook**;</li><li>a sign-out ledger ("02:40 — Sr Shaw");</li><li>the **link log** (the 03:20 closure entry in Shaw's hand);</li><li>the **link door alarm panel** (*"ALARM SOUNDS WHEN OPENED"*);</li><li>a dead internal phone marked NORTH WING.</li></ul>**Gameplay:** this is step 10's real objective. It gives the key gate and the alarm warning in one room beside the junction, and removes the walk to the locked Plant 2 door before the keys. |

### 10.2 All other accessible rooms

| Room | Current | Believable? | Gameplay | Decision |
|---|---|---|---|---|
| `R104` | Patient room | Yes | Start; first hide | Keep. Add the visitor chair, glasses and crossword. |
| `W2` Room 103 | Patient room | Yes | Call-lamp teaching | Keep. Call button (`knows-call-lamps`). |
| `W3` Bay 105–108 | 4-bed bay | Yes | E1 under-bed hiding | Keep. Curtains on rails. One sleeping shape that breathes. |
| `W4` Bathroom | Bathroom | Yes | Pull-cord (call teaching) | Keep. Low priority. |
| `W5` Examination | Exam room | Yes | E1 dark-corner option | Keep. Light dressing. |
| `W6`/`W6D` Imaging and darkroom | X-ray room and darkroom | **Questionable on a ward corridor.** In 1987, X-ray was departmental, not on a ward. | Story (Okafor photograph) | **Rename to "Ward treatment room" (`W6`) and "Ward store" (`W6D`).** Move the developing photograph to a pinboard in `W7` (staff night-team photo, with Okafor). |
| `W9` Clean utility | Clean utility | Yes | None | Keep as dressing only. It's an authentic absence. |
| `LOBBY` | Lift lobby, payphone, reception | Yes | S04 | Keep. The WRVS tea trolley; "Ward block closes Friday 16 October". |
| `OFFICE` | Sister's office | Yes | S05 | Keep. Standing Orders, Ruth's card to Sister, the transfer notice. |
| `S1` Staff changing | Lockers | Yes | Locker hiding (late-E2 safety) | Keep. Shaw's locker: a photo of her with porters (Okafor). |
| `S2` Dayroom | TV, chairs | Yes | Date and storm warning | Keep. |
| `S3` Physiotherapy | Parallel bars, wheelchairs | Plausible (ward-side physio gym) | Ruth's wheelchair bay is empty | Keep. Optional. |
| `S4` Store cupboard | Store | Yes | None | Keep as dressing only. |
| `S5` Sluice | Sluice | Yes | Knock code (redundancy) | Keep. |
| `S6` Relatives' room | Relatives' room | Yes | Identity anchor (your coat) | Keep. Optional. |
| `ST1`/`ST2` | Main store, porters' room | Yes | E2 | Keep. |
| `EC1` Ward clerk | Clerk's office | Yes | Optional: bed-state copy | Keep. Light. |
| `EC2` Interview room | Interview room | Yes | None | Keep. Optional: the consultant's note (rule 3). |
| `LPW1–4`, `LPE1–4` | Patient rooms | Yes | E4 stops, under-bed hiding, call lamps | Keep. Each room needs a "sleeping shape" and a call button. |
| `LOFF` | Ward office (core) | Yes | Approach C, windows | Keep. Hook, bed-state board, notebook. |
| `LTR` | Treatment room | Yes | Approach C waiting spot | Keep. |
| `LCU`/`LLN`/`LEQ` | Core utility, linen, equipment | Yes | Hiding (locker in `LCU`), a route through the core | Keep. |
| `LUS`/`LKT` | Sluice, kitchen | Yes | Optional | Keep. |
| `LISO` | Isolation | Yes | Safe room (rule 3) | Keep. Gowning trolley; the glass faces south. |
| `LBA`/`LST` | Bathroom, store | Yes | — | Keep. |
| `ES1` | Bathroom | Yes | — | Keep. |
| `ES4` Day bay | 4-bed bay | Yes | Hiding | Keep. |
| `ES5` | Store | Yes | — | Keep. |
| `ES2` | Sluice (crawlway exit) | Yes: a sluice with a service panel | CP4 | Keep. |
| `EN1` On-call | On-call room | Yes | Story (pager 317; doctor's note) | Keep. |
| `EN2` Seminar | Seminar room | Yes | Foreshadowing ("North Wing commissioning") | Keep. Optional. |
| `EN4` Records | Medical records | Yes | **Ruth's notes**: *"Transfer to Ward N2, North Wing"* | Keep. Optional. Duplicates the docket for players who skip `ST2`'s desk. |
| `M0`–`M8C` | Plant and service passage | Yes | E5, the chase | Keep. |
| `NL` | Old north corridor | Yes | C6 | Keep. |
| `NB`, `NB1`, `NB3` | North Wing | Yes (new, never opened) | S15 | Keep. |

---

## 11. The 24 placeholders: replacement decisions

**Classes:**

| Code | Meaning |
|---|---|
| **SYS** | A real gameplay system |
| **ENV** | Environmental storytelling |
| **CIN** | A cinematic or audio event |
| **DEL** | Remove |
| **DEV** | Keep as a developer feature only |

**Priority** follows the brief's order (1 = Lights Out … 7 = North Wing). "—" means supporting work.

| # | Placeholder (R02) | Class | Replacement | Acceptance criteria | Priority |
|---|---|---|---|---|---|
| P1 | `[DEV] Payphone` | **SYS + CIN** | A ringing payphone. Pick up (a hold), a scripted call (Ruth, then Shaw), hang up. It rings whenever the player is in `LOBBY` until answered. | The phone rings from the right position. Answering plays Ruth (3 lines) and L3 with phone processing. It's skippable. If ignored, the notice in `OFFICE` repeats the route. Captions are present. | — |
| P2 | `[DEV] Transfer notice` | **ENV** | A pinned notice, plus the Standing Orders frame. A readable inspection that goes into the journal. | Readable at 1 m. The journal entry is created. It names "Stores → porters → link". | — |
| P3 | `[DEV] Docket + sign-out` | **ENV + SYS** | Two documents on the porters' desk. Reading them sets `route-plant2`. **Entering `ST2` triggers the phone**, which is no longer a marker. | Both inspections work. The phone rings on first entry only. Checkpoint CP2 is before it. | 2 |
| P4 | `[DEV PLACEHOLDER] Take Shaw's keys` | **SYS** | Three real approaches: <ul><li>**A:** a trolley key-take (hold 1.2 s; a quick-take variant makes noise);</li><li>**B:** a call-lamp lure (the world call system changes Shaw's goal);</li><li>**C:** a hook pick-up behind her.</li></ul> | Each approach is completable by a tester who knows it, within 2 laps. Each has failure states. None succeeds 100% passively. Discovery behaviour matches §6.4. There's no single dominant approach in playtests (each chosen by at least 20% of 10+ testers). | 4 |
| P5 | `[DEV] Valve` + steam gate | **SYS** | A steam hazard volume (hiss and vapour; blocking but not damaging, with a stagger on entry), plus three valves. The banded valve closes it. The wrong valves are loud (noise radius 10 m). A 90 s fail-safe. | The steam blocks passage (pushback, not a door). The correct valve clears it in under 1 s. Wrong valves emit noise. The fail-safe works. The colour/pattern cue is accessible. | 5 |
| P6 | `[DEV] Bulkhead crank` + gated bulkhead | **SYS + CIN** | Padlock (Shaw's key) → chain → crank (a 4 s hold; release pauses it). The alarm at 50%. Shaw's confrontation (§7.2). The door opening is physical. | The alarm triggers the chase director. Shaw enters from the east only. The confrontation lines play over the ducked alarm. The chase starts on the opening, or after 3 s of the player not moving. | 6 |
| P7 | `[DEV] Examine barricade` | **ENV + CIN** | Wool trail, knitting bag, barricade with needles, the scratched note, the empty office through the glass, the PA call, fade. | It's reachable only after the NT doors. The PA plays once, positionally from `NB3`'s speaker. The chapter-complete save is written. | 7 |
| P8 | `[DEV] Call button` (`W2`) | **SYS** | A real call button that lights the corridor lamp above `W2`'s door. It's the same call system as E4. | Sets `knows-call-lamps`. The lamp lights. It's reused by the loop rooms. | 4 |
| P9 | `[DEV] F1 push-bar` | **SYS** | A push-bar door interaction, usable from the east side only. No handle on the lobby side (visible). | It opens from `EC` and is never openable from `LOBBY`. Shaw uses it only in search mode. | — |
| P10 | E1 markers | **SYS + CIN** | Lights Out director: <ul><li>the lighting panel in `W7` (§10.1);</li><li>banks off every 1.5 s;</li><li>a beam volume (cone) checks each room in order;</li><li>a soft fail (whisper, white-out, wake in `R104`).</li></ul> | The beam's route is deterministic, and it is detectable by a 0.4 s exposure. All four hide options work. A soft fail costs less than 30 s. Lights Out never repeats. Captions are present. | **1** |
| P11 | E2 markers | **SYS** | Shaw's E2 director: <ul><li>phone call → approach (squeak, heard first) → trolley parked at `ST1-door` → tasks;</li><li>handover to the AI on perception;</li><li>the radio lure;</li><li>the hatch check (L8);</li><li>locks the stores if the player is inside.</li></ul> | She enters from `SC` only and is audible 45 s before arriving. The suspicion variants (§6.2) behave as specified. Capture → CP2. Her nav never stalls. If it does, a fade-and-restart **out of view only**. | **2** |
| P12 | Crawlway markers | **SYS + CIN** | Knock interaction and responder (always from the correct way); steam timing on run b (6 s cycle, 1 s tell); the V3 grate event (Shaw's trolley stops beneath; L10); the `V4` find. | A knock gets an answer within 2 s from the correct direction. Steam is avoidable by its timing. The grate event plays once, and the player's movement is heard within 2 m. No capture is possible in the crawl. | **3** |
| P13 | The hatch and grille as plain openings | **SYS** | The hatch: wing nuts (a 5 s crouched hold, noise radius 7 m), closable. The grille: kicked out from the crawl side only, then stays open. | One-way behaviour, verified. The `hatch`/`grille` openings stay passable crouched. | **3** |
| P14 | Convex-mirror markers | **ENV + SYS** | Real convex mirrors at the 4 loop corners (render-target reflections, or a cheaper planar or cube-map approximation) that show around corners. | Shaw is visible in a mirror from the opposite corridor at 10 m or more. The performance cost is within budget. | 4 |
| P15 | Approach A/B/C markers | **DEV** | Kept as debug overlays only. The production cues are the trolley's stops, the visible call lamps, and the hook in the office window. | Not visible in production builds. | 4 |
| P16 | E5 markers | **SYS + ENV + CIN** | <ul><li>Seven call lamps going out as you pass (D);</li><li>evidence props (§7.1);</li><li>`M3` search: Shaw's entrance from `M0`, a 15–25 s search, the pump cover and the alcove locker.</li></ul> | The lamps go out in order. The evidence is readable. Shaw's search is perception-driven, and detection leads to an early chase (L23). Capture → CP6. | 5 |
| P17 | Chase markers and the linen-trolley block | **SYS + CIN** | Chase director (gap limiter, §7.4), the barred door (slam and bar), the low duct, the `M9` shoulder, the linen-trolley pull-down, and the stop at the NT doors. **The C6 service stair is removed for good** (no second level). | All of §7.5. Shaw is never ahead and never closer than 6 m. Failure causes are as listed. The stop at the doors works every time. | 6 |
| P18 | The bench uses the bed prompt | **SYS** | An "under the bench" hiding variant (prompt, camera height 0.35 m). | A distinct prompt and camera. | 2 |
| P19 | Story markers (green signs) | **ENV** | Real props and inspections (journal entries where they matter). Signs are removed. | No floating labels in production. Every inspectable has an authored text. | — |
| P20 | Lift and stair signage | **ENV** | Lift doors with a dead floor indicator (ticking between floors), and the stairwell door chained shut. | It reads as "closed" without UI. | — |
| P21 | Chapter 2 stubs | **ENV** (Chapter 1) | Locked doors with "OPENING POSTPONED" and a dark corridor beyond the glass. The stubs stay as the Chapter 2 boundary. | It looks like a continuation, not a dead end. | 7 |
| P22 | Developer checkpoints | **SYS + DEV** | A new Chapter 1 checkpoint schema (CP0–CP8; suspicion; knowledge flags; Shaw's stage; the doors opened) **plus** developer teleports kept in `?level=greybox`. | Save and restore round-trips every field. Shaw is restored to a deterministic phase, never to stale perception. | — |
| P23 | Neutral lighting and tinted floors | **DEV → replaced** | Production lighting zones (the existing atmosphere and lighting director), per zone. Greybox tints stay only in `?level=greybox`. | — | — |
| P24 | Storm windows and the aftermath outside | **ENV + CIN** | Frozen storm exteriors (the old block) and an overgrown exterior (the North Wing), as backdrops behind the existing window positions. | Visible from `R104` and `NB3`. Readable. | 7 |

---

## 12. Timing and pacing budget

**What we actually know:**
- **Measured:** greybox traversal of 425 m in 3:28 at walking speed (`docs/nw-r02/measurements.json`).
- **Everything else in the table below is a design estimate**, for a typical first-time player.
- None of this is playtested.

**How the table is built:**
- **Travel** = measured walking time × 1.4 for a first-timer's hesitation, turning and looking.
- **Directed** = story, stealth, puzzles, encounters and chase content.
- **Exploration** = optional rooms and discoveries.
- **Total** = travel + directed + exploration, with each scene rounded to the nearest 5 s.

| Scene | Travel (measured × 1.4) | Directed | Exploration | Total | Notes |
|---|---|---|---|---|---|
| S01 Waking | 0:00 | 0:45 | 0:00 | 0:45 | Wake cinematic, look, wristband |
| S02 Mum's things | 0:03 | 0:45 | 0:00 | 0:50 | Glasses, crossword, intercom (L1) |
| S03 Lights Out | 0:15 | 1:45 | 1:30 | 3:30 | E1 about 75 s plus hiding; optional `W2`–`W9` |
| S04 Payphone | 0:04 | 1:00 | 0:00 | 1:05 | Call (about 45 s) |
| S05 Office | 0:09 | 1:15 | 0:20 | 1:45 | Barricade beat, notice, Standing Orders |
| S06 South corridor | 0:25 | 0:20 | 1:15 | 2:00 | TV beat; optional `S1`–`S6` |
| S07 Porters' room | 0:13 | 1:00 | 0:15 | 1:30 | Docket, sign-out, bag |
| S08 E2 Stores | 0:02 | 2:45 | 0:00 | 2:45 | Approach 30–45 s, task, search |
| S09 Crawlway | 0:26 | 2:15 | 0:15 | 2:55 | Knocks, steam, grate, `V4` |
| S10 Link office | 0:29 | 0:45 | 0:45 | 2:00 | Key board, link log; optional `ES3`, `EN1`, `EN4` |
| S11 E4 Round | 0:25 | 4:15 | 0:00 | 4:40 | Observe about 75 s, 1–2 attempts, a hiding episode |
| S12 Passage | 0:54 | 2:45 | 0:00 | 3:40 | M2 crouch, valve about 45 s, evidence about 30 s, hiding about 45 s |
| S13 Bulkhead | 0:12 | 0:50 | 0:00 | 1:00 | Unlock, crank, confrontation |
| S14 Chase | 0:30 | 1:30 | 0:00 | 2:00 | Sprinting, with the bar silence, the duct and the doors; the stop at the glass about 25 s |
| S15 North Wing | 0:18 | 1:15 | 0:00 | 1:35 | Wool, knitting, note, PA |
| **Total** | **4:25** | **23:10** | **4:20** | **32:00** | |

**Split:** directed 23:10 (73%), exploration 4:20 (14%), travel 4:25 (14%). The scene totals are rounded per row, so the column sums (31:55) differ from 32:00 by 5 s.
- That gives about **86 : 14 directed : exploration** if travel is counted as directed. It's directed, because every critical-path move has an objective.
- Exploration has room to grow to 30% without diluting the story. A thorough first player who explores optional rooms fully reaches about 37–40 minutes.

**Scenes at risk:**

| Risk | Scene | Detail | Remedy |
|---|---|---|---|
| **Too short** | S14 Chase | About 75 m of route; the running itself is about 20 s | The silence at the barred door, the low duct and the stop at the NT doors carry the 2:00. **If playtests feel short:** lengthen `M6` with two more turns (geometry, about 12 m), which is the only geometry change considered. Not proposed yet. |
| **Too long / risk of repetition** | S11 E4 | Her lap is about 3:20. Waiting a full lap to learn it can drag. | The mirrors and office windows let the player observe without waiting a full lap. After two laps, a journal hint appears. |
| **Insufficiently interactive** | S06 South corridor | Mostly walking | Deliberate breathing room before E2. Keep it under 2 min. The TV beat sits on the path, in `S2`'s open doorway. |
| **Insufficiently interactive** | S10 | Reading | It's short, and the handbell pulls the player on |
| **Variable** | S03 | Players who rush avoid E1's beam altogether | Intentional; R01's recovery rules stand |

---

## 13. Technical dependencies and risks

### 13.1 What exists (main and the greybox branch)

| Area | Status |
|---|---|
| Perception-driven entity agent | Exists. Vision cone (7 m), hearing (×2.4), detection 0.8 s; patrol, investigate, search, pursue and lost-target states; door use via the real swept door; witnessed hiding entries (12 s). |
| Nurse encounter | `createNurseEncounter`: stage and activate phases, a door policy, and audio cue hooks (`patrol-hum`, `listen`, `footstep`, `chase`, `stop`). |
| Hiding | Lockers and beds; occupancy. |
| Interactions | Doors (locked, requirements), inspect, hide. `interaction:completed` events. |
| Dialogue | Dialogue player with recording-status gating, interruption, ducking and subtitles. |
| Mixer | **`music` and `sfx` buses only.** |
| Chapter framework | Cinematics with a camera lease, journal and puzzle state. The checkpoint schema is **the old chapter's**. |
| Greybox | The whole map; developer flags, map and telemetry. |

### 13.2 On unmerged draft branches (PRs #17–#24, not approved)

| Branch | Contains |
|---|---|
| `feat/nw-006b-nurse-stealth` | The nurse's-station encounter director and checkpoint recovery |
| `claude/nw-007b-cinematic-assets` | Shaw's model and 7 animation clips |
| `feat/nw-007a`, `feat/nw-007c` | Cinematic gameplay and integration |

**Their merge order is a decision (D9). Several milestones below depend on it.**

### 13.3 New work required

| Need | Used by | Notes |
|---|---|---|
| **Voice bus** in the mixer (`voice`), with ducking, plus a positional and occlusion voice adapter | All dialogue | Small; touches `src/audio/mixer.ts` and settings (a new volume slider) |
| Shaw **stage state** and line selection | Everything | Owned by a Chapter 1 director |
| **Suspicion and knowledge state**, and a **Chapter 1 checkpoint schema** | §6, P22 | R01 §7.3 already called for it |
| **Hold interactions** (crank, wing nuts, key take, phone pick-up) | P1, P4, P6, P13 | New interaction type |
| **Noise-emitting objects** (radio, wrong valves, jingle, chain) | E2, E4, E5 | Extends the `player:noise` event with an object source |
| **World call-lamp system** that changes the AI's goal | P4-B, P8 | New; rule 2 |
| **Shaw's trolley** as a kinematic pushed prop that carves navigation, with parking spots | E2, E4 | R01 already listed this; the riskiest system |
| **Lights Out director** (lighting-panel sequence, beam volume, soft fail) | P10 | Uses the existing lighting overrides (`applyOverride`, blackout and dim) |
| **Chase director** (gap limiter by speed only; scripted beats at the bar, silence and stop) | P17 | Must never move Shaw except through navigation |
| Steam hazard volume; valve set | P5, P12 | — |
| Door bar; swollen door; one-way grille; padlock | P6, P13, P17 | Door-state extensions |
| Knock interaction and responder | P12 | Audio and director |
| Convex mirrors | P14 | Rendering cost risk |
| Phone (payphone, stores) | P1, P3 | Head-locked phone audio |

### 13.4 Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Shaw's bandaged eyes vs "visibly terrified".** The face can't carry fear. | High | Fear through **body**: hands, posture, slowing, backing away, head turned past the player. Voice and breath. Needs animation clips beyond 007B's seven (stop-at-glass, palm on plate, back away, shoulder door). |
| R2 | The trolley's navigation carving destabilises E2 and E4 | High | Prototype first in the greybox (milestone M2) before writing content around it |
| R3 | The chase feels scripted if the director over-controls | Medium | Speed-only modulation. The player controls every action. Test with players who don't know the route. |
| R4 | **Human VO cost and scheduling**; script changes after recording | Medium | Lock Shaw's script before booking (after M6's playtest). Budget one pick-up session. |
| R5 | Temporary TTS mistaken for final | Medium | `recordingStatus: 'temporary'` everywhere. Production mode already rejects it. |
| R6 | The North Wing must be frightening *before* the player reaches it, yet stay unrevealed | Medium | §16. Seeded by L16, L25, L29, the seven lamps, the closure order, `EN2`'s commissioning slide and `ES3`. |
| R7 | Dependency on unmerged drafts (006b, 007b) | Medium | Decision D9 before M2 |
| R8 | Navigation limit (`maxNodes` 4096) for long searches (E4 into the branches) | Low–medium | Local queries plus waypoint chains. Measured in the greybox. |
| R9 | Accessibility (holds, timing, steam) | Medium | Toggle holds; steam timing assist; captions with direction (R01 settings) |

---

## 14. Implementation milestones

Each milestone is reviewed before the next one begins. All work happens in `?level=greybox` first, then is moved to production dressing.

| # | Milestone | Content | Exit criteria |
|---|---|---|---|
| **M0** | Approvals | This document; decisions D1–D12 | Signed off |
| **M1** | Foundations | <ul><li>Voice bus and voice adapter;</li><li>Chapter 1 state (stage, suspicion, knowledge) and checkpoint schema;</li><li>hold interactions;</li><li>noise objects;</li><li>temp VO (paid TTS, `temporary`) for all of §8.1.</li></ul> | Unit tests. Save and restore round-trip. Temporary lines play through the correct chains. |
| **M2** | Shaw in the greybox | <ul><li>Merge decision (D9);</li><li>Shaw's agent, trolley prototype and stage parameters;</li><li>capture → checkpoint.</li></ul> | She patrols the loop with the trolley for 10 laps without stalls. Capture and restore work. |
| **M3** | Opening and Lights Out (P10, P1, P2) | S01–S05 complete | Playtest: 5 people. All understand the goal after S05. |
| **M4** | E2 and crawlway (P3, P11, P12, P13, P18) | S07–S09 | Every variant in §6 is reachable. No capture in the crawl. |
| **M5** | Link office and E4 (P4, P8, P14, P15) | S10–S11; the three approaches | Each approach is chosen by at least 20% of 10 testers. Median E4 time is 3–6 min. |
| **M6** | E5, bulkhead and chase (P5, P6, P16, P17) | S12–S14 | 10 testers: nobody sees Shaw ahead. More than 80% describe the chase as "earned"/"understood" in debrief. Fewer than 2 failures median. |
| **M7** | North Wing ending (P7, P21, P24) | S15 | Testers can state the cliffhanger (the PA, and Shaw's warning). |
| **M8** | **Voice casting and recording** (in parallel from M3) | Auditions (§8.4) by M4; record after the M6 script lock; pick-ups after M7 | §8.5 pass. Lines marked `approved`. |
| **M9** | Room repurposing and dressing (§10; P19, P20, P23) | — | No floating labels. Every accessible room passes the audit. |
| **M10** | Full-chapter playtest | 10+ first-time players | Median 25–35 min. Exploration at most 30%. No softlocks. Objectives understood at each step (debrief). |

---

## 15. Decisions that need human approval

| # | Decision | Recommendation |
|---|---|---|
| D1 | Cast a human actress for Shaw (about £1–2k, with Ruth) | **Yes** |
| D2 | Temp VO: paid ElevenLabs (Starter/Creator, designed voice) vs local Chatterbox (free, consented reference) | ElevenLabs Creator for 2–3 months of implementation |
| D3 | The **sedation tray** as the evidence that staying is dangerous. It's dark: is it acceptable in tone? | Yes. Implied, never used on screen. |
| D4 | **Remove ES3's moving figure** (R01's single unexplained escalation) | Yes |
| D5 | **Cut "Shaw in her office" from the ending** (it would be a teleport) | Yes |
| D6 | Shaw's address shift from "one-oh-four" to "love" (stage 3 onwards) | Yes |
| D7 | Ruth's note: *"DON'T OPEN THIS DOOR FOR ANYONE. NOT EVEN ME. — R."* (replaces R01's "SHE CAN'T COME THROUGH…", which made Shaw the threat) | Yes |
| D8 | Rename `W6`/`W6D` (imaging and darkroom) to treatment room and ward store; move the Okafor photo to `W7` | Yes |
| D9 | **Merge order of the draft PRs** (006b nurse stealth, 007b Shaw model) before M2, or rebuild Shaw on main | Review 006b and 007b first; merge if approved |
| D10 | Suspicion stays hidden (no UI) | Yes |
| D11 | The chase's C6 service stair is dropped for good (single level) | Yes |
| D12 | The 30% exploration cap as a playtest measure (not a design constraint enforced in code) | Yes |

---

## 16. Self-critique

| Question | Honest answer |
|---|---|
| Does every mandatory scene have a purpose? | Yes, and each changes what the player knows or can do (§3, §4). S06 is the weakest: deliberate breathing room, but mostly walking. |
| Does the player know what they're trying to achieve? | The chain is explicit (phone → notice → docket → key board → keys → link). The risk is S04: a player who ignores the phone *and* skips the notice. Mitigated: the lobby sign points south, and the docket repeats the route. |
| Is Shaw consistent with her motive? | Mostly. **Weak point:** she sedates patients "for their safety" yet pleads gently at the bulkhead. That's coherent for a frightened carer, but it needs the actor to land it. If the performance tips into menace, the character breaks. |
| Is the North Wing frightening before it's reached? | Built from absences: the seven, the closure order, her refusal, L29, the dead NORTH WING phone in `EN3`. **Risk:** with nothing shown, some players may read the North Wing as merely "the exit". Mitigation: L34 and the PA call reframe it at the end. **Not proven.** |
| Is the chase earned? | Yes in structure: an informed choice (the alarm warning), visible evidence (the tray, the order), her arrival from behind along the known route, and a confrontation before the run. **Weak point:** the chase itself is short (about 75 m). |
| Are choices meaningful? | Suspicion changes searches and the chase gap. The approaches differ in risk, lead time and information (C gives her notebook). **Weak point:** consequences are **cumulative and invisible**. Players may not perceive them on a first play. That's acceptable for replay value, but it isn't dramatic. |
| Does exploration stay subordinate? | Budgeted at 14%. **Risk:** the map's size invites wandering. The handbell, the phone and sound pulls are the guards. |
| Do the encounters fit the existing geometry? | The greybox tests already prove what each needs: clearance, sightlines, hiding exits, the single-line chase. **Unproven:** the trolley navigating `LWC`/`LEC` while the player shares the corridor. |
| Any obvious softlocks? | None found on paper. The stores lock only when the player is inside (the hatch is inside). The steam has a fail-safe. The keys are retryable every lap. The bulkhead can't be lost. **Watch:** if Ruth's bag isn't taken, she carries it on her trolley in E4. It's optional, so this can't block anything. |
| Is the voice plan realistic? | Yes, for a small cast (Shaw plus Ruth, under 70 lines). TTS claims are sourced but **unheard**. The audition gate exists to stop wishful thinking. |
| Can the chapter reach 25–35 minutes without filler? | The budget reaches 32:00 from content. **Most of it (23 minutes) is directed time that exists only as design.** Nothing here is measured beyond the 3:28 of traversal. The real number will come from M10. |

*End of NW-R02B. Design only. Awaiting human review before any implementation.*
