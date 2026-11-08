"""THE REFLECTION — you, but wrong: a patient in your gown, eyes shut, head tilted, behind you."""
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
random.seed(31)
nw.reset()
E3 = nw.ellipsoid

J, E = [], []
def j(p, r):
    J.append((p, r if isinstance(r, tuple) else (r, r)))
    return len(J) - 1
def chain(*idx):
    for a, b in zip(idx, idx[1:]):
        E.append((a, b))

# A thin patient in the same gown as the player, head tilted hard to one side.
pelvis = j((0, 0, 0.95), (0.13, 0.095))
waist = j((0, 0, 1.08), (0.08, 0.065))
ribs = j((0, -0.01, 1.22), (0.1, 0.08))
upper = j((0, -0.02, 1.38), (0.115, 0.075))
neck0 = j((0, -0.03, 1.47), 0.042)
neck1 = j((0.02, -0.05, 1.55), 0.038)
neck2 = j((0.045, -0.06, 1.61), 0.042)
chain(pelvis, waist, ribs, upper, neck0, neck1, neck2)
for s in (-1, 1):
    sh = j((s * 0.155, -0.02, 1.4), 0.042)
    el = j((s * 0.18, 0.0, 1.15), 0.03)
    wr = j((s * 0.19, -0.03, 0.9), 0.022)
    fin = j((s * 0.19, -0.04, 0.76), (0.02, 0.008))
    chain(upper, sh, el, wr, fin)
    hip = j((s * 0.08, 0, 0.9), 0.07)
    knee = j((s * 0.085, -0.02, 0.5), 0.045)
    ankle = j((s * 0.085, 0.0, 0.07), 0.03)
    chain(pelvis, hip, knee, ankle)
body = nw.skin_body('ref_body', J, E, root=pelvis, subdiv=2)
tilt = math.radians(32)
hc = Vector((0.07, -0.07, 1.7))
def tilted(off):
    x, y, z = off
    return (hc.x + x * math.cos(tilt) + z * math.sin(tilt), hc.y + y, hc.z - x * math.sin(tilt) + z * math.cos(tilt))
forms = [body,
         E3('cranium', tilted((0, 0, 0.02)), (0.074, 0.09, 0.1), rot=(0, tilt, 0)),
         E3('face', tilted((0, -0.04, -0.03)), (0.058, 0.055, 0.075), rot=(0, tilt, 0)),
         E3('jaw', tilted((0, -0.045, -0.1)), (0.046, 0.045, 0.035), rot=(0, tilt, 0)),
         E3('nose', tilted((0, -0.098, -0.03)), (0.009, 0.014, 0.024), rot=(0, tilt, 0)),
         E3('brow', tilted((0, -0.085, 0.015)), (0.05, 0.014, 0.012), rot=(0, tilt, 0))]
body = nw.remesh_union(forms, 'reflection', voxel=0.006 if QUICK else 0.0042)
for ex in (-0.03, 0.03):
    nw.push(body, tilted((ex, -0.11, -0.005)), 0.026, (0, 1, 0), 0.012)
nw.push(body, tilted((0, -0.1, -0.085)), 0.03, (0, 1, 0), 0.004)
skin = nw.mat_skin('ref_skin', (0.2, 0.2, 0.19), (0.13, 0.12, 0.13), rough=0.4, sss=0.3)
nw.assign(body, skin)
# Closed eyelids, a thin closed mouth.
for ex in (-0.03, 0.03):
    lid = E3('lid', tilted((ex, -0.098, -0.006)), (0.016, 0.007, 0.009), rot=(0, tilt, 0))
    nw.assign(lid, skin)
    lash = E3('lash', tilted((ex, -0.103, -0.012)), (0.014, 0.002, 0.0015), rot=(0, tilt, 0))
    nw.assign(lash, nw.mat_simple('lash', (0.01, 0.008, 0.008)))
