"""NW-R04A — Nurse Shaw, stage B: costume, head pieces and materials on the posed body.

Input: shaw_body.blend from build_body.py. Every garment is custom geometry derived from, or
projected onto, the posed body surface (no primitive "body parts"):

  dress   burgundy short-sleeved bodice with turned-up cuffs, pointed collar, placket buttons
  apron   weathered off-white bib with button rows, shoulder straps crossing to a V at the back,
          full gathered skirt with a torn, jagged hem; burgundy waist belt; back bow and tails
  under   dark burgundy underskirt showing between the torn teeth
  head    canvas face covering (panels, seams, pins), folded nurse's cap with a burgundy stripe,
          dark dishevelled hair (scalp shell + strands, fringe over the covering)
  feet    Mary-Jane shoes (sole, block heel, instep strap, ankle strap); dark stockings
  hands   long dark claw nails

Run:  python build_shaw.py -- <shaw_body.blend> <out_dir> [--preview]
"""
from __future__ import annotations

import math
import os
import random
import sys

import bpy  # noqa: I001  (bpy must load before bmesh/mathutils in the module build)
import bmesh
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(__file__))
import materials as M  # noqa: E402

RNG = random.Random(1987)
NP = np.random.default_rng(1987)

# ---------------------------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------------------------


def link(obj: bpy.types.Object) -> bpy.types.Object:
    bpy.context.scene.collection.objects.link(obj)
    return obj


def mesh_object(name: str, verts, faces, uvs=None) -> bpy.types.Object:
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    if uvs is not None:
        layer = me.uv_layers.new(name='UVMap')
        for poly in me.polygons:
            for li, vi in zip(poly.loop_indices, poly.vertices):
                layer.data[li].uv = uvs[vi]
    me.validate()
    for p in me.polygons:
        p.use_smooth = True
    return link(bpy.data.objects.new(name, me))


def posed_body(body: bpy.types.Object) -> bpy.types.Object:
    deps = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(deps)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=deps)
    me.transform(body.matrix_world)
    obj = link(bpy.data.objects.new('shaw_skin', me))
    for g in body.vertex_groups:
        obj.vertex_groups.new(name=g.name)
    return obj


def group_weights(obj: bpy.types.Object) -> dict[str, np.ndarray]:
    n = len(obj.data.vertices)
    names = [g.name for g in obj.vertex_groups]
    W = {name: np.zeros(n) for name in names}
    for v in obj.data.vertices:
        for ge in v.groups:
            W[names[ge.group]][v.index] = ge.weight
    return W


def wsum(W: dict, *prefixes: str) -> np.ndarray:
    out = None
    for name, arr in W.items():
        if any(name == p or name.startswith(p) for p in prefixes):
            out = arr.copy() if out is None else out + arr
    return out


def coords(obj: bpy.types.Object) -> np.ndarray:
    a = np.empty(len(obj.data.vertices) * 3)
    obj.data.vertices.foreach_get('co', a)
    return a.reshape(-1, 3)


def normals(obj: bpy.types.Object) -> np.ndarray:
    a = np.empty(len(obj.data.vertices) * 3)
    obj.data.vertices.foreach_get('normal', a)
    return a.reshape(-1, 3)


def extract(src: bpy.types.Object, mask: np.ndarray, name: str, offset) -> bpy.types.Object:
    """Copy the faces of `src` whose vertices are all in `mask`, pushed out along normals by
    offset(co, i) metres. Keeps the body UVs."""
    me = src.data.copy()
    obj = link(bpy.data.objects.new(name, me))
    obj.vertex_groups.clear() if hasattr(obj.vertex_groups, 'clear') else None
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(mask[v.index] for v in f.verts)], context='FACES_ONLY')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.normal_update()
    for v in bm.verts:
        v.co = v.co + v.normal * offset(v.co, v)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    return obj


def solidify(obj, thickness, offset=-1.0):
    mod = obj.modifiers.new('solid', 'SOLIDIFY')
    mod.thickness = thickness
    mod.offset = offset
    mod.use_even_offset = True
    return mod


def apply_modifiers(obj):
    bpy.context.view_layer.objects.active = obj
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def bvh(*objs) -> BVHTree:
    deps = bpy.context.evaluated_depsgraph_get()
    verts, polys = [], []
    for o in objs:
        ev = o.evaluated_get(deps)
        me = ev.to_mesh()
        base = len(verts)
        verts += [tuple(o.matrix_world @ v.co) for v in me.vertices]
        polys += [tuple(base + i for i in p.vertices) for p in me.polygons]
        ev.to_mesh_clear()
    return BVHTree.FromPolygons(verts, polys)


def radial_hit(tree: BVHTree, center: Vector, direction: Vector, fallback: float) -> Vector:
    """Surface point seen from outside along -direction, toward `center`."""
    origin = center + direction.normalized() * 1.5
    hit = tree.ray_cast(origin, -direction.normalized(), 3.0)
    if hit[0] is None:
        return center + direction.normalized() * fallback
    return hit[0]


