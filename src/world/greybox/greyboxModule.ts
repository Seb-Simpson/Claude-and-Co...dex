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

export interface GreyboxProgress {
  has(flag: string): boolean;
  set(flag: string): void;
  clear(): void;
  list(): string[];
}

export function createGreyboxProgress(): GreyboxProgress {
  const flags = new Set<string>();
  return {
    has: (flag) => flags.has(flag),
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
}

export interface GreyboxModuleOptions {
  readonly progress: GreyboxProgress;
  /** Moves the player (application.teleport). Used by developer checkpoints only. */
  teleport(position: { x: number; y: number; z: number }, yaw: number): boolean;
  onReady?(api: GreyboxApi): void;
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
      const build = createGreyboxWorld();
      const telemetry: Telemetry = createTelemetry(build.layout);
      const doorStates = new Map<string, DoorState>(build.world.doors.map((door) => [door.id, door.initialState]));
      const controlByInteractable = new Map(build.controls.map((control) => [control.interactableId, control]));
      const offDoor = context.events.on('door:state', (event) => { doorStates.set(event.doorId, event.current); });
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
        progress, build,
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
            ].join('\n');
          }
        },
        dispose() {
          offDoor(); offInteraction();
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
  const feature = FEATURES.find((f) => f.kind === 'control' && `nw:inspect:gb-${f.id}` === targetId);
  if (!feature || feature.kind !== 'control') return undefined;
  return `[DEV] ${feature.label} → flag "${feature.sets}" set.`;
}
