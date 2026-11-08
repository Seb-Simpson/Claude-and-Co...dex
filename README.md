# NIGHT WARD

A first-person, completely defenceless browser horror game set in Ward 4 West.
This branch integrates the hospital, player controls, hiding, atmosphere and a
physical Patient encounter into the first playable build (NW-002A).

## Launch

Use Node.js 22.12+ and a desktop browser with WebGL2.

```sh
npm install
npm run dev
```

Open the Vite URL and click **Enter ward**. This captures the mouse and unlocks
browser audio. You start in room 104. WASD moves, Shift sprints, Ctrl/C crouches,
E interacts and Escape releases the mouse. There are no weapons or attacks.

Leave room 104 through its open door. The service connector leads to the
maintenance passage; it rejoins the east corridor to form an escape loop. Listen
for The Patient, break its sight around corners, and hide when it has not seen
you enter. Four lockers and two under-bed spots are available. Capture fades the
scene and presents **Restart**, which resets the ward without reloading the page.

For a production build:

```sh
npm run build
npm run preview
```

## Verification

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

An installed Chromium can be selected with
`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium`. The full browser suite owns
port 4173 and serves Vite in development mode because it includes authored
world previews and the isolated gameplay harness. The actual combined game can
also be tested against production output:

```sh
PLAYWRIGHT_PREVIEW=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser -- tests/browser/foundation.spec.ts tests/browser/nw002a-integration.spec.ts
```

Normal play exposes no debug controls. Tests use `/?test=1` to opt into a small
QA bridge for deterministic scenario setup, state snapshots and resource counts.

## Integration notes

- [First playable integration and asset handoff](docs/NW-002A.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Shared contracts](docs/CONTRACTS.md)
- [Module integration](docs/INTEGRATION.md)
- [Ownership](docs/AGENT-OWNERSHIP.md)
- [Gameplay APIs](src/gameplay/README.md)
- [Patient and model replacement APIs](src/entities/README.md)

The Patient currently has a visible temporary model. The secondary entities
remain profiles/framework, not finished encounters. Stairwell B is intentionally
locked; navigation covers this hospital's single-floor loop. Browser automation
uses software WebGL and does not establish hardware or cross-browser performance.
No paid API or external runtime service is required.
