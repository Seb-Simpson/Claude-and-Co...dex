/**
 * Byte-tracked preloading of the game's large binary assets (entity GLBs, the Room 104 set).
 *
 * The loading screen reports real progress: each file is fetched as a stream, and every chunk
 * advances the received-byte count against the size its build manifest records. The bytes are
 * handed to the loaders in memory (`takePreloaded`), so nothing is downloaded twice. A loader
 * that finds nothing preloaded (tests, a failed preload, a later restart) fetches as before.
 */
export interface PreloadEntry {
  readonly url: string;
  /** Size from the build manifest: the denominator for progress before headers arrive. */
  readonly bytes: number;
  readonly label: string;
}

export interface PreloadProgress {
  readonly url: string;
  readonly received: number;
  readonly total: number;
  readonly done: boolean;
  readonly error?: string;
}

const cache = new Map<string, ArrayBuffer>();

export function takePreloaded(url: string): ArrayBuffer | undefined {
  const buffer = cache.get(url);
  if (buffer) cache.delete(url);
  return buffer;
}

export function clearPreloaded(): void { cache.clear(); }
export function preloadedCount(): number { return cache.size; }

export interface PreloadOptions {
  readonly fetch?: typeof fetch;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: PreloadProgress) => void;
}

/** Fetch one entry, streaming. Resolves when stored; rejects on network/HTTP failure or abort. */
export async function preloadOne(entry: PreloadEntry, options: PreloadOptions = {}): Promise<void> {
  const doFetch = options.fetch ?? fetch;
  const response = await doFetch(entry.url, options.signal ? { signal: options.signal } : {});
  if (!response.ok) throw new Error(`${entry.label}: HTTP ${response.status}`);
  const header = Number(response.headers.get('content-length'));
  // A compressed transfer reports the encoded size: only trust the header when it is plausible.
  const total = Number.isFinite(header) && header > 0 && !response.headers.get('content-encoding') ? header : entry.bytes;
  const report = (received: number, done: boolean): void => options.onProgress?.({ url: entry.url, received, total: Math.max(total, received), done });
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    cache.set(entry.url, buffer);
    report(buffer.byteLength, true);
    return;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  report(0, false);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    report(received, false);
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
  cache.set(entry.url, out.buffer);
  report(received, true);
}

/**
 * Preload every entry in parallel. Failures do not reject: they are reported per file (the
 * owning loader then falls back to its own fetch and, failing that, to procedural content).
 */
export async function preloadAll(entries: readonly PreloadEntry[], options: PreloadOptions = {}): Promise<{ failed: string[] }> {
  const failed: string[] = [];
  await Promise.all(entries.map(async (entry) => {
    try {
      await preloadOne(entry, options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push(entry.url);
      options.onProgress?.({ url: entry.url, received: 0, total: entry.bytes, done: true, error: message });
    }
  }));
  return { failed };
}
