"""Shared helpers for the NIGHT WARD Room 104 visual prototype (Blender 5.x, `bpy` module).

Game space is Y-up (three.js); Blender is Z-up. Everything here is authored in *game*
coordinates and converted with `g()`: game (x, y, z) -> Blender (x, -z, y). The glTF exporter
converts back, so exported meshes land exactly on the game's coordinates.
"""
import math
import os

import bpy
import bmesh  # noqa: E402  (bmesh needs bpy imported first)
from mathutils import Matrix, Vector

# ---------------------------------------------------------------------------------------------
# Scene and coordinates


def g(x, y, z):
    """Game (Y-up) point -> Blender (Z-up) vector."""
    return Vector((x, -z, y))


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 64
    scene.unit_settings.system = 'METRIC'
    return scene


def collection(name):
    col = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    return col


def link(obj, col):
    for c in obj.users_collection:
        c.objects.unlink(obj)
    col.objects.link(obj)
    return obj


def mesh_object(name, bm, col, material=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    if material:
        ob.data.materials.append(material)
    return ob


def apply_all(ob):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def select_only(objs):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def join(objs, name):
    select_only(objs)
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    return ob


# ---------------------------------------------------------------------------------------------
# Primitive builders (game-space placement). Every builder returns a Blender object.


def box(name, col, size, center, yaw=0.0, mat=None, bevel=0.0, segments=2, rot=(0.0, 0.0, 0.0)):
    """Axis-aligned box in game space: size (sx, sy, sz), centre (x, y, z), yaw about game Y."""
    sx, sy, sz = size
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((sx, sz, sy)), verts=bm.verts)
    ob = mesh_object(name, bm, col, mat)
    if bevel > 0:
        m = ob.modifiers.new('bevel', 'BEVEL')
        m.width = bevel
        m.segments = segments
        m.limit_method = 'ANGLE'
        apply_all(ob)
    ob.rotation_mode = 'XYZ'
    ob.rotation_euler = (rot[0], -rot[2], yaw + rot[1])
    ob.location = g(*center)
    return ob


def cylinder(name, col, radius, height, center, axis='y', mat=None, verts=16, yaw=0.0, radius2=None, cap=True):
    """Cylinder in game space; axis 'y' (vertical), 'x' or 'z'."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=verts,
                          radius1=radius, radius2=radius if radius2 is None else radius2, depth=height)
    ob = mesh_object(name, bm, col, mat)
    if axis == 'x':
        ob.rotation_euler = (0, math.pi / 2, yaw)
    elif axis == 'z':
        ob.rotation_euler = (math.pi / 2, 0, yaw)
    else:
        ob.rotation_euler = (0, 0, yaw)
    ob.location = g(*center)
    return ob


def tube(name, col, points, radius, mat=None, resolution=6, bevel_res=2):
    """A curved tube through game-space points (cables, IV line, rails)."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = radius
    cu.bevel_resolution = bevel_res
    cu.resolution_u = resolution
    sp = cu.splines.new('BEZIER')
    sp.bezier_points.add(len(points) - 1)
    for bp, p in zip(sp.bezier_points, points):
        bp.co = g(*p)
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    ob = bpy.data.objects.new(name, cu)
    col.objects.link(ob)
    if mat:
        ob.data.materials.append(mat)
    select_only([ob])
    bpy.ops.object.convert(target='MESH')
    return bpy.context.view_layer.objects.active


def plane(name, col, w, d, center, normal='y', mat=None, cuts=0):
    """Rectangle: normal 'y' (floor, faces up), '-y' (ceiling, faces down), '+z'/'-z'/'+x'/'-x' walls."""
    bm = bmesh.new()
    bm.loops.layers.uv.new('UVMap')
    bmesh.ops.create_grid(bm, x_segments=cuts + 1, y_segments=cuts + 1, size=0.5, calc_uvs=True)
    bmesh.ops.scale(bm, vec=Vector((w, d, 1)), verts=bm.verts)
    ob = mesh_object(name, bm, col, mat)
    rot = {
        'y': (0, 0, 0), '-y': (math.pi, 0, 0),
        # Grid normal is Blender +Z (game +y). Game +z is Blender -Y; game +x is Blender +X.
        '+z': (math.pi / 2, 0, 0), '-z': (math.pi / 2, 0, math.pi),
        '+x': (math.pi / 2, 0, math.pi / 2), '-x': (math.pi / 2, 0, -math.pi / 2),
    }[normal]
    ob.rotation_euler = rot
    ob.location = g(*center)
    return ob


