import type { GameEventMap, GameEvents } from '../contracts';

/** Synchronous notifications. Emitters see listener errors after all listeners run. */
export interface EventBus extends GameEvents {
  clear(): void;
  dispose(): void;
}

export function createEventBus(): EventBus {
  // Unknown storage preserves the relationship between event name and payload at the API.
  const listeners = new Map<keyof GameEventMap, Set<(payload: never) => void>>();
  let disposed = false;

  function assertActive(): void {
    if (disposed) throw new Error('The event bus has been disposed.');
  }

  return {
    on(type, listener) {
      assertActive();
      let bucket = listeners.get(type);
      if (!bucket) {
        bucket = new Set();
        listeners.set(type, bucket);
      }
      // A wrapper gives each subscription its own idempotent unsubscribe handle.
      const callback = (payload: never): void => listener(payload);
      bucket.add(callback);
      return () => {
        bucket.delete(callback);
        if (bucket.size === 0 && listeners.get(type) === bucket) listeners.delete(type);
      };
    },
    emit(type, payload) {
      assertActive();
      const errors: unknown[] = [];
      for (const listener of [...(listeners.get(type) ?? [])]) {
        try {
          listener(payload as never);
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length > 0) {
        throw new AggregateError(errors, `Listeners failed while handling "${type}".`);
      }
    },
    clear() {
      assertActive();
      listeners.clear();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
    },
  };
}
