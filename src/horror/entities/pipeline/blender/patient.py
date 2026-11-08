"""THE PATIENT — tall, emaciated, hunched, too-long arms, draped hospital gown."""
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
random.seed(4)
nw.reset()

J, E = [], []
def j(p, r):
    J.append((p, r if isinstance(r, tuple) else (r, r)))
    return len(J) - 1
def chain(*idx):
    for a, b in zip(idx, idx[1:]):
        E.append((a, b))

# ---- Skeleton of tubes: torso, neck, limbs (head and hands are sculpted separately).
pelvis = j((0, 0.0, 1.08), (0.12, 0.09))
waist = j((0, 0.005, 1.22), (0.088, 0.07))
ribs_lo = j((0, -0.01, 1.36), (0.118, 0.088))
ribs_hi = j((0, -0.035, 1.5), (0.135, 0.095))
upper = j((0, -0.075, 1.61), (0.125, 0.085))
neck0 = j((0, -0.12, 1.71), 0.048)
neck1 = j((0, -0.18, 1.81), 0.04)
neck2 = j((0, -0.225, 1.89), 0.042)
neck3 = j((0, -0.245, 1.96), 0.046)
neck4 = j((0, -0.245, 2.02), 0.05)
chain(pelvis, waist, ribs_lo, ribs_hi, upper, neck0, neck1, neck2, neck3, neck4)
hands = []
for s in (-1, 1):
    sh0 = j((s * 0.09, -0.065, 1.63), 0.05)
    sh = j((s * 0.172, -0.045, 1.6), 0.047)
    bic = j((s * 0.2, -0.01, 1.4), 0.036)
    el = j((s * 0.218, 0.02, 1.2), 0.031)
    fore = j((s * 0.232, -0.015, 1.0), 0.029)
    wr = j((s * 0.248, -0.055, 0.8), 0.021)
    chain(upper, sh0, sh, bic, el, fore, wr)
    hands.append((s, Vector((s * 0.252, -0.06, 0.8))))
    hip = j((s * 0.085, 0.0, 1.03), 0.072)
    thigh = j((s * 0.094, -0.03, 0.8), 0.058)
    knee = j((s * 0.1, -0.06, 0.56), 0.046)
    calf = j((s * 0.1, -0.02, 0.36), 0.044)
    shin = j((s * 0.1, -0.005, 0.2), 0.034)
    ankle = j((s * 0.1, 0.0, 0.08), 0.03)
    heel = j((s * 0.1, 0.04, 0.035), 0.03)
    ball = j((s * 0.103, -0.11, 0.025), (0.034, 0.02))
    toe = j((s * 0.106, -0.175, 0.02), (0.03, 0.014))
    chain(pelvis, hip, thigh, knee, calf, shin, ankle, ball, toe)
    chain(ankle, heel)
body = nw.skin_body('patient_body', J, E, root=pelvis, subdiv=2)

forms = [body]
E3 = nw.ellipsoid
# ---- Head: a long, narrow skull pushed forward on the neck; heavy brow, hollow cheeks.
forms += [
    E3('cranium', (0, -0.255, 2.09), (0.074, 0.096, 0.12)),
    E3('occiput', (0, -0.22, 2.06), (0.068, 0.07, 0.09)),
    E3('face', (0, -0.295, 2.03), (0.06, 0.058, 0.085)),
    E3('jaw', (0, -0.3, 1.955), (0.05, 0.05, 0.04)),
    E3('chin', (0, -0.335, 1.93), (0.02, 0.018, 0.022)),
    E3('brow', (0, -0.33, 2.096), (0.052, 0.014, 0.013)),
    E3('nose', (0, -0.352, 2.04), (0.009, 0.016, 0.028), rot=(math.radians(-12), 0, 0)),
    E3('earL', (-0.074, -0.245, 2.06), (0.008, 0.016, 0.026)),
    E3('earR', (0.074, -0.245, 2.06), (0.008, 0.016, 0.026)),
    E3('adams', (0, -0.215, 1.82), (0.016, 0.018, 0.022)),
]
# Collarbones, kneecaps, elbow knobs, spine bumps.
for s in (-1, 1):
    forms.append(nw.tube_curve('clav', [(s * 0.02, -0.12, 1.66), (s * 0.09, -0.11, 1.665), (s * 0.165, -0.07, 1.64)], 0.012))
    forms.append(E3('kneecap', (s * 0.1, -0.1, 0.56), (0.034, 0.022, 0.038)))
    forms.append(E3('elbow', (s * 0.218, 0.045, 1.2), (0.022, 0.02, 0.024)))
