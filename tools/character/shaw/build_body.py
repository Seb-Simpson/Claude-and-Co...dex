"""NW-R04A — Nurse Shaw, stage A: body.

Builds Shaw's body from the CC0 MakeHuman base mesh (macro targets for an old, very thin woman,
plus limb-length targets), creates the MakeHuman default skeleton from the joint helpers, binds it
with the CC0 default weights, elongates forearms, hands and fingers through bone scaling, and
poses her (arms hanging, shoulders dropped, head tilted) to match the approved turnaround.

Run:  python build_body.py --mh <makehuman/data> --out <dir>
"""
from __future__ import annotations

import argparse
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector

sys.path.insert(0, os.path.dirname(__file__))
import mh  # noqa: E402

TARGET_HEIGHT = 1.90   # metres, top of the cap (approved sheet: "≈ 1.9 m (6'3")")
CAP_ALLOWANCE = 0.075  # cap above the crown
SHOE_ALLOWANCE = 0.035 # heel/sole under the foot


def to_blender(v: np.ndarray) -> np.ndarray:
    """MakeHuman (dm, +Y up, +Z forward) -> Blender (m, +Z up, -Y forward)."""
    out = np.empty_like(v)
    out[:, 0] = v[:, 0] * 0.1
    out[:, 1] = -v[:, 2] * 0.1
    out[:, 2] = v[:, 1] * 0.1
    return out


def shape_weights() -> dict[str, float]:
    # Age 58 (MakeHuman 0.75), minimal muscle and weight (gaunt), tall, ideal proportions.
    w = mh.macro_weights(age_value=0.75, muscle_value=0.15, weight_value=0.0, height_value=1.0, proportion_value=0.7)
    for side in ('l', 'r'):
        w[f'armslegs/{side}-lowerarm-scale-vert-incr.target'] = 1.0
        w[f'armslegs/{side}-upperarm-scale-vert-incr.target'] = 0.6
        w[f'armslegs/{side}-hand-fingers-length-incr.target'] = 1.0
        w[f'armslegs/{side}-hand-scale-incr.target'] = 0.6
        w[f'armslegs/{side}-lowerarm-scale-horiz-decr.target'] = 0.5
        w[f'armslegs/{side}-upperarm-scale-horiz-decr.target'] = 0.6
        w[f'armslegs/{side}-upperleg-scale-horiz-decr.target'] = 0.5
        w[f'armslegs/{side}-lowerleg-scale-horiz-decr.target'] = 0.4
        w[f'armslegs/{side}-lowerleg-scale-vert-incr.target'] = 0.4
    w['neck/neck-scale-vert-incr.target'] = 0.6
    w['neck/neck-scale-horiz-decr.target'] = 0.5
    w['torso/torso-scale-horiz-decr.target'] = 0.5
    w['torso/torso-scale-depth-decr.target'] = 0.4
    w['breast/breast-volume-vert-down.target'] = 0.3
    w['hip/hip-scale-horiz-decr.target'] = 0.7
    w['hip/hip-scale-depth-decr.target'] = 0.4
    return w


