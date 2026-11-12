import type {GameEvents, LightingEvent, SoundEvent, EnvironmentalAnomalyEvent} from '../../contracts';
/** Authored, deterministic presentation requests; none grant AI knowledge or commit story state. */
export type AuthoredCue = {kind:'sound';value:SoundEvent}|{kind:'light';value:LightingEvent}|{kind:'environment';value:EnvironmentalAnomalyEvent};
export function emitAuthoredCue(events:GameEvents,cue:AuthoredCue):void {
  if(cue.kind==='sound')events.emit('atmosphere:sound',cue.value);
  else if(cue.kind==='light')events.emit('atmosphere:lighting',cue.value);
  else events.emit('horror:anomaly',cue.value);
}
