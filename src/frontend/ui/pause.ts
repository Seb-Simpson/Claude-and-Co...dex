import type { UiSound } from '../sound';
import { formatPlayTime } from '../saves';
import { el, navList, trapFocus, reveal } from './dom';
import { insigniaSvg } from './insignia';

export type PauseAction = 'resume' | 'settings' | 'restart' | 'menu';

export interface PauseMenu {
  readonly root: HTMLElement;
  /** `frame` is the frozen game canvas, freshly rendered: it is blurred once into a still. */
  show(info: { location: string; playSeconds: number; frame?: HTMLCanvasElement | null; effects?: number }): void;
  hide(): void;
  focus(action?: PauseAction): void;
  /** Shown when the browser refused to re-capture the mouse (e.g. Esc is not a valid gesture). */
  hint(message: string | null): void;
  dispose(): void;
}

/** The pause overlay: the frozen game stays visible, darkened and blurred, behind a left-hand column. */
export function createPauseMenu(onAction: (action: PauseAction) => void, sound: UiSound): PauseMenu {
  const nav = navList('Pause menu', (id) => onAction(id as PauseAction), sound);
  nav.update([
    { id: 'resume', label: 'Resume', description: 'Return to the ward. The mouse is captured again.' },
    { id: 'settings', label: 'Settings', description: 'Audio, controls, display and accessibility.' },
    { id: 'restart', label: 'Restart Session', description: 'Return to your last checkpoint. Progress since then is lost.' },
    { id: 'menu', label: 'Return to Main Menu', description: 'End this session. Your checkpoint is kept.' },
  ]);
  const seal = el('div', { class: 'nw-pause__seal', 'aria-hidden': 'true' });
  seal.innerHTML = insigniaSvg('nw-seal-pause');
  const where = el('p', { class: 'nw-pause__where' });
  const time = el('p', { class: 'nw-pause__time' });
  const hintNode = el('p', { class: 'nw-pause__hint', role: 'status', hidden: true });
  const panel = el('section', { class: 'nw-pause__panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'nw-pause-title' },
    seal, el('h2', { id: 'nw-pause-title', class: 'nw-pause__title', text: 'Paused' }), where, time, nav.root, hintNode,
    el('p', { class: 'nw-pause__keys', text: 'Esc · resume    ↑ ↓ · choose    Enter · select' }));
  // The game is frozen while paused, so its frame is blurred once into this still (half resolution)
  // instead of a live backdrop-filter, which re-blurs the WebGL canvas on every composited frame.
  const still = el('canvas', { class: 'nw-pause__still', 'aria-hidden': 'true' });
  const veil = el('div', { class: 'nw-pause__veil', 'aria-hidden': 'true' });
  const root = el('div', { class: 'nw-screen nw-pause', 'data-screen': 'pause', hidden: true }, veil, panel);
  function capture(frame: HTMLCanvasElement | null | undefined, effects: number): void {
    const ctx = still.getContext('2d');
    if (!ctx) return;
    if (!frame || frame.width === 0) { still.width = 1; still.height = 1; ctx.clearRect(0, 0, 1, 1); return; }
    still.width = Math.max(1, Math.round(frame.width / 2));
    still.height = Math.max(1, Math.round(frame.height / 2));
    ctx.filter = `blur(${Math.round(2 + 5 * effects)}px) saturate(.6) brightness(.85)`;
    try { ctx.drawImage(frame, 0, 0, still.width, still.height); } catch { /* tainted or lost context */ }
    ctx.filter = 'none';
  }
  const release = trapFocus(panel);
  return {
    root,
    show(info) {
      root.prepend(still); // only in the document while paused (the game keeps one canvas)
      capture(info.frame, info.effects ?? 1);
      where.textContent = info.location;
      time.textContent = `Night shift · ${formatPlayTime(info.playSeconds)}`;
      hintNode.hidden = true;
      reveal(root);
      sound.play('open');
    },
    hide() { root.classList.remove('is-visible'); root.hidden = true; still.remove(); still.width = 1; still.height = 1; },
    focus(action) { if (action) nav.focus(action); else nav.focusFirst(); },
    hint(message) { hintNode.hidden = !message; hintNode.textContent = message ?? ''; },
    dispose() { release(); nav.dispose(); root.remove(); },
  };
}
