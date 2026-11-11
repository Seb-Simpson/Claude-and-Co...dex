# NW-006B evidence

All new evidence uses the PR20 environment pinned at0f4f0f30292361c9b1b040b2a8d365566a686491. No independent human playtest or real-GPU benchmark is claimed.

- `normal-route/`: final-revision fresh menu/Room104 → authored station phases → real bed hiding → actual AI alert/pursuit → exit and Continue. Teleport/direct-aim helpers throw. Semantic/navigation data is read-only; player movement and look use input. Software rendering uses test-only pixel ratio0.25. The silent uninterrupted video is re-encoded at8fps without cuts or speed changes; recording.json records its duration. Immediate route screenshots can contain a preceding WebGL frame; use native-low for visual review.
- `capture-retry/`: production Continue with a saved-stealth milestone fixture, actual AI capture after first-alert grace, real restart-button recovery and before/after lifecycle data. No forced-capture or phase-advance helper.
- `native-low/`: saved-tension checkpoint, input-driven approach to the trolley, a rendered-frame wait and shipping Low0.75 screenshot. Pause/menu restart preserves the correct phase. No render override or teleport.
- `regressions/`: existing opening/menu/engine scenarios on the production build, including actual-root startup without a QA bridge, resize and handled context loss.
- `environment-regression/`: selected views from the unchanged NW006A development-server asset test. Its camera placements are assisted visual QA, not a stealth playthrough. Full13-view assertions and keyboard station traversal passed.

Commands, superseded failures, limitations and the distinction between authored exit and autonomous perception escape are in [the report](../REPORT.md). Game art/audio are existing project assets; only the recordings, screenshots and telemetry here were generated for this task.
