import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import type { Application } from '../../src/integration/application';
import type { Vec3 } from '../../src/contracts';
const snap = (page: Page) => page.evaluate(() => window.nightWardTest!.snapshot());
const wait = { timeout: 120_000 };
async function boot(page: Page) {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  await page.addInitScript(() => localStorage.setItem('night-ward:settings:v1', JSON.stringify({ quality: 'low', motion: 'full', subtitles: true })));
  await page.goto('/?test=1&menu=1');
  await page.getByRole('button', { name: /^New Game/ }).click();
  await expect.poll(async () => (await snap(page)).state, { timeout: 150_000 }).toBe('ready');
  // Only rendering is scaled for the software GPU; this never changes movement/physics clocks.
  if (process.env.NW005_SOFTWARE_SCALE === '1') await page.evaluate(() => (window.nightWardTest as Application).services()!.renderer.setPixelRatio(.25));
  await page.getByRole('button', { name: 'Enter ward', exact: true }).click();
  await expect.poll(async () => (await snap(page)).state, wait).toBe('playing');
  return errors;
}
async function look(page: Page, target: Vec3) {
  const s = await snap(page), p = s.opening!.camera;
  const dx = target.x - p.x, dy = target.y - p.y, dz = target.z - p.z;
  const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
  const delta = Math.atan2(Math.sin(yaw - s.player!.rotation.yaw), Math.cos(yaw - s.player!.rotation.yaw));
  await page.evaluate(({ x, y }) => document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: x, movementY: y })),
    { x: -delta / .002, y: -(pitch - s.player!.rotation.pitch) / .002 });
}
/** Uses only normal look + keyboard input. No teleport, aimAt, body or camera writes. */
async function walk(page: Page, target: Vec3, sprint=false) {
  const begin = Date.now();
  try {
    while (Date.now() - begin < 90_000) {
      const s = await snap(page), p = s.player!.position;
      if (Math.hypot(target.x - p.x, target.z - p.z) < .23) return;
      await look(page, { ...target, y: s.opening!.camera.y });
      if(sprint||(s.station?.phase==='stealth'&&s.station.actor.state==='pursue'))await page.keyboard.down('Shift');else await page.keyboard.up('Shift');
      await page.keyboard.down('w'); await page.waitForTimeout(80);
    }
    throw new Error(`Walk did not reach ${JSON.stringify(target)}; ${JSON.stringify((await snap(page)).player)}`);
  } finally { await page.keyboard.up('Shift');await page.keyboard.up('w');
    await expect.poll(async () => { const v = (await snap(page)).player!.velocity; return Math.hypot(v.x, v.z); }, wait).toBeLessThan(.03); }
}
async function interact(page: Page, text: string) {
  await expect(page.locator('.nw-opening-ui__prompt')).toContainText(text, wait);
  await expect(page.locator('.nw-opening-ui__prompt')).toBeVisible(wait);
  const s = await snap(page); const count = s.events.filter(e => e.type === 'interaction:completed').length;
  const now = s.performance.simulatedSeconds;
  await expect.poll(async () => (await snap(page)).performance.simulatedSeconds, wait).toBeGreaterThan(now + .6);
  await page.keyboard.press('e');
  await expect.poll(async () => (await snap(page)).events.filter(e => e.type === 'interaction:completed').length, wait).toBeGreaterThan(count);
}

