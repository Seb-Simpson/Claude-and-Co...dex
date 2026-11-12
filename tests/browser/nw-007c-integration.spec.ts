import {test,expect,type Page} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import type {Application} from '../../src/integration/application';
const snap=(p:Page)=>p.evaluate(()=>window.nightWardTest!.snapshot());
const wait={timeout:180_000};
test.use({video:'on'});
test('integrated director fixture: one actual Nurse performs panel, records and listening; sound ownership survives pause and handoff',async({page},info)=>{
 test.setTimeout(900_000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  localStorage.setItem('night-ward:settings:v1',JSON.stringify({quality:'low',motion:'reduce',subtitles:true}));
  localStorage.setItem('night-ward:save:v1',JSON.stringify({version:1,checkpoint:'nw:checkpoint:room104-exit',label:'Ward 104',playSeconds:20,savedAt:1,sessions:1,
   opening:{version:1,milestone:'room104-exit',state:{version:1,awakened:true,cardAcquired:true,doorUnlocked:true,firstLinePlayed:true,secondLinePlayed:true,room106Tried:false,sightingSeen:false,stationReached:false}}}));
 });
 await page.goto('/?test=1&menu=1');await page.getByRole('button',{name:/^Continue/}).click();
 await expect.poll(async()=>(await snap(page)).state,wait).toBe('ready');
 if(process.env.NW005_SOFTWARE_SCALE==='1')await page.evaluate(()=>(window.nightWardTest as Application).services()!.renderer.setPixelRatio(.25));
 await page.getByRole('button',{name:'Enter ward',exact:true}).click();await expect.poll(async()=>(await snap(page)).state,wait).toBe('playing');
 const locations=(await snap(page)).station!.locations;
 // Explicit setup fixture; only the player is positioned. Never pose, relocate, spawn or play clips on the Nurse.
 expect(await page.evaluate(p=>window.nightWardTest!.teleport(p),locations.recordStand!)).toBe(true);
 await page.evaluate(p=>window.nightWardTest!.aimAt(p),locations.record!);
 await expect(page.locator('.nw-opening-ui__prompt')).toContainText('Room 104 record',wait);
 const t=(await snap(page)).performance.simulatedSeconds;
 await expect.poll(async()=>(await snap(page)).performance.simulatedSeconds,wait).toBeGreaterThan(t+.6);
 await page.keyboard.press('e');await expect.poll(async()=>(await snap(page)).station!.phase,wait).toBe('introduction');
 // Stand at an existing clear patrol point for independent observation of the real actor.
 expect(await page.evaluate(p=>window.nightWardTest!.teleport(p),locations.patrol[1]!)).toBe(true);
 await page.evaluate(p=>window.nightWardTest!.aimAt(p),locations.record!);
 await expect.poll(async()=>(await snap(page)).opening!.nurse?.clip,{timeout:420_000}).toBe('panel_check');
 await expect.poll(async()=>(await snap(page)).opening!.nurse?.panelPresses,wait).toBe(1);
 const panel=await snap(page);expect(panel.opening!.nurse?.available).toBe(true);expect(panel.opening!.nurse?.contactReady).toBe(true);
 await page.screenshot({path:info.outputPath('01-actual-panel.png')});
 await page.evaluate(()=>document.exitPointerLock());await expect.poll(async()=>(await snap(page)).state,wait).toBe('paused');
 const paused=(await snap(page)).opening!.nurse;await page.waitForTimeout(500);expect((await snap(page)).opening!.nurse).toEqual(paused);
 const panelContact=await contactAudit(page,'nw:station:call-console',locations.patrol[1]!,info.outputPath('01-panel-close.png'));
 await page.getByRole('button',{name:/^Resume/}).click();
 await expect.poll(async()=>(await snap(page)).opening!.nurse?.clip,wait).toBe('records_read');
 await expect.poll(async()=>(await snap(page)).opening!.nurse?.paperTurns,wait).toBe(1);
 const records=await snap(page);await page.screenshot({path:info.outputPath('02-actual-records.png')});
 await page.evaluate(()=>document.exitPointerLock());await expect.poll(async()=>(await snap(page)).state,wait).toBe('paused');
 const recordContact=await contactAudit(page,'nw:station:record-104',locations.patrol[1]!,info.outputPath('02-record-close.png'));
 await page.getByRole('button',{name:/^Resume/}).click();
 expect(await page.evaluate(p=>window.nightWardTest!.teleport(p),locations.hidingApproaches[locations.hidingPrimary]!)).toBe(true);
 await page.evaluate(p=>window.nightWardTest!.aimAt(p),locations.hidingTargets[locations.hidingPrimary]!);
 await expect(page.locator('.nw-opening-ui__prompt')).toContainText('Hide in locker',wait);
 await page.keyboard.press('e');await expect.poll(async()=>(await snap(page)).player!.hiding.state,wait).toBe('hidden');

 await expect.poll(async()=>(await snap(page)).opening!.nurse?.clip,wait).toBe('listen_brief');
 const listening=await snap(page);await page.screenshot({path:info.outputPath('03-actual-listen.png')});
 await expect.poll(async()=>(await snap(page)).station!.phase,wait).toBe('stealth');
 const end=await snap(page);expect(end.player!.captured).toBe(false);expect(end.opening!.nurse?.clip).not.toBe('records_read');
 const inspect=await page.evaluate(()=>{
  const scene=(window.nightWardTest as Application).services()!.scene,root=scene.getObjectByName('nw:hospital')!;
  let nurseCount=0;scene.traverse(o=>{if(o.name==='nw:opening:nurse-sighting')nurseCount++});
  const point=(name:string)=>{const n=scene.getObjectByName(name)!;const p=n.getWorldPosition(n.position.clone());return {x:p.x,y:p.y,z:p.z}};
  return {nurseCount,console:point('nw:station:call-console'),record:point('nw:station:record-104'),sound:root.userData.nwSoundDiagnostics()};
 });
 expect(inspect.nurseCount).toBe(1);expect(inspect.sound.loops.filter((id:string)=>id==='nw:station-hum')).toHaveLength(1);
 expect(panel.events.some(e=>e.type==='atmosphere:sound'&&(e.payload as {cueId:string}).cueId==='nw:call-panel')).toBe(true);
 expect(records.events.some(e=>e.type==='atmosphere:sound'&&(e.payload as {cueId:string}).cueId==='nw:paper')).toBe(true);
 await writeFile(info.outputPath('integrated.json'),JSON.stringify({kind:'production Continue fixture; player-only setup placement; sole real director actor',panel,records,listening,end,inspect,panelContact,recordContact,errors},null,2));
 expect(errors).toEqual([]);
});

