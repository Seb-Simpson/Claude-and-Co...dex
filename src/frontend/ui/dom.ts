import type { UiSound } from '../sound';

type Attrs = Record<string, string | number | boolean | undefined>;

/** Create an element with attributes (`class`, `data-*`, `aria-*`, ...) and children. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Node | string | null | undefined)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key === 'text') node.textContent = String(value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) if (child !== null && child !== undefined) node.append(child);
  return node;
}

export interface NavItem {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly disabled?: boolean;
  /** Small line under the label (e.g. the checkpoint for Continue). */
  readonly detail?: string;
}

export interface NavList {
  readonly root: HTMLElement;
  update(items: readonly NavItem[]): void;
  focusFirst(): void;
  focus(id: string): void;
  dispose(): void;
}

/**
 * A vertical menu: real buttons in a list. Up/Down/Home/End move focus (skipping nothing: disabled
 * entries stay focusable via aria-disabled so screen readers announce them), Enter/Space activate,
 * and hovering follows focus. The description of the focused entry is announced.
 */
export function navList(label: string, onSelect: (id: string) => void, sound?: UiSound): NavList {
  const list = el('ul', { class: 'nw-nav__list', role: 'list' });
  const description = el('p', { class: 'nw-nav__description', 'aria-live': 'polite' });
  const root = el('nav', { class: 'nw-nav', 'aria-label': label }, list, description);
  let buttons: HTMLButtonElement[] = [];
  let items: readonly NavItem[] = [];
  const describe = (i: number): void => { description.textContent = items[i]?.description ?? ''; };
  const onKey = (event: KeyboardEvent): void => {
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    let next = -1;
    if (event.key === 'ArrowDown') next = (i + 1) % buttons.length;
    else if (event.key === 'ArrowUp') next = (i - 1 + buttons.length) % buttons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    if (next >= 0) { event.preventDefault(); buttons[next]!.focus(); }
  };
  list.addEventListener('keydown', onKey);
  const api: NavList = {
    root,
    update(next) {
      items = next;
      list.replaceChildren();
      buttons = next.map((item, i) => {
        const button = el('button', {
          type: 'button', class: 'nw-nav__item', 'data-action': item.id,
          'aria-disabled': item.disabled ? 'true' : undefined,
          'aria-describedby': undefined,
        },
        el('span', { class: 'nw-nav__index', 'aria-hidden': 'true', text: String(i + 1).padStart(2, '0') }),
        el('span', { class: 'nw-nav__label', text: item.label }),
        item.detail ? el('span', { class: 'nw-nav__detail', text: item.detail }) : null);
        button.addEventListener('focus', () => { describe(i); sound?.play('move'); });
        button.addEventListener('mouseenter', () => { if (document.activeElement !== button) button.focus({ preventScroll: true }); });
        button.addEventListener('click', () => {
          if (item.disabled) { sound?.play('deny'); return; }
          sound?.play('select');
          onSelect(item.id);
        });
        list.append(el('li', {}, button));
        return button;
      });
    },
    focusFirst() { (buttons.find((b) => b.getAttribute('aria-disabled') !== 'true') ?? buttons[0])?.focus(); },
    focus(id) { buttons.find((b) => b.dataset.action === id)?.focus(); },
    dispose() { list.removeEventListener('keydown', onKey); },
  };
  return api;
}

/** Keep Tab focus inside `container` while it is open. */
export function trapFocus(container: HTMLElement): () => void {
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return;
    const focusable = [...container.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((n) => !n.hasAttribute('disabled') && n.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  container.addEventListener('keydown', onKey);
  return () => container.removeEventListener('keydown', onKey);
}

/**
 * Fade a screen in: show it, add `is-visible` on the next frame, and keep frames coming for the
 * length of the fade. Some environments (headless browsers, aggressive power saving) only produce
 * frames on demand, and with the game loop stopped a CSS transition would stall half-way.
 */
export function reveal(root: HTMLElement, ms = 800): void {
  root.hidden = false;
  const end = performance.now() + ms;
  const tick = (): void => { if (performance.now() < end && !root.hidden) requestAnimationFrame(tick); };
  requestAnimationFrame(() => { root.classList.add('is-visible'); tick(); });
}
