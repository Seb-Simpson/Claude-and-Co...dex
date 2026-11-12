import type {GameEvents,SoundEvent,Vec3} from '../../contracts';
import type {EntityVisual} from '../../horror/entities/visual';
import {NURSE_CLIPS} from '../../horror/entities/nurseClips';
import type {StationActorPose} from './nursesStation';

export const nurseClip=(name:string)=>{
 const spec=NURSE_CLIPS.find(c=>c.name===name);
 if(!spec)throw Error(`Unknown published Nurse clip: ${name}`);
 return spec;
};
export interface NursePerformance {
 readonly action:StationActorPose['action']; readonly clip:string|null;
 readonly time:number; readonly elapsed:number; readonly duration:number; readonly finished:boolean;
 readonly available:boolean; readonly contactReady:boolean;
 readonly rightHand:Vec3; readonly leftHand:Vec3;
 readonly footContacts:number; readonly panelPresses:number; readonly paperTurns:number; readonly humActive:boolean;
}
const OWNED_CUES=['nw:shaw-step','nw:shaw-keys','nw:shaw-rustle','nw:call-panel','nw:paper','nw:station-hum','nw:capture'] as const;
/** Presentation only: a single visual and the existing event/mixer owner. Never translates the actor. */
export function createNursePresentation(visual:EntityVisual,events:GameEvents|undefined,station:Vec3) {
 let action:StationActorPose['action']=null,clip:string|null=null,available=false,elapsed=0;
 let disposed=false,captureSound=false,audible=false,hum=false,contact=false,yaw:number|null=null,previousTime=0;
 let footContacts=0,panelPresses=0,paperTurns=0;
 const cue=(id:string,position:Vec3,volume=.22,loop=false,command:SoundEvent['action']='play')=>{audible=true;events?.emit('atmosphere:sound',{cueId:id,action:command,position:{...position},volume,loop})};
 function stop(){
  if(!audible&&!hum)return;audible=false;
  for(const id of OWNED_CUES)events?.emit('atmosphere:sound',{cueId:id,action:'stop',volume:0,loop:false});
  hum=false;
 }
 function select(name:string|null){
  if(clip===name)return;
  visual.playClip?.(null);clip=name;elapsed=0;previousTime=0;
  available=name!==null&&(visual.playClip?.(name,{fade:name==='capture'?.15:.45})??false);
  if(name&&!available)visual.forceState(nurseClip(name).fallback);
  else visual.forceState(null);
 }
 return {
  read():NursePerformance {
   const actual=visual.clip,spec=clip?nurseClip(clip):null;
   return {action,clip,time:actual?.time??elapsed,elapsed,duration:spec?.duration??0,
    finished:available?Boolean(actual?.finished):elapsed>=(spec?.duration??Infinity),available,contactReady:contact,
    rightHand:{...visual.bonePosition('handR')},leftHand:{...visual.bonePosition('handL')},
    footContacts,panelPresses,paperTurns,humActive:hum};
  },
  present(pose:StationActorPose){
   if(disposed)return;
   const change=action!==pose.action,turning=yaw!==null&&Math.abs(Math.atan2(Math.sin(pose.yaw-yaw),Math.cos(pose.yaw-yaw)))>.004;
   yaw=pose.yaw;action=pose.action;contact=pose.contactReady===true;
   if(pose.visible===false){select(null);stop();return;}
   if(action==='capture'&&change){stop();captureSound=false;}
   if(action==='capture'&&!captureSound&&pose.deltaSeconds>0){cue('nw:capture',pose.actor.position,.4);captureSound=true;}
   if(action!=='capture'&&!hum&&pose.deltaSeconds>0){cue('nw:station-hum',station,.28,true);hum=true;}
   const investigating=['investigate','search','lost-target'].includes(pose.actor.state);
   const restingListen=(pose.checkingPanel&&!contact)||(action==null&&investigating&&pose.speed<.06);
   const rested=clip==='idle'||(clip==='listen_brief'&&(visual.clip?.finished??elapsed>=nurseClip('listen_brief').duration));
   const requested=action==='capture'?'capture':action==='check-panel'&&contact?'panel_check':
    action==='inspect-records'&&contact?'records_read':action==='listen'?'listen_brief':
    restingListen?(rested?'idle':'listen_brief'):action==null&&investigating?'investigate':
    pose.speed<.06&&turning?'turn':null;
   if(change)select(null);
   select(requested);
   if(change&&pose.checkingPanel&&pose.deltaSeconds>0){cue('nw:shaw-keys',pose.actor.position,.18);cue('nw:shaw-rustle',pose.actor.position,.19);}
   const dt=Math.max(0,Math.min(pose.deltaSeconds,.1));
   const contacts=visual.update(dt,{behaviour:pose.actor.state,speed:pose.speed,observed:false});
   elapsed+=dt;
   const time=visual.clip?.time??elapsed;
   if(available&&contact&&clip==='panel_check'&&previousTime<3.2&&time>=3.2){cue('nw:call-panel',station,.28);panelPresses++;}
   if(available&&contact&&clip==='records_read'&&previousTime<3&&time>=3){cue('nw:paper',station,.25);paperTurns++;}
   previousTime=time;
   if(pose.speed>.04&&action!=='capture')for(const foot of contacts){
    cue('nw:shaw-step',visual.bonePosition(foot.bone),.25);footContacts++;
   }
  },
  cancel(){stop();select(null);action=null;contact=false;captureSound=false;},
  dispose(){if(disposed)return;stop();select(null);disposed=true;},
 };
}