def inner_hit(tree: BVHTree, center: Vector, direction: Vector, fallback: float) -> Vector:
    """First surface met going outward from a point inside the body."""
    hit = tree.ray_cast(center, direction.normalized(), 1.0)
    return hit[0] if hit[0] is not None else center + direction.normalized() * fallback


def subset(src: bpy.types.Object, mask: np.ndarray, name: str) -> bpy.types.Object:
    """Temporary object with only the faces of `src` inside `mask` (for occlusion-free raycasts)."""
    return extract(src, mask, name, lambda c, v: 0.0)


def smooth_shell(obj: bpy.types.Object, iterations: int, factor: float) -> None:
    """Stable Laplacian smoothing with the boundary pinned (removes facial features)."""
    bm = bmesh.new(); bm.from_mesh(obj.data); bm.verts.ensure_lookup_table()
    boundary = {v.index for v in bm.verts if v.is_boundary}
    for _ in range(iterations):
        new = {}
        for v in bm.verts:
            if v.index in boundary or not v.link_edges:
                continue
            avg = sum((e.other_vert(v).co for e in v.link_edges), Vector()) / len(v.link_edges)
            new[v.index] = v.co.lerp(avg, factor)
        for i, c in new.items():
            bm.verts[i].co = c
    bm.to_mesh(obj.data); bm.free()


def grid_faces(rows: int, cols: int, wrap: bool = False):
    faces = []
    for r in range(rows - 1):
        for c in range(cols if wrap else cols - 1):
            c2 = (c + 1) % cols
            faces.append((r * cols + c, r * cols + c2, (r + 1) * cols + c2, (r + 1) * cols + c))
    return faces


def ribbon(name, path: list[Vector], widths, outward: list[Vector], thickness=0.0, side_dir: Vector | None = None):
    """A strip of cloth along a path; `outward` gives the surface normal at each point. With
    `side_dir`, the strip's width runs along that fixed direction (e.g. vertical bow loops)."""
    verts, uvs = [], []
    n = len(path)
    length = 0.0
    for i, p in enumerate(path):
        t = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
        side = side_dir.normalized() if side_dir is not None else t.cross(outward[i]).normalized()
        w = widths[i] if isinstance(widths, (list, tuple)) else widths
        if i:
            length += (path[i] - path[i - 1]).length
        verts += [p - side * w / 2, p + side * w / 2]
        uvs += [(0.0, length * 4), (1.0, length * 4)]
    faces = [(2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2) for i in range(n - 1)]
    obj = mesh_object(name, verts, faces, uvs)
    if thickness:
        solidify(obj, thickness, 0)
    return obj


def bone_matrix(rig, name) -> Matrix:
    return rig.matrix_world @ rig.pose.bones[name].matrix


# ---------------------------------------------------------------------------------------------
# Garments
# ---------------------------------------------------------------------------------------------


