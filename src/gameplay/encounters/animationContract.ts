import type {VisualState} from '../../horror/entities/animator';
/** Producer-supplied metadata. Categories are semantic requests, never assumed clip names. */
export type NurseAnimationCategory='idle'|'walk'|'turn'|'check-panel'|'inspect-records'|'listen'|'investigate'|'capture';
export interface NurseAnimationBinding {
  readonly category:NurseAnimationCategory;
  readonly clipName:string;
  readonly durationSeconds:number;
  readonly loop:boolean;
  readonly entryPose:string;
  readonly exitPose:string;
  readonly rootMotion:'in-place';
  readonly targetBinding:string|null;
  readonly fallback:VisualState;
}
/** Optional assets fail safely to existing visual states. No asset paths/names are fabricated. */
export function resolveNurseAnimations(rows:readonly NurseAnimationBinding[],clips:ReadonlyMap<string,{duration:number}>,hasBinding:(id:string)=>boolean) {
  const accepted=new Map<NurseAnimationCategory,NurseAnimationBinding>(),rejected:string[]=[];
  for(const row of rows){
    const clip=clips.get(row.clipName);
    if(!row.clipName.trim()||!clip||!Number.isFinite(row.durationSeconds)||row.durationSeconds<=0||Math.abs(clip.duration-row.durationSeconds)>.05||
      !row.entryPose.trim()||!row.exitPose.trim()||row.rootMotion!=='in-place'||(row.targetBinding!==null&&!hasBinding(row.targetBinding))||accepted.has(row.category)){
      rejected.push(row.category);continue;
    }
    accepted.set(row.category,{...row});
  }
  return {accepted,rejected};
}
