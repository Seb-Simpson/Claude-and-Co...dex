import {Group} from 'three';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import type {HospitalWorld,ModuleContext} from '../../src/contracts';
const mocks=vi.hoisted(()=>({room:vi.fn(),station:vi.fn(),build:vi.fn()}));
vi.mock('../../src/world/dressing/room104',()=>({loadRoom104Set:mocks.room}));
vi.mock('../../src/world/dressing/station',()=>({loadStationSet:mocks.station}));
vi.mock('../../src/world/createHospitalWorld',()=>({createHospitalWorld:mocks.build}));
import hospital from '../../src/world/hospital.module';
const context={engine:{renderer:{capabilities:{getMaxAnisotropy:()=>1}}}} as unknown as ModuleContext;
function set(name:string){
 const root=new Group();root.name=name;
 const accessCard=new Group();accessCard.name='nw:opening:access-card-prop';root.add(accessCard);
 return {root,accessCard,doorLeaf:new Group(),wheelchair:null,stats:{triangles:1,materials:1,textures:1},update:vi.fn(),dispose:vi.fn(()=>root.removeFromParent())};
}
beforeEach(()=>{
 vi.stubGlobal('document',{});vi.stubGlobal('location',{search:'?nwSet=procedural'});
 vi.clearAllMocks();
 mocks.build.mockImplementation(()=>{
  const world={root:new Group(),doors:[]} as unknown as HospitalWorld;
  return {world,dispose:vi.fn(()=>world.root.removeFromParent())};
 });
});
afterEach(()=>vi.unstubAllGlobals());
it('never publishes the procedural room after a critical Room104 load failure',async()=>{
 const station=set('nw:station-set');mocks.room.mockRejectedValueOnce(Error('asset failed after capture'));mocks.station.mockResolvedValueOnce(station);
 await expect(hospital.setup(context)).rejects.toThrow('Canonical hospital assets');
 expect(mocks.build).not.toHaveBeenCalled();expect(station.dispose).toHaveBeenCalledTimes(1);
});
it('releases the loaded room if station loading fails, instead of mixing current and old geometry',async()=>{
 const room=set('nw:room104-set');mocks.room.mockResolvedValueOnce(room);mocks.station.mockRejectedValueOnce(Error('station timeout'));
 await expect(hospital.setup(context)).rejects.toThrow('Canonical hospital assets');
 expect(room.dispose).toHaveBeenCalledTimes(1);expect(mocks.build).not.toHaveBeenCalled();
});
it('rejects incomplete card bindings rather than constructing an invisible-pickup softlock',async()=>{
 const room=set('nw:room104-set'),station=set('nw:station-set');mocks.room.mockResolvedValueOnce({...room,accessCard:null});mocks.station.mockResolvedValueOnce(station);
 await expect(hospital.setup(context)).rejects.toThrow('required access-card');
 expect(room.dispose).toHaveBeenCalledTimes(1);expect(station.dispose).toHaveBeenCalledTimes(1);expect(mocks.build).not.toHaveBeenCalled();
});
it('uses canonical sets even for the obsolete public procedural query, and cleans each attempt once',async()=>{
 const room=set('nw:room104-set'),station=set('nw:station-set');mocks.room.mockResolvedValueOnce(room);mocks.station.mockResolvedValueOnce(station);
 const result=await hospital.setup(context);
 expect(result.world!.root.getObjectByName('nw:room104-set')).toBe(room.root);
 expect(result.world!.root.getObjectByName('nw:station-set')).toBe(station.root);
 expect(result.world!.root.userData.nwPresentation.mode).toBe('canonical');
 result.dispose();result.dispose();expect(room.dispose).toHaveBeenCalledTimes(1);expect(station.dispose).toHaveBeenCalledTimes(1);
});
it('rolls back loaded GPU owners when world construction fails',async()=>{
 const room=set('nw:room104-set'),station=set('nw:station-set');mocks.room.mockResolvedValueOnce(room);mocks.station.mockResolvedValueOnce(station);mocks.build.mockImplementationOnce(()=>{throw Error('construction failed')});
 await expect(hospital.setup(context)).rejects.toThrow('construction failed');expect(room.dispose).toHaveBeenCalledTimes(1);expect(station.dispose).toHaveBeenCalledTimes(1);
});
