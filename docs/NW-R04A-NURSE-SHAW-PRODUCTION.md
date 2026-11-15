# NIGHT WARD — NW-R04A: Nurse Shaw production

**Current status (NW-R04A.2): STOPPED for human visual inspection.** One focused refinement pass on the static model is complete, using the same free workflow (MakeHuman CC0 + Blender `bpy`, code-driven). **The model is not claimed as approved:** only you decide that.

**Not done:**
- no rigging, animation or gameplay AI;
- no cape, keys or fob watch;
- the gameplay nurse is untouched;
- no PR or merge.

- §R2 below: this refinement pass.
- §1–§8: the original NW-R04A first-checkpoint record, kept for history. Its numbers describe the R04A model.

## R2. NW-R04A.2 reference-fidelity refinement

### R2.1 What changed, in the brief's priority order

| # | Area | Change (in `tools/character/shaw/`) | Result vs the sheet |
|---|---|---|---|
| 1 | **Cap** | Rebuilt as a **folded boat/wedge cap**: a band rising from the head and flaring outward. Tallest at the front (turned-up cuff), lowest at the back. Side corners stand out. **Burgundy trim** near the top edge. A closed, folded top that always clears the hair. | **Improved.** The side and back read as the sheet's wedge. From the front it is still rounder and more "pillbox" than the sheet's crisp, wide fold. |
| | | *Reverted:* flat shading on the band. In game it rendered as a checkerboard of light and dark facets, which was worse. Now the band is smooth and only the folded top is crisp. | |
| 2 | **Hair** | Replaced the sparse strand clumps with a **dense jaw-length bob**:<br>• a volume shell from the crown to the jaw, open over the face;<br>• 170 strand cards lying on it, about a quarter of them lifted as flyaways;<br>• ragged ends;<br>• 16 loose strands falling over the covering, more on her right;<br>• a painted strand texture (rougher, slightly wet). | **Improved: now a bob, not strings.** It is still smoother and more "helmet-like" than the sheet's wispy, separated strands. The ragged ends read as spikes from behind. The sheet shows her ear; ours is covered. |
| 3 | **Skirt and bow** | Fixed a **root-cause bug**: the old skirt used the hip radius all the way up to the waist, so its back stood 5 cm off the belt. That was the boxy side silhouette. The skirt now:<br>• hangs from the belt with a slope-limited drape over the hips (never inside the body);<br>• has a fuller A-line flare (+36%);<br>• has broad, soft folds that deepen toward the hem;<br>• has fine gathers under the belt;<br>• has a hem that rises and falls with the folds.<br>Bow tails are laid onto the fabric (they floated 6 cm off it). Fixed an old underskirt bug (cumulative tear depth). | **Improved:**<br>• the side silhouette is a smooth A-line;<br>• the front shows a fitted waist and a full skirt;<br>• the tails lie on the skirt.<br>**Still different:**<br>• the sheet's tails are longer (to the knee) and wider;<br>• its loops are puffier;<br>• its folds are softer and deeper. |
| 4 | **Face covering** | **Physical relief**, sharing the painted seam lines exactly (`textures.MASK_SEAMS`):<br>• each strip's lower edge forms a narrow overlapping lip over the strip below;<br>• the off-centre vertical seam is a raised ridge;<br>• pins and clips sit on the strip edges and along the seam.<br>The asymmetric layout is kept. *Tuned down* after the first in-game view, where a sawtooth profile read as puffy "quilted rolls". | **Improved:** layered strips are visible in game. **Still different:** it reads somewhat padded or quilted next to the sheet's flatter canvas plates. The lower edge forms a small lip at the jaw. |
| 5 | **Hands** | Sculpted around the finger bones:<br>• thinner phalanx shafts;<br>• swollen knuckles at every joint (strongest on the back of the hand);<br>• extensor-tendon ridges along the metacarpals;<br>• claws lengthened and curved, hooking toward the palm. | **Improved:** bony, jointed, long and unsettling. **Still different:** the sheet's hand is more muscular and gnarled, with stronger tendons. Ours reads as glossy red rather than the sheet's dark, mottled maroon. |
| 6 | **Materials** | The procedural fabric shader gained:<br>• **uneven weathering:** large yellowed blotches with darker tide-mark rims;<br>• **grime rising from the floor** toward the hem;<br>• **fine blood spatter** around the stains;<br>• a **woven texture** (a two-direction crosshatch instead of one-direction stripes);<br>• grime-driven roughness variation.<br>Heavier blood on the apron, more on the skin. | **Improved:** heavy, uneven blood and wear, like the sheet. **Still different:**<br>• the blood reads redder and pinker than the sheet's dark brown-red;<br>• there are no stitched seams or fibre-level fraying on garment edges (only torn geometry at the hem and tails). |
| 7 | **Optimisation** | Removed skin that can never be seen (skull and face under the cap, hair and covering; eyes; feet inside the shoes). Decimated the under-scalp (to 30%), the shoes (to 50%), and the arms, legs and neck (unprotected parts halved; **hands kept at full detail**). Trimmed the skirt and mask grids. The underskirt now starts at the knee. | **71,036 → 39,223 triangles (−45%)** |