mouth = E3('mouth', tilted((0, -0.096, -0.085)), (0.02, 0.003, 0.002), rot=(0, tilt, 0))
nw.assign(mouth, nw.mat_simple('mouthline', (0.03, 0.015, 0.015)))
band = nw.mat_simple('band', (0.55, 0.53, 0.46), rough=0.6)
bpy.ops.mesh.primitive_torus_add(major_radius=0.024, minor_radius=0.005, location=(-0.19, -0.03, 0.93))
nw.assign(bpy.context.active_object, band)
gown = nw.mat_cloth('ref_gown', (0.17, 0.22, 0.22), (0.09, 0.07, 0.045), stain_amount=0.5)
g = nw.shell(body, lambda co: 0.42 < co.z < 1.45 and not (abs(co.x) > 0.15 and co.z < 1.3), 0.012, gown, thickness=0.006, name='gown')
# Short, matted hair: a rough cap shrink-wrapped onto the skull.
hair = nw.mat_hair('ref_hair', (0.025, 0.02, 0.016), rough=0.7)
body.data.materials.append(hair)
up = Vector((math.sin(tilt), 0, math.cos(tilt)))
for poly in body.data.polygons:
    rel = poly.center - hc
    if rel.length < 0.16 and rel.dot(up) > -0.035 and rel.y > -0.045:
        poly.material_index = 1
for i in range(60 if QUICK else 260):
    a = random.uniform(-2.6, 2.6)
    root = Vector(tilted((math.sin(a) * 0.07, 0.03 + math.cos(a) * 0.05 * random.uniform(0.3, 1), 0.08 - abs(a) * 0.022)))
    tip = root + Vector((random.uniform(-0.04, 0.04) + 0.03, random.uniform(-0.02, 0.05), -random.uniform(0.06, 0.16)))
    mid = (root + tip) / 2 + Vector((random.uniform(-0.015, 0.015), 0.01, 0.01))
    nw.tube_curve(f'hairs_s{i}', [tuple(root), tuple(mid), tuple(tip)], 0.0014, hair, taper_end=0.3)

# Bust render first (direct view, for the design).
cam = nw.stage(target_height=1.75, camera_angle=math.radians(-15), focal=60)
os.makedirs(OUT, exist_ok=True)
samples = 32 if QUICK else 160
nw.orbit(cam, math.radians(-15), 1.6, 1.5, 1.42)
nw.render(os.path.join(OUT, 'reflection_bust.png'), w=900, h=900, samples=samples)

# Mirror shot: the viewer faces a bathroom mirror; she stands behind them, visible only in the glass.
for o in list(bpy.data.objects):
    if o.name.startswith(('reflection', 'gown', 'hairs', 'lid', 'lash', 'mouth', 'Torus')) and o.type in ('MESH', 'CURVE'):
        o.location.y += -0.22
        o.location.x += 0.28
        o.rotation_euler.z = math.radians(180)
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 1.2, 1.55), rotation=(math.radians(90), 0, 0))
mirror = bpy.context.active_object
mirror.scale = (0.62, 0.82, 1)
nw.assign(mirror, nw.mat_simple('mirror', (0.85, 0.87, 0.86), rough=0.035, metal=1.0))
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 1.215, 1.55))
frame = bpy.context.active_object
frame.scale = (0.68, 0.02, 0.88)
nw.assign(frame, nw.mat_simple('frame', (0.12, 0.12, 0.11), rough=0.4, metal=0.6))
bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 1.24, 2.0), rotation=(math.radians(90), 0, 0))
wall = bpy.context.active_object
tile = nw.mat_simple('tile', (0.07, 0.085, 0.08), rough=0.3)
nw.assign(wall, tile)
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 1.0, 0.82))
sink = bpy.context.active_object
sink.scale = (0.55, 0.42, 0.16)
nw.assign(sink, nw.mat_simple('porcelain', (0.5, 0.5, 0.48), rough=0.2))
# Cracks across the glass.
for k in range(7):
    a = random.uniform(0, math.pi * 2)
    p0 = Vector((0.16, 1.193, 1.78))
    p1 = p0 + Vector((math.cos(a) * random.uniform(0.06, 0.13), 0, math.sin(a) * random.uniform(0.06, 0.13)))
    nw.tube_curve(f'crack{k}', [tuple(p0), tuple((p0 + p1) / 2 + Vector((0.008, 0, 0.004))), tuple(p1)], 0.0005, nw.mat_simple('crk', (0.25, 0.26, 0.25), rough=0.2))
for o in bpy.data.objects:
    if o.type == 'LIGHT':
        o.visible_glossy = False
cam.location = (-0.1, 0.5, 1.6)
cam.rotation_euler = (Vector((0.05, 1.2, 1.55)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam.data.lens = 26
nw.render(os.path.join(OUT, 'reflection_mirror.png'), w=1200, h=900, samples=samples)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'reflection.blend'))
