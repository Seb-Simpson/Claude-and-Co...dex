import manifest from '../media/corridor/corridor.json';
import ambientUrl from '../media/corridor/ambient.webp?url';
import exitUrl from '../media/corridor/exit.webp?url';
import farUrl from '../media/corridor/far.webp?url';
import figureUrl from '../media/corridor/figure.webp?url';
import mainAUrl from '../media/corridor/main_a.webp?url';
import mainBUrl from '../media/corridor/main_b.webp?url';
import posterDarkUrl from '../media/corridor/poster_dark.webp?url';
import posterFigureUrl from '../media/corridor/poster_figure.webp?url';
import posterLitUrl from '../media/corridor/poster_lit.webp?url';
import { el } from '../ui/dom';
import { createDirector, type CorridorEvent, type Director, type LightState } from './director';

/**
 * The title screen's corridor, lit live.
 *
 * Blender rendered the west corridor once per light group (render_menu.py). Light adds linearly,
 * so this shader can re-light the real render at any intensity: the hanging tube failing, the
 * far tube dying, the exit sign pulsing, the figure standing in the doorway when it is dark. The
 * director decides the intensities; the shader adds drifting floor haze, dust in the tube's light,
 * the grade, vignette and grain.
 *
 * Cost: one full-screen pass over six textures, at most 60 frames a second, stopped while the page
 * is hidden. The GPU context is released whenever the title screen is not showing.
 * Without WebGL, three pre-composited states (lit, dark, figure) are switched instead.
 */
export interface CorridorDebug {
  readonly mode: 'webgl' | 'fallback' | 'loading' | 'stopped';
  readonly frames: number;
  readonly state: LightState;
  /** Draw now and measure the picture (WebGL only): mean luminance overall, in the figure's box, and redness. */
  sample(): { mean: number; figure: number; red: number } | null;
}

export interface Corridor {
  readonly root: HTMLElement;
  readonly director: Director;
  readonly debug: CorridorDebug;
  start(): void;
  stop(): void;
  setReducedMotion(reduced: boolean): void;
  setEffects(strength: number): void;
  onEvent(listener: (event: CorridorEvent) => void): () => void;
  dispose(): void;
}

export interface CorridorOptions {
  seed?: number;
  reducedMotion?: boolean;
  /** Test hook: force the fallback path. */
  noWebGL?: boolean;
  /** Every frame's light state (the sound follows it). */
  onFrame?: (state: LightState) => void;
}

interface Manifest {
  width: number; height: number;
  levels: { ambient: number; exit: number; main: number; far: number; exposure: number };
  grade: { exposure: number; saturation: number; tint: number[] };
  passes: Record<'ambient' | 'exit' | 'main_a' | 'main_b' | 'far' | 'figure', { scale: number }>;
  figureBox: number[];
  tubeAt?: number[];
}
const M = manifest as unknown as Manifest;
const PASS_URLS = { ambient: ambientUrl, exit: exitUrl, main_a: mainAUrl, main_b: mainBUrl, far: farUrl, figure: figureUrl } as const;
type PassName = keyof typeof PASS_URLS;
const PASS_ORDER: PassName[] = ['ambient', 'exit', 'main_a', 'main_b', 'far', 'figure'];

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5); gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tAmb, tExit, tMainA, tMainB, tFar, tFig;
uniform vec4 uScale;   // ambient, exit, main_a, far (undo the encoder's normalisation)
uniform vec2 uScale2;  // main_b, figure
uniform vec4 uLight;   // ambient, exit, main, far: director state x manifest level
uniform vec3 uMisc;    // sway, figure, exposure
uniform vec4 uCover;   // image uv = vUv * xy + zw
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uFx;      // grain, haze, motion (0 when reduced)
uniform vec2 uTube;    // image uv of the hanging tube
uniform vec2 uGrade;   // saturation, unused
uniform vec3 uTint;

