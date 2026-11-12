"""NIGHT WARD asset pipeline step 2: sculpt -> game-ready, skinned, animated GLB.

  python rig_and_export.py -- <entity> <sculpt.blend> <poses.json> <out_dir> [--quick]

1. Clean the sculpt scene, convert curve hair to light mesh strips, rotate to face +Y
   (glTF/three.js -Z, matching gameplay entity nodes).
2. Decimate every part to a budget and skin it to a 19-joint skeleton (bone sets per part:
   gowns follow hips/legs, hair and bandages follow the head...).
3. Join into one mesh, UV-unwrap, bake the procedural Cycles materials (with their ambient
   occlusion) and the sculpted detail into one colour atlas and one normal map.
4. Retarget the sampled clips onto the sculpt's skeleton through world-space rotations and a
   per-bone alignment from the procedural rig's rest pose; solve floor contact per frame.
5. Export GLB (in-place clips, no root motion) + manifest entry, and save the game .blend.
"""
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

args = sys.argv[sys.argv.index('--') + 1:]
ENTITY, SRC, POSES, OUT = args[:4]
QUICK = '--quick' in args
os.makedirs(OUT, exist_ok=True)

JOINTS = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'upperArmL', 'forearmL', 'handL', 'shoulderR', 'upperArmR', 'forearmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR']
PARENT = {'hips': None, 'spine': 'hips', 'chest': 'spine', 'neck': 'chest', 'head': 'neck', 'shoulderL': 'chest', 'upperArmL': 'shoulderL', 'forearmL': 'upperArmL', 'handL': 'forearmL', 'shoulderR': 'chest', 'upperArmR': 'shoulderR', 'forearmR': 'upperArmR', 'handR': 'forearmR', 'thighL': 'hips', 'shinL': 'thighL', 'footL': 'shinL', 'thighR': 'hips', 'shinR': 'thighR', 'footR': 'shinR'}
# Bone direction in the procedural rig's rest pose (three.js axes, model facing -Z).
UP, DOWN, FWD = Vector((0, 1, 0)), Vector((0, -1, 0)), Vector((0, 0, -1))
TS_DIR = {'hips': UP, 'spine': UP, 'chest': UP, 'neck': UP, 'head': UP, 'upperArmL': DOWN, 'forearmL': DOWN, 'handL': DOWN, 'upperArmR': DOWN, 'forearmR': DOWN, 'handR': DOWN, 'thighL': DOWN, 'shinL': DOWN, 'footL': FWD, 'thighR': DOWN, 'shinR': DOWN, 'footR': FWD}
# Where each bone points in the sculpt (child joint or an explicit end point).
CHILD = {'hips': 'spine', 'spine': 'chest', 'chest': 'neck', 'neck': 'head', 'head': 'headEnd', 'upperArmL': 'forearmL', 'forearmL': 'handL', 'handL': 'handEndL', 'upperArmR': 'forearmR', 'forearmR': 'handR', 'handR': 'handEndR', 'thighL': 'shinL', 'shinL': 'footL', 'footL': 'toeL', 'thighR': 'shinR', 'shinR': 'footR', 'footR': 'toeR', 'shoulderL': 'upperArmL', 'shoulderR': 'upperArmR'}

def sym(table):
    """Expand {'nameL': (x,y,z)} into L and R joints (pre-rotation Blender coords; +X is the left)."""
    out = {}
    for k, v in table.items():
        if k.endswith('L') and k[:-1] + 'R' not in table:
            out[k] = v
            out[k[:-1] + 'R'] = (-v[0], v[1], v[2])
        else:
            out[k] = v
    return out

