# Shared contracts

The public type barrel is `src/contracts/index.ts`. Imports are type-only; the
contracts do not allocate a renderer, physics world, hospital, player or entity.
The tables below name every exported contract. Source declarations are the
canonical field-level signatures.

## Space, time and IDs

| Export | Convention |
| --- | --- |
| `Vec3` | `{ x, y, z }` in metres; right-handed, +Y up, camera forward -Z |
| `Quaternion` | `{ x, y, z, w }`, normalized rotation quaternion |
| `Pose` | World-space `position: Vec3` and `rotation: Quaternion` |
| `Bounds3` | World-space axis-aligned `min` and `max`; min ≤ max on each axis |
| `ViewRotation` | `yaw`, `pitch` in radians; positive yaw turns left about +Y, positive pitch looks up |
| `SpawnPose` | Feet `position: Vec3`, horizontal `yaw` in radians |
| `ObjectId` | Stable string identifier, namespaced by module/area (for example `ward-a:door:03`) |
| `Unsubscribe` | Idempotent `() => void` subscription release handle |

Lengths, radii and speeds use metres and metres/second. Durations and event
`timeSeconds` use seconds. Do not use wall-clock timestamps for simulation
behavior. World metadata is already in world space: bake parent transforms and
scale into declarations. The visual `root` should have an identity transform
when published, and a module must not transform that root later without also
updating its related metadata.

IDs defining objects must be globally unique across a world. References such as
`roomId`, `interactableId` and `colliderIds` point to existing metadata IDs;
those repeated reference values are expected. A spawn
`entityId` names a separate runtime actor identity and must be unique among entity
spawns. Keep the ID stable when the
visual object moves. TypeScript `readonly` prevents accidental writes at compile
time; it is not a runtime freeze. The integration boundary validates world
metadata before mounting it; modules remain responsible for ongoing runtime
state and collision safety.

## World and physics declarations

| Export | Purpose |
| --- | --- |
| `HospitalWorld` | Factory result: `id`, Three.js `root: Group`, `bounds`, `rooms`, `colliders`, `interactables`, `doors`, `hidingLocations`, `entitySpawns`, `patrolRoutes`, `playerSpawn` |
| `RoomMetadata` | `id`, display `name`, world `bounds`, semantic `tags` |
| `ColliderShape` | Discriminated `box`, `sphere`, `capsule` or `trimesh` shape data |
| `ColliderDefinition` | Unique `id`, `shape`, world `pose`, `bodyType` (`fixed` or `kinematic`), `sensor`, optional friction/restitution and room/interactable references |

Box `halfExtents` are half dimensions. Sphere `radius` is positive. A capsule is
aligned along its local Y axis; `halfHeight` is half the straight segment,
excluding spherical caps, so total height is `2 * (halfHeight + radius)`.
Trimesh `vertices` are flat XYZ triples in local metres; `indices` are triangle
triples indexing those vertices. Bake scale into this data before publishing it.
Use finite coordinates, valid triangle indices and sensible positive sizes.

Visual geometry does not automatically become solid. NW-001B consumes collider
definitions and creates the Rapier objects. Closed/opening/closing doors need
coordinated visuals and kinematic collision updates. Sensor colliders report
occupancy/triggers; they do not block movement. This foundation supplies shape
metadata and an empty Rapier world, not a collider-conversion implementation.

`HospitalWorld.interactables` holds all interaction markers.
`HospitalWorld.doors` is a subset containing the same exact `DoorMarker` object
references (and therefore the same IDs), not separately copied definitions. This
is the one cross-list identity exception to globally unique declarations.
Hiding metadata references its corresponding locker or bed interactable. All
required arrays must be supplied, even when empty.

`validateWorld()` checks finite coordinates, normalized pose quaternions, ordered
bounds, declaration IDs and cross-references, collider sizes/index data,
interactable hierarchy membership and positive ranges, and identity root
transforms. Door markers require nonempty kinematic collider references and a
positive transition duration. Hiding spots require matching locker/bed markers,
capacity 1 and at least one exit candidate. Patrol routes must have a point, and
entity IDs must be unique across spawns. These structural checks do not prove
that a spawn or exit is physically clear; gameplay must query actual collision.

## Player

