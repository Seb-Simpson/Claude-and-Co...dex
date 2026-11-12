import {createExperienceCoordinator} from '../../src/gameplay/directors/experience';
import type {StationOptions} from '../../src/gameplay/encounters/nursesStation';
import RAPIER from '@dimforge/rapier3d-compat';
import {Scene,PerspectiveCamera} from 'three';
import {beforeAll,describe,it,expect} from 'vitest';
import type {EngineServices,Vec3} from '../../src/contracts';
import {createHospitalWorld} from '../../src/world';
import {createGameplayRuntime} from '../../src/gameplay/runtime';
import {createStationEncounter} from '../../src/gameplay/encounters/nursesStation';
import type {StationEncounter,StationActorPose} from '../../src/gameplay/encounters/nursesStation';
import type {StationCheckpoint} from '../../src/gameplay/encounters/checkpoint';
import {resolveStationBindings} from '../../src/gameplay/encounters/stationBindings';
import {createEventBus} from '../../src/integration/events';
beforeAll(async()=>{await RAPIER.init()});
function fixture(checkpoint?:StationCheckpoint,policy:Partial<Pick<StationOptions,'canStage'|'coordinator'>>={}){
 const hospital=createHospitalWorld({textures:false}),world=hospital.world,events=createEventBus();
 const physics=new RAPIER.World({x:0,y:-9.81,z:0});
 const engine={physics,scene:new Scene(),camera:new PerspectiveCamera(70,1,.05,100),renderer:{domElement:{}},audio:{context:null}} as unknown as EngineServices;
 let crouch=false;let station:StationEncounter|undefined;const game=createGameplayRuntime({world,engine,events,player:null},{attachControls:false,showHud:false,activeEntityTypes:[],input:{read:()=>({forward:0,right:0,crouch,sprint:false}),dispose(){}},additionalWitnesses:()=>station?.witnesses()??[],canCapture:()=>station?.canCapture??false});
 const b=resolveStationBindings(world)!;const saved:StationCheckpoint[]=[],messages:string[]=[],poses:StationActorPose[]=[],captures:string[]=[],chases:string[]=[];
 events.on('player:captured',e=>captures.push(e.entityId));events.on('chase:started',e=>chases.push(e.entityId));
 let eligible=false,time=0;
 station=createStationEncounter({...policy,world,bindings:b,physics:game.physics,navigation:game.navigation,player:game.player,interactions:game.interactions,events,
  ...(checkpoint?{checkpoint}:{}),eligible:()=>eligible,present:p=>poses.push(p),save:c=>saved.push(c),notify:m=>messages.push(m)});
 return {game,station,b,world,events,poses,saved,messages,captures,chases,physics,
  get time(){return time},
  allow(){eligible=true},
  crouch(value:boolean){crouch=value},
  place(p:Vec3){expect(game.player.body.canOccupy(p)).toBe(true);game.player.body.setPosition(p)},
  tick(n=1){for(let i=0;i<n;i++){time+=1/60;game.fixedUpdate({deltaSeconds:1/60,elapsedSeconds:time});station!.fixedUpdate({deltaSeconds:1/60,elapsedSeconds:time});physics.step()}},
  until(phase:string,max=4000){for(let i=0;i<max&&station!.snapshot().phase!==phase;i++)this.tick();expect(station!.snapshot().phase).toBe(phase)},
  noise(p:Vec3){events.emit('player:noise',{playerId:'player',position:p,kind:'sprint',radius:50,intensity:1,timeSeconds:time})},
  dispose(){station!.dispose();game.dispose();expect(physics.colliders.len()).toBe(0);events.dispose();physics.free();hospital.dispose()},
 };
}
describe('first Nurse encounter on the actual station geometry',()=>{
 it('keeps the complete 105 access path inside the encounter domain without an artificial doorway seam',()=>{
  const f=fixture();try{
   const path=f.station.snapshot().locations.concealmentRoute;
   expect(path.length).toBeGreaterThan(1);
   for(let i=1;i<path.length;i++)for(let n=0;n<=20;n++){
    const a=path[i-1]!,b=path[i]!,t=n/20;
    const p={x:a.x+(b.x-a.x)*t,y:0,z:a.z+(b.z-a.z)*t};
    expect(f.b.contains(p),JSON.stringify({p,rooms:f.world.rooms.filter(r=>['nw:ward4:nurses-station','nw:ward4:room-105','nw:ward4:main-corridor'].includes(r.id))})).toBe(true);
   }
  }finally{f.dispose()}
 });
 it('never starts early, regardless of arrival delay, and triggers at the semantic observation point',()=>{
  const f=fixture();try{
   f.place(f.b.observation);f.tick(180);expect(f.station.snapshot().phase).toBe('waiting');expect(f.captures).toEqual([]);
   f.allow();f.tick();expect(f.station.snapshot().phase).toBe('introduction');
   expect(f.saved.map(c=>c.phase)).toEqual(['introduction']);
  }finally{f.dispose()}
 });
 it('walks into the station through navigation, checks the panel, then permits a forgiving learning period',()=>{
  const f=fixture();try{
   const bodyCount=f.physics.colliders.len();f.allow();f.place(f.b.observation);f.tick();
   let previous=f.station.snapshot().actor.position;
   for(let i=0;i<3000&&f.station.snapshot().phase==='introduction';i++){
    f.noise(f.game.player.getSnapshot().position);f.tick();const s=f.station.snapshot();
    expect(s.canCapture).toBe(false);expect(s.actor.lastKnownPlayer).toBeNull();
    expect(Math.hypot(s.actor.position.x-previous.x,s.actor.position.z-previous.z)).toBeLessThan(.03);
    expect(f.game.physics.isPositionFree(s.actor.position,.3,1.8,[],false)).toBe(true);previous=s.actor.position;
   }
   expect(f.station.snapshot().phase).toBe('tension');expect(f.poses.some(p=>p.checkingPanel)).toBe(true);
   const action=f.poses.find(p=>p.checkingPanel)!;
   expect(f.game.physics.hasLineOfSight({...f.b.patrol[3]!,y:1.65},{...action.actor.position,y:1.6})).toBe(true);
   f.tick(420);expect(f.station.snapshot().phase).toBe('tension');expect(f.chases).toEqual([]);expect(f.captures).toEqual([]);
   f.until('stealth');expect(f.saved.map(c=>c.phase)).toEqual(['introduction','tension','stealth']);
   expect(f.physics.colliders.len()).toBe(bodyCount+1);expect(f.game.entities.getSnapshots()).toEqual([]);
  }finally{f.dispose()}
 });
 it('uses real directional trolley occlusion, then allows actual perception and sound investigation after handoff',()=>{
  const f=fixture({version:1,phase:'stealth'});try{
   f.place(f.b.crouchCover);const actor=f.station.snapshot().actor.position;
   const eye={...actor,y:actor.y+1.6};
   expect(f.game.physics.hasLineOfSight(eye,{...f.b.crouchCover,y:1.65})).toBe(true);
   expect(f.game.physics.hasLineOfSight(eye,{...f.b.crouchCover,y:.9})).toBe(false);
   f.crouch(true);f.tick(30);expect(f.station.snapshot().actor.lastKnownPlayer).toBeNull();
   f.crouch(false);f.tick(20);expect(f.station.snapshot().actor.lastKnownPlayer?.source).toBe('vision');
   f.place(f.b.observation);f.noise(f.b.observation);f.tick();
   expect(f.station.snapshot().actor.lastKnownPlayer?.source).toBe('sound');expect(f.captures).toEqual([]);
  }finally{f.dispose()}
 });
 for(const phase of ['introduction','tension','stealth','complete'] as const)it(`restores ${phase} safely without replaying completed phases`,()=>{
  const f=fixture({version:1,phase});try{
   f.place(phase==='complete'?f.b.exit:f.b.observation);f.tick(10);
   expect(f.station.snapshot().phase).toBe(phase);expect(f.captures).toEqual([]);
   expect(f.saved).toEqual([]);if(phase!=='introduction')expect(f.station.snapshot().actor.position.x).toBeGreaterThan(f.b.observation.x);
  }finally{f.dispose()}
 });
 it('completes at the intended exit, cancels pursuit and leaves no capture or softlocked progression',()=>{
  const f=fixture({version:1,phase:'stealth'});try{
   f.place(f.b.exit);f.tick();expect(f.station.snapshot().phase).toBe('complete');
   expect(f.saved).toEqual([{version:1,phase:'complete'}]);expect(f.station.canCapture).toBe(false);
   f.noise(f.b.exit);f.tick(180);expect(f.chases).toEqual([]);expect(f.captures).toEqual([]);
  }finally{f.dispose()}
 });

 for(const hiding of ['primary','secondary'] as const)it(`preserves real ${hiding} hiding occupancy and safe exits`,()=>{
  const f=fixture({version:1,phase:'tension'});try{
   const id=hiding==='primary'?f.b.hidingPrimary:f.b.hidingSecondary;
   const spot=f.world.hidingLocations.find(s=>s.id===id)!;
   f.place(spot.exitCandidates[0]!.position);f.game.player.update({deltaSeconds:.1,elapsedSeconds:0});
   expect(f.game.interactions.hiding.enter(id,f.time)).toBe(true);f.tick(30);
   expect(f.game.player.getSnapshot().hiding.state).toBe('hidden');expect(f.station.witnesses()).toEqual([]);
   expect(f.game.interactions.hiding.exit(f.time)).toBe(true);f.tick(30);
   expect(f.game.player.getSnapshot().hiding.state).toBe('outside');expect(f.captures).toEqual([]);
  }finally{f.dispose()}
 });
 it('gives the first real detection time to recover, then loses an unseen hidden player and searches',()=>{
  const f=fixture({version:1,phase:'stealth'});try{
   f.place(f.b.patrol[3]!);
   for(let i=0;i<1800&&!f.chases.length;i++)f.tick();
   expect(f.chases).toEqual(['nw:entity:nurse']);expect(f.station.snapshot().firstAlertUsed).toBe(true);
   expect(f.station.canCapture).toBe(false);f.tick(120);expect(f.captures).toEqual([]);
   f.place(f.b.concealment);f.game.player.update({deltaSeconds:.1,elapsedSeconds:f.time});
   expect(f.game.interactions.hiding.enter(f.b.hidingSecondary,f.time)).toBe(true);
   f.tick(720);expect(f.captures).toEqual([]);
   expect(f.station.snapshot().actor.state).not.toBe('pursue');
  }finally{f.dispose()}
 });
 it('keeps Room104 safe and discards noise outside the encounter instead of tracking it through walls',()=>{
  const f=fixture({version:1,phase:'stealth'});try{
   f.noise(f.game.player.getSnapshot().position);f.tick(120);
   expect(f.station.snapshot().actor.lastKnownPlayer).toBeNull();expect(f.station.canCapture).toBe(false);expect(f.chases).toEqual([]);
  }finally{f.dispose()}
 });
});

