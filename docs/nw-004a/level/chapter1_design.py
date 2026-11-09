"""NW-004A Chapter 1 story-driven design (PROPOSAL v2, for approval; nothing here is built).

    python3 docs/nw-004a/level/chapter1_design.py

Writes, next to this file:
  chapter1-plan.png      annotated floor plan: rooms, IDs, doors, routes, shortcuts, beats
  chapter1-nurse.png     Nurse introduction diagram (Act II)
  chapter1-chase.png     Patient release and chase diagram (Act IV / ending)
  chapter1-design.json   the same data: rooms, doors, routes, anchors (proposed bindings)

Coordinates are the game's: metres, +x east, +z south (north = up), ward floor y = 0.
Wing A, Room 104 (Blender set), the station, treatment, Electrical 114, the connector, the
maintenance passage, the east corridor and the Stairwell B shaft keep their current positions.
"""
import json
import math
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, '../../..')
FONT = os.path.join(ROOT, 'node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff')
FONT_R = os.path.join(ROOT, 'node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-400-normal.woff')
MONO = os.path.join(ROOT, 'node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff')

ZONES = {
    'patient': ((58, 86, 120), 'Patient rooms'), 'staff': ((140, 104, 48), 'Staff (Nurse territory)'),
    'clinical': ((54, 112, 72), 'Clinical'), 'observation': ((108, 64, 132), 'Observation Programme (Patient)'),
    'service': ((122, 56, 48), 'Service (quiet side)'), 'hub': ((96, 88, 70), 'Ward hall'),
    'circ': ((50, 56, 60), 'Corridors'), 'vertical': ((86, 88, 92), 'Stairwell B / exit'),
}
# key: chapter semantic room key (bindings.ts) or '' ; status: kept | moved | repurposed | new
ROOMS = [
    # id, label, zone, x0, x1, z0, z1, status, chapter key
    ('nw:ward4:room-101', '101', 'patient', -20, -15.6, -6.4, -1.55, 'kept', ''),
    ('nw:ward4:room-103', '103', 'patient', -15.6, -11.2, -6.4, -1.55, 'kept', ''),
    ('nw:ward4:room-105', '105', 'patient', -11.2, -6.8, -6.4, -1.55, 'kept', ''),
    ('nw:ward4:room-102', '102', 'patient', -20, -15.6, 1.55, 6.4, 'kept', ''),
    ('nw:ward4:room-104', '104', 'patient', -15.6, -11.2, 1.55, 6.4, 'kept', 'room-104'),
    ('nw:ward4:room-106', '106', 'patient', -11.2, -6.8, 1.55, 6.4, 'kept', ''),
    ('nw:ward4:corridor-main', 'Wing A corridor', 'circ', -20, -0.2, -1.4, 1.4, 'kept', 'patient-wing-a'),
    ('nw:ward4:nurses-station', "Nurses' station", 'staff', -6.8, 0.2, -6.4, -1.55, 'kept', 'nurses-station'),
    ('nw:ward4:staff-passage', 'Staff passage', 'staff', -6.8, 18.0, -8.3, -6.55, 'new', ''),
    ('nw:ward4:treatment', 'Treatment', 'clinical', 0.2, 6.6, -6.4, -1.55, 'kept', 'treatment'),
    ('nw:ward4:room-107', '107 Observation gallery', 'observation', 6.6, 11.0, -6.4, -1.55, 'repurposed', 'gallery'),
    ('nw:ward4:observation-bay', 'Observation bay (Patient)', 'observation', 11.0, 18.0, -6.4, -1.55, 'repurposed', 'patient-observation'),
    ('nw:ward4:ward-hall', 'Ward hall (old day room)', 'hub', -0.2, 8.4, -1.4, 1.4, 'repurposed', 'atrium'),
    ('nw:ward4:ward-hall#south', '', 'hub', -0.2, 6.0, 1.4, 6.4, 'repurposed', ''),
    ('nw:ward4:wing-b', 'Wing B corridor', 'circ', 8.4, 18.0, -1.4, 1.4, 'new', 'patient-wing-b'),
    ('nw:ward4:connector', 'Conn.', 'circ', -6.8, -4.6, 1.4, 6.4, 'kept', ''),
    ('nw:ward4:records-112', '112 Records', 'staff', -4.6, -0.2, 1.55, 6.4, 'moved', 'records'),
    ('nw:ward4:room-110', '110', 'patient', 6.0, 10.4, 1.55, 6.4, 'kept', ''),
    ('nw:ward4:release-vestibule', 'Release vestibule', 'observation', 10.4, 14.2, 1.55, 6.4, 'new', 'release-vestibule'),
    ('nw:ward4:electrical-114', '114 Electrical', 'service', 14.2, 18.0, 1.55, 6.4, 'kept', 'electrical'),
    ('nw:ward4:maintenance', 'Maintenance passage', 'service', -6.8, 18.0, 6.55, 7.95, 'kept', 'maintenance'),
    ('nw:ward4:maintenance#pump-bay', 'Pump bay', 'service', 3.6, 6.6, 7.95, 9.4, 'new', ''),
    ('nw:ward4:corridor-east', 'East corridor', 'circ', 18.0, 20.85, -11.0, 7.95, 'kept', ''),
    ('nw:ward4:stairwell-b', 'Stairwell B', 'vertical', 18.15, 20.85, -15.4, -11.0, 'kept', 'stairwell-b'),
    ('nw:ward4:lift-car', 'Lift', 'vertical', 21.0, 22.6, -4.85, -3.15, 'kept', ''),
]
# Doors: id, x, z, kind (door / fire = closes on alarm / locked / barrier / key / glass = viewing glass)
DOORS = [
    ('nw:door:room-104', -12.0, 1.4, 'door'), ('nw:door:room-101', -16.4, -1.4, 'door'), ('nw:door:room-103', -12.0, -1.4, 'door'),
    ('nw:door:room-105', -7.6, -1.4, 'door'), ('nw:door:room-102', -16.4, 1.4, 'door'), ('nw:door:room-106', -7.6, 1.4, 'door'),
    ('nw:door:station-staff', -3.0, -6.48, 'door'), ('nw:door:staff-west', -6.8, -7.4, 'door'),
    ('nw:door:staff-boundary', 0.2, -7.4, 'fire'), ('nw:door:treatment', 1.4, -1.48, 'door'), ('nw:door:treatment-staff', 4.6, -6.48, 'door'),
    ('nw:door:room-107', 7.45, -1.48, 'door'), ('nw:door:observation-bay', 18.0, -4.0, 'barrier'), ('nw:door:staff-east', 18.0, -7.4, 'door'),
    ('nw:door:hall-west', -0.2, 0.0, 'fire'), ('nw:door:smoke', 8.4, 0.0, 'fire'), ('nw:door:records-112', -2.4, 1.48, 'key'),
    ('nw:door:room-110', 6.95, 1.48, 'door'), ('nw:door:vestibule', 12.3, 1.48, 'door'), ('nw:door:vestibule-electrical', 14.2, 3.8, 'door'),
    ('nw:door:vestibule-service', 12.3, 6.48, 'door'), ('nw:door:electrical-114', 16.4, 1.48, 'door'), ('nw:door:electrical-service', 16.6, 6.48, 'door'),
    ('nw:door:maintenance-west', -5.7, 6.48, 'door'), ('nw:door:hall-service', 2.8, 6.48, 'door'), ('nw:door:maintenance-east', 18.08, 7.25, 'door'),
    ('nw:door:east-fire', 19.4, -1.9, 'fire'), ('nw:door:stairwell-b', 19.5, -11.0, 'barrier'),
]
GLASS = [(-5.9, -6.48, -0.6, -6.48, 'station back screen'), (11.0, -5.6, 11.0, -2.4, 'one-way glass'), (2.4, -1.48, 4.4, -1.48, 'treatment window')]
OBSTACLES = [  # x0, x1, z0, z1, label
    (2.2, 3.8, -4.9, -3.6, 'exam table'), (10.0, 11.6, -0.9, -0.3, 'gurney'), (14.6, 15.8, 0.5, 1.1, 'gurney'),
    (2.0, 4.6, 2.6, 3.8, 'piano + clock'), (19.3, 20.3, 4.6, 5.0, 'trolley'), (8.6, 9.2, 7.0, 7.95, 'pipe column'),
    (-4.2, -1.6, -1.95, -1.6, 'counter'),
]
HIDING = [  # id, x, z, note
    ('nw:hiding:room-105-bed-b', -7.85, -5.35, 'existing'), ('nw:hiding:room-106-bed', -10.1, 5.15, 'existing'),
    ('nw:hiding:nurses-staff', -6.4, -4.15, 'existing'), ('nw:hiding:records-cupboard', -4.2, 2.3, 'moved with Records'),
    ('nw:hiding:storage-a', 4.0, 8.9, 'migrated to pump bay'), ('nw:hiding:storage-b', 4.65, 8.9, 'migrated'), ('nw:hiding:storage-c', 5.3, 8.9, 'migrated'),
    ('nw:hiding:vestibule-linen', 10.8, 5.7, 'new'), ('nw:hiding:treatment-screen', 5.6, -2.4, 'new'),
]
BEATS = [
    (1, -13.6, 4.6, 'Wake in 104 (03:17)'), (2, -3.6, -0.9, 'Station: ledger writes itself'), (3, -3.0, -6.0, 'Shaw emerges'),
    (4, -2.4, 3.4, 'Records: pack, handle, file'), (5, 9.0, -4.0, 'Gallery: the sleeping Patient'), (6, 16.6, 4.0, 'Electrical: arm reserve'),
    (7, 12.0, 4.4, 'Vestibule: CONFIRM RELEASE'), (8, 19.4, -3.0, 'Patient emerges'), (9, 19.5, -12.2, 'Barrier, landing, reader'),
]
ROUTES_PLAN = {
    'Act I (no threats): 104 > Wing A > station': ((235, 200, 80), [(-13.6, 4.6), (-12.0, 2.4), (-12.0, 0.0), (-4.0, 0.0), (-3.6, -0.9)]),
    'Act III: station release > Records > (hall or service) > Electrical > vestibule': ((110, 190, 235), [(-3.6, -0.9), (-2.4, 0.4), (-2.4, 3.4), (-2.4, 0.4), (4.0, 0.0), (8.4, 0.0), (16.4, 0.0), (16.4, 3.0), (16.6, 4.0), (14.2, 3.8), (12.0, 4.4)]),
    'Quiet service shortcut (Act III)': ((120, 220, 150), [(-2.4, 0.4), (-5.7, 0.0), (-5.7, 7.2), (16.6, 7.2), (16.6, 4.0)]),
    'Optional: observation gallery': ((180, 130, 220), [(6.0, 0.0), (7.45, -1.0), (9.0, -4.0)]),
}
NURSE_ROUND = [(-6.0, -7.4), (-3.0, -7.4), (-3.0, -5.6), (-4.6, -5.2), (-3.0, -2.6), (-1.0, -2.6), (-0.6, -0.2), (1.4, -0.6), (1.4, -2.6),
               (3.0, -3.0), (4.6, -6.0), (4.6, -7.4), (0.2, -7.4), (-3.0, -7.4), (-6.0, -7.4)]
