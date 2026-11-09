"""NW-005A: the opening's additions to the Room 104 set (imported by room104_set.py).

* The door kit: one beech-veneer fire-door leaf (built once, in the door group's local frame:
  hinge at the origin, leaf along +x, faces +/-z) and painted hardwood frames with architraves for
  every corridor door in the set (101-106 and 108). The game parents the leaf into each door
  group, so gameplay still animates the doors and their colliders.
* Room 104's opening props: the staff card reader beside the door (latch side), the dropped
  staff access card on its lanyard, the ward intercom speaker above the door, and the bed's
  privacy curtain on its ceiling track.
* Corridor fixtures for the stretch to the nurses' station: smoke detectors, PA speakers and the
  station's 'STAFF ONLY' sign and the corridor clock (the procedural sanitisers and chairs stay).

All positions mirror src/world (layout.ts, patientRooms.ts, shell.ts). Every semantic prop's
position is also published to gameplay by src/world/opening.ts: keep the two in step (a test
checks the GLB nodes against it).
"""
import math

import bpy
from mathutils import Matrix

import nwset as nw
from nwset import g

T = 0.15
Z_CN, Z_CS, Z_SF = -1.4, 1.4, 1.55
CEIL_ROOM, CEIL_COR = 2.75, 2.7
DOOR_W, DOOR_H = 1.2, 2.1
LEAF_W, LEAF_H, LEAF_T = 1.1, 2.08, 0.045
# Door centre x and wall plane z (the door plane is the wall centre line).
DOOR_FRAMES = {
    '101': (-16.4, Z_CN - T / 2), '103': (-12.0, Z_CN - T / 2), '105': (-7.6, Z_CN - T / 2),
    '102': (-16.4, Z_CS + T / 2), '104': (-12.0, Z_CS + T / 2), '106': (-7.6, Z_CS + T / 2), '108': (-1.0, Z_CS + T / 2),
}

# Semantic props (game coordinates). Mirrored in src/world/opening.ts.
CARD_READER = (-12.85, 1.12, Z_SF)          # on Room 104's room-side north wall, latch side of the door
ACCESS_CARD = (-12.9, 0.004, 3.2)           # on the floor between the bed and the door (above the 3 mm floor skin)
INTERCOM = (-12.0, 2.42, Z_SF)              # above Room 104's door, room side
STATION_SIGN = (-6.7, 1.6, Z_CN)            # corridor face of the wall beside the station opening


def labels_material(tex):
    return nw.image_material('opening_labels', tex('opening_labels.jpg'), rough_value=0.45)


def label_quad(name, col, mat, w, h, center, normal, cell):
    """A quad textured with one cell of opening_labels.jpg (see textures.OPENING_CELLS)."""
    cells = {'card': (0.0, 0.5, 0.5, 1.0), 'reader': (0.5, 0.5, 1.0, 1.0), 'intercom': (0.0, 0.0, 0.5, 0.5), 'staff': (0.5, 0.0, 1.0, 0.5)}
    u0, v0, u1, v1 = cells[cell]
    ob = nw.plane(name, col, w, h, center, normal=normal, mat=mat)
    uv = ob.data.uv_layers.get('UVMap') or ob.data.uv_layers.new(name='UVMap')
    for d in uv.data:
        d.uv = (u0 + d.uv.x * (u1 - u0), v0 + d.uv.y * (v1 - v0))
    return ob


# ---------------------------------------------------------------------------------------------
# Door kit


