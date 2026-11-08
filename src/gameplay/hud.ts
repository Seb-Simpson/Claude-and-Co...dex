import type { InteractionPrompt } from './interactions';

export interface GameplayHud {
  update(state: { locked: boolean; captured: boolean; hidden: boolean; prompt: InteractionPrompt | null }): void;
  notify(message: string): void;
  dispose(): void;
}

/** Small DOM overlay; never captures movement input or covers the playfield during play. */
export function createGameplayHud(document: Document, onStart: () => void, onRestart?: () => void): GameplayHud {
  const root = document.createElement('div');
  root.dataset.nightWardHud = '';
  const style = document.createElement('style');
  style.textContent = `
    [data-night-ward-hud] { position:fixed; inset:0; z-index:5; pointer-events:none; font:15px/1.5 system-ui,sans-serif; color:#e8eded; }
    [data-night-ward-hud] .nw-pause { position:absolute; left:50%; top:44%; transform:translate(-50%,-50%); max-width:90vw; text-align:center; padding:1.3rem; background:#10191ce8; border:1px solid #70848c; border-radius:4px; }
    [data-night-ward-hud] .nw-capture { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:1rem; background:#020405f5; animation:nw-capture-in .7s ease both; }
    [data-night-ward-hud] .nw-capture[hidden] { display:none; }
    @keyframes nw-capture-in { from { opacity:0; } to { opacity:1; } }
    [data-night-ward-hud] .nw-pause[hidden] { display:none; }
    [data-night-ward-hud] button { pointer-events:auto; font:inherit; background:#25373c; color:inherit; border:1px solid #9fb5bb; padding:.6rem 1.3rem; cursor:pointer; }
    [data-night-ward-hud] .nw-hint { font-size:12px; margin:.8rem 0 0; color:#b8cacc; }
    [data-night-ward-hud] .nw-prompt { position:absolute; left:50%; bottom:7%; transform:translateX(-50%); max-width:85vw; text-align:center; text-shadow:0 2px 5px #000; background:#0d1519b8; border-radius:3px; padding:.25rem .6rem; }
    [data-night-ward-hud] .nw-prompt:empty { display:none; }
    [data-night-ward-hud] .nw-state { position:absolute; right:1.2rem; top:1rem; max-width:min(28rem,80vw); font-size:12px; text-shadow:0 2px 4px #000; }
    [data-night-ward-hud] .nw-reticle { position:absolute; left:50%; top:50%; width:3px; height:3px; background:#dce8e8b0; border-radius:50%; }
  `;
  const pause = document.createElement('div'); pause.className = 'nw-pause';
  const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Enter ward';
  const hint = document.createElement('p'); hint.className = 'nw-hint';
  hint.textContent = 'WASD move · Shift sprint · Ctrl / C crouch · E interact · Esc release mouse';
  pause.append(button, hint);
  const prompt = document.createElement('div'); prompt.className = 'nw-prompt';
  prompt.setAttribute('aria-live', 'polite');
  const state = document.createElement('div'); state.className = 'nw-state';
  const reticle = document.createElement('div'); reticle.className = 'nw-reticle';
  const capture = document.createElement('div'); capture.className = 'nw-capture'; capture.hidden = true;
  const captureTitle = document.createElement('h1'); captureTitle.textContent = 'You were found';
  const restart = document.createElement('button'); restart.type = 'button'; restart.textContent = 'Restart';
  capture.append(captureTitle, restart);
  root.append(style, pause, prompt, state, reticle, capture);
  const introduction = document.createElement('p'); introduction.className = 'nw-intro';
  introduction.textContent = 'Room 104 · Ward 4 West. Find a way out. Keep quiet.';
  pause.prepend(introduction);
  const retry = (): void => { if (onRestart) { restart.disabled = true; restart.textContent = 'Waking up…'; onRestart(); } };
  restart.hidden = !onRestart;
  restart.addEventListener('click', retry);
  const foundationOverlay = document.querySelector<HTMLElement>('#overlay');
  const overlayWasHidden = foundationOverlay?.hidden ?? false;
  if (foundationOverlay) foundationOverlay.hidden = true;
  document.body.append(root);
  button.addEventListener('click', onStart);
  let notification = '';
  let notificationUntil = 0;
  let disposed = false;
  return {
    update(value) {
      if (disposed) return;
      pause.hidden = value.locked || value.captured;
      capture.hidden = !value.captured;
      reticle.hidden = !value.locked || value.captured;
      if (performance.now() > notificationUntil) notification = '';
      state.textContent = value.captured ? '' : value.hidden ? 'Concealed' : notification;
      prompt.textContent = value.locked && !value.captured && value.prompt
        ? `E · ${value.prompt.text}${value.prompt.available ? '' : ` — ${value.prompt.reason ?? 'Unavailable'}`}` : '';
    },
    notify(message) { notification = message; notificationUntil = performance.now() + 8000; },
    dispose() {
      if (disposed) return;
      disposed = true;
      button.removeEventListener('click', onStart);
      restart.removeEventListener('click', retry);
      root.remove();
      if (foundationOverlay) foundationOverlay.hidden = overlayWasHidden;
    },
  };
}
