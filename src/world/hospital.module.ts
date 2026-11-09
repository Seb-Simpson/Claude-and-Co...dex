import type { GameModule, ModuleContext } from '../contracts';
import { createHospitalWorld } from './createHospitalWorld';
import { PROTOTYPE_SUPPRESSION } from './dressing/regions';
import { loadRoom104Set, type Room104Set } from './dressing/room104';

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
    if (!proceduralSetRequested() && typeof document !== 'undefined') {
      try {
        set = await loadRoom104Set({ maxAnisotropy: context.engine.renderer.capabilities.getMaxAnisotropy() });
      } catch (error) {
        console.warn('NIGHT WARD: Room 104 visual set unavailable, using the procedural room:', error instanceof Error ? error.message : error);
      }
    }
    const build = createHospitalWorld(set ? { suppressVisuals: PROTOTYPE_SUPPRESSION } : {});
    let swapped: { group: { children: { visible: boolean }[] }; hidden: { visible: boolean }[] } | null = null;
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
      console.info(`NIGHT WARD: Room 104 visual set loaded (${set.stats.triangles} triangles, ${set.stats.materials} materials, ${set.stats.textures} textures)`);
    }
    return {
      world: build.world,
      update(frame) { set?.update(frame.deltaSeconds); },
      dispose() {
        if (swapped) for (const c of swapped.hidden) c.visible = true;
        set?.dispose();
        build.dispose();
      },
    };
  },
} satisfies GameModule;
