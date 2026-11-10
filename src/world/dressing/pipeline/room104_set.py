"""Room 104 + west corridor visual prototype: modelling.

    <blender-python> room104_set.py -- <tex_dir> <out.blend>

Builds the set in exact game coordinates (see nwset.g). Furniture uses the same placements and
footprints as src/world/rooms/patientRooms.ts so the existing colliders, hiding spots and
interactions still match what the player sees. Walls are thin "skins" laid over the structural
cores (which stay procedural and keep their colliders); the procedural finishes, furniture,
floor and ceiling in these regions are suppressed in game (src/world/dressing/regions.ts).
"""
import math
import os
import sys

import bpy
import bmesh  # noqa: E402  (bmesh needs bpy imported first)
from mathutils import Euler, Matrix, Vector

sys.path.insert(0, os.path.dirname(__file__))
import nwset as nw  # noqa: E402
import opening as op  # noqa: E402
from nwset import g  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
TEX = ARGS[0] if ARGS else 'textures'
OUT = ARGS[1] if len(ARGS) > 1 else 'room104_set.blend'

# Layout (mirrors src/world/layout.ts).
T = 0.15
Z_NF, Z_CN, Z_CS, Z_SF, Z_SB = -1.55, -1.4, 1.4, 1.55, 6.4
CEIL_ROOM, CEIL_COR = 2.75, 2.7
R104 = (-15.6 + T / 2, -11.2 - T / 2)          # interior x range
DOOR_W, DOOR_H = 1.2, 2.1
DOORS_N = {'101': -16.4, '103': -12.0, '105': -7.6}
DOORS_S = {'102': -16.4, '104': -12.0, '106': -7.6}
COR_X = (-20.0, -0.2)
# NW-005A: the set runs on to the station. Corridor openings per side: (from, to, bottom, top).
OPEN_N = [(x - 0.6, x + 0.6, 0.0, 2.1) for x in DOORS_N.values()] + [(-6.4, -0.2, 0.0, 2.3)]          # + station counter
OPEN_S = [(x - 0.6, x + 0.6, 0.0, 2.1) for x in list(DOORS_S.values()) + [-1.0]] + [(-6.725, -4.675, 0.0, 2.4)]  # + 108, connector
HALF_PI = math.pi / 2

nw.reset()
SHELL = nw.collection('shell')
PROPS = nw.collection('props')
WHEEL = nw.collection('wheelchair')
DECALS = nw.collection('decals')
OCCLUDERS = nw.collection('occluders')
DOORLEAF = nw.collection('doorleaf')
PICKUPS = nw.collection('pickups')

# ---------------------------------------------------------------------------------------------
# Materials. Shell materials are tiling image materials (UV in metres / tile size). Props use
# procedural PBR materials and are baked into one atlas later.


def tex(name):
    return os.path.join(TEX, name)


M_FLOOR = nw.image_material('floor_vinyl', tex('floor_vinyl_albedo.jpg'), tex('floor_vinyl_normal.jpg'), tex('floor_vinyl_orm.jpg'))
M_WALL = nw.image_material('wall_paint', tex('wall_paint_albedo.jpg'), tex('wall_paint_normal.jpg'), tex('wall_paint_orm.jpg'))
M_WAINSCOT = nw.image_material('wainscot', tex('wainscot_albedo.jpg'), tex('wainscot_normal.jpg'), tex('wainscot_orm.jpg'))
M_CEIL = nw.image_material('ceiling_tile', tex('ceiling_tile_albedo.jpg'), tex('ceiling_tile_normal.jpg'), tex('ceiling_tile_orm.jpg'))
M_RAIL = nw.image_material('wood_rail', tex('wood_rail_albedo.jpg'), tex('wood_rail_normal.jpg'), tex('wood_rail_orm.jpg'))
M_SIGN = nw.image_material('signage', tex('signage.jpg'), rough_value=0.35)
M_VENEER = nw.image_material('door_veneer', tex('door_veneer_albedo.jpg'), tex('door_veneer_normal.jpg'), tex('door_veneer_orm.jpg'))
M_LABELS = op.labels_material(tex)
M_CLABELS = nw.image_material('corridor_labels', tex('corridor_labels.jpg'), rough_value=0.5)
M_DECAL = nw.image_material('decals', tex('decals.png'), rough_value=0.8, alpha_blend=True, emissive=tex('decals_glow.jpg'), emissive_strength=1.0)

