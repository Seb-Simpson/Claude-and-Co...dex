# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: nw-007a-reliability.spec.ts >> five real Nurse captures and UI retries preserve canonical assets, saved card and one actor; New Game resets fresh state
- Location: tests/browser/nw-007a-reliability.spec.ts:64:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "paused"
Received: "ready"

Call Log:
- Timeout 120000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - main "NIGHT WARD" [ref=e2]:
    - generic "NIGHT WARD hospital view" [ref=e3]
  - generic [ref=e4]:
    - figure "Plate 01 — Room 104. You wake here." [ref=e5]:
      - 'img "Room 104: an unmade hospital bed, its sheets dragged to the floor, an overturned drip stand and a wheelchair facing the wall." [ref=e6]'
      - img "A tall, emaciated figure in a hospital gown leans into the doorway of Room 104, one hand high on the frame." [ref=e7]
      - img "Black branching veins spread from the corner behind the bed head, glowing faintly cyan at their tips, beside four long scratches in the paint." [ref=e8]
      - img "A thin, prone figure crawls along the corridor floor on splayed arms, low beneath the handrail." [ref=e9]
      - img "A washbasin mirror shows a pale, still figure standing in the room behind the viewer; the room itself is empty." [ref=e10]
      - img "A nurse in a starched white uniform with bandaged eyes walks the corridor, hands clasped." [ref=e11]
      - img "A hospital wall clock stopped at seventeen minutes past three." [ref=e12]
      - paragraph [ref=e14]: Plate 01 — Room 104. You wake here.
    - article "Ward record" [ref=e15]:
      - paragraph [ref=e16]: ESTATES MEMO
      - paragraph [ref=e17]: Stairwell B to remain chained until further notice. Do not use the lift after midnight.
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
  16  |   const room=scene.getObjectByName('nw:room104-set'),station=scene.getObjectByName('nw:station-set'),card=scene.getObjectByName('nw:opening:access-card-prop');
  17  |   let rooms=0,cards=0;scene.traverse(n=>{if(n.name==='nw:room104-set')rooms++;if(n.name==='nw:opening:access-card-prop')cards++});
  18  |   return {room:!!room,station:!!station,card:!!card,cardVisible:card?.visible,rooms,cards};
  19  |  });
  20  |  const before=await inspect();expect(before).toMatchObject({room:true,station:true,card:true,cardVisible:true,rooms:1,cards:1});
  21  |  // Deterministic reproduction of the human report: only later asset retrieval fails.
  22  |  // Initial New Game loaded the actual canonical set. This diagnostic calls the same
  23  |  // application restart used by capture; separate UI tests exercise actual AI capture.
  24  |  let blocked=0;await page.route(/(room104_set.*\.glb|room104_lightmap.*\.jpg|station_set.*\.glb)/,r=>{blocked++;return r.abort('failed')});
  25  |  await page.evaluate(()=>window.nightWardTest!.restart());
  26  |  await expect.poll(async()=>(await snap(page)).state,{timeout:150_000}).toBe('ready');
  27  |  const after=await inspect();
  28  |  await info.attach('canonical-retry.json',{body:JSON.stringify({before,after,blocked,warnings},null,2),contentType:'application/json'});
  29  |  expect(after,'Retry must retain the same canonical environment, physical card and station').toEqual(before);
  30  |  expect(warnings.filter(w=>/procedural room|stand-ins/.test(w))).toEqual([]);
  31  | });
  32  | 
  33  | const wait={timeout:120_000};
  34  | async function look(page:Page,target:Vec3) {
  35  |  const s=await snap(page),p=s.opening!.camera;
  36  |  const dx=target.x-p.x,dy=target.y-p.y,dz=target.z-p.z;
  37  |  const yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(dy,Math.hypot(dx,dz));
  38  |  const delta=Math.atan2(Math.sin(yaw-s.player!.rotation.yaw),Math.cos(yaw-s.player!.rotation.yaw));
  39  |  await page.evaluate(({x,y})=>document.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,movementX:x,movementY:y})),{x:-delta/.002,y:-(pitch-s.player!.rotation.pitch)/.002});
  40  | }
  41  | async function walk(page:Page,target:Vec3) {
  42  |  const start=Date.now();
  43  |  try {
  44  |   while(Date.now()-start<90_000) {
  45  |    const s=await snap(page),p=s.player!.position;
  46  |    if(Math.hypot(target.x-p.x,target.z-p.z)<.23)return;
  47  |    await look(page,{...target,y:s.opening!.camera.y});await page.keyboard.down('w');await page.waitForTimeout(80);
  48  |   }
  49  |   throw Error(`Input walk failed: ${JSON.stringify((await snap(page)).player)}`);
  50  |  }finally{await page.keyboard.up('w')}
  51  | }
  52  | async function presentation(page:Page) {
  53  |  return page.evaluate(()=>{
  54  |   const scene=(window.nightWardTest as Application).services()!.scene;
  55  |   const names=['nw:room104-set','nw:station-set','nw:opening:access-card-prop','nw:opening:nurse-sighting'];
  56  |   return names.map(name=>{
  57  |    const nodes:import('three').Object3D[]=[];scene.traverse(n=>{if(n.name===name)nodes.push(n)});
  58  |    const node=nodes[0];let meshes=0;const clocks:string[]=[];
  59  |    node?.traverse(n=>{if('isMesh' in n)meshes++;if(/clock/i.test(n.name))clocks.push(n.name)});
  60  |    return {name,count:nodes.length,uuid:node?.uuid,visible:node?.visible,meshes,clocks};
  61  |   });
  62  |  });
  63  | }
  64  | test('five real Nurse captures and UI retries preserve canonical assets, saved card and one actor; New Game resets fresh state',async({page},info)=>{
  65  |  test.setTimeout(1_500_000);
  66  |  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  67  |  // A valid saved stealth milestone, not a live phase/position mutation. The test
  68  |  // walks into real AI perception on each attempt and uses the public capture UI.
  69  |  await page.addInitScript(()=>{
  70  |   if(sessionStorage.getItem('nw007-fixture'))return;
  71  |   sessionStorage.setItem('nw007-fixture','1');
  72  |   localStorage.setItem('night-ward:settings:v1',JSON.stringify({quality:'low',motion:'reduce',subtitles:true}));
  73  |   localStorage.setItem('night-ward:save:v1',JSON.stringify({version:1,checkpoint:'nw:checkpoint:station-approach',label:'Nurses’ Station',playSeconds:42,savedAt:1,sessions:1,
  74  |    opening:{version:1,milestone:'station-approach',station:{version:1,phase:'stealth'},state:{version:1,awakened:true,cardAcquired:true,doorUnlocked:true,firstLinePlayed:true,secondLinePlayed:true,room106Tried:true,sightingSeen:true,stationReached:true}}}));
  75  |  });
  76  |  await page.goto('/?test=1&menu=1');await page.getByRole('button',{name:/^Continue/}).click();
  77  |  await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
  78  |  const baseline=await snap(page),initial=await presentation(page),attempts:unknown[]=[];
  79  |  expect(initial.every(n=>n.count===1)).toBe(true);
  80  |  expect(initial[0]!.meshes).toBeGreaterThan(0);
  81  |  expect(initial[2]!.visible).toBe(false);
  82  |  // All later retrievals fail: retry must parse fresh instances from owned bytes.
  83  |  let blocked=0;await page.route(/(room104_set.*\.glb|room104_lightmap.*\.jpg|station_set.*\.glb|nurse.*\.glb)/,r=>{blocked++;return r.abort('failed')});
  84  |  let previous=initial;
  85  |  for(let attempt=1;attempt<=5;attempt++) {
  86  |   if(process.env.NW005_SOFTWARE_SCALE==='1')await page.evaluate(()=>(window.nightWardTest as Application).services()!.renderer.setPixelRatio(.25));
  87  |   await page.getByRole('button',{name:'Enter ward',exact:true}).click();
  88  |   await expect.poll(async()=>(await snap(page)).state,wait).toBe('playing');
  89  |   const locations=(await snap(page)).station!.locations;
  90  |   await walk(page,locations.entry);await walk(page,{...locations.patrol[3]!,z:locations.entry.z});
  91  |   await expect.poll(async()=>(await snap(page)).station!.firstAlertUsed,wait).toBe(true);
  92  |   expect((await snap(page)).player!.captured).toBe(false);
  93  |   await expect.poll(async()=>(await snap(page)).state,{timeout:150_000}).toBe('captured');
  94  |   if(attempt===1)await page.screenshot({path:info.outputPath('01-real-capture.png')});
  95  |   const captured=await snap(page);
  96  |   await page.getByRole('button',{name:'Restart from checkpoint',exact:true}).click();
  97  |   await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
  98  |   const restored=await snap(page),view=await presentation(page);
  99  |   expect(restored.sessionId).toBe(captured.sessionId+1);
  100 |   expect(restored.player!.captured).toBe(false);expect(restored.station!.phase).toBe('stealth');
  101 |   expect(restored.opening!.state).toEqual(baseline.opening!.state);
  102 |   expect(restored.colliderCount).toBe(baseline.colliderCount);expect(restored.entities).toEqual([]);
  103 |   expect(await page.locator('canvas').count()).toBe(1);
  104 |   expect(view.every(n=>n.count===1)).toBe(true);
  105 |   view.forEach((n,i)=>{
  106 |    expect(n.uuid).not.toBe(previous[i]!.uuid);
  107 |    expect({...n,uuid:null}).toEqual({...initial[i]!,uuid:null});
  108 |   });
  109 |   attempts.push({attempt,captured,restored,presentation:view});previous=view;
  110 |  }
  111 |  await page.screenshot({path:info.outputPath('02-fifth-retry.png')});
  112 |  // New Game through the normal menu must discard card/door state, while keeping
  113 |  // the canonical scene, rather than reusing the previous attempt's hidden card.
  114 |  await page.getByRole('button',{name:'Enter ward',exact:true}).click();
  115 |  await page.evaluate(()=>document.exitPointerLock());
> 116 |  await expect.poll(async()=>(await snap(page)).state,wait).toBe('paused');
      |                                                            ^ Error: expect(received).toBe(expected) // Object.is equality
  117 |  await page.getByRole('button',{name:/^Return to Main Menu/}).click();
  118 |  await page.getByRole('button',{name:'Leave the ward',exact:true}).click();
  119 |  await page.getByRole('button',{name:/^New Game/}).click();
  120 |  await page.getByRole('button',{name:'Start new game',exact:true}).click();
  121 |  await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
  122 |  const fresh=await snap(page),freshView=await presentation(page);
  123 |  expect(fresh.opening!.state.cardAcquired).toBe(false);expect(fresh.opening!.state.doorUnlocked).toBe(false);
  124 |  expect(freshView[2]!.visible).toBe(true);expect(freshView.every(n=>n.count===1)).toBe(true);
  125 |  expect(fresh.station!.phase).toBe('waiting');expect(fresh.entities).toEqual([]);
  126 |  expect(errors).toEqual([]);expect(blocked).toBe(0);
  127 |  await writeFile(info.outputPath('five-retries.json'),JSON.stringify({baseline,initial,attempts,fresh,freshView,blocked,errors},null,2));
  128 | });
  129 | 
  130 | test('a fresh page Continues a completed milestone with canonical assets, then New Game restores the visible card and locked door',async({page},info)=>{
  131 |  test.setTimeout(360_000);
  132 |  await page.addInitScript(()=>{
  133 |   if(sessionStorage.getItem('nw007-complete-fixture'))return;
  134 |   sessionStorage.setItem('nw007-complete-fixture','1');
  135 |   localStorage.setItem('night-ward:settings:v1',JSON.stringify({quality:'low',motion:'reduce',subtitles:true}));
  136 |   localStorage.setItem('night-ward:save:v1',JSON.stringify({version:1,checkpoint:'nw:checkpoint:station-approach',label:'Nurses’ Station',playSeconds:120,savedAt:1,sessions:1,
  137 |    opening:{version:1,milestone:'station-approach',station:{version:1,phase:'complete'},state:{version:1,awakened:true,cardAcquired:true,doorUnlocked:true,firstLinePlayed:true,secondLinePlayed:true,room106Tried:true,sightingSeen:true,stationReached:true}}}));
  138 |  });
  139 |  const states:unknown[]=[];
  140 |  await page.goto('/?test=1&menu=1');
  141 |  for(let load=0;load<2;load++) {
  142 |   if(load)await page.reload();
  143 |   await page.getByRole('button',{name:/^Continue/}).click();
  144 |   await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
  145 |   const state=await snap(page),view=await presentation(page);
  146 |   expect(state.station!.phase).toBe('complete');expect(state.station!.canCapture).toBe(false);
  147 |   expect(state.opening!.state).toMatchObject({cardAcquired:true,doorUnlocked:true});
  148 |   expect(view.every(n=>n.count===1)).toBe(true);expect(view[2]!.visible).toBe(false);
  149 |   states.push({state,view});
  150 |  }
  151 |  await page.getByRole('button',{name:'Enter ward',exact:true}).click();
  152 |  await expect.poll(async()=>(await snap(page)).state,wait).toBe('playing');
  153 |  await page.evaluate(()=>document.exitPointerLock());
  154 |  await expect.poll(async()=>(await snap(page)).state,wait).toBe('paused');
  155 |  await page.getByRole('button',{name:/^Return to Main Menu/}).click();await page.getByRole('button',{name:'Leave the ward',exact:true}).click();
  156 |  await page.getByRole('button',{name:/^New Game/}).click();await page.getByRole('button',{name:'Start new game',exact:true}).click();
  157 |  await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
  158 |  const fresh=await snap(page),view=await presentation(page);
  159 |  expect(fresh.station!.phase).toBe('waiting');expect(fresh.opening!.state).toMatchObject({cardAcquired:false,doorUnlocked:false,firstLinePlayed:false,secondLinePlayed:false});
  160 |  expect(view.every(n=>n.count===1)).toBe(true);expect(view[2]!.visible).toBe(true);expect(fresh.entities).toEqual([]);
  161 |  await info.attach('fresh-continue-new-game.json',{body:JSON.stringify({states,fresh,view},null,2),contentType:'application/json'});
  162 |  await page.screenshot({path:info.outputPath('03-new-game-after-completion.png')});
  163 | });
  164 | 
```