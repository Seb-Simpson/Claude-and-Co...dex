"""THE NURSE — upright ward sister, eyes bound, head cocked to listen, hands clasped."""
import math
import os
import random
import sys
sys.path.insert(0, os.path.dirname(__file__))
import bpy
import bmesh
from mathutils import Vector
import nwlib as nw

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '/tmp'
QUICK = '--quick' in sys.argv
random.seed(7)
nw.reset()
E3 = nw.ellipsoid

J, E = [], []
def j(p, r):
    J.append((p, r if isinstance(r, tuple) else (r, r)))
    return len(J) - 1
def chain(*idx):
    for a, b in zip(idx, idx[1:]):
        E.append((a, b))

tilt = 0.06  # head cocked toward the left shoulder
pelvis = j((0, 0, 0.96), (0.135, 0.1))
waist = j((0, 0, 1.08), (0.075, 0.062))
ribs = j((0, -0.005, 1.2), (0.095, 0.078))
bust = j((0, -0.025, 1.32), (0.11, 0.095))
upper = j((0, -0.01, 1.44), (0.105, 0.075))
neck0 = j((0, -0.015, 1.53), 0.045)
neck1 = j((-tilt * 0.4, -0.02, 1.6), 0.04)
neck2 = j((-tilt * 0.8, -0.03, 1.66), 0.043)
neck3 = j((-tilt * 1.0, -0.04, 1.72), 0.048)
neck4 = j((-tilt * 1.0, -0.04, 1.78), 0.055)
chain(pelvis, waist, ribs, bust, upper, neck0, neck1, neck2, neck3, neck4)
wrists = []
for s in (-1, 1):
    sh0 = j((s * 0.08, -0.01, 1.46), 0.048)
    sh = j((s * 0.16, 0.0, 1.43), 0.046)
    # NW-007B: elbows out and the clasped hands further forward, clear of the hips (was elbow
    # (0.19, 0.02, 1.18), wrist (0.05, -0.15, 1.0): the forearms rested on the pelvis, so any arm
    # lift tore the dress at the hips). Same pose and silhouette.
    el = j((s * 0.215, 0.025, 1.19), 0.034)
    fore = j((s * 0.17, -0.1, 1.08), 0.03)
    wr = j((s * 0.065, -0.21, 1.02), 0.024)
    chain(upper, sh0, sh, el, fore, wr)
    wrists.append((s, Vector((s * 0.065, -0.21, 1.02))))
    hip = j((s * 0.08, 0, 0.92), 0.075)
    thigh = j((s * 0.085, -0.01, 0.72), 0.06)
    knee = j((s * 0.085, -0.02, 0.5), 0.045)
    calf = j((s * 0.085, 0.0, 0.32), 0.048)
    ankle = j((s * 0.085, 0.01, 0.075), 0.028)
    foot = j((s * 0.085, -0.09, 0.04), (0.032, 0.022))
    chain(pelvis, hip, thigh, knee, calf, ankle, foot)
body = nw.skin_body('nurse_body', J, E, root=pelvis, subdiv=2)
hx = -tilt
forms = [body,
         E3('cranium', (hx, -0.03, 1.79), (0.078, 0.092, 0.1), rot=(0, math.radians(14), 0)),
         E3('face', (hx, -0.07, 1.74), (0.058, 0.05, 0.075), rot=(0, math.radians(14), 0)),
         E3('jaw', (hx * 1.1, -0.08, 1.685), (0.045, 0.045, 0.035)),
         E3('chin', (hx * 1.15, -0.11, 1.67), (0.018, 0.016, 0.018)),
         E3('nose', (hx * 1.05, -0.115, 1.74), (0.008, 0.012, 0.02)),
         E3('bun', (hx * 0.6, 0.075, 1.8), (0.045, 0.04, 0.045))]
# NW-007B: each hand stays on its own side of the centre line (the fingers used to cross it and the
# remesh fused both hands into one surface, which tore whenever the hands parted). Still clasped.
for s, w in wrists:
    forms.append(E3('hand', tuple(w + Vector((-s * 0.016, -0.02, -0.03))), (0.034, 0.018, 0.045), rot=(0, 0, math.radians(s * 30))))
    for f in range(4):
        base = w + Vector((-s * (0.012 + f * 0.01), -0.03, -0.055))
        forms.append(nw.tube_curve('finger', [tuple(base), tuple(base + Vector((-s * 0.01, -0.012, -0.025))), tuple(base + Vector((-s * 0.014, 0.004, -0.045)))], 0.0065, taper_end=0.6))
