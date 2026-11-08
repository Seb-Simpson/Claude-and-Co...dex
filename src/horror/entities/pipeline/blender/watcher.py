"""THE WATCHER — far too tall, perfectly still, long dark coat, head shrouded in a hospital sheet."""
import math
import os
import random
import sys
sys.path.insert(0, os.path.dirname(__file__))
import bpy
from mathutils import Vector
import nwlib as nw

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '/tmp'
QUICK = '--quick' in sys.argv
random.seed(21)
nw.reset()
E3 = nw.ellipsoid

J, E = [], []
def j(p, r):
    J.append((p, r if isinstance(r, tuple) else (r, r)))
    return len(J) - 1
def chain(*idx):
    for a, b in zip(idx, idx[1:]):
        E.append((a, b))

pelvis = j((0, 0, 1.22), (0.12, 0.085))
waist = j((0, 0, 1.38), (0.085, 0.065))
ribs = j((0, 0, 1.55), (0.12, 0.085))
upper = j((0, 0, 1.74), (0.14, 0.08))
neck0 = j((0, 0, 1.84), 0.045)
neck1 = j((0, -0.005, 1.97), 0.038)
neck2 = j((0, -0.01, 2.08), 0.042)
neck3 = j((0, -0.015, 2.16), 0.05)
chain(pelvis, waist, ribs, upper, neck0, neck1, neck2, neck3)
hands = []
for s in (-1, 1):
    sh0 = j((s * 0.1, 0, 1.77), 0.05)
    sh = j((s * 0.2, 0, 1.75), 0.05)
    el = j((s * 0.225, 0.005, 1.28), 0.034)
    wr = j((s * 0.23, -0.005, 0.85), 0.028)
    chain(upper, sh0, sh, el, wr)
    hands.append((s, Vector((s * 0.23, -0.005, 0.85))))
    hip = j((s * 0.085, 0, 1.17), 0.07)
    knee = j((s * 0.09, -0.01, 0.62), 0.046)
    ankle = j((s * 0.09, 0.0, 0.08), 0.032)
    toe = j((s * 0.09, -0.17, 0.03), (0.038, 0.025))
    chain(pelvis, hip, knee, ankle, toe)
body = nw.skin_body('watcher_body', J, E, root=pelvis, subdiv=2)
forms = [body,
         E3('head', (0, -0.04, 2.27), (0.08, 0.095, 0.115), rot=(math.radians(-14), 0, 0)),
         E3('jawline', (0, -0.075, 2.18), (0.055, 0.06, 0.055)),
         E3('nose', (0, -0.14, 2.24), (0.012, 0.022, 0.03)),
         E3('brow', (0, -0.125, 2.3), (0.06, 0.02, 0.016))]
for s, w in hands:
    forms.append(E3('palm', tuple(w + Vector((0, -0.01, -0.07))), (0.018, 0.045, 0.07)))
    for f in range(4):
        base = w + Vector((s * 0.0, -0.045 + f * 0.022, -0.13))
        pts = [base, base + Vector((s * 0.004, -0.004, -0.08)), base + Vector((s * 0.002, -0.012, -0.15 + f * 0.006))]
        forms.append(nw.tube_curve('finger', [tuple(p) for p in pts], 0.0085, taper_end=0.65))
    forms.append(nw.tube_curve('thumb', [tuple(w + Vector((-s * 0.008, -0.045, -0.06))), tuple(w + Vector((-s * 0.012, -0.065, -0.12)))], 0.009, taper_end=0.6))
body = nw.remesh_union(forms, 'watcher', voxel=0.006 if QUICK else 0.0042, smooth_iterations=8, smooth_factor=0.6)
for ex in (-0.034, 0.034):
    nw.push(body, (ex, -0.13, 2.275), 0.03, (0, 1, 0), 0.012)
