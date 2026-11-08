"""THE CRAWLER — prone, starved body dragging itself on hyperextended arms; jaw hanging open."""
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
random.seed(11)
nw.reset()
E3 = nw.ellipsoid

J, E = [], []
def j(p, r):
    J.append((p, r if isinstance(r, tuple) else (r, r)))
    return len(J) - 1
def chain(*idx):
    for a, b in zip(idx, idx[1:]):
        E.append((a, b))

# Spine runs from the hips (on the floor, behind) up and forward to the shoulders.
pelvis = j((0, 0.32, 0.15), (0.13, 0.09))
lumbar = j((0, 0.17, 0.2), (0.095, 0.075))
ribs_lo = j((0, 0.03, 0.27), (0.13, 0.1))
ribs_hi = j((0, -0.11, 0.34), (0.145, 0.105))
upper = j((0, -0.23, 0.39), (0.135, 0.095))
neck0 = j((0, -0.33, 0.42), 0.045)
neck1 = j((0, -0.43, 0.41), 0.04)
neck2 = j((0, -0.5, 0.38), 0.045)
chain(pelvis, lumbar, ribs_lo, ribs_hi, upper, neck0, neck1, neck2)
hands = []
for s in (-1, 1):
    sh0 = j((s * 0.09, -0.24, 0.41), 0.048)
    sh = j((s * 0.17, -0.24, 0.4), 0.055)
    delt = j((s * 0.23, -0.235, 0.44), 0.05)
    bic = j((s * 0.32, -0.22, 0.49), 0.042)
    el = j((s * 0.42, -0.21, 0.5), 0.034)
    fore = j((s * 0.44, -0.33, 0.33), 0.036)
    fore2 = j((s * 0.445, -0.43, 0.17), 0.03)
    wr = j((s * 0.45, -0.5, 0.06), 0.027)
    chain(upper, sh0, sh, delt, bic, el, fore, fore2, wr)
    hands.append((s, Vector((s * 0.45, -0.5, 0.06))))
    hip = j((s * 0.085, 0.36, 0.14), 0.078)
    thigh = j((s * 0.12, 0.56, 0.1), 0.065)
    knee = j((s * 0.15, 0.78, 0.06), 0.045)
    shin = j((s * 0.16, 0.98, 0.07), 0.042)
    ankle = j((s * 0.16, 1.18, 0.08), 0.028)
    toe = j((s * 0.165, 1.3, 0.025), (0.03, 0.016))
    chain(pelvis, hip, thigh, knee, shin, ankle, toe)
body = nw.skin_body('crawler_body', J, E, root=pelvis, subdiv=2)

forms = [body,
         E3('cranium', (0, -0.58, 0.42), (0.062, 0.088, 0.072), rot=(math.radians(-20), 0, 0)),
         E3('face', (0, -0.635, 0.375), (0.048, 0.042, 0.058)),
         E3('jaw', (0, -0.64, 0.3), (0.038, 0.05, 0.022), rot=(math.radians(-35), 0, 0)),
         E3('nose', (0, -0.676, 0.38), (0.007, 0.01, 0.017)),
         E3('brow', (0, -0.66, 0.41), (0.044, 0.011, 0.01))]
# Vertebrae and shoulder blades break the skin along the back.
for k in range(12):
    t = k / 11
    p = Vector((0, 0.3, 0.235)).lerp(Vector((0, -0.2, 0.47)), t)
    forms.append(E3('vert', tuple(p), (0.016, 0.018, 0.014), segments=10, rings=8))
for s in (-1, 1):
    forms.append(E3('scapula', (s * 0.1, -0.16, 0.44), (0.05, 0.065, 0.016), rot=(math.radians(-20), 0, math.radians(s * 12))))
    forms.append(E3('forearm_m', (s * 0.443, -0.36, 0.29), (0.038, 0.04, 0.06), rot=(math.radians(35), 0, 0)))
    forms.append(E3('kneecap', (s * 0.15, 0.78, 0.025), (0.03, 0.034, 0.02)))
for s, w in hands:
    forms.append(E3('palm', tuple(w + Vector((0, -0.045, -0.03))), (0.032, 0.055, 0.017)))
    forms.append(nw.tube_curve('wristbridge', [tuple(w + Vector((0, 0.02, 0.03))), tuple(w), tuple(w + Vector((0, -0.04, -0.03)))], 0.022, taper_end=0.8))
    for f in range(5):
        a = math.radians(-40 + f * 20) * s
        base = w + Vector((0, -0.08, -0.034))
        d = Vector((math.sin(a), -math.cos(a), 0))
        length = 0.15 if f != 0 else 0.1
        pts = [base, base + d * length * 0.45 + Vector((0, 0, 0.018)), base + d * length * 0.85 + Vector((0, 0, 0.004)), base + d * length + Vector((0, 0, -0.012))]
        forms.append(nw.tube_curve('finger', [tuple(p) for p in pts], 0.0065, taper_end=0.55))
        forms.append(E3('knuckle', tuple(pts[1]), (0.009, 0.009, 0.009), segments=8, rings=6))
