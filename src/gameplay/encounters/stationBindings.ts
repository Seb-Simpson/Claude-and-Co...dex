import { Euler, Quaternion, Vector3 } from 'three';
import type { Bounds3, HospitalWorld, Vec3 } from '../../contracts';
import {getHospitalExtras} from '../../world/extras';
import { getNursesStationStealth } from '../../world/stealth/nursesStation';

/** Small integration adapter over Claude's published contract; no duplicated hospital coordinates. */
export function resolveStationBindings(world: HospitalWorld) {
  if (!world.root.getObjectByName('nw:stealth:observation')) return null;
  const data = getNursesStationStealth(world);
  const point = (node: string): Vec3 => {
    const found = world.root.getObjectByName(node);
    if (!found) throw new Error(`Missing station node ${node}`);
    const p = found.getWorldPosition(new Vector3());
    return {x:p.x,y:p.y,z:p.z};
  };
  const observation = point(data.observation.node), exit = point(data.exit.node);
  const patrol = data.patrolWaypoints.map(p => point(p.node));
  if (patrol.length < 4) throw new Error('Station requires its published patrol and entrance');
  const callLamp = world.root.getObjectByName('station_call_led');
  const look = callLamp?.getWorldPosition(new Vector3()) ?? patrol[0]!;
  const checkingYaw = Math.atan2(-(look.x-patrol[2]!.x),-(look.z-patrol[2]!.z));
  const spawn = world.entitySpawns.find(p => p.type === 'nurse');
  const route = world.patrolRoutes.find(p => p.id === data.patrolRouteId);
  if (!spawn || !route) throw new Error('Station requires its Nurse spawn and patrol');
  const station = world.rooms.find(r => r.id === data.patrolWaypoints[0]!.roomId);
  const secondary = world.rooms.find(r => r.id === data.concealment.roomId);
  const corridor = world.rooms.find(r => r.id === data.observation.roomId);
  if (!station || !secondary || !corridor) throw new Error('Station requires published room bounds');
  // Patient-room metadata ends at the interior wall face; corridor metadata ends at
  // its centre line. Include that thin doorway band in story authority, while the
  // real door/wall colliders remain fully authoritative for movement and sight.
  const secondaryAccess: Bounds3 = {min: {...secondary.bounds.min},
    max: {...secondary.bounds.max, z: Math.max(secondary.bounds.max.z,corridor.bounds.min.z)}};
  const inBox = (p: Vec3, b: Bounds3) => p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y - .15 &&
    p.y <= b.max.y && p.z >= b.min.z && p.z <= b.max.z;
  const axis = {x:exit.x-observation.x,z:exit.z-observation.z};
  const length = Math.hypot(axis.x,axis.z); axis.x/=length;axis.z/=length;
  const progress = (p: Vec3) => (p.x-observation.x)*axis.x+(p.z-observation.z)*axis.z;
  return {
    lightingTarget:getHospitalExtras(world)?.fixtures.find(f=>f.roomId===spawn.roomId)?.id,
    ...data, observation, exit, checkingYaw, entry:point(data.entry.node), crouchCover:point(data.crouchCover.node),
    concealment:point(data.concealment.node), patrol, spawn, route, axis, progress,
    initial:{...(patrol[5] ?? spawn.position)},
    initialYaw:new Euler().setFromQuaternion(world.root.getObjectByName('nw:opening:nurse-first-sight')!.getWorldQuaternion(new Quaternion()),'YXZ').y,
    /** Union of authored rooms and the corridor encounter leg, not a player movement barrier. */
    contains(p: Vec3) {
      return inBox(p,station.bounds) || inBox(p,secondaryAccess) ||
        (inBox(p,corridor.bounds) && progress(p)>=-2 && progress(p)<=length+.8);
    },
    crossedExit(p: Vec3) { return progress(p)>=length-.65 && inBox(p,corridor.bounds); },
  };
}
export type StationBindings = NonNullable<ReturnType<typeof resolveStationBindings>>;
