"""Chapter 1 layout: the approved concept translated into game coordinates (PROPOSAL, not built).

    python3 docs/nw-004a/level/chapter1_layout.py      # -> chapter1-layout.png, chapter1-layout.json

Metres, +x east, +z south (north = up on the map). Wing A (101-106, Room 104, the Blender set)
keeps its current coordinates exactly; everything else is laid out around it.
Rule for every passage: no straight, unbroken view longer than about 12 m outside Wing A and the
atrium (corners, dog-legs, doors), so you rarely see where the monsters are.
"""
import json
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, '../../..')
FONT = os.path.join(ROOT, 'node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff')
MONO = os.path.join(ROOT, 'node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff')

ZONE = {
    'patient': ((64, 92, 128), 'Patient areas'), 'staff': ((150, 112, 50), 'Staff / admin'), 'medical': ((60, 120, 70), 'Medical / treatment'),
    'surgical': ((112, 70, 140), 'Surgical (high tension)'), 'service': ((132, 54, 50), 'Service / maintenance'), 'vertical': ((90, 92, 96), 'Vertical / exit'),
    'circ': ((52, 58, 62), 'Corridors'), 'atrium': ((70, 66, 58), 'Central atrium'),
}
# id, label, zone, x0, x1, z0, z1, keep ('kept' = existing coordinates unchanged, 'moved' = ID kept, new place, 'new')
ROOMS = [
    ('nw:ward4:room-101', '101', 'patient', -20, -15.6, -6.4, -1.55, 'kept'),
    ('nw:ward4:room-103', '103', 'patient', -15.6, -11.2, -6.4, -1.55, 'kept'),
    ('nw:ward4:room-105', '105', 'patient', -11.2, -6.8, -6.4, -1.55, 'kept'),
    ('nw:ward4:corridor-main', 'Wing A corridor', 'circ', -20, -6.8, -1.4, 1.4, 'kept'),
    ('nw:ward4:room-102', '102', 'patient', -20, -15.6, 1.55, 6.4, 'kept'),
    ('nw:ward4:room-104', '104 START', 'patient', -15.6, -11.2, 1.55, 6.4, 'kept'),
    ('nw:ward4:room-106', '106', 'patient', -11.2, -6.8, 1.55, 6.4, 'kept'),
    ('nw:ward4:wing-a-link', 'Link (dog-leg)', 'circ', -6.8, -4.6, -1.4, 1.4, 'new'),
    ('nw:ward4:nurses-station', "NURSES' STATION", 'staff', -6.8, 1.0, -10.5, -3.0, 'moved'),
    ('nw:ward4:station-lobby', 'Station lobby', 'circ', -4.6, 1.0, -3.0, -1.6, 'new'),
    ('nw:ward4:staff-corridor', 'Staff corridor', 'circ', 1.0, 19.6, -3.0, -1.6, 'new'),
    ('nw:ward4:treatment', 'TREATMENT', 'medical', 1.0, 6.4, -11.0, -3.0, 'moved'),
    ('nw:ward4:procedure', 'Procedure', 'medical', 6.4, 11.0, -11.0, -6.6, 'new'),
    ('nw:ward4:sluice-north', 'Sluice', 'medical', 6.4, 11.0, -6.6, -3.0, 'new'),
    ('nw:ward4:theatre', 'OPERATING THEATRE', 'surgical', 11.0, 17.0, -12.0, -3.0, 'new'),
    ('nw:ward4:scrub', 'Scrub', 'surgical', 17.0, 19.6, -12.0, -7.5, 'new'),
    ('nw:ward4:anaesthetic', 'Anaesth.', 'surgical', 17.0, 19.6, -7.5, -3.0, 'new'),
    ('nw:ward4:atrium', 'CENTRAL ATRIUM', 'atrium', -4.6, 8.4, -1.6, 10.0, 'new'),
    ('nw:ward4:room-107', '107', 'patient', 8.4, 12.2, -1.6, 2.8, 'moved'),
    ('nw:ward4:room-109', '109', 'patient', 12.2, 16.0, -1.6, 2.8, 'new'),
    ('nw:ward4:room-111', '111', 'patient', 16.0, 19.6, -1.6, 2.8, 'new'),
    ('nw:ward4:corridor-east', 'Wing B corridor', 'circ', 8.4, 19.6, 2.8, 4.2, 'moved'),
    ('nw:ward4:room-108', '108', 'patient', 8.4, 12.2, 4.2, 8.8, 'moved'),
    ('nw:ward4:room-110', '110', 'patient', 12.2, 16.0, 4.2, 8.8, 'moved'),
    ('nw:ward4:room-112', '112', 'patient', 16.0, 19.6, 4.2, 8.8, 'new'),
    ('nw:ward4:stairwell-b', 'STAIRWELL B', 'vertical', 19.6, 23.4, -3.0, 13.6, 'moved'),
    ('nw:ward4:atrium-south', 'Back passage', 'circ', -4.6, 18.4, 10.0, 11.4, 'new'),
    ('nw:ward4:records-112', 'RECORDS / ARCHIVE', 'staff', -3.0, 4.2, 11.4, 16.4, 'moved'),
    ('nw:ward4:electrical-114', 'ELECTRICAL', 'service', 4.2, 9.6, 11.4, 16.4, 'moved'),
    ('nw:ward4:storage', 'STORAGE', 'service', 9.6, 15.6, 11.4, 16.4, 'moved'),
    ('nw:ward4:lift-car', 'LIFT', 'vertical', 15.6, 18.4, 11.4, 14.2, 'moved'),
    ('nw:ward4:south-service', 'South service corridor', 'circ', -6.8, 19.6, 16.4, 17.8, 'new'),
    ('nw:ward4:connector', 'Connector', 'circ', -6.8, -4.6, 1.4, 7.0, 'kept'),
    ('nw:ward4:west-service', 'West corridor (service access)', 'circ', -18.0, -4.6, 7.0, 8.4, 'new'),
    ('nw:ward4:west-bend', '', 'circ', -20.0, -16.6, 7.0, 13.0, 'new'),
    ('nw:ward4:maintenance', 'MAINTENANCE TUNNELS', 'service', -20.0, -6.8, 13.0, 19.0, 'moved'),
    ('nw:ward4:tunnel-link', '', 'service', -6.8, -4.6, 8.4, 16.4, 'new'),
]
# Interior obstacles that break sightlines (drawn as solid blocks): atrium desk, tunnel pipe banks, corridor jogs.
BLOCKS = [(0.4, 2.4, 3.2, 4.8, 'reception desk'), (-15.4, -12.8, 14.6, 17.4, 'boiler'), (-11.6, -8.4, 14.0, 15.2, 'pipe bank'),
          (4.0, 4.6, 16.4, 17.0, 'jog'), (12.4, 13.0, 17.2, 17.8, 'jog'), (8.0, 8.6, -3.0, -2.4, 'jog')]