| Export | Purpose |
| --- | --- |
| `MovementState` | `idle`, `walking`, `sprinting`, `crouching`, `hidden`, `captured` |
| `PlayerSnapshot` | ID, feet position, view rotation, velocity, movement, crouching/grounded flags, hiding state/spot ID, captured flag, Three.js camera reference |
| `PlayerProvider` | `getSnapshot(): PlayerSnapshot` supplies the current read-only state |
| `PlayerNoiseKind` | `footstep`, `sprint`, `interaction`, `breathing` |
| `PlayerNoiseEvent` | Player ID, position, kind, hearing `radius`, relative `intensity` in [0,1], time |
| `PlayerCaptureEvent` | Player ID, capturing entity ID, position and time |

Feet position and camera eye position are deliberately separate. Gameplay owns
the camera pose, crouch transition, movement and hiding state. A provider must
return current values; consumers should not retain a snapshot as live mutable
state. The camera reference itself is a shared Three.js object.

## Interaction and hiding

| Export | Purpose |
| --- | --- |
| `InteractionType` | `door`, `drawer`, `cabinet`, `locker`, `bed`, `inspect` |
| `InteractionAction` | `open`, `close`, `inspect`, `enter-hiding`, `exit-hiding` |
| `DoorState` | `closed`, `opening`, `open`, `closing`, `locked`, `blocked` |
| `HidingState` | `outside`, `entering`, `hidden`, `exiting` |
| `InteractionRequirement` | Declarative requirement `id` and description; no inventory implementation is implied |
| `InteractableMarker` | ID, type, Three.js object, prompt, interaction range, optional requirements/collider IDs |
| `DoorMarker` | Door interactable with collider IDs, initial state, closed/open poses and transition duration |
| `HidingLocation` | ID, linked interactable, locker/bed type, concealed camera pose, concealed feet position, exit candidates, capacity 1 and collider IDs |
| `SpawnPoseForExit` | Candidate safe exit feet position and yaw |
| `HidingOccupancy` | Spot ID, occupant ID or null, and current hiding state |
| `InteractionRequest` | Player ID, target ID, requested action |
| `InteractionEvent` | Request plus outcome (`completed`, `blocked`, `denied`), optional reason and position |
| `DoorStateEvent` | Door ID and previous/current door state |
| `HidingStateEvent` | Player/spot IDs, previous/current hiding state, IDs of entities that witnessed entry |

Raycasts resolve a marker from its object or descendants. `range` is the maximum
eye-to-hit-surface distance in metres. Interaction execution must also check
line of sight, requirements, current state and occupancy; a marker is not an
authorization to interact through walls. Door object origins sit at their hinges;
closed/open poses and collider transforms must describe the same motion.

A hiding location is not universal invisibility. Witness information supports
justified investigation. Gameplay validates ordered exit candidates with the
player collision shape before exiting. If none is clear, it must keep a safe
state rather than place the player inside geometry. These are implementation
requirements for NW-001B, not behaviors implemented by NW-000.

## Entities, perception and navigation

| Export | Purpose |
| --- | --- |
| `EntityType` | `patient`, `nurse`, `crawler`, `watcher`, `reflection` |
| `EntityBehaviourState` | `idle`, `patrol`, `investigate`, `search`, `pursue`, `lost-target`, `return-to-patrol` |
| `EntitySpawnPoint` | Spawn pose, spawn ID, entity ID/type, optional room/patrol route IDs |
| `PatrolRoute` | ID, world-space points, loop flag |
| `PerceptionInput` | Observer position/forward, time, visible player observation or null, heard noises, witnessed hiding spot IDs |
| `PerceptionConfig` | Vision range/FOV, hearing multiplier, detection and lose-sight durations |
| `NavigationAgent` | Radius, height, maximum slope and step height; supports different clearance requirements |
| `NavigationQuery` | From/to positions and agent clearance |
| `NavigationPath` | Waypoints plus `reachesGoal` flag |
| `LineOfSightQuery` | From/to positions and optional ignored collider IDs |
| `NavigationProvider` | `findPath(query): NavigationPath \| null`, `hasLineOfSight(query): boolean`, `isPositionValid(position, agent): boolean` |
| `LastKnownPlayerPosition` | Player ID, observed position/time, source (`vision`, `sound`, `witnessed-hiding`) |
| `EntitySnapshot` | ID/type/position, behavior state and last known player information or null |
| `EntityStateEvent` | Entity ID and previous/current behavior state |
| `ChaseStartedEvent` | Chase/entity/player IDs, position and time |
| `ChaseEndedEvent` | Chase/entity/player IDs, reason (`escaped`, `captured`, `cancelled`) and time |
| `ReflectionEncounter` | ID, anchor ID, visibility and duration for a nonphysical visual encounter |