def wall_skin(name, col, axis, at, a0, a1, y0, y1, facing, openings, mat, inset=0.004):
    """Wall face rectangle with rectangular openings, as a polygon grid (no booleans).

    axis 'x': wall runs along game X at z=at; facing +1 means the face looks toward +z.
    axis 'z': wall runs along game Z at x=at; facing +1 means the face looks toward +x.
    openings: list of (from, to, bottom, top) along the run.
    """
    cuts_a = sorted({a0, a1, *[v for o in openings for v in (max(a0, o[0]), min(a1, o[1]))]})
    cuts_y = sorted({y0, y1, *[v for o in openings for v in (o[2], o[3]) if y0 < v < y1]})
    bm = bmesh.new()
    off = at + facing * inset
    grid = {}
    for i, a in enumerate(cuts_a):
        for j, y in enumerate(cuts_y):
            p = (a, y, off) if axis == 'x' else (off, y, a)
            grid[(i, j)] = bm.verts.new(g(*p))
    for i in range(len(cuts_a) - 1):
        for j in range(len(cuts_y) - 1):
            am, ym = (cuts_a[i] + cuts_a[i + 1]) / 2, (cuts_y[j] + cuts_y[j + 1]) / 2
            if any(o[0] < am < o[1] and o[2] < ym < o[3] for o in openings):
                continue
            quad = [grid[(i, j)], grid[(i + 1, j)], grid[(i + 1, j + 1)], grid[(i, j + 1)]]
            f = bm.faces.new(quad)
            f.normal_update()
    bm.normal_update()
    want = Vector((0, -facing, 0)) if axis == 'x' else Vector((facing, 0, 0))
    for f in bm.faces:
        if f.normal.dot(want) < 0:
            f.normal_flip()
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    return mesh_object(name, bm, col, mat)


# ---------------------------------------------------------------------------------------------
# UVs


def world_uvs(ob, scale=1.0, layer='UVMap'):
    """Planar metric UVs per face (box projection): 1 UV unit = `scale` metres. For tiling materials."""
    me = ob.data
    if layer not in me.uv_layers:
        me.uv_layers.new(name=layer)
    uv = me.uv_layers[layer]
    mw = ob.matrix_world
    for poly in me.polygons:
        n = (mw.to_3x3() @ poly.normal).normalized()
        ax = max(range(3), key=lambda k: abs(n[k]))
        for li in poly.loop_indices:
            co = mw @ me.vertices[me.loops[li].vertex_index].co
            if ax == 2:      # floor/ceiling (Blender Z) -> game x/z
                u, v = co.x, co.y
            elif ax == 1:    # wall facing Blender Y (game Z) -> along x, up
                u, v = co.x * (1 if n[1] < 0 else -1), co.z
            else:            # wall facing X -> along y, up
                u, v = co.y * (-1 if n[0] < 0 else 1), co.z
            uv.data[li].uv = (u / scale, v / scale)


