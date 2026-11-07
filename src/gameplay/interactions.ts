import { Matrix4, Quaternion, Raycaster, Vector2, Vector3 } from 'three';
import type { Object3D } from 'three';
import type {
  DoorMarker, DoorState, FrameContext, GameEvents, HidingLocation, HospitalWorld,
  InteractableMarker, InteractionAction, InteractionEvent, InteractionRequest, Pose,
} from '../contracts';
import type { PhysicsAdapter } from '../physics';
import { createHidingSystem } from './hiding';
import type { HidingSystem } from './hiding';
import type { PlayerController } from './player';

export interface InteractionPrompt {
  readonly targetId: string;
  readonly action: InteractionAction;
  readonly text: string;
  readonly available: boolean;
  readonly reason?: string;
}
export interface InteractionOptions {
  readonly world: HospitalWorld;
  readonly player: PlayerController;
  readonly physics: PhysicsAdapter;
  readonly events: GameEvents;
  readonly hasRequirement?: (id: string) => boolean;
  readonly witnesses?: (spot: HidingLocation) => readonly string[];
}
export interface InteractionSystem {
  readonly hiding: HidingSystem;
  getPrompt(): InteractionPrompt | null;
  interact(timeSeconds: number): void;
  fixedUpdate(frame: FrameContext): void;
  getDoorState(id: string): DoorState | undefined;
  dispose(): void;
}

interface DoorRuntime {
  readonly marker: DoorMarker;
  readonly initialInverse: Matrix4;
  readonly colliderMatrices: readonly { id: string; matrix: Matrix4 }[];
  readonly initialLocal: { position: Vector3; rotation: Quaternion; scale: Vector3 };
  progress: number;
  desiredOpen: boolean;
  state: DoorState;
  pending: InteractionRequest | null;
}
const vector = (value: { readonly x: number; readonly y: number; readonly z: number }): Vector3 =>
  new Vector3(value.x, value.y, value.z);
const quaternion = (value: Pose['rotation']): Quaternion => new Quaternion(value.x, value.y, value.z, value.w);
const matrixFor = (pose: Pose): Matrix4 => new Matrix4().compose(vector(pose.position), quaternion(pose.rotation), new Vector3(1, 1, 1));

