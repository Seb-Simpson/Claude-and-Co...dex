import type { UiSound } from '../sound';
import { el, trapFocus, reveal } from './dom';
import { insigniaSvg } from './insignia';

/** Modal confirmation for destructive actions (restart, leave, overwrite a save). */
export interface ConfirmDialog {
  readonly root: HTMLElement;
  ask(options: { title: string; body: string; confirm: string; cancel?: string }): Promise<boolean>;
  readonly isOpen: boolean;
  dispose(): void;
}

export function createConfirmDialog(sound: UiSound): ConfirmDialog {
  const title = el('h2', { id: 'nw-confirm-title', class: 'nw-confirm__title' });
  const body = el('p', { id: 'nw-confirm-body', class: 'nw-confirm__body' });
  const yes = el('button', { type: 'button', class: 'nw-button nw-button--danger' });
  const no = el('button', { type: 'button', class: 'nw-button' });
  const panel = el('section', { class: 'nw-confirm__panel', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'nw-confirm-title', 'aria-describedby': 'nw-confirm-body' },
    title, body, el('div', { class: 'nw-confirm__actions' }, no, yes));
  const root = el('div', { class: 'nw-screen nw-confirm', hidden: true }, el('div', { class: 'nw-settings__veil', 'aria-hidden': 'true' }), panel);
  const release = trapFocus(panel);
  let settle: ((v: boolean) => void) | null = null;
  let previous: HTMLElement | null = null;
  const finish = (value: boolean): void => {
    if (!settle) return;
    const s = settle; settle = null;
    root.hidden = true; root.classList.remove('is-visible');
    sound.play(value ? 'select' : 'back');
    previous?.focus?.();
    s(value);
  };
  yes.addEventListener('click', () => finish(true));
  no.addEventListener('click', () => finish(false));
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } });
  return {
    root,
    get isOpen() { return !root.hidden; },
    ask(o) {
      finish(false);
      previous = document.activeElement as HTMLElement | null;
      title.textContent = o.title; body.textContent = o.body; yes.textContent = o.confirm; no.textContent = o.cancel ?? 'Cancel';
      reveal(root);
      no.focus();
      return new Promise((resolve) => { settle = resolve; });
    },
    dispose() { release(); finish(false); root.remove(); },
  };
}

/** Credits: who made the game and what it is built with. */
export interface CreditsScreen { readonly root: HTMLElement; open(onClose: () => void): void; close(): void; readonly isOpen: boolean; dispose(): void }

export function createCredits(sound: UiSound): CreditsScreen {
  const seal = el('div', { class: 'nw-credits__seal', 'aria-hidden': 'true' });
  seal.innerHTML = insigniaSvg('nw-seal-credits');
  const row = (role: string, ...names: string[]): HTMLElement => el('div', { class: 'nw-credit' }, el('dt', { text: role }), ...names.map((n) => el('dd', { text: n })));
  const back = el('button', { type: 'button', class: 'nw-button nw-button--primary', text: 'Back' });
  const panel = el('section', { class: 'nw-credits__panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'nw-credits-title' },
    seal,
    el('h2', { id: 'nw-credits-title', class: 'nw-credits__title', text: 'Night Ward' }),
    el('p', { class: 'nw-eyebrow', text: 'A browser horror game' }),
    el('dl', { class: 'nw-credits__list' },
      row('Created and directed by', 'Seb Simpson'),
      row('Engine, gameplay, entity AI and integration', 'Codex (OpenAI), working on the NIGHT WARD repository'),
      row('Hospital environment, entity models and animation, horror presentation, title and menus', 'Claude (Anthropic), working on the NIGHT WARD repository'),
      row('3D modelling, rigging and rendering', 'Blender (GPL) · all models, textures and renders were made for this game'),
      row('Rendering', 'three.js (MIT)'),
      row('Physics', 'Rapier by Dimforge (Apache-2.0)'),
      row('Build tooling', 'Vite (MIT) · TypeScript (Apache-2.0)'),
      row('Typefaces', 'Cormorant Garamond (OFL) · Barlow Condensed (OFL) · IBM Plex Mono (OFL)'),
      row('Sound', 'Synthesised in the browser with the Web Audio API'),
    ),
    el('p', { class: 'nw-credits__note', text: 'Halden Vale Infirmary, its staff and its patients are fictional.' }),
    back);
  const root = el('div', { class: 'nw-screen nw-credits', 'data-screen': 'credits', hidden: true }, el('div', { class: 'nw-settings__veil', 'aria-hidden': 'true' }), panel);
  const release = trapFocus(panel);
  let onClose: (() => void) | null = null;
  const api: CreditsScreen = {
    root,
    get isOpen() { return !root.hidden; },
    open(cb) { onClose = cb; reveal(root); back.focus(); },
    close() { if (root.hidden) return; root.hidden = true; root.classList.remove('is-visible'); sound.play('back'); const c = onClose; onClose = null; c?.(); },
    dispose() { release(); root.remove(); },
  };
  back.addEventListener('click', () => api.close());
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); api.close(); } });
  return api;
}

/** Error screen: what failed, and a way out. Uses role=alert so it is announced. */
export function createErrorScreen(): { root: HTMLElement; show(message: string): void } {
  const message = el('p', { class: 'nw-error__message', role: 'alert' });
  const reload = el('button', { type: 'button', class: 'nw-button nw-button--primary', text: 'Reload' });
  reload.addEventListener('click', () => location.reload());
  const root = el('div', { class: 'nw-screen nw-error', 'data-screen': 'error', hidden: true },
    el('section', { class: 'nw-error__panel' }, el('p', { class: 'nw-eyebrow', text: 'Ward systems failure' }), el('h2', { text: 'The ward went dark' }), message, reload));
  return { root, show(text) { message.textContent = text; root.hidden = false; root.classList.add('is-visible'); reload.focus(); } };
}
