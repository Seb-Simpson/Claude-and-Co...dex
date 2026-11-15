# NIGHT WARD — NW-R04A: Nurse Shaw character source audit (Phase 0)

**Result: BLOCKED at Phase 0.** No approved visual reference exists, and the written design is incomplete and contradictory on points that decide the model (face, uniform colour, height, footwear). The brief says: *"If the approved reference images or design specifications cannot be recovered, STOP and report exactly what is missing. Do not substitute your own generic nurse design."* I have stopped. **No modelling has been done.**

| | |
|---|---|
| Branch | `claude/nw-r04a-shaw-character`, from `claude/nw-r03-gameplay-foundations` (`f58b5c3`) |
| Searched | All 18 remote branches, every `docs/` file, `src/horror/`, `src/frontend/media/`, and the R00–R03 design documents |
| Not merged or cherry-picked | The previous Shaw branches (`nw-007b`, `nw-006b`), which were inspected only |

---

## 1. Sources found

| # | Source (branch: path) | What it is | Status as a design source |
|---|---|---|---|
| S1 | `main`: `src/horror/README.md` (NW-002, "Entities") | Original entity brief: *"Nurse — 1.9 m, starched dress and cap, apron, dark stockings, **bandaged eyes** (hunts by sound)"*; idle and walk with *"hands clasped, measured steps, head twitching toward sounds"* | Earliest description. Written for a **monster entity** (the same table has a 2.3 m Patient and a 2.45 m Watcher). |
| S2 | `main`: `src/horror/entities/pipeline/blender/nurse.py` | The previous model's sculpt script: *"upright ward sister, eyes bound, head cocked to listen, hands clasped"* | **Implementation of S1**, not a design. It's the rejected model. |
| S3 | `main`: `docs/NW-R00-CHAPTER-1-DESIGN.md` (lines 143–144) | *"Her bandaged eyes are part of her look … Chapter 1 does not explain the bandage."* | Design doc (R00) |
| S4 | `main`: `docs/NW-R01-CHAPTER-1-REVISION.md` (§1.4, §1.5) | *"Margaret Shaw … ward sister of thirty years, formidable, devoted … Her bandaged eyes are part of her design and are not explained."* Mystery thread: *"a 1960s photograph with her eyes uncovered."* | Design doc (R01) |
| S5 | `claude/nw-r02b-…`: `docs/NW-R02B-GAMEPLAY-NARRATIVE-DESIGN.md` (§2.1) | *"Sister Margaret Shaw, 58 … trained in 1947 … Her eyes are bandaged … Starched cap, cape, fob watch, a ring of keys that clinks, and rubber-soled shoes with a slight squeak."* | **The most recent character bible.** The NW-R03 brief says the user "approved [the R02B] design direction". It has no visual reference. |
| S6 | `claude/nw-007b-…`: `docs/NW-007B.md` §2.2 | Fixes to the previous model: *"Face read as a dark mass → pale, waxy skin"*; blindfold, cap and hair alignment | **Technical repair** of S2, not a design decision |
| S7 | `claude/nw-007b-…`: `docs/NW-007B.md` §4 | Sound cues: *"`nw:shaw-steps`: a ward sister's **heels** on vinyl"*; *"`nw:shaw-keys`: the **chatelaine**"* | Audio design. It contradicts S5 on footwear. |
| S8 | `main`: `docs/nw-004/NARRATIVE.md` | *"Nurse **Evelyn** Shaw repeats patient rounds"* | Superseded name (R01 onwards uses Margaret) |
| S9 | `main`: `src/frontend/media/load_nurse.webp` | Loading-screen image, alt text *"A nurse in a starched white uniform with bandaged eyes walks the corridor, hands clasped."* | **An in-engine render of the rejected model** (`docs/nw-r04a/previous-model-loading-render.jpg`), not concept art |
| S10 | `claude/nw-007b-…`: `docs/nw-007b/head/three-way-comparison.jpg`, `docs/nw-007b/shots/*`, `clips/*.gif` | Renders of the previous model | Evidence of the rejected model (`docs/nw-r04a/previous-model-head-nw007b.jpg`) |

