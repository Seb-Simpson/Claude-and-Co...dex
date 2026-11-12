import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {expect,it,vi} from 'vitest';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {loadModelLibrary} from '../../src/horror/entities/model/library';
import {MODEL_URLS,MODEL_MANIFESTS} from '../../src/horror/entities/model/assets';
import {createModelVisual} from '../../src/horror/entities/model/modelVisual';
(globalThis as {self?:unknown}).self=globalThis;
it('scales the actual shipped investigation gait by real search speed and stops contacts when the capsule stops',async()=>{
 const warn=vi.spyOn(console,'warn').mockImplementation(()=>{}),data=readFileSync(fileURLToPath(MODEL_URLS.nurse));
 const library=await loadModelLibrary({urls:{nurse:MODEL_URLS.nurse},manifests:{nurse:MODEL_MANIFESTS.nurse},load:async()=>new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'')});
 const v=createModelVisual('nurse',library.get('nurse')!);
 try{
  v.update(.05,{behaviour:'search',speed:1.1});v.playClip!('investigate',{restart:true,fade:0});
  for(let i=0;i<10;i++)v.update(.1,{behaviour:'search',speed:1.1});
  expect(v.clip!.time).toBeCloseTo(2,4);
  const at=v.clip!.time;let steps=0;
  for(let i=0;i<10;i++)steps+=v.update(.1,{behaviour:'search',speed:0}).length;
  expect(v.clip!.time).toBe(at);expect(steps).toBe(0);
 }finally{v.dispose();library.dispose();warn.mockRestore();}
},60000);
