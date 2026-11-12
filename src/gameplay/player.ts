import { Euler, Quaternion, Vector3 } from 'three';
import type { PerspectiveCamera } from 'three';
import type {
  FrameContext, GameEvents, HidingState, PlayerProvider, PlayerSnapshot, Pose,
  SpawnPose, ViewRotation,
} from '../contracts';
import type { CharacterBody } from '../physics';

export interface PlayerInput {
  readonly forward: number;
  readonly right: number;
  readonly sprint: boolean;
  readonly crouch: boolean;
}

export interface PlayerConfig {
  walkSpeed: number;
  sprintSpeed: number;
  crouchSpeed: number;
  acceleration: number;
  deceleration: number;
  gravity: number;
  terminalVelocity: number;
  standingHeight: number;
  crouchingHeight: number;
  standingEyeHeight: number;
  crouchingEyeHeight: number;
  lookSensitivity: number;
  pitchLimit: number;
  cameraHeightSharpness: number;
  hidingCameraSharpness: number;
  footstepDistance: number;
}

export const DEFAULT_PLAYER_CONFIG: Readonly<PlayerConfig> = Object.freeze({
  walkSpeed: 2.4,
  sprintSpeed: 4.3,
  crouchSpeed: 1.1,
  acceleration: 16,
  deceleration: 20,
  gravity: 18,
  terminalVelocity: 35,
  standingHeight: 1.8,
  crouchingHeight: 1.05,
  standingEyeHeight: 1.65,
  crouchingEyeHeight: 0.9,
  lookSensitivity: 0.002,
  pitchLimit: Math.PI / 2 - 0.04,
  cameraHeightSharpness: 14,
  hidingCameraSharpness: 12,
  footstepDistance: 1.25,
});

export interface PlayerController extends PlayerProvider {
  readonly body: CharacterBody;
  readonly controlsLocked: boolean;
  /** Exclusive cinematic camera ownership; collision remains active at the existing feet pose. */
  acquireCameraControl(purpose?:'gameplay'|'capture'): PlayerCameraControlLease | null;
  fixedUpdate(frame: FrameContext, input: PlayerInput): void;
  update(frame: FrameContext): void;
  look(deltaX: number, deltaY: number): void;
  /**
   * Live look sensitivity (radians per pixel) for the settings menu. The vertical value may be
   * negative to invert Y. Defaults come from `config.lookSensitivity`.
   */
  setLookSensitivity(horizontal: number, vertical?: number): void;
  setViewRotation(rotation: ViewRotation): void;
  setCaptured(captured: boolean): void;
  setHiding(state: HidingState, spotId: string | null, cameraPose?: Pose): void;
  dispose(): void;
}

export interface PlayerCameraControlLease {
  /** Capture, hiding or disposal invalidates the lease and its presentation owner. */
  readonly signal: AbortSignal;
  /** Accept only an unoccupied controller eye pose at the existing body; the host validates floor support. */
  handoff(pose: Pose): boolean;
  release(): void;
}

export interface PlayerControllerOptions {
  headMotion?:()=>boolean;
  id?: string;
  camera: PerspectiveCamera;
  body: CharacterBody;
  spawn: SpawnPose;
  events: GameEvents;
  config?: Partial<PlayerConfig>;
}

function approach(value: number, target: number, maximumDelta: number): number {
  return value + Math.max(-maximumDelta, Math.min(maximumDelta, target - value));
}

