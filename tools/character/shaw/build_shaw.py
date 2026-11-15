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


def decimate(obj, ratio: float, protect: np.ndarray | None = None) -> None:
    """Collapse-decimate (UVs kept). `protect`: per-vertex weights (1 = keep full detail)."""
    mod = obj.modifiers.new('decimate', 'DECIMATE')
    mod.ratio = ratio
    mod.use_collapse_triangulate = False
    if protect is not None:
        g = obj.vertex_groups.new(name='decimate_protect')
        for i, w in enumerate(protect):
            g.add([i], float(1 - w), 'REPLACE')
        mod.vertex_group = g.name
        mod.vertex_group_factor = 1.0
    apply_modifiers(obj)


def bone_matrix(rig, name) -> Matrix:
    return rig.matrix_world @ rig.pose.bones[name].matrix


def sculpt_hands(skin, rig) -> None:
    """Bony hands (approved hand close-up): thin phalanx shafts, swollen knuckles at every joint
    (strongest on the back of the hand), and extensor tendons along the metacarpals."""
    W = group_weights(skin)
    co = coords(skin)
    new = co.copy()
    mw = rig.matrix_world
    for side, s in (('L', 1), ('R', -1)):
        dorsal = Vector((s, 0.15, 0.0)).normalized()     # hanging arms: backs of the hands face out
        for f in range(1, 6):
            for k in range(1, 4):
                name = f'finger{f}-{k}.{side}'
                b = rig.pose.bones.get(name)
                w = W.get(name)
                if b is None or w is None:
                    continue
                H, T = np.array(mw @ b.head), np.array(mw @ b.tail)
                axis = T - H
                L2 = float(axis @ axis)
                idx = np.nonzero(w > 0.25)[0]
                for i in idx:
                    p = new[i]
                    t = float(np.clip((p - H) @ axis / L2, 0, 1))
                    foot = H + axis * t
                    radial = p - foot
                    rl = float(np.linalg.norm(radial))
                    if rl < 1e-6:
                        continue
                    dside = max(0.0, float(radial @ np.array(dorsal)) / rl)
                    shaft = 1 - 0.24 * math.sin(math.pi * t) ** 1.4
                    knuckle = (0.16 if k == 1 else 0.11) * math.exp(-(t / 0.2) ** 2) * (0.45 + 0.55 * dside)
                    if k == 3:
                        knuckle *= 0.6
                    fac = shaft + knuckle
                    blend = min(1.0, float(w[i]) * 1.4)
                    new[i] = foot + radial * (1 + (fac - 1) * blend)
        for m in range(1, 5):
            name = f'metacarpal{m}.{side}'
            b = rig.pose.bones.get(name)
            w = W.get(name)
            if b is None or w is None:
                continue
            H, T = np.array(mw @ b.head), np.array(mw @ b.tail)
            axis = T - H
            axn = axis / np.linalg.norm(axis)
            lat = np.cross(axn, np.array(dorsal)); lat /= np.linalg.norm(lat)
            for i in np.nonzero(w > 0.3)[0]:
                p = new[i]
                radial = p - H - axn * float((p - H) @ axn)
                if float(radial @ np.array(dorsal)) <= 0:
                    continue
                t = float(np.clip((p - H) @ axis / float(axis @ axis), 0, 1))
                lateral = abs(float((p - H) @ lat))
                bump = 0.0013 * math.exp(-(lateral / 0.0042) ** 2) * math.sin(math.pi * min(1.0, t * 1.1)) ** 0.6
                new[i] = p + np.array(dorsal) * bump * min(1.0, float(w[i]) * 1.3)
    skin.data.vertices.foreach_set('co', new.ravel())
    skin.data.update()


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
    segs = 96
    center_y = 0.0

    def body_r(zz, a):
        d = Vector((math.sin(a), -math.cos(a), 0))
        c = Vector((0, center_y, zz))
        p = radial_hit(tree, c, d, 0.12)
        return (p - c).length

    z_top, z_hem = 1.165, 0.475
    rows = 26
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
    # Cloth hangs from the belt: a radius envelope with a limited slope (<= DRAPE m per m), so the
    # skirt runs in a smooth line from the waist over the hips/buttocks instead of following the
    # body into a shelf (the boxy side silhouette). Still never inside the body.
    DRAPE = 0.55
    env = prof.copy()
    for r in range(rows):
        env[r] = np.max(prof - DRAPE * np.abs(zs[:, None] - zs[r]), axis=0)
    prof = np.maximum(env, prof)
    # Smooth around (no leg dimples), then A-line flare and gathered folds.
    for r in range(rows):
        p = prof[r]
        for _ in range(6):
            p = (np.roll(p, 1) + np.roll(p, -1) + 2 * p) / 4
        prof[r] = p
    hip_row = min(rows - 1, int(rows * 0.25))
    hip = prof[hip_row].copy()
    fold_phase = NP.uniform(0, 2 * math.pi, 4)
    # Broad, soft folds that deepen toward the hem (approved front/side views: a full skirt with
    # natural drape), fine gathers under the belt, and an A-line flare that starts at the hips.
    def fold_shape(a):
        f = 0.0
        for n, w, ph in ((9, 1.0, fold_phase[0]), (13, 0.55, fold_phase[1]), (5, 0.45, fold_phase[2])):
            sv = math.sin(n * a + ph)
            f += w * (abs(sv) ** 0.65 * (1 if sv > 0 else -0.55))
        return f / 2.0
    folds_tab = np.array([fold_shape(a) for a in angles])
    hem_wave = np.array([0.5 * math.sin(9 * a + fold_phase[0]) + 0.3 * math.sin(4 * a + fold_phase[3]) for a in angles])
    verts, uvs = [], []
    for r, zz in enumerate(zs):
        t = max(0.0, (1.06 - zz) / (1.06 - z_hem))
        for c, a in enumerate(angles):
            back_full = 1 + 0.10 * max(0.0, math.cos(a + math.pi)) * t      # a little more fullness behind
            rad = (max(prof[r, c], hip[c]) if r >= hip_row else prof[r, c]) * (1 + 0.36 * t ** 1.05) * back_full
            rad += 0.024 * t ** 0.85 * folds_tab[c]
            gather = 0.0022 * (1 - t) ** 2 * math.sin(36 * a + 0.5 * math.sin(3 * a)) if zz < z_top - 0.012 else 0.0
            rad += gather
            # The hem rises over the fold crests and drops in the troughs (cloth weight).
            z_off = 0.012 * t ** 3 * hem_wave[c]
            verts.append((math.sin(a) * rad, center_y - math.cos(a) * rad, zz + z_off))
            uvs.append((c / segs, 1 - r / (rows - 1)))
    # Torn hem: jagged teeth below the last ring.
    teeth = []
    for c, a in enumerate(angles):
        depth = (0.012 + 0.045 * RNG.random() ** 1.6) if c % 2 == 0 else RNG.uniform(0.0, 0.012)
        if RNG.random() < 0.08:
            depth += 0.04
        rad = math.hypot(verts[-segs + c][0], verts[-segs + c][1] - center_y) * (1 + 0.01 * depth / 0.05)
        teeth.append((math.sin(a) * rad, center_y - math.cos(a) * rad, verts[-segs + c][2] - depth))
        uvs.append((c / segs, -depth * 2))
    verts += teeth
    faces = grid_faces(rows + 1, segs, wrap=True)
    parts['skirt'] = mesh_object('shaw_apron_skirt', verts, faces, uvs)
    # Underskirt: slightly inside, a little longer, darker, its own tears. Only the lower part is
    # ever visible (between the torn teeth), so it starts at the knee.
    r0 = int(np.argmax(zs < 0.66))
    uverts, uuvs = [], []
    for r in range(r0, rows):
        for c in range(segs):
            x, y, zz = verts[r * segs + c]
            k = 0.975
            uverts.append((x * k, center_y + (y - center_y) * k, zz))
            uuvs.append(uvs[r * segs + c])
    last_ring = uverts[-segs:]
    for c, a in enumerate(angles):
        x, y, zz = last_ring[c]
        depth = RNG.uniform(0.01, 0.07) if c % 3 else RNG.uniform(0.0, 0.02)
        uverts.append((x, y, zz - 0.012 - depth))
        uuvs.append((c / segs, -depth * 2))
    parts['underskirt'] = mesh_object('shaw_underskirt', uverts, grid_faces(rows - r0 + 1, segs, wrap=True), uuvs)

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
            py = (hit.y if hit is not None else back.y + 0.02) + 0.007 + 0.004 * math.sin(t * 5 + s)
            tail.append(Vector((px, max(py, back.y + 0.012), pz)))
            tw.append(0.046 + 0.022 * t)
        twist = [Vector((s * 0.12 * math.sin(k / 16 * 3.0), 1, 0)).normalized() for k in range(17)]
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
    rows, cols = 48, 22
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
    for _ in range(24):
        sm[1:-1, 1:-1] = (sm[:-2, 1:-1] + sm[2:, 1:-1] + sm[1:-1, :-2] + sm[1:-1, 2:] + 2 * sm[1:-1, 1:-1]) / 6
    flat = np.maximum(sm, depth) + 0.0065
    # Layered strips (same seam lines as textures.mask_texture): each strip's lower edge laps over
    # the strip below (a step out), tapering to tuck under the next strip; strips puff slightly;
    # the off-centre vertical seam is a raised ridge. Physical relief, not just paint.
    from textures import MASK_SEAMS, mask_seam_v, mask_vseam_u
    def relief(ut, vt):
        lines = [mask_seam_v(i, ut) for i in range(len(MASK_SEAMS))]
        below = max([l for l in lines if l <= vt], default=0.0)
        above = min([l for l in lines if l > vt], default=1.0)
        frac = (vt - below) / max(1e-4, above - below)
        lap = 0.0024 * (1 - frac) ** 3.5 + 0.0006 * (1 - frac) if below > 0 else 0.0
        puff = 0.0003 * math.sin(math.pi * frac)
        ridge = 0.0018 * math.exp(-((ut - mask_vseam_u(vt)) / 0.018) ** 2)
        return lap + puff + ridge
    verts, uvs = [], []
    for r in range(rows):
        for c in range(cols):
            uu, rr = grid[r][c]
            ut, vt = c / (cols - 1), r / (rows - 1)
            edge = abs(ut * 2 - 1)
            low = max(0.0, 1 - r / (rows * 0.35))           # lower third tucks in under the jaw
            off = flat[r, c] - 0.020 * edge ** 2.5 - 0.010 * low * edge + relief(ut, vt) * (1 - 0.6 * edge ** 3)
            verts.append(tuple(hp(uu, off, rr)))
            uvs.append((ut, vt))
    mask_obj = mesh_object('shaw_mask', verts, grid_faces(rows, cols), uvs)
    solidify(mask_obj, 0.003, 1)
    parts['mask'] = mask_obj
    mgrid = np.array(verts).reshape(rows, cols, 3)
    # Pins / clips: on the strip edges and down the vertical seam (as on the approved close-up).
    pins_v, pins_f = [], []
    targets = []
    for i in range(len(MASK_SEAMS)):
        for ut in (RNG.uniform(0.12, 0.3), RNG.uniform(0.55, 0.85)):
            if RNG.random() < 0.75:
                targets.append((ut, mask_seam_v(i, ut) + 0.006))
    for vt in (0.2, 0.45, 0.7, 0.88):
        targets.append((mask_vseam_u(vt) + 0.03, vt))
    for ut, vt in targets:
        fr_, fc = vt * (rows - 1), ut * (cols - 1)
        r0, c0 = min(int(fr_), rows - 2), min(int(fc), cols - 2)
        a, b = fr_ - r0, fc - c0
        p = Vector(mgrid[r0, c0] * (1 - a) * (1 - b) + mgrid[r0 + 1, c0] * a * (1 - b) + mgrid[r0, c0 + 1] * (1 - a) * b + mgrid[r0 + 1, c0 + 1] * a * b)
        t_u = Vector(mgrid[r0, c0 + 1] - mgrid[r0, c0]).normalized()
        t_v = Vector(mgrid[r0 + 1, c0] - mgrid[r0, c0]).normalized()
        nrm = t_u.cross(t_v).normalized()
        if nrm.dot(fwd_w) < 0:
            nrm = -nrm
        p = p + nrm * 0.003                               # on the outer surface (solidify outward)
        base = len(pins_v)
        t1 = t_u; t2 = nrm.cross(t1)
        pins_v.append(tuple(p + nrm * 0.0042))
        for j in range(6):
            ang = 2 * math.pi * j / 6
            pins_v.append(tuple(p + nrm * 0.0008 + (t1 * math.cos(ang) + t2 * math.sin(ang)) * 0.0034))
        for j in range(6):
            pins_f.append((base, base + 1 + j, base + 1 + (j + 1) % 6))
    parts['pins'] = mesh_object('shaw_mask_pins', pins_v, pins_f)

    # Scalp shell under the hair (top, back and sides of the head, not the face).
    f_rel = (co - np.array(cen_w)) @ np.array(fwd_w)
    u_rel = (co - np.array(cen_w)) @ np.array(up_w)
    scalp_mask = hmask & (((u_rel > chin + 0.09) & (f_rel < front - 0.035)) | (f_rel < -0.02) & (u_rel > chin + 0.04))
    parts['scalp'] = extract(skin, scalp_mask, 'shaw_scalp', lambda c, v: 0.005)
    decimate(parts['scalp'], 0.3)                      # dark under-layer beneath the bob only

    # Hair (approved head views): a dense, messy dark BOB. A volume shell from the crown to jaw
    # length (open over the face covering), with strand cards lying on it that break the outline
    # and end in ragged tips, plus loose strands falling over the covering.
    hair_tree = bvh(subset(skin, hmask | (neck > 0.3), 'tmp_head2'), mask_obj)
    bpy.data.objects.remove(bpy.data.objects['tmp_head2'], do_unlink=True)
    def horiz(th):
        return (fwd_w * math.cos(th) + right_w * math.sin(th)).normalized()
    open_half = math.radians(62)                      # face opening (front), from the front axis
    cols_h = 30
    thetas = [open_half + (2 * math.pi - 2 * open_half) * c / (cols_h - 1) for c in range(cols_h)]
    dome_rows, hang_rows = 9, 7
    u_eq = 0.0
    u_bot = chin + 0.030
    shell = []                                        # rows of points
    for k in range(dome_rows):
        phi = math.radians(84) * (1 - k / (dome_rows - 1))
        row = []
        for th in thetas:
            d = (up_w * math.sin(phi) + horiz(th) * math.cos(phi)).normalized()
            hit = head_tree.ray_cast(cen_w + d * 0.3, -d, 0.5)
            p = hit[0] if hit[0] is not None else cen_w + d * half_w
            thick = 0.007 + 0.013 * (1 - math.sin(phi))
            row.append(p + d * thick)
        shell.append(row)
    eq = shell[-1]
    for k in range(1, hang_rows + 1):
        t = k / hang_rows
        uu = u_eq + (u_bot - u_eq) * t
        row = []
        for c, th in enumerate(thetas):
            d = horiz(th)
            backness = max(0.0, -math.cos(th))
            o = hp(uu, 0, 0)
            hit = head_tree.ray_cast(o + d * 0.3, -d, 0.5)
            r_head = (hit[0] - o).length if hit[0] is not None else 0.0
            r_eq = (eq[c] - hp(u_eq, 0, 0)).length
            rad = max(r_eq * (1 + 0.05 * t) , r_head + 0.014)
            # Bob: shorter at the nape, ends tuck slightly, side edge toward the face swings forward.
            lift = 0.020 * backness * t
            row.append(hp(uu + lift, 0, 0) + d * (rad - 0.010 * t ** 3))
        shell.append(row)
    rows_h = len(shell)
    hv = [tuple(p) for row in shell for p in row]
    huv = [(c / (cols_h - 1) * 0.5, 1 - r / (rows_h - 1)) for r in range(rows_h) for c in range(cols_h)]
    hf = grid_faces(rows_h, cols_h)
    # Ragged ends: a row of uneven points below the shell's lower edge.
    base = len(hv)
    for c in range(cols_h):
        p = Vector(shell[-1][c])
        drop = (0.012 + 0.035 * RNG.random() ** 2) if c % 2 else RNG.uniform(0.0, 0.010)
        hv.append(tuple(p - up_w * drop + (p - hp((p - cen_w).dot(up_w), 0, 0)).normalized() * -0.004))
        huv.append((c / (cols_h - 1) * 0.5, -0.05))
    for c in range(cols_h - 1):
        a, b = (rows_h - 1) * cols_h + c, (rows_h - 1) * cols_h + c + 1
        hf.append((a, b, base + c + 1, base + c))
    shell_obj = mesh_object('shaw_hair_shell', hv, hf, huv)
    solidify(shell_obj, 0.004, 1)
    parts['hair'] = shell_obj
    surf = bvh(shell_obj)

    def strand(root, length, width, drift, over=False, seg=8):
        """A strand card lying on the shell (or on the face covering), drifting with gravity."""
        tree_s = hair_tree if over else surf
        pts, outs = [], []
        p = root.copy()
        d = (-up_w + drift).normalized()
        for k in range(seg + 1):
            q, nrm, _, _ = tree_s.find_nearest(p)
            if q is not None and (p - q).length < 0.03:
                if nrm.dot(p - cen_w) < 0:
                    nrm = -nrm
                p = q + nrm * (0.0025 if not over else 0.0055)
            pts.append(p.copy()); outs.append(nrm if nrm is not None else up_w)
            d = (d + Vector((0, 0, -0.35)) + Vector((RNG.uniform(-1, 1), RNG.uniform(-1, 1), 0)) * 0.12).normalized()
            p = p + d * (length / seg)
        return pts, [width * (1 - 0.8 * (k / seg) ** 1.5) for k in range(seg + 1)], outs
    strands = []
    for k in range(170):
        c = RNG.randrange(cols_h)
        r = RNG.randrange(1, dome_rows - 2)
        root = Vector(shell[r][c])
        lower = Vector(shell[-1][c])
        length = (root - lower).length + RNG.uniform(0.0, 0.035)
        st = strand(root, length, RNG.uniform(0.004, 0.009), right_w * RNG.uniform(-0.15, 0.15))
        if RNG.random() < 0.25:                        # flyaways: lift the lower half off the bob
            pts, widths, outs = st
            n = len(pts)
            for j in range(n // 2, n):
                pts[j] = pts[j] + outs[j] * 0.010 * ((j - n // 2) / (n - n // 2)) ** 1.5
        strands.append(st)
    # Loose strands over the covering: from the top/front edge of the bob, more on her right.
    for k in range(16):
        side = -1 if k < 10 else 1
        rr = side * RNG.uniform(0.012, 0.062)
        root = hp(crown - 0.050, front - 0.010, rr)
        strands.append(strand(root, RNG.uniform(0.10, 0.17), RNG.uniform(0.004, 0.009), right_w * side * 0.08 + fwd_w * 0.2, over=True))
    sv, sf, suv = [], [], []
    for i, (pts, widths, outs) in enumerate(strands):
        b0 = len(sv)
        n = len(pts)
        u0 = 0.5 + 0.5 * (i % 12) / 12
        for j, p in enumerate(pts):
            t = (pts[min(j + 1, n - 1)] - pts[max(j - 1, 0)]).normalized()
            sd = t.cross(outs[j]).normalized()
            sv += [tuple(p - sd * widths[j] / 2), tuple(p + sd * widths[j] / 2)]
            suv += [(u0, 1 - j / (n - 1)), (u0 + 0.04, 1 - j / (n - 1))]
        for j in range(n - 1):
            sf.append((b0 + 2 * j, b0 + 2 * j + 1, b0 + 2 * j + 3, b0 + 2 * j + 2))
    parts['hair_strands'] = mesh_object('shaw_hair_strands', sv, sf, suv)

    # Nurse's cap (approved head views): a FOLDED, wedge-shaped starched cap perched on the crown.
    # A band rising from the head and flaring outward (wider at the top than the head, side corners
    # standing out), tallest at the front where it turns up into a cuff carrying the burgundy
    # stripe, lowest at the back; a flat, folded top. Smooth shading (flat facets read as a checkerboard in game).
    seg = 32
    hb_front = crown - 0.050
    band_rows = (0.0, 0.30, 0.62, 0.82, 1.0)          # fraction of the band height
    tex_v = (0.0, 0.26, 0.54, 0.74, 0.80)             # stripe painted at v 0.60-0.72 (upper band)
    cap_v, cap_uv = [], []
    for k, frac in enumerate(band_rows):
        for c in range(seg):
            th = 2 * math.pi * c / seg
            d = horiz(th)
            fr = math.cos(th); sd = abs(math.sin(th))
            hb = hb_front + 0.016 * (1 - fr) / 2           # base sits higher toward the back
            o = hp(hb, 0, 0)
            hit = head_tree.ray_cast(o + d * 0.3, -d, 0.5)
            rad = ((hit[0] - o).length if hit[0] is not None else half_w) + 0.006
            H = 0.050 + 0.030 * max(0.0, fr) - 0.014 * max(0.0, -fr)
            flare = 0.008 + 0.026 * sd * (0.55 + 0.45 * max(0.0, fr + 0.2)) + 0.007 * max(0.0, fr)
            # Cuff: the front rises vertically, then folds outward above ~60% (crease).
            out = flare * (max(0.0, frac - 0.30) / 0.70) ** 1.4
            lean_back = -0.012 * frac * max(0.0, -fr)
            p = hp(hb + H * frac, 0, 0) + d * (rad + out) + fwd_w * lean_back
            cap_v.append(tuple(p))
            cap_uv.append((c / seg, tex_v[k]))
    top_ring = [Vector(cap_v[(len(band_rows) - 1) * seg + c]) for c in range(seg)]
    centre = sum(top_ring, Vector()) / seg
    # Folded top: dips slightly below the rim but always clears the hair dome over the crown.
    centre = centre + up_w * (max(crown + 0.022, (centre - cen_w).dot(up_w) - 0.006) - (centre - cen_w).dot(up_w))
    for k, t in enumerate((0.45, 0.8)):
        for c in range(seg):
            p = top_ring[c].lerp(centre, t)
            p = p + up_w * max(0.0, (crown + 0.018) - (p - cen_w).dot(up_w)) * (t ** 0.5)
            fold = 0.004 * math.sin(2 * math.pi * c / seg * 2)  # pleats
            cap_v.append(tuple(p + up_w * fold))
            cap_uv.append((c / seg, 0.86 + 0.08 * k))
    top = len(cap_v)
    cap_v.append(tuple(centre))
    cap_uv.append((0.5, 1.0))
    total_rows = len(band_rows) + 2
    cap_f = grid_faces(total_rows, seg, wrap=True)
    last = (total_rows - 1) * seg
    for c in range(seg):
        cap_f.append((last + c, last + (c + 1) % seg, top))
    parts['cap'] = mesh_object('shaw_cap', cap_v, cap_f, cap_uv)
    band_faces = (len(band_rows) - 1) * seg
    for poly in parts['cap'].data.polygons:               # smooth band, crisp folded top
        poly.use_smooth = poly.index < band_faces
    solidify(parts['cap'], 0.0035, 0)

    # ---- Feet: Mary-Jane shoes ---------------------------------------------------------------
    shoe_mask = (feet > 0.35) & (z < 0.15)
    parts['shoes'] = extract(skin, shoe_mask, 'shaw_shoes', lambda c, v: 0.0085)
    smooth_shell(parts['shoes'], 14, 0.5)
    decimate(parts['shoes'], 0.5)
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
            L = 0.034 if f > 1 else 0.026
            s_ = 1 if side == 'L' else -1
            palm = -Vector((s_, 0.15, 0.0)).normalized()     # claws hook toward the palm
            palm = (palm - d * palm.dot(d)).normalized()
            rings = ((-0.008, 0.0052, 0.0), (0.35, 0.0042, 0.25), (0.7, 0.0026, 0.6))
            for along, rad, hook in rings:
                centre = tip + d * (along * L if along > 0 else along) + palm * (0.009 * hook)
                for j in range(6):
                    a = 2 * math.pi * j / 6
                    cv.append(tuple(centre + (n0 * math.cos(a) + n1 * math.sin(a) * 0.7) * rad))
            cv.append(tuple(tip + d * L + palm * 0.011))
            for r in range(2):
                for j in range(6):
                    cf.append((base + r * 6 + j, base + r * 6 + (j + 1) % 6, base + (r + 1) * 6 + (j + 1) % 6, base + (r + 1) * 6 + j))
            for j in range(6):
                cf.append((base + 12 + j, base + 12 + (j + 1) % 6, base + 18))
    parts['claws'] = mesh_object('shaw_claws', cv, cf)

    for tmp in (core, core_dress):
        bpy.data.objects.remove(tmp, do_unlink=True)
    # Hide the body under the costume (no z-fighting, fewer triangles).
    covered = ((torso > 0.55) & (z > 0.60) & (z < 1.55)) | ((wsum(W, 'upperleg') > 0.4) & (z > 0.62)) | ((arm_up > 0.6) & (z > sleeve_end + 0.04))
    # Optimisation (R04A.2): skin that can never be seen. The skull under the scalp/hair/cap, the
    # face under the covering, the eyes, and the feet inside the shoes.
    face_front = hmask & (f_rel > front - 0.045) & (u_rel > chin + 0.02)
    covered |= scalp_mask | face_front | (wsum(W, 'eye') > 0.3) | ((feet > 0.35) & (z < 0.15))
    bm = bmesh.new(); bm.from_mesh(skin.data); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(covered[v.index] for v in f.verts)], context='FACES_ONLY')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(skin.data); bm.free()
    # Arms, legs and neck are smooth, slender forms: decimate them, keep the hands at full detail.
    W2 = group_weights(skin)
    protect = np.clip(wsum(W2, 'finger', 'metacarpal', 'wrist') * 1.5, 0, 1)
    kept = float((protect > 0.5).mean())
    decimate(skin, kept + 0.55 * (1 - kept), protect)   # halve only the unprotected part
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
    sculpt_hands(skin, rig)
    parts = build(skin, rig)
    for o in list(parts.values()):
        apply_modifiers(o)
    M.assign(skin, parts)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'shaw_dressed.blend'))
    tris = sum(len(o.data.loop_triangles) if o.data.calc_loop_triangles() is None else 0 for o in [skin, *parts.values()])
    print('objects', len(parts) + 1, 'triangles', sum(len(o.data.loop_triangles) for o in [skin, *parts.values()]))


if __name__ == '__main__':
    main()
