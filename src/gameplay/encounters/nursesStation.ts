import {emitAuthoredCue} from '../directors/cues';
import {STATION_RECORD_ID,stationChoreography} from './storyBindings';
import type {ExperienceCoordinator,ExperienceLease} from '../directors/experience';
import type { EntitySnapshot, FrameContext, GameEvents, HospitalWorld, NavigationProvider, Vec3 } from '../../contracts';
import {Box3,Vector3} from 'three';
import type { PhysicsAdapter } from '../../physics';
import type { PlayerController } from '../player';
import type { InteractionSystem } from '../interactions';
import { createNurseEncounter } from '../../entities/nurseEncounter';
import { createDoorNavigationAdapter } from '../../entities/doorNavigation';
import { ENTITY_PROFILES } from '../../entities/profiles';
import { createEncounterDirector } from './director';
import { STATION_PHASES } from './checkpoint';
import type { StationCheckpoint, StationPhase } from './checkpoint';
import type { StationBindings } from './stationBindings';

export interface StationActorPose {
  readonly contactReady?:boolean;
  readonly visible?: boolean;
  readonly action?: 'approach'|'check-panel'|'inspect-records'|'listen'|'capture'|null;
  readonly deltaSeconds: number;
  readonly actor: EntitySnapshot;
  readonly yaw: number;
  readonly speed: number;
  readonly checkingPanel: boolean;
}
export interface StationSnapshot {
  readonly active: boolean;
  readonly action: StationActorPose['action'];
  readonly phase: StationPhase;
  readonly elapsed: number;
  readonly step: number;
  readonly actor: EntitySnapshot;
  readonly canCapture: boolean;
  readonly firstAlertUsed: boolean;
  readonly locations: {
    observation: Vec3; entry: Vec3; crouchCover: Vec3; concealment: Vec3; exit: Vec3;
    concealmentRoute: readonly Vec3[];
    returnRoute: readonly Vec3[];
    record?:Vec3; recordStand?:Vec3; recordRoute:readonly Vec3[];
    patrol: readonly Vec3[]; hidingPrimary: string; hidingSecondary: string;
    hidingTargets: Readonly<Record<string, Vec3>>;
    hidingApproaches: Readonly<Record<string, Vec3>>;
  };
}
export interface StationEncounter {
  readonly canCapture: boolean;
  snapshot(): StationSnapshot;
  fixedUpdate(frame: FrameContext): void;
  /** Real entry witnesses feed the existing hiding system before it moves the capsule. */
  witnesses(): readonly string[];
  dispose(): void;
}
export interface StationOptions {
  readonly coordinator?: ExperienceCoordinator;
  readonly canStage?: (position:Vec3)=>boolean;
  readonly world: HospitalWorld;
  readonly bindings: StationBindings;
  readonly physics: PhysicsAdapter;
  readonly navigation: NavigationProvider;
  readonly player: PlayerController;
  readonly interactions: InteractionSystem;
  readonly events: GameEvents;
  readonly checkpoint?: StationCheckpoint;
  readonly eligible: () => boolean;
  readonly present: (pose: StationActorPose) => void;
  readonly save: (checkpoint: StationCheckpoint) => void;
  readonly notify: (message: string) => void;
}
const distance = (a: Vec3,b: Vec3) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const nearSegment = (p:Vec3,a:Vec3,b:Vec3,radius:number) => {
  const dx=b.x-a.x,dz=b.z-a.z,den=dx*dx+dz*dz;
  const t=den?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/den)):0;
  return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t)<radius && Math.abs(p.y-a.y)<1;
};

