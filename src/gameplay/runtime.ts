import {STATION_RECORD_ID} from './encounters/storyBindings';
import {resolveStationBindings} from './encounters/stationBindings';
import {createStationEncounter} from './encounters/nursesStation';
import type {StationEncounter} from './encounters/nursesStation';
import type { EntityType, FrameContext, GameModule, ModuleContext, ModuleInstance, NavigationProvider, HidingLocation } from '../contracts';
import { createPhysicsAdapter, createNavigationProvider } from '../physics';
import type { PhysicsAdapter, NavigationOptions } from '../physics';
import { createEntitySystem, createEntityPresentation, createDoorNavigationAdapter, ENTITY_PROFILES } from '../entities';
import type { EntitySystem, EntityProfile, EntityPresentation } from '../entities';
import { createBrowserInput } from './input';
import { createPlayerController, DEFAULT_PLAYER_CONFIG } from './player';
import type { PlayerCameraControlLease, PlayerConfig, PlayerController, PlayerInput } from './player';
import { createInteractionSystem } from './interactions';
import type { InteractionSystem } from './interactions';
import { createGameplayHud } from './hud';
import type { GameplayHud } from './hud';
import { resolveOpeningBindings, openingPosition } from './opening/bindings';
import { createOpeningInteractionAdapter, OPENING_INTERACTIONS } from './opening/adapter';
import { createOpeningSequence } from './opening/controller';
import { CHAPTER_ONE_ENTITY_TYPES } from './opening/onboarding';
import { createOpeningState } from './opening/state';
import { createOnboardingGate } from './opening/onboarding';
import type { OpeningPersistence, OpeningSequence } from './opening/controller';
import type { InteractionOptions } from './interactions';

export interface PlayerInputSource {
  readonly locked?: boolean;
  setSuppressed?(value: boolean): void;
  read(): PlayerInput;
  dispose(): void;
}
export interface GameplayOptions {
  readonly openingScene?:import('./opening/scene').OpeningSceneOptions;
  readonly additionalWitnesses?: (spot: HidingLocation) => readonly string[];
  readonly entitiesEnabled?: () => boolean;
  readonly canCapture?: () => boolean;
  readonly activeEntityTypes?: readonly EntityType[];
  readonly onRestart?: () => void;
  readonly inspectionText?: (targetId: string) => string | undefined;
  readonly playerId?: string;
  readonly playerRadius?: number;
  readonly playerConfig?: Partial<PlayerConfig>;
  readonly entityProfiles?: Partial<Record<EntityType, Partial<EntityProfile>>>;
  readonly navigation?: NavigationOptions;
  readonly input?: PlayerInputSource;
  readonly attachControls?: boolean;
  readonly showHud?: boolean;
  readonly hasRequirement?: (id: string) => boolean;
  readonly onNotification?: (message: string) => void;
  readonly openingPersistence?: OpeningPersistence;
  readonly initialDoorStates?: InteractionOptions['initialDoorStates'];
  readonly handleInteraction?: InteractionOptions['handleInteraction'];
}
export interface GameplayRuntime extends ModuleInstance {
  readonly navigation: NavigationProvider;
  readonly station?: StationEncounter;
  readonly player: PlayerController;
  readonly physics: PhysicsAdapter;
  readonly interactions: InteractionSystem;
  readonly entities: EntitySystem;
  readonly presentation: EntityPresentation;
  readonly opening?: OpeningSequence;
  /** Real camera/input lease for a host-driven cinematic. Actor safety remains director-owned. */
  acquireCinematicControl(purpose?:'gameplay'|'capture'): PlayerCameraControlLease | null;
  fixedUpdate(frame: FrameContext): void;
  update(frame: FrameContext): void;
  notify(message: string): void;
  dispose(): void;
}
const idleInput: PlayerInput = { forward: 0, right: 0, sprint: false, crouch: false };

