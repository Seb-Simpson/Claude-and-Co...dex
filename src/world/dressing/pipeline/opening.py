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


# ---------------------------------------------------------------------------------------------
# Corridor props at Room 104's standard (NW-005A, second pass). Remodelled on the procedural
# props' existing colliders (regions.ts suppresses only their visuals), plus wall-mounted, overhead
# and floor-flat detail that needs no collision. No collider is added or moved.

def cell_rect(i):
    """corridor_labels.jpg cell i (512 x 256 cells, two columns, row-major from the top)."""
    col, row = i % 2, i // 2
    u0 = col * 0.5
    v1 = 1.0 - row * 0.25
    return (u0, v1 - 0.25, u0 + 0.5, v1)


def rect_quad(name, col, mat, w, h, center, normal, rect):
    u0, v0, u1, v1 = rect
    ob = nw.plane(name, col, w, h, center, normal=normal, mat=mat)
    uv = ob.data.uv_layers.get('UVMap') or ob.data.uv_layers.new(name='UVMap')
    for d in uv.data:
        d.uv = (u0 + d.uv.x * (u1 - u0), v0 + d.uv.y * (v1 - v0))
    return ob


def wall_quad(name, col, mat, w, h, x, y, side, rect, proud=0.006):
    """A print on the corridor face: side 'n' (north wall, faces +z) or 's' (south wall, faces -z)."""
    z = Z_CN + proud if side == 'n' else Z_CS - proud
    return rect_quad(name, col, mat, w, h, (x, y, z), '+z' if side == 'n' else '-z', rect)


def counter_front(Prop, P, cl, col):
    """The station's front: teal HPL fascia panels with aluminium joints, a recessed plinth, a beech
    bump rail and a solid-surface transaction ledge, with the night's leftovers on it."""
    x0, x1 = -6.3, -1.3
    L = x1 - x0
    cx = (x0 + x1) / 2
    out = []
    p = Prop('counter_front', cx, -1.6, 0.0, col=col)
    p.box('vinyl_black', (L, 0.1, 0.04), (0, 0.05, -0.06), bevel=0.004)
    n = 4
    for k in range(n):
        px = -L / 2 + (k + 0.5) * L / n
        p.box('fascia', (L / n - 0.012, 0.98, 0.03), (px, 0.6, -0.005), bevel=0.004)
        if k:
            p.box('steel', (0.014, 0.98, 0.008), (-L / 2 + k * L / n, 0.6, 0.012), bevel=0.002)
    p.box('lipping', (L, 0.06, 0.03), (0, 0.97, 0.02), bevel=0.01, segments=3)
    p.box('corian', (L + 0.06, 0.035, 0.36), (0, 1.1225, -0.07), bevel=0.012, segments=3)
    p.box('steel', (L, 0.02, 0.012), (0, 1.095, 0.1), bevel=0.003)
    # Night leftovers on the ledge: bell, pen on its chain, a box of gloves.
    p.cyl('chrome', 0.045, 0.04, (1.2, 1.16, -0.05), verts=24, r2=0.012)
    p.cyl('rubber', 0.05, 0.012, (1.2, 1.146, -0.05), verts=24)
    p.box('rubber', (0.14, 0.008, 0.01), (-0.6, 1.145, -0.02), yaw=0.4, bevel=0.002)
    p.tube('chrome', [(-0.53, 1.145, -0.0), (-0.45, 1.141, 0.03), (-0.38, 1.142, 0.05)], 0.002, res=4)
    ob = p.finish()
    out.append(ob)
    # Visitor book (closed) and a tent card.
    book = nw.box('counter_book', col, (0.3, 0.03, 0.22), (cx - 0.9, 1.155, -1.66), mat=P['vinyl_black'], bevel=0.004)
    out.append(book)
    u0, v0, u1, v1 = cell_rect(7)
    out.append(rect_quad('counter_book_cover', col, cl, 0.28, 0.2, (cx - 0.9, 1.1705, -1.66), 'y', (u0, v0, u0 + 0.25, v1)))
    for s in (-1, 1):
        q = rect_quad(f'counter_tent_{s}', col, cl, 0.2, 0.1, (0, 0, 0), '+z', (u0 + 0.25, v0, u1, v1))
        bpy.context.view_layer.update()
        q.matrix_world = Matrix.Translation(g(cx + 0.35, 1.19, -1.6 + s * 0.022)) @ Matrix.Rotation(math.pi / 2 + s * 0.42, 4, 'X') @ Matrix.Rotation(0 if s < 0 else math.pi, 4, 'Z')
        nw.select_only([q])
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        out.append(q)
    return out