vec3 lin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 srgb(vec3 c) { c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), u.x), u.y);
}
float fbm(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
float motes(vec2 px, float cell, float t) {
  vec2 g = px / cell + vec2(0.0, t);
  vec2 id = floor(g); vec2 f = fract(g);
  vec2 c = 0.2 + 0.6 * vec2(hash(id), hash(id + 17.1)) + 0.12 * vec2(sin(uTime * 0.31 + id.y * 1.7), cos(uTime * 0.23 + id.x * 2.3)) * uFx.z;
  float r = 0.035 + 0.05 * hash(id + 3.3);
  return smoothstep(r, 0.0, length(f - c)) * step(0.8, hash(id + 9.1));
}
vec3 tonemap(vec3 x) {
  vec3 y = clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  float l = dot(y, vec3(0.2126, 0.7152, 0.0722));
  float red = clamp((y.r - y.g * 1.5) * 3.0, 0.0, 1.0);
  float sat = uGrade.x + (1.0 - uGrade.x) * red;
  return (vec3(l) + (y - vec3(l)) * sat) * uTint;
}
void main() {
  vec2 uv = vUv * uCover.xy + uCover.zw;
  vec3 amb = lin(texture2D(tAmb, uv).rgb) * uScale.x;
  vec3 ex = lin(texture2D(tExit, uv).rgb) * uScale.y;
  vec3 ta = lin(texture2D(tMainA, uv).rgb) * uScale.z;
  vec3 tb = lin(texture2D(tMainB, uv).rgb) * uScale2.x;
  vec3 fa = lin(texture2D(tFar, uv).rgb) * uScale.w;
  vec4 fg = texture2D(tFig, uv);
  vec3 tube = mix(ta, tb, uMisc.x);
  vec3 scene = uLight.x * amb + uLight.y * ex + uLight.z * tube + uLight.w * fa;
  vec3 seen = uLight.y * lin(fg.rgb) * uScale2.y + 0.15 * uLight.z * tube;
  scene = mix(scene, seen, fg.a * uMisc.y);

  // Haze drifting along the floor, lit by whatever light is on.
  float h = fbm(vec2(uv.x * 2.6 + uTime * 0.028 * uFx.z, uv.y * 6.5 - uTime * 0.012 * uFx.z));
  float floorBand = smoothstep(0.52, 0.98, uv.y);
  vec3 hazeLight = vec3(0.6, 0.68, 0.72) * uLight.z * 0.9 + vec3(0.9, 0.07, 0.04) * uLight.y * 0.035 + vec3(0.55, 0.62, 0.66) * uLight.w * 0.05;
  scene += hazeLight * h * h * floorBand * uFx.y * 0.14;

  // Dust turning in the tube's light.
  vec2 d = uv - uTube;
  float cone = smoothstep(-0.01, 0.06, d.y) * smoothstep(0.1 + d.y * 0.55, 0.0, abs(d.x + d.y * 0.15)) * exp(-d.y * 2.2);
  vec2 px = uv * vec2(${M.width.toFixed(1)}, ${M.height.toFixed(1)});
  float dust = motes(px, 34.0, uTime * 0.09 * uFx.z) + 0.6 * motes(px + 71.0, 21.0, uTime * 0.06 * uFx.z);
  scene += vec3(0.75, 0.82, 0.86) * dust * cone * uLight.z * uFx.y * 0.3;

  vec3 col = tonemap(scene * uMisc.z);
  vec2 q = (vUv - 0.5) * vec2(1.0, 1.15);
  float v = smoothstep(0.45, 1.1, length(q) * 1.414);
  col *= 1.0 - 0.42 * v;
  vec3 outc = srgb(col);
  float grain = (hash(vUv * uRes + fract(uTime * 7.13) * 91.0) - 0.5) * uFx.x;
  gl_FragColor = vec4(outc + grain, 1.0);
}`;

function cover(cw: number, ch: number): [number, number, number, number] {
  const ia = M.width / M.height;
  const ca = cw / Math.max(1, ch);
  // Keep the corridor's vanishing point and the exit in view on narrow screens.
  const focusX = 0.66;
  if (ca >= ia) { const sy = ia / ca; return [1, sy, 0, (1 - sy) * 0.45]; }
  const sx = ca / ia;
  return [sx, 1, (1 - sx) * focusX, 0];
}

export function createCorridor(options: CorridorOptions = {}): Corridor {
  const director = createDirector({ ...(options.seed !== undefined ? { seed: options.seed } : {}), reducedMotion: options.reducedMotion ?? false });
  const poster = (src: string, cls: string): HTMLImageElement => el('img', { src, class: `nw-corridor__poster ${cls}`, alt: '', decoding: 'async', draggable: 'false' });
  const lit = poster(posterLitUrl, 'nw-corridor__lit');
  const root = el('div', { class: 'nw-corridor', role: 'img', 'aria-label': 'A derelict hospital corridor at night. A fluorescent tube hangs from its wires; beyond a wheelchair and the door of Room 104, an exit sign glows red over a doorway at the far end.' }, lit,
    el('div', { class: 'nw-corridor__shade', 'aria-hidden': 'true' }));
  let dark: HTMLImageElement | null = null;
  let figure: HTMLImageElement | null = null;

  let canvas: HTMLCanvasElement | null = null;
  let gl: WebGLRenderingContext | null = null;
  let program: WebGLProgram | null = null;
  let uniforms: Record<string, WebGLUniformLocation | null> = {};
  let textures: WebGLTexture[] = [];
  let mode: CorridorDebug['mode'] = 'stopped';
  let running = false;
  let raf = 0;
  let last = 0;
  let frames = 0;
  let effects = 1;
  let reduced = options.reducedMotion ?? false;
  let generation = 0;
  let resizeObserver: ResizeObserver | null = null;
  const tubeAt = M.tubeAt ?? [0.8, 0.2];

  function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Could not load ${url}`));
      img.src = url;
    });
  }

  function size(): void {
    if (!canvas || !gl) return;
    // Device pixels, capped: 1.25x on dense screens and never wider than the renders.
    const scale = Math.min(window.devicePixelRatio || 1, 1.25, 1920 / Math.max(1, canvas.clientWidth));
    const w = Math.max(1, Math.round(canvas.clientWidth * scale));
    const h = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
  }

  function compile(g: WebGLRenderingContext): WebGLProgram {
    const sh = (type: number, src: string): WebGLShader => {
      const s = g.createShader(type)!;
      g.shaderSource(s, src);
      g.compileShader(s);
      if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const p = g.createProgram()!;
    g.attachShader(p, sh(g.VERTEX_SHADER, VERT));
    g.attachShader(p, sh(g.FRAGMENT_SHADER, FRAG));
    g.bindAttribLocation(p, 0, 'aPos');
    g.linkProgram(p);
    if (!g.getProgramParameter(p, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(p) ?? 'link');
    return p;
  }

  async function initWebGL(): Promise<void> {
    const mine = ++generation;
    mode = 'loading';
    canvas = el('canvas', { class: 'nw-corridor__canvas', 'aria-hidden': 'true' });
    root.insertBefore(canvas, lit.nextSibling);
    const g = (options.noWebGL ? null : canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'low-power' })) as WebGLRenderingContext | null;
    if (!g) throw new Error('WebGL unavailable');
    gl = g;
    canvas.addEventListener('webglcontextlost', onLost);
    program = compile(g);
    g.useProgram(program);
    const quad = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, quad);
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW);
    g.enableVertexAttribArray(0);
    g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
    for (const name of ['uScale', 'uScale2', 'uLight', 'uMisc', 'uCover', 'uRes', 'uTime', 'uFx', 'uTube', 'uGrade', 'uTint']) uniforms[name] = g.getUniformLocation(program, name);
    const images = await Promise.all(PASS_ORDER.map((n) => loadImage(PASS_URLS[n])));
    if (mine !== generation || !gl) return;
    // Upload no larger than the screen needs (GPU memory scales with the viewport).
    const target = Math.min(M.width, Math.max(640, Math.round((canvas.clientWidth || M.width) * Math.min(window.devicePixelRatio || 1, 1.25))));
    textures = await Promise.all(images.map(async (img, i) => {
      let source: TexImageSource = img;
      if (target < img.naturalWidth && typeof createImageBitmap === 'function') {
        try { source = await createImageBitmap(img, { resizeWidth: target, resizeHeight: Math.round(target * img.naturalHeight / img.naturalWidth), resizeQuality: 'high' }); } catch { source = img; }
      }
      const tex = g.createTexture()!;
      g.activeTexture(g.TEXTURE0 + i);
      g.bindTexture(g.TEXTURE_2D, tex);
      g.pixelStorei(g.UNPACK_COLORSPACE_CONVERSION_WEBGL, g.NONE);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
      g.texImage2D(g.TEXTURE_2D, 0, i === 5 ? g.RGBA : g.RGB, i === 5 ? g.RGBA : g.RGB, g.UNSIGNED_BYTE, source);
      if (source !== img && 'close' in source) (source as ImageBitmap).close();
      return tex;
    }));
    if (mine !== generation || !gl) return;
    ['tAmb', 'tExit', 'tMainA', 'tMainB', 'tFar', 'tFig'].forEach((n, i) => g.uniform1i(g.getUniformLocation(program!, n), i));
    const P = M.passes;
    g.uniform4f(uniforms.uScale!, P.ambient.scale, P.exit.scale, P.main_a.scale, P.far.scale);
    g.uniform2f(uniforms.uScale2!, P.main_b.scale, P.figure.scale);
    g.uniform2f(uniforms.uGrade!, M.grade.saturation, 0);
    g.uniform3f(uniforms.uTint!, M.grade.tint[0]!, M.grade.tint[1]!, M.grade.tint[2]!);
    g.uniform2f(uniforms.uTube!, tubeAt[0]!, tubeAt[1]!);
    resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => size()) : null;
    resizeObserver?.observe(canvas);
    size();
    mode = 'webgl';
    root.classList.add('is-live');
  }

  function draw(state: LightState): void {
    if (!gl || mode !== 'webgl' || !canvas) return;
    const L = M.levels;
    const [cx, cy, ox, oy] = cover(canvas.width, canvas.height);
    gl.uniform4f(uniforms.uLight!, state.ambient * L.ambient, state.exit * L.exit, state.main * L.main, state.far * L.far);
    gl.uniform3f(uniforms.uMisc!, state.sway, state.figure, L.exposure * M.grade.exposure);
    gl.uniform4f(uniforms.uCover!, cx, cy, ox, oy);
    gl.uniform2f(uniforms.uRes!, canvas.width, canvas.height);
    gl.uniform1f(uniforms.uTime!, director.time);
    gl.uniform3f(uniforms.uFx!, 0.035 * effects, effects, reduced ? 0 : 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    frames++;
  }

  function drawFallback(state: LightState): void {
    if (!dark || !figure) return;
    const darkness = Math.max(0, Math.min(1, 1 - state.main));
    dark.style.opacity = darkness.toFixed(3);
    figure.style.opacity = Math.min(darkness, state.figure).toFixed(3);
    frames++;
  }

  function useFallback(): void {
    mode = 'fallback';
    if (!dark) {
      dark = poster(posterDarkUrl, 'nw-corridor__dark');
      figure = poster(posterFigureUrl, 'nw-corridor__figure');
      root.insertBefore(figure, lit.nextSibling);
      root.insertBefore(dark, figure);
    }
  }

  function frame(now: number): void {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    // Up to a quarter second per frame: on a slow machine the events keep (almost) real time.
    const dt = last ? Math.min(0.25, (now - last) / 1000) : 1 / 60;
    last = now;
    const state = director.update(dt);
    options.onFrame?.(state);
    if (mode === 'webgl') draw(state);
    else if (mode === 'fallback') drawFallback(state);
  }

  function onLost(event: Event): void {
    event.preventDefault();
    teardown();
    if (running) useFallback();
  }

  function teardown(): void {
    generation++;
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (gl) {
      for (const t of textures) gl.deleteTexture(t);
      if (program) gl.deleteProgram(program);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    canvas?.removeEventListener('webglcontextlost', onLost);
    canvas?.remove();
    textures = [];
    program = null;
    gl = null;
    canvas = null;
    uniforms = {};
    root.classList.remove('is-live');
  }

  const onVisibility = (): void => {
    if (!running) return;
    cancelAnimationFrame(raf);
    if (!document.hidden) { last = 0; raf = requestAnimationFrame(frame); }
  };
  document.addEventListener('visibilitychange', onVisibility);

  const debug: CorridorDebug = {
    get mode() { return mode; },
    get frames() { return frames; },
    get state() { return director.state; },
    sample() {
      if (!gl || mode !== 'webgl' || !canvas) return null;
      draw(director.state);
      const w = canvas.width;
      const h = canvas.height;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      // The figure's box, in canvas pixels (readPixels rows run bottom-up).
      const [cx, cy, ox, oy] = cover(w, h);
      const [bx0, by0, bx1, by1] = M.figureBox as [number, number, number, number];
      const toX = (u: number): number => ((u - ox) / cx) * w;
      const toY = (v: number): number => ((v - oy) / cy) * h;
      const x0 = Math.max(0, Math.floor(toX(bx0))), x1 = Math.min(w, Math.ceil(toX(bx1)));
      const y0 = Math.max(0, Math.floor(toY(by0))), y1 = Math.min(h, Math.ceil(toY(by1)));
      let sum = 0, red = 0, fsum = 0, fn = 0;
      for (let y = 0; y < h; y++) {
        const top = h - 1 - y;
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const l = (0.2126 * px[i]! + 0.7152 * px[i + 1]! + 0.0722 * px[i + 2]!) / 255;
          sum += l;
          red += (px[i]! - px[i + 1]!) / 255;
          if (x >= x0 && x < x1 && top >= y0 && top < y1) { fsum += l; fn++; }
        }
      }
      return { mean: sum / (w * h), figure: fn ? fsum / fn : 0, red: red / (w * h) };
    },
  };

  return {
    root,
    director,
    debug,
    start() {
      if (running) return;
      running = true;
      last = 0;
      root.classList.toggle('is-still', reduced);
      initWebGL().catch(() => { teardown(); if (running) useFallback(); });
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      teardown();
      mode = 'stopped';
    },
    setReducedMotion(value) {
      reduced = value;
      director.setReducedMotion(value);
      root.classList.toggle('is-still', value);
    },
    setEffects(strength) { effects = Math.max(0, Math.min(1, strength)); },
    onEvent: (listener) => director.onEvent(listener),
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      teardown();
      document.removeEventListener('visibilitychange', onVisibility);
      root.remove();
    },
  };
}
