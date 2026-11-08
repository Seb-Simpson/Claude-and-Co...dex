"""Shared Blender helpers for NIGHT WARD entity models (headless bpy)."""
import math
import bpy
import bmesh
from mathutils import Vector


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    return scene


def skin_body(name, joints, edges, root=0, subdiv=2, smooth=True):
    """joints: list of ((x,y,z), (rx, ry)); edges: index pairs. Returns object with Skin+Subsurf."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([j[0] for j in joints], edges, [])
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    skin = obj.modifiers.new('skin', 'SKIN')
    skin.use_smooth_shade = smooth
    skin.branch_smoothing = 0.6
    for i, (_, r) in enumerate(joints):
        sv = mesh.skin_vertices[0].data[i]
        sv.radius = (r[0], r[1])
        sv.use_root = (i == root)
    sub = obj.modifiers.new('subsurf', 'SUBSURF')
    sub.levels = subdiv
    sub.render_levels = subdiv
    return obj


def apply_all(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    obj.select_set(False)


def remesh_union(objs, name, voxel=0.006, smooth_iterations=8, smooth_factor=0.5):
    """Join overlapping forms and voxel-remesh them into one seamless sculpt-like surface."""
    for o in objs:
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        if o.type != 'MESH':
            bpy.ops.object.convert(target='MESH')
        for m in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)
    obj = join(objs, name)
    r = obj.modifiers.new('remesh', 'REMESH')
    r.mode = 'VOXEL'
    r.voxel_size = voxel
    r.use_smooth_shade = True
    sm = obj.modifiers.new('smooth', 'SMOOTH')
    sm.iterations = smooth_iterations
    sm.factor = smooth_factor
    apply_all(obj)
    bpy.ops.object.shade_smooth()
    return obj


def push(obj, center, radius, direction, amount, falloff=1.0):
    """Sculpt-style brush: move verts near `center` along `direction` (smooth falloff)."""
    c = Vector(center)
    dvec = Vector(direction).normalized()
    for v in obj.data.vertices:
        d = (v.co - c).length
        if d < radius:
            w = (1 - d / radius) ** (1 + falloff)
            w = w * w * (3 - 2 * w) if falloff == 1.0 else w
            v.co += dvec * amount * w
    obj.data.update()


def displace(obj, strength=0.01, scale=0.15, kind='CLOUDS', name='disp', vgroup=None):
    tex = bpy.data.textures.new(name, kind)
    if kind in ('CLOUDS', 'MUSGRAVE'):
        tex.noise_scale = scale
    if kind == 'VORONOI':
        tex.noise_scale = scale
    mod = obj.modifiers.new(name, 'DISPLACE')
    mod.texture = tex
    mod.strength = strength
    mod.texture_coords = 'GLOBAL'
    if vgroup:
        mod.vertex_group = vgroup
    return mod


def ellipsoid(name, loc, scale, rot=(0, 0, 0), segments=24, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.shade_smooth()
    return o


def tube_curve(name, points, radius, material=None, resolution=6, taper_end=0.3):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    curve.resolution_u = resolution
    spline = curve.splines.new('NURBS')
    spline.points.add(len(points) - 1)
    for i, p in enumerate(points):
        spline.points[i].co = (p[0], p[1], p[2], 1)
        spline.points[i].radius = 1 - (1 - taper_end) * (i / max(1, len(points) - 1))
    spline.use_endpoint_u = True
    spline.order_u = min(4, len(points))
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    if material:
        obj.data.materials.append(material)
    return obj


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


def to_mesh(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    return bpy.context.active_object


# ---------------------------------------------------------------- materials

def _nodes(mat):
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return nt, bsdf


def mat_skin(name, base, blotch, rough=0.62, sss=0.25, wet=0.0):
    mat = bpy.data.materials.new(name)
    nt, b = _nodes(mat)
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 9.0
    noise.inputs['Detail'].default_value = 8.0
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.42
    ramp.color_ramp.elements[0].color = (*base, 1)
    ramp.color_ramp.elements[1].position = 0.72
    ramp.color_ramp.elements[1].color = (*blotch, 1)
    nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    # Crevices (sockets, creases, between ribs) darken: ambient occlusion drives a multiply.
    ao = nt.nodes.new('ShaderNodeAmbientOcclusion')
    ao.inputs['Distance'].default_value = 0.025
    ao.samples = 8
    aoramp = nt.nodes.new('ShaderNodeMapRange')
    aoramp.inputs['From Min'].default_value = 0.2
    aoramp.inputs['From Max'].default_value = 1.0
    aoramp.inputs['To Min'].default_value = 0.12
    aoramp.inputs['To Max'].default_value = 1.0
    nt.links.new(ao.outputs['AO'], aoramp.inputs['Value'])
    mul = nt.nodes.new('ShaderNodeMix')
    mul.data_type = 'RGBA'
    mul.blend_type = 'MULTIPLY'
    mul.inputs['Factor'].default_value = 1.0
    nt.links.new(ramp.outputs['Color'], mul.inputs['A'])
    nt.links.new(aoramp.outputs['Result'], mul.inputs['B'])
    nt.links.new(mul.outputs['Result'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough - wet
    b.inputs['Subsurface Weight'].default_value = sss
    b.inputs['Subsurface Radius'].default_value = (0.6, 0.25, 0.2)
    b.inputs['Subsurface Scale'].default_value = 0.02
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.25
    n2 = nt.nodes.new('ShaderNodeTexNoise')
    n2.inputs['Scale'].default_value = 140.0
    nt.links.new(n2.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    return mat


def mat_cloth(name, base, stain, rough=0.85, pattern=None, stain_amount=0.55):
    mat = bpy.data.materials.new(name)
    nt, b = _nodes(mat)
    coord = nt.nodes.new('ShaderNodeTexCoord')
    stainnoise = nt.nodes.new('ShaderNodeTexNoise')
    stainnoise.inputs['Scale'].default_value = 3.5
    stainnoise.inputs['Detail'].default_value = 10
    nt.links.new(coord.outputs['Object'], stainnoise.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = stain_amount
    ramp.color_ramp.elements[1].position = stain_amount + 0.12
    ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    nt.links.new(stainnoise.outputs['Fac'], ramp.inputs['Fac'])
    # Grime gathers low: mix by object Z.
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(coord.outputs['Object'], sep.inputs['Vector'])
    low = nt.nodes.new('ShaderNodeMapRange')
    low.inputs['From Min'].default_value = 0.9
    low.inputs['From Max'].default_value = 0.2
    nt.links.new(sep.outputs['Z'], low.inputs['Value'])
    add = nt.nodes.new('ShaderNodeMath')
    add.operation = 'MAXIMUM'
    nt.links.new(ramp.outputs['Color'], add.inputs[0])
    nt.links.new(low.outputs['Result'], add.inputs[1])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    nt.links.new(add.outputs['Value'], mix.inputs['Factor'])
    base_socket = mix.inputs['A']
    if pattern:
        wave = nt.nodes.new('ShaderNodeTexChecker')
        wave.inputs['Scale'].default_value = pattern[2]
        wave.inputs['Color1'].default_value = (*base, 1)
        wave.inputs['Color2'].default_value = (*pattern[1], 1)
        nt.links.new(coord.outputs['Object'], wave.inputs['Vector'])
        nt.links.new(wave.outputs['Color'], base_socket)
    else:
        base_socket.default_value = (*base, 1)
    mix.inputs['B'].default_value = (*stain, 1)
    nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    b.inputs['Sheen Weight'].default_value = 0.4
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.15
    weave = nt.nodes.new('ShaderNodeTexNoise')
    weave.inputs['Scale'].default_value = 400
    nt.links.new(weave.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    return mat


def mat_simple(name, color, rough=0.5, metal=0.0, emission=None, strength=0.0, alpha=1.0):
    mat = bpy.data.materials.new(name)
    nt, b = _nodes(mat)
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emission:
        b.inputs['Emission Color'].default_value = (*emission, 1)
        b.inputs['Emission Strength'].default_value = strength
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
    return mat


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


# ---------------------------------------------------------------- cloth

def cloth_drape(cloth, colliders, frames=60, pin_group=None, mass=0.25, stiffness=8, thickness=0.006):
    for c in colliders:
        col = c.modifiers.new('collision', 'COLLISION')
        c.collision.thickness_outer = 0.008
        c.collision.cloth_friction = 6
    mod = cloth.modifiers.new('cloth', 'CLOTH')
    s = mod.settings
    s.quality = 8
    s.mass = mass
    s.tension_stiffness = stiffness
    s.compression_stiffness = stiffness
    s.bending_stiffness = 0.08
    s.air_damping = 2
    if pin_group:
        s.vertex_group_mass = pin_group
    mod.collision_settings.use_self_collision = False
    mod.collision_settings.distance_min = 0.005
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = frames
    mod.point_cache.frame_end = frames
    for f in range(1, frames + 1):
        scene.frame_set(f)
    bpy.context.view_layer.objects.active = cloth
    cloth.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for c in colliders:
        c.modifiers.remove(c.modifiers['collision'])
    sol = cloth.modifiers.new('solid', 'SOLIDIFY')
    sol.thickness = thickness
    sm = cloth.modifiers.new('smooth', 'SUBSURF')
    sm.levels = 1
    sm.render_levels = 1
    bpy.ops.object.shade_smooth()
    return cloth


# ---------------------------------------------------------------- stage & render

def stage(target_height=2.3, camera_angle=0.0, distance=None, focal=60, floor=True, key_strength=160):
    scene = bpy.context.scene
    world = bpy.data.worlds.new('w')
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.006, 0.008, 0.011, 1)
    bg.inputs['Strength'].default_value = 1.0
    if floor:
        bpy.ops.mesh.primitive_plane_add(size=14, location=(0, 0, 0))
        fl = bpy.context.active_object
        fm = bpy.data.materials.new('floor')
        nt, b = _nodes(fm)
        chk = nt.nodes.new('ShaderNodeTexChecker')
        chk.inputs['Scale'].default_value = 23
        chk.inputs['Color1'].default_value = (0.05, 0.053, 0.05, 1)
        chk.inputs['Color2'].default_value = (0.035, 0.038, 0.036, 1)
        nt.links.new(chk.outputs['Color'], b.inputs['Base Color'])
        b.inputs['Roughness'].default_value = 0.35
        fl.data.materials.append(fm)
        # back wall for silhouette read
        bpy.ops.mesh.primitive_plane_add(size=14, location=(0, 3.5, 3), rotation=(math.radians(90), 0, 0))
        wall = bpy.context.active_object
        wm = mat_simple('wall', (0.035, 0.045, 0.043), rough=0.9)
        wall.data.materials.append(wm)
    h = target_height
    d = distance or h * 1.65
    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = focal
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    a = camera_angle
    cam.location = (math.sin(a) * d, -math.cos(a) * d, h * 0.55)
    target = Vector((0, 0, h * 0.5))
    direction = target - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam

    def area(name, loc, energy, color, size, aim=(0, 0, h * 0.55)):
        ld = bpy.data.lights.new(name, 'AREA')
        ld.energy = energy
        ld.color = color
        ld.size = size
        lo = bpy.data.objects.new(name, ld)
        scene.collection.objects.link(lo)
        lo.location = loc
        lo.rotation_euler = (Vector(aim) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        return lo
    # Cold fluorescent key from above-front, sickly rim from behind, faint red emergency fill.
    area('key', (-1.0, -1.4, h + 1.2), key_strength, (0.8, 0.9, 1.0), 0.9)
    area('rim', (1.3, 1.6, h + 0.5), key_strength * 0.9, (0.7, 0.88, 0.85), 0.6)
    area('fill', (2.2, -1.4, 0.7), key_strength * 0.12, (1.0, 0.22, 0.15), 1.0)
    return cam


def render(path, w=900, h=1200, samples=96):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x = w
    scene.render.resolution_y = h
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def orbit(cam, angle, distance, height, target_z):
    cam.location = (math.sin(angle) * distance, -math.cos(angle) * distance, height)
    direction = Vector((0, 0, target_z)) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


def shell(source, predicate, offset, material, thickness=0.004, name='shell', noise=0.0):
    """Copy the faces of `source` whose vertices satisfy predicate(co), push them out along their
    normals and give them thickness: garments, bandages and hair that hug a surface exactly."""
    bpy.ops.object.select_all(action='DESELECT')
    source.select_set(True)
    bpy.context.view_layer.objects.active = source
    bpy.ops.object.duplicate()
    obj = bpy.context.active_object
    obj.name = name
    obj.modifiers.clear()
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not predicate(v.co)], context='VERTS')
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * offset
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    obj.data.materials.clear()
    obj.data.materials.append(material)
    if noise:
        displace(obj, noise, 0.02, name=name + 'n')
    sol = obj.modifiers.new('s', 'SOLIDIFY')
    sol.thickness = thickness
    sol.offset = 1
    return obj


def wrap(obj, target, offset, material, thickness=0.004, subdiv=1, noise=0.0, project=None):
    """Shrinkwrap a clean mesh onto a surface: smooth-edged garments that follow the form.
    `project`: 'X'/'Y'/'Z' to project along an axis (both directions) instead of nearest point."""
    sw = obj.modifiers.new('wrap', 'SHRINKWRAP')
    sw.target = target
    if project:
        sw.wrap_method = 'PROJECT'
        sw.use_project_x = project == 'X'
        sw.use_project_y = project == 'Y'
        sw.use_project_z = project == 'Z'
        sw.use_negative_direction = True
        sw.use_positive_direction = True
    else:
        sw.wrap_method = 'NEAREST_SURFACEPOINT'
    sw.wrap_mode = 'OUTSIDE_SURFACE'
    sw.offset = offset
    if noise:
        displace(obj, noise, 0.02, name=obj.name + 'n')
    sol = obj.modifiers.new('s', 'SOLIDIFY')
    sol.thickness = thickness
    sol.offset = 1
    if subdiv:
        sd = obj.modifiers.new('sd', 'SUBSURF')
        sd.levels = subdiv
        sd.render_levels = subdiv
    obj.data.materials.clear()
    obj.data.materials.append(material)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth()
    return obj


def band(name, center, radius, height, tilt=(0, 0, 0), segments=72, rings=6):
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments, radius=radius, depth=height, end_fill_type='NOTHING', location=center, rotation=tilt)
    o = bpy.context.active_object
    o.name = name
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.subdivide(number_cuts=rings)
    bpy.ops.object.mode_set(mode='OBJECT')
    return o


def cap(name, center, radius, cut_z, scale=(1, 1, 1), rot=(0, 0, 0)):
    """Upper part of a sphere above local z = cut_z * radius."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=32, radius=radius, location=center, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < cut_z * radius], context='VERTS')
    bm.to_mesh(o.data)
    bm.free()
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return o


def mat_hair(name, color, rough=0.62, scale=380.0):
    """Dull, fibrous hair: fine stretched noise in the normal, no plastic sheen."""
    mat = bpy.data.materials.new(name)
    nt, b = _nodes(mat)
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Specular IOR Level'].default_value = 0.3
    coord = nt.nodes.new('ShaderNodeTexCoord')
    mapping = nt.nodes.new('ShaderNodeMapping')
    mapping.inputs['Scale'].default_value = (1.0, 1.0, 0.04)
    nt.links.new(coord.outputs['Object'], mapping.inputs['Vector'])
    n = nt.nodes.new('ShaderNodeTexNoise')
    n.inputs['Scale'].default_value = scale
    nt.links.new(mapping.outputs['Vector'], n.inputs['Vector'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.6
    nt.links.new(n.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    return mat
