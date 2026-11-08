"""Render the game rig in several clips/frames for review."""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import nwlib as nw
from mathutils import Vector
args = sys.argv[sys.argv.index('--') + 1:]
blend, out, shots = args[0], args[1], args[2].split(',')  # shots: action@frame
height = float(args[3]) if len(args) > 3 else 2.3
angle = float(args[4]) if len(args) > 4 else 50
bpy.ops.wm.open_mainfile(filepath=blend)
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
cam = nw.stage(target_height=height, camera_angle=math.radians(angle), focal=50)
for o in list(bpy.data.objects):
    if o.name.startswith('Plane') and o.location.y > 1:
        o.location.y = -3.5
nw.orbit(cam, math.radians(angle), height * 1.9, height * 0.55, height * 0.45)
os.makedirs(out, exist_ok=True)
for s in shots:
    name, frame = s.split('@')
    rig.animation_data.action = bpy.data.actions[name]
    bpy.context.scene.frame_set(int(frame))
    nw.render(os.path.join(out, f'{name}_{frame}.png'), w=480, h=640, samples=12)
