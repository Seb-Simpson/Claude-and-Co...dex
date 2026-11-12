import {it,expect,vi} from 'vitest';
import {Texture} from 'three';
import {disposeOwnedTextures} from '../../src/assets/disposeTextures';
import {resolveNurseAnimations} from '../../src/gameplay/encounters/animationContract';
import type {NurseAnimationBinding} from '../../src/gameplay/encounters/animationContract';
it('frees shared bitmap backing once, after disposing all owned texture maps',()=>{
 const order:string[]=[],image={close:vi.fn(()=>order.push('bitmap'))};
 const a=new Texture(image),b=new Texture(image);
 a.addEventListener('dispose',()=>order.push('a'));b.addEventListener('dispose',()=>order.push('b'));
 disposeOwnedTextures([a,b,a]);expect(order).toEqual(['a','b','bitmap']);expect(image.close).toHaveBeenCalledTimes(1);
});
it('preserves non-owned image elements and data textures while disposing their GPU texture owners',()=>{
 const a=new Texture({data:new Uint8Array(4),width:1,height:1});const dispose=vi.spyOn(a,'dispose');
 expect(()=>disposeOwnedTextures([a])).not.toThrow();expect(dispose).toHaveBeenCalledOnce();
});
it('accepts only supplied clips with documented duration, poses, in-place motion and existing targets',()=>{
 const row:NurseAnimationBinding={category:'check-panel',clipName:'fixture-only-panel',durationSeconds:2,loop:false,entryPose:'standing',exitPose:'standing',rootMotion:'in-place',targetBinding:'fixture:panel',fallback:'observe'};
 const clips=new Map([[row.clipName,{duration:2}]]);
 expect(resolveNurseAnimations([row],clips,id=>id==='fixture:panel').accepted.get('check-panel')).toEqual(row);
 expect(resolveNurseAnimations([row],new Map(),()=>true).rejected).toEqual(['check-panel']);
 expect(resolveNurseAnimations([{...row,durationSeconds:7}],clips,()=>true).accepted.size).toBe(0);
 expect(resolveNurseAnimations([row],clips,()=>false).accepted.size).toBe(0);
});
