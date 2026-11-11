import {afterEach,expect,it,vi} from 'vitest';
import {assetByteStats,clearPreloaded,preloadOne,readAssetBytes,takePreloaded} from '../../src/assets/preload';
afterEach(()=>{clearPreloaded();vi.unstubAllGlobals()});
it('retains immutable bytes after a first loader consumes them; retries do not require network',async()=>{
 const fetch=vi.fn(async()=>new Response(new Uint8Array([1,2,3])));vi.stubGlobal('fetch',fetch);
 await preloadOne({url:'/canonical.glb',bytes:3,label:'Canonical'});
 const ticket=takePreloaded('/canonical.glb')!;new Uint8Array(ticket)[0]=99;
 expect(takePreloaded('/canonical.glb')).toBeUndefined();
 fetch.mockImplementation(async()=>{throw Error('network lost after capture')});
 for(let i=0;i<6;i++){
  const data=await readAssetBytes('/canonical.glb');expect([...new Uint8Array(data)]).toEqual([1,2,3]);new Uint8Array(data)[0]=42;
 }
 expect(fetch).toHaveBeenCalledTimes(1);expect(assetByteStats()).toEqual({entries:1,bytes:3});
});
it('uses the same fresh byte source without a frontend preload and shares concurrent downloads',async()=>{
 const fetch=vi.fn(async()=>new Response(new Uint8Array([4,5])));vi.stubGlobal('fetch',fetch);
 const [a,b]=await Promise.all([readAssetBytes('/cold.glb'),readAssetBytes('/cold.glb')]);
 expect(a).not.toBe(b);expect(fetch).toHaveBeenCalledTimes(1);expect(assetByteStats()).toEqual({entries:1,bytes:2});
});
it('never retains failures, so a subsequent valid download can recover',async()=>{
 const fetch=vi.fn().mockResolvedValueOnce(new Response('',{status:503})).mockResolvedValueOnce(new Response(new Uint8Array([9])));vi.stubGlobal('fetch',fetch);
 await expect(readAssetBytes('/retry.glb')).rejects.toThrow('503');expect(assetByteStats().entries).toBe(0);
 expect(new Uint8Array(await readAssetBytes('/retry.glb'))[0]).toBe(9);
});
it('does not repopulate an ended asset session from a late download',async()=>{
 let resolve!:(r:Response)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(r=>{resolve=r})));
 const pending=readAssetBytes('/late.glb');clearPreloaded();resolve(new Response(new Uint8Array([7])));
 await expect(pending).rejects.toThrow('Asset session ended');expect(assetByteStats()).toEqual({entries:0,bytes:0});
});
