import RAPIER from '@dimforge/rapier3d-compat';
import { PerspectiveCamera } from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ColliderDefinition, EntitySpawnPoint, GameEvents, HidingLocation, Vec3 } from '../../src/contracts';
import { createEventBus } from '../../src/integration/events';
import { createPhysicsAdapter, createNavigationProvider } from '../../src/physics';
import { createPlayerController } from '../../src/gameplay/player';
import { createPatientEncounter } from '../../src/entities/patientEncounter';
import type { EnvironmentalSoundStimulus } from '../../src/entities/environmentalSound';
import { canHearEnvironmentalSound } from '../../src/entities/perception';
import type { EntityProfile } from '../../src/entities/profiles';

beforeAll(async () => { await RAPIER.init(); });
const identity = { x: 0, y: 0, z: 0, w: 1 };

/** Isolated physical geometry; these are not hospital coordinates or proposed staging. */
function fixture(profile: Partial<EntityProfile> = {}, sealed = false) {
  const rapier = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const colliders: ColliderDefinition[] = [
    { id: 'floor', bodyType: 'fixed', sensor: false, shape: { type: 'box', halfExtents: { x: 8, y: 0.25, z: 8 } }, pose: { position: { x: 0, y: -0.25, z: 0 }, rotation: identity } },
    { id: 'divider', bodyType: 'fixed', sensor: false, shape: { type: 'box', halfExtents: { x: 0.05, y: 1.25, z: sealed ? 8 : 2 } }, pose: { position: { x: 0, y: 1.25, z: 0 }, rotation: identity } },
  ];
  const physics = createPhysicsAdapter(rapier, colliders);
  const navigation = createNavigationProvider(physics, { min: { x: -8, y: -1, z: -8 }, max: { x: 8, y: 4, z: 8 } }, { cellSize: 0.25 });
  const events = createEventBus();
  let subscriptions = 0;
  const trackedEvents: GameEvents = {
    emit: (type, event) => events.emit(type, event),
    on(type, listener) {
      subscriptions++;
      const off = events.on(type, listener);
      let live = true;
      return () => { if (live) { live = false; subscriptions--; off(); } };
    },
  };
  const player = createPlayerController({
    body: physics.createCharacter({ position: { x: -2, y: 0.005, z: -3 }, radius: 0.28, height: 1.8 }),
    camera: new PerspectiveCamera(), spawn: { position: { x: -2, y: 0.005, z: -3 }, yaw: 0 }, events,
  });
  const spawn: EntitySpawnPoint = { id: 'test:patient-spawn', entityId: 'test:patient', type: 'patient', position: { x: -2, y: 0.005, z: 3 }, yaw: 0 };
  const hiding: HidingLocation = { id: 'test:bed', interactableId: 'test:bed-object', type: 'bed', capacity: 1,
    playerPosition: { x: -2, y: 0.005, z: -0.7 },
    cameraPose: { position: { x: -2, y: 0.7, z: -0.7 }, rotation: identity },
    exitCandidates: [{ position: { x: -2, y: 0.005, z: -0.1 }, yaw: 0 }], colliderIds: [],
  };
  const patient = createPatientEncounter({
    spawn, physics, navigation, player, events: trackedEvents,
    route: { id: 'test:route', points: [spawn.position], loop: true }, hidingLocations: [hiding],
    profile: { visionRange: 0.2, idleSeconds: 0.1, detectionSeconds: 0.1, loseSightSeconds: 0.2,
      lostTargetSeconds: 0.1, searchSeconds: 1, recoverySeconds: 0.3, ...profile },
  });
  const starts: string[] = [], ends: string[] = [], states: string[] = [], captures: string[] = [];
  events.on('chase:started', e => starts.push(e.chaseId));
  events.on('chase:ended', e => ends.push(e.reason));
  events.on('entity:state', e => states.push(e.current));
  events.on('player:captured', e => { captures.push(e.entityId); player.setCaptured(true); });
  let now = 0;
  function tick(count = 1, observe?: (position: Vec3) => void) {
    for (let i = 0; i < count; i++) {
      now += 1 / 60;
      patient.fixedUpdate({ deltaSeconds: 1 / 60, elapsedSeconds: now });
      rapier.step();
      const snapshot = patient.getSnapshots()[0]; if (snapshot) observe?.(snapshot.position);
    }
  }
  const sound = (position: Vec3, id = 'test:release-chime'): EnvironmentalSoundStimulus => ({ id, position, radius: 30, intensity: 1, timeSeconds: now });
  return { patient, player, physics, navigation, events, rapier, spawn, hiding, starts, ends, states, captures, tick, sound,
    get now() { return now; }, get subscriptions() { return subscriptions; },
    dispose() { patient.dispose(); player.dispose(); physics.dispose(); events.dispose(); rapier.free(); },
  };
}