spine_profile = [(1.08, 0.0, 0.09), (1.22, 0.005, 0.07), (1.36, -0.01, 0.088), (1.5, -0.035, 0.095), (1.61, -0.075, 0.085)]
def back_y(z):
    for (z0, y0, r0), (z1, y1, r1) in zip(spine_profile, spine_profile[1:]):
        if z0 <= z <= z1:
            t = (z - z0) / (z1 - z0)
            return y0 + (y1 - y0) * t + r0 + (r1 - r0) * t
    return 0.08
for k in range(9):
    z = 1.12 + k * 0.057
    forms.append(E3('vert', (0, back_y(z) - 0.004, z), (0.014, 0.012, 0.014), segments=10, rings=8))
# ---- Hands: long palms and over-long, knuckled fingers.
for s, w in hands:
    palm_c = w + Vector((s * 0.006, -0.008, -0.055))
    forms.append(E3('palm', tuple(palm_c), (0.022, 0.012, 0.05)))
    for f in range(4):
        x0 = w.x + s * (-0.012 + f * 0.0095)
        base = Vector((x0, w.y - 0.012, w.z - 0.1))
        curl = 0.012 + f * 0.003
        pts = [base, base + Vector((0, -curl * 0.5, -0.06)), base + Vector((s * 0.002, -curl, -0.115 + f * 0.008)), base + Vector((s * 0.003, -curl * 0.6, -0.16 + f * 0.012))]
        forms.append(nw.tube_curve('finger', [tuple(p) for p in pts], 0.0072, taper_end=0.6))
        for p in pts[1:3]:
            forms.append(E3('knuckle', tuple(p), (0.0085, 0.0085, 0.009), segments=8, rings=6))
    thumb = [w + Vector((s * -0.012, -0.018, -0.04)), w + Vector((s * -0.02, -0.04, -0.08)), w + Vector((s * -0.02, -0.05, -0.115))]
    forms.append(nw.tube_curve('thumb', [tuple(p) for p in thumb], 0.008, taper_end=0.6))

body = nw.remesh_union(forms, 'patient', voxel=0.006 if QUICK else 0.0042, smooth_iterations=6, smooth_factor=0.6)

# ---- Sculpt pass: carve sockets, cheeks, mouth, ribs, sternum, belly.
for ex in (-0.031, 0.031):
    nw.push(body, (ex, -0.345, 2.072), 0.036, (0, 1, 0.1), 0.03)
    nw.push(body, (ex * 1.4, -0.32, 2.02), 0.03, (0, 1, 0), 0.008)
for cx in (-0.05, 0.05):
    nw.push(body, (cx, -0.31, 2.0), 0.03, (0, 1, 0), 0.009)
nw.push(body, (0, -0.352, 1.975), 0.02, (0, 1, 0.2), 0.008)
for k in range(5):
    z = 1.32 + k * 0.052
    for s in (-1, 1):
        nw.push(body, (s * 0.09, -0.11 + k * 0.004, z + 0.02), 0.045, (0, 1, 0), 0.005)
nw.push(body, (0, -0.12, 1.43), 0.05, (0, 1, 0), 0.01)
nw.push(body, (0, -0.07, 1.23), 0.07, (0, 1, 0), 0.016)
for s in (-1, 1):
    nw.push(body, (s * 0.085, -0.135, 1.66), 0.035, (0, 1, 0), 0.008)  # hollow above collarbone
nw.displace(body, strength=0.0035, scale=0.025, name='pores')
nw.apply_all(body)
skin = nw.mat_skin('patient_skin', (0.235, 0.23, 0.205), (0.15, 0.12, 0.13), rough=0.48, sss=0.25)
nw.assign(body, skin)

details = []
dark = nw.mat_simple('void', (0.004, 0.003, 0.003), rough=0.12)
glint = nw.mat_simple('eyewet', (0.012, 0.011, 0.01), rough=0.03)
for ex in (-0.031, 0.031):
    e = E3('eye', (ex, -0.31, 2.068), (0.013, 0.009, 0.01))
    nw.assign(e, glint)
    details.append(e)
m = E3('mouth', (0, -0.343, 1.974), (0.022, 0.004, 0.0035))
nw.assign(m, dark)

