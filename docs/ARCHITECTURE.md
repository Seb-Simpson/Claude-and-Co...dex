# Architecture

NIGHT WARD uses Vite, strict TypeScript, Three.js, Rapier 3D, the browser Web Audio
API and CSS overlays. Vitest exercises the foundation without requiring a GPU.
Running the game requires no paid API, account or external runtime service.
Dependencies are installed locally using npm and a committed lockfile.

## Boot sequence

`index.html` loads `src/main.ts` and declares an explicit empty data-URL favicon
so browsers do not request a missing `/favicon.ico`. The entry point discovers agent modules. The application host creates one engine and a registry/event bus per attempt, then starts the render loop. Restart replaces the module session after reverse teardown while retaining the single engine. If
there is no world module, the engine displays a small neutral test scene. This
scene proves that rendering works; it is not part of the hospital.

The engine owns the WebGL renderer, scene, perspective camera, Rapier world,
resize/visibility listeners, animation loop and lazy Web Audio service. The
registry owns module setup/update/teardown order and the published world/player
references. Each module owns the resources it creates.

A frame follows this order:

1. Accumulate a clamped frame delta.
2. For each fixed step: call module `fixedUpdate()`, then step Rapier.
3. Call module `update()` once with the variable frame delta.
4. Render the scene through the shared camera.

Physics uses a fixed 1/60-second step. The engine caps frame delta at 0.1 seconds
and performs at most five fixed steps per rendered frame. Excess backlog is
dropped to avoid a catch-up spiral after a stalled tab. Visibility changes reset
timing so restoring a background tab does not advance a large physics interval.

`fixedUpdate()` receives the authoritative simulation clock. All gameplay state,
AI cooldowns and `timeSeconds` in noise/chase/capture events must use this fixed
clock. `update()` receives clamped render time and is for presentation only. The
two elapsed clocks may diverge when excess fixed-step backlog is dropped; do not
compare timestamps from different domains. A clock reset removes the pause gap
from both clocks while preserving their accumulated elapsed values.

Rendering resizes with its container and uses a device pixel ratio capped at 2
by default. `maxPixelRatio` lets integrators lower the cap for weaker devices.
The engine does not add head bob, camera shake, first-person movement or other
gameplay effects.

## Dependency direction

- `src/contracts/` contains shared types and declarative data. It depends on
  library types, not on engine or agent implementation files.
- `src/engine/` implements rendering, timing, physics ownership and browser audio
  lifecycle.
- `src/integration/` implements typed events, module registration and lifecycle.
- Agent modules depend on contracts and the services supplied to `setup()`.
- `src/main.ts` is the shared composition root; agents do not edit it.

The world module publishes a `HospitalWorld`. The registry adds its `root` to the
scene. Gameplay can then read the world through the context and publish a
`PlayerProvider`; later entity, atmosphere and horror modules can read both.
Cross-module notifications use the typed event bus. Neither agent needs to
import the other's implementation.

## Resource ownership and failures

Allocate browser and physics resources during `setup()`, not at module import.
If setup fails before returning its instance, the failing module must clean up
its partially created resources. The registry rolls back instances whose setup
completed and removes their subscriptions. Normal teardown runs in reverse
setup order so consumers release their references before providers disappear.

Removing a Three.js object from the scene does not free its geometry, materials
or textures. Modules dispose those resources explicitly, remove their Rapier
bodies/colliders, cancel their own timers and DOM listeners, and release other
owned resources in `dispose()`. The registry detaches the world root; the engine
frees the shared Rapier world and renderer only after modules are disposed.

Audio is lazy: an explicit user gesture creates/resumes the `AudioContext`.
Importing the app does not play sound or bypass browser autoplay rules. The
foundation audio service supplies lifecycle management, not a sound library.

Startup/rendering errors are surfaced in the application overlay. Integrators
must not silently swallow module failures and continue a partially assembled
game. See the public lifecycle APIs and event error policy in
[INTEGRATION.md](INTEGRATION.md).

## Scope and future integration

The foundation creates an empty Rapier world but does not translate world
collider declarations into physics objects. NW-001B supplies that adapter. It
also supplies movement, collision response, interactions, hiding, entity
perception/navigation and chase behavior. NW-001A supplies the hospital,
atmosphere and horror presentation.

World metadata, collision definitions, interaction markers and event payloads
are the shared boundary. Their conventions are specified in
[CONTRACTS.md](CONTRACTS.md). Path ownership and the parallel branch workflow are
specified in [AGENT-OWNERSHIP.md](AGENT-OWNERSHIP.md).

## Browser smoke tests

`npm run test:browser` uses the committed Playwright configuration and
`tests/browser/foundation.spec.ts`. Run `npx playwright install chromium` once,
or select an installed executable with
`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium`. The suite owns a Vite dev
server on port 4173, uses headless Chromium with software WebGL, and captures
screenshots. It exercises actual renderer/Rapier startup, audio unlock, resizing
and context-loss cleanup. This does not measure hardware GPU performance or
validate future world/gameplay modules.


NW-002A implements the assembled hospital game, capture/restart and Patient encounter.
See [NW-002A.md](NW-002A.md) for the current session lifecycle, diagnostics, verified
world compatibility and NW-002B model handoff. Earlier foundation-only scope notes
describe NW-000; the actual hospital is now installed.
