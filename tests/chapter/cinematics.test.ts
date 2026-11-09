import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { captureCinematicPose, createCinematicPlayer } from '../../src/gameplay/chapter/cinematics';
import type { CinematicDefinition, CinematicPose } from '../../src/gameplay/chapter/cinematics';
import { createBufferedDialogueVoiceAdapter, createDialoguePlayer } from '../../src/gameplay/chapter/dialogue';
import type { DialogueCue } from '../../src/gameplay/chapter/dialogue';

function pose(x: number, yaw = 0, fov = 75): CinematicPose {
  const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
  return { position: { x, y: 1.6, z: 0 }, rotation: { x: q.x, y: q.y, z: q.z, w: q.w }, fov };
}
function definition(): CinematicDefinition {
  return { id: 'test.cinematic', durationSeconds: 4,
    camera: [{ atSeconds: 0, pose: pose(0) }, { atSeconds: 2, pose: pose(2, Math.PI / 2, 65) }, { atSeconds: 4, pose: pose(4, Math.PI, 75) }],
    cues: [{ kind: 'sound', id: 'heels', atSeconds: 0.5 }, { kind: 'animation', id: 'look', atSeconds: 1.5 }, { kind: 'environment', id: 'ink', atSeconds: 2.5 }],
  };
}
function fixture() {
  const camera = new PerspectiveCamera(75);
  camera.position.set(0, 1.6, 0);
  const lease = { handoff: vi.fn(() => true), release: vi.fn() };
  const acquire = vi.fn(() => lease);
  const resources = new Map<string, { pause: ReturnType<typeof vi.fn>; resume: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }>();
  const cue = vi.fn((value: { id: string }) => {
    const resource = { pause: vi.fn(), resume: vi.fn(), stop: vi.fn() };
    resources.set(value.id, resource);
    return resource;
  });
  const settled = vi.fn();
  const player = createCinematicPlayer({ camera, acquireControl: acquire, validateHandoff: () => true, cue, settled });
  return { player, camera, lease, acquire, resources, cue, settled };
}