RIGS = {
    'patient': dict(joints=sym({
        'hips': (0, 0, 1.08), 'spine': (0, 0.005, 1.22), 'chest': (0, -0.035, 1.5), 'neck': (0, -0.12, 1.71), 'head': (0, -0.245, 1.98), 'headEnd': (0, -0.25, 2.2),
        'shoulderL': (0.09, -0.065, 1.63), 'upperArmL': (0.172, -0.045, 1.6), 'forearmL': (0.218, 0.02, 1.2), 'handL': (0.248, -0.055, 0.8), 'handEndL': (0.255, -0.08, 0.6),
        'thighL': (0.085, 0, 1.03), 'shinL': (0.1, -0.06, 0.56), 'footL': (0.1, 0, 0.08), 'toeL': (0.106, -0.175, 0.02)}),
        contacts=[('footL', (0.1, 0.06, 0.0)), ('footL', (0.106, -0.19, 0.0)), ('footR', (-0.1, 0.06, 0.0)), ('footR', (-0.106, -0.19, 0.0))],
        budget=dict(body=9000, garment=2600, small=200), roughness=0.55, texture=1024, hair_keep=3),
    'nurse': dict(joints=sym({
        'hips': (0, 0, 0.96), 'spine': (0, 0, 1.08), 'chest': (0, -0.005, 1.22), 'neck': (0, -0.015, 1.53), 'head': (-0.06, -0.04, 1.72), 'headEnd': (-0.06, -0.03, 1.9),
        'shoulderL': (0.08, -0.01, 1.46), 'upperArmL': (0.16, 0, 1.43), 'forearmL': (0.215, 0.025, 1.19), 'handL': (0.065, -0.21, 1.02), 'handEndL': (0.015, -0.24, 0.96),
        'thighL': (0.08, 0, 0.92), 'shinL': (0.085, -0.02, 0.5), 'footL': (0.085, 0.01, 0.075), 'toeL': (0.085, -0.15, 0.03)}),
        contacts=[('footL', (0.085, 0.05, 0.0)), ('footL', (0.085, -0.15, 0.0)), ('footR', (-0.085, 0.05, 0.0)), ('footR', (-0.085, -0.15, 0.0))],
        budget=dict(body=7800, garment=1500, small=160), roughness=0.62, texture=1024, hair_keep=1),
    'crawler': dict(joints=sym({
        'hips': (0, 0.32, 0.15), 'spine': (0, 0.17, 0.2), 'chest': (0, -0.11, 0.34), 'neck': (0, -0.33, 0.42), 'head': (0, -0.5, 0.38), 'headEnd': (0, -0.68, 0.37),
        'shoulderL': (0.09, -0.24, 0.41), 'upperArmL': (0.17, -0.24, 0.4), 'forearmL': (0.42, -0.21, 0.5), 'handL': (0.45, -0.5, 0.06), 'handEndL': (0.45, -0.64, 0.01),
        'thighL': (0.085, 0.36, 0.14), 'shinL': (0.15, 0.78, 0.06), 'footL': (0.16, 1.18, 0.08), 'toeL': (0.165, 1.3, 0.025)}),
        contacts=[('handL', (0.45, -0.64, 0.0)), ('handR', (-0.45, -0.64, 0.0)), ('shinL', (0.15, 0.78, 0.01)), ('shinR', (-0.15, 0.78, 0.01)), ('footL', (0.165, 1.3, 0.0)), ('footR', (-0.165, 1.3, 0.0))],
        budget=dict(body=9500, garment=1800, small=240), roughness=0.38, texture=1024, hair_keep=0),
    'watcher': dict(joints=sym({
        'hips': (0, 0, 1.22), 'spine': (0, 0, 1.38), 'chest': (0, 0, 1.55), 'neck': (0, 0, 1.84), 'head': (0, -0.015, 2.16), 'headEnd': (0, -0.03, 2.42),
        'shoulderL': (0.1, 0, 1.77), 'upperArmL': (0.2, 0, 1.75), 'forearmL': (0.225, 0.005, 1.28), 'handL': (0.23, -0.005, 0.85), 'handEndL': (0.23, -0.01, 0.6),
        'thighL': (0.085, 0, 1.17), 'shinL': (0.09, -0.01, 0.62), 'footL': (0.09, 0, 0.08), 'toeL': (0.09, -0.17, 0.03)}),
        contacts=[('footL', (0.09, 0.05, 0.0)), ('footL', (0.09, -0.2, 0.0)), ('footR', (-0.09, 0.05, 0.0)), ('footR', (-0.09, -0.2, 0.0))],
        budget=dict(body=6500, garment=2200, small=260), roughness=0.75, texture=1024, hair_keep=1),
    'reflection': dict(joints=sym({
        'hips': (0, 0, 0.95), 'spine': (0, 0, 1.08), 'chest': (0, -0.01, 1.22), 'neck': (0, -0.03, 1.47), 'head': (0.045, -0.06, 1.61), 'headEnd': (0.134, -0.07, 1.8),
        'shoulderL': (0.08, -0.02, 1.4), 'upperArmL': (0.155, -0.02, 1.4), 'forearmL': (0.18, 0, 1.15), 'handL': (0.19, -0.03, 0.9), 'handEndL': (0.19, -0.04, 0.76),
        'thighL': (0.08, 0, 0.9), 'shinL': (0.085, -0.02, 0.5), 'footL': (0.085, 0, 0.07), 'toeL': (0.085, -0.1, 0.0)}),
        contacts=[('footL', (0.085, 0.0, 0.0)), ('footR', (-0.085, 0.0, 0.0))],
        budget=dict(body=7000, garment=2200, small=200), roughness=0.5, texture=1024, hair_keep=3),
}
CFG = RIGS[ENTITY]
ROT = Matrix.Rotation(math.pi, 4, 'Z')
J = {k: (ROT @ Vector(v).to_4d()).to_3d() for k, v in CFG['joints'].items()}
CONTACTS = [(b, (ROT @ Vector(p).to_4d()).to_3d()) for b, p in CFG['contacts']]

