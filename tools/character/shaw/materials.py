"""Procedural PBR materials for Nurse Shaw (colours sampled from the approved sheet's swatches).

Each material is a Principled BSDF driven by noise in object space: grime, blood stains and fabric
bump. build_shaw.py assigns them; bake.py bakes them to textures for glTF.
"""
from __future__ import annotations

import bpy

# Swatches on the approved sheet (top to bottom): off-white apron, burgundy uniform, dark hair/
# stockings, blood-stained fabric, stained skin.
# Linear values (the sheet's sRGB swatches converted): apron ≈ sRGB (178,160,142), burgundy ≈
# (92,22,26), hair ≈ (38,34,33), blood ≈ (105,18,16), skin ≈ (168,138,128).
APRON = (0.33, 0.285, 0.235)
BURGUNDY = (0.055, 0.0065, 0.0085)
DARK = (0.019, 0.016, 0.015)
BLOOD = (0.14, 0.006, 0.005)
BLOOD_DRY = (0.055, 0.008, 0.006)
SKIN = (0.26, 0.165, 0.135)
LEATHER = (0.035, 0.012, 0.009)
CANVAS = (0.30, 0.24, 0.18)


def _n(nt, kind, x, y, **props):
    node = nt.nodes.new(kind)
    node.location = (x, y)
    for k, v in props.items():
        setattr(node, k, v)
    return node


