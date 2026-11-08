# Actual game performance soak

Build the application, then run:

```sh
npm run build
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium node tests/performance/night-ward-soak.mjs --width=320 --height=180 --output=.playwright/soak
```

The harness starts a production preview on port 4181. Pass `--url=http://127.0.0.1:PORT/` to use an existing server instead. It uses the real application and opt-in `?test=1` diagnostics, not the isolated gameplay fixture. The current build must expose `performance.simulatedSeconds` and raw engine timing diagnostics.

The default viewport is 320×180 for a software-rendered stability check, not a desktop GPU benchmark. The default run lasts at least five measured wall-clock minutes **and** 120 actual simulation seconds, and waits for The Patient to operate the east maintenance door. It first walks from Room 104 into Room 103 with real WASD/E controls, then closes Room 104 through E and compares early/late at an identical quiet pose while AI continues running. Initial scenario positioning and later pose normalization use the QA bridge; the walk uses player controls.

Output includes raw RAF gaps, bounded engine timing summaries, CDP heap/listener/DOM/process metrics, renderer/collider counts, CDP WebAudio native node lifecycle counts, active scheduled source counts, 15-second early/late CPU profiles, screenshots, and incremental observations. It finishes with a diagnostic-only draw-suppression comparison and a capture/restart/disposal check. Draw suppression is never used during the real soak.

The assertions detect relative frame-rate collapse, resource growth, retained heap growth, active audio accumulation, capture/error interruption, failure to advance simulation, and incomplete disposal. A baseline below 5 FPS is reported as a software-rendering limitation rather than a native-GPU performance claim. The lower resolution reduces SwiftShader raster cost so navigation can reach the timed regression; ordinary browser functional/screenshot tests retain their desktop viewports. Early and late soak resolution, view, and pixel ratio remain identical.

Audio connection-call balance is diagnostic only: one-shot graphs can expire through native garbage collection without an explicit JavaScript `disconnect()`. Native WebAudio lifecycle events (or CDP `AudioHandlers` fallback) determine the audio node growth assertion. Finite first-visibility uploads have bounded geometry/texture allowances; the browser suite separately checks exact same-pose resources across repeated restarts.

Options use `--name=value`:

- `--width=960 --height=540`: explicitly select a desktop-sized GPU diagnostic viewport; reaching 120 simulation seconds may take much longer under SwiftShader.
- `--seconds=300 --simulation=120`: minimum baseline durations; smaller values are clamped to these minima.
- `--timeout=2400`: maximum measured baseline wall seconds; slow software rendering may need longer than five minutes to reach 120 simulation seconds.
- `--diagnostic-only`: short CPU/RAF and draw-suppression comparison; **does not constitute the full soak**.
- `--analyze=.playwright/NAME/report.json`: re-evaluate recorded observations without launching a browser; writes `corrected-assertions.json` and explicitly labels this an assertion replay, not a new soak.
- `--output=.playwright/NAME`: JSON, `.cpuprofile`, and screenshot directory.

Run with one browser process at a time. The Chromium path may be omitted when it is `/usr/bin/chromium`; this harness intentionally selects software WebGL for reproducible Linux CI diagnostics. Review the generated CPU profiles and native node trends before attributing a failure to an application leak.

Audio disposal means the native context reaches `closed`, the application/backend/canvas/HUD are disposed, and restart reused one running context. It does not require the inspectable closed JavaScript context object to be immediately destroyed, nor every scheduled source to receive an `ended` callback after context closure.