bpy.ops.wm.open_mainfile(filepath=SRC)
scene = bpy.context.scene
STAGE = ('Plane', 'cam', 'key', 'rim', 'fill', 'Cube', 'crack')
# The Nurse's cap fold is a bevelled cube named 'Cube' (a head part, see HEAD_ONLY): not staging.
KEEP = ('Cube',) if ENTITY == 'nurse' else ()
for o in list(bpy.data.objects):
    if o.type in ('LIGHT', 'CAMERA') or (o.name.startswith(STAGE) and not o.name.startswith(KEEP)):
        bpy.data.objects.remove(o, do_unlink=True)
if ENTITY == 'reflection':  # undo the mirror-shot staging
    for o in bpy.data.objects:
        if o.name.startswith(('reflection', 'gown', 'hairs', 'lid', 'lash', 'mouth', 'Torus')):
            o.rotation_euler.z = 0
            o.location.x -= 0.28
            o.location.y -= -0.22

# ---- Hair curves -> light mesh strips (thinned).
curves = [o for o in bpy.data.objects if o.type == 'CURVE']
for i, c in enumerate(curves):
    if CFG['hair_keep'] == 0 or i % CFG['hair_keep']:
        bpy.data.objects.remove(c, do_unlink=True)
        continue
    c.data.bevel_resolution = 0
    c.data.resolution_u = 3
    c.data.bevel_depth *= 1.4
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.data.objects:
    if o.type == 'CURVE':
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
if any(o.type == 'CURVE' for o in bpy.data.objects):
    bpy.ops.object.convert(target='MESH')

# ---- Game-mesh sources: garments without their thickness/smoothing (decimate cleanly, drawn
# double-sided); bake sources keep every modifier.
SOURCES = {}
for o in [o for o in bpy.data.objects if o.type == 'MESH']:
    if any(m.type in ('SOLIDIFY', 'SUBSURF') for m in o.modifiers):
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.duplicate()
        src = bpy.context.active_object
        src.name = 'SRC_' + o.name
        for m in list(src.modifiers):
            if m.type in ('SOLIDIFY', 'SUBSURF'):
                src.modifiers.remove(m)
        SOURCES[o.name] = src.name

# ---- Apply modifiers, rotate to face +Y, bake transforms.
# NW-007B: two passes. Applying each object's modifiers and rotating it in the same loop let a
# shrink-wrap be applied AFTER its target had already been rotated (object order is not creation
# order: 'nurse' sorts before 'SRC_bandage'), so the game-mesh copies of the blindfold, cap and
# hair wrapped onto the side of the rotated head. Every modifier is now applied against the
# untouched sculpt first; only then is everything rotated.
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in meshes:
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=m.name)
        except RuntimeError:
            o.modifiers.remove(m)
