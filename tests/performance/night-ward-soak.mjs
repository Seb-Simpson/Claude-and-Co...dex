import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('../../', import.meta.url));
const options = Object.fromEntries(process.argv.slice(2).map(arg => {
  const [key, ...value] = arg.replace(/^--/, '').split('=');
  return [key, value.join('=') || true];
}));
const output = resolve(root, typeof options.output === 'string' ? options.output : '.playwright/soak-latest');
const minWallSeconds = Math.max(300, Number(options.seconds ?? 300));
const minSimulationSeconds = Math.max(120, Number(options.simulation ?? 120));
const maxWallSeconds = Number(options.timeout ?? 2400);
const width = Number(options.width ?? 320);
const height = Number(options.height ?? 180);
const url = new URL(typeof options.url === 'string' ? options.url : 'http://127.0.0.1:4181/');
url.searchParams.set('test', '1');
await mkdir(output, { recursive: true });
let server;
let browser;
let page;
let cdp;
const errors = [];
const observations = [];
const captures = [];
const assetResponses = [];
const bootMessages = [];
const sleep = ms => new Promise(done => setTimeout(done, ms));
const save = async (name, value) => writeFile(join(output, name), JSON.stringify(value, null, 2));
const startedAt = Date.now();
const report = { url: String(url), startedAt: new Date().toISOString(), width, height, minWallSeconds, minSimulationSeconds, softwareWebGL: true, observations, errors, captures, assetResponses, bootMessages };
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] ?? 0;
function aggregateCpu(profile) {
  const nodes = new Map(profile.nodes.map(node => [node.id, node]));
  const totals = new Map();
  (profile.samples ?? []).forEach((id, index) => {
    const node = nodes.get(id);
    const name = `${node?.callFrame.functionName || '(anonymous)'} @ ${node?.callFrame.url || 'native'}:${node?.callFrame.lineNumber ?? 0}`;
    totals.set(name, (totals.get(name) ?? 0) + (profile.timeDeltas?.[index] ?? 0));
  });
  return [...totals].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([functionName, microseconds]) => ({ functionName, milliseconds: microseconds / 1000 }));
}
function validateSoak(data) {
  const early = data.observations.find(item => item.label === 'early-identical-pose');
  const earlyEnd = data.observations.find(item => item.label === 'early-window-end');
  const late = data.observations.find(item => item.label === 'late-identical-pose');
  const lateEnd = data.observations.find(item => item.label === 'late-window-end');
  const failures = []; const limitations = [];
  const check = (condition, message) => { if (!condition) failures.push(message); };
  if (!early || !earlyEnd || !late || !lateEnd || !data.afterDispose || !data.afterRestart) return { failures: ['Incomplete soak observations'], limitations };
  if (data.assetResponses) {
    const query = new URL(data.url).searchParams;
    const loaded = data.assetResponses.filter(asset => asset.status === 200).map(asset => asset.filename);
    if (query.get('nwEntities') !== 'procedural') {
      for (const entity of ['patient', 'nurse', 'crawler', 'watcher', 'reflection']) {
        check(loaded.some(name => new RegExp(`^${entity}(?:-[\\w-]+)?\\.glb$`).test(name)), `${entity} production GLB did not load`);
      }
      check(data.bootMessages.some(message => /Blender entity models loaded \(5\/5\)/.test(message.text)), 'Complete entity-model load was not announced');
    }
    if (query.get('nwSet') !== 'procedural') {
      check(loaded.some(name => /^room104_set(?:-[\w-]+)?\.glb$/.test(name)), 'Production Room 104 set did not load');
      check(loaded.some(name => /^room104_lightmap(?:-[\w-]+)?\.jpg$/.test(name)), 'Production Room 104 light map did not load');
      check(data.bootMessages.some(message => /Room 104 visual set loaded/.test(message.text)), 'Room 104 visual-set load was not announced');
    }
  } else limitations.push('Historical recording predates production asset-response auditing.');
  const fps = (start, end) => (end.page.frames - start.page.frames) * 1000 / (end.page.elapsedMs - start.page.elapsedMs);
  const earlyFps = fps(early, earlyEnd); const lateFps = fps(late, lateEnd);
  check(late.wallSeconds - earlyEnd.wallSeconds >= data.minWallSeconds, 'Measured soak was shorter than required wall time');
  check(late.app.performance.simulatedSeconds >= data.minSimulationSeconds, 'Simulation did not reach required time');
  check(late.app.doorStates['nw:door:maintenance-east'] === 'open', 'Patient did not operate the east maintenance door');
  check(!early.page.suppressDraws && !late.page.suppressDraws && !lateEnd.page.suppressDraws, 'Draw suppression was active during the real soak');
  check(data.observations.filter(item => item.label === 'soak').every(item => item.app.state === 'playing'), 'Simulation stopped during soak');
  check(lateFps >= earlyFps * .6, `Frame rate collapsed: ${earlyFps.toFixed(2)} → ${lateFps.toFixed(2)} FPS`);
  if (earlyFps >= 5) check(lateFps >= 5, 'Late FPS fell below5');
  check(late.app.colliderCount === early.app.colliderCount, 'Collider count grew');
  check(late.app.renderer.geometries <= early.app.renderer.geometries + 24, 'Geometry count grew beyond finite warmup allowance');
  check(late.app.renderer.textures <= early.app.renderer.textures + 12, 'Texture count grew beyond finite warmup allowance');
  check(late.page.audio.activeSources <= early.page.audio.activeSources + 32, 'Active sources accumulated');
  if (late.nativeAudio.available) check(late.nativeAudio.nodes <= early.nativeAudio.nodes + 96, 'Post-GC native audio nodes accumulated');
  else if (early.metrics.AudioHandlers !== undefined) check(late.metrics.AudioHandlers <= early.metrics.AudioHandlers + 96, 'Post-GC audio handlers accumulated');
  // Compare explicitly post-GC samples, not temporary allocations during CPU sampling.
  check(late.metrics.JSHeapUsedSize <= early.metrics.JSHeapUsedSize * 1.5 + 8 * 1048576, 'Retained heap grew beyond50% plus8MiB');
  check(data.errors.length === 0, `Browser errors: ${data.errors.join('; ')}`);
  check(data.afterRestart.app.state === 'playing' && data.afterRestart.app.sessionId === early.app.sessionId + 1, 'Restart did not create one new playing session');
  check(data.afterRestart.app.colliderCount === early.app.colliderCount, 'Restart collider count changed');
  check(data.afterRestart.nativeAudio.contexts === 1 && data.afterRestart.app.audioState === 'running', 'Restart did not reuse one running AudioContext');
  check(data.afterDispose.app.state === 'disposed' && data.afterDispose.app.colliderCount === 0 && data.afterDispose.canvases === 0, 'Backend/canvas disposal incomplete');
  if (data.afterDispose.huds !== undefined) check(data.afterDispose.huds === 0, 'HUD remained after disposal');
  else limitations.push('Initial recorded run did not count HUDs; full browser lifecycle tests cover HUD cleanup separately.');
  check(data.afterDispose.audit.contexts.length > 0 && data.afterDispose.audit.contexts.every(context => context.state === 'closed'), 'AudioContext was not closed after disposal');
  if (data.afterDispose.nativeAudio?.contextStates) check(data.afterDispose.nativeAudio.contextStates.every(state => state === 'closed'), 'CDP AudioContext was not closed');
  else limitations.push('Initial run recorded native AudioContext.state via statechange, but did not record CDP contextChanged states.');
  return { failures, limitations, earlyFps, lateFps, ratio: lateFps / earlyFps, postGcEarlyHeapMb: early.metrics.JSHeapUsedSize / 1048576, postGcLateHeapMb: late.metrics.JSHeapUsedSize / 1048576,
    postGcEarlyAudioNodes: early.nativeAudio.nodes, postGcLateAudioNodes: late.nativeAudio.nodes };
}
if (typeof options.analyze === 'string') {
  const source = resolve(root, options.analyze);
  const bytes = await readFile(source);
  const data = JSON.parse((source.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8'));
  const validation = validateSoak(data);
  const analysis = { source, assertionReplay: true, originalRunFailures: data.failures ?? [], runtimeRerun: false, ...validation };
  await save('corrected-assertions.json', analysis); console.log(JSON.stringify(analysis, null, 2));
  assert.deepEqual(validation.failures, []); process.exit(0);
}
try {
  if (!options.url) {
    await access(join(root, 'dist/index.html'));
    server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '4181', '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let serverLog = '';
    server.stdout.on('data', chunk => { serverLog += chunk; });
    server.stderr.on('data', chunk => { serverLog += chunk; });
    const deadline = Date.now() + 30_000;
    while (true) {
      try { if ((await fetch(url)).ok) break; } catch { /* Server is booting. */ }
      if (Date.now() > deadline || server.exitCode !== null) throw new Error(`Preview startup failed: ${serverLog}`);
      await sleep(200);
    }
  }
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'] });
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addInitScript(() => {
    const metric = { frames: 0, elapsedMs: 0, maxIntervalMs: 0, over50: 0, over100: 0, over1000: 0, intervals: [], suppressDraws: false,
      audio: { created: {}, connects: 0, disconnects: 0, started: 0, stopped: 0, ended: 0, contexts: [], connected: 0, activeSources: 0 } };
    let previous;
    function frame(now) {
      if (previous !== undefined && document.visibilityState === 'visible') {
        const interval = now - previous;
        metric.frames += 1; metric.elapsedMs += interval; metric.maxIntervalMs = Math.max(metric.maxIntervalMs, interval);
        metric.over50 += Number(interval > 50); metric.over100 += Number(interval > 100); metric.over1000 += Number(interval > 1000);
        metric.intervals.push(interval); if (metric.intervals.length > 600) metric.intervals.shift();
      }
      previous = now; requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    new PerformanceObserver(list => {
      metric.longTasks ??= { count: 0, totalMs: 0, maxMs: 0 };
      for (const entry of list.getEntries()) { metric.longTasks.count++; metric.longTasks.totalMs += entry.duration; metric.longTasks.maxMs = Math.max(metric.longTasks.maxMs, entry.duration); }
    }).observe({ type: 'longtask', buffered: true });
    const nodes = new WeakMap();
    const contexts = new WeakMap();
    function contextData(context) {
      let value = contexts.get(context);
      if (!value) {
        value = { id: metric.audio.contexts.length, state: context.state };
        contexts.set(context, value); metric.audio.contexts.push(value);
        context.addEventListener('statechange', () => { value.state = context.state; });
      }
      return value;
    }
    function nodeData(node, kind = node.constructor.name) {
      let value = nodes.get(node);
      if (!value) {
        value = { kind, connected: false, source: false, ended: false };
        nodes.set(node, value); contextData(node.context);
      }
      return value;
    }
    for (const name of ['createOscillator', 'createBufferSource', 'createGain', 'createBiquadFilter', 'createPanner', 'createStereoPanner', 'createWaveShaper', 'createDelay', 'createAnalyser', 'createDynamicsCompressor']) {
      const proto = BaseAudioContext.prototype;
      const original = proto[name];
      if (!original) continue;
      proto[name] = function(...args) {
        const node = original.apply(this, args); nodeData(node, name);
        metric.audio.created[name] = (metric.audio.created[name] ?? 0) + 1;
        return node;
      };
    }
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function(...args) {
      const value = nodeData(this); metric.audio.connects++;
      if (!value.connected) { value.connected = true; metric.audio.connected++; }
      return connect.apply(this, args);
    };
    const disconnect = AudioNode.prototype.disconnect;
    AudioNode.prototype.disconnect = function(...args) {
      const result = disconnect.apply(this, args); const value = nodeData(this); metric.audio.disconnects++;
      if (value.connected && args.length === 0) { value.connected = false; metric.audio.connected--; }
      return result;
    };
    const installed = new Set();
    for (const constructor of [OscillatorNode, AudioBufferSourceNode]) {
      for (const name of ['start', 'stop']) {
        let proto = constructor.prototype;
        while (proto && !Object.hasOwn(proto, name)) proto = Object.getPrototypeOf(proto);
        if (!proto || installed.has(proto[name])) continue;
        const original = proto[name];
        const wrapper = function(...args) {
          const result = original.apply(this, args); const value = nodeData(this);
          if (name === 'start') {
            metric.audio.started++;
            if (!value.source) {
              value.source = true; metric.audio.activeSources++;
              this.addEventListener('ended', () => { if (!value.ended) { value.ended = true; metric.audio.ended++; metric.audio.activeSources--; } }, { once: true });
            }
          } else metric.audio.stopped++;
          return result;
        };
        proto[name] = wrapper; installed.add(wrapper);
      }
    }
    for (const constructor of [WebGLRenderingContext, WebGL2RenderingContext]) {
      for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
        const original = constructor.prototype[name];
        if (!original) continue;
        constructor.prototype[name] = function(...args) { if (!metric.suppressDraws) return original.apply(this, args); };
      }
    }
    window.__nwSoak = metric;
  });
  page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
    if (message.text().startsWith('NIGHT WARD:')) bootMessages.push({ type: message.type(), text: message.text() });
  });
  page.on('response', response => {
    const assetUrl = new URL(response.url());
    if (/\.glb$|room104_lightmap(?:-[\w-]+)?\.jpg$/.test(assetUrl.pathname)) {
      assetResponses.push({ url: response.url(), filename: assetUrl.pathname.split('/').pop(), status: response.status() });
    }
  });
  cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 2000 });
  const audioNodes = new Map(); const audioContexts = new Map(); let nativeAudioAvailable = true;
  let nativeAudioCreated = 0; let nativeAudioDestroyed = 0;
  cdp.on('WebAudio.audioNodeCreated', ({ node }) => { audioNodes.set(node.nodeId, { contextId: node.contextId, type: node.nodeType }); nativeAudioCreated++; });
  cdp.on('WebAudio.audioNodeWillBeDestroyed', ({ nodeId }) => { audioNodes.delete(nodeId); nativeAudioDestroyed++; });
  cdp.on('WebAudio.contextCreated', ({ context }) => audioContexts.set(context.contextId, context.contextState));
  cdp.on('WebAudio.contextChanged', ({ context }) => audioContexts.set(context.contextId, context.contextState));
  cdp.on('WebAudio.contextWillBeDestroyed', ({ contextId }) => { audioContexts.delete(contextId); for (const [id, node] of audioNodes) if (node.contextId === contextId) audioNodes.delete(id); });
  try { await cdp.send('WebAudio.enable'); } catch { nativeAudioAvailable = false; }
  await page.goto(String(url));
  await page.waitForFunction(() => window.nightWardTest?.snapshot().state === 'ready', null, { timeout: 120_000 });
  report.browserVersion = browser.version();
  report.applicationScripts = await page.evaluate(() => [...document.scripts].map(script => script.src).filter(Boolean));
  const browserCdp = await browser.newBrowserCDPSession();
  async function observe(label) {
    const [value, perf, processes] = await Promise.all([
      page.evaluate(() => ({ app: window.nightWardTest.snapshot(), page: { ...window.__nwSoak, audio: structuredClone(window.__nwSoak.audio), intervals: [...window.__nwSoak.intervals] } })),
      cdp.send('Performance.getMetrics'), browserCdp.send('SystemInfo.getProcessInfo'),
    ]);
    const metrics = Object.fromEntries(perf.metrics.map(item => [item.name, item.value]));
    const processMemory = await Promise.all(processes.processInfo.map(async item => {
      try { const status = await readFile(`/proc/${item.id}/status`, 'utf8'); return { ...item, rssKb: Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] ?? 0) }; }
      catch { return item; }
    }));
    const nativeAudio = { available: nativeAudioAvailable, nodes: audioNodes.size, contexts: audioContexts.size, created: nativeAudioCreated, destroyed: nativeAudioDestroyed, contextStates: [...audioContexts.values()] };
    const sample = { nativeAudio, label, wallSeconds: (Date.now() - startedAt) / 1000, ...value, metrics, processes: processMemory };
    observations.push(sample); await save('observations.json', report);
    console.log(JSON.stringify({ label, wall: Math.round(sample.wallSeconds), sim: value.app.performance.simulatedSeconds, frames: value.app.frameCount,
      fps: value.page.elapsedMs ? Number((value.page.frames * 1000 / value.page.elapsedMs).toFixed(2)) : 0, heapMb: Number((metrics.JSHeapUsedSize / 1048576).toFixed(1)),
      calls: value.app.renderer.calls, colliders: value.app.colliderCount, audioActive: value.page.audio.activeSources, audioConnectionBalance: value.page.audio.connected, nativeAudioNodes: nativeAudio.nodes, nativeAudioHandlers: metrics.AudioHandlers,
      patient: value.app.entities[0]?.position, eastDoor: value.app.doorStates['nw:door:maintenance-east'] }));
    return sample;
  }
  async function snapshot() { return page.evaluate(() => window.nightWardTest.snapshot()); }
  async function aim(target) { await page.evaluate(point => window.nightWardTest.aimAt(point), target); }
  async function moveUntil(key, condition, timeout = 60_000) {
    await page.keyboard.down(key);
    const deadline = Date.now() + timeout;
    try { while (!condition(await snapshot())) { if (Date.now() > deadline) throw new Error(`Actual movement stalled (${key})`); await sleep(100); } }
    finally { await page.keyboard.up(key); }
  }
  if (!options['diagnostic-only']) {
  // Prewarm the actual Patient's model while simulation is still waiting for user entry.
  assert(await page.evaluate(() => { const valid = window.nightWardTest.teleport({ x: -1, y: 0.01, z: 7.2 }); window.nightWardTest.aimAt({ x: 6, y: 1.35, z: 7.2 }); return valid; }));
  await page.screenshot({ path: join(output, 'patient-current-model.png') });
  const originalEastState = (await snapshot()).doorStates['nw:door:maintenance-east'];
  // Current authored doors start open. Close this one through real input so the
  // long run exercises The Patient's door-query regression rather than skipping it.
  const start = originalEastState === 'open' ? { x: 19.55, y: 0.01, z: 7.45 } : { x: -12.4, y: 0.01, z: 4.1 };
  assert(await page.evaluate(point => window.nightWardTest.teleport(point, 0), start));
  await page.getByRole('button', { name: 'Enter ward', exact: true }).click();
  await page.waitForFunction(() => document.pointerLockElement?.tagName === 'CANVAS' && window.nightWardTest.snapshot().audioState === 'running');
  if (originalEastState === 'open') {
    await aim({ x: 18.75, y: 1.2, z: 6.7 });
    await page.waitForFunction(() => window.nightWardTest.snapshot().prompt?.action === 'close');
    await page.keyboard.press('e');
    await page.waitForFunction(() => window.nightWardTest.snapshot().doorStates['nw:door:maintenance-east'] === 'closed', null, { timeout: 60_000 });
    assert(await page.evaluate(() => window.nightWardTest.teleport({ x: -12.4, y: 0.01, z: 4.1 }, 0)));
  }
  report.eastDoorScenario = { originalState: originalEastState, closedByPlayer: originalEastState === 'open' };
  // A genuinely walked route; positioning above was initial scenario setup only.
  await moveUntil('d', state => state.player.position.x > -12.2);
  await aim({ x: -12, y: 1.65, z: 0 });
  await moveUntil('w', state => state.player.position.z < 0.3);
  await aim({ x: -12, y: 1.2, z: -1.475 });
  await moveUntil('w', state => state.player.position.z < -0.75);
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.nightWardTest.snapshot().doorStates['nw:door:room-103'] === 'open', null, { timeout: 60_000 });
  await aim({ x: -12, y: 1.65, z: -4 });
  await moveUntil('w', state => state.player.position.z < -2.6);
  await page.screenshot({ path: join(output, 'walked-room-103.png') });
  report.walkedRoute = { completed: true, player: (await snapshot()).player };
  } else {
    await page.getByRole('button', { name: 'Enter ward', exact: true }).click();
    await page.waitForFunction(() => document.pointerLockElement?.tagName === 'CANVAS' && window.nightWardTest.snapshot().audioState === 'running');
  }
  // Identical measurement pose isolates aging from frustum/scene changes.
  const pose = { x: -12.4, y: 0.01, z: 4.1 };
  assert(await page.evaluate(point => window.nightWardTest.teleport(point, 0), pose));
  // Close the room's open leaf through the real interaction, then keep quiet.
  await aim({ x: -11.45, y: 1.2, z: 2.45 });
  await page.waitForFunction(() => window.nightWardTest.snapshot().prompt?.action === 'close');
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.nightWardTest.snapshot().doorStates['nw:door:room-104'] === 'closed', null, { timeout: 60_000 });
  await aim({ x: pose.x, y: 1.65, z: 0 });
  await sleep(5000);
  assert.equal((await snapshot()).state, 'playing');
  assert.equal(typeof (await snapshot()).performance.simulatedSeconds, 'number', 'Build must include raw timing/simulation profiling diagnostics');
  await cdp.send('HeapProfiler.collectGarbage');
  const early = await observe('early-identical-pose');
  await cdp.send('Profiler.start');
  await sleep(15_000);
  const earlyProfile = (await cdp.send('Profiler.stop')).profile;
  await save('early.cpuprofile', earlyProfile); report.earlyCpuTop = aggregateCpu(earlyProfile);
  const earlyEnd = await observe('early-window-end');
  if (options['diagnostic-only']) {
    await page.evaluate(() => { window.__nwSoak.suppressDraws = true; });
    const noDrawStart = await observe('diagnostic-no-draw-start'); await sleep(10_000);
    const noDrawEnd = await observe('diagnostic-no-draw-end');
    const fps = (a, b) => (b.page.frames - a.page.frames) * 1000 / (b.page.elapsedMs - a.page.elapsedMs);
    report.comparison = { earlyFps: fps(early, earlyEnd), noDrawFps: fps(noDrawStart, noDrawEnd), diagnosticOnly: true };
    await save('report.json', report); console.log(JSON.stringify(report.comparison));
  } else {
  const baselineStart = Date.now();
  let eastDoorOpened = early.app.doorStates['nw:door:maintenance-east'] === 'open';
  let lateStart;
  while (true) {
    await sleep(10_000);
    const current = await observe('soak');
    assert.equal(current.app.state, 'playing', 'The soak must keep the actual gameplay simulation running');
    eastDoorOpened ||= current.app.doorStates['nw:door:maintenance-east'] === 'open';
    if ((Date.now() - baselineStart) / 1000 >= minWallSeconds && current.app.performance.simulatedSeconds >= minSimulationSeconds && eastDoorOpened) {
      lateStart = current; break;
    }
    if ((Date.now() - baselineStart) / 1000 > maxWallSeconds) throw new Error(`Soak timed out before ${minSimulationSeconds}s simulation/east-door visit`);
  }
  assert(await page.evaluate(point => window.nightWardTest.teleport(point, 0), pose));
  await aim({ x: pose.x, y: 1.65, z: 0 });
  await cdp.send('HeapProfiler.collectGarbage');
  await sleep(3000);
  lateStart = await observe('late-identical-pose');
  await cdp.send('Profiler.start');
  await sleep(15_000);
  const lateProfile = (await cdp.send('Profiler.stop')).profile;
  await save('late.cpuprofile', lateProfile); report.lateCpuTop = aggregateCpu(lateProfile);
  const late = await observe('late-window-end');
  await page.screenshot({ path: join(output, 'late-identical-pose.png') });
  const fps = (a, b) => (b.page.frames - a.page.frames) * 1000 / (b.page.elapsedMs - a.page.elapsedMs);
  const earlyFps = fps(early, earlyEnd); const lateFps = fps(lateStart, late);
  report.comparison = { earlyFps, lateFps, ratio: lateFps / earlyFps, absolutePlayableBaseline: earlyFps >= 5,
    earlyHeapMb: early.metrics.JSHeapUsedSize / 1048576, lateHeapMb: lateStart.metrics.JSHeapUsedSize / 1048576,
    lateIntervalP95Ms: percentile(late.page.intervals, .95), eastDoorOpened };
  // Diagnostic-only draw suppression distinguishes GPU/raster limits after the real soak.
  await page.evaluate(() => { window.__nwSoak.suppressDraws = true; });
  const noDrawStart = await observe('diagnostic-no-draw-start'); await sleep(10_000);
  const noDrawEnd = await observe('diagnostic-no-draw-end');
  report.noDrawFps = fps(noDrawStart, noDrawEnd);
  await page.evaluate(() => { window.__nwSoak.suppressDraws = false; });
  // Check complete lifecycle cleanup after the long-lived audio/presentation session.
  await page.evaluate(() => window.nightWardTest.captureForTest());
  await page.getByRole('button', { name: /restart/i }).click();
  await page.waitForFunction(() => window.nightWardTest.snapshot().state === 'ready', null, { timeout: 120_000 });
  await page.getByRole('button', { name: 'Enter ward', exact: true }).click();
  await sleep(5000); report.afterRestart = await observe('after-restart');
  await page.evaluate(() => window.nightWardTest.dispose());
  await sleep(1000);
  report.afterDispose = await page.evaluate(() => ({ app: window.nightWardTest.snapshot(), audit: window.__nwSoak.audio, canvases: document.querySelectorAll('canvas').length, huds: document.querySelectorAll('[data-night-ward-hud]').length }));
  report.afterDispose.nativeAudio = { contextStates: [...audioContexts.values()], nodes: audioNodes.size };
  report.endedAt = new Date().toISOString(); report.durationSeconds = (Date.now() - startedAt) / 1000;
  report.validation = validateSoak(report); report.failures = report.validation.failures;
  await save('report.json', report);
  console.log(JSON.stringify({ result: report.failures.length ? 'FAILED' : 'PASSED', output, comparison: report.comparison, noDrawFps: report.noDrawFps, failures: report.failures }));
  assert.deepEqual(report.failures, []);
  }
} catch (error) {
  report.fatal = error.stack || String(error); report.endedAt = new Date().toISOString();
  if (page && !page.isClosed()) {
    try { report.failureState = await page.evaluate(() => ({ app: window.nightWardTest?.snapshot(), audit: window.__nwSoak })); await page.screenshot({ path: join(output, 'failure.png') }); } catch { /* Preserve earlier samples if browser crashed. */ }
  }
  await save('report.json', report); console.error(error); process.exitCode = 1;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) server.kill('SIGTERM');
}
