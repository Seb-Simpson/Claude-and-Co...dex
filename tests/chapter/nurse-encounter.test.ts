import RAPIER from '@dimforge/rapier3d-compat';
import { PerspectiveCamera } from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type {
  ColliderDefinition, EntitySpawnPoint, GameEvents, HidingLocation, NavigationProvider,
  PlayerNoiseEvent, Vec3,
} from '../../src/contracts';
import { createEventBus } from '../../src/integration/events';
import { createPhysicsAdapter, createNavigationProvider } from '../../src/physics';
import { createPlayerController } from '../../src/gameplay/player';
import { createNurseEncounter } from '../../src/entities/nurseEncounter';
import type { NurseAudioCue, NurseEncounterOptions } from '../../src/entities/nurseEncounter';
import type { EntityProfile } from '../../src/entities/profiles';
import { createHospitalWorld } from '../../src/world';

beforeAll(async () => { await RAPIER.init(); });

/** Isolated physical fixture: these coordinates are not production hospital bindings. */
function fixture(config: {
  profile?: Partial<EntityProfile>;
  sealed?: boolean;
  navigation?: (navigation: NavigationProvider) => NavigationProvider;
  doors?: NurseEncounterOptions['doors'];
} = {}) {
  const rapier = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const rotation = { x: 0, y: 0, z: 0, w: 1 };
  const colliders: ColliderDefinition[] = [
    { id: 'floor', bodyType: 'fixed', sensor: false, shape: { type: 'box', halfExtents: { x: 8, y: 0.25, z: 8 } }, pose: { position: { x: 0, y: -0.25, z: 0 }, rotation } },
    { id: 'divider', bodyType: 'fixed', sensor: false, shape: { type: 'box', halfExtents: { x: 0.05, y: 1.25, z: config.sealed ? 8 : 2 } }, pose: { position: { x: 0, y: 1.25, z: 0 }, rotation } },
  ];
  const physics = createPhysicsAdapter(rapier, colliders);
  const actualNavigation = createNavigationProvider(physics, { min: { x: -8, y: -1, z: -8 }, max: { x: 8, y: 4, z: 8 } }, { cellSize: 0.25 });
  const navigation = config.navigation?.(actualNavigation) ?? actualNavigation;
  const events = createEventBus();
  let subscriptions = 0;
  const trackedEvents: GameEvents = {
    on(type, listener) {
      const unsubscribe = events.on(type, listener);
      let active = true;
      subscriptions++;
      return () => { if (active) { active = false; subscriptions--; unsubscribe(); } };
    },
    emit: (type, payload) => events.emit(type, payload),
  };
  const playerSpawn = { position: { x: -2, y: 0.005, z: -3 }, yaw: 0 };
  const player = createPlayerController({
    body: physics.createCharacter({ position: playerSpawn.position, radius: 0.28, height: 1.8 }),
    camera: new PerspectiveCamera(), spawn: playerSpawn, events,
  });
  const spawn: EntitySpawnPoint = {
    id: 'test:nurse-spawn', entityId: 'test:nurse', type: 'nurse',
    position: { x: -2, y: 0.005, z: 3 }, yaw: 0, patrolRouteId: 'test:round',
  };
  const hiding: HidingLocation = {
    id: 'test:hide', interactableId: 'test:locker', type: 'locker', capacity: 1,
    playerPosition: { x: -2, y: 0.005, z: -0.7 },
    cameraPose: { position: { x: -2, y: 0.9, z: -0.7 }, rotation },
    exitCandidates: [{ position: { x: -2, y: 0.005, z: -0.1 }, yaw: 0 }], colliderIds: [],
  };
  const starts: string[] = [];
  const ends: { id: string; reason: string }[] = [];
  const captures: string[] = [];
  const states: string[] = [];
  const audio: NurseAudioCue[] = [];
  events.on('chase:started', (event) => starts.push(event.chaseId));
  events.on('chase:ended', (event) => ends.push({ id: event.chaseId, reason: event.reason }));
  events.on('player:captured', (event) => captures.push(event.entityId));
  events.on('entity:state', (event) => states.push(event.current));
  const nurse = createNurseEncounter({
    spawn, physics, navigation, player, events: trackedEvents, hidingLocations: [hiding],
    route: { id: 'test:round', points: [spawn.position], loop: true },
    profile: {
      visionRange: 0.2, detectionSeconds: 0.1, idleSeconds: 0.1, loseSightSeconds: 0.2,
      lostTargetSeconds: 0.1, searchSeconds: 1, recoverySeconds: 0.3,
      ...config.profile,
    },
    onAudioCue: (cue) => audio.push(cue),
    ...(config.doors ? { doors: config.doors } : {}),
  });
  let time = 0;
  return {
    nurse, player, physics, navigation, events, rapier, spawn, hiding, starts, ends, captures, states, audio,
    get subscriptions() { return subscriptions; },
    get time() { return time; },
    noise(position: Vec3, radius = 7) {
      const event: PlayerNoiseEvent = { playerId: 'player', position, radius, intensity: 1, kind: 'interaction', timeSeconds: time };
      events.emit('player:noise', event);
      return event;
    },
    tick(count = 1, onTick?: (position: Vec3) => void) {
      for (let i = 0; i < count; i++) {
        time += 1 / 60;
        nurse.fixedUpdate({ deltaSeconds: 1 / 60, elapsedSeconds: time });
        rapier.step();
        const snapshot = nurse.getSnapshots()[0];
        if (snapshot) onTick?.(snapshot.position);
      }
    },
    dispose() { nurse.dispose(); player.dispose(); physics.dispose(); events.dispose(); rapier.free(); },
  };
}