/** Authoritative motion belongs to fixedUpdate; update only presents the shared camera. */
export function createPlayerController(options: PlayerControllerOptions): PlayerController {
  const config = { ...DEFAULT_PLAYER_CONFIG, ...options.config };
  let lookX = config.lookSensitivity;
  let lookY = config.lookSensitivity;
  for (const [key, value] of Object.entries(config)) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Player ${key} must be finite and positive`);
  }
  if (config.crouchingHeight > config.standingHeight ||
      config.crouchingHeight < options.body.radius * 2 ||
      config.standingEyeHeight >= config.standingHeight ||
      config.crouchingEyeHeight >= config.crouchingHeight ||
      config.pitchLimit >= Math.PI / 2) {
    throw new Error('Invalid player stance dimensions or pitch limit');
  }
  const id = options.id ?? 'player';
  if (!id.trim()) throw new Error('Player ID must not be empty');
  const { camera, body, events } = options;
  let yaw = options.spawn.yaw;
  let pitch = 0;
  let velocityX = 0;
  let velocityZ = 0;
  let verticalSpeed = 0;
  let actualVelocity = { x: 0, y: 0, z: 0 };
  let grounded = false;
  let captured = false;
  let hidingState: HidingState = 'outside';
  let hidingSpotId: string | null = null;
  let hidingPose: Pose | null = null;
  let distanceSinceFootstep = 0, strideDistance=0, bob=0;
  let movement: PlayerSnapshot['movement'] = 'idle';
  let disposed = false;
  let control: AbortController | null = null;
  let eyeHeight = body.height < config.standingHeight - 0.01 ? config.crouchingEyeHeight : config.standingEyeHeight;
  const normalRotation = new Quaternion();
  const targetRotation = new Quaternion();
  const targetPosition = new Vector3();
  const euler = new Euler(0, 0, 0, 'YXZ');
  camera.position.copy(body.getPosition()).add(new Vector3(0, eyeHeight, 0));
  camera.quaternion.setFromEuler(euler.set(pitch, yaw, 0, 'YXZ'));

  function resetVelocity(): void {
    velocityX = 0; velocityZ = 0; verticalSpeed = 0;
    actualVelocity = { x: 0, y: 0, z: 0 };
    distanceSinceFootstep = 0;
  }

  function setViewRotation(rotation: ViewRotation): void {
    if (disposed || control || !Number.isFinite(rotation.yaw) || !Number.isFinite(rotation.pitch)) return;
    yaw = rotation.yaw;
    pitch = Math.max(-config.pitchLimit, Math.min(config.pitchLimit, rotation.pitch));
    if (hidingState === 'outside') camera.quaternion.setFromEuler(euler.set(pitch, yaw, 0, 'YXZ'));
  }

  function invalidateControl(): void {
    const previous = control;
    control = null;
    previous?.abort();
  }

  return {
    body,
    get controlsLocked() { return control !== null; },
    acquireCameraControl(purpose='gameplay') {
      if (disposed || control || (captured && purpose!=='capture') || (!captured && purpose==='capture') || hidingState !== 'outside') return null;
      const lease = new AbortController();
      control = lease;
      resetVelocity();
      movement = 'idle';
      return {
        signal: lease.signal,
        handoff(pose) {
          if (control !== lease || disposed || (captured && purpose!=='capture') || (!captured && purpose==='capture') || hidingState !== 'outside' || !pose?.position || !pose.rotation) return false;
          const p = pose.position;
          const q = pose.rotation;
          if (![p.x, p.y, p.z, q.x, q.y, q.z, q.w].every(Number.isFinite) ||
              Math.abs(Math.hypot(q.x, q.y, q.z, q.w) - 1) > 0.001) return false;
          const feet = body.getPosition();
          if (Math.hypot(p.x - feet.x, p.z - feet.z) > 0.02 ||
              Math.abs(p.y - feet.y - eyeHeight) > 0.02 || !body.canOccupy(feet)) return false;
          targetRotation.set(q.x, q.y, q.z, q.w);
          euler.setFromQuaternion(targetRotation, 'YXZ');
          if (Math.abs(euler.z) > 0.001 || Math.abs(euler.x) > config.pitchLimit) return false;
          yaw = euler.y;
          pitch = euler.x;
          // Set the exact controller pose so its next update cannot snap out of the path.
          camera.position.set(feet.x, feet.y + eyeHeight, feet.z);
          camera.quaternion.setFromEuler(euler.set(pitch, yaw, 0, 'YXZ'));
          camera.updateMatrixWorld();
          return true;
        },
        release() {
          if (control !== lease) return;
          invalidateControl();
          resetVelocity();
          movement = 'idle';
        },
      };
    },
    getSnapshot() {
      const crouching = body.height < config.standingHeight - 0.01;
      return {
        id, position: { ...body.getPosition() }, rotation: { yaw, pitch },
        velocity: { ...actualVelocity }, movement: captured ? 'captured' : hidingState !== 'outside' ? 'hidden' : movement,
        crouching, grounded, hiding: { state: hidingState, spotId: hidingSpotId }, captured, camera,
      };
    },
    fixedUpdate(frame, input) {
      if (disposed) return;
      const dt = frame.deltaSeconds;
      if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1) return;
      if (captured || hidingState !== 'outside' || control) {
        resetVelocity();
        movement = captured ? 'captured' : hidingState !== 'outside' ? 'hidden' : 'idle';
        return;
      }
      const requestedHeight = input.crouch ? config.crouchingHeight : config.standingHeight;
      if (Math.abs(body.height - requestedHeight) > 1e-6) body.setHeight(requestedHeight);
      const crouching = body.height < config.standingHeight - 0.01;
      let forward = Number.isFinite(input.forward) ? Math.max(-1, Math.min(1, input.forward)) : 0;
      let right = Number.isFinite(input.right) ? Math.max(-1, Math.min(1, input.right)) : 0;
      const magnitude = Math.hypot(forward, right);
      if (magnitude > 1) { forward /= magnitude; right /= magnitude; }
      const speed = crouching ? config.crouchSpeed : input.sprint ? config.sprintSpeed : config.walkSpeed;
      const targetX = (-Math.sin(yaw) * forward + Math.cos(yaw) * right) * speed;
      const targetZ = (-Math.cos(yaw) * forward - Math.sin(yaw) * right) * speed;
      const rate = magnitude > 0 ? config.acceleration : config.deceleration;
      velocityX = approach(velocityX, targetX, rate * dt);
      velocityZ = approach(velocityZ, targetZ, rate * dt);
      verticalSpeed = grounded ? -0.5 : Math.max(-config.terminalVelocity, verticalSpeed - config.gravity * dt);
      const previous = body.getPosition();
      const result = body.move({ x: velocityX * dt, y: verticalSpeed * dt, z: velocityZ * dt });
      grounded = result.grounded;
      if (grounded) verticalSpeed = 0;
      actualVelocity = {
        x: (result.position.x - previous.x) / dt,
        y: (result.position.y - previous.y) / dt,
        z: (result.position.z - previous.z) / dt,
      };
      const travelled = Math.hypot(result.position.x - previous.x, result.position.z - previous.z);
      movement = crouching ? 'crouching' : travelled < 0.0001 ? 'idle' : input.sprint ? 'sprinting' : 'walking';
      if (grounded && travelled > 0.0001) {
        distanceSinceFootstep += travelled;strideDistance+=travelled;
        if (distanceSinceFootstep >= config.footstepDistance) {
          distanceSinceFootstep %= config.footstepDistance;
          events.emit('player:noise', {
            playerId: id, position: { ...result.position }, kind: input.sprint && !crouching ? 'sprint' : 'footstep',
            radius: crouching ? 2 : input.sprint ? 15 : 7,
            intensity: crouching ? 0.18 : input.sprint ? 0.95 : 0.55,
            timeSeconds: frame.elapsedSeconds,
          });
        }
      }
    },
    update(frame) {
      if (disposed || control) return;
      const dt = Math.max(0, Math.min(0.1, frame.deltaSeconds));
      const desiredEyeHeight = body.height < config.standingHeight - 0.01 ? config.crouchingEyeHeight : config.standingEyeHeight;
      eyeHeight += (desiredEyeHeight - eyeHeight) * (1 - Math.exp(-config.cameraHeightSharpness * dt));
      // Stance shrinking is immediate for collision, while eye height normally eases.
      // Clamp the eye immediately when an overhead obstacle would intersect that ease.
      if (hidingState === 'outside' || hidingState === 'exiting') {
        const feet = body.getPosition();
        const minimum = body.radius * 2;
        if (!body.canOccupy(feet, Math.max(minimum, eyeHeight + 0.08))) {
          let low = minimum;
          let high = Math.max(minimum, eyeHeight + 0.08);
          for (let iteration = 0; iteration < 10; iteration += 1) {
            const middle = (low + high) / 2;
            if (body.canOccupy(feet, middle)) low = middle; else high = middle;
          }
          eyeHeight = Math.min(eyeHeight, Math.max(0, low - 0.08));
        }
      }
      normalRotation.setFromEuler(euler.set(pitch, yaw, 0, 'YXZ'));
      if ((hidingState === 'entering' || hidingState === 'hidden') && hidingPose) {
        targetPosition.copy(hidingPose.position);
        targetRotation.copy(hidingPose.rotation);
        const blend = 1 - Math.exp(-config.hidingCameraSharpness * dt);
        camera.position.lerp(targetPosition, blend);
        camera.quaternion.slerp(targetRotation, blend);
      } else if (hidingState === 'exiting') {
        targetPosition.copy(body.getPosition()).add(new Vector3(0, eyeHeight, 0));
        const blend = 1 - Math.exp(-config.hidingCameraSharpness * dt);
        camera.position.lerp(targetPosition, blend);
        camera.quaternion.slerp(normalRotation, blend);
      } else {
        const position = body.getPosition();
        const moving=grounded&&!captured&&movement==='walking'||grounded&&!captured&&movement==='sprinting';
        const desired=options.headMotion?.()&&moving ? -.008*(.5-.5*Math.cos(strideDistance*Math.PI*2/config.footstepDistance)) : 0;
        bob=options.headMotion?.()?bob+(desired-bob)*(1-Math.exp(-12*dt)):0;
        camera.position.set(position.x, position.y + eyeHeight + bob, position.z);
        camera.quaternion.copy(normalRotation);
      }
      camera.updateMatrixWorld();
    },
    look(deltaX, deltaY) {
      if (disposed || control || captured || hidingState !== 'outside' || !Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;
      setViewRotation({ yaw: yaw - deltaX * lookX, pitch: pitch - deltaY * lookY });
    },
    setLookSensitivity(horizontal, vertical = horizontal) {
      if (Number.isFinite(horizontal) && Number.isFinite(vertical)) { lookX = horizontal; lookY = vertical; }
    },
    setViewRotation,
    setCaptured(value) {
      captured = value;
      if (value) invalidateControl();
      resetVelocity();
      if (value) movement = 'captured';
      else movement = hidingState === 'outside' ? 'idle' : 'hidden';
    },
    setHiding(state, spotId, cameraPose) {
      if (state !== 'outside') invalidateControl();
      hidingState = state;
      hidingSpotId = state === 'outside' ? null : spotId;
      if (cameraPose) hidingPose = cameraPose;
      if (state === 'outside') hidingPose = null;
      resetVelocity();
      movement = state === 'outside' ? 'idle' : 'hidden';
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      invalidateControl();
      resetVelocity();
      body.dispose();
    },
  };
}