/** Authoritative interaction checks share the same camera ray for prompts and execution. */
export function createInteractionSystem(options: InteractionOptions): InteractionSystem {
  const { world, player, physics, events } = options;
  const raycaster = new Raycaster();
  const center = new Vector2();
  const markers = new Map(world.interactables.map((marker) => [marker.object, marker]));
  const hiding = createHidingSystem({
    locations: world.hidingLocations, player, physics, events,
    ...(options.witnesses ? { witnesses: options.witnesses } : {}),
  });
  const doors = new Map<string, DoorRuntime>();
  const requests: InteractionRequest[] = [];
  let disposed = false;
  const unsubscribe = events.on('interaction:request', (request) => {
    if (!disposed && requests.length < 32) requests.push({ ...request });
  });

  function setDoorState(door: DoorRuntime, next: DoorState): void {
    if (door.state === next) return;
    const previous = door.state;
    door.state = next;
    events.emit('door:state', { doorId: door.marker.id, previous, current: next });
  }
  function doorPose(door: DoorRuntime, progress: number): Pose {
    const position = vector(door.marker.closedPose.position).lerp(vector(door.marker.openPose.position), progress);
    const rotation = quaternion(door.marker.closedPose.rotation).slerp(quaternion(door.marker.openPose.rotation), progress);
    return { position, rotation };
  }
  function setVisual(door: DoorRuntime, pose: Pose): void {
    const object = door.marker.object;
    object.parent?.updateWorldMatrix(true, false);
    const worldScale = object.getWorldScale(new Vector3());
    const target = new Matrix4().compose(vector(pose.position), quaternion(pose.rotation), worldScale);
    if (object.parent) target.premultiply(object.parent.matrixWorld.clone().invert());
    target.decompose(object.position, object.quaternion, object.scale);
    object.updateMatrixWorld(true);
  }
  function emitResult(request: InteractionRequest, outcome: InteractionEvent['outcome'], reason?: string): void {
    events.emit('interaction:completed', {
      ...request, outcome, ...(reason ? { reason } : {}), position: { ...player.getSnapshot().position },
    });
  }
  function noise(timeSeconds: number): void {
    const snapshot = player.getSnapshot();
    events.emit('player:noise', {
      playerId: snapshot.id, position: { ...snapshot.position }, kind: 'interaction',
      radius: 6, intensity: 0.5, timeSeconds,
    });
  }
  function occupiedDoor(door: DoorRuntime): boolean {
    const snapshot = player.getSnapshot();
    if (!snapshot.hiding.spotId || snapshot.hiding.state === 'outside') return false;
    const spot = world.hidingLocations.find((candidate) => candidate.id === snapshot.hiding.spotId);
    return spot?.colliderIds.some((id) => door.marker.colliderIds.includes(id)) ?? false;
  }
  function findMarker(object: Object3D): InteractableMarker | undefined {
    let current: Object3D | null = object;
    while (current) {
      const marker = markers.get(current);
      if (marker) return marker;
      current = current.parent;
    }
    return undefined;
  }
  function visible(object: Object3D): boolean {
    let current: Object3D | null = object;
    while (current) {
      if (!current.visible) return false;
      current = current.parent;
    }
    return true;
  }
  function target(): InteractableMarker | null {
    const snapshot = player.getSnapshot();
    world.root.updateWorldMatrix(true, true);
    snapshot.camera.updateWorldMatrix(true, false);
    raycaster.setFromCamera(center, snapshot.camera);
    raycaster.far = Math.max(0, ...world.interactables.map((marker) => marker.range));
    const hit = raycaster.intersectObject(world.root, true).find((candidate) => visible(candidate.object));
    if (!hit) return null;
    const marker = findMarker(hit.object);
    if (!marker || hit.distance > marker.range) return null;
    const eye = snapshot.camera.getWorldPosition(new Vector3());
    if (!physics.hasLineOfSight(eye, hit.point, marker.colliderIds ?? [])) return null;
    return marker;
  }
  function promptFor(marker: InteractableMarker): InteractionPrompt {
    const unmet = marker.requirements?.find((requirement) => !options.hasRequirement?.(requirement.id));
    const door = doors.get(marker.id);
    let action: InteractionAction = 'inspect';
    let text = marker.prompt || 'Inspect';
    let reason: string | undefined = unmet?.description;
    if (door) {
      action = door.state === 'open' || door.state === 'opening' || (door.state === 'blocked' && door.desiredOpen) ? 'close' : 'open';
      text = action === 'open' ? 'Open door' : 'Close door';
      if (door.state === 'locked') reason = 'Locked';
      else if (occupiedDoor(door)) reason = 'Hiding place occupied';
    } else if (marker.type === 'locker' || marker.type === 'bed') {
      action = 'enter-hiding';
      text = marker.type === 'bed' ? 'Hide under bed' : 'Hide in locker';
      const spot = world.hidingLocations.find((candidate) => candidate.interactableId === marker.id);
      if (!spot) reason = 'No valid hiding location';
      else if (hiding.getOccupancy(spot.id).occupantId) reason = 'Occupied';
    }
    return { targetId: marker.id, action, text, available: reason === undefined, ...(reason ? { reason } : {}) };
  }
  function getPrompt(): InteractionPrompt | null {
    if (disposed) return null;
    const snapshot = player.getSnapshot();
    if (snapshot.captured) return null;
    if (snapshot.hiding.state !== 'outside') {
      const spot = world.hidingLocations.find((candidate) => candidate.id === snapshot.hiding.spotId);
      if (!spot) return null;
      const available = snapshot.hiding.state === 'hidden';
      return {
        targetId: spot.interactableId, action: 'exit-hiding', text: available ? 'Leave hiding place' : 'Moving into position…',
        available, ...(!available ? { reason: 'Transition in progress' } : {}),
      };
    }
    const marker = target();
    return marker ? promptFor(marker) : null;
  }
  function execute(request: InteractionRequest, timeSeconds: number): void {
    if (disposed || !Number.isFinite(timeSeconds)) return;
    const prompt = getPrompt();
    if (request.playerId !== player.getSnapshot().id || !prompt || prompt.targetId !== request.targetId || prompt.action !== request.action) {
      emitResult(request, 'denied', 'Target or action is not currently available in view');
      return;
    }
    if (!prompt.available) {
      emitResult(request, 'denied', prompt.reason ?? 'Unavailable');
      return;
    }
    if (request.action === 'exit-hiding') {
      const exited = hiding.exit(timeSeconds);
      emitResult(request, exited ? 'completed' : 'blocked', exited ? undefined : 'No safe exit');
      if (exited) noise(timeSeconds);
      return;
    }
    if (request.action === 'enter-hiding') {
      const spot = world.hidingLocations.find((candidate) => candidate.interactableId === request.targetId);
      const entered = !!spot && hiding.enter(spot.id, timeSeconds);
      emitResult(request, entered ? 'completed' : 'blocked', entered ? undefined : 'Hiding position is obstructed');
      if (entered) noise(timeSeconds);
      return;
    }
    const door = doors.get(request.targetId);
    if (door) {
      if (door.pending) emitResult(door.pending, 'blocked', 'Door movement reversed');
      door.pending = request;
      door.desiredOpen = request.action === 'open';
      setDoorState(door, door.desiredOpen ? 'opening' : 'closing');
      noise(timeSeconds);
    } else {
      emitResult(request, 'completed');
      noise(timeSeconds);
    }
  }

  try {
    for (const marker of world.doors) {
      const progress = marker.initialState === 'open' || marker.initialState === 'closing' ? 1 : 0;
      const initialPose = progress === 1 ? marker.openPose : marker.closedPose;
      const door: DoorRuntime = {
        marker, initialInverse: matrixFor(initialPose).invert(),
        colliderMatrices: marker.colliderIds.map((id) => ({ id, matrix: matrixFor(physics.getColliderPose(id)) })),
        initialLocal: { position: marker.object.position.clone(), rotation: marker.object.quaternion.clone(), scale: marker.object.scale.clone() },
        progress, desiredOpen: marker.initialState === 'open' || marker.initialState === 'opening',
        state: marker.initialState, pending: null,
      };
      doors.set(marker.id, door);
      setVisual(door, doorPose(door, progress));
    }
  } catch (error) {
    unsubscribe();
    hiding.dispose();
    throw error;
  }

  return {
    hiding,
    getPrompt,
    interact(timeSeconds) {
      const prompt = getPrompt();
      if (prompt) execute({ playerId: player.getSnapshot().id, targetId: prompt.targetId, action: prompt.action }, timeSeconds);
    },
    fixedUpdate(frame) {
      if (disposed) return;
      hiding.fixedUpdate(frame);
      for (const request of requests.splice(0, 8)) execute(request, frame.elapsedSeconds);
      for (const door of doors.values()) {
        if (door.state !== 'opening' && door.state !== 'closing') continue;
        const goal = door.desiredOpen ? 1 : 0;
        const direction = Math.sign(goal - door.progress);
        const increment = Math.min(Math.abs(goal - door.progress), Math.max(0, frame.deltaSeconds) / door.marker.durationSeconds);
        const angularDistance = quaternion(door.marker.closedPose.rotation).angleTo(quaternion(door.marker.openPose.rotation));
        const linearDistance = vector(door.marker.closedPose.position).distanceTo(vector(door.marker.openPose.position));
        const steps = Math.max(1, Math.ceil(angularDistance * increment / (Math.PI / 90)), Math.ceil(linearDistance * increment / 0.025));
        let blocked = occupiedDoor(door);
        const start = door.progress;
        // Cap per-tick work without enlarging a sweep increment; unfinished motion
        // remains pending for the following fixed tick.
        for (let index = 1; index <= Math.min(steps, 256) && !blocked; index += 1) {
          const progress = start + direction * increment * index / steps;
          const pose = doorPose(door, progress);
          const delta = matrixFor(pose).multiply(door.initialInverse);
          const transforms = door.colliderMatrices.map(({ id, matrix }) => {
            const moved = delta.clone().multiply(matrix);
            const position = new Vector3();
            const rotation = new Quaternion();
            moved.decompose(position, rotation, new Vector3());
            return { id, pose: { position, rotation } };
          });
          if (!physics.trySetColliderPoses(transforms)) blocked = true;
          else {
            door.progress = progress;
            setVisual(door, pose);
          }
        }
        if (blocked) {
          setDoorState(door, 'blocked');
          if (door.pending) emitResult(door.pending, 'blocked', 'Door obstructed');
          door.pending = null;
        } else if (Math.abs(door.progress - goal) < 1e-8) {
          setDoorState(door, door.desiredOpen ? 'open' : 'closed');
          if (door.pending) emitResult(door.pending, 'completed');
          door.pending = null;
        }
      }
    },
    getDoorState(id) { return doors.get(id)?.state; },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      requests.length = 0;
      hiding.dispose();
      for (const door of doors.values()) {
        door.marker.object.position.copy(door.initialLocal.position);
        door.marker.object.quaternion.copy(door.initialLocal.rotation);
        door.marker.object.scale.copy(door.initialLocal.scale);
        door.marker.object.updateMatrixWorld(true);
      }
    },
  };
}
