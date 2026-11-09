import RAPIER from '@dimforge/rapier3d-compat';
import { Box3, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { EntitySnapshot, EntityType, HospitalWorld, PatrolRoute, Vec3 } from '../../../src/contracts';
import { createEntitySystem, createDoorNavigationAdapter, ENTITY_PROFILES } from '../../../src/entities';
import type { EntitySystem } from '../../../src/entities';
import { createInteractionSystem } from '../../../src/gameplay/interactions';
import { createPlayerController } from '../../../src/gameplay/player';
import { createEventBus } from '../../../src/integration/events';
import { createNavigationProvider, createPhysicsAdapter } from '../../../src/physics';
import { createHospitalWorld } from '../../../src/world';

/**
 * NW-004A Step A test harness. Everything here is Codex's real runtime, used read-only and wired
 * the way src/gameplay/runtime.ts wires it: Rapier, the physics adapter, the player controller
 * (real movement, real footstep noise), the interaction system (swept door collision, hiding,
 * witnesses), the navigation grid, the door-navigation adapter and the entity system (real
 * perception, hearing, search and pursuit). The only thing the harness adds is a scripted
 * "player": it steers with setViewRotation + forward input, and opens doors with interact() after
 * aiming the camera at the leaf, exactly as a person would.
 */
export const DT = 1 / 60;
export const PLAYER_AGENT = { radius: 0.28, height: 1.8, maxSlopeRadians: Math.PI / 4, maxStepHeight: 0.25 } as const;
export const dist2 = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);

export interface Step { readonly to?: { x: number; z: number }; readonly door?: string; readonly hide?: string; readonly wait?: number; readonly sprint?: boolean; readonly crouch?: boolean; readonly until?: (s: Sim) => boolean }

export interface SimOptions {
  readonly stage?: 'act1' | 'act3' | 'alarm';
  readonly player: { x: number; z: number; yaw: number };
  readonly entities?: readonly EntityType[];
  readonly spawns?: Partial<Record<EntityType, { x: number; z: number; yaw: number }>>;
  readonly routes?: Partial<Record<EntityType, readonly Vec3[]>>;
  /** Doors to pre-open with the trusted actor API before the run (e.g. Act III staging). */
  readonly openDoors?: readonly string[];
  readonly transform?: (world: HospitalWorld) => HospitalWorld;
  /** Navigation A* budget (Codex default 4096). */
  readonly maxNodes?: number;
}

export interface Sample { t: number; player: Vec3; hidden: boolean; entities: EntitySnapshot[] }

export class Sim {
  readonly hospital;
  readonly world: HospitalWorld;
  readonly rapier: RAPIER.World;
  readonly physics;
  readonly events = createEventBus();
  readonly camera = new PerspectiveCamera(70, 16 / 9, 0.05, 100);
  readonly player;
  readonly interactions;
  readonly navigation;
  readonly entities: EntitySystem;
  readonly captured: string[] = [];
  readonly doorLog: { t: number; door: string; to: string }[] = [];
  readonly noise: { t: number; kind: string }[] = [];
  readonly samples: Sample[] = [];
  readonly interactionsLog: { t: number; target: string; outcome: string; reason?: string }[] = [];
  tick = 0;
  private unsubs: (() => void)[] = [];

