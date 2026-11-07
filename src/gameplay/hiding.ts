import type {
  FrameContext, GameEvents, HidingLocation, HidingOccupancy, HidingState, Vec3,
} from '../contracts';
import type { PhysicsAdapter } from '../physics';
import type { PlayerController } from './player';

export interface HidingOptions {
  readonly locations: readonly HidingLocation[];
  readonly player: PlayerController;
  readonly physics: PhysicsAdapter;
  readonly events: GameEvents;
  readonly witnesses?: (spot: HidingLocation) => readonly string[];
  readonly transitionSeconds?: number;
}

export interface HidingSystem {
  enter(spotId: string, timeSeconds: number): boolean;
  exit(timeSeconds: number): boolean;
  fixedUpdate(frame: FrameContext): void;
  getOccupancy(spotId: string): HidingOccupancy;
  dispose(): void;
}

/** Concealment is explicit occupancy, not a universal invisibility flag. */
export function createHidingSystem(options: HidingOptions): HidingSystem {
  const { player, physics, events } = options;
  const duration = options.transitionSeconds ?? 0.35;
  if (!Number.isFinite(duration) || duration < 0) throw new Error('Invalid hiding transition duration');
  const locations = new Map(options.locations.map((spot) => [spot.id, spot]));
  if (locations.size !== options.locations.length) throw new Error('Duplicate hiding location ID');
  let active: HidingLocation | null = null;
  let state: HidingState = 'outside';
  let deadline = 0;
  let witnessedBy: readonly string[] = [];
  let disposed = false;

  function corridorFree(from: Vec3, to: Vec3, ignoreIds: readonly string[]): boolean {
    if (!physics.isSegmentFree(from, to, player.body.radius, player.body.height, ignoreIds, false)) return false;
    const distance = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    const steps = Math.max(1, Math.ceil(distance / Math.max(0.025, player.body.radius / 2)));
    for (let index = 0; index <= steps; index += 1) {
      const t = index / steps;
      if (!player.body.canOccupy({
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
        z: from.z + (to.z - from.z) * t,
      }, player.body.height, ignoreIds)) return false;
    }
    return true;
  }

  function setState(next: HidingState): void {
    if (!active) return;
    const previous = state;
    state = next;
    player.setHiding(next, next === 'outside' ? null : active.id,
      next === 'entering' || next === 'hidden' ? active.cameraPose : undefined);
    events.emit('hiding:state', {
      playerId: player.getSnapshot().id, spotId: active.id, previous, current: next,
      witnessedBy: [...witnessedBy],
    });
  }

  return {
    enter(spotId, timeSeconds) {
      if (disposed || !Number.isFinite(timeSeconds)) return false;
      const snapshot = player.getSnapshot();
      const spot = locations.get(spotId);
      if (!spot || active || snapshot.captured || snapshot.hiding.state !== 'outside') return false;
      const from = player.body.getPosition();
      const eye = snapshot.camera.getWorldPosition(snapshot.camera.position.clone());
      // Ignore only the furniture envelope explicitly assigned to this spot. All other
      // walls, actors and obstacles still have to leave a complete capsule corridor.
      if (!physics.hasSupport(spot.playerPosition, player.body.radius) ||
          !player.body.canOccupy(spot.playerPosition, player.body.height, spot.colliderIds) ||
          !corridorFree(from, spot.playerPosition, spot.colliderIds) ||
          !physics.hasLineOfSight(eye, spot.cameraPose.position, spot.colliderIds)) return false;
      // Determine witnesses before moving the player; observing entry can justify a search.
      witnessedBy = [...new Set(options.witnesses?.(spot) ?? [])];
      active = spot;
      deadline = timeSeconds + duration;
      // Keep the capsule reserved for other actors and moving-door queries.
      // PlayerController restricts motion while hidden. Standalone Rapier capsules
      // have no solver response against the authored furniture envelope, which is
      // explicitly ignored only by this spot's entry/exit corridor validation.
      player.body.setPosition(spot.playerPosition);
      setState('entering');
      return true;
    },
    exit(timeSeconds) {
      if (disposed || !Number.isFinite(timeSeconds) || !active || state !== 'hidden' || player.getSnapshot().captured) return false;
      const from = player.body.getPosition();
      const exit = active.exitCandidates.find((candidate) =>
        player.body.canOccupy(candidate.position) &&
        physics.hasSupport(candidate.position, player.body.radius) &&
        corridorFree(from, candidate.position, active!.colliderIds));
      if (!exit) return false;
      player.body.setPosition(exit.position);
      player.setViewRotation({ yaw: exit.yaw, pitch: 0 });
      player.body.setEnabled(true);
      deadline = timeSeconds + duration;
      setState('exiting');
      return true;
    },
    fixedUpdate(frame) {
      if (disposed || !active || frame.elapsedSeconds < deadline) return;
      if (state === 'entering') setState('hidden');
      else if (state === 'exiting') {
        setState('outside');
        active = null;
        witnessedBy = [];
      }
    },
    getOccupancy(spotId) {
      if (!locations.has(spotId)) throw new Error(`Unknown hiding spot "${spotId}"`);
      const occupied = active?.id === spotId;
      return { spotId, occupantId: occupied ? player.getSnapshot().id : null, state: occupied ? state : 'outside' };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      // The owner disposes the player immediately afterward. Never relocate its
      // reserved capsule into an unvalidated position during teardown.
      active = null;
      witnessedBy = [];
    },
  };
}
