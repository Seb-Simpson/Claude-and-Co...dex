import {expect,it} from 'vitest';
import {Group,Object3D} from 'three';
import type {HospitalWorld,NavigationProvider} from '../../src/contracts';
import type {StationBindings} from '../../src/gameplay/encounters/stationBindings';
import {stationChoreography,stationRecordPoint} from '../../src/gameplay/encounters/storyBindings';

it('reads NW-007B published station nodes in world space without importing assets or copying coordinates',()=>{
 const root=new Group();root.position.set(10,0,-10);
 const points={
  'nw:station:record-104':[1,1.2,2],
  'nw:station:call-lamp-104':[3,1.8,4],
  'nw:station:nurse-panel':[5,0,6],
  'nw:station:nurse-records':[7,0,8],
 } as const;
 for(const [name,p] of Object.entries(points)){const node=new Object3D();node.name=name;node.position.set(p[0],p[1],p[2]);root.add(node)}
 const legacy=new Object3D();legacy.name='nw:cinematic:station-record';root.add(legacy);
 const world={root} as HospitalWorld;
 const origin={x:0,y:0,z:0};
 const b={spawn:{position:origin},exit:origin,patrol:Array.from({length:6},()=>origin)} as unknown as StationBindings;
 const nav={isPositionValid:()=>true} as unknown as NavigationProvider;
 expect(stationRecordPoint(world)?.toArray()).toEqual([11,1.2,-8]);
 const route=stationChoreography(world,b,nav);
 expect(route.panelLook).toMatchObject({x:13,y:1.8,z:-6});
 expect(route.panelStand).toMatchObject({x:15,y:0,z:-4});
 expect(route.recordStand).toMatchObject({x:17,y:0,z:-2});
});
