import { MENU_SCENE } from '../media';
import { el } from './dom';

/**
 * The title screen's hospital view: three Cycles renders of the west corridor (troffer on, troffer
 * off, troffer on with a figure at the far end), composited with CSS. That gives real light and
 * shadow, not a filter over a still.
 *
 * - The fluorescent fails in irregular bursts (opacity switches between the on and off renders,
 *   like a dying ballast).
 * - Rarely, when the light comes back from a flicker, the figure is standing at the end of the
 *   corridor. It is gone after the next flicker.
 * - Dust drifts through the light (canvas, under 120 particles), with a slow push-in on the view.
 *
 * Reduced motion: a still image (lit), with no flicker, dust, push-in or apparition. Everything
 * pauses while the page is hidden.
 */
export interface MenuScene {
  readonly root: HTMLElement;
  start(): void;
  stop(): void;
  setReducedMotion(reduced: boolean): void;
  dispose(): void;
}

export function createMenuScene(random: () => number = Math.random): MenuScene {
  const img = (src: string, cls: string, alt = ''): HTMLImageElement => el('img', { src, class: `nw-scene__layer ${cls}`, alt, decoding: 'async', draggable: 'false' });
  const lit = img(MENU_SCENE.lit, 'nw-scene__lit', MENU_SCENE.alt);
  const dark = img(MENU_SCENE.dark, 'nw-scene__dark');
  const figure = img(MENU_SCENE.figure, 'nw-scene__figure');
  const dust = el('canvas', { class: 'nw-scene__dust', 'aria-hidden': 'true' });
  // The dust canvas is only in the document while the title screen runs (the game keeps one canvas).
  const camera = el('div', { class: 'nw-scene__camera' }, lit, figure, dark);
  const root = el('div', { class: 'nw-scene', role: 'img', 'aria-label': MENU_SCENE.alt }, camera,
    el('div', { class: 'nw-scene__grade', 'aria-hidden': 'true' }), el('div', { class: 'nw-grain', 'aria-hidden': 'true' }));
  lit.setAttribute('aria-hidden', 'true');

  let running = false;
  let reduced = false;
  let timers: number[] = [];
  let raf = 0;
  let figureShown = false;
  let lastFigure = -1e9;
  const later = (ms: number, fn: () => void): void => { timers.push(window.setTimeout(fn, ms)); };
  const setDark = (on: boolean): void => { dark.style.opacity = on ? '1' : '0'; };

  function burst(): void {
    if (!running || reduced) return;
    // A dying ballast: 2-7 fast drops, sometimes a long dark gap.
    const drops = 2 + Math.floor(random() * 6);
    let t = 0;
    const appear = !figureShown && performance.now() - lastFigure > 40000 && random() < 0.35;
    for (let i = 0; i < drops; i++) {
      const off = 35 + random() * (i === drops - 1 && random() < 0.4 ? 900 : 120);
      later(t, () => setDark(true));
      t += off;
      later(t, () => {
        setDark(false);
        if (i === drops - 1) {
          if (appear) { figureShown = true; lastFigure = performance.now(); figure.style.opacity = '1'; }
          else if (figureShown) { figureShown = false; figure.style.opacity = '0'; }
        }
      });
      t += 40 + random() * 160;
    }
    later(t + 3500 + random() * 9000, burst);
  }

  // Dust: soft motes drifting through the light cone.
  const motes = Array.from({ length: 90 }, () => ({ x: random(), y: random(), r: 0.4 + random() * 1.4, vx: (random() - 0.5) * 0.004, vy: -0.002 - random() * 0.006, a: 0.15 + random() * 0.45 }));
  let last = 0;
  function drawDust(now: number): void {
    if (!running || reduced) return;
    raf = requestAnimationFrame(drawDust);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    const w = dust.clientWidth;
    const h = dust.clientHeight;
    if (w === 0 || h === 0) return;
    const scale = Math.min(window.devicePixelRatio || 1, 1.5);
    if (dust.width !== Math.round(w * scale)) { dust.width = Math.round(w * scale); dust.height = Math.round(h * scale); }
    const ctx = dust.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const lightOn = dark.style.opacity !== '1';
    for (const m of motes) {
      m.x += m.vx * dt * 6; m.y += m.vy * dt * 6;
      if (m.y < -0.02) { m.y = 1.02; m.x = random(); }
      if (m.x < -0.02) m.x = 1.02; else if (m.x > 1.02) m.x = -0.02;
      // Brightest in the light below the fluorescent panel (upper middle of the frame).
      const glow = Math.exp(-((m.x - 0.45) ** 2) / 0.05 - ((m.y - 0.35) ** 2) / 0.12);
      ctx.globalAlpha = m.a * (lightOn ? 0.25 + 0.75 * glow : 0.06);
      ctx.fillStyle = '#dfeee8';
      ctx.beginPath();
      ctx.arc(m.x * w, m.y * h, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function clear(): void {
    for (const t of timers) window.clearTimeout(t);
    timers = [];
    cancelAnimationFrame(raf);
    setDark(false);
  }
  const onVisibility = (): void => {
    if (!running) return;
    if (document.hidden) clear();
    else if (!reduced) { later(1200, burst); raf = requestAnimationFrame(drawDust); }
  };
  document.addEventListener('visibilitychange', onVisibility);

  return {
    root,
    start() {
      if (running) return;
      running = true;
      camera.append(dust);
      root.classList.toggle('is-still', reduced);
      if (!reduced) { later(1800 + random() * 2500, burst); raf = requestAnimationFrame(drawDust); }
    },
    stop() { running = false; clear(); dust.remove(); },
    setReducedMotion(value) {
      reduced = value;
      root.classList.toggle('is-still', value);
      if (value) { clear(); figure.style.opacity = '0'; figureShown = false; const ctx = dust.getContext('2d'); ctx?.clearRect(0, 0, dust.width, dust.height); }
      else if (running) { clear(); later(1500, burst); raf = requestAnimationFrame(drawDust); }
    },
    dispose() { running = false; clear(); document.removeEventListener('visibilitychange', onVisibility); root.remove(); },
  };
}
