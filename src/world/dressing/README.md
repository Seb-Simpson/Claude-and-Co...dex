# Room 104 visual prototype (Blender set)

Room 104 (where the player wakes) and the west corridor outside it (x −20 to −7) are rebuilt as a
Blender-modelled, textured, light-baked set. This is the visual target for the rest of the ward:
proper furniture, real materials, deterioration and a distinctive supernatural mark. It still
runs on ordinary laptops.

## What changes in game, and what does not

| Changes (visual only) | Unchanged |
| --- | --- |
| Room 104 floor, walls, ceiling, skirting | every collider (`world.colliders`) |
| Bed, bedding, cabinet, overbed table, IV stand, wardrobe, sink + mirror + splashback, headwall, vitals monitor, TV body, wall clock, troffer housing | doors and door leaves (still procedural, animated by gameplay) |
| Wheelchair (dressed *inside* its creep-anomaly group, so the anomaly still moves it) | interactables, hiding spots, inspections |
| West corridor floor, wall skins, wainscot, crash rails, skirting, corner guards, ceiling tiles, troffer housings, room plaques, sanitiser dispensers, notice | spawns, patrol routes, navigation |
| Decals: water stains, rust runs, nail scratches, ash handprints, peeling paint, drag marks, **the rot** | light fixtures (still the atmosphere module's lights; the panels stay procedural) |
| | anomaly targets (TV and monitor screens stay procedural: the horror module drives them), the mirror record |

`regions.test.ts` builds the world with and without the prototype regions and asserts that every
gameplay record is identical.

## How it plugs in

```
hospital.module.ts setup()
  ├─ loadRoom104Set()           GLB + light map, with a 20 s timeout; never half-applied
  ├─ createHospitalWorld({ suppressVisuals: PROTOTYPE_SUPPRESSION })   ← only if the set loaded
  │     builder.add() skips static pieces fully inside the regions (regions.ts)
  ├─ world.root.add(set.root)
  └─ wheelchair group: hide procedural meshes, add the Blender wheelchair as a child
```

* If the set fails to load, the world module logs
  `NIGHT WARD: Room 104 visual set unavailable, using the procedural room` and builds the old
  room. Gameplay is identical either way.
* `?nwSet=procedural` forces the procedural room, for comparisons.
* Console on success:
  `NIGHT WARD: Room 104 visual set loaded (… triangles, … materials, … textures)`.

## Lighting

The engine has no shadow maps and no tone mapping (engine-owned settings). Real-time shadows would
also cost too much on integrated GPUs. Instead:

* **Baked light/occlusion map** (`room104_lightmap.jpg`, UV channel 1). Cycles bakes the
  irradiance from the game's own light layout and multiplies it with ambient occlusion:
  - the room troffer;
  - the live corridor troffers (the dead one at x −14.6 is excluded);
  - cold light from the west window.
* **Applied to direct light too.** three.js only applies `aoMap` to indirect light, so
  `room104.ts` patches the shader to also scale direct diffuse and specular light. The bed,
  cabinet, wall fittings and corners keep their contact shadows under the game's dynamic,
  flickering troffers. Flicker still works, because it scales the dynamic lights.
* The **rot** carries a faint cold emissive along its youngest veins, which breathes slowly
  (`set.update()`). It is never strong enough to light anything.

## Supernatural identity: the rot

Black, branching veins spread from the corner behind the bed head. They climb the west wall and
cross the ceiling, then creep out of the doorway along the corridor skirting. It is not mould: it
grows in fractal branches like frost in reverse, and its tips glow faintly cyan in the dark. The
ash handprints on the ceiling above the bed, out of anyone's reach, and the nail scratches beside
the pillow tell the rest.

## Pipeline (`pipeline/`)

```
BLENDER_PY=/path/to/python-with-bpy ./pipeline/build_set.sh   # ~25 min on 4 CPU cores (NW-005A build)
BLENDER_PY=... ./pipeline/build_set.sh --quick                # ~3 min, noisy bake, 1024 maps
```

1. `textures.py` (numpy + Pillow) produces:
   - **tileable PBR sets:** floor vinyl, wall paint, wainscot, ceiling tile and beech rail.
     The noise is synthesised in the frequency domain, so it is periodic by construction.
   - **a decal atlas** with a glow map.
   - **a signage atlas:** room plaques, the clock dial stopped at 3:17, and the ward notice.
2. `room104_set.py` models everything in exact game coordinates (`nwset.g()`). Furniture uses
   the placements and footprints in `rooms/patientRooms.ts`, so it lines up with the colliders.
   The bedding is cloth-simulated.
3. `bake_export.py` bakes and exports:
   - joins every procedurally shaded part into one mesh;
   - bakes its colour, roughness/metalness and normal detail into a 2048 atlas;
   - bakes the light/occlusion map over the whole set;
   - gives the wheelchair its own atlas;
   - exports one GLB, with one mesh per material.
4. `preview_set.py` renders Cycles close-ups under the same light layout.

## Budget (current build)

See `assets/room104_set.json`.

| | |
| --- | --- |
| Triangles | 56,446 for the whole room and corridor (about +50k in view vs the procedural room) |
| Materials and draw calls | 9 (one mesh per material). In-game draw calls do not rise: 52 vs 59 at the wake-up view, 155 vs 163 down the corridor. |
| Download | 6.1 MB GLB + 0.9 MB light map |
| GPU texture memory | about 129 MB uncompressed with mipmaps. The largest are the 2048² props colour atlas, decal atlas and light map (21 MB each). `optimize_glb.py` already drops the glow atlas, props ORM/normal and wheelchair maps to 512–1024. |

**Recommended before scaling this to the whole ward:** KTX2/Basis texture compression (three's
`KTX2Loader`). It would cut GPU texture memory by about 4–6×. It needs the Basis transcoder
shipped as a static asset.

## Known limitations

* **Static set.** The baked light assumes the room's light layout. A lights-out cinematic still
  darkens the room (dynamic lights scale everything), but the baked shading stays.
* **Mirror.** Only the procedural Reflection draws in the mirror. The glass is a dark,
  specular-only surface (there is no environment map).
* **Bedding.** The cloth simulation lands most of the bedding in a heap beside the bed. That
  reads as "dragged off", but the sheet is not tucked on the mattress.
* **Still procedural.** The TV and monitor screens, the light panels, the west window and blinds,
  the room-number plaques and the hanging station sign (crisp canvas text), the nurses' station
  interior (worktop, desk items, back wall), and the troffer at x −0.2, which straddles the set's
  end.

## NW-005A additions (the opening)

The set now runs from the west window to the nurses' station (x −20 → −0.2). New Blender
content lives in `pipeline/opening.py` and is called from `room104_set.py`:

* **Door kit.** One beech-veneer fire-door leaf, built once in the door group's local frame and
  reused by every corridor door. It has:
  - stainless kick and push plates, lever handles on roses and a privacy turn;
  - butt hinges and an overhead closer;
  - a narrow vision panel of wired safety glass, matching the procedural panel so sightlines
    through doors do not change.

  It ships as the GLB node `doorleaf`. At runtime, `doors.ts` parents a clone into each door
  group for doors 101–106 and 108, and hides only the procedural leaf meshes. The doors' rotation
  and colliders are untouched.

  Painted hardwood frames (linings, stops, 70 mm architraves on both faces, stainless corner
  guards and threshold) replace the procedural frames. Each door has its own suppression box in
  `regions.ts`.
* **Room 104 props.** All of these positions are mirrored in `src/world/opening.ts`:
  - the staff card reader (latch side, room face, with surface trunking);
  - the ward intercom above the door;
  - E. Shaw's staff access card on its lanyard, which ships as its own node,
    `nw:opening:access-card-prop`, so gameplay can hide it on pickup;
  - the bed's privacy curtain on its ceiling track.
* **Corridor fixtures.** Smoke detectors, PA speakers, the station's STAFF ONLY sign and the
  corridor clock (03:17).
* **Corridor props, remodelled on their existing colliders.** The procedural visuals are
  suppressed by boxes in `regions.ts`; the colliders are kept.
  - The station counter's front: teal HPL panels with aluminium joints, a recessed plinth, a beech
    bump rail and a solid-surface ledge carrying a bell, a pen on its chain, a visitors' book and a
    "PLEASE WAIT HERE" tent card.
  - The two visitors' chairs: beech arms, wipe-clean vinyl, one seat torn.
  - Four sanitiser dispensers.
  - The yellow A-frame "CAUTION WET FLOOR" sign.
* **Corridor density without collision.** These are wall-mounted, overhead or flat on the floor,
  so no colliders are added; Codex's `doorway-seams` test pins the count.
  - patient-information whiteboards by the doors;
  - glove-and-apron PPE stations by 104 and 106;
  - a fire alarm call point and fire action notice;
  - the ward notice board (night rota, "Re: 104 — do not discuss with relatives");
  - a hand-hygiene poster and the visiting-hours sign;
  - a CCTV dome over the station approach;
  - loose papers, a nitrile glove, a medicine cup and a pen on the floor.

  The print is in `textures.py → corridor_labels.jpg`.
* **Textures.** `textures.py` adds `door_veneer` (a grain set) and `opening_labels.jpg`, which
  holds the ID card, the reader face, the intercom badge and the station sign.
* **Light.** The bake adds the corridor troffers at x −3.8 and −0.2, the station troffer and the
  warm desk lamp. Light from the station falls over its counter into the corridor. Corners and
  contact shadows are darker than before: the mapping changed from 0.45 + 0.55 to 0.3 + 0.7 for
  light and 0.38 + 0.62 for occlusion.
