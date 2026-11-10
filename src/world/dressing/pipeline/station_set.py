"""NW-006A: the Nurses' Station set (the first stealth space), built, baked and exported in one pass.

    <blender-python> station_set.py -- <out_dir> [--quick]

Writes <out_dir>/station_set.glb, station_set.json and station_set.blend (the source).

What it holds (all in game coordinates, mirrored in src/world/rooms/stealthStation.ts, which owns
the colliders and the procedural stand-ins the game shows if this set fails to load):

* The linen trolley: the crouch cover. A stainless trolley on castors carrying folded sheets,
  blankets and gowns, with a fitted cover over the station side, both ends and the top, and the
  front panel rolled up. The cover is what blocks the nurse's view, so the art tells the player
  which side the cover works from. Its footprint is exactly the 0.9 x 1.2 x 0.5 m collider.
* The records corner (north-west): two four-drawer filing cabinets on the back wall (one drawer
  left open on hanging files), a clinical supply cupboard on the west wall with one door ajar, and
  the nurse-call annunciator above the cabinets with one lamp still lit (Room 104).
* The east side: a parked observations machine and a wall glove dispenser by the way in.
* Paperwork that says the shift stopped mid-task: lever-arch files and patient notes on the back
  desk, a drug-round folder and sharps bin on the counter, archive boxes on the cabinets.

Every prop keeps its own node (so tests can check each visual against its collider) but they share
one baked atlas material (albedo with ambient occlusion from the surrounding walls, desk and
counter, ORM and normal): lit at runtime by the station's own troffer and desk lamp.
"""
import json
import math
import os
import random
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(__file__))
import nwset as nw  # noqa: E402
from nwset import g  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = ARGS[0] if ARGS else os.path.join(os.path.dirname(__file__), '.work', 'station')
QUICK = '--quick' in ARGS
ATLAS = 512 if QUICK else 1024
AO_SAMPLES = 16 if QUICK else 64
nw.ensure_dir(OUT)
WORK = nw.ensure_dir(os.path.join(OUT, 'bake'))

HALF_PI = math.pi / 2
BACK_Z = -6.4          # station back (north) wall, inner face
WEST_X = -6.725        # station west partition, inner face
EAST_X = 0.125         # station east partition, inner face
DESK_TOP = 0.7475      # back desk worktop (clinical.ts: laminate at y 0.73, 35 mm)
COUNTER_TOP = 0.7675   # inner counter worktop (laminate at y 0.75)

# Placements (game x, z, yaw). Mirrored in src/world/stealth/layout.ts (STATION_PROPS).
TROLLEY = (-4.6, -1.0, 0.0)            # front (+z) faces the corridor and the crouching player
CABINET_A = (-5.73, BACK_Z + 0.32, 0.0)
CABINET_B = (-5.25, BACK_Z + 0.32, 0.0)
CUPBOARD = (WEST_X + 0.23, -5.2, HALF_PI)
OBS = (-0.42, -5.3, -0.6)
ANNUNCIATOR = (-5.49, 1.72, BACK_Z)
GLOVES = (EAST_X, 1.35, -1.82)          # beside the way in, clear of the noticeboard (z -3.35..-2.25)

nw.reset()
scene = bpy.context.scene
PROPS = nw.collection('props')
OCC = nw.collection('occluders')
LIGHTS = nw.collection('emissive')
SHADOW = nw.collection('shadows')
rnd = random.Random(6)

