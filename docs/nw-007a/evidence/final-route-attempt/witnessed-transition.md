# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: nw-006b-encounter.spec.ts >> input-only normal game:104 puzzle, authored station introduction, cover,105 bed, autonomous stealth and exit checkpoint
- Location: tests/browser/nw-006b-encounter.spec.ts:57:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "hidden"
Received: "entering"

Call Log:
- Timeout 120000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - main "NIGHT WARD" [ref=e2]:
    - generic "NIGHT WARD hospital view" [ref=e3]
  - dialog "You were found" [ref=e4]:
    - paragraph [ref=e5]: Nurse Shaw · West Ward
    - heading "You were found" [level=2] [ref=e6]
    - button "Restart from checkpoint" [active] [ref=e7] [cursor=pointer]
```

# Test source

```ts
  7   | async function boot(page: Page) {
  8   |   const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  9   |   page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  10  |   await page.addInitScript(() => localStorage.setItem('night-ward:settings:v1', JSON.stringify({ quality: 'low', motion: 'full', subtitles: true })));
  11  |   await page.goto('/?test=1&menu=1');
  12  |   await page.getByRole('button', { name: /^New Game/ }).click();
  13  |   await expect.poll(async () => (await snap(page)).state, { timeout: 150_000 }).toBe('ready');
  14  |   // Only rendering is scaled for the software GPU; this never changes movement/physics clocks.
  15  |   if (process.env.NW005_SOFTWARE_SCALE === '1') await page.evaluate(() => (window.nightWardTest as Application).services()!.renderer.setPixelRatio(.25));
  16  |   await page.getByRole('button', { name: 'Enter ward', exact: true }).click();
  17  |   await expect.poll(async () => (await snap(page)).state, wait).toBe('playing');
  18  |   return errors;
  19  | }
  20  | async function look(page: Page, target: Vec3) {
  21  |   const s = await snap(page), p = s.opening!.camera;
  22  |   const dx = target.x - p.x, dy = target.y - p.y, dz = target.z - p.z;
  23  |   const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
  24  |   const delta = Math.atan2(Math.sin(yaw - s.player!.rotation.yaw), Math.cos(yaw - s.player!.rotation.yaw));
  25  |   await page.evaluate(({ x, y }) => document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: x, movementY: y })),
  26  |     { x: -delta / .002, y: -(pitch - s.player!.rotation.pitch) / .002 });
  27  | }
  28  | /** Uses only normal look + keyboard input. No teleport, aimAt, body or camera writes. */
  29  | async function walk(page: Page, target: Vec3, sprint=false) {
  30  |   const begin = Date.now();
  31  |   try {
  32  |     while (Date.now() - begin < 90_000) {
  33  |       const s = await snap(page), p = s.player!.position;
  34  |       if (Math.hypot(target.x - p.x, target.z - p.z) < .23) return;
  35  |       await look(page, { ...target, y: s.opening!.camera.y });
  36  |       if(sprint||(s.station?.phase==='stealth'&&s.station.actor.state==='pursue'))await page.keyboard.down('Shift');else await page.keyboard.up('Shift');
  37  |       await page.keyboard.down('w'); await page.waitForTimeout(80);
  38  |     }
  39  |     throw new Error(`Walk did not reach ${JSON.stringify(target)}; ${JSON.stringify((await snap(page)).player)}`);
  40  |   } finally { await page.keyboard.up('Shift');await page.keyboard.up('w');
  41  |     await expect.poll(async () => { const v = (await snap(page)).player!.velocity; return Math.hypot(v.x, v.z); }, wait).toBeLessThan(.03); }
  42  | }
  43  | async function interact(page: Page, text: string) {
  44  |   await expect(page.locator('.nw-opening-ui__prompt')).toContainText(text, wait);
  45  |   await expect(page.locator('.nw-opening-ui__prompt')).toBeVisible(wait);
  46  |   const s = await snap(page); const count = s.events.filter(e => e.type === 'interaction:completed').length;
  47  |   const now = s.performance.simulatedSeconds;
  48  |   await expect.poll(async () => (await snap(page)).performance.simulatedSeconds, wait).toBeGreaterThan(now + .6);
  49  |   await page.keyboard.press('e');
  50  |   await expect.poll(async () => (await snap(page)).events.filter(e => e.type === 'interaction:completed').length, wait).toBeGreaterThan(count);
  51  | }
  52  | 
  53  | test.use({video:'on',launchOptions:{...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}});
  54  | test.describe.configure({timeout:1_500_000});
  55  | async function simWait(page:Page,seconds:number){const t=(await snap(page)).performance.simulatedSeconds;await expect.poll(async()=>(await snap(page)).performance.simulatedSeconds,wait).toBeGreaterThan(t+seconds)}
  56  | async function pause(page:Page){await page.evaluate(()=>document.exitPointerLock());await expect.poll(async()=>(await snap(page)).state,wait).toBe('paused')}
  57  | test('input-only normal game:104 puzzle, authored station introduction, cover,105 bed, autonomous stealth and exit checkpoint',async({page},info)=>{
  58  |  const errors=await boot(page);const phases:unknown[]=[];
  59  |  await page.evaluate(()=>{window.nightWardTest!.teleport=()=>{throw Error('No teleport in normal route')};window.nightWardTest!.aimAt=()=>{throw Error('No aim shortcut in normal route')}});
  60  |  await expect.poll(async()=>(await snap(page)).opening!.state.awakened,wait).toBe(true);
  61  |  // Let the existing anti-key-bleed handoff observe neutral input before starting to walk.
  62  |  await simWait(page,.5);
  63  |  const a=(await snap(page)).opening!.anchors;
  64  |  expect((await snap(page)).station?.phase).toBe('waiting');
  65  |  const d=a['room-104-door']!,dir={x:d.stand!.x-d.position.x,z:d.stand!.z-d.position.z},len=Math.hypot(dir.x,dir.z);
  66  |  await walk(page,{x:d.position.x+dir.x/len*1.55,y:0,z:d.position.z+dir.z/len*1.55});await look(page,d.position);await interact(page,'Try door');
  67  |  await expect.poll(async()=>(await snap(page)).opening!.state.firstLinePlayed,wait).toBe(true);
  68  |  await walk(page,a['access-card']!.stand!);await look(page,a['access-card']!.position);await page.keyboard.press('c');
  69  |  await expect.poll(async()=>{const s=await snap(page);return s.opening!.camera.y-s.player!.position.y},wait).toBeLessThan(1.02);
  70  |  await look(page,a['access-card']!.position);await interact(page,'Take');await page.keyboard.press('c');
  71  |  await walk(page,a['card-reader']!.stand!);await look(page,a['card-reader']!.position);await interact(page,'reader');
  72  |  await expect.poll(async()=>(await snap(page)).opening!.state.doorUnlocked,wait).toBe(true);
  73  |  await walk(page,{x:d.position.x+dir.x/len*1.55,y:0,z:d.position.z+dir.z/len*1.55});await look(page,d.position);await interact(page,'Open');
  74  |  await expect.poll(async()=>(await snap(page)).doorStates['nw:door:room-104'],wait).toBe('open');
  75  |  const s=(await snap(page)).station!.locations;
  76  |  await walk(page,{...a['nurse-first-sight-view']!.position,y:0});await look(page,{...a['nurse-first-sight']!.position,y:1.4});
  77  |  await walk(page,s.observation);await look(page,{...s.patrol[3]!,y:1.5});
  78  |  expect((await snap(page)).station!.active).toBe(false);
  79  |  expect((await snap(page)).opening!.narrative?.scene).toBe('empty-corridor');
  80  |  expect(s.recordStand).toBeDefined();expect(s.record).toBeDefined();
  81  |  for(const point of s.recordRoute)await walk(page,point);
  82  |  await walk(page,s.recordStand!);await look(page,s.record!);await interact(page,'night register');
  83  |  await expect.poll(async()=>(await snap(page)).opening!.narrative?.checkpoint.step,wait).toBe(4);
  84  |  await expect.poll(async()=>(await snap(page)).station!.phase,wait).toBe('introduction');
  85  |  phases.push(await snap(page));await pause(page);const paused=(await snap(page)).station!;
  86  |  await page.waitForTimeout(500);expect((await snap(page)).station).toEqual(paused);
  87  |  await page.getByRole('button',{name:/^Resume/}).click();await expect.poll(async()=>(await snap(page)).state,wait).toBe('playing');
  88  |  await expect.poll(async()=>(await snap(page)).station!.action,{timeout:360_000}).toBe('check-panel');
  89  |  await look(page,{...(await snap(page)).station!.actor.position,y:1.4});await page.screenshot({path:info.outputPath('01-authored-station.png')});
  90  |  await expect.poll(async()=>(await snap(page)).station!.phase,{timeout:420_000}).toBe('tension');phases.push(await snap(page));
  91  |  // Scene five: the primary locker is learned while the authored routine is nonlethal.
  92  |  await walk(page,s.hidingApproaches[s.hidingPrimary]!);await look(page,s.hidingTargets[s.hidingPrimary]!);await interact(page,'Hide in locker');
  93  |  await expect.poll(async()=>(await snap(page)).player!.hiding.state,wait).toBe('hidden');
  94  |  await page.screenshot({path:info.outputPath('02-first-locker-hide.png')});
  95  |  await expect.poll(async()=>(await snap(page)).station!.phase,{timeout:240_000}).toBe('stealth');phases.push(await snap(page));
  96  |  expect((await snap(page)).player!.captured).toBe(false);
  97  |  // A real patrol observation before leaving cover, rather than a phase/actor shortcut.
  98  |  await expect.poll(async()=>{const p=(await snap(page)).station!.actor.position,q=s.hidingApproaches[s.hidingPrimary]!;return Math.hypot(p.x-q.x,p.z-q.z)},{timeout:180_000}).toBeGreaterThan(3.2);
  99  |  await interact(page,'Leave hiding place');await expect.poll(async()=>(await snap(page)).player!.hiding.state,wait).toBe('outside');
  100 |  await walk(page,s.recordStand!);
  101 |  for(const point of [...s.recordRoute].reverse())await walk(page,point);
  102 |  await walk(page,s.crouchCover);await page.keyboard.press('c');await expect.poll(async()=>(await snap(page)).player!.crouching,wait).toBe(true);
  103 |  await look(page,{...s.patrol[0]!,y:1.3});await page.screenshot({path:info.outputPath('03-real-trolley-cover.png')});
  104 |  await page.keyboard.press('c');await walk(page,s.observation);
  105 |  for(const point of s.concealmentRoute)await walk(page,point);
  106 |  await look(page,s.hidingTargets[s.hidingSecondary]!);await interact(page,'Hide under bed');
> 107 |  await expect.poll(async()=>(await snap(page)).player!.hiding.state,wait).toBe('hidden');
      |                                                                           ^ Error: expect(received).toBe(expected) // Object.is equality
  108 |  const hideStart=(await snap(page)).performance.simulatedSeconds;
  109 |  await expect.poll(async()=>{const state=await snap(page);return state.state==='captured'||state.performance.simulatedSeconds>hideStart+2},wait).toBe(true);
  110 |  const bedOutcome=await snap(page);phases.push(bedOutcome);
  111 |  if(bedOutcome.state==='captured'){
  112 |   // This was a genuine mistake: entering while observed must remain dangerous.
  113 |   expect(bedOutcome.station!.actor.lastKnownPlayer?.source).toBe('witnessed-hiding');
  114 |   await page.screenshot({path:info.outputPath('04-witnessed-entry-capture.png')});
  115 |   await page.getByRole('button',{name:'Restart from checkpoint',exact:true}).click();
  116 |   await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
  117 |   expect((await snap(page)).station!.phase).toBe('stealth');expect((await snap(page)).opening!.narrative?.checkpoint.step).toBe(6);
  118 |   if(process.env.NW005_SOFTWARE_SCALE==='1')await page.evaluate(()=>(window.nightWardTest as Application).services()!.renderer.setPixelRatio(.25));
  119 |   await page.getByRole('button',{name:'Enter ward',exact:true}).click();await expect.poll(async()=>(await snap(page)).state,wait).toBe('playing');
  120 |  }else{
  121 |   await page.screenshot({path:info.outputPath('04-room105-hidden.png')});
  122 |   await interact(page,'Leave hiding place');await expect.poll(async()=>(await snap(page)).player!.hiding.state,wait).toBe('outside');
  123 |   for(const point of s.returnRoute)await walk(page,point);
  124 |  }
  125 |  await walk(page,s.entry);await walk(page,s.exit);
  126 |  await expect.poll(async()=>(await snap(page)).station!.phase,wait).toBe('complete');
  127 |  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('night-ward:save:v1')!).opening?.station?.phase),wait).toBe('complete');
  128 |  const final=await snap(page);phases.push(final);expect(final.player!.captured).toBe(false);expect(final.station!.actor.type).toBe('nurse');expect(final.entities).toEqual([]);
  129 |  await page.screenshot({path:info.outputPath('04-escape.png')});
  130 |  await writeFile(info.outputPath('normal-route.json'),JSON.stringify({kind:'normal root game; keyboard/mouse movement only; no positioning or phase shortcuts',phases,final,errors},null,2));
  131 |  await pause(page);await page.getByRole('button',{name:/^Return to Main Menu/}).click();await page.getByRole('button',{name:'Leave the ward',exact:true}).click();
  132 |  await page.reload();await page.getByRole('button',{name:/^Continue/}).click();await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
  133 |  expect((await snap(page)).station!.phase).toBe('complete');expect((await snap(page)).player!.position.x).toBeCloseTo(s.exit.x,1);
  134 |  expect((await snap(page)).opening!.narrative?.checkpoint.step).toBe(7);
  135 |  expect((await snap(page)).opening!.narrative?.owners).toEqual([]);
  136 |  await page.getByRole('button',{name:'Enter ward',exact:true}).click();await expect.poll(async()=>(await snap(page)).state,wait).toBe('playing');
  137 |  await pause(page);await page.getByRole('button',{name:/^Return to Main Menu/}).click();await page.getByRole('button',{name:'Leave the ward',exact:true}).click();
  138 |  await page.getByRole('button',{name:/^New Game/}).click();await page.getByRole('button',{name:'Start new game',exact:true}).click();
  139 |  await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
  140 |  const fresh=await snap(page);expect(fresh.opening!.narrative?.scene).toBe('awakening');expect(fresh.opening!.state.cardAcquired).toBe(false);expect(fresh.station!.active).toBe(false);
  141 |  expect(errors).toEqual([]);
  142 | });
  143 | 
  144 | test('real capture after a forgiving first alert, restart restores stealth without repeating the introduction',async({page},info)=>{
  145 |  // Saved milestone fixture exercises the production Continue path; no actor or phase mutation.
  146 |  await page.addInitScript(()=>{
  147 |   localStorage.setItem('night-ward:settings:v1',JSON.stringify({quality:'low',motion:'reduce',subtitles:true}));
  148 |   localStorage.setItem('night-ward:save:v1',JSON.stringify({version:1,checkpoint:'nw:checkpoint:station-approach',label:'Nurses’ Station',playSeconds:42,savedAt:1,sessions:1,
  149 |    opening:{version:1,milestone:'station-approach',station:{version:1,phase:'stealth'},state:{version:1,awakened:true,cardAcquired:true,doorUnlocked:true,firstLinePlayed:true,secondLinePlayed:true,room106Tried:true,sightingSeen:true,stationReached:true}}}));
  150 |  });
  151 |  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  152 |  await page.goto('/?test=1&menu=1');await page.getByRole('button',{name:/^Continue/}).click();await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
  153 |  if(process.env.NW005_SOFTWARE_SCALE==='1')await page.evaluate(()=>(window.nightWardTest as Application).services()!.renderer.setPixelRatio(.25));
  154 |  await page.getByRole('button',{name:'Enter ward',exact:true}).click();await expect.poll(async()=>(await snap(page)).state,wait).toBe('playing');
  155 |  const s=(await snap(page)).station!.locations;await walk(page,s.entry);await walk(page,{...s.patrol[3]!,z:s.entry.z});
  156 |  await expect.poll(async()=>(await snap(page)).station!.firstAlertUsed,wait).toBe(true);
  157 |  expect((await snap(page)).player!.captured).toBe(false);await simWait(page,2);expect((await snap(page)).player!.captured).toBe(false);
  158 |  await expect.poll(async()=>(await snap(page)).state,{timeout:150_000}).toBe('captured');
  159 |  await page.screenshot({path:info.outputPath('05-real-capture.png')});
  160 |  const before=await snap(page);await page.getByRole('button',{name:/^Restart/}).click();
  161 |  if(await page.getByRole('dialog',{name:'Restart this session?'}).isVisible())await page.getByRole('button',{name:'Restart',exact:true}).click();
  162 |  await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
  163 |  const after=await snap(page);expect(after.station!.phase).toBe('stealth');expect(after.player!.captured).toBe(false);expect(after.sessionId).toBe(before.sessionId+1);
  164 |  expect(after.colliderCount).toBe(before.colliderCount);expect(await page.locator('canvas').count()).toBe(1);
  165 |  await writeFile(info.outputPath('capture-retry.json'),JSON.stringify({before,after,errors},null,2));expect(errors).toEqual([]);
  166 | });
  167 | 
  168 | test('shipping Low checkpoint restore: tension remains safe, pause and menu restart do not replay the entrance',async({page},info)=>{
  169 |  await page.addInitScript(()=>{
  170 |   localStorage.setItem('night-ward:settings:v1',JSON.stringify({quality:'low',motion:'reduce',subtitles:true}));
  171 |   localStorage.setItem('night-ward:save:v1',JSON.stringify({version:1,checkpoint:'nw:checkpoint:station-approach',label:'Nurses’ Station',playSeconds:20,savedAt:1,sessions:1,
  172 |    opening:{version:1,milestone:'station-approach',station:{version:1,phase:'tension'},state:{version:1,awakened:true,cardAcquired:true,doorUnlocked:true,firstLinePlayed:true,secondLinePlayed:true,room106Tried:true,sightingSeen:true,stationReached:true}}}));
  173 |  });
  174 |  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  175 |  await page.goto('/?test=1&menu=1');await page.getByRole('button',{name:/^Continue/}).click();await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
  176 |  await page.getByRole('button',{name:'Enter ward',exact:true}).click();await expect.poll(async()=>(await snap(page)).state,wait).toBe('playing');
  177 |  const view=(await snap(page)).station!.locations;
  178 |  await walk(page,view.crouchCover);
  179 |  await look(page,{...(await snap(page)).station!.actor.position,y:1.4});
  180 |  const rendered=(await snap(page)).frameCount;
  181 |  await expect.poll(async()=>(await snap(page)).frameCount,wait).toBeGreaterThan(rendered+1);
  182 |  await page.screenshot({path:info.outputPath('06-native-station.png')});
  183 |  expect(await page.evaluate(()=>(window.nightWardTest as Application).services()!.renderer.getPixelRatio())).toBe(.75);
  184 |  await pause(page);const before=await snap(page);expect(before.station!.phase).toBe('tension');expect(before.station!.canCapture).toBe(false);
  185 |  await page.waitForTimeout(500);expect((await snap(page)).station).toEqual(before.station);
  186 |  await page.getByRole('button',{name:/^Restart Session/}).click();await page.getByRole('button',{name:'Restart',exact:true}).click();
  187 |  await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
  188 |  const after=await snap(page);expect(after.station!.phase).toBe('tension');expect(after.player!.captured).toBe(false);
  189 |  expect(after.colliderCount).toBe(before.colliderCount);expect(await page.locator('canvas').count()).toBe(1);
  190 |  await writeFile(info.outputPath('tension-restart-native-low.json'),JSON.stringify({before,after,errors},null,2));expect(errors).toEqual([]);
  191 | });
  192 | 
  193 | 
  194 | test('autonomous stealth: real sprint sound is investigated but unseen Room105 bed entry conceals the player',async({page},info)=>{
  195 |  await page.addInitScript(()=>{
  196 |   localStorage.setItem('night-ward:settings:v1',JSON.stringify({quality:'low',motion:'reduce',subtitles:true}));
  197 |   localStorage.setItem('night-ward:save:v1',JSON.stringify({version:1,checkpoint:'nw:checkpoint:station-approach',label:'Nurses’ Station',playSeconds:42,savedAt:1,sessions:1,
  198 |    opening:{version:1,milestone:'station-approach',station:{version:1,phase:'stealth'},state:{version:1,awakened:true,cardAcquired:true,doorUnlocked:true,firstLinePlayed:true,secondLinePlayed:true,room106Tried:true,sightingSeen:true,stationReached:true}}}));
  199 |  });
  200 |  await page.goto('/?test=1&menu=1');await page.getByRole('button',{name:/^Continue/}).click();await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
  201 |  if(process.env.NW005_SOFTWARE_SCALE==='1')await page.evaluate(()=>(window.nightWardTest as Application).services()!.renderer.setPixelRatio(.25));
  202 |  await page.getByRole('button',{name:'Enter ward',exact:true}).click();await expect.poll(async()=>(await snap(page)).state,wait).toBe('playing');
  203 |  const locations=(await snap(page)).station!.locations;
  204 |  for(const [i,point] of locations.concealmentRoute.entries()){
  205 |   if(i===1)await walk(page,point,true);
  206 |   else {if(i===2)await page.keyboard.press('c');await walk(page,point);}
  207 |  }
```