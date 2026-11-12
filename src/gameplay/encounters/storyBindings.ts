import {Box3, Vector3} from 'three';
import type {Mesh} from 'three';
import type {HospitalWorld, Vec3, NavigationProvider} from '../../contracts';
import type {StationBindings} from './stationBindings';
import {ENTITY_PROFILES} from '../../entities/profiles';
export const STATION_RECORD_ID='nw:opening:station-record';
/** Optional NW007B nodes win; existing embedded artwork supplies a usable baseline. */
export function stationRecordPoint(world:HospitalWorld):Vector3|null {
  const explicit=world.root.getObjectByName('nw:station:record-104')??world.root.getObjectByName('nw:cinematic:station-record');
  if(explicit)return explicit.getWorldPosition(new Vector3());
  const papers=world.root.getObjectByName('station_paperwork') as Mesh|undefined;
  const entry=world.root.getObjectByName('nw:stealth:entry');
  if(!papers?.geometry||!entry)return null;
  papers.updateWorldMatrix(true,false);
  const origin=entry.getWorldPosition(new Vector3()),p=new Vector3(),closest=new Vector3();let best=Infinity;
  const a=papers.geometry.getAttribute('position'),top=new Box3().setFromObject(papers).max.y;
  for(let i=0;i<a.count;i++){
    p.fromBufferAttribute(a,i).applyMatrix4(papers.matrixWorld);
    if(p.y<top-.03)continue;
    const distance=p.distanceToSquared(origin);
    if(distance<best){best=distance;closest.copy(p)}
  }
  // The named mesh contains multiple sheets; use the cluster nearest the published entrance.
  const centre=new Vector3();let count=0;
  for(let i=0;i<a.count;i++){
    p.fromBufferAttribute(a,i).applyMatrix4(papers.matrixWorld);
    if(p.y>=top-.03&&p.distanceToSquared(closest)<.4**2){centre.add(p);count++}
  }
  return count?centre.divideScalar(count):closest;
}
export function stationChoreography(world:HospitalWorld,b:StationBindings,nav:NavigationProvider) {
  // NW-007B's published names take precedence; no import from its unmerged branch.
  const aliases:Readonly<Record<string,string>>={
    'nw:cinematic:shaw-panel-target':'nw:station:call-lamp-104',
    'nw:cinematic:shaw-panel-stand':'nw:station:nurse-panel',
    'nw:cinematic:shaw-record-stand':'nw:station:nurse-records',
  };
  const binding=(id:string)=>world.root.getObjectByName(aliases[id]??id)??world.root.getObjectByName(id);
  const point=(id:string,fallback:Vec3)=>binding(id)?.getWorldPosition(new Vector3())??new Vector3().copy(fallback);
  const panel=world.root.getObjectByName('station_annunciator');
  const panelLook=point('nw:cinematic:shaw-panel-target',panel?new Box3().setFromObject(panel).getCenter(new Vector3()):b.patrol[0]!);
  const recordLook=stationRecordPoint(world)??new Vector3().copy(b.patrol[1]!);
  function stand(name:string,target:Vec3,near:Vec3):Vec3 {
    const explicit=binding(name)?.getWorldPosition(new Vector3());
    if(explicit && nav.isPositionValid(explicit,ENTITY_PROFILES.nurse.agent))return {...explicit};
    const direction=new Vector3().subVectors(near,target).setY(0).normalize();
    for(const offset of [1.1,1.4,1.7]){
      const p=new Vector3().copy(target).addScaledVector(direction,offset);p.y=b.spawn.position.y;
      if(nav.isPositionValid(p,ENTITY_PROFILES.nurse.agent))return {...p};
    }
    return {...near};
  }
  return {panelLook:{...panelLook},recordLook:{...recordLook},
    panelStand:stand('nw:cinematic:shaw-panel-stand',panelLook,b.patrol[0]!),
    recordStand:stand('nw:cinematic:shaw-record-stand',recordLook,b.patrol[2]!),
    staging:[point('nw:cinematic:shaw-entry',b.patrol[5]??b.spawn.position),new Vector3().copy(b.exit),new Vector3().copy(b.spawn.position),new Vector3().copy(b.patrol[1]!)].map(p=>({...p}))};
}
