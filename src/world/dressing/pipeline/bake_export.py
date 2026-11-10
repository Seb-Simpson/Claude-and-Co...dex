"""Bake and export the Room 104 set for the browser.

    <blender-python> bake_export.py -- <set.blend> <tex_dir> <out_dir> [--quick]

1. Props atlas: every object with a procedural material (furniture, trims, brackets, housings) is
   joined and unwrapped, then its colour, roughness/metalness and procedural normal detail are
   baked into one atlas: one material and one draw call.
2. Light/occlusion map: a second UV set ("lightmap" = TEXCOORD_1) across the whole set. Cycles
   bakes irradiance from the game's own light layout (room troffer, live corridor troffers,
   moonlight from the west window) and ambient occlusion. The result goes out as the glTF
   occlusion texture. The game applies it to direct as well as indirect light, so furniture casts
   contact shadows and corners darken without real-time shadow maps.
3. The wheelchair (a moving anomaly) gets its own small atlas with AO baked into the colour.
4. Export: room104_set.glb + room104_set.json (triangles, materials, textures, bytes).
"""
import json
import math
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import nwset as nw  # noqa: E402
from nwset import g  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:]
SRC, TEX, OUT = ARGS[0], ARGS[1], ARGS[2]
QUICK = '--quick' in ARGS
nw.ensure_dir(OUT)
WORK = nw.ensure_dir(os.path.join(OUT, 'bake'))
ATLAS = 1024 if QUICK else 2048
LIGHTMAP = 1024 if QUICK else 2048
SAMPLES = 16 if QUICK else 96

bpy.ops.wm.open_mainfile(filepath=SRC)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'

TILED = {'floor_vinyl', 'wall_paint', 'wainscot', 'ceiling_tile', 'wood_rail', 'signage', 'decals', 'door_veneer', 'opening_labels', 'door_glass', 'corridor_labels', 'reader_led'}
col = lambda n: bpy.data.collections[n]  # noqa: E731


def mesh_objs(name):
    return [o for o in col(name).objects if o.type == 'MESH']


# ---------------------------------------------------------------------------------------------
# 1. Props atlas


def procedural(ob):
    return all(s.material and s.material.name.split('.')[0] not in TILED for s in ob.material_slots)


shell = mesh_objs('shell')
props = mesh_objs('props')
movers = [o for o in shell if procedural(o)]
atlas_objs = [o for o in props if procedural(o)] + movers
tiled_objs = [o for o in shell + props if not procedural(o)]
print('NW_BAKE atlas objects', len(atlas_objs), 'tiled objects', len(tiled_objs))
for o in atlas_objs:
    nw.select_only([o])
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
props_ob = nw.join(atlas_objs, 'props')
for uv in list(props_ob.data.uv_layers):
    props_ob.data.uv_layers.remove(uv)
nw.atlas_uvs([props_ob], margin=0.002)


