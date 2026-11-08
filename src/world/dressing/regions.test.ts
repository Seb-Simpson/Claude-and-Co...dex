import { describe, expect, it } from 'vitest';
import { createHospitalWorld } from '../createHospitalWorld';
import { PROTOTYPE_REGIONS, PROTOTYPE_SUPPRESSION } from './regions';

/**
 * The Room 104 prototype swaps visuals only. Building the world with the prototype regions
 * suppressed must leave every gameplay-relevant record identical: colliders, doors, interactables,
 * hiding spots, spawns, patrol routes, rooms, light fixtures, anomalies, mirrors and sight lines.
 */
/** Serialise records without live three.js references (object, material, canvas, redraw). */
const REFS = new Set(['object', 'material', 'canvas', 'redraw', 'leaf', 'mesh', 'left', 'right', 'group', 'panel']);
const strip = (value: unknown): string => JSON.stringify(value, (k, v: unknown) => (REFS.has(k) ? '[ref]' : typeof v === 'function' ? '[fn]' : v));

describe('Room 104 prototype suppression', () => {
  const base = createHospitalWorld({ textures: false });
  const dressed = createHospitalWorld({ textures: false, suppressVisuals: PROTOTYPE_SUPPRESSION });

  it('keeps every gameplay record identical', () => {
    for (const key of ['colliders', 'interactables', 'doors', 'hidingLocations', 'entitySpawns', 'patrolRoutes', 'rooms', 'bounds', 'playerSpawn'] as const) {
      expect(strip(dressed.world[key]), key).toBe(strip(base.world[key]));
    }
    expect(strip(dressed.extras.fixtures)).toBe(strip(base.extras.fixtures));
    expect(strip(dressed.extras.anomalies)).toBe(strip(base.extras.anomalies));
    expect(strip(dressed.extras.reflectiveSurfaces)).toBe(strip(base.extras.reflectiveSurfaces));
    expect(strip(dressed.extras.sightlines)).toBe(strip(base.extras.sightlines));
  });

  it('only leaves out static pieces inside the prototype regions', () => {
    expect(base.suppressed).toHaveLength(0);
    expect(dressed.suppressed.length).toBeGreaterThan(100);
    const regions = Object.values(PROTOTYPE_REGIONS);
    for (const piece of dressed.suppressed) {
      expect(regions.some((r) => r.containsPoint(piece.center as never)), JSON.stringify(piece)).toBe(true);
    }
    // Structural wall cores, door leaves and the wheelchair anomaly are never suppressed.
    expect(dressed.suppressed.some((p) => p.material === 'wall')).toBe(false);
    expect(dressed.world.root.getObjectByName('nw:wheelchair:nw:ward4:room-104')).toBeDefined();
  });

  it('suppresses the furniture of Room 104 and the corridor finishes it replaces', () => {
    const inRoom = dressed.suppressed.filter((p) => PROTOTYPE_REGIONS.room104.containsPoint(p.center as never)).map((p) => p.material);
    for (const material of ['floor', 'ceiling', 'mattress', 'linen', 'laminate', 'skirting']) expect(inRoom, material).toContain(material);
    const corridor = dressed.suppressed.filter((p) => PROTOTYPE_REGIONS.corridorNorthFace.containsPoint(p.center as never) || PROTOTYPE_REGIONS.corridorSouthFace.containsPoint(p.center as never)).map((p) => p.material);
    for (const material of ['wainscot', 'rail', 'skirting']) expect(corridor, material).toContain(material);
  });
});
