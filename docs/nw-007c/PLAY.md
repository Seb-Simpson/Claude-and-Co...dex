# Human playtest: integrated cinematic opening

```sh
git fetch origin
git switch feat/nw-007c-cinematic-integration
npm ci
npm run dev
```

Open the printed root URL (normally http://localhost:5173/). Use the normal menu: New Game → Enter ward. No harness, QA URL or developer positioning is needed. A previous save can be Continued; New Game deliberately resets it after confirmation.

1. Watch the Room 104 awakening, or Space to skip. Pause and settings should remain available. Check the stopped 03:17 clock, card, reader and intercom.
2. Explore slowly. Try the door and find Shaw's staff card beside the bed (crouch if needed), use the reader and open the door. Card-first exploration is also valid. Each of the two temporary intercom lines should play once.
3. Explore the empty corridor and Room 106 handle. Reach the station and examine the Room 104 observations record. No Nurse is waiting visibly in the corridor.
4. Listen for actual approaching heels. Shaw navigates in, checks the call console, reads the record and listens. Move aside from her work stance; she must not walk through you. Watch the real reset/page gestures and sound timing.
5. The dropped torch lights the staff locker. Hiding while she is working is safe during the authored introduction/learning period and frees her records stance. There is no forced camera movement. Room 105's bed remains another option.
6. After the safe opportunity, normal Nurse AI runs. Observe patrols, move quietly/crouch behind actual trolley cover, and avoid entering hiding while witnessed. Shift sprints. Reach the corridor exit east of the station to complete this encounter; no later chapter chase starts.
7. Deliberately test capture, skip, Retry, five retries, Continue, and New Game. The same canonical room/clock/card state should return; no old world, duplicate Nurse, leftover gesture or repeated hum stack.

WASD/mouse; E interaction; Shift sprint; Ctrl/C crouch; Escape pause. Motion → Reduced disables walking bob and captured camera movement. It does not replace the Nurse's authored animation; capture is skippable and Retry supports mouse, Enter or Space when focused.

This is a draft integration. It imports Claude's targeted head-export repair; automated geometry checks and independently inspected in-game close-ups verify the original export/bake defect repaired. Human visual acceptance is still required, and visible hand/target alignment remains under review. Please assess clarity of the card/record/locker, whether Shaw's arrival feels natural, fair stealth/recovery, audio timing, and the visible hand/face/neck defects. Record machine/GPU, graphics setting and viewport for performance feedback. Automated SwiftShader evidence does not replace this human review.
