/**
 * Generates docs/nw-r02/registry.md (room/corridor registry, door/connection registry, features,
 * placeholders) straight from the level data, and fails if the committed copy is stale.
 * Regenerate with GREYBOX_WRITE_DOCS=1 npx vitest run tests/greybox/registry.test.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildLayout } from '../../src/world/greybox/grid';
import { CHECKPOINTS, CONNECTIONS, ENCOUNTERS, FEATURES, SPACES, ZONES } from '../../src/world/greybox/level';

const FILE = 'docs/nw-r02/registry.md';
const n1 = (v: number) => (Math.round(v * 10) / 10).toString();

function render(): string {
  const layout = buildLayout();
  const lines: string[] = [];
  lines.push('# NW-R02 — Greybox registries (generated)', '');
  lines.push('Generated from `src/world/greybox/level.ts` by `tests/greybox/registry.test.ts`. Do not edit by hand.', '');
  lines.push('Coordinates are metres: x east, z south (−z is north), floor at y = 0.', '');

  lines.push('## 1. Room and corridor registry', '');
  lines.push('| ID | Name | Zone | Kind | Rectangles [x0, x1, z0, z1] | Area m² | Ceiling m | Path | R01 ref | Connections |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  let area = 0;
  for (const s of SPACES) {
    const a = s.rects.reduce((n, [x0, x1, z0, z1]) => n + (x1 - x0) * (z1 - z0), 0);
    area += a;
    const links = CONNECTIONS.filter((c) => c.a === s.id || c.b === s.id).map((c) => c.id);
    lines.push(`| ${s.id} | ${s.name} | ${s.zone} | ${s.kind} | ${s.rects.map((r) => `[${r.join(', ')}]`).join(' ')} | ${n1(a)} | ${s.ceiling}${s.ceiling < 1.8 ? ' (crouch)' : ''} | ${s.required ? 'required' : 'optional'} | ${s.ref ?? '—'} | ${links.join(', ')} |`);
  }
  lines.push('', `${SPACES.length} spaces, ${n1(area)} m² of floor, ${layout.walls.filter((w) => w.kind === 'wall').length} generated wall runs, ${layout.walls.filter((w) => w.kind === 'lintel').length} lintels, ${layout.walls.filter((w) => w.kind === 'sill').length} sills.`, '');

  lines.push('### Zones', '', '| Zone | Label | Spaces |', '|---|---|---|');
  for (const z of ZONES) lines.push(`| ${z.id} | ${z.label} | ${SPACES.filter((s) => s.zone === z.id).map((s) => s.id).join(', ')} |`);
  lines.push('');

  lines.push('## 2. Door and connection registry', '');
  lines.push('| ID | Between | Kind | Wall | Centre | Width m | Opening (bottom–top) m | Initial | Requires | Swing into | Rule / note |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const c of CONNECTIONS) {
    const span = layout.openings.get(c.id)!;
    const wall = c.axis === 'x' ? `z = ${c.at}` : `x = ${c.at}`;
    lines.push(`| ${c.id} | ${c.a} ↔ ${c.b} | ${c.kind}${c.door?.double ? ' (double)' : ''} | ${wall} | ${c.center} | ${c.width} | ${n1(span.bottom)}–${n1(span.top)} | ${c.door?.initial ?? '—'} | ${c.door?.requires ?? '—'} | ${c.door ? (c.door.swingInto ?? c.b) : '—'} | ${c.rule ?? c.note ?? ''} |`);
  }
  lines.push('', `${CONNECTIONS.length} connections: ${CONNECTIONS.filter((c) => c.kind === 'door').length} doors (${CONNECTIONS.filter((c) => c.door?.double).length} double), ${CONNECTIONS.filter((c) => c.kind === 'open').length} open, ${CONNECTIONS.filter((c) => c.kind === 'hatch').length} hatches, ${CONNECTIONS.filter((c) => c.kind === 'window').length} windows.`, '');

  lines.push('## 3. Features (hiding, cover, controls, markers)', '');
  lines.push('| ID | Space | Kind | Position (x, z) | Detail |', '|---|---|---|---|---|');
  for (const f of FEATURES) {
    const detail = f.kind === 'control' ? `sets \`${f.sets}\`${f.futureSeconds ? ` · production estimate ${f.futureSeconds} s` : ''} · ${f.label}`
      : f.kind === 'marker' ? `${f.category}: ${f.label}`
      : f.kind === 'block' ? `${n1(f.w)} × ${n1(f.d)} × ${n1(f.h)} m${f.cover ? ' (cover)' : ''}${f.label ? ` · ${f.label}` : ''}`
      : f.kind === 'locker' ? (f.hide === false ? 'locker (not a hiding spot)' : 'locker hiding')
      : f.kind === 'bed' ? (f.hide ? 'bed, under-bed hiding' : 'bed')
      : 'bench, under-bench hiding (bed-type)';
    lines.push(`| ${f.id} | ${f.space} | ${f.kind} | ${n1(f.x)}, ${n1(f.z)} | ${detail} |`);
  }
  lines.push('');

  lines.push('## 4. Checkpoints (developer teleports)', '', '| CP | Label | Position | Flags restored |', '|---|---|---|---|');
  for (const cp of CHECKPOINTS) lines.push(`| ${cp.id} | ${cp.label} | ${cp.x}, ${cp.z} (${layout.spaceAt(cp.x, cp.z)!.id}) | ${cp.flags.join(', ') || '—'} |`);
  lines.push('');

  lines.push('## 5. Encounter areas', '', '| ID | Area [x0, x1, z0, z1] | Spaces | Note |', '|---|---|---|---|');
  for (const e of ENCOUNTERS) lines.push(`| ${e.label} | [${e.rect.join(', ')}] | ${e.spaces.join(', ')} | ${e.note} |`);
  lines.push('');
  return lines.join('\n');
}

describe('NW-R02 registries', () => {
  it('docs/nw-r02/registry.md matches the level data', () => {
    const text = render();
    if (process.env.GREYBOX_WRITE_DOCS === '1' || !existsSync(FILE)) { mkdirSync('docs/nw-r02', { recursive: true }); writeFileSync(FILE, text); }
    expect(readFileSync(FILE, 'utf8')).toBe(text);
  });
});
