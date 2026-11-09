"""The Fractured Ward: proposed NW-004A layout, as data plus a drawn top-down map.

    python3 docs/nw-004a/plan/fractured_ward_plan.py docs/nw-004a/plan

Writes fractured-ward-plan.json (rooms, doors, routes, sightlines) and fractured-ward-L4.png /
fractured-ward-L5-L3.png. Coordinates are the game's (metres, x east, z south, north = -z).
PROPOSAL ONLY: nothing here is built until approved. See docs/NW-004A.md.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
ROOT = os.path.join(os.path.dirname(__file__), '../../..')
FONT = os.path.join(ROOT, 'node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff')
MONO = os.path.join(ROOT, 'node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff')

# status: kept (exists, unchanged) | kept-mod (exists, gains doors/glazing, ID kept)
#         new1 (phase 1, additive) | new2 (phase 2, needs Codex sign-off)
ZONES = {
    'wingA': ('Patient Wing A', (78, 110, 138)),
    'station': ("Nurses' station", (190, 150, 70)),
    'atrium': ('Central Atrium', (150, 90, 170)),
    'treat': ('Treatment Department', (70, 150, 140)),
    'wingB': ('Patient Wing B', (170, 110, 80)),
    'service': ('Records / Electrical', (120, 120, 120)),
    'maint': ('Maintenance network', (95, 95, 80)),
    'stair': ('Stairwell B tower', (180, 60, 60)),
    'circ': ('Circulation', (90, 100, 105)),
}
R = []


def room(id_, label, zone, x0, x1, z0, z1, status, level=4, note=''):
    R.append(dict(id=id_, label=label, zone=zone, x=[x0, x1], z=[z0, z1], status=status, level=level, note=note,
                  size=f'{abs(x1 - x0):.1f} x {abs(z1 - z0):.1f} m'))


# ---- Level 4 (ward floor, y = 0) --------------------------------------------------------------
room('nw:ward4:corridor-main', 'Wing A corridor', 'wingA', -20, -7, -1.4, 1.4, 'kept', note='Blender set; lobby + bulkhead at x -9.3 break the sightline (Option A)')
for n, x0, x1 in (('101', -20, -15.6), ('103', -15.6, -11.2), ('105', -11.2, -6.8)):
    room(f'nw:ward4:room-{n}', n, 'wingA', x0, x1, -6.4, -1.55, 'kept', note='unchanged; exterior windows')
for n, x0, x1 in (('102', -20, -15.6), ('104', -15.6, -11.2), ('106', -11.2, -6.8)):
    room(f'nw:ward4:room-{n}', n, 'wingA', x0, x1, 1.55, 6.4, 'kept', note='104: player start, Blender set' if n == '104' else '')
room('nw:ward4:nurses-station', "Nurses' station", 'station', -6.8, 0.2, -6.4, -1.4, 'kept-mod', note='+ glazed north screen and door to the Observation Walk')
room('nw:ward4:corridor-main#east', 'Clinical street (corridor east)', 'circ', -7, 18, -1.4, 1.4, 'kept-mod', note='same ID; fire-door lobby at x 8.4 kept closed-ish; Phase 2 may add a dogleg')
room('nw:ward4:connector', 'Service connector', 'maint', -6.8, -4.6, 1.4, 6.4, 'kept')
room('nw:ward4:room-108', '108', 'wingA', -4.6, -0.2, 1.55, 6.4, 'kept')
room('nw:ward4:waiting-bay', 'Waiting bay', 'circ', -0.2, 6.0, 1.4, 6.4, 'kept-mod', note='+ fire-door airlock south across the maintenance passage to Wing B')
room('nw:ward4:room-110', '110', 'wingB', 6.0, 10.4, 1.55, 6.4, 'kept')
room('nw:ward4:records-112', '112 Records', 'service', 10.4, 14.2, 1.55, 6.4, 'kept', note='built in NW-004A')
room('nw:ward4:electrical-114', '114 Electrical', 'service', 14.2, 18, 1.55, 6.4, 'kept', note='built in NW-004A; locked service door to maintenance')
room('nw:ward4:treatment', 'Treatment', 'treat', 0.2, 6.6, -6.4, -1.55, 'kept-mod', note='+ internal door east, + north door to the Walk')
room('nw:ward4:room-107', 'Procedure (was 107)', 'treat', 6.6, 11.0, -6.4, -1.55, 'new2', note='ID kept; becomes the procedure room')
room('nw:ward4:observation', 'Observation', 'treat', 11.0, 14.4, -6.4, -1.55, 'new2', note='one-way glass into Procedure')
room('nw:ward4:storage', 'Clean utility (was storage)', 'treat', 14.4, 18, -6.4, -1.55, 'new2', note='ID kept; the 4 hiding lockers must stay or be migrated')
room('nw:ward4:observation-walk', 'Observation Walk (glazed link)', 'circ', -6.8, 18, -8.2, -6.55, 'new1', note='glass to the atrium on its north side')
room('nw:ward4:atrium', 'Central Atrium (double height)', 'atrium', -4, 14, -21, -8.2, 'new1', note='18 x 12.8 m, 8.4 m high, skylight; dead tree in a dry fountain at (5, -14.5)')
room('nw:ward4:atrium-east-lobby', 'East lobby + lift 2', 'circ', 14, 18.15, -15, -8.2, 'new1')
room('nw:ward4:corridor-east', 'East corridor', 'circ', 18.15, 20.85, -11, 12, 'kept-mod', note='extended south to z 12 to reach Wing B')
room('nw:ward4:lift-car', 'Lift', 'circ', 21, 22.6, -4.85, -3.15, 'kept')
room('nw:ward4:stairwell-b', 'Stairwell B tower', 'stair', 18.15, 22.6, -21, -11, 'kept-mod', note='grows from 2.7 x 4.4 m to 4.45 x 10 m, L3-L5 with an open well; door ID kept')
room('nw:ward4:maintenance', 'Maintenance passage', 'maint', -6.8, 18, 6.55, 7.95, 'kept')
room('nw:ward4:maint-junction', 'Pump junction', 'maint', 8, 11, 7.95, 9.6, 'new1', note='widening with pumps; branch south into Wing B service corridor')
room('nw:ward4:maint-west', 'West service run', 'maint', -20, -6.8, 6.55, 7.6, 'new1', note='1.05 m wide, pipe-choked; ends at the riser room')
room('nw:ward4:riser', 'Riser / plant', 'maint', -20, -17.5, 7.6, 9.6, 'new1', note='dead end with a hiding cupboard; ladder (scenery)')
room('nw:ward4:wingb-corridor', 'Wing B corridor (L)', 'wingB', -2, 18.15, 9.6, 11.6, 'new1', note='older 1960s wing: terrazzo, timber, radiators')
room('nw:ward4:wingb-corridor-s', 'Wing B corridor (south leg)', 'wingB', 14, 16, 11.6, 21, 'new1')
for i, (x0, x1) in enumerate([(-2, 2.4), (2.4, 6.8), (6.8, 11.2)]):
    room(f'nw:ward4:room-12{1 + 2 * i}', f'12{1 + 2 * i} ({["4-bed bay", "single", "4-bed bay"][i]})', 'wingB', x0, x1, 11.6, 17.0, 'new1')
room('nw:ward4:dayroom', 'Dayroom (bay window, piano)', 'wingB', -2, 8, 17.0, 21, 'new1', note='the Wing B landmark; long view out to the dark courtyard')
room('nw:ward4:room-127', '127 (bathroom, tubs)', 'wingB', 8, 14, 17.0, 21, 'new1')
room('nw:ward4:room-129', '129 (side room)', 'wingB', 11.2, 14, 11.6, 17.0, 'new1')
room('nw:ward4:wingb-sluice', 'Sluice', 'wingB', 16, 18.15, 11.6, 15, 'new1')

# ---- Level 5 (gallery, y = 4.2) and Level 3 (y = -4.2) ---------------------------------------
room('nw:ward4:gallery', 'Gallery (mezzanine)', 'atrium', -4, 18.15, -21, -18, 'new1', level=5, note='3 m wide, glass balustrade; looks down on the whole atrium floor')
room('nw:ward4:gallery-east', 'Gallery east arm', 'atrium', 11, 14, -18, -8.2, 'new1', level=5)
room('nw:ward4:stair-l5', 'Stair tower L5 landing', 'stair', 18.15, 22.6, -21, -18, 'new1', level=5)
room('nw:ward4:stair-l3', 'Stair tower L3 landing / exit', 'stair', 18.15, 22.6, -14, -11, 'new1', level=3, note='Chapter 1 ending: the door down and out')

DOORS = [
    # id, (x, z), level, status, between
    ('nw:door:station-walk', (-3.0, -6.48), 4, 'new1', "station <-> Observation Walk"),
    ('nw:door:treatment-walk', (3.4, -6.48), 4, 'new1', 'treatment <-> Walk'),
    ('nw:door:walk-atrium-w', (-1.0, -8.2), 4, 'new1', 'Walk <-> atrium (glazed double doors)'),
    ('nw:door:walk-atrium-e', (9.0, -8.2), 4, 'new1', 'Walk <-> atrium'),
    ('nw:door:atrium-lobby', (14.0, -11.6), 4, 'new1', 'atrium <-> east lobby'),
    ('nw:door:lobby-stair', (18.15, -13.2), 4, 'new1', 'east lobby <-> stair tower'),
    ('nw:door:stairwell-b', (19.5, -11.0), 4, 'kept', 'east corridor <-> stair tower (chained)'),
    ('nw:door:gallery-stair', (18.15, -19.5), 5, 'new1', 'gallery <-> stair L5'),
    ('nw:door:stair-l3-exit', (22.6, -12.5), 3, 'new1', 'L3 exit (chapter end)'),
    ('nw:door:waiting-airlock-n', (3.0, 6.48), 4, 'new1', 'waiting bay <-> maintenance'),
    ('nw:door:waiting-airlock-s', (3.0, 7.95), 4, 'new1', 'maintenance <-> Wing B'),
    ('nw:door:maint-junction-wingb', (9.5, 9.6), 4, 'new1', 'pump junction <-> Wing B'),
    ('nw:door:east-wingb', (18.15, 10.6), 4, 'new1', 'east corridor <-> Wing B'),
    ('nw:door:electrical-service', (16.6, 6.48), 4, 'kept', 'electrical <-> maintenance (locked)'),
    ('nw:door:maintenance-west', (-5.7, 6.48), 4, 'kept', 'connector <-> maintenance'),
    ('nw:door:maintenance-east', (18.08, 7.25), 4, 'kept', 'maintenance <-> east corridor'),
    ('nw:door:procedure-observe', (11.0, -4.0), 4, 'new2', 'procedure <-> observation'),
    ('nw:door:treatment-procedure', (6.6, -4.0), 4, 'new2', 'treatment <-> procedure (enfilade)'),
]

ROUTES = {
    'player golden path (provisional, Codex owns objectives)': ((235, 200, 90), 4, [
        (-12.4, 4.1), (-12.0, 0), (-6, 0), (-3.5, -2.0), (-3.0, -7.4), (-1.0, -9.5), (5, -11.5), (9, -9.5), (9, -7.4), (3.4, -5.0),
        (3.4, 0), (11.95, 0), (11.95, 4.5), (11.95, 0), (16.4, 0), (16.4, 4.5), (16.6, 7.25), (9.5, 7.25), (9.5, 10.6), (3, 14), (3, 19), (15, 19),
        (15, 10.6), (19.5, 10.6), (19.5, -11.5), (20.4, -16)]),
    'Nurse patrol (glass-visible loop)': ((90, 170, 255), 3, [
        (-3.6, -4.3), (-3.0, -7.4), (2, -7.4), (2, -12), (5, -17.5), (11, -14), (9, -9), (9, -7.4), (3.4, -7.4), (3.4, -3.5), (-0.8, -2.2), (-3.6, -4.3)]),
    'Patient chase loop (atrium circuit)': ((235, 60, 50), 3, [
        (-5, 0), (-3.0, -3.5), (-3.0, -7.4), (-1, -10), (2, -16), (8, -18.5), (13, -14), (16, -11.6), (19.5, -9), (19.5, 0), (8, 0), (-5, 0)]),
    'Patient chase loop (Wing B / service circuit)': ((235, 120, 60), 3, [
        (3, 0), (3, 4), (3, 7.25), (3, 10.6), (15, 10.6), (19.5, 10.6), (19.5, 0), (3, 0)]),
}

SIGHTLINES = [
    ((-9.5, 0.6), (-3.6, -4.5), 'Wing A corridor -> station glass: first glimpse of the Nurse'),
    ((8, -19.5), (5, -12), 'gallery -> atrium floor: movement at a distance'),
    ((-13, -3.5), (-12, -9), '103 north window -> atrium edge'),
    ((19.5, -15), (19.5, -12), 'stair well: look down to L3, up to L5'),
    ((12.6, -4), (8.8, -4), 'observation one-way glass -> procedure'),
    ((-1, -6.6), (-1, -14), 'Walk glazing -> landmark tree'),
]


def draw(levels, path, title, extent=(-22, 24, -23, 23), scale=19):
    x0e, x1e, z0e, z1e = extent
    W, H = int((x1e - x0e) * scale) + 360, int((z1e - z0e) * scale) + 90
    img = Image.new('RGB', (W, H), (14, 16, 17))
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FONT, 13)
    fb = ImageFont.truetype(FONT, 22)
    fm = ImageFont.truetype(MONO, 11)
    px = lambda x, z: (int((x - x0e) * scale) + 20, int((z - z0e) * scale) + 60)
    d.text((20, 16), title, font=fb, fill=(230, 226, 214))
    for m in range(int(x0e), int(x1e) + 1, 2):
        a, _ = px(m, z0e)
        d.line([(a, 60), (a, H - 30)], fill=(22, 25, 27))
        if m % 10 == 0:
            d.text((a + 2, H - 28), f'x{m}', font=fm, fill=(80, 88, 90))
    for m in range(int(z0e), int(z1e) + 1, 2):
        _, b = px(x0e, m)
        d.line([(20, b), (W - 340, b)], fill=(22, 25, 27))
        if m % 10 == 0:
            d.text((2, b - 6), f'z{m}', font=fm, fill=(80, 88, 90))
    for r in R:
        if r['level'] not in levels:
            continue
        (xa, xb), (za, zb) = r['x'], r['z']
        col = ZONES[r['zone']][1]
        st = r['status']
        fill = tuple(int(c * (0.55 if st == 'kept' else 0.75 if st == 'kept-mod' else 0.45)) for c in col)
        a, b = px(min(xa, xb), min(za, zb))
        c, e = px(max(xa, xb), max(za, zb))
        d.rectangle([a, b, c, e], fill=fill, outline=(225, 225, 215) if st.startswith('kept') else col, width=2)
        if st == 'new2':
            for k in range(a - (e - b), c, 9):
                d.line([(max(a, k), b + max(0, a - k)), (min(c, k + (e - b)), b + min(e - b, c - k))], fill=tuple(min(255, int(v * 1.3)) for v in col), width=1)
        if st == 'new1':
            for k in range(a, c, 6):
                d.point((k, b), fill=(255, 255, 255))
        label = r['label']
        tw = d.textlength(label, font=f)
        if tw < (c - a) - 4 and (e - b) > 14:
            d.text(((a + c - tw) / 2, (b + e) / 2 - 7), label, font=f, fill=(240, 238, 230))
        elif (e - b) > (c - a) and (e - b) > 60:
            tmp = Image.new('RGBA', (int(tw) + 4, 18), (0, 0, 0, 0))
            ImageDraw.Draw(tmp).text((2, 0), label, font=f, fill=(240, 238, 230))
            tmp = tmp.rotate(90, expand=True)
            img.paste(tmp, (int((a + c) / 2 - 9), int((b + e) / 2 - tw / 2)), tmp)
    if 4 in levels:
        for name, (col, w, pts) in ROUTES.items():
            xy = [px(x, z) for x, z in pts]
            for i in range(len(xy) - 1):
                if 'golden' in name and i % 2:
                    continue
                d.line([xy[i], xy[i + 1]], fill=col, width=w)
        for (a, b), (c, e), _ in SIGHTLINES:
            p, q = px(a, b), px(c, e)
            d.line([p, q], fill=(255, 255, 255), width=1)
            d.ellipse([q[0] - 3, q[1] - 3, q[0] + 3, q[1] + 3], outline=(255, 255, 255))
        cx, cz = px(5, -14.5)
        d.ellipse([cx - 45, cz - 45, cx + 45, cz + 45], outline=(230, 220, 200), width=2)
        d.text((cx - 28, cz - 7), 'tree / fountain', font=f, fill=(230, 220, 200))
        sx, sz = px(-12.4, 4.1)
        d.ellipse([sx - 6, sz - 6, sx + 6, sz + 6], fill=(235, 200, 90))
    for did, (x, z), lvl, st, _ in DOORS:
        if lvl not in levels:
            continue
        p = px(x, z)
        d.rectangle([p[0] - 4, p[1] - 4, p[0] + 4, p[1] + 4], fill=(250, 250, 250) if st == 'kept' else (255, 215, 90) if st == 'new1' else (255, 140, 140))
    lx = W - 330
    y = 70
    d.text((lx, y), 'KEY', font=fb, fill=(230, 226, 214)); y += 30
    for k, (name, col) in ZONES.items():
        d.rectangle([lx, y, lx + 16, y + 12], fill=col); d.text((lx + 24, y - 2), name, font=f, fill=(220, 220, 210)); y += 18
    y += 8
    for txt in ['solid fill, light outline = exists, unchanged', 'bright fill, light outline = exists, gains doors/glass (ID kept)',
                'dotted top edge = NEW phase 1 (additive)', 'hatched = phase 2 (needs Codex sign-off)',
                'white square = existing door', 'yellow square = new door (phase 1)', 'pink square = phase 2 door']:
        d.text((lx, y), txt, font=f, fill=(200, 200, 190)); y += 17
    if 4 in levels:
        y += 8
        for name, (col, w, _) in ROUTES.items():
            d.line([(lx, y + 7), (lx + 26, y + 7)], fill=col, width=w); d.text((lx + 32, y), name, font=f, fill=(220, 220, 210)); y += 18
        d.line([(lx, y + 7), (lx + 26, y + 7)], fill=(255, 255, 255)); d.text((lx + 32, y), 'key sightline', font=f, fill=(220, 220, 210)); y += 18
        d.ellipse([lx + 8, y + 2, lx + 18, y + 12], fill=(235, 200, 90)); d.text((lx + 32, y), 'player start (Room 104)', font=f, fill=(220, 220, 210))
    img.save(path)


os.makedirs(OUT, exist_ok=True)
draw({4}, os.path.join(OUT, 'fractured-ward-L4.png'), 'THE FRACTURED WARD — Level 4 (ward floor), proposal')
draw({5, 3}, os.path.join(OUT, 'fractured-ward-L5-L3.png'), 'THE FRACTURED WARD — Gallery (L5, y 4.2) and stair L3 (y -4.2), proposal', extent=(-6, 24, -23, -6))
with open(os.path.join(OUT, 'fractured-ward-plan.json'), 'w') as fh:
    json.dump({'status': 'PROPOSAL — awaiting approval', 'rooms': R,
               'doors': [dict(id=a, at=b, level=c, status=dd, between=e) for a, b, c, dd, e in DOORS],
               'routes': {k: v[2] for k, v in ROUTES.items()},
               'sightlines': [dict(from_=a, to=b, why=c) for a, b, c in SIGHTLINES]}, fh, indent=1)
print('rooms', len(R), 'doors', len(DOORS))
