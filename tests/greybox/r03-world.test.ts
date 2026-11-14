import RAPIER from '@dimforge/rapier3d-compat';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { validateWorld } from '../../src/integration/validateWorld';
import { createPhysicsAdapter } from '../../src/physics/adapter';
import { R03_DEVICES, R03_HATCH, R03_REPLACED_DEV_CONTROLS, R03_SCENARIO_SPAWN } from '../../src/chapter1/r03Demo';
import { createGreyboxWorld } from '../../src/world/greybox/build';

beforeAll(async () => { await RAPIER.init(); });
const options = (openDoors: string[] = []) => ({
  textures: false,
  r03: {
    devices: [...R03_DEVICES, R03_HATCH], openDoors: new Set(openDoors), skipControls: R03_REPLACED_DEV_CONTROLS, spawn: R03_SCENARIO_SPAWN,
    hatchRequirement: { id: 'flag:hatch-unfastened', description: 'Held shut by wing nuts' },
  },
});

describe('NW-R03 greybox variant', () => {
  it('validates, adds the devices and hatch cover, drops the replaced dev posts, and spawns at the scenario start', () => {
    const build = createGreyboxWorld(options());
    try {
      expect(() => validateWorld(build.world)).not.toThrow();
      const ids = build.world.interactables.map((m) => m.id);
      for (const p of [...R03_DEVICES, R03_HATCH]) expect(ids).toContain(`nw:inspect:gb-${p.device.id}`);
      for (const id of R03_REPLACED_DEV_CONTROLS) expect(ids).not.toContain(`nw:inspect:gb-${id}`);
      expect(build.world.doors.find((d) => d.id === 'nw:door:gb-r03-hatch')?.requirements?.[0]?.id).toBe('flag:hatch-unfastened');
      expect(build.world.playerSpawn.position).toMatchObject({ x: R03_SCENARIO_SPAWN.x, z: R03_SCENARIO_SPAWN.z });
      const holds = build.world.interactables.filter((m) => m.hold).map((m) => m.id);
      expect(holds).toEqual(expect.arrayContaining(['nw:inspect:gb-r03-valve', 'nw:inspect:gb-r03-padlock', 'nw:inspect:gb-r03-crank', 'nw:inspect:gb-r03-hatch-nuts']));
    } finally { build.dispose(); }
  });

  it('the hatch cover sweeps open into the crawlway without touching walls; restored doors are built open', () => {
    const build = createGreyboxWorld(options());
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const physics = createPhysicsAdapter(world, build.world.colliders);
    try {
      const hatch = build.world.doors.find((d) => d.id === 'nw:door:gb-r03-hatch')!;
      const collider = build.world.colliders.find((c) => c.id === hatch.colliderIds[0])!;
      const m = (p: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number; w: number } }) =>
        new Matrix4().compose(new Vector3().copy(p.position as Vector3), new Quaternion().copy(p.rotation as Quaternion), new Vector3(1, 1, 1));
      const local = m(hatch.closedPose).invert().multiply(m(collider.pose));
      for (let i = 0; i <= 45; i += 1) {
        const t = i / 45;
        const rotation = new Quaternion().copy(hatch.closedPose.rotation as Quaternion).slerp(new Quaternion().copy(hatch.openPose.rotation as Quaternion), t);
        const pose = new Matrix4().compose(new Vector3().copy(hatch.closedPose.position as Vector3), rotation, new Vector3(1, 1, 1)).multiply(local);
        const position = new Vector3(), q = new Quaternion();
        pose.decompose(position, q, new Vector3());
        expect(physics.trySetColliderPoses([{ id: collider.id, pose: { position, rotation: q } }]), `sample ${i}`).toBe(true);
      }
    } finally { physics.dispose(); world.free(); build.dispose(); }
    const restored = createGreyboxWorld(options(['nw:door:gb-steam', 'nw:door:gb-r03-hatch']));
    try {
      expect(restored.world.doors.find((d) => d.id === 'nw:door:gb-steam')?.initialState).toBe('open');
      expect(restored.world.doors.find((d) => d.id === 'nw:door:gb-r03-hatch')?.initialState).toBe('open');
      expect(restored.world.doors.find((d) => d.id === 'nw:door:gb-bulkhead')?.initialState).toBe('closed');
    } finally { restored.dispose(); }
  });
});
