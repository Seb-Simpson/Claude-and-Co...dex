import type { Bounds3, RoomMetadata, SpawnPose } from '../contracts';
import type { WorldBuilder } from './core/builder';
import { CEILING, ROOMS, Z } from './layout';

const bounds = (x0: number, x1: number, z0: number, z1: number, y1: number = CEILING.room): Bounds3 => ({
  min: { x: x0, y: 0, z: z0 },
  max: { x: x1, y: y1, z: z1 },
});

/** Semantic room declarations. Bounds use wall centre lines, so neighbours may touch. */
export function declareRooms(b: WorldBuilder): void {
  const rooms: RoomMetadata[] = [
    { id: ROOMS.corridor, name: 'Main patient corridor', bounds: bounds(-20, 18, Z.corridorN, Z.corridorS, CEILING.corridor), tags: ['corridor', 'main', 'patrol', 'long-sightline'] },
    { id: ROOMS.east, name: 'East corridor and lift lobby', bounds: bounds(18, 20.85, -11, Z.maintS, CEILING.corridor), tags: ['corridor', 'junction', 'lift', 'stairwell-access'] },
    { id: ROOMS.connector, name: 'Service connector', bounds: bounds(-6.8, -4.6, Z.corridorS, Z.southBack, CEILING.corridor), tags: ['corridor', 'connector', 'service-access'] },
    { id: ROOMS.maintenance, name: 'Maintenance passage', bounds: bounds(-6.8, 18, Z.maintN, Z.maintS, CEILING.service), tags: ['service', 'maintenance', 'narrow', 'dark', 'loop'] },
    { id: ROOMS.stairwell, name: 'Stairwell B', bounds: bounds(18.15, 20.85, -15.4, -11.15, CEILING.stair), tags: ['stairwell', 'locked', 'future-expansion'] },
    { id: ROOMS.nurses, name: "Nurses' station", bounds: bounds(-6.8, 0.2, Z.northBack, Z.corridorN, CEILING.corridor), tags: ['nurses-station', 'staff', 'lit', 'hiding'] },
    { id: ROOMS.treatment, name: 'Treatment room', bounds: bounds(0.2, 6.6, Z.northBack, Z.northFace), tags: ['treatment', 'clinical', 'window', 'mirror'] },
    { id: ROOMS.storage, name: 'Storage room', bounds: bounds(11, 18, Z.northBack, Z.northFace), tags: ['storage', 'shelving', 'lockers', 'hiding', 'dark'] },
    { id: ROOMS.waiting, name: 'Waiting bay', bounds: bounds(-0.2, 6, Z.corridorS, Z.southBack, CEILING.corridor), tags: ['waiting', 'open-plan'] },
    { id: ROOMS.lift, name: 'Lift car (out of service)', bounds: bounds(21, 22.6, -4.85, -3.15, 2.3), tags: ['lift', 'inaccessible'] },
    { id: ROOMS.r101, name: 'Room 101 — Isolation', bounds: bounds(-20, -15.6, Z.northBack, Z.northFace), tags: ['patient-room', 'isolation', 'window', 'dark'] },
    { id: ROOMS.r103, name: 'Room 103', bounds: bounds(-15.6, -11.2, Z.northBack, Z.northFace), tags: ['patient-room', 'curtained', 'monitor', 'window'] },
    { id: ROOMS.r105, name: 'Room 105 — Semi-private', bounds: bounds(-11.2, -6.8, Z.northBack, Z.northFace), tags: ['patient-room', 'two-bed', 'window', 'hiding'] },
    { id: ROOMS.r107, name: 'Room 107 — Restraint', bounds: bounds(6.6, 11, Z.northBack, Z.northFace), tags: ['patient-room', 'restraint', 'boarded-window'] },
    { id: ROOMS.r102, name: 'Room 102 — Paediatric overflow', bounds: bounds(-20, -15.6, Z.southFace, Z.southBack), tags: ['patient-room', 'paediatric', 'lamp'] },
    { id: ROOMS.r104, name: 'Room 104', bounds: bounds(-15.6, -11.2, Z.southFace, Z.southBack), tags: ['patient-room', 'player-start', 'tv'] },
    { id: ROOMS.r106, name: 'Room 106 — Water damage', bounds: bounds(-11.2, -6.8, Z.southFace, Z.southBack), tags: ['patient-room', 'flooded', 'hiding'] },
    { id: ROOMS.r108, name: 'Room 108 — Ransacked', bounds: bounds(-4.6, -0.2, Z.southFace, Z.southBack), tags: ['patient-room', 'ransacked'] },
    { id: ROOMS.r110, name: 'Room 110', bounds: bounds(6, 10.4, Z.southFace, Z.southBack), tags: ['patient-room', 'occupied', 'monitor', 'lamp'] },
  ];
  rooms.forEach((room) => b.room(room));
}

