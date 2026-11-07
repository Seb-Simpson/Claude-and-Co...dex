import type {
  EntitySnapshot, EntityType, FrameContext, GameEvents, HidingLocation,
  HospitalWorld, NavigationProvider, PlayerNoiseEvent, PlayerProvider,
} from '../contracts';
import type { PhysicsAdapter } from '../physics';
import { createEntityAgent } from './entityAgent';
import type { EntityAgent } from './entityAgent';
import { resolveEntityProfile } from './profiles';
import type { EntityProfile } from './profiles';
import { createReflectionEncounterController } from './reflection';
import type { ReflectionEncounterController } from './reflection';

export interface EntitySystemOptions {
  readonly world: HospitalWorld;
  readonly physics: PhysicsAdapter;
  readonly navigation: NavigationProvider;
  readonly player: PlayerProvider;
  readonly events: GameEvents;
  readonly playerEyeHeights?: { readonly standing: number; readonly crouching: number };
  readonly profiles?: Partial<Record<EntityType, Partial<EntityProfile>>>;
}
export interface EntitySystem {
  readonly reflections: ReflectionEncounterController;
  fixedUpdate(frame: FrameContext): void;
  getSnapshots(): readonly EntitySnapshot[];
  witnessesFor(spot: HidingLocation): readonly string[];
  dispose(): void;
}

/** Assembles metadata-defined actors. No model, light, hospital layout or hidden player locator is created. */
export function createEntitySystem(options: EntitySystemOptions): EntitySystem {
  const { world, physics, navigation, player, events } = options;
  const agents: EntityAgent[] = [];
  const unsubscribers: (() => void)[] = [];
  const reflections = createReflectionEncounterController(events);
  let pendingNoises: PlayerNoiseEvent[] = [];
  let disposed = false;
  let captureReported = false;
  try {
    for (const spawn of world.entitySpawns) {
      if (spawn.type === 'reflection') continue;
      const route = world.patrolRoutes.find((value) => value.id === spawn.patrolRouteId);
      agents.push(createEntityAgent({
        spawn, profile: resolveEntityProfile(spawn.type, options.profiles?.[spawn.type]),
        ...(route ? { route } : {}), hidingLocations: world.hidingLocations,
        physics, navigation, player, events,
        ...(options.playerEyeHeights ? { playerEyeHeights: options.playerEyeHeights } : {}),
      }));
    }
    unsubscribers.push(events.on('player:noise', (noise) => {
      if (disposed || captureReported || pendingNoises.length >= 128) return;
      // Snapshot data at publication so later producer mutation cannot reveal a moving player.
      pendingNoises.push({ ...noise, position: { ...noise.position } });
    }));
    unsubscribers.push(events.on('hiding:state', (event) => {
      if (disposed || captureReported) return;
      for (const agent of agents) agent.observeHiding(event);
    }));
    unsubscribers.push(events.on('player:captured', (event) => {
      if (event.playerId !== player.getSnapshot().id || captureReported) return;
      captureReported = true;
      pendingNoises = [];
      // Settle every pursuer immediately. Ticking stops after capture; leaving other
      // agents to notice it in a future tick would strand their chase lifecycles.
      const errors: unknown[] = [];
      for (const agent of agents) {
        try { agent.stop('captured'); } catch (error) { errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, 'Entity capture settlement failed');
    }));
  } catch (error) {
    for (const unsubscribe of unsubscribers.reverse()) unsubscribe();
    for (const agent of agents.reverse()) agent.dispose();
    reflections.dispose();
    throw error;
  }
  return {
    reflections,
    fixedUpdate(frame) {
      if (disposed) return;
      const noises = pendingNoises;
      pendingNoises = [];
      if (!captureReported) for (const agent of agents) {
        agent.fixedUpdate(frame, noises);
        if (captureReported) break;
      }
      reflections.fixedUpdate(frame);
    },
    getSnapshots() { return agents.map((agent) => agent.getSnapshot()); },
    witnessesFor(spot) {
      if (disposed || captureReported || !world.hidingLocations.includes(spot)) return [];
      return agents.filter((agent) => agent.witnessesEntry()).map((agent) => agent.getSnapshot().id);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pendingNoises = [];
      const errors: unknown[] = [];
      for (const agent of [...agents].reverse()) {
        try { agent.dispose(); } catch (error) { errors.push(error); }
      }
      try { reflections.dispose(); } catch (error) { errors.push(error); }
      for (const unsubscribe of unsubscribers.reverse()) {
        try { unsubscribe(); } catch (error) { errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, 'Entity system disposal failed');
    },
  };
}
