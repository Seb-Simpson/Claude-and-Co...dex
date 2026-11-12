import type {StationCheckpoint} from '../encounters/checkpoint';
export const NARRATIVE_BEATS = ['awake','left-room','station-found','record-read','shaw-introduced','concealment-offered','escaped'] as const;
export type NarrativeBeat = typeof NARRATIVE_BEATS[number];
export type OpeningSceneId = 'awakening'|'empty-corridor'|'station-discovery'|'shaw-introduction'|'first-hiding'|'autonomous-stealth'|'complete';
export interface NarrativeCheckpoint {readonly version:1; readonly step:number}
export interface NarrativeDirector {
  readonly scene: OpeningSceneId;
  readonly nurseEligible:boolean;
  commit(beat:NarrativeBeat):boolean;
  has(beat:NarrativeBeat):boolean;
  checkpoint():NarrativeCheckpoint;
}
export function validateNarrativeCheckpoint(raw:unknown):NarrativeCheckpoint|null {
  if (!raw || typeof raw!=='object' || Array.isArray(raw)) return null;
  const proto=Object.getPrototypeOf(raw);if(proto!==Object.prototype&&proto!==null)return null;
  const keys=Reflect.ownKeys(raw);
  if(keys.length!==2||keys.some(k=>k!=='version'&&k!=='step')||keys.some(k=>!('value' in Object.getOwnPropertyDescriptor(raw,k)!)))return null;
  const r=raw as Record<string,unknown>;
  return r.version===1&&Number.isInteger(r.step)&&(r.step as number)>=0&&(r.step as number)<=NARRATIVE_BEATS.length ? {version:1,step:r.step as number}:null;
}
/** Old milestones migrate once; transient perception, input locks and leases never enter saves. */
export function migrateNarrative(awakened:boolean,exited:boolean,station?:StationCheckpoint,found=false):NarrativeCheckpoint {
  const step=station?({introduction:4,tension:5,stealth:6,complete:7} as const)[station.phase]:found?3:exited?2:awakened?1:0;
  return {version:1,step};
}
export function createNarrativeDirector(saved:NarrativeCheckpoint={version:1,step:0},changed?:()=>void):NarrativeDirector {
  const valid=validateNarrativeCheckpoint(saved);if(!valid)throw Error('Invalid narrative checkpoint');
  let step=valid.step;
  const scenes:OpeningSceneId[]=['awakening','awakening','empty-corridor','station-discovery','shaw-introduction','first-hiding','autonomous-stealth','complete'];
  return {
    get scene(){return scenes[step]!}, get nurseEligible(){return step>=4},
    has:beat=>NARRATIVE_BEATS.indexOf(beat)>=0&&NARRATIVE_BEATS.indexOf(beat)<step,
    commit(beat){if(NARRATIVE_BEATS[step]!==beat)return false;step++;changed?.();return true},
    checkpoint:()=>({version:1,step}),
  };
}