  constructor(readonly options: SimOptions) {
    this.rapier = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.hospital = createHospitalWorld({ textures: false, layout: 'chapter1', chapter1Stage: options.stage ?? 'act1' });
    let world = this.hospital.world;
    const types = options.entities ?? [];
    const routeFor = (type: EntityType) => options.routes?.[type];
    const extraRoutes: PatrolRoute[] = [];
    world = {
      ...world,
      entitySpawns: world.entitySpawns.filter((s) => types.includes(s.type)).map((s) => {
        const p = options.spawns?.[s.type];
        const route = routeFor(s.type);
        if (route) extraRoutes.push({ id: `test:route:${s.type}`, loop: true, points: route });
        return { ...s, ...(p ? { position: { x: p.x, y: 0, z: p.z }, yaw: p.yaw } : {}), ...(route ? { patrolRouteId: `test:route:${s.type}` } : {}) };
      }),
    };
    world = { ...world, patrolRoutes: [...world.patrolRoutes, ...extraRoutes] };
    if (options.transform) world = options.transform(world);
    this.world = world;
    this.physics = createPhysicsAdapter(this.rapier, world.colliders);
    const spawn = { position: { x: options.player.x, y: 0, z: options.player.z }, yaw: options.player.yaw };
    const body = this.physics.createCharacter({ position: spawn.position, radius: 0.28, height: 1.8 });
    this.player = createPlayerController({ body, camera: this.camera, spawn, events: this.events });
    let witnesses: EntitySystem | null = null;
    this.interactions = createInteractionSystem({ world, physics: this.physics, player: this.player, events: this.events, witnesses: (spot) => witnesses?.witnessesFor(spot) ?? [] });
    this.navigation = createNavigationProvider(this.physics, world.bounds, { cellSize: 0.25, maxNodes: options.maxNodes ?? 4096 });
    const doors = createDoorNavigationAdapter({
      world, physics: this.physics, navigation: this.navigation, agent: ENTITY_PROFILES.patient.agent,
      getDoorState: (id) => this.interactions.getDoorState(id), requestDoorOpen: (id) => this.interactions.requestDoorOpen(id),
    });
    this.entities = createEntitySystem({ ...doors, world, physics: this.physics, navigation: this.navigation, player: this.player, events: this.events });
    witnesses = this.entities;
    this.unsubs.push(
      this.events.on('player:captured', (e) => { this.captured.push(e.entityId); this.player.setCaptured(true); }),
      this.events.on('door:state', (e) => { this.doorLog.push({ t: this.time, door: e.doorId, to: e.current }); }),
      this.events.on('player:noise', (e) => { this.noise.push({ t: this.time, kind: e.kind }); }),
      this.events.on('interaction:completed', (e) => { this.interactionsLog.push({ t: this.time, target: e.targetId, outcome: e.outcome, ...(e.reason ? { reason: e.reason } : {}) }); }),
    );
    this.cacheDoorCenters();
    for (const id of options.openDoors ?? []) this.interactions.requestDoorOpen(id);
    this.player.update({ deltaSeconds: DT, elapsedSeconds: 0 });
  }

  get time(): number { return this.tick * DT; }
  get position(): Vec3 { return this.player.getSnapshot().position; }
  entity(type: EntityType): EntitySnapshot | undefined { return this.entities.getSnapshots().find((e) => e.type === type); }

  /** One fixed step of the whole runtime, in the order runtime.ts uses. */
  step(input: { forward?: number; right?: number; sprint?: boolean; crouch?: boolean } = {}): void {
    this.tick += 1;
    const frame = { deltaSeconds: DT, elapsedSeconds: this.time };
    this.player.fixedUpdate(frame, { forward: input.forward ?? 0, right: input.right ?? 0, sprint: input.sprint ?? false, crouch: input.crouch ?? false });
    this.interactions.fixedUpdate(frame);
    this.entities.fixedUpdate(frame);
    this.rapier.step();
    this.player.update(frame);
    if (this.tick % 6 === 0) {
      const s = this.player.getSnapshot();
      this.samples.push({ t: this.time, player: { ...s.position }, hidden: s.hiding.state !== 'outside', entities: this.entities.getSnapshots().map((e) => ({ ...e, position: { ...e.position } })) });
    }
  }

  idle(seconds: number, stop?: (s: Sim) => boolean): void {
    const end = this.tick + Math.round(seconds / DT);
    while (this.tick < end && !(stop?.(this))) this.step();
  }

  face(target: { x: number; z: number }, pitch = 0): void {
    const p = this.position;
    this.player.setViewRotation({ yaw: Math.atan2(-(target.x - p.x), -(target.z - p.z)), pitch });
  }

  /** Walk/sprint in a straight line to a point. Returns false if stuck or captured. */
  walkTo(to: { x: number; z: number }, opts: { sprint?: boolean; crouch?: boolean; timeout?: number; stop?: (s: Sim) => boolean } = {}): boolean {
    const end = this.tick + Math.round((opts.timeout ?? 20) / DT);
    let lastProgress = this.tick;
    let best = Infinity;
    while (this.tick < end) {
      if (this.captured.length || opts.stop?.(this)) return false;
      const p = this.position;
      const d = dist2(p, { x: to.x, y: 0, z: to.z });
      if (d < 0.25) return true;
      if (d < best - 0.02) { best = d; lastProgress = this.tick; }
      if (this.tick - lastProgress > 90) return false;
      this.face(to);
      this.step({ forward: d < 0.6 ? Math.max(0.35, d / 0.6) : 1, sprint: opts.sprint ?? false, crouch: opts.crouch ?? false });
    }
    return false;
  }

