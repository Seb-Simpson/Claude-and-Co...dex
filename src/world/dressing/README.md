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
BLENDER_PY=/path/to/python-with-bpy ./pipeline/build_set.sh   # ~30 min on 4 CPU cores
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
* **Still procedural.** Door leaves and frames, the TV and monitor screens, the light panels, the
  corridor props (wet-floor sign, west window and blinds) and the troffer at x −7.4, which
  straddles the corridor boundary.
