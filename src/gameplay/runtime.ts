import type { EntityType, FrameContext, GameModule, ModuleContext, ModuleInstance } from '../contracts';
import { createPhysicsAdapter, createNavigationProvider } from '../physics';
import type { PhysicsAdapter, NavigationOptions } from '../physics';
import { createEntitySystem, createEntityPresentation, createDoorNavigationAdapter, ENTITY_PROFILES } from '../entities';
import type { EntitySystem, EntityProfile, EntityPresentation } from '../entities';
import { createBrowserInput } from './input';
import { createPlayerController, DEFAULT_PLAYER_CONFIG } from './player';
import type { PlayerConfig, PlayerController, PlayerInput } from './player';
import { createInteractionSystem } from './interactions';
import type { InteractionSystem } from './interactions';
import { createGameplayHud } from './hud';
import type { GameplayHud } from './hud';

export interface PlayerInputSource {
  readonly locked?: boolean;
  read(): PlayerInput;
  dispose(): void;
}
export interface GameplayOptions {
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
}
export interface GameplayRuntime extends ModuleInstance {
  readonly player: PlayerController;
  readonly physics: PhysicsAdapter;
  readonly interactions: InteractionSystem;
  readonly entities: EntitySystem;
  readonly presentation: EntityPresentation;
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
      camera: context.engine.camera, body, spawn: world.playerSpawn, events: context.events,
      ...(options.playerConfig === undefined ? {} : { config: options.playerConfig }),
    });
    cleanup.push(() => player.dispose());
    const navigation = createNavigationProvider(physics, world.bounds, options.navigation);
    let entities: EntitySystem | undefined;
    const interactions = createInteractionSystem({
      world, player, physics, events: context.events,
      witnesses: (spot) => entities?.witnessesFor(spot) ?? [],
      ...(options.hasRequirement === undefined ? {} : { hasRequirement: options.hasRequirement }),
    });
    cleanup.push(() => interactions.dispose());
    cleanup.push(context.events.on('interaction:completed', (event) => {
      if (event.outcome === 'completed' && event.action === 'inspect') {
        const marker = world.interactables.find((value) => value.id === event.targetId);
        hud?.notify(options.inspectionText?.(event.targetId) ?? marker?.prompt ?? 'Nothing useful here.');
      } else if (event.outcome === 'blocked') hud?.notify(event.reason ?? 'The way is blocked.');
    }));
    const captureSubscription = context.events.on('player:captured', (event) => {
      if (event.playerId === player.getSnapshot().id) player.setCaptured(true);
    });
    cleanup.push(captureSubscription);
    const doors = createDoorNavigationAdapter({
      world, physics, navigation, agent: options.entityProfiles?.patient?.agent ?? ENTITY_PROFILES.patient.agent,
      getDoorState: (id) => interactions.getDoorState(id), requestDoorOpen: (id) => interactions.requestDoorOpen(id),
    });
    entities = createEntitySystem({
      ...doors,
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
    if (input) cleanup.push(() => input.dispose());
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
      player, physics, interactions, entities, presentation,
      fixedUpdate(frame) {
        if (disposed) return;
        player.fixedUpdate(frame, input?.read() ?? idleInput);
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
          hidden: snapshot.hiding.state !== 'outside', prompt: interactions.getPrompt(),
        });
      },
      notify(message) { hud?.notify(message); },
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
    setup(context) {
      if (!context.world) return { dispose() {} };
      return createGameplayRuntime(context, options);
    },
  };
}
