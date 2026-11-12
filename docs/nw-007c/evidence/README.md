# Evidence provenance

`pre-repair/` is the completed six-case asset/reliability run on the initial B pin `dbebd30` (6 passed in 18.3 minutes). `director-fixture/` is an earlier integrated clip-clock probe on that same asset. Their broken-head images are deliberately retained as before evidence. They are not evidence for the repaired model.

`unit.log` and `build.log` are the final repaired-model unit (627 passed / one optional skip) and build logs. `repaired-assets/` is the completed seven-case run on B pin `ec4ed99` plus the capture-ownership/clock integration fixes. Head and staging preview actors are distinguished from `director/`, which verifies the sole actual gameplay actor. The full input-only public route is recorded separately.

The first public regression run was interrupted before any case completed when the PR #22 head check found the repair. It contributes no passing scenarios. All browser runs use software-rendered Chromium, not real GPU or human testing. The assisted fixture may place only the player for diagnostic inspection; the full normal-route recording is a separate keyboard/mouse walkthrough.