/** One actor, one capsule, one existing AI. The director changes authority, never its location. */
export function createStationEncounter(o: StationOptions): StationEncounter {
  const b=o.bindings;
  let disposed=false,time=0,firstAlertUsed=false,graceUntil=0,step=0,hold=0,action=false;
  let previousPlayer={...o.player.getSnapshot().position};
  let lastPosition:Vec3;
  let pendingCheckpoint: StationCheckpoint | null=null;
  let nextStepSound=0,stageRetry=0,concealmentTime=0;
  let encounterLease:ExperienceLease|null=null;
  let authoredAction:StationActorPose['action']=null;
  let stalled=0,lastGoalDistance=Infinity,lastAuthoredStep=-1,contactReady=false;
  const choreography=stationChoreography(o.world,b,o.navigation);
  const sound=(cueId:string,position:Vec3,volume=.25) => emitAuthoredCue(o.events,{kind:'sound',value:
    {cueId,position:{...position},volume,action:'play',loop:false}});
  const director=createEncounterDirector(STATION_PHASES,o.checkpoint?.phase,(_previous,phase)=>{
    step=0;hold=0;action=false;
    if(phase==='introduction') sound('nw:wheel-creak',b.initial,.35);
    if(phase==='tension') {
      sound('nw:curtain',b.crouchCover,.25);
    }
    if(phase==='stealth') { encounterLease?.release();encounterLease=o.coordinator?.acquire('ai:shaw',['nurse'])??null;graceUntil=time+3; nurse.setDirective(null); }
    if(phase==='escape') {
      encounterLease?.release();encounterLease=null;
      nurse.setDirective({target:b.patrol[0]!,speed:.75});
    }
    if(['introduction','tension','stealth','complete'].includes(phase))
      pendingCheckpoint={version:1,phase:phase as StationCheckpoint['phase']};
  });
  const autonomous=()=>director.phase==='stealth' && (!o.coordinator||(encounterLease?.owner==='ai:shaw'&&!encounterLease.signal.aborted)) && b.contains(o.player.getSnapshot().position);
  const canCapture=()=>autonomous() && time>=graceUntil;
  // Restrict the enemy's route/search domain, never the player's movement or solid geometry.
  const navigation:NavigationProvider={
    ...o.navigation,
    isPositionValid:(p,a)=>b.contains(p)&&o.navigation.isPositionValid(p,a),
    findPath(query){
      if(!b.contains(query.to)) return null;
      const path=o.navigation.findPath(query);
      return path && path.waypoints.every(p=>b.contains(p)) ? path : null;
    },
  };
  const doors=createDoorNavigationAdapter({world:o.world,physics:o.physics,navigation,
    agent:ENTITY_PROFILES.nurse.agent,getDoorState:id=>o.interactions.getDoorState(id),
    requestDoorOpen:id=>o.interactions.requestDoorOpen(id)});
  const restored=o.checkpoint?.phase;
  const spawn={...b.spawn,position:{...(restored && restored!=='introduction' ? b.patrol[0]! : b.initial)},yaw:restored && restored!=='introduction'?b.spawn.yaw:b.initialYaw};
  const nurse=createNurseEncounter({spawn,route:b.route,physics:o.physics,navigation,player:o.player,events:o.events,
    hidingLocations:o.world.hidingLocations,doors,perceptionEnabled:autonomous,captureEnabled:canCapture,
    profile:{patrolSpeed:.75,pursuitSpeed:2.55,detectionSeconds:1.35,captureGraceSeconds:2.5,captureDwellSeconds:.75},
    onAudioCue:cue=>{
      if(director.phase==='waiting') return;
      if(cue.kind==='footstep' && time>=nextStepSound) {sound('nw:distant-steps',cue.position,.18);nextStepSound=time+2.7;}
      if(cue.kind==='listen') sound('nw:curtain',cue.position,.16);
    }});
  const unsub=o.events.on('chase:started',event=>{
    if(event.entityId!==spawn.entityId || firstAlertUsed) return;
    firstAlertUsed=true; graceUntil=Math.max(graceUntil,time+6);
    sound('nw:curtain',o.player.getSnapshot().position,.13);
  });
  const actorSnapshot=():EntitySnapshot=>nurse.getSnapshots()[0]??{id:spawn.entityId,type:'nurse',position:{...spawn.position},state:'idle',lastKnownPlayer:null};
  function stage():boolean {
    if(o.coordinator&&!encounterLease){encounterLease=o.coordinator.acquire('encounter:shaw',['nurse','dialogue']);if(!encounterLease)return false;}
    const candidate=choreography.staging.find(p=>(o.canStage?.(p)??true)&&navigation.isPositionValid(p,ENTITY_PROFILES.nurse.agent));
    if(!candidate){encounterLease?.release();encounterLease=null;return false;}
    nurse.stage({...spawn,position:candidate});nurse.activate();
    nurse.setDirective({target:null,speed:0,yaw:spawn.yaw});lastPosition={...candidate};
    sound('nw:distant-steps',candidate,.22);
    return true;
  }
  try {
    if(restored&&restored!=='introduction') {
      nurse.stage();nurse.activate();
      if(restored!=='stealth'){
        if(restored==='tension')encounterLease=o.coordinator?.acquire('encounter:shaw',['nurse','dialogue'])??null;
        nurse.setDirective({target:null,speed:0,yaw:spawn.yaw});
      }else {graceUntil=3;encounterLease=o.coordinator?.acquire('ai:shaw',['nurse'])??null;}
    }
    lastPosition={...spawn.position};
    o.present({deltaSeconds:0,actor:actorSnapshot(),yaw:nurse.getYaw(),speed:0,checkingPanel:false,visible:nurse.phase==='active',action:null});
  } catch(error) {encounterLease?.release();unsub();nurse.dispose();throw error;}
  const playerAgent={radius:o.player.body.radius,height:1.8,maxStepHeight:.25,maxSlopeRadians:Math.PI/4};
  const concealmentRoute=o.navigation.findPath({from:b.observation,to:b.concealment,agent:playerAgent})?.waypoints ?? [];
  const returnRoute=o.navigation.findPath({from:b.concealment,to:b.observation,agent:playerAgent})?.waypoints ?? [];
  const recordObject=o.world.interactables.find(m=>m.id===STATION_RECORD_ID)?.object;
  const record=recordObject?.getWorldPosition(o.player.getSnapshot().camera.position.clone());
  let recordStand:Vec3|undefined;
  if(record){
    const length=Math.hypot(b.entry.x-record.x,b.entry.z-record.z);
    for(const offset of [1.1,1.4,1.7]){
      const p={x:record.x+(b.entry.x-record.x)/length*offset,y:b.entry.y,z:record.z+(b.entry.z-record.z)/length*offset};
      if(o.navigation.isPositionValid(p,playerAgent)&&o.physics.hasLineOfSight({...p,y:p.y+1.65},{...record,y:record.y+.04})){recordStand=p;break;}
    }
  }
  const recordRoute=recordStand?o.navigation.findPath({from:b.observation,to:recordStand,agent:playerAgent})?.waypoints??[]:[];
  const hidingTargets=Object.fromEntries(o.world.hidingLocations.filter(spot=>[b.hidingPrimary,b.hidingSecondary].includes(spot.id)).map(spot=>{
    const object=o.world.interactables.find(m=>m.id===spot.interactableId)!.object;
    const bounds=new Box3().setFromObject(object);
    const target=bounds.isEmpty()?object.getWorldPosition(new Vector3()):bounds.getCenter(new Vector3());
    return [spot.id,{...target}];
  }));
  if(record&&(!recordStand||!recordRoute.length)){
    encounterLease?.release();unsub();nurse.dispose();
    throw new Error('The night register needs a reachable, unobstructed interaction position.');
  }
  const locations = () => ({...(record?{record:{...record}}:{}),...(recordStand?{recordStand:{...recordStand}}:{}),recordRoute:recordRoute.map(p=>({...p})),observation:{...b.observation},entry:{...b.entry},crouchCover:{...b.crouchCover},
    concealment:{...b.concealment},exit:{...b.exit},patrol:b.patrol.map(p=>({...p})),
    hidingPrimary:b.hidingPrimary,hidingSecondary:b.hidingSecondary,concealmentRoute:concealmentRoute.map(p=>({...p})),returnRoute:returnRoute.map(p=>({...p})),
    hidingTargets:Object.fromEntries(Object.entries(hidingTargets).map(([id,p])=>[id,{...p}])),
    hidingApproaches:Object.fromEntries(o.world.hidingLocations.filter(s=>[b.hidingPrimary,b.hidingSecondary].includes(s.id)).map(s=>[s.id,{...s.exitCandidates[0]!.position}]))});
  const snapshot=():StationSnapshot=>({active:nurse.phase==='active',action:authoredAction,phase:director.phase,elapsed:director.elapsed,step,
    actor:actorSnapshot(),canCapture:canCapture(),firstAlertUsed,locations:locations()});
  return {
    get canCapture(){return canCapture();}, snapshot,
    witnesses:()=>autonomous()&&nurse.witnessesEntry()?[spawn.entityId]:[],
    fixedUpdate(frame){
      if(disposed||o.player.getSnapshot().captured) return;
      time=frame.elapsedSeconds;
      if(encounterLease?.signal.aborted){nurse.setDirective({target:null,speed:0});return;}
      const dt=Math.min(frame.deltaSeconds,.1),p=o.player.getSnapshot().position;
      director.tick(dt);
      if(director.phase==='waiting' && o.eligible() && time>=stageRetry &&
        (nearSegment(b.observation,previousPlayer,p,1.35)||b.contains(p))) {
        stageRetry=time+.5;
        if(stage())director.advance('waiting');
      }
      previousPlayer={...p};
      if(director.phase==='introduction' && nurse.phase!=='active') {
        if(time<stageRetry)return;
        stageRetry=time+.5;if(!stage())return;
      }
      const at=actorSnapshot().position;
      action=false;authoredAction=null;contactReady=false;
      if(director.phase==='introduction') {
        // Footsteps precede a continuous walk through the actual station entrance.
        const itinerary=[
          {goal:b.patrol[4]!,action:'approach',hold:0},
          {goal:b.patrol[3]!,action:'approach',hold:0},
          {goal:choreography.panelStand,action:'check-panel',hold:2.5,look:choreography.panelLook},
          {goal:choreography.recordStand,action:'inspect-records',hold:2.8,look:choreography.recordLook},
          {goal:choreography.recordStand,action:'listen',hold:1.8,look:b.entry},
        ] as const;
        const beat=itinerary[step];
        if(beat){
          const remaining=distance(at,beat.goal);
          if(lastAuthoredStep!==step){lastAuthoredStep=step;stalled=0;lastGoalDistance=Infinity;}
          stalled=Math.abs(remaining-lastGoalDistance)<.001?stalled+dt:0;lastGoalDistance=remaining;
          const look='look' in beat?beat.look:b.entry;
          const nearbyInspection=beat.action!=='approach'&&stalled>1.2&&remaining<.9&&distance(at,p)<1.2&&
            Math.hypot(at.x-look.x,at.z-look.z)<2.3&&o.physics.hasLineOfSight({...at,y:at.y+1.65},look);
          contactReady=remaining<.26;
          if(!contactReady&&!nearbyInspection&&hold===0){authoredAction='approach';nurse.setDirective({target:beat.goal,speed:.85});}
          else {
            authoredAction=beat.action;
            action=beat.action!=='approach';
            const look='look' in beat?beat.look:b.entry;
            nurse.setDirective({target:null,speed:0,yaw:Math.atan2(-(look.x-at.x),-(look.z-at.z))});
            if(hold===0&&beat.action==='check-panel'){sound('nw:static',at,.10);if(b.lightingTarget)emitAuthoredCue(o.events,{kind:'light',value:{targetId:b.lightingTarget,effect:'flicker',durationSeconds:.4,intensity:.92}});}
            hold+=dt;if(hold>=beat.hold){step++;hold=0;}
          }
        }else director.advance('introduction');
      }
      if(director.phase==='tension') {
        // A routine close to concealment, never an authored search of a known player.
        const route=[b.patrol[0]!,b.patrol[1]!,choreography.panelStand];
        const goal=route[step%route.length]!;
        nurse.setDirective({target:goal,speed:.65});
        if(distance(at,goal)<.24)step++;
        const state=o.player.getSnapshot();
        const learning=state.hiding.state==='hidden'||(state.crouching&&distance(p,b.crouchCover)<1.7);
        concealmentTime=learning?concealmentTime+dt:0;
        if(director.elapsed>=10 && (concealmentTime>=1.5||(director.elapsed>=18&&distance(at,p)>=4.5)))director.advance('tension');
      }
      if(director.phase==='stealth') {
        if(b.crossedExit(p)) director.advance('stealth');
        else if(!b.contains(p)) nurse.setDirective({target:b.patrol[0]!,speed:.75});
        else nurse.setDirective(null);
      }
      if(director.phase==='escape') director.advance('escape');
      if(director.phase==='complete') nurse.setDirective({target:b.patrol[0]!,speed:.75,yaw:0});
      if(nurse.phase==='active')nurse.fixedUpdate(frame);
      const actor=actorSnapshot();
      const speed=dt>0?Math.hypot(actor.position.x-lastPosition.x,actor.position.z-lastPosition.z)/dt:0;
      o.present({deltaSeconds:dt,actor,yaw:nurse.getYaw(),speed,checkingPanel:action,contactReady,visible:nurse.phase==='active',action:authoredAction});
      lastPosition={...actor.position};
      if(pendingCheckpoint){const cp=pendingCheckpoint;pendingCheckpoint=null;o.save(cp);}
    },
    dispose(){if(disposed)return;disposed=true;try{encounterLease?.release();unsub();}finally{nurse.dispose();}},
  };
}