def visitor_chair(Prop, x, z, yaw, name, torn=False):
    """Wipe-clean beech-armed visitor chair (front local +z), on the procedural chair's collider."""
    p = Prop(name, x, z, yaw)
    p.box('seat_vinyl', (0.48, 0.08, 0.46), (0, 0.46, 0.01), bevel=0.03, segments=4)
    p.box('seat_vinyl', (0.48, 0.4, 0.07), (0, 0.79, -0.215), rot=(-0.12, 0, 0), bevel=0.03, segments=4)
    if torn:
        p.box('void_foam', (0.14, 0.006, 0.08), (0.08, 0.502, 0.08), yaw=0.4, bevel=0.002)
    for side in (-1, 1):
        sx = side * 0.27
        p.box('lipping', (0.05, 0.035, 0.5), (sx, 0.66, 0.0), bevel=0.012)
        p.box('lipping', (0.04, 0.62, 0.04), (sx, 0.32, 0.2), bevel=0.008)
        p.box('lipping', (0.04, 0.95, 0.04), (sx, 0.47, -0.22), rot=(-0.08, 0, 0), bevel=0.008)
        p.box('lipping', (0.03, 0.03, 0.42), (sx, 0.14, -0.01), bevel=0.006)
        for gz in (0.2, -0.24):
            p.cyl('rubber', 0.018, 0.01, (sx, 0.005, gz), verts=10)
    p.box('lipping', (0.5, 0.03, 0.03), (0, 0.14, 0.2), bevel=0.006)
    p.box('steel', (0.44, 0.03, 0.4), (0, 0.405, 0.01), bevel=0.004)
    return p.finish()


def sanitiser(Prop, x, side, name):
    zw = Z_CN if side == 'n' else Z_CS
    p = Prop(name, x, zw, 0.0 if side == 'n' else math.pi)
    p.box('steel', (0.1, 0.06, 0.01), (0, 1.36, 0.005), bevel=0.002)
    p.box('white', (0.12, 0.26, 0.095), (0, 1.29, 0.055), bevel=0.018, segments=3)
    p.box('plastic_clear', (0.07, 0.09, 0.004), (0, 1.33, 0.103), bevel=0.002)
    p.box('grey_abs', (0.1, 0.05, 0.03), (0, 1.17, 0.085), rot=(0.3, 0, 0), bevel=0.008)
    p.box('grey_abs', (0.02, 0.012, 0.02), (0, 1.15, 0.07), bevel=0.003)
    return p.finish()


def wet_floor_sign(Prop, cl, col):
    """Yellow A-frame (the procedural sign's spot and angle; it has never had a collider)."""
    x, z, yaw = -8.85, 0.5, 0.6
    p = Prop('wet_floor', x, z, yaw, col=col)
    for s in (-1, 1):
        # Blender +X rotation tips a panel's top toward game +z, so -s leans each top inward: an A.
        p.box('safety_yellow', (0.3, 0.64, 0.012), (0, 0.32, s * 0.1), rot=(-s * 0.28, 0, 0), bevel=0.01, segments=3)
    p.box('safety_yellow', (0.1, 0.03, 0.05), (0, 0.66, 0), bevel=0.01)
    ob = p.finish()
    out = [ob]
    rect = cell_rect(0)
    for s in (-1, 1):
        # Plane at the origin facing +/-z, then: offset off the panel face, tilt with the panel
        # about its centre (same rotation as the box above), move to the panel centre, yaw, place.
        q = rect_quad(f'wet_floor_print_{s}', col, cl, 0.27, 0.135, (0, 0, 0), '+z' if s > 0 else '-z', rect)
        bpy.context.view_layer.update()
        base = q.matrix_world.copy()
        q.matrix_world = (Matrix.Translation(g(x, 0, z)) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Translation(g(0, 0.32, s * 0.1))
                          @ Matrix.Rotation(-s * 0.28, 4, 'X') @ Matrix.Translation(g(0, 0.13, s * 0.0075)) @ base)
        nw.select_only([q])
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        out.append(q)
    return out


