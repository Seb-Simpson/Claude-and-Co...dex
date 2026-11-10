> Continued by [NW-005D](../nw-005d/REPORT.md): pinned final environment, Nurse-only Chapter One casting and fresh test evidence. This document records the earlier NW-005C delivery.

# NW-005C: Integrated Chapter 1 opening and onboarding

## Playing

Check out this integration branch; run `npm install` and `npm run dev`. Open the printed root URL (normally http://localhost:5173/), choose New Game, then Enter ward. No development page, query parameter, console action or separate environment installation is required. Continue uses the existing save slot. Escape pauses and exposes settings. Space blends past the awakening if desired.

Awaken on the existing Room 104 bed and rise into the ordinary controller. Explore freely. Try the locked door to hear Shaw's calm first instruction, or discover the card first. Look toward the floor-card/lanyard: the contextual prompt suggests crouching for a closer look; Ctrl or C uses the existing crouch controller. E takes the card. The reader beside the door denies access without it and releases the lock with it. Shaw's firmer second line plays once. Subsequent reader attempts provide restrained mechanical feedback without replaying dialogue. Leave space for the physical door swing, then open it normally.

Walk into the corridor toward the station's light. The106 handle responds but its leaf stays shut. Shaw's distant, non-attacking sighting may be noticed or missed. Approach the station and retain free control; there is no completion panel, new objective list, arbitrary end wall or activated stealth encounter.

If a player struggles, two short environmental observations appear only after 45/100 active presentation seconds, with a reader reminder after card discovery. No progression waits on these timers. Prompts/notifications are transient, use the existing image treatment and do not add dialogue or protagonist thoughts.

## Safety and future-section integration

`createOnboardingGate()` exports a bounded `OnboardingGate` with `phase`, `safe`, `sync(state, exited)`, `recordSkill(skill)`, `markPresentationReady()` and `beginActivePlay(): boolean`. Phases: awakening → room-104 → corridor → stealth-onboarding → active-play. Movement coordinates never directly authorize a hostile spawn or capture. Station arrival is a safe handoff, not permission for a chase.

The next authored director must teach and verify crouch, hiding and patrol observation; only then should it call beginActivePlay. Crouching and actual concealment are observed through the existing player provider. Patrol observation must be recorded by that next director after its encounter, not guessed from distance. beginActivePlay also requires the host to finish installing horror presentation/listeners. There is no player input or elapsed-time bypass. Training skills/permission reset with a fresh attempt; current saved station handoffs always restore safe onboarding. A later section will need its own versioned checkpoint before persisting lethal encounters.

`GameplayOptions.entitiesEnabled` and `canCapture` supply policy to the unchanged controller and existing EntitySystem. The system retains original world spawns/routes/profiles; it allocates agents only after enabled returns true, once. Sounds heard during suppression are discarded; stale capture attempts cannot poison the later activation. The opening has no hostile bodies anywhere, so no hostile can enter104 or kill an untrained player even if they sprint away or return. Classic simulation/legacy worlds retain their existing behavior.

`gateHorrorModule(module, enabled, prepare?, ready?)` installs the existing horror module during safe station onboarding, registers listeners before enemies can activate, and feeds its update hooks only after permission. It does not replace its assets, animation/audio or AI. The host calls markPresentationReady only after original setup resolves. Teardown waits for in-flight preparation and disposes the original once. The hospital atmosphere module runs throughout.

## Scene/camera integration

Both source branches were merged into this separate branch, retaining the layout revert. No source assets were regenerated/overwritten. The only additional world-source edit is an optional `awakening-eye` metadata node in world/opening.ts, above the existing mattress, plus application of its published pitch. No collider, furniture position, hospital layout or shared foundation contract was changed. The cinematic rises vertically before moving to the existing safe player spawn, through the existing camera lease; skip and pause preserve the same handoff.

Existing semantic binding data supplies door/card/reader/speaker/sighting/path positions; no new gameplay hospital coordinates were copied. NW-005A's browser visual checks now respect the integrated104lock/card flow and the scripted106closed state. Dedicated simulation tests retain their prior controller/AI scope; opening-aware browser startup asserts the actual safe opening rather than expecting the old sandbox Patient.

## Deliberately unfinished

The station stealth lesson and lethal section are not implemented. The trusted phase API is ready for that update, but gameplay never grants its permission here. PR #15 remains unmerged. British voice acting still needs recorded performances: current two WAVs are explicitly temporary synthetic stand-ins. The Nurse sighting has no authored walk-off route; it remains visible while observed and retires only while unobserved. Full body getting-out-of-bed animation is not attempted; the camera supplies the restrained awakening. Real-GPU performance and human first-playthrough approval remain unverified.
