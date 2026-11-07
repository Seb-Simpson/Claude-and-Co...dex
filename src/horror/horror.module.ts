import { Group, type Material, type Mesh, Raycaster, Vector3 } from 'three';
import type { GameModule } from '../contracts';
import { getHospitalExtras } from '../world/extras';
import { type AnomalyRuntime, createAnomaly, type CueRequest } from './anomalies';
import { EntityAudio } from './audio/entityAudio';
import { AnomalyDirector } from './director';
import { FootprintTrail } from './entities/footprints';
import { EntityPresenter, sceneEntityNodes } from './entities/presenter';
import { ReflectionPresenter } from './entities/reflection';
import { CINEMATIC_KINDS, type CinematicKind, CinematicDirector } from './scares/cinematics';
import { SilhouetteMirage } from './scares/mirage';
import { ScreenOverlay } from './scares/overlay';

/** Director-only pseudo anomalies (presentation beats rather than world objects). */
const MIRROR_GLIMPSE = 'nw:anomaly:mirror-glimpse';
const POWER_FAILURE = 'nw:anomaly:power-failure';

/**
 * NW-001A/NW-002B horror presentation:
 *  - entity bodies + animation attached to NW-001B's entity nodes (read-only transforms)
 *  - entity audio, footprints, The Reflection in mirrors and glass
 *  - environmental anomalies, distant silhouettes, cinematic beats
 * Nothing here moves an entity, decides detection or chase, or captures the player.
 */
