/**
 * NW-R02 greybox world module (`?level=greybox`). Deliberately not named *.module.ts so module
 * discovery never registers it in the normal game.
 *
 * Owns: the greybox world, temporary progression flags (set by developer controls, consumed by
 * door/control requirements through GameplayOptions.hasRequirement), telemetry, the developer map
 * (M), an in-world collider overlay (K) and a small HUD readout.
 */
import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments, Quaternion, Vector3 } from 'three';
import type { DoorState, GameModule, ModuleContext } from '../../contracts';
import { createGreyboxWorld, type GreyboxWorldBuild } from './build';
import { createDevMap, type DevMap } from './devMap';
import { CHECKPOINTS, FEATURES, WALKTHROUGH } from './level';
import { createTelemetry, type Telemetry, type TelemetrySnapshot } from './telemetry';
import { CLEAR_SUBTITLE, emitSubtitle } from '../../audio/subtitles';
import { R03_DEVICES, R03_HATCH, R03_REPLACED_DEV_CONTROLS, R03_AUDITION_IDS, type VoiceProvenance } from '../../chapter1/r03Demo';
import {
  R03_CHECKPOINT_KEY, R03_HATCH_DOOR, createCh1CheckpointStore, createR03Session, loadR03Restore, r03CheckpointContext, type R03Session,
} from '../../chapter1/r03Session';
import { shawStage } from '../../chapter1/state';
import { buildLayout } from './grid';
import { CONNECTIONS } from './level';
import { doorIdsOf } from './build';

export interface GreyboxProgress {
  has(flag: string): boolean;
  set(flag: string): void;
  clear(): void;
  list(): string[];
  /** R03: requirements resolved from Chapter 1 state first (undefined falls back to dev flags). */
  setResolver(resolver: ((id: string) => boolean | undefined) | null): void;
}

export function createGreyboxProgress(): GreyboxProgress {
  const flags = new Set<string>();
  let resolver: ((id: string) => boolean | undefined) | null = null;
  return {
    has: (flag) => resolver?.(flag) ?? flags.has(flag),
    setResolver: (next) => { resolver = next; },
    set: (flag) => { flags.add(flag); },
    clear: () => flags.clear(),
    list: () => [...flags].sort(),
  };
}

export interface GreyboxApi {
  readonly progress: GreyboxProgress;
  telemetry(): TelemetrySnapshot;
  resetTelemetry(): void;
  checkpoint(id: string): boolean;
  doorState(id: string): DoorState | undefined;
  toggleMap(force?: boolean): boolean;
  toggleColliders(force?: boolean): boolean;
  readonly build: GreyboxWorldBuild;
  /** R03 Chapter 1 session (only with `r03`). */
  readonly r03: R03Session | null;
}

export interface GreyboxModuleOptions {
  readonly progress: GreyboxProgress;
  /** Moves the player (application.teleport). Used by developer checkpoints only. */
  teleport(position: { x: number; y: number; z: number }, yaw: number): boolean;
  onReady?(api: GreyboxApi): void;
  /** NW-R03 foundations demo (`?level=greybox&r03=1`). */
  readonly r03?: boolean;
  /** Gameplay notifications (the runtime's HUD), once the runtime exists. */
  notify?(message: string): void;
  readonly directionalCaptions?: () => boolean;
}

