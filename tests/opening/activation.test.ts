import { beforeAll, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { PerspectiveCamera, Scene } from 'three';
import type { EngineServices, HospitalWorld } from '../../src/contracts';
import { createOpeningFixture } from './fixture';
import { createGameplayRuntime } from '../../src/gameplay/runtime';
import { createEventBus } from '../../src/integration/events';
import { createOnboardingGate } from '../../src/gameplay/opening/onboarding';
import { createOpeningState, reduceOpening } from '../../src/gameplay/opening/state';
beforeAll(async () => { await RAPIER.init(); });
it('keeps authored spawns dormant, ignores provocative noise/capture, then activates the existing AI once after readiness', () => {
  const f = createOpeningFixture(), gate = createOnboardingGate();
  const world: HospitalWorld = { ...f.world, entitySpawns: [{ id: 'spawn', entityId: 'patient', type: 'patient', position: { x: 8, y: .005, z: -1 }, yaw: Math.PI/2 }] };
  const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 }), events = createEventBus();
  const engine = { physics, scene: new Scene(), camera: new PerspectiveCamera(70,1,.05,100), renderer: { domElement: {} }, audio: { context: null } } as unknown as EngineServices;
  const game = createGameplayRuntime({ world, engine, events, player: null }, { showHud: false, attachControls: false, entitiesEnabled: () => !gate.safe, canCapture: () => !gate.safe });
  try {
    const count = physics.colliders.len();
    events.emit('player:noise', { playerId: 'player', kind: 'sprint', position: {x:8,y:0,z:-1}, radius:100, intensity:1, timeSeconds:0 });
    events.emit('player:captured', { playerId: 'player', entityId:'patient', position:world.playerSpawn.position, timeSeconds:0 });
    for(let i=0;i<180;i++) game.fixedUpdate({deltaSeconds:1/60,elapsedSeconds:i/60});
    expect(game.player.getSnapshot().captured).toBe(false); expect(game.entities.getSnapshots()).toEqual([]); expect(physics.colliders.len()).toBe(count);
    let state = reduceOpening(createOpeningState(),'awaken').state;
    state = reduceOpening(reduceOpening(state,'take-card').state,'use-reader').state;
    state = reduceOpening(state,'reach-station').state; gate.sync(state,true);
    for(const skill of ['crouch','hide','observe-patrol'] as const) gate.recordSkill(skill);
    gate.markPresentationReady();
    expect(gate.beginActivePlay()).toBe(true);
    game.fixedUpdate({deltaSeconds:1/60,elapsedSeconds:4}); expect(game.entities.getSnapshots()).toHaveLength(1);
    expect(physics.colliders.len()).toBe(count+1);
    game.fixedUpdate({deltaSeconds:1/60,elapsedSeconds:4.1}); expect(physics.colliders.len()).toBe(count+1);
    events.emit('player:noise', {playerId:'player',kind:'footstep',position:{x:7,y:0,z:-1},radius:8,intensity:1,timeSeconds:4.2});
    game.fixedUpdate({deltaSeconds:1/60,elapsedSeconds:4.2});
    expect(game.entities.getSnapshots()[0]!.state).toBe('investigate');
  } finally { game.dispose(); expect(physics.colliders.len()).toBe(0); events.dispose(); physics.free(); f.dispose(); }
});
