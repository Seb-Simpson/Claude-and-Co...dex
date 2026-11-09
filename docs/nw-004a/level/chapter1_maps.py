"""Chapter 1 level-design maps, drawn over the REAL world layout (world-export.json).

    npx vite-node docs/nw-004a/level/export_world.ts        # refresh the layout from src/world
    python3 docs/nw-004a/level/chapter1_maps.py              # draw chapter1-map.png, chapter1-chase.png

Everything in PROPOSALS is a proposal (not built). See docs/NW-004A.md.
"""
import json
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, '../../..')
FONT = os.path.join(ROOT, 'node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff')
MONO = os.path.join(ROOT, 'node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff')
W = json.load(open(os.path.join(HERE, 'world-export.json')))

# Proposed geometry changes (G-numbers match docs/NW-004A.md section 6).
PROPOSALS = [
    ('G1', 'Treatment observation window\n+ station/treatment door & glass', [(2.4, -1.6, 4.4, -1.3), (0.05, -5.2, 0.35, -3.6)]),
    ('G2', 'Key cabinet + glass on the floor', [(-5.6, -6.3, -4.6, -6.0), (-4.8, -2.6, -3.6, -2.2)]),
    ('G4', 'Pump bay + bolt cutters\n+ duct cupboard (hide)', [(11.0, 7.95, 13.4, 9.3)]),
    ('G5', 'Stair down to Ward 3 landing\n(ending only)', [(18.3, -15.3, 20.7, -13.0)]),
]
BEATS = [  # number, x, z, label
    (1, -12.4, 4.1, 'Wake: 03:17'), (2, 19.5, -10.4, 'Stair B chained'), (3, 3.2, -0.6, 'Nurse seen through glass'),
    (4, -4.4, -5.6, 'Station key'), (5, 11.0, 5.2, 'The record'), (6, 17.4, 3.2, 'Breaker: alarm'),
    (7, 8.4, 0.0, 'Patient reveal'), (8, 12.2, 8.6, 'Bolt cutters'), (9, 19.5, -11.6, 'Cut chain / escape'),
]
ACT_ROUTES = {
    'Act I  explore (104 → east → chained stair → back)': ((235, 200, 90), [(-12.4, 4.1), (-12, 0.3), (8.4, 0.3), (19.5, 0.3), (19.5, -10.4), (19.5, 0.3), (2.5, 0.3)]),
    'Act II  Nurse (corridor → station key)': ((150, 210, 120), [(2.5, -0.4), (-2.5, -0.4), (-4.4, -2.6), (-4.4, -5.6)]),
    'Act III  investigate (records → electrical)': ((120, 200, 230), [(-4.4, -5.6), (-3.0, 0.2), (11.95, 0.2), (11.95, 3.4), (11.0, 5.2), (11.95, 3.4), (11.95, 0.2), (16.4, 0.2), (16.4, 2.6), (17.4, 3.2)]),
}
NURSE = ((90, 150, 255), [(3.0, -4.3), (1.2, -4.4), (0.2, -4.4), (-1.5, -4.9), (-3.6, -4.6), (-4.6, -2.6), (-3.8, 0.0), (-10.5, 0.0), (-3.8, 0.0), (-0.8, -1.0), (1.4, -1.0), (1.4, -2.6), (3.0, -4.3)])
CHASE = {
    'A  dash east (needs cutters)': ((235, 60, 50), [(16.4, 0.6), (19.5, 0.6), (19.5, -10.6)]),
    'B  service door → maintenance → cutters': ((255, 140, 60), [(16.4, 0.6), (16.4, 2.4), (16.6, 6.0), (16.6, 7.25), (12.2, 7.6), (12.2, 8.6), (11.0, 7.25), (-5.7, 7.25), (-5.7, 3.5), (-5.7, 0.3), (19.5, 0.3), (19.5, -10.6)]),
    'B2  maintenance east → east corridor → stair': ((255, 200, 90), [(12.2, 7.6), (18.6, 7.25), (19.5, 6.0), (19.5, -10.6)]),
    'C  hide (records cupboard: risky if seen)': ((210, 90, 200), [(16.4, 0.6), (11.95, 0.6), (11.95, 1.9), (10.9, 2.2)]),
    'Patient (reveal at the smoke doors)': ((255, 255, 255), [(8.4, 0.0), (16.0, 0.4)]),
}
SIGHTLINES = [
    ((-12.0, 0.6), (-19.4, 0.4), '104 door → west window (the Watcher)'),
    ((-1.0, 0.4), (3.0, -3.6), 'corridor → treatment window: Nurse at the table'),
    ((-9.0, 0.4), (-4.5, -4.0), 'corridor → station (12 m)'),
    ((16.4, 0.4), (8.4, 0.0), 'electrical door → smoke doors: the reveal (8 m)'),
    ((19.5, -1.0), (19.5, -10.4), 'junction → chained stair door'),
]


