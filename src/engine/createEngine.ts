import { PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three';
import type { EngineServices, FrameContext } from '../contracts';
import { createAudioService } from './audio';
import { FrameClock } from './timing';
import { FrameProfiler } from './performance';
import type { EnginePerformanceSnapshot } from './performance';

export interface EngineOptions {
  container: HTMLElement;
  maxPixelRatio?: number;
  onError?: (error: unknown) => void;
}

export interface EngineHooks {
  fixedUpdate?(frame: FrameContext): void;
  update?(frame: FrameContext): void;
}

export interface Engine {
  readonly services: EngineServices;
  /** Recent real frame intervals and CPU stage timings, when provided by the engine. */
  getPerformanceSnapshot?(): EnginePerformanceSnapshot;
  start(hooks: EngineHooks): void;
  stop(): void;
  resize(): void;
  dispose(): Promise<void>;
}

let rapierInitialization: Promise<typeof import('@dimforge/rapier3d-compat')> | undefined;
function loadRapier(): Promise<typeof import('@dimforge/rapier3d-compat')> {
  rapierInitialization ??= import('@dimforge/rapier3d-compat').then(async (rapier) => {
    await rapier.init();
    return rapier;
  }).catch((error: unknown) => {
    rapierInitialization = undefined;
    throw error;
  });
  return rapierInitialization;
}

/** Owns rendering, the shared Rapier world, fixed-step scheduling, and Web Audio lifetime. */
export async function createEngine(options: EngineOptions): Promise<Engine> {
  const maxPixelRatio = options.maxPixelRatio ?? 2;
  if (!Number.isFinite(maxPixelRatio) || maxPixelRatio <= 0) throw new Error('maxPixelRatio must be positive');
  const rapier = await loadRapier();
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.domElement.setAttribute('aria-label', 'Neutral 3D renderer test scene');
  const scene = new Scene();
  const camera = new PerspectiveCamera(70, 1, 0.05, 250);
  let physics: import('@dimforge/rapier3d-compat').World;
  try {
    physics = new rapier.World({ x: 0, y: -9.81, z: 0 });
  } catch (error) {
    renderer.dispose();
    renderer.forceContextLoss();
    throw error;
  }
  const audio = createAudioService();
  const services: EngineServices = { renderer, scene, camera, physics, audio };
  const clock = new FrameClock();
  const profiler = new FrameProfiler();
  let animationFrame: number | null = null;
  let running = false;
  let disposed = false;
  let disposal: Promise<void> | undefined;
  let hooks: EngineHooks = {};
  let resizeObserver: ResizeObserver | undefined;

  function reportError(error: unknown): void {
    stop();
    if (options.onError) options.onError(error);
    else console.error('NIGHT WARD engine stopped:', error);
  }

  function resize(): void {
    if (disposed) return;
    const width = Math.max(1, options.container.clientWidth);
    const height = Math.max(1, options.container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function schedule(): void {
    if (running && !document.hidden && animationFrame === null) animationFrame = requestAnimationFrame(frame);
  }

  function frame(milliseconds: number): void {
    animationFrame = null;
    if (!running || disposed || document.hidden) return;
    try {
      const frameBegin = performance.now();
      const step = clock.tick(milliseconds);
      let fixedMs = 0;
      let physicsMs = 0;
      for (const fixedFrame of step.fixedSteps) {
        const fixedBegin = performance.now();
        hooks.fixedUpdate?.(fixedFrame);
        const physicsBegin = performance.now();
        fixedMs += physicsBegin - fixedBegin;
        physics.timestep = fixedFrame.deltaSeconds;
        physics.step();
        physicsMs += performance.now() - physicsBegin;
      }
      const updateBegin = performance.now();
      hooks.update?.({ deltaSeconds: step.deltaSeconds, elapsedSeconds: step.elapsedSeconds });
      const renderBegin = performance.now();
      renderer.render(scene, camera);
      const frameEnd = performance.now();
      profiler.record(milliseconds, frameEnd - frameBegin, fixedMs, physicsMs,
        renderBegin - updateBegin, frameEnd - renderBegin, step.fixedSteps.length);
      schedule();
    } catch (error) {
      reportError(error);
    }
  }

  function stop(): void {
    running = false;
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
    clock.reset();
    profiler.resetInterval();
  }

  function onVisibilityChange(): void {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
    clock.reset();
    profiler.resetInterval();
    schedule();
  }

  function onContextLost(event: Event): void {
    event.preventDefault();
    reportError(new Error('WebGL context lost. Reload the page to restart NIGHT WARD.'));
  }

  try {
    options.container.appendChild(renderer.domElement);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibilityChange);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(options.container);
    resize();
  } catch (error) {
    resizeObserver?.disconnect();
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
    renderer.domElement.remove();
    renderer.dispose();
    renderer.forceContextLoss();
    physics.free();
    await audio.dispose();
    throw error;
  }

  return {
    services,
    getPerformanceSnapshot: () => profiler.snapshot(),
    start(nextHooks) {
      if (disposed) throw new Error('Engine has been disposed');
      if (running) throw new Error('Engine is already running');
      hooks = nextHooks;
      running = true;
      clock.reset();
      profiler.clear();
      schedule();
    },
    stop,
    resize,
    dispose() {
      if (disposal) return disposal;
      disposed = true;
      stop();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.remove();
      disposal = Promise.resolve().then(async () => {
        try {
          await audio.dispose();
        } finally {
          try { physics.free(); } finally {
            renderer.dispose();
            renderer.forceContextLoss();
          }
        }
      });
      return disposal;
    },
  };
}