/** Compose owned gameplay/physics/AI implementations using the unmodified shared context. */
export function createGameplayRuntime(context: ModuleContext, options: GameplayOptions = {}): GameplayRuntime {
  const world = context.world;
  if (!world) throw new Error('NIGHT WARD gameplay requires a published HospitalWorld');
  const cleanup: (() => void)[] = [];
  let disposed = false;
  let hud: GameplayHud | undefined;
  function release(): unknown[] {
    if (disposed) return [];
    disposed = true;
    const errors: unknown[] = [];
    for (const dispose of cleanup.reverse()) {
      try { dispose(); } catch (error) { errors.push(error); }
    }
    return errors;
  }
  try {
    const physics = createPhysicsAdapter(context.engine.physics, world.colliders);
    cleanup.push(() => physics.dispose());
    const radius = options.playerRadius ?? 0.28;
    const height = options.playerConfig?.standingHeight ?? DEFAULT_PLAYER_CONFIG.standingHeight;
    if (!physics.isPositionFree(world.playerSpawn.position, radius, height) ||
        !physics.hasSupport(world.playerSpawn.position, radius, 0.2)) {
      throw new Error(`Player spawn in world "${world.id}" is obstructed or unsupported`);
    }
    const body = physics.createCharacter({ position: world.playerSpawn.position, radius, height });
    cleanup.push(() => body.dispose());
    const player = createPlayerController({
      ...(options.playerId === undefined ? {} : { id: options.playerId }),
      headMotion:()=>context.engine.renderer.domElement?.ownerDocument?.documentElement?.classList?.contains('nw-reduce-motion')===false,
      camera: context.engine.camera, body, spawn: world.playerSpawn, events: context.events,
      ...(options.playerConfig === undefined ? {} : { config: options.playerConfig }),
    });
    cleanup.push(() => player.dispose());
    const navigation = createNavigationProvider(physics, world.bounds, options.navigation);
    let entities: EntitySystem | undefined;
    const interactions = createInteractionSystem({
      world, player, physics, events: context.events,
      witnesses: (spot) => [...(entities?.witnessesFor(spot) ?? []),...(options.additionalWitnesses?.(spot) ?? [])],
      ...(options.hasRequirement === undefined ? {} : { hasRequirement: options.hasRequirement }),
      ...(options.initialDoorStates === undefined ? {} : { initialDoorStates: options.initialDoorStates }),
      ...(options.handleInteraction === undefined ? {} : { handleInteraction: options.handleInteraction }),
    });
    cleanup.push(() => interactions.dispose());
    cleanup.push(context.events.on('interaction:completed', (event) => {
      if (event.outcome === 'completed' && event.action === 'inspect') {
        const marker = world.interactables.find((value) => value.id === event.targetId);
        const message = options.inspectionText?.(event.targetId) ?? marker?.prompt ?? 'Nothing useful here.';
        if (!message) return; // Content-owned inspections may already have provided specific feedback.
        hud?.notify(message); options.onNotification?.(message);
      } else if (event.outcome === 'blocked') {
        const message = event.reason ?? 'The way is blocked.';
        hud?.notify(message); options.onNotification?.(message);
      }
    }));
    const captureSubscription = context.events.on('player:captured', (event) => {
      if (event.playerId === player.getSnapshot().id && (options.canCapture?.() ?? true)) player.setCaptured(true);
    });
    cleanup.push(captureSubscription);
    const doors = createDoorNavigationAdapter({
      world, physics, navigation, agent: options.entityProfiles?.patient?.agent ?? ENTITY_PROFILES.patient.agent,
      getDoorState: (id) => interactions.getDoorState(id), requestDoorOpen: (id) => interactions.requestDoorOpen(id),
    });
    entities = createEntitySystem({
      ...doors,
      ...(options.entitiesEnabled ? { enabled: options.entitiesEnabled } : {}),
      world: options.activeEntityTypes ? { ...world, entitySpawns: world.entitySpawns.filter((spawn) => options.activeEntityTypes!.includes(spawn.type)) } : world,
      physics, navigation, player, events: context.events,
      playerEyeHeights: {
        standing: options.playerConfig?.standingEyeHeight ?? DEFAULT_PLAYER_CONFIG.standingEyeHeight,
        crouching: options.playerConfig?.crouchingEyeHeight ?? DEFAULT_PLAYER_CONFIG.crouchingEyeHeight,
      },
      ...(options.entityProfiles === undefined ? {} : { profiles: options.entityProfiles }),
    });
    cleanup.push(() => entities!.dispose());
    const presentation = createEntityPresentation(context.engine.scene, entities);
    cleanup.push(() => presentation.dispose());
    let pendingInteraction = false;
    const canvas = context.engine.renderer.domElement;
    const input = options.input ?? (options.attachControls === false ? null : createBrowserInput({
      element: canvas,
      onLook: (dx, dy) => player.look(dx, dy),
      onInteract: () => { pendingInteraction = true; },
    }));
    let awaitNeutralInput = false;
    let activeControl: PlayerCameraControlLease | null = null;
    function acquireCinematicControl(purpose:'gameplay'|'capture'='gameplay'): PlayerCameraControlLease | null {
      if (disposed) return null;
      const lease = player.acquireCameraControl(purpose);
      if (!lease) return null;
      pendingInteraction = false;
      try { input?.setSuppressed?.(true); }
      catch (error) {
        lease.release();
        try { input?.setSuppressed?.(false); }
        catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Cinematic input suppression failed'); }
        throw error;
      }
      let released = false;
      const release = (): void => {
        if (released) return;
        released = true;
        activeControl = null;
        lease.signal.removeEventListener('abort', release);
        pendingInteraction = false;
        awaitNeutralInput = true;
        try { lease.release(); }
        finally { input?.setSuppressed?.(false); }
      };
      lease.signal.addEventListener('abort', release, { once: true });
      activeControl = { signal: lease.signal,
        handoff: pose => physics.hasSupport(player.getSnapshot().position, player.body.radius, 0.2) && lease.handoff(pose),
        release };
      return activeControl;
    }
    if (input) cleanup.push(() => input.dispose());
    cleanup.push(() => activeControl?.release());
    if (options.showHud !== false && canvas?.ownerDocument) {
      const onGesture = (): void => {
        void context.engine.audio.resume().catch(() => hud?.notify('Audio could not start. Check browser permissions.'));
      };
      canvas.addEventListener('click', onGesture);
      cleanup.push(() => canvas.removeEventListener('click', onGesture));
      hud = createGameplayHud(canvas.ownerDocument, () => canvas.click(), options.onRestart);
      cleanup.push(() => hud!.dispose());
    }
    const runtime: GameplayRuntime = {
      player, physics, navigation, interactions, entities, presentation, acquireCinematicControl,
      fixedUpdate(frame) {
        if (disposed) return;
        const requested = input?.read() ?? idleInput;
        if (awaitNeutralInput && requested.forward === 0 && requested.right === 0 && !requested.crouch && !requested.sprint) awaitNeutralInput = false;
        player.fixedUpdate(frame, player.controlsLocked || awaitNeutralInput ? idleInput : requested);
        if (player.controlsLocked) pendingInteraction = false;
        if (pendingInteraction) {
          pendingInteraction = false;
          interactions.interact(frame.elapsedSeconds);
        }
        interactions.fixedUpdate(frame);
        entities!.fixedUpdate(frame);
      },
      update(frame) {
        if (disposed) return;
        player.update(frame);
        presentation.update();
        const snapshot = player.getSnapshot();
        hud?.update({
          locked: input?.locked ?? false, captured: snapshot.captured,
          hidden: snapshot.hiding.state !== 'outside', prompt: player.controlsLocked ? null : interactions.getPrompt(),
        });
      },
      notify(message) { hud?.notify(message); options.onNotification?.(message); },
      dispose() {
        const errors = release();
        if (errors.length) throw new AggregateError(errors, 'NIGHT WARD gameplay cleanup failed');
      },
    };
    return runtime;
  } catch (error) {
    const errors = release();
    if (errors.length) throw new AggregateError([error, ...errors], 'NIGHT WARD gameplay setup and cleanup failed');
    throw error;
  }
}

