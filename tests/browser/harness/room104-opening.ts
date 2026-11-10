import '../../../src/style.css';
import { createFrontend, type Frontend } from '../../../src/frontend/frontend';
import { createApplication } from '../../../src/integration/application';
import { createGameplayModule } from '../../../src/gameplay/runtime';
import { settings } from '../../../src/settings/settings';
import { openingFixtureModule } from '../../opening/fixture';

const stage = document.querySelector<HTMLElement>('#app');
const root = document.querySelector<HTMLElement>('#nw-frontend');
if (!stage || !root) throw new Error('Missing opening test shell');
const params = new URLSearchParams(location.search);
const modules = [openingFixtureModule, createGameplayModule()];
let frontend: Frontend | null = null;
const app = createApplication({
  container: stage, modules,
  onStatus: (message, isError) => frontend?.onStatus(message, isError),
  onState: state => frontend?.onState(state),
  onProgress: progress => frontend?.onProgress(progress),
});
frontend = createFrontend({ app, root, stage, settings,
  moduleIds: modules.map(module => module.id), autoStart: params.get('menu') !== '1',
  ...(params.has('menuSeed') ? { menuSeed: Number(params.get('menuSeed')) } : {}),
});
// QA capabilities stay scoped to an explicit test URL, as in the actual entry point.
if (params.get('test') === '1') {
  window.nightWardTest = app;
  (window as Window & { nightWardFrontend?: Frontend }).nightWardFrontend = frontend;
}
frontend.start();
const cleanup = (): void => {
  frontend?.dispose();
  delete window.nightWardTest;
  void app.dispose().catch(console.error);
};
const onPageHide = (event: PageTransitionEvent): void => { if (!event.persisted) cleanup(); };
window.addEventListener('pagehide', onPageHide);
if (import.meta.hot) import.meta.hot.dispose(() => { window.removeEventListener('pagehide', onPageHide); cleanup(); });
