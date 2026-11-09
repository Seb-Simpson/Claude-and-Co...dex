import { SUBTITLE_EVENT, type SubtitleLine } from '../audio/subtitles';
import type { Application, ApplicationProgress } from '../integration/application';
import type { ApplicationState } from '../integration/testing';
import { DEFAULT_PLAYER_CONFIG } from '../gameplay/player';
import { prefersReducedMotion, type Settings, type SettingsStore } from '../settings/settings';
import { attachDisplay, type DisplayController } from './display';
import { createLoadingPlan, type LoadingPlan } from './loading/plan';
import type { LoadingSnapshot } from './loading/tracker';
import { createSaveStore, ROOM_104_CHECKPOINT, type SaveStore } from './saves';
import { createUiSound } from './sound';
import { createConfirmDialog, createCredits, createErrorScreen } from './ui/dialogs';
import { el } from './ui/dom';
import { createLoadingScreen } from './ui/loading';
import { createMainMenu, type MenuAction } from './ui/menu';
import { createPauseMenu, type PauseAction } from './ui/pause';
import { createSettingsPanel } from './ui/settingsPanel';
import './frontend.css';

export type FrontendMode = 'title' | 'loading' | 'ready' | 'playing' | 'paused' | 'captured' | 'error';

export interface FrontendOptions {
  readonly app: Application;
  /** Where the UI layers mount (above the renderer). */
  readonly root: HTMLElement;
  /** The renderer container (the canvas is hidden on the title screen). */
  readonly stage: HTMLElement;
  readonly settings: SettingsStore;
  readonly moduleIds: readonly string[];
  /** QA mode: skip the title screen and start a session immediately. */
  readonly autoStart?: boolean;
  readonly saves?: SaveStore;
}

export interface Frontend {
  readonly mode: FrontendMode;
  /** Application progress events go here (wire as ApplicationOptions.onProgress). */
  onProgress(progress: ApplicationProgress): void;
  onState(state: ApplicationState): void;
  onStatus(message: string, isError?: boolean): void;
  start(): void;
  /** Diagnostics for tests: every loading snapshot of the current load, in order. */
  readonly loadingHistory: readonly LoadingSnapshot[];
  /** Diagnostics for tests: application states as the frontend received them. */
  readonly stateHistory: readonly ApplicationState[];
  dispose(): void;
}

/**
 * The game's presentation shell. It drives the existing application lifecycle; it never creates
 * a second loop or engine.
 *
 *   title ──New Game/Continue──> loading ──ready──> [Enter ward] ──> playing <──> paused
 *     ^                             ^                                   │          │
 *     └──────── Return to Main Menu ┴──── Restart / capture ────────────┴──────────┘
 */
