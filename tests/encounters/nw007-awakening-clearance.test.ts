import {it,expect,beforeAll} from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import {Quaternion,Vector3} from 'three';
import {createHospitalWorld} from '../../src/world/createHospitalWorld';
import {createPhysicsAdapter} from '../../src/physics';
import {awakeningPath} from '../../src/gameplay/opening/awakening';
beforeAll(async()=>{await RAPIER.init()});
it('keeps the authored awakening camera clear of the actual hospital colliders and ends at the safe controller eye',()=>{
 const hospital=createHospitalWorld({textures:false}),backend=new RAPIER.World({x:0,y:-9.81,z:0}),physics=createPhysicsAdapter(backend,hospital.world.colliders);
 try{
  const bed=hospital.world.root.getObjectByName('nw:opening:awakening-eye')!,spawn=hospital.world.playerSpawn;
  const first={position:bed.getWorldPosition(new Vector3()),rotation:bed.getWorldQuaternion(new Quaternion()),fov:70};
  const last={position:{...spawn.position,y:spawn.position.y+1.65},rotation:new Quaternion(),fov:70};
  for(const reduced of [false,true]){
   const path=awakeningPath(first,last,spawn.yaw,reduced);
   for(let i=1;i<path.camera.length;i++)for(let n=0;n<=40;n++){
    const p=new Vector3().copy(path.camera[i-1]!.pose.position).lerp(new Vector3().copy(path.camera[i]!.pose.position),n/40);
    expect(physics.isPositionFree({...p,y:p.y-.06},.06,.12,[],false),JSON.stringify({reduced,i,p})).toBe(true);
   }
   expect(path.camera.at(-1)!.pose.position).toEqual(last.position);
  }
 }finally{physics.dispose();backend.free();hospital.dispose()}
});
