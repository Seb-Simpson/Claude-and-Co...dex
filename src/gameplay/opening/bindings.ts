import { Object3D, Vector3 } from 'three';
import type { HospitalWorld, Vec3 } from '../../contracts';

/** Structural consumer of NW-005A; no dependency on unfinished world modules. */
export const OPENING_KEYS = ['player-spawn', 'room-104-door', 'card-reader', 'access-card', 'intercom-speaker',
  'room-106-door', 'room-106-handle', 'nurse-first-sight', 'nurse-first-sight-view', 'station-approach'] as const;
export type OpeningKey = typeof OPENING_KEYS[number];
export interface OpeningAnchor {
  readonly key: OpeningKey;
  readonly node: Object3D;
  readonly doorId?: string;
  readonly stand?: Vec3;
  readonly target?: Vec3;
  readonly points?: readonly Vec3[];
}
export type OpeningBindings = Readonly<Record<OpeningKey, OpeningAnchor>>;
export function openingPosition(anchor: OpeningAnchor): Vector3 { return anchor.node.getWorldPosition(new Vector3()); }
const finite = (v: unknown): v is Vec3 => !!v && typeof v === 'object' && ['x', 'y', 'z'].every(k => Number.isFinite((v as Record<string, unknown>)[k]));
/** Absent contract leaves classic main untouched. A partial/ambiguous contract is an integration error. */
export function resolveOpeningBindings(world: HospitalWorld): OpeningBindings | null {
  const rows = world.root.userData.nightWardHospital?.opening as unknown;
  const named = new Map<string, Object3D[]>();
  world.root.traverse(node => { const list = named.get(node.name) ?? []; list.push(node); named.set(node.name, list); });
  if (!Array.isArray(rows) && !OPENING_KEYS.some(key => named.has(`nw:opening:${key}`))) return null;
  const result = {} as Record<OpeningKey, OpeningAnchor>;
  for (const key of OPENING_KEYS) {
    const matches = Array.isArray(rows) ? rows.filter(row => row?.key === key) : [];
    if (matches.length > 1) throw new Error(`Duplicate opening binding: ${key}`);
    const row = matches[0] as Record<string, unknown> | undefined;
    const nodeName = typeof row?.node === 'string' ? row.node : `nw:opening:${key}`;
    const nodes = named.get(nodeName);
    if (nodes?.length !== 1) throw new Error(`Opening requires one scene node: ${nodeName}`);
    const node = nodes[0]!;
    const p = openingPosition({ key, node });
    if (!finite(p)) throw new Error(`Opening anchor is nonfinite: ${key}`);
    const rawDoor = row?.doorId ?? node.userData.nwOpening?.doorId;
    const doorId = typeof rawDoor === 'string' ? rawDoor : undefined;
    if ((key === 'room-104-door' || key === 'room-106-door') && (!doorId || !world.doors.some(d => d.id === doorId))) {
      throw new Error(`Opening door binding is invalid: ${key}`);
    }
    if (row?.stand !== undefined && !finite(row.stand)) throw new Error(`Invalid opening stand: ${key}`);
    if (row?.target !== undefined && !finite(row.target)) throw new Error(`Invalid opening target: ${key}`);
    if (row?.points !== undefined && (!Array.isArray(row.points) || !row.points.every(finite))) throw new Error(`Invalid opening path: ${key}`);
    result[key] = { key, node, ...(doorId ? { doorId } : {}),
      ...(finite(row?.stand) ? { stand: { ...row.stand } } : {}),
      ...(finite(row?.target) ? { target: { ...row.target } } : {}),
      ...(Array.isArray(row?.points) ? { points: row.points.map(p => ({ ...p as Vec3 })) } : {}) };
  }
  return result;
}
