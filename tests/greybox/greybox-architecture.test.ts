/**
 * NW-R02 architecture gate: topology rules from the approved brief, checked on the level data that
 * builds the geometry (the layout generator itself rejects overlaps and openings off a boundary).
 */
import { describe, expect, it } from 'vitest';
import { buildLayout } from '../../src/world/greybox/grid';
import {
  CHECKPOINTS, CONNECTIONS, ENCOUNTERS, FEATURES, SPACES, WALKTHROUGH, spaceById, type ConnectionDef,
} from '../../src/world/greybox/level';
import { reachableSpaces } from './fixture';

const layout = buildLayout();
const traversal = (c: ConnectionDef): boolean => c.kind !== 'window';
const touching = (space: string) => CONNECTIONS.filter((c) => c.a === space || c.b === space);
const other = (c: ConnectionDef, space: string) => (c.a === space ? c.b : c.a);
const zoneOf = (id: string) => spaceById(id).zone;
const isNorthWing = (id: string) => ['north-wing', 'chapter2'].includes(zoneOf(id));
const isLocked = (c: ConnectionDef) => c.door?.initial === 'locked';

/** Progression simulation: doors open when unlocked and their flag is set; controls set flags. */
function simulate(start: string, initial: readonly string[], exclude: readonly string[] = []) {
  const flags = new Set(initial);
  const used: string[] = [];
  for (;;) {
    const reach = reachableSpaces(start, (c) => !isLocked(c) && (!c.door?.requires || flags.has(c.door.requires)));
    const usable = FEATURES.filter((f) => f.kind === 'control' && reach.has(f.space) && !flags.has(f.sets)
      && !exclude.includes(f.sets) && (!f.requires || flags.has(f.requires)));
    if (usable.length === 0) return { reach, flags, used };
    for (const control of usable) if (control.kind === 'control') { flags.add(control.sets); used.push(control.sets); }
  }
}