export const PLAYER_SPAWN: SpawnPose = { position: { x: -12.4, y: 0, z: 4.1 }, yaw: 0 };

/** Entity spawn declarations and patrol routes. Behaviours are owned by NW-001B, not this module. */
export function declareActors(b: WorldBuilder): void {
  b.patrolRoutes.push(
    {
      id: 'nw:route:ward-loop',
      loop: true,
      points: [
        { x: -17, y: 0, z: 0 }, { x: -8, y: 0, z: 0 }, { x: 3, y: 0, z: -0.35 }, { x: 12, y: 0, z: 0 }, { x: 19.5, y: 0, z: 0 },
        { x: 19.5, y: 0, z: 7.2 }, { x: 12, y: 0, z: 7.15 }, { x: 8, y: 0, z: 6.95 }, { x: 2, y: 0, z: 7.2 }, { x: -5.7, y: 0, z: 7.2 },
        { x: -5.7, y: 0, z: 4.0 }, { x: -5.7, y: 0, z: 0 },
      ],
    },
    {
      id: 'nw:route:station-round',
      loop: true,
      points: [
        { x: -3.6, y: 0, z: -4.6 }, { x: -1.5, y: 0, z: -4.9 }, { x: -0.8, y: 0, z: -3.2 }, { x: -0.75, y: 0, z: -1.0 }, { x: -3.8, y: 0, z: 0 },
        { x: -10.5, y: 0, z: 0 }, { x: -3.8, y: 0, z: 0 }, { x: -0.75, y: 0, z: -1.0 }, { x: -0.8, y: 0, z: -3.2 }, { x: -1.5, y: 0, z: -4.9 },
      ],
    },
    {
      id: 'nw:route:east-wing',
      loop: true,
      points: [{ x: 19.5, y: 0, z: -9.6 }, { x: 19.5, y: 0, z: 0 }, { x: 13, y: 0, z: 0 }, { x: 19.5, y: 0, z: 0 }],
    },
  );
  b.entitySpawns.push(
    { id: 'nw:spawn:patient', entityId: 'nw:entity:patient', type: 'patient', position: { x: 6.0, y: 0, z: 7.2 }, yaw: Math.PI / 2, roomId: ROOMS.maintenance, patrolRouteId: 'nw:route:ward-loop' },
    { id: 'nw:spawn:nurse', entityId: 'nw:entity:nurse', type: 'nurse', position: { x: -3.6, y: 0, z: -4.6 }, yaw: Math.PI, roomId: ROOMS.nurses, patrolRouteId: 'nw:route:station-round' },
    { id: 'nw:spawn:crawler', entityId: 'nw:entity:crawler', type: 'crawler', position: { x: -16.9, y: 0, z: -3.6 }, yaw: Math.PI / 2, roomId: ROOMS.r101 },
    { id: 'nw:spawn:watcher', entityId: 'nw:entity:watcher', type: 'watcher', position: { x: -19.4, y: 0, z: 0.75 }, yaw: -Math.PI / 2, roomId: ROOMS.corridor },
    { id: 'nw:spawn:reflection', entityId: 'nw:entity:reflection', type: 'reflection', position: { x: 5.85, y: 0, z: -2.6 }, yaw: Math.PI / 2, roomId: ROOMS.treatment },
  );
}
