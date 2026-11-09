"""Menu and loading-screen imagery rendered from the game's own assets (Blender Cycles).

    <blender-python> render_media.py -- <room104_set.blend> <entity_glb_dir> <out_dir> [shot ...] [--quick]

Uses the Room 104 / west-corridor set (src/world/dressing) and the shipped entity GLBs, posed
with their own animation clips. Nothing comes from outside the project.
"""
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../../world/dressing/pipeline'))
import nwset as nw  # noqa: E402
from nwset import g  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:]
SET, GLB, OUT = ARGS[0], ARGS[1], ARGS[2]
ONLY = [a for a in ARGS[3:] if not a.startswith('--')]
QUICK = '--quick' in ARGS
nw.ensure_dir(OUT)

COOL = (0.84, 0.93, 1.0)
WARM = (1.0, 0.72, 0.42)


def load_set():
    bpy.ops.wm.open_mainfile(filepath=SET)
    scene = bpy.context.scene
    for ob in bpy.data.collections['occluders'].objects:
        ob.hide_render = True
    for ob in bpy.data.collections['wheelchair'].objects:
        ob.location = g(-14.25, 0, 2.75)
        ob.rotation_euler = (0, 0, -math.pi / 2)
    world = bpy.data.worlds.new('w')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.002, 0.003, 0.004, 1)
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 20 if QUICK else 56
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = (960, 540) if QUICK else (1600, 900)
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - High Contrast'
    scene.render.image_settings.file_format = 'PNG'
    return scene


def light(scene, name, pos, size, power, color, kind='AREA', rot=(0, 0, 0)):
    data = bpy.data.lights.new(name, kind)
    if kind == 'AREA':
        data.shape = 'RECTANGLE'
        data.size, data.size_y = size
    else:
        data.shadow_soft_size = size[0]
    data.energy = power
    data.color = color
    ob = bpy.data.objects.new(name, data)
    scene.collection.objects.link(ob)
    ob.location = g(*pos)
    ob.rotation_euler = rot
    return ob


def camera(scene, pos, target, lens):
    data = bpy.data.cameras.new('cam')
    data.lens = lens
    data.dof.use_dof = True
    data.dof.aperture_fstop = 2.8
    cam = bpy.data.objects.new('cam', data)
    scene.collection.objects.link(cam)
    cam.location = g(*pos)
    d = g(*target) - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    data.dof.focus_distance = d.length
    scene.camera = cam
    return cam