for o in meshes:
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    o.matrix_world = ROT @ o.matrix_world
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
highs = [o for o in bpy.data.objects if o.type == 'MESH' and len(o.data.polygons) > 0 and not o.name.startswith('SRC_')]


def nw_debug(stage, objs):
    """NW_DEBUG=1: world-space bounding-box centre of each head-height part at an export stage."""
    if not os.environ.get('NW_DEBUG'):
        return
    for o in objs:
        pts = [o.matrix_world @ v.co for v in o.data.vertices]
        if not pts or max(p.z for p in pts) < 1.55:
            continue
        lo = [min(p[i] for p in pts) for i in range(3)]
        hi = [max(p[i] for p in pts) for i in range(3)]
        print('NW_DEBUG', stage, o.name, 'centre', tuple(round((lo[i] + hi[i]) / 2, 3) for i in range(3)), 'size', tuple(round(hi[i] - lo[i], 3) for i in range(3)))


nw_debug('applied', [o for o in bpy.data.objects if o.type == 'MESH'])

def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)

def kind(o):
    n = o.name
    if n.split('.')[0] == ENTITY:
        return 'body'
    if tris(o) > 20000:
        return 'garment'
    return 'small'

HEAD_ONLY = ('hair', 'eye', 'mouth', 'glint', 'lid', 'lash', 'tooth', 'teeth', 'throat', 'knot', 'cap', 'bandage', 'Cube')
def bone_set(o):
    n = o.name.lower()
    if n.startswith('h') and n[1:2].isdigit():  # converted hair strands
        return ['head', 'neck']
    # Names are compared lower-case ('Cube', the Nurse's cap fold, never matched before).
    if n.startswith(tuple(x.lower() for x in HEAD_ONLY)) or 'hair' in n:
        # NW-007B: the Nurse's hair is a scalp shell and bun shrink-wrapped to the head (no loose
        # hair over the neck): head-only, so it cannot slide against the cap and the blindfold.
        return ['head', 'neck'] if 'hair' in n and ENTITY != 'nurse' else ['head']
    if 'shroud' in n:
        return ['head', 'neck', 'chest', 'shoulderL', 'shoulderR', 'upperArmL', 'upperArmR']
    # NW-007B: the Nurse's hip accessories (chatelaine rings, keys, pocket) hang from the hips; with
    # all joints they took forearm weights from the clasped hands and lifted with them.
    if ENTITY == 'nurse' and n.startswith(('torus', 'cylinder', 'grid')) and kind(o) == 'small':
        centre = sum((v.co for v in o.data.vertices), Vector()) / max(1, len(o.data.vertices))
        # The apron bib sits on the chest; the tie and the keys hang at the hips.
        return ['spine', 'chest'] if centre.z > 1.15 else ['hips', 'spine', 'thighL', 'thighR']
    if n.startswith(('skirt', 'grid', 'rag')) and kind(o) != 'small':
        if ENTITY == 'watcher' and n.startswith('grid'):
            return ['hips', 'spine', 'thighL', 'thighR', 'shinL', 'shinR']
        return ['hips', 'spine', 'thighL', 'thighR', 'shinL', 'shinR']
    return JOINTS

# Bone segments for weighting.
def segment(b):
    a = J[b]
    end = J.get(CHILD.get(b, ''), a + Vector((0, 0, 0.05)))
    return a, end

def dist_to_seg(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-9, ab.length_squared)))
    return (a + ab * t - p).length