def wall_details(Prop, P, cl, col):
    out = []
    # Patient information whiteboards beside each patient door (east side, above the sanitisers).
    for label, x, side in (('101', -15.45, 'n'), ('103', -11.05, 'n'), ('102', -15.45, 's'), ('104', -11.05, 's'), ('106', -6.85, 's')):
        zw = Z_CN if side == 'n' else Z_CS
        f = 1 if side == 'n' else -1
        out.append(nw.box(f'status_frame_{label}', col, (0.32, 0.17, 0.012), (x, 1.74, zw + f * 0.006), mat=P['steel'], bevel=0.003))
        out.append(wall_quad(f'status_{label}', col, cl, 0.3, 0.15, x, 1.74, side, cell_rect(1), proud=0.0125))
    # PPE station (three glove boxes and an apron roll) by 104 and by 106.
    for name, x in (('ppe_104', -10.75), ('ppe_106', -8.95)):
        p = Prop(name, x, Z_CS, math.pi, col=col)
        p.box('white', (0.42, 0.3, 0.012), (0, 1.25, 0.006), bevel=0.004)
        for k in range(3):
            p.box('white', (0.125, 0.24, 0.085), (-0.135 + k * 0.135, 1.25, 0.055), bevel=0.004)
        p.box('apron_white', (0.2, 0.07, 0.07), (0, 1.46, 0.045), bevel=0.02)
        out.append(p.finish())
        u0, v0, u1, v1 = cell_rect(6)
        for k in range(3):
            out.append(rect_quad(f'{name}_box{k}', col, cl, 0.12, 0.2, (x + (0.135 - k * 0.135), 1.25, Z_CS - 0.0985), '-z', (u0 + k * 0.166, v0, u0 + (k + 1) * 0.166, v1)))
    # Fire alarm call point with the fire action notice above it.
    p = Prop('call_point', -14.2, Z_CN, 0.0, col=col)
    p.box('red', (0.09, 0.09, 0.05), (0, 1.4, 0.025), bevel=0.006)
    p.box('plastic_clear', (0.06, 0.06, 0.004), (0, 1.4, 0.052), bevel=0.001)
    out.append(p.finish())
    out.append(nw.box('fire_action_back', col, (0.32, 0.17, 0.004), (-14.2, 1.74, Z_CN + 0.003), mat=P['white'], bevel=0.001))
    out.append(wall_quad('fire_action', col, cl, 0.3, 0.15, -14.2, 1.74, 'n', cell_rect(2), proud=0.007))
    # Ward notice board between 104 and 106: cork in a beech frame, papers pinned on.
    x, y = -9.85, 1.58
    out.append(nw.box('notice_frame', col, (1.04, 0.7, 0.02), (x, y, Z_CS - 0.01), mat=P['lipping'], bevel=0.006))
    out.append(wall_quad('notice_papers', col, cl, 0.98, 0.64, x, y, 's', cell_rect(4), proud=0.0205))
    # Hand hygiene poster, visiting hours.
    out.append(wall_quad('hand_hygiene', col, cl, 0.42, 0.21, -10.5, 1.55, 'n', cell_rect(3)))
    out.append(wall_quad('visiting_hours', col, cl, 0.4, 0.2, -3.75, 1.75, 's', cell_rect(5)))
    # CCTV dome over the station approach.
    p = Prop('cctv', -6.2, -0.9, 0.0, col=col)
    p.cyl('white', 0.075, 0.03, (0, CEIL_COR - 0.015, 0), verts=24)
    p.cyl('glass', 0.06, 0.05, (0, CEIL_COR - 0.055, 0), verts=24, r2=0.035)
    out.append(p.finish())
    return out


def floor_clutter(Prop, P, col):
    """Flat things on the floor (nothing that needs collision): papers by the chairs, a blue
    nitrile glove outside 104, a medicine cup, a pen."""
    out = []
    for i, (x, z, a) in enumerate(((-3.3, 0.35, 0.4), (-2.6, 0.75, -0.7), (-3.9, -0.3, 1.2), (-2.2, -0.2, 0.15), (-4.6, 0.5, -0.4), (-11.4, 0.8, 0.9))):
        out.append(nw.box(f'paper_{i}', col, (0.21, 0.0012, 0.297), (x, 0.0042 + i * 0.0003, z), yaw=a, mat=P['paper'], bevel=0.0))
    p = Prop('glove', -11.5, 0.45, 0.8, col=col)
    p.box('nitrile', (0.09, 0.012, 0.11), (0, 0.009, 0), bevel=0.005)
    for k in range(4):
        p.box('nitrile', (0.016, 0.01, 0.07), (-0.033 + k * 0.022, 0.008, 0.085), yaw=(k - 1.5) * 0.12, bevel=0.004)
    out.append(p.finish())
    p = Prop('med_cup', -7.9, -0.6, 0.0, col=col)
    p.cyl('plastic_clear', 0.022, 0.045, (0, 0.024, 0), axis='z', verts=12, r2=0.017)
    out.append(p.finish())
    p = Prop('pen', -4.4, -0.45, 1.1, col=col)
    p.cyl('white', 0.0045, 0.14, (0, 0.0075, 0), axis='x', verts=8)
    out.append(p.finish())
    return out