export function createFrontend(options: FrontendOptions): Frontend {
  const { app, root, stage, settings } = options;
  const html = document.documentElement;
  const saves = options.saves ?? createSaveStore();
  const sound = createUiSound();
  const menu = createMainMenu((a) => void onMenu(a), sound);
  const loading = createLoadingScreen(sound);
  const pause = createPauseMenu((a) => void onPause(a), sound);
  const settingsPanel = createSettingsPanel(settings, sound);
  const credits = createCredits(sound);
  const confirm = createConfirmDialog(sound);
  const errorScreen = createErrorScreen();
  const subtitle = el('div', { class: 'nw-subtitles', 'aria-live': 'polite', hidden: true });
  root.append(menu.root, loading.root, pause.root, settingsPanel.root, credits.root, confirm.root, errorScreen.root, subtitle);

  let mode: FrontendMode = 'title';
  let plan: LoadingPlan | null = null;
  let unsubscribePlan: (() => void) | null = null;
  const history: LoadingSnapshot[] = [];
  const states: ApplicationState[] = [];
  let display: DisplayController | null = null;
  let playingSince = 0;
  let sessionSeconds = 0;
  let sessionCounted = false;
  let busy = false;
  let disposed = false;

  const setMode = (next: FrontendMode): void => { mode = next; html.dataset.nwMode = next; };
  const canvas = (): HTMLCanvasElement | null => app.services()?.renderer.domElement ?? null;
  const pointerLocked = (): boolean => !!canvas() && document.pointerLockElement === canvas();

  // ---- Settings applied live ------------------------------------------------------------------
  const motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  function applySettings(s: Settings): void {
    const reduced = prefersReducedMotion(s, motionQuery);
    html.classList.toggle('nw-reduce-motion', reduced);
    html.style.setProperty('--nw-effects', String(s.effects));
    menu.scene.setReducedMotion(reduced);
    loading.setReducedMotion(reduced);
    const base = DEFAULT_PLAYER_CONFIG.lookSensitivity * s.mouseSensitivity;
    app.setLookSensitivity(base, s.invertY ? -base : base);
    display?.setQuality(s.quality);
    if (!s.subtitles) subtitle.hidden = true;
  }
  const unsubscribeSettings = settings.subscribe(applySettings);
  const onMotion = (): void => applySettings(settings.get());
  motionQuery?.addEventListener?.('change', onMotion);

  // ---- Subtitles --------------------------------------------------------------------------------
  let subtitleTimer = 0;
  const onSubtitle = (event: Event): void => {
    const line = (event as CustomEvent<SubtitleLine>).detail;
    if (!settings.get().subtitles || !line?.text) return;
    subtitle.replaceChildren(...(line.speaker ? [el('span', { class: 'nw-subtitles__speaker', text: `${line.speaker}: ` })] : []), line.text);
    subtitle.hidden = false;
    window.clearTimeout(subtitleTimer);
    subtitleTimer = window.setTimeout(() => { subtitle.hidden = true; }, Math.max(1.5, line.seconds ?? 3.5) * 1000);
  };
  window.addEventListener(SUBTITLE_EVENT, onSubtitle);

  // ---- Play time and the save slot ---------------------------------------------------------------
  function bankTime(): number {
    if (playingSince) { sessionSeconds += (performance.now() - playingSince) / 1000; playingSince = 0; }
    const s = sessionSeconds;
    sessionSeconds = 0;
    return s;
  }
  function saveProgress(): void {
    const seconds = bankTime();
    saves.record(seconds, !sessionCounted);
    sessionCounted = true;
  }

  // ---- Screens ----------------------------------------------------------------------------------
  function showTitle(focus?: MenuAction): void {
    setMode('title');
    pause.hide(); loading.hide();
    menu.show(saves.load());
    sound.hum(true);
    menu.focus(focus);
  }

  function beginLoading(title: string, withDownloads: boolean): LoadingPlan {
    unsubscribePlan?.();
    history.length = 0;
    const next = createLoadingPlan(options.moduleIds, { includeEngine: !app.services(), ...(withDownloads ? {} : { downloads: [] }) });
    plan = next;
    unsubscribePlan = next.tracker.subscribe((s) => { history.push(s); loading.update(s); });
    menu.hide(); pause.hide();
    sound.hum(false);
    setMode('loading');
    loading.show(title);
    return next;
  }

  async function startSession(kind: 'new' | 'continue'): Promise<void> {
    if (busy) return;
    if (kind === 'new' && saves.load() && !options.autoStart) {
      const ok = await confirm.ask({ title: 'Start a new night?', body: 'Your checkpoint in Room 104 will be replaced.', confirm: 'Start new game' });
      if (!ok) { menu.focus('new'); return; }
    }
    busy = true;
    try {
      if (kind === 'new') saves.begin(); else if (!saves.load()) saves.begin();
      sessionCounted = false; sessionSeconds = 0;
      const current = beginLoading(kind === 'new' ? 'Admitting' : 'Resuming', true);
      // Stream the big assets first (their bytes are the measurable part), then build the session;
      // the loaders find the bytes in memory, so nothing downloads twice.
      await current.download();
      if (disposed || plan !== current) return;
      await app.newSession();
    } catch {
      /* the application reports failures through onStatus/onState */
    } finally { busy = false; }
  }

  function enterWard(): void {
    const target = canvas();
    if (!target) return;
    sound.unlock();
    void app.services()?.audio.resume().catch(() => undefined);
    try {
      const request = target.requestPointerLock() as unknown as Promise<void> | undefined;
      // Without pointer lock (denied, unsupported), enter anyway: clicking the view captures the mouse.
      void request?.catch?.(() => app.play());
    } catch { app.play(); }
  }

  function doPause(): void {
    if (mode !== 'playing') return;
    if (!app.pause()) return;
    sessionSeconds += playingSince ? (performance.now() - playingSince) / 1000 : 0;
    playingSince = 0;
    setMode('paused');
    // Render the frozen frame and read it back in the same task (the drawing buffer is still valid).
    app.redraw();
    pause.show({ location: ROOM_104_CHECKPOINT.label, playSeconds: (saves.load()?.playSeconds ?? 0) + sessionSeconds, frame: canvas(), effects: settings.get().effects });
    pause.focus('resume');
  }

  function resume(): void {
    if (mode !== 'paused') return;
    const target = canvas();
    if (!target) return;
    pause.hint(null);
    try {
      const request = target.requestPointerLock() as unknown as Promise<void> | undefined;
      void request?.catch?.(() => pause.hint('The browser kept the mouse. Click Resume again to return to the ward.'));
    } catch {
      pause.hint('The browser kept the mouse. Click Resume again to return to the ward.');
    }
  }

  async function onMenu(action: MenuAction): Promise<void> {
    sound.unlock();
    if (action === 'new' || action === 'continue') await startSession(action);
    else if (action === 'settings') settingsPanel.open(() => menu.focus('settings'));
    else credits.open(() => menu.focus('credits'));
  }

  async function onPause(action: PauseAction): Promise<void> {
    if (action === 'resume') resume();
    else if (action === 'settings') settingsPanel.open(() => pause.focus('settings'));
    else if (action === 'restart') {
      if (await confirm.ask({ title: 'Restart this session?', body: 'You will wake in Room 104 again. Progress since then is lost.', confirm: 'Restart' })) {
        saveProgress();
        pause.hide();
        void app.restart().catch(() => undefined);
      } else pause.focus('restart');
    } else if (action === 'menu') {
      if (await confirm.ask({ title: 'Return to the main menu?', body: 'This session ends. Continue resumes from your checkpoint.', confirm: 'Leave the ward' })) {
        saveProgress();
        pause.hide();
        await app.endSession();
      } else pause.focus('menu');
    }
  }

  // ---- Input: pausing ---------------------------------------------------------------------------
  const onPointerLockChange = (): void => {
    if (mode === 'playing' && !pointerLocked()) doPause();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    if (settingsPanel.isOpen || credits.isOpen || confirm.isOpen) return; // they close themselves
    if (mode === 'playing' && !pointerLocked()) { event.preventDefault(); doPause(); }
    else if (mode === 'paused') { event.preventDefault(); resume(); }
  };
  const onBlur = (): void => { if (mode === 'playing') doPause(); };
  const onVisibility = (): void => { if (document.hidden && mode === 'playing') doPause(); };
  document.addEventListener('pointerlockchange', onPointerLockChange);
  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);

  // ---- Application lifecycle ------------------------------------------------------------------------
  function ensureDisplay(): void {
    if (display) return;
    const services = app.services();
    if (!services) return;
    display = attachDisplay(services.renderer, stage, settings.get().quality, () => { if (mode === 'paused') app.redraw(); });
  }

  return {
    get mode() { return mode; },
    get loadingHistory() { return history; },
    get stateHistory() { return states; },
    onProgress(progress) {
      if (progress.stage === 'engine' && progress.state === 'done') queueMicrotask(() => { ensureDisplay(); applySettings(settings.get()); });
      plan?.onProgress(progress);
    },
    onState(state) {
      if (disposed) return;
      states.push(state);
      if (state === 'restarting') {
        // Capture's Restart button or the pause menu: the same loading screen, with real stages.
        beginLoading('Waking again', false);
      } else if (state === 'ready') {
        ensureDisplay();
        if (mode !== 'loading') beginLoading('Ward 4 West', false);
        plan = null;
        setMode('ready');
        loading.ready(enterWard);
      } else if (state === 'playing') {
        loading.hide(); pause.hide();
        if (!sessionCounted) { saves.record(0, true); sessionCounted = true; }
        playingSince = performance.now();
        setMode('playing');
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      } else if (state === 'captured') {
        bankTime();
        pause.hide();
        setMode('captured');
      } else if (state === 'menu') {
        showTitle('continue');
      } else if (state === 'error') {
        setMode('error');
        loading.hide(); pause.hide(); menu.hide();
      }
    },
    onStatus(message, isError) {
      loading.status.textContent = message;
      if (isError) { errorScreen.show(message); setMode('error'); }
    },
    start() {
      applySettings(settings.get());
      // The very first gesture anywhere unlocks interface sound.
      const unlock = (): void => { sound.unlock(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
      window.addEventListener('pointerdown', unlock);
      window.addEventListener('keydown', unlock);
      if (options.autoStart) void startSession('new');
      else showTitle();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribePlan?.();
      unsubscribeSettings();
      motionQuery?.removeEventListener?.('change', onMotion);
      window.removeEventListener(SUBTITLE_EVENT, onSubtitle);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearTimeout(subtitleTimer);
      display?.dispose();
      for (const part of [menu, loading, pause, settingsPanel, credits, confirm]) part.dispose();
      errorScreen.root.remove(); subtitle.remove();
      sound.dispose();
      delete html.dataset.nwMode;
    },
  };
}
