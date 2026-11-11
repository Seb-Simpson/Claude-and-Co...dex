# Evidence provenance

`baseline-failure/` records the deliberately failing regression on verified baseline `0097264bf07a21b22ca7b5b1ac14ddaff951a046`, before the runtime fix: failed later asset retrieval produced a ready legacy world without the canonical room/station/card.

`retry-exploration/automation-pause-race.md` records the first five-cycle run's subsequent automation failure: it requested pointer-lock exit before waiting for the playing state. All five preceding retries passed their object/state assertions, but that whole test run is recorded as failed. The test now waits for playing before requesting pause; only its successful rerun counts as a pass.

Final screenshots/telemetry and their exact commands are indexed in `../REPORT.md` when verified. These are automated Chromium observations, not independent human playtesting. SwiftShader cannot establish real-GPU performance.
