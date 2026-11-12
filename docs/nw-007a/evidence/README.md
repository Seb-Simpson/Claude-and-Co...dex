# Evidence provenance

`baseline-failure/` records the deliberately failing regression on verified baseline `0097264bf07a21b22ca7b5b1ac14ddaff951a046`, before the runtime fix: failed later asset retrieval produced a ready legacy world without the canonical room/station/card.

`retry-exploration/automation-pause-race.md` records the first five-cycle run's subsequent automation failure: it requested pointer-lock exit before waiting for the playing state. All five preceding retries passed their object/state assertions, but that whole test run is recorded as failed. The test now waits for playing before requesting pause; only its successful rerun counts as a pass.

Final screenshots/telemetry and their exact commands are indexed in `../REPORT.md` when verified. These are automated Chromium observations, not independent human playtesting. SwiftShader cannot establish real-GPU performance.

`final-route-attempt/` preserves later failed automation attempts: a witnessed entry
was correctly interrupted by capture, and another attempt was captured between a
visible prompt and the delayed input. These do not count as successful walkthroughs.
The final normal route uses the locker and trolley before escape; unseen bed entry is
verified separately instead of assuming it is safe to tour every hiding prop during
an active pursuit. The software-clock timeout was increased without changing any
production simulation or perception timings.

`final-reliability/` contains the current five real capture/UI-retry telemetry,
post-fifth-retry Room 104 screenshot, and the core batch log (four passing
reliability/discovery cases; its earlier backtracking bot route failed and is not
counted as a pass). `unseen-bed/` is the separate real-noise/hidden-search proof.

`final-public/run.log` records all thirteen retained public-game regressions
passing. `cinematic-normal-route/` contains the successful input-only six-scene
walkthrough and silent uncut recording; it includes one genuine capture and public
Retry before escape, plus menu/Continue/New Game assertions. It is automated
SwiftShader evidence, not human playtesting or real-GPU certification. See REPORT.md
for resolution, render scale, frame cadence and the subsequent focused keyboard check.