describe('staged Patient actor over the real physical AI', () => {
  it('has no capsule or perception until handoff and rejects an active actor warp', () => {
    const f = fixture();
    try {
      const baseline = f.rapier.colliders.len();
      expect(f.patient.offerSound(f.sound({ x: 2, y: 0.005, z: 0 }))).toBe(false);
      f.events.emit('player:noise', { playerId: 'player', kind: 'sprint', position: f.spawn.position, radius: 20, intensity: 1, timeSeconds: 0 });
      f.tick(20); f.patient.stage();
      expect(f.patient.phase).toBe('staged');
      expect(f.patient.getSnapshots()).toEqual([]);
      expect(f.rapier.colliders.len()).toBe(baseline);
      f.patient.activate(); f.patient.activate();
      expect(f.rapier.colliders.len()).toBe(baseline + 1);
      expect(() => f.patient.stage()).toThrow('active Patient');
      expect(() => f.patient.reset()).toThrow('active Patient');
      f.tick(10);
      expect(f.patient.getSnapshots()[0]?.lastKnownPlayer).toBeNull();
      expect(f.starts).toEqual([]);
    } finally { f.dispose(); }
  });

  it('rejects unsupported/obstructed stage and rechecks occupancy on activation', () => {
    const f = fixture();
    try {
      expect(() => f.patient.stage({ position: { x: 0, y: 0.005, z: 0 }, yaw: 0 })).toThrow('staging');
      expect(() => f.patient.stage({ position: { x: -2, y: 2, z: 0 }, yaw: 0 })).toThrow('staging');
      f.patient.stage();
      f.player.body.setPosition(f.spawn.position);
      expect(() => f.patient.activate()).toThrow('staging');
      expect(f.patient.phase).toBe('staged');
    } finally { f.dispose(); }
  });

  it('investigates a finite chime around actual geometry without inventing a player observation', () => {
    const f = fixture({ investigateSpeed: 2, searchSeconds: 10 });
    try {
      f.patient.activate();
      const source = { x: 2, y: 0.005, z: 0 };
      const offered = f.sound(source);
      expect(f.patient.offerSound(offered)).toBe(true);
      expect(f.patient.offerSound(offered)).toBe(false);
      (source as { x: number }).x = -7; // Publisher mutation must not move the recorded observation.
      const visited: Vec3[] = [];
      f.tick(300, p => visited.push(p));
      expect(f.states).toContain('investigate');
      expect(visited.some(p => p.x > 0.5)).toBe(true);
      expect(visited.filter(p => Math.abs(p.x) < 0.4).every(p => p.z > 2.2)).toBe(true);
      expect(f.patient.getSnapshots()[0]?.lastKnownPlayer).toBeNull();
      expect(f.starts).toEqual([]); expect(f.captures).toEqual([]);
    } finally { f.dispose(); }
  });

  it('waits and searches when the heard source has no physical route instead of crossing a wall', () => {
    const f = fixture({ searchSeconds: 0.3 }, true);
    try {
      f.patient.activate();
      const initial = f.patient.getSnapshots()[0]!.position;
      f.patient.offerSound(f.sound({ x: 2, y: 0.005, z: 0 }));
      f.tick(90);
      const after = f.patient.getSnapshots()[0]!;
      expect(after.position.x).toBeCloseTo(initial.x, 2);
      expect(after.position.z).toBeCloseTo(initial.z, 2);
      expect(f.states).toEqual(expect.arrayContaining(['investigate', 'search', 'return-to-patrol']));
      expect(after.lastKnownPlayer).toBeNull();
    } finally { f.dispose(); }
  });

  it('ignores stale/future/out-of-range sounds and bounds queued observations', () => {
    const f = fixture();
    try {
      f.patient.activate(); f.tick(120);
      expect(f.patient.offerSound({ ...f.sound(f.spawn.position), timeSeconds: 0 })).toBe(false);
      expect(f.patient.offerSound({ ...f.sound(f.spawn.position), intensity: NaN })).toBe(false);
      f.patient.offerSound({ ...f.sound(f.spawn.position, 'future'), timeSeconds: f.now + 10 });
      f.patient.offerSound({ ...f.sound({ x: 7, y: 0.005, z: 7 }, 'far'), radius: 1 });
      f.tick();
      expect(f.states).not.toContain('investigate');
      for (let i = 0; i < 200; i++) f.patient.offerSound(f.sound(f.spawn.position, `bounded:${i}`));
      expect(f.patient.offerSound(f.sound(f.spawn.position, 'overflow'))).toBe(false);
      f.tick();
      expect(f.patient.offerSound(f.sound(f.spawn.position, 'after-limit'))).toBe(true);
      expect(f.patient.offerSound(f.sound(f.spawn.position, 'after-limit'))).toBe(false);
      expect(f.patient.getSnapshots()[0]?.lastKnownPlayer).toBeNull();
    } finally { f.dispose(); }
  });

  it('keeps hearing after many bounded batches instead of becoming permanently deaf', () => {
    const f = fixture();
    try {
      f.patient.activate();
      const colliderCount = f.rapier.colliders.len();
      for (let batch = 0; batch < 5; batch++) {
        for (let i = 0; i < 128; i++) {
          expect(f.patient.offerSound(f.sound(f.spawn.position, `soak:${batch}:${i}`))).toBe(true);
        }
        expect(f.patient.offerSound(f.sound(f.spawn.position, `overflow:${batch}`))).toBe(false);
        f.tick();
      }
      expect(f.patient.offerSound(f.sound(f.spawn.position, 'still-hearing'))).toBe(true);
      f.tick();
      expect(f.patient.getSnapshots()[0]?.lastKnownPlayer).toBeNull();
      expect(f.rapier.colliders.len()).toBe(colliderCount);
    } finally { f.dispose(); }
  });

  it('acquires through credible vision, loses an unseen concealed player and recovers', () => {
    const f = fixture({ visionRange: 10, pursuitSpeed: 0, searchSpeed: 0 });
    try {
      f.patient.activate(); f.tick(12);
      expect(f.starts).toHaveLength(1);
      expect(f.patient.getSnapshots()[0]?.lastKnownPlayer?.source).toBe('vision');
      f.player.setHiding('hidden', f.hiding.id, f.hiding.cameraPose);
      f.tick(120);
      expect(f.ends).toContain('escaped');
      expect(f.states).toEqual(expect.arrayContaining(['pursue', 'lost-target', 'search', 'return-to-patrol']));
      expect(f.captures).toEqual([]);
    } finally { f.dispose(); }
  });

  it('retains grace/dwell before capture and creates new chase IDs after a safe reset', () => {
    const f = fixture({ visionRange: 10, pursuitSpeed: 0, captureGraceSeconds: 0.4, captureDwellSeconds: 0.2 });
    try {
      f.player.body.setPosition({ x: -2, y: 0.005, z: 2.25 });
      f.patient.activate(); f.tick(20);
      expect(f.starts).toHaveLength(1); expect(f.captures).toEqual([]);
      f.tick(40);
      expect(f.captures).toEqual(['test:patient']); expect(f.ends).toContain('captured');
      f.patient.deactivate(); f.patient.reset();
      f.player.setCaptured(false);
      f.patient.activate(); f.tick(12);
      expect(new Set(f.starts).size).toBe(2);
    } finally { f.dispose(); }
  });

  it('inspects only an explicitly witnessed hiding entry through its valid approach', () => {
    const f = fixture({ visionRange: 10, investigateSpeed: 2, pursuitSpeed: 0, captureGraceSeconds: 0.1, captureDwellSeconds: 0.1 });
    try {
      f.patient.activate(); f.tick(12);
      f.player.body.setPosition(f.hiding.playerPosition);
      f.player.setHiding('hidden', f.hiding.id, f.hiding.cameraPose);
      f.events.emit('hiding:state', { playerId: 'player', spotId: f.hiding.id, previous: 'outside', current: 'entering', witnessedBy: ['test:patient'] });
      f.tick(240);
      expect(f.captures).toEqual(['test:patient']);
      expect(f.patient.getSnapshots()[0]?.lastKnownPlayer?.source).toBe('witnessed-hiding');
    } finally { f.dispose(); }
  });

  it('releases subscriptions/capsules over retries and synchronous chase-listener teardown', () => {
    const f = fixture({ visionRange: 10, pursuitSpeed: 0 });
    try {
      const baseline = f.rapier.colliders.len();
      expect(f.subscriptions).toBe(3);
      for (let i = 0; i < 8; i++) {
        f.patient.stage(); f.patient.activate(); f.tick(12);
        f.patient.deactivate(); f.patient.deactivate(); f.patient.reset();
        expect(f.rapier.colliders.len()).toBe(baseline);
        expect(f.subscriptions).toBe(3);
      }
      const cancel = f.events.on('chase:started', () => f.patient.deactivate());
      f.patient.activate(); f.tick(12); cancel();
      expect(f.patient.phase).toBe('dormant');
      expect(f.rapier.colliders.len()).toBe(baseline);
      f.patient.dispose(); f.patient.dispose();
      expect(f.subscriptions).toBe(0);
      expect(() => f.patient.activate()).toThrow('disposed');
    } finally { f.dispose(); }
  });

  it('settles a physically verified escape without despawning or moving the Patient', () => {
    const f = fixture({ visionRange: 10, pursuitSpeed: 0, searchSpeed: 0 });
    try {
      expect(() => f.patient.settleEscape()).toThrow('active');
      f.patient.activate(); f.tick(12);
      expect(f.starts).toHaveLength(1);
      const before = f.patient.getSnapshots()[0]!;
      const colliderCount = f.rapier.colliders.len();
      f.patient.settleEscape(); f.patient.settleEscape();
      expect(f.patient.phase).toBe('settled');
      expect(f.ends).toEqual(['escaped']);
      expect(f.patient.getSnapshots()[0]?.state).toBe('idle');
      expect(f.patient.getSnapshots()[0]?.position).toEqual(before.position);
      expect(f.rapier.colliders.len()).toBe(colliderCount);
      expect(f.patient.witnessesEntry()).toBe(false);
      expect(f.patient.offerSound(f.sound(before.position))).toBe(false);
      expect(() => f.patient.stage()).toThrow('deactivated');
      expect(() => f.patient.activate()).toThrow('deactivated');
      expect(() => f.patient.reset()).toThrow('deactivated');
      f.player.body.setPosition({ x: -2, y: 0.005, z: 2.25 });
      f.events.emit('player:noise', { playerId: 'player', kind: 'sprint', position: before.position, radius: 20, intensity: 1, timeSeconds: f.now });
      f.tick(180);
      expect(f.patient.getSnapshots()[0]?.position).toEqual(before.position);
      expect(f.starts).toHaveLength(1); expect(f.captures).toEqual([]);
      f.patient.deactivate();
      expect(f.rapier.colliders.len()).toBe(colliderCount - 1);
      f.patient.reset();
      f.player.body.setPosition({ x: -2, y: 0.005, z: -3 });
      f.patient.activate(); f.tick(12);
      expect(f.starts).toHaveLength(2);
      expect(new Set(f.starts).size).toBe(2);
    } finally { f.dispose(); }
  });

  it('cannot convert a captured attempt to an escaped outcome', () => {
    const f = fixture({ visionRange: 10, pursuitSpeed: 0, captureGraceSeconds: 0.1, captureDwellSeconds: 0.1 });
    try {
      f.player.body.setPosition({ x: -2, y: 0.005, z: 2.25 });
      f.patient.activate(); f.tick(60);
      expect(f.captures).toEqual(['test:patient']);
      expect(() => f.patient.settleEscape()).toThrow('uncaptured');
      expect(f.ends).toEqual(['captured']);
    } finally { f.dispose(); }
  });

  it('settles synchronously from a chase event without an extra pursuit transition or step', () => {
    const f = fixture({ visionRange: 10, pursuitSpeed: 2 });
    try {
      f.events.on('chase:started', () => f.patient.settleEscape());
      f.patient.activate();
      const before = f.patient.getSnapshots()[0]!.position;
      f.tick(12);
      expect(f.patient.phase).toBe('settled');
      expect(f.patient.getSnapshots()[0]?.state).toBe('idle');
      expect(f.patient.getSnapshots()[0]?.position.x).toBeCloseTo(before.x, 5);
      expect(f.patient.getSnapshots()[0]?.position.z).toBeCloseTo(before.z, 5);
      expect(f.ends).toEqual(['escaped']);
      expect(f.captures).toEqual([]);
    } finally { f.dispose(); }
  });

  it('keeps an idle retained body if a chase-end subscriber fails during escape settlement', () => {
    const f = fixture({ visionRange: 10, pursuitSpeed: 0 });
    try {
      f.patient.activate(); f.tick(12);
      const count = f.rapier.colliders.len();
      const unsubscribe = f.events.on('chase:ended', () => { throw new Error('presentation consumer failed'); });
      expect(() => f.patient.settleEscape()).toThrow();
      unsubscribe();
      expect(f.patient.phase).toBe('settled');
      expect(f.patient.getSnapshots()[0]?.state).toBe('idle');
      expect(f.rapier.colliders.len()).toBe(count);
      f.patient.deactivate();
      expect(f.rapier.colliders.len()).toBe(count - 1);
    } finally { f.dispose(); }
  });
});

describe('environment sound acoustics', () => {
  it('shares distance/age/occlusion rules without needing a player identity', () => {
    const f = fixture();
    try {
      const hearing = { observerPosition: f.spawn.position, config: { visionRange: 13, fieldOfViewRadians: 1, hearingMultiplier: 1, detectionSeconds: 0.1, loseSightSeconds: 1 },
        timeSeconds: 1, maxAgeSeconds: 1.5, hasLineOfSight: vi.fn(() => false), occludedMultiplier: 0.35 };
      const sound = { ...f.sound({ x: 2, y: 0.005, z: 3 }), timeSeconds: 1, radius: 20 };
      expect(canHearEnvironmentalSound({ ...hearing, sound })).toBe(true);
      expect(canHearEnvironmentalSound({ ...hearing, sound: { ...sound, radius: 2 } })).toBe(false);
      expect(canHearEnvironmentalSound({ ...hearing, sound: { ...sound, timeSeconds: 2 } })).toBe(false);
      expect(canHearEnvironmentalSound({ ...hearing, sound: { ...sound, id: '' } })).toBe(false);
      expect(canHearEnvironmentalSound({ ...hearing, timeSeconds: 10, sound })).toBe(false);
    } finally { f.dispose(); }
  });
});
