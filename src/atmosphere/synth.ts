/** Small Web Audio helpers shared by the ambience, the tension score and entity audio. */

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Two seconds of brown-ish noise per context (cached). */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = noiseCache.get(ctx);
  if (cached) return cached;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.06 * white) / 1.06;
    data[i] = last * 2.2 + white * 0.15;
  }
  noiseCache.set(ctx, buffer);
  return buffer;
}

export function noiseSource(ctx: BaseAudioContext, loop = false): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = loop;
  return src;
}

export function makePanner(ctx: BaseAudioContext, refDistance = 2, rolloff = 1.2): PannerNode {
  const p = ctx.createPanner();
  p.panningModel = 'HRTF';
  p.distanceModel = 'inverse';
  p.refDistance = refDistance;
  p.rolloffFactor = rolloff;
  p.maxDistance = 80;
  return p;
}

export function placePanner(p: PannerNode, v: { readonly x: number; readonly y: number; readonly z: number }): void {
  if (p.positionX) {
    const t = p.context.currentTime;
    p.positionX.setTargetAtTime(v.x, t, 0.03);
    p.positionY.setTargetAtTime(v.y, t, 0.03);
    p.positionZ.setTargetAtTime(v.z, t, 0.03);
  } else {
    (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(v.x, v.y, v.z);
  }
}

export function filter(ctx: BaseAudioContext, type: BiquadFilterType, frequency: number, q = 0.8): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = q;
  return f;
}

/** Exponential attack/decay envelope on a gain node. */
export function envelope(g: GainNode, at: number, peak: number, attack: number, decay: number): void {
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
}

/** Disconnect a node after `seconds` (lets one-shot graphs be garbage collected). */
export function releaseLater(node: AudioNode, seconds: number): void {
  setTimeout(() => { try { node.disconnect(); } catch { /* already gone */ } }, Math.max(0, seconds * 1000 + 200));
}