test.use({video:'on',launchOptions:{...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}});
test.describe.configure({timeout:1_500_000});
async function simWait(page:Page,seconds:number){const t=(await snap(page)).performance.simulatedSeconds;await expect.poll(async()=>(await snap(page)).performance.simulatedSeconds,wait).toBeGreaterThan(t+seconds)}
async function pause(page:Page){await page.evaluate(()=>document.exitPointerLock());await expect.poll(async()=>(await snap(page)).state,wait).toBe('paused')}
test('input-only normal game:104 puzzle, authored station introduction, cover,105 bed, autonomous stealth and exit checkpoint',async({page},info)=>{
 const errors=await boot(page);const phases:unknown[]=[];
 await page.evaluate(()=>{window.nightWardTest!.teleport=()=>{throw Error('No teleport in normal route')};window.nightWardTest!.aimAt=()=>{throw Error('No aim shortcut in normal route')}});
 await expect.poll(async()=>(await snap(page)).opening!.state.awakened,wait).toBe(true);
 // Let the existing anti-key-bleed handoff observe neutral input before starting to walk.
 await simWait(page,.5);
 const a=(await snap(page)).opening!.anchors;
 expect((await snap(page)).station?.phase).toBe('waiting');
 const d=a['room-104-door']!,dir={x:d.stand!.x-d.position.x,z:d.stand!.z-d.position.z},len=Math.hypot(dir.x,dir.z);
 await walk(page,{x:d.position.x+dir.x/len*1.55,y:0,z:d.position.z+dir.z/len*1.55});await look(page,d.position);await interact(page,'Try door');
 await expect.poll(async()=>(await snap(page)).opening!.state.firstLinePlayed,wait).toBe(true);
 await walk(page,a['access-card']!.stand!);await look(page,a['access-card']!.position);await page.keyboard.press('c');
 await expect.poll(async()=>{const s=await snap(page);return s.opening!.camera.y-s.player!.position.y},wait).toBeLessThan(1.02);
 await look(page,a['access-card']!.position);await interact(page,'Take');await page.keyboard.press('c');
 await walk(page,a['card-reader']!.stand!);await look(page,a['card-reader']!.position);await interact(page,'reader');
 await expect.poll(async()=>(await snap(page)).opening!.state.doorUnlocked,wait).toBe(true);
 await walk(page,{x:d.position.x+dir.x/len*1.55,y:0,z:d.position.z+dir.z/len*1.55});await look(page,d.position);await interact(page,'Open');
 await expect.poll(async()=>(await snap(page)).doorStates['nw:door:room-104'],wait).toBe('open');
 const s=(await snap(page)).station!.locations;
 await walk(page,{...a['nurse-first-sight-view']!.position,y:0});await look(page,{...a['nurse-first-sight']!.position,y:1.4});
 await walk(page,s.observation);await look(page,{...s.patrol[3]!,y:1.5});
 expect((await snap(page)).station!.active).toBe(false);
 expect((await snap(page)).opening!.narrative?.scene).toBe('empty-corridor');
 expect(s.recordStand).toBeDefined();expect(s.record).toBeDefined();
 for(const point of s.recordRoute)await walk(page,point);
 await walk(page,s.recordStand!);await look(page,s.record!);await interact(page,'night register');
 await expect.poll(async()=>(await snap(page)).opening!.narrative?.checkpoint.step,wait).toBe(4);
 await expect.poll(async()=>(await snap(page)).station!.phase,wait).toBe('introduction');
 phases.push(await snap(page));await pause(page);const paused=(await snap(page)).station!;
 await page.waitForTimeout(500);expect((await snap(page)).station).toEqual(paused);
 await page.getByRole('button',{name:/^Resume/}).click();await expect.poll(async()=>(await snap(page)).state,wait).toBe('playing');
 await expect.poll(async()=>(await snap(page)).station!.action,{timeout:360_000}).toBe('check-panel');
 await look(page,{...(await snap(page)).station!.actor.position,y:1.4});await page.screenshot({path:info.outputPath('01-authored-station.png')});
 await expect.poll(async()=>(await snap(page)).station!.phase,{timeout:420_000}).toBe('tension');phases.push(await snap(page));
 // Scene five: the primary locker is learned while the authored routine is nonlethal.
 await walk(page,s.hidingApproaches[s.hidingPrimary]!);await look(page,s.hidingTargets[s.hidingPrimary]!);await interact(page,'Hide in locker');
 await expect.poll(async()=>(await snap(page)).player!.hiding.state,wait).toBe('hidden');
 await page.screenshot({path:info.outputPath('02-first-locker-hide.png')});
 await expect.poll(async()=>(await snap(page)).station!.phase,{timeout:240_000}).toBe('stealth');phases.push(await snap(page));
 expect((await snap(page)).player!.captured).toBe(false);
 // A real patrol observation before leaving cover, rather than a phase/actor shortcut.
 await expect.poll(async()=>{const p=(await snap(page)).station!.actor.position,q=s.hidingApproaches[s.hidingPrimary]!;return Math.hypot(p.x-q.x,p.z-q.z)},{timeout:180_000}).toBeGreaterThan(3.2);
 await interact(page,'Leave hiding place');await expect.poll(async()=>(await snap(page)).player!.hiding.state,wait).toBe('outside');
 await walk(page,s.recordStand!);
 for(const point of [...s.recordRoute].reverse())await walk(page,point);
 await walk(page,s.crouchCover);await page.keyboard.press('c');await expect.poll(async()=>(await snap(page)).player!.crouching,wait).toBe(true);
 await look(page,{...s.patrol[0]!,y:1.3});await page.screenshot({path:info.outputPath('03-real-trolley-cover.png')});
 await page.keyboard.press('c');await walk(page,s.observation);
 for(const point of s.concealmentRoute)await walk(page,point);
 await look(page,s.hidingTargets[s.hidingSecondary]!);await interact(page,'Hide under bed');
 await expect.poll(async()=>(await snap(page)).player!.hiding.state,wait).toBe('hidden');
 const hideStart=(await snap(page)).performance.simulatedSeconds;
 await expect.poll(async()=>{const state=await snap(page);return state.state==='captured'||state.performance.simulatedSeconds>hideStart+2},wait).toBe(true);
 const bedOutcome=await snap(page);phases.push(bedOutcome);
 if(bedOutcome.state==='captured'){
  // This was a genuine mistake: entering while observed must remain dangerous.
  expect(bedOutcome.station!.actor.lastKnownPlayer?.source).toBe('witnessed-hiding');
  await page.screenshot({path:info.outputPath('04-witnessed-entry-capture.png')});
  await page.getByRole('button',{name:'Restart from checkpoint',exact:true}).click();
  await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
  expect((await snap(page)).station!.phase).toBe('stealth');expect((await snap(page)).opening!.narrative?.checkpoint.step).toBe(6);
  if(process.env.NW005_SOFTWARE_SCALE==='1')await page.evaluate(()=>(window.nightWardTest as Application).services()!.renderer.setPixelRatio(.25));
  await page.getByRole('button',{name:'Enter ward',exact:true}).click();await expect.poll(async()=>(await snap(page)).state,wait).toBe('playing');
 }else{
  await page.screenshot({path:info.outputPath('04-room105-hidden.png')});
  await interact(page,'Leave hiding place');await expect.poll(async()=>(await snap(page)).player!.hiding.state,wait).toBe('outside');
  for(const point of s.returnRoute)await walk(page,point);
 }
 await walk(page,s.entry);await walk(page,s.exit);
 await expect.poll(async()=>(await snap(page)).station!.phase,wait).toBe('complete');
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('night-ward:save:v1')!).opening?.station?.phase),wait).toBe('complete');
 const final=await snap(page);phases.push(final);expect(final.player!.captured).toBe(false);expect(final.station!.actor.type).toBe('nurse');expect(final.entities).toEqual([]);
 await page.screenshot({path:info.outputPath('04-escape.png')});
 await writeFile(info.outputPath('normal-route.json'),JSON.stringify({kind:'normal root game; keyboard/mouse movement only; no positioning or phase shortcuts',phases,final,errors},null,2));
 await pause(page);await page.getByRole('button',{name:/^Return to Main Menu/}).click();await page.getByRole('button',{name:'Leave the ward',exact:true}).click();
 await page.reload();await page.getByRole('button',{name:/^Continue/}).click();await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
 expect((await snap(page)).station!.phase).toBe('complete');expect((await snap(page)).player!.position.x).toBeCloseTo(s.exit.x,1);
 expect((await snap(page)).opening!.narrative?.checkpoint.step).toBe(7);
 expect((await snap(page)).opening!.narrative?.owners).toEqual([]);
 await page.getByRole('button',{name:'Enter ward',exact:true}).click();await expect.poll(async()=>(await snap(page)).state,wait).toBe('playing');
 await pause(page);await page.getByRole('button',{name:/^Return to Main Menu/}).click();await page.getByRole('button',{name:'Leave the ward',exact:true}).click();
 await page.getByRole('button',{name:/^New Game/}).click();await page.getByRole('button',{name:'Start new game',exact:true}).click();
 await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
 const fresh=await snap(page);expect(fresh.opening!.narrative?.scene).toBe('awakening');expect(fresh.opening!.state.cardAcquired).toBe(false);expect(fresh.station!.active).toBe(false);
 expect(errors).toEqual([]);
});

