# NW-001B gameplay integration

Shared foundation: `d0146399c89c172933ef32981551800ce35fa682`.
Branch base: `0e6156b051926afcefa2d0b24fce7ae1dd2864d9` (PR #1 merge on main).

This implementation changes only gameplay/entity/physics paths and dedicated
NW-001B tests. It consumes the existing shared contracts; it does not supply a
hospital, alter the entry point, or modify the shared engine.

## Assembly and ownership

`gameplay.module.ts` default-exports `createGameplayModule()`. Existing Vite
module discovery registers it as `night-ward:gameplay`, kind `gameplay`. Its setup
runs after the world is published and constructs one owned physics adapter,
player, navigation provider, interaction/hiding system, entity system, model
binding nodes, and browser input/HUD. The instance publishes the actual
`PlayerProvider` through the shared `ModuleInstance.player` field.

If no world is registered, the module is inert and the foundation fixture still
boots. No test geometry is injected into production. With a world present, an
obstructed or unsupported player spawn fails setup and rolls back owned resources.
Do not register an additional adapter for the same world collider declarations.

`fixedUpdate` processes player motion/noise, queued E requests, doors/hiding, then
AI. The foundation engine alone steps Rapier afterward. `update` presents the
camera, entity nodes and DOM prompt. AI deadlines, noise/chase/capture timestamps
and hiding transitions all use the fixed simulation clock. Disposal reverses
setup, unsubscribes listeners, removes model binding nodes/HUD and only deletes
physics objects owned by this runtime. Factories clean up partial startup failures.

No weapons, attacks, damage or enemy health systems are present.

## Controls and behavior

- Click **Enter ward** or the canvas for pointer lock and gesture audio unlock.
- Mouse: look; WASD: move; Shift: sprint; Ctrl: hold crouch; C: toggle crouch.
- E: perform the available prompt; Escape: release pointer lock.
- Input clears on unlock, blur or hidden document. Releasing the mouse does not
  pause entity simulation; the foundation pauses its loop when the tab is hidden.

Movement uses acceleration/deceleration, normalized diagonal input, gravity and
swept upright capsules with a 3 mm contact skin. Standing is refused under a
ceiling. Camera height eases between stances and is constrained by overhead
clearance; look has no head bob or roll. Only actual grounded travel emits footsteps.

Interactions use the nearest visible Three.js surface, ancestor marker resolution,
eye-to-surface range, and a second physical line-of-sight check. `interaction:request`
notifications are queued and revalidated on a fixed tick. Missing requirements
fail closed. Drawers/cabinets emit inspect outcomes; no inventory or fabricated
contents are added. Door motions update the world-space hinge visual and all
linked kinematic colliders together, check occupancy, subdivide angular/linear
motion, stop on obstruction, and allow reversal. Locked markers remain locked;
there is no lock/inventory progression implementation.

Hiding requires a clear capsule corridor, supported anchor, eye line of sight,
and a free spot. Its authored furniture collider IDs alone may be ignored for
entry into the furniture envelope. The player controller prevents motion while concealed, but its capsule remains
reserved against other actors and moving doors. Occupancy remains explicit and
doors sharing those furniture collider IDs cannot move.
Entry records the entities that actually witnessed it. Exit validates candidate
positions, support, corridor and other actors. If every candidate is blocked, the
player stays concealed. Movement is restricted through entering/hidden/exiting
states while the camera blends. The authored hidden camera and furniture interior
must be suitable for the world team's visual model.

## Patient and secondary support

The Patient runs a reusable FSM: idle, patrol, investigate, pursue, lost-target,
search and return-to-patrol. Vision uses distance, 3D FOV, physical occlusion and
detection dwell. Sound is bounded, copied at publication, attenuated by obstruction,
and rejected if stale, future-dated or from another player. Perception uses
authoritative feet/stance data, never a delayed render-camera location.

Only observations update last-known position. Pursuit follows live navigation
waypoints and swept character motion, with no direct-through-wall fallback.
Losing sight ends a chase, searches known space and recovers toward patrol.
Witnessed entry permits investigation of that specific spot, with expiring memory;
reachability and proximity are required before inspecting/capturing there.
Capture requires both a grace period and sustained proximity/visibility. Capture
settles every active entity's chase exactly once. Capture is a terminal state in
this runtime; reload/recreate the scene to begin a new attempt.

Defaults: Patient patrol 0.75 m/s, pursuit 4.1 m/s, vision 13 m, detection 0.45 s,
lose-sight 1.25 s, capture grace 1.2 s and dwell 0.6 s. Profiles configure these.
The Nurse has increased hearing sensitivity; the Crawler has a low capsule and
clearance; the Watcher moves only when outside the player's unobstructed view.
These are reusable secondary behavior profiles/rules, not finished secondary
encounters. The Reflection is a nonphysical, explicitly triggered visual-event
controller and creates no collider or autonomous pursuer.

## World metadata and presentation

Supply the existing `HospitalWorld` arrays, even when empty. Units are metres,
seconds and radians, +Y up and forward -Z. Player/entity spawn positions are feet.
All solid gameplay geometry must be declared in `world.colliders`. Invisible
colliders can block interaction; geometry absent from those declarations cannot
block physics/navigation. Sensor colliders do not block movement or vision.

Door objects must have hinge origins and be included as the same marker object
in `interactables` and `doors`. Collider poses represent the authored **initial**
door state: open/closing starts at `openPose`, other states at `closedPose`.
Collider offsets are transformed relative to that hinge. Use kinematic door
colliders, practical leaf thickness and unscaled moving hinges. Envelopes assigned
to hiding spots should not include unrelated walls/floors. Supply clear, supported
exit candidates and unobstructed camera paths; blocked exits are deliberately refused.

Entity spawns choose the shared entity type and optionally a patrol route ID.
Reflection spawns never create a physical actor. Runtime model binding nodes are
created in the shared scene as `night-ward:entity:<entityId>`, under
`night-ward:entities`. They follow feet positions and travel direction and expose
`userData.entityId`, `entityType`, and `behaviourState`. An atmosphere module, which
starts after gameplay, can find these nodes and attach its models without editing
gameplay. It must dispose its model resources on teardown. Nodes have no finished
mesh, animation or audio; invisible pursuers must not be shipped without model binding.

Existing `chase:started`, `chase:ended`, `player:captured`, `entity:state`,
`player:noise`, `door:state`, `hiding:state`, and `interaction:completed` events are
used unchanged. Atmosphere/horror modules can subscribe to trigger their local
lighting/audio/scares. Match chase events by `chaseId`. Reflection emits
`horror:reflection`. No paid API or external runtime service is used.

## Public factories and interfaces

The canonical field-level signatures are in the indicated source files. These
barrel exports are the supported owned APIs; all share types from `src/contracts`.

### `src/gameplay/index.ts`

```ts
createGameplayModule(options?: GameplayOptions): GameModule
createGameplayRuntime(context: ModuleContext, options?: GameplayOptions): GameplayRuntime
createPlayerController(options: PlayerControllerOptions): PlayerController
createBrowserInput(options: BrowserInputOptions): BrowserInput
createInteractionSystem(options: InteractionOptions): InteractionSystem
createHidingSystem(options: HidingOptions): HidingSystem
```

- `GameplayOptions`: `playerId?`, `playerRadius?`, `playerConfig?`, `entityProfiles?`,
  `navigation?`, injectable `input?`, `attachControls?`, `showHud?`, `hasRequirement?`.
- `GameplayRuntime`: `player`, `physics`, `interactions`, `entities`, `presentation`,
  `fixedUpdate(frame)`, `update(frame)`, `dispose()`.
- `PlayerController`: `body`, `getSnapshot()`, `fixedUpdate(frame,input)`,
  `update(frame)`, `look(dx,dy)`, `setViewRotation(rotation)`, `setCaptured(bool)`,
  `setHiding(state,spotId,cameraPose?)`, `dispose()`.
- `PlayerInput`: `{forward:number; right:number; sprint:boolean; crouch:boolean}`;
  forward +1 is W. `BrowserInput` adds `locked`, `read()`, `dispose()`.
- `InteractionSystem`: `hiding`, `getPrompt()`, `interact(timeSeconds)`,
  `fixedUpdate(frame)`, `getDoorState(id)`, `dispose()`.
- `InteractionPrompt`: `{targetId; action; text; available; reason?}`.
- `HidingSystem`: `enter(spotId,timeSeconds)`, `exit(timeSeconds)`,
  `fixedUpdate(frame)`, `getOccupancy(spotId)`, `dispose()`.
- `DEFAULT_PLAYER_CONFIG` and `PlayerConfig` expose speeds, acceleration,
  deceleration, gravity, terminal velocity, stance/eye dimensions, sensitivity,
  pitch limit, camera sharpness and footstep distance. Options/interfaces live in
  `runtime.ts`, `player.ts`, `input.ts`, `interactions.ts` and `hiding.ts`.

Use `HidingSystem` only after validating interaction range/requirements; the
higher-level `InteractionSystem` performs that validation. `setPosition` and
player state setters are trusted orchestration APIs, not user input handlers.

### `src/physics/index.ts`

```ts
createPhysicsAdapter(world: RAPIER.World, definitions: readonly ColliderDefinition[]): PhysicsAdapter
createNavigationProvider(physics: PhysicsAdapter, bounds: Bounds3, options?: NavigationOptions): NavigationProvider
```

`PhysicsAdapter`: `createCharacter({position,radius,height})`,
`isPositionFree(position,radius,height,ignoreIds?,includeCharacters?)`,
`isSegmentFree(from,to,radius,height,ignoreIds?,includeCharacters?)`,
`hasLineOfSight(from,to,ignoreIds?)`, `findGround(origin,maxDrop?)`,
`hasSupport(feet,radius,maxDrop?)`, `getColliderPose(id)`,
`trySetColliderPoses([{id,pose}])`, `dispose()`.

`CharacterBody`: `radius`, `height`, `getPosition()`,
`move(displacement): {position,grounded}`, `canOccupy(position,height?,ignoreIds?)`,
`setHeight(height): boolean`, `setPosition(position)`, `setEnabled(bool)`, `dispose()`.
Only call `setPosition` after validating destination and any transition corridor.
Position/segment queries include actors by default; LOS excludes actors and sensors.
Navigation ignores actors during planning; movement resolves them physically.

### `src/entities/index.ts`

```ts
createEntitySystem(options: EntitySystemOptions): EntitySystem
createEntityAgent(options: EntityAgentOptions): EntityAgent
resolveEntityProfile(type: EntityType, overrides?: Partial<EntityProfile>): EntityProfile
createStateMachine<State extends string>(initial: State, onTransition?): StateMachine<State>
canSeePlayer(options: VisionOptions): boolean
canHearNoise(options: HearingOptions): boolean
isObserverSeenByPlayer(options: ObservationOptions): boolean
createReflectionEncounterController(events: GameEvents): ReflectionEncounterController
createEntityPresentation(scene: Scene, source: Pick<EntitySystem, 'getSnapshots'>): EntityPresentation
```

`EntitySystem`: `reflections`, `fixedUpdate(frame)`, `getSnapshots()`,
`witnessesFor(spot)`, `dispose()`. Options supply world, physics, navigation, player,
events, optional per-type profile overrides and authoritative `playerEyeHeights`.
`EntityAgent`: `fixedUpdate(frame,noises?)`, `getSnapshot()`, `witnessesEntry()`,
`observeHiding(event)`, `stop(reason?)`, `dispose()`.
`ENTITY_PROFILES` contains Patient/Nurse/Crawler/Watcher/Reflection profiles.
`ReflectionEncounterController`: `show(anchorId,durationSeconds,timeSeconds): string`,
`hide()`, `fixedUpdate(frame)`, `dispose()`.
`EntityPresentation`: `getObject(entityId)`, `update()`, `dispose()`.

## Verification and remaining integration

Run the existing scripts without changing shared configuration:

```sh
npm run typecheck
npm test
npm run build
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser
```

The dedicated browser test uses `/tests/gameplay/harness.html` through the Vite
**development** server. It is intentionally excluded from the production entry.
For manual checking run `npm run dev` and open that path. Isolated geometry proves
controls, movement collision, door prompts/motion, concealment and safe exit.
Node tests additionally exercise actual Rapier geometry, navigation, perception,
FSM transitions, sound copying, witness memory, chase/capture lifecycle, multiple
pursuers and full GameModule startup/rollback/disposal.

Known limits:

- Navigation is bounded A* on a single flat floor layer per query. It refuses
  stairs, overlapping floors, unsupported gaps and over-budget queries; there
  is no floor-connection graph, autostep or navmesh implementation yet.
- Queries scan owned Rapier shapes for immediate correctness before the engine
  step. Cost is linear in collider count per query; large hospital layouts need
  profiling/spatial indexing and navigation budget tuning (`cellSize`, `maxNodes`).
- Doors use small angular/linear subdivisions, not a general nonlinear rotational
  CCD solver. Extremely thin/large/fast leaves need authored integration tests.
- Hiding camera/furniture interiors, actual hospital collider alignment, entity
  model/animation/audio binding and hardware/cross-browser performance remain
  integration work. This branch does not inspect or validate Claude's world.
- Secondary profiles/interfaces are implemented; finished secondary encounter
  content, inventory/lock progression, saving and restart orchestration are not.

Verified on 2026-11-07 with Node 24 and headless Chromium: `npm run typecheck`,
`npm test` (105 passing tests, including 67 dedicated NW-001B tests), and
`npm run build`. All four browser tests passed (two foundation and two gameplay);
the two gameplay tests were rerun after the final hiding occupancy change and
passed again. Screenshots of movement, door prompts and concealment were visually
inspected. Browser checks used isolated test geometry and software WebGL, not the
hospital or finished entity assets. Production build retains the foundation's
Rapier compatibility/WASM large-chunk warning.
