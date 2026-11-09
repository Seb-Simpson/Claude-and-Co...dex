import type { SaveRecord } from '../saves';
import { formatPlayTime } from '../saves';
import type { UiSound } from '../sound';
import { el, navList, type NavItem, reveal } from './dom';
import { insigniaSvg } from './insignia';
import { createMenuScene, type MenuScene } from './scene';

export type MenuAction = 'continue' | 'new' | 'settings' | 'credits';

export interface MainMenu {
  readonly root: HTMLElement;
  readonly scene: MenuScene;
  show(save: SaveRecord | null): void;
  hide(): void;
  focus(action?: MenuAction): void;
  dispose(): void;
}

/** Title screen: brand and navigation on the left, the corridor on the right. */
export function createMainMenu(onAction: (action: MenuAction) => void, sound: UiSound): MainMenu {
  const scene = createMenuScene();
  const nav = navList('Main menu', (id) => onAction(id as MenuAction), sound);
  const brand = el('header', { class: 'nw-brand' });
  brand.innerHTML = insigniaSvg('nw-seal-menu');
  brand.append(
    el('p', { class: 'nw-eyebrow', text: 'Halden Vale Infirmary · Ward 4 West' }),
    el('h1', { class: 'nw-title' }, el('span', { class: 'nw-title__night', text: 'Night' }), el('span', { class: 'nw-title__ward', text: 'Ward' })),
    el('p', { class: 'nw-band', 'aria-label': 'Patient wristband' },
      el('span', { text: 'Patient 104' }), el('span', { text: 'Admitted 03:17' }), el('span', { class: 'nw-band__warn', text: 'Do not discharge' })),
  );
  const footer = el('footer', { class: 'nw-menu__footer' },
    el('span', { text: 'Mouse + keyboard · headphones recommended' }),
    el('span', { class: 'nw-menu__version', text: 'Build NW-003' }));
  const panel = el('section', { class: 'nw-menu__panel' }, brand, nav.root, footer);
  const root = el('div', { class: 'nw-screen nw-menu', 'data-screen': 'menu', hidden: true }, scene.root, el('div', { class: 'nw-menu__shade', 'aria-hidden': 'true' }), panel);

  const items = (save: SaveRecord | null): NavItem[] => [
    save
      ? { id: 'continue', label: 'Continue', detail: `${save.label} · ${formatPlayTime(save.playSeconds)}`, description: `Return to the last checkpoint: ${save.label}.` }
      : { id: 'continue', label: 'Continue', detail: 'No records on file', disabled: true, description: 'There is no night in progress. Start a new game.' },
    { id: 'new', label: 'New Game', description: 'Wake in Room 104. Find a way out of Ward 4 West.' },
    { id: 'settings', label: 'Settings', description: 'Audio, controls, display and accessibility.' },
    { id: 'credits', label: 'Credits', description: 'Who made NIGHT WARD.' },
  ];

  return {
    root,
    scene,
    show(save) {
      nav.update(items(save));
      root.hidden = false;
      scene.start();
      reveal(root);
    },
    hide() { root.classList.remove('is-visible'); root.hidden = true; scene.stop(); },
    focus(action) { if (action) nav.focus(action); else nav.focusFirst(); },
    dispose() { nav.dispose(); scene.dispose(); root.remove(); },
  };
}
