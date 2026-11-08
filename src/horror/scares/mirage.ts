import { Group, type Object3D, Vector3 } from 'three';
import type { SightlineAnchor } from '../../world/extras';
import { createEntityVisual, type EntityVisual } from '../entities/visual';

export interface MirageContext {
  readonly camera: Vector3;
  readonly forward: Vector3;
  /** True when nothing solid blocks the line from the camera to the point. */
  readonly clearLine: (from: Vector3, to: Vector3) => boolean;
  /** Real entity positions: a mirage never appears near an actual entity. */
  readonly entities: readonly Vector3[];
  /** Whether the ward is calm enough (no chase, no search). */
  readonly calm: boolean;
}

export type MirageEvent = { readonly type: 'appear' | 'vanish'; readonly anchor: SightlineAnchor; readonly position: Vector3 };

/**
 * Distant silhouettes: a still figure glimpsed at the far end of a long sight line, gone when
 * the light stutters or you come closer. It is NOT an entity — no collision, no AI, no effect on
 * gameplay — and it never appears near a real entity. It reuses the Watcher's body.
 */
export class SilhouetteMirage {
  private readonly visual: EntityVisual;
  private readonly root = new Group();
  private active: SightlineAnchor | null = null;
  private shownAt = 0;
  private holdFor = 0;
  private time = 0;
  private nextAllowed: number;
  private opacity = 0;
  private fadingOut = false;
  enabled = true;

  constructor(parent: Object3D, private readonly anchors: readonly SightlineAnchor[], private readonly random: () => number = Math.random) {
    this.visual = createEntityVisual('watcher', { seed: 77 });
    this.root.name = 'nw:mirage';
    this.root.add(this.visual.object);
    this.root.visible = false;
    parent.add(this.root);
    this.nextAllowed = 70 + this.random() * 60;
  }

  get showing(): SightlineAnchor | null { return this.active; }

  /** Try to stage a sighting now (ignores cooldown). Returns the anchor used, if any. */
  trigger(ctx: MirageContext): SightlineAnchor | null {
    const candidates = this.anchors.filter((a) => {
      const to = a.position.clone().setY(1.6).sub(ctx.camera);
      const d = to.length();
      if (d < 13 || d > 34) return false;
      if (to.normalize().dot(ctx.forward) < 0.82) return false;
      if (ctx.entities.some((e) => e.distanceTo(a.position) < 7)) return false;
      return ctx.clearLine(ctx.camera, a.position.clone().setY(1.6));
    });
    const anchor = candidates[Math.floor(this.random() * candidates.length)];
    if (!anchor) return null;
    this.active = anchor;
    this.shownAt = this.time;
    this.holdFor = 2.5 + this.random() * 3;
    this.fadingOut = false;
    this.opacity = 0;
    this.root.position.copy(anchor.position);
    this.root.rotation.set(0, anchor.yaw, 0);
    this.visual.forceState('stand', Math.floor(this.random() * 4));
    this.root.visible = true;
    return anchor;
  }

  /** Begin vanishing (the caller pairs this with a light dropout). */
  vanish(): void { if (this.active) this.fadingOut = true; }

  update(dt: number, ctx: MirageContext): MirageEvent | null {
    this.time += dt;
    let event: MirageEvent | null = null;
    if (!this.active) {
      if (this.enabled && ctx.calm && this.time >= this.nextAllowed) {
        const anchor = this.trigger(ctx);
        if (anchor) event = { type: 'appear', anchor, position: anchor.position.clone() };
        else this.nextAllowed = this.time + 4;
      }
    } else {
      const anchor = this.active;
      const d = anchor.position.distanceTo(new Vector3(ctx.camera.x, 0, ctx.camera.z));
      const expired = this.time - this.shownAt > this.holdFor;
      if (!this.fadingOut && (expired || d < 10 || !ctx.calm || ctx.entities.some((e) => e.distanceTo(anchor.position) < 6))) {
        this.fadingOut = true;
        event = { type: 'vanish', anchor, position: anchor.position.clone() };
      }
      // Appears slowly, leaves almost at once (during the light dropout).
      this.opacity += ((this.fadingOut ? 0 : 1) - this.opacity) * Math.min(1, dt * (this.fadingOut ? 9 : 1.2));
      this.visual.setOpacity(this.opacity);
      this.visual.update(dt, { behaviour: 'idle', speed: 0, observed: true });
      if (this.fadingOut && this.opacity < 0.02) {
        this.root.visible = false;
        this.active = null;
        this.nextAllowed = this.time + 110 + this.random() * 120;
      }
    }
    return event;
  }

  dispose(): void {
    this.visual.dispose();
    this.root.removeFromParent();
  }
}