def decay(Prop, P, ceil_mat, col):
    """NW-005A scarier pass: the ward has been left to rot. A ceiling tile has fallen between the
    tubes at x -11 and -7.4, over the old leak and its wet-floor sign (void, insulation, cables, the tile in pieces below), glass from a smashed
    sharps-bin lid by the station, spilled pills, a single slipper from 104 in the corridor, and
    a dropped observation chart. Everything is overhead or flat: nothing needs a collider."""
    out = []
    # The void: a black opening where the tile was (just below the set ceiling), its dirty edge,
    # fibreglass insulation sagging out, two cables hanging into the corridor.
    cx, cz = -9.4, -0.35
    out.append(nw.box('ceiling_void', col, (0.6, 0.004, 0.6), (cx, CEIL_COR - 0.006, cz), mat=P['dark'], bevel=0.0))
    p = Prop('ceiling_hole', cx, cz, 0.15, col=col)
    for (sx, sz, ox, oz) in ((0.62, 0.025, 0, 0.3), (0.62, 0.025, 0, -0.3), (0.025, 0.62, 0.3, 0), (0.025, 0.62, -0.3, 0)):
        p.box('steel', (sx, 0.02, sz), (ox, CEIL_COR - 0.01, oz), bevel=0.002)
    p.box('insulation', (0.4, 0.14, 0.32), (0.05, CEIL_COR - 0.07, 0.04), rot=(0.25, 0, 0.1), bevel=0.05, segments=3)
    p.tube('rubber', [(0.1, CEIL_COR, 0.05), (0.16, CEIL_COR - 0.4, 0.1), (0.1, CEIL_COR - 0.95, 0.12), (0.14, CEIL_COR - 1.1, 0.06)], 0.007)
    p.tube('rubber', [(-0.12, CEIL_COR, -0.05), (-0.18, CEIL_COR - 0.3, -0.02), (-0.15, CEIL_COR - 0.62, -0.08)], 0.005)
    p.box('steel', (0.03, 0.03, 0.05), (0.14, CEIL_COR - 1.12, 0.06), bevel=0.004)
    out.append(p.finish())
    # The fallen tile, in two pieces on the floor, face down and face up.
    t1 = nw.box('fallen_tile_a', col, (0.36, 0.012, 0.6), (cx - 0.25, 0.01, cz + 0.4), yaw=0.5, mat=ceil_mat, bevel=0.002)
    t2 = nw.box('fallen_tile_b', col, (0.26, 0.012, 0.45), (cx + 0.3, 0.012, cz + 0.15), yaw=-0.9, rot=(0.0, 0, 0.06), mat=ceil_mat, bevel=0.002)
    for t in (t1, t2):
        nw.world_uvs(t, 0.6)
        out.append(t)
    for i in range(9):
        a = i * 2.3
        out.append(nw.box(f'tile_crumb_{i}', col, (0.03 + (i % 3) * 0.01, 0.008, 0.02 + (i % 2) * 0.015), (cx + 0.5 * math.cos(a) * (0.3 + i * 0.06), 0.008, cz + 0.4 * math.sin(a) * (0.3 + i * 0.05)), yaw=a, mat=P['white'], bevel=0.002))
    # Broken glass by the station (a sharps-bin lid), spilled pills, a dropped obs chart.
    for i in range(12):
        a = i * 1.37
        r = 0.08 + (i % 5) * 0.07
        out.append(nw.box(f'shard_{i}', col, (0.03 + (i % 4) * 0.012, 0.003, 0.02 + (i % 3) * 0.01), (-1.9 + r * math.cos(a), 0.0055, -0.9 + r * math.sin(a)), yaw=a * 1.7, mat=P['shard'], bevel=0.0))
    for i in range(14):
        a = i * 0.83
        r = 0.05 + (i % 6) * 0.05
        out.append(nw.cylinder(f'pill_{i}', col, 0.005, 0.004, (-5.3 + r * math.cos(a), 0.0065, -0.7 + r * math.sin(a) * 0.6), mat=P['pill_white'], verts=8))
    p = Prop('obs_chart', -9.7, -0.75, 2.6, col=col)
    p.box('beige', (0.25, 0.008, 0.33), (0, 0.008, 0), bevel=0.003)
    p.box('paper', (0.22, 0.003, 0.29), (0, 0.0135, 0.01), bevel=0.0)
    p.box('steel', (0.1, 0.012, 0.03), (0, 0.018, -0.15), bevel=0.003)
    out.append(p.finish())
    # One slipper, like the pair left by 104's bed, in the corridor outside 106.
    p = Prop('slipper', -8.1, 0.95, 2.2, col=col)
    p.box('slipper', (0.1, 0.035, 0.26), (0, 0.02, 0), bevel=0.015, segments=3)
    out.append(p.finish())
    return out
