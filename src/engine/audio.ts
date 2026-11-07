import type { AudioService } from '../contracts';

/** Browser-native, gesture-unlocked audio. Does not create a context during page boot. */
export function createAudioService(): AudioService {
  let context: AudioContext | null = null;
  let disposed = false;
  return {
    get context() { return context; },
    async resume() {
      if (disposed) throw new Error('Audio service has been disposed');
      if (!context) context = new AudioContext();
      if (context.state !== 'running') await context.resume();
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      if (context && context.state !== 'closed') await context.close();
      context = null;
    },
  };
}
