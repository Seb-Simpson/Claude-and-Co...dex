import {Vector3} from 'three';
import type {PerspectiveCamera} from 'three';
import type {Vec3} from '../../contracts';
import type {PhysicsAdapter} from '../../physics';
/** Check the whole silhouette, not a centre ray; this only stages a dormant actor. */
export function canStageUnseen(camera:PerspectiveCamera,physics:Pick<PhysicsAdapter,'hasLineOfSight'>,point:Vec3):boolean {
  camera.updateWorldMatrix(true,false);
  const eye=camera.getWorldPosition(new Vector3());
  if(Math.hypot(eye.x-point.x,eye.z-point.z)<4)return false;
  const right=new Vector3().setFromMatrixColumn(camera.matrixWorld,0).normalize();
  for(const [height,side] of [[.15,0],[.9,-.4],[.9,.4],[1.75,-.3],[1.75,.3]]){
    const target=new Vector3(point.x,point.y+height!,point.z).addScaledVector(right,side!);
    const screen=target.clone().project(camera);
    if(screen.z>=-1&&screen.z<=1&&Math.abs(screen.x)<1.2&&Math.abs(screen.y)<1.2&&physics.hasLineOfSight(eye,target))return false;
  }
  return true;
}