def door_leaf(Prop, P, veneer, col):
    """The leaf, in the door group's frame. Narrow vision panel as the procedural one (x 0.72-0.90,
    y 1.15-1.85), so what the player can see through a door does not change."""
    p = Prop('doorleaf', 0.0, 0.0, 0.0, col=col)
    vx0, vx1, vy0, vy1 = LEAF_W - 0.38, LEAF_W - 0.2, 1.15, 1.85
    x0, y0 = 0.01, 0.01
    slabs = [  # (x0, x1, y0, y1): the leaf around the vision panel
        (x0, vx0, y0, LEAF_H), (vx1, LEAF_W, y0, LEAF_H), (vx0, vx1, y0, vy0), (vx0, vx1, vy1, LEAF_H)]
    leaf_parts = []
    for i, (a0, a1, b0, b1) in enumerate(slabs):
        ob = nw.box(f'leaf_slab{i}', col, (a1 - a0, b1 - b0, LEAF_T), ((a0 + a1) / 2, (b0 + b1) / 2, 0.0), mat=veneer, bevel=0.0015)
        leaf_parts.append(ob)
    # Hardwood lipping on the closing edge and the head, painted beading round the glass.
    p.box('lipping', (0.012, LEAF_H - 0.01, LEAF_T + 0.001), (LEAF_W - 0.006, LEAF_H / 2 + 0.005, 0), bevel=0.002)
    for z in (-1, 1):
        zf = z * (LEAF_T / 2 + 0.006)
        for (sx, sy, cx, cy) in ((vx1 - vx0 + 0.05, 0.025, (vx0 + vx1) / 2, vy0 - 0.0125), (vx1 - vx0 + 0.05, 0.025, (vx0 + vx1) / 2, vy1 + 0.0125),
                                 (0.025, vy1 - vy0, vx0 - 0.0125, (vy0 + vy1) / 2), (0.025, vy1 - vy0, vx1 + 0.0125, (vy0 + vy1) / 2)):
            p.box('bead', (sx, sy, 0.012), (cx, cy, zf), bevel=0.003)
        # Stainless kick plate, push plate, lever handle on a round rose, privacy turn above it.
        p.box('steel', (LEAF_W - 0.08, 0.24, 0.0015), (LEAF_W / 2 + 0.005, 0.15, z * (LEAF_T / 2 + 0.001)), bevel=0.0)
        p.box('steel', (0.075, 0.3, 0.002), (LEAF_W - 0.075, 1.28, z * (LEAF_T / 2 + 0.0015)), bevel=0.001)
        p.cyl('chrome', 0.026, 0.01, (LEAF_W - 0.1, 1.0, z * (LEAF_T / 2 + 0.005)), axis='z', verts=20)
        p.cyl('chrome', 0.01, 0.05, (LEAF_W - 0.1, 1.0, z * (LEAF_T / 2 + 0.03)), axis='z', verts=10)
        p.tube('chrome', [(LEAF_W - 0.1, 1.0, z * (LEAF_T / 2 + 0.055)), (LEAF_W - 0.16, 1.0, z * (LEAF_T / 2 + 0.06)), (LEAF_W - 0.24, 0.995, z * (LEAF_T / 2 + 0.055))], 0.0095)
        p.cyl('chrome', 0.022, 0.008, (LEAF_W - 0.1, 0.84, z * (LEAF_T / 2 + 0.004)), axis='z', verts=18)
        p.box('red' if z > 0 else 'chrome', (0.03, 0.008, 0.012), (LEAF_W - 0.1, 0.84, z * (LEAF_T / 2 + 0.012)), bevel=0.002)
    # Three steel butt hinges on the hinge edge.
    for y in (0.25, 1.05, 1.85):
        p.cyl('steel', 0.011, 0.1, (0.0, y, 0.0), verts=10)
    # Overhead closer on the +z face (body near the hinge, arm to the frame head).
    p.box('steel', (0.26, 0.05, 0.055), (0.2, LEAF_H - 0.08, LEAF_T / 2 + 0.03), bevel=0.008)
    p.box('steel', (0.22, 0.012, 0.018), (0.36, LEAF_H + 0.0, LEAF_T / 2 + 0.06), yaw=0.35, bevel=0.002)
    hardware = p.finish()
    hardware.name = 'doorleaf_hardware'
    veneer_ob = nw.join(leaf_parts, 'doorleaf_veneer')
    nw.world_uvs(veneer_ob, 1.0)
    return hardware, veneer_ob


def door_glass(col):
    """Georgian-wired safety glass in the vision panel (separate: it is translucent)."""
    m = bpy.data.materials.new('door_glass')
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (0.32, 0.38, 0.37, 1)
    bsdf.inputs['Roughness'].default_value = 0.08
    bsdf.inputs['Alpha'].default_value = 0.28
    m.surface_render_method = 'BLENDED'
    vx0, vx1, vy0, vy1 = LEAF_W - 0.38, LEAF_W - 0.2, 1.15, 1.85
    return nw.box('doorleaf_glass', col, (vx1 - vx0, vy1 - vy0, 0.006), ((vx0 + vx1) / 2, (vy0 + vy1) / 2, 0.0), mat=m, bevel=0.0)


