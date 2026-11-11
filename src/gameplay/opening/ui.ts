import type { SettingsStore } from '../../settings/settings';
import type { DialogueSubtitle } from '../chapter/dialogue';
import type { InteractionPrompt } from '../interactions';
import './ui.css';

export interface OpeningUiState {
  readonly guidance?: string | null;
  readonly prompt: InteractionPrompt | null;
  readonly playing: boolean;
  readonly cinematic: boolean;
}

export interface OpeningUi {
  capture(onRestart?: () => void,delayed?:boolean): void;
  captureReady():void;
  update(state: OpeningUiState, deltaSeconds: number): void;
  notify(text: string,seconds?:number): void;
  subtitle(line: DialogueSubtitle | null): void;
  setDarkness(opacity: number): void;
  dispose(): void;
}

/**
 * The opening's text follows the existing title's printed, worn hospital identity.
 * All lettering remains DOM text. The small original SVG treatments contain no text.
 * Time belongs to the host: pausing does not consume a notification or subtitle.
 */
export function createOpeningUi(
  document: Document,
  settings: SettingsStore,
  interactLabel: () => string = () => 'E',
): OpeningUi {
  const root = document.createElement('div');
  root.dataset.nightWardOpeningUi = '';
  root.className = 'nw-opening-ui';
  const darkness = document.createElement('div');
  darkness.className = 'nw-opening-ui__darkness';
  darkness.setAttribute('aria-hidden', 'true');
  darkness.style.opacity = '0';

  const prompt = document.createElement('div');
  prompt.className = 'nw-opening-ui__prompt';
  prompt.setAttribute('aria-live', 'polite');
  prompt.setAttribute('aria-atomic', 'true');
  const key = document.createElement('span');
  key.className = 'nw-opening-ui__key';
  const action = document.createElement('span');
  action.className = 'nw-opening-ui__action';
  prompt.append(key, document.createTextNode(' — '), action);

  const notification = document.createElement('div');
  notification.className = 'nw-opening-ui__notification';
  notification.setAttribute('role', 'status');
  notification.setAttribute('aria-live', 'polite');
  notification.setAttribute('aria-atomic', 'true');

  const subtitle = document.createElement('div');
  subtitle.className = 'nw-opening-ui__subtitle';
  subtitle.setAttribute('aria-live', 'polite');
  subtitle.setAttribute('aria-atomic', 'true');
  const speaker = document.createElement('span');
  speaker.className = 'nw-opening-ui__speaker';
  const words = document.createElement('span');
  words.className = 'nw-opening-ui__words';
  subtitle.append(speaker, words);

  const skip = document.createElement('div');
  skip.className = 'nw-opening-ui__skip';
  skip.textContent = 'Space — Skip';
  const guidance = document.createElement('div'); guidance.className = 'nw-opening-ui__guidance';
  const capture = document.createElement('section');
  capture.className = 'nw-opening-ui__capture'; capture.hidden = true;
  capture.setAttribute('role','dialog'); capture.setAttribute('aria-modal','true');
  capture.setAttribute('aria-labelledby','nw-opening-capture-title');
  const captureTitle = document.createElement('h2'); captureTitle.id = 'nw-opening-capture-title';
  captureTitle.textContent = 'You were found';
  const captureCredit=document.createElement('p');captureCredit.className='nw-opening-ui__capture-credit';captureCredit.textContent='Nurse Shaw · West Ward';
  const captureSkip=document.createElement('span');captureSkip.className='nw-opening-ui__capture-skip';captureSkip.textContent='Space — Continue';
  const restart = document.createElement('button'); restart.type = 'button';
  restart.textContent = 'Restart from checkpoint';
  let restartAction: (() => void) | undefined;
  const retry = () => { if (!restartAction || restart.disabled) return; restart.disabled = true; restartAction(); };
  restart.addEventListener('click',retry);
  capture.append(captureCredit,captureTitle,restart,captureSkip);
  root.append(darkness, prompt, notification, subtitle, skip, guidance, capture);
  document.body.append(root);

  let current: OpeningUiState = { prompt: null, playing: false, cinematic: false };
  let line: DialogueSubtitle | null = null;
  let notificationText = '';
  let notificationRemaining = 0;
  let disposed = false;

  function text(element: HTMLElement, value: string): void {
    if (element.textContent !== value) element.textContent = value;
  }

  function render(): void {
    if (disposed) return;
    const canShowPrompt = current.playing && !current.cinematic && current.prompt !== null;
    prompt.hidden = !canShowPrompt;
    if (canShowPrompt && current.prompt) {
      text(key, interactLabel());
      text(action, current.prompt.text);
      const available = String(current.prompt.available);
      if (prompt.dataset.available !== available) prompt.dataset.available = available;
    }
    notification.hidden = !current.playing || notificationRemaining <= 0 || notificationText.length === 0;
    text(notification, notificationText);
    // A settings change takes effect on the current cue, including while paused.
    subtitle.hidden = !current.playing || !settings.get().subtitles || !line?.text;
    text(speaker, line?.speaker ? `${line.speaker} ` : '');
    text(words, line?.text ?? '');
    skip.hidden = !current.playing || !current.cinematic;
    guidance.hidden = !current.playing || current.cinematic || !current.guidance || !!line?.text;
    text(guidance, current.guidance ?? '');
  }

  const unsubscribe = settings.subscribe(render);
  render();

  return {
    capture(onRestart,delayed=false) {
      if (disposed || !capture.hidden) return;
      current = {...current,playing:false}; restartAction = onRestart;
      capture.hidden = false; restart.hidden = !onRestart; restart.disabled=delayed;captureSkip.hidden=!delayed;capture.dataset.phase=delayed?'scare':'retry'; render();
      if(onRestart&&!delayed) restart.focus({preventScroll:true});
    },
    captureReady(){if(disposed||capture.hidden)return;restart.disabled=false;captureSkip.hidden=true;capture.dataset.phase='retry';if(restartAction)restart.focus({preventScroll:true});},
    update(state, deltaSeconds) {
      if (disposed) return;
      current = state;
      if (state.playing && Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
        notificationRemaining = Math.max(0, notificationRemaining - deltaSeconds);
      }
      render();
    },
    notify(text,seconds=3.2) {
      if (disposed) return;
      notificationText = text;
      notificationRemaining = Math.max(1,Math.min(12,seconds));
      render();
    },
    subtitle(value) {
      if (disposed) return;
      line = value ? { ...value } : null;
      render();
    },
    setDarkness(opacity) {
      if (disposed) return;
      darkness.style.opacity = String(Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 0);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      restart.removeEventListener('click',retry);
      unsubscribe();
      root.remove();
    },
  };
}