def bake_material_maps(ob, size, prefix, ao_into_albedo=False):
    """Bake albedo, ORM (G rough, B metal) and normal from the procedural materials onto UVMap."""
    albedo = nw.new_image(f'{prefix}_albedo', size)
    # Cycles' diffuse-colour pass is black for fully metallic surfaces, which baked every steel and
    # chrome part's base colour to black (and the engine has no environment map for them to reflect).
    # Bake the colour with metalness off, then restore it for the metalness bake below.
    metal_saved = []
    seen = set()
    for slot in ob.material_slots:
        if slot.material.name in seen:
            continue
        seen.add(slot.material.name)
        bsdf = next(n for n in slot.material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        sock = bsdf.inputs['Metallic']
        link = sock.links[0] if sock.links else None
        metal_saved.append((slot.material.node_tree, sock, sock.default_value, link.from_socket if link else None))
        if link:
            slot.material.node_tree.links.remove(link)
        sock.default_value = 0.0
    nw.bake([ob], albedo, 'DIFFUSE', 'UVMap', samples=1, pass_filter={'COLOR'})
    for nt, sock, value, src in metal_saved:
        sock.default_value = value
        if src:
            nt.links.new(src, sock)
    rough = nw.new_image(f'{prefix}_rough', size, non_color=True)
    nw.bake([ob], rough, 'ROUGHNESS', 'UVMap', samples=1)
    normal = nw.new_image(f'{prefix}_normal', size, non_color=True)
    nw.bake([ob], normal, 'NORMAL', 'UVMap', samples=1)
    # Metalness: temporarily route each material's Metallic into Emission and bake EMIT.
    saved = []
    for slot in ob.material_slots:
        nt = slot.material.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
        em = nt.nodes.new('ShaderNodeEmission')
        em.inputs['Color'].default_value = (bsdf.inputs['Metallic'].default_value,) * 3 + (1,)
        old = out.inputs['Surface'].links[0].from_socket if out.inputs['Surface'].links else None
        nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
        saved.append((nt, out, old, em))
    metal = nw.new_image(f'{prefix}_metal', size, non_color=True)
    nw.bake([ob], metal, 'EMIT', 'UVMap', samples=1)
    for nt, out, old, em in saved:
        if old:
            nt.links.new(old, out.inputs['Surface'])
        nt.nodes.remove(em)
    if ao_into_albedo:
        ao = nw.new_image(f'{prefix}_ao', size, non_color=True)
        scene.world.light_settings.distance = 0.4
        nw.bake([ob], ao, 'AO', 'UVMap', samples=SAMPLES // 2)
        a = np.array(albedo.pixels[:]).reshape(-1, 4)
        o = np.array(ao.pixels[:]).reshape(-1, 4)[:, :1]
        a[:, :3] *= 0.35 + 0.65 * o
        albedo.pixels[:] = a.ravel()
    # Pack ORM: R=1 (occlusion comes from the light map), G=roughness, B=metalness.
    r = np.array(rough.pixels[:]).reshape(-1, 4)
    m = np.array(metal.pixels[:]).reshape(-1, 4)
    orm = np.ones_like(r)
    orm[:, 1] = r[:, 0]
    orm[:, 2] = m[:, 0]
    orm_img = nw.new_image(f'{prefix}_orm', size, non_color=True)
    orm_img.pixels[:] = orm.ravel()
    paths = {}
    for key, img in (('albedo', albedo), ('orm', orm_img), ('normal', normal)):
        paths[key] = nw.save(img, os.path.join(WORK, f'{prefix}_{key}.jpg'), 'JPEG', 90)
    return paths


if scene.world is None:
    scene.world = bpy.data.worlds.new('w')
props_maps = bake_material_maps(props_ob, ATLAS, 'props')
print('NW_BAKE props atlas done')

# Wheelchair: own atlas, AO in the colour (it moves, so it cannot share the static light map).
wc_parts = mesh_objs('wheelchair')
wc = nw.join(wc_parts, 'wheelchair') if len(wc_parts) > 1 else wc_parts[0]
for uv in list(wc.data.uv_layers):
    wc.data.uv_layers.remove(uv)
nw.atlas_uvs([wc], margin=0.003)
wc_maps = bake_material_maps(wc, 512 if QUICK else 1024, 'wheelchair', ao_into_albedo=True)
print('NW_BAKE wheelchair done')

# NW-005A door leaf: hardware gets its own small atlas (AO in the colour: the leaf moves, so it
# cannot use the static light map); the veneer slabs and the wired glass keep their materials.
dl_hw = bpy.data.objects['doorleaf_hardware']
for uv in list(dl_hw.data.uv_layers):
    dl_hw.data.uv_layers.remove(uv)
nw.atlas_uvs([dl_hw], margin=0.004)
dl_maps = bake_material_maps(dl_hw, 512 if QUICK else 1024, 'doorleaf', ao_into_albedo=True)
print('NW_BAKE door leaf done')

# ---------------------------------------------------------------------------------------------
# 2. Light / occlusion map over the whole static set.


def area_light(name, pos, size, power, color, rot=(0, 0, 0)):
    data = bpy.data.lights.new(name, 'AREA')
    data.shape = 'RECTANGLE'
    data.size, data.size_y = size
    data.energy = power
    data.color = color
    ob = bpy.data.objects.new(name, data)
    scene.collection.objects.link(ob)
    ob.location = g(*pos)
    ob.rotation_euler = rot
    return ob


cool = (0.86, 0.92, 1.0)
area_light('L_r104', (-13.4, 2.72, 3.6), (1.15, 0.55), 85, cool)
# NW-005A: the game's corridor states: -18.2 dying, -14.6 and -7.4 dead, -11.0 flickering,
# -3.8 working, -0.2 dying. Dead tubes bake no light.
for x, p in ((-18.2, 10), (-11.0, 40), (-3.8, 50), (-0.2, 8)):
    area_light(f'L_cor_{x}', (x, 2.67, 0), (1.15, 0.55), p, cool)
# NW-005A: the station is the lit island at the end of the corridor: its troffer and the desk lamp
# (warm) spill over the counter into the corridor.
area_light('L_station', (-4.6, 2.67, -3.9), (1.15, 0.55), 70, cool)
lamp = bpy.data.lights.new('L_lamp', 'POINT')
lamp.energy = 22
lamp.color = (1.0, 0.76, 0.48)
lamp.shadow_soft_size = 0.08
lamp_ob = bpy.data.objects.new('L_lamp', lamp)
scene.collection.objects.link(lamp_ob)
lamp_ob.location = g(-1.55, 1.0, -2.0)
area_light('L_window', (-19.9, 1.5, 0), (1.6, 1.2), 90, (0.55, 0.65, 0.95), rot=(0, math.pi / 2, 0))
world = scene.world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.01, 0.011, 0.013, 1)

decal_objs = mesh_objs('decals')
lm_objs = [props_ob] + tiled_objs
nw.lightmap_uvs(lm_objs, margin=0.0025)
# Decals are overlays a few millimetres off their surface: they take no part in the light bake
# (present, they would occlude the very surface they sit on and bake it black) and get no light map.
for o in decal_objs:
    o.hide_render = True

# Irradiance bake: swap every material for plain white diffuse (so colour does not enter it).
white = bpy.data.materials.new('bake_white')
white.use_nodes = True
saved_mats = {}
for o in lm_objs:
    saved_mats[o.name] = [s.material for s in o.material_slots]
    for s in o.material_slots:
        s.material = white
for o in mesh_objs('occluders'):
    o.hide_render = False
irr = nw.new_image('lightmap_irr', LIGHTMAP, non_color=True, float_buffer=True)
nw.bake(lm_objs, irr, 'DIFFUSE', 'lightmap', samples=SAMPLES, margin=6, pass_filter={'DIRECT', 'INDIRECT'})
print('NW_BAKE irradiance done')
ao = nw.new_image('lightmap_ao', LIGHTMAP, non_color=True, float_buffer=True)
scene.world.light_settings.distance = 0.6
nw.bake(lm_objs, ao, 'AO', 'lightmap', samples=max(8, SAMPLES // 2), margin=6)
print('NW_BAKE ao done')
for o in decal_objs:
    o.hide_render = False
for o in lm_objs:
    for s, m in zip(o.material_slots, saved_mats[o.name]):
        s.material = m

i = np.array(irr.pixels[:]).reshape(-1, 4)[:, :3].mean(1)
a = np.array(ao.pixels[:]).reshape(-1, 4)[:, 0]
covered = i > 1e-5
ref = np.percentile(i[covered], 97) if covered.any() else 1.0
light = np.clip(i / ref, 0, 1) ** 0.5
# NW-005A: deeper falloff away from the fixtures and darker contact shadows (was 0.45 + 0.55 each).
lm = np.clip((0.2 + 0.8 * light) * (0.34 + 0.66 * a), 0, 1)
lm_img = nw.new_image('room104_lightmap', LIGHTMAP, non_color=True)
px = np.ones((LIGHTMAP * LIGHTMAP, 4))
px[:, 0] = px[:, 1] = px[:, 2] = lm
lm_img.pixels[:] = px.ravel()
lm_path = nw.save(lm_img, os.path.join(OUT, 'room104_lightmap.jpg'), 'JPEG', 92)
print('NW_BAKE lightmap ref', round(float(ref), 4), 'mean', round(float(lm[covered].mean()), 3))

# ---------------------------------------------------------------------------------------------
# 3. Game-facing materials, then export.


# The light map ships as its own texture and is bound in game as aoMap on UV channel 1. Routing it
# through glTF occlusion would let the exporter pack it into each ORM image, which uses TEXCOORD_0.
props_mat = nw.image_material('props_atlas', props_maps['albedo'], props_maps['normal'], props_maps['orm'])
props_ob.data.materials.clear()
props_ob.data.materials.append(props_mat)
wc_mat = nw.image_material('wheelchair_atlas', wc_maps['albedo'], wc_maps['normal'], wc_maps['orm'])
wc.data.materials.clear()
wc.data.materials.append(wc_mat)
dl_mat = nw.image_material('doorleaf_atlas', dl_maps['albedo'], dl_maps['normal'], dl_maps['orm'])
dl_hw.data.materials.clear()
dl_hw.data.materials.append(dl_mat)
leaf = nw.join([dl_hw, bpy.data.objects['doorleaf_veneer'], bpy.data.objects['doorleaf_glass']], 'doorleaf')
card = bpy.data.objects['access_card']

# Join the tiled shell by material: one mesh (and draw call) per material.
by_mat = {}
for o in tiled_objs + decal_objs:
    nw.select_only([o])
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    by_mat.setdefault(o.material_slots[0].material.name, []).append(o)
exported = [props_ob, wc, leaf, card]
for mname, objs in by_mat.items():
    exported.append(nw.join(objs, f'set_{mname}') if len(objs) > 1 else objs[0])
    exported[-1].name = f'set_{mname}'
for o in bpy.data.objects:
    if o.type != 'MESH' or o not in exported:
        o.select_set(False)
for o in exported:
    if 'UVMap' not in o.data.uv_layers:
        o.data.uv_layers.new(name='UVMap')
    # UVMap first (TEXCOORD_0), lightmap second (TEXCOORD_1).
    names = [u.name for u in o.data.uv_layers]
    if names and names[0] != 'UVMap' and 'UVMap' in names:
        o.data.uv_layers.active = o.data.uv_layers['UVMap']
    o.data.uv_layers.active = o.data.uv_layers['UVMap']
nw.select_only(exported)
glb = os.path.join(OUT, 'room104_set.glb')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_apply=True,
                          export_yup=True, export_texcoords=True, export_normals=True, export_tangents=False,
                          export_materials='EXPORT', export_image_format='AUTO', export_jpeg_quality=88,
                          export_animations=False, export_extras=False)
tri = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in exported}
for o in exported:
    for s in o.material_slots:
        if not s.material:
            print('NW_WARN empty material slot on', o.name)
manifest = {
    'glb': 'room104_set.glb', 'bytes': os.path.getsize(glb), 'triangles': sum(tri.values()), 'meshes': tri,
    'materials': sorted({s.material.name for o in exported for s in o.material_slots if s.material}),
    'nodes': {'doorleaf': 'door leaf, door-group frame (hinge at origin, leaf along +x)', 'access_card': 'pickup, world position'},
    'atlas': ATLAS, 'lightmap': 'room104_lightmap.jpg', 'lightmapSize': LIGHTMAP, 'lightmapBytes': os.path.getsize(lm_path), 'samples': SAMPLES,
}
json.dump(manifest, open(os.path.join(OUT, 'room104_set.json'), 'w'), indent=1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'room104_game.blend'))
print('NW_DONE', json.dumps({k: manifest[k] for k in ('bytes', 'triangles', 'materials')}))
