import {it,expect,vi} from 'vitest';
import {PerspectiveCamera} from 'three';
import {createCapturePresentation} from '../../src/gameplay/opening/capture';
it('uses bounded in-engine focus, skips to a released camera, and exposes retry exactly once',()=>{
 const camera=new PerspectiveCamera(70,1,.05,100);camera.position.set(0,1.65,0);
 const release=vi.fn(),ready=vi.fn();
 const presentation=createCapturePresentation({camera,reduced:()=>false,actor:()=>({x:0,y:0,z:1}),
  acquire:()=>({handoff:()=>true,release}),ready});
 const position=camera.position.clone();presentation.start();presentation.update(.7);
 expect(camera.position).toEqual(position);expect(camera.fov).toBeGreaterThanOrEqual(68);
 expect(Math.abs(camera.rotation.y)).toBeLessThanOrEqual(.421);
 presentation.skip();presentation.update(.2);expect(release).toHaveBeenCalledTimes(1);expect(ready).toHaveBeenCalledTimes(1);
 expect(camera.fov).toBe(70);expect(presentation.active).toBe(false);presentation.dispose();
});
it('keeps reduced motion still and always offers retry if a captured hiding pose cannot acquire the camera',()=>{
 const camera=new PerspectiveCamera(70,1,.05,100),ready=vi.fn();
 const p=createCapturePresentation({camera,reduced:()=>true,actor:()=>({x:10,y:0,z:0}),acquire:()=>({handoff:()=>true,release:vi.fn()}),ready});
 const q=camera.quaternion.clone();p.start();p.update(.4);expect(camera.quaternion.angleTo(q)).toBeCloseTo(0,10);expect(ready).toHaveBeenCalledTimes(1);p.dispose();
 const fallback=vi.fn(),hidden=createCapturePresentation({camera,reduced:()=>false,actor:()=>null,acquire:()=>null,ready:fallback});
 hidden.start();expect(fallback).toHaveBeenCalledTimes(1);expect(hidden.active).toBe(false);hidden.dispose();
});
it('disposes an interrupted capture without a late retry callback or leaked camera lease',()=>{
 const ready=vi.fn(),release=vi.fn();const p=createCapturePresentation({camera:new PerspectiveCamera(70,1,.05,100),reduced:()=>false,actor:()=>null,acquire:()=>({handoff:()=>true,release}),ready});
 p.start();p.dispose();p.dispose();p.update(5);expect(release).toHaveBeenCalledTimes(1);expect(ready).not.toHaveBeenCalled();
});
