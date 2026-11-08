import type {
  ChaseEndedEvent, EntityBehaviourState, EntitySnapshot, EntitySpawnPoint, FrameContext,
  GameEvents, HidingLocation, HidingStateEvent, LastKnownPlayerPosition, NavigationProvider,
  PatrolRoute, PlayerNoiseEvent, PlayerProvider, Vec3,
} from '../contracts';
import type { CharacterBody, PhysicsAdapter } from '../physics';
import { canHearNoise, canSeePlayer, isObserverSeenByPlayer } from './perception';
import type { EntityProfile } from './profiles';
import { createStateMachine } from './stateMachine';

export interface EntityAgentOptions {
  readonly spawn: EntitySpawnPoint;
  readonly profile: EntityProfile;
  readonly route?: PatrolRoute;
  readonly hidingLocations?: readonly HidingLocation[];
  readonly physics: PhysicsAdapter;
  readonly navigation: NavigationProvider;
  readonly player: PlayerProvider;
  readonly events: GameEvents;
  readonly playerEyeHeights?: { readonly standing: number; readonly crouching: number };
  /** Optional world adapter: nearby doors use the same collision-safe interaction animation. */
  readonly openNearbyDoor?: (position: Vec3, goal: Vec3) => boolean;
  readonly getDoorApproach?: (position: Vec3, goal: Vec3) => Vec3 | null;
}

export interface EntityAgent {
  fixedUpdate(frame: FrameContext, noises?: readonly PlayerNoiseEvent[]): void;
  getSnapshot(): EntitySnapshot;
  witnessesEntry(): boolean;
  stop(reason?: ChaseEndedEvent['reason']): void;
  observeHiding(event: HidingStateEvent): void;
  dispose(): void;
}