/** Inspect the actual paused actor; no actor transform, pose time or duplicate visual is introduced. */
async function contactAudit(page:Page,targetName:string,returnTo:{x:number;y:number;z:number},path:string){
 const contact=await page.evaluate(({targetName,returnTo})=>{
  const app=window.nightWardTest as Application,scene=app.services()!.scene;
  const nurse=scene.getObjectByName('nw:opening:nurse-sighting')!;
  const node=scene.getObjectByName(targetName)!,target=node.getWorldPosition(node.position.clone());
  let closest=Infinity,count=0;
  nurse.updateWorldMatrix(true,true);
  nurse.traverse(n=>{
   const mesh=n as import('three').SkinnedMesh;if(!mesh.isSkinnedMesh)return;
   mesh.skeleton.update();
   const positions=mesh.geometry.getAttribute('position'),weights=mesh.geometry.getAttribute('skinWeight'),indices=mesh.geometry.getAttribute('skinIndex');
   for(let i=0;i<positions.count;i++){
    let influence=0;for(let j=0;j<4;j++)if(mesh.skeleton.bones[indices.getComponent(i,j)]?.name==='handR')influence+=weights.getComponent(i,j);
    if(influence<.5)continue;count++;
    const point=mesh.position.clone().fromBufferAttribute(positions,i);mesh.applyBoneTransform(i,point);mesh.localToWorld(point);
    closest=Math.min(closest,point.distanceTo(target));
   }
  });
  const actor=nurse.getWorldPosition(nurse.position.clone());
  const view={x:actor.x+(returnTo.x-actor.x)*.45,y:0.003,z:actor.z+(returnTo.z-actor.z)*.45};
  const camera=app.services()!.camera,height=camera.position.y-app.snapshot().player!.position.y;
  const moved=app.teleport(view);camera.position.set(view.x,view.y+height,view.z);app.aimAt(target);camera.lookAt(target);camera.updateMatrixWorld();app.services()!.renderer.setPixelRatio(.75);app.redraw();
  return {closestRightHandVertex:closest,weightedHandVertices:count,target:{x:target.x,y:target.y,z:target.z},moved,actor:{x:actor.x,y:actor.y,z:actor.z}};
 },{targetName,returnTo});
 expect(contact.weightedHandVertices).toBeGreaterThan(0);expect(Number.isFinite(contact.closestRightHandVertex)).toBe(true);
 await page.screenshot({path,style:'.nw-pause { visibility:hidden !important; }'});
 await page.evaluate(({returnTo,targetName,scale})=>{const app=window.nightWardTest as Application;const camera=app.services()!.camera,height=camera.position.y-app.snapshot().player!.position.y;app.teleport(returnTo);camera.position.set(returnTo.x,returnTo.y+height,returnTo.z);const n=app.services()!.scene.getObjectByName(targetName)!;app.aimAt(n.getWorldPosition(n.position.clone()));if(scale)app.services()!.renderer.setPixelRatio(.25);app.redraw();},{returnTo,targetName,scale:process.env.NW005_SOFTWARE_SCALE==='1'});
 return contact;
}
