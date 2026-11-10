import type { ApplicationProgress } from '../../integration/application';
import { type PreloadEntry, preloadAll } from '../../assets/preload';
import { entityModelPreloads } from '../../horror/entities/model/assets';
import { room104Preloads } from '../../world/dressing/room104';
import { stationPreloads } from '../../world/dressing/station';
import { LoadingTracker } from './tracker';

/**
 * What a new session actually has to do, with weights reflecting where the time goes on a
 * typical connection: downloads dominate, then world construction, then shader compilation.
 */
const MODULE_LABELS: Readonly<Record<string, string>> = {
  'nw:world:hospital': 'Building Ward 4 West',
  'night-ward:gameplay': 'Physics, player and navigation',
  'nw:atmosphere:hospital': 'Lighting and ambience',
  'nw:horror:hospital-anomalies': 'Entities and presentation',
};

export interface LoadingPlan {
  readonly tracker: LoadingTracker;
  readonly downloads: readonly PreloadEntry[];
  /** Stream the large assets; resolves when every file is stored or has failed. */
  download(signal?: AbortSignal): Promise<{ failed: string[] }>;
  /** Feed the application's progress events into the tracker. */
  onProgress(progress: ApplicationProgress): void;
}

export function createLoadingPlan(moduleIds: readonly string[], options: { includeEngine: boolean; downloads?: readonly PreloadEntry[] }): LoadingPlan {
  const tracker = new LoadingTracker();
  const downloads = options.downloads ?? [...room104Preloads(), ...stationPreloads(), ...entityModelPreloads()];
  const totalBytes = downloads.reduce((s, d) => s + d.bytes, 0);
  // Downloads: 55% of the bar, split by size, so each byte counts the same.
  for (const d of downloads) tracker.addBytes(`file:${d.url}`, d.label, 55 * (d.bytes / Math.max(1, totalBytes)), d.bytes);
  if (options.includeEngine) tracker.addStep('engine:renderer', 'Renderer and physics engine', 8);
  const moduleWeight = 30 / Math.max(1, moduleIds.length);
  for (const id of moduleIds) tracker.addStep(`module:${id}`, MODULE_LABELS[id] ?? `Module ${id}`, moduleWeight);
  tracker.addStep('shaders:scene', 'Compiling shaders', 7);
  return {
    tracker,
    downloads,
    download(signal) {
      return preloadAll(downloads, {
        ...(signal ? { signal } : {}),
        onProgress: (p) => {
          if (p.error) tracker.fail(`file:${p.url}`, p.error);
          else tracker.bytes(`file:${p.url}`, p.received, p.total, p.done);
        },
      });
    },
    onProgress(p) {
      const id = `${p.stage}:${p.id}`;
      if (!tracker.has(id)) return;
      if (p.state === 'begin') tracker.begin(id);
      else if (p.state === 'done') tracker.finish(id);
      else tracker.fail(id);
    },
  };
}
