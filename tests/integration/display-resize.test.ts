import { afterEach, expect, it, vi } from 'vitest';
import type { WebGLRenderer } from 'three';
import { attachDisplay } from '../../src/frontend/display';
afterEach(() => vi.unstubAllGlobals());
it('resizes a stale drawing buffer when pixel density is unchanged, and releases its resize listeners', () => {
  const target = Object.assign(new EventTarget(), {devicePixelRatio:1}); vi.stubGlobal('window',target); vi.stubGlobal('ResizeObserver',undefined);
  const size = {clientWidth:800,clientHeight:600}; const canvas = {width:1280,height:720}; let ratio = 1;
  const setSize = vi.fn((w:number,h:number) => {canvas.width=Math.floor(w*ratio);canvas.height=Math.floor(h*ratio);});
  const renderer = {domElement:canvas,getPixelRatio:()=>ratio,setPixelRatio:(r:number)=>{ratio=r;},setSize} as unknown as WebGLRenderer;
  const display = attachDisplay(renderer,size as HTMLElement,'medium');
  expect(canvas).toEqual({width:800,height:600});
  size.clientWidth=1024;size.clientHeight=640;target.dispatchEvent(new Event('resize'));
  expect(canvas).toEqual({width:1024,height:640});
  display.setQuality('low');expect(canvas).toEqual({width:768,height:480});
  display.dispose();const calls=setSize.mock.calls.length;target.dispatchEvent(new Event('resize'));expect(setSize).toHaveBeenCalledTimes(calls);
});
