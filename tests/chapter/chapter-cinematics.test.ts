import { PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CHAPTER_SCENES } from '../../src/gameplay/chapter/model';
import { CHAPTER_CINEMATIC_CUES, CHAPTER_CINEMATIC_DURATIONS, createChapterCinematicDefinition } from '../../src/gameplay/chapter/chapterCinematics';
import { createCinematicPlayer, validateCinematicDefinition } from '../../src/gameplay/chapter/cinematics';
import type { CinematicKeyframe, CinematicPose } from '../../src/gameplay/chapter/cinematics';
import { CHAPTER_DIALOGUE, createDialoguePlayer } from '../../src/gameplay/chapter/dialogue';

const start: CinematicPose = { position: { x: 0, y: 1.6, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, fov: 75 };
function path(duration: number): CinematicKeyframe[] {
  return [{ atSeconds: 0, pose: start }, { atSeconds: duration, pose: { ...start, position: { x: 2, y: 1.6, z: 0 } } }];
}
function playerFixture(mode: 'preview' | 'production' = 'preview') {
  const camera = new PerspectiveCamera(75); camera.position.y = 1.6;
  const release = vi.fn(); const handoff = vi.fn(() => true); const cues = vi.fn();
  const dialogue = createDialoguePlayer({ mode, subtitle() {} });
  const player = createCinematicPlayer({ camera, acquireControl: () => ({ handoff, release }), validateHandoff: () => true, dialogue,
    cue(cue) { cues(cue); return { stop() {} }; } });
  return { camera, player, release, handoff, cues };
}

describe('Chapter One cinematic templates', () => {
  it.each(CHAPTER_SCENES)('%s validates and reaches its normal handoff in an isolated preview', async (id) => {
    const definition = createChapterCinematicDefinition(id, path(CHAPTER_CINEMATIC_DURATIONS[id]));
    expect(() => validateCinematicDefinition(definition)).not.toThrow();
    for (const cue of definition.cues) if (cue.kind !== 'dialogue') expect(CHAPTER_CINEMATIC_CUES).toContain(cue.id);
    const f = playerFixture();
    const run = f.player.play(definition);
    f.player.update(definition.durationSeconds);
    expect(await run.finished).toEqual({ id, outcome: 'completed' });
    expect(f.handoff).toHaveBeenCalledTimes(1);
    expect(f.release).toHaveBeenCalledTimes(1);
  });

  it.each(CHAPTER_SCENES)('%s supports early/mid/late skips without dispatching future presentation cues', async (id) => {
    for (const fraction of [0, 0.5, 0.95]) {
      const f = playerFixture();
      const duration = CHAPTER_CINEMATIC_DURATIONS[id];
      const run = f.player.play(createChapterCinematicDefinition(id, path(duration)));
      f.player.update(duration * fraction);
      const played = f.cues.mock.calls.length;
      run.skip();
      f.player.update(0.25);
      expect(await run.finished).toEqual({ id, outcome: 'skipped' });
      expect(f.cues).toHaveBeenCalledTimes(played);
      expect(f.camera.position.x).toBe(2);
      expect(f.release).toHaveBeenCalledTimes(1);
    }
  });

  it('preserves the opening exact three-line subtitle segmentation', () => {
    const definition = createChapterCinematicDefinition('c1.cine.awakening', path(55));
    const speech = definition.cues.find((cue) => cue.kind === 'dialogue');
    expect(speech?.kind).toBe('dialogue');
    if (speech?.kind !== 'dialogue') throw new Error('Missing opening line');
    expect(speech.atSeconds).toBe(35);
    expect(speech.dialogue.segments.map((s) => s.text)).toEqual([
      'West Ward, night shift.', 'Please remain in your rooms.', 'The nurse will be with you shortly.',
    ]);
    expect(speech.dialogue.recordingStatus).toBe('not-recorded');
  });

  it.each(CHAPTER_SCENES)('%s cannot silently pass production with subtitle-only placeholder voices', async (id) => {
    const f = playerFixture('production');
    const run = f.player.play(createChapterCinematicDefinition(id, path(CHAPTER_CINEMATIC_DURATIONS[id])));
    f.player.update(CHAPTER_CINEMATIC_DURATIONS[id]);
    expect(await run.finished).toMatchObject({ id, outcome: 'interrupted', reason: expect.stringMatching(/approved recording/) });
    expect(f.handoff).not.toHaveBeenCalled();
    expect(f.release).toHaveBeenCalledTimes(1);
  });

  it('rejects missing/incorrect paths and retiming that overlaps dialogue or loses a scene boundary', () => {
    expect(() => createChapterCinematicDefinition('c1.cine.record', [])).toThrow(/camera path/);
    expect(() => createChapterCinematicDefinition('c1.cine.record', path(30))).toThrow(/complete cinematic/);
    expect(() => createChapterCinematicDefinition('c1.cine.record', path(42), { cueTimes: { 'c1.voice.archive.withdrawal': 12 } })).toThrow(/overlap/);
    expect(() => createChapterCinematicDefinition('c1.cine.record', path(42), { cueTimes: { 'c1.presentation.nurse-approaches': 10 } })).toThrow(/does not belong/);
  });

  it('allows approved recording substitutions and editorial retiming without changing exact dialogue text', () => {
    const original = CHAPTER_DIALOGUE['c1.voice.intercom.awakening'];
    const approved = { ...original, recordingStatus: 'approved' as const, assetUrl: '/approved/opening.ogg' };
    const scene = createChapterCinematicDefinition('c1.cine.awakening', path(56), { durationSeconds: 56,
      cueTimes: { 'c1.voice.intercom.awakening': 36 }, dialogue: { 'c1.voice.intercom.awakening': approved } });
    expect(scene.cues.find((c) => c.kind === 'dialogue')).toMatchObject({ atSeconds: 36, dialogue: { recordingStatus: 'approved' } });
    expect(() => createChapterCinematicDefinition('c1.cine.awakening', path(55), { dialogue: {
      'c1.voice.intercom.awakening': { ...approved, text: 'Different story' },
    } })).toThrow(/does not match/);
  });
});
