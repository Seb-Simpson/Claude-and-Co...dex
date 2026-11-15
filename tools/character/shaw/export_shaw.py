"""NW-R04A — Nurse Shaw, stage C: bake procedural materials to textures and export a static GLB.

Groups parts by material, gives each group clean UVs (the skin keeps MakeHuman's UVs; the mask and
cap keep their authored grids), bakes base colour, roughness and tangent-space normal maps with
Cycles, rebuilds glTF-compatible materials and exports `shaw.glb` (WebP textures).

Run:  python export_shaw.py -- <shaw_dressed.blend> <out.glb> [--quick]
"""
from __future__ import annotations

import os
import sys

import bpy  # noqa: I001

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
QUICK = '--quick' in argv
TARGET_HEIGHT = 1.90   # metres, floor to top of cap (approved sheet)

SIZES = {'shaw_skin': 2048, 'shaw_apron': 2048, 'shaw_burgundy': 1024, 'shaw_mask': 1024, 'shaw_cap': 512,
         'shaw_underskirt': 512, 'shaw_belt': 512, 'shaw_leather': 512}
FLAT = {'shaw_claw', 'shaw_button', 'shaw_metal'}   # small/thin parts: constant PBR values
KEEP_UV = {'shaw_skin', 'shaw_mask', 'shaw_cap', 'shaw_hair'}
# Painted in textures.py on authored UV grids: exported directly (baking would let the solidified
# inner shell, which shares the UVs, overwrite the outer surface).
PAINTED = {'shaw_mask', 'shaw_cap', 'shaw_hair'}


def select_only(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def main():
    bpy.ops.wm.open_mainfile(filepath=SRC)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 1
    # Drop the rig and the unposed source body: this checkpoint is a static model.
    for name in ('shaw_body', 'shaw_rig'):
        o = bpy.data.objects.get(name)
        if o:
            bpy.data.objects.remove(o, do_unlink=True)
    meshes = [o for o in scene.objects if o.type == 'MESH']
    for o in meshes:
        o.vertex_groups.clear()
    # Approved sheet: ≈1.9 m to the top of the cap. Garments were built around the posed body with a
    # cap allowance estimate, so measure the assembled figure and scale it uniformly (feet stay on
    # the floor at z = 0; proportions are unchanged).
    deps = bpy.context.evaluated_depsgraph_get()
    zmin, zmax = 1e9, -1e9
    for o in meshes:
        ev = o.evaluated_get(deps)
        for v in ev.data.vertices:
            z = (ev.matrix_world @ v.co).z
            zmin, zmax = min(zmin, z), max(zmax, z)
    fit = TARGET_HEIGHT / (zmax - zmin)
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.location.z -= zmin
        o.location *= fit
        o.scale *= fit
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    print(f'assembled height {zmax - zmin:.3f} m -> scaled x{fit:.4f} to {TARGET_HEIGHT} m')
    # Group by first material and join.
    groups: dict[str, list] = {}
    for o in meshes:
        key = o.data.materials[0].name.split('.')[0] if o.data.materials else 'none'
        groups.setdefault(key, []).append(o)
    joined = {}
    for key, objs in groups.items():
        if len(objs) > 1:
            select_only(objs)
            bpy.ops.object.join()
        obj = bpy.context.view_layer.objects.active if len(objs) > 1 else objs[0]
        obj.name = key.replace('shaw_', 'shaw_') + '_mesh'
        joined[key] = obj
    for key, obj in joined.items():
        if key in KEEP_UV or key in FLAT:
            continue
        select_only([obj])
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.004)
        bpy.ops.object.mode_set(mode='OBJECT')
    # Bake.
    for key in PAINTED:
        obj = joined.get(key)
        if not obj:
            continue
        nt = obj.data.materials[0].node_tree
        for n in [n for n in nt.nodes if n.type == 'BUMP']:
            nt.nodes.remove(n)   # height map is not a glTF normal map; keep albedo (+ roughness)
    for key, obj in joined.items():
        if key in FLAT or key in PAINTED:
            continue
        size = SIZES.get(key, 512) // (4 if QUICK else 1)
        images = {}
        for kind in ('albedo', 'rough', 'normal'):
            img = bpy.data.images.new(f'{key}_{kind}', size, size, alpha=False, float_buffer=False)
            img.colorspace_settings.name = 'sRGB' if kind == 'albedo' else 'Non-Color'
            images[kind] = img
        nodes_added = []
        for mat in obj.data.materials:
            nt = mat.node_tree
            node = nt.nodes.new('ShaderNodeTexImage')
            nodes_added.append((nt, node))
            nt.nodes.active = node
        select_only([obj])
        for kind, bake_type in (('albedo', 'DIFFUSE'), ('rough', 'ROUGHNESS'), ('normal', 'NORMAL')):
            for nt, node in nodes_added:
                node.image = images[kind]
                nt.nodes.active = node
            kw = {'type': bake_type, 'margin': 8, 'use_clear': True}
            if bake_type == 'DIFFUSE':
                kw.update(pass_filter={'COLOR'})
            bpy.ops.object.bake(**kw)
            images[kind].pack()
        for nt, node in nodes_added:
            nt.nodes.remove(node)
        # Replace with a glTF-friendly material.
        mat = bpy.data.materials.new(key)
        mat.use_nodes = True
        mat.use_backface_culling = key in ('shaw_skin', 'shaw_leather')
        nt = mat.node_tree
        bsdf = nt.nodes['Principled BSDF']
        ta = nt.nodes.new('ShaderNodeTexImage'); ta.image = images['albedo']
        tr = nt.nodes.new('ShaderNodeTexImage'); tr.image = images['rough']
        tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = images['normal']
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(ta.outputs['Color'], bsdf.inputs['Base Color'])
        nt.links.new(tr.outputs['Color'], bsdf.inputs['Roughness'])
        nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
        bsdf.inputs['Metallic'].default_value = 0.0
        obj.data.materials.clear()
        obj.data.materials.append(mat)
    # Flat parts: keep the base values as factors (no procedural nodes in the export).
    for key in FLAT:
        obj = joined.get(key)
        if not obj:
            continue
        src = obj.data.materials[0]
        bsdf_src = src.node_tree.nodes['Principled BSDF']
        mat = bpy.data.materials.new(key)
        mat.use_nodes = True
        mat.use_backface_culling = False
        b = mat.node_tree.nodes['Principled BSDF']
        mix = next((n for n in src.node_tree.nodes if n.type == 'MIX' and n.blend_type == 'MULTIPLY'), None)
        color = mix.inputs['A'].default_value if mix else bsdf_src.inputs['Base Color'].default_value
        b.inputs['Base Color'].default_value = color
        b.inputs['Roughness'].default_value = bsdf_src.inputs['Roughness'].default_value
        b.inputs['Metallic'].default_value = bsdf_src.inputs['Metallic'].default_value
        obj.data.materials.clear()
        obj.data.materials.append(mat)
    tris = 0
    for o in joined.values():
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
    print('export objects', len(joined), 'triangles', tris)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_image_format='WEBP', export_image_quality=88,
                              export_apply=True, export_yup=True, use_selection=False, export_animations=False)
    bpy.ops.wm.save_as_mainfile(filepath=OUT.replace('.glb', '.export.blend'))


if __name__ == '__main__':
    main()