def lightmap_uvs(objs, margin=0.004, name='lightmap'):
    """Unique non-overlapping layout across objects for the baked light/occlusion map (TEXCOORD_1)."""
    for ob in objs:
        me = ob.data
        if name not in me.uv_layers:
            me.uv_layers.new(name=name)
        me.uv_layers.active = me.uv_layers[name]
    select_only(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=margin, area_weight=1.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=margin, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')


def atlas_uvs(objs, margin=0.003, name='UVMap'):
    for ob in objs:
        me = ob.data
        if name not in me.uv_layers:
            me.uv_layers.new(name=name)
        me.uv_layers.active = me.uv_layers[name]
    select_only(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margin, area_weight=0.6, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=margin, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')


# ---------------------------------------------------------------------------------------------
# Procedural materials (Principled BSDF). `pbr()` builds a material from a small recipe of noise
# layers so prop surfaces get colour variation, grime, wear and micro-normal detail that bakes
# into the atlas.


def _n(nt, kind, loc, **inputs):
    node = nt.nodes.new(kind)
    node.location = loc
    for k, v in inputs.items():
        if k in node.inputs:
            node.inputs[k].default_value = v
        else:
            setattr(node, k, v)
    return node


def pbr(name, color, rough=0.6, metal=0.0, grime=0.25, grime_scale=6.0, speck=0.0, bump=0.15, bump_scale=120.0,
        wear_color=None, wear=0.0, streaks=0.0, clearcoat=0.0, emission=None, emission_strength=0.0, alpha=1.0,
        transmission=0.0, weave=0.0):
    """Physically based procedural material with grime/wear/micro detail."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for nd in list(nt.nodes):
        nt.nodes.remove(nd)
    out = _n(nt, 'ShaderNodeOutputMaterial', (900, 0))
    bsdf = _n(nt, 'ShaderNodeBsdfPrincipled', (600, 0))
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    tex = _n(nt, 'ShaderNodeTexCoord', (-1200, 0))
    base = _n(nt, 'ShaderNodeRGB', (-400, 300))
    base.outputs[0].default_value = (*color, 1)
    col_out = base.outputs[0]
    # Large-scale grime: darkens and warms the colour.
    gn = _n(nt, 'ShaderNodeTexNoise', (-900, 200), Scale=grime_scale, Detail=6.0, Roughness=0.62)
    nt.links.new(tex.outputs['Object'], gn.inputs['Vector'])
    gr = _n(nt, 'ShaderNodeValToRGB', (-650, 200))
    gr.color_ramp.elements[0].position = 0.35
    gr.color_ramp.elements[1].position = 0.75
    mix = _n(nt, 'ShaderNodeMix', (-150, 250), data_type='RGBA', blend_type='MULTIPLY')
    mix.inputs['Factor'].default_value = grime
    nt.links.new(gr.outputs['Color'], mix.inputs['B'])
    nt.links.new(col_out, mix.inputs['A'])
    nt.links.new(gn.outputs['Fac'], gr.inputs['Fac'])
    col_out = mix.outputs['Result']
    if speck > 0:
        sv = _n(nt, 'ShaderNodeTexVoronoi', (-900, 450), Scale=180.0)
        nt.links.new(tex.outputs['Object'], sv.inputs['Vector'])
        sr = _n(nt, 'ShaderNodeValToRGB', (-650, 450))
        sr.color_ramp.elements[0].position = 0.0
        sr.color_ramp.elements[0].color = (0.75, 0.75, 0.75, 1)
        sr.color_ramp.elements[1].position = 0.12
        sr.color_ramp.elements[1].color = (1, 1, 1, 1)
        nt.links.new(sv.outputs['Distance'], sr.inputs['Fac'])
        ms = _n(nt, 'ShaderNodeMix', (0, 400), data_type='RGBA', blend_type='MULTIPLY')
        ms.inputs['Factor'].default_value = speck
        nt.links.new(col_out, ms.inputs['A'])
        nt.links.new(sr.outputs['Color'], ms.inputs['B'])
        col_out = ms.outputs['Result']
    if wear > 0 and wear_color is not None:
        wn = _n(nt, 'ShaderNodeTexNoise', (-900, -250), Scale=grime_scale * 3.5, Detail=10.0, Roughness=0.7)
        nt.links.new(tex.outputs['Object'], wn.inputs['Vector'])
        wr = _n(nt, 'ShaderNodeValToRGB', (-650, -250))
        wr.color_ramp.elements[0].position = 1.0 - wear
        wr.color_ramp.elements[1].position = min(1.0, 1.0 - wear + 0.04)
        nt.links.new(wn.outputs['Fac'], wr.inputs['Fac'])
        mw = _n(nt, 'ShaderNodeMix', (150, 150), data_type='RGBA')
        mw.inputs['B'].default_value = (*wear_color, 1)
        nt.links.new(wr.outputs['Color'], mw.inputs['Factor'])
        nt.links.new(col_out, mw.inputs['A'])
        col_out = mw.outputs['Result']
    if streaks > 0:
        st = _n(nt, 'ShaderNodeTexWave', (-900, -500), Scale=3.0, Distortion=6.0, Detail=4.0, wave_type='BANDS', bands_direction='Z')
        nt.links.new(tex.outputs['Object'], st.inputs['Vector'])
        sr2 = _n(nt, 'ShaderNodeValToRGB', (-650, -500))
        sr2.color_ramp.elements[0].color = (0.55, 0.5, 0.42, 1)
        nt.links.new(st.outputs['Fac'], sr2.inputs['Fac'])
        mt = _n(nt, 'ShaderNodeMix', (300, 100), data_type='RGBA', blend_type='MULTIPLY')
        mt.inputs['Factor'].default_value = streaks
        nt.links.new(col_out, mt.inputs['A'])
        nt.links.new(sr2.outputs['Color'], mt.inputs['B'])
        col_out = mt.outputs['Result']
    if weave > 0:
        wv = _n(nt, 'ShaderNodeTexWave', (-900, -700), Scale=260.0, wave_type='BANDS', bands_direction='X')
        wv2 = _n(nt, 'ShaderNodeTexWave', (-900, -850), Scale=260.0, wave_type='BANDS', bands_direction='Y')
        nt.links.new(tex.outputs['Object'], wv.inputs['Vector'])
        nt.links.new(tex.outputs['Object'], wv2.inputs['Vector'])
        wm = _n(nt, 'ShaderNodeMath', (-650, -750), operation='MULTIPLY')
        nt.links.new(wv.outputs['Fac'], wm.inputs[0])
        nt.links.new(wv2.outputs['Fac'], wm.inputs[1])
    nt.links.new(col_out, bsdf.inputs['Base Color'])
    # Roughness varies with the grime noise.
    rr = _n(nt, 'ShaderNodeMapRange', (300, -150), **{'From Min': 0.0, 'From Max': 1.0, 'To Min': max(0.02, rough - 0.12), 'To Max': min(1.0, rough + 0.14)})
    nt.links.new(gn.outputs['Fac'], rr.inputs['Value'])
    nt.links.new(rr.outputs['Result'], bsdf.inputs['Roughness'])
    bsdf.inputs['Metallic'].default_value = metal
    if clearcoat > 0:
        bsdf.inputs['Coat Weight'].default_value = clearcoat
    if transmission > 0:
        bsdf.inputs['Transmission Weight'].default_value = transmission
    if emission is not None:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1)
        bsdf.inputs['Emission Strength'].default_value = emission_strength
    if alpha < 1:
        bsdf.inputs['Alpha'].default_value = alpha
    # Micro surface: noise bump (+ cloth weave).
    bn = _n(nt, 'ShaderNodeTexNoise', (-900, -1000), Scale=bump_scale, Detail=8.0)
    nt.links.new(tex.outputs['Object'], bn.inputs['Vector'])
    bmp = _n(nt, 'ShaderNodeBump', (300, -400), Strength=bump, Distance=0.002)
    if weave > 0:
        ad = _n(nt, 'ShaderNodeMath', (-400, -900), operation='ADD')
        nt.links.new(bn.outputs['Fac'], ad.inputs[0])
        nt.links.new(wm.outputs['Value'], ad.inputs[1])
        nt.links.new(ad.outputs['Value'], bmp.inputs['Height'])
    else:
        nt.links.new(bn.outputs['Fac'], bmp.inputs['Height'])
    nt.links.new(bmp.outputs['Normal'], bsdf.inputs['Normal'])
    return m


def image_material(name, albedo, normal=None, rough=None, rough_value=0.6, metal=0.0, lightmap=None, uv='UVMap', alpha_blend=False,
                   emissive=None, emissive_strength=1.0):
    """Game-facing material from image textures. `lightmap` goes to glTF occlusion on UV 'lightmap'."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for nd in list(nt.nodes):
        nt.nodes.remove(nd)
    out = _n(nt, 'ShaderNodeOutputMaterial', (900, 0))
    bsdf = _n(nt, 'ShaderNodeBsdfPrincipled', (600, 0))
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    uvn = _n(nt, 'ShaderNodeUVMap', (-700, 0))
    uvn.uv_map = uv

    def img(path, loc, non_color=False):
        node = _n(nt, 'ShaderNodeTexImage', loc)
        node.image = bpy.data.images.load(path, check_existing=True)
        if non_color:
            node.image.colorspace_settings.name = 'Non-Color'
        nt.links.new(uvn.outputs['UV'], node.inputs['Vector'])
        return node
    a = img(albedo, (-300, 300))
    nt.links.new(a.outputs['Color'], bsdf.inputs['Base Color'])
    if alpha_blend:
        nt.links.new(a.outputs['Alpha'], bsdf.inputs['Alpha'])
        m.surface_render_method = 'BLENDED'
    if normal:
        n_img = img(normal, (-300, -300), True)
        nm = _n(nt, 'ShaderNodeNormalMap', (200, -300))
        nt.links.new(n_img.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    if rough:
        r_img = img(rough, (-300, 0), True)
        sep = _n(nt, 'ShaderNodeSeparateColor', (100, 0))
        nt.links.new(r_img.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
        nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    else:
        bsdf.inputs['Roughness'].default_value = rough_value
        bsdf.inputs['Metallic'].default_value = metal
    if emissive:
        e_img = img(emissive, (-300, -600))
        nt.links.new(e_img.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = emissive_strength
    if lightmap:
        grp = gltf_output_group()
        gnode = nt.nodes.new('ShaderNodeGroup')
        gnode.node_tree = grp
        gnode.location = (600, -400)
        lm_uv = _n(nt, 'ShaderNodeUVMap', (-700, -800))
        lm_uv.uv_map = 'lightmap'
        lm = _n(nt, 'ShaderNodeTexImage', (-300, -800))
        lm.image = bpy.data.images.load(lightmap, check_existing=True)
        lm.image.colorspace_settings.name = 'Non-Color'
        nt.links.new(lm_uv.outputs['UV'], lm.inputs['Vector'])
        sep2 = _n(nt, 'ShaderNodeSeparateColor', (100, -800))
        nt.links.new(lm.outputs['Color'], sep2.inputs['Color'])
        nt.links.new(sep2.outputs['Red'], gnode.inputs['Occlusion'])
    return m


def gltf_output_group():
    grp = bpy.data.node_groups.get('glTF Material Output')
    if grp:
        return grp
    grp = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    grp.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    grp.interface.new_socket('Thickness', in_out='INPUT', socket_type='NodeSocketFloat')
    return grp


# ---------------------------------------------------------------------------------------------
# Baking


def new_image(name, size, color=(0, 0, 0, 1), non_color=False, alpha=False, float_buffer=False):
    img = bpy.data.images.get(name)
    if img:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(name, size, size, alpha=alpha, float_buffer=float_buffer)
    img.generated_color = color
    if non_color:
        img.colorspace_settings.name = 'Non-Color'
    return img


def set_bake_target(objs, img, uv_name):
    """Add/activate an image node (the bake target) in every material of the objects."""
    for ob in objs:
        me = ob.data
        me.uv_layers.active = me.uv_layers[uv_name]
        for slot in ob.material_slots:
            m = slot.material
            nt = m.node_tree
            node = nt.nodes.get('__bake__') or nt.nodes.new('ShaderNodeTexImage')
            node.name = '__bake__'
            node.image = img
            for nd in nt.nodes:
                nd.select = False
            node.select = True
            nt.nodes.active = node


def clear_bake_nodes(objs):
    for ob in objs:
        for slot in ob.material_slots:
            nt = slot.material.node_tree
            nd = nt.nodes.get('__bake__')
            if nd:
                nt.nodes.remove(nd)


def bake(objs, img, kind, uv_name, samples=32, margin=8, pass_filter=None):
    scene = bpy.context.scene
    scene.cycles.samples = samples
    set_bake_target(objs, img, uv_name)
    select_only(objs)
    kw = dict(type=kind, margin=margin, use_clear=True)
    if pass_filter is not None:
        kw['pass_filter'] = pass_filter
    bpy.ops.object.bake(**kw)
    clear_bake_nodes(objs)


def save(img, path, fmt='PNG', quality=90):
    img.filepath_raw = path
    img.file_format = fmt
    scene = bpy.context.scene
    if fmt == 'JPEG':
        scene.render.image_settings.quality = quality
    img.save()
    return path


def ensure_dir(path):
    os.makedirs(path, exist_ok=True)
    return path
