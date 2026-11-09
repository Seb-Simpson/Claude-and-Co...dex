import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The 13 Chapter 1 voice cues have clearly labelled TEMPORARY placeholder audio and subtitles. */
const DIR = join(__dirname, '../../../src/assets/nw-004a/temp-vo');
const CUES = [
  'c1.voice.intercom.awakening', 'c1.voice.protagonist.appointment', 'c1.voice.protagonist.call', 'c1.voice.intercom.review',
  'c1.voice.protagonist.ledger', 'c1.voice.protagonist.signature', 'c1.voice.archive.slate', 'c1.voice.archive.withdrawal',
  'c1.voice.archive.refusal', 'c1.voice.protagonist.memory', 'c1.voice.intercom.armed', 'c1.voice.intercom.release', 'c1.voice.intercom.recognition',
];
describe('temporary dialogue', () => {
  it('covers every Codex voice cue, every file is marked TEMP, every subtitle is labelled', () => {
    const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8')) as { status: string; cues: { cueId: string; file: string; temporary: boolean; durationSeconds: number; subtitles: { text: string; start: number; end: number }[] }[] };
    expect(manifest.status).toMatch(/TEMPORARY/);
    expect(manifest.cues.map((c) => c.cueId).sort()).toEqual([...CUES].sort());
    for (const c of manifest.cues) {
      expect(c.temporary).toBe(true);
      expect(c.file.startsWith('TEMP-')).toBe(true);
      expect(existsSync(join(DIR, c.file))).toBe(true);
      expect(c.durationSeconds).toBeGreaterThan(0.5);
      for (const s of c.subtitles) { expect(s.text.startsWith('[TEMP] ')).toBe(true); expect(s.end).toBeGreaterThan(s.start); expect(s.end).toBeLessThanOrEqual(c.durationSeconds + 0.05); }
    }
  });
});
