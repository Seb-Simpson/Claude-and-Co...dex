import { createCorridor, type Corridor } from '../menu/corridor';
import type { MenuAudio } from '../menuAudio';
import sealUrl from '../media/menu/seal.webp?url';
import titleUrl from '../media/menu/title.webp?url';
import type { SaveRecord } from '../saves';
import { formatPlayTime } from '../saves';
import type { UiSound } from '../sound';
import { el, navList, type NavItem, reveal } from './dom';

export type MenuAction = 'continue' | 'new' | 'settings' | 'credits';

export interface MainMenu {
  readonly root: HTMLElement;
  readonly corridor: Corridor;
  show(save: SaveRecord | null): void;
  hide(): void;
  focus(action?: MenuAction): void;
  /** Leaving for a new session: the corridor goes dark and the screen fades (resolves when done). */
  leave(reduced: boolean): Promise<void>;
  /** Another panel (settings, credits) is open over the title screen. */
  setBehind(behind: boolean): void;
  setReducedMotion(reduced: boolean): void;
  setEffects(strength: number): void;
  dispose(): void;
}

export interface MainMenuOptions {
  audio: MenuAudio;
  /** Called from the sound control (a user gesture). */
  onSoundToggle: () => void;
  seed?: number;
}

const SVG = 'http://www.w3.org/2000/svg';
function svg(markup: string, cls: string, viewBox: string): SVGSVGElement {
  const tpl = document.createElementNS(SVG, 'svg');
  tpl.setAttribute('class', cls);
  tpl.setAttribute('viewBox', viewBox);
  tpl.setAttribute('aria-hidden', 'true');
  tpl.setAttribute('focusable', 'false');
  tpl.innerHTML = markup;
  return tpl;
}
// A heartbeat trace for the selected item (drawn, not a font glyph).
const ECG = '<polyline points="0,12 34,12 40,12 44,6 48,12 54,12 58,2 62,22 66,9 70,12 84,12 90,10 94,12 120,12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" pathLength="1"/>';
const LOCK = '<rect x="4" y="10" width="14" height="10" rx="1.5" fill="currentColor"/><path d="M7 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/>';
const SPEAKER = '<path d="M3 9h4l5-4v14l-5-4H3z" fill="currentColor"/><path class="nw-sound__waves" d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path class="nw-sound__off" d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>';