lows = []
for h in highs:
    k = kind(h)
    target = CFG['budget'][k]
    bpy.ops.object.select_all(action='DESELECT')
    base = bpy.data.objects.get(SOURCES.get(h.name, ''), h)
    base.select_set(True)
    bpy.context.view_layer.objects.active = base
    bpy.ops.object.duplicate()
    low = bpy.context.active_object
    low.name = 'LOW_' + h.name
    t0 = tris(low)
    print('NW_PART', h.name, k, t0, '->', min(t0, target))
    if t0 > target:
        d = low.modifiers.new('dec', 'DECIMATE')
        d.ratio = target / t0
        d.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier='dec')
    # Skin weights: nearest bone segments (top 3, inverse 4th power) within this part's bone set.
    bones = bone_set(h)
    groups = {b: low.vertex_groups.new(name=b) for b in JOINTS}
    segs = {b: segment(b) for b in bones}
    ARM = ('shoulder', 'upperArm', 'forearm', 'hand')
    def on_surface(v, b):
        # NW-007B (Nurse only): forearms and hands may not own anything hugging the torso below the
        # chest (dress, apron), so those stay with the trunk when the arms lift.
        if ENTITY != 'nurse' or not b.startswith(ARM):
            return True
        return not (b.startswith(('forearm', 'hand')) and v.co.z < J['chest'].z and
                    min(dist_to_seg(v.co, *segment(t)) for t in ('hips', 'spine')) < 0.145)
    head_z = J['head'].z - 0.06  # chin level
    for v in low.data.vertices:
        if ENTITY == 'nurse' and kind(h) == 'body' and 'head' in bones and v.co.z > head_z - 0.03:
            # NW-007B: the face and cranium move rigidly with the head bone, exactly like the blindfold,
            # cap and hair (head-only parts). Blended toward the neck, the face lagged behind its
            # blindfold whenever she turned her head. Short blend under the chin.
            k = min(1.0, max(0.0, (v.co.z - (head_z - 0.03)) / 0.05))
            groups['head'].add([v.index], k, 'REPLACE')
            if k < 1.0:
                groups['neck'].add([v.index], 1.0 - k, 'REPLACE')
            continue
        ds = sorted(((dist_to_seg(v.co, *segs[b]), b) for b in bones if on_surface(v, b)))[:3]
        ws = [(1.0 / (d + 0.004) ** 4, b) for d, b in ds]
        total = sum(w for w, _ in ws)
        for w, b in ws:
            if w / total > 0.02:
                groups[b].add([v.index], w / total, 'REPLACE')
    lows.append(low)
    nw_debug('low', [low])
    if ENTITY == 'nurse':
        # NW-007B: tag each part (glTF custom attribute _NW_PART) so tests can check that the
        # face coverings stay on the face: 0 skin, 1 dress/other, 2 blindfold, 3 cap, 4 hair/knot.
        n = h.name.lower()
        part = 2 if n.startswith('bandage') else 3 if n.startswith(('cap', 'cube')) else 4 if n.startswith(('hair', 'knot')) else 0 if n.split('.')[0] == ENTITY and n == ENTITY else 1
        attr = low.data.attributes.new('_NW_PART', 'FLOAT', 'POINT')
        attr.data.foreach_set('value', [float(part)] * len(low.data.vertices))
    h.hide_render = False

# ---- Join lows, unwrap, bake colour + normal from the sculpt.
bpy.ops.object.select_all(action='DESELECT')
for l in lows:
    l.select_set(True)
bpy.context.view_layer.objects.active = lows[0]
bpy.ops.object.join()
game = bpy.context.active_object
game.name = f'{ENTITY}_mesh'
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003, area_weight=0.6)
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.shade_smooth()

size = 512 if QUICK else CFG['texture']
albedo = bpy.data.images.new(f'{ENTITY}_albedo', size, size)
normal = bpy.data.images.new(f'{ENTITY}_normal', size, size)
normal.colorspace_settings.name = 'Non-Color'
normal.pixels.foreach_set([0.5, 0.5, 1.0, 1.0] * (size * size))  # flat where a ray misses
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 4 if QUICK else 16
bake = scene.render.bake
bake.margin = 8
# Colour: evaluate each part's own procedural material directly on the game mesh (no ray misses).
for slot in game.material_slots:
    m = slot.material
    if not m or not m.use_nodes:
        continue
    n = m.node_tree.nodes.new('ShaderNodeTexImage')
    n.image = albedo
    m.node_tree.nodes.active = n