export default {
  id: 'nw:horror:hospital-anomalies',
  kind: 'horror',
  setup(context) {
    const extras = getHospitalExtras(context.world);
    if (!extras || !context.world) return { dispose() { /* no hospital */ } };
    const world = context.world;
    const { camera, scene, renderer, audio } = context.engine;
    const cleanup: (() => void)[] = [];
    const layer = new Group();
    layer.name = 'nw:horror-layer';
    scene.add(layer);
    cleanup.push(() => layer.removeFromParent());

    try {
      // ---- Line of sight against the static hospital (opaque, merged meshes only). ------------
      const occluders: Mesh[] = [];
      world.root.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh || !o.name.startsWith('nw:static')) return;
        const material = mesh.material as Material;
        if (!material.transparent) occluders.push(mesh);
      });
      const raycaster = new Raycaster();
      const lineOfSight = (from: Vector3, to: Vector3): boolean => {
        const dir = to.clone().sub(from);
        const distance = dir.length();
        if (distance < 0.05) return true;
        raycaster.set(from, dir.normalize());
        raycaster.far = distance - 0.15;
        return raycaster.intersectObjects(occluders, false).length === 0;
      };

      // ---- Presentation services. -------------------------------------------------------------
      const sound = (cueId: string, position?: Vector3 | null, volume = 0.6): void => {
        context.events.emit('atmosphere:sound', {
          cueId, action: 'play', volume: Math.max(0, Math.min(1, volume)), loop: false,
          ...(position ? { position: { x: position.x, y: position.y, z: position.z } } : {}),
        });
      };
      const mains = new Set(extras.fixtures.filter((f) => f.kind === 'fluorescent' || f.kind === 'lamp' || f.kind === 'monitor' || f.kind === 'vending' || f.kind === 'caged').map((f) => f.id));
      const fixturesNear = (p: Vector3, radius: number): string[] => extras.fixtures.filter((f) => mains.has(f.id) && f.position.distanceTo(p) <= radius).map((f) => f.id);
      const overlay = new ScreenOverlay(renderer.domElement.parentElement);
      cleanup.push(() => overlay.dispose());
      const entityAudio = new EntityAudio(() => audio.context);
      cleanup.push(() => entityAudio.dispose());
      const cinematics = new CinematicDirector({
        lighting: (event) => context.events.emit('atmosphere:lighting', event),
        sound: (cue, position, volume) => sound(cue, position, volume),
        fixturesNear,
        overlay: (pulse) => overlay.pulse(pulse),
        duck: (level, seconds) => { entityAudio.duck(level, seconds); sound('nw:mix:duck', null, level); },
        silence: () => sound('nw:mix:silence', null, 0),
        clearOverlay: () => overlay.clear(),
      });
      cleanup.push(() => cinematics.cancel());

      // ---- Entity bodies. ---------------------------------------------------------------------
      const footprints = new FootprintTrail(layer);
      cleanup.push(() => footprints.dispose());
      const doorways = world.doors.map((d) => new Vector3(d.closedPose.position.x, 0, d.closedPose.position.z));
      const presenter = new EntityPresenter({
        source: sceneEntityNodes(scene),
        camera,
        doorways,
        lineOfSight,
        onFootstep: (entity, bone, position) => {
          entityAudio.footstep(entity.type, bone, position, entity.visual.visualState, entity.distance, entity.occluded);
          if (entity.type === 'patient') footprints.add(position, entity.node.rotation.y, bone === 'footL');
        },
        onReveal: (entity) => { cinematics.play('distant-reveal', { position: entity.position, intensity: entity.type === 'patient' ? 1 : 0.7 }); },
        onLostSight: (entity) => { if (entity.type === 'patient' || entity.type === 'watcher') cinematics.play('disappear', { position: entity.position, intensity: 0.6 }); },
      });
      cleanup.push(() => presenter.dispose());

      // ---- The Reflection. --------------------------------------------------------------------
      const reflection = new ReflectionPresenter(layer, extras.reflectiveSurfaces, camera);
      cleanup.push(() => reflection.dispose());
      context.events.on('horror:reflection', (event) => {
        if (event.visible) {
          if (reflection.show(event.anchorId, event.durationSeconds)) {
            const surface = reflection.state.surfaceId ? extras.reflectiveSurfaces.find((s) => s.id === reflection.state.surfaceId) : null;
            if (surface) sound('nw:vent-breath', surface.position, 0.25);
          }
        } else reflection.hide();
      });

      // ---- Distant silhouettes. ---------------------------------------------------------------
      const mirage = new SilhouetteMirage(layer, extras.sightlines);
      cleanup.push(() => mirage.dispose());

      // ---- Environmental anomalies (NW-001A) + director. ---------------------------------------
      const runtimes = new Map<string, AnomalyRuntime>(extras.anomalies.map((target) => [target.id, createAnomaly(target)]));
      cleanup.push(() => { for (const r of runtimes.values()) r.reset(); runtimes.clear(); });
      const wasActive = new Map<string, boolean>();
      const director = new AnomalyDirector();
      let now = 0;
      let emitting = false;
      let chases = 0;
      let lastPowerFailure = -1e9;
      const send = (cues: readonly CueRequest[]): void => { for (const cue of cues) sound(cue.cueId, cue.position, cue.volume); };
      const position = new Vector3();
      const forward = new Vector3();
      const up = new Vector3();

      const trigger = (id: string, external: boolean): boolean => {
        if (id === MIRROR_GLIMPSE) return reflection.show(null, 1.1 + Math.random() * 0.6);
        if (id === POWER_FAILURE) {
          lastPowerFailure = now;
          return cinematics.play('lighting-failure', { position: position.clone(), intensity: 0.8 });
        }
        const runtime = runtimes.get(id);
        if (!runtime || runtime.active) return false;
        send(runtime.start(now));
        wasActive.set(id, true);
        if (!external) {
          emitting = true;
          try { context.events.emit('horror:anomaly', { anomalyId: `${id}:${Math.floor(now * 1000)}`, action: 'start', targetId: id }); } finally { emitting = false; }
        } else director.noteTriggered(id, now);
        return true;
      };

      context.events.on('horror:anomaly', (event) => {
        if (emitting || event.action !== 'start') return;
        trigger(event.targetId, true);
      });
      context.events.on('chase:started', (event) => {
        chases++;
        director.suspend();
        mirage.vanish();
        cinematics.play('chase-initiation', { position: new Vector3(event.position.x, event.position.y, event.position.z) });
      });
      context.events.on('chase:ended', (event) => {
        chases = Math.max(0, chases - 1);
        if (chases === 0) {
          director.resume(now, 25);
          if (event.reason !== 'captured') cinematics.play('post-chase-silence');
        }
      });
      // External requests: triggerId `nw:scare:<kind>` plays that cinematic beat.
      context.events.on('horror:scare', (event) => {
        if (!event.triggerId.startsWith('nw:scare:')) return;
        const kind = event.triggerId.slice('nw:scare:'.length) as CinematicKind;
        if (!CINEMATIC_KINDS.includes(kind)) return;
        const at = event.position ? new Vector3(event.position.x, event.position.y, event.position.z) : position.clone();
        cinematics.play(kind, { position: at, intensity: event.intensity });
      });

      let nearMissCooldown = 0;
      return {
        update(frame) {
          const dt = frame.deltaSeconds;
          now = frame.elapsedSeconds;
          camera.getWorldPosition(position);
          camera.getWorldDirection(forward);
          up.set(0, 1, 0).applyQuaternion(camera.quaternion);

          const entities = presenter.update(dt);
          const hunting = entities.some((e) => e.behaviour === 'pursue' || e.behaviour === 'search' || e.behaviour === 'investigate');

          entityAudio.update({ position, forward, up }, entities.map((e) => ({
            id: e.id, type: e.type, position: e.head, visualState: e.visual.visualState, distance: e.distance, occluded: e.occluded, observed: e.observed,
          })));

          // Near miss: the player is hidden and something hunting passes within arm's reach.
          nearMissCooldown -= dt;
          const snapshot = context.player?.getSnapshot();
          if (snapshot && snapshot.hiding.state === 'hidden' && nearMissCooldown <= 0) {
            const close = entities.find((e) => e.distance < 2.8 && (e.behaviour === 'pursue' || e.behaviour === 'search' || e.behaviour === 'investigate'));
            if (close && cinematics.play('near-miss', { position: close.position })) nearMissCooldown = 12;
          }

          const mirageEvent = mirage.update(dt, {
            camera: position, forward, clearLine: lineOfSight, entities: entities.map((e) => e.position), calm: chases === 0 && !hunting,
          });
          if (mirageEvent?.type === 'appear') cinematics.play('distant-reveal', { position: mirageEvent.position, intensity: 0.5 });
          if (mirageEvent?.type === 'vanish') cinematics.play('disappear', { position: mirageEvent.position, intensity: 0.4 });

          for (const runtime of runtimes.values()) {
            const distance = runtime.target.position.distanceTo(position);
            send(runtime.update(now, dt, distance));
            const id = runtime.target.id;
            if (wasActive.get(id) && !runtime.active) {
              wasActive.set(id, false);
              context.events.emit('horror:anomaly', { anomalyId: `${id}:end`, action: 'stop', targetId: id });
            }
          }
          const toTarget = new Vector3();
          const candidates = [...runtimes.values()].map((runtime) => {
            toTarget.subVectors(runtime.target.position, position);
            const distance = toTarget.length();
            return { id: runtime.target.id, distance, facing: distance > 0 ? toTarget.normalize().dot(forward) : 1, busy: runtime.active };
          });
          if (reflection.resolve(null)) candidates.push({ id: MIRROR_GLIMPSE, distance: 5, facing: 0.5, busy: reflection.state.visible });
          if (!hunting && now - lastPowerFailure > 240) candidates.push({ id: POWER_FAILURE, distance: 10, facing: 0.5, busy: false });
          const chosen = director.tick(now, candidates);
          if (chosen) trigger(chosen, false);

          reflection.update(dt);
          footprints.update(dt);
          cinematics.update(dt);
          overlay.base = 0.16 + (hunting ? 0.08 : 0);
          overlay.update(dt);
        },
        dispose() {
          for (const fn of cleanup.splice(0).reverse()) fn();
        },
      };
    } catch (error) {
      for (const fn of cleanup.splice(0).reverse()) { try { fn(); } catch { /* best effort */ } }
      throw error;
    }
  },
} satisfies GameModule;

