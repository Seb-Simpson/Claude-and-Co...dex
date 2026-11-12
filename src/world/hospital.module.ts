import type { GameModule, ModuleContext } from '../contracts';
import { createHospitalWorld, type HospitalWorldBuild } from './createHospitalWorld';
import { dressDoors, type DressedDoors } from './dressing/doors';
import { PROTOTYPE_SUPPRESSION, STATION_SUPPRESSION } from './dressing/regions';
import { loadRoom104Set, type Room104Set } from './dressing/room104';
import { loadStationSet, type StationSet } from './dressing/station';

/**
 * Publishes the canonical Blender-dressed ward through the existing module registry.
 * Both visual sets load before world construction. A failed asset rejects setup rather
 * than admitting the player into obsolete procedural visuals. DOM-free metadata fixtures
 * may still build without presentation assets. Gameplay metadata is unchanged.
 */
export default {
  id: 'nw:world:hospital',
  kind: 'world',
  async setup(context: ModuleContext) {
    let set: Room104Set | null = null;
    let station: StationSet | null = null;
    let build: HospitalWorldBuild | null = null;
    let swapped: { group: { children: { visible: boolean }[] }; hidden: { visible: boolean }[] } | null = null;
    let doors: DressedDoors | null = null;
    let disposed = false;
    function release(): void {
      if (disposed) return;
      disposed = true;
      const errors: unknown[] = [];
      const cleanup = [
        () => { if (swapped) for (const child of swapped.hidden) child.visible = true; },
        () => doors?.restore(),
        () => set?.dispose(),
        () => station?.dispose(),
        () => build?.dispose(),
      ];
      for (const dispose of cleanup) {
        try { dispose(); } catch (error) { errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, 'Hospital cleanup failed');
    }
    try {
      if (typeof document !== 'undefined') {
        const maxAnisotropy = context.engine.renderer.capabilities.getMaxAnisotropy();
        // Both visual sets are required by the public game. No silent procedural branch on retry.
        const [room, nurses] = await Promise.allSettled([loadRoom104Set({ maxAnisotropy }), loadStationSet({ maxAnisotropy })]);
        set = room.status === 'fulfilled' ? room.value : null;
        station = nurses.status === 'fulfilled' ? nurses.value : null;
        if (room.status === 'rejected' || nurses.status === 'rejected') {
          throw new AggregateError([room, nurses].flatMap(result => result.status === 'rejected' ? [result.reason] : []),
            'Canonical hospital assets unavailable. No legacy world was started.');
        }
        if (!set?.accessCard || !set.doorLeaf) {
          throw new Error('Canonical Room104 is missing its required access-card or door binding');
        }
      }
      const suppressVisuals = [...(set ? PROTOTYPE_SUPPRESSION : []), ...(station ? STATION_SUPPRESSION : [])];
      build = createHospitalWorld(suppressVisuals.length ? { suppressVisuals } : {});
      build.world.root.userData.nwPresentation = {
        mode: set && station ? 'canonical' : 'metadata-fixture',
        room104: set ? 'nw:room104-set' : null,
        station: station ? 'nw:station-set' : null,
      };
      if (station) {
        build.world.root.add(station.root);
        console.info(`NIGHT WARD: Nurses' Station set loaded (${station.stats.triangles} triangles, ${station.stats.materials} materials, ${station.stats.textures} textures)`);
      }
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
        dispose: release,
      };
    } catch (error) {
      try { release(); } catch (cleanup) {
        throw new AggregateError([error, cleanup], 'Hospital setup and cleanup failed');
      }
      throw error;
    }
  },
} satisfies GameModule;