it('defers a visible entrance without allocating an invisible capsule, then starts when an unseen staging point is available',()=>{
 let hidden=false;const f=fixture(undefined,{canStage:()=>hidden});try{
  const count=f.physics.colliders.len();f.allow();f.place(f.b.observation);f.tick(600);
  expect(f.station.snapshot().active).toBe(false);expect(f.station.snapshot().phase).toBe('waiting');expect(f.physics.colliders.len()).toBe(count);
  hidden=true;f.tick(31);expect(f.station.snapshot().active).toBe(true);expect(f.station.snapshot().phase).toBe('introduction');expect(f.captures).toEqual([]);
 }finally{f.dispose()}
});
it('reserves the same actor for autonomous AI and cancels stale encounter work without leaking ownership',()=>{
 const coordinator=createExperienceCoordinator(),f=fixture({version:1,phase:'stealth'},{coordinator});try{
  expect(coordinator.snapshot()).toEqual([{owner:'ai:shaw',resources:['nurse']}]);
  expect(coordinator.acquire('conflicting-scene',['nurse'])).toBeNull();
  coordinator.cancel();f.tick(300);expect(f.captures).toEqual([]);expect(coordinator.snapshot()).toEqual([]);
 }finally{f.dispose();coordinator.dispose()}
});

it('finishes the authored introduction when a stationary reader occupies the preferred panel stance, without walking through them',()=>{
 const f=fixture();try{
  f.allow();f.place(f.b.patrol[0]!);f.until('tension',4500);
  expect(f.poses.some(p=>p.checkingPanel&&p.contactReady===false)).toBe(true);
  expect(f.captures).toEqual([]);expect(f.station.snapshot().actor.lastKnownPlayer).toBeNull();
  for(const p of f.poses.filter(p=>p.visible))expect(Math.hypot(p.actor.position.x-f.b.patrol[0]!.x,p.actor.position.z-f.b.patrol[0]!.z)).toBeGreaterThan(.55);
 }finally{f.dispose()}
});
