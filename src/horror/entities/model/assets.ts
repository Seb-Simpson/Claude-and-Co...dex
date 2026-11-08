import manifest from '../assets/manifest.json';
import { type EntityModelManifest, loadModelLibrary, type ModelEntity, type ModelLibrary } from './library';

/** GLB files built by `src/horror/entities/pipeline` (Vite fingerprints and serves them). */
export const MODEL_URLS: Readonly<Record<ModelEntity, string>> = {
  patient: new URL('../assets/patient.glb', import.meta.url).href,
  nurse: new URL('../assets/nurse.glb', import.meta.url).href,
  crawler: new URL('../assets/crawler.glb', import.meta.url).href,
  watcher: new URL('../assets/watcher.glb', import.meta.url).href,
  reflection: new URL('../assets/reflection.glb', import.meta.url).href,
};

export const MODEL_MANIFESTS = manifest as unknown as Readonly<Record<ModelEntity, EntityModelManifest>>;

/** Development switch: `?nwEntities=procedural` keeps the old procedural figures. */
export function proceduralEntitiesRequested(): boolean {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).get('nwEntities') === 'procedural';
  } catch {
    return false;
  }
}

/** Load every entity model. Never throws: failures are reported per entity in `library.failures`. */
export async function loadEntityModels(): Promise<ModelLibrary> {
  try {
    return await loadModelLibrary({ urls: MODEL_URLS, manifests: MODEL_MANIFESTS });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { get: () => undefined, failures: { patient: reason, nurse: reason, crawler: reason, watcher: reason, reflection: reason }, dispose() {} };
  }
}
