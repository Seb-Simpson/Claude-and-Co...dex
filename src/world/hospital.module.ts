import type { GameModule } from '../contracts';
import { createHospitalWorld } from './createHospitalWorld';

/** Publishes the Ward 4 West hospital. The registry validates and mounts `world.root`. */
export default {
  id: 'nw:world:hospital',
  kind: 'world',
  setup() {
    const build = createHospitalWorld();
    return {
      world: build.world,
      dispose() {
        build.dispose();
      },
    };
  },
} satisfies GameModule;