const copy = (p: Vec3): Vec3 => ({ x: p.x, y: p.y, z: p.z });
const distance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const horizontalDistance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Reusable perception-driven FSM. Its only movement targets are observations, routes and search samples. */
export function createEntityAgent(options: EntityAgentOptions): EntityAgent {
  const { spawn, profile, physics, navigation, player, events } = options;
  if (spawn.type === 'reflection') throw new Error('The Reflection has no physical entity agent');
  const body: CharacterBody = physics.createCharacter({
    position: spawn.position, radius: profile.agent.radius, height: profile.agent.height,
  });
  let disposed = false;
  let now = 0;
  let yaw = spawn.yaw;
  let grounded = false;
  let verticalSpeed = 0;
  let detectionSeconds = 0;
  let lastSeenTime = -Infinity;
  let lastKnown: LastKnownPlayerPosition | null = null;
  let chase: { id: string; started: number; playerId: string } | null = null;
  let chaseSequence = 0;
  let cooldownUntil = 0;
  let captureDwell = 0;
  let captureCommitted = false;
  // Authored routes need not start beside the spawn. Join at the nearest point
  // instead of requesting a hospital-wide crossing as the very first leg.
  let routeIndex = options.route?.points.reduce((nearest, point, index, points) =>
    distance(spawn.position, point) < distance(spawn.position, points[nearest]!) ? index : nearest, 0) ?? 0;
  let routeDirection = 1;
  let searchIndex = 0;
  let waypoints: readonly Vec3[] = [];
  let waypointIndex = 0;
  let pathGoal: Vec3 | null = null;
  let replanAt = -Infinity;
  let stuckSeconds = 0;
  let bodyMovedThisTick = false;
  let witnessed: { spot: HidingLocation; playerId: string; expires: number; approach: Vec3 | null } | null = null;

  const machine = createStateMachine<EntityBehaviourState>('idle', (previous, current) => {
    waypoints = []; waypointIndex = 0; pathGoal = null; replanAt = -Infinity; stuckSeconds = 0;
    if (current === 'search') searchIndex = 0;
    events.emit('entity:state', { entityId: spawn.entityId, previous, current });
  });

  function position(): Vec3 { return body.getPosition(); }
  function forward(): Vec3 { return { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) }; }
  function visible(): boolean {
    return canSeePlayer({
      observerPosition: position(), observerForward: forward(), eyeHeight: profile.eyeHeight,
      player: player.getSnapshot(), config: profile,
      ...(options.playerEyeHeights ? { standingEyeHeight: options.playerEyeHeights.standing, crouchingEyeHeight: options.playerEyeHeights.crouching } : {}),
      hasLineOfSight: (from, to) => physics.hasLineOfSight(from, to),
    });
  }
  function endChase(reason: ChaseEndedEvent['reason']): void {
    if (!chase) return;
    const ending = chase;
    chase = null;
    captureDwell = 0;
    cooldownUntil = Math.max(cooldownUntil, now + profile.recoverySeconds);
    events.emit('chase:ended', {
      chaseId: ending.id, entityId: spawn.entityId, playerId: ending.playerId, reason, timeSeconds: now,
    });
  }
  function startChase(playerId: string): void {
    if (!chase) {
      chase = { id: `${spawn.entityId}:chase:${++chaseSequence}`, playerId, started: now };
      events.emit('chase:started', {
        chaseId: chase.id, entityId: spawn.entityId, playerId, position: copy(position()), timeSeconds: now,
      });
    }
    machine.transition('pursue');
  }
  function capture(playerId: string, targetPosition: Vec3): void {
    if (captureCommitted || !profile.canCapture) return;
    captureCommitted = true;
    try {
      events.emit('player:captured', {
        playerId, entityId: spawn.entityId, position: copy(targetPosition), timeSeconds: now,
      });
    } finally {
      endChase('captured');
      machine.transition('idle');
    }
  }
  function move(goal: Vec3, speed: number, dt: number, allowed: boolean): boolean {
    const at = position();
    if (distance(at, goal) < 0.22) return true;
    if (!allowed) return false;
    if (now >= replanAt || !pathGoal || distance(pathGoal, goal) > 0.35 || stuckSeconds > 0.6) {
      const openingDoor = options.openNearbyDoor?.(copy(at), copy(goal)) ?? false;
      let path = navigation.findPath({ from: at, to: goal, agent: profile.agent });
      const pathLength = path?.waypoints.reduce((total, point, index, points) =>
        total + (index ? distance(points[index - 1]!, point) : distance(at, point)), 0) ?? Infinity;
      // Prefer operating a reachable doorway to taking a hospital-wide detour
      // around its closed leaf. Every approach still requires a real clear path.
      if (!path || openingDoor || pathLength > distance(at, goal) * 1.8 + 2) {
        const approach = options.getDoorApproach?.(copy(at), copy(goal));
        if (approach) {
          const approachPath = navigation.findPath({ from: at, to: approach, agent: profile.agent });
          if (approachPath && (!path || openingDoor || distance(at, approach) + distance(approach, goal) < pathLength * 0.9)) path = approachPath;
        }
      }
      waypoints = path?.waypoints ?? [];
      waypointIndex = 0;
      pathGoal = copy(goal);
      replanAt = now + profile.pathRefreshSeconds;
      stuckSeconds = 0;
    }
    while (waypointIndex < waypoints.length && distance(position(), waypoints[waypointIndex]!) < 0.2) waypointIndex += 1;
    const target = waypoints[waypointIndex];
    if (!target) return false; // No path means wait/recover, never a direct steering fallback.
    const dx = target.x - at.x;
    const dz = target.z - at.z;
    const length = Math.hypot(dx, dz);
    if (length > 0.001) yaw = Math.atan2(-dx, -dz);
    const travel = Math.min(length, speed * dt);
    bodyMovedThisTick = true;
    const result = body.move({ x: length ? dx / length * travel : 0, y: verticalSpeed * dt, z: length ? dz / length * travel : 0 });
    grounded = result.grounded;
    const actual = horizontalDistance(at, result.position);
    stuckSeconds = travel > 0.005 && actual < travel * 0.1 ? stuckSeconds + dt : 0;
    return distance(position(), goal) < 0.22;
  }
  function advancePatrol(): void {
    const route = options.route;
    if (!route || route.points.length < 2) return;
    if (route.loop) routeIndex = (routeIndex + 1) % route.points.length;
    else {
      if (routeIndex + routeDirection >= route.points.length || routeIndex + routeDirection < 0) routeDirection *= -1;
      routeIndex += routeDirection;
    }
    pathGoal = null;
  }
  function hearing(noises: readonly PlayerNoiseEvent[]): PlayerNoiseEvent | undefined {
    const snapshot = player.getSnapshot();
    return [...noises].filter((noise) => noise.playerId === snapshot.id && canHearNoise({
      observerPosition: position(), noise, config: profile, timeSeconds: now,
      maxAgeSeconds: profile.hearingMaxAgeSeconds, occludedMultiplier: profile.hearingOcclusionMultiplier,
      hasLineOfSight: (from, to) => physics.hasLineOfSight(from, to),
    })).sort((a, b) => b.timeSeconds - a.timeSeconds)[0];
  }
  function hidingApproach(): Vec3 | null {
    if (!witnessed) return null;
    if (witnessed.approach) return witnessed.approach;
    for (const candidate of [...witnessed.spot.exitCandidates].sort((a, b) => distance(position(), a.position) - distance(position(), b.position))) {
      if (!navigation.isPositionValid(candidate.position, profile.agent)) continue;
      const path = navigation.findPath({ from: position(), to: candidate.position, agent: profile.agent });
      if (path?.reachesGoal) {
        witnessed.approach = copy(candidate.position);
        return witnessed.approach;
      }
    }
    return null;
  }

  return {
    fixedUpdate(frame, noises = []) {
      if (disposed) return;
      if (!Number.isFinite(frame.deltaSeconds) || frame.deltaSeconds < 0 || !Number.isFinite(frame.elapsedSeconds)) {
        throw new Error('Invalid entity frame');
      }
      const dt = Math.min(frame.deltaSeconds, 0.25);
      now = frame.elapsedSeconds;
      machine.advance(dt);
      const snapshot = player.getSnapshot();
      if (snapshot.captured || captureCommitted) {
        endChase(snapshot.captured ? 'captured' : 'cancelled');
        machine.transition('idle');
        return;
      }
      if (witnessed && now > witnessed.expires) {
        witnessed = null;
        if (chase && !visible()) {
          endChase('escaped');
          machine.transition('search');
        }
      }
      const seesPlayer = visible();
      if (seesPlayer) {
        detectionSeconds += dt;
        lastSeenTime = now;
        lastKnown = { playerId: snapshot.id, position: copy(snapshot.position), timeSeconds: now, source: 'vision' };
        if (detectionSeconds >= profile.detectionSeconds && now >= cooldownUntil) startChase(snapshot.id);
      } else {
        detectionSeconds = 0;
        const noise = hearing(noises);
        if (noise && !witnessed) {
          lastKnown = { playerId: noise.playerId, position: copy(noise.position), timeSeconds: noise.timeSeconds, source: 'sound' };
          if (!chase) machine.transition('investigate');
        }
      }
      const observed = profile.observationRule === 'unobserved-only' && isObserverSeenByPlayer({
        observerPosition: position(), eyeHeight: profile.eyeHeight, player: snapshot,
        ...(options.playerEyeHeights ? { standingEyeHeight: options.playerEyeHeights.standing, crouchingEyeHeight: options.playerEyeHeights.crouching } : {}),
        hasLineOfSight: (from, to) => physics.hasLineOfSight(from, to),
      });
      const allowedToMove = !observed;
      verticalSpeed = grounded ? -0.4 : Math.max(-12, verticalSpeed - 9.81 * dt);
      bodyMovedThisTick = false;
      const follow = (goal: Vec3, speed: number): boolean => {
        const reached = move(goal, speed, dt, allowedToMove);
        return reached;
      };
      switch (machine.state) {
        case 'idle':
          if (machine.ageSeconds >= profile.idleSeconds && options.route?.points.length) machine.transition('patrol');
          break;
        case 'patrol': {
          const point = options.route?.points[routeIndex];
          if (point && follow(point, profile.patrolSpeed)) advancePatrol();
          break;
        }
        case 'pursue':
          if (!seesPlayer && now - lastSeenTime >= profile.loseSightSeconds) {
            if (witnessed) machine.transition('investigate');
            else {
              endChase('escaped');
              machine.transition('lost-target');
            }
          } else {
            const target = witnessed ? hidingApproach() : lastKnown?.position;
            if (target) follow(target, profile.pursuitSpeed);
          }
          break;
        case 'lost-target':
          if (machine.ageSeconds >= profile.lostTargetSeconds) machine.transition('search');
          break;
        case 'investigate': {
          const target = witnessed ? hidingApproach() : lastKnown?.position;
          if (target) {
            const reached = follow(target, profile.investigateSpeed);
            if (reached && !witnessed) machine.transition('search');
          }
          if (!witnessed && machine.ageSeconds > profile.searchSeconds) machine.transition('search');
          break;
        }
        case 'search': {
          yaw += dt * 0.65;
          if (lastKnown) {
            const angle = searchIndex * Math.PI / 3;
            const offset = searchIndex === 0 ? 0 : profile.searchRadius;
            const goal = { x: lastKnown.position.x + Math.sin(angle) * offset, y: lastKnown.position.y, z: lastKnown.position.z + Math.cos(angle) * offset };
            if (!navigation.isPositionValid(goal, profile.agent) || follow(goal, profile.searchSpeed)) searchIndex = (searchIndex + 1) % 7;
          }
          if (machine.ageSeconds >= profile.searchSeconds) {
            endChase('escaped');
            machine.transition('return-to-patrol');
          }
          break;
        }
        case 'return-to-patrol': {
          const goal = options.route?.points[routeIndex] ?? spawn.position;
          if (follow(goal, profile.patrolSpeed)) machine.transition(options.route?.points.length ? 'patrol' : 'idle');
          break;
        }
      }
      // Keep collision/floor support even while idle or waiting for a path.
      if (!bodyMovedThisTick && allowedToMove) grounded = body.move({ x: 0, y: verticalSpeed * dt, z: 0 }).grounded;
      let canCapture = seesPlayer && machine.state === 'pursue' && distance(position(), snapshot.position) <= profile.captureRange;
      let capturePosition = snapshot.position;
      if (witnessed && chase && snapshot.hiding.spotId === witnessed.spot.id && snapshot.hiding.state !== 'outside') {
        const approach = hidingApproach();
        const eye = { ...position(), y: position().y + profile.eyeHeight };
        const concealedEye = { ...witnessed.spot.playerPosition, y: witnessed.spot.playerPosition.y + 0.7 };
        canCapture = Boolean(approach && distance(position(), approach) < 0.4 &&
          distance(position(), witnessed.spot.playerPosition) <= profile.hidingInspectionRange &&
          physics.hasLineOfSight(eye, concealedEye, witnessed.spot.colliderIds));
        capturePosition = witnessed.spot.playerPosition;
      }
      captureDwell = canCapture && chase && now - chase.started >= profile.captureGraceSeconds ? captureDwell + dt : 0;
      if (captureDwell >= profile.captureDwellSeconds) capture(snapshot.id, capturePosition);
    },
    getSnapshot() {
      return { id: spawn.entityId, type: spawn.type, position: copy(position()), state: machine.state,
        lastKnownPlayer: lastKnown ? { ...lastKnown, position: copy(lastKnown.position) } : null };
    },
    witnessesEntry: visible,
    stop(reason = 'cancelled') {
      if (disposed) return;
      captureCommitted = true;
      endChase(reason);
      machine.transition('idle');
    },
    observeHiding(event) {
      if (disposed || event.playerId !== player.getSnapshot().id) return;
      if (event.current === 'entering' && event.witnessedBy.includes(spawn.entityId)) {
        const spot = options.hidingLocations?.find((value) => value.id === event.spotId);
        if (!spot) return;
        witnessed = { spot, playerId: event.playerId, expires: now + profile.hidingMemorySeconds, approach: null };
        lastKnown = { playerId: event.playerId, position: copy(spot.playerPosition), source: 'witnessed-hiding', timeSeconds: now };
        // Witnessing the action is direct evidence, but capture still requires navigation and a grace/dwell.
        if (!chase && now >= cooldownUntil) startChase(event.playerId);
      } else if (witnessed?.spot.id === event.spotId && event.current === 'outside') {
        witnessed = null;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try { endChase('cancelled'); } finally { body.dispose(); }
    },
  };
}