def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_body(base: mh.BaseMesh, verts: np.ndarray) -> bpy.types.Object:
    faces = base.group_faces('body')
    used = sorted({v for f in faces for v, _ in f})
    remap = {old: new for new, old in enumerate(used)}
    co = to_blender(verts[used])
    mesh = bpy.data.meshes.new('shaw_body')
    mesh.from_pydata(co.tolist(), [], [[remap[v] for v, _ in f] for f in faces])
    uv = mesh.uv_layers.new(name='UVMap')
    loop = 0
    for f in faces:
        for _, vt in f:
            uv.data[loop].uv = base.uvs[vt] if vt >= 0 else (0, 0)
            loop += 1
    mesh.validate()
    for p in mesh.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new('shaw_body', mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj['mh_index'] = used  # original MakeHuman vertex index per vertex
    return obj


def make_armature(skeleton: dict, joints: dict[str, np.ndarray]) -> bpy.types.Object:
    arm = bpy.data.armatures.new('shaw_rig')
    obj = bpy.data.objects.new('shaw_rig', arm)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    pos = {k: to_blender(v[None, :])[0] for k, v in joints.items()}
    for name, bone in skeleton['bones'].items():
        eb = arm.edit_bones.new(name)
        eb.head = Vector(pos[bone['head']])
        eb.tail = Vector(pos[bone['tail']])
        if (eb.tail - eb.head).length < 1e-4:
            eb.tail = eb.head + Vector((0, 0, 0.01))
    for name, bone in skeleton['bones'].items():
        if bone.get('parent'):
            arm.edit_bones[name].parent = arm.edit_bones[bone['parent']]
    bpy.ops.object.mode_set(mode='OBJECT')
    return obj


def bind(body: bpy.types.Object, rig: bpy.types.Object, weights: dict) -> None:
    index = {old: new for new, old in enumerate(body['mh_index'])}
    for bone, pairs in weights.items():
        group = body.vertex_groups.new(name=bone)
        for vid, w in pairs:
            if vid in index:
                group.add([index[vid]], w, 'REPLACE')
    body.parent = rig
    mod = body.modifiers.new('rig', 'ARMATURE')
    mod.object = rig


def rotate_world(rig: bpy.types.Object, name: str, axis: tuple, degrees: float) -> None:
    """Rotate a pose bone about a world-space axis through its head (children follow)."""
    pb = rig.pose.bones.get(name)
    if pb is None:
        return
    bpy.context.view_layer.update()
    head = pb.matrix.to_translation()
    rot = Matrix.Translation(head) @ Matrix.Rotation(math.radians(degrees), 4, Vector(axis)) @ Matrix.Translation(-head)
    pb.matrix = rot @ pb.matrix
    bpy.context.view_layer.update()


def aim_bone(rig: bpy.types.Object, name: str, direction: tuple) -> None:
    """Rotate a pose bone (about its head) so it points along a world direction."""
    pb = rig.pose.bones.get(name)
    if pb is None:
        return
    bpy.context.view_layer.update()
    current = (pb.tail - pb.head).normalized()
    target = Vector(direction).normalized()
    q = current.rotation_difference(target)
    head = pb.head.copy()
    rot = Matrix.Translation(head) @ q.to_matrix().to_4x4() @ Matrix.Translation(-head)
    pb.matrix = rot @ pb.matrix
    bpy.context.view_layer.update()


def pose(rig: bpy.types.Object) -> None:
    """Static turnaround pose (approved sheet): arms hanging straight beside the thighs, legs
    together and straight, slight forward stoop, head tilted to her right and dropped."""
    FWD = (0, 1, 0)
    SIDE = (1, 0, 0)
    for side, s in (('L', 1), ('R', -1)):
        rotate_world(rig, f'clavicle.{side}', FWD, 5 * s)
        for seg in ('upperleg01', 'upperleg02'):
            aim_bone(rig, f'{seg}.{side}', (s * 0.035, 0.0, -1))
        for seg in ('lowerleg01', 'lowerleg02'):
            aim_bone(rig, f'{seg}.{side}', (s * 0.01, 0.015, -1))
        for seg in ('upperarm01', 'upperarm02'):
            aim_bone(rig, f'{seg}.{side}', (s * 0.16, 0.03, -1))
        for seg in ('lowerarm01', 'lowerarm02'):
            aim_bone(rig, f'{seg}.{side}', (s * 0.07, -0.04, -1))
        aim_bone(rig, f'wrist.{side}', (s * 0.03, -0.05, -1))
    # Feet flat: re-aim the foot forward after the leg change.
    for side, s in (('L', 1), ('R', -1)):
        aim_bone(rig, f'foot.{side}', (s * 0.08, -1, -0.45))
    # Long, bony fingers (approved hand close-up): lengthen phalanges along their axis.
    for side in ('L', 'R'):
        for f in range(1, 6):
            b = rig.pose.bones.get(f'finger{f}-1.{side}')
            if b is not None:
                b.scale = (0.92, 1.28 if f > 1 else 1.12, 0.92)
        for m in range(1, 5):
            b = rig.pose.bones.get(f'metacarpal{m}.{side}')
            if b is not None:
                b.scale = (1.0, 1.12, 1.0)
    bpy.context.view_layer.update()
    rotate_world(rig, 'spine02', SIDE, 3)
    rotate_world(rig, 'neck01', SIDE, 6)
    rotate_world(rig, 'head', SIDE, 7)
    rotate_world(rig, 'head', FWD, -12)


def main() -> None:
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument('--mh', required=True)
    ap.add_argument('--out', required=True)
    args = ap.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)
    reset()
    base = mh.load_obj(os.path.join(args.mh, '3dobjs', 'base.obj'))
    verts = mh.apply_targets(base.verts, args.mh, shape_weights())
    skeleton = mh.load_skeleton(args.mh)
    joints = mh.joint_positions(skeleton, verts)
    body = make_body(base, verts)
    rig = make_armature(skeleton, joints)
    bind(body, rig, mh.load_weights(args.mh))
    pose(rig)
    # Scale the whole figure so cap top reaches TARGET_HEIGHT; floor at the shoe sole.
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(deps)
    zs = [v.co.z for v in ev.data.vertices]
    raw = max(zs) - min(zs)
    scale = (TARGET_HEIGHT - CAP_ALLOWANCE - SHOE_ALLOWANCE) / raw
    rig.scale = (scale, scale, scale)
    rig.location.z = -min(zs) * scale + SHOE_ALLOWANCE
    bpy.context.view_layer.update()
    print(f'raw body {raw:.3f} m -> scale {scale:.3f}')
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(args.out, 'shaw_body.blend'))


if __name__ == '__main__':
    main()
