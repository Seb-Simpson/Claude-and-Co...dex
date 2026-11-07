# Agent ownership

Both implementation branches must start from the same accepted NW-000 foundation
commit. Record that full commit in each task handoff; do not create independent
scaffolds or copy another branch's engine files.

| Owner | Editable application paths | Responsibility |
| --- | --- | --- |
| Shared architecture / integration coordinator | `src/contracts/`, `src/engine/`, `src/integration/`, `src/main.ts`, shared configuration | Stable contracts, engine lifecycle, assembly, dependency changes |
| Claude Code — NW-001A | `src/world/`, `src/atmosphere/`, `src/horror/` | Hospital geometry, room metadata, visual objects, lighting, atmosphere, visual horror |
| Codex — NW-001B | `src/gameplay/`, `src/entities/`, `src/physics/` | Player control, collision adapters, interaction, hiding, navigation, perception, entity behavior, chase mechanics |

Each agent may add dedicated tests for its own modules. Keep those tests in its
owned directory (`*.test.ts`) or clearly named task-specific test files under
`tests/`. The foundation tests under `tests/foundation/` are shared infrastructure.
Root documentation and package/configuration changes belong to the coordinator.

## Working in parallel

1. Read `docs/CONTRACTS.md` and `docs/INTEGRATION.md` before implementation.
2. Add one or more default-exported `GameModule` values in `*.module.ts` files
   inside your own directories. Discovery connects these modules without editing
   `src/main.ts` or another agent's files.
3. Import shared interfaces from `src/contracts/index.ts`; use the provided
   context and typed events to communicate. Do not import another owner's private
   implementation files.
4. Treat world metadata as world-space declarations. Claude publishes geometry
   and markers; Codex consumes them and creates gameplay/physics behavior.
5. Request a coordinated contract extension when a necessary shared type is
   missing. Agree the change before either implementation depends on it. Do not
   independently change shared interfaces on two feature branches.
6. Run typecheck, tests and production build before handing off your branch.
   Report integration assumptions and anything that has not been exercised in a
   browser.
7. The coordinator assembles the implementation branches against the accepted
   foundation, resolves any shared changes, and validates the combined game.

No agent needs to edit another agent's files to register a module. Importing a
`*.module.ts` file must only declare a module: allocate runtime resources in
`setup()`, and release them in `dispose()`.

## Product boundaries

NIGHT WARD is a first-person, completely defenceless survival horror game.
Walking, sprinting, crouching, hiding and interaction are supported by contracts.
Weapons, attacks, combat and enemy health systems are outside the architecture.
The Patient is the main antagonist. The Nurse, The Crawler, The Watcher and The
Reflection share the entity vocabulary; their presence in contracts does not
mean their behaviors have been implemented.

NW-000 contains no hospital, player controller, enemy behavior, interaction
implementation, navigation implementation or chase sequence. Its neutral scene
is only an engine smoke test.