for s in (-1, 1):
    forms.append(E3('shoe', (s * 0.085, -0.06, 0.03), (0.038, 0.1, 0.03)))
    forms.append(E3('heel', (s * 0.085, 0.03, 0.025), (0.022, 0.022, 0.028)))
body = nw.remesh_union(forms, 'nurse', voxel=0.006 if QUICK else 0.0042, smooth_iterations=6, smooth_factor=0.6)
nw.push(body, (hx * 1.1, -0.11, 1.705), 0.02, (0, 1, 0), 0.006)
nw.push(body, (hx * 1.1, -0.1, 1.745), 0.06, (0, 1, 0), 0.008)
nw.displace(body, 0.002, 0.03, name='pores')
nw.apply_all(body)

# NW-007B: pale, waxy skin (was a dark grey-brown 0.26 that read as a dark mass at the capture
# distance and as a corpse from afar). Still bloodless; the blindfold now reads against it.
skin = nw.mat_skin('nurse_skin', (0.5, 0.465, 0.42), (0.37, 0.32, 0.3), rough=0.5, sss=0.2)
stocking = nw.mat_simple('stocking', (0.02, 0.018, 0.018), rough=0.55)
shoe = nw.mat_simple('shoe', (0.008, 0.007, 0.007), rough=0.18)
hair = nw.mat_hair('hair', (0.035, 0.028, 0.022))
body.data.materials.append(skin)
body.data.materials.append(stocking)
body.data.materials.append(shoe)
body.data.materials.append(hair)
for poly in body.data.polygons:
    c = poly.center
    if c.z < 0.062:
        poly.material_index = 2
    elif c.z < 0.62:
        poly.material_index = 1
    elif (c - Vector((hx * 0.6, 0.075, 1.8))).length < 0.05:
        poly.material_index = 3

dark = nw.mat_simple('void', (0.004, 0.003, 0.003), rough=0.2)
bpy.ops.object.select_all(action='DESELECT')
mouth = E3('mouth', (hx * 1.1, -0.112, 1.704), (0.016, 0.004, 0.005))
nw.assign(mouth, dark)

# Eye bandage, hair and cap: clean meshes shrink-wrapped onto the head.
bandage = nw.mat_cloth('bandage', (0.48, 0.45, 0.37), (0.2, 0.12, 0.07), stain_amount=0.4)
eye_z = 1.758
bd = nw.band('bandage', (hx, -0.03, eye_z), 0.13, 0.05, tilt=(math.radians(-6), math.radians(12), 0))
nw.wrap(bd, body, 0.005, bandage, thickness=0.006, noise=0.002)
bd2 = nw.band('bandage2', (hx, -0.03, eye_z - 0.022), 0.13, 0.03, tilt=(math.radians(6), math.radians(16), 0))
nw.wrap(bd2, body, 0.009, bandage, thickness=0.005, noise=0.002)
for k, (dx, dz) in enumerate([(0.0, 0.0), (0.025, -0.06), (-0.02, -0.11)]):
    tail = E3('knot', (hx + dx * 0.5, 0.08 + abs(dx), eye_z + dz), (0.016, 0.008, 0.032 if k else 0.018), rot=(math.radians(15), 0, 0))
    nw.assign(tail, bandage)
hr = nw.cap('hair', (hx * 0.95, -0.01, 1.775), 0.13, -0.35, rot=(math.radians(-38), math.radians(14), 0))
nw.wrap(hr, body, 0.003, hair, thickness=0.006, noise=0.0015)
capm = nw.mat_cloth('cap', (0.55, 0.54, 0.5), (0.25, 0.22, 0.16), stain_amount=0.62)
cp = nw.cap('cap', (hx * 0.9, -0.0, 1.8), 0.13, 0.25, rot=(math.radians(-30), math.radians(14), 0))
nw.wrap(cp, body, 0.012, capm, thickness=0.008)
bpy.ops.mesh.primitive_cube_add(size=1, location=(hx * 0.92, -0.045, 1.885), rotation=(math.radians(-32), math.radians(14), 0))
fold = bpy.context.active_object
fold.scale = (0.15, 0.012, 0.055)
nw.assign(fold, capm)
fold.modifiers.new('b', 'BEVEL').width = 0.004

# Dress: bodice and sleeves shrink-wrapped over the torso and arms, A-line skirt draped by cloth.
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.duplicate()
bodice = bpy.context.active_object
bodice.data.materials.clear()
bm = bmesh.new()
bm.from_mesh(bodice.data)
def in_bodice(v):
    p = v.co
    if p.z > 1.56 or p.z < 0.98:
        return False
    if p.z < 1.25 and abs(p.x) > 0.13 and p.y > -0.06:  # keep sleeves down the forearms
        return True
    near_wrist = min((p - Vector((sx * 0.065, -0.21, 1.02))).length for sx in (-1, 1))
    return near_wrist > 0.045
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not in_bodice(v)], context='VERTS')
bm.normal_update()
for v in bm.verts:
    v.co += v.normal * 0.01
