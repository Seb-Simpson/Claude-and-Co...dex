import {describe,it,expect} from 'vitest';
import {createEncounterDirector} from '../../src/gameplay/encounters/director';
import {validateStationCheckpoint} from '../../src/gameplay/encounters/checkpoint';
import {validateOpeningCheckpoint} from '../../src/gameplay/opening/checkpoint';
import {createOpeningState,reduceOpening} from '../../src/gameplay/opening/state';

describe('ordered encounter authority and untrusted checkpoint data',()=>{
 it('does not skip, repeat or apply a stale phase command',()=>{
  const events:string[]=[];const d=createEncounterDirector(['waiting','intro','tension','stealth','complete'] as const,undefined,(a,b)=>events.push(`${a}:${b}`));
  expect(d.advance('intro')).toBe(false);d.tick(.1);expect(d.elapsed).toBe(.1);
  expect(d.advance('waiting')).toBe(true);expect(d.elapsed).toBe(0);expect(d.advance('waiting')).toBe(false);
  for(const p of ['intro','tension','stealth'] as const)expect(d.advance(p)).toBe(true);
  expect(d.advance('complete')).toBe(false);expect(events).toHaveLength(4);
 });
 it('restores a phase without firing introduction events or retaining a partial phase clock',()=>{
  const d=createEncounterDirector(['intro','tension','stealth'] as const,'tension');
  expect(d.phase).toBe('tension');expect(d.elapsed).toBe(0);expect(d.advance('intro')).toBe(false);
  expect(()=>d.tick(NaN)).toThrow();expect(()=>d.tick(-1)).toThrow();
  expect(()=>createEncounterDirector(['a','a'])).toThrow();
 });
 it('validates additive milestones without accepting extra fields, getters or unknown phases',()=>{
  for(const phase of ['introduction','tension','stealth','complete'])expect(validateStationCheckpoint({version:1,phase})).toEqual({version:1,phase});
  for(const raw of [null,{version:2,phase:'stealth'},{version:1,phase:'escape'},{version:1,phase:'stealth',memory:[1]},Object.defineProperty({version:1},'phase',{get(){throw Error('getter invoked')},enumerable:true})])expect(validateStationCheckpoint(raw)).toBeNull();
  let state=reduceOpening(createOpeningState(),'awaken').state;state=reduceOpening(state,'take-card').state;state=reduceOpening(state,'use-reader').state;
  const old={version:1,milestone:'room104-exit',state};expect(validateOpeningCheckpoint(old)).toEqual(old);
  expect(validateOpeningCheckpoint({...old,station:{version:1,phase:'tension'}})?.station?.phase).toBe('tension');
  expect(validateOpeningCheckpoint({...old,station:{version:100,phase:'stealth'}})).toBeNull();
  expect(validateOpeningCheckpoint({...old,station:{version:1,phase:'complete'}})).toBeNull();
 });
});
