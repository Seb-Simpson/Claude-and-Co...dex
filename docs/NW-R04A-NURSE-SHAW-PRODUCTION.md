# NIGHT WARD — NW-R04A: Nurse Shaw production, first visual checkpoint

**Status: STOPPED at the visual approval gate.** The static model is built and running in an isolated in-game preview. It is recognisably the approved design, but it is still **noticeably different from the reference** in several areas (§5). That is the brief's stop condition, so I have stopped and am reporting.

**Not started:**
- no rigging or animation;
- no gameplay AI;
- the existing gameplay nurse model is untouched;
- no merge and no PR.

**Your decision is needed before production continues (§8).**

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