describe('reusable chapter cinematics', () => {
  it('uses the injected camera and host clock for path/fov/quaternion interpolation and ordered cues', async () => {
    const f = fixture();
    const run = f.player.play(definition());
    expect(f.acquire).toHaveBeenCalledTimes(1);
    f.player.update(1);
    expect(f.camera.position.x).toBeCloseTo(1);
    expect(f.camera.fov).toBeCloseTo(70);
    expect(f.camera.quaternion.angleTo(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 4))).toBeCloseTo(0);
    expect(f.cue.mock.calls.map(([c]) => c.id)).toEqual(['heels']);
    f.player.update(3);
    expect(await run.finished).toEqual({ id: 'test.cinematic', outcome: 'completed' });
    expect(f.cue.mock.calls.map(([c]) => c.id)).toEqual(['heels', 'look', 'ink']);
    expect(f.camera.position.x).toBe(4);
    expect(f.lease.handoff).toHaveBeenCalledTimes(1);
    expect(f.lease.release).toHaveBeenCalledTimes(1);
    for (const resource of f.resources.values()) expect(resource.stop).toHaveBeenCalledTimes(1);
    expect(f.settled).toHaveBeenCalledTimes(1);
  });

  it('skip cancels owned effects, omits future cues and blends into the same handoff without snapping', async () => {
    const f = fixture();
    const run = f.player.play(definition());
    f.player.update(1);
    run.skip(); run.skip();
    expect(run.state).toBe('skipping');
    expect(f.camera.position.x).toBeCloseTo(1);
    expect(f.resources.get('heels')!.stop).toHaveBeenCalledTimes(1);
    expect(f.lease.release).not.toHaveBeenCalled();
    f.player.update(0.125);
    expect(f.camera.position.x).toBeCloseTo(2.5);
    expect(f.lease.release).not.toHaveBeenCalled();
    f.player.update(0.125);
    expect(await run.finished).toEqual({ id: 'test.cinematic', outcome: 'skipped' });
    expect(f.camera.position.x).toBe(4);
    expect(f.cue).toHaveBeenCalledTimes(1);
    expect(f.lease.handoff).toHaveBeenCalledTimes(1);
    expect(f.lease.release).toHaveBeenCalledTimes(1);
  });

  it('pause freezes path, cue dispatch and skip blending while pausing each owned effect', () => {
    const f = fixture();
    const run = f.player.play(definition());
    f.player.update(1);
    run.pause(); run.pause(); f.player.update(100);
    expect(run.state).toBe('paused');
    expect(run.elapsedSeconds).toBe(1);
    expect(f.camera.position.x).toBe(1);
    expect(f.resources.get('heels')!.pause).toHaveBeenCalledTimes(1);
    run.resume(); run.resume();
    expect(f.resources.get('heels')!.resume).toHaveBeenCalledTimes(1);
    run.skip(); run.pause(); f.player.update(1);
    expect(f.camera.position.x).toBe(1);
    run.resume(); f.player.update(0.25);
    expect(run.state).toBe('skipped');
  });

  it('cancel and AbortSignal stop resources/release once and do not commit a handoff', async () => {
    const f = fixture();
    const signal = new AbortController();
    const run = f.player.play(definition(), { signal: signal.signal });
    f.player.update(2);
    signal.abort(); run.cancel(); f.player.dispose();
    expect(await run.finished).toMatchObject({ outcome: 'interrupted', reason: 'Cinematic aborted' });
    expect(f.lease.handoff).not.toHaveBeenCalled();
    expect(f.lease.release).toHaveBeenCalledTimes(1);
    for (const resource of f.resources.values()) expect(resource.stop).toHaveBeenCalledTimes(1);
  });

  it('capture or player disposal aborts the real control lease and detaches both abort listeners', async () => {
    for (const reason of ['capture', 'player-dispose']) {
      const camera = new PerspectiveCamera(75); camera.position.y = 1.6;
      const control = new AbortController();
      const external = new AbortController();
      const release = vi.fn(); const handoff = vi.fn(() => true); const stop = vi.fn();
      const removeControl = vi.spyOn(control.signal, 'removeEventListener');
      const removeExternal = vi.spyOn(external.signal, 'removeEventListener');
      const player = createCinematicPlayer({ camera,
        acquireControl: () => ({ signal: control.signal, handoff, release }), validateHandoff: () => true, cue: () => ({ stop }) });
      const run = player.play(definition(), { signal: external.signal });
      player.update(1);
      control.abort(reason); external.abort(); run.cancel(); player.dispose();
      expect((await run.finished).outcome).toBe('interrupted');
      expect(stop).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledTimes(1);
      expect(handoff).not.toHaveBeenCalled();
      expect(removeControl).toHaveBeenCalledTimes(1);
      expect(removeExternal).toHaveBeenCalledTimes(1);
    }
  });

  it('releases a lease invalidated during acquisition and permits a fresh independent attempt', () => {
    const camera = new PerspectiveCamera(75); camera.position.y = 1.6;
    const dead = new AbortController(); dead.abort();
    const release = vi.fn(); let attempts = 0;
    const player = createCinematicPlayer({ camera, validateHandoff: () => true,
      acquireControl: () => { attempts++; return { signal: attempts === 1 ? dead.signal : new AbortController().signal, handoff: () => true, release }; } });
    expect(() => player.play(definition())).toThrow(/invalidated/);
    expect(release).toHaveBeenCalledTimes(1);
    const next = player.play(definition());
    expect(next.state).toBe('playing');
    next.cancel();
    expect(release).toHaveBeenCalledTimes(2);
  });

  it('prevents reentrant camera ownership while acquiring a lease', () => {
    const camera = new PerspectiveCamera(75); camera.position.y = 1.6;
    const release = vi.fn();
    const player = createCinematicPlayer({ camera, validateHandoff: () => true,
      acquireControl() {
        expect(() => player.play(definition())).toThrow(/owns/);
        return { handoff: () => true, release };
      } });
    player.play(definition()).cancel();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('stops a newly returned effect if its callback cancelled the scene during allocation', async () => {
    const camera = new PerspectiveCamera(75); camera.position.y = 1.6;
    const release = vi.fn(); const stop = vi.fn();
    const player = createCinematicPlayer({ camera, validateHandoff: () => true,
      acquireControl: () => ({ handoff: () => true, release }),
      cue() { player.dispose(); return { stop }; } });
    const run = player.play({ ...definition(), cues: [{ kind: 'sound', id: 'opening', atSeconds: 0 }] });
    expect((await run.finished).outcome).toBe('interrupted');
    expect(release).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('rejects overlapping ownership and mismatched start/handoff paths before acquiring a lease', () => {
    const f = fixture();
    expect(() => f.player.play({ ...definition(), camera: [{ atSeconds: 0, pose: pose(10) }, { atSeconds: 4, pose: pose(11) }] })).toThrow(/start/);
    expect(f.acquire).not.toHaveBeenCalled();
    const invalid = createCinematicPlayer({ camera: f.camera, acquireControl: f.acquire, validateHandoff: () => false });
    expect(() => invalid.play(definition())).toThrow(/handoff/);
    expect(f.acquire).not.toHaveBeenCalled();
    f.player.play(definition());
    expect(() => f.player.play(definition())).toThrow(/owns/);
    expect(f.acquire).toHaveBeenCalledTimes(1);
  });

  it('validates finite poses, normalized quaternions, frame/cue order and bounded blend timing', () => {
    const f = fixture();
    expect(() => f.player.play({ ...definition(), durationSeconds: Infinity })).toThrow(/duration/);
    expect(() => f.player.play({ ...definition(), skipBlendSeconds: 0 })).toThrow(/blend/);
    expect(() => f.player.play({ ...definition(), camera: [{ atSeconds: 0, pose: pose(0) }, { atSeconds: 0, pose: pose(1) }] })).toThrow(/ordered/);
    expect(() => f.player.play({ ...definition(), camera: [{ atSeconds: 0, pose: { ...pose(0), rotation: { x: 0, y: 0, z: 0, w: 2 } } }, { atSeconds: 4, pose: pose(4) }] })).toThrow(/normalized/);
    expect(() => f.player.play({ ...definition(), cues: [{ kind: 'sound', id: 'late', atSeconds: 3 }, { kind: 'sound', id: 'early', atSeconds: 1 }] })).toThrow(/ordered/);
    expect(f.acquire).not.toHaveBeenCalled();
    for (const invalid of [-1, NaN, Infinity]) expect(() => f.player.update(invalid)).toThrow(/delta/);
  });

  it('resolves failed presentation as interruption without leaking a lease or prior resources', async () => {
    const camera = new PerspectiveCamera(75); camera.position.y = 1.6;
    const stop = vi.fn(); const release = vi.fn();
    const player = createCinematicPlayer({ camera, acquireControl: () => ({ handoff: () => true, release }), validateHandoff: () => true,
      cue(c) { if (c.id === 'look') throw new Error('Animation unavailable'); return { stop }; } });
    const run = player.play(definition());
    player.update(3);
    expect(await run.finished).toMatchObject({ outcome: 'interrupted', reason: 'Animation unavailable' });
    expect(stop).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('reports rejected handoff and cleanup failures as interrupted rather than committing story completion', async () => {
    const f = fixture();
    f.lease.handoff.mockReturnValue(false);
    const run = f.player.play(definition());
    f.player.update(4);
    expect((await run.finished).outcome).toBe('interrupted');
    expect(f.lease.release).toHaveBeenCalledTimes(1);
    const broken = fixture();
    const failed = broken.player.play(definition());
    broken.player.update(1);
    broken.resources.get('heels')!.stop.mockImplementation(() => { throw new Error('Stop failed'); });
    failed.cancel();
    expect((await failed.finished).outcome).toBe('interrupted');
    expect(broken.lease.release).toHaveBeenCalledTimes(1);
  });

  it('old handles cannot cancel/pause/skip a new scene after checkpoint interruption', async () => {
    const f = fixture();
    const old = f.player.play(definition());
    f.player.update(1); old.cancel('checkpoint');
    const nextDefinition = { ...definition(), camera: [{ atSeconds: 0, pose: captureCinematicPose(f.camera) }, { atSeconds: 4, pose: pose(5) }] };
    const next = f.player.play(nextDefinition);
    old.cancel(); old.pause(); old.skip(); old.resume();
    f.player.update(0.5);
    expect(next.state).toBe('playing');
    expect(next.elapsedSeconds).toBe(0.5);
    expect((await old.finished).outcome).toBe('interrupted');
    expect(f.lease.release).toHaveBeenCalledTimes(1);
    f.player.dispose(); f.player.dispose();
    expect((await next.finished).outcome).toBe('interrupted');
    expect(f.lease.release).toHaveBeenCalledTimes(2);
  });

  it('copies authored paths so later producer mutations cannot alter live choreography', () => {
    const f = fixture();
    const mutable = definition();
    f.player.play(mutable);
    (mutable.camera[1]!.pose.position as { x: number }).x = 99;
    f.player.update(2);
    expect(f.camera.position.x).toBe(2);
  });
});

describe('cinematic dialogue synchronization', () => {
  const spoken: DialogueCue = { id: 'spoken', speaker: 'Intercom', text: 'Stay here.', durationSeconds: 1,
    recordingStatus: 'approved', assetUrl: '/test.ogg', bus: 'sfx', segments: [{ startSeconds: 0, endSeconds: 1, text: 'Stay here.' }] };
  it('starts voices at cue time, respects pause, clears subtitles/ducking on skip, and never plays future voices', async () => {
    const camera = new PerspectiveCamera(75); camera.position.y = 1.6;
    const subtitles = vi.fn(); const stop = vi.fn(); const pause = vi.fn(); const resume = vi.fn(); const unduck = vi.fn();
    const playVoice = vi.fn(() => ({ stop, pause, resume }));
    const dialogue = createDialoguePlayer({ mode: 'production', subtitle: subtitles, playVoice, duck: () => unduck });
    const player = createCinematicPlayer({ camera, acquireControl: () => ({ handoff: () => true, release() {} }), validateHandoff: () => true, dialogue });
    const run = player.play({ ...definition(), cues: [{ kind: 'dialogue', atSeconds: 1, dialogue: spoken }, { kind: 'dialogue', atSeconds: 3, dialogue: spoken }] });
    player.update(1.25);
    expect(playVoice).toHaveBeenCalledTimes(1);
    expect(subtitles).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'Stay here.' }));
    run.pause(); player.update(99); expect(pause).toHaveBeenCalledTimes(1);
    run.resume(); expect(resume).toHaveBeenCalledTimes(1);
    run.skip(); expect(stop).toHaveBeenCalledTimes(1); expect(unduck).toHaveBeenCalledTimes(1);
    expect(subtitles).toHaveBeenLastCalledWith(null);
    player.update(0.25);
    expect((await run.finished).outcome).toBe('skipped');
    expect(playVoice).toHaveBeenCalledTimes(1);
  });

  it('chronologically advances dialogue across a large host delta and releases every voice', async () => {
    const camera = new PerspectiveCamera(75); camera.position.y = 1.6;
    const stop = vi.fn(); const starts: string[] = [];
    const dialogue = createDialoguePlayer({ mode: 'production', subtitle() {}, playVoice(c) { starts.push(c.id); return { stop, pause() {}, resume() {} }; } });
    const player = createCinematicPlayer({ camera, acquireControl: () => ({ handoff: () => true, release() {} }), validateHandoff: () => true, dialogue });
    const run = player.play({ ...definition(), cues: [{ kind: 'dialogue', atSeconds: 0, dialogue: spoken }, { kind: 'dialogue', atSeconds: 2, dialogue: { ...spoken, id: 'second' } }] });
    player.update(4);
    expect((await run.finished).outcome).toBe('completed');
    expect(starts).toEqual(['spoken', 'second']);
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it('does not commit a scene if its required voice fails to start', async () => {
    const camera = new PerspectiveCamera(75); camera.position.y = 1.6;
    const release = vi.fn(); const handoff = vi.fn(() => true);
    const dialogue = createDialoguePlayer({ mode: 'production', subtitle() {}, playVoice() { throw new Error('Audio decode failed'); } });
    const player = createCinematicPlayer({ camera, acquireControl: () => ({ handoff, release }), validateHandoff: () => true, dialogue });
    const run = player.play({ ...definition(), cues: [{ kind: 'dialogue', atSeconds: 0, dialogue: spoken }] });
    expect(await run.finished).toMatchObject({ outcome: 'interrupted', reason: 'Audio decode failed' });
    expect(release).toHaveBeenCalledTimes(1);
    expect(handoff).not.toHaveBeenCalled();
  });

  it('aligns camera/subtitles with real audio after a frame stall without fast-forwarding fresh or subsequent recordings', async () => {
    const sources: { onended: (() => void) | null; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
    const context = Object.assign(new EventTarget(), {
      state: 'running', currentTime: 0, destination: {},
      createGain: () => ({ gain: { value: 1, cancelScheduledValues() {}, setTargetAtTime() {} }, connect() {} }),
      createBufferSource() {
        const source = { buffer: null, onended: null as (() => void) | null, connect() {}, start: vi.fn(), stop: vi.fn(), disconnect: vi.fn() };
        sources.push(source); return source;
      },
    });
    try {
      const camera = new PerspectiveCamera(75); camera.position.y = 1.6;
      const voice = { ...spoken, durationSeconds: 4, segments: [
        { startSeconds: 0, endSeconds: 2, text: 'First half.' },
        { startSeconds: 2, endSeconds: 4, text: 'Second half.' },
      ] };
      const lines = vi.fn(); const cues = vi.fn();
      const dialogue = createDialoguePlayer({ mode: 'production', subtitle: lines,
        playVoice: createBufferedDialogueVoiceAdapter(context as unknown as AudioContext, new Map([['/test.ogg', { duration: 4 } as AudioBuffer]])) });
      const player = createCinematicPlayer({ camera, dialogue, validateHandoff: () => true,
        acquireControl: () => ({ handoff: () => true, release() {} }), cue(c) { cues(c.id); } });
      const run = player.play({ id: 'audio-clock', durationSeconds: 12,
        camera: [{ atSeconds: 0, pose: pose(0) }, { atSeconds: 12, pose: pose(12) }],
        cues: [
          { atSeconds: 1, kind: 'dialogue', dialogue: voice },
          { atSeconds: 2.5, kind: 'environment', id: 'during-first-line' },
          { atSeconds: 6, kind: 'dialogue', dialogue: { ...voice, id: 'second-recording' } },
        ],
      });
      // A large quiet-time delta reaches the first cue, but its fresh native source starts at
      // offset zero now. Its entire line cannot be consumed by leftover simulation catch-up.
      player.update(10);
      expect(run.elapsedSeconds).toBe(1);
      expect(sources).toHaveLength(1);
      expect(sources[0]!.start).toHaveBeenCalledWith(0, 0);
      context.currentTime = 3;
      player.update(0.1);
      expect(run.elapsedSeconds).toBe(4);
      expect(camera.position.x).toBe(4);
      expect(lines).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'Second half.' }));
      expect(cues).toHaveBeenCalledWith('during-first-line');
      context.currentTime = 3.25;
      run.pause();
      expect(run.elapsedSeconds).toBe(4.25);
      expect(camera.position.x).toBe(4.25);
      context.currentTime = 100;
      player.update(100);
      expect(run.elapsedSeconds).toBe(4.25);
      run.resume();
      expect(sources[1]!.start).toHaveBeenCalledWith(0, 3.25);
      context.currentTime = 100.5;
      player.update(0.1);
      expect(run.elapsedSeconds).toBe(4.75);
      context.currentTime = 101.5;
      sources[1]!.onended!();
      player.update(100);
      expect(run.elapsedSeconds).toBe(5); // Catch only to the audible line's end this frame.
      expect(sources).toHaveLength(2);
      player.update(0.5);
      expect(run.elapsedSeconds).toBe(5.5);
      player.update(10);
      expect(run.elapsedSeconds).toBe(6); // A second fresh source gets its own zero offset.
      expect(sources).toHaveLength(3);
      expect(sources[2]!.start).toHaveBeenCalledWith(0, 0);
      player.update(10);
      expect(run.elapsedSeconds).toBe(6); // Host time cannot outrun unadvanced native audio.
      context.currentTime = 105.5;
      sources[2]!.onended!();
      player.update(0.1);
      expect(run.elapsedSeconds).toBe(10);
      player.update(2);
      expect((await run.finished).outcome).toBe('completed');
      expect(run.elapsedSeconds).toBe(12);
    } finally {
      context.state = 'closed'; context.dispatchEvent(new Event('statechange'));
    }
  });
});