def build(skin, rig):
    W = group_weights(skin)
    co = coords(skin)
    z = co[:, 2]
    torso = wsum(W, 'spine', 'clavicle', 'breast', 'shoulder01', 'pelvis', 'root', 'levator')
    arm_up = wsum(W, 'upperarm')
    neck = wsum(W, 'neck')
    head = wsum(W, 'head', 'jaw', 'levator', 'oculi', 'orbicularis', 'oris', 'risorius', 'temporalis', 'tongue', 'eye', 'special')
    feet = wsum(W, 'foot', 'toe')
    parts = {}

    neck_z = 1.575
    sleeve_end = 1.30
    # Dress bodice + short sleeves.
    bodice_mask = ((torso > 0.45) & (z > 1.02) & (z < neck_z)) | ((arm_up > 0.45) & (z > sleeve_end - 0.01)) | ((neck > 0.2) & (z < neck_z) & (torso + neck > 0.6))
    def bodice_off(c, v):
        i = v.index
        if c.z < 1.45 and abs(c.x) > 0.13:  # sleeve: flares toward the opening
            return 0.007 + 0.010 * min(1.0, max(0.0, (1.44 - c.z) / 0.12))
        return 0.006
    parts['dress'] = extract(skin, bodice_mask, 'shaw_dress', bodice_off)
    # Turned-up cuffs.
    cuff_mask = (arm_up > 0.3) & (z > sleeve_end - 0.012) & (z < sleeve_end + 0.035)
    parts['cuff'] = extract(skin, cuff_mask, 'shaw_cuffs', lambda c, v: 0.021)
    # Stand collar.
    collar_mask = (neck > 0.35) & (z > 1.548) & (z < 1.612)
    parts['collar'] = extract(skin, collar_mask, 'shaw_collar', lambda c, v: 0.011 + 0.004 * max(0.0, (c.z - 1.55) / 0.06))

    tree = bvh(parts['dress'])
    # Pointed collar flaps lying on the bodice (projected to the nearest cloth surface).
    for s in (-1, 1):
        rows, cols = 7, 7
        verts, uvs = [], []
        for r in range(rows):
            for c in range(cols):
                u, w = c / (cols - 1), r / (rows - 1)
                top = Vector((s * 0.012, 0, 1.603)).lerp(Vector((s * 0.080, 0, 1.586)), u)
                bot = Vector((s * 0.016, 0, 1.556)).lerp(Vector((s * 0.066, 0, 1.522)), u)
                p = top.lerp(bot, w)
                hit = tree.find_nearest(Vector((p.x, -0.2, p.z)))
                q = hit[0] if hit[0] is not None else p
                nrm = hit[1] if hit[1] is not None else Vector((0, -1, 0))
                if nrm.y > 0:
                    nrm = -nrm
                verts.append(tuple(q + nrm * (0.005 + 0.004 * (1 - w))))
                uvs.append((u, w))
        flap = mesh_object(f'shaw_collar_flap_{s}', verts, grid_faces(rows, cols), uvs)
        solidify(flap, 0.0025, 0)
        parts[f'collar_flap_{s}'] = flap

    # Apron bib: conforming panel, smoothed so it bridges the chest like stiff cotton.
    rows, cols = 22, 16
    zt, zb = 1.50, 1.165
    hits = np.zeros((rows, cols))
    xy = np.zeros((rows, cols, 2))
    for r in range(rows):
        for c in range(cols):
            v = r / (rows - 1)
            zz = zb + (zt - zb) * v
            half = 0.104 + 0.012 * v
            xx = (c / (cols - 1) * 2 - 1) * half
            hit = tree.ray_cast(Vector((xx, -1.0, zz)), Vector((0, 1, 0)), 3.0)[0]
            hits[r, c] = hit.y if hit else -0.05
            xy[r, c] = (xx, zz)
    smooth = hits.copy()
    for _ in range(6):
        smooth[1:-1, 1:-1] = (smooth[:-2, 1:-1] + smooth[2:, 1:-1] + smooth[1:-1, :-2] + smooth[1:-1, 2:] + 2 * smooth[1:-1, 1:-1]) / 6
    ybib = np.minimum(smooth, hits) - 0.010
    verts = [(xy[r, c, 0], ybib[r, c], xy[r, c, 1]) for r in range(rows) for c in range(cols)]
    uvs = [(c / (cols - 1), r / (rows - 1)) for r in range(rows) for c in range(cols)]
    parts['bib'] = mesh_object('shaw_apron_bib', verts, grid_faces(rows, cols), uvs)
    solidify(parts['bib'], 0.003, 1)
    bib_edge = {('L' if s > 0 else 'R'): [Vector((xy[-1, c, 0], ybib[-1, c], xy[-1, c, 1])) for c in ([cols - 1] if s > 0 else [0])][0] for s in (1, -1)}

    # Buttons: two rows down the bib, a pair at the top corners, two on the dress placket.
    btn = []
    for s in (-1, 1):
        for k in range(5):
            zz = 1.455 - k * 0.065
            xx = s * (0.072 + 0.004 * k / 4)
            btn.append((xx, zz, 0.0072))
        btn.append((s * 0.098, 1.488, 0.0068))
    for zz in (1.545, 1.522):
        btn.append((0.0, zz, 0.0055))
    for i, (xx, zz, rad) in enumerate(btn):
        hit = bvh(skin, parts['dress'], parts['bib']).ray_cast(Vector((xx, -1, zz)), Vector((0, 1, 0)), 3.0)[0] if i == 0 else None
        break
    tree_b = bvh(skin, parts['dress'], parts['bib'])
    bverts, bfaces = [], []
    for xx, zz, rad in btn:
        hit = tree_b.ray_cast(Vector((xx, -1, zz)), Vector((0, 1, 0)), 3.0)
        if hit[0] is None:
            continue
        p, nrm = hit[0], hit[1]
        base = len(bverts)
        seg = 10
        t1 = nrm.orthogonal().normalized()
        t2 = nrm.cross(t1).normalized()
        bverts.append(tuple(p + nrm * 0.0045))
        for k in range(seg):
            a = 2 * math.pi * k / seg
            bverts.append(tuple(p + nrm * 0.0035 + (t1 * math.cos(a) + t2 * math.sin(a)) * rad))
        for k in range(seg):
            a = 2 * math.pi * k / seg
            bverts.append(tuple(p + nrm * 0.0005 + (t1 * math.cos(a) + t2 * math.sin(a)) * rad * 1.05))
        for k in range(seg):
            k2 = (k + 1) % seg
            bfaces.append((base, base + 1 + k, base + 1 + k2))
            bfaces.append((base + 1 + k, base + 1 + seg + k, base + 1 + seg + k2, base + 1 + k2))
    parts['buttons'] = mesh_object('shaw_buttons', bverts, bfaces)

    # Belt (burgundy) and apron skirt + underskirt: radial profiles from the body cross-section,
    # measured against the torso and legs only (the hanging arms must not widen the skirt).
    arms_hands = wsum(W, 'upperarm', 'lowerarm', 'wrist', 'finger', 'metacarpal') > 0.3
    core = subset(skin, ~arms_hands, 'tmp_core')
    core_dress = subset(parts['dress'], np.ones(len(parts['dress'].data.vertices), bool), 'tmp_dress')
    torso_tree = bvh(core)
    tree = torso_tree
    segs = 128
    center_y = 0.0

    def body_r(zz, a):
        d = Vector((math.sin(a), -math.cos(a), 0))
        c = Vector((0, center_y, zz))
        p = radial_hit(tree, c, d, 0.12)
        return (p - c).length

    z_top, z_hem = 1.165, 0.475
    rows = 34
    prof = np.zeros((rows, segs))
    zs = np.linspace(z_top, z_hem, rows)
    angles = np.linspace(0, 2 * math.pi, segs, endpoint=False)
    prev = None
    for r, zz in enumerate(zs):
        rr = (np.array([body_r(zz, a) for a in angles]) + 0.014) if zz > 0.93 else prev
        if prev is not None:
            rr = np.maximum(rr, prev)
        prof[r] = rr
        prev = rr
    # Smooth around (no leg dimples), then A-line flare and gathered folds.
    for r in range(rows):
        p = prof[r]
        for _ in range(6):
            p = (np.roll(p, 1) + np.roll(p, -1) + 2 * p) / 4
        prof[r] = p
    hip = prof[min(rows - 1, int(rows * 0.25))].copy()
    fold_phase = NP.uniform(0, 2 * math.pi, 3)
    verts, uvs = [], []
    for r, zz in enumerate(zs):
        t = max(0.0, (0.99 - zz) / (0.99 - z_hem))
        for c, a in enumerate(angles):
            rad = max(prof[r, c], hip[c]) * (1 + 0.16 * t ** 1.2)
            folds = 0.010 * t * (math.sin(11 * a + fold_phase[0]) + 0.6 * math.sin(17 * a + fold_phase[1]) + 0.4 * math.sin(5 * a + fold_phase[2]))
            gather = 0.0018 * (1 - t) * math.sin(28 * a + 0.5 * math.sin(3 * a)) if zz < z_top - 0.02 else 0.0
            rad += folds + gather
            verts.append((math.sin(a) * rad, center_y - math.cos(a) * rad, zz))
            uvs.append((c / segs, 1 - r / (rows - 1)))
    # Torn hem: jagged teeth below the last ring.
    teeth = []
    for c, a in enumerate(angles):
        depth = (0.012 + 0.045 * RNG.random() ** 1.6) if c % 2 == 0 else RNG.uniform(0.0, 0.012)
        if RNG.random() < 0.08:
            depth += 0.04
        rad = math.hypot(verts[-segs + c][0], verts[-segs + c][1] - center_y) * (1 + 0.01 * depth / 0.05)
        teeth.append((math.sin(a) * rad, center_y - math.cos(a) * rad, z_hem - depth))
        uvs.append((c / segs, -depth * 2))
    verts += teeth
    faces = grid_faces(rows + 1, segs, wrap=True)
    parts['skirt'] = mesh_object('shaw_apron_skirt', verts, faces, uvs)
    # Underskirt: slightly inside, a little longer, darker, its own tears.
    uverts = []
    for (x, y, zz) in verts[:-segs]:
        k = 0.985
        uverts.append((x * k, center_y + (y - center_y) * k, zz))
    for c, a in enumerate(angles):
        x, y, zz = uverts[-segs + c]
        depth = RNG.uniform(0.01, 0.07) if c % 3 else RNG.uniform(0.0, 0.02)
        uverts.append((x, y, z_hem - 0.012 - depth))
    parts['underskirt'] = mesh_object('shaw_underskirt', uverts, faces, uvs)

    # Belt: a band over the skirt top.
    bverts, buvs = [], []
    for r, zz in enumerate((1.205, 1.185, 1.165, 1.145)):
        rr = np.array([body_r(zz, a) for a in angles])
        for _ in range(4):
            rr = (np.roll(rr, 1) + np.roll(rr, -1) + 2 * rr) / 4
        for c, a in enumerate(angles):
            rad = rr[c] + 0.020 + (0.001 if r in (0, 3) else 0.003)
            bverts.append((math.sin(a) * rad, center_y - math.cos(a) * rad, zz))
            buvs.append((c / segs, r / 3))
    parts['belt'] = mesh_object('shaw_belt', bverts, grid_faces(4, segs, wrap=True), buvs)
    solidify(parts['belt'], 0.004, 1)

    # Apron straps: front bib corners → over the shoulders → V to the back of the belt, each
    # point projected onto the nearest bodice surface (no rays, so arms can't intercept).
    tree = bvh(parts['dress'])
    for s in (-1, 1):
        guide = [
            Vector((s * 0.097, -0.12, 1.495)), Vector((s * 0.100, -0.08, 1.535)), Vector((s * 0.102, -0.03, 1.565)),
            Vector((s * 0.100, 0.03, 1.555)), Vector((s * 0.092, 0.07, 1.50)), Vector((s * 0.077, 0.09, 1.42)),
            Vector((s * 0.058, 0.10, 1.33)), Vector((s * 0.036, 0.10, 1.235)), Vector((s * 0.026, 0.10, 1.20)),
        ]
        dense = []
        for i in range(len(guide) - 1):
            p0, p1, p2, p3 = guide[max(i - 1, 0)], guide[i], guide[i + 1], guide[min(i + 2, len(guide) - 1)]
            for k in range(8):
                t = k / 8
                t2, t3 = t * t, t * t * t
                dense.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
        dense.append(guide[-1])
        path, outs = [], []
        for p in dense:
            q, nrm, _, _ = tree.find_nearest(p)
            if q is None:
                q, nrm = p, Vector((0, -1, 0))
            if nrm.dot(q - Vector((0, 0, q.z))) < 0:
                nrm = -nrm
            path.append(q + nrm * 0.006)
            outs.append(nrm)
        widths = [0.070 - 0.018 * (i / len(path)) for i in range(len(path))]
        parts[f'strap_{s}'] = ribbon(f'shaw_apron_strap_{s}', path, widths, outs, 0.003)

    # Back bow: two wide loops (ribbon width vertical, loops lying against the back), a knot and
    # two long tails with torn ends (approved rear views).
    back = inner_hit(bvh(parts['belt']), Vector((0, 0, 1.175)), Vector((0, 1, 0)), 0.1) + Vector((0, 0.004, 0))
    for s in (-1, 1):
        loop, outs, widths = [], [], []
        for k in range(29):
            a = 2 * math.pi * k / 28
            x = s * (0.012 + 0.085 * (1 - math.cos(a)) / 2)
            y = 0.008 + 0.030 * (0.5 + 0.5 * math.sin(a))
            loop.append(back + Vector((x, y, -0.006 * (1 - math.cos(a)) / 2)))
            outs.append(Vector((s * math.sin(a) * 0.3, math.cos(a), 0)).normalized())
            widths.append(0.032 + 0.040 * (1 - math.cos(a)) / 2)
        parts[f'bow_loop_{s}'] = ribbon(f'shaw_bow_loop_{s}', loop, widths, outs, 0.003, side_dir=Vector((0, 0, 1)))
        tail, tw = [], []
        skirt_tree = bvh(parts['skirt'])
        for k in range(17):
            t = k / 16
            px = s * (0.010 + 0.030 * t)
            pz = back.z - 0.012 - 0.36 * t
            hit = skirt_tree.ray_cast(Vector((px, 1.0, pz)), Vector((0, -1, 0)), 2.0)[0]
            py = (hit.y if hit is not None else back.y + 0.02) + 0.016 + 0.010 * math.sin(t * 5 + s)
            tail.append(Vector((px, max(py, back.y + 0.024), pz)))
            tw.append(0.046 + 0.022 * t)
        twist = [Vector((s * 0.35 * math.sin(k / 16 * 3.0), 1, 0)).normalized() for k in range(17)]
        tail_obj = ribbon(f'shaw_bow_tail_{s}', tail, tw, twist, 0.003)
        # Torn end: notch the last edge (one corner pulled up).
        me = tail_obj.data
        me.vertices[-2 if s > 0 else -1].co.z += 0.045
        parts[f'bow_tail_{s}'] = tail_obj
    knot = []
    for k in range(13):
        a = 2 * math.pi * k / 12
        knot.append(back + Vector((0.016 * math.cos(a), 0.016 + 0.012 * math.sin(a), 0)))
    kouts = [Vector((math.cos(2 * math.pi * k / 12), math.sin(2 * math.pi * k / 12), 0)) for k in range(13)]
    parts['bow_knot'] = ribbon('shaw_bow_knot', knot, 0.05, kouts, 0.004, side_dir=Vector((0, 0, 1)))

    # ---- Head pieces (world space, using the head bone's axes) -----------------------------
    H = bone_matrix(rig, 'head')
    R3 = H.to_3x3().normalized()
    up_w = (R3 @ Vector((0, 1, 0))).normalized()
    fwd_w = Vector((0, -1, 0)) - up_w * Vector((0, -1, 0)).dot(up_w)
    fwd_w.normalize()
    right_w = up_w.cross(fwd_w).normalized()    # her left
    hmask = head > 0.5
    hw = co[hmask]
    cen_w = Vector(hw.mean(axis=0))
    rel = hw - np.array(cen_w)
    pu, pf, pr = rel @ np.array(up_w), rel @ np.array(fwd_w), rel @ np.array(right_w)
    crown, chin, front, back_, half_w = pu.max(), pu.min(), pf.max(), pf.min(), np.abs(pr).max()
    def hp(u, f, r):
        return cen_w + up_w * u + fwd_w * f + right_w * r
    head_tree = bvh(subset(skin, hmask | (neck > 0.3), 'tmp_head'))
    bpy.data.objects.remove(bpy.data.objects['tmp_head'], do_unlink=True)

    # Face covering: a stiff canvas panel projected onto the face from the front, depth-smoothed
    # so it bridges the nose and brow (flat, featureless), asymmetric edges, wraps to the cheeks.
    rows, cols = 26, 20
    v_lo, v_hi = chin - 0.012, crown - 0.045
    depth = np.zeros((rows, cols)); grid = []
    for r in range(rows):
        v = r / (rows - 1)
        uu = v_lo + (v_hi - v_lo) * v
        row = []
        for c in range(cols):
            u = c / (cols - 1) * 2 - 1
            width = (0.060 if u < 0 else 0.066) * (0.80 + 0.20 * math.sin(math.pi * min(1.0, v * 1.25)))
            rr = u * width
            origin = hp(uu, front + 0.2, rr)
            hit = head_tree.ray_cast(origin, -fwd_w, 0.5)
            d = (hit[0] - cen_w).dot(fwd_w) if hit[0] is not None else front - 0.03
            depth[r, c] = d
            row.append((uu, rr))
        grid.append(row)
    sm = depth.copy()
    for _ in range(10):
        sm[1:-1, 1:-1] = (sm[:-2, 1:-1] + sm[2:, 1:-1] + sm[1:-1, :-2] + sm[1:-1, 2:] + 2 * sm[1:-1, 1:-1]) / 6
    flat = np.maximum(sm, depth) + 0.0065
    verts, uvs = [], []
    for r in range(rows):
        for c in range(cols):
            uu, rr = grid[r][c]
            edge = abs(c / (cols - 1) * 2 - 1)
            low = max(0.0, 1 - r / (rows * 0.35))           # lower third tucks in under the jaw
            verts.append(tuple(hp(uu, flat[r, c] - 0.020 * edge ** 2.5 - 0.010 * low * edge, rr)))
            uvs.append((c / (cols - 1), r / (rows - 1)))
    mask_obj = mesh_object('shaw_mask', verts, grid_faces(rows, cols), uvs)
    solidify(mask_obj, 0.003, 1)
    parts['mask'] = mask_obj
    mtree = bvh(mask_obj)
    # Pins and stitch studs along the panel seams.
    pins_v, pins_f = [], []
    for k in range(16):
        u = RNG.choice((-0.62, -0.18, 0.22, 0.6)) + RNG.uniform(-0.05, 0.05)
        v = RNG.uniform(0.08, 0.92)
        uu = v_lo + (v_hi - v_lo) * v
        rr = u * 0.062
        hit = mtree.ray_cast(hp(uu, front + 0.2, rr), -fwd_w, 0.5)
        if hit[0] is None:
            continue
        p, nrm = hit[0], hit[1]
        base = len(pins_v)
        t1 = nrm.orthogonal().normalized(); t2 = nrm.cross(t1)
        pins_v.append(tuple(p + nrm * 0.0035))
        for j in range(6):
            a = 2 * math.pi * j / 6
            pins_v.append(tuple(p + nrm * 0.0005 + (t1 * math.cos(a) + t2 * math.sin(a)) * 0.0026))
        for j in range(6):
            pins_f.append((base, base + 1 + j, base + 1 + (j + 1) % 6))
    parts['pins'] = mesh_object('shaw_mask_pins', pins_v, pins_f)

    # Scalp shell under the hair (top, back and sides of the head, not the face).
    f_rel = (co - np.array(cen_w)) @ np.array(fwd_w)
    u_rel = (co - np.array(cen_w)) @ np.array(up_w)
    scalp_mask = hmask & (((u_rel > chin + 0.09) & (f_rel < front - 0.035)) | (f_rel < -0.02) & (u_rel > chin + 0.04))
    parts['scalp'] = extract(skin, scalp_mask, 'shaw_scalp', lambda c, v: 0.005)

    # Hair: thin strands in clumps (wet, dishevelled), from under the cap rim and the crown, to
    # about collar length; a fringe falling over the covering's edges and a few strands across it.
    gravity = Vector((0, 0, -1))
    hair_tree = bvh(subset(skin, hmask | (neck > 0.3), 'tmp_head2'), mask_obj)
    bpy.data.objects.remove(bpy.data.objects['tmp_head2'], do_unlink=True)
    strands = []
    def grow(root, length, sway, width, lean):
        q, nrm, _, _ = hair_tree.find_nearest(root)
        p = (q if q is not None else root) + (nrm if nrm is not None else up_w) * 0.005
        d = ((nrm if nrm is not None else up_w) * 0.25 + gravity + lean).normalized()
        pts, outs = [], []
        seg = 10
        for k in range(seg + 1):
            q, nrm, _, dist = hair_tree.find_nearest(p)
            if q is not None and dist < 0.006:
                p = q + nrm * 0.006
            pts.append(p.copy())
            outs.append(nrm if nrm is not None else up_w)
            d = (d + gravity * 0.35 + Vector((RNG.uniform(-1, 1), RNG.uniform(-1, 1), RNG.uniform(-0.3, 0.3))) * sway).normalized()
            p = p + d * (length / seg)
        return pts, [width * (1 - 0.85 * k / seg) for k in range(seg + 1)], outs
    for k in range(110):
        ang = RNG.uniform(0, 2 * math.pi)              # 0 = front
        frontness = math.cos(ang)
        if frontness > 0.55:
            continue
        h = RNG.uniform(0.035, 0.075)
        root = hp(crown - h, (front - 0.01) * frontness * 0.95 if frontness > 0 else back_ * -frontness * 0.95, half_w * math.sin(ang) * 0.98)
        length = RNG.uniform(0.10, 0.16)
        lean = right_w * math.sin(ang) * 0.15 + fwd_w * min(0.0, frontness) * 0.1
        for j in range(RNG.randint(3, 6)):             # a clump
            jitter = Vector((RNG.uniform(-1, 1), RNG.uniform(-1, 1), RNG.uniform(-1, 1))) * 0.006
            strands.append(grow(root + jitter, length * RNG.uniform(0.85, 1.1), 0.10, RNG.uniform(0.006, 0.012), lean))
    for k in range(12):                                  # fringe over the covering
        side = -1 if k < 7 else 1
        r = side * RNG.uniform(0.025, 0.06)
        root = hp(crown - 0.035, front - 0.025, r)
        for j in range(RNG.randint(3, 5)):
            jitter = Vector((RNG.uniform(-1, 1), RNG.uniform(-1, 1), 0)) * 0.005
            strands.append(grow(root + jitter, RNG.uniform(0.11, 0.19), 0.08, RNG.uniform(0.004, 0.007), fwd_w * 0.35 + right_w * side * 0.1))
    hv, hf, huv = [], [], []
    for pts, widths, outs in strands:
        base = len(hv)
        n = len(pts)
        for i, p in enumerate(pts):
            t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
            sd = t.cross(outs[i]).normalized()
            hv += [tuple(p - sd * widths[i] / 2), tuple(p + sd * widths[i] / 2)]
            huv += [(0.0, i / (n - 1)), (1.0, i / (n - 1))]
        for i in range(n - 1):
            hf.append((base + 2 * i, base + 2 * i + 1, base + 2 * i + 3, base + 2 * i + 2))
    parts['hair'] = mesh_object('shaw_hair', hv, hf, huv)

    # Nurse's cap: hugs the head (radially projected), tall upright front band with the burgundy
    # stripe, sides lower, back lowest; the top closes to a ridge (wedge in profile, approved side
    # view); the front-top corners stand out past the head (approved front view).
    seg, rows_c = 48, 6
    cap_v, cap_uv = [], []
    hairline = crown - 0.068
    ring = []
    for c in range(seg):
        ang = 2 * math.pi * c / seg                       # 0 = front, + toward her left
        d = (fwd_w * math.cos(ang) + right_w * math.sin(ang)).normalized()
        fr = math.cos(ang)
        hh = hairline + 0.012 * (1 - fr)                  # band sits higher at the back
        o = hp(hh, 0, 0)
        hit = head_tree.ray_cast(o + d * 0.3, -d, 0.5)
        rad = ((hit[0] - o).length if hit[0] is not None else half_w) + 0.010
        ring.append((ang, d, hh, rad, fr))
    for r in range(rows_c):
        v = r / (rows_c - 1)
        for c, (ang, d, hh, rad, fr) in enumerate(ring):
            height = hh + v * (0.022 + 0.048 * max(0.0, fr) + 0.006 * max(0.0, -fr))
            side_flare = 0.016 * v * abs(math.sin(ang)) * max(0.0, fr + 0.3)
            back_tuck = 1 - 0.10 * v * max(0.0, -fr)
            lean = -0.016 * v * max(0.0, fr)
            p = hp(height, 0, 0) + d * (rad * back_tuck + side_flare) + fwd_w * lean
            cap_v.append(tuple(p))
            cap_uv.append((c / seg, v))
    # Closed crown: rows converge from the band's top edge to a soft dome above the head, UVs kept
    # in the plain-cotton region above the stripe (v > 0.8) so no stripe smears across the top.
    rim = [cap_v[(rows_c - 1) * seg + c] for c in range(seg)]
    centre = hp(hairline + 0.080, -0.006, 0.0)
    crown_rows = 4
    for k in range(1, crown_rows + 1):
        t = k / (crown_rows + 1)
        for c in range(seg):
            rp = Vector(rim[c])
            p = rp.lerp(centre, t)
            p += up_w * (0.012 * math.sin(math.pi * t))        # soft dome
            cap_v.append(tuple(p))
            cap_uv.append((c / seg, 0.82 + 0.16 * t))
    top = len(cap_v)
    cap_v.append(tuple(centre + up_w * 0.004))
    cap_uv.append((0.5, 1.0))
    cap_f = grid_faces(rows_c + crown_rows, seg, wrap=True)
    last = (rows_c + crown_rows - 1) * seg
    for c in range(seg):
        cap_f.append((last + c, last + (c + 1) % seg, top))
    parts['cap'] = mesh_object('shaw_cap', cap_v, cap_f, cap_uv)
    solidify(parts['cap'], 0.003, 0)

    # ---- Feet: Mary-Jane shoes ---------------------------------------------------------------
    shoe_mask = (feet > 0.35) & (z < 0.15)
    parts['shoes'] = extract(skin, shoe_mask, 'shaw_shoes', lambda c, v: 0.0085)
    smooth_shell(parts['shoes'], 14, 0.5)
    bm = bmesh.new(); bm.from_mesh(parts['shoes'].data)
    for v in bm.verts:
        if v.co.z < 0.05:
            v.co.z = max(0.0, v.co.z - 0.035 * (1 - v.co.z / 0.05))
    bm.to_mesh(parts['shoes'].data); bm.free()
    for s, side in ((1, 'L'), (-1, 'R')):
        fb = rig.pose.bones[f'foot.{side}']
        heel = rig.matrix_world @ fb.head
        hv_, hf_ = [], []
        for zz in (0.0, 0.03):
            for dx, dy in ((-0.028, -0.01), (0.028, -0.01), (0.026, 0.045), (-0.026, 0.045)):
                hv_.append((heel.x + dx, heel.y + dy - 0.02, zz))
        hf_ = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
        parts[f'heel_{s}'] = mesh_object(f'shaw_heel_{s}', hv_, hf_)
        # Ankle strap + instep strap.
        foot_side = (coords(parts['shoes'])[:, 0] * s) > 0
        side_shoe = subset(parts['shoes'], foot_side, 'tmp_shoe')
        stree = bvh(side_shoe)
        for name_, zz, cy, w in (('ankle', 0.105, heel.y + 0.005, 0.014), ('instep', 0.075, heel.y - 0.075, 0.016)):
            ring, outs = [], []
            for k in range(29):
                a = 2 * math.pi * k / 28
                d = Vector((math.sin(a), -math.cos(a), 0))
                c = Vector((heel.x, cy, zz))
                p = inner_hit(stree, c, d, 0.05)
                if name_ == 'instep' and d.y > 0.2:
                    p = c + d * 0.01  # under the arch: tucked in
                ring.append(p + d * 0.003)
                outs.append(d)
            parts[f'strap_{name_}_{s}'] = ribbon(f'shaw_shoe_strap_{name_}_{s}', ring, w, outs, 0.003)
        bpy.data.objects.remove(side_shoe, do_unlink=True)

    # ---- Hands: long dark claws ----------------------------------------------------------------
    cv, cf = [], []
    for side in ('L', 'R'):
        for f in range(1, 6):
            b = rig.pose.bones.get(f'finger{f}-3.{side}')
            if b is None:
                continue
            tip = rig.matrix_world @ b.tail
            d = ((rig.matrix_world @ b.tail) - (rig.matrix_world @ b.head)).normalized()
            n0 = d.orthogonal().normalized(); n1 = d.cross(n0)
            base = len(cv)
            L = 0.026 if f > 1 else 0.02
            rad = 0.0052
            for j in range(6):
                a = 2 * math.pi * j / 6
                cv.append(tuple(tip - d * 0.008 + (n0 * math.cos(a) + n1 * math.sin(a) * 0.7) * rad))
            curl = (n0 * 0.006)
            cv.append(tuple(tip + d * L + curl))
            for j in range(6):
                cf.append((base + j, base + (j + 1) % 6, base + 6))
    parts['claws'] = mesh_object('shaw_claws', cv, cf)

    for tmp in (core, core_dress):
        bpy.data.objects.remove(tmp, do_unlink=True)
    # Hide the body under the costume (no z-fighting, fewer triangles).
    covered = ((torso > 0.55) & (z > 0.60) & (z < 1.55)) | ((wsum(W, 'upperleg') > 0.4) & (z > 0.62)) | ((arm_up > 0.6) & (z > sleeve_end + 0.04))
    bm = bmesh.new(); bm.from_mesh(skin.data); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(covered[v.index] for v in f.verts)], context='FACES_ONLY')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(skin.data); bm.free()
    return parts


def main():
    argv = sys.argv[sys.argv.index('--') + 1:]
    blend, out = argv[0], argv[1]
    bpy.ops.wm.open_mainfile(filepath=blend)
    body = bpy.data.objects['shaw_body']
    rig = bpy.data.objects['shaw_rig']
    bpy.context.view_layer.update()
    skin = posed_body(body)
    body.hide_render = True
    body.hide_set(True)
    parts = build(skin, rig)
    for o in list(parts.values()):
        apply_modifiers(o)
    M.assign(skin, parts)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'shaw_dressed.blend'))
    tris = sum(len(o.data.loop_triangles) if o.data.calc_loop_triangles() is None else 0 for o in [skin, *parts.values()])
    print('objects', len(parts) + 1, 'triangles', sum(len(o.data.loop_triangles) for o in [skin, *parts.values()]))


if __name__ == '__main__':
    main()