bpy.ops.object.select_all(action='DESELECT')
game.select_set(True)
bpy.context.view_layer.objects.active = game
bake.use_selected_to_active = False
# NW-007B: the high-poly sources lie on (almost) the same surface as the game mesh. Left renderable,
# they occluded the skin material's ambient-occlusion term in a noisy pattern during this colour
# bake (the black-and-white streaks on the Nurse's face and neck). Hide them for the colour bake
# only; the normal bake below still projects from them.
for h in highs:
    h.hide_render = True
bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'})
for h in highs:
    h.hide_render = False
# Normal: project the sculpt's detail onto the game mesh.
mat = bpy.data.materials.new(f'{ENTITY}_game')
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes['Principled BSDF']
img_node = nt.nodes.new('ShaderNodeTexImage')
img_node.image = albedo
nrm_node = nt.nodes.new('ShaderNodeTexImage')
nrm_node.image = normal
game.data.materials.clear()
game.data.materials.append(mat)
nt.nodes.active = nrm_node
bake.use_selected_to_active = True
bake.cage_extrusion = 0.03
bake.max_ray_distance = 0.12
bpy.ops.object.select_all(action='DESELECT')
for h in highs:
    h.select_set(True)
game.select_set(True)
bpy.context.view_layer.objects.active = game
bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')
for img, name in ((albedo, 'albedo'), (normal, 'normal')):
    img.filepath_raw = os.path.join(OUT, f'{ENTITY}_{name}.png')
    img.file_format = 'PNG'
    img.save()
    img.pack()
nmap = nt.nodes.new('ShaderNodeNormalMap')
nmap.inputs['Strength'].default_value = 0.8
nt.links.new(img_node.outputs['Color'], bsdf.inputs['Base Color'])
nt.links.new(nrm_node.outputs['Color'], nmap.inputs['Color'])
nt.links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
bsdf.inputs['Roughness'].default_value = CFG['roughness']
bsdf.inputs['Metallic'].default_value = 0.0
for h in highs:
    bpy.data.objects.remove(h, do_unlink=True)
for o in list(bpy.data.objects):
    if o.name.startswith('SRC_'):
        bpy.data.objects.remove(o, do_unlink=True)
mat.use_backface_culling = False

# ---- Skeleton: bones at the joints, all pointing up (+Z).
arm_data = bpy.data.armatures.new(f'{ENTITY}_rig')
rig = bpy.data.objects.new(f'{ENTITY}_rig', arm_data)
scene.collection.objects.link(rig)
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
for b in JOINTS:
    eb = arm_data.edit_bones.new(b)
    eb.head = J[b]
    eb.tail = J[b] + Vector((0, 0, 0.06))
    eb.use_deform = True
for b in JOINTS:
    if PARENT[b]:
        arm_data.edit_bones[b].parent = arm_data.edit_bones[PARENT[b]]
        arm_data.edit_bones[b].use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')
game.parent = rig
mod = game.modifiers.new('rig', 'ARMATURE')
mod.object = rig

# ---- Contact points from the real mesh: the lowest vertices skinned to each contact bone, plus the
# front-most and back-most of those near the floor (toe and heel), so the clamp grounds actual geometry.
contact_bones = sorted({b for b, _ in CONTACTS})
CONTACTS = []
for b in contact_bones:
    gi = game.vertex_groups[b].index
    verts = [v.co.copy() for v in game.data.vertices if any(g.group == gi and g.weight > 0.5 for g in v.groups)]
    if not verts:
        # Covered feet (a hem hides them): use whatever the leg chain carries, e.g. the hem itself.
        chain = {game.vertex_groups[n].index for n in (b, b.replace('foot', 'shin'), b.replace('foot', 'thigh')) if n in game.vertex_groups}
        verts = [v.co.copy() for v in game.data.vertices if sum(g.weight for g in v.groups if g.group in chain) > 0.5]
    if not verts:
        continue
    zmin = min(v.z for v in verts)
    near = [v for v in verts if v.z < zmin + 0.02]
    idx = range(len(near))
    picks = {min(idx, key=lambda i: near[i].z), min(idx, key=lambda i: near[i].y), max(idx, key=lambda i: near[i].y),
             min(idx, key=lambda i: near[i].x), max(idx, key=lambda i: near[i].x)}
    CONTACTS += [(b, near[i].copy()) for i in sorted(picks)]