def make(name: str, base, rough=0.8, blood=0.0, blood_low=0.0, blood_z=None, grime=0.4, weave=0.0, bump=0.3, sheen=0.0, metallic=0.0, ss=0.0,
         age=0.0, speckle=0.0, dirt_low=0.0) -> bpy.types.Material:
    """blood: overall stain density; blood_low: extra density lower down (hem) or below blood_z.
    age: uneven yellowing / tide marks; speckle: fine blood spatter; dirt_low: grime rising from the floor."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metallic
    if 'Sheen Weight' in bsdf.inputs:
        bsdf.inputs['Sheen Weight'].default_value = sheen
    if ss and 'Subsurface Weight' in bsdf.inputs:
        bsdf.inputs['Subsurface Weight'].default_value = ss
        bsdf.inputs['Subsurface Radius'].default_value = (0.04, 0.012, 0.008)
    tc = _n(nt, 'ShaderNodeTexCoord', -1400, 0)
    # Grime: low-frequency mottling.
    g = _n(nt, 'ShaderNodeTexNoise', -1150, 300)
    g.inputs['Scale'].default_value = 7.0
    g.inputs['Detail'].default_value = 8.0
    g.inputs['Roughness'].default_value = 0.6
    nt.links.new(tc.outputs['Object'], g.inputs['Vector'])
    gr = _n(nt, 'ShaderNodeValToRGB', -900, 300)
    gr.color_ramp.elements[0].position = 0.35
    gr.color_ramp.elements[0].color = (1 - grime * 0.55, 1 - grime * 0.6, 1 - grime * 0.65, 1)
    gr.color_ramp.elements[1].position = 0.75
    gr.color_ramp.elements[1].color = (1, 1, 1, 1)
    nt.links.new(g.outputs['Fac'], gr.inputs['Fac'])
    base_mul = _n(nt, 'ShaderNodeMix', -650, 300, data_type='RGBA', blend_type='MULTIPLY')
    base_mul.inputs['Factor'].default_value = 1.0
    base_mul.inputs['A'].default_value = (*base, 1)
    nt.links.new(gr.outputs['Color'], base_mul.inputs['B'])
    color = base_mul.outputs['Result']
    sep_z = _n(nt, 'ShaderNodeSeparateXYZ', -1150, 600)
    nt.links.new(tc.outputs['Object'], sep_z.inputs['Vector'])
    if age > 0:
        # Uneven weathering: large blotches of yellowed/greyed cloth with darker tide-mark rims.
        a = _n(nt, 'ShaderNodeTexNoise', -1150, 750)
        a.inputs['Scale'].default_value = 2.4
        a.inputs['Detail'].default_value = 4.0
        a.inputs['Distortion'].default_value = 0.8
        nt.links.new(tc.outputs['Object'], a.inputs['Vector'])
        ar = _n(nt, 'ShaderNodeValToRGB', -900, 750)
        ar.color_ramp.elements[0].position = 0.42
        ar.color_ramp.elements[0].color = (1, 1, 1, 1)
        mid = ar.color_ramp.elements.new(0.52)
        mid.color = (1 - 0.35 * age, 1 - 0.42 * age, 1 - 0.55 * age, 1)   # tide-mark rim
        ar.color_ramp.elements[2].position = 0.60
        ar.color_ramp.elements[2].color = (1 - 0.12 * age, 1 - 0.18 * age, 1 - 0.30 * age, 1)  # yellowed
        nt.links.new(a.outputs['Fac'], ar.inputs['Fac'])
        am = _n(nt, 'ShaderNodeMix', -500, 650, data_type='RGBA', blend_type='MULTIPLY')
        am.inputs['Factor'].default_value = 1.0
        nt.links.new(color, am.inputs['A']); nt.links.new(ar.outputs['Color'], am.inputs['B'])
        color = am.outputs['Result']
    if dirt_low > 0:
        dz = _n(nt, 'ShaderNodeMapRange', -900, 900)
        dz.inputs['From Min'].default_value = 0.75
        dz.inputs['From Max'].default_value = 0.40
        dz.inputs['To Min'].default_value = 1.0
        dz.inputs['To Max'].default_value = 1 - 0.55 * dirt_low
        nt.links.new(sep_z.outputs['Z'], dz.inputs['Value'])
        dn = _n(nt, 'ShaderNodeMath', -700, 900, operation='MULTIPLY')
        nt.links.new(dz.outputs['Result'], dn.inputs[0])
        dn.inputs[1].default_value = 1.0
        dc = _n(nt, 'ShaderNodeCombineColor', -550, 900)
        for ch in ('Red', 'Green', 'Blue'):
            nt.links.new(dn.outputs['Value'], dc.inputs[ch])
        dm = _n(nt, 'ShaderNodeMix', -400, 850, data_type='RGBA', blend_type='MULTIPLY')
        dm.inputs['Factor'].default_value = 1.0
        nt.links.new(color, dm.inputs['A']); nt.links.new(dc.outputs['Color'], dm.inputs['B'])
        color = dm.outputs['Result']
    if blood > 0 or blood_low > 0:
        # Splatter + smears: two noise scales thresholded, biased by height.
        b1 = _n(nt, 'ShaderNodeTexNoise', -1150, -50)
        b1.inputs['Scale'].default_value = 16.0
        b1.inputs['Detail'].default_value = 12.0
        b1.inputs['Roughness'].default_value = 0.72
        b1.inputs['Distortion'].default_value = 0.6
        nt.links.new(tc.outputs['Object'], b1.inputs['Vector'])
        sep = _n(nt, 'ShaderNodeSeparateXYZ', -1150, -350)
        nt.links.new(tc.outputs['Object'], sep.inputs['Vector'])
        hz = _n(nt, 'ShaderNodeMapRange', -900, -350)
        z_lo, z_hi = blood_z if blood_z else (0.4, 1.2)
        hz.inputs['From Min'].default_value = z_hi
        hz.inputs['From Max'].default_value = z_lo
        hz.inputs['To Min'].default_value = blood
        hz.inputs['To Max'].default_value = blood + blood_low
        nt.links.new(sep.outputs['Z'], hz.inputs['Value'])
        add = _n(nt, 'ShaderNodeMath', -700, -150, operation='ADD')
        nt.links.new(b1.outputs['Fac'], add.inputs[0])
        nt.links.new(hz.outputs['Result'], add.inputs[1])
        thr = _n(nt, 'ShaderNodeMapRange', -500, -150)
        thr.inputs['From Min'].default_value = 0.80
        thr.inputs['From Max'].default_value = 0.92
        nt.links.new(add.outputs['Value'], thr.inputs['Value'])
        bc = _n(nt, 'ShaderNodeMix', -300, 150, data_type='RGBA', blend_type='MIX')
        bc.inputs['A'].default_value = (*BLOOD, 1)
        bc.inputs['B'].default_value = (*BLOOD_DRY, 1)
        nt.links.new(g.outputs['Fac'], bc.inputs['Factor'])
        mix = _n(nt, 'ShaderNodeMix', -100, 250, data_type='RGBA', blend_type='MIX')
        nt.links.new(thr.outputs['Result'], mix.inputs['Factor'])
        nt.links.new(color, mix.inputs['A'])
        nt.links.new(bc.outputs['Result'], mix.inputs['B'])
        color = mix.outputs['Result']
        if speckle > 0:
            # Fine spatter: high-frequency noise peaks, denser near the large stains.
            sp = _n(nt, 'ShaderNodeTexNoise', -1150, -700)
            sp.inputs['Scale'].default_value = 95.0
            sp.inputs['Detail'].default_value = 2.0
            nt.links.new(tc.outputs['Object'], sp.inputs['Vector'])
            sadd = _n(nt, 'ShaderNodeMath', -900, -700, operation='ADD')
            nt.links.new(sp.outputs['Fac'], sadd.inputs[0])
            nt.links.new(add.outputs['Value'], sadd.inputs[1])
            sthr = _n(nt, 'ShaderNodeMapRange', -700, -700)
            sthr.inputs['From Min'].default_value = 1.62 - 0.12 * speckle
            sthr.inputs['From Max'].default_value = 1.66 - 0.12 * speckle
            nt.links.new(sadd.outputs['Value'], sthr.inputs['Value'])
            smix = _n(nt, 'ShaderNodeMix', 50, 250, data_type='RGBA', blend_type='MIX')
            nt.links.new(sthr.outputs['Result'], smix.inputs['Factor'])
            nt.links.new(color, smix.inputs['A'])
            smix.inputs['B'].default_value = (*BLOOD_DRY, 1)
            color = smix.outputs['Result']
        # Blood is glossier where fresh.
        rmix = _n(nt, 'ShaderNodeMapRange', -100, -150)
        rmix.inputs['To Min'].default_value = rough
        rmix.inputs['To Max'].default_value = max(0.25, rough - 0.35)
        nt.links.new(thr.outputs['Result'], rmix.inputs['Value'])
        nt.links.new(rmix.outputs['Result'], bsdf.inputs['Roughness'])
    if not (blood > 0 or blood_low > 0):
        rv = _n(nt, 'ShaderNodeMapRange', -400, -250)
        rv.inputs['To Min'].default_value = min(1.0, rough + 0.08)
        rv.inputs['To Max'].default_value = max(0.05, rough - 0.08)
        nt.links.new(g.outputs['Fac'], rv.inputs['Value'])
        nt.links.new(rv.outputs['Result'], bsdf.inputs['Roughness'])
    nt.links.new(color, bsdf.inputs['Base Color'])
    # Surface: weave (fabric) or pores/creases.
    bn = _n(nt, 'ShaderNodeBump', -100, -450)
    bn.inputs['Strength'].default_value = bump
    if weave > 0:
        # Plain weave: warp (vertical) x weft (horizontal) bands, slightly irregular.
        wa = _n(nt, 'ShaderNodeTexWave', -600, -450, wave_type='BANDS', bands_direction='Z')
        wb = _n(nt, 'ShaderNodeTexWave', -600, -650, wave_type='BANDS', bands_direction='X')
        for w in (wa, wb):
            w.inputs['Scale'].default_value = weave
            w.inputs['Distortion'].default_value = 1.2
            w.inputs['Detail'].default_value = 2.0
            nt.links.new(tc.outputs['Object'], w.inputs['Vector'])
        wm = _n(nt, 'ShaderNodeMath', -400, -500, operation='MULTIPLY')
        nt.links.new(wa.outputs['Fac'], wm.inputs[0]); nt.links.new(wb.outputs['Fac'], wm.inputs[1])
        nt.links.new(wm.outputs['Value'], bn.inputs['Height'])
    else:
        p = _n(nt, 'ShaderNodeTexNoise', -400, -450)
        p.inputs['Scale'].default_value = 140.0
        p.inputs['Detail'].default_value = 6.0
        nt.links.new(tc.outputs['Object'], p.inputs['Vector'])
        nt.links.new(p.outputs['Fac'], bn.inputs['Height'])
    nt.links.new(bn.outputs['Normal'], bsdf.inputs['Normal'])
    return m


def image_material(name: str, albedo, height=None, rough=None, rough_value=0.85, bump=0.4) -> bpy.types.Material:
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    tex = _n(nt, 'ShaderNodeTexImage', -500, 300)
    tex.image = albedo
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if rough is not None:
        rt = _n(nt, 'ShaderNodeTexImage', -500, 0)
        rt.image = rough
        nt.links.new(rt.outputs['Color'], bsdf.inputs['Roughness'])
    else:
        bsdf.inputs['Roughness'].default_value = rough_value
    if height is not None:
        ht = _n(nt, 'ShaderNodeTexImage', -500, -300)
        ht.image = height
        bn = _n(nt, 'ShaderNodeBump', -200, -300)
        bn.inputs['Strength'].default_value = bump
        nt.links.new(ht.outputs['Color'], bn.inputs['Height'])
        nt.links.new(bn.outputs['Normal'], bsdf.inputs['Normal'])
    return m


def library() -> dict[str, bpy.types.Material]:
    return {
        'skin': make('shaw_skin', SKIN, rough=0.62, blood=0.08, blood_low=0.55, blood_z=(0.78, 1.25), grime=0.55, bump=0.25, ss=0.08, speckle=0.6),
        'stocking': make('shaw_stocking', (0.035, 0.028, 0.025), rough=0.85, blood=0.08, blood_low=0.12, blood_z=(0.05, 0.5), grime=0.5, weave=180, bump=0.15),
        'burgundy': make('shaw_burgundy', BURGUNDY, rough=0.78, blood=0.07, grime=0.5, weave=220, bump=0.2, sheen=0.3, age=0.35, speckle=0.3),
        'belt': make('shaw_belt', (0.13, 0.025, 0.028), rough=0.6, blood=0.05, grime=0.4, bump=0.3),
        'apron': make('shaw_apron', APRON, rough=0.88, blood=0.15, blood_low=0.28, blood_z=(0.45, 1.45), grime=0.8, weave=260, bump=0.3, sheen=0.25, age=0.75, speckle=0.8, dirt_low=0.55),
        'under': make('shaw_underskirt', (0.07, 0.015, 0.018), rough=0.85, blood=0.05, grime=0.6, weave=200, bump=0.2, dirt_low=0.5),
        'mask': make('shaw_mask', CANVAS, rough=0.9, blood=0.18, blood_low=0.1, blood_z=(1.66, 1.76), grime=0.7, weave=300, bump=0.35),
        'cap': make('shaw_cap', (0.34, 0.28, 0.22), rough=0.85, blood=0.08, grime=0.6, weave=260, bump=0.2),
        'hair': make('shaw_hair', (0.012, 0.010, 0.009), rough=0.55, grime=0.2, weave=900, bump=0.4),
        'leather': make('shaw_leather', LEATHER, rough=0.45, grime=0.45, bump=0.35),
        'metal': make('shaw_metal', (0.18, 0.15, 0.12), rough=0.45, metallic=0.8, grime=0.6, bump=0.2),
        'button': make('shaw_button', (0.22, 0.12, 0.09), rough=0.4, grime=0.5, bump=0.1),
        'claw': make('shaw_claw', (0.03, 0.02, 0.018), rough=0.3, grime=0.2, bump=0.1),
    }


CATEGORY = {
    'dress': 'burgundy', 'cuff': 'burgundy', 'collar': 'burgundy', 'collar_flap': 'burgundy',
    'belt': 'belt', 'bib': 'apron', 'strap_-1': 'apron', 'strap_1': 'apron', 'skirt': 'apron', 'bow': 'apron',
    'underskirt': 'under', 'buttons': 'button', 'mask': 'mask', 'pins': 'metal', 'scalp': 'hair', 'hair': 'hair',
    'cap': 'cap', 'shoes': 'leather', 'heel': 'leather', 'strap_ankle': 'leather', 'strap_instep': 'leather', 'claws': 'claw',
}


def assign(skin: bpy.types.Object, parts: dict) -> dict:
    lib = library()
    skin.data.materials.clear()
    skin.data.materials.append(lib['skin'])
    skin.data.materials.append(lib['stocking'])
    for p in skin.data.polygons:
        p.material_index = 1 if p.center.z < 0.62 else 0
    for key, obj in parts.items():
        cat = next((v for k, v in sorted(CATEGORY.items(), key=lambda kv: -len(kv[0])) if key == k or key.startswith(k)), 'apron')
        obj.data.materials.clear()
        obj.data.materials.append(lib[cat])
    # Painted textures for the face covering and the cap (their UVs are authored grids).
    import textures as T
    rgba, height, rough = T.mask_texture(1024)
    lib['mask'] = image_material('shaw_mask', T.to_image(bpy, 'shaw_mask_albedo', rgba), T.gray_image(bpy, 'shaw_mask_height', height), T.gray_image(bpy, 'shaw_mask_rough', rough), bump=0.5)
    rgba, height, rough = T.cap_texture()
    lib['cap'] = image_material('shaw_cap', T.to_image(bpy, 'shaw_cap_albedo', rgba), T.gray_image(bpy, 'shaw_cap_height', height), None, 0.85, 0.3)
    rgba, rough = T.hair_texture(512)
    lib['hair'] = image_material('shaw_hair', T.to_image(bpy, 'shaw_hair_albedo', rgba), None, T.gray_image(bpy, 'shaw_hair_rough', rough))
    for key in ('mask', 'cap'):
        obj = parts.get(key)
        if obj is not None:
            obj.data.materials.clear()
            obj.data.materials.append(lib[key])
    for key in ('hair', 'hair_strands', 'scalp'):
        obj = parts.get(key)
        if obj is not None:
            obj.data.materials.clear()
            obj.data.materials.append(lib['hair'])
    return lib