describe('Nurse encounter lifecycle around the existing physical AI', () => {
  it('is dormant by default with no capsule, perception or stale noise on activation', () => {
    const f = fixture();
    try {
      const baseline = f.rapier.colliders.len();
      f.noise({ x: -2, y: 0.005, z: 1 });
      f.tick(20);
      expect(f.nurse.phase).toBe('dormant');
      expect(f.nurse.getSnapshots()).toEqual([]);
      expect(f.rapier.colliders.len()).toBe(baseline);
      expect(f.states).toEqual([]);
      expect(f.audio).toEqual([]);
      f.nurse.stage();
      expect(f.nurse.phase).toBe('staged');
      expect(f.rapier.colliders.len()).toBe(baseline);
      f.noise({ x: -2, y: 0.005, z: 1 });
      f.nurse.activate();
      f.nurse.activate();
      expect(f.rapier.colliders.len()).toBe(baseline + 1);
      f.tick(30);
      expect(f.nurse.getSnapshots()[0]?.lastKnownPlayer).toBeNull();
      expect(f.starts).toEqual([]);
    } finally { f.dispose(); }
  });

  it('validates staging and revalidates occupancy at activation without warping an active actor', () => {
    const f = fixture();
    try {
      expect(() => f.nurse.stage({ position: { x: 0, y: 0.005, z: 0 }, yaw: 0 })).toThrow('staging');
      expect(() => f.nurse.stage({ position: { x: -2, y: 2, z: 3 }, yaw: 0 })).toThrow('staging');
      expect(() => f.nurse.stage({ position: { x: Infinity, y: 0, z: 0 }, yaw: 0 })).toThrow('staging');
      expect(f.nurse.phase).toBe('dormant');
      f.nurse.stage();
      const originalPlayer = f.player.body.getPosition();
      f.player.body.setPosition(f.spawn.position);
      expect(() => f.nurse.activate()).toThrow('staging');
      expect(f.nurse.phase).toBe('staged');
      f.player.body.setPosition(originalPlayer);
      f.nurse.activate();
      const before = f.nurse.getSnapshots()[0]?.position;
      expect(() => f.nurse.stage({ position: { x: -5, y: 0.005, z: 3 }, yaw: 0 })).toThrow('active');
      expect(() => f.nurse.reset()).toThrow('dormant');
      expect(f.nurse.getSnapshots()[0]?.position).toEqual(before);
      const placement = f.nurse.getPlacement();
      (placement.position as { x: number }).x = 4;
      expect(f.nurse.getPlacement().position.x).toBe(-2);
    } finally { f.dispose(); }
  });

  it('hears an occluded sound outside close vision and navigates around the real divider', () => {
    const f = fixture({ profile: { searchSeconds: 12 } });
    try {
      const source = { x: 2, y: 0.005, z: 0 };
      f.player.body.setPosition(source);
      f.player.setHiding('hidden', 'test:unseen');
      f.nurse.activate();
      f.noise(source);
      source.x = 6;
      f.player.body.setPosition({ x: -5, y: 0.005, z: -5 });
      f.tick();
      expect(f.nurse.getSnapshots()[0]?.state).toBe('investigate');
      expect(f.nurse.getSnapshots()[0]?.lastKnownPlayer).toEqual(expect.objectContaining({ source: 'sound', position: { x: 2, y: 0.005, z: 0 } }));
      let crossed = false;
      f.tick(420, (position) => {
        if (position.x > 0.35) crossed = true;
        if (Math.abs(position.x) < 0.07) expect(Math.abs(position.z)).toBeGreaterThan(2.29);
        expect(f.physics.isPositionFree(position, 0.3, 1.8, [], false)).toBe(true);
      });
      expect(crossed).toBe(true);
      expect(f.starts).toHaveLength(0);
      expect(f.nurse.getSnapshots()[0]?.lastKnownPlayer?.position.x).toBe(2);
      expect(f.audio.some((cue) => cue.kind === 'listen')).toBe(true);
      expect(f.audio.some((cue) => cue.kind === 'footstep')).toBe(true);
    } finally { f.dispose(); }
  });

  it('has close credible vision and does not alert from an occluded player position', () => {
    const f = fixture({ profile: { visionRange: 3, pursuitSpeed: 0 } });
    try {
      f.player.body.setPosition({ x: 2, y: 0.005, z: 0 });
      f.nurse.activate();
      f.tick(30);
      expect(f.starts).toHaveLength(0);
      f.player.body.setPosition({ x: -2, y: 0.005, z: 1.3 });
      f.tick(12);
      expect(f.nurse.getSnapshots()[0]?.state).toBe('pursue');
      expect(f.starts).toHaveLength(1);
      expect(f.audio.filter((cue) => cue.kind === 'chase')).toHaveLength(1);
    } finally { f.dispose(); }
  });

  it('loses an unseen concealed player, searches the last known position and recovers', () => {
    const f = fixture({ profile: { visionRange: 8, pursuitSpeed: 0, searchSeconds: 0.4, searchSpeed: 0 } });
    try {
      f.nurse.activate();
      f.tick(12);
      expect(f.starts).toHaveLength(1);
      const lastSeen = f.nurse.getSnapshots()[0]!.lastKnownPlayer!.position;
      f.player.body.setPosition({ x: 2, y: 0.005, z: 0 });
      f.player.setHiding('hidden', 'test:unseen');
      f.tick(240);
      expect(f.ends).toEqual([{ id: f.starts[0], reason: 'escaped' }]);
      expect(f.states).toEqual(expect.arrayContaining(['lost-target', 'search', 'return-to-patrol', 'patrol']));
      expect(f.nurse.getSnapshots()[0]?.lastKnownPlayer?.position).toEqual(lastSeen);
      expect(f.captures).toEqual([]);
    } finally { f.dispose(); }
  });

  it('keeps collision and waits instead of steering through a sealed barrier with no valid route', () => {
    const f = fixture({ sealed: true, profile: { searchSeconds: 12 } });
    try {
      f.player.body.setPosition({ x: 2, y: 0.005, z: 0 });
      f.player.setHiding('hidden', 'test:unseen');
      f.nurse.activate();
      f.noise({ x: 2, y: 0.005, z: 0 }, 9);
      const from = f.nurse.getSnapshots()[0]!.position;
      f.tick(240);
      const after = f.nurse.getSnapshots()[0]!;
      expect(after.state).toBe('investigate');
      expect(after.lastKnownPlayer?.source).toBe('sound');
      expect(after.position.x).toBeCloseTo(from.x, 5);
      expect(after.position.z).toBeCloseTo(from.z, 5);
      expect(f.captures).toEqual([]);
    } finally { f.dispose(); }
  });

  it('respects actual capture grace and dwell, then settles one chase and capture', () => {
    const f = fixture({ profile: { visionRange: 3, pursuitSpeed: 0, captureGraceSeconds: 0.4, captureDwellSeconds: 0.25 } });
    try {
      f.player.body.setPosition({ x: -2, y: 0.005, z: 2.3 });
      f.nurse.activate();
      f.tick(30);
      expect(f.starts).toHaveLength(1);
      expect(f.captures).toHaveLength(0);
      f.tick(40);
      expect(f.captures).toEqual(['test:nurse']);
      expect(f.ends).toEqual([{ id: f.starts[0], reason: 'captured' }]);
      f.noise({ x: -2, y: 0.005, z: 1 });
      f.tick(120);
      expect(f.captures).toHaveLength(1);
      expect(f.starts).toHaveLength(1);
    } finally { f.dispose(); }
  });

  it('can inspect a witnessed hiding spot only after physically approaching it', () => {
    const f = fixture({ profile: { visionRange: 6, captureGraceSeconds: 0.4, captureDwellSeconds: 0.25 } });
    try {
      f.player.body.setPosition(f.hiding.playerPosition);
      f.nurse.activate();
      expect(f.nurse.witnessesEntry()).toBe(true);
      f.events.emit('hiding:state', { playerId: 'player', spotId: f.hiding.id, previous: 'outside', current: 'entering', witnessedBy: [f.spawn.entityId] });
      f.player.setHiding('hidden', f.hiding.id);
      f.tick(30);
      expect(f.captures).toHaveLength(0);
      expect(f.nurse.getSnapshots()[0]?.lastKnownPlayer?.source).toBe('witnessed-hiding');
      f.tick(210);
      expect(f.captures).toEqual(['test:nurse']);
      expect(f.ends[0]?.reason).toBe('captured');
    } finally { f.dispose(); }
  });

  it('passes physical door permissions to the real navigation agent without replacing pathfinding', () => {
    const openNearbyDoor = vi.fn(() => false);
    const getDoorApproach = vi.fn(() => null);
    const f = fixture({ profile: { searchSeconds: 12 }, doors: { openNearbyDoor, getDoorApproach } });
    try {
      f.player.setHiding('hidden', 'test:unseen');
      f.nurse.activate();
      f.noise({ x: 2, y: 0.005, z: 0 });
      f.tick(30);
      expect(openNearbyDoor).toHaveBeenCalled();
      expect(getDoorApproach).toHaveBeenCalledWith(expect.objectContaining({ x: expect.any(Number) }), { x: 2, y: 0.005, z: 0 }, true);
      expect(f.nurse.getSnapshots()[0]!.position.z).toBeLessThan(f.spawn.position.z);
    } finally { f.dispose(); }
  });

  it('repeated activation/reset releases capsules and perception with unique settled chase IDs', () => {
    const f = fixture({ profile: { visionRange: 8, pursuitSpeed: 0 } });
    try {
      const baseline = f.rapier.colliders.len();
      for (let run = 0; run < 12; run++) {
        f.nurse.stage();
        expect(() => f.nurse.reset()).toThrow('dormant');
        f.nurse.activate();
        f.tick(12);
        expect(f.rapier.colliders.len()).toBe(baseline + 1);
        f.nurse.deactivate();
        f.nurse.deactivate();
        f.nurse.reset();
        f.noise({ x: -2, y: 0.005, z: 1 });
        expect(f.rapier.colliders.len()).toBe(baseline);
        expect(f.subscriptions).toBe(3);
      }
      expect(f.starts).toHaveLength(12);
      expect(new Set(f.starts).size).toBe(12);
      expect(f.ends.map((event) => event.id)).toEqual(f.starts);
      expect(f.ends.every((event) => event.reason === 'cancelled')).toBe(true);
      expect(f.audio.filter((cue) => cue.kind === 'stop')).toHaveLength(12);
      f.nurse.dispose();
      f.nurse.dispose();
      expect(f.subscriptions).toBe(0);
      expect(f.rapier.colliders.len()).toBe(baseline);
      f.tick(120);
      expect(f.starts).toHaveLength(12);
      expect(() => f.nurse.activate()).toThrow('disposed');
    } finally { f.dispose(); }
  });

  it('offers finite patrol audio hooks and rejects invalid frames', () => {
    const f = fixture();
    try {
      f.nurse.activate();
      f.tick(120);
      expect(f.audio.filter((cue) => cue.kind === 'patrol-hum')).toHaveLength(1);
      expect(f.audio.filter((cue) => cue.kind === 'footstep')).toHaveLength(0);
      expect(() => f.nurse.fixedUpdate({ deltaSeconds: NaN, elapsedSeconds: 3 })).toThrow('frame');
      expect(() => f.nurse.fixedUpdate({ deltaSeconds: -1, elapsedSeconds: 3 })).toThrow('frame');
    } finally { f.dispose(); }
  });

  it('defers capsule disposal safely when a synchronous chase listener deactivates the encounter', () => {
    const f = fixture({ profile: { visionRange: 8 } });
    try {
      const baseline = f.rapier.colliders.len();
      f.events.on('chase:started', () => f.nurse.deactivate());
      f.nurse.activate();
      f.tick(12);
      expect(f.nurse.phase).toBe('dormant');
      expect(f.nurse.getSnapshots()).toEqual([]);
      expect(f.rapier.colliders.len()).toBe(baseline);
      expect(f.ends).toEqual([{ id: f.starts[0], reason: 'cancelled' }]);
      expect(f.audio.filter((cue) => cue.kind === 'stop')).toHaveLength(1);
    } finally { f.dispose(); }
  });

  it('still releases physics and listeners if a chase cleanup consumer throws', () => {
    const f = fixture({ profile: { visionRange: 8, pursuitSpeed: 0 } });
    try {
      const baseline = f.rapier.colliders.len();
      f.nurse.activate();
      f.tick(12);
      f.events.on('chase:ended', () => { throw new Error('presentation failed'); });
      expect(() => f.nurse.dispose()).toThrow('cleanup failed');
      expect(f.nurse.phase).toBe('disposed');
      expect(f.subscriptions).toBe(0);
      expect(f.rapier.colliders.len()).toBe(baseline);
      expect(() => f.nurse.dispose()).not.toThrow();
    } finally { f.dispose(); }
  });

  it('accepts the real hospital Nurse spawn and route without hardcoding their coordinates', () => {
    const hospital = createHospitalWorld({ textures: false });
    const world = hospital.world;
    const spawn = world.entitySpawns.find((candidate) => candidate.type === 'nurse')!;
    const route = world.patrolRoutes.find((candidate) => candidate.id === spawn.patrolRouteId)!;
    const rapier = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const physics = createPhysicsAdapter(rapier, world.colliders);
    const events = createEventBus();
    const player = createPlayerController({
      body: physics.createCharacter({ position: world.playerSpawn.position, radius: 0.28, height: 1.8 }),
      camera: new PerspectiveCamera(), spawn: world.playerSpawn, events,
    });
    const nurse = createNurseEncounter({
      spawn, route, hidingLocations: world.hidingLocations, physics,
      navigation: createNavigationProvider(physics, world.bounds, { cellSize: 0.25 }), player, events,
    });
    try {
      nurse.stage();
      nurse.activate();
      expect(nurse.getSnapshots()[0]?.position).toEqual(spawn.position);
      for (let step = 1; step <= 120; step++) {
        nurse.fixedUpdate({ deltaSeconds: 1 / 60, elapsedSeconds: step / 60 });
        rapier.step();
        expect(physics.isPositionFree(nurse.getSnapshots()[0]!.position, 0.3, 1.8, [], false)).toBe(true);
      }
      expect(nurse.getSnapshots()[0]?.state).toBe('patrol');
      expect(nurse.getSnapshots()[0]?.lastKnownPlayer).toBeNull();
    } finally {
      nurse.dispose(); player.dispose(); physics.dispose(); events.dispose(); rapier.free(); hospital.dispose();
    }
  });
});
