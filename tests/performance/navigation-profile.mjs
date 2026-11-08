import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import RAPIER from '@dimforge/rapier3d-compat';
import { PerspectiveCamera } from 'three';
// Explicit CPU-only simulation profile: node tests/performance/navigation-profile.mjs
// Browser rendering and real-time frame pacing are intentionally measured separately.
const root = fileURLToPath(new URL('../../', import.meta.url));
const server = await createServer({ root, configFile: false, server: { middlewareMode: true }, appType: 'custom' });
try {
  const {createHospitalWorld}=await server.ssrLoadModule('/src/world/createHospitalWorld.ts');
  const {createPhysicsAdapter}=await server.ssrLoadModule('/src/physics/adapter.ts');
  const {createNavigationProvider}=await server.ssrLoadModule('/src/physics/navigation.ts');
  const {createEventBus}=await server.ssrLoadModule('/src/integration/events.ts');
  const {createPlayerController}=await server.ssrLoadModule('/src/gameplay/player.ts');
  const {createInteractionSystem}=await server.ssrLoadModule('/src/gameplay/interactions.ts');
  const {createDoorNavigationAdapter}=await server.ssrLoadModule('/src/entities/doorNavigation.ts');
  const {createEntityAgent}=await server.ssrLoadModule('/src/entities/entityAgent.ts');
  const {ENTITY_PROFILES}=await server.ssrLoadModule('/src/entities/profiles.ts');
  await RAPIER.init();
  function fixture() {
    const build=createHospitalWorld({textures:false});
    const world=new RAPIER.World({x:0,y:-9.81,z:0});
    const physics=createPhysicsAdapter(world,build.world.colliders);
    const navigation=createNavigationProvider(physics,build.world.bounds,{cellSize:.25,maxNodes:4096});
    return {build,world,physics,navigation,dispose(){physics.dispose();world.free();build.dispose();}};
  }
  function stats(values) { const ordered=[...values].sort((a,b)=>a-b); return {count:values.length,totalMs:+values.reduce((a,b)=>a+b,0).toFixed(2),maxMs:+Math.max(0,...values).toFixed(2),p95Ms:+(ordered[Math.floor(ordered.length*.95)]??0).toFixed(2)}; }
  {
    const f=fixture(), samples=[],blocks=[];
    const agent=ENTITY_PROFILES.patient.agent;
    for(let index=0;index<360;index++) {
      const start=performance.now();
      const route=f.navigation.findPath({from:{x:6+(index%200)*.001,y:.002999998509883886,z:7.2},to:f.build.world.playerSpawn.position,agent});
      samples.push(performance.now()-start);
      if(index%60===59) blocks.push(stats(samples.slice(-60)));
      if(route) throw new Error('Expected initially disconnected maintenance query');
    }
    console.log(JSON.stringify({scenario:'360 changing-start blocked paths',stats:stats(samples),blocks}));
    f.dispose();
  }
  for (const scenario of ['patrol120s','noise-blocked120s']) {
    const f=fixture(),events=createEventBus();
    const body=f.physics.createCharacter({position:f.build.world.playerSpawn.position,radius:.28,height:1.8});
    const player=createPlayerController({body,camera:new PerspectiveCamera(70,1,.05,100),spawn:f.build.world.playerSpawn,events});
    const interactions=createInteractionSystem({world:f.build.world,player,physics:f.physics,events});
    const queryTimes=[],frameTimes=[],queryCounts=[],worst=[],ys=new Map();
    let frameIndex=0,queriesThisFrame=0;
    const nav={...f.navigation,findPath(query){ys.set(query.from.y,(ys.get(query.from.y)??0)+1);const start=performance.now();const result=f.navigation.findPath(query);const ms=performance.now()-start;queryTimes.push(ms);queriesThisFrame++;if(ms>10)worst.push({frame:frameIndex,from:query.from,to:query.to,ms:+ms.toFixed(2),found:!!result});return result;}};
    const doors=createDoorNavigationAdapter({world:f.build.world,physics:f.physics,navigation:nav,agent:ENTITY_PROFILES.patient.agent,getDoorState:id=>interactions.getDoorState(id),requestDoorOpen:id=>interactions.requestDoorOpen(id)});
    const spawn=f.build.world.entitySpawns.find(value=>value.type==='patient');
    const agent=createEntityAgent({spawn,profile:{...ENTITY_PROFILES.patient,canCapture:false},route:f.build.world.patrolRoutes.find(value=>value.id===spawn.patrolRouteId),physics:f.physics,navigation:nav,player,events,...doors});
    for(frameIndex=0;frameIndex<7200;frameIndex++) {
      const start=performance.now(),time=(frameIndex+1)/60,frame={deltaSeconds:1/60,elapsedSeconds:time};queriesThisFrame=0;
      player.fixedUpdate(frame,{forward:0,right:0,sprint:false,crouch:false});
      interactions.fixedUpdate(frame);
      const noises=scenario==='noise-blocked120s'&&frameIndex%60===0?[{playerId:player.getSnapshot().id,position:player.getSnapshot().position,kind:'interaction',radius:60,intensity:1,timeSeconds:time}]:[];
      agent.fixedUpdate(frame,noises);f.world.step();
      frameTimes.push(performance.now()-start);queryCounts.push(queriesThisFrame);
    }
    console.log(JSON.stringify({scenario,queryTimes:stats(queryTimes),frameTimes:stats(frameTimes),maxQueriesPerTick:Math.max(...queryCounts),queryCount:queryTimes.length,uniqueFromYs:[...ys.entries()],obstacleRevisions:f.physics.getObstacleRevision(),ending:agent.getSnapshot(),worst:worst.sort((a,b)=>b.ms-a.ms).slice(0,10),frameBlocks:[0,1800,3600,5400].map(index=>stats(frameTimes.slice(index,index+1800)))}));
    agent.dispose();interactions.dispose();player.dispose();events.dispose();f.dispose();
  }
} finally {await server.close();}
