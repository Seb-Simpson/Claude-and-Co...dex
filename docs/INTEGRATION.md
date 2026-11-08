# Integration

`src/main.ts` assembles the game using the APIs below. World and gameplay agents
register through files in their owned directories; no entry-point edits are
needed.

## Automatic module registration

Create a recursive `*.module.ts` file in one of these directories:

- `src/world/`
- `src/physics/`
- `src/gameplay/`
- `src/entities/`
- `src/atmosphere/`
- `src/horror/`

Each file default-exports a `GameModule`. Discovery is eager at build/dev-server
load time and sorts file paths. Keep module imports free of side effects:
resource allocation belongs in `setup()`, not top-level code. Non-module helper
files are not automatically registered.

The registry then orders setup by **world → physics → gameplay → entities →
atmosphere → horror**, preserving registration order within each phase. The
engine has initialized Rapier before setup begins. Physics modules can read the
published world collider declarations; gameplay sees world/physics setup, and
later modules can see the player provider.

Only one `world` and one `gameplay` module may register. Other phases may contain
multiple modules with unique IDs. Register every module before `start()`; the
registry is a single-use startup transaction and cannot be restarted.

### Minimal world registration example

This complete example publishes empty metadata to demonstrate the contract. It
is not a hospital implementation. Add geometry, meaningful bounds and metadata
inside the world owner's implementation.

```ts
// src/world/example.module.ts
import { Group } from 'three';
import type { GameModule, HospitalWorld } from '../contracts';

export default {
  id: 'example:world',
  kind: 'world',
  setup() {
    const world: HospitalWorld = {
      id: 'example:world-data',
      root: new Group(),
      bounds: {
        min: { x: -5, y: -1, z: -5 },
        max: { x: 5, y: 5, z: 5 },
      },
      rooms: [],
      colliders: [],
      interactables: [],
      doors: [],
      hidingLocations: [],
      entitySpawns: [],
      patrolRoutes: [],
      playerSpawn: { position: { x: 0, y: 0, z: 0 }, yaw: 0 },
    };
    return {
      world,
      dispose() {
        // Dispose any geometry, materials and textures created by this module.
      },
    };
  },
} satisfies GameModule;
```

The registry validates and attaches `world.root` to the scene and detaches it on
teardown. Do not attach it separately. A world module must return a world.

### Minimal gameplay registration example

This example reads the already-published world. It intentionally creates no
player controller; NW-001B will implement and publish its `PlayerProvider`.

```ts
// src/gameplay/example.module.ts
import type { GameModule } from '../contracts';

export default {
  id: 'example:gameplay',
  kind: 'gameplay',
  setup(context) {
    const world = context.world;
    if (!world) throw new Error('Gameplay requires a world module.');
    console.info('Gameplay can consume spawn metadata:', world.playerSpawn);
    return {
      dispose() {
        // Release this module's player/physics/listeners when implemented.
      },
    };
  },
} satisfies GameModule;
```

A real gameplay instance returns `{ player, fixedUpdate, update, dispose }` with
`player: PlayerProvider`. Only a `gameplay` module may publish a player. Only a
`world` module may publish world data. Consumers should keep the supplied
`context` if they need a provider published later: `context.world` and
`context.player` are live getters. Destructuring those values in an early setup
phase captures their current values, which may be null.

## Typed events

Modules receive a scoped `context.events` with the `GameEvents` interface:

```ts
const unsubscribe = context.events.on('chase:started', (event) => {
  context.events.emit('atmosphere:lighting', {
    targetId: 'ward-a:lights',
    effect: 'flicker',
    durationSeconds: 2,
  });
  console.info('Chase started:', event.chaseId);
});
// The module may release this early; the registry also releases it on teardown.
unsubscribe();
```

Events dispatch synchronously to a snapshot of listeners in subscription order.
Subscriptions added during an emission begin with the next emission; removing a
listener during emission does not alter that emission's snapshot. Every listener
is attempted; if any throws, `emit()` throws an `AggregateError` afterward. This
keeps failures visible without preventing other listeners from running.

Payloads are notifications, not commands implemented by the bus. In particular,
`interaction:request` still needs a gameplay handler to validate and execute it.
Publishers own their state changes and payload validity. Modules must not mutate
shared event payloads or assume a previous event will be replayed for a listener
registered later. Read current provider state for initial synchronization.

Module subscriptions are automatically removed after disposal and after failed
setup. Scoped `on()`/`emit()` reject use after that module's scope is disposed.
Non-event resources still require explicit cleanup.

## Exact public APIs

### Engine — `src/engine/index.ts`

