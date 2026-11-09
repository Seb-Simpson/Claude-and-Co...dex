"""Title-screen corridor (NW-003B): Blender Cycles light passes of the game's own west corridor.

    <blender-python> render_menu.py -- <room104_set.blend> <entity_glb_dir> <out_dir> [pass ...] [--quick]

The set is dressed for the title shot only (nothing here touches the game's Room 104 assets):
grime and water damage, a dropped ceiling tile and a fixture hanging from its wires, a wet floor,
a wheelchair, the Room 104 flag sign, an end wall with an exit sign, and low haze.

Each light group is rendered on its own, as scene-linear EXR, so the browser can
add them back together at any intensity: that is how the title screen flickers, blacks out and
pulses with real light rather than a brightness filter. Passes:

    ambient   fill, Room 104 spill and the haze glow that never goes out
    exit      the exit sign, its downlight and the red light in the stair lobby behind the door
    main_a/b  the hanging fluorescent (mid corridor) at two points of its sway (blending them moves its shadows)
    far       the fluorescent at the far end of the corridor
    figure    ambient + exit with the figure standing in the end doorway
    figure_mask  the figure's coverage (alpha), so the browser can cut it in and out
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../../world/dressing/pipeline'))
import nwset as nw  # noqa: E402
from nwset import g  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:]
SET, GLB, OUT = ARGS[0], ARGS[1], ARGS[2]
ONLY = [a for a in ARGS[3:] if not a.startswith('--')]
QUICK = '--quick' in ARGS
nw.ensure_dir(OUT)

COOL = (0.80, 0.92, 1.0)
RED = (1.0, 0.07, 0.04)
CAMERA = ((-8.3, 1.42, 0.3), (-17.6, 1.22, 4.1), 23.5)
SWAY = {'main_a': -4.5, 'main_b': 4.5}
HZ = -0.6  # the hanging fixture sits off-centre, clear of the exit sign


# Scene ---------------------------------------------------------------------------------------

def setup():
    bpy.ops.wm.open_mainfile(filepath=SET)
    scene = bpy.context.scene
    for ob in bpy.data.collections['occluders'].objects:
        ob.hide_render = True
    world = bpy.data.worlds.new('w')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0, 0, 0, 1)
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 16 if QUICK else 56
    scene.cycles.use_denoising = True
    scene.cycles.volume_step_rate = 4.0
    scene.cycles.volume_max_steps = 256
    scene.cycles.max_bounces = 6
    scene.render.resolution_x, scene.render.resolution_y = (640, 360) if QUICK else (1920, 1080)
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0.0
    # Scene-linear float output: encode_menu.py normalises each pass before it becomes a WebP.
    scene.render.image_settings.file_format = 'OPEN_EXR'
    scene.render.image_settings.color_depth = '16'
    scene.render.image_settings.exr_codec = 'ZIP'
    scene.render.image_settings.color_mode = 'RGB'
    return scene


def principled(name, color, rough, metal=0.0, emission=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emission:
        b.inputs['Emission Color'].default_value = (*emission, 1)
        b.inputs['Emission Strength'].default_value = strength
    return m


def node(nt, kind, **inputs):
    n = nt.nodes.new(kind)
    for k, v in inputs.items():
        if k in n.inputs:
            n.inputs[k].default_value = v
        else:
            setattr(n, k, v)
    return n


def grime(material, amount, streak=1.0, rough_add=0.15, scale=1.0):
    """Multiply water damage, run-off streaks and dirt into a baked material's base colour."""
    nt = material.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    base_in = bsdf.inputs['Base Color']
    src = base_in.links[0].from_socket if base_in.links else None
    geo = node(nt, 'ShaderNodeNewGeometry')
    # Vertical run-off: noise squashed in height becomes long streaks.
    sq = node(nt, 'ShaderNodeMapping')
    sq.inputs['Scale'].default_value = (3.2 * scale, 3.2 * scale, 0.22 * scale)
    nt.links.new(geo.outputs['Position'], sq.inputs['Vector'])
    streaks = node(nt, 'ShaderNodeTexNoise', Scale=2.2, Detail=8.0, Roughness=0.7)
    nt.links.new(sq.outputs['Vector'], streaks.inputs['Vector'])
    sr = node(nt, 'ShaderNodeValToRGB')
    sr.color_ramp.elements[0].position = 0.42
    sr.color_ramp.elements[0].color = (1, 1, 1, 1)
    sr.color_ramp.elements[1].position = 0.78
    sr.color_ramp.elements[1].color = (0.30, 0.26, 0.20, 1)
    nt.links.new(streaks.outputs['Fac'], sr.inputs['Fac'])
    # Blotchy damp patches.
    blot = node(nt, 'ShaderNodeTexNoise', Scale=1.1 * scale, Detail=10.0, Roughness=0.66)
    nt.links.new(geo.outputs['Position'], blot.inputs['Vector'])
    br = node(nt, 'ShaderNodeValToRGB')
    br.color_ramp.elements[0].position = 0.5
    br.color_ramp.elements[1].position = 0.72
    br.color_ramp.elements[1].color = (0.36, 0.32, 0.25, 1)
    br.color_ramp.elements[0].color = (1, 1, 1, 1)
    nt.links.new(blot.outputs['Fac'], br.inputs['Fac'])
    both = node(nt, 'ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
    both.inputs['Factor'].default_value = streak
    nt.links.new(br.outputs['Color'], both.inputs['A'])
    nt.links.new(sr.outputs['Color'], both.inputs['B'])
    mix = node(nt, 'ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
    mix.inputs['Factor'].default_value = amount
    if src is not None:
        nt.links.new(src, mix.inputs['A'])
    else:
        mix.inputs['A'].default_value = base_in.default_value
    nt.links.new(both.outputs['Result'], mix.inputs['B'])
    nt.links.new(mix.outputs['Result'], base_in)
    r = bsdf.inputs['Roughness']
    if not r.links:
        r.default_value = min(1.0, r.default_value + rough_add)


def wet_floor(col):
    """A wet film over the corridor vinyl: puddles that mirror the lights."""
    water = bpy.data.materials.new('menu_water')
    water.use_nodes = True
    nt = water.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = node(nt, 'ShaderNodeOutputMaterial')
    geo = node(nt, 'ShaderNodeNewGeometry')
    mp = node(nt, 'ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (0.55, 1.1, 1.0)
    nt.links.new(geo.outputs['Position'], mp.inputs['Vector'])
    noise = node(nt, 'ShaderNodeTexNoise', Scale=2.1, Detail=9.0, Roughness=0.58)
    nt.links.new(mp.outputs['Vector'], noise.inputs['Vector'])
    ramp = node(nt, 'ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.58
    ramp.color_ramp.elements[1].position = 0.6
    nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    gloss = node(nt, 'ShaderNodeBsdfPrincipled')
    gloss.inputs['Base Color'].default_value = (0.012, 0.014, 0.014, 1)
    gloss.inputs['Roughness'].default_value = 0.035
    gloss.inputs['IOR'].default_value = 1.33
    clear = node(nt, 'ShaderNodeBsdfTransparent')
    mix = node(nt, 'ShaderNodeMixShader')
    nt.links.new(ramp.outputs['Color'], mix.inputs['Fac'])
    nt.links.new(clear.outputs['BSDF'], mix.inputs[1])
    nt.links.new(gloss.outputs['BSDF'], mix.inputs[2])
    nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])
    nw.plane('menu_puddles', col, 13.0, 2.76, (-13.5, 0.003, 0), 'y', water)
    floor = bpy.data.materials['floor_vinyl']
    bsdf = next(n for n in floor.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    rough = bsdf.inputs['Roughness']
    if rough.links:
        mul = node(floor.node_tree, 'ShaderNodeMath', operation='MULTIPLY')
        mul.inputs[1].default_value = 0.3
        floor.node_tree.links.new(rough.links[0].from_socket, mul.inputs[0])
        floor.node_tree.links.new(mul.outputs[0], rough)
    else:
        rough.default_value *= 0.3


def haze(col):
    """Low-lying haze: dense at the floor, thinning towards the ceiling."""
    m = bpy.data.materials.new('menu_haze')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = node(nt, 'ShaderNodeOutputMaterial')
    vol = node(nt, 'ShaderNodeVolumePrincipled')
    vol.inputs['Color'].default_value = (0.75, 0.8, 0.82, 1)
    vol.inputs['Anisotropy'].default_value = 0.45
    geo = node(nt, 'ShaderNodeNewGeometry')
    sep = node(nt, 'ShaderNodeSeparateXYZ')
    nt.links.new(geo.outputs['Position'], sep.inputs['Vector'])
    fall = node(nt, 'ShaderNodeMapRange', clamp=True)
    fall.inputs['From Min'].default_value = 0.0
    fall.inputs['From Max'].default_value = 1.4
    fall.inputs['To Min'].default_value = 0.11
    fall.inputs['To Max'].default_value = 0.012
    nt.links.new(sep.outputs['Z'], fall.inputs['Value'])
    wisps = node(nt, 'ShaderNodeTexNoise', Scale=0.9, Detail=3.0)
    nt.links.new(geo.outputs['Position'], wisps.inputs['Vector'])
    mul = node(nt, 'ShaderNodeMath', operation='MULTIPLY')
    nt.links.new(fall.outputs['Result'], mul.inputs[0])
    nt.links.new(wisps.outputs['Fac'], mul.inputs[1])
    gain = node(nt, 'ShaderNodeMath', operation='MULTIPLY')
    gain.inputs[1].default_value = 1.6
    nt.links.new(mul.outputs[0], gain.inputs[0])
    nt.links.new(gain.outputs[0], vol.inputs['Density'])
    nt.links.new(vol.outputs['Volume'], out.inputs['Volume'])
    nw.box('menu_haze', col, (14.2, 2.66, 2.76), (-13.6, 1.33, 0), mat=m)


def text(name, col, body, size, center, facing_x, mat, extrude=0.004):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body
    cu.size = size
    cu.extrude = extrude
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    ob = bpy.data.objects.new(name, cu)
    col.objects.link(ob)
    ob.data.materials.append(mat)
    # Text lies in Blender XY; stand it up facing game +x (towards the camera).
    ob.rotation_euler = (math.pi / 2, 0, math.pi / 2 if facing_x > 0 else -math.pi / 2)
    ob.location = g(*center)
    return ob


def hang_fixture(name, pivot_x, angle_deg):
    """Swing a ceiling troffer down from one end (its far clips have failed)."""
    ob = bpy.data.objects[name]
    me = ob.data
    pivot = g(pivot_x, 2.69, 0)
    me.transform(Matrix.Translation(-pivot))
    ob.location = pivot
    # Children are parented while level; set_pass applies the hang and sway per render.
    return ob


def dress(scene):
    col = nw.collection('menu_dressing')
    mats = {
        'void': principled('menu_void', (0.004, 0.004, 0.004), 1.0),
        'frame': principled('menu_frame', (0.12, 0.13, 0.12), 0.45, 0.6),
        'sign': principled('menu_sign_plate', (0.02, 0.022, 0.022), 0.35),
        'sign_text': principled('menu_sign_text', (0.75, 0.76, 0.72), 0.4),
        'exit_box': principled('menu_exit_box', (0.05, 0.05, 0.05), 0.5),
        'wire': principled('menu_wire', (0.02, 0.02, 0.02), 0.5),
        'tile': bpy.data.materials['ceiling_tile'],
        'wall': bpy.data.materials['wall_paint'],
        'wainscot': bpy.data.materials['wainscot'],
    }
    for key in ('wall_paint', 'wainscot'):
        grime(bpy.data.materials[key], 0.85 if key == 'wall_paint' else 0.6)
    grime(bpy.data.materials['ceiling_tile'], 0.8, scale=0.6)

    # End wall with a doorway into a stair lobby (dark, lit red by its own emergency lamp).
    for side in (-1, 1):
        nw.box(f'menu_end_{side}', col, (0.2, 2.7, 0.7), (-20.1, 1.35, side * 1.05), mat=mats['wall'])
    nw.box('menu_end_head', col, (0.2, 0.6, 1.4), (-20.1, 2.4, 0), mat=mats['wall'])
    for side in (-1, 1):
        nw.box(f'menu_end_jamb_{side}', col, (0.24, 2.1, 0.06), (-20.05, 1.05, side * 0.7), mat=mats['frame'])
    nw.box('menu_lobby_floor', col, (3.0, 0.02, 3.0), (-21.7, -0.01, 0), mat=mats['void'])
    nw.box('menu_lobby_back', col, (0.1, 3.0, 3.0), (-23.2, 1.5, 0), mat=principled('menu_lobby_wall', (0.08, 0.075, 0.07), 0.8))
    for side in (-1, 1):
        nw.box(f'menu_lobby_side_{side}', col, (3.0, 3.0, 0.1), (-21.7, 1.5, side * 1.5), mat=principled(f'menu_lobby_side_{side}', (0.07, 0.065, 0.06), 0.8))
    nw.box('menu_lobby_ceiling', col, (3.0, 0.1, 3.0), (-21.7, 2.9, 0), mat=mats['void'])

    # Exit sign over the door.
    nw.box('menu_exit_box', col, (0.08, 0.2, 0.46), (-19.97, 2.4, 0), mat=mats['exit_box'])
    exit_face = principled('menu_exit_face', (0.02, 0.0, 0.0), 0.3, emission=RED, strength=0.0)
    nw.plane('menu_exit_face', col, 0.42, 0.16, (-19.925, 2.4, 0), '+x', exit_face)
    exit_text = principled('menu_exit_text', (0.9, 0.9, 0.9), 0.3, emission=(1.0, 0.25, 0.18), strength=0.0)
    text('menu_exit_text', col, 'EXIT', 0.11, (-19.92, 2.39, 0), 1, exit_text, extrude=0.001)

    # Room 104 flag sign, projecting from the wall beside the door.
    nw.box('menu_104_bracket', col, (0.03, 0.03, 0.34), (-11.25, 2.32, 1.23), mat=mats['frame'])
    nw.box('menu_104_plate', col, (0.035, 0.24, 0.34), (-11.25, 2.18, 1.22), mat=mats['sign'])
    text('menu_104_text_e', col, '104', 0.13, (-11.23, 2.18, 1.22), 1, mats['sign_text'], extrude=0.002)

    # Ceiling: a missing tile over the hanging fixture, the tile itself fallen against the wall.
    nw.box('menu_plenum', col, (1.3, 0.5, 0.7), (-14.6, 2.96, HZ + 0.15), mat=mats['void'])
    cut = bpy.data.objects['cor_ceiling']
    hole = nw.box('menu_hole', col, (1.25, 0.2, 0.62), (-14.6, 2.7, HZ + 0.15))
    hole.hide_render = True
    mod = cut.modifiers.new('hole', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = hole
    nw.box('menu_fallen_tile', col, (0.6, 0.018, 0.6), (-9.6, 0.36, -1.12), mat=mats['tile'], rot=(0.0, 0.3, 1.05))
    nw.box('menu_hanging_tile', col, (0.6, 0.016, 0.6), (-11.7, 2.47, -0.75), mat=mats['tile'], rot=(0.0, 0.1, 0.55))
    # Pipes and cable trays visible through the hole.
    nw.cylinder('menu_pipe_a', col, 0.05, 1.6, (-14.6, 3.05, HZ - 0.05), axis='x', mat=mats['frame'])
    nw.cylinder('menu_pipe_b', col, 0.03, 1.6, (-14.6, 3.0, HZ + 0.35), axis='x', mat=mats['frame'])

    # The nearest fluorescent hangs from one end on its wires.
    fixture = hang_fixture('cor_troffer_-14.001', -14.0, 38)
    fixture.location = fixture.location + g(0, 0, HZ)
    diffuser = principled('menu_diffuser', (0.9, 0.95, 1.0), 0.4, emission=COOL, strength=0.0)
    d = nw.plane('menu_diffuser', col, 1.1, 0.5, (-14.6, 2.676, HZ), '-y', diffuser)
    pivot = g(-14.0, 2.69, HZ)
    d.location = d.location - pivot
    d.parent = fixture
    for side in (-1, 1):
        nw.tube(f'menu_wire_{side}', col, [(-14.05, 2.95, HZ + side * 0.25), (-14.02, 2.8, HZ + side * 0.27), (-14.02, 2.68, HZ + side * 0.24)], 0.006, mats['wire'])
    nw.tube('menu_wire_loose', col, [(-14.7, 2.95, HZ + 0.1), (-14.75, 2.55, HZ + 0.2), (-14.9, 2.2, HZ + 0.15), (-14.85, 1.95, HZ + 0.05)], 0.006, mats['wire'])

    # Wheelchair abandoned against the wall, half in shadow, with a sheet over it.
    for ob in bpy.data.collections['wheelchair'].objects:
        ob.location = g(-10.35, 0, 0.98)
        ob.rotation_euler = (0, 0, math.radians(215))
    for ob in (bpy.data.objects.get('sheet'),):
        if ob:
            ob.hide_render = True

    # Far fluorescents get diffusers too.
    far = []
    for x in (-18.2,):
        m = principled(f'menu_diffuser_{x}', (0.9, 0.95, 1.0), 0.4, emission=COOL, strength=0.0)
        nw.plane(f'menu_diffuser_{x}', col, 1.1, 0.5, (x, 2.676, 0), '-y', m)
        far.append(m)

    # A handprint and a smear by the Room 104 door (decal atlas, moved onto the corridor wall).
    hands = bpy.data.objects.get('decal_hands_ceiling')
    if hands:
        h = hands.copy()
        col.objects.link(h)
        h.location = g(-12.85, 1.28, 1.392)
        h.rotation_euler = (math.pi / 2, 0, 0)
        h.scale = (0.8, 0.8, 0.8)
    haze(col)
    wet_floor(col)
    return {'fixture': fixture, 'diffuser': diffuser, 'far': far, 'exit_face': exit_face, 'exit_text': exit_text}


def emit(material, strength):
    b = material.node_tree.nodes['Principled BSDF']
    b.inputs['Emission Strength'].default_value = strength


def light(scene, name, pos, size, power, color, kind='AREA', rot=(0, 0, 0), parent=None):
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
    if parent is not None:
        ob.location = ob.location - parent.location
        ob.parent = parent
    return ob


def rig(scene, parts):
    L = {}
    L['fill'] = light(scene, 'fill', (-9.8, 2.55, -0.9), (1.2, 0.6), 2.5, (0.55, 0.68, 0.75))
    L['spill'] = light(scene, 'r104', (-13.4, 2.6, 3.6), (1.1, 0.5), 9, (0.62, 0.8, 0.85))
    L['exit_down'] = light(scene, 'exit_down', (-19.82, 2.22, 0), (0.42, 0.1), 7, RED, rot=(0, math.radians(-35), 0))
    L['lobby'] = light(scene, 'lobby', (-21.6, 2.6, 0.5), (0.4,), 30, (1.0, 0.1, 0.06), kind='POINT')
    L['main'] = light(scene, 'main', (-14.6, 2.66, HZ), (1.1, 0.45), 85, COOL, parent=parts['fixture'])
    L['far_a'] = light(scene, 'far_a', (-18.2, 2.66, 0), (1.1, 0.45), 30, COOL)
    return L


def camera(scene):
    pos, target, lens = CAMERA
    data = bpy.data.cameras.new('cam')
    data.lens = lens
    data.dof.use_dof = True
    data.dof.aperture_fstop = 4.0
    cam = bpy.data.objects.new('cam', data)
    scene.collection.objects.link(cam)
    cam.location = g(*pos)
    d = g(*target) - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    data.dof.focus_distance = 5.5
    scene.camera = cam


def figure():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(GLB, 'watcher.glb'))
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == 'ARMATURE')
    root = arm
    while root.parent:
        root = root.parent
    action = next((a for a in bpy.data.actions if 'pose2' in a.name), None)
    if action:
        arm.animation_data_create()
        for t in list(arm.animation_data.nla_tracks):
            arm.animation_data.nla_tracks.remove(t)
        arm.animation_data.action = action
        slots = getattr(action, 'slots', None)
        if slots and len(slots):
            arm.animation_data.action_slot = slots[0]
    bpy.context.scene.frame_set(1)
    root.location = g(-18.9, 0, 0.1)
    v = g(*CAMERA[0]) - root.location
    root.rotation_euler = (root.rotation_euler.x, root.rotation_euler.y, math.atan2(-v.x, v.y))
    meshes = [o for o in new if o.type == 'MESH']
    for o in meshes:
        o.pass_index = 7
    return new


def set_pass(name, L, parts, figure_objs):
    on = {
        'ambient': {'fill', 'spill'},
        'exit': {'exit_down', 'lobby'},
        'main_a': {'main'}, 'main_b': {'main'},
        'far': {'far_a'},
        'figure': {'fill', 'spill', 'exit_down', 'lobby'},
    }[name]
    for key, ob in L.items():
        ob.hide_render = key not in on
    emit(parts['diffuser'], 3.0 if name.startswith('main') else 0.0)
    for m in parts['far']:
        emit(m, 2.5 if name == 'far' else 0.0)
    lit_exit = name in ('exit', 'figure')
    emit(parts['exit_face'], 1.2 if lit_exit else 0.0)
    emit(parts['exit_text'], 9.0 if lit_exit else 0.0)
    if name in SWAY:
        parts['fixture'].rotation_euler = (math.radians(SWAY[name]), math.radians(-38), 0)
    else:
        parts['fixture'].rotation_euler = (0, math.radians(-38), 0)
    for o in figure_objs:
        o.hide_render = name != 'figure'


def render_mask(scene, figure_objs):
    """figure_mask: the figure's coverage as alpha (everything else held out)."""
    keep = set(figure_objs)
    saved = {}
    for ob in scene.objects:
        if ob.type in ('MESH', 'CURVE', 'FONT') and ob not in keep:
            saved[ob.name] = (ob.is_holdout, ob.hide_render)
            ob.is_holdout = True
            if ob.name == 'menu_haze':
                ob.hide_render = True
    for o in figure_objs:
        o.hide_render = False
    scene.render.film_transparent = True
    scene.render.image_settings.color_mode = 'RGBA'
    samples = scene.cycles.samples
    scene.cycles.samples = 16
    scene.render.filepath = os.path.join(OUT, 'figure_mask.exr')
    bpy.ops.render.render(write_still=True)
    scene.cycles.samples = samples
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = 'RGB'
    for name, (holdout, hidden) in saved.items():
        ob = scene.objects[name]
        ob.is_holdout, ob.hide_render = holdout, hidden
    print('NW_PASS figure_mask', flush=True)


scene = setup()
parts = dress(scene)
L = rig(scene, parts)
camera(scene)
figure_objs = figure()
for name in ('ambient', 'exit', 'main_a', 'main_b', 'far', 'figure'):
    if ONLY and name not in ONLY:
        continue
    set_pass(name, L, parts, figure_objs)
    scene.render.filepath = os.path.join(OUT, f'{name}.exr')
    bpy.ops.render.render(write_still=True)
    print('NW_PASS', name, flush=True)
if not ONLY or 'figure_mask' in ONLY:
    render_mask(scene, figure_objs)