**Not found anywhere:** concept art, a mood board, a reference photo set, a character sheet (front/side/back), a face description, a colour palette, or any message or document recording a visual approval.

## 2. Confirmed design decisions

These are consistent across the sources. Each source cited is a design document, not just the previous model.

| Decision | Sources |
|---|---|
| Name **Sister Margaret Shaw**; night ward sister of Ward 4, Halden Vale General; 31 years on the ward | S4, S5 |
| **Age 58**; trained 1947 under Nightingale discipline | S5 |
| **Eyes bandaged**, never explained in Chapter 1 | S1, S3, S4, S5 |
| Her eyes are normal underneath: a 1960s photograph shows them uncovered | S4 |
| **Starched cap** | S1, S5 |
| **Cape** | S5 |
| **Fob watch** | S5 |
| **Ring of keys that clinks** (a chatelaine, carried at the belt) | S5, S7 |
| Starched dress | S1 |
| Apron | S1 only |
| Dark stockings | S1 only |
| **A psychologically coherent, frightened human, not a monster**; becomes visibly terrified at the North Wing | S5 §2, locked by the NW-R03 brief |
| Pushes a **trolley** on her round; walks about 0.9 m/s; rarely runs until stage 4 | S5 |

## 3. Contradictions that need a decision

| # | Topic | Conflict | Why it matters for the model |
|---|---|---|---|
| C1 | **Height and proportions** | S1/S2: **1.9 m**, with the elongated neck and limbs of the rejected model (`previous-model-head-nw007b.jpg`). S5: a 58-year-old woman, explicitly *not* a monster. | Decides the skeleton, the silhouette and every animation. A real 58-year-old British woman is typically about 1.60–1.68 m. |
| C2 | **Uniform colour** | S9/S2: **white** (the rejected model). No design document states a colour. In 1987 NHS hospitals, ward sisters typically wore **dark blue/navy** dresses (staff nurses lighter blue). Cape colour isn't specified anywhere. | The single biggest read of the silhouette in a dark corridor |
| C3 | **Footwear** | S5: **rubber-soled shoes that squeak**. S7: **heels** on vinyl. | Shape of the shoe, gait, and sound sync |
| C4 | **Apron and stockings** | S1 only (the monster brief). Not in S5. | Garment construction |
| C5 | **Posture** | S1/S2: hands clasped, head cocked and twitching (a monster). S5: a composed professional, increasingly afraid. | Animation set and rest pose |
| C6 | **Name** | S8 "Evelyn" vs S4/S5 "Margaret" | Name badge text |
| C7 | **Skin** | S6 "pale, waxy" was a **render fix** for the old model's dark face, not a design choice. No skin tone or complexion is specified. | Skin material |

## 4. Missing: needed before modelling

1. **A visual reference.** Concept art, or a reference board you approve: face, full body, palette.
2. **Facial identity.** Face shape, features, complexion, the age detail at 58, and **hair colour and style** (S2 used a bun under the cap).
3. **The bandage.**
   - Material: crêpe, gauze or linen.
   - How it wraps (eyes only, or around the head).
   - Condition (clean, yellowed, stained). "Bandaged eyes" is all that's specified.