| Export | Public signature |
| --- | --- |
| `createEngine` | `(options: EngineOptions): Promise<Engine>` |
| `EngineOptions` | `{ container: HTMLElement; maxPixelRatio?: number; onError?: (error: unknown) => void }` |
| `EngineHooks` | `{ fixedUpdate?(frame: FrameContext): void; update?(frame: FrameContext): void }` |
| `Engine` | `readonly services: EngineServices; start(hooks: EngineHooks): void; stop(): void; resize(): void; dispose(): Promise<void>` |
| `createAudioService` | `(): AudioService` |
| `createNeutralScene` | `(engine: EngineServices): { dispose(): void }` |
| `FrameClock` | `new (fixedDeltaSeconds = 1/60, maxDeltaSeconds = 0.1, maxSubsteps = 5); reset(): void; tick(milliseconds: number): FrameStep` |
| `FrameStep` | `{ deltaSeconds: number; elapsedSeconds: number; fixedSteps: readonly { deltaSeconds: number; elapsedSeconds: number }[] }` |

Call engine `start()` once per running interval; calling it while running or
after disposal throws. `stop()` preserves elapsed simulation time and resets
pause timing; calling `start()` later resumes with a fresh timestamp. Disposal
is idempotent. Dispose modules before the engine to keep their physics and GPU
resources valid during cleanup. `AudioService.resume()` must be called from a
user gesture; `context` remains null until first use.

### Integration — `src/integration/index.ts`

| Export | Public signature |
| --- | --- |
| `createEventBus` | `(): EventBus` |
| `EventBus` | Concrete `GameEvents` plus `clear(): void; dispose(): void` |
| `createModuleRegistry` | `(engine: EngineServices, events: GameEvents): ModuleRegistry` |
| `ModuleRegistry` | Read-only `state`, `world: HospitalWorld \| null`, `player: PlayerProvider \| null`; `register(module: GameModule): void; start(): Promise<void>; fixedUpdate(frame: FrameContext): void; update(frame: FrameContext): void; dispose(): Promise<void>` |
| `discoverModules` | `(): GameModule[]`; Vite-only discovery of default exports |
| `validateWorld` | `(world: HospitalWorld): void`; throws on invalid metadata before mounting |

The concrete integration `EventBus` should be imported by that name only when
its `clear()`/`dispose()` methods are needed. The generic contract
`EventBus<Events>` is a separate type with the `on()`/`emit()` boundary.

Registry `state` is `collecting`, `starting`, `running`, `disposing`, `disposed`
or `failed`. `start()` is asynchronous and rolls back all completed instances
if any module fails. Rollback and teardown attempt every disposer in reverse
setup order, collecting cleanup failures into `AggregateError`. If disposal is
requested while setup is in progress, it waits for setup to settle, then tears
down the result; arbitrary async module code cannot be cancelled safely.

`fixedUpdate()` and `update()` are no-ops outside `running`. Hook errors propagate
to the caller; the engine stops its frame loop and reports the failure. Registry
disposal is idempotent. Event-bus disposal is also idempotent; subsequent
`on()`/`emit()`/`clear()` calls throw. The composition root owns the bus and
disposes it after module teardown.

## Final assembly

Use `fixedUpdate(frame)` as the authoritative clock for game state, physics, AI
cooldowns and noise/chase/capture event `timeSeconds`. Use `update(frame)` for
presentation. Their elapsed values can diverge after dropped fixed steps; do not
compare timestamps between them. Reset excludes the pause gap from both clocks
while preserving accumulated elapsed time.

The coordinator integrates world and gameplay feature branches based on the
same foundation commit. No new imports in `main.ts` are required when their
`*.module.ts` files are present. The neutral scene is used only while no world
is published; it is not injected into a registered hospital world.

Validate the assembled project with:

```sh
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

Run the automated browser foundation checks separately:

```sh
npx playwright install chromium
npm run test:browser
```

Use `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser`
instead when Chromium is already installed there. The suite starts its own Vite
server on port 4173, which must be free. Tests exercise actual WebGL2/Rapier
startup, audio unlock, responsive canvas sizing and context-loss error cleanup.
Software WebGL is used in headless Chromium; these checks do not establish GPU
performance or future gameplay behavior.

Then exercise the assembled game in a desktop browser: world visibility,
collider alignment, player spawn, camera ownership, interaction range, safe
hiding exits, obstacle-aware navigation, credible perception and chase recovery
need integration verification in NW-001A/NW-001B. Foundation contract tests alone
cannot establish those future gameplay properties.


## NW-002A assembled game

The registered world, atmosphere, horror and gameplay modules now run together.
The application host recreates their registry/event bus on capture restart against
one shared engine. Hospital gameplay enables The Patient with a 0.25m navigation
grid and safe proximity door operation. The merged NW-002B presenter attaches the
Patient body automatically and owns chase audio/lighting; the integration adapter
supplies contextual messages without duplicate effects. A temporary model remains
available when the presentation module is absent. See
[NW-002A.md](NW-002A.md) for exact application APIs, test setup, launch instructions
and final-asset integration. No hospital implementation edits are required.
