import {it,expect,vi} from 'vitest';
import {Group,Vector3} from 'three';
import {createEventBus} from '../../src/integration/events';
import {createNursePresentation,nurseClip} from '../../src/gameplay/encounters/nursePresentation';
import type {StationActorPose} from '../../src/gameplay/encounters/nursesStation';
import type {EntityVisual} from '../../src/horror/entities/visual';
import type {SoundEvent} from '../../src/contracts';
function fixture(available=true){
 let clip:{name:string;time:number;duration:number;finished:boolean}|null=null;
 const events=createEventBus(),sounds:SoundEvent[]=[];events.on('atmosphere:sound',s=>sounds.push(s));
 const visual={type:'nurse',object:new Group(),get clip(){return clip},visualState:'idle',forceState:vi.fn(),
  playClip:vi.fn((name:string|null)=>{clip=name&&available?{name,time:0,duration:nurseClip(name).duration,finished:false}:null;return available}),
  update:vi.fn((dt:number)=>{if(clip){clip.time+=dt;clip.finished=clip.time>=clip.duration;}return []}),
  bonePosition:()=>new Vector3(),setOpacity(){},dispose(){}} satisfies EntityVisual;
 const p=createNursePresentation(visual,events,{x:1,y:1,z:1});
 const pose:StationActorPose={actor:{id:'nurse',type:'nurse',state:'idle',position:{x:0,y:0,z:0},lastKnownPlayer:null},yaw:0,speed:0,checkingPanel:true,action:'check-panel',contactReady:true,visible:true,deltaSeconds:1/60};
 return {visual,p,sounds,pose,tick(seconds:number,changes:Partial<StationActorPose>={}){for(let i=0;i<Math.ceil(seconds*60);i++)p.present({...pose,...changes});}};
}
it('does not emit dormant or setup-frame audio and starts only one station bed on the real host tick',()=>{
 const f=fixture();f.tick(5,{visible:false});expect(f.sounds).toEqual([]);
 f.p.present({...f.pose,deltaSeconds:0});expect(f.sounds).toEqual([]);
 f.tick(1);expect(f.sounds.filter(s=>s.cueId==='nw:station-hum'&&s.action==='play')).toHaveLength(1);
 f.p.dispose();expect(f.p.read().humActive).toBe(false);
});
it('plays actual contract actions once, uses their clock for contact cues and clears them for autonomous playback',()=>{
 const f=fixture();f.tick(5.1);expect(f.p.read()).toMatchObject({clip:'panel_check',finished:true,panelPresses:1});
 expect(f.visual.playClip.mock.calls.filter(c=>c[0]==='panel_check')).toHaveLength(1);
 f.tick(6.1,{action:'inspect-records'});expect(f.p.read()).toMatchObject({clip:'records_read',paperTurns:1});
 f.tick(.1,{action:null,checkingPanel:false});expect(f.visual.clip).toBeNull();expect(f.p.read().clip).toBeNull();
 f.p.dispose();
});
it('never plays a contact clip or reset sound from an obstructed work stance',()=>{
 const f=fixture();f.tick(5,{contactReady:false});expect(f.p.read().clip).toBe('idle');
 expect(f.p.read().panelPresses).toBe(0);expect(f.visual.playClip.mock.calls.some(c=>c[0]==='panel_check')).toBe(false);f.p.dispose();
});
it('retains a documented fallback when an optional clip is missing instead of faking contact or completion',()=>{
 const f=fixture(false);f.tick(1);expect(f.p.read()).toMatchObject({available:false,panelPresses:0});
 expect(f.visual.forceState).toHaveBeenCalledWith('observe');f.p.dispose();
});
it('cancels every owned cue/loop on capture, plays capture once, and releases authored state on disposal',()=>{
 const f=fixture();f.tick(1);f.p.cancel();expect(f.p.read().clip).toBeNull();
 f.tick(2,{action:'capture',checkingPanel:false});
 expect(f.sounds.filter(s=>s.cueId==='nw:capture'&&s.action==='play')).toHaveLength(1);
 expect(f.p.read()).toMatchObject({clip:'capture',humActive:false,finished:true});
 const n=f.sounds.length;f.p.dispose();f.p.dispose();f.tick(1);expect(f.sounds.length).toBeGreaterThan(n);
 expect(f.visual.clip).toBeNull();
});
