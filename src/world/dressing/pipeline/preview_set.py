"""Cycles close-up renders of the Room 104 set under the game's light layout.

    <blender-python> preview_set.py -- <set.blend> <out_dir> [--quick]
"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
import nwset as nw  # noqa: E402
from nwset import g  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = ARGS[0], ARGS[1]
QUICK = '--quick' in ARGS
nw.ensure_dir(OUT)
bpy.ops.wm.open_mainfile(filepath=SRC)
scene = bpy.context.scene
for ob in bpy.data.collections['occluders'].objects:
    ob.hide_render = True
# The wheelchair is authored at the origin (it is swapped into the anomaly group in game): place it.
for ob in bpy.data.collections['wheelchair'].objects:
    ob.location = g(-14.25, 0, 2.75)
    ob.rotation_euler = (0, 0, -math.pi / 2)


def area_light(name, pos, size, power, color, rot=(0, 0, 0)):
    data = bpy.data.lights.new(name, 'AREA')
    data.shape = 'RECTANGLE'
    data.size, data.size_y = size
    data.energy = power
    data.color = color
    ob = bpy.data.objects.new(name, data)
    scene.collection.objects.link(ob)
    ob.location = g(*pos)
    ob.rotation_euler = rot
    return ob


def lights():
    cool = (0.86, 0.92, 1.0)
    area_light('r104_troffer', (-13.4, CEIL - 0.03, 3.6), (1.15, 0.55), 70, cool)
    for x, p in ((-18.2, 30), (-11.0, 55), (-7.4, 25)):
        area_light(f'cor_{x}', (x, 2.67, 0), (1.15, 0.55), p, cool)
    # Night through the west window: cold, low.
    moon = area_light('window', (-19.9, 1.5, 0), (1.6, 1.2), 90, (0.55, 0.65, 0.95), rot=(0, math.pi / 2, 0))
    world = bpy.data.worlds.new('w')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.004, 0.005, 0.007, 1)


CEIL = 2.75


def camera(name, pos, target, lens=24):
    data = bpy.data.cameras.new(name)
    data.lens = lens
    cam = bpy.data.objects.new(name, data)
    scene.collection.objects.link(cam)
    cam.location = g(*pos)
    d = g(*target) - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return cam


lights()
scene.render.resolution_x, scene.render.resolution_y = (800, 450) if QUICK else (1280, 720)
scene.cycles.samples = 24 if QUICK else 64
scene.cycles.use_denoising = True
try:
    scene.cycles.denoiser = 'OPENIMAGEDENOISE'
except Exception:
    pass
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = 1.2
shots = {
    'room_from_door': ((-12.05, 1.62, 1.75), (-14.4, 0.8, 5.4), 22),
    'bed_rot_corner': ((-12.9, 1.35, 3.6), (-15.2, 1.0, 6.0), 28),
    'sink_mirror': ((-12.4, 1.5, 3.4), (-11.3, 1.2, 4.4), 30),
    'wheelchair_tv': ((-12.5, 1.4, 4.6), (-15.0, 1.1, 2.6), 26),
    'corridor_west': ((-8.0, 1.62, -0.3), (-19.0, 1.2, 0.2), 22),
    'corridor_door104': ((-14.8, 1.62, -0.9), (-12.0, 1.1, 1.6), 24),
    'clock_door_wall': ((-13.6, 1.55, 4.6), (-13.0, 1.6, 1.55), 30),
}
only = [a for a in ARGS[2:] if not a.startswith('--')]
for name, (pos, target, lens) in shots.items():
    if only and name not in only:
        continue
    scene.camera = camera(name, pos, target, lens)
    scene.render.filepath = os.path.join(OUT, f'{name}.png')
    bpy.ops.render.render(write_still=True)
    print('NW_RENDER', name)