P = {
    'steel': nw.pbr('steel', (0.55, 0.56, 0.57), rough=0.42, metal=1.0, grime=0.35, bump=0.05, wear_color=(0.42, 0.28, 0.16), wear=0.08),
    'chrome': nw.pbr('chrome', (0.85, 0.86, 0.88), rough=0.16, metal=1.0, grime=0.25, bump=0.02),
    'beige': nw.pbr('beige_hpl', (0.72, 0.66, 0.55), rough=0.48, grime=0.3, bump=0.04, speck=0.15, wear_color=(0.45, 0.4, 0.33), wear=0.06),
    'white': nw.pbr('white_abs', (0.82, 0.82, 0.79), rough=0.4, grime=0.28, bump=0.03),
    'mattress': nw.pbr('mattress_vinyl', (0.18, 0.27, 0.36), rough=0.38, grime=0.35, bump=0.12, bump_scale=60.0, wear_color=(0.3, 0.32, 0.3), wear=0.05),
    'linen': nw.pbr('linen', (0.80, 0.80, 0.76), rough=0.9, grime=0.35, grime_scale=3.0, weave=1.0, bump=0.25, streaks=0.12),
    'blanket': nw.pbr('blanket', (0.36, 0.45, 0.55), rough=0.95, grime=0.3, weave=1.0, bump=0.35),
    'rubber': nw.pbr('rubber', (0.05, 0.05, 0.05), rough=0.75, grime=0.1, bump=0.08),
    'laminate': nw.pbr('laminate_beech', (0.62, 0.48, 0.33), rough=0.35, grime=0.25, bump=0.03, wear_color=(0.5, 0.42, 0.32), wear=0.05),
    'ceramic': nw.pbr('ceramic', (0.86, 0.86, 0.84), rough=0.12, grime=0.3, clearcoat=0.6, bump=0.01, streaks=0.2),
    'tile': nw.pbr('wall_tile', (0.78, 0.82, 0.8), rough=0.18, grime=0.35, bump=0.02),
    'grout': nw.pbr('grout', (0.32, 0.31, 0.28), rough=0.9, grime=0.5),
    'glass': nw.pbr('glass_dark', (0.03, 0.035, 0.04), rough=0.06, metal=0.6, grime=0.2, bump=0.0),
    'mirror': nw.pbr('mirror', (0.78, 0.8, 0.8), rough=0.03, metal=1.0, grime=0.12, grime_scale=3.0, bump=0.0),
    'plastic_clear': nw.pbr('pvc_clear', (0.75, 0.8, 0.82), rough=0.25, grime=0.3, bump=0.02),
    'red': nw.pbr('signal_red', (0.55, 0.06, 0.05), rough=0.4, grime=0.2),
    'green': nw.pbr('o2_green', (0.1, 0.45, 0.2), rough=0.4, grime=0.2),
    'yellow': nw.pbr('vac_yellow', (0.75, 0.6, 0.1), rough=0.4, grime=0.2),
    'vinyl_black': nw.pbr('vinyl_black', (0.04, 0.045, 0.05), rough=0.5, grime=0.15, bump=0.15, bump_scale=40.0),
    'leather': nw.pbr('restraint_leather', (0.22, 0.13, 0.08), rough=0.6, grime=0.35, bump=0.3),
    'paper': nw.pbr('paper', (0.85, 0.83, 0.76), rough=0.9, grime=0.3, streaks=0.2),
    'pill': nw.pbr('pills', (0.9, 0.85, 0.6), rough=0.5, grime=0.1),
    'enamel': nw.pbr('enamel_white', (0.88, 0.88, 0.86), rough=0.3, grime=0.25),
    'dark': nw.pbr('void', (0.01, 0.01, 0.01), rough=1.0, grime=0.0),
    'skirting': nw.pbr('skirting_vinyl', (0.11, 0.17, 0.17), rough=0.45, grime=0.3),
    # NW-005A door kit, curtain.
    'frame': nw.pbr('frame_gloss', (0.74, 0.74, 0.69), rough=0.3, grime=0.45, grime_scale=4.0, bump=0.03, wear_color=(0.42, 0.33, 0.24), wear=0.12, streaks=0.1),
    'bead': nw.pbr('bead_paint', (0.62, 0.6, 0.55), rough=0.35, grime=0.4, bump=0.03),
    'lipping': nw.pbr('lipping_beech', (0.5, 0.36, 0.22), rough=0.4, grime=0.35, bump=0.03, wear_color=(0.3, 0.22, 0.14), wear=0.15),
    'fascia': nw.pbr('fascia_hpl', (0.16, 0.3, 0.3), rough=0.42, grime=0.4, grime_scale=4.0, bump=0.03, wear_color=(0.32, 0.38, 0.36), wear=0.1, streaks=0.12),
    'corian': nw.pbr('solid_surface', (0.8, 0.78, 0.72), rough=0.32, grime=0.35, bump=0.02, speck=0.1, wear_color=(0.6, 0.56, 0.5), wear=0.08),
    'seat_vinyl': nw.pbr('seat_vinyl', (0.12, 0.3, 0.36), rough=0.42, grime=0.35, bump=0.12, bump_scale=50.0, wear_color=(0.25, 0.3, 0.3), wear=0.12),
    'void_foam': nw.pbr('foam', (0.7, 0.62, 0.4), rough=0.95, grime=0.4, bump=0.4),
    'grey_abs': nw.pbr('grey_abs', (0.35, 0.36, 0.37), rough=0.45, grime=0.25),
    'safety_yellow': nw.pbr('safety_yellow', (0.8, 0.62, 0.05), rough=0.45, grime=0.35, wear_color=(0.4, 0.35, 0.2), wear=0.1),
    'apron_white': nw.pbr('apron_film', (0.88, 0.9, 0.9), rough=0.3, grime=0.2, bump=0.1),
    'nitrile': nw.pbr('nitrile_blue', (0.12, 0.26, 0.62), rough=0.55, grime=0.2, bump=0.1),
    'insulation': nw.pbr('insulation', (0.62, 0.55, 0.4), rough=1.0, grime=0.6, grime_scale=9.0, bump=0.8, bump_scale=45.0, speck=0.3, wear_color=(0.2, 0.17, 0.13), wear=0.25, streaks=0.2),
    'polythene': nw.pbr('polythene', (0.5, 0.52, 0.5), rough=0.35, grime=0.5, grime_scale=5.0, bump=0.1, streaks=0.3),
    'foil': nw.pbr('foil_backing', (0.5, 0.5, 0.48), rough=0.4, metal=0.6, grime=0.5, bump=0.25, bump_scale=30.0),
    'cable_grey': nw.pbr('cable_grey', (0.42, 0.43, 0.42), rough=0.55, grime=0.3),
    'shard': nw.pbr('glass_shard', (0.5, 0.56, 0.56), rough=0.08, grime=0.15, bump=0.0),
    'pill_white': nw.pbr('pill_white', (0.86, 0.84, 0.8), rough=0.6, grime=0.15),
    'slipper': nw.pbr('slipper_felt', (0.44, 0.54, 0.7), rough=0.95, grime=0.45, weave=1.0, bump=0.3),
    'curtain': nw.pbr('curtain_print', (0.42, 0.55, 0.62), rough=0.92, grime=0.35, grime_scale=3.0, weave=1.0, bump=0.3, streaks=0.15),
}


# ---------------------------------------------------------------------------------------------
# Prop framing: build in prop-local game coordinates under an empty placed at the game Place.


class Prop:
    def __init__(self, name, x, z, yaw, col=PROPS, y=0.0):
        self.empty = bpy.data.objects.new(name, None)
        col.objects.link(self.empty)
        self.empty.location = g(x, y, z)
        self.empty.rotation_euler = (0, 0, yaw)
        self.col = col
        self.parts = []
        self.name = name

    def add(self, ob):
        ob.parent = self.empty
        self.parts.append(ob)
        return ob

    def box(self, mat, size, center, yaw=0.0, bevel=0.006, rot=(0, 0, 0), segments=2):
        return self.add(nw.box(f'{self.name}.b', self.col, size, center, yaw=yaw, mat=P[mat] if isinstance(mat, str) else mat, bevel=bevel, segments=segments, rot=rot))

    def cyl(self, mat, r, h, center, axis='y', verts=16, yaw=0.0, r2=None):
        return self.add(nw.cylinder(f'{self.name}.c', self.col, r, h, center, axis=axis, mat=P[mat], verts=verts, yaw=yaw, radius2=r2))

    def tube(self, mat, pts, r, res=6):
        ob = nw.tube(f'{self.name}.t', self.col, pts, r, mat=P[mat], resolution=res)
        return self.add(ob)

    def finish(self):
        """Apply the empty's transform into the parts and return the joined object."""
        # Parenting does not refresh matrix_world until the depsgraph evaluates: without this,
        # parts added just before finish() keep their *local* matrix and land near the origin.
        bpy.context.view_layer.update()
        for ob in self.parts:
            mw = ob.matrix_world.copy()
            ob.parent = None
            ob.matrix_world = mw
        nw.select_only(self.parts)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        joined = nw.join(self.parts, self.name)
        bpy.data.objects.remove(self.empty)
        return joined


def caster(p, x, z, wheel=0.0625):
    p.box('steel', (0.05, 0.06, 0.03), (x, 2 * wheel + 0.03, z), bevel=0.004)
    p.box('steel', (0.006, wheel * 1.6, 0.05), (x - 0.02, wheel + 0.01, z), bevel=0.002)
    p.box('steel', (0.006, wheel * 1.6, 0.05), (x + 0.02, wheel + 0.01, z), bevel=0.002)
    p.cyl('rubber', wheel, 0.03, (x, wheel, z), axis='x', verts=18)


# ---------------------------------------------------------------------------------------------
# Room 104 furniture (placements copied from patientRooms.ts room104()).