test('real capture after a forgiving first alert, restart restores stealth without repeating the introduction',async({page},info)=>{
 // Saved milestone fixture exercises the production Continue path; no actor or phase mutation.
 await page.addInitScript(()=>{
  localStorage.setItem('night-ward:settings:v1',JSON.stringify({quality:'low',motion:'reduce',subtitles:true}));
  localStorage.setItem('night-ward:save:v1',JSON.stringify({version:1,checkpoint:'nw:checkpoint:station-approach',label:'Nurses’ Station',playSeconds:42,savedAt:1,sessions:1,
   opening:{version:1,milestone:'station-approach',station:{version:1,phase:'stealth'},state:{version:1,awakened:true,cardAcquired:true,doorUnlocked:true,firstLinePlayed:true,secondLinePlayed:true,room106Tried:true,sightingSeen:true,stationReached:true}}}));
 });
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?test=1&menu=1');await page.getByRole('button',{name:/^Continue/}).click();await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
 if(process.env.NW005_SOFTWARE_SCALE==='1')await page.evaluate(()=>(window.nightWardTest as Application).services()!.renderer.setPixelRatio(.25));
 await page.getByRole('button',{name:'Enter ward',exact:true}).click();await expect.poll(async()=>(await snap(page)).state,wait).toBe('playing');
 const s=(await snap(page)).station!.locations;await walk(page,s.entry);await walk(page,{...s.patrol[3]!,z:s.entry.z});
 await expect.poll(async()=>(await snap(page)).station!.firstAlertUsed,wait).toBe(true);
 expect((await snap(page)).player!.captured).toBe(false);await simWait(page,2);expect((await snap(page)).player!.captured).toBe(false);
 await expect.poll(async()=>(await snap(page)).state,{timeout:150_000}).toBe('captured');
 await page.screenshot({path:info.outputPath('05-real-capture.png')});
 const before=await snap(page);await page.getByRole('button',{name:/^Restart/}).click();
 if(await page.getByRole('dialog',{name:'Restart this session?'}).isVisible())await page.getByRole('button',{name:'Restart',exact:true}).click();
 await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
 const after=await snap(page);expect(after.station!.phase).toBe('stealth');expect(after.player!.captured).toBe(false);expect(after.sessionId).toBe(before.sessionId+1);
 expect(after.colliderCount).toBe(before.colliderCount);expect(await page.locator('canvas').count()).toBe(1);
 await writeFile(info.outputPath('capture-retry.json'),JSON.stringify({before,after,errors},null,2));expect(errors).toEqual([]);
});