# Lank hair: many thin strands from a receding crown.
hair_mat = nw.mat_simple('hair', (0.018, 0.016, 0.014), rough=0.35)
strands = []
for i in range(0 if QUICK else 140):
    a = random.uniform(-2.5, 2.5)
    lift = random.uniform(0, 0.03)
    top = Vector((math.sin(a) * 0.075, -0.24 + math.cos(a) * 0.07 * 0.9 + 0.03, 2.17 - abs(a) * 0.035 - lift))
    if top.y < -0.28:
        continue
    length = random.uniform(0.2, 0.5)
    pts = [top]
    for k in range(1, 6):
        t = k / 5
        pts.append(top + Vector((math.sin(a) * 0.05 * t + random.uniform(-0.012, 0.012), 0.07 * t * (0.5 + abs(math.cos(a))), -length * t)))
    strands.append(nw.tube_curve(f'hair{i}', [tuple(p) for p in pts], 0.0012, hair_mat, taper_end=0.4))

# ---- Wristband and wrapped shin.
band = nw.mat_simple('band', (0.55, 0.53, 0.46), rough=0.6)
bpy.ops.mesh.primitive_torus_add(major_radius=0.024, minor_radius=0.005, location=(-0.247, -0.054, 0.83), rotation=(0, math.radians(8), 0))
nw.assign(bpy.context.active_object, band)
bandage = nw.mat_cloth('bandage', (0.45, 0.42, 0.34), (0.18, 0.11, 0.06), stain_amount=0.42)
for k in range(6):
    bpy.ops.mesh.primitive_torus_add(major_radius=0.043 - k * 0.0015, minor_radius=0.009, location=(0.1, -0.012, 0.22 + k * 0.026), rotation=(math.radians(random.uniform(-14, 14)), math.radians(random.uniform(-10, 10)), 0))
    nw.assign(bpy.context.active_object, bandage)

# ---- Gown: a yoke shrink-wrapped over the shoulders + a cloth-draped skirt.
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.duplicate()
yoke = bpy.context.active_object
yoke.name = 'yoke'
bm = bmesh.new()
bm.from_mesh(yoke.data)
keep = lambda v: 1.22 < v.co.z < 1.69 and abs(v.co.x) < (0.235 if v.co.z > 1.45 else 0.15) and not (v.co.z > 1.66 and abs(v.co.x) < 0.07)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not keep(v)], context='VERTS')
bm.normal_update()
for v in bm.verts:
    v.co += v.normal * 0.012
bm.to_mesh(yoke.data)
bm.free()
yoke.data.update()
gown_mat = nw.mat_cloth('gown', (0.17, 0.22, 0.22), (0.09, 0.07, 0.045), stain_amount=0.48)
nw.assign(yoke, gown_mat)
sol = yoke.modifiers.new('s', 'SOLIDIFY')
sol.thickness = 0.005

# Skirt from a clean grid wrapped into a tube, open down the back like a real hospital gown.
bpy.ops.mesh.primitive_grid_add(x_subdivisions=84, y_subdivisions=44, size=1)
skirt = bpy.context.active_object
skirt.name = 'skirt'
top_z, bottom_z = 1.3, 0.42
gap = 0.35
bm = bmesh.new()
bm.from_mesh(skirt.data)
for v in bm.verts:
    u = v.co.x + 0.5
    t = v.co.y + 0.5  # 0 hem .. 1 top
    a = math.pi / 2 + gap / 2 + u * (2 * math.pi - gap)
    rx = 0.215 - 0.1 * t
    ry = 0.2 - 0.12 * t
    v.co = Vector((math.cos(a) * rx, math.sin(a) * ry - 0.03 * t - 0.01, bottom_z + (top_z - bottom_z) * t))
bm.to_mesh(skirt.data)
bm.free()
skirt.data.update()
pin = skirt.vertex_groups.new(name='pin')
for v in skirt.data.vertices:
    if v.co.z > top_z - 0.06:
        pin.add([v.index], 1.0, 'REPLACE')
nw.assign(skirt, gown_mat)
nw.cloth_drape(skirt, [body], frames=45 if QUICK else 90, pin_group='pin', stiffness=4, thickness=0.004)

cam = nw.stage(target_height=2.3, camera_angle=math.radians(-24), focal=58)
os.makedirs(OUT, exist_ok=True)
samples = 32 if QUICK else 128
nw.render(os.path.join(OUT, 'patient_front.png'), samples=samples)
nw.orbit(cam, math.radians(78), 3.7, 1.4, 1.2)
nw.render(os.path.join(OUT, 'patient_side.png'), samples=samples)
nw.orbit(cam, math.radians(-8), 1.05, 2.02, 2.03)
bpy.context.scene.camera.data.lens = 65
nw.render(os.path.join(OUT, 'patient_face.png'), w=900, h=900, samples=samples)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'patient.blend'))
