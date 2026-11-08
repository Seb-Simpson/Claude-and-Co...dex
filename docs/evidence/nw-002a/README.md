# First playable evidence

These screenshots come from passing Chromium tests of the actual hospital game.
They are not generated mockups or the isolated controller harness. The temporary
Patient representation is visible in its introduction shot.

- [Wake up in room104](room104-wakeup.png)
- [Walked route through the opened room103 door](room103-walked-route.png)
- [Patient introduction](patient-introduction.png)
- [Under-bed hiding in room106](under-bed-hiding.png)
- [Capture transition and restart control](capture-restart.png)
- [Fresh room104 after restarting](restarted-room104.png)
- [Real sprint-and-corner escape, then continued exploration](walked-escape.png)
- [Recorded movement route and chase lifecycle](walked-escape-route.json)

The escape test prepares an open service door through E and positions the initial
encounter. After pursuit begins it uses actual W/Shift movement with scripted facing
changes through the maintenance passage, connector, then main corridor. There
is no escape teleport or enemy repositioning. The player then continues west.
The separate occlusion scenario deliberately repositions the player to test
honest last-known-position behavior; it is not used as the movement escape proof.

Metrics are from headless software WebGL and include cold-path/GC/renderer costs.
The application's `frameDeltaMaxMs` uses the engine's clamped time and must not be
read as a hardware FPS measurement. Hardware GPU and cross-browser performance
remain unverified. Changing camera views legitimately uploads different geometry
and textures; resource leak tests compare repeated restarts at the same spawn.

Final full run: **15/15 passed**, no skipped/retried/flaky tests.
The three restart checks each retained 225 colliders, 180 uploaded geometries,
26 textures and 31 audited listeners.
See [browser-results.json](browser-results.json) for the complete test list and
retained state/performance attachments.
