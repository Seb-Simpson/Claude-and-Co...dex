import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Bone, type SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NURSE_CLIPS } from '../nurseClips';
import { createEntityVisual } from '../visual';
import { MODEL_MANIFESTS, MODEL_URLS } from './assets';
import { type LoadedModel, loadModelLibrary } from './library';
import { CLIP_FOR_STATE, createModelVisual } from './modelVisual';

/** NW-007B: Nurse Shaw's clip contract against the shipped GLB and the runtime playClip hook. */
(globalThis as { self?: unknown }).self = globalThis;
vi.spyOn(console, 'warn').mockImplementation(() => undefined);
let model: LoadedModel;
beforeAll(async () => {
  const buf = readFileSync(fileURLToPath(MODEL_URLS.nurse));
  const library = await loadModelLibrary({
    urls: { nurse: MODEL_URLS.nurse }, manifests: { nurse: MODEL_MANIFESTS.nurse },
    load: async () => new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), ''),
  });
  model = library.get('nurse')!;
}, 60000);

const idle = { behaviour: 'idle' as const, speed: 0 };

describe('Nurse Shaw clip contract (nurse.glb)', () => {
  it('ships every contract clip with its documented duration and loop flag', () => {
    const manifest = MODEL_MANIFESTS.nurse.clips;
    for (const spec of NURSE_CLIPS) {
      const m = manifest.find((c) => c.name === spec.name);
      expect(m, spec.name).toBeDefined();
      expect(m!.loop, spec.name).toBe(spec.loop);
      expect(m!.duration, spec.name).toBeCloseTo(spec.duration, 3);
      expect(model.clips.get(spec.name), spec.name).toBeDefined();
      if (spec.gait) {
        expect(m!.speed, spec.name).toBeCloseTo(spec.gait.speed, 3);
        expect(m!.steps.length, `${spec.name} footsteps`).toBe(spec.gait.cycles * 2);
      }
    }
    // Kept for older callers.
    for (const name of ['listen', 'alert', 'run', 'search']) expect(model.clips.get(name), name).toBeDefined();
  });

  it('keeps every clip in place: the hips never travel more than a few centimetres', () => {
    for (const spec of NURSE_CLIPS) {
      const clip = model.clips.get(spec.name)!;
      const hips = clip.tracks.find((t) => t.name.endsWith('hips.position'));
      if (!hips) continue;
      const v = hips.values;
      let max = 0;
      for (let i = 3; i < v.length; i += 3) max = Math.max(max, Math.hypot(v[i]! - v[0]!, v[i + 2]! - v[2]!));
      expect(max, spec.name).toBeLessThan(0.08);
    }
  });

  it('plays an authored clip, reports its progress and finishes a one-shot, then hands back to state-driven playback', () => {
    const visual = createModelVisual('nurse', model, { seed: 1 });
    try {
      visual.update(0.016, idle);
      expect(visual.playClip!('panel_check')).toBe(true);
      expect(visual.clip?.name).toBe('panel_check');
      for (let t = 0; t < 2; t += 0.05) visual.update(0.05, idle);
      expect(visual.clip!.finished).toBe(false);
      for (let t = 0; t < 4; t += 0.05) visual.update(0.05, idle);
      expect(visual.clip!.finished).toBe(true);
      // Behaviour input does not override an authored clip.
      visual.update(0.05, { behaviour: 'patrol', speed: 0.8 });
      expect(visual.clip!.name).toBe('panel_check');
      expect(visual.playClip!(null)).toBe(true);
      expect(visual.clip).toBeNull();
      visual.update(0.05, { behaviour: 'patrol', speed: 0.8 });
      expect(visual.visualState).toBe('walk');
      // Unknown clips are refused without disturbing playback.
      expect(visual.playClip!('juggle')).toBe(false);
      expect(visual.clip).toBeNull();
    } finally { visual.dispose(); }
  });

  it('moves the reaching hand forward during the panel check (the clip is not a still pose)', () => {
    const visual = createModelVisual('nurse', model, { seed: 1 });
    try {
      visual.update(0.016, idle);
      const at = (name: string, seconds: number): Vector3 => {
        visual.playClip!(name, { restart: true, fade: 0 });
        for (let t = 0; t < seconds; t += 0.05) visual.update(0.05, idle);
        visual.object.updateMatrixWorld(true);
        return visual.bonePosition('handR');
      };
      const rest = at('panel_check', 0.1);
      const press = at('panel_check', 3.5);
      // Facing -Z: from clasped at the apron, the hand travels forward (more negative z) and down to
      // the console on the desk.
      expect(rest.distanceTo(press)).toBeGreaterThan(0.12);
      expect(rest.z - press.z).toBeGreaterThan(0.06);
    } finally { visual.dispose(); }
  });

  it('presents searching as the new investigate clip', () => {
    expect(CLIP_FOR_STATE.nurse.search).toBe('investigate');
    expect(CLIP_FOR_STATE.nurse.lost).toBe('investigate');
  });

  it('falls back to the documented state on the procedural body', () => {
    const visual = createEntityVisual('nurse', { seed: 2 });
    try {
      expect(visual.playClip!('panel_check')).toBe(false);
      visual.update(0.05, idle);
      expect(visual.visualState).toBe('observe');
      visual.playClip!(null);
      visual.update(0.05, idle);
      expect(visual.visualState).not.toBe('observe');
    } finally { visual.dispose(); }
  });

  it('creates and disposes repeatedly without leaking bone textures or actors', () => {
    let skeletons = 0;
    for (let i = 0; i < 5; i++) {
      const visual = createModelVisual('nurse', model, { seed: i });
      visual.update(0.016, idle);
      visual.playClip!('records_read');
      visual.update(0.2, idle);
      visual.object.traverse((o) => { if ((o as SkinnedMesh).isSkinnedMesh) skeletons++; });
      const bones: Bone[] = [];
      visual.object.traverse((o) => { if ((o as Bone).isBone) bones.push(o as Bone); });
      expect(bones.length).toBe(19);
      visual.dispose();
      expect(visual.object.parent).toBeNull();
      expect(visual.playClip!('idle')).toBe(false);
    }
    expect(skeletons).toBe(5);
  });
});
