"""Orthographic turnaround renders (front, 3/4, side, back) of a .blend for comparison with the sheet."""
import math, os, sys
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
blend, out, tag = argv[0], argv[1], argv[2] if len(argv) > 2 else 'v'
clay = '--clay' in argv
bpy.ops.wm.open_mainfile(filepath=blend)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 420, 900
scene.render.film_transparent = False
scene.view_settings.view_transform = 'Standard'
world = bpy.data.worlds.new('w'); scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.08, 0.08, 0.085, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 1.0
if clay:
    m = bpy.data.materials.new('clay'); m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.55, 0.53, 0.5, 1)
    for o in scene.objects:
        if o.type == 'MESH':
            o.data.materials.clear(); o.data.materials.append(m)
key = bpy.data.lights.new('key', 'AREA'); key.energy = 220; key.size = 3
k = bpy.data.objects.new('key', key); scene.collection.objects.link(k)
k.location = (2.5, -3.5, 3.0); k.rotation_euler = (math.radians(55), 0, math.radians(35))
fill = bpy.data.lights.new('fill', 'AREA'); fill.energy = 70; fill.size = 4
f = bpy.data.objects.new('fill', fill); scene.collection.objects.link(f)
f.location = (-3, -2, 2); f.rotation_euler = (math.radians(60), 0, math.radians(-50))
rim = bpy.data.lights.new('rim', 'AREA'); rim.energy = 120; rim.size = 2
r = bpy.data.objects.new('rim', rim); scene.collection.objects.link(r)
r.location = (0, 3, 3); r.rotation_euler = (math.radians(-50), 0, 0)
cam_data = bpy.data.cameras.new('cam'); cam_data.type = 'ORTHO'; cam_data.ortho_scale = 2.05
cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam); scene.camera = cam
views = {'front': 0, 'front34': -35, 'side': -90, 'back34': 145, 'back': 180, 'face': 0, 'face34': -35, 'faceside': -90, 'faceback': 160, 'hand': -90, 'skirtside': -90}
only = [a for a in argv[3:] if a in views] or list(views)
for name in only:
    a = math.radians(views[name])
    target_z, scale = {'face': (1.72, 0.42), 'face34': (1.72, 0.42), 'faceside': (1.72, 0.42), 'faceback': (1.72, 0.42), 'hand': (0.86, 0.42), 'skirtside': (0.85, 1.0)}.get(name, (0.97, 2.05))
    cam_data.ortho_scale = scale
    if name in ('face', 'face34', 'faceside', 'faceback', 'hand', 'skirtside'):
        scene.render.resolution_x = scene.render.resolution_y = 700
    else:
        scene.render.resolution_x, scene.render.resolution_y = 420, 900
    offx = 0.2 if name == 'hand' else 0.0
    cam.location = (math.sin(a) * -6 + (offx if name != 'hand' else 0), -math.cos(a) * 6, target_z)
    cam.rotation_euler = (math.radians(90), 0, -a)
    scene.render.filepath = os.path.join(out, f'{tag}_{name}.png')
    bpy.ops.render.render(write_still=True)