def bed():
    """Electric profiling bed, unmade: sheets torn back and dragged off, pillow on the floor."""
    L, W = 2.05, 0.95
    p = Prop('bed', -14.25, Z_SB - 1.05, math.pi)
    for x, z in ((-W / 2 + 0.08, -L / 2 + 0.1), (W / 2 - 0.08, -L / 2 + 0.1), (-W / 2 + 0.08, L / 2 - 0.1), (W / 2 - 0.08, L / 2 - 0.1)):
        caster(p, x, z)
    # Chassis: perimeter tube frame, lift column and scissor arms.
    for side in (-1, 1):
        p.box('steel', (0.04, 0.05, L - 0.2), (side * (W / 2 - 0.1), 0.2, 0), bevel=0.008)
        p.box('steel', (0.03, 0.03, 0.95), (side * 0.12, 0.25, 0.1), rot=(0.32 * side, 0, 0), bevel=0.004)
    for z in (-L / 2 + 0.1, L / 2 - 0.1):
        p.box('steel', (W - 0.16, 0.05, 0.04), (0, 0.2, z), bevel=0.008)
    p.box('steel', (0.14, 0.24, 0.5), (0, 0.24, 0.05), bevel=0.02)
    p.box('rubber', (0.1, 0.04, 0.12), (0, 0.39, -0.25), bevel=0.008)
    # Mattress platform: four laminate sections, the back section raised.
    p.box('steel', (W - 0.08, 0.04, L - 0.12), (0, 0.33, 0), bevel=0.008)
    p.box('beige', (W - 0.04, 0.03, 0.75), (0, 0.42, 0.55), bevel=0.01)
    p.box('beige', (W - 0.04, 0.03, 0.28), (0, 0.42, 0.02), bevel=0.01)
    p.box('beige', (W - 0.04, 0.03, 0.7), (0, 0.5, -0.62), rot=(-0.22, 0, 0), bevel=0.01)
    # Mattress: foam in wipe-clean vinyl, two pieces following the platform (back raised).
    m1 = p.box('mattress', (W - 0.1, 0.15, 1.12), (0, 0.515, 0.38), bevel=0.04, segments=4)
    m2 = p.box('mattress', (W - 0.1, 0.15, 0.78), (0, 0.6, -0.58), rot=(-0.22, 0, 0), bevel=0.04, segments=4)
    for m in (m1, m2):
        sub = m.modifiers.new('sub', 'SUBSURF')
        sub.levels = 1
        nw.apply_all(m)
    # Headboard and footboard: HPL panels with grab cut-outs, chrome trim.
    p.box('beige', (W, 0.6, 0.045), (0, 0.78, -L / 2 + 0.02), bevel=0.02, segments=4)
    p.box('rubber', (0.3, 0.06, 0.05), (0, 0.98, -L / 2 + 0.02), bevel=0.02)
    p.box('beige', (W, 0.42, 0.045), (0, 0.66, L / 2 - 0.02), bevel=0.02, segments=4)
    p.tube('chrome', [(-W / 2 + 0.06, 0.82, L / 2 - 0.02), (0, 0.88, L / 2 - 0.02), (W / 2 - 0.06, 0.82, L / 2 - 0.02)], 0.014)
    # Split side rails (head end), down position 0.56; one rail hangs loose on the window side.
    for side in (-1, 1):
        x = side * (W / 2 + 0.01)
        for y in (0.56, 0.44):
            p.cyl('chrome', 0.0125, L * 0.42, (x, y, -L * 0.18), axis='z', verts=10)
        for z in (-L * 0.36, 0.0):
            p.box('beige', (0.03, 0.18, 0.03), (x, 0.5, z), bevel=0.008)
        p.box('beige', (0.035, 0.05, 0.3), (x, 0.5, L * 0.15), bevel=0.01)
    # Chart clipboard hooked on the footboard.
    p.box('beige', (0.24, 0.32, 0.008), (0.22, 0.68, L / 2 + 0.012), bevel=0.003)
    p.box('paper', (0.21, 0.27, 0.002), (0.22, 0.665, L / 2 + 0.018), bevel=0.0)
    # Padded restraint cuff buckled to the rail, its strap torn through.
    p.box('leather', (0.12, 0.06, 0.03), (W / 2 + 0.04, 0.47, -0.3), bevel=0.012)
    p.tube('leather', [(W / 2 + 0.03, 0.5, -0.3), (W / 2 + 0.08, 0.4, -0.25), (W / 2 + 0.1, 0.25, -0.22)], 0.012)
    ob = p.finish()
    return ob


def bedding():
    """Cloth-simulated sheet and blanket: thrown back off the bed and dragged to the floor."""
    col = PROPS
    # Collision proxies (bed top in world, rotated with the bed) + floor.
    cx, cz = -14.25, Z_SB - 1.05
    coll = [nw.box('c.mat1', OCCLUDERS, (0.85, 0.15, 1.12), (cx, 0.515, cz - 0.38)),
            nw.box('c.mat2', OCCLUDERS, (0.85, 0.15, 0.78), (cx, 0.6, cz + 0.58), rot=(0.22, 0, 0)),
            nw.box('c.floor', OCCLUDERS, (4, 0.1, 5), (cx, -0.05, cz)),
            nw.box('c.cab', OCCLUDERS, (0.47, 0.8, 0.47), (-15.2, 0.4, 5.95))]
    for c in coll:
        c.modifiers.new('coll', 'COLLISION')
        c.collision.thickness_outer = 0.006
        c.collision.cloth_friction = 9
    sheet = nw.plane('sheet', col, 1.6, 2.1, (cx + 0.32, 0.9, cz - 0.2), mat=P['linen'], cuts=48)
    blanket = nw.plane('blanket', col, 1.3, 1.0, (cx + 0.05, 1.15, cz - 0.55), mat=P['blanket'], cuts=30)
    for ob, mass in ((sheet, 0.25), (blanket, 0.6)):
        ob.rotation_euler = (0, 0.12 if ob is sheet else -0.25, 0.08)
        cm = ob.modifiers.new('cloth', 'CLOTH')
        cm.settings.quality = 6
        cm.settings.mass = mass
        cm.settings.tension_stiffness = 12
        cm.settings.bending_stiffness = 0.15 if ob is sheet else 1.5
        cm.collision_settings.use_self_collision = True
        cm.collision_settings.distance_min = 0.004
        cm.point_cache.frame_end = 90
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 1, 90
    for f in range(1, 91):
        scene.frame_set(f)
    for ob in (sheet, blanket):
        sol = ob.modifiers.new('solid', 'SOLIDIFY')
        sol.thickness = 0.004
        nw.select_only([ob])
        for m in list(ob.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)
        bpy.ops.object.shade_smooth()
    scene.frame_set(1)
    for c in coll:
        bpy.data.objects.remove(c)
    # Pillow, fallen on the floor by the bed, squashed.
    pillow = nw.box('pillow', col, (0.62, 0.14, 0.4), (-13.45, 0.07, 4.65), yaw=0.5, mat=P['linen'], bevel=0.06, segments=4)
    sub = pillow.modifiers.new('sub', 'SUBSURF')
    sub.levels = 2
    disp_tex = bpy.data.textures.new('pillow_noise', 'CLOUDS')
    disp_tex.noise_scale = 0.12
    d = pillow.modifiers.new('disp', 'DISPLACE')
    d.texture = disp_tex
    d.strength = 0.02
    nw.apply_all(pillow)
    pillow.scale.z = 0.75
    return [sheet, blanket, pillow]


def bedside_cabinet():
    p = Prop('cabinet', -15.2, 5.95, math.pi)
    p.box('beige', (0.45, 0.62, 0.43), (0, 0.39, -0.01), bevel=0.01)
    p.box('laminate', (0.47, 0.03, 0.47), (0, 0.775, 0), bevel=0.008)
    p.box('beige', (0.42, 0.42, 0.015), (0, 0.29, 0.215), bevel=0.005)
    p.box('chrome', (0.12, 0.012, 0.02), (0, 0.46, 0.23), bevel=0.004)
    # Drawer pulled out: box with front, contents spilling.
    p.box('beige', (0.4, 0.13, 0.4), (0, 0.66, 0.3), bevel=0.006)
    p.box('dark', (0.37, 0.005, 0.37), (0, 0.72, 0.3), bevel=0.0)
    p.box('beige', (0.43, 0.15, 0.018), (0, 0.66, 0.505), bevel=0.006)
    p.box('chrome', (0.12, 0.012, 0.02), (0, 0.68, 0.52), bevel=0.004)
    for x, z in ((-0.18, -0.18), (0.18, -0.18), (-0.18, 0.18), (0.18, 0.18)):
        p.cyl('rubber', 0.03, 0.025, (x, 0.03, z), axis='x', verts=12)
    # On top: plastic cup, kidney dish, tipped pill bottle with pills.
    p.cyl('plastic_clear', 0.038, 0.11, (-0.12, 0.845, -0.08), verts=14, r2=0.032)
    p.box('white', (0.22, 0.03, 0.11), (0.06, 0.805, -0.1), yaw=0.3, bevel=0.012)
    p.cyl('white', 0.022, 0.07, (0.1, 0.81, 0.08), axis='x', verts=12)
    for i in range(7):
        a = i * 1.7
        p.box('pill', (0.012, 0.006, 0.006), (0.15 + 0.04 * math.cos(a) * (1 + i * 0.25), 0.794, 0.1 + 0.03 * math.sin(a) * (1 + i * 0.2)), yaw=a, bevel=0.002)
    return p.finish()