Spawn `position` is a floor/feet position. Entity IDs identify actors; spawn IDs
identify spawn declarations. Use the type vocabulary above rather than custom
spellings. Routes and spawns reference world-space navigation targets.

Perception input describes observations; it does not expose an unseen player's
current location. Vision must account for distance, FOV and line of sight.
Navigation providers must account for obstacles, agent clearance and dynamic
closed doors. Returning no path is valid; steering directly through a wall is
not a fallback. NW-000 defines this boundary without implementing navigation,
perception, entity profiles or behaviors.

## Atmosphere and typed events

| Export | Purpose |
| --- | --- |
| `LightingEvent` | Target ID, effect (`restore`, `blackout`, `flicker`, `dim`), duration, optional intensity |
| `SoundEvent` | Local cue ID, play/stop action, optional world position, volume, loop flag |
| `ScareTriggerEvent` | Trigger ID, optional room/position, intensity |
| `EnvironmentalAnomalyEvent` | Anomaly ID, start/stop action, target ID, optional duration |
| `GameEventMap` | Event-name-to-payload mapping listed below |
| `EventBus<Events>` | Typed `on(type, listener): Unsubscribe` and `emit(type, payload): void` |
| `GameEvents` | `EventBus<GameEventMap>` |

| Event name | Payload |
| --- | --- |
| `player:noise` | `PlayerNoiseEvent` |
| `player:captured` | `PlayerCaptureEvent` |
| `interaction:request` | `InteractionRequest` |
| `interaction:completed` | `InteractionEvent` |
| `door:state` | `DoorStateEvent` |
| `hiding:state` | `HidingStateEvent` |
| `entity:state` | `EntityStateEvent` |
| `chase:started` | `ChaseStartedEvent` |
| `chase:ended` | `ChaseEndedEvent` |
| `atmosphere:lighting` | `LightingEvent` |
| `atmosphere:sound` | `SoundEvent` |
| `horror:scare` | `ScareTriggerEvent` |
| `horror:anomaly` | `EnvironmentalAnomalyEvent` |
| `horror:reflection` | `ReflectionEncounter` |

Cue/target/trigger IDs are resolved by atmosphere/horror modules against local
assets and registered objects. `volume` and scare intensity use [0,1]; a lighting
intensity is the nonnegative scalar appropriate to its target. Sound
presentation is separate from AI perception: emitting `atmosphere:sound` does
not itself tell an enemy where a player is. Gameplay emits `player:noise` for
credible audible actions.

The same chase lifecycle notifications are available to gameplay, atmosphere
and horror. Match start/end by `chaseId`; publishers must emit one final end event
per chase. Listeners may trigger local lighting and sound cues without importing
entity code. Notifications do not perform state changes for their publishers.

## Runtime boundary

| Export | Signature / role |
| --- | --- |
| `FrameContext` | Read-only `deltaSeconds`, `elapsedSeconds` |
| `AudioService` | Nullable current `context`, `resume(): Promise<void>`, `dispose(): Promise<void>` |
| `EngineServices` | Shared scene, perspective camera, WebGL renderer, Rapier world and audio service |
| `ModuleKind` | `physics`, `world`, `gameplay`, `entities`, `atmosphere`, `horror` |
| `ModuleContext` | Engine services, scoped typed events, current world/player getters |
| `ModuleInstance` | Optional published world/player, optional fixed/update hooks, required sync or async `dispose()` |
| `GameModule` | ID, kind and sync/async `setup(context): ModuleInstance \| Promise<ModuleInstance>` |

Fixed-update elapsed time is the authoritative simulation time and counts
simulated fixed steps. Use it for all game state, physical simulation, AI
cooldowns and `timeSeconds` in noise/chase/capture events. Variable-update
elapsed time counts clamped rendered deltas and is for presentation only. After
dropped fixed-step backlog the clocks can differ. Never mix these timelines
when measuring a behavior timeout or comparing event timestamps. Reset discards
the pause gap from both clocks and preserves their accumulated elapsed values. See
[INTEGRATION.md](INTEGRATION.md) for concrete registration and lifecycle APIs.
