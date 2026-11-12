/**
 * Byte-tracked preloading of the game's large binary assets (entity GLBs, the Room 104 set).
 *
 * The loading screen reports real progress: each file is fetched as a stream, and every chunk
 * advances the received-byte count against the size its build manifest records. The bytes are
 * retained as immutable source data for the application lifetime. New Game, Continue and Retry
 * all parse fresh scene instances from the same bytes; no live scene or pickup state is cached.
 * `takePreloaded` remains a one-shot compatibility ticket; `readAssetBytes` is retry-safe.
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
// Own source bytes, never live Three.js scenes/textures or mutable gameplay state.
// URLs are build-fingerprinted; every parse receives its own copy.
const retained = new Map<string, ArrayBuffer>();
const requests = new Map<string, Promise<void>>();
let generation = 0;

export function takePreloaded(url: string): ArrayBuffer | undefined {
  const buffer = cache.get(url);
  if (buffer) cache.delete(url);
  return buffer?.slice(0);
}

export function clearPreloaded(): void { generation++; cache.clear(); retained.clear(); requests.clear(); }
export function preloadedCount(): number { return cache.size; }
export function assetByteStats(): { entries: number; bytes: number } {
  return {entries:retained.size,bytes:[...retained.values()].reduce((sum,b)=>sum+b.byteLength,0)};
}

/** The same source for New Game, Continue, Retry and non-preloaded module hosts. */
export async function readAssetBytes(url: string): Promise<ArrayBuffer> {
  if (!retained.has(url)) {
    let request = requests.get(url);
    if (!request) {
      request = preloadOne({url,bytes:0,label:url},{signal:AbortSignal.timeout(20000)});
      requests.set(url,request);
    }
    try {await request;} finally {if(requests.get(url)===request)requests.delete(url);}
  }
  const bytes = retained.get(url);
  if (!bytes) throw new Error(`Asset bytes unavailable: ${url}`);
  cache.delete(url);
  return bytes.slice(0);
}

export interface PreloadOptions {
  readonly fetch?: typeof fetch;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: PreloadProgress) => void;
}

/** Fetch one entry, streaming. Resolves when stored; rejects on network/HTTP failure or abort. */
export async function preloadOne(entry: PreloadEntry, options: PreloadOptions = {}): Promise<void> {
  const existing = retained.get(entry.url);
  if(existing) {
    cache.set(entry.url,existing);
    options.onProgress?.({url:entry.url,received:existing.byteLength,total:existing.byteLength,done:true});
    return;
  }
  const started = generation;
  const store = (bytes:ArrayBuffer):void => {
    if (started!==generation) throw new Error('Asset session ended during download');
    cache.set(entry.url,bytes); retained.set(entry.url,bytes);
  };
  const doFetch = options.fetch ?? fetch;
  const response = await doFetch(entry.url, options.signal ? { signal: options.signal } : {});
  if (!response.ok) throw new Error(`${entry.label}: HTTP ${response.status}`);
  const header = Number(response.headers.get('content-length'));
  // A compressed transfer reports the encoded size: only trust the header when it is plausible.
  const total = Number.isFinite(header) && header > 0 && !response.headers.get('content-encoding') ? header : entry.bytes;
  const report = (received: number, done: boolean): void => options.onProgress?.({ url: entry.url, received, total: Math.max(total, received), done });
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    store(buffer);
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
  store(out.buffer);
  report(received, true);
}

/**
 * Preload every entry in parallel. Failures do not reject: they are reported per file (the
 * owning loader may retry retrieval; critical world assets reject setup if unavailable).
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
