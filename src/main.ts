import './style.css';
import { createEngine, createNeutralScene } from './engine';
import type { Engine } from './engine';
import { createEventBus, createModuleRegistry, discoverModules } from './integration';
import type { ModuleRegistry } from './integration';

const container = document.querySelector<HTMLElement>('#app');
const status = document.querySelector<HTMLElement>('#status');
const audioButton = document.querySelector<HTMLButtonElement>('#enable-audio');
if (!container || !status || !audioButton) throw new Error('Missing NIGHT WARD application shell');

const events = createEventBus();
let engine: Engine | null = null;
let registry: ModuleRegistry | null = null;
let fixture: ReturnType<typeof createNeutralScene> | null = null;
let disposed = false;
let disposal: Promise<void> | undefined;

function showError(error: unknown): void {
  console.error('NIGHT WARD:', error);
  status!.textContent = `Unable to run NIGHT WARD: ${error instanceof Error ? error.message : String(error)}`;
  status!.setAttribute('role', 'alert');
  audioButton!.disabled = true;
  void shutdown().catch((cleanupError: unknown) => console.error('Cleanup failed:', cleanupError));
}

async function enableAudio(): Promise<void> {
  if (!engine || disposed) return;
  audioButton!.disabled = true;
  try {
    await engine.services.audio.resume();
    if (!disposed) audioButton!.textContent = 'Audio enabled';
  } catch (error) {
    console.error('Audio unlock failed:', error);
    if (!disposed) {
      audioButton!.disabled = false;
      audioButton!.textContent = 'Retry audio';
      status!.textContent = 'Audio could not start. Check browser audio permissions and retry.';
    }
  }
}

function shutdown(): Promise<void> {
  if (disposal) return disposal;
  disposed = true;
  engine?.stop();
  audioButton!.disabled = true;
  audioButton!.removeEventListener('click', enableAudio);
  window.removeEventListener('pagehide', onPageHide);
  disposal = (async () => {
    try {
      await registry?.dispose();
    } finally {
      try {
        fixture?.dispose();
        events.dispose();
      } finally {
        await engine?.dispose();
      }
    }
  })();
  return disposal;
}

function onPageHide(event: PageTransitionEvent): void {
  // A bfcache entry must remain live; visibilitychange already pauses its clock.
  if (!event.persisted) void shutdown().catch(console.error);
}
window.addEventListener('pagehide', onPageHide);
if (import.meta.hot) import.meta.hot.dispose(() => { void shutdown().catch(console.error); });

async function boot(): Promise<void> {
  const created = await createEngine({ container: container!, onError: showError });
  if (disposed) {
    await created.dispose();
    return;
  }
  engine = created;
  registry = createModuleRegistry(engine.services, events);
  const modules = discoverModules();
  for (const module of modules) registry.register(module);
  await registry.start();
  if (disposed) return;
  if (!registry.world) fixture = createNeutralScene(engine.services);
  engine.start({
    fixedUpdate: (frame) => registry!.fixedUpdate(frame),
    update: (frame) => registry!.update(frame),
  });
  status!.textContent = registry.world
    ? `${modules.length} modules ready. World: ${registry.world.id}.`
    : 'Renderer and Rapier ready. Neutral test scene · no game modules installed.';
  audioButton!.disabled = false;
  audioButton!.addEventListener('click', enableAudio);
}

void boot().catch(showError);
