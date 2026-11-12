import {Euler,Quaternion} from 'three';
import type {PerspectiveCamera} from 'three';
import type {Vec3} from '../../contracts';
import {captureCinematicPose,createCinematicPlayer} from '../chapter/cinematics';
import type {CinematicControlLease,CinematicPlayback} from '../chapter/cinematics';
export interface CapturePresentation {
  readonly active:boolean;
  readonly progress:number;
  start():void;
  update(delta:number):void;
  skip():void;
  dispose():void;
}
/** Reuses the camera transport. It changes no actor/capsule, health or story state. */
export function createCapturePresentation(o:{durationSeconds?:number;camera:PerspectiveCamera;reduced:()=>boolean;acquire:()=>CinematicControlLease|null;actor:()=>Vec3|null;ready:()=>void}):CapturePresentation {
  let playback:CinematicPlayback|null=null,disposed=false,duration=1;
  const transport=createCinematicPlayer({camera:o.camera,acquireControl:o.acquire,validateHandoff:()=>true,
    settled(){playback=null;if(!disposed)o.ready();}});
  return {
    get active(){return playback!==null},
    get progress(){return playback?Math.min(1,playback.elapsedSeconds/duration):1},
    start(){
      if(disposed||playback)return;
      const first=captureCinematicPose(o.camera),angle=new Euler().setFromQuaternion(o.camera.quaternion,'YXZ');
      const actor=o.actor();
      const desired=actor?Math.atan2(-(actor.x-first.position.x),-(actor.z-first.position.z)):angle.y;
      const turn=Math.atan2(Math.sin(desired-angle.y),Math.cos(desired-angle.y));
      const reduced=o.reduced();duration=o.durationSeconds??(reduced?.35:1.1);
      const last={...first,rotation:new Quaternion().setFromEuler(new Euler(angle.x,angle.y+(reduced?0:Math.max(-.42,Math.min(.42,turn))),0,'YXZ'))};
      try {playback=transport.play({id:'nw007.cine.shaw-capture',durationSeconds:duration,skipBlendSeconds:.15,
        camera:[{atSeconds:0,pose:first},{atSeconds:duration*.65,pose:{...last,fov:first.fov-(reduced?0:2)},easing:'smooth'},{atSeconds:duration,pose:last,easing:'smooth'}],cues:[]});}
      catch {o.ready();} // Hidden/captured poses may not admit a camera lease; always retain retry.
    },
    update(delta){if(!disposed)transport.update(delta)},
    skip(){playback?.skip()},
    dispose(){if(disposed)return;disposed=true;transport.dispose();playback=null;},
  };
}
