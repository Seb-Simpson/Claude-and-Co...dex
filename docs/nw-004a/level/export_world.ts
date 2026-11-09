import { writeFileSync } from 'node:fs';
import { createHospitalWorld } from '../../../src/world';

// Run on demand: npx vite-node docs/nw-004a/level/export_world.ts
// Dumps the real world's rooms, doors, hiding spots, interactables and patrol routes for the plan maps.
{
  const h = createHospitalWorld({ textures: false });
  const out = {
    rooms: h.world.rooms.map((r) => ({ id: r.id, name: r.name, min: r.bounds.min, max: r.bounds.max, tags: r.tags })),
    doors: h.world.doors.map((d) => ({ id: d.id, state: d.initialState, at: d.object.getWorldPosition(d.object.position.clone()) })),
    hiding: h.world.hidingLocations.map((s) => ({ id: s.id, type: s.type, at: s.playerPosition })),
    interactables: h.world.interactables.filter((i) => i.type === 'inspect' || i.type === 'cabinet' || i.type === 'drawer').map((i) => ({ id: i.id, type: i.type, at: i.object.getWorldPosition(i.object.position.clone()) })),
    routes: h.world.patrolRoutes.map((r) => ({ id: r.id, points: r.points })),
    spawns: h.world.entitySpawns.map((s) => ({ id: s.id, type: s.type, at: s.position })),
    player: h.world.playerSpawn,
  };
  writeFileSync('docs/nw-004a/level/world-export.json', JSON.stringify(out, null, 1));
  h.dispose();
}
