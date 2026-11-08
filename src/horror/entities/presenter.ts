import { type Camera, Frustum, Matrix4, type Object3D, Vector3 } from 'three';
import type { EntityBehaviourState, EntityType } from '../../contracts';
import type { JointName } from './rig';
import { type BodiedEntityType, createEntityVisual, type EntityVisual } from './visual';

/** One gameplay-owned entity transform, as published by NW-001B's presentation bridge. */
export interface EntityNodeRecord {
  readonly id: string;
  readonly type: EntityType;
  readonly behaviour: EntityBehaviourState;
  /** Feet-position node, facing -Z along travel. Read-only for presentation. */
  readonly node: Object3D;
}

export type EntityNodeSource = () => Iterable<EntityNodeRecord>;

const BEHAVIOURS: readonly EntityBehaviourState[] = ['idle', 'patrol', 'investigate', 'search', 'pursue', 'lost-target', 'return-to-patrol'];
const TYPES: readonly EntityType[] = ['patient', 'nurse', 'crawler', 'watcher', 'reflection'];

/**
 * Reads NW-001B's model-binding nodes (`night-ward:entity:<id>` under `night-ward:entities`,
 * with `userData.entityId`, `entityType`, `behaviourState`). Nothing is imported from gameplay.
 */
export function sceneEntityNodes(scene: Object3D, rootName = 'night-ward:entities'): EntityNodeSource {
  return function* () {
    const root = scene.getObjectByName(rootName);
    if (!root) return;
    for (const node of root.children) {
      const data = node.userData as { entityId?: unknown; entityType?: unknown; behaviourState?: unknown };
      if (typeof data.entityId !== 'string' || !TYPES.includes(data.entityType as EntityType)) continue;
      const behaviour = BEHAVIOURS.includes(data.behaviourState as EntityBehaviourState) ? (data.behaviourState as EntityBehaviourState) : 'idle';
      yield { id: data.entityId, type: data.entityType as EntityType, behaviour, node };
    }
  };
}

export interface PresentedEntity {
  readonly id: string;
  readonly type: BodiedEntityType;
  readonly node: Object3D;
  readonly visual: EntityVisual;
  behaviour: EntityBehaviourState;
  /** Smoothed horizontal speed measured from the node (m/s). */
  speed: number;
  /** World feet position (copied from the node each frame). */
  readonly position: Vector3;
  readonly head: Vector3;
  distance: number;
  /** In view and not blocked by walls. */
  observed: boolean;
  /** A wall blocks the line between camera and head. */
  occluded: boolean;
  observedFor: number;
  unobservedFor: number;
}

export interface EntityPresenterOptions {
  readonly source: EntityNodeSource;
  readonly camera: Camera;
  /** Door hinge / opening points, used for the Patient's doorway observation pose. */
  readonly doorways?: readonly Vector3[];
  /** Returns true when nothing solid lies between the points. Defaults to always clear. */
  readonly lineOfSight?: (from: Vector3, to: Vector3) => boolean;
  readonly onFootstep?: (entity: PresentedEntity, bone: JointName, position: Vector3) => void;
  /** Entity becomes visible after a long absence (far away): a distant reveal moment. */
  readonly onReveal?: (entity: PresentedEntity) => void;
  /** A visible entity slips out of sight behind geometry. */
  readonly onLostSight?: (entity: PresentedEntity) => void;
  /** Seconds between line-of-sight checks per entity. */
  readonly sightInterval?: number;
  /**
   * Builds the body for an entity. Defaults to the procedural body; the horror module passes a
   * factory that returns the animated Blender model and falls back per entity.
   */
  readonly createVisual?: (type: BodiedEntityType, seed: number) => EntityVisual;
}

/**
 * Attaches a visual under every gameplay entity node and animates it from authoritative behaviour
 * plus measured motion. It reads node transforms; it never writes them, never moves an entity,
 * never decides detection, chase or capture.
 */
