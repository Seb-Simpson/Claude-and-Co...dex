# Entity integration

The first playable session enables The Patient. The Nurse, Crawler and Watcher
remain configurable behaviour profiles, and The Reflection remains a nonphysical
encounter controller. They are not completed secondary encounters.

Public exports are collected in `src/entities/index.ts`:

- `createEntitySystem(options: EntitySystemOptions): EntitySystem` assembles the
  physical actors in `options.world.entitySpawns`. It exposes `fixedUpdate(frame)`,
  `getSnapshots()`, `witnessesFor(spot)`, `reflections`, and `dispose()`.
- `createEntityAgent(options: EntityAgentOptions): EntityAgent` creates one
  perception-driven actor with `fixedUpdate(frame, noises?)`, `getSnapshot()`,
  `witnessesEntry()`, `observeHiding(event)`, `stop(reason?)`, and `dispose()`.
- `createDoorNavigationAdapter(options: DoorNavigationOptions)` returns
  `getDoorApproach(from, goal)` and `openNearbyDoor(from, goal)`. Pass these methods
  into the entity system. Options are `{ world, physics, navigation, agent,
  getDoorState, requestDoorOpen, interactionDistance? }`. The callbacks connect to
  `InteractionSystem.getDoorState` and `requestDoorOpen`.
- `createEntityPresentation(scene, snapshots): EntityPresentation` exposes
  `getObject(entityId)`, `update()`, and `dispose()`.
- `createPatientProxy(): PatientProxy` returns `{ object: Group, dispose() }`.
- `ENTITY_PROFILES`, `resolveEntityProfile`, `createStateMachine`, `canSeePlayer`,
  `canHearNoise`, `isObserverSeenByPlayer`, and
  `createReflectionEncounterController` remain available for custom integration.

Call interactions before entities during each fixed update. Door motion changes
the physical obstacle revision, invalidating navigation's cached clearance. A
blocked route can lead to a physically reachable door approach; the actor then
requests the same swept door animation used by the player. Locked doors stay
locked. There is no wall-crossing movement fallback.

The Patient joins the nearest authored patrol point. It learns player positions
only through vision, a published audible noise, or a witnessed hiding entry.
Capture requires pursuit grace plus sustained reachable proximity. Capture or
disposal settles every active chase. Restart creates a fresh entity system;
there is no hidden teleport or retained target memory across sessions.

## Replacing the temporary model

Find the feet-pose node named `night-ward:entity:<entityId>` (the hospital Patient
is `night-ward:entity:nw:entity:patient`), or call `getObject(entityId)`. Attach the
final model as a direct child. The presentation automatically hides its temporary
Patient silhouette while an external child is attached. A model module may also
set `node.userData.nwEntityModelReady = true` to suppress the proxy explicitly.
Remove that flag and the external child to restore the fallback.

The attaching module owns final model resources. Presentation disposal releases
only its temporary proxy resources and detaches its own hierarchy. The proxy has
six meshes and is a temporary readable silhouette, not the NW-002B final asset.

Navigation currently supports a single flat floor, including the hospital loop.
The hospital integration uses a 0.25m grid to resolve its narrow furniture lanes.
It does not claim stair, multi-storey or arbitrary navmesh traversal.