  /** Follow a path from Codex's navigation grid (player-sized agent), straight-line legs between waypoints. */
  navigateTo(to: { x: number; z: number }, opts: { sprint?: boolean; timeout?: number } = {}): boolean {
    const path = this.navigation.findPath({ from: this.position, to: { x: to.x, y: 0, z: to.z }, agent: PLAYER_AGENT });
    if (!path?.reachesGoal) return false;
    for (const w of path.waypoints.slice(1)) if (!this.walkTo(w, { ...opts, timeout: opts.timeout ?? 10 })) return false;
    return true;
  }

  /** Aim at a door's leaf centre and press interact (the player's real door input). */
  pressDoor(id: string, wantOpen = true, timeout = 3): boolean {
    const marker = this.world.doors.find((d) => d.id === id);
    if (!marker) throw new Error(`no door ${id}`);
    const state = (): string | undefined => this.interactions.getDoorState(id);
    const done = (): boolean => wantOpen ? state() === 'open' : state() === 'closed';
    if (done()) return true;
    const end = this.tick + Math.round(timeout / DT);
    while (this.tick < end) {
      if (this.captured.length) return false;
      const s = state();
      if (s !== 'opening' && s !== 'closing') {
        // Aim where the leaf is now (closed: the doorway; open: the leaf against the wall).
        const center = new Box3().setFromObject(marker.object).getCenter(new Vector3());
        const p = this.player.getSnapshot();
        const eye = 1.6;
        const pitch = Math.atan2(1.05 - eye, Math.max(0.2, dist2(p.position, center)));
        this.face(center, pitch);
        this.player.update({ deltaSeconds: DT, elapsedSeconds: this.time });
        this.interactions.interact(this.time);
      }
      this.step();
      if (done()) return true;
    }
    return done();
  }

  /** Closed-pose centre of a door leaf (world space), computed once like doorNavigation.ts does. */
  doorCenter(id: string): Vec3 {
    const cached = this.centers.get(id);
    if (cached) return cached;
    throw new Error(`no door ${id}`);
  }
  private readonly centers = new Map<string, Vec3>();
  private cacheDoorCenters(): void {
    this.world.root.updateWorldMatrix(true, true);
    for (const marker of this.world.doors) {
      const collider = this.world.colliders.find((c) => marker.colliderIds.includes(c.id));
      if (!collider) continue;
      const p = collider.pose.position;
      const local = new Vector3(p.x, p.y, p.z).applyMatrix4(marker.object.matrixWorld.clone().invert());
      const q = marker.closedPose.rotation;
      const closed = new Matrix4().compose(new Vector3(marker.closedPose.position.x, marker.closedPose.position.y, marker.closedPose.position.z), new Quaternion(q.x, q.y, q.z, q.w), new Vector3(1, 1, 1));
      const c = local.applyMatrix4(closed);
      this.centers.set(marker.id, { x: c.x, y: 1.05, z: c.z });
    }
  }

  /** Run a scripted plan of steps. Returns the index of the first failed step, or -1. */
  run(plan: readonly Step[]): number {
    for (let i = 0; i < plan.length; i++) {
      const s = plan[i]!;
      if (this.captured.length) return i;
      if (s.to && !this.walkTo(s.to, { ...(s.sprint !== undefined ? { sprint: s.sprint } : {}), ...(s.crouch !== undefined ? { crouch: s.crouch } : {}) })) return i;
      if (s.door && !this.pressDoor(s.door)) return i;
      if (s.hide) { if (!this.interactions.hiding.enter(s.hide, this.time)) return i; this.idle(0.8); }
      if (s.wait) this.idle(s.wait, s.until);
    }
    return -1;
  }

  /** Largest per-tick displacement of an entity (warp detector), in metres per second. */
  maxEntitySpeed(type: EntityType): number {
    let max = 0;
    for (let i = 1; i < this.samples.length; i++) {
      const a = this.samples[i - 1]!.entities.find((e) => e.type === type);
      const b = this.samples[i]!.entities.find((e) => e.type === type);
      if (!a || !b) continue;
      max = Math.max(max, dist2(a.position, b.position) / (this.samples[i]!.t - this.samples[i - 1]!.t));
    }
    return max;
  }

  dispose(): void {
    for (const u of this.unsubs) u();
    this.entities.dispose(); this.interactions.dispose(); this.player.dispose(); this.physics.dispose(); this.events.dispose(); this.rapier.free(); this.hospital.dispose();
  }
}

export async function initRapier(): Promise<void> { await RAPIER.init(); }
