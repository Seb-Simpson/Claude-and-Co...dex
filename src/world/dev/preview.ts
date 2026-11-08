/**
 * Development-only viewer for the hospital wing. Not part of the game build (Vite only bundles
 * index.html). It registers just the NW-001A world/atmosphere/horror modules and drives the
 * shared camera with a free-fly debug camera — this is NOT the player controller (owned by NW-001B).
 */
import { Group } from 'three';
import type { EntityBehaviourState, EntityType } from '../../contracts';
import { createEngine } from '../../engine';
import { createEventBus, createModuleRegistry } from '../../integration';
import atmosphere from '../../atmosphere/atmosphere.module';
import horror from '../../horror/horror.module';
import hospital from '../hospital.module';

interface View { readonly x: number; readonly y: number; readonly z: number; readonly yaw: number; readonly pitch: number }

export const VIEWS: Record<string, View> = {
  spawn: { x: -12.4, y: 1.62, z: 4.1, yaw: 0.1, pitch: -0.05 },
  'corridor-east': { x: -13.5, y: 1.62, z: 0.2, yaw: -Math.PI / 2, pitch: -0.02 },
  'corridor-west': { x: -7.5, y: 1.62, z: 0.3, yaw: Math.PI / 2, pitch: -0.02 },
  station: { x: -4.6, y: 1.62, z: 0.7, yaw: 0.35, pitch: -0.12 },
  treatment: { x: 1.3, y: 1.62, z: -2.1, yaw: -0.95, pitch: -0.12 },
  storage: { x: 12.2, y: 1.62, z: -2.15, yaw: -1.1, pitch: -0.1 },
  maintenance: { x: -5.6, y: 1.62, z: 7.15, yaw: -Math.PI / 2, pitch: 0 },
  east: { x: 19.5, y: 1.62, z: 4.5, yaw: 0, pitch: 0 },
  stair: { x: 19.4, y: 1.62, z: -8.2, yaw: 0, pitch: 0.02 },
  r103: { x: -11.9, y: 1.62, z: -2.1, yaw: 1.0, pitch: -0.12 },
  r105: { x: -7.4, y: 1.62, z: -2.0, yaw: 0.55, pitch: -0.1 },
  r106: { x: -7.6, y: 1.62, z: 2.0, yaw: 2.55, pitch: -0.15 },
  r107: { x: 7.4, y: 1.62, z: -2.0, yaw: -0.7, pitch: -0.1 },
  r110: { x: 7.0, y: 1.62, z: 2.1, yaw: Math.PI - 0.55, pitch: -0.1 },
  r101: { x: -16.3, y: 1.62, z: -2.0, yaw: 0.75, pitch: -0.12 },
  r102: { x: -16.4, y: 1.62, z: 2.0, yaw: 2.4, pitch: -0.12 },
  r108: { x: -1.0, y: 1.62, z: 2.0, yaw: 2.3, pitch: -0.15 },
  waiting: { x: 3.6, y: 1.62, z: -0.9, yaw: Math.PI + 0.25, pitch: -0.1 },
  lift: { x: 19.0, y: 1.62, z: -1.4, yaw: -0.8, pitch: 0 },
  overview: { x: 0.5, y: 34, z: -3.5, yaw: 0, pitch: -Math.PI / 2 + 0.0001 },
  lineup: { x: -3.9, y: 1.6, z: 0.15, yaw: Math.PI / 2, pitch: -0.08 },
};