CHASE = {
    'A  The ward way (~41 m, every leg breaks sight)': ((240, 70, 55), [(12.3, 2.6), (12.3, 0.2), (8.4, 0.2), (4.0, 0.4), (1.4, -0.8), (1.4, -2.6), (3.0, -5.4), (4.6, -6.2), (4.6, -7.4), (17.0, -7.4), (19.5, -7.4), (19.5, -11.6)]),
    'B  The service way (~30 m, runs past his open cell)': ((255, 150, 60), [(12.3, 2.6), (12.3, 7.2), (18.08, 7.25), (19.5, 6.4), (19.5, -1.9), (19.5, -11.6)]),
    'C  Hold: linen cupboard, then B or A': ((210, 100, 210), [(12.3, 2.6), (11.2, 4.6), (10.8, 5.7)]),
    'Patient: cell > east corridor > toward the chime': ((255, 255, 255), [(14.5, -4.0), (18.0, -4.0), (19.4, -3.2), (19.4, 0.0), (12.3, 0.0), (12.3, 1.4)]),
}
SIGHTLINES = [  # from, to, label
    ((-12.0, 0.4), (-19.6, 0.3), 'Wing A: the one long view (13 m), the Watcher'),
    ((-4.2, 0.2), (-3.0, -6.2), 'lobby > ledger > staff door (6.5 m, inside her 7 m)'),
    ((-5.0, -7.4), (-2.0, -6.6), 'staff passage behind the glazed screen'),
    ((0.6, -0.4), (3.4, -3.8), 'hall > treatment window > table'),
    ((8.0, -4.0), (14.0, -4.0), 'gallery glass > dormant Patient'),
    ((12.3, 1.2), (18.6, 0.0), 'vestibule door > junction: the reveal (9.8 m)'),
]