P = {
    'steel': nw.pbr('steel', (0.55, 0.56, 0.57), rough=0.42, metal=1.0, grime=0.4, bump=0.05, wear_color=(0.42, 0.28, 0.16), wear=0.1),
    'chrome': nw.pbr('chrome', (0.85, 0.86, 0.88), rough=0.18, metal=1.0, grime=0.3, bump=0.02),
    'rubber': nw.pbr('rubber', (0.05, 0.05, 0.05), rough=0.75, grime=0.1, bump=0.08),
    'linen': nw.pbr('linen', (0.80, 0.80, 0.76), rough=0.9, grime=0.3, grime_scale=3.0, weave=1.0, bump=0.25, streaks=0.08),
    'pillowcase': nw.pbr('pillowcase', (0.74, 0.77, 0.78), rough=0.9, grime=0.25, weave=1.0, bump=0.25),
    'blanket': nw.pbr('blanket', (0.36, 0.45, 0.55), rough=0.95, grime=0.3, weave=1.0, bump=0.35),
    'gown': nw.pbr('gown_print', (0.5, 0.62, 0.6), rough=0.92, grime=0.3, weave=1.0, bump=0.3),
    'cover': nw.pbr('trolley_cover', (0.27, 0.42, 0.44), rough=0.88, grime=0.45, grime_scale=3.5, weave=1.0, bump=0.3, streaks=0.18,
                    wear_color=(0.4, 0.45, 0.42), wear=0.08),
    'cabinet': nw.pbr('cabinet_paint', (0.55, 0.55, 0.5), rough=0.5, grime=0.45, grime_scale=4.0, bump=0.05, wear_color=(0.33, 0.3, 0.26), wear=0.14, streaks=0.1),
    'cupboard': nw.pbr('cupboard_powder', (0.8, 0.8, 0.77), rough=0.45, grime=0.4, grime_scale=4.0, bump=0.04, wear_color=(0.5, 0.45, 0.38), wear=0.1, streaks=0.15),
    'white': nw.pbr('white_abs', (0.82, 0.82, 0.79), rough=0.4, grime=0.3, bump=0.03),
    'grey_abs': nw.pbr('grey_abs', (0.35, 0.36, 0.37), rough=0.45, grime=0.25),
    'glass': nw.pbr('glass_dark', (0.03, 0.035, 0.04), rough=0.08, metal=0.5, grime=0.25, bump=0.0),
    'paper': nw.pbr('paper', (0.85, 0.83, 0.76), rough=0.9, grime=0.3, streaks=0.2),
    'buff': nw.pbr('folder_buff', (0.72, 0.6, 0.4), rough=0.85, grime=0.35, wear_color=(0.5, 0.4, 0.28), wear=0.12),
    'card': nw.pbr('cardboard', (0.5, 0.38, 0.24), rough=0.9, grime=0.35, bump=0.2, wear_color=(0.35, 0.27, 0.17), wear=0.1),
    'file_red': nw.pbr('file_red', (0.5, 0.09, 0.08), rough=0.55, grime=0.3, wear_color=(0.3, 0.1, 0.08), wear=0.1),
    'file_blue': nw.pbr('file_blue', (0.12, 0.2, 0.42), rough=0.55, grime=0.3, wear_color=(0.2, 0.22, 0.3), wear=0.1),
    'file_green': nw.pbr('file_green', (0.14, 0.34, 0.2), rough=0.55, grime=0.3),
    'file_black': nw.pbr('file_black', (0.05, 0.05, 0.055), rough=0.5, grime=0.25),
    'nitrile': nw.pbr('nitrile_blue', (0.12, 0.26, 0.62), rough=0.55, grime=0.2, bump=0.1),
    'purple': nw.pbr('box_purple', (0.36, 0.22, 0.52), rough=0.55, grime=0.25),
    'sharps': nw.pbr('sharps_yellow', (0.8, 0.62, 0.05), rough=0.45, grime=0.35, wear_color=(0.4, 0.35, 0.2), wear=0.08),
    'red': nw.pbr('signal_red', (0.55, 0.06, 0.05), rough=0.4, grime=0.2),
    'cuff': nw.pbr('cuff_navy', (0.08, 0.1, 0.2), rough=0.7, grime=0.3, weave=1.0, bump=0.2),
    'ceramic': nw.pbr('mug', (0.72, 0.78, 0.82), rough=0.2, grime=0.35, clearcoat=0.4),
    'tea': nw.pbr('tea', (0.12, 0.06, 0.02), rough=0.05, grime=0.0),
}
OCC_MAT = nw.pbr('occluder', (0.5, 0.5, 0.5), rough=0.8, grime=0.0)
LED_MAT = bpy.data.materials.new('call_led')
LED_MAT.use_nodes = True
_bsdf = next(n for n in LED_MAT.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
_bsdf.inputs['Base Color'].default_value = (0.35, 0.02, 0.02, 1)
_bsdf.inputs['Emission Color'].default_value = (1.0, 0.08, 0.04, 1)
_bsdf.inputs['Emission Strength'].default_value = 3.0
_bsdf.inputs['Roughness'].default_value = 0.3


class Prop:
    """Built in prop-local game coordinates (front = local +z) under an empty at the placement."""

    def __init__(self, name, x, z, yaw, y=0.0):
        self.empty = bpy.data.objects.new(f'{name}__pivot', None)
        PROPS.objects.link(self.empty)
        self.empty.location = g(x, y, z)
        self.empty.rotation_euler = (0, 0, yaw)
        self.parts = []
        self.name = name

    def add(self, ob):
        ob.parent = self.empty
        self.parts.append(ob)
        return ob

    def box(self, mat, size, center, yaw=0.0, bevel=0.006, rot=(0, 0, 0), segments=2):
        return self.add(nw.box(f'{self.name}.b', PROPS, size, center, yaw=yaw, mat=P[mat], bevel=bevel, segments=segments, rot=rot))

    def cyl(self, mat, r, h, center, axis='y', verts=16, yaw=0.0, r2=None):
        return self.add(nw.cylinder(f'{self.name}.c', PROPS, r, h, center, axis=axis, mat=P[mat], verts=verts, yaw=yaw, radius2=r2))

    def tube(self, mat, pts, r, res=6):
        return self.add(nw.tube(f'{self.name}.t', PROPS, pts, r, mat=P[mat], resolution=res))

    def cloth(self, mat, origin, u, v, w, h, nu, nv, ripple, seed, sag=0.0, thickness=0.004):
        """A fabric panel: corner `origin`, width along unit `u`, height along unit `v` (local
        coordinates), rippled along the panel normal; `sag` bows the middle (top covers)."""
        o, u, v = Vector(origin), Vector(u), Vector(v)
        n = u.cross(v).normalized()
        bm = bmesh.new()
        rows = []
        for j in range(nv + 1):
            t = j / nv
            row = []
            for i in range(nu + 1):
                s = i / nu
                off = ripple * (math.sin(s * 9.0 + seed) * 0.6 + math.sin(s * 23.0 + t * 4.0 + seed * 2) * 0.25) * (0.3 + 0.7 * t)
                off += sag * math.sin(s * math.pi) * math.sin(t * math.pi)
                p = o + u * (s * w) + v * (t * h) + n * off
                row.append(bm.verts.new(g(p.x, p.y, p.z)))
            rows.append(row)
        for j in range(nv):
            for i in range(nu):
                bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        ob = nw.mesh_object(f'{self.name}.cloth', bm, PROPS, P[mat])
        sol = ob.modifiers.new('solid', 'SOLIDIFY')
        sol.thickness = thickness
        nw.apply_all(ob)
        return self.add(ob)

    def finish(self):
        bpy.context.view_layer.update()
        for ob in self.parts:
            mw = ob.matrix_world.copy()
            ob.parent = None
            ob.matrix_world = mw
        nw.select_only(self.parts)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        joined = nw.join(self.parts, self.name)
        nw.select_only([joined])
        bpy.ops.object.shade_auto_smooth(angle=math.radians(35))
        bpy.data.objects.remove(self.empty)
        bpy.context.view_layer.update()
        return joined


def caster(p, x, z, wheel=0.05):
    p.box('steel', (0.045, 0.012, 0.045), (x, 2 * wheel + 0.02, z), bevel=0.003)
    p.box('steel', (0.006, wheel * 1.5, 0.04), (x - 0.017, wheel + 0.012, z), bevel=0.002)
    p.box('steel', (0.006, wheel * 1.5, 0.04), (x + 0.017, wheel + 0.012, z), bevel=0.002)
    p.cyl('rubber', wheel, 0.025, (x, wheel, z), axis='x', verts=16)


def folded_stack(p, mats, x, y0, z, w, d, n, h=0.034):
    """Folded laundry: soft-edged slabs, slightly misaligned, alternating where `mats` has several."""
    y = y0
    for i in range(n):
        mat = mats[i % len(mats)]
        hh = h * (0.85 + 0.3 * rnd.random())
        p.box(mat, (w + rnd.uniform(-0.015, 0.015), hh, d + rnd.uniform(-0.015, 0.015)),
              (x + rnd.uniform(-0.012, 0.012), y + hh / 2, z + rnd.uniform(-0.01, 0.01)),
              yaw=rnd.uniform(-0.05, 0.05), bevel=hh * 0.45, segments=3)
        y += hh
    return y


# ---------------------------------------------------------------------------------------------
# The linen trolley (crouch cover). Collider: 0.9 x 1.2 x 0.5 m, centred on the placement.


def linen_trolley():
    W, D, H = 0.9, 0.5, 1.2
    x, z, yaw = TROLLEY
    p = Prop('station_linen_trolley', x, z, yaw)
    hx, hz = W / 2 - 0.03, D / 2 - 0.03
    for sx in (-1, 1):
        for sz in (-1, 1):
            p.cyl('steel', 0.0125, H - 0.12, (sx * hx, 0.12 + (H - 0.12) / 2 - 0.005, sz * hz), verts=12)
            caster(p, sx * hx, sz * hz)
    for y in (0.16, 0.57, 0.97):
        p.box('steel', (W - 0.05, 0.018, D - 0.05), (0, y, 0), bevel=0.004)
        for sz in (-1, 1):
            p.box('steel', (W - 0.05, 0.03, 0.01), (0, y + 0.015, sz * (D / 2 - 0.03)), bevel=0.003)
    # Top rail and the push handle at the east end.
    for sz in (-1, 1):
        p.cyl('steel', 0.011, W - 0.06, (0, H - 0.015, sz * hz), axis='x', verts=10)
    for sx in (-1, 1):
        p.cyl('steel', 0.011, D - 0.06, (sx * hx, H - 0.015, 0), axis='z', verts=10)
    p.tube('chrome', [(hx, 0.95, -0.17), (hx + 0.022, 0.97, -0.15), (hx + 0.022, 0.97, 0.15), (hx, 0.95, 0.17)], 0.011)
    # Laundry: sheets and pillowcases at the bottom, blankets in the middle, gowns on top.
    folded_stack(p, ['linen'], -0.22, 0.17, 0.0, 0.38, 0.36, 9)
    folded_stack(p, ['pillowcase', 'linen'], 0.2, 0.17, 0.02, 0.36, 0.34, 7)
    folded_stack(p, ['blanket'], -0.21, 0.58, 0.0, 0.4, 0.38, 6, h=0.05)
    folded_stack(p, ['linen'], 0.21, 0.58, -0.01, 0.38, 0.36, 8)
    folded_stack(p, ['gown'], -0.18, 0.98, 0.01, 0.36, 0.3, 4, h=0.03)
    # One sheet half pulled out and hanging over the lower shelf's front edge.
    p.cloth('linen', (0.04, 0.42, D / 2 - 0.01), (1, 0, 0), (0, -1, 0), 0.32, 0.22, 6, 5, 0.008, 1.3, thickness=0.003)
    # The fitted cover: station side (local -z), both ends and the top; the front rolled up.
    p.cloth('cover', (-W / 2 - 0.006, H - 0.006, -D / 2 - 0.008), (1, 0, 0), (0, -1, 0), W + 0.012, H - 0.18, 14, 12, 0.012, 0.7)
    for sx in (-1, 1):
        p.cloth('cover', (sx * (W / 2 + 0.008), H - 0.006, -D / 2 - 0.006), (0, 0, 1), (0, -1, 0), D + 0.004, H - 0.21, 8, 12, 0.01, 2.1 + sx)
    p.cloth('cover', (-W / 2 - 0.006, H - 0.004, -D / 2 - 0.008), (1, 0, 0), (0, 0, 1), W + 0.012, D - 0.08, 12, 6, 0.003, 3.3, sag=-0.01)
    p.cyl('cover', 0.035, W - 0.02, (0, H - 0.035, D / 2 - 0.06), axis='x', verts=14)
    for sx in (-0.3, 0.3):
        p.box('cover', (0.025, 0.11, 0.08), (sx, H - 0.05, D / 2 - 0.05), bevel=0.008)
    # Laundry tag and a clipped list on the end (the side the player sees first).
    p.box('white', (0.004, 0.14, 0.1), (-W / 2 - 0.018, 0.9, 0.08), bevel=0.001)
    return p.finish()


# ---------------------------------------------------------------------------------------------
# Records corner


def filing_cabinet(name, place, open_drawer=None):
    x, z, yaw = place
    W, H, D = 0.47, 1.32, 0.62
    p = Prop(name, x, z, yaw)
    p.box('cabinet', (W, H - 0.04, D), (0, H / 2 + 0.02, 0), bevel=0.006)
    p.box('cabinet', (W - 0.04, 0.04, D - 0.04), (0, 0.02, -0.01), bevel=0.003)
    p.cyl('chrome', 0.012, 0.02, (W / 2 - 0.07, H - 0.06, D / 2 + 0.008), axis='z', verts=12)
    dh = (H - 0.08) / 4
    for k in range(4):
        cy = 0.06 + dh * (k + 0.5)
        out = 0.28 if open_drawer == k else 0.0
        fz = D / 2 + 0.006 + out
        if out:
            p.box('glass', (W - 0.05, dh - 0.02, 0.02), (0, cy, D / 2 - 0.01), bevel=0.0)
            for sx in (-1, 1):
                p.box('cabinet', (0.01, dh - 0.08, out + 0.04), (sx * (W / 2 - 0.04), cy - 0.02, D / 2 + out / 2 - 0.02), bevel=0.002)
            # Hanging files, tabs up, a few pulled forward.
            for i in range(9):
                fzz = D / 2 - 0.02 + out - 0.03 - i * 0.032
                lift = 0.025 if i in (2, 5) else 0.0
                p.box(['buff', 'file_green', 'buff', 'file_blue'][i % 4], (W - 0.1, dh - 0.07 + lift, 0.006), (0, cy - 0.01 + lift / 2, fzz), bevel=0.001)
                p.box('white', (0.06, 0.018, 0.004), (-0.12 + (i % 3) * 0.12, cy + dh / 2 - 0.035 + lift, fzz), bevel=0.0)
            p.box('paper', (W - 0.12, 0.004, 0.25), (0.01, cy + dh / 2 - 0.02 + 0.03, D / 2 + out - 0.16), yaw=0.08, rot=(0.0, 0, 0.04), bevel=0.0)
        p.box('cabinet', (W - 0.03, dh - 0.016, 0.02), (0, cy, fz), bevel=0.004)
        p.box('chrome', (0.16, 0.022, 0.03), (0, cy + 0.03, fz + 0.022), bevel=0.006)
        p.box('steel', (0.085, 0.045, 0.006), (0, cy + 0.085, fz + 0.012), bevel=0.0015)
        p.box('paper', (0.07, 0.03, 0.004), (0, cy + 0.085, fz + 0.016), bevel=0.0)
    return p


def records_corner():
    out = []
    a = filing_cabinet('station_cabinet_a', CABINET_A)
    # Archive box and a lever-arch file left on top.
    a.box('card', (0.38, 0.26, 0.3), (0.0, 1.32 + 0.13, -0.05), yaw=0.06, bevel=0.006)
    a.box('card', (0.39, 0.03, 0.31), (0.0, 1.32 + 0.275, -0.05), yaw=0.06, bevel=0.004)
    a.box('white', (0.14, 0.07, 0.004), (0.02, 1.32 + 0.15, 0.106), yaw=0.06, bevel=0.0)
    a.box('file_black', (0.32, 0.075, 0.28), (0.02, 1.32 + 0.3, -0.04), yaw=-0.25, bevel=0.006)
    out.append(a.finish())
    b = filing_cabinet('station_cabinet_b', CABINET_B, open_drawer=2)
    y = 1.32
    for i in range(6):
        b.box('buff' if i % 3 else 'file_red', (0.24, 0.012, 0.32), (rnd.uniform(-0.03, 0.03), y + 0.006, rnd.uniform(-0.03, 0.03)), yaw=rnd.uniform(-0.15, 0.15), bevel=0.002)
        y += 0.013
    b.box('paper', (0.21, 0.004, 0.29), (0.06, y + 0.002, 0.05), yaw=0.5, bevel=0.0)
    out.append(b.finish())

    # Supply cupboard (front local +z faces into the station): carcass, shelves, two doors, the
    # left one ajar on boxes of gloves, dressings and syringes. A padlock hangs open on the hasp.
    x, z, yaw = CUPBOARD
    W, H, D = 0.9, 1.95, 0.45
    c = Prop('station_supply_cupboard', x, z, yaw)
    c.box('cupboard', (W, H - 0.06, 0.015), (0, H / 2 + 0.03, -D / 2 + 0.008), bevel=0.002)
    for sx in (-1, 1):
        c.box('cupboard', (0.02, H - 0.06, D), (sx * (W / 2 - 0.01), H / 2 + 0.03, 0), bevel=0.003)
    c.box('cupboard', (W, 0.02, D), (0, H - 0.01, 0), bevel=0.004)
    c.box('cupboard', (W - 0.04, 0.06, D - 0.04), (0, 0.03, 0.0), bevel=0.003)
    shelves = (0.42, 0.82, 1.22, 1.6)
    for y in shelves:
        c.box('cupboard', (W - 0.04, 0.018, D - 0.05), (0, y, -0.01), bevel=0.003)
    stock = [('nitrile', 0.24, 0.13, 0.12), ('purple', 0.24, 0.13, 0.12), ('white', 0.3, 0.16, 0.22), ('card', 0.36, 0.22, 0.3), ('paper', 0.2, 0.08, 0.28)]
    for si, y in enumerate((0.06,) + shelves[:-1]):
        cx = -W / 2 + 0.05
        while cx < W / 2 - 0.12:
            mat, w, h, d = stock[rnd.randrange(len(stock))]
            if cx + w > W / 2 - 0.03:
                break
            if rnd.random() < 0.18 and si:
                cx += w * 0.7
                continue
            c.box(mat, (w, h, d), (cx + w / 2, y + 0.009 + h / 2, -0.02 + rnd.uniform(-0.03, 0.03)), yaw=rnd.uniform(-0.08, 0.08), bevel=0.004)
            cx += w + 0.012
    dw = W / 2 - 0.006
    # Right door (local +x half), closed.
    c.box('cupboard', (dw, H - 0.08, 0.02), (dw / 2 + 0.003, H / 2 + 0.03, D / 2 + 0.01), bevel=0.004)
    c.box('chrome', (0.02, 0.14, 0.03), (0.04, 1.05, D / 2 + 0.035), bevel=0.006)
    c.box('steel', (0.1, 0.06, 0.004), (0.2, 1.62, D / 2 + 0.022), bevel=0.001)
    c.box('white', (0.09, 0.05, 0.002), (0.2, 1.62, D / 2 + 0.025), bevel=0.0)
    # Left door, hinged at its outer edge, 22 degrees open.
    ang = math.radians(22)
    hx = -W / 2 + 0.003
    cxd = hx + math.cos(ang) * dw / 2
    czd = D / 2 + 0.01 + math.sin(ang) * dw / 2
    c.box('cupboard', (dw, H - 0.08, 0.02), (cxd, H / 2 + 0.03, czd), yaw=-ang, bevel=0.004)
    ex, ez = hx + math.cos(ang) * (dw - 0.04), D / 2 + 0.035 + math.sin(ang) * (dw - 0.04)
    c.box('chrome', (0.02, 0.14, 0.03), (ex, 1.05, ez), yaw=-ang, bevel=0.006)
    c.box('steel', (0.05, 0.03, 0.006), (ex + 0.01, 1.2, ez - 0.004), yaw=-ang, bevel=0.002)
    c.box('chrome', (0.04, 0.045, 0.016), (ex + 0.02, 1.13, ez + 0.012), yaw=-ang, bevel=0.006)
    c.tube('chrome', [(ex + 0.01, 1.155, ez + 0.012), (ex + 0.02, 1.175, ez + 0.014), (ex + 0.03, 1.155, ez + 0.012)], 0.004)
    out.append(c.finish())

    # Nurse-call annunciator: eight room lamps, Room 104's still lit (a separate emissive node).
    x, y, zw = ANNUNCIATOR
    a = Prop('station_annunciator', x, zw, 0.0)
    a.box('white', (0.52, 0.2, 0.035), (0, y, 0.018), bevel=0.006)
    a.box('grey_abs', (0.48, 0.03, 0.006), (0, y + 0.07, 0.038), bevel=0.001)
    lamps = []
    for k in range(8):
        lx = -0.18 + (k % 4) * 0.12
        ly = y + 0.015 - (k // 4) * 0.06
        if k == 1:
            lamps.append((lx, ly))
            continue
        a.box('grey_abs', (0.05, 0.03, 0.008), (lx, ly, 0.039), bevel=0.002)
        a.box('paper', (0.05, 0.012, 0.002), (lx, ly - 0.025, 0.037), bevel=0.0)
    a.box('paper', (0.05, 0.012, 0.002), (lamps[0][0], lamps[0][1] - 0.025, 0.037), bevel=0.0)
    a.tube('grey_abs', [(0.26, y - 0.06, 0.012), (0.3, y - 0.2, 0.012), (0.31, y - 0.6, 0.012), (0.31, 1.32, 0.012)], 0.006)
    out.append(a.finish())
    led = nw.box('station_call_led', LIGHTS, (0.05, 0.03, 0.01), (x + lamps[0][0], lamps[0][1], zw + 0.039), mat=LED_MAT, bevel=0.002)
    return out, led


# ---------------------------------------------------------------------------------------------
# East side and paperwork


def obs_machine():
    x, z, yaw = OBS
    p = Prop('station_obs_machine', x, z, yaw)
    for k in range(5):
        a = k * 2 * math.pi / 5
        ex, ez = math.sin(a) * 0.27, math.cos(a) * 0.27
        p.box('grey_abs', (0.04, 0.035, 0.27), (ex / 2, 0.085, ez / 2), yaw=a, bevel=0.008)
        p.cyl('rubber', 0.032, 0.022, (ex, 0.032, ez), axis='x', yaw=a, verts=12)
        p.box('grey_abs', (0.03, 0.03, 0.03), (ex, 0.075, ez), bevel=0.004)
    p.cyl('grey_abs', 0.05, 0.08, (0, 0.11, 0), verts=14)
    p.cyl('steel', 0.019, 0.88, (0, 0.55, 0), verts=12)
    p.box('steel', (0.3, 0.012, 0.2), (0, 0.66, 0.06), bevel=0.003)
    for sx in (-1, 1):
        p.box('steel', (0.006, 0.07, 0.2), (sx * 0.15, 0.69, 0.06), bevel=0.001)
    p.box('steel', (0.3, 0.07, 0.006), (0, 0.69, 0.16), bevel=0.001)
    p.box('cuff', (0.22, 0.03, 0.12), (0.0, 0.685, 0.05), yaw=0.3, bevel=0.012, segments=3)
    p.box('white', (0.32, 0.23, 0.15), (0, 1.1, 0.0), bevel=0.018, segments=3)
    p.box('glass', (0.22, 0.13, 0.006), (-0.025, 1.12, 0.077), bevel=0.003)
    for i in range(4):
        p.box('grey_abs', (0.03, 0.02, 0.006), (0.115, 1.17 - i * 0.035, 0.077), bevel=0.003)
    p.tube('grey_abs', [(-0.12, 1.23, 0.0), (-0.12, 1.29, 0.0), (0.12, 1.29, 0.0), (0.12, 1.23, 0.0)], 0.012)
    p.box('steel', (0.08, 0.1, 0.05), (0, 1.0, -0.06), bevel=0.006)
    # Cuff hose coiled over the head; the probe cable hanging loose.
    p.tube('grey_abs', [(0.16, 1.05, 0.02), (0.22, 0.9, 0.08), (0.12, 0.75, 0.1), (0.02, 0.72, 0.06)], 0.006)
    p.tube('cuff', [(-0.16, 1.08, 0.03), (-0.22, 0.85, 0.06), (-0.19, 0.5, 0.1), (-0.12, 0.36, 0.06)], 0.004)
    p.box('grey_abs', (0.03, 0.04, 0.03), (-0.12, 0.33, 0.06), bevel=0.008)
    return p.finish()


def glove_dispenser():
    x, y, z = GLOVES
    p = Prop('station_glove_dispenser', x, z, -HALF_PI)
    p.box('steel', (0.42, 0.26, 0.008), (0, y, 0.006), bevel=0.002)
    for k, mat in enumerate(('nitrile', 'purple', 'white')):
        bx = -0.14 + k * 0.14
        p.box(mat, (0.125, 0.24, 0.075), (bx, y, 0.05), bevel=0.004)
        p.box('glass', (0.07, 0.04, 0.004), (bx, y + 0.06, 0.088), bevel=0.002)
        if k < 2:
            p.box(mat, (0.05, 0.035, 0.03), (bx + 0.005, y + 0.055, 0.1), yaw=0.3, rot=(0.4, 0, 0.2), bevel=0.012, segments=3)
    p.box('steel', (0.43, 0.012, 0.09), (0, y - 0.125, 0.045), bevel=0.002)
    return p.finish()


def paperwork():
    p = Prop('station_paperwork', 0.0, 0.0, 0.0)
    # Back desk: lever-arch files standing at the west end, a stack of notes, an obs chart, a mug.
    for i, mat in enumerate(('file_black', 'file_blue', 'file_red', 'file_black')):
        p.box(mat, (0.075, 0.315, 0.28), (-4.78 + i * 0.08, DESK_TOP + 0.158, BACK_Z + 0.17), yaw=0.03 * (i - 1.5), rot=(0, 0, 0.05 if i == 3 else 0.0), bevel=0.004)
        p.box('white', (0.004, 0.08, 0.05), (-4.78 + i * 0.08, DESK_TOP + 0.2, BACK_Z + 0.312), bevel=0.0)
    y = DESK_TOP
    for i in range(7):
        p.box('buff' if i % 4 else 'file_green', (0.26, 0.016, 0.34), (-4.15 + rnd.uniform(-0.03, 0.03), y + 0.008, -5.95 + rnd.uniform(-0.03, 0.03)), yaw=rnd.uniform(-0.2, 0.2), bevel=0.002)
        y += 0.017
    p.box('paper', (0.21, 0.003, 0.3), (-3.6, DESK_TOP + 0.002, -5.92), yaw=-0.3, bevel=0.0)
    p.box('paper', (0.21, 0.003, 0.3), (-3.52, DESK_TOP + 0.005, -5.88), yaw=0.15, bevel=0.0)
    p.cyl('grey_abs', 0.004, 0.14, (-3.45, DESK_TOP + 0.009, -5.85), axis='x', yaw=0.7, verts=6)
    p.cyl('ceramic', 0.042, 0.095, (-2.5, DESK_TOP + 0.0475, -5.85), verts=18)
    p.cyl('tea', 0.037, 0.004, (-2.5, DESK_TOP + 0.08, -5.85), verts=18)
    p.tube('ceramic', [(-2.458, DESK_TOP + 0.075, -5.85), (-2.43, DESK_TOP + 0.05, -5.85), (-2.458, DESK_TOP + 0.025, -5.85)], 0.007)
    # Counter: the drug-round folder left open, a sharps bin, a box of gloves.
    p.box('file_red', (0.25, 0.012, 0.33), (-5.12, COUNTER_TOP + 0.006, -2.08), yaw=0.12, bevel=0.002)
    p.box('file_red', (0.25, 0.012, 0.33), (-4.87, COUNTER_TOP + 0.006, -2.05), yaw=0.08, bevel=0.002)
    p.box('paper', (0.21, 0.004, 0.29), (-5.12, COUNTER_TOP + 0.014, -2.08), yaw=0.12, bevel=0.0)
    p.box('paper', (0.21, 0.004, 0.29), (-4.87, COUNTER_TOP + 0.014, -2.05), yaw=0.08, bevel=0.0)
    p.box('sharps', (0.2, 0.15, 0.15), (-6.0, COUNTER_TOP + 0.075, -2.2), yaw=0.2, bevel=0.01, segments=3)
    p.box('red', (0.21, 0.025, 0.16), (-6.0, COUNTER_TOP + 0.162, -2.2), yaw=0.2, bevel=0.008)
    p.box('nitrile', (0.24, 0.085, 0.125), (-3.45, COUNTER_TOP + 0.043, -2.28), yaw=-0.35, bevel=0.004)
    return p.finish()


# ---------------------------------------------------------------------------------------------
# Occluders for the AO bake (not exported): floor, walls, desk, counter.


def occluders():
    o = []
    o.append(nw.box('occ_floor', OCC, (8.0, 0.02, 7.0), (-3.3, -0.01, -3.0), mat=OCC_MAT))
    o.append(nw.box('occ_back', OCC, (8.0, 3.0, 0.1), (-3.3, 1.5, BACK_Z - 0.05), mat=OCC_MAT))
    o.append(nw.box('occ_west', OCC, (0.1, 3.0, 5.2), (WEST_X - 0.05, 1.5, -4.0), mat=OCC_MAT))
    o.append(nw.box('occ_east', OCC, (0.1, 3.0, 5.2), (EAST_X + 0.05, 1.5, -4.0), mat=OCC_MAT))
    o.append(nw.box('occ_desk', OCC, (2.6, 0.74, 0.65), (-3.6, 0.37, -6.05), mat=OCC_MAT))
    o.append(nw.box('occ_counter', OCC, (5.0, 1.12, 0.95), (-3.8, 0.56, -1.97), mat=OCC_MAT))
    o.append(nw.box('occ_corr_wall', OCC, (8.0, 3.0, 0.1), (-3.3, 1.5, 1.45), mat=OCC_MAT))
    return o


# ---------------------------------------------------------------------------------------------
# Contact shadows: one soft-edged dark quad under each floor prop (alpha blended, one draw call).


def shadow_texture(path, size=128):
    img = nw.new_image('station_contact', size, alpha=True)
    u = (np.arange(size) + 0.5) / size * 2 - 1
    uu, vv = np.meshgrid(u, u)
    d = np.maximum(np.abs(uu), np.abs(vv))
    a = np.clip((1.0 - d) / 0.45, 0, 1) ** 1.6 * 0.7
    px = np.zeros((size, size, 4), dtype=np.float32)
    px[..., 3] = a
    img.pixels[:] = px.ravel()
    return nw.save(img, path, 'PNG')


def contact_shadows():
    mat = nw.image_material('station_contact_shadow', shadow_texture(os.path.join(WORK, 'station_contact.png')), rough_value=1.0, alpha_blend=True)
    quads = []
    for name, (x, z, w, d) in {
        'trolley': (TROLLEY[0], TROLLEY[1], 1.2, 0.8),
        'cabinets': ((CABINET_A[0] + CABINET_B[0]) / 2, BACK_Z + 0.4, 1.25, 0.95),
        'cupboard': (CUPBOARD[0] + 0.05, CUPBOARD[1], 0.75, 1.2),
        'obs': (OBS[0], OBS[1], 0.8, 0.8),
    }.items():
        quads.append(nw.plane(f'shadow_{name}', SHADOW, w, d, (x, 0.007, z), normal='y', mat=mat))
    return nw.join(quads, 'station_contact_shadows')


# ---------------------------------------------------------------------------------------------
# Bake: one atlas across every prop (albedo with AO, ORM, normal), then export.


def bake_atlas(objs):
    for ob in objs:
        for uv in list(ob.data.uv_layers):
            ob.data.uv_layers.remove(uv)
    nw.atlas_uvs(objs, margin=0.003)
    mats = []
    for ob in objs:
        for s in ob.material_slots:
            if s.material not in mats:
                mats.append(s.material)
    albedo = nw.new_image('station_albedo', ATLAS)
    saved = []
    for m in mats:
        bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        sock = bsdf.inputs['Metallic']
        link = sock.links[0] if sock.links else None
        saved.append((m.node_tree, sock, sock.default_value, link.from_socket if link else None))
        if link:
            m.node_tree.links.remove(link)
        sock.default_value = 0.0
    nw.bake(objs, albedo, 'DIFFUSE', 'UVMap', samples=1, pass_filter={'COLOR'})
    for nt, sock, value, src in saved:
        sock.default_value = value
        if src:
            nt.links.new(src, sock)
    rough = nw.new_image('station_rough', ATLAS, non_color=True)
    nw.bake(objs, rough, 'ROUGHNESS', 'UVMap', samples=1)
    normal = nw.new_image('station_normal', ATLAS, non_color=True)
    nw.bake(objs, normal, 'NORMAL', 'UVMap', samples=1)
    emits = []
    for m in mats:
        nt = m.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
        em = nt.nodes.new('ShaderNodeEmission')
        em.inputs['Color'].default_value = (bsdf.inputs['Metallic'].default_value,) * 3 + (1,)
        old = out.inputs['Surface'].links[0].from_socket if out.inputs['Surface'].links else None
        nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
        emits.append((nt, out, old, em))
    metal = nw.new_image('station_metal', ATLAS, non_color=True)
    nw.bake(objs, metal, 'EMIT', 'UVMap', samples=1)
    for nt, out, old, em in emits:
        if old:
            nt.links.new(old, out.inputs['Surface'])
        nt.nodes.remove(em)
    ao = nw.new_image('station_ao', ATLAS, non_color=True)
    if scene.world is None:
        scene.world = bpy.data.worlds.new('w')
    scene.world.light_settings.distance = 0.35
    nw.bake(objs, ao, 'AO', 'UVMap', samples=AO_SAMPLES)
    a = np.array(albedo.pixels[:]).reshape(-1, 4)
    o = np.array(ao.pixels[:]).reshape(-1, 4)[:, :1]
    a[:, :3] *= 0.3 + 0.7 * o
    albedo.pixels[:] = a.ravel()
    r = np.array(rough.pixels[:]).reshape(-1, 4)
    m = np.array(metal.pixels[:]).reshape(-1, 4)
    orm = np.ones_like(r)
    orm[:, 1] = r[:, 0]
    orm[:, 2] = m[:, 0]
    orm_img = nw.new_image('station_orm', ATLAS, non_color=True)
    orm_img.pixels[:] = orm.ravel()
    paths = {k: nw.save(img, os.path.join(WORK, f'station_{k}.jpg'), 'JPEG', 90) for k, img in (('albedo', albedo), ('orm', orm_img), ('normal', normal))}
    mat = nw.image_material('station_atlas', paths['albedo'], paths['normal'], paths['orm'])
    for ob in objs:
        ob.data.materials.clear()
        ob.data.materials.append(mat)


def main():
    props = [linen_trolley(), obs_machine(), glove_dispenser(), paperwork()]
    corner, led = records_corner()
    props = corner + props
    shadows = contact_shadows()
    occ = occluders()
    for o in [led, shadows]:
        o.hide_render = True
    bake_atlas(props)
    for o in [led, shadows]:
        o.hide_render = False
    for o in occ:
        o.hide_render = True
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'station_set.blend'))
    exported = props + [led, shadows]
    nw.select_only(exported)
    glb = os.path.join(OUT, 'station_set.glb')
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_texcoords=True, export_normals=True, export_tangents=False, export_materials='EXPORT',
                              export_image_format='AUTO', export_jpeg_quality=88, export_animations=False, export_extras=False)
    tri = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in exported}
    manifest = {
        'glb': 'station_set.glb', 'bytes': os.path.getsize(glb), 'triangles': sum(tri.values()), 'meshes': tri,
        'materials': sorted({s.material.name for o in exported for s in o.material_slots if s.material}),
        'atlas': ATLAS, 'aoSamples': AO_SAMPLES,
    }
    json.dump(manifest, open(os.path.join(OUT, 'station_set.json'), 'w'), indent=1)
    print('NW_STATION_DONE', json.dumps({k: manifest[k] for k in ('bytes', 'triangles', 'materials')}))


main()