def draw(path, extent, scale, title, show):
    x0e, x1e, z0e, z1e = extent
    Wd = int((x1e - x0e) * scale) + 40
    Ht = int((z1e - z0e) * scale) + 80
    legend = 360
    img = Image.new('RGB', (Wd + legend, max(Ht, 640)), (13, 15, 16))
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FONT, max(12, int(scale * 0.62)))
    fs = ImageFont.truetype(FONT, 13)
    fb = ImageFont.truetype(FONT, 22)
    fm = ImageFont.truetype(MONO, 11)
    px = lambda x, z: (int((x - x0e) * scale) + 20, int((z - z0e) * scale) + 60)
    d.text((20, 16), title, font=fb, fill=(232, 228, 216))
    for r in W['rooms']:
        if r['id'].endswith('lift-car'):
            continue
        a, b = px(r['min']['x'], r['min']['z'])
        c, e = px(r['max']['x'], r['max']['z'])
        tags = r['tags']
        col = (52, 66, 78) if 'patient-room' in tags else (70, 58, 34) if 'nurses-station' in tags else (40, 74, 70) if 'treatment' in tags else \
            (64, 64, 66) if ('records' in tags or 'electrical' in tags) else (48, 46, 38) if 'maintenance' in tags else (90, 40, 40) if 'stairwell' in tags else (40, 44, 47)
        d.rectangle([a, b, c, e], fill=col, outline=(150, 150, 140), width=1)
        name = r['name'].replace('Room ', '').replace(' — ', ' ')
        if (c - a) > d.textlength(name, font=fs) + 6 and (e - b) > 16:
            d.text((a + 4, b + 3), name, font=fs, fill=(185, 185, 175))
    for gid, label, rects in PROPOSALS:
        for (xa, za, xb, zb) in rects:
            a, b = px(xa, za); c, e = px(xb, zb)
            d.rectangle([a, b, c, e], outline=(255, 160, 40), width=3)
        a, b = px(rects[0][0], rects[0][1])
        if show == 'all' or rects[0][0] > x0e:
            d.text((a, b - 16), gid, font=fs, fill=(255, 170, 60))
    for h in W['hiding']:
        p = px(h['at']['x'], h['at']['z'])
        d.polygon([(p[0], p[1] - 7), (p[0] - 6, p[1] + 5), (p[0] + 6, p[1] + 5)], fill=(90, 220, 120))
    for dd in W['doors']:
        p = px(dd['at']['x'], dd['at']['z'])
        col = (255, 90, 90) if dd['state'] == 'locked' else (240, 240, 230)
        d.rectangle([p[0] - 3, p[1] - 3, p[0] + 3, p[1] + 3], fill=col)
    routes = dict(ACT_ROUTES)
    if show == 'all':
        routes['Nurse round (proposed with G1)'] = NURSE
    else:
        routes = dict(CHASE)
    for name, (col, pts) in routes.items():
        xy = [px(x, z) for x, z in pts]
        d.line(xy, fill=col, width=3 if show == 'all' else 4, joint='curve')
        d.ellipse([xy[-1][0] - 4, xy[-1][1] - 4, xy[-1][0] + 4, xy[-1][1] + 4], fill=col)
    for (a, b), (c, e), _ in SIGHTLINES:
        p, q = px(a, b), px(c, e)
        if x0e <= a <= x1e and x0e <= c <= x1e:
            for k in range(0, 40):
                t0, t1 = k / 40, (k + 0.5) / 40
                d.line([(p[0] + (q[0] - p[0]) * t0, p[1] + (q[1] - p[1]) * t0), (p[0] + (q[0] - p[0]) * t1, p[1] + (q[1] - p[1]) * t1)], fill=(255, 255, 255), width=1)
    for n, x, z, label in BEATS:
        if not (x0e <= x <= x1e and z0e <= z <= z1e):
            continue
        p = px(x, z)
        d.ellipse([p[0] - 11, p[1] - 11, p[0] + 11, p[1] + 11], fill=(240, 236, 220), outline=(20, 20, 20), width=2)
        d.text((p[0] - 4 if n < 10 else p[0] - 8, p[1] - 9), str(n), font=fs, fill=(20, 20, 20))
    for m in range(int(x0e) // 5 * 5, int(x1e) + 1, 5):
        a, _ = px(m, z0e)
        d.text((a, Ht - 22), f'x{m}', font=fm, fill=(80, 88, 90))
    for m in range(int(z0e) // 5 * 5, int(z1e) + 1, 5):
        _, b = px(x0e, m)
        d.text((Wd - 16, b), f'z{m}', font=fm, fill=(80, 88, 90))
    lx, y = Wd + 10, 70
    d.text((lx, y), 'KEY', font=fb, fill=(232, 228, 216)); y += 32
    for name, (col, _) in routes.items():
        d.line([(lx, y + 8), (lx + 28, y + 8)], fill=col, width=4); d.text((lx + 36, y), name, font=fs, fill=(220, 220, 210)); y += 20
    y += 6
    items = [((255, 160, 40), 'orange outline = proposed change (G#)'), ((90, 220, 120), 'green triangle = existing hiding spot'),
             ((240, 240, 230), 'white square = door'), ((255, 90, 90), 'red square = locked door'), ((255, 255, 255), 'dotted = key sightline')]
    for col, txt in items:
        d.rectangle([lx, y + 3, lx + 12, y + 13], fill=col); d.text((lx + 36, y), txt, font=fs, fill=(220, 220, 210)); y += 20
    y += 10
    d.text((lx, y), 'BEATS', font=fb, fill=(232, 228, 216)); y += 30
    for n, _, _, label in BEATS:
        d.text((lx, y), f'{n}. {label}', font=fs, fill=(220, 220, 210)); y += 18
    img.save(path)


draw(os.path.join(HERE, 'chapter1-map.png'), (-21, 23, -16.5, 10.5), 22, 'NIGHT WARD — Chapter 1 level plan over the existing ward (proposal)', 'all')
draw(os.path.join(HERE, 'chapter1-chase.png'), (5, 23, -16.5, 10.5), 30, 'Chapter 1 — Patient chase: options A / B / B2 / C (proposal)', 'chase')
print('ok')
