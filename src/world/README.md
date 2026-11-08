# NW-001A — Ward 4 West hospital environment

Owned by NW-001A (`src/world/`, `src/atmosphere/`, `src/horror/`). Built on the NW-000 foundation
`d0146399c89c172933ef32981551800ce35fa682`. There are no binary assets: every texture is generated
on a canvas at setup, and every sound is synthesised with Web Audio.

## Layout (metres, +Y up, north = −Z)

```
                                   ┌STAIR B┐  locked + chained (future expansion)
 ┌────┬────┬────┬────────┬────────┬────┬────────┐├─door──┤
 │101 │103 │105 │NURSES' │TREAT-  │107 │STORAGE │ │C-EAST │═ lift (out of service)
 ├─d──┴─d──┴─d──┴counter─┴─d──────┴d───┴─d──────┘ │       │
 W  window     MAIN PATIENT CORRIDOR (38 × 2.8)  ║smoke  │
 ├─d──┬─d──┬─d──┬conn┬─d──┬waiting┬─d──┬───────┐ │       │
 │102 │104 │106 │ ↓  │108 │ bay   │110 │       │ │       │
 └────┴────┴────┴─d──┴────┴───────┴────┴───────┘ │       │
                │  MAINTENANCE PASSAGE ══════════d       │
```

* Main corridor: x −20…18, z ±1.4, suspended ceiling at 2.7 m. It runs from a moonlit end window
  to the east junction, with smoke doors held open at x = 8.4.
* Nine patient rooms, each with its own story: 101 isolation, 102 paediatric overflow,
  103 curtained/sedated, 104 the player start, 105 semi-private, 106 flooded, 107 restraint,
  108 ransacked, 110 "occupied".
* Nurses' station, treatment room, storage (shelving aisles and lockers), waiting bay, service
  connector, maintenance passage, east corridor with the lift, and Stairwell B (locked).
* Loop: corridor → connector → maintenance → east corridor → corridor. This gives chases a circuit.
  Both maintenance service doors start ajar: entities cannot open doors, and the Patient spawns in
  the passage and patrols this loop. `patrols.test.ts` checks that every patrol leg is walkable
  with the doors in their initial state.

## Public API (`src/world/index.ts`)

```ts
createHospitalWorld(options?: { seed?: number; textures?: boolean }): HospitalWorldBuild
interface HospitalWorldBuild { world: HospitalWorld; extras: HospitalExtras; dispose(): void }
HOSPITAL_WORLD_ID = 'nw:hospital:ward-4-west'
getHospitalExtras(world: HospitalWorld | null): HospitalExtras | null
roomAt(extras, position): RoomMetadata | null
HOSPITAL_ROOMS // room ID constants
```

`world` is the shared-contract `HospitalWorld`, and it passes `validateWorld()`:

| Field | Content |
| --- | --- |
| `rooms` | 19 rooms with semantic tags (`patient-room`, `nurses-station`, `storage`, `treatment`, `maintenance`, `stairwell`, `hiding`, …) |
| `colliders` | ~220 boxes: walls, floors, furniture, stairs and the lift. Door leaves are `kinematic` |
| `interactables` | 16 doors, 4 hiding lockers, 2 hiding beds, and inspect/drawer/cabinet markers |
| `doors` | The same marker objects. Each hinge-origin `Group` starts in its initial pose |
| `hidingLocations` | 4 lockers + 2 under-bed spots, each with ordered exit candidates |
| `entitySpawns` | patient (maintenance), nurse (station), crawler (101), watcher (west window), reflection (treatment mirror) |
| `patrolRoutes` | `nw:route:ward-loop`, `nw:route:station-round`, `nw:route:east-wing` |
| `playerSpawn` | Room 104, facing its open door |

## Modules (auto-discovered, no `main.ts` change)

| File | Kind | Role |
| --- | --- | --- |
| `src/world/hospital.module.ts` | world | Publishes the hospital |
| `src/atmosphere/atmosphere.module.ts` | atmosphere | Fog, pooled lighting with flicker and disturbances, procedural audio |
| `src/horror/horror.module.ts` | horror | Anomaly director (curtains, monitors, TV static, lift, hanging tile, wheelchair) |

Events consumed:

* `atmosphere:lighting`: targets are fixture IDs or circuits such as `nw:lights:all`,
  `nw:lights:corridor-main`, `nw:lights:corridor-east`, `nw:lights:emergency` and
  `nw:lights:<room-suffix>`.
* `atmosphere:sound`: cue IDs are listed in `CUE_IDS` (`src/atmosphere/ambience.ts`).
* `horror:anomaly` with `action: 'start'` and `targetId` set to an anomaly ID, e.g.
  `nw:anomaly:lift`.
* `chase:started` / `chase:ended`: lighting surges, the director pauses, then a quiet period.
* `horror:scare`: a local flicker and a hush.

Events emitted: `horror:anomaly` (start/stop) and `atmosphere:sound` (anomaly cues).

## Integration notes for NW-001B

* **Doors.** Each door's collider pose matches its *initial* state. Compute the leaf offset once as
  `inverse(initialPose) * colliderPose`. Then drive the group and the kinematic collider together
  between `closedPose` and `openPose`.
* **Lockers.** A hiding locker's door is a child named `door`, pivoting about local Y.
  `userData.nwHinge.openAngle` gives the suggested swing.
* **Bed hiding.** The bed marker is an invisible proxy mesh, so raycasts hit it while nothing
  renders.
* **Hiding positions.** `playerPosition` lies inside the locker/bed collider. Gameplay must disable
  or ignore that collision while the player is hidden.
* **Camera fallback.** Until a gameplay module publishes a player, atmosphere places the camera
  once at the spawn eye height. After that, gameplay owns the camera.

## Development preview

`npm run dev` and open `/src/world/dev/preview.html?view=corridor-east`. This is a dev-only
free-fly camera (drag to look, WASD/QE, keys 1–9 for views). It is not the player controller and
is not bundled by `vite build`.
