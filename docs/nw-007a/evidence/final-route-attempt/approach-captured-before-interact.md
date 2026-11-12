# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: nw-006b-encounter.spec.ts >> input-only normal game:104 puzzle, authored station introduction, cover,105 bed, autonomous stealth and exit checkpoint
- Location: tests/browser/nw-006b-encounter.spec.ts:57:1

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 7
Received:   7

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
  1   | import { expect, test, type Page } from '@playwright/test';
  2   | import { writeFile } from 'node:fs/promises';
  3   | import type { Application } from '../../src/integration/application';
  4   | import type { Vec3 } from '../../src/contracts';
  5   | const snap = (page: Page) => page.evaluate(() => window.nightWardTest!.snapshot());
  6   | const wait = { timeout: 120_000 };
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
> 50  |   await expect.poll(async () => (await snap(page)).events.filter(e => e.type === 'interaction:completed').length, wait).toBeGreaterThan(count);
      |                                                                                                                         ^ Error: expect(received).toBeGreaterThan(expected)
  51  | }
  52  | 
  53  | test.use({video:'on',launchOptions:{...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}});
  54  | test.describe.configure({timeout:1_500_000});
  55  | async function simWait(page:Page,seconds:number){const t=(await snap(page)).performance.simulatedSeconds;await expect.poll(async()=>(await snap(page)).performance.simulatedSeconds,{timeout:Math.max(wait.timeout,seconds*25_000)}).toBeGreaterThan(t+seconds)}
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
  107 |  // Capture can interrupt the physical entering transition when the entry was witnessed.
  108 |  await expect.poll(async()=>{const s=await snap(page);return s.state==='captured'||s.player!.hiding.state==='hidden'},wait).toBe(true);
  109 |  const hideStart=(await snap(page)).performance.simulatedSeconds;
  110 |  await expect.poll(async()=>{const state=await snap(page);return state.state==='captured'||state.performance.simulatedSeconds>hideStart+2},wait).toBe(true);
  111 |  const bedOutcome=await snap(page);phases.push(bedOutcome);
  112 |  if(bedOutcome.state==='captured'){
  113 |   // This was a genuine mistake: entering while observed must remain dangerous.
  114 |   expect(bedOutcome.station!.actor.lastKnownPlayer?.source).toBe('witnessed-hiding');
  115 |   await page.screenshot({path:info.outputPath('04-witnessed-entry-capture.png')});
  116 |   await page.getByRole('button',{name:'Restart from checkpoint',exact:true}).click();
  117 |   await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
  118 |   expect((await snap(page)).station!.phase).toBe('stealth');expect((await snap(page)).opening!.narrative?.checkpoint.step).toBe(6);
  119 |   if(process.env.NW005_SOFTWARE_SCALE==='1')await page.evaluate(()=>(window.nightWardTest as Application).services()!.renderer.setPixelRatio(.25));
  120 |   await page.getByRole('button',{name:'Enter ward',exact:true}).click();await expect.poll(async()=>(await snap(page)).state,wait).toBe('playing');
  121 |  }else{
  122 |   await page.screenshot({path:info.outputPath('04-room105-hidden.png')});
  123 |   await interact(page,'Leave hiding place');await expect.poll(async()=>(await snap(page)).player!.hiding.state,wait).toBe('outside');
  124 |   for(const point of s.returnRoute)await walk(page,point);
  125 |  }
  126 |  await walk(page,s.entry);await walk(page,s.exit);
  127 |  await expect.poll(async()=>(await snap(page)).station!.phase,wait).toBe('complete');
  128 |  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('night-ward:save:v1')!).opening?.station?.phase),wait).toBe('complete');
  129 |  const final=await snap(page);phases.push(final);expect(final.player!.captured).toBe(false);expect(final.station!.actor.type).toBe('nurse');expect(final.entities).toEqual([]);
  130 |  await page.screenshot({path:info.outputPath('04-escape.png')});
  131 |  await writeFile(info.outputPath('normal-route.json'),JSON.stringify({kind:'normal root game; keyboard/mouse movement only; no positioning or phase shortcuts',phases,final,errors},null,2));
  132 |  await pause(page);await page.getByRole('button',{name:/^Return to Main Menu/}).click();await page.getByRole('button',{name:'Leave the ward',exact:true}).click();
  133 |  await page.reload();await page.getByRole('button',{name:/^Continue/}).click();await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
  134 |  expect((await snap(page)).station!.phase).toBe('complete');expect((await snap(page)).player!.position.x).toBeCloseTo(s.exit.x,1);
  135 |  expect((await snap(page)).opening!.narrative?.checkpoint.step).toBe(7);
  136 |  expect((await snap(page)).opening!.narrative?.owners).toEqual([]);
  137 |  await page.getByRole('button',{name:'Enter ward',exact:true}).click();await expect.poll(async()=>(await snap(page)).state,wait).toBe('playing');
  138 |  await pause(page);await page.getByRole('button',{name:/^Return to Main Menu/}).click();await page.getByRole('button',{name:'Leave the ward',exact:true}).click();
  139 |  await page.getByRole('button',{name:/^New Game/}).click();await page.getByRole('button',{name:'Start new game',exact:true}).click();
  140 |  await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
  141 |  const fresh=await snap(page);expect(fresh.opening!.narrative?.scene).toBe('awakening');expect(fresh.opening!.state.cardAcquired).toBe(false);expect(fresh.station!.active).toBe(false);
  142 |  expect(errors).toEqual([]);
  143 | });
  144 | 
  145 | test('real capture after a forgiving first alert, restart restores stealth without repeating the introduction',async({page},info)=>{
  146 |  // Saved milestone fixture exercises the production Continue path; no actor or phase mutation.
  147 |  await page.addInitScript(()=>{
  148 |   localStorage.setItem('night-ward:settings:v1',JSON.stringify({quality:'low',motion:'reduce',subtitles:true}));
  149 |   localStorage.setItem('night-ward:save:v1',JSON.stringify({version:1,checkpoint:'nw:checkpoint:station-approach',label:'Nurses’ Station',playSeconds:42,savedAt:1,sessions:1,
  150 |    opening:{version:1,milestone:'station-approach',station:{version:1,phase:'stealth'},state:{version:1,awakened:true,cardAcquired:true,doorUnlocked:true,firstLinePlayed:true,secondLinePlayed:true,room106Tried:true,sightingSeen:true,stationReached:true}}}));
```