test('shipping Low checkpoint restore: tension remains safe, pause and menu restart do not replay the entrance',async({page},info)=>{
 await page.addInitScript(()=>{
  localStorage.setItem('night-ward:settings:v1',JSON.stringify({quality:'low',motion:'reduce',subtitles:true}));
  localStorage.setItem('night-ward:save:v1',JSON.stringify({version:1,checkpoint:'nw:checkpoint:station-approach',label:'Nurses’ Station',playSeconds:20,savedAt:1,sessions:1,
   opening:{version:1,milestone:'station-approach',station:{version:1,phase:'tension'},state:{version:1,awakened:true,cardAcquired:true,doorUnlocked:true,firstLinePlayed:true,secondLinePlayed:true,room106Tried:true,sightingSeen:true,stationReached:true}}}));
 });
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?test=1&menu=1');await page.getByRole('button',{name:/^Continue/}).click();await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
 await page.getByRole('button',{name:'Enter ward',exact:true}).click();await expect.poll(async()=>(await snap(page)).state,wait).toBe('playing');
 const view=(await snap(page)).station!.locations;
 await walk(page,view.crouchCover);
 await look(page,{...(await snap(page)).station!.actor.position,y:1.4});
 const rendered=(await snap(page)).frameCount;
 await expect.poll(async()=>(await snap(page)).frameCount,wait).toBeGreaterThan(rendered+1);
 await page.screenshot({path:info.outputPath('06-native-station.png')});
 expect(await page.evaluate(()=>(window.nightWardTest as Application).services()!.renderer.getPixelRatio())).toBe(.75);
 await pause(page);const before=await snap(page);expect(before.station!.phase).toBe('tension');expect(before.station!.canCapture).toBe(false);
 await page.waitForTimeout(500);expect((await snap(page)).station).toEqual(before.station);
 await page.getByRole('button',{name:/^Restart Session/}).click();await page.getByRole('button',{name:'Restart',exact:true}).click();
 await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
 const after=await snap(page);expect(after.station!.phase).toBe('tension');expect(after.player!.captured).toBe(false);
 expect(after.colliderCount).toBe(before.colliderCount);expect(await page.locator('canvas').count()).toBe(1);
 await writeFile(info.outputPath('tension-restart-native-low.json'),JSON.stringify({before,after,errors},null,2));expect(errors).toEqual([]);
});


