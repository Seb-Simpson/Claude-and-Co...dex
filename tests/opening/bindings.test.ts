import { describe, expect, it } from 'vitest';
import { Group, Object3D } from 'three';
import type { HospitalWorld } from '../../src/contracts';
import { OPENING_KEYS, openingPosition, resolveOpeningBindings } from '../../src/gameplay/opening/bindings';
function fixture() {
  const root = new Group();
  const rows = OPENING_KEYS.map(key => {
    const node = new Object3D(); node.name = `nw:opening:${key}`; node.position.set(2, 1, 3); root.add(node);
    return { key, node: node.name, ...(key === 'room-104-door' || key === 'room-106-door' ? { doorId: key } : {}),
      stand: { x: 1, y: 0, z: 2 } };
  });
  root.userData.nightWardHospital = { opening: rows };
  const world = { root, doors: [{ id: 'room-104-door' }, { id: 'room-106-door' }] } as unknown as HospitalWorld;
  return { world, rows };
}
describe('NW005A structural opening boundary', () => {
  it('leaves classic worlds without bindings unchanged', () => {
    expect(resolveOpeningBindings({ root: new Group() } as HospitalWorld)).toBeNull();
  });
  it('resolves published semantic data and child world transforms without world imports', () => {
    const { world } = fixture();
    const child = world.root.getObjectByName('nw:opening:room-106-handle')!;
    const parent = new Group(); parent.position.set(5, 0, 0); world.root.add(parent); parent.add(child);
    const result = resolveOpeningBindings(world)!;
    expect(openingPosition(result['room-106-handle']).x).toBe(7);
    expect(result['room-104-door'].doorId).toBe('room-104-door');
    expect(result['access-card'].stand).toEqual({ x: 1, y: 0, z: 2 });
  });
  it('fails partial or duplicate contracts visibly instead of guessing positions', () => {
    const { world } = fixture(); world.root.getObjectByName('nw:opening:access-card')!.removeFromParent();
    expect(() => resolveOpeningBindings(world)).toThrow('access-card');
    const other = fixture(); other.rows.push(other.rows[0]!);
    expect(() => resolveOpeningBindings(other.world)).toThrow('Duplicate opening');
  });
  it('rejects ambiguous scene node names, nonexistent doors and nonfinite data', () => {
    const { world } = fixture(); const duplicate = new Object3D(); duplicate.name = 'nw:opening:access-card'; world.root.add(duplicate);
    expect(() => resolveOpeningBindings(world)).toThrow('one scene node');
    const other = fixture();
    expect(() => resolveOpeningBindings({ ...other.world, doors: [] })).toThrow('door binding');
    const malformed = fixture(); malformed.rows[0]!.stand.x = Infinity;
    expect(() => resolveOpeningBindings(malformed.world)).toThrow('Invalid opening stand');
  });
});
