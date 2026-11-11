import type { EntitySnapshot, FrameContext, GameEvents, HospitalWorld, NavigationProvider, Vec3 } from '../../contracts';
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
  readonly deltaSeconds: number;
  readonly actor: EntitySnapshot;
  readonly yaw: number;
  readonly speed: number;
  readonly checkingPanel: boolean;
}
export interface StationSnapshot {
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
  let nextStepSound=0;
  const sound=(cueId:string,position:Vec3,volume=.25) => o.events.emit('atmosphere:sound',
    {cueId,position:{...position},volume,action:'play',loop:false});
  const director=createEncounterDirector(STATION_PHASES,o.checkpoint?.phase,(_previous,phase)=>{
    step=0;hold=0;action=false;
    if(phase==='introduction') sound('nw:wheel-creak',b.initial,.35);
    if(phase==='tension') {
      o.notify('The linen cover breaks the sightline. Ctrl / C — Crouch.');
      sound('nw:curtain',b.crouchCover,.25);
    }
    if(phase==='stealth') { graceUntil=time+3; nurse.setDirective(null); }
    if(phase==='escape') {
      nurse.setDirective({target:b.patrol[0]!,speed:.75});
    }
    if(['introduction','tension','stealth','complete'].includes(phase))
      pendingCheckpoint={version:1,phase:phase as StationCheckpoint['phase']};
  });
  const autonomous=()=>director.phase==='stealth' && b.contains(o.player.getSnapshot().position);
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
  let hintHide=false;
  const unsub=o.events.on('chase:started',event=>{
    if(event.entityId!==spawn.entityId || firstAlertUsed) return;
    firstAlertUsed=true; graceUntil=Math.max(graceUntil,time+6);
    o.notify('Break her sightline. Keep doors and footsteps quiet.');
  });
  try {
    nurse.stage(); nurse.activate();
    if(restored!=='stealth') nurse.setDirective({target:null,speed:0,yaw:spawn.yaw});
    else graceUntil=3;
    lastPosition={...spawn.position};
    o.present({deltaSeconds:0,actor:nurse.getSnapshots()[0]!,yaw:nurse.getYaw(),speed:0,checkingPanel:false});
  } catch(error) {unsub();nurse.dispose();throw error;}
  const playerAgent={radius:o.player.body.radius,height:1.8,maxStepHeight:.25,maxSlopeRadians:Math.PI/4};
  const concealmentRoute=o.navigation.findPath({from:b.observation,to:b.concealment,agent:playerAgent})?.waypoints ?? [];
  const returnRoute=o.navigation.findPath({from:b.concealment,to:b.observation,agent:playerAgent})?.waypoints ?? [];
  const locations = () => ({observation:{...b.observation},entry:{...b.entry},crouchCover:{...b.crouchCover},
    concealment:{...b.concealment},exit:{...b.exit},patrol:b.patrol.map(p=>({...p})),
    hidingPrimary:b.hidingPrimary,hidingSecondary:b.hidingSecondary,concealmentRoute:concealmentRoute.map(p=>({...p})),returnRoute:returnRoute.map(p=>({...p})),
    hidingTargets:Object.fromEntries(o.world.hidingLocations.filter(s=>[b.hidingPrimary,b.hidingSecondary].includes(s.id)).map(s=>[s.id,{...o.world.interactables.find(m=>m.id===s.interactableId)!.object.getWorldPosition(o.player.getSnapshot().camera.position.clone())}])),
    hidingApproaches:Object.fromEntries(o.world.hidingLocations.filter(s=>[b.hidingPrimary,b.hidingSecondary].includes(s.id)).map(s=>[s.id,{...s.exitCandidates[0]!.position}]))});
  const snapshot=():StationSnapshot=>({phase:director.phase,elapsed:director.elapsed,step,
    actor:nurse.getSnapshots()[0]!,canCapture:canCapture(),firstAlertUsed,locations:locations()});
  return {
    get canCapture(){return canCapture();}, snapshot,
    witnesses:()=>autonomous()&&nurse.witnessesEntry()?[spawn.entityId]:[],
    fixedUpdate(frame){
      if(disposed||o.player.getSnapshot().captured) return;
      time=frame.elapsedSeconds;
      const dt=Math.min(frame.deltaSeconds,.1),p=o.player.getSnapshot().position;
      director.tick(dt);
      if(director.phase==='waiting' && o.eligible() &&
        (nearSegment(b.observation,previousPlayer,p,1.35)||distance(p,b.entry)<1.5||(b.contains(p)&&b.progress(p)>b.progress(b.entry)))) {
        director.advance('waiting');
      }
      previousPlayer={...p};
      const at=nurse.getSnapshots()[0]!.position;
      action=false;
      if(director.phase==='introduction') {
        const route=[b.patrol[3]!,b.patrol[2]!];
        const goal=route[step];
        if(goal) {
          nurse.setDirective({target:goal,speed:.85});
          if(distance(at,goal)<.24) step++;
        } else {
          action=true;if(hold===0)sound('nw:static',at,.14);hold+=dt;
          nurse.setDirective({target:null,speed:0,yaw:b.checkingYaw});
          if(hold>=3) director.advance('introduction');
        }
      }
      if(director.phase==='tension') {
        // Deliberate reposition, then a quiet station round while the player experiments.
        const route=[b.patrol[1]!,b.patrol[0]!];
        const goal=route[step%route.length]!;
        nurse.setDirective({target:goal,speed:.65});
        if(distance(at,goal)<.24) step++;
        if(!hintHide && director.elapsed>=4) {
          hintHide=true;o.notify('Room 105 has space beneath the bed. The station has a staff locker.');
        }
        // A learning opportunity, not a mandatory random patrol cycle or forced hiding action.
        if(director.elapsed>=8 && (distance(at,p)>=3.5||o.player.getSnapshot().hiding.state==='hidden'))
          director.advance('tension');
      }
      if(director.phase==='stealth') {
        if(b.crossedExit(p)) director.advance('stealth');
        else if(!b.contains(p)) nurse.setDirective({target:b.patrol[0]!,speed:.75});
        else nurse.setDirective(null);
      }
      if(director.phase==='escape') director.advance('escape');
      if(director.phase==='complete') nurse.setDirective({target:b.patrol[0]!,speed:.75,yaw:0});
      nurse.fixedUpdate(frame);
      const actor=nurse.getSnapshots()[0]!;
      const speed=dt>0?Math.hypot(actor.position.x-lastPosition.x,actor.position.z-lastPosition.z)/dt:0;
      o.present({deltaSeconds:dt,actor,yaw:nurse.getYaw(),speed,checkingPanel:action});
      lastPosition={...actor.position};
      if(pendingCheckpoint){const cp=pendingCheckpoint;pendingCheckpoint=null;o.save(cp);}
    },
    dispose(){if(disposed)return;disposed=true;try{unsub();}finally{nurse.dispose();}},
  };
}