async function main(): Promise<void> {
  const container = document.querySelector<HTMLElement>('#app')!;
  const params = new URLSearchParams(location.search);
  const engine = await createEngine({ container, onError: (e) => console.error(e) });
  const events = createEventBus();
  const registry = createModuleRegistry(engine.services, events);
  registry.register(hospital);
  registry.register(atmosphere);
  registry.register(horror);
  await registry.start();
  const camera = engine.services.camera;
  const scene = engine.services.scene;
  if (params.get('fog') === '0') scene.fog = null;

  const view = { ...(VIEWS[params.get('view') ?? 'spawn'] ?? VIEWS.spawn!) };
  const keys = new Set<string>();
  const apply = (): void => {
    camera.position.set(view.x, view.y, view.z);
    camera.rotation.set(view.pitch, view.yaw, 0, 'YXZ');
  };
  apply();
  const names = Object.keys(VIEWS);
  window.addEventListener('keydown', (e) => {
    keys.add(e.key.toLowerCase());
    const n = Number(e.key);
    if (n >= 1 && n <= 9) Object.assign(view, VIEWS[names[n - 1]!]);
    if (e.key.toLowerCase() === 'h') document.querySelector('#hud')?.classList.toggle('hidden');
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  let dragging = false;
  container.addEventListener('pointerdown', () => { dragging = true; void engine.services.audio.resume().catch(() => undefined); });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    view.yaw -= e.movementX * 0.003;
    view.pitch = Math.max(-1.5, Math.min(1.5, view.pitch - e.movementY * 0.003));
  });
  if (params.get('hud') === '0') document.querySelector('#hud')?.classList.add('hidden');

  engine.start({
    fixedUpdate: (frame) => registry.fixedUpdate(frame),
    update: (frame) => {
      const speed = (keys.has('shift') ? 6 : 2.2) * frame.deltaSeconds;
      const fx = -Math.sin(view.yaw);
      const fz = -Math.cos(view.yaw);
      if (keys.has('w')) { view.x += fx * speed; view.z += fz * speed; }
      if (keys.has('s')) { view.x -= fx * speed; view.z -= fz * speed; }
      if (keys.has('a')) { view.x += fz * speed; view.z -= fx * speed; }
      if (keys.has('d')) { view.x -= fz * speed; view.z += fx * speed; }
      if (keys.has('e')) view.y += speed;
      if (keys.has('q')) view.y -= speed;
      apply();
      moveActors(frame.deltaSeconds);
      registry.update(frame);
    },
  });

  // Showcase: stand-in nodes in NW-001B's model-binding format so the real presenter attaches
  // bodies to them. Dev only — in the game, gameplay owns these nodes and moves them.
  interface ShowcaseEntry { id: string; type: EntityType; x: number; z: number; yaw: number; behaviour: EntityBehaviourState; dx?: number; dz?: number; speed?: number; range?: number }
  const showcaseRoot = new Group();
  showcaseRoot.name = 'night-ward:entities';
  scene.add(showcaseRoot);
  const actors = new Map<string, { node: Group; entry: ShowcaseEntry; t: number }>();
  const showcase = (entries: ShowcaseEntry[]): void => {
    for (const [id, a] of actors) if (!entries.some((e) => e.id === id)) { a.node.removeFromParent(); actors.delete(id); }
    for (const entry of entries) {
      let actor = actors.get(entry.id);
      if (!actor) {
        const node = new Group();
        node.name = `night-ward:entity:${entry.id}`;
        showcaseRoot.add(node);
        actor = { node, entry, t: 0 };
        actors.set(entry.id, actor);
      }
      actor.entry = entry;
      actor.node.userData = { entityId: entry.id, entityType: entry.type, behaviourState: entry.behaviour };
      actor.node.position.set(entry.x, 0, entry.z);
      actor.node.rotation.y = entry.yaw;
    }
  };
  const moveActors = (dt: number): void => {
    for (const a of actors.values()) {
      const e = a.entry;
      if (!e.speed || !e.range) continue;
      a.t += dt * e.speed;
      const s = (a.t % (2 * e.range));
      const forward = s < e.range;
      const d = forward ? s : 2 * e.range - s;
      const dir = { x: e.dx ?? 0, z: e.dz ?? -1 };
      a.node.position.set(e.x + dir.x * d, 0, e.z + dir.z * d);
      const mx = forward ? dir.x : -dir.x;
      const mz = forward ? dir.z : -dir.z;
      a.node.rotation.y = Math.atan2(-mx, -mz);
    }
  };
  if (params.get('showcase') === 'lineup') {
    showcase([
      { id: 'patient', type: 'patient', x: -8.6, z: 0.55, yaw: -Math.PI / 2, behaviour: 'idle' },
      { id: 'nurse', type: 'nurse', x: -7.2, z: -0.65, yaw: -Math.PI / 2, behaviour: 'idle' },
      { id: 'crawler', type: 'crawler', x: -5.9, z: 0.45, yaw: -Math.PI / 2 - 0.3, behaviour: 'idle' },
      { id: 'watcher', type: 'watcher', x: -10.6, z: -0.5, yaw: -Math.PI / 2, behaviour: 'idle' },
    ]);
  }

  // Hooks for automated screenshots.
  (window as unknown as { __nwPreview: unknown }).__nwPreview = {
    views: names,
    setView(name: string) { Object.assign(view, VIEWS[name]); apply(); },
    info() {
      const info = engine.services.renderer.info;
      return { calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? 0 };
    },
    emit(type: string, payload: unknown) { (events.emit as (t: string, p: unknown) => void)(type, payload); },
    showcase,
    setCamera(x: number, y: number, z: number, yaw: number, pitch: number) { Object.assign(view, { x, y, z, yaw, pitch }); apply(); },
    ready: true,
  };
}

void main().catch((error: unknown) => {
  console.error('Preview failed:', error);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f88;position:absolute;top:0">${String(error)}</pre>`);
});
