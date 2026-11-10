import type { GameModule, ModuleContext } from '../contracts';
import { createHospitalWorld } from './createHospitalWorld';
import { dressDoors, type DressedDoors } from './dressing/doors';
import { PROTOTYPE_SUPPRESSION, STATION_SUPPRESSION } from './dressing/regions';
import { loadRoom104Set, type Room104Set } from './dressing/room104';
import { loadStationSet, type StationSet } from './dressing/station';

/** `?nwSet=procedural` keeps the procedural Room 104 and west corridor (for comparisons). */
function proceduralSetRequested(): boolean {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).get('nwSet') === 'procedural';
  } catch {
    return false;
  }
}

/**
 * Publishes the Ward 4 West hospital. The registry validates and mounts `world.root`.
 *
 * Room 104 and the west corridor use the Blender-built visual set (src/world/dressing) when it
 * loads. The set is loaded *before* the world is built, so there is never a half-replaced room:
 * on success the procedural visuals inside the prototype regions are left out; on failure the
 * whole procedural world is built as before. Colliders, doors, interactables, navigation, spawns,
 * lights and anomalies are identical either way.
 */
export default {
  id: 'nw:world:hospital',
  kind: 'world',
  async setup(context: ModuleContext) {
    let set: Room104Set | null = null;
    let station: StationSet | null = null;
    if (!proceduralSetRequested() && typeof document !== 'undefined') {
      const maxAnisotropy = context.engine.renderer.capabilities.getMaxAnisotropy();
      // NW-006A: the Nurses' Station set loads alongside; each set falls back on its own.
      const [room, nurses] = await Promise.allSettled([loadRoom104Set({ maxAnisotropy }), loadStationSet({ maxAnisotropy })]);
      if (room.status === 'fulfilled') set = room.value;
      else console.warn('NIGHT WARD: Room 104 visual set unavailable, using the procedural room:', room.reason instanceof Error ? room.reason.message : room.reason);
      if (nurses.status === 'fulfilled') station = nurses.value;
      else console.warn('NIGHT WARD: Nurses\u2019 Station set unavailable, using the procedural stand-ins:', nurses.reason instanceof Error ? nurses.reason.message : nurses.reason);
    }
    const suppressVisuals = [...(set ? PROTOTYPE_SUPPRESSION : []), ...(station ? STATION_SUPPRESSION : [])];
    const build = createHospitalWorld(suppressVisuals.length ? { suppressVisuals } : {});
    if (station) {
      build.world.root.add(station.root);
      console.info(`NIGHT WARD: Nurses' Station set loaded (${station.stats.triangles} triangles, ${station.stats.materials} materials, ${station.stats.textures} textures)`);
    }
    let swapped: { group: { children: { visible: boolean }[] }; hidden: { visible: boolean }[] } | null = null;
    let doors: DressedDoors | null = null;
    if (set) {
      build.world.root.add(set.root);
      // The wheelchair is a creep anomaly (the horror module moves its group): dress the group.
      const group = build.world.root.getObjectByName('nw:wheelchair:nw:ward4:room-104');
      if (group && set.wheelchair) {
        const hidden = group.children.filter((c) => c.visible);
        for (const c of hidden) c.visible = false;
        group.add(set.wheelchair);
        swapped = { group, hidden };
      }
      // NW-005A: the Blender door leaf inside each corridor door group (gameplay still animates them).
      if (set.doorLeaf) doors = dressDoors(build.world, set.doorLeaf);
      console.info(`NIGHT WARD: Room 104 visual set loaded (${set.stats.triangles} triangles, ${set.stats.materials} materials, ${set.stats.textures} textures)`);
    }
    return {
      world: build.world,
      update(frame) { set?.update(frame.deltaSeconds); station?.update(frame.deltaSeconds); },
      dispose() {
        if (swapped) for (const c of swapped.hidden) c.visible = true;
        doors?.restore();
        set?.dispose();
        station?.dispose();
        build.dispose();
      },
    };
  },
} satisfies GameModule;