DOORS = [  # x, z, kind (door / locked / key)
    (-12.0, 1.4, 'door'), (-16.4, -1.4, 'door'), (-12.0, -1.4, 'door'), (-7.6, -1.4, 'door'), (-16.4, 1.4, 'door'), (-7.6, 1.4, 'door'),
    (-5.7, -1.4, 'door'), (-2.0, -3.0, 'door'), (0.4, -1.6, 'door'), (3.6, -3.0, 'door'), (8.7, -3.0, 'door'), (14.0, -3.0, 'key'),
    (18.3, -3.0, 'door'), (19.6, -2.3, 'door'), (8.4, 3.5, 'door'), (10.3, 2.8, 'door'), (14.1, 2.8, 'door'), (17.8, 2.8, 'door'),
    (10.3, 4.2, 'door'), (14.1, 4.2, 'door'), (17.8, 4.2, 'door'), (19.6, 3.5, 'locked'), (19.6, 17.1, 'door'), (0.6, 11.4, 'key'),
    (6.9, 11.4, 'door'), (12.6, 11.4, 'door'), (0.6, 16.4, 'door'), (6.9, 16.4, 'door'), (-5.7, 7.0, 'door'), (-5.7, 16.4, 'door'),
    (-4.6, 10.7, 'door'), (2.0, 10.0, 'door'),
]
ROUTES = {
    'Main story route': ((240, 200, 70), [(-12.4, 4.1), (-12.0, 0.0), (-5.7, 0.0), (-5.7, -2.2), (-2.0, -4.0), (-2.0, -2.2), (0.4, -0.6), (0.4, 9.2),
                                         (0.6, 10.7), (0.6, 13.6), (0.6, 10.7), (6.9, 10.7), (6.9, 13.6)]),
    'Alternate route': ((80, 180, 255), [(-5.7, 1.0), (-5.7, 7.7), (-5.7, 16.9), (0.6, 16.9), (0.6, 15.0)]),
    'Chase route (Patient)': ((240, 60, 50), [(6.9, 13.6), (6.9, 16.9), (4.3, 16.9), (4.3, 17.3), (19.6, 17.3), (21.5, 15.0), (21.5, 4.0)]),
    'Chase alternative (atrium -> Wing B)': ((255, 140, 60), [(6.9, 13.6), (6.9, 10.7), (6.0, 6.0), (8.4, 3.5), (19.0, 3.5)]),
    'Nurse round': ((150, 120, 255), [(-3.0, -8.0), (-2.0, -3.6), (0.4, -2.3), (3.6, -2.3), (3.6, -6.0), (3.6, -2.3), (8.7, -2.3), (8.7, -5.0), (8.7, -2.3), (0.4, -2.3), (-3.0, -8.0)]),
}


