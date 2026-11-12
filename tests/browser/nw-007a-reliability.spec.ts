import {test,expect} from '@playwright/test';
import type {Application} from '../../src/integration/application';
import type {Vec3} from '../../src/contracts';
import type {Page} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const snap=(page:import('@playwright/test').Page)=>page.evaluate(()=>window.nightWardTest!.snapshot());
test.use({launchOptions:{...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}});
test('canonical assets survive retry when a later asset request fails; no legacy playable fallback',async({page},info)=>{
 test.setTimeout(360_000);
 const warnings:string[]=[];page.on('console',m=>{if(m.type()==='warning')warnings.push(m.text())});
 await page.addInitScript(()=>localStorage.setItem('night-ward:settings:v1',JSON.stringify({quality:'low',motion:'reduce'})));
 await page.goto('/?test=1&menu=1');await page.getByRole('button',{name:/^New Game/}).click();
 await expect.poll(async()=>(await snap(page)).state,{timeout:150_000}).toBe('ready');
 const inspect=()=>page.evaluate(()=>{
  const scene=(window.nightWardTest as Application).services()!.scene;
  const room=scene.getObjectByName('nw:room104-set'),station=scene.getObjectByName('nw:station-set'),card=scene.getObjectByName('nw:opening:access-card-prop');
  let rooms=0,cards=0;scene.traverse(n=>{if(n.name==='nw:room104-set')rooms++;if(n.name==='nw:opening:access-card-prop')cards++});
  return {room:!!room,station:!!station,card:!!card,cardVisible:card?.visible,rooms,cards};
 });
 const before=await inspect();expect(before).toMatchObject({room:true,station:true,card:true,cardVisible:true,rooms:1,cards:1});
 // Deterministic reproduction of the human report: only later asset retrieval fails.
 // Initial New Game loaded the actual canonical set. This diagnostic calls the same
 // application restart used by capture; separate UI tests exercise actual AI capture.
 let blocked=0;await page.route(/(room104_set.*\.glb|room104_lightmap.*\.jpg|station_set.*\.glb)/,r=>{blocked++;return r.abort('failed')});
 await page.evaluate(()=>window.nightWardTest!.restart());
 await expect.poll(async()=>(await snap(page)).state,{timeout:150_000}).toBe('ready');
 const after=await inspect();
 await info.attach('canonical-retry.json',{body:JSON.stringify({before,after,blocked,warnings},null,2),contentType:'application/json'});
 expect(after,'Retry must retain the same canonical environment, physical card and station').toEqual(before);
 expect(warnings.filter(w=>/procedural room|stand-ins/.test(w))).toEqual([]);
});