export class EntityPresenter {
  private readonly entities = new Map<string, PresentedEntity & { lastPos: Vector3; nextSight: number; seenOnce: boolean }>();
  private readonly frustum = new Frustum();
  private readonly projection = new Matrix4();
  private readonly cam = new Vector3();
  private time = 0;
  private disposed = false;

  constructor(private readonly options: EntityPresenterOptions) {}

  get list(): readonly PresentedEntity[] { return [...this.entities.values()]; }
  get(id: string): PresentedEntity | undefined { return this.entities.get(id); }

  update(dt: number): readonly PresentedEntity[] {
    if (this.disposed) return [];
    const step = Math.max(1e-4, Math.min(dt, 0.1));
    this.time += step;
    const camera = this.options.camera;
    camera.updateMatrixWorld();
    camera.getWorldPosition(this.cam);
    this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection);
    const present = new Set<string>();
    for (const record of this.options.source()) {
      if (record.type === 'reflection') continue;
      present.add(record.id);
      let e = this.entities.get(record.id);
      const pos = record.node.getWorldPosition(new Vector3());
      if (!e || e.node !== record.node) {
        if (e) this.release(e);
        const seed = hashId(record.id);
        const visual = this.options.createVisual ? this.options.createVisual(record.type, seed) : createEntityVisual(record.type, { seed });
        record.node.add(visual.object);
        e = {
          id: record.id, type: record.type, node: record.node, visual, behaviour: record.behaviour, speed: 0,
          position: pos.clone(), head: pos.clone(), distance: pos.distanceTo(this.cam), observed: false, occluded: false,
          observedFor: 0, unobservedFor: 1e3, lastPos: pos.clone(), nextSight: 0, seenOnce: false,
        };
        this.entities.set(record.id, e);
      }
      e.behaviour = record.behaviour;
      const moved = Math.hypot(pos.x - e.lastPos.x, pos.z - e.lastPos.z);
      const instant = moved > 2 ? 0 : moved / step;
      e.speed += (instant - e.speed) * Math.min(1, step * 8);
      e.lastPos.copy(pos);
      e.position.copy(pos);
      e.distance = pos.distanceTo(this.cam);
      const nearDoor = (this.options.doorways ?? []).some((d) => Math.hypot(d.x - pos.x, d.z - pos.z) < 1.1);
      const events = e.visual.update(step, { behaviour: e.behaviour, speed: e.speed, nearDoor, observed: e.observed });
      e.visual.bonePosition('head', e.head);
      // Sight: frustum each frame, wall occlusion on a throttle.
      if (this.time >= e.nextSight) {
        e.nextSight = this.time + (this.options.sightInterval ?? 0.25);
        e.occluded = this.options.lineOfSight ? !this.options.lineOfSight(this.cam, e.head) : false;
      }
      const inView = e.distance < 45 && this.frustum.containsPoint(e.head);
      const wasObserved = e.observed;
      e.observed = inView && !e.occluded;
      if (e.observed) {
        if (!wasObserved && e.unobservedFor > 20 && e.distance > 10 && e.seenOnce !== undefined) this.options.onReveal?.(e);
        e.observedFor += step;
        e.unobservedFor = 0;
        e.seenOnce = true;
      } else {
        if (wasObserved && e.observedFor > 0.6 && e.occluded && e.distance < 16) this.options.onLostSight?.(e);
        e.unobservedFor += step;
        e.observedFor = 0;
      }
      for (const ev of events) {
        const p = e.visual.bonePosition(ev.bone);
        p.y = pos.y;
        this.options.onFootstep?.(e, ev.bone, p);
      }
    }
    for (const [id, e] of this.entities) if (!present.has(id)) { this.release(e); this.entities.delete(id); }
    return this.list;
  }

  private release(e: PresentedEntity): void {
    e.visual.dispose();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const e of this.entities.values()) this.release(e);
    this.entities.clear();
  }
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 997;
}