function colliderOverlay(build: GreyboxWorldBuild): LineSegments {
  const positions: number[] = [];
  const corners = [-1, 1];
  const q = new Quaternion();
  for (const collider of build.world.colliders) {
    if (collider.shape.type !== 'box') continue;
    const h = collider.shape.halfExtents;
    q.set(collider.pose.rotation.x, collider.pose.rotation.y, collider.pose.rotation.z, collider.pose.rotation.w);
    const c = new Vector3(collider.pose.position.x, collider.pose.position.y, collider.pose.position.z);
    const v = (sx: number, sy: number, sz: number): Vector3 => new Vector3(sx * h.x, sy * h.y, sz * h.z).applyQuaternion(q).add(c);
    for (const a of corners) for (const b of corners) {
      for (const [p, r] of [[v(-1, a, b), v(1, a, b)], [v(a, -1, b), v(a, 1, b)], [v(a, b, -1), v(a, b, 1)]] as const) positions.push(p.x, p.y, p.z, r.x, r.y, r.z);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  const lines = new LineSegments(geometry, new LineBasicMaterial({ color: 0x20ff60, depthTest: true, transparent: true, opacity: 0.55 }));
  lines.name = 'nw:greybox:collider-overlay';
  lines.visible = false;
  return lines;
}

export function createGreyboxModule(options: GreyboxModuleOptions): GameModule {
  return {
    id: 'nw:world:greybox',
    kind: 'world',
    async setup(context: ModuleContext) {
      const { progress } = options;
      progress.clear();
      progress.setResolver(null);
      // NW-R03: decide the start (checkpoint or developer scenario) before building, so restored
      // doors and the spawn are part of the world rather than corrected afterwards.
      const r03Store = options.r03 ? createCh1CheckpointStore(R03_CHECKPOINT_KEY) : null;
      const layoutForRestore = options.r03 ? buildLayout() : null;
      const r03Doors = options.r03 ? [...CONNECTIONS.flatMap((c) => doorIdsOf(c.id)), R03_HATCH_DOOR] : [];
      const r03Context = layoutForRestore ? r03CheckpointContext((x, z) => layoutForRestore.spaceAt(x, z)?.id ?? null, r03Doors) : null;
      const restore = r03Store && r03Context ? loadR03Restore(r03Store, r03Context) : null;
      const build = createGreyboxWorld(restore ? {
        r03: {
          devices: R03_DEVICES.concat([R03_HATCH]), openDoors: restore.openDoors, skipControls: R03_REPLACED_DEV_CONTROLS, spawn: restore.spawn,
          hatchRequirement: { id: 'flag:hatch-unfastened', description: 'Held shut by wing nuts' },
        },
      } : {});
      const provenance = new Map<string, VoiceProvenance>();
      if (restore && typeof fetch !== 'undefined') {
        await Promise.all(R03_AUDITION_IDS.map(async (id) => {
          try {
            const response = await fetch(`/voice-temp/${id}.temp.json`, { signal: AbortSignal.timeout(2000) });
            if (response.ok && (response.headers.get('content-type') ?? '').includes('json')) provenance.set(id, await response.json() as VoiceProvenance);
          } catch { /* no generated audio: subtitle-only */ }
        }));
      }
      const telemetry: Telemetry = createTelemetry(build.layout);
      const doorStates = new Map<string, DoorState>(build.world.doors.map((door) => [door.id, door.initialState]));
      const controlByInteractable = new Map(build.controls.map((control) => [control.interactableId, control]));
      const offDoor = context.events.on('door:state', (event) => { doorStates.set(event.doorId, event.current); });
      const r03: R03Session | null = restore && r03Store && r03Context ? createR03Session({
        restore, events: context.events, store: r03Store, checkpointContext: r03Context,
        audioContext: () => context.engine.audio.context, provenance,
        // Voice captions stay up until the line's own segment ends (the director clears them).
        subtitle: (line) => emitSubtitle(line ? { speaker: line.speaker, text: line.text, seconds: 30 } : CLEAR_SUBTITLE),
        directionalCaptions: options.directionalCaptions ?? (() => false),
        notify: (message) => options.notify?.(message),
        doorState: (id) => doorStates.get(id),
      }) : null;
      if (r03) progress.setResolver((id) => r03.hasRequirement(id));
      const offInteraction = context.events.on('interaction:completed', (event) => {
        const control = controlByInteractable.get(event.targetId);
        if (control && event.outcome === 'completed') progress.set(control.sets);
      });
      const overlay = colliderOverlay(build);
      build.world.root.add(overlay);
      const hidingPoints = build.world.hidingLocations.map((spot) => ({ x: spot.playerPosition.x, z: spot.playerPosition.z }));

      const playerPose = (): { x: number; z: number; yaw: number } | null => {
        const snapshot = context.player?.getSnapshot();
        return snapshot ? { x: snapshot.position.x, z: snapshot.position.z, yaw: snapshot.rotation.yaw } : null;
      };
      const checkpoint = (id: string): boolean => {
        const cp = CHECKPOINTS.find((c) => c.id === id);
        if (!cp) return false;
        for (const flag of cp.flags) progress.set(flag);
        const moved = options.teleport({ x: cp.x, y: 0, z: cp.z }, cp.yaw);
        if (moved) telemetry.teleported();
        return moved;
      };

      let map: DevMap | null = null;
      let hud: HTMLElement | null = null;
      const onKey = (event: KeyboardEvent): void => {
        if (event.repeat) return;
        if (event.code === 'KeyM') map?.toggle();
        else if (event.code === 'KeyK') overlay.visible = !overlay.visible;
      };
      if (typeof document !== 'undefined') {
        map = createDevMap({
          layout: build.layout, controls: build.controls, hidingPoints,
          doorState: (id) => doorStates.get(id), has: progress.has, player: playerPose,
          telemetry: () => telemetry.snapshot(), onCheckpoint: (id) => { checkpoint(id); },
        });
        hud = document.createElement('div');
        hud.id = 'nw-greybox-hud';
        hud.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:40;font:12px/1.35 monospace;color:#f0f0e8;background:rgba(0,0,0,0.55);padding:6px 8px;pointer-events:none;white-space:pre;';
        document.body.appendChild(hud);
        window.addEventListener('keydown', onKey);
      }

      const api: GreyboxApi = {
        progress, build, r03,
        telemetry: () => telemetry.snapshot(),
        resetTelemetry: () => telemetry.reset(),
        checkpoint,
        doorState: (id) => doorStates.get(id),
        toggleMap: (force) => map?.toggle(force) ?? false,
        toggleColliders: (force) => { overlay.visible = force ?? !overlay.visible; return overlay.visible; },
      };
      options.onReady?.(api);

      let hudTimer = 0;
      return {
        world: build.world,
        fixedUpdate(frame) {
          const snapshot = context.player?.getSnapshot();
          if (!snapshot) return;
          const atControl = build.controls.some((control) => !progress.has(control.sets)
            && (!control.requires || progress.has(control.requires))
            && Math.hypot(control.position.x - snapshot.position.x, control.position.z - snapshot.position.z) <= 2.4);
          telemetry.sample({ x: snapshot.position.x, z: snapshot.position.z, crouching: snapshot.crouching, atControl }, frame.deltaSeconds);
          if (r03) {
            const camera = context.engine.camera;
            const forward = camera.getWorldDirection(new Vector3());
            const length = Math.hypot(forward.x, forward.z) || 1;
            r03.update(frame.deltaSeconds, { ...snapshot.position, yaw: snapshot.rotation.yaw },
              { position: camera.getWorldPosition(new Vector3()), forward: { x: forward.x / length, z: forward.z / length } });
          }
        },
        update(frame) {
          hudTimer -= frame.deltaSeconds;
          if (map?.visible) map.draw();
          if (hud && hudTimer <= 0) {
            hudTimer = 0.25;
            const t = telemetry.snapshot();
            const next = WALKTHROUGH[t.steps.length];
            hud.textContent = [
              'NW-R02 GREYBOX (developer build — not final art)  ·  M map  ·  K colliders',
              `space ${t.currentSpace ?? '—'} (${t.currentZone ?? '—'})  ·  ${t.distance.toFixed(1)} m  ·  ${t.totalSeconds.toFixed(1)} s (moving ${t.movingSeconds.toFixed(1)} s)`,
              `next: ${next ? `step ${next.step} ${next.scene} — ${next.label}` : 'walkthrough complete'}`,
              `flags: ${progress.list().join(', ') || '—'}`,
              ...(r03 ? [
                `R03 ${r03.restoredFrom === 'scenario' ? 'DEV SCENARIO START' : 'restored from checkpoint'} · objective: ${r03.objective.text}`,
                `chapter: stage ${shawStage(r03.state)} · suspicion ${r03.state.suspicion} · beats ${r03.state.beats.length} · items ${r03.state.items.join(', ') || '—'} · checkpoint ${r03.lastCheckpoint?.checkpointId ?? '—'}`,
              ] : []),
            ].join('\n');
          }
        },
        dispose() {
          offDoor(); offInteraction();
          r03?.dispose();
          progress.setResolver(null);
          if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey);
          map?.dispose();
          hud?.remove();
          overlay.geometry.dispose();
          (overlay.material as LineBasicMaterial).dispose();
          overlay.removeFromParent();
          build.dispose();
        },
      };
    },
  } satisfies GameModule;
}

/** Inspection text for developer controls (shown when a control is used). */
export function greyboxInspectionText(targetId: string): string | undefined {
  const device = [...R03_DEVICES, R03_HATCH].find((p) => `nw:inspect:gb-${p.device.id}` === targetId)?.device;
  if (device) return device.reads ?? device.notify ?? device.prompt;
  const feature = FEATURES.find((f) => f.kind === 'control' && `nw:inspect:gb-${f.id}` === targetId);
  if (!feature || feature.kind !== 'control') return undefined;
  return `[DEV] ${feature.label} → flag "${feature.sets}" set.`;
}