def door_frames(col, P):
    """Painted hardwood linings, stops and architraves (both faces) and a stainless threshold."""
    out = []
    depth = T + 0.03
    for label, (cx, zc) in DOOR_FRAMES.items():
        a0, a1 = cx - DOOR_W / 2, cx + DOOR_W / 2
        parts = []
        # Linings: jambs and head, filling the wall thickness.
        for jx in (a0 + 0.016, a1 - 0.016):
            parts.append(nw.box(f'fr{label}_jamb', col, (0.032, DOOR_H, depth), (jx, DOOR_H / 2, zc), mat=P['frame'], bevel=0.003))
        parts.append(nw.box(f'fr{label}_head', col, (DOOR_W, 0.032, depth), (cx, DOOR_H - 0.016, zc), mat=P['frame'], bevel=0.003))
        # Stops (12 x 30 mm) round the leaf.
        for jx in (a0 + 0.04, a1 - 0.04):
            parts.append(nw.box(f'fr{label}_stop', col, (0.026, DOOR_H - 0.04, 0.03), (jx, (DOOR_H - 0.04) / 2, zc + 0.04), mat=P['frame'], bevel=0.002))
        parts.append(nw.box(f'fr{label}_stoph', col, (DOOR_W - 0.08, 0.026, 0.03), (cx, DOOR_H - 0.045, zc + 0.04), mat=P['frame'], bevel=0.002))
        # Architraves: 70 x 18 mm moulding round both faces, with stainless corner guards below.
        for face in (-1, 1):
            zf = zc + face * (T / 2 + 0.012)
            for jx in (a0 - 0.035, a1 + 0.035):
                parts.append(nw.box(f'fr{label}_arch', col, (0.07, DOOR_H + 0.07, 0.018), (jx, (DOOR_H + 0.07) / 2, zf), mat=P['frame'], bevel=0.006, segments=3))
            parts.append(nw.box(f'fr{label}_archh', col, (DOOR_W + 0.14, 0.07, 0.018), (cx, DOOR_H + 0.035, zf), mat=P['frame'], bevel=0.006, segments=3))
            for jx in (a0 - 0.035, a1 + 0.035):
                parts.append(nw.box(f'fr{label}_guard', col, (0.075, 0.9, 0.004), (jx, 0.55, zf + face * 0.011), mat=P['steel'], bevel=0.001))
        parts.append(nw.box(f'fr{label}_sill', col, (DOOR_W - 0.06, 0.006, depth + 0.02), (cx, 0.003, zc), mat=P['steel'], bevel=0.0015))
        out.append(nw.join(parts, f'frame_{label}'))
    return out


# ---------------------------------------------------------------------------------------------
# Room 104 opening props


def card_reader(Prop, labels, col):
    x, y, z = CARD_READER
    p = Prop('card_reader', x, z, 0.0, col=col)
    p.box('rubber', (0.09, 0.14, 0.024), (0, y, 0.012), bevel=0.008, segments=3)
    p.box('rubber', (0.1, 0.15, 0.004), (0, y, 0.002), bevel=0.002)
    # Surface trunking from the reader up to the ceiling void.
    p.box('white', (0.035, CEIL_ROOM - (y + 0.07), 0.018), (0.0, (y + 0.07 + CEIL_ROOM) / 2, 0.009), bevel=0.003)
    ob = p.finish()
    face = label_quad('card_reader_face', col, labels, 0.072, 0.036, (x, y + 0.03, z + 0.0245), '+z', 'reader')
    return [ob, face]


def access_card(labels, col):
    """Staff ID card face up on the floor, its lanyard curled beside it. Its own node (a pickup:
    gameplay hides it when taken), textured only from opening_labels so it needs no baking."""
    x, y, z = ACCESS_CARD
    yaw = 0.35
    parts = []
    slab = nw.box('card_slab', col, (0.0856, 0.0016, 0.054), (0, 0.0008, 0), mat=labels, bevel=0.0005)
    _uv_point(slab, (0.35, 0.56))
    parts.append(slab)
    # 1 mm proud of the slab (0.1 mm z-fought at walking distance).
    face = label_quad('card_face', col, labels, 0.084, 0.052, (0, 0.0026, 0), 'y', 'card')
    parts.append(face)
    pts = [(0.042, 0.002, 0.0), (0.12, 0.003, 0.03), (0.2, 0.003, -0.01), (0.22, 0.003, -0.09), (0.14, 0.003, -0.13), (0.05, 0.003, -0.09), (0.0, 0.003, -0.05)]
    lan = nw.tube('card_lanyard', col, pts, 0.004, mat=labels, resolution=4)
    if not lan.data.uv_layers:
        lan.data.uv_layers.new(name='UVMap')
    _uv_point(lan, (0.12, 0.955))
    parts.append(lan)
    clip = nw.box('card_clip', col, (0.014, 0.003, 0.018), (0.046, 0.0025, 0), mat=labels, bevel=0.0005)
    _uv_point(clip, (0.6, 0.8))
    parts.append(clip)
    card = nw.join(parts, 'access_card')
    bpy.context.view_layer.update()
    card.matrix_world = Matrix.Translation(g(x, y, z)) @ Matrix.Rotation(yaw, 4, 'Z')
    nw.select_only([card])
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return card


def _uv_point(ob, uv_value):
    uv = ob.data.uv_layers.get('UVMap') or ob.data.uv_layers.new(name='UVMap')
    for d in uv.data:
        d.uv = uv_value


