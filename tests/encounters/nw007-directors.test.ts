import {describe,it,expect} from 'vitest';
import {createExperienceCoordinator} from '../../src/gameplay/directors/experience';
import {createNarrativeDirector,migrateNarrative,NARRATIVE_BEATS,validateNarrativeCheckpoint} from '../../src/gameplay/directors/narrative';
import {validateOpeningCheckpoint} from '../../src/gameplay/opening/checkpoint';
import {createOpeningState} from '../../src/gameplay/opening/state';
import {awakeningPath} from '../../src/gameplay/opening/awakening';
import {validateCinematicDefinition} from '../../src/gameplay/chapter/cinematics';
const pose={position:{x:1,y:1,z:1},rotation:{x:0,y:0,z:0,w:1},fov:70};
describe('NW007 narrative/experience authority',()=>{
 it('requires discovery before an introduction, supports any arrival speed, and commits each beat once',()=>{
  const story=createNarrativeDirector();expect(story.scene).toBe('awakening');
  expect(story.commit('record-read')).toBe(false);expect(story.nurseEligible).toBe(false);
  for(const beat of NARRATIVE_BEATS){expect(story.commit(beat)).toBe(true);expect(story.commit(beat)).toBe(false);}
  expect(story.scene).toBe('complete');expect(story.checkpoint()).toEqual({version:1,step:7});
 });
 it('restores all six scenes deterministically and migrates existing saves without replaying introductions',()=>{
  for(let step=0;step<=7;step++){
   const a=createNarrativeDirector({version:1,step}),b=createNarrativeDirector(a.checkpoint());
   expect(b.scene).toBe(a.scene);expect(b.nurseEligible).toBe(step>=4);
  }
  expect(createNarrativeDirector(migrateNarrative(true,true,{version:1,phase:'stealth'})).scene).toBe('autonomous-stealth');
  expect(createNarrativeDirector(migrateNarrative(true,true,{version:1,phase:'complete'})).scene).toBe('complete');
 });
 it('rejects corrupted saves and conflicting narrative/encounter phases',()=>{
  for(const bad of [null,[],{version:2,step:3},{version:1,step:8},{version:1,step:NaN},{version:1,get step(){throw Error('getter')}}])expect(validateNarrativeCheckpoint(bad)).toBeNull();
  const state={...createOpeningState(),awakened:true,cardAcquired:true,doorUnlocked:true,secondLinePlayed:true};
  expect(validateOpeningCheckpoint({version:1,milestone:'station-approach',state:{...state,stationReached:true},narrative:{version:1,step:3}})).not.toBeNull();
  expect(validateOpeningCheckpoint({version:1,milestone:'station-approach',state:{...state,stationReached:true},narrative:{version:1,step:3},station:{version:1,phase:'stealth'}})).toBeNull();
 });
 it('prevents conflicting actors/cameras/dialogue while permitting unrelated atmospheric ownership',()=>{
  const c=createExperienceCoordinator(),a=c.acquire('awakening',['camera','dialogue'])!;
  expect(c.acquire('other-cinematic',['camera'])).toBeNull();
  expect(c.acquire('shaw-intro',['nurse','dialogue'])).toBeNull();
  const ambience=c.acquire('ambient',['environment'])!;expect(ambience).not.toBeNull();
  a.release();a.release();expect(a.signal.aborted).toBe(true);
  expect(c.acquire('shaw-intro',['nurse','dialogue'])).not.toBeNull();
  c.cancel('shaw-intro');expect(c.snapshot()).toEqual([{owner:'ambient',resources:['environment']}]);
  c.dispose();expect(ambience.signal.aborted).toBe(true);expect(c.acquire('late',['camera'])).toBeNull();
 });
 it('cancels stale callbacks before a new attempt can acquire resources, without leaking reentrant leases',()=>{
  const c=createExperienceCoordinator(),lease=c.acquire('scene',['nurse'])!;let reentrant:unknown;
  lease.signal.addEventListener('abort',()=>{reentrant=c.acquire('stale',['nurse'])});
  c.cancel();expect(reentrant).toBeNull();expect(c.snapshot()).toEqual([]);
  expect(c.acquire('retry',['nurse'])).not.toBeNull();c.dispose();
 });
 it('provides an eased bed/orient/sit/stand path with exact safe handoff and a restrained reduced-motion path',()=>{
  const last={...pose,position:{x:2,y:1.65,z:2}};
  const full=validateCinematicDefinition(awakeningPath(pose,last,0,false)),reduced=validateCinematicDefinition(awakeningPath(pose,last,0,true));
  expect(full.camera).toHaveLength(6);expect(full.camera[2]!.pose).toEqual(full.camera[3]!.pose);
  expect(full.camera.at(-1)!.pose).toEqual(last);expect(reduced.camera).toHaveLength(2);
  expect(reduced.camera.at(-1)!.pose).toEqual(last);expect(reduced.durationSeconds).toBeLessThan(full.durationSeconds);
 });
});