### R2.2 Asset (measured)

| | R04A | **R04A.2** |
|---|---|---|
| Triangles | 71,036 | **39,223** (12 meshes, one per material) |
| Draw calls (Shaw alone, studio full body) | 13 | **13** |
| Height | 1.900 m | **1.900 m** (measured in game). The export fits the assembled figure to 1.90 m (×1.025). |
| GLB | 3.80 MB | **3.71 MB** (`src/characters/shaw/assets/shaw-r04a-preview.glb`) |
| Textures | 21 | **23** (WebP) |
| Load (fetch + parse, headless) | 279 ms | **328 ms** |

Texture sizes:
- skin and apron: 2048² (albedo, roughness, normal);
- burgundy dress: 1024² (albedo, roughness, normal);
- face covering: 1024² painted (albedo, roughness);
- cap: 1024×256 painted;
- **hair: 512² painted (albedo, roughness), new**;
- underskirt, belt, leather: 512² (albedo, roughness, normal);
- claws, buttons, pins: constant PBR.

In the ward the whole scene draws 73–374 calls and 105k–150k triangles depending on the view (`docs/nw-r04a/preview/diagnostics.json`). The headless runs use SwiftShader software rendering, so frame times are not GPU performance figures.

### R2.3 Evidence (genuine in-game screenshots, `docs/nw-r04a/preview/`)

| Sheet | Contents |
|---|---|
| `before-after-body.jpg` | Reference / R04A / R04A.2: front, side, back (studio) |
| `before-after-closeups.jpg` | Reference / R04A / R04A.2: face and hand |
| `compare-turnaround.jpg`, `compare-three-quarter.jpg` | Reference vs in-game studio: front, side, back, ¾ front, ¾ back |
| `compare-cap-hair.jpg` | Reference head front, side, back vs in-game (new head-side and head-back presets) |
| `compare-mask.jpg` | Reference face-covering close-up vs in-game studio and ward |
| `compare-hands.jpg` | Reference hand vs in-game studio and ward |
| `compare-skirt-bow.jpg` | Reference skirt front, side, back vs in-game (including a new side close-up preset) |
| `compare-ward-lighting.jpg` | **NIGHT WARD's actual lighting:** front, ¾ back, 3 m and 7 m gameplay distances |
| `studio-*.jpg`, `ward-*.jpg`, `diagnostics.json` | Every raw view in both lightings |

The preview gained the camera presets `head-side`, `head-back` and `skirt-side`. Open the game at `/?preview=shaw`.

### R2.4 Remaining differences from the approved sheet (honest)

1. **Cap front:** rounder and more cushion-like from the front. The sheet's cap is a crisp, wide fold with the front corners stepping out.
2. **Hair:** the right bob shape and density, but too smooth and solid. The sheet has fine separated wisps and shows the ear. The ragged ends read as triangular spikes from behind.
3. **Face covering:** layered and pinned as on the sheet, but slightly quilted and padded rather than flat canvas plates. A small lip sticks out at the jaw.
4. **Bow:** the tails are shorter and narrower than on the sheet, and the loops are flatter.
5. **Hands:** long and bony with knuckles, but less gnarled and muscular. The surface is too glossy and uniformly red.
6. **Blood colour:** redder and pinker than the sheet's dark brown-red. The stockings and arms carry less staining than the sheet.
7. **Fabric detail:** no stitched seams or edge fraying on the bib, straps and collar. Only the hem and tails are torn.
8. **Collar:** small white slivers between the collar flaps in close-ups. This is a bake artefact on the thin flap rims (it was also present in R04A). Not fixed in this pass.
9. **Overall:** this remains a code-built model on a stylised CC0 base. Close up, it doesn't have the sculpted, painterly richness of the sheet.

**No passing score is assigned.** The R04A rubric (§6) is unchanged as a record. I'm not re-scoring this pass as a pass: the decision is yours.

### R2.5 Tests (exact commands and results)

