# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: nw-007a-reliability.spec.ts >> canonical assets survive retry when a later asset request fails; no legacy playable fallback
- Location: tests/browser/nw-007a-reliability.spec.ts:5:1

# Error details

```
Error: Retry must retain the same canonical environment, physical card and station

expect(received).toEqual(expected) // deep equality

- Expected  - 6
+ Received  + 6

  Object {
-   "card": true,
-   "cardVisible": true,
-   "cards": 1,
-   "room": true,
-   "rooms": 1,
-   "station": true,
+   "card": false,
+   "cardVisible": undefined,
+   "cards": 0,
+   "room": false,
+   "rooms": 0,
+   "station": false,
  }
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - main "NIGHT WARD" [ref=e2]:
    - generic "NIGHT WARD hospital view" [ref=e3]
  - generic [ref=e4]:
    - figure "Plate 06 — The night nurse hunts by sound." [ref=e5]:
      - 'img "Room 104: an unmade hospital bed, its sheets dragged to the floor, an overturned drip stand and a wheelchair facing the wall." [ref=e6]'
      - img "A tall, emaciated figure in a hospital gown leans into the doorway of Room 104, one hand high on the frame." [ref=e7]
      - img "Black branching veins spread from the corner behind the bed head, glowing faintly cyan at their tips, beside four long scratches in the paint." [ref=e8]
      - img "A thin, prone figure crawls along the corridor floor on splayed arms, low beneath the handrail." [ref=e9]
      - img "A washbasin mirror shows a pale, still figure standing in the room behind the viewer; the room itself is empty." [ref=e10]
      - img "A nurse in a starched white uniform with bandaged eyes walks the corridor, hands clasped." [ref=e11]
      - img "A hospital wall clock stopped at seventeen minutes past three." [ref=e12]
      - paragraph [ref=e14]: Plate 06 — The night nurse hunts by sound.
    - article "Ward record" [ref=e15]:
      - paragraph [ref=e16]: INCIDENT LOG
      - paragraph [ref=e17]: All ward clocks stopped at 03:17. The battery clocks too. The emergency lighting held.
    - generic [ref=e18]:
      - generic [ref=e19]:
        - heading "Waking again" [level=2] [ref=e20]
        - generic [ref=e21]: 100%
      - progressbar "Loading progress" [ref=e22]
      - paragraph [ref=e24]: Ready.
      - list "Loading stages" [ref=e25]:
        - listitem [ref=e26]:
          - generic [ref=e28]: Lighting and ambience
          - generic [ref=e29]: done
        - listitem [ref=e30]:
          - generic [ref=e32]: Physics, player and navigation
          - generic [ref=e33]: done
        - listitem [ref=e34]:
          - generic [ref=e36]: Entities and presentation
          - generic [ref=e37]: done
        - listitem [ref=e38]:
          - generic [ref=e40]: Building Ward 4 West
          - generic [ref=e41]: done
        - listitem [ref=e42]:
          - generic [ref=e44]: Compiling shaders
          - generic [ref=e45]: done
      - button "Enter ward" [active] [ref=e46] [cursor=pointer]
      - paragraph [ref=e47]: Press Enter · the mouse is captured while you play; Esc pauses
      - status [ref=e48]: "4 modules ready. World: nw:hospital:ward-4-west."
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import type {Application} from '../../src/integration/application';
  3  | const snap=(page:import('@playwright/test').Page)=>page.evaluate(()=>window.nightWardTest!.snapshot());
  4  | test.use({launchOptions:{...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}});
  5  | test('canonical assets survive retry when a later asset request fails; no legacy playable fallback',async({page},info)=>{
  6  |  test.setTimeout(360_000);
  7  |  const warnings:string[]=[];page.on('console',m=>{if(m.type()==='warning')warnings.push(m.text())});
  8  |  await page.addInitScript(()=>localStorage.setItem('night-ward:settings:v1',JSON.stringify({quality:'low',motion:'reduce'})));
  9  |  await page.goto('/?test=1&menu=1');await page.getByRole('button',{name:/^New Game/}).click();
  10 |  await expect.poll(async()=>(await snap(page)).state,{timeout:150_000}).toBe('ready');
  11 |  const inspect=()=>page.evaluate(()=>{
  12 |   const scene=(window.nightWardTest as Application).services()!.scene;
  13 |   const room=scene.getObjectByName('nw:room104-set'),station=scene.getObjectByName('nw:station-set'),card=scene.getObjectByName('nw:opening:access-card-prop');
  14 |   let rooms=0,cards=0;scene.traverse(n=>{if(n.name==='nw:room104-set')rooms++;if(n.name==='nw:opening:access-card-prop')cards++});
  15 |   return {room:!!room,station:!!station,card:!!card,cardVisible:card?.visible,rooms,cards};
  16 |  });
  17 |  const before=await inspect();expect(before).toMatchObject({room:true,station:true,card:true,cardVisible:true,rooms:1,cards:1});
  18 |  // Deterministic reproduction of the human report: only later asset retrieval fails.
  19 |  // Initial New Game loaded the actual canonical set. This diagnostic calls the same
  20 |  // application restart used by capture; separate UI tests exercise actual AI capture.
  21 |  let blocked=0;await page.route(/(room104_set.*\.glb|room104_lightmap.*\.jpg|station_set.*\.glb)/,r=>{blocked++;return r.abort('failed')});
  22 |  await page.evaluate(()=>window.nightWardTest!.restart());
  23 |  await expect.poll(async()=>(await snap(page)).state,{timeout:150_000}).toBe('ready');
  24 |  const after=await inspect();
  25 |  await info.attach('canonical-retry.json',{body:JSON.stringify({before,after,blocked,warnings},null,2),contentType:'application/json'});
> 26 |  expect(after,'Retry must retain the same canonical environment, physical card and station').toEqual(before);
     |                                                                                              ^ Error: Retry must retain the same canonical environment, physical card and station
  27 |  expect(warnings.filter(w=>/procedural room|stand-ins/.test(w))).toEqual([]);
  28 | });
  29 | 
```