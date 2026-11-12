# NW-007A implementation status

This branch starts at the requested PR #21 commit `0097264bf07a21b22ca7b5b1ac14ddaff951a046`. It is stacked on `feat/nw-006b-nurse-stealth`; no merge to main, another feature branch, or PR #15 is included.

## Audit before implementation

The baseline already has the normal frontend/menu/loading/settings path, one application/engine/render loop, Rapier movement and interactions, Room 104's access-card state reducer, two one-shot Shaw lines, a cinematic transport with a real player-control lease, milestone saves, and the four-phase station Encounter Director. The Nurse uses existing navigation, vision, sound, hiding witnesses, pursuit/search and recovery. The trolley, staff locker and Room 105 bed are existing environment/gameplay integration. Chapter One casting excludes the Patient.

The audited baseline retained an early static corridor sighting, mechanical awakening and basic capture UI. This branch replaces those behaviors while extending its four-phase encounter and reusing its real AI.

The authoritative NW-007 Shared Design Contract Revision 1 has now been supplied. The restart fix below was completed and verified first. The six-scene/director/presentation work continues on this same branch, using existing assets and documented optional semantic hooks for Claude.

## Phase 1: canonical environment and asset lifetime

### Reproduced cause

The loading screen downloads the asset manifest for New Game and Continue. The baseline `takePreloaded` destructively removed each source buffer. Capture retry calls the same application restart lifecycle, but its loading presentation does not repeat manifest download. Room 104 and the station consequently changed from parsing resident bytes to fetching again. Any failed/timed-out Room 104 retrieval entered `hospital.module.ts`'s catch-and-warn branch, which published the old procedural room as a successful world. The physical access card exists in the Blender set; the metadata marker alone cannot replace that visible object. The same fallback could replace the station.

The save slot stores validated opening booleans and a semantic milestone/station phase, not a Three.js scene or asset URL. All three entry paths use the same GameModule registry and hospital factory. The obsolete result came from that factory's fallback branch, not a checkpoint deserializing an old scene. World ID and collider-count checks alone could therefore pass while the visual environment was wrong. The public procedural-query switch was the other bypass and is now ignored.

The new browser regression was run **before changing production source**: initial New Game had the actual room, station and visible card; after blocking later asset requests, restart reported `ready` with all three missing. The retained baseline error context and console warnings are in `evidence/baseline-failure/`. This proves the failure path. The original human session's network trace is unavailable, so its precise transport/decode failure is not asserted.

### Correction

- Retain immutable, build-URL-keyed source bytes for the frontend application lifetime. Every parser receives a separate copy. Parsed Three.js nodes, materials, textures, pickup visibility and gameplay state are never cached across attempts.
- Room 104, its lightmap, the station and default entity model loaders use the same byte source for New Game, Continue and Retry. Existing preload progress and one-shot compatibility reads remain available. Concurrent direct reads share an in-flight request; failed reads are retryable. A cleared application generation rejects late download completion.
- Browser hospital setup requires both canonical sets and Room 104's card/door bindings. A critical failure rejects setup instead of returning a playable legacy environment. The obsolete procedural URL switch no longer changes the public game. DOM-free metadata builders remain available to unit fixtures.
- World setup is transactional: on failure, already-loaded set owners and any constructed world are released. Successful attempt disposal is idempotent. The normal application error/retry UI handles a genuinely unavailable initial asset.
- Frontend disposal clears resident bytes. Returning to the menu retains them for another session; they are not GPU resources. This trades a bounded resident copy of each loaded binary for predictable retries.
- No Blender files, textures, lightmaps, geometry layout, lighting values or scene-binding coordinates were changed. The small world/model loader edits fix the actual environment lifecycle boundary.

### Public APIs added

`src/assets/preload.ts`:

- `readAssetBytes(url: string): Promise<ArrayBuffer>` — a caller-owned copy of retained source bytes, downloading once if absent.
- `assetByteStats(): { entries: number; bytes: number }` — retained byte-store diagnostics.

Existing `preloadOne`, `preloadAll`, `takePreloaded`, `clearPreloaded` and `preloadedCount` remain. `takePreloaded` still consumes its compatibility ticket; it now returns a copy to protect the canonical source. Source buffers are released by `clearPreloaded()`.

`world.root.userData.nwPresentation` identifies `canonical` browser presentation or a DOM-free `metadata-fixture`. It is diagnostic metadata, not a new gameplay/shared world contract.

## Existing animation boundary (preserved)

`StationActorPose` in `src/gameplay/encounters/nursesStation.ts` is the current typed gameplay-to-presentation boundary: `deltaSeconds`, `actor: EntitySnapshot`, `yaw`, `speed`, and `checkingPanel`. `StationOptions.present(pose)` feeds `OpeningScene.directNurse(pose)` in `src/gameplay/opening/scene.ts`. It moves/animates the one existing visual from the authoritative actor pose; presentation cannot teleport the physical actor, detect the player, capture them or commit narrative progression.

`checkingPanel` currently requests the existing `observe` visual state. No bespoke clipboard, paperwork or call-panel clip is claimed. A future optional animation adapter should preserve ownership of navigation/capture/progression and fall back to existing locomotion/observation; exact new cues, phase IDs and animation completion policy follow the shared contract; the optional animation contract is documented in DIRECTORS.md. Published NW-007B interfaces are inspected separately without importing the asset branch.

## Cinematic/director implementation

The six-scene implementation now follows the supplied Revision 1 contract. [DIRECTORS.md](DIRECTORS.md) documents actual scene triggers, ownership, cancellation, checkpoint migration, animation metadata/hooks, movement and capture behavior. The old early corridor sighting is removed; the same physical Nurse is activated at an unseen point only after the register discovery. The existing Encounter Director and autonomous AI are preserved.

The stationary-reader browser test exposed a real authored-work-stance obstruction. The director now uses a nearby clear observation stance after a narrowly bounded physical stall, without teleporting or disabling collision; optional contact animation is gated by `contactReady`. A real-geometry unit test protects that case. Entering a hiding spot while witnessed remains dangerous; that legitimate capture behavior was retained rather than weakened to satisfy a bot route.

New camera/movement/capture features use the existing camera transport, input lease, settings and mixer. No extra renderer, loop or AudioContext is created. GPU textures and shared ImageBitmap backing stores are released by their asset owner; existing skeleton disposal remains in use.

Final public-game QA is in progress. Overall NW-007 acceptance still requires the specified independent human playtest. NW-007B hand/panel/record/capture clips are published separately in PR #22 and await NW-007C integration; final voice performances remain pending; current animation states and the two explicitly temporary recordings remain operational fallbacks. No new asset path or clip name was invented.