test('autonomous stealth: real sprint sound is investigated but unseen Room105 bed entry conceals the player',async({page},info)=>{
 await page.addInitScript(()=>{
  localStorage.setItem('night-ward:settings:v1',JSON.stringify({quality:'low',motion:'reduce',subtitles:true}));
  localStorage.setItem('night-ward:save:v1',JSON.stringify({version:1,checkpoint:'nw:checkpoint:station-approach',label:'Nurses’ Station',playSeconds:42,savedAt:1,sessions:1,
   opening:{version:1,milestone:'station-approach',station:{version:1,phase:'stealth'},state:{version:1,awakened:true,cardAcquired:true,doorUnlocked:true,firstLinePlayed:true,secondLinePlayed:true,room106Tried:true,sightingSeen:true,stationReached:true}}}));
 });
 await page.goto('/?test=1&menu=1');await page.getByRole('button',{name:/^Continue/}).click();await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
 if(process.env.NW005_SOFTWARE_SCALE==='1')await page.evaluate(()=>(window.nightWardTest as Application).services()!.renderer.setPixelRatio(.25));
 await page.getByRole('button',{name:'Enter ward',exact:true}).click();await expect.poll(async()=>(await snap(page)).state,wait).toBe('playing');
 const locations=(await snap(page)).station!.locations;
 for(const [i,point] of locations.concealmentRoute.entries()){
  if(i===1)await walk(page,point,true);
  else {if(i===2)await page.keyboard.press('c');await walk(page,point);}
 }
 await look(page,locations.hidingTargets[locations.hidingSecondary]!);await interact(page,'Hide under bed');
 await expect.poll(async()=>(await snap(page)).player!.hiding.state,wait).toBe('hidden');
 await simWait(page,12);const hidden=await snap(page);
 expect(hidden.player!.captured).toBe(false);expect(hidden.station!.actor.lastKnownPlayer?.source).not.toBe('witnessed-hiding');
 expect(hidden.events.some(e=>e.type==='entity:state'&&(e.payload as {current:string}).current==='investigate')).toBe(true);
 await page.screenshot({path:info.outputPath('05-unseen-entry-hidden.png')});
 await writeFile(info.outputPath('unseen-bed.json'),JSON.stringify(hidden,null,2));
});
