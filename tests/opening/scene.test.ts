import {canStageUnseen} from '../../src/gameplay/encounters/staging';
import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D, PerspectiveCamera, Vector3 } from 'three';
import type { HospitalWorld } from '../../src/contracts';
import type { EntityVisual } from '../../src/horror/entities/visual';
import { OPENING_KEYS, type OpeningBindings } from '../../src/gameplay/opening/bindings';
import { createOpeningScene } from '../../src/gameplay/opening/scene';

function fixture() {
  const root = new Group();
  const bindings = {} as Record<keyof OpeningBindings, OpeningBindings[keyof OpeningBindings]>;
  for (const key of OPENING_KEYS) { const node = new Object3D(); node.name = `nw:opening:${key}`; root.add(node); bindings[key] = { key, node }; }
  bindings['nurse-first-sight'].node.position.set(0, 0, -10);
  bindings['nurse-first-sight-view'].node.position.set(0, 1.6, 0);
  bindings['station-approach'].node.position.set(0, 0, -7);
  const door104 = new Group(); door104.position.set(1, 0, 2); root.add(door104);
  const door106 = new Group(); door106.position.set(1, 0, -2); root.add(door106);
  door106.add(bindings['room-106-handle'].node); bindings['room-106-handle'].node.position.set(0, 1, 0);
  bindings['room-104-door'] = { ...bindings['room-104-door'], doorId: '104' };
  bindings['room-106-door'] = { ...bindings['room-106-door'], doorId: '106' };
  const handle = new Mesh(new BoxGeometry(0.13, 0.018, 0.022), new MeshStandardMaterial());
  handle.name = 'doorleaf_hardware'; handle.position.y = 1; door106.add(handle);
  const card = new Object3D(); card.name = 'nw:opening:access-card-prop'; root.add(card);
  const pose = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
  const doors = [{ id: '104', object: door104 }, { id: '106', object: door106 }].map(door => ({ ...door,
    type: 'door' as const, prompt: 'Open', range: 2, colliderIds: [], initialState: 'closed' as const,
    closedPose: pose, openPose: pose, durationSeconds: 1 }));
  const world: HospitalWorld = { id: 'opening-scene-fixture', root, doors, interactables: doors,
    bounds: { min: { x: -20, y: -1, z: -20 }, max: { x: 20, y: 4, z: 20 } },
    rooms: [], colliders: [], hidingLocations: [], entitySpawns: [], patrolRoutes: [],
    playerSpawn: { position: { x: 0, y: 0, z: 0 }, yaw: 0 } };
  const nurse: EntityVisual = { type: 'nurse', object: new Group(), visualState: 'idle', update: vi.fn(() => []), forceState: vi.fn(),
    setOpacity: vi.fn(), bonePosition: vi.fn(() => new Vector3()), dispose: vi.fn() };
  const camera = new PerspectiveCamera(70, 16 / 9, 0.1, 100); camera.position.set(0, 1.6, 0); camera.updateMatrixWorld(true);
  const hasLineOfSight = vi.fn((_eye: { x: number; y: number; z: number }, _point: { x: number; y: number; z: number }) => true);
  return { world, root, bindings, card, nurse, camera, hasLineOfSight, handle };
}

