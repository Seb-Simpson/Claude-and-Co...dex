import type { LoadingSnapshot } from '../loading/tracker';
import { LOADING_PLATES, RECORDS } from '../media';
import type { UiSound } from '../sound';
import { el, reveal } from './dom';

export interface LoadingScreen {
  readonly root: HTMLElement;
  /** The application status line (#status): module and error messages. */
  readonly status: HTMLElement;
  show(title: string): void;
  hide(): void;
  update(snapshot: LoadingSnapshot): void;
  /** Loading finished: offer "Enter ward". */
  ready(onEnter: () => void): void;
  setReducedMotion(reduced: boolean): void;
  dispose(): void;
}

const MB = (n: number): string => (n / (1024 * 1024)).toFixed(1);

export function createLoadingScreen(sound: UiSound, random: () => number = Math.random): LoadingScreen {
  const plates = LOADING_PLATES.map((p, i) => el('img', { class: 'nw-plate__img', src: p.src, alt: p.alt, decoding: 'async', 'data-index': i, draggable: 'false' }));
  const caption = el('p', { class: 'nw-plate__caption', 'aria-live': 'off' });
  const plateFrame = el('figure', { class: 'nw-plate' }, ...plates, el('figcaption', {}, caption));
  const recordRef = el('p', { class: 'nw-record__ref' });
  const recordText = el('p', { class: 'nw-record__text' });
  const record = el('article', { class: 'nw-record', 'aria-label': 'Ward record' }, recordRef, recordText);
  const heading = el('h2', { class: 'nw-loading__title', text: 'Admitting' });
  const percent = el('span', { class: 'nw-progress__percent', text: '0%' });
  const fill = el('span', { class: 'nw-progress__fill' });
  const bar = el('div', { class: 'nw-progress__bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0, 'aria-label': 'Loading progress' }, fill);
  const stage = el('p', { class: 'nw-progress__stage', 'aria-live': 'polite' });
  const steps = el('ol', { class: 'nw-steps', 'aria-label': 'Loading stages' });
  const status = el('p', { id: 'status', class: 'nw-status', role: 'status' });
  const enter = el('button', { type: 'button', class: 'nw-cta', hidden: true }, el('span', { text: 'Enter ward' }));
  const hint = el('p', { class: 'nw-loading__hint', hidden: true, text: 'Press Enter · the mouse is captured while you play; Esc pauses' });
  const panel = el('section', { class: 'nw-loading__panel' },
    el('div', { class: 'nw-loading__head' }, heading, percent), bar, stage, steps, enter, hint, status);
  const root = el('div', { class: 'nw-screen nw-loading', 'data-screen': 'loading', hidden: true, 'aria-busy': 'true' },
    plateFrame, el('div', { class: 'nw-loading__shade', 'aria-hidden': 'true' }), record, panel, el('div', { class: 'nw-grain', 'aria-hidden': 'true' }));

  let plateIndex = Math.floor(random() * plates.length);
  let recordIndex = Math.floor(random() * RECORDS.length);
  let timers: number[] = [];
  let reduced = false;
  let onEnterFn: (() => void) | null = null;
  const stepNodes = new Map<string, HTMLLIElement>();

  function showPlate(i: number): void {
    plateIndex = (i + plates.length) % plates.length;
    plates.forEach((p, k) => p.classList.toggle('is-current', k === plateIndex));
    caption.textContent = `Plate ${String(plateIndex + 1).padStart(2, '0')} — ${LOADING_PLATES[plateIndex]!.caption}`;
  }
  function showRecord(i: number): void {
    recordIndex = (i + RECORDS.length) % RECORDS.length;
    const r = RECORDS[recordIndex]!;
    recordRef.textContent = r.ref;
    recordText.textContent = r.text;
    record.classList.remove('is-in');
    void record.offsetWidth;
    record.classList.add('is-in');
  }
  function schedule(): void {
    clearTimers();
    timers.push(window.setInterval(() => showPlate(plateIndex + 1), reduced ? 10000 : 8000));
    timers.push(window.setInterval(() => showRecord(recordIndex + 1), reduced ? 13000 : 11000));
  }
  function clearTimers(): void { for (const t of timers) window.clearInterval(t); timers = []; }
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Enter' && onEnterFn && !enter.hidden && document.activeElement !== enter) { event.preventDefault(); enter.click(); }
  };
  enter.addEventListener('click', () => { sound.play('select'); onEnterFn?.(); });

  return {
    root,
    status,
    show(title) {
      heading.textContent = title;
      enter.hidden = true; hint.hidden = true; onEnterFn = null;
      root.setAttribute('aria-busy', 'true');
      steps.replaceChildren(); stepNodes.clear();
      showPlate(plateIndex + 1); showRecord(recordIndex + 1);
      reveal(root);
      schedule();
      document.addEventListener('keydown', onKey);
    },
    hide() { root.classList.remove('is-visible'); root.hidden = true; clearTimers(); document.removeEventListener('keydown', onKey); },
    update(s) {
      const pct = Math.floor(s.fraction * 100);
      percent.textContent = `${pct}%`;
      fill.style.transform = `scaleX(${s.fraction})`;
      bar.setAttribute('aria-valuenow', String(pct));
      bar.setAttribute('aria-valuetext', `${pct}%, ${s.current?.label ?? (s.complete ? 'complete' : 'starting')}`);
      const downloading = s.tasks.some((t) => t.kind === 'bytes' && t.state === 'active');
      stage.textContent = s.complete ? 'Ready.'
        : downloading ? `Downloading ward data · ${MB(s.receivedBytes)} of ${MB(s.totalBytes)} MB`
          : s.current ? `${s.current.label}…` : 'Preparing…';
      // One row per step; the downloads collapse into one row with their byte count.
      const rows: { id: string; label: string; state: string; detail?: string }[] = [];
      const files = s.tasks.filter((t) => t.kind === 'bytes');
      if (files.length) {
        const failed = files.filter((t) => t.state === 'failed').length;
        const allDone = files.every((t) => t.state === 'done' || t.state === 'failed');
        rows.push({ id: 'downloads', label: 'Ward data', state: allDone ? (failed ? 'failed' : 'done') : files.some((t) => t.state === 'active') ? 'active' : 'pending',
          detail: failed ? `${failed} file${failed > 1 ? 's' : ''} unavailable · fallback` : `${MB(s.receivedBytes)} / ${MB(s.totalBytes)} MB` });
      }
      for (const t of s.tasks.filter((x) => x.kind === 'step')) rows.push({ id: t.id, label: t.label, state: t.state, ...(t.note ? { detail: t.note } : {}) });
      for (const row of rows) {
        let node = stepNodes.get(row.id);
        if (!node) {
          node = el('li', { class: 'nw-step' }, el('span', { class: 'nw-step__mark', 'aria-hidden': 'true' }), el('span', { class: 'nw-step__label' }), el('span', { class: 'nw-step__detail' }));
          stepNodes.set(row.id, node);
          steps.append(node);
        }
        node.dataset.state = row.state;
        (node.children[1] as HTMLElement).textContent = row.label;
        (node.children[2] as HTMLElement).textContent = row.detail ?? (row.state === 'done' ? 'done' : row.state === 'active' ? 'in progress' : row.state === 'failed' ? 'fallback' : '');
      }
    },
    ready(onEnter) {
      onEnterFn = onEnter;
      root.setAttribute('aria-busy', 'false');
      enter.hidden = false; hint.hidden = false;
      sound.play('open');
      enter.focus();
    },
    setReducedMotion(value) { reduced = value; root.classList.toggle('is-still', value); if (!root.hidden) schedule(); },
    dispose() { clearTimers(); document.removeEventListener('keydown', onKey); root.remove(); },
  };
}
