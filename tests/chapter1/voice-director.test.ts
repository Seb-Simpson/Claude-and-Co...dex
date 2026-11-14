import { describe, expect, it } from 'vitest';
import { createVoiceDirector, directionWord, type VoiceLineDef } from '../../src/audio/voiceDirector';
import type { DialogueCue } from '../../src/gameplay/chapter/dialogue';

const cue = (id: string, text: string, seconds = 2, status: DialogueCue['recordingStatus'] = 'not-recorded'): DialogueCue => ({
  id, speaker: 'Sister Shaw', text, durationSeconds: seconds, bus: 'voice', recordingStatus: status,
  ...(status === 'not-recorded' ? {} : { assetUrl: `/voice-temp/${id}.wav` }),
  segments: [{ startSeconds: 0, endSeconds: seconds, text }],
});
const LINES: VoiceLineDef[] = [
  { id: 'react', priority: 5, interrupts: false, once: true, presentation: 'intercom', variants: [
    { stages: ['composure'], cue: cue('react.calm', 'Into bed now, please.') },
    { stages: ['desperation'], cue: cue('react.plead', 'Please, love. Come back.') },
  ] },
  { id: 'bark', priority: 1, interrupts: false, once: false, presentation: 'positional', variants: [{ cue: cue('bark', 'Hello?', 1) }] },
  { id: 'stop', priority: 9, interrupts: true, once: false, presentation: 'positional', variants: [{ stages: ['aggression'], cue: cue('stop', 'STOP!', 1) }] },
];

function director(alreadyPlayed: string[] = []) {
  const subtitles: ({ speaker: string; text: string } | null)[] = [];
  const once: string[] = [];
  let caption = false;
  const d = createVoiceDirector({
    lines: LINES, mode: 'preview', subtitle: (s) => subtitles.push(s), alreadyPlayed,
    onOnceLinePlayed: (id) => once.push(id), directionalCaptions: () => caption,
  });
  const listener = { position: { x: 0, y: 1.6, z: 0 }, forward: { x: 0, z: -1 } };
  return { d, subtitles, once, listener, captions(v: boolean) { caption = v; } };
}

describe('voice director', () => {
  it('selects the variant for Shaw’s stage and labels subtitle-only/temporary lines', () => {
    const t = director();
    expect(t.d.request({ lineId: 'react', stage: 'desperation' })).toBe('played');
    t.d.update(0.1, t.listener);
    expect(t.subtitles.at(-1)).toEqual({ speaker: 'Sister Shaw (subtitle only)', text: '[intercom] Please, love. Come back.' });
    const u = director();
    expect(u.d.request({ lineId: 'react', stage: 'fear' })).toBe('no-variant');
  });

  it('one-time lines play once, even across a restore; duplicate event keys are ignored', async () => {
    const t = director();
    expect(t.d.request({ lineId: 'react', stage: 'composure', key: 'padlock-1' })).toBe('played');
    expect(t.d.request({ lineId: 'react', stage: 'composure', key: 'padlock-1' })).toBe('duplicate');
    expect(t.d.request({ lineId: 'react', stage: 'composure' })).toBe('duplicate'); // already playing
    t.d.update(3);
    await Promise.resolve(); await Promise.resolve();
    expect(t.d.activeLineId).toBeNull();
    expect(t.d.request({ lineId: 'react', stage: 'composure' })).toBe('already-played');
    expect(t.once).toEqual(['react']);
    const restored = director(['react']);
    expect(restored.d.request({ lineId: 'react', stage: 'composure' })).toBe('already-played');
    expect(t.d.request({ lineId: 'bark', stage: 'composure', key: 'n1' })).toBe('played');
    t.d.update(2); await Promise.resolve(); await Promise.resolve();
    expect(t.d.request({ lineId: 'bark', stage: 'composure', key: 'n1' })).toBe('duplicate');
    expect(t.d.request({ lineId: 'bark', stage: 'composure', key: 'n2' })).toBe('played');
  });

  it('interrupts by priority, queues one deep, drops lower-priority overflow', async () => {
    const t = director();
    expect(t.d.request({ lineId: 'bark', stage: 'aggression' })).toBe('played');
    expect(t.d.request({ lineId: 'stop', stage: 'aggression' })).toBe('played');
    expect(t.d.activeLineId).toBe('stop');
    expect(t.d.request({ lineId: 'bark', stage: 'aggression' })).toBe('queued');
    expect(t.d.request({ lineId: 'react', stage: 'composure' })).toBe('queued'); // higher priority replaces the queued bark
    expect(t.d.queuedLineId).toBe('react');
    t.d.update(1.2); await Promise.resolve(); await Promise.resolve();
    expect(t.d.activeLineId).toBe('react');
  });

  it('direction captions are optional and relative to the listener', () => {
    const l = { position: { x: 0, y: 0, z: 0 }, forward: { x: 0, z: -1 } };
    expect(directionWord(l, { x: 0, z: -5 })).toBe('ahead');
    expect(directionWord(l, { x: 0, z: 5 })).toBe('behind');
    expect(directionWord(l, { x: 5, z: 0 })).toBe('right');
    expect(directionWord(l, { x: -5, z: 0 })).toBe('left');
    const t = director();
    t.captions(true);
    t.d.update(0, { position: { x: 0, y: 1.6, z: 0 }, forward: { x: 0, z: -1 } });
    t.d.request({ lineId: 'bark', stage: 'composure', position: { x: 0, y: 1.6, z: 6 } });
    expect(t.subtitles.at(-1)?.text).toBe('[behind] Hello?');
  });

  it('production mode refuses temporary recordings (they can never pass as final)', () => {
    const d = createVoiceDirector({ lines: [{ id: 't', priority: 1, interrupts: false, once: false, presentation: 'direct', variants: [{ cue: cue('t', 'Temp.', 1, 'temporary') }] }], mode: 'production', subtitle: () => undefined });
    expect(d.request({ lineId: 't', stage: 'composure' })).toBe('refused');
    expect(d.activeLineId).toBeNull();
  });
});