def overbed_table():
    p = Prop('overbed', -13.2, 5.6, math.pi + 0.4)
    p.box('steel', (0.06, 0.04, 0.62), (-0.38, 0.06, 0), bevel=0.008)
    p.box('steel', (0.5, 0.04, 0.06), (-0.15, 0.06, 0.28), bevel=0.008)
    for x, z in ((-0.38, -0.28), (-0.38, 0.28), (0.08, 0.28)):
        caster(p, x, z, wheel=0.035)
    p.box('steel', (0.05, 0.78, 0.05), (-0.38, 0.47, 0), bevel=0.006)
    p.box('steel', (0.04, 0.05, 0.3), (-0.38, 0.84, 0), bevel=0.006)
    p.box('laminate', (0.85, 0.025, 0.4), (-0.02, 0.875, 0), bevel=0.008)
    p.box('beige', (0.87, 0.03, 0.42), (-0.02, 0.855, 0), bevel=0.01)
    # Untouched meal tray: cup, lidded plate, cutlery.
    p.box('white', (0.36, 0.015, 0.26), (0.12, 0.895, 0.02), yaw=0.15, bevel=0.01)
    p.cyl('white', 0.1, 0.03, (0.18, 0.915, 0.04), verts=20, r2=0.085)
    p.cyl('plastic_clear', 0.035, 0.1, (-0.22, 0.94, -0.08), verts=14, r2=0.03)
    p.box('chrome', (0.008, 0.004, 0.17), (0.03, 0.905, 0.05), yaw=0.2, bevel=0.0)
    return p.finish()


def iv_stand():
    """Tipped over: five-star base, pole on the floor, empty bag and line coiled beside it."""
    p = Prop('iv', -13.2, 4.6, 2.6)
    p.cyl('chrome', 0.0125, 1.9, (0, 0.06, 0), axis='x', verts=10)
    # Base at the -x end, standing on edge after the fall.
    base = Vector((-0.95, 0.295, 0))  # star base resting on its edge: lowest castor on the floor
    for i in range(5):
        a = i / 5 * 2 * math.pi
        dx, dz = math.cos(a) * 0.14, math.sin(a) * 0.14
        p.box('steel', (0.04, 0.28, 0.025), (base.x, base.y + dz, base.z + dx), rot=(a, 0, 0), bevel=0.006)
        p.cyl('rubber', 0.025, 0.02, (base.x - 0.02, base.y + math.sin(a) * 0.28, base.z + math.cos(a) * 0.28), axis='x', verts=10)
    # Top hooks: the pole lies on its side, so the hook arms lie flat on the floor.
    for side in (-1, 1):
        p.box('chrome', (0.008, 0.008, 0.14), (0.95, 0.03, side * 0.07), bevel=0.0)
        p.box('chrome', (0.008, 0.04, 0.008), (0.95, 0.05, side * 0.14), bevel=0.0)
    # Empty bag and line.
    p.box('plastic_clear', (0.14, 0.012, 0.22), (0.62, 0.012, 0.32), yaw=0.4, bevel=0.01)
    p.tube('plastic_clear', [(0.62, 0.02, 0.2), (0.4, 0.01, 0.1), (0.2, 0.01, 0.35), (0.35, 0.01, 0.55), (0.0, 0.01, 0.5)], 0.003)
    return p.finish()


def wardrobe():
    p = Prop('wardrobe', -11.6, 5.95, -HALF_PI)
    p.box('laminate', (0.6, 1.9, 0.02), (0, 0.95, -0.265), bevel=0.003)
    for x in (-0.29, 0.29):
        p.box('laminate', (0.02, 1.9, 0.55), (x, 0.95, 0), bevel=0.003)
    for y in (0.01, 1.89):
        p.box('laminate', (0.6, 0.02, 0.55), (0, y, 0), bevel=0.003)
    p.box('dark', (0.56, 1.86, 0.004), (0, 0.95, -0.252), bevel=0.0)
    # Open door hinged at +x, swung out.
    door = p.box('laminate', (0.3, 1.86, 0.02), (0.43, 0.95, 0.4), yaw=-1.1, bevel=0.004)
    p.cyl('steel', 0.008, 0.54, (0, 1.7, 0), axis='x', verts=8)
    # A patient gown left on a hanger, a hanger fallen, slippers' box.
    p.tube('steel', [(-0.1, 1.7, 0.0), (-0.1, 1.64, 0.0), (-0.22, 1.56, 0.0), (0.02, 1.56, 0.0), (-0.1, 1.64, 0.0)], 0.003)
    gown = p.box('linen', (0.42, 0.85, 0.05), (-0.1, 1.12, 0.02), bevel=0.02, segments=3)
    p.box('linen', (0.4, 0.04, 0.3), (0.05, 0.04, 0.05), yaw=0.3, bevel=0.015)
    p.tube('steel', [(0.1, 0.03, -0.15), (0.2, 0.05, -0.1), (0.25, 0.03, 0.0)], 0.003)
    return p.finish()