bm.to_mesh(bodice.data)
bm.free()
dress = nw.mat_cloth('dress', (0.36, 0.36, 0.33), (0.13, 0.11, 0.08), stain_amount=0.52)
nw.assign(bodice, dress)
sol = bodice.modifiers.new('s', 'SOLIDIFY')
sol.thickness = 0.005

bpy.ops.mesh.primitive_grid_add(x_subdivisions=90, y_subdivisions=40, size=1)
skirt = bpy.context.active_object
top_z, bottom_z = 1.1, 0.44
bm = bmesh.new()
bm.from_mesh(skirt.data)
for v in bm.verts:
    u = v.co.x + 0.5
    t = v.co.y + 0.5
    a = math.pi / 2 + u * 2 * math.pi
    rx = 0.31 - 0.2 * t
    ry = 0.28 - 0.19 * t
    v.co = Vector((math.cos(a) * rx, math.sin(a) * ry - 0.01, bottom_z + (top_z - bottom_z) * t))
bm.to_mesh(skirt.data)
bm.free()
pin = skirt.vertex_groups.new(name='pin')
for v in skirt.data.vertices:
    if v.co.z > top_z - 0.05:
        pin.add([v.index], 1.0, 'REPLACE')
nw.assign(skirt, dress)
nw.cloth_drape(skirt, [body], frames=40 if QUICK else 80, pin_group='pin', stiffness=6, thickness=0.004)

# Apron: a clean panel shrink-wrapped over the draped skirt so it follows every fold.
apm = nw.mat_cloth('apron', (0.6, 0.58, 0.52), (0.2, 0.14, 0.08), stain_amount=0.46)
# skirt keeps its thickness as live modifiers (the apron shrinkwraps to the evaluated mesh)
bpy.ops.mesh.primitive_grid_add(x_subdivisions=40, y_subdivisions=60, size=1)
ap = bpy.context.active_object
bm = bmesh.new()
bm.from_mesh(ap.data)
for v in bm.verts:
    t = v.co.y + 0.5
    v.co = Vector((v.co.x * (0.2 + 0.12 * (1 - t)), -0.3, 0.52 + 0.56 * t))
bm.to_mesh(ap.data)
bm.free()
nw.wrap(ap, skirt, 0.006, apm, thickness=0.003, project='Y')
bpy.ops.mesh.primitive_grid_add(x_subdivisions=20, y_subdivisions=24, size=1)
bib = bpy.context.active_object
bib.scale = (0.15, 1, 1)
bib.rotation_euler = (math.radians(90), 0, 0)
bib.location = (0, -0.2, 1.22)
bib.scale = (0.15, 0.25, 1)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
nw.wrap(bib, bodice, 0.004, apm, thickness=0.003, project='Y')
bpy.ops.mesh.primitive_torus_add(major_radius=0.092, minor_radius=0.008, location=(0, 0.0, 1.085))
tie = bpy.context.active_object
tie.scale = (1, 0.82, 1)
nw.assign(tie, apm)

# Chatelaine of keys at the hip.
keys = nw.mat_simple('keys', (0.35, 0.3, 0.22), rough=0.35, metal=1.0)
for k in range(4):
    bpy.ops.mesh.primitive_torus_add(major_radius=0.012, minor_radius=0.0025, location=(0.17, -0.06 - k * 0.004, 0.98 - k * 0.025), rotation=(math.radians(90), random.uniform(-0.5, 0.5), 0))
    nw.assign(bpy.context.active_object, keys)
bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.002, depth=0.12, location=(0.17, -0.06, 1.03))
nw.assign(bpy.context.active_object, keys)

cam = nw.stage(target_height=1.95, camera_angle=math.radians(-28), focal=58)
os.makedirs(OUT, exist_ok=True)
samples = 32 if QUICK else 128
nw.render(os.path.join(OUT, 'nurse_front.png'), samples=samples)
nw.orbit(cam, math.radians(70), 3.2, 1.2, 1.0)
nw.render(os.path.join(OUT, 'nurse_side.png'), samples=samples)
nw.orbit(cam, math.radians(-14), 0.95, 1.76, 1.75)
bpy.context.scene.camera.data.lens = 65
nw.render(os.path.join(OUT, 'nurse_face.png'), w=900, h=900, samples=samples)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'nurse.blend'))