| Command | Result |
|---|---|
| `npm run typecheck` | Passed (`tsc --noEmit`, exit 0) |
| `npx vitest run` | **59 files passed, 1 skipped; 497 tests passed, 1 skipped** (includes `tests/characters/shaw-preview.test.ts`, 3 tests, which covers the new camera presets) |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium NW_R04A_EVIDENCE=1 npx playwright test tests/browser/nw-r04a-shaw-preview.spec.ts --trace off` | **1 passed** (3.2 min). Asserts: model loaded, no error, height 1.85–1.95 m (measured 1.900), no entities spawned, no page or console errors. 22 views captured. |

`src/main.ts` was not changed in this pass, so the R04A regression run (foundation + greybox, 4 passed) still applies.

### R2.6 Rebuild

Run from `tools/character/shaw`:

```
$PY build_body.py -- --mh $MH --out $OUT
$PY build_shaw.py -- $OUT/shaw_body.blend $OUT
$PY export_shaw.py -- $OUT/shaw_dressed.blend $OUT/glb/shaw.glb
```

Then copy the GLB to `src/characters/shaw/assets/shaw-r04a-preview.glb`.

Run from the repo root:

```
python3 tools/character/shaw/compare_ingame.py docs/nw-r04a/references/nurse-shaw-approved.jpg docs/nw-r04a/preview [<before_dir>]
```

---

# NW-R04A first visual checkpoint (historical record)

*The screenshot files named below were replaced by the R04A.2 captures. The R04A images survive in the `before-after-*.jpg` sheets and in git history (commit `46fe079`).*
## 1. Sources

| Source | Use |
|---|---|
| `docs/nw-r04a/references/nurse-shaw-approved.jpg` | **Authoritative visual reference**, recorded in `docs/NW-R04A-CHARACTER-SOURCE-AUDIT.md` §0 |
| `docs/NW-R02B-GAMEPLAY-NARRATIVE-DESIGN.md` §2 | Personality and narrative (doesn't affect this static model) |
| MakeHuman 1.x system assets, **CC0** (`makehumancommunity/makehuman`, commit `a8bc2d5`) | Base mesh (`base.obj`), shape targets, default skeleton (`default.mhskel`) and weights (`default_weights.mhw`). Read at build time from a local checkout. Not vendored. |

No AI image, concept or 3D generation tools were used. No generated imagery is presented as evidence. Every image in `docs/nw-r04a/preview/` is a screenshot of the running game.

## 2. Workflow and tool evaluation

| Option | Verdict |
|---|---|
| **Primitive / skin-modifier sculpt** (the previous model's method) | **Rejected:** that's what failed before (audit §5) |
| **MakeHuman CC0 base + Blender (`bpy` 5.0.1) driven from code** | **Chosen.** Free and redistributable. Real anatomy with UVs, a game skeleton and weights. Garments are built as custom geometry on the posed body. Materials are procedural PBR, baked to textures. |
| MPFB2 (Blender add-on) | Same CC0 assets. The add-on UI isn't usable headless, so the assets are used directly. |
| AI image-to-3D / text-to-3D | **Not used.** They can't reproduce a specific approved design reliably (face covering, garment construction, hands). Results aren't controllable or reproducible. |
| Paid tools, assets or commissions | Not used (no approval). See §8. |

**Pipeline** (`tools/character/shaw/`, reproducible end to end; ~3 minutes on CPU):

| Stage | Script | What it does |
|---|---|---|
| Body | `build_body.py` | MakeHuman macro targets: female, older, very thin, tall. Limb targets: long forearms and upper arms, long fingers, bigger hands, thin limbs, narrow torso and hips, long thin neck. Builds the skeleton from joint helpers, binds the CC0 weights, then poses her in world space: arms hanging, feet together, slight stoop, head tilted right and down. Phalanges are lengthened by bone scale. |
| Costume and head | `build_shaw.py` | Garments are extracted from the posed body by bone weights, then raycast and projected (see the list below). Body faces hidden under the costume are deleted. |
| Materials | `materials.py`, `textures.py` | Procedural PBR (see below) |
| Bake and export | `export_shaw.py` | Joins parts by material. Smart UVs (MakeHuman UVs kept for skin). Bakes albedo, roughness and normal with Cycles. The mask and cap textures are exported directly. **Scales the assembled figure uniformly to exactly 1.90 m.** Writes a GLB with WebP textures. |
| Review | `render_views.py`, `compare.py`, `compare_ingame.py` | Blender turnaround renders, and side-by-side sheets against the reference |

The costume and head pieces built by `build_shaw.py`:
- burgundy dress bodice and sleeves, turned-up cuffs, collar and pointed collar flaps;
- bib with 2×4 buttons plus corner and placket buttons;
- belt;
- full apron skirt with folds, gathers and a jagged torn hem;
- dark torn underskirt;
- back-crossing straps;
- bow loops, knot and long torn tails lying on the skirt;
- stitched canvas face covering (raycast onto the head) with pins;
- 120+ clumps of dark hair strands;
- folded cap with a closed crown;
- Mary-Jane shoes with block heels and ankle and instep straps;
- dark claws on the fingertips.

The materials (`materials.py`, `textures.py`):
- procedural PBR for skin, stockings, burgundy, apron cotton, leather and more, with noise grime, height-graded blood and weave or pore bump;
- painted textures (numpy) for the mask, which has strips, seams, stitches, a blood streak and drips, rust round the pins and grime;
- a painted texture for the cap, which has the burgundy stripe and stains.

**Commands** (from `tools/character/shaw`; `$PY` is a Python 3.11 venv with `pip install bpy==5.0.1 numpy`; `$MH` is a MakeHuman checkout's `makehuman/data`):

```
$PY build_body.py -- --mh $MH --out $OUT
$PY build_shaw.py -- $OUT/shaw_body.blend $OUT
$PY export_shaw.py -- $OUT/shaw_dressed.blend $OUT/glb/shaw.glb
cp $OUT/glb/shaw.glb ../../../src/characters/shaw/assets/shaw-r04a-preview.glb
```

## 3. Asset

| | |
|---|---|
| File | `src/characters/shaw/assets/shaw-r04a-preview.glb` (3.80 MB) |
| Height | **1.900 m** (measured in-game, floor to cap) |
| Triangles | **71,036** in 12 meshes (one per material) |
| Materials / textures | 12 materials, 21 textures (WebP) |
| Texture sizes | Skin and apron: 2048² (albedo, roughness, normal)<br>Burgundy dress: 1024²<br>Mask: 1024² painted<br>Cap: 1024×256 painted<br>Underskirt, belt, leather: 512²<br>Hair, claws, buttons, pins: constant PBR |
| Rig | MakeHuman default skeleton (163 bones) used for posing **only**. The static GLB carries no skin or rig, as required at this gate. |
| Load | 279 ms (GLB fetch + parse in the preview, headless) |
| Draw calls | 13 for Shaw alone (studio view). In the ward, scene totals are 88–374 calls, of which 12 are hers. |

## 4. In-game preview

**`/?preview=shaw`** runs the real game with the static model added in the main corridor at (−11.5, 0, 0.9), facing east. The ward, atmosphere, light rig and fog are all live. Entities are disabled for the preview (`activeEntityTypes: []`).
- **Isolated:**
  - the default game, the greybox and every other mode never load the model;
  - the gameplay nurse model is unchanged.
- **Test bridge** (`?test=1`): `window.nightWardShawPreview` provides:
  - `setView(front | front34 | side | back34 | back | face | hands | gameplay-near | gameplay | free)`;
  - `setLighting(ward | studio)`;
  - `diagnostics()`.
- **Studio mode** hides the ward and lights her with key, fill, rim and hemisphere lights on a grey cyclorama, to judge form and colour.
- Code:
  - `src/characters/shaw/preview.ts`;
  - wired in `src/main.ts`;
  - unit test `tests/characters/shaw-preview.test.ts`;
  - browser capture `tests/browser/nw-r04a-shaw-preview.spec.ts` (`NW_R04A_EVIDENCE=1` writes `docs/nw-r04a/preview/`).

### Evidence (genuine in-game screenshots, `docs/nw-r04a/preview/`)

| Sheet | Contents |
|---|---|
| `compare-turnaround.jpg` | Reference vs in-game studio: front, side, back |
| `compare-three-quarter.jpg` | Reference vs in-game studio: ¾ front, ¾ back |
| `compare-face.jpg` | Reference face close-up vs in-game face (studio and ward) |
| `compare-hands.jpg` | Reference hand vs in-game hands (studio and ward) |
| `compare-ward-lighting.jpg` | Reference vs **NIGHT WARD's actual lighting**: front, ¾ back, and gameplay distances 3 m and 7 m |
| `studio-*.jpg`, `ward-*.jpg` | Every raw view; `diagnostics.json` |

## 5. Comparison against the reference (honest)

**Faithful:**
- the overall silhouette at gameplay distance;
- the 1.9 m height, narrow build, hanging arms and head tilt;
- the palette (burgundy dress, off-white bloodied apron, dark stockings, burgundy-brown shoes);
- a fully covered face with stitched horizontal strips, an off-centre seam, pins and a blood streak;
- the cap with its burgundy stripe;
- bib buttons, belt, back straps, the bow with torn tails;
- the jagged torn hem with the dark underlayer;
- blood-red hands with long fingers and dark claws;
- Mary-Jane shoes.

**Noticeably different (the reason for stopping):**
1. **Cap.** Ours is a rounded band/pillbox. The reference is a **folded wedge** with an upswept front edge.
2. **Hair.** Ours is long, stringy and sparse, and looks semi-transparent at close range. The reference is a **denser, dishevelled dark bob** with loose strands.
3. **Skirt.** Ours is a fairly straight tube with shallow folds, and from the side the lower bow reads as a box. The reference is a **fuller, softly gathered skirt** with natural drape.
4. **Hands and arms.**
   - Ours have the right length and claws, but **lack the knuckles, tendons and bony segmentation** of the reference hand.
   - The forearms are less elongated than the sheet.
5. **Face covering.** The panel construction is right, but it's flatter, with less relief. The panel edges don't lift the way the reference's layered strips do.
6. **Material depth.** Fabrics read clean and stiff next to the reference's heavy grime and wear. Blood coverage on the skirt and arms is lighter. Frayed edges come from geometry teeth only (no fibre detail).
7. **Budget.** 71k triangles is heavy for a game character (hair 20k+, skirt and teeth, garment shells).

## 6. Quality rubric (internal self-assessment; target ≥ 90)

| Criterion | Max | Score | Notes |
|---|---|---|---|
| Fidelity to the approved reference | 25 | 15 | Design elements all present. Cap, hair and skirt shape deviate (§5). |
| Facial / anatomical quality | 20 | 11 | Mask is good at mid range. Hands lack anatomy. Body is a stylised MakeHuman base. |
| Clothing and materials | 15 | 9 | Construction is correct. Cloth is stiff; wear and grime are under-done. |
| Animation | 15 | — | Not started: gated on this approval |
| Atmospheric effectiveness | 15 | 10 | Reads well and unsettlingly at 3–7 m in the ward. Close-ups expose the shortcomings. |
| Technical | 10 | 7 | Clean GLB, 12 draw calls, isolated preview, reproducible pipeline. Triangle count is high. |
| **Total** | **100** | **52 (+ animation not scored)** | **Well below the 90 target.** Even a perfect animation score would leave ~67. |

## 7. Tests (exact commands and results)

| Command | Result |
|---|---|
| `npm run typecheck` | Passed (`tsc --noEmit`, exit 0) |
| `npx vitest run` | **59 files passed, 1 skipped; 497 tests passed, 1 skipped** (includes the new `tests/characters/shaw-preview.test.ts`, 3 tests) |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium NW_R04A_EVIDENCE=1 npx playwright test tests/browser/nw-r04a-shaw-preview.spec.ts --trace off` | **1 passed** (2.6 min) |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test tests/browser/foundation.spec.ts tests/browser/nw-r02-greybox.spec.ts --trace off` | **4 passed** (regression check of `main.ts` boot paths) |

The browser preview spec asserts:
- the model loads with no error;
- height is between 1.85 and 1.95 m (measured 1.900);
- **no entities are spawned**;
- no page or console errors.

The spec's first run caught the figure at 1.836 m. The export now measures and fits the figure to 1.90 m.

Headless browser frame timings use SwiftShader software rendering (`frameDeltaMaxMs` is clamped at 100). They aren't a GPU performance measurement.

## 8. Questions for you

1. **Is this direction acceptable to refine, or does it miss too much?** At this gate I judge it *recognisable but not yet faithful enough*.
2. **If refining with the same free pipeline**, these are achievable next:
   - folded wedge cap;
   - denser bob hair cards;
   - fuller gathered skirt with a softer bow;
   - heavier grime and blood;
   - knuckle and tendon detail on the hands;
   - more mask relief;
   - triangle reduction to ~40k.

   My honest expectation is a clear improvement, to roughly the 65–75 range. **I don't expect a code-only pipeline to reach 90 on face and hand anatomy.**
3. **If 90 is firm**, the realistic routes need your approval:
   - a character-artist commission, or an artist pass on the head, hands and cloth over this base (reference-matched, licence-clean);
   - a licensed commercial base with web-redistribution rights.
4. **Cape, fob watch and key ring** (R02B) aren't on the sheet, so they aren't modelled. Should they stay off?

*Rigging and animation will not proceed until you personally approve the model.*