def sink_unit():
    p = Prop('sink', -11.275, 4.3, -HALF_PI)
    # Splashback: 100 mm tiles with grout.
    p.box('grout', (0.8, 0.6, 0.008), (0, 1.1, 0.004), bevel=0.0)
    for i in range(8):
        for j in range(6):
            p.box('tile', (0.096, 0.096, 0.006), (-0.35 + i * 0.1, 0.85 + j * 0.1, 0.011), bevel=0.003)
    # Basin: ceramic shell with a dished bowl (cut from a bevelled block via a shrunken copy).
    basin = p.box('ceramic', (0.55, 0.16, 0.42), (0, 0.82, 0.21), bevel=0.04, segments=4)
    cutter = nw.cylinder('bowl_cut', PROPS, 1.0, 1.0, (0, 0, 0), verts=40)
    bm_sphere = bpy.data.meshes.new('bowl')
    import bmesh as _bm
    bb = _bm.new()
    _bm.ops.create_uvsphere(bb, u_segments=40, v_segments=20, radius=1.0)
    bb.to_mesh(bm_sphere)
    bb.free()
    cutter.data = bm_sphere
    cutter.data.materials.append(P['ceramic'])  # the carved faces stay ceramic (no empty slot)
    cutter.scale = (0.2, 0.13, 0.11)
    cutter.location = g(0, 0.915, 0.235)
    cutter.parent = p.empty
    bpy.context.view_layer.update()
    mod = basin.modifiers.new('bowl', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = cutter
    mod.solver = 'EXACT'
    nw.apply_all(basin)
    bpy.data.objects.remove(cutter)
    p.cyl('chrome', 0.022, 0.004, (0, 0.807, 0.235), verts=14)
    # Mixer tap with a lever.
    p.cyl('chrome', 0.022, 0.06, (0, 0.93, 0.07), verts=14)
    p.tube('chrome', [(0, 0.96, 0.07), (0, 1.05, 0.08), (0, 1.06, 0.15), (0, 1.0, 0.2)], 0.011)
    p.box('chrome', (0.015, 0.012, 0.12), (0, 1.0, 0.04), rot=(0.4, 0, 0), bevel=0.004)
    # Waste trap.
    p.tube('chrome', [(0, 0.74, 0.24), (0, 0.6, 0.24), (0, 0.5, 0.18), (0, 0.55, 0.06), (0, 0.55, 0.0)], 0.02)
    # Mirror: brushed steel frame, glass (the game's mirror record stays at z 0.034).
    p.box('steel', (0.52, 0.72, 0.02), (0, 1.55, 0.015), bevel=0.006)
    p.box('mirror', (0.46, 0.66, 0.006), (0, 1.55, 0.029), bevel=0.0)
    # Soap and paper-towel dispensers.
    p.box('white', (0.28, 0.32, 0.11), (0.55, 1.35, 0.06), bevel=0.02, segments=3)
    p.box('dark', (0.2, 0.012, 0.02), (0.55, 1.2, 0.11), bevel=0.0)
    p.box('plastic_clear', (0.1, 0.2, 0.08), (-0.42, 1.25, 0.045), bevel=0.015, segments=3)
    p.box('white', (0.04, 0.03, 0.04), (-0.42, 1.13, 0.06), bevel=0.008)
    return p.finish()


def headwall():
    p = Prop('headwall', -14.25, Z_SB, math.pi)
    p.box('beige', (1.6, 0.26, 0.08), (0, 1.45, 0.04), bevel=0.012, segments=3)
    p.box('white', (1.6, 0.04, 0.09), (0, 1.6, 0.045), bevel=0.008)
    for x, mat in ((-0.45, 'green'), (-0.35, 'white'), (-0.25, 'yellow')):
        p.cyl('chrome', 0.03, 0.02, (x, 1.45, 0.09), axis='z', verts=16)
        p.cyl(mat, 0.02, 0.015, (x, 1.45, 0.1), axis='z', verts=16)
    p.box('white', (0.08, 0.08, 0.02), (0.35, 1.45, 0.09), bevel=0.006)
    p.box('red', (0.05, 0.05, 0.02), (0.5, 1.45, 0.09), bevel=0.008)
    p.tube('white', [(0.5, 1.4, 0.1), (0.52, 1.1, 0.13), (0.55, 0.88, 0.15)], 0.004)
    p.box('red', (0.04, 0.06, 0.04), (0.55, 0.85, 0.15), bevel=0.01)
    return p.finish()


def vitals_monitor():
    p = Prop('monitor', -13.4, Z_SB, math.pi)
    p.box('steel', (0.08, 0.12, 0.02), (0, 1.75, 0.01), bevel=0.004)
    p.box('steel', (0.05, 0.05, 0.3), (0, 1.75, 0.15), bevel=0.008)
    p.box('beige', (0.36, 0.3, 0.14), (0, 1.75, 0.35), rot=(-0.15, 0, 0), bevel=0.02, segments=3)
    p.box('glass', (0.3, 0.22, 0.004), (0, 1.755, 0.423), rot=(-0.15, 0, 0), bevel=0.0)
    p.tube('rubber', [(0.12, 1.62, 0.3), (0.18, 1.3, 0.2), (0.16, 1.0, 0.15)], 0.005)
    p.tube('rubber', [(-0.1, 1.62, 0.32), (-0.2, 1.2, 0.3), (-0.12, 0.9, 0.22)], 0.004)
    return p.finish()


def tv_body():
    """Wall-arm TV around the procedural screen (that mesh stays: the horror module drives it)."""
    p = Prop('tv', -15.525, 2.75, HALF_PI)
    p.box('rubber', (0.12, 0.16, 0.03), (0, 2.05, 0.015), bevel=0.006)
    p.box('steel', (0.04, 0.04, 0.38), (0, 2.05, 0.21), bevel=0.006)
    # Back shell + bezel ring; the screen plane sits at local z 0.492.
    p.box('rubber', (0.6, 0.38, 0.05), (0, 2.0, 0.44), rot=(-0.18, 0, 0), bevel=0.012, segments=3)
    for (sx, sy, x, y) in ((0.62, 0.025, 0, 0.1875), (0.62, 0.025, 0, -0.1875), (0.025, 0.4, 0.3075, 0), (0.025, 0.4, -0.3075, 0)):
        ob = p.box('rubber', (sx, sy, 0.03), (x, 2.0 + y, 0.475), bevel=0.004)
    return p.finish()


def clock_dial(name, x, y, z, facing=1):
    """Dial on the signage atlas (cell 6), 7 mm proud of the clock body; facing +1 looks +z."""
    dial = nw.cylinder(name, PROPS, 0.155, 0.002, g(0, 0, 0), axis='z', mat=M_SIGN, verts=40)
    dial.rotation_euler = (math.pi / 2, 0, 0 if facing > 0 else math.pi)
    dial.location = g(x, y, z)
    nw.select_only([dial])
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    me = dial.data
    uv = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            u = ((co.x - x) * facing) / 0.31 + 0.5
            v = (co.z - y) / 0.31 + 0.5
            uv.data[li].uv = (u * 0.25, (1 - 0.75 - 0.25) + v * 0.25)
    return dial


def wall_clock():
    p = Prop('clock', -13.4, Z_SF, 0.0)
    p.cyl('white', 0.17, 0.05, (0, 2.2, 0.025), axis='z', verts=40)
    ob = p.finish()
    return [ob, clock_dial('clock_dial', -13.4, 2.2, Z_SF + 0.057)]


def troffer_housing(x, z, ceiling, name):
    """Recessed lay-in troffer frame; the procedural emissive panel sits 16 mm below the ceiling."""
    p = Prop(name, x, z, 0.0, y=0.0)
    for (sx, sz, ox, oz) in ((1.2, 0.03, 0, 0.285), (1.2, 0.03, 0, -0.285), (0.03, 0.6, 0.585, 0), (0.03, 0.6, -0.585, 0)):
        p.box('enamel', (sx, 0.02, sz), (ox, ceiling - 0.012, oz), bevel=0.003)
    p.box('enamel', (1.14, 0.004, 0.54), (0, ceiling - 0.002, 0), bevel=0.0)
    return p.finish()


# ---------------------------------------------------------------------------------------------
# Wheelchair (separate: swapped into the procedural creep-anomaly group at runtime). Built in the
# group's local frame (front +Z); exported at the origin.


def wheelchair():
    p = Prop('wheelchair', 0, 0, 0, col=WHEEL)
    for side in (-1, 1):
        x = side * 0.3
        # Rear wheel: tyre, rim, spokes, push rim, hub.
        tyre = p.add(nw.cylinder('tyre', WHEEL, 0.3, 0.03, (x, 0.31, -0.05), axis='x', mat=P['rubber'], verts=36))
        tyre.modifiers.new('bevel', 'BEVEL').width = 0.012
        nw.apply_all(tyre)
        p.cyl('chrome', 0.27, 0.012, (x, 0.31, -0.05), axis='x', verts=36)
        for k in range(12):
            a = k / 12 * math.pi
            p.box('chrome', (0.003, 0.52, 0.003), (x, 0.31, -0.05), rot=(a, 0, 0), bevel=0.0)
        p.cyl('chrome', 0.035, 0.07, (x, 0.31, -0.05), axis='x', verts=14)
        pr = p.add(nw.cylinder('pushrim', WHEEL, 0.255, 0.012, (x + side * 0.04, 0.31, -0.05), axis='x', mat=P['chrome'], verts=36, cap=False))
        # Frame.
        p.box('chrome', (0.025, 0.025, 0.55), (side * 0.22, 0.52, 0.05), bevel=0.006)
        p.box('chrome', (0.025, 0.55, 0.025), (side * 0.22, 0.75, -0.2), rot=(0.15, 0, 0), bevel=0.006)
        p.box('chrome', (0.025, 0.4, 0.025), (side * 0.22, 0.3, 0.3), bevel=0.006)
        p.box('chrome', (0.025, 0.025, 0.5), (side * 0.22, 0.12, 0.05), bevel=0.006)
        p.box('vinyl_black', (0.05, 0.03, 0.3), (side * 0.24, 0.72, 0.02), bevel=0.01)
        p.box('chrome', (0.02, 0.2, 0.02), (side * 0.24, 0.62, -0.1), bevel=0.004)
        p.box('chrome', (0.02, 0.2, 0.02), (side * 0.24, 0.62, 0.14), bevel=0.004)
        p.box('vinyl_black', (0.03, 0.03, 0.12), (side * 0.22, 1.0, -0.28), rot=(0.15, 0, 0), bevel=0.01)
        # Front castor and footplate.
        p.box('chrome', (0.008, 0.1, 0.04), (side * 0.22, 0.1, 0.32), bevel=0.002)
        p.cyl('rubber', 0.06, 0.025, (side * 0.22, 0.06, 0.32), axis='x', verts=16)
        p.box('vinyl_black', (0.14, 0.012, 0.16), (side * 0.12, 0.12, 0.42), rot=(0.3, 0, 0), bevel=0.004)
        p.box('chrome', (0.02, 0.32, 0.02), (side * 0.2, 0.28, 0.38), rot=(-0.35, 0, 0), bevel=0.004)
    # Sling seat and back.
    p.box('vinyl_black', (0.44, 0.02, 0.44), (0, 0.5, 0.05), bevel=0.01)
    p.box('vinyl_black', (0.44, 0.42, 0.02), (0, 0.76, -0.22), rot=(0.15, 0, 0), bevel=0.01)
    return p.finish()


# ---------------------------------------------------------------------------------------------
# Shell: Room 104 and the west corridor.


def room_shell():
    x0, x1 = R104
    objs = []
    floor = nw.plane('r104_floor', SHELL, x1 - x0, Z_SB - Z_SF, ((x0 + x1) / 2, 0.003, (Z_SF + Z_SB) / 2), mat=M_FLOOR)
    ceil = nw.plane('r104_ceiling', SHELL, x1 - x0, Z_SB - Z_SF, ((x0 + x1) / 2, CEIL_ROOM - 0.003, (Z_SF + Z_SB) / 2), normal='-y', mat=M_CEIL)
    objs += [floor, ceil]
    door = [(-12.0 - DOOR_W / 2, -12.0 + DOOR_W / 2, 0.0, DOOR_H)]
    objs.append(nw.wall_skin('r104_wall_n', SHELL, 'x', Z_SF, x0, x1, 0.1, CEIL_ROOM, +1, door, M_WALL))
    objs.append(nw.wall_skin('r104_wall_s', SHELL, 'x', Z_SB, x0, x1, 0.1, CEIL_ROOM, -1, [], M_WALL))
    objs.append(nw.wall_skin('r104_wall_w', SHELL, 'z', x0, Z_SF, Z_SB, 0.1, CEIL_ROOM, +1, [], M_WALL))
    objs.append(nw.wall_skin('r104_wall_e', SHELL, 'z', x1, Z_SF, Z_SB, 0.1, CEIL_ROOM, -1, [], M_WALL))
    # Coved vinyl skirting (100 mm).
    for name, size, c in (('n_a', (-12.6 - x0, 0.1, 0.02), ((x0 - 12.6) / 2, 0.05, Z_SF + 0.01)),
                          ('n_b', (x1 - (-11.4), 0.1, 0.02), ((x1 - 11.4) / 2, 0.05, Z_SF + 0.01)),
                          ('s', (x1 - x0, 0.1, 0.02), ((x0 + x1) / 2, 0.05, Z_SB - 0.01)),
                          ('w', (0.02, 0.1, Z_SB - Z_SF), (x0 + 0.01, 0.05, (Z_SF + Z_SB) / 2)),
                          ('e', (0.02, 0.1, Z_SB - Z_SF), (x1 - 0.01, 0.05, (Z_SF + Z_SB) / 2))):
        objs.append(nw.box(f'r104_skirt_{name}', SHELL, size, c, mat=P['skirting'], bevel=0.004))
    for ob in objs:
        if ob.data.materials and ob.data.materials[0] in (M_FLOOR,):
            nw.world_uvs(ob, 2.0)
        elif ob.data.materials and ob.data.materials[0] is M_CEIL:
            nw.world_uvs(ob, 0.6)
        elif ob.data.materials and ob.data.materials[0] is M_WALL:
            nw.world_uvs(ob, 1.5)
    # Ceiling: offset so the tile grid lines up with the troffer (centre -13.4, 3.6).
    for ob in (ceil,):
        uv = ob.data.uv_layers['UVMap']
        for d in uv.data:
            d.uv = (d.uv.x + 0.5 - (-13.4 / 0.6) % 1, d.uv.y + 0.5 - (-3.6 / 0.6) % 1)
    return objs


def corridor_shell():
    a0, a1 = COR_X
    objs = []
    floor = nw.plane('cor_floor', SHELL, a1 - a0, Z_CS - Z_CN, ((a0 + a1) / 2, 0.003, 0), mat=M_FLOOR)
    nw.world_uvs(floor, 2.0)
    ceil = nw.plane('cor_ceiling', SHELL, a1 - a0, Z_CS - Z_CN, ((a0 + a1) / 2, CEIL_COR - 0.003, 0), normal='-y', mat=M_CEIL)
    nw.world_uvs(ceil, 0.6)
    objs += [floor, ceil]
    # Blue wayfinding line (the old procedural floor paint) at z 0.95.
    line = nw.box('cor_guide_line', SHELL, (a1 - a0, 0.002, 0.05), ((a0 + a1) / 2, 0.005, 0.95), mat=nw.pbr('guide_blue', (0.05, 0.16, 0.42), rough=0.35, grime=0.45, grime_scale=2.0), bevel=0.0)
    objs.append(line)
    for zf, facing, opens in ((Z_CN, +1, OPEN_N), (Z_CS, -1, OPEN_S)):
        tag = 'n' if facing > 0 else 's'
        upper = nw.wall_skin(f'cor_wall_{tag}', SHELL, 'x', zf, a0, a1, 1.05, CEIL_COR, facing, opens, M_WALL)
        nw.world_uvs(upper, 1.5)
        lower = nw.wall_skin(f'cor_wainscot_{tag}', SHELL, 'x', zf, a0, a1, 0.1, 1.05, facing, opens, M_WAINSCOT, inset=0.008)
        nw.world_uvs(lower, 1.2)
        objs += [upper, lower]
        # Runs between door openings: skirting, wainscot cap and the beech crash rail on brackets.
        cuts = sorted([a0, a1] + [v for o in opens for v in (o[0], o[1])])
        runs = [(cuts[i], cuts[i + 1]) for i in range(0, len(cuts) - 1, 2) if cuts[i + 1] - cuts[i] > 0.3]
        for i, (r0, r1) in enumerate(runs):
            L = r1 - r0
            mid = (r0 + r1) / 2
            objs.append(nw.box(f'cor_skirt_{tag}{i}', SHELL, (L, 0.1, 0.02), (mid, 0.05, zf + facing * 0.012), mat=P['skirting'], bevel=0.004))
            objs.append(nw.box(f'cor_cap_{tag}{i}', SHELL, (L, 0.025, 0.02), (mid, 1.06, zf + facing * 0.012), mat=P['steel'], bevel=0.004))
            rail = nw.box(f'cor_rail_{tag}{i}', SHELL, (L - 0.05, 0.08, 0.035), (mid, 0.92, zf + facing * 0.06), mat=M_RAIL, bevel=0.012, segments=3)
            nw.world_uvs(rail, 1.0)
            objs.append(rail)
            n = max(2, int(L / 1.2) + 1)
            for k in range(n):
                bx = r0 + 0.15 + k * (L - 0.3) / (n - 1)
                objs.append(nw.box(f'cor_bracket_{tag}{i}_{k}', SHELL, (0.03, 0.03, 0.05), (bx, 0.9, zf + facing * 0.03), mat=P['chrome'], bevel=0.005))
            # Corner guards at door jambs.
            for jx in (r0, r1):
                if a0 + 0.01 < jx < a1 - 0.01:
                    objs.append(nw.box(f'cor_guard_{tag}{i}_{jx:.1f}', SHELL, (0.04, 1.4, 0.04), (jx + (0.02 if jx == r0 else -0.02), 0.8, zf + facing * 0.02), mat=P['steel'], bevel=0.006))
        # Room-number plaques stay procedural: they are crisp canvas-text signs (separate meshes).
    # The notice taped near Room 104's door.
    notice = nw.plane('cor_notice', SHELL, 0.3, 0.15, (-13.35, 1.6, Z_CS - 0.006), normal='-z', mat=M_SIGN)
    sign_uv(notice, 7)
    objs.append(notice)
    # Where the set meets the rest of the ward (x = -7): a stainless floor threshold and a ceiling
    # bulkhead trim, so the change of finish reads as a fire-compartment line, not a seam.
    objs.append(nw.box('cor_threshold', SHELL, (0.09, 0.006, Z_CS - Z_CN), (a1, 0.004, 0), mat=P['steel'], bevel=0.002))
    objs.append(nw.box('cor_bulkhead', SHELL, (0.12, 0.1, Z_CS - Z_CN), (a1, CEIL_COR - 0.05, 0), mat=P['enamel'], bevel=0.004))
    # Ceiling troffer housings (x -18.2 ... -3.8); -0.2 straddles the set's end and stays procedural.
    for x in (-18.2, -14.6, -11.0, -7.4, -3.8):
        objs.append(troffer_housing(x, 0.0, CEIL_COR, f'cor_troffer_{x}'))
    return objs


def sign_uv(ob, cell):
    """Map a rectangle onto a signage-atlas cell (512x256 cells, 2 columns, 4 rows of a 1024 atlas)."""
    me = ob.data
    uv = me.uv_layers.get('UVMap') or me.uv_layers.new(name='UVMap')
    cu, cv = (cell % 2) * 0.5, 1 - (cell // 2 + 1) * 0.25
    for poly in me.polygons:
        for li in poly.loop_indices:
            u, v = uv.data[li].uv
            uv.data[li].uv = (cu + u * 0.5, cv + v * 0.25)


def plaque(label, x, zf, facing):
    ob = nw.plane(f'cor_plaque_{label}', SHELL, 0.24, 0.12, (x, 1.45, zf + facing * 0.012), normal='+z' if facing > 0 else '-z', mat=M_SIGN)
    nw.select_only([ob])
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    # Default grid UVs are 0..1 across the quad; flip U for the -z facing side.
    if facing < 0:
        uv = ob.data.uv_layers['UVMap']
        for d in uv.data:
            d.uv = (1 - d.uv.x, d.uv.y)
    sign_uv(ob, {'101': 0, '102': 1, '103': 2, '104': 3, '105': 4, '106': 5}[label])
    back = nw.box(f'cor_plaque_back_{label}', SHELL, (0.25, 0.13, 0.008), (x, 1.45, zf + facing * 0.006), mat=P['enamel'], bevel=0.002)
    return nw.join([ob, back], f'cor_plaque_{label}') if False else ob


# ---------------------------------------------------------------------------------------------
# Decals: quads a few millimetres off the surface, UVs into the decal atlas (decals.png layout).

DECAL_CELLS = {  # (u0, v0, size) in atlas fractions, v measured from the bottom
    'rot': (0.0, 0.5, 0.5), 'water': (0.5, 0.75, 0.25), 'rust': (0.75, 0.75, 0.25),
    'scratches': (0.5, 0.5, 0.25), 'hands': (0.75, 0.5, 0.25), 'peeling': (0.0, 0.25, 0.25), 'wear': (0.25, 0.25, 0.25),
}


def decal(name, kind, w, h, center, normal, spin=0.0):
    ob = nw.plane(f'decal_{name}', DECALS, w, h, center, normal=normal, mat=M_DECAL)
    if spin:
        bpy.context.view_layer.update()
        ob.matrix_world = ob.matrix_world @ Matrix.Rotation(spin, 4, 'Z')  # local Z = the decal normal
    u0, v0, s = DECAL_CELLS[kind]
    uv = ob.data.uv_layers.get('UVMap') or ob.data.uv_layers.new(name='UVMap')
    for d in uv.data:
        d.uv = (u0 + d.uv.x * s, v0 + d.uv.y * s)
    return ob


def place_decals():
    x0, x1 = R104
    out = []
    # The rot: from the south-west corner behind the bed head, up the west wall and onto the ceiling.
    out.append(decal('rot_wall_w', 'rot', 2.4, 2.4, (x0 + 0.004, 1.35, Z_SB - 1.2), '+x'))
    out.append(decal('rot_wall_s', 'rot', 1.9, 1.9, (x0 + 0.95, 1.2, Z_SB - 0.004), '-z'))
    out.append(decal('rot_ceiling', 'rot', 1.5, 1.5, (x0 + 0.76, CEIL_ROOM - 0.006, Z_SB - 0.76), '-y', spin=math.pi / 2))
    # Ash handprints on the ceiling above the bed (nobody could reach there).
    out.append(decal('hands_ceiling', 'hands', 0.9, 0.9, (-14.2, CEIL_ROOM - 0.005, 5.0), '-y', spin=0.6))
    # Nail scratches on the west wall beside the bed, at a lying patient's arm height.
    out.append(decal('scratches_w', 'scratches', 0.7, 0.7, (x0 + 0.005, 0.85, 4.75), '+x'))
    # Water stain around the troffer, rust run from the headwall outlet.
    out.append(decal('water_ceiling', 'water', 1.3, 1.3, (-12.5, CEIL_ROOM - 0.004, 2.6), '-y', spin=1.1))
    out.append(decal('rust_headwall', 'rust', 0.35, 0.7, (-14.7, 1.0, Z_SB - 0.005), '-z'))
    out.append(decal('peeling_e', 'peeling', 0.8, 0.8, (x1 - 0.005, 2.05, 3.0), '-x'))
    # Drag marks from the bed out of the door and into the corridor.
    out.append(decal('wear_room', 'wear', 1.0, 2.6, (-12.6, 0.006, 3.0), 'y', spin=0.35))
    out.append(decal('wear_door', 'wear', 0.9, 1.6, (-12.1, 0.006, 0.9), 'y', spin=0.1))
    # Corridor: the rot creeping out of 104 along the skirting, a stain round the broken tile,
    # rust runs from the ceiling void.
    out.append(decal('rot_cor_s', 'rot', 1.3, 1.3, (-13.2, 0.7, Z_CS - 0.012), '-z'))
    out.append(decal('water_cor', 'water', 1.6, 1.6, (-16.5, CEIL_COR - 0.004, 0.3), '-y'))
    out.append(decal('water_cor2', 'water', 1.2, 1.2, (-9.3, CEIL_COR - 0.004, -0.3), '-y', spin=2.0))
    out.append(decal('rust_cor', 'rust', 0.4, 0.9, (-9.6, 1.9, Z_CN + 0.012), '+z'))
    out.append(decal('scratches_cor', 'scratches', 0.6, 0.6, (-12.75, 1.35, Z_CS - 0.012), '-z', spin=0.2))
    # NW-005A: years of neglect down the whole stretch to the station.
    # Water through the ceiling: stains spreading from the tile joints, rust running down the walls.
    for i, (x, z, s_, sp) in enumerate(((-13.9, -0.5, 1.4, 0.7), (-6.4, 0.4, 1.8, 2.4), (-5.6, -0.3, 1.1, 0.2), (-2.3, -0.1, 1.5, 1.4), (-18.6, 0.6, 1.2, 0.9))):
        out.append(decal(f'water_cor_e{i}', 'water', s_, s_, (x, CEIL_COR - 0.004, z), '-y', spin=sp))
    for i, (x, side) in enumerate(((-17.3, 'n'), (-13.6, 's'), (-5.9, 's'), (-4.9, 'n'), (-0.9, 'n'))):
        zf = Z_CN + 0.012 if side == 'n' else Z_CS - 0.012
        out.append(decal(f'rust_cor_e{i}', 'rust', 0.35, 0.9, (x, CEIL_COR - 0.5, zf), '+z' if side == 'n' else '-z'))
    # Paint lifting off the upper walls in sheets.
    for i, (x, y, side, w) in enumerate(((-19.2, 2.1, 'n', 0.9), (-15.0, 1.9, 's', 0.8), (-10.1, 2.25, 's', 0.7), (-8.9, 1.7, 'n', 0.9), (-6.6, 2.2, 'n', 0.6), (-3.0, 1.9, 's', 0.8), (-1.6, 2.3, 'n', 0.7))):
        zf = Z_CN + 0.012 if side == 'n' else Z_CS - 0.012
        out.append(decal(f'peeling_cor_{i}', 'peeling', w, w, (x, y, zf), '+z' if side == 'n' else '-z', spin=i * 0.9))
    # Drag marks: something heavy was pulled from 104 down the corridor toward the station.
    for i, (x, z, L, sp) in enumerate(((-11.0, 0.55, 2.4, 1.52), (-8.6, 0.35, 2.6, 1.6), (-6.1, 0.15, 2.4, 1.55), (-3.9, -0.1, 2.2, 1.66))):
        out.append(decal(f'drag_cor_{i}', 'wear', 0.7, L, (x, 0.0062 + i * 0.0002, z), 'y', spin=sp))
    # The rot has only just reached the corridor: one patch on the skirting outside 104.
    out.append(decal('rot_cor_s2', 'rot', 1.0, 1.0, (-10.6, 0.6, Z_CS - 0.012), '-z', spin=0.8))
    # Final polish: the corridor stays ambiguous. The ash handprints and the rot on the corridor
    # ceiling are gone; one patch of rot by 104's door and old scratches by 106 remain.
    out.append(decal('scratches_106', 'scratches', 0.5, 0.5, (-8.35, 1.0, Z_CS - 0.012), '-z', spin=1.0))
    return out


# ---------------------------------------------------------------------------------------------
# Lighting-bake occluders (not exported): door leaf of 104 (open), wall cores, the corridor beyond.


def occluders():
    obs = []
    # Wall cores around the room (thick boxes outside the skins) so light leaks don't bake in.
    x0, x1 = R104
    obs.append(nw.box('occ_s', OCCLUDERS, (x1 - x0 + 0.4, 3.2, 0.1), ((x0 + x1) / 2, 1.5, Z_SB + 0.06)))
    obs.append(nw.box('occ_w', OCCLUDERS, (0.1, 3.2, 5.2), (x0 - 0.06, 1.5, (Z_SF + Z_SB) / 2)))
    obs.append(nw.box('occ_e', OCCLUDERS, (0.1, 3.2, 5.2), (x1 + 0.06, 1.5, (Z_SF + Z_SB) / 2)))
    obs.append(nw.box('occ_door_leaf', OCCLUDERS, (0.05, 2.08, 1.1), (-11.45, 1.05, 2.2)))
    obs.append(nw.box('occ_cor_end', OCCLUDERS, (0.1, 3.0, 3.0), (COR_X[1] + 0.6, 1.5, 0)))
    # The station: its counter (light from the station pool falls over it into the corridor), its
    # side partitions and back wall; and the connector's far wall.
    obs.append(nw.box('occ_counter', OCCLUDERS, (5.0, 1.12, 0.95), (-3.8, 0.56, -1.97)))
    obs.append(nw.box('occ_station_back', OCCLUDERS, (7.2, 3.0, 0.1), (-3.3, 1.5, -6.5)))
    obs.append(nw.box('occ_station_w', OCCLUDERS, (0.1, 3.0, 5.0), (-6.85, 1.5, -3.9)))
    obs.append(nw.box('occ_station_e', OCCLUDERS, (0.1, 3.0, 5.0), (0.25, 1.5, -3.9)))
    obs.append(nw.box('occ_station_ceil', OCCLUDERS, (7.2, 0.1, 5.0), (-3.3, 2.76, -3.9)))
    obs.append(nw.box('occ_connector_s', OCCLUDERS, (2.4, 3.0, 0.1), (-5.7, 1.5, 6.5)))
    # Door leaves in their initial poses: 101, 103 closed (north), 106 closed (south); 105, 102 ajar.
    for x, z in ((-16.4, -1.475), (-12.0, -1.475), (-7.6, 1.475), (-1.0, 1.475)):
        obs.append(nw.box(f'occ_leaf_{x}', OCCLUDERS, (1.1, 2.08, 0.05), (x, 1.05, z)))
    return obs


def build():
    shell = room_shell() + corridor_shell()
    props = [bed(), bedside_cabinet(), overbed_table(), iv_stand(), wardrobe(), sink_unit(), headwall(), vitals_monitor(), tv_body()]
    clock = wall_clock()
    props += [clock[0]]
    shell.append(clock[1])
    props.append(troffer_housing(-13.4, 3.6, CEIL_ROOM, 'r104_troffer'))
    props += bedding()
    # NW-005A: door kit, the opening's props, corridor fixtures.
    props += op.door_frames(PROPS, P)
    props += op.card_reader(Prop, M_LABELS, PROPS)
    props += op.intercom(Prop, M_LABELS, PROPS)
    props += op.bed_curtain(Prop, P, PROPS)
    props += op.corridor_fixtures(Prop, P, M_LABELS, M_SIGN, PROPS, clock_dial)
    # NW-005A second pass: corridor props at the room's standard.
    props += op.counter_front(Prop, P, M_CLABELS, PROPS)
    props += [op.visitor_chair(Prop, -4.05, 1.05, math.pi, 'chair_a', torn=True), op.visitor_chair(Prop, -3.42, 1.05, math.pi - 0.12, 'chair_b')]
    props += [op.sanitiser(Prop, x, side, f'sanitiser_{side}{i}') for i, (x, side) in enumerate(((-15.55, 'n'), (-11.15, 'n'), (-6.75, 's'), (-2.4, 's')))]
    props += op.wet_floor_sign(Prop, M_CLABELS, PROPS)
    props += op.wall_details(Prop, P, M_CLABELS, PROPS)
    props += op.floor_clutter(Prop, P, PROPS)
    props += op.decay(Prop, P, M_CEIL, PROPS)
    op.access_card(M_LABELS, PICKUPS)
    hw, ven = op.door_leaf(Prop, P, M_VENEER, DOORLEAF)
    op.door_glass(DOORLEAF)
    wc = wheelchair()
    decals = place_decals()
    occluders()
    for ob in props + [wc, hw]:
        if ob.type == 'MESH':
            nw.select_only([ob])
            bpy.ops.object.shade_auto_smooth(angle=math.radians(35)) if hasattr(bpy.ops.object, 'shade_auto_smooth') else None
    bpy.ops.wm.save_as_mainfile(filepath=OUT)
    tri = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects if o.type == 'MESH' and o.users_collection[0].name != 'occluders')
    print('NW_SET built', len(props), 'props', len(shell), 'shell', len(decals), 'decals', 'triangles', tri)


build()
