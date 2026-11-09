# First playable evidence

These are raw Chromium screenshots and measurements from the assembled game with
Claude's Room 104/west-corridor set and Blender entity models. They are not mockups.

- [Wake up in room 104](room104-wakeup.png)
- [Room 104 bed and visual set](room104-blender-bed.png)
- [Walked route through the opened room 103 door](room103-walked-route.png)
- [Patient close-up before capture](patient-closeup.png)
- [Patient introduction in the dark maintenance passage](patient-introduction.png)
- [Under-bed hiding in room 106](under-bed-hiding.png)
- [Capture transition and restart control](capture-restart.png)
- [Fresh room 104 after restarting](restarted-room104.png)
- [Sprint-and-corner escape, then continued exploration](walked-escape.png)
- [Recorded movement route and chase lifecycle](walked-escape-route.json)

The full suite passed **23/23**, with no skips, retries or flakes. It covers all
12 authored viewpoints, actual gameplay, all six hiding spots, GLB loading and
fallbacks, chase/escape, capture/restart, audio unlock, resize and WebGL cleanup.
See [browser-results.json](browser-results.json).

Two strengthened capture/restart checks then passed **2/2** on unchanged application
source. The Patient is explicitly rendered before every resource baseline and reset;
frame counters are taken after ready and each camera move. All three resets retained
**225 colliders, 359 geometries, 77 textures and 31 audited listeners** with one
canvas/HUD. These are the authoritative resource comparisons; the full-suite rows
precede the strengthened warmup. See [visible-model-results.json](visible-model-results.json).

The fresh production soak completed **634.83 wall seconds / 125.92 gameplay seconds**,
including the Patient opening and passing the east maintenance door. Its measured
quiet baseline was 545.86 wall seconds. All five entity GLBs, the Room 104 set and
its lightmap returned HTTP 200. Post-GC retained heap fell **13.97 → 13.52 MB**, and
native audio nodes **66 → 64**. Capture/restart passed; disposal left zero colliders,
canvases, HUDs and active audio sources, with the native audio context closed.
See [long-run-performance.json](long-run-performance.json) and the complete
[compressed raw recording](soak-observations.json.gz).

This cloud environment uses software WebGL. The soak's identical 320×180 early/late
windows measured **2.68 → 2.75 FPS**: no progressive collapse, but a low baseline.
This does not establish native desktop GPU performance. CPU navigation measurements
are separate in [navigation-profile.json](navigation-profile.json); the earlier
[draw-suppression diagnostic](software-gpu-baseline.json) isolates software raster cost.
The legacy `frameDeltaMaxMs` field is clamped simulation time, not an FPS measurement.

The escape prepares a real service door through E and positions only the initial
encounter. After pursuit starts, it uses W/Shift and scripted facing changes through
the maintenance passage, connector and main corridor, then continues west. There is
no escape teleport or enemy repositioning. Other isolated scenarios use explicit QA
positioning to test occlusion and resource lifecycle; those are not escape proof.

To independently recheck the saved raw recording without launching a new game:

```sh
node tests/performance/night-ward-soak.mjs --analyze=docs/evidence/nw-002a/soak-observations.json.gz --output=.playwright/evidence-check
```

That command labels its output as an assertion replay. The primary recording above
is a fresh live run, not a replay.
