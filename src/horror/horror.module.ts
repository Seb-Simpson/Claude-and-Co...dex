import { Vector3 } from 'three';
import type { GameModule } from '../contracts';
import { getHospitalExtras } from '../world/extras';
import { type AnomalyRuntime, createAnomaly, type CueRequest } from './anomalies';
import { AnomalyDirector } from './director';

/**
 * Environmental horror: curtains that move, monitors that flatline, a lift that opens on an
 * empty car, a TV that wakes into static. No enemies are moved, spawned or teleported here.
 * Publishes `horror:anomaly` start/stop and asks atmosphere for sounds via `atmosphere:sound`.
 */
export default {
  id: 'nw:horror:hospital-anomalies',
  kind: 'horror',
  setup(context) {
    const extras = getHospitalExtras(context.world);
    if (!extras) return { dispose() { /* no hospital */ } };
    const camera = context.engine.camera;
    const runtimes = new Map<string, AnomalyRuntime>(extras.anomalies.map((target) => [target.id, createAnomaly(target)]));
    const wasActive = new Map<string, boolean>();
    const director = new AnomalyDirector();
    let now = 0;
    let emitting = false;

    const send = (cues: readonly CueRequest[]): void => {
      for (const cue of cues) {
        context.events.emit('atmosphere:sound', {
          cueId: cue.cueId, action: 'play', volume: cue.volume, loop: false,
          position: { x: cue.position.x, y: cue.position.y, z: cue.position.z },
        });
      }
    };

    const trigger = (id: string, external: boolean): boolean => {
      const runtime = runtimes.get(id);
      if (!runtime || runtime.active) return false;
      send(runtime.start(now));
      wasActive.set(id, true);
      if (!external) {
        emitting = true;
        try {
          context.events.emit('horror:anomaly', { anomalyId: `${id}:${Math.floor(now * 1000)}`, action: 'start', targetId: id });
        } finally {
          emitting = false;
        }
      } else {
        director.noteTriggered(id, now);
      }
      return true;
    };

    // Other modules may request a specific anomaly by target ID (e.g. a scripted beat).
    context.events.on('horror:anomaly', (event) => {
      if (emitting || event.action !== 'start') return;
      trigger(event.targetId, true);
    });
    context.events.on('chase:started', () => director.suspend());
    context.events.on('chase:ended', () => director.resume(now, 25));

    const position = new Vector3();
    const forward = new Vector3();
    const toTarget = new Vector3();
    return {
      update(frame) {
        now = frame.elapsedSeconds;
        camera.getWorldPosition(position);
        camera.getWorldDirection(forward);
        for (const runtime of runtimes.values()) {
          const distance = runtime.target.position.distanceTo(position);
          send(runtime.update(now, frame.deltaSeconds, distance));
          const id = runtime.target.id;
          if (wasActive.get(id) && !runtime.active) {
            wasActive.set(id, false);
            context.events.emit('horror:anomaly', { anomalyId: `${id}:end`, action: 'stop', targetId: id });
          }
        }
        const candidates = [...runtimes.values()].map((runtime) => {
          toTarget.subVectors(runtime.target.position, position);
          const distance = toTarget.length();
          return { id: runtime.target.id, distance, facing: distance > 0 ? toTarget.normalize().dot(forward) : 1, busy: runtime.active };
        });
        const chosen = director.tick(now, candidates);
        if (chosen) trigger(chosen, false);
      },
      dispose() {
        for (const runtime of runtimes.values()) runtime.reset();
        runtimes.clear();
      },
    };
  },
} satisfies GameModule;
