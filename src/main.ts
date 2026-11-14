import './style.css';
import { createFrontend, type Frontend } from './frontend/frontend';
import { discoverModules } from './integration';
import { createApplication } from './integration/application';
import { settings } from './settings/settings';
import { createGreyboxModule, createGreyboxProgress, greyboxInspectionText, type GreyboxApi } from './world/greybox/greyboxModule';

const container = document.querySelector<HTMLElement>('#app');
const uiRoot = document.querySelector<HTMLElement>('#nw-frontend');
if (!container || !uiRoot) throw new Error('Missing NIGHT WARD application shell');

const params = new URLSearchParams(location.search);
const testMode = params.get('test') === '1';
// NW-R02: `?level=greybox` runs the Chapter 1 architectural greybox (world + gameplay modules only;
// no atmosphere, horror or entities). The default game is unchanged.
const greybox = params.get('level') === 'greybox';
const progress = createGreyboxProgress();
const discovered = discoverModules();
const modules = greybox
  ? [createGreyboxModule({
    progress,
    teleport: (position, yaw) => application.teleport(position, yaw),
    onReady: (api) => { if (testMode) (window as Window & { nightWardGreybox?: GreyboxApi }).nightWardGreybox = api; },
  }), ...discovered.filter((module) => module.kind === 'gameplay')]
  : discovered;
// One application (one engine, one loop); the frontend drives its lifecycle and never boots its own.
let frontend: Frontend | null = null;
const application = createApplication({
  container, modules,
  ...(greybox ? { gameplayOptions: { activeEntityTypes: [], hasRequirement: (id: string) => progress.has(id), inspectionText: greyboxInspectionText } } : {}),
  onStatus: (message, isError) => frontend?.onStatus(message, isError),
  onState: (state) => frontend?.onState(state),
  onProgress: (progress) => frontend?.onProgress(progress),
});
frontend = createFrontend({
  app: application, root: uiRoot, stage: container, settings,
  moduleIds: modules.map((module) => module.id),
  // QA bridge: start a session straight away unless the test asks for the title screen (&menu=1).
  autoStart: testMode && params.get('menu') !== '1',
  // QA bridge: a fixed seed makes the title screen's lighting events reproducible.
  ...(testMode && params.has('menuSeed') ? { menuSeed: Number(params.get('menuSeed')) } : {}),
});
// Test positioning/capture helpers are never installed in a normal play session.
if (testMode) {
  window.nightWardTest = application;
  (window as Window & { nightWardFrontend?: Frontend }).nightWardFrontend = frontend;
}
frontend.start();

const onPageHide = (event: PageTransitionEvent): void => {
  if (!event.persisted) { frontend?.dispose(); void application.dispose().catch(console.error); }
};
window.addEventListener('pagehide', onPageHide);
if (import.meta.hot) import.meta.hot.dispose(() => {
  window.removeEventListener('pagehide', onPageHide);
  delete window.nightWardTest;
  frontend?.dispose();
  void application.dispose().catch(console.error);
});