def entity(kind, pos, face, clip, frame, scale=1.0):
    """Import a shipped entity GLB, pose it on one of its clips, stand it at pos facing a point."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(GLB, f'{kind}.glb'))
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == 'ARMATURE')
    root = arm
    while root.parent:
        root = root.parent
    action = next((a for a in bpy.data.actions if a.name.split('|')[-1].split('.')[0] == clip or a.name.startswith(clip)), None)
    if arm.animation_data is None:
        arm.animation_data_create()
    for track in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(track)
    if action:
        arm.animation_data.action = action
        try:
            slots = getattr(action, 'slots', None)
            if slots and len(slots):
                arm.animation_data.action_slot = slots[0]
        except Exception:
            pass
    bpy.context.scene.frame_set(frame)
    root.location = g(*pos)
    v = g(*face) - g(*pos)
    root.rotation_euler = (root.rotation_euler.x, root.rotation_euler.y, math.atan2(-v.x, v.y))
    root.scale = (scale, scale, scale)
    print('NW_ENTITY', kind, 'clip', action.name if action else None, 'frame', frame)
    return new


def corridor_lights(scene, troffer_on=True, figure_glow=False):
    if troffer_on:
        light(scene, 'troffer_main', (-11.0, 2.66, 0), (1.15, 0.55), 75, COOL)
    light(scene, 'troffer_far', (-18.2, 2.66, 0), (1.15, 0.55), 14, COOL)
    light(scene, 'window', (-19.92, 1.5, 0), (1.6, 1.2), 110, (0.42, 0.55, 0.9), rot=(0, math.pi / 2, 0))
    light(scene, 'exit', (-7.4, 2.3, 1.3), (0.12, 0.12), 6, (0.9, 0.12, 0.08), kind='POINT')
    light(scene, 'emergency', (-19.6, 2.4, -1.1), (0.25, 0.1), 5, WARM)


SHOTS = {}


def shot(fn):
    SHOTS[fn.__name__] = fn
    return fn


@shot
def menu_lit(scene):
    corridor_lights(scene, True)
    camera(scene, (-7.6, 1.5, 0.75), (-19.6, 1.25, -0.25), 30)


@shot
def menu_dark(scene):
    corridor_lights(scene, False)
    camera(scene, (-7.6, 1.5, 0.75), (-19.6, 1.25, -0.25), 30)


@shot
def menu_figure(scene):
    corridor_lights(scene, True)
    entity('watcher', (-18.9, 0, 0.35), (-7.6, 0, 0.75), 'pose2', 1)
    camera(scene, (-7.6, 1.5, 0.75), (-19.6, 1.25, -0.25), 30)


@shot
def load_patient_doorway(scene):
    light(scene, 'troffer_r104', (-13.4, 2.72, 3.6), (1.15, 0.55), 18, COOL)
    light(scene, 'corridor', (-11.0, 2.66, 0), (1.15, 0.55), 80, COOL)
    entity('patient', (-12.05, 0, 1.15), (-13.6, 0, 4.8), 'observe', 40)
    camera(scene, (-13.9, 1.45, 5.2), (-12.1, 1.35, 1.3), 32)


@shot
def load_crawler(scene):
    corridor_lights(scene, True)
    entity('crawler', (-15.6, 0, 0.1), (-10.0, 0, 0.6), 'walk', 18)
    camera(scene, (-11.4, 0.35, 0.7), (-16.5, 0.25, 0.0), 30)


@shot
def load_reflection(scene):
    light(scene, 'troffer_r104', (-13.4, 2.72, 3.6), (1.15, 0.55), 40, COOL)
    # Stand her on the camera ray reflected off the mirror (normal -x): seen only in the glass.
    cam, mirror = (-12.35, 1.58, 3.95), (-11.28, 1.5, 4.32)
    dx, dz = mirror[0] - cam[0], mirror[2] - cam[2]
    n = math.hypot(dx, dz)
    rx, rz = -dx / n, dz / n
    entity('reflection', (mirror[0] + rx * 1.7, 0, mirror[2] + rz * 1.7), (mirror[0], 0, mirror[2]), 'idle', 30)
    # A clean, sharp silvering for this close-up.
    m = bpy.data.materials.get('mirror')
    if m:
        for node in m.node_tree.nodes:
            if node.type == 'MAP_RANGE':
                node.inputs['To Min'].default_value = 0.0
                node.inputs['To Max'].default_value = 0.02
    c = camera(scene, cam, mirror, 40)
    c.data.dof.focus_distance = n + 1.7  # focus on her, inside the glass


@shot
def load_nurse(scene):
    corridor_lights(scene, True)
    light(scene, 'troffer_east', (-7.4, 2.66, 0), (1.15, 0.55), 45, COOL)
    entity('nurse', (-11.6, 0, -0.45), (-8.0, 0, -0.5), 'walk', 12)
    camera(scene, (-8.0, 1.5, -0.55), (-12.0, 1.35, -0.3), 34)


@shot
def load_room104(scene):
    light(scene, 'troffer_r104', (-13.4, 2.72, 3.6), (1.15, 0.55), 55, COOL)
    light(scene, 'corridor', (-11.0, 2.66, 0), (1.15, 0.55), 40, COOL)
    camera(scene, (-12.1, 1.6, 1.8), (-14.4, 0.85, 5.4), 22)


@shot
def load_rot(scene):
    light(scene, 'troffer_r104', (-13.4, 2.72, 3.6), (1.15, 0.55), 45, COOL)
    light(scene, 'rot_glow', (-15.2, 1.4, 6.1), (0.4, 0.4), 1.2, (0.3, 0.9, 0.8))
    camera(scene, (-13.0, 1.3, 3.7), (-15.3, 1.3, 6.2), 30)


@shot
def load_clock(scene):
    light(scene, 'troffer_r104', (-13.4, 2.72, 3.6), (1.15, 0.55), 50, COOL)
    camera(scene, (-13.5, 1.8, 3.6), (-13.4, 2.15, 1.55), 50)


for name, fn in SHOTS.items():
    if ONLY and name not in ONLY:
        continue
    scene = load_set()
    fn(scene)
    scene.render.filepath = os.path.join(OUT, f'{name}.png')
    bpy.ops.render.render(write_still=True)
    print('NW_RENDER', name)