def intercom(Prop, labels, col):
    x, y, z = INTERCOM
    p = Prop('intercom', x, z, 0.0, col=col)
    p.box('white', (0.26, 0.17, 0.045), (0, y, 0.0225), bevel=0.01, segments=3)
    for k in range(7):
        p.box('dark', (0.18, 0.006, 0.004), (0, y + 0.045 - k * 0.015, 0.046), bevel=0.0)
    p.box('rubber', (0.03, 0.012, 0.006), (0.1, y - 0.065, 0.047), bevel=0.001)
    ob = p.finish()
    badge = label_quad('intercom_badge', col, labels, 0.12, 0.06, (x, y - 0.135, z + 0.005), '+z', 'intercom')
    return [ob, badge]


def bed_curtain(Prop, P, col):
    """Ceiling U-track round the bed with the curtain bunched at the wall end."""
    p = Prop('curtain_track', 0.0, 0.0, 0.0, col=col)
    y = CEIL_ROOM - 0.03
    p.box('white', (2.15, 0.02, 0.025), (-14.375, y, 4.0), bevel=0.004)
    p.box('white', (0.025, 0.02, 2.35), (-13.3, y, 5.175), bevel=0.004)
    for x in (-15.0, -14.2, -13.4):
        p.box('white', (0.02, 0.03, 0.02), (x, CEIL_ROOM - 0.015, 4.0), bevel=0.002)
    ob = p.finish()
    # The curtain: a gathered drape, pleats as a sine fold, 0.28 m deep, hem 0.3 m off the floor.
    import bmesh
    from mathutils import Vector
    bm = bmesh.new()
    xs = 26
    ys = 8
    x0, x1 = -15.43, -14.98
    top, hem = y - 0.06, 0.32
    verts = []
    for j in range(ys + 1):
        yy = hem + (top - hem) * j / ys
        row = []
        for i in range(xs + 1):
            t = i / xs
            xx = x0 + (x1 - x0) * t
            zz = 4.0 + 0.11 * math.sin(t * math.pi * 9) * (0.6 + 0.4 * (1 - j / ys)) + 0.03 * math.sin(j * 0.9 + t * 4)
            row.append(bm.verts.new(g(xx, yy, zz)))
        verts.append(row)
    for j in range(ys):
        for i in range(xs):
            bm.faces.new((verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    drape = nw.mesh_object('curtain', bm, col, P['curtain'])
    sol = drape.modifiers.new('solid', 'SOLIDIFY')
    sol.thickness = 0.006
    nw.apply_all(drape)
    return [ob, drape]


# ---------------------------------------------------------------------------------------------
# Corridor fixtures (x -20 .. -0.2)


def corridor_fixtures(Prop, P, labels, sign_mat, col, clock_dial):
    out = []
    # Ceiling smoke detectors and recessed PA speakers between the troffers.
    for x in (-19.0, -12.8, -5.6, -1.2):
        p = Prop(f'smoke_{x}', x, 0.35, 0.0, col=col)
        p.cyl('white', 0.05, 0.035, (0, CEIL_COR - 0.018, 0), verts=24)
        p.cyl('red', 0.004, 0.004, (0.02, CEIL_COR - 0.037, 0), verts=8)
        out.append(p.finish())
    for x in (-16.4, -9.2, -2.6):
        p = Prop(f'pa_{x}', x, -0.4, 0.0, col=col)
        p.cyl('white', 0.11, 0.012, (0, CEIL_COR - 0.006, 0), verts=28)
        for k in range(-3, 4):
            p.box('dark', (0.16 - abs(k) * 0.02, 0.002, 0.008), (0, CEIL_COR - 0.0125, k * 0.022), bevel=0.0)
        out.append(p.finish())
    # 'NURSES' STATION - STAFF ONLY' beside the station opening.
    x, y, z = STATION_SIGN
    out.append(nw.box('station_sign_back', col, (0.42, 0.21, 0.008), (x, y, z + 0.004), mat=P['enamel'], bevel=0.002))
    out.append(label_quad('station_sign', col, labels, 0.4, 0.2, (x, y, z + 0.009), '+z', 'staff'))
    # Corridor clock above the visitors' chairs (replaces the procedural one), stopped at 03:17
    # like every clock on the ward.
    p = Prop('cor_clock', -3.2, Z_CS, math.pi, col=col)
    p.cyl('white', 0.17, 0.05, (0, 2.2, 0.025), axis='z', verts=40)
    out.append(p.finish())
    out.append(clock_dial('cor_clock_dial', -3.2, 2.2, Z_CS - 0.057, facing=-1))
    return out
