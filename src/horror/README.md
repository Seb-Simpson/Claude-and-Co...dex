# NW-002B — Entity visuals and horror presentation

This module is presentation only. Gameplay (NW-001B) stays authoritative over entity position,
movement, detection, chase, capture and navigation. Nothing in `src/horror/` or
`src/atmosphere/` moves an entity, spawns one, teleports one, or decides an AI outcome.

## How it connects (no gameplay edits needed)

NW-001B already publishes model-binding nodes through `createEntityPresentation()`:

```
scene
└─ Group "night-ward:entities"
   └─ Group "night-ward:entity:<entityId>"   feet position, rotation.y faces -Z along travel
        userData = { entityId, entityType, behaviourState }
```

`horror.module.ts` reads these nodes every frame (`sceneEntityNodes(scene)`) and parents a body
under each one. It reads the transform but never writes it. Speed is measured from how far the
node moved each frame. The authoritative `behaviourState` and the measured speed together choose
the animation. When gameplay removes a node, the body is disposed.

Registration order is world → physics → gameplay → entities → atmosphere → horror, so the nodes
are already up to date when the horror `update()` runs.

## Entities

| Type | Silhouette | Visual states |
| --- | --- | --- |
| Patient | 2.3 m, emaciated, long arms reaching the knees, long neck, faded stained gown, sparse hair, limp | `idle` (breathing, finger twitches), `walk` (slow limping stalk), `alert` (snaps upright, fingers splay), `run` (torso near-horizontal, arms thrashing), `search` (impossible neck sweep, arm feeling ahead), `observe` (doorway: hand high on the frame, head tilted in), `lost` |
| Nurse | 1.9 m, starched dress and cap, apron, dark stockings, **bandaged eyes** (hunts by sound) | `idle` / `walk` (hands clasped, measured steps, head twitching toward sounds), `listen` (freezes, head cocked, hand to ear), `alert`, `run` (stiff stride, both arms reaching), `search` |
| Crawler | 0.6–0.85 m tall, prone, splayed hyperextended elbows, legs dragging, open jaw, spine ridge | `idle` (finger taps, head jerks), `walk` (diagonal crawl, hands plant on the floor), `alert` (rises, head turns sideways), `run` (skittering), `search` |
| Watcher | 2.45 m, featureless pale head, long dark coat | `stand` with five still poses, changed **only while unobserved**; `walk` is a glide with almost no stride |
| Reflection | No body. A smeared figure behind the viewer, drawn only inside a mirror or pane of glass | Fades in, drifts slightly, and vanishes if stared at from close by |

How states map from gameplay behaviour (`resolveVisualState`, a pure function):

* `pursue` → `alert` for about 0.4–0.75 s, then `run`.
* `investigate` → Patient/Crawler `alert`, then `walk`/`search`; Nurse `listen`.
* `search` → `search`; `lost-target` → `lost`.
* `patrol` / `return-to-patrol` → `walk`, or `idle` when stationary. A Patient standing still in
  a doorway switches to `observe`.

Bodies are procedural skinned meshes: one `SkinnedMesh` per material on a shared 19-bone skeleton,
3–5 draw calls per entity, a few thousand triangles. A ground clamp keeps the lowest contact
(soles, or hands/knees/toes for the Crawler) on the floor.

## Presentation API (`src/horror/index.ts`)