def canvas(extent, scale, title, legend_w=380):
    x0, x1, z0, z1 = extent
    W, H = int((x1 - x0) * scale) + 40, int((z1 - z0) * scale) + 96
    img = Image.new('RGB', (W + legend_w, max(H, 760)), (12, 13, 14))
    d = ImageDraw.Draw(img)
    fb = ImageFont.truetype(FONT, 22)
    d.text((20, 16), title, font=fb, fill=(234, 230, 218))
    px = lambda x, z: (int((x - x0) * scale) + 20, int((z - z0) * scale) + 68)
    return img, d, px, W, H


def draw_rooms(d, img, px, scale, show_ids=False):
    f = ImageFont.truetype(FONT, max(13, min(18, int(scale * 0.5))))
    fs = ImageFont.truetype(FONT_R, 11)
    for rid, label, zone, xa, xb, za, zb, st, key in ROOMS:
        col = ZONES[zone][0]
        a, b = px(xa, za); c, e = px(xb, zb)
        d.rectangle([a, b, c, e], fill=tuple(int(v * 0.62) for v in col), outline={'kept': (225, 225, 215), 'moved': (240, 200, 90), 'repurposed': (240, 160, 70), 'new': (120, 220, 255)}[st], width=2)
        tw = d.textlength(label, font=f)
        if label and tw < c - a - 6 and e - b > 18:
            d.text(((a + c - tw) / 2, (b + e) / 2 - 10), label, font=f, fill=(242, 240, 232))
            if show_ids and key:
                t = f'[{key}]'
                d.text(((a + c - d.textlength(t, font=fs)) / 2, (b + e) / 2 + 8), t, font=fs, fill=(210, 205, 190))
        elif label and e - b > tw:
            t = Image.new('RGBA', (int(tw) + 4, 22), (0, 0, 0, 0)); ImageDraw.Draw(t).text((2, 0), label, font=f, fill=(242, 240, 232))
            t = t.rotate(90, expand=True); img.paste(t, (int((a + c) / 2 - 11), int((b + e) / 2 - tw / 2)), t)
    for xa, xb, za, zb, _ in OBSTACLES:
        a, b = px(xa, za); c, e = px(xb, zb)
        d.rectangle([a, b, c, e], fill=(30, 28, 25), outline=(150, 135, 105))
    for xa, za, xb, zb, _ in GLASS:
        d.line([px(xa, za), px(xb, zb)], fill=(150, 230, 255), width=4)
    for did, x, z, k in DOORS:
        p = px(x, z)
        col = {'door': (236, 236, 226), 'fire': (255, 120, 60), 'locked': (240, 70, 60), 'barrier': (255, 60, 60), 'key': (245, 200, 70)}[k]
        r = 5 if k in ('barrier', 'fire') else 4
        d.rectangle([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=col, outline=(10, 10, 10))
    for hid, x, z, note in HIDING:
        p = px(x, z)
        d.polygon([(p[0], p[1] - 8), (p[0] - 7, p[1] + 5), (p[0] + 7, p[1] + 5)], fill=(90, 225, 120), outline=(10, 30, 10))


def dashed(d, pts, col, width=3, dash=9):
    for i in range(len(pts) - 1):
        (x1, y1), (x2, y2) = pts[i], pts[i + 1]
        n = max(1, int(math.hypot(x2 - x1, y2 - y1) / dash))
        for k in range(0, n, 2):
            t0, t1 = k / n, min(1, (k + 1) / n)
            d.line([(x1 + (x2 - x1) * t0, y1 + (y2 - y1) * t0), (x1 + (x2 - x1) * t1, y1 + (y2 - y1) * t1)], fill=col, width=width)


def arrow(d, pts, col, width=4):
    d.line(pts, fill=col, width=width, joint='curve')
    (x1, y1), (x2, y2) = pts[-2], pts[-1]
    a = math.atan2(y2 - y1, x2 - x1)
    d.polygon([(x2, y2), (x2 - 13 * math.cos(a - 0.45), y2 - 13 * math.sin(a - 0.45)), (x2 - 13 * math.cos(a + 0.45), y2 - 13 * math.sin(a + 0.45))], fill=col)


def beat(d, p, n):
    f = ImageFont.truetype(FONT, 15)
    d.ellipse([p[0] - 12, p[1] - 12, p[0] + 12, p[1] + 12], fill=(242, 238, 222), outline=(15, 15, 15), width=2)
    d.text((p[0] - (4 if n < 10 else 8), p[1] - 10), str(n), font=f, fill=(15, 15, 15))


def legend(d, lx, y, entries, title='KEY'):
    if title == 'KEY':  # mask anything drawn past the map frame before the key goes down
        d.rectangle([lx - 10, 50, 4000, 4000], fill=(12, 13, 14))
    fb = ImageFont.truetype(FONT, 20)
    fs = ImageFont.truetype(FONT_R, 14)
    d.text((lx, y), title, font=fb, fill=(234, 230, 218)); y += 28
    for kind, col, text in entries:
        if kind == 'line':
            d.line([(lx, y + 8), (lx + 26, y + 8)], fill=col, width=4)
        elif kind == 'tri':
            d.polygon([(lx + 9, y), (lx + 2, y + 13), (lx + 16, y + 13)], fill=col)
        elif kind == 'box':
            d.rectangle([lx + 2, y + 2, lx + 16, y + 14], fill=col)
        elif kind == 'outline':
            d.rectangle([lx + 2, y + 2, lx + 16, y + 14], outline=col, width=2)
        elif kind == 'text':
            pass
        d.text((lx + 34, y), text, font=fs, fill=(220, 220, 210)); y += 20
    return y + 8


COMMON_KEY = [
    ('outline', (225, 225, 215), 'kept: position and ID unchanged'), ('outline', (240, 200, 90), 'moved: same ID, new place'),
    ('outline', (240, 160, 70), 're-purposed: footprint kept, new role'), ('outline', (120, 220, 255), 'new'),
    ('box', (236, 236, 226), 'door'), ('box', (255, 120, 60), 'fire door: shuts on the alarm'), ('box', (245, 200, 70), 'released by the staff control'),
    ('box', (255, 60, 60), 'released by CONFIRM RELEASE'), ('line', (150, 230, 255), 'glass (viewing / one-way)'),
    ('box', (150, 135, 105), 'furniture that shapes routes'), ('tri', (90, 225, 120), 'hiding spot'),
]


def plan():
    img, d, px, W, H = canvas((-21, 23.5, -16, 10.2), 24, 'NIGHT WARD — Chapter 1 floor plan (proposal v2: story-driven, same footprint + one staff passage)')
    draw_rooms(d, img, px, 24, show_ids=True)
    for name, (col, pts) in ROUTES_PLAN.items():
        dashed(d, [px(x, z) for x, z in pts], col, 3)
    for n, x, z, _ in BEATS:
        beat(d, px(x, z), n)
    lx, y = W + 10, 64
    y = legend(d, lx, y, COMMON_KEY)
    y = legend(d, lx, y, [('line', c, n) for n, (c, _) in ROUTES_PLAN.items()], 'ROUTES')
    fs = ImageFont.truetype(FONT_R, 14)
    d.text((lx, y), 'BEATS', font=ImageFont.truetype(FONT, 20), fill=(234, 230, 218)); y += 28
    for n, _, _, t in BEATS:
        d.text((lx, y), f'{n}. {t}', font=fs, fill=(220, 220, 210)); y += 19
    d.text((20, H - 26), '[keys] = Codex semantic room keys (bindings.ts). Footprint 41 x 24 m; ward floor only; no atrium, no second wing.', font=fs, fill=(150, 150, 140))
    img.save(os.path.join(HERE, 'chapter1-plan.png'))


def nurse():
    img, d, px, W, H = canvas((-9.5, 9.0, -9.5, 8.6), 44, 'Act II — the Nurse\'s first appearance (proposal)')
    draw_rooms(d, img, px, 44)
    d.line([px(x, z) for x, z in NURSE_ROUND], fill=(140, 120, 255), width=3, joint='curve')
    arrow(d, [px(-3.0, -6.3), px(-3.0, -5.2), px(-4.4, -5.2)], (180, 160, 255), 5)
    arrow(d, [px(-3.0, -4.2), px(-1.6, -3.0), px(1.0, -1.0)], (255, 225, 120), 4)
    for (a, b), col in [(((-4.2, 0.2), (-7.6, 0.0)), (120, 230, 140)), (((-7.6, -0.2), (-7.85, -4.8)), (120, 230, 140)), (((-5.0, 0.4), (-5.7, 6.9)), (120, 230, 140)), (((-5.7, 7.2), (2.8, 7.2)), (120, 230, 140)), (((2.8, 6.9), (2.8, 3.4)), (120, 230, 140))]:
        arrow(d, [px(*a), px(*b)], col, 3)
    for (a, b), _ in [(((-4.2, 0.2), (-3.6, -1.7)), 0), (((-4.2, 0.2), (-3.0, -6.3)), 0)]:
        dashed(d, [px(*a), px(*b)], (255, 255, 255), 1, 6)
    p = px(-4.2, 0.2); d.ellipse([p[0] - 9, p[1] - 9, p[0] + 9, p[1] + 9], outline=(255, 210, 90), width=3)
    for n, x, z, _ in BEATS[1:3]:
        beat(d, px(x, z), n)
    fs = ImageFont.truetype(FONT_R, 14)
    notes = [
        ((-3.2, -1.9), 'night ledger + call panel (104)'), ((-2.8, -6.0), 'Shaw emerges: staff door'), ((1.2, -0.6), 'tray rattles: diversion'),
        ((-6.3, -3.9), 'staff locker (risky)'), ((-9.0, -5.1), '105 under-bed'), ((-6.6, 4.6), 'quiet route'), ((-3.9, -5.0), 'review desk'),
    ]
    for (x, z), t in notes:
        p = px(x, z); d.text((p[0] + 10, p[1] - 8), t, font=fs, fill=(250, 240, 210))
    lx, y = W + 10, 64
    y = legend(d, lx, y, [('line', (140, 120, 255), 'her round (~34 m, ~38 s)'), ('line', (180, 160, 255), 'emergence path'), ('line', (255, 225, 120), 'her turn to the tray'),
                          ('line', (120, 230, 140), 'player responses'), ('line', (255, 255, 255), 'reveal sightlines'), ('outline', (255, 210, 90), 'player at handoff')] + COMMON_KEY, 'KEY')
    for t in ['Player handoff 6.5 m from her door:', 'just inside her 7 m vision, so the', 'tray turns her away first. Every', 'response is a real choice:',
              ' - back to Wing A, hide under 105', ' - connector > maintenance > hall', '   (closed doors damp sound)', ' - staff locker 2 m from the desk',
              '   (fast, but on her route)', 'Checkpoint: review desk after', 'contact is broken.']:
        d.text((lx, y), t, font=fs, fill=(210, 210, 200)); y += 18
    img.save(os.path.join(HERE, 'chapter1-nurse.png'))


def chase():
    img, d, px, W, H = canvas((-0.8, 22.6, -16.0, 10.0), 36, 'Act IV — release, the Patient, and the escape (proposal)')
    draw_rooms(d, img, px, 36)
    for name, (col, pts) in CHASE.items():
        arrow(d, [px(x, z) for x, z in pts], col, 4 if 'Patient' not in name else 3)
    dashed(d, [px(12.3, 1.2), px(18.6, 0.0)], (255, 255, 255), 1, 6)
    for n, x, z, _ in BEATS[6:]:
        beat(d, px(x, z), n)
    fs = ImageFont.truetype(FONT_R, 14)
    for (x, z), t in [((12.6, 3.0), 'handle socket + CONFIRM'), ((14.8, -4.4), 'dormant Patient'), ((19.7, -3.6), 'emergence'), ((19.7, -12.4), 'safe landing'),
                      ((18.4, -14.6), 'reader / stair down'), ((8.7, 0.6), 'smoke doors shut'), ((19.7, -2.2), 'fire door shuts'), ((9.0, 8.2), 'pipe column'),
                      ((3.0, -4.9), 'exam table'), ((10.0, -0.3), 'gurney pinch 1.0 m')]:
        p = px(x, z); d.text((p[0] + 6, p[1] - 8), t, font=fs, fill=(250, 240, 210))
    lx, y = W + 10, 64
    y = legend(d, lx, y, [('line', c, n) for n, (c, _) in CHASE.items()] + COMMON_KEY, 'KEY')
    for t in ['Handoff: Patient 9.8 m from the vestibule door,', 'player inside with both exits in view.', 'Speeds: player 4.3, Patient 4.1 m/s',
              '(Codex profiles); he wins only if you', 'stop in his sight. Every route breaks', 'line of sight within 10 m.',
              'Barrier: player pulls the grille shut', 'from the stair side: real collision', 'separation before the input lock.']:
        d.text((lx, y), t, font=fs, fill=(210, 210, 200)); y += 18
    img.save(os.path.join(HERE, 'chapter1-chase.png'))


plan(); nurse(); chase()
json.dump({
    'status': 'PROPOSAL v2 for approval; not built',
    'rooms': [dict(id=r[0], label=r[1], zone=r[2], x=[r[3], r[4]], z=[r[5], r[6]], status=r[7], chapterKey=r[8] or None) for r in ROOMS],
    'doors': [dict(id=a, x=b, z=c, kind=k) for a, b, c, k in DOORS],
    'hiding': [dict(id=a, x=b, z=c, note=n) for a, b, c, n in HIDING],
    'nurseRound': NURSE_ROUND, 'chase': {k: v[1] for k, v in CHASE.items()}, 'routes': {k: v[1] for k, v in ROUTES_PLAN.items()},
}, open(os.path.join(HERE, 'chapter1-design.json'), 'w'), indent=1)
print('ok')