/** No-world startup is deliberately inert so the shared foundation fixture remains usable. */
export function createGameplayModule(options: GameplayOptions = {}): GameModule {
  return {
    id: 'night-ward:gameplay', kind: 'gameplay',
    async setup(context) {
      if (!context.world) return { dispose() {} };
      const bindings = resolveOpeningBindings(context.world);
      // Simulation-only hosts use the same core runtime without allocating browser presentation.
      const document = context.engine.renderer.domElement?.ownerDocument;
      if (!bindings || typeof document?.createElement !== 'function') return createGameplayRuntime(context, options);
      const stationBindings = resolveStationBindings(context.world);
      const checkpoint = options.openingPersistence?.load() ?? null;
      const gate = createOnboardingGate();
      gate.sync(checkpoint?.state ?? createOpeningState(), checkpoint !== null);
      const adapter = createOpeningInteractionAdapter(context.world, bindings);
      let station: StationEncounter | undefined;
      let opening: OpeningSequence | undefined;
      let runtime: GameplayRuntime | undefined;
      try {
        runtime = createGameplayRuntime({ ...context, world: adapter.world }, { ...options, showHud: false, activeEntityTypes: CHAPTER_ONE_ENTITY_TYPES, entitiesEnabled: () => !stationBindings && !gate.safe, canCapture: () => station?.canCapture ?? !gate.safe,
          additionalWitnesses: () => station?.witnesses() ?? [],
          initialDoorStates: { [bindings['room-104-door'].doorId!]: checkpoint?.state.doorUnlocked ? 'closed' : 'locked',
            [bindings['room-106-door'].doorId!]: 'locked' },
          handleInteraction: (request, time) => opening?.handleInteraction(request, time) ?? true,
          onNotification: message => opening?.notify(message),
          inspectionText: id => (Object.values(OPENING_INTERACTIONS).some(target => target === id)||id===STATION_RECORD_ID) ? '' : options.inspectionText?.(id),
        });
        if (checkpoint && (checkpoint.station || checkpoint.milestone === 'station-approach' || (checkpoint.narrative?.step??0)>=3)) {
          const destination = checkpoint.station && stationBindings
            ? checkpoint.station.phase === 'complete' ? stationBindings.exit : stationBindings.observation
            : stationBindings && (checkpoint.narrative?.step??0)>=3 ? stationBindings.observation : openingPosition(bindings['station-approach']);
          if (!runtime.player.body.canOccupy(destination) || !runtime.physics.hasSupport(destination, runtime.player.body.radius)) {
            throw new Error('Opening station checkpoint is obstructed or unsupported');
          }
          runtime.player.body.setPosition(destination);
          if (stationBindings) runtime.player.setViewRotation({yaw:Math.atan2(-stationBindings.axis.x,-stationBindings.axis.z),pitch:0});
          runtime.player.update({ deltaSeconds: 0, elapsedSeconds: 0 });
        }
        opening = await createOpeningSequence({ ...context, world: adapter.world }, runtime, bindings, checkpoint,
          options.openingPersistence ? cp => options.openingPersistence!.save(cp) : undefined, gate, options.onRestart,options.openingScene);
        if (stationBindings) {
          const sequence = opening;
          station = createStationEncounter({world:adapter.world,bindings:stationBindings,
            physics:runtime.physics,navigation:runtime.navigation,player:runtime.player,
            interactions:runtime.interactions,events:context.events,
            ...(checkpoint?.station ? {checkpoint:checkpoint.station} : {}),
            eligible:()=>sequence.state.awakened && sequence.state.doorUnlocked && !sequence.cinematic && sequence.narrative.nurseEligible,
            coordinator:sequence.coordinator,canStage:p=>sequence.canStageNurse(p),
            present:pose=>sequence.directNurse(pose),save:cp=>sequence.saveStation(cp),notify:m=>sequence.notify(m)});
        }
        const gameplay = runtime;
        const sequence = opening;
        return { ...gameplay, opening: sequence, ...(station ? {station} : {}),
          fixedUpdate(frame) {gameplay.fixedUpdate(frame); station?.fixedUpdate(frame);},
          update(frame) { gameplay.update(frame); sequence.update(frame.deltaSeconds); },
          dispose() { try { station?.dispose(); } finally {try { sequence.dispose(); } finally { try { gameplay.dispose(); } finally { adapter.dispose(); } }} },
        } satisfies GameplayRuntime;
      } catch (error) { try {station?.dispose();} finally {try { opening?.dispose(); } finally { try { runtime?.dispose(); } finally { adapter.dispose(); } }} throw error; }
    },
  };
}