describe('opening scene presentation', () => {
  it('keeps the corridor empty for slow exploration regardless of unlock, view or proximity', async () => {
    const f=fixture(),scene=await createOpeningScene(f.world,f.bindings,{hasLineOfSight:f.hasLineOfSight},{loadNurse:async()=>f.nurse});
    for(let i=0;i<600;i++)expect(scene.update(.1,{x:0,y:0,z:0},f.camera,true)).toEqual({sawNurse:false,atStation:false});
    expect(f.nurse.object.visible).toBe(false);scene.dispose();
  });
  it('shows one directed actor continuously rather than retiring it when the player looks away', async () => {
    const f=fixture(),scene=await createOpeningScene(f.world,f.bindings,{hasLineOfSight:f.hasLineOfSight},{loadNurse:async()=>f.nurse});
    const actor={id:'shaw',type:'nurse' as const,position:{x:0,y:0,z:-10},state:'idle' as const,lastKnownPlayer:null};
    scene.directNurse({actor,deltaSeconds:.1,yaw:0,speed:0,checkingPanel:true,visible:true});
    expect(scene.update(.1,{x:0,y:0,z:0},f.camera,true).sawNurse).toBe(true);
    f.camera.rotation.y=Math.PI;f.camera.updateMatrixWorld(true);
    scene.update(.1,{x:0,y:0,z:0},f.camera,true);expect(f.nurse.object.visible).toBe(true);
    expect(f.nurse.forceState).toHaveBeenCalledWith('observe');scene.dispose();
  });
  it('refuses staging a partly visible silhouette at an occluded doorway corner', () => {
    const f=fixture();f.hasLineOfSight.mockImplementation((_eye,point)=>point.y>1.5);
    expect(canStageUnseen(f.camera,{hasLineOfSight:f.hasLineOfSight},{x:0,y:0,z:-10})).toBe(false);
    f.hasLineOfSight.mockReturnValue(false);
    expect(canStageUnseen(f.camera,{hasLineOfSight:f.hasLineOfSight},{x:0,y:0,z:-10})).toBe(true);
    expect(canStageUnseen(f.camera,{hasLineOfSight:f.hasLineOfSight},{x:0,y:0,z:-1})).toBe(false);
  });
  it('does not complete a story merely from station proximity and restores one-shot presentation flags', async () => {
    const f=fixture(),scene=await createOpeningScene(f.world,f.bindings,{hasLineOfSight:f.hasLineOfSight},{loadNurse:async()=>f.nurse});
    expect(scene.update(.1,{x:0,y:0,z:-7},f.camera,true).atStation).toBe(false);
    scene.restore({sightingSeen:true,stationReached:true});
    expect(f.nurse.object.visible).toBe(false);scene.dispose();
  });

  it('hides the physical card and restores all owned resources exactly once', async () => {
    const f = fixture();
    const original = f.handle.geometry;
    const scene = await createOpeningScene(f.world, f.bindings, { hasLineOfSight: f.hasLineOfSight }, { loadNurse: async () => f.nurse });
    expect(f.handle.geometry).not.toBe(original);
    scene.setCardTaken(true); expect(f.card.visible).toBe(false);
    scene.setCardTaken(false); expect(f.card.visible).toBe(true);
    const indicator = f.root.getObjectByName('nw:opening:reader-indicator') as Mesh;
    const material = indicator.material as MeshStandardMaterial;
    scene.feedback('reader-accepted'); expect(material.color.getHex()).toBe(0x769a72);
    scene.update(0.1, { x: 0, y: 0, z: 4 }, f.camera, false);
    scene.setCardTaken(true); scene.dispose(); scene.dispose();
    expect(f.handle.geometry).toBe(original);
    expect(f.card.visible).toBe(true);
    expect(f.root.getObjectByName('nw:opening:gameplay-presentation')).toBeUndefined();
    expect(f.root.getObjectByName('nw:opening:reader-indicator')).toBeUndefined();
    expect(f.nurse.dispose).toHaveBeenCalledTimes(1);
  });

  it('presses actual fused handle geometry and returns it without moving the door leaf or collider', async () => {
    const f = fixture();
    const scene = await createOpeningScene(f.world, f.bindings, { hasLineOfSight: f.hasLineOfSight }, { loadNurse: async () => f.nurse });
    const start = Array.from(f.handle.geometry.getAttribute('position').array);
    const doorPosition = f.handle.parent!.position.clone();
    scene.feedback('handle-106');
    scene.update(0.1, { x: 0, y: 0, z: 4 }, f.camera, false);
    expect(Array.from(f.handle.geometry.getAttribute('position').array)).not.toEqual(start);
    expect(f.handle.parent!.position).toEqual(doorPosition);
    for (let i = 0; i < 6; i++) scene.update(0.1, { x: 0, y: 0, z: 4 }, f.camera, false);
    expect(Array.from(f.handle.geometry.getAttribute('position').array)).toEqual(start);
    scene.dispose();
  });
});
