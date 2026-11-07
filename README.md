# NIGHT WARD

A first-person 3D browser survival horror project. The player is completely
defenceless. This branch implements **NW-000: shared technical foundation** only.
It renders a neutral test scene and supplies the contracts and lifecycle used by
independently developed world and gameplay modules.

## Run locally

Use Node.js **22.12 or later** and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite in a desktop browser with WebGL2 support.
The **Enable audio** button creates/resumes the browser audio context after a
user gesture. The foundation does not play a demo sound.

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

For browser smoke tests, install Chromium once, then run:

```sh
npx playwright install chromium
npm run test:browser
```

An existing Chromium installation can be selected instead:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser
```

The Playwright suite starts its own Vite server on port 4173 and checks renderer/
Rapier boot, gesture-based audio unlock, canvas resize and WebGL context-loss
reporting/cleanup. These are foundation smoke tests, not gameplay tests.

`npm run build` also runs typecheck. `npm run preview` serves the production
build. `package-lock.json` records the dependency resolution; CI/repeatable
installs can use `npm ci`.

## Shared documentation

- [Architecture and engine lifecycle](docs/ARCHITECTURE.md)
- [Contracts, units and metadata conventions](docs/CONTRACTS.md)
- [Module registration and exact public APIs](docs/INTEGRATION.md)
- [Agent ownership and parallel development](docs/AGENT-OWNERSHIP.md)

Claude owns `src/world/`, `src/atmosphere/` and `src/horror/`. Codex owns
`src/gameplay/`, `src/entities/` and `src/physics/`. Both agents add `*.module.ts`
files under their own paths; neither needs to edit the shared entry point.

The foundation does not implement a hospital, player controller, interactions,
hiding, navigation, entities or chase sequences. Those remain NW-001A/NW-001B
work. Start both branches from the same accepted foundation commit.

## NW-000 verification

Verified with Node 24 and Chromium: `npm install`, `npm run typecheck`,
`npm test` (38 tests), and `npm run build` pass. The two Playwright smoke tests
pass against both the development server and the production preview. They
exercise real WebGL2 rendering and Rapier initialization, gesture audio unlock,
canvas resizing, and visible context-loss handling with cleanup. The neutral
scene screenshot was also visually inspected.

To smoke-test the production output after building:

```sh
PLAYWRIGHT_PREVIEW=1 npm run test:browser
```

The browser checks use software WebGL in headless Chromium; they do not establish
hardware performance or cross-browser compatibility. The Rapier compatibility
bundle includes WASM and produces Vite's large-chunk warning (about 2.24 MB
minified, 830 kB gzipped); it is loaded separately from the entry chunk. Future
hospital/gameplay integration still needs its own collision, navigation, input,
perception and chase verification.