/** Title screen: brand and navigation on the left, over the live corridor. */
export function createMainMenu(onAction: (action: MenuAction) => void, sound: UiSound, options: MainMenuOptions): MainMenu {
  const { audio } = options;
  const corridor = createCorridor({ ...(options.seed !== undefined ? { seed: options.seed } : {}), onFrame: (s) => audio.setLight(s) });
  corridor.onEvent((e) => audio.handle(e));
  const nav = navList('Main menu', (id) => onAction(id as MenuAction), sound);

  const brand = el('header', { class: 'nw-brand' },
    el('p', { class: 'nw-brand__house' }, el('span', { text: 'Halden Vale Infirmary' })),
    el('p', { class: 'nw-brand__est' }, el('span', { text: 'Est. 1969' })),
    el('img', { class: 'nw-brand__seal', src: sealUrl, alt: '', width: 260, height: 260, decoding: 'async', draggable: 'false' }),
    el('h1', { class: 'nw-title' }, el('img', { class: 'nw-title__art', src: titleUrl, alt: 'Night Ward', width: 1198, height: 564, decoding: 'async', draggable: 'false' })),
    el('p', { class: 'nw-band', 'aria-label': 'Patient wristband' },
      el('span', { text: 'Patient 104' }), el('span', { text: 'Admitted 03:17' }), el('span', { class: 'nw-band__warn', text: 'Do not discharge' })),
  );
  const tagline = el('p', { class: 'nw-tagline' }, el('span', { text: 'Some patients' }), el('span', { class: 'nw-tagline__red', text: 'never leave…' }));

  const soundLabel = el('span', { class: 'nw-sound__label' });
  const soundButton = el('button', { type: 'button', class: 'nw-sound' }, svg(SPEAKER, 'nw-sound__icon', '0 0 24 24'), soundLabel);
  soundButton.addEventListener('click', () => options.onSoundToggle());
  const syncSound = (): void => {
    const s = audio.state;
    soundButton.dataset.state = s;
    soundButton.disabled = s === 'unavailable';
    soundButton.setAttribute('aria-pressed', String(s === 'playing' || s === 'loading'));
    soundLabel.textContent = s === 'locked' ? 'Enable sound' : s === 'loading' ? 'Sound…' : s === 'playing' ? 'Sound on' : s === 'unavailable' ? 'No sound available' : 'Sound off';
    soundButton.title = s === 'playing' ? 'Mute the title screen' : 'Play the title screen soundtrack';
  };
  const unsubscribeSound = audio.onChange(syncSound);
  syncSound();

  const footer = el('footer', { class: 'nw-menu__footer' },
    soundButton,
    el('span', { class: 'nw-menu__keys', text: '↑ ↓ choose · Enter select' }),
    el('span', { class: 'nw-menu__version', text: 'Headphones recommended' }));
  const panel = el('section', { class: 'nw-menu__panel' }, brand, nav.root, tagline);
  const fade = el('div', { class: 'nw-menu__fade', 'aria-hidden': 'true' });
  const root = el('div', { class: 'nw-screen nw-menu', 'data-screen': 'menu', hidden: true },
    corridor.root, el('div', { class: 'nw-menu__shade', 'aria-hidden': 'true' }), panel, footer, fade);

  const items = (save: SaveRecord | null): NavItem[] => [
    save
      ? { id: 'continue', label: 'Continue', detail: `${save.label} · ${formatPlayTime(save.playSeconds)}`, description: `Return to the last checkpoint: ${save.label}.` }
      : { id: 'continue', label: 'Continue', detail: 'No records on file', disabled: true, description: 'There is no night in progress. Start a new game.' },
    { id: 'new', label: 'New Game', description: 'Wake in Room 104. Find a way out of Ward 4 West.' },
    { id: 'settings', label: 'Settings', description: 'Audio, controls, display and accessibility.' },
    { id: 'credits', label: 'Credits', description: 'Who made NIGHT WARD.' },
  ];

  function decorate(): void {
    nav.root.querySelectorAll<HTMLButtonElement>('.nw-nav__item').forEach((button, i) => {
      button.style.setProperty('--strip', `var(--nw-strip-${(i % 3) + 1})`);
      button.append(svg(ECG, 'nw-nav__ecg', '0 0 120 24'));
      if (button.getAttribute('aria-disabled') === 'true') button.append(svg(LOCK, 'nw-nav__lock', '0 0 22 22'));
    });
  }

  return {
    root,
    corridor,
    show(save) {
      nav.update(items(save));
      decorate();
      root.classList.remove('is-leaving', 'is-behind');
      root.hidden = false;
      corridor.start();
      audio.start();
      reveal(root);
    },
    hide() {
      root.classList.remove('is-visible', 'is-leaving', 'is-behind');
      root.hidden = true;
      corridor.stop();
      audio.stop();
    },
    focus(action) { if (action) nav.focus(action); else nav.focusFirst(); },
    leave(reduced) {
      // The lights go out on the way in.
      if (!reduced) corridor.director.force('blackout');
      root.classList.add('is-leaving');
      return new Promise((resolve) => window.setTimeout(resolve, reduced ? 120 : 650));
    },
    setBehind(behind) { root.classList.toggle('is-behind', behind); },
    setReducedMotion(reduced) { corridor.setReducedMotion(reduced); },
    setEffects(strength) { corridor.setEffects(strength); },
    dispose() { unsubscribeSound(); nav.dispose(); corridor.dispose(); root.remove(); },
  };
}