```ts
createEntityVisual(type: 'patient' | 'nurse' | 'crawler' | 'watcher', options?: { seed?: number }): EntityVisual

interface EntityVisual {
  readonly type: BodiedEntityType;
  readonly object: Group;                 // parent under the gameplay transform; never moves it
  readonly visualState: VisualState;
  update(dt: number, input: EntityVisualInput): readonly FootstepEvent[];
  forceState(state: VisualState | null, variant?: number): void;   // cinematics/previews
  setOpacity(value: number): void;
  bonePosition(bone: JointName, target?: Vector3): Vector3;        // world space
  dispose(): void;
}
interface EntityVisualInput { behaviour: EntityBehaviourState; speed: number; nearDoor?: boolean; observed?: boolean }

resolveVisualState(type, behaviour, speed, { previous, behaviourTime, stillTime, nearDoor }): VisualState

new EntityPresenter({ source, camera, doorways?, lineOfSight?, onFootstep?, onReveal?, onLostSight?, sightInterval? })
sceneEntityNodes(scene, rootName = 'night-ward:entities'): EntityNodeSource

new ReflectionPresenter(parent, reflectiveSurfaces, camera)   // show(anchorId | null, seconds), hide(), update(dt)
new CinematicDirector(services)                                // play(kind, { position?, intensity? }), update(dt)
new ScreenOverlay(container)                                   // vignette + colour wash, DOM only
new SilhouetteMirage(parent, sightlines)                       // distant non-entity silhouettes
new FootprintTrail(parent)                                     // fading wet prints, one draw call
new EntityAudio(() => audioContext)                            // positional entity sound
```

## Events

| Event | Effect |
| --- | --- |
| `chase:started` | `chase-initiation` beat (stinger, local flicker, red-edged vignette); atmosphere switches the score to chase and pulses emergency lights |
| `chase:ended` (`escaped` / `cancelled`) | `post-chase-silence`: score, room tone and buzz cut instantly, then a slow return and a distant footstep sequence |
| `chase:ended` (`captured`) | Score cut only. Capture presentation belongs to gameplay |
| `entity:state` | Drives the tension score: calm / uneasy / search / chase |
| `horror:reflection` | Shows or hides The Reflection. `anchorId` may be a surface ID (`nw:mirror:*`, `nw:glass:*`); any other value picks the best surface the camera can see |
| `horror:scare` with `triggerId: 'nw:scare:<kind>'` | Plays a cinematic beat: `distant-reveal`, `lighting-failure`, `chase-initiation`, `disappear`, `near-miss`, `post-chase-silence` |
| `horror:anomaly` (start) | Existing environmental anomalies (curtains, monitors, lift, TV, tile, wheelchair) |

Beats are also triggered automatically:

* A far entity coming into view after a long absence → `distant-reveal`.
* A visible Patient or Watcher slipping behind geometry → `disappear`.
* A hunting entity passing within 2.8 m of the hidden player (read from
  `PlayerProvider.getSnapshot().hiding`) → `near-miss`.
* Rarely, in calm periods → `lighting-failure`.

Emitted: `atmosphere:lighting` (fixture IDs and circuits), `atmosphere:sound` (cue IDs, plus the
mix controls `nw:mix:duck` and `nw:mix:silence`), and `horror:anomaly`.

## Audio

All sound is synthesised in the browser: no assets, no paid dependencies.

* **Patient:** wet positional breathing whose rate and colour follow the state, plus a low beating
  presence drone that rises as it gets near. Heavy bare footfalls; the bad leg drags.
* **Nurse:** heel clicks, a jangle of keys, and a hummed tune that stops dead when she starts
  listening.
* **Crawler:** wet hand plants, knuckle clicks, throat-click trains.
* **Watcher:** silence, apart from a thin ringing while you look at it.
* **Occlusion:** entities behind walls are low-passed.
* **Score:** uneasy drone, sparse search ticks, a chase pulse with heartbeat and scrapes, and a hard
  cut when the chase ends.

## Environment

* **Darkness transitions:** each kind of space has its own fog density and ambient floor, eased as
  you move. Fog thickens as the mains lighting around you fails.
* **Emergency lighting:** battery bulkheads in the corridor swell as the tubes die, and pulse
  during chases.
* **Readability:** a dim, short-range camera fill keeps nearby surfaces readable in darkness.
* **Distant silhouettes:** a still figure at the far end of six long sight lines, gone when you
  approach or the light drops. It is never near a real entity and is not an entity.
* **Footprints:** wet, fading prints wherever the Patient walked.

## Development preview

`/src/world/dev/preview.html?view=lineup&showcase=lineup` shows all four bodies. The page's
`__nwPreview.showcase([...])` publishes stand-in nodes in the NW-001B format so the production
presenter is what attaches the bodies. This is a dev harness only; in the game, gameplay owns
those nodes.
