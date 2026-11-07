import { Group, PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type {
  EntitySpawnPoint, GameEvents, HidingLocation, HospitalWorld, NavigationProvider,
  PlayerSnapshot, Vec3,
} from '../../src/contracts';
import { createEventBus } from '../../src/integration/events';
import type { CharacterBody, PhysicsAdapter } from '../../src/physics';
import { createEntitySystem, createStateMachine, ENTITY_PROFILES, resolveEntityProfile } from '../../src/entities';
import type { EntityProfile } from '../../src/entities';

function fixture(overrides: Partial<EntityProfile> = {}, spawnOverrides: Partial<EntitySpawnPoint> = {}, options: { additionalSpawns?: readonly EntitySpawnPoint[]; playerEyeHeights?: { standing: number; crouching: number } } = {}) {
  let snapshot: PlayerSnapshot = {
    id: 'player', position: { x: 0, y: 0, z: -5 }, rotation: { yaw: 0, pitch: 0 },
    velocity: { x: 0, y: 0, z: 0 }, movement: 'idle', crouching: false, grounded: true,
    hiding: { state: 'outside', spotId: null }, captured: false, camera: new PerspectiveCamera(),
  };
  const bodies: { position: Vec3; disposed: boolean }[] = [];
  const physics: PhysicsAdapter = {
    createCharacter: vi.fn((options) => {
      const record = { position: { ...options.position }, disposed: false };
      bodies.push(record);
      const body: CharacterBody = {
        radius: options.radius, height: options.height,
        getPosition: () => ({ ...record.position }),
        move: (delta) => {
          record.position = { x: record.position.x + delta.x, y: Math.max(0, record.position.y + delta.y), z: record.position.z + delta.z };
          return { position: { ...record.position }, grounded: record.position.y === 0 };
        },
        canOccupy: () => true, setHeight: () => true,
        setPosition: (value) => { record.position = { ...value }; }, setEnabled: () => {},
        dispose: () => { record.disposed = true; },
      };
      return body;
    }),
    isPositionFree: () => true, isSegmentFree: () => true, hasLineOfSight: vi.fn(() => true),
    findGround: (position) => ({ ...position, y: 0 }), hasSupport: () => true,
    getColliderPose: () => ({ position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } }),
    trySetColliderPoses: () => true, dispose: () => {},
  };
  const navigation: NavigationProvider = {
    findPath: vi.fn((query) => ({ waypoints: [query.to], reachesGoal: true })),
    hasLineOfSight: (query) => physics.hasLineOfSight(query.from, query.to),
    isPositionValid: () => true,
  };
  const hiding: HidingLocation = {
    id: 'locker:spot', interactableId: 'locker', type: 'locker', capacity: 1,
    playerPosition: { x: 0, y: 0, z: -0.7 },
    cameraPose: { position: { x: 0, y: 0.9, z: -0.7 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    exitCandidates: [{ position: { x: 0, y: 0, z: -0.6 }, yaw: 0 }], colliderIds: ['locker-body'],
  };
  const world: HospitalWorld = {
    id: 'test-world', root: new Group(), bounds: { min: { x: -20, y: -1, z: -20 }, max: { x: 20, y: 5, z: 20 } },
    rooms: [], colliders: [], interactables: [], doors: [], hidingLocations: [hiding],
    entitySpawns: [{ id: 'spawn', entityId: 'patient', type: 'patient', position: { x: 0, y: 0, z: 0 }, yaw: 0, ...spawnOverrides }, ...(options.additionalSpawns ?? [])],
    patrolRoutes: [], playerSpawn: { position: { x: 0, y: 0, z: -5 }, yaw: 0 },
  };
  const events = createEventBus();
  const starts: string[] = [];
  const ends: { reason: string; id: string }[] = [];
  const captures: string[] = [];
  const states: string[] = [];
  events.on('chase:started', (event) => starts.push(event.chaseId));
  events.on('chase:ended', (event) => ends.push({ reason: event.reason, id: event.chaseId }));
  events.on('player:captured', (event) => captures.push(event.entityId));
  events.on('entity:state', (event) => states.push(event.current));
  const system = createEntitySystem({ world, physics, navigation, player: { getSnapshot: () => snapshot }, events,
    profiles: { [spawnOverrides.type ?? 'patient']: overrides },
    ...(options.playerEyeHeights ? { playerEyeHeights: options.playerEyeHeights } : {}),
  });
  let time = 0;
  return { world, system, physics, navigation, bodies, events, starts, ends, captures, states, hiding,
    get snapshot() { return snapshot; },
    setPlayer: (patch: Partial<PlayerSnapshot>) => { snapshot = { ...snapshot, ...patch }; },
    tick: (count = 1, dt = 0.1) => {
      for (let i = 0; i < count; i += 1) { time += dt; system.fixedUpdate({ deltaSeconds: dt, elapsedSeconds: time }); }
    },
  };
}

const listen = (events: GameEvents) => {
  const seen: boolean[] = [];
  events.on('horror:reflection', (event) => seen.push(event.visible));
  return seen;
};

describe('reusable entity FSM', () => {
  it('tracks state age and emits only real transitions', () => {
    const transition = vi.fn();
    const machine = createStateMachine<'idle' | 'patrol'>('idle', transition);
    machine.advance(0.5);
    expect(machine.ageSeconds).toBe(0.5);
    expect(machine.transition('idle')).toBe(false);
    expect(machine.transition('patrol')).toBe(true);
    expect(machine.ageSeconds).toBe(0);
    expect(transition).toHaveBeenCalledExactlyOnceWith('idle', 'patrol');
    expect(() => machine.advance(-1)).toThrow();
  });

  it('requires sustained credible sight, then starts one chase', () => {
    const f = fixture({ detectionSeconds: 0.3, pursuitSpeed: 0 });
    f.tick(2);
    expect(f.starts).toHaveLength(0);
    f.tick(1);
    expect(f.system.getSnapshots()[0]?.state).toBe('pursue');
    f.tick(4);
    expect(f.starts).toHaveLength(1);
    f.system.dispose();
  });

  it('loses sight, ends pursuit once, searches known space and returns to patrol', () => {
    const f = fixture({ detectionSeconds: 0.1, pursuitSpeed: 0, loseSightSeconds: 0.2,
      lostTargetSeconds: 0.1, searchSeconds: 0.3, searchSpeed: 0, recoverySeconds: 0.2 });
    f.tick();
    vi.mocked(f.physics.hasLineOfSight).mockReturnValue(false);
    f.tick(12);
    expect(f.states).toEqual(expect.arrayContaining(['pursue', 'lost-target', 'search', 'return-to-patrol', 'idle']));
    expect(f.ends).toEqual([{ reason: 'escaped', id: f.starts[0] }]);
    expect(f.system.getSnapshots()[0]?.lastKnownPlayer?.position).toEqual({ x: 0, y: 0, z: -5 });
    f.system.dispose();
  });

  it('follows provider waypoints instead of steering directly toward player coordinates', () => {
    const f = fixture({ detectionSeconds: 0.1, pursuitSpeed: 1 });
    vi.mocked(f.navigation.findPath).mockReturnValue({ waypoints: [{ x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: -5 }], reachesGoal: true });
    f.tick();
    const actor = f.system.getSnapshots()[0]!;
    expect(actor.position.x).toBeGreaterThan(0);
    expect(actor.position.z).toBe(0);
    expect(f.navigation.findPath).toHaveBeenCalledWith(expect.objectContaining({ agent: ENTITY_PROFILES.patient.agent }));
    f.system.dispose();
  });

  it('does not move through walls when navigation finds no path', () => {
    const f = fixture({ detectionSeconds: 0.1 });
    vi.mocked(f.navigation.findPath).mockReturnValue(null);
    f.tick(10);
    expect(f.system.getSnapshots()[0]?.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(f.navigation.findPath).toHaveBeenCalled();
    f.system.dispose();
  });

  it('investigates a copied recent audible source without gaining the current player position', () => {
    const f = fixture();
    f.setPlayer({ position: { x: 0, y: 0, z: 8 } });
    const source = { x: 0, y: 0, z: 2 };
    f.events.emit('player:noise', { playerId: 'player', position: source, kind: 'interaction', radius: 8, intensity: 1, timeSeconds: 0 });
    source.z = 19;
    f.tick();
    expect(f.system.getSnapshots()[0]?.state).toBe('investigate');
    expect(f.system.getSnapshots()[0]?.lastKnownPlayer).toEqual(expect.objectContaining({ position: { x: 0, y: 0, z: 2 }, source: 'sound' }));
    f.system.dispose();
  });

  it('drops stale/future/unrelated noise events rather than retaining an omniscient sound target', () => {
    const f = fixture();
    f.setPlayer({ position: { x: 0, y: 0, z: 8 } });
    for (const [playerId, timeSeconds] of [['other', 0], ['player', -10], ['player', 20]] as const) {
      f.events.emit('player:noise', { playerId, position: { x: 0, y: 0, z: 1 }, kind: 'footstep', radius: 8, intensity: 1, timeSeconds });
    }
    f.tick(2);
    expect(f.system.getSnapshots()[0]?.lastKnownPlayer).toBeNull();
    f.system.dispose();
  });

  it('requires capture grace and contact dwell and emits capture once', () => {
    const f = fixture({ detectionSeconds: 0.1, pursuitSpeed: 0 });
    f.setPlayer({ position: { x: 0, y: 0, z: -0.7 } });
    f.tick(12);
    expect(f.captures).toHaveLength(0);
    f.tick(12);
    expect(f.captures).toEqual(['patient']);
    expect(f.ends).toEqual([{ reason: 'captured', id: f.starts[0] }]);
    f.tick(20);
    expect(f.captures).toHaveLength(1);
    f.system.dispose();
  });

  it('cannot track or capture an unseen concealed player at their new coordinates', () => {
    const f = fixture({ detectionSeconds: 0.1, pursuitSpeed: 0, loseSightSeconds: 0.2 });
    f.tick();
    f.setPlayer({ position: { x: 9, y: 0, z: 9 }, hiding: { state: 'hidden', spotId: 'unwitnessed' }, movement: 'hidden' });
    f.tick(8);
    expect(f.system.getSnapshots()[0]?.lastKnownPlayer?.position).toEqual({ x: 0, y: 0, z: -5 });
    expect(f.captures).toHaveLength(0);
    expect(f.ends[0]?.reason).toBe('escaped');
    expect(vi.mocked(f.navigation.findPath).mock.calls.every(([query]) => query.to.x !== 9 || query.to.z !== 9)).toBe(true);
    f.system.dispose();
  });

  it('remembers witnessed entry and must approach before inspecting a known hiding spot', () => {
    const f = fixture({ detectionSeconds: 0.1, captureGraceSeconds: 0.4, captureDwellSeconds: 0.3 });
    f.setPlayer({ position: f.hiding.playerPosition });
    expect(f.system.witnessesFor(f.hiding)).toEqual(['patient']);
    f.events.emit('hiding:state', { playerId: 'player', spotId: f.hiding.id, previous: 'outside', current: 'entering', witnessedBy: ['patient'] });
    f.setPlayer({ hiding: { state: 'hidden', spotId: f.hiding.id }, movement: 'hidden' });
    f.tick();
    expect(f.captures).toHaveLength(0);
    expect(f.system.getSnapshots()[0]?.lastKnownPlayer?.source).toBe('witnessed-hiding');
    f.tick(12);
    expect(f.captures).toEqual(['patient']);
    expect(f.ends.at(-1)?.reason).toBe('captured');
    f.system.dispose();
  });

  it('cannot remotely capture a witnessed spot that navigation cannot reach', () => {
    const f = fixture({ captureGraceSeconds: 0.1, captureDwellSeconds: 0.1, hidingMemorySeconds: 0.7 });
    f.setPlayer({ position: f.hiding.playerPosition });
    vi.mocked(f.navigation.findPath).mockReturnValue(null);
    f.events.emit('hiding:state', { playerId: 'player', spotId: f.hiding.id, previous: 'outside', current: 'entering', witnessedBy: ['patient'] });
    f.setPlayer({ hiding: { state: 'hidden', spotId: f.hiding.id } });
    f.tick(12);
    expect(f.captures).toHaveLength(0);
    expect(f.ends.at(-1)?.reason).toBe('escaped');
    f.system.dispose();
  });

  it('settles every active chase on capture, including other pursuing entities', () => {
    const f = fixture({ detectionSeconds: 0.1, pursuitSpeed: 0 }, {}, {
      additionalSpawns: [{ id: 'spawn-2', entityId: 'patient-2', type: 'patient', position: { x: 2, y: 0, z: 0 }, yaw: 0 }],
    });
    f.tick();
    expect(f.starts).toHaveLength(2);
    f.events.emit('player:captured', { playerId: 'player', entityId: 'patient', position: f.snapshot.position, timeSeconds: 0.1 });
    expect(f.ends).toHaveLength(2);
    expect(new Set(f.ends.map((event) => event.id))).toEqual(new Set(f.starts));
    expect(f.ends.every((event) => event.reason === 'captured')).toBe(true);
    expect(f.system.getSnapshots().every((actor) => actor.state === 'idle')).toBe(true);
    f.tick(4);
    f.system.dispose();
    expect(f.ends).toHaveLength(2);
  });

  it('uses configured authoritative player eye heights for vision rather than presentation defaults', () => {
    const f = fixture({ pursuitSpeed: 0 }, {}, { playerEyeHeights: { standing: 1.2, crouching: 0.6 } });
    f.tick();
    expect(f.physics.hasLineOfSight).toHaveBeenLastCalledWith(expect.anything(), { x: 0, y: 1.2, z: -5 });
    f.setPlayer({ crouching: true });
    f.tick();
    expect(f.physics.hasLineOfSight).toHaveBeenLastCalledWith(expect.anything(), { x: 0, y: 0.6, z: -5 });
    f.system.dispose();
  });

  it('cancels active chase and releases actor resources exactly once on dispose', () => {
    const f = fixture({ detectionSeconds: 0.1 });
    f.tick();
    f.system.dispose();
    f.system.dispose();
    expect(f.ends).toEqual([{ reason: 'cancelled', id: f.starts[0] }]);
    expect(f.bodies[0]?.disposed).toBe(true);
    f.tick();
    expect(f.ends).toHaveLength(1);
  });
});

describe('secondary framework support', () => {
  it('supplies sound-sensitive Nurse and low-clearance Crawler profiles', () => {
    expect(ENTITY_PROFILES.nurse.hearingMultiplier).toBeGreaterThan(ENTITY_PROFILES.patient.hearingMultiplier);
    const f = fixture({}, { type: 'crawler' });
    expect(f.physics.createCharacter).toHaveBeenCalledWith(expect.objectContaining({ height: 0.65, radius: 0.22 }));
    f.system.dispose();
    expect(() => resolveEntityProfile('patient', { captureDwellSeconds: 0 })).toThrow('Invalid');
  });

  it('moves the Watcher only while the player is not observing it', () => {
    const f = fixture({ detectionSeconds: 0.1 }, { type: 'watcher', position: { x: 0, y: 0, z: -3 }, yaw: Math.PI });
    f.setPlayer({ position: { x: 0, y: 0, z: 0 } });
    f.tick(6);
    expect(f.system.getSnapshots()[0]?.position).toEqual({ x: 0, y: 0, z: -3 });
    f.setPlayer({ rotation: { yaw: Math.PI, pitch: 0 } });
    f.tick(2);
    expect(f.system.getSnapshots()[0]!.position.z).toBeGreaterThan(-3);
    f.system.dispose();
  });

  it('keeps the Reflection nonphysical and emits bounded visual encounters on request', () => {
    const f = fixture({}, { type: 'reflection' });
    const visible = listen(f.events);
    expect(f.physics.createCharacter).not.toHaveBeenCalled();
    expect(f.system.getSnapshots()).toEqual([]);
    f.system.reflections.show('mirror:anchor', 0.2, 0);
    expect(visible).toEqual([true]);
    f.tick(3);
    expect(visible).toEqual([true, false]);
    f.system.dispose();
    expect(() => f.system.reflections.show('mirror', 1, 0)).toThrow('disposed');
  });
});