skin = nw.mat_skin('watcher_skin', (0.42, 0.415, 0.395), (0.36, 0.35, 0.34), rough=0.22, sss=0.35)
coat = nw.mat_cloth('coat', (0.018, 0.019, 0.021), (0.01, 0.009, 0.008), rough=0.8, stain_amount=0.6)
shoe = nw.mat_simple('shoe', (0.006, 0.006, 0.006), rough=0.3)
body.data.materials.append(skin)
body.data.materials.append(coat)
body.data.materials.append(shoe)
for poly in body.data.polygons:
    c = poly.center
    if c.z < 0.1:
        poly.material_index = 2
    elif c.z < 2.0 and not (c.z < 0.98 and abs(c.x) > 0.17):
        poly.material_index = 1

# Long coat: shoulders and sleeves hug the body; the skirts hang to the ankles.
sh = nw.shell(body, lambda co: 1.25 < co.z < 1.86 and not (co.z > 1.83 and abs(co.x) < 0.06) and not (abs(co.x) > 0.17 and co.z < 0.98), 0.014, coat, thickness=0.008, name='coatTop')
sl = nw.shell(body, lambda co: 0.95 < co.z < 1.78 and abs(co.x) > 0.17, 0.012, coat, thickness=0.008, name='sleeves')
bpy.ops.mesh.primitive_grid_add(x_subdivisions=80, y_subdivisions=48, size=1)
skirt = bpy.context.active_object
top_z, bottom_z = 1.3, 0.16
import bmesh
bm = bmesh.new()
bm.from_mesh(skirt.data)
gap = 0.5  # coat opens at the front
for v in bm.verts:
    u = v.co.x + 0.5
    t = v.co.y + 0.5
    a = -math.pi / 2 + gap / 2 + u * (2 * math.pi - gap)
    rx = 0.2 - 0.09 * t
    ry = 0.17 - 0.085 * t
    v.co = Vector((math.cos(a) * rx, math.sin(a) * ry, bottom_z + (top_z - bottom_z) * t))
bm.to_mesh(skirt.data)
bm.free()
pin = skirt.vertex_groups.new(name='pin')
for v in skirt.data.vertices:
    if v.co.z > top_z - 0.05:
        pin.add([v.index], 1.0, 'REPLACE')
nw.assign(skirt, coat)
nw.cloth_drape(skirt, [body], frames=40 if QUICK else 80, pin_group='pin', stiffness=12, thickness=0.008)
collar = nw.band('collar', (0, 0.0, 1.86), 0.09, 0.09, tilt=(math.radians(-6), 0, 0))
nw.wrap(collar, body, 0.018, coat, thickness=0.01)
for k in range(4):
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.009, depth=0.004, location=(0.02, -0.098, 1.62 - k * 0.11), rotation=(math.radians(90), 0, 0))
    nw.assign(bpy.context.active_object, nw.mat_simple('button', (0.02, 0.02, 0.02), rough=0.3, metal=0.4))

# The shroud: a bedsheet dropped over the head and shoulders by cloth simulation.
bpy.ops.mesh.primitive_grid_add(x_subdivisions=80, y_subdivisions=80, size=1.4, location=(0, -0.03, 2.48))
sheet = bpy.context.active_object
sheet.name = 'shroud'
bpy.ops.object.shade_smooth()
sheet_mat = nw.mat_cloth('sheet', (0.5, 0.5, 0.47), (0.22, 0.17, 0.11), rough=0.9, stain_amount=0.5)
nw.assign(sheet, sheet_mat)


nw.cloth_drape(sheet, [body, sh, sl], frames=45 if QUICK else 90, stiffness=3, mass=0.15, thickness=0.004)

cam = nw.stage(target_height=2.5, camera_angle=math.radians(-20), focal=55)
os.makedirs(OUT, exist_ok=True)
samples = 32 if QUICK else 128
nw.render(os.path.join(OUT, 'watcher_front.png'), samples=samples)
# A distant corridor sighting: far, dark, nearly a silhouette.
nw.orbit(cam, math.radians(-4), 11.0, 1.6, 1.4)
cam.data.lens = 50
nw.render(os.path.join(OUT, 'watcher_far.png'), samples=samples)
nw.orbit(cam, math.radians(-10), 1.25, 2.25, 2.15)
cam.data.lens = 65
nw.render(os.path.join(OUT, 'watcher_face.png'), w=900, h=900, samples=samples)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'watcher.blend'))
