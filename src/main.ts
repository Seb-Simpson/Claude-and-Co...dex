import './style.css';
import { discoverModules } from './integration';
import { createApplication } from './integration/application';

const container = document.querySelector<HTMLElement>('#app');
const status = document.querySelector<HTMLElement>('#status');
const audioButton = document.querySelector<HTMLButtonElement>('#enable-audio');
if (!container || !status || !audioButton) throw new Error('Missing NIGHT WARD application shell');
const application = createApplication({
  container, modules: discoverModules(),
  onStatus(message, isError) {
    status.textContent = message;
    if (isError) status.setAttribute('role', 'alert');
  },
});
// Test positioning/capture helpers are never installed in a normal play session.
if (new URLSearchParams(location.search).get('test') === '1') window.nightWardTest = application;
const onPageHide = (event: PageTransitionEvent): void => {
  if (!event.persisted) void application.dispose().catch(console.error);
};
window.addEventListener('pagehide', onPageHide);
if (import.meta.hot) import.meta.hot.dispose(() => {
  window.removeEventListener('pagehide', onPageHide);
  delete window.nightWardTest;
  void application.dispose().catch(console.error);
});
void application.start().catch(() => { /* Application reports and cleans up startup failures. */ });