4. **The uniform in detail:**
   - dress colour;
   - collar and cuffs;
   - sleeve length;
   - belt and buckle (sisters traditionally wore a silver buckle);
   - name badge;
   - cap style (e.g. a frilled sister's cap vs a folded cap);
   - cape colour and lining.
5. **Height and build** (C1).
6. **Supernatural characteristics.** Is anything about her body unnatural, apart from the unexplained bandage? The approved direction (S5) suggests no, but S1 says yes.
7. **Hands.** Gloves? Rings? A watch?

## 5. Why the previous model was inadequate

Evidence: `docs/nw-r04a/previous-model-head-nw007b.jpg` and `previous-model-loading-render.jpg`.

| Area | Problem |
|---|---|
| **Construction** | The body is a Blender **skin-modifier tube** over 25 joints, and the head is assembled from **ellipsoid primitives** (`cranium`, `face`, `jaw`, `chin`). There's no sculpted anatomy, no eyelids, lips or ears, and no real hands. |
| **Proportions** | Monster-brief proportions: 1.9 m, a long tube-like neck, mannequin shoulders. Adult anatomy doesn't read. |
| **Face** | Featureless. The bandage, cap and hair are separate shells that slid and clipped (fixed in NW-007B, but still crude). |
| **Materials** | One 1024² baked atlas for the whole body. Mottled noise, no fabric or skin distinction. A white uniform that reads as plastic. |
| **Rig** | 19 bones: no fingers, no face, no cloth bones |
| **Budget** | 23.5k triangles, much of it in the skin tube rather than where detail is visible (face, hands, garment edges) |

The pipeline was technically sound (export, skinning, tests passed). The **modelling method** was the cause. A new model must not repeat it.

## 6. Phase 1 preview: tooling found in this environment

This is a preliminary check only. No workflow was chosen or installed.

| Tool / source | Found | Notes |
|---|---|---|
| Blender (application) | **Not installed.** `download.blender.org` is refused by the network policy. | The previous model was built in an earlier container. |
| Blender as a Python module (`bpy` 5.0.1) | **Available from PyPI** (374 MB wheel; downloaded once as a check, then deleted) | Headless modelling, baking and export are possible. No interactive sculpting by a person. |
| MakeHuman / MPFB2 (CC0 human base meshes, skins, eyes, hair, clothes, game rigs) | **Not reachable.** `github.com` is refused here; MakeHuman's asset hosts are untested. | The most credible free route to realistic anatomy. Needs network approval. |
| Paid character tools (Character Creator, MetaHuman exports, marketplace assets) | Out of scope without approval | MetaHuman's licence restricts use to Unreal Engine, so it's unsuitable for a Three.js game |
| AI image-to-3D generators | Not evaluated yet | Historically weak on faces and hands. Would need evidence of benefit. |

**Honest expectation, to discuss at approval.** In this environment I can drive Blender entirely from code; there's no artist's hand in the loop.
- **Best free route:** a CC0 MakeHuman/MPFB2 base adapted in Blender, with custom-built garments and baked PBR textures. That gives realistic proportions and anatomy, a game-ready skeleton and clean licensing.
- **Its limits:** a distinctive, characterful face and convincing cloth at a "high-quality horror game" standard (the brief's 90/100) is a high bar for a code-driven pipeline. I wouldn't claim it can be met until a first head and body are inspected in the game.
- **If that inspection falls short,** the realistic alternatives are:
  1. a commissioned character artist working to the approved reference;
  2. a licensed commercial base character with redistribution rights for a web game;
  3. a hybrid: the MPFB2 base plus an artist pass on the head and costume only.

## 7. Questions for approval

1. **A visual reference.** Do you have the concept images or references from the earlier approval? If so, where (a file, a chat, another repository)? If none exists, should I prepare a **reference proposal** for you to approve before modelling? That would be a written spec plus clearly labelled reference sketches or renders; no AI concept art would be presented as evidence.
2. **Height and proportions (C1):** a realistic woman of about 1.63–1.68 m, as the R02B direction implies, or the original 1.9 m?
3. **Uniform colour (C2):** period-accurate **navy** ward sister's dress, or **white**? And the cape colour and lining?
4. **Footwear (C3):** rubber-soled shoes (R02B) or low heels (NW-007B audio)?
5. **Apron and dark stockings (C4):** keep from the NW-002 brief?
6. **The bandage:** material, wrap and condition (see §4.3).
7. **Face and hair:** any direction on her facial identity, complexion and hair? Or should the reference proposal (Q1) define them for approval?
8. **Network for tools:** may I allow the hosts for the MakeHuman/MPFB2 CC0 assets (GitHub release downloads and MakeHuman's asset server) and install `bpy` from PyPI?
9. **Budget:** if the free route can't reach the standard, is a paid path (artist commission or licensed asset) acceptable to consider?

---

*Stopped at Phase 0 as the brief requires. Nothing has been modelled, and no design is claimed as approved beyond what §2 cites.*
