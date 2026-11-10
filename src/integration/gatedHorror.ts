import type { GameModule, ModuleInstance } from '../contracts';
/** Defers the existing module intact until the next authored section permits it. */
export function gateHorrorModule(module: GameModule, enabled: () => boolean, prepare: () => boolean = enabled, ready?: () => void): GameModule {
  return { ...module, setup(context) {
    let instance: ModuleInstance | null = null;
    let pending: Promise<void> | null = null;
    let failure: unknown = null;
    let disposed = false;
    const ensure = (): void => {
      if (failure) throw failure;
      if (disposed || instance || pending || !prepare()) return;
      pending = Promise.resolve().then(() => module.setup(context)).then(value => { instance = value; ready?.(); }, error => { failure = error; });
    };
    return {
      fixedUpdate(frame) { ensure(); if (enabled()) instance?.fixedUpdate?.(frame); },
      update(frame) { ensure(); if (enabled()) instance?.update?.(frame); },
      async dispose() { if (disposed) return; disposed = true; await pending; await instance?.dispose(); instance = null; },
    };
  } };
}