def draw(path):
    x0e, x1e, z0e, z1e, s = -21, 24.5, -13, 20, 26
    Wd, Ht = int((x1e - x0e) * s) + 40, int((z1e - z0e) * s) + 90
    img = Image.new('RGB', (Wd + 330, Ht), (12, 13, 14))
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FONT, 15); fs = ImageFont.truetype(FONT, 13); fb = ImageFont.truetype(FONT, 22); fm = ImageFont.truetype(MONO, 11)
    px = lambda x, z: (int((x - x0e) * s) + 20, int((z - z0e) * s) + 64)
    d.text((20, 18), 'NIGHT WARD — Chapter 1 layout in game coordinates (concept translated; PROPOSAL, not built)', font=fb, fill=(232, 228, 216))
    for rid, label, zone, xa, xb, za, zb, keep in ROOMS:
        col = ZONE[zone][0]
        a, b = px(xa, za); c, e = px(xb, zb)
        d.rectangle([a, b, c, e], fill=tuple(int(v * (0.55 if zone != 'circ' else 1)) for v in col), outline=(235, 235, 225) if keep == 'kept' else col, width=3 if keep == 'kept' else 2)
        tw = d.textlength(label, font=f)
        if label and tw < c - a - 4:
            d.text(((a + c - tw) / 2, (b + e) / 2 - 9), label, font=f, fill=(238, 236, 228))
        elif label and (e - b) > tw:
            t = Image.new('RGBA', (int(tw) + 4, 20), (0, 0, 0, 0)); ImageDraw.Draw(t).text((2, 0), label, font=f, fill=(238, 236, 228)); t = t.rotate(90, expand=True)
            img.paste(t, (int((a + c) / 2 - 10), int((b + e) / 2 - tw / 2)), t)
    for xa, xb, za, zb, _ in BLOCKS:
        a, b = px(xa, za); c, e = px(xb, zb)
        d.rectangle([a, b, c, e], fill=(28, 26, 24), outline=(120, 110, 90))
    for x, z, k in DOORS:
        p = px(x, z)
        col = {'door': (235, 235, 225), 'locked': (240, 80, 70), 'key': (240, 190, 60)}[k]
        d.rectangle([p[0] - 4, p[1] - 4, p[0] + 4, p[1] + 4], fill=col)
    # Atrium gallery (upper level) as a dashed outline, and its stair.
    a, b = px(-4.6, -1.6); c, e = px(8.4, 10.0)
    for k in range(a, c, 12): d.line([(k, b + 18), (k + 6, b + 18)], fill=(200, 190, 160), width=2)
    for k in range(b + 18, e, 12): d.line([(a + 18, k), (a + 18, k + 6)], fill=(200, 190, 160), width=2)
    d.text((a + 24, b + 22), 'gallery above (y 3.6, player only)', font=fs, fill=(200, 190, 160))
    for i in range(8):
        sa, sb = px(5.0 + i * 0.35, -1.4); sc, se = px(5.3 + i * 0.35, 0.6)
        d.rectangle([sa, sb, sc, se], outline=(180, 170, 140))
    for name, (col, pts) in ROUTES.items():
        xy = [px(x, z) for x, z in pts]
        for i in range(len(xy) - 1):
            x1, y1 = xy[i]; x2, y2 = xy[i + 1]
            n = max(1, int(((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5 / 10))
            for k in range(0, n, 2):
                t0, t1 = k / n, min(1, (k + 1) / n)
                d.line([(x1 + (x2 - x1) * t0, y1 + (y2 - y1) * t0), (x1 + (x2 - x1) * t1, y1 + (y2 - y1) * t1)], fill=col, width=3)
    p = px(-12.4, 4.1); d.ellipse([p[0] - 8, p[1] - 8, p[0] + 8, p[1] + 8], outline=(240, 70, 60), width=3)
    for m in range(-20, 25, 5):
        a, _ = px(m, z1e); d.text((a - 8, Ht - 24), f'x{m}', font=fm, fill=(85, 92, 95))
    for m in range(-10, 21, 5):
        _, b = px(x0e, m); d.text((Wd - 14, b - 6), f'z{m}', font=fm, fill=(85, 92, 95))
    lx, y = Wd + 16, 70
    d.text((lx, y), 'LEGEND', font=fb, fill=(232, 228, 216)); y += 32
    for k, (col, name) in ZONE.items():
        d.rectangle([lx, y + 2, lx + 18, y + 14], fill=col); d.text((lx + 28, y), name, font=fs, fill=(220, 220, 210)); y += 20
    y += 6
    for txt, col in [('bright outline = existing, unchanged (Wing A)', (235, 235, 225)), ('door', (235, 235, 225)), ('key door (progression)', (240, 190, 60)), ('locked (until the story opens it)', (240, 80, 70)), ('sightline breaker (desk, pipes, jog)', (120, 110, 90))]:
        d.rectangle([lx, y + 3, lx + 12, y + 13], fill=col); d.text((lx + 28, y), txt, font=fs, fill=(220, 220, 210)); y += 20
    y += 6
    for name, (col, _) in ROUTES.items():
        d.line([(lx, y + 8), (lx + 22, y + 8)], fill=col, width=3); d.text((lx + 28, y), name, font=fs, fill=(220, 220, 210)); y += 20
    y += 14
    for line in ['Footprint ~ 44 x 32 m (was 41 x 23).', 'Longest open view outside Wing A', 'and the atrium: ~12 m.', 'Every room has 2+ ways in except',
                 'deliberate dead ends (104, records', 'archive, theatre scrub).', '', 'Enemies stay on one level;', 'the gallery is player-only.']:
        d.text((lx, y), line, font=fs, fill=(200, 200, 190)); y += 18
    img.save(path)


draw(os.path.join(HERE, 'chapter1-layout.png'))
json.dump({'status': 'PROPOSAL — concept translated to coordinates, not built',
           'rooms': [dict(id=r[0], label=r[1], zone=r[2], x=[r[3], r[4]], z=[r[5], r[6]], status=r[7]) for r in ROOMS],
           'routes': {k: v[1] for k, v in ROUTES.items()}}, open(os.path.join(HERE, 'chapter1-layout.json'), 'w'), indent=1)
print('ok', len(ROOMS))
