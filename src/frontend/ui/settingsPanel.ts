import { DEFAULT_SETTINGS, QUALITY_PRESETS, type QualityPreset, type Settings, type SettingsStore } from '../../settings/settings';
import { fullscreen } from '../display';
import type { UiSound } from '../sound';
import { el, trapFocus, reveal } from './dom';

export interface SettingsPanel {
  readonly root: HTMLElement;
  open(onClose: () => void): void;
  close(): void;
  readonly isOpen: boolean;
  dispose(): void;
}

/**
 * Real settings, applied the moment they change and persisted in browser storage (when the
 * browser allows it). Grouped as Audio / Controls / Display / Accessibility.
 */
export function createSettingsPanel(store: SettingsStore, sound: UiSound): SettingsPanel {
  let onCloseFn: (() => void) | null = null;
  let previousFocus: HTMLElement | null = null;
  const controls: { sync(s: Settings): void }[] = [];

  function slider(key: 'masterVolume' | 'musicVolume' | 'sfxVolume' | 'mouseSensitivity' | 'effects', label: string, min: number, max: number, step: number, format: (v: number) => string): HTMLElement {
    const id = `nw-set-${key}`;
    const input = el('input', { id, type: 'range', min, max, step, class: 'nw-range' });
    const out = el('output', { for: id, class: 'nw-field__value' });
    input.addEventListener('input', () => { const v = Number(input.value); store.update({ [key]: v } as Partial<Settings>); out.textContent = format(v); });
    input.addEventListener('change', () => sound.play('move'));
    controls.push({ sync: (s) => { input.value = String(s[key]); out.textContent = format(s[key]); input.style.setProperty('--fill', String((s[key] - min) / (max - min))); } });
    input.addEventListener('input', () => input.style.setProperty('--fill', String((Number(input.value) - min) / (max - min))));
    return el('div', { class: 'nw-field' }, el('label', { for: id, class: 'nw-field__label', text: label }), input, out);
  }
  function toggle(key: 'subtitles' | 'invertY', label: string, note?: string): HTMLElement {
    const id = `nw-set-${key}`;
    const input = el('input', { id, type: 'checkbox', role: 'switch', class: 'nw-switch' });
    input.addEventListener('change', () => { store.update({ [key]: input.checked } as Partial<Settings>); sound.play('move'); });
    controls.push({ sync: (s) => { input.checked = s[key]; } });
    return el('div', { class: 'nw-field nw-field--toggle' }, el('label', { for: id, class: 'nw-field__label', text: label }), input, note ? el('p', { class: 'nw-field__note', text: note }) : null);
  }
  function choice<T extends string>(name: string, label: string, options: readonly { value: T; label: string; hint?: string }[], get: (s: Settings) => T, set: (v: T) => void, note?: (v: T) => string): HTMLElement {
    const group = el('div', { class: 'nw-segments', role: 'radiogroup', 'aria-label': label });
    const noteNode = el('p', { class: 'nw-field__note' });
    const inputs = options.map((o) => {
      const id = `nw-set-${name}-${o.value}`;
      const input = el('input', { id, type: 'radio', name: `nw-${name}`, value: o.value, class: 'nw-segment__input' });
      input.addEventListener('change', () => { if (input.checked) { set(o.value); sound.play('move'); } });
      group.append(input, el('label', { for: id, class: 'nw-segment', text: o.label, title: o.hint }));
      return input;
    });
    controls.push({ sync: (s) => { const v = get(s); for (const i of inputs) i.checked = i.value === v; noteNode.textContent = note ? note(v) : ''; } });
    return el('div', { class: 'nw-field nw-field--choice' }, el('span', { class: 'nw-field__label', text: label }), group, noteNode);
  }

  const pct = (v: number): string => `${Math.round(v * 100)}%`;
  const fsButton = el('button', { type: 'button', class: 'nw-button' });
  const syncFs = (): void => {
    const supported = fullscreen.supported();
    fsButton.disabled = !supported;
    fsButton.textContent = !supported ? 'Not supported here' : fullscreen.active() ? 'Exit fullscreen' : 'Enter fullscreen';
  };
  fsButton.addEventListener('click', () => { void fullscreen.toggle().then(syncFs); sound.play('select'); });
  document.addEventListener('fullscreenchange', syncFs);

  const storageNote = el('p', { class: 'nw-settings__storage', role: 'note' });
  const reset = el('button', { type: 'button', class: 'nw-button nw-button--quiet', text: 'Restore defaults' });
  reset.addEventListener('click', () => { store.reset(); sound.play('back'); });
  const done = el('button', { type: 'button', class: 'nw-button nw-button--primary', text: 'Done' });
  done.addEventListener('click', () => { sound.play('back'); api.close(); });

  const section = (title: string, ...fields: HTMLElement[]): HTMLElement => el('fieldset', { class: 'nw-settings__group' }, el('legend', { text: title }), ...fields);
  const body = el('div', { class: 'nw-settings__body' },
    section('Audio',
      slider('masterVolume', 'Master volume', 0, 1, 0.01, pct),
      slider('musicVolume', 'Music', 0, 1, 0.01, pct),
      slider('sfxVolume', 'Sound effects', 0, 1, 0.01, pct)),
    section('Controls',
      slider('mouseSensitivity', 'Mouse sensitivity', 0.25, 3, 0.05, (v) => `${v.toFixed(2)}×`),
      toggle('invertY', 'Invert vertical look')),
    section('Display',
      choice<QualityPreset>('quality', 'Graphics quality', (Object.keys(QUALITY_PRESETS) as QualityPreset[]).map((k) => ({ value: k, label: QUALITY_PRESETS[k].label, hint: QUALITY_PRESETS[k].description })),
        (s) => s.quality, (v) => store.update({ quality: v }), (v) => QUALITY_PRESETS[v].description),
      el('div', { class: 'nw-field' }, el('span', { class: 'nw-field__label', text: 'Fullscreen' }), fsButton)),
    section('Accessibility',
      toggle('subtitles', 'Subtitles', 'Captions for spoken lines and important sounds.'),
      choice<Settings['motion']>('motion', 'Motion', [{ value: 'system', label: 'System' }, { value: 'reduce', label: 'Reduced' }, { value: 'full', label: 'Full' }],
        (s) => s.motion, (v) => store.update({ motion: v }), (v) => (v === 'system' ? 'Follows your operating system’s reduced-motion preference.' : v === 'reduce' ? 'No flicker, camera drift or animated transitions in menus and effects.' : 'All motion and flicker effects.')),
      slider('effects', 'Screen effects', 0, 1, 0.05, pct)),
  );
  const panel = el('section', { class: 'nw-settings__panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'nw-settings-title' },
    el('header', { class: 'nw-settings__head' }, el('p', { class: 'nw-eyebrow', text: 'Patient preferences' }), el('h2', { id: 'nw-settings-title', text: 'Settings' })),
    body, el('footer', { class: 'nw-settings__foot' }, storageNote, reset, done));
  const root = el('div', { class: 'nw-screen nw-settings', 'data-screen': 'settings', hidden: true }, el('div', { class: 'nw-settings__veil', 'aria-hidden': 'true' }), panel);
  const release = trapFocus(panel);
  const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); sound.play('back'); api.close(); } };
  const sync = (s: Settings): void => { for (const c of controls) c.sync(s); };
  const unsubscribe = store.subscribe(sync);

  const api: SettingsPanel = {
    root,
    get isOpen() { return !root.hidden; },
    open(onClose) {
      onCloseFn = onClose;
      previousFocus = document.activeElement as HTMLElement | null;
      sync(store.get()); syncFs();
      storageNote.textContent = store.persistent ? 'Saved on this device.' : 'Browser storage is unavailable: settings last until you close the page.';
      reveal(root);
      root.addEventListener('keydown', onKey);
      (panel.querySelector('input') as HTMLElement | null)?.focus();
    },
    close() {
      if (root.hidden) return;
      root.classList.remove('is-visible'); root.hidden = true;
      root.removeEventListener('keydown', onKey);
      const cb = onCloseFn; onCloseFn = null;
      previousFocus?.focus?.();
      cb?.();
    },
    dispose() { unsubscribe(); release(); document.removeEventListener('fullscreenchange', syncFs); root.remove(); },
  };
  void DEFAULT_SETTINGS;
  return api;
}