describe('NW-R02 greybox architecture (data and generated layout)', () => {
  it('generates walls for every boundary and validates every opening against its two spaces', () => {
    expect(layout.walls.length).toBeGreaterThan(300);
    expect(layout.openings.size).toBe(CONNECTIONS.length);
    for (const [, span] of layout.openings) {
      expect(span.top).toBeGreaterThan(span.bottom);
      expect(span.top).toBeLessThanOrEqual(span.wallHeight + 1e-9);
    }
    // Every generated wall separates two different spaces (or a space and the void).
    for (const wall of layout.walls) expect(wall.sides[0]).not.toBe(wall.sides[1]);
  });

  it('central lobby connects exactly west, south, east and the Nurse’s Office (directly north)', () => {
    const links = touching('LOBBY').filter(traversal);
    expect(links.map((c) => other(c, 'LOBBY')).sort()).toEqual(['EC', 'OFFICE', 'SC', 'WC']);
    const office = links.find((c) => other(c, 'LOBBY') === 'OFFICE')!;
    expect(office.axis).toBe('x');
    expect(office.at).toBe(spaceById('LOBBY').rects[0]![2]); // the lobby's north wall
  });

  it('Nurse’s Office has exactly two primary doors: lobby (usable) and North Wing (barricaded, locked)', () => {
    const links = touching('OFFICE');
    expect(links).toHaveLength(2);
    expect(links.every((c) => c.kind === 'door')).toBe(true);
    const lobby = links.find((c) => other(c, 'OFFICE') === 'LOBBY')!;
    const north = links.find((c) => other(c, 'OFFICE') === 'NB1')!;
    expect(lobby.door!.initial).not.toBe('locked');
    expect(north.door!.initial).toBe('locked');
    expect(zoneOf('NB1')).toBe('north-wing');
    // The barricade sits on the North Wing side of the north door.
    const barricades = FEATURES.filter((f) => f.kind === 'block' && f.id.startsWith('nb1-barricade'));
    expect(barricades.length).toBeGreaterThan(0);
    for (const b of barricades) expect(b.z).toBeLessThan(north.at);
  });

  it('the west section (Room 104 start) reaches the rest of the level only through the lobby', () => {
    const west = reachableSpaces('R104', (c) => traversal(c) && c.a !== 'LOBBY' && c.b !== 'LOBBY');
    expect([...west].every((id) => zoneOf(id) === 'west')).toBe(true);
    expect(west.has('WC')).toBe(true);
    // Room 104 itself has a single door, onto the west corridor.
    expect(touching('R104').map((c) => other(c, 'R104'))).toEqual(['WC']);
  });

  it('south corridor turns east into the main store, then the smaller porters’ room farther east', () => {
    const sc = spaceById('SC');
    expect(sc.rects.some(([x0, x1, z0, z1]) => z1 - z0 > x1 - x0)).toBe(true);
    expect(sc.rects.some(([x0, x1, z0, z1]) => x1 - x0 > z1 - z0)).toBe(true);
    const st1 = spaceById('ST1').rects[0]!, st2 = spaceById('ST2').rects[0]!;
    expect(st2[0]).toBeGreaterThanOrEqual(st1[1]);
    expect((st2[1] - st2[0]) * (st2[3] - st2[2])).toBeLessThan((st1[1] - st1[0]) * (st1[3] - st1[2]));
    expect(touching('ST1').map((c) => other(c, 'ST1')).sort()).toEqual(['SC', 'ST2']);
  });

  it('east loop is a rectangle taller than wide whose ring offers two routes and reconnects at its east end', () => {
    const ring = ['LWC', 'LNC', 'LEC', 'LSC'];
    const xs = ring.flatMap((id) => spaceById(id).rects.flatMap((r) => [r[0], r[1]]));
    const zs = ring.flatMap((id) => spaceById(id).rects.flatMap((r) => [r[2], r[3]]));
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(Math.max(...xs) - Math.min(...xs));
    // Enters from the east corridor on the west side, rejoins the corridor on the east side.
    expect(touching('EC').some((c) => other(c, 'EC') === 'LWC')).toBe(true);
    expect(touching('LEC').some((c) => other(c, 'LEC') === 'EJ')).toBe(true);
    // Two distinct ring routes: either side still connects EC to EJ when the other is cut.
    const ringOnly = (blocked: string[]) => reachableSpaces('EC', (c) => traversal(c) && !blocked.includes(c.id)
      && [c.a, c.b].every((id) => ['EC', 'EJ', ...ring].includes(id)));
    expect(ringOnly(['ring-nw']).has('EJ')).toBe(true);
    expect(ringOnly(['ring-sw']).has('EJ')).toBe(true);
    expect(ringOnly(['ring-nw', 'ring-sw']).has('EJ')).toBe(false);
    // The core office has a door on each long side and an observation window on both.
    const office = touching('LOFF');
    expect(office.filter((c) => c.kind === 'door' && other(c, 'LOFF') === 'LWC')).toHaveLength(1);
    expect(office.filter((c) => c.kind === 'door' && other(c, 'LOFF') === 'LEC')).toHaveLength(1);
    expect(office.filter((c) => c.kind === 'window').map((c) => other(c, 'LOFF')).sort()).toEqual(['LEC', 'LWC']);
    // Eight patient rooms, each with one door onto the ring.
    const rooms = SPACES.filter((s) => /^LP[WE][1-4]$/.test(s.id));
    expect(rooms).toHaveLength(8);
    for (const room of rooms) expect(touching(room.id).map((c) => other(c, room.id))).toEqual([room.id.startsWith('LPW') ? 'LWC' : 'LEC']);
  });

  it('east corridor splits into a southern branch (crawlway exit) and a northern branch (maintenance)', () => {
    expect(touching('EJ').map((c) => other(c, 'EJ')).sort()).toEqual(['LEC', 'NBR', 'SB']);
    expect(touching('ES2').map((c) => other(c, 'ES2')).sort()).toEqual(['CX', 'SB']);
    expect(touching('M0').map((c) => other(c, 'M0')).sort()).toEqual(['M1A', 'NBR']);
  });

  it('service crawlway runs from the stores to the southern branch with two splits that each rejoin', () => {
    const crawl = SPACES.filter((s) => s.zone === 'crawl');
    expect(crawl.every((s) => s.ceiling < 1.8)).toBe(true);
    const viaCrawl = (blocked: string[]) => reachableSpaces('ST2', (c) => traversal(c) && !blocked.includes(c.id)
      && [c.a, c.b].every((id) => ['ST2', 'ES2'].includes(id) || zoneOf(id) === 'crawl'));
    expect(viaCrawl([]).has('ES2')).toBe(true);
    for (const cut of [['cw-a1'], ['cw-b1'], ['cw-c1'], ['cw-d1']]) expect(viaCrawl(cut).has('ES2'), cut.join()).toBe(true);
    expect(viaCrawl(['cw-a1', 'cw-b1']).has('ES2')).toBe(false);
    expect(viaCrawl(['cw-c1', 'cw-d1']).has('ES2')).toBe(false);
    // Only two ways in or out: the porters' room hatch and the ES2 grille.
    const exits = CONNECTIONS.filter((c) => (zoneOf(c.a) === 'crawl') !== (zoneOf(c.b) === 'crawl'));
    expect(exits.map((c) => c.id).sort()).toEqual(['grille', 'hatch']);
  });

  it('maintenance passage starts beyond the northern branch, winds generally west and is one uninterrupted line', () => {
    const chain = ['NBR', 'M0', 'M1A', 'M1B', 'M2', 'M3', 'M4', 'M5', 'M6A', 'M6B', 'M6C', 'M6D', 'M6E', 'M7', 'M8', 'M8C', 'NL', 'NB'];
    const centreX = (id: string) => { const r = spaceById(id).rects[0]!; return (r[0] + r[1]) / 2; };
    expect(centreX('NL')).toBeLessThan(centreX('M0') - 40);
    for (let i = 1; i < chain.length - 1; i += 1) {
      const id = chain[i]!;
      const links = touching(id).filter(traversal).map((c) => other(c, id)).sort();
      expect(links, id).toEqual([chain[i - 1]!, chain[i + 1]!].sort());
    }
  });

  it('chase run: every link is a cut edge (no parallel route around which Shaw could get ahead)', () => {
    const chase = CONNECTIONS.filter((c) => ['chase', 'old-north'].includes(zoneOf(c.a)) || ['chase', 'old-north'].includes(zoneOf(c.b))
      || c.id === 'bulkhead');
    expect(chase.length).toBeGreaterThan(8);
    for (const cut of chase) {
      const reach = reachableSpaces('M5', (c) => traversal(c) && !isLocked(c) && c.id !== cut.id);
      expect(reach.has('NB'), `${cut.id} must be the only way through`).toBe(false);
    }
    // Shaw starts behind (through the bulkhead): nothing joins the chase from any other side.
    const joins = CONNECTIONS.filter((c) => [c.a, c.b].some((id) => zoneOf(id) === 'chase')
      && [c.a, c.b].some((id) => !['chase', 'old-north', 'maintenance'].includes(zoneOf(id))));
    expect(joins).toHaveLength(0);
  });

  it('North Wing: reachable only through the NT doors (the office door is barricaded) and continues into Chapter 2', () => {
    const intoNorth = CONNECTIONS.filter((c) => isNorthWing(c.a) !== isNorthWing(c.b));
    expect(intoNorth.map((c) => c.id).sort()).toEqual(['NT', 'office-north']);
    const withoutNT = reachableSpaces('R104', (c) => traversal(c) && !isLocked(c) && c.id !== 'NT');
    expect([...withoutNT].some(isNorthWing)).toBe(false);
    // Chapter 2 continuation exists beyond locked doors (not a dead end).
    const c2 = CONNECTIONS.filter((c) => c.rule?.startsWith('Chapter 2'));
    expect(c2.length).toBeGreaterThanOrEqual(2);
    expect(c2.every((c) => isLocked(c))).toBe(true);
  });

  it('no unreachable rooms: every space is reachable from Room 104 once doors are open (Chapter 2 stubs aside)', () => {
    const all = reachableSpaces('R104', traversal);
    expect(all.size).toBe(SPACES.length);
    const playable = reachableSpaces('R104', (c) => traversal(c) && !isLocked(c));
    for (const space of SPACES) {
      if (space.zone === 'chapter2') expect(playable.has(space.id)).toBe(false);
      else expect(playable.has(space.id), space.id).toBe(true);
    }
  });

  it('progression has no softlock and the North Wing opens only after the bulkhead', () => {
    const run = simulate('R104', []);
    expect(run.reach.has('NB1')).toBe(true);
    expect(run.flags.has('chapter-end')).toBe(true);
    // Order: keys before Plant 2, valve before the steam, crank before the chase.
    expect(run.used.indexOf('shaw-keys')).toBeGreaterThanOrEqual(0);
    const noKeys = simulate('R104', [], ['shaw-keys']);
    expect(noKeys.reach.has('M0')).toBe(false);
    const noCrank = simulate('R104', [], ['bulkhead-cranked']);
    expect([...noCrank.reach].some(isNorthWing)).toBe(false);
    const noValve = simulate('R104', [], ['valve-open']);
    expect(noValve.reach.has('M4')).toBe(false);
    // The F1 shortcut is optional: the chapter completes without it.
    expect(simulate('R104', [], ['f1-open']).flags.has('chapter-end')).toBe(true);
  });

  it('walkthrough steps 1–15, checkpoints and encounter areas sit in valid, required spaces', () => {
    expect(WALKTHROUGH.map((s) => s.step)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    for (const step of WALKTHROUGH) {
      const space = layout.spaceAt(step.x, step.z);
      expect(space, `step ${step.step}`).not.toBeNull();
      expect(space!.required, `step ${step.step} in ${space!.id}`).toBe(true);
      if (step.control) expect(FEATURES.some((f) => f.kind === 'control' && f.id === step.control)).toBe(true);
      for (const door of step.doors ?? []) expect(CONNECTIONS.some((c) => c.id === door && c.kind === 'door')).toBe(true);
    }
    expect(layout.spaceAt(WALKTHROUGH[0]!.x, WALKTHROUGH[0]!.z)!.id).toBe('R104');
    expect(layout.spaceAt(WALKTHROUGH[14]!.x, WALKTHROUGH[14]!.z)!.id).toBe('NB1');
    expect(CHECKPOINTS.map((c) => c.id)).toEqual(['CP0', 'CP1', 'CP2', 'CP3', 'CP4', 'CP5', 'CP6', 'CP7', 'CP8']);
    for (const cp of CHECKPOINTS) expect(layout.spaceAt(cp.x, cp.z), cp.id).not.toBeNull();
    for (const encounter of ENCOUNTERS) for (const id of encounter.spaces) expect(() => spaceById(id)).not.toThrow();
  });

  it('reserves locations for all three key approaches in the loop', () => {
    const approaches = FEATURES.filter((f) => f.kind === 'marker' && f.category === 'approach');
    for (const tag of ['Approach A', 'Approach B', 'Approach C']) {
      expect(approaches.some((f) => f.kind === 'marker' && f.label.startsWith(tag)), tag).toBe(true);
    }
    for (const a of approaches) expect(zoneOf(a.space)).toBe('loop');
    // B: call buttons on far sides of the loop (west and east columns).
    const calls = approaches.filter((f) => f.kind === 'marker' && f.label.startsWith('Approach B'));
    expect(new Set(calls.map((f) => f.space.slice(0, 3)))).toEqual(new Set(['LPW', 'LPE']));
    // The key theft itself is a clearly labelled developer placeholder.
    const theft = FEATURES.find((f) => f.id === 'key-theft');
    expect(theft?.kind === 'control' && theft.label.startsWith('[DEV PLACEHOLDER]')).toBe(true);
  });
});