body = nw.remesh_union(forms, 'crawler', voxel=0.005 if QUICK else 0.0038, smooth_iterations=4, smooth_factor=0.5)

# Sculpt: sockets, hollow belly and flanks, deep rib grooves, open mouth cavity.
for ex in (-0.028, 0.028):
    nw.push(body, (ex, -0.672, 0.393), 0.026, (0, 1, 0.1), 0.02)
nw.push(body, (0, -0.675, 0.325), 0.032, (0, 1, 0.2), 0.024)
for k in range(6):
    p = Vector((0, 0.08, 0.2)).lerp(Vector((0, -0.2, 0.33)), k / 5)
    for s in (-1, 1):
        nw.push(body, (s * 0.1, p.y, p.z - 0.06), 0.035, (-s * 0.6, 0, 1), 0.006)
nw.push(body, (0, 0.18, 0.12), 0.08, (0, 0, 1), 0.02)
nw.displace(body, 0.003, 0.025, name='pores')
nw.apply_all(body)
skin = nw.mat_skin('crawler_skin', (0.12, 0.122, 0.11), (0.07, 0.06, 0.062), rough=0.3, sss=0.15)
nw.assign(body, skin)

dark = nw.mat_simple('void', (0.004, 0.002, 0.002), rough=0.1)
throat = E3('throat', (0, -0.655, 0.325), (0.026, 0.02, 0.034), rot=(math.radians(-20), 0, 0))
nw.assign(throat, dark)
for ex in (-0.028, 0.028):
    e = E3('eye', (ex * 0.95, -0.655, 0.393), (0.011, 0.007, 0.008))
    nw.assign(e, nw.mat_simple('eyewet', (0.02, 0.018, 0.016), rough=0.02))
teeth = nw.mat_simple('teeth', (0.16, 0.13, 0.08), rough=0.4)
for k in range(7):
    a = (k - 3) * 0.32
    t = E3('tooth', (math.sin(a) * 0.024, -0.672 + abs(math.sin(a)) * 0.01, 0.348), (0.0032, 0.003, 0.0065), segments=8, rings=6)
    nw.assign(t, teeth)

# Torn rags knotted around the hips.
rag = nw.mat_cloth('rag', (0.16, 0.16, 0.14), (0.07, 0.05, 0.03), stain_amount=0.4)
r1 = nw.band('rag', (0, 0.33, 0.16), 0.2, 0.12, tilt=(math.radians(80), 0, 0), segments=64, rings=8)
nw.wrap(r1, body, 0.006, rag, thickness=0.004, noise=0.006)
hair = nw.mat_hair('hair', (0.02, 0.018, 0.015))
for i in range(0 if QUICK else 45):
    a = random.uniform(-1.4, 1.4)
    top = Vector((math.sin(a) * 0.06, -0.57 + random.uniform(-0.03, 0.05), 0.49 + math.cos(a) * 0.01))
    pts = [top]
    for k in range(1, 5):
        t = k / 4
        pts.append(top + Vector((math.sin(a) * 0.05 * t, 0.06 * t, -0.18 * t * (0.6 + abs(math.sin(a))) + random.uniform(-0.01, 0.01))))
    nw.tube_curve(f'h{i}', [tuple(p) for p in pts], 0.0011, hair, taper_end=0.4)

cam = nw.stage(target_height=0.9, camera_angle=math.radians(-35), focal=40, distance=2.2)
nw.orbit(cam, math.radians(-35), 2.3, 0.75, 0.25)
os.makedirs(OUT, exist_ok=True)
samples = 32 if QUICK else 128
nw.render(os.path.join(OUT, 'crawler_front.png'), w=1400, h=900, samples=samples)
nw.orbit(cam, math.radians(95), 2.6, 0.55, 0.25)
nw.render(os.path.join(OUT, 'crawler_side.png'), w=1400, h=900, samples=samples)
cam.location = (0.32, -1.25, 0.42)
cam.rotation_euler = (Vector((0, -0.63, 0.37)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam.data.lens = 70
nw.render(os.path.join(OUT, 'crawler_face.png'), w=900, h=900, samples=samples)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'crawler.blend'))