const wait={timeout:120_000};
async function look(page:Page,target:Vec3) {
 const s=await snap(page),p=s.opening!.camera;
 const dx=target.x-p.x,dy=target.y-p.y,dz=target.z-p.z;
 const yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(dy,Math.hypot(dx,dz));
 const delta=Math.atan2(Math.sin(yaw-s.player!.rotation.yaw),Math.cos(yaw-s.player!.rotation.yaw));
 await page.evaluate(({x,y})=>document.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,movementX:x,movementY:y})),{x:-delta/.002,y:-(pitch-s.player!.rotation.pitch)/.002});
}
async function walk(page:Page,target:Vec3) {
 const start=Date.now();
 try {
  while(Date.now()-start<90_000) {
   const s=await snap(page),p=s.player!.position;
   if(Math.hypot(target.x-p.x,target.z-p.z)<.23)return;
   await look(page,{...target,y:s.opening!.camera.y});await page.keyboard.down('w');await page.waitForTimeout(80);
  }
  throw Error(`Input walk failed: ${JSON.stringify((await snap(page)).player)}`);
 }finally{await page.keyboard.up('w')}
}
async function presentation(page:Page) {
 return page.evaluate(()=>{
  const scene=(window.nightWardTest as Application).services()!.scene;
  const names=['nw:room104-set','nw:station-set','nw:opening:access-card-prop','nw:opening:nurse-sighting'];
  return names.map(name=>{
   const nodes:import('three').Object3D[]=[];scene.traverse(n=>{if(n.name===name)nodes.push(n)});
   const node=nodes[0];let meshes=0;const clocks:string[]=[];
   node?.traverse(n=>{if('isMesh' in n)meshes++;if(/clock/i.test(n.name))clocks.push(n.name)});
   return {name,count:nodes.length,uuid:node?.uuid,visible:node?.visible,meshes,clocks};
  });
 });
}
test('five real Nurse captures and UI retries preserve canonical assets, saved card and one actor; New Game resets fresh state',async({page},info)=>{
 test.setTimeout(1_500_000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 // A valid saved stealth milestone, not a live phase/position mutation. The test
 // walks into real AI perception on each attempt and uses the public capture UI.
 await page.addInitScript(()=>{
  if(sessionStorage.getItem('nw007-fixture'))return;
  sessionStorage.setItem('nw007-fixture','1');
  localStorage.setItem('night-ward:settings:v1',JSON.stringify({quality:'low',motion:'reduce',subtitles:true}));
  localStorage.setItem('night-ward:save:v1',JSON.stringify({version:1,checkpoint:'nw:checkpoint:station-approach',label:'Nurses’ Station',playSeconds:42,savedAt:1,sessions:1,
   opening:{version:1,milestone:'station-approach',station:{version:1,phase:'stealth'},state:{version:1,awakened:true,cardAcquired:true,doorUnlocked:true,firstLinePlayed:true,secondLinePlayed:true,room106Tried:true,sightingSeen:true,stationReached:true}}}));
 });
 await page.goto('/?test=1&menu=1');await page.getByRole('button',{name:/^Continue/}).click();
 await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
 const baseline=await snap(page),initial=await presentation(page),attempts:unknown[]=[];
 expect(initial.every(n=>n.count===1)).toBe(true);
 expect(initial[0]!.meshes).toBeGreaterThan(0);
 expect(initial[2]!.visible).toBe(false);
 // All later retrievals fail: retry must parse fresh instances from owned bytes.
 let blocked=0;await page.route(/(room104_set.*\.glb|room104_lightmap.*\.jpg|station_set.*\.glb|nurse.*\.glb)/,r=>{blocked++;return r.abort('failed')});
 let previous=initial;
 for(let attempt=1;attempt<=5;attempt++) {
  if(process.env.NW005_SOFTWARE_SCALE==='1')await page.evaluate(()=>(window.nightWardTest as Application).services()!.renderer.setPixelRatio(.25));
  await page.getByRole('button',{name:'Enter ward',exact:true}).click();
  await expect.poll(async()=>(await snap(page)).state,wait).toBe('playing');
  const locations=(await snap(page)).station!.locations;
  await walk(page,locations.entry);await walk(page,{...locations.patrol[3]!,z:locations.entry.z});
  await expect.poll(async()=>(await snap(page)).station!.firstAlertUsed,wait).toBe(true);
  expect((await snap(page)).player!.captured).toBe(false);
  await expect.poll(async()=>(await snap(page)).state,{timeout:150_000}).toBe('captured');
  if(attempt===1)await page.screenshot({path:info.outputPath('01-real-capture.png')});
  await expect.poll(async()=>(await snap(page)).opening!.nurse?.clip,wait).toBe('capture');
  await expect.poll(async()=>(await snap(page)).events.some(e=>e.type==='atmosphere:sound'&&(e.payload as {cueId:string;action:string}).cueId==='nw:capture'&&(e.payload as {action:string}).action==='play'),wait).toBe(true);
  const sound=await page.evaluate(()=>(window.nightWardTest as Application).services()!.scene.getObjectByName('nw:hospital')!.userData.nwSoundDiagnostics());
  expect(sound.loops).not.toContain('nw:station-hum');
  const captured=await snap(page);expect(captured.opening!.nurse?.available).toBe(true);
  await page.getByRole('button',{name:'Restart from checkpoint',exact:true}).click();
  await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
  const restored=await snap(page),view=await presentation(page);
  expect(restored.sessionId).toBe(captured.sessionId+1);
  expect(restored.player!.captured).toBe(false);expect(restored.station!.phase).toBe('stealth');
  expect(restored.opening!.nurse?.clip).toBeNull();expect(restored.opening!.nurse?.humActive).toBe(false);
  const cleanAudio=await page.evaluate(()=>(window.nightWardTest as Application).services()!.scene.getObjectByName('nw:hospital')!.userData.nwSoundDiagnostics());
  expect(cleanAudio.loops).toEqual([]);expect(cleanAudio.cinematicVoices).toEqual([]);
  expect(restored.opening!.state).toEqual(baseline.opening!.state);
  expect(restored.colliderCount).toBe(baseline.colliderCount);expect(restored.entities).toEqual([]);
  expect(await page.locator('canvas').count()).toBe(1);
  expect(view.every(n=>n.count===1)).toBe(true);
  view.forEach((n,i)=>{
   expect(n.uuid).not.toBe(previous[i]!.uuid);
   expect({...n,uuid:null}).toEqual({...initial[i]!,uuid:null});
  });
  attempts.push({attempt,captured,restored,presentation:view});previous=view;
  console.log(`Verified capture/retry ${attempt}/5`);
 }
 await page.screenshot({path:info.outputPath('02-fifth-retry.png')});
 // New Game through the normal menu must discard card/door state, while keeping
 // the canonical scene, rather than reusing the previous attempt's hidden card.
 await page.getByRole('button',{name:'Enter ward',exact:true}).click();
 await expect.poll(async()=>(await snap(page)).state,wait).toBe('playing');
 await page.evaluate(()=>document.exitPointerLock());
 await expect.poll(async()=>(await snap(page)).state,wait).toBe('paused');
 await page.getByRole('button',{name:/^Return to Main Menu/}).click();
 await page.getByRole('button',{name:'Leave the ward',exact:true}).click();
 await page.getByRole('button',{name:/^New Game/}).click();
 await page.getByRole('button',{name:'Start new game',exact:true}).click();
 await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
 const fresh=await snap(page),freshView=await presentation(page);
 expect(fresh.opening!.state.cardAcquired).toBe(false);expect(fresh.opening!.state.doorUnlocked).toBe(false);
 expect(freshView[2]!.visible).toBe(true);expect(freshView.every(n=>n.count===1)).toBe(true);
 expect(fresh.station!.phase).toBe('waiting');expect(fresh.entities).toEqual([]);
 await page.getByRole('button',{name:'Enter ward',exact:true}).click();
 await expect.poll(async()=>(await snap(page)).state,wait).toBe('playing');
 await expect(page.locator('.nw-opening-ui__skip')).toBeVisible(wait);await page.keyboard.press('Space');
 await expect.poll(async()=>(await snap(page)).opening!.state.awakened,wait).toBe(true);
 const frame=(await snap(page)).frameCount;await expect.poll(async()=>(await snap(page)).frameCount,wait).toBeGreaterThan(frame+1);
 await page.screenshot({path:info.outputPath('03-room104-after-five-retries.png')});
 // A visible prop alone is insufficient: the reset card must remain usable through real input.
 await page.keyboard.up('w');const neutral=(await snap(page)).performance.simulatedSeconds;
 await expect.poll(async()=>(await snap(page)).performance.simulatedSeconds,wait).toBeGreaterThan(neutral+.5);
 const card=(await snap(page)).opening!.anchors['access-card']!;
 await walk(page,card.stand!);await page.keyboard.press('c');
 await expect.poll(async()=>(await snap(page)).player!.crouching,wait).toBe(true);
 await look(page,card.position);await expect(page.locator('.nw-opening-ui__prompt')).toContainText('Take',wait);
 await page.keyboard.press('e');await expect.poll(async()=>(await snap(page)).opening!.state.cardAcquired,wait).toBe(true);
 expect(errors).toEqual([]);expect(blocked).toBe(0);
 await writeFile(info.outputPath('five-retries.json'),JSON.stringify({baseline,initial,attempts,fresh,freshView,blocked,errors},null,2));
});

test('a fresh page Continues a completed milestone with canonical assets, then New Game restores the visible card and locked door',async({page},info)=>{
 test.setTimeout(360_000);
 await page.addInitScript(()=>{
  if(sessionStorage.getItem('nw007-complete-fixture'))return;
  sessionStorage.setItem('nw007-complete-fixture','1');
  localStorage.setItem('night-ward:settings:v1',JSON.stringify({quality:'low',motion:'reduce',subtitles:true}));
  localStorage.setItem('night-ward:save:v1',JSON.stringify({version:1,checkpoint:'nw:checkpoint:station-approach',label:'Nurses’ Station',playSeconds:120,savedAt:1,sessions:1,
   opening:{version:1,milestone:'station-approach',station:{version:1,phase:'complete'},state:{version:1,awakened:true,cardAcquired:true,doorUnlocked:true,firstLinePlayed:true,secondLinePlayed:true,room106Tried:true,sightingSeen:true,stationReached:true}}}));
 });
 const states:unknown[]=[];
 await page.goto('/?test=1&menu=1');
 for(let load=0;load<2;load++) {
  if(load)await page.reload();
  await page.getByRole('button',{name:/^Continue/}).click();
  await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
  const state=await snap(page),view=await presentation(page);
  expect(state.station!.phase).toBe('complete');expect(state.station!.canCapture).toBe(false);
  expect(state.opening!.state).toMatchObject({cardAcquired:true,doorUnlocked:true});
  expect(view.every(n=>n.count===1)).toBe(true);expect(view[2]!.visible).toBe(false);
  states.push({state,view});
 }
 await page.getByRole('button',{name:'Enter ward',exact:true}).click();
 await expect.poll(async()=>(await snap(page)).state,wait).toBe('playing');
 await page.evaluate(()=>document.exitPointerLock());
 await expect.poll(async()=>(await snap(page)).state,wait).toBe('paused');
 await page.getByRole('button',{name:/^Return to Main Menu/}).click();await page.getByRole('button',{name:'Leave the ward',exact:true}).click();
 await page.getByRole('button',{name:/^New Game/}).click();await page.getByRole('button',{name:'Start new game',exact:true}).click();
 await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
 const fresh=await snap(page),view=await presentation(page);
 expect(fresh.station!.phase).toBe('waiting');expect(fresh.opening!.state).toMatchObject({cardAcquired:false,doorUnlocked:false,firstLinePlayed:false,secondLinePlayed:false});
 expect(view.every(n=>n.count===1)).toBe(true);expect(view[2]!.visible).toBe(true);expect(fresh.entities).toEqual([]);
 await info.attach('fresh-continue-new-game.json',{body:JSON.stringify({states,fresh,view},null,2),contentType:'application/json'});
 await page.screenshot({path:info.outputPath('03-new-game-after-completion.png')});
});
