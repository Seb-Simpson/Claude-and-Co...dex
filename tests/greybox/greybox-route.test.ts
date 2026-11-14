/**
 * The committed walkthrough route (tests/browser/greybox-route.json) must match the current
 * geometry. Regenerate with GREYBOX_WRITE_ROUTE=1 npx vitest run tests/greybox/greybox-route.test.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WALKTHROUGH } from '../../src/world/greybox/level';
import { createFixture, type Fixture } from './fixture';
import { buildRoute, type RouteLeg } from './route';

const FILE = 'tests/browser/greybox-route.json';
let f: Fixture;
beforeAll(async () => { f = await createFixture(); });
afterAll(() => f?.dispose());

describe('NW-R02 walkthrough route (steps 1–15) over the real colliders', () => {
  it('routes every step from Room 104 to the far side of the barricade, and matches the committed route', () => {
    const legs = buildRoute(f);
    expect(legs.map((l) => l.step)).toEqual(WALKTHROUGH.map((s) => s.step));
    const total = legs.reduce((n, l) => n + l.length, 0);
    expect(total).toBeGreaterThan(300);
    // Crawlway and low sections are crouched; the rest is walked standing.
    expect(legs.find((l) => l.step === 9)!.points.some((p) => p.crouch)).toBe(true);
    expect(legs.find((l) => l.step === 4)!.points.every((p) => !p.crouch)).toBe(true);
    const json = JSON.stringify({ generatedFrom: 'tests/greybox/route.ts', totalLength: Math.round(total * 10) / 10, legs }, null, 1);
    if (process.env.GREYBOX_WRITE_ROUTE === '1' || !existsSync(FILE)) writeFileSync(FILE, `${json}\n`);
    const committed = JSON.parse(readFileSync(FILE, 'utf8')) as { legs: RouteLeg[] };
    expect(committed.legs).toEqual(JSON.parse(json).legs);
  }, 300_000);
});
