import {Euler,Quaternion} from 'three';
import type {CinematicDefinition,CinematicPose} from '../chapter/cinematics';
/** Authored relative to the actual bed eye and safe controller handoff; no ward coordinates. */
export function awakeningPath(first:CinematicPose,last:CinematicPose,yaw:number,reduced:boolean):CinematicDefinition {
  const pose=(fraction:number,height:number,pitch:number,turn=0):CinematicPose=>({
    position:{x:first.position.x+(last.position.x-first.position.x)*fraction,y:height,z:first.position.z+(last.position.z-first.position.z)*fraction},
    rotation:new Quaternion().setFromEuler(new Euler(pitch,yaw+turn,0,'YXZ')),fov:last.fov});
  if(reduced)return {id:'nw007.cine.awakening',durationSeconds:3.2,skipBlendSeconds:.3,
    camera:[{atSeconds:0,pose:first},{atSeconds:3.2,pose:last,easing:'smooth'}],cues:[]};
  const seated=pose(.15,first.position.y+(last.position.y-first.position.y)*.64,.12,.035);
  return {id:'nw007.cine.awakening',durationSeconds:9,skipBlendSeconds:.35,camera:[
    {atSeconds:0,pose:first},
    {atSeconds:1.1,pose:pose(0,first.position.y,1.02,.025),easing:'smooth'},
    {atSeconds:3.5,pose:seated,easing:'smooth'},
    {atSeconds:4.2,pose:seated},
    {atSeconds:7.9,pose:{...last,position:{...last.position,y:last.position.y-.025}},easing:'smooth'},
    {atSeconds:9,pose:last,easing:'smooth'},
  ],cues:[{atSeconds:2.1,kind:'sound',id:'nw007:bed-fabric'},{atSeconds:6.3,kind:'sound',id:'nw007:stand-footstep'}]};
}