print('NW_CONTACTS', [(b, round(p.z, 3)) for b, p in CONTACTS])

# ---- Retarget clips.
M = Quaternion((1, 0, 0), math.radians(90))  # three.js axes -> Blender axes
Minv = M.inverted()
def to_blender_q(q):
    return M @ Quaternion((q[3], q[0], q[1], q[2])) @ Minv
def to_blender_v(v):
    return Vector((v[0], -v[2], v[1]))
A = {}
for b in JOINTS:
    if b in TS_DIR and CHILD.get(b) in J:
        A[b] = (M @ TS_DIR[b]).rotation_difference((J[CHILD[b]] - J[b]).normalized())
    else:
        A[b] = Quaternion()
REST = {b: arm_data.bones[b].matrix_local.to_quaternion() for b in JOINTS}
data = json.load(open(POSES))
scene.render.fps = data['fps']
manifest = {'entity': ENTITY, 'clips': []}
pb = rig.pose.bones
for b in JOINTS:
    pb[b].rotation_mode = 'QUATERNION'
min_contact_all = []
for clip in data['entities'][ENTITY]['clips']:
    action = bpy.data.actions.new(clip['name'])
    action.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = action
    prev = {}
    for f, frame in enumerate(clip['frames']):
        D = {b: to_blender_q(frame['q'][b]) @ A[b].inverted() for b in JOINTS}
        offset = to_blender_v(frame['o'])
        P = {'hips': J['hips'] + offset}
        for b in JOINTS[1:]:
            p = PARENT[b]
            P[b] = P[p] + D[p] @ (J[b] - J[p])
        lowest = min((P[b] + D[b] @ (pt - J[b])).z for b, pt in CONTACTS)
        min_contact_all.append(lowest)
        P['hips'].z -= lowest
        for b in JOINTS:
            p = PARENT[b]
            q = REST[b].inverted() @ (D[p].inverted() if p else Quaternion()) @ D[b] @ REST[b]
            if b in prev and prev[b].dot(q) < 0:
                q.negate()
            prev[b] = q
            pb[b].rotation_quaternion = q
            pb[b].keyframe_insert('rotation_quaternion', frame=f + 1)
        pb['hips'].location = REST['hips'].inverted() @ (P['hips'] - J['hips'])
        pb['hips'].keyframe_insert('location', frame=f + 1)
    action.frame_range = (1, len(clip['frames']))
    manifest['clips'].append({k: clip[k] for k in ('name', 'state', 'duration', 'loop', 'speed', 'cycles', 'steps')})
rig.animation_data.action = bpy.data.actions['idle'] if 'idle' in bpy.data.actions else bpy.data.actions[0]

# ---- Export.
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
game.select_set(True)
bpy.context.view_layer.objects.active = rig
glb = os.path.join(OUT, f'{ENTITY}.glb')
bpy.ops.export_scene.gltf(
    filepath=glb, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
    export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True, export_frame_step=1,
    export_skins=True, export_def_bones=True, export_morph=False, export_image_format='JPEG', export_jpeg_quality=82,
    export_optimize_animation_size=True, export_reset_pose_bones=True, export_materials='EXPORT',
    export_attributes=(ENTITY == 'nurse'),
)
bbox = [rig.matrix_world @ Vector(c) for c in game.bound_box]
manifest.update({
    'glb': f'{ENTITY}.glb', 'triangles': tris(game), 'vertices': len(game.data.vertices), 'bytes': os.path.getsize(glb),
    'texture': size, 'height': max(v.z for v in bbox), 'bones': JOINTS,
})
json.dump(manifest, open(os.path.join(OUT, f'{ENTITY}.manifest.json'), 'w'), indent=1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f'{ENTITY}_game.blend'), compress=True)
print('NW_DONE', json.dumps({k: manifest[k] for k in ('triangles', 'bytes', 'height')}))
