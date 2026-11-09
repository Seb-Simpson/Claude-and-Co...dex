"""Encode the title-screen light passes for the browser (run with the Blender Python: it reads EXR).

    <blender-python> encode_menu.py -- <pass_dir> <out_dir> [width]

For each pass: scene-linear EXR -> scaled so its brightest 0.5% just fits -> sRGB 8-bit WebP. The
scale is written to corridor.json so the shader can undo it. The figure pass carries the figure
mask in its alpha channel. Also writes posters (the composited lit / blackout / figure states)
used for the first paint, as the no-WebGL fallback, and for reduced data.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import composite as C  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
SRC, OUT = ARGS[0], ARGS[1]
WIDTH = int(ARGS[2]) if len(ARGS) > 2 else 1920
os.makedirs(OUT, exist_ok=True)

# How bright each light group sits in the normal, lit state (the director multiplies these).
LEVELS = {'ambient': 1.0, 'exit': 0.6, 'main': 0.085, 'far': 0.4, 'exposure': 4.0}
QUALITY = {'ambient': 80, 'exit': 80, 'main_a': 84, 'main_b': 84, 'far': 78, 'figure': 80}


def resize(a, w):
    h = round(a.shape[0] * w / a.shape[1])
    if a.shape[1] == w:
        return a
    chans = [np.asarray(Image.fromarray(a[..., c].astype(np.float32), 'F').resize((w, h), Image.LANCZOS)) for c in range(a.shape[2])]
    return np.stack(chans, -1).astype(np.float64)


passes, mask = C.load_passes(SRC)
mask = resize(mask, WIDTH)
manifest = {'width': WIDTH, 'height': None, 'levels': LEVELS, 'grade': C.GRADE, 'passes': {}}
decoded = {}
for name, lin in passes.items():
    lin = resize(np.maximum(lin, 0), WIDTH)
    manifest['height'] = lin.shape[0]
    peak = float(np.percentile(lin.max(-1), 99.5))
    gain = 0.97 / max(peak, 1e-6)
    enc = C.to_srgb(lin * gain)
    rgb = (enc * 255 + 0.5).astype(np.uint8)
    if name == 'figure':
        alpha = (np.clip(mask[..., 0], 0, 1) * 255 + 0.5).astype(np.uint8)
        img = Image.fromarray(np.dstack([rgb, alpha]), 'RGBA')
    else:
        img = Image.fromarray(rgb, 'RGB')
    path = os.path.join(OUT, f'{name}.webp')
    img.save(path, 'WEBP', quality=QUALITY[name], method=6, alpha_quality=90)
    manifest['passes'][name] = {'file': f'{name}.webp', 'scale': 1 / gain, 'bytes': os.path.getsize(path)}
    # Decode what we shipped, so the posters match the browser exactly.
    back = np.asarray(Image.open(path)).astype(np.float64) / 255
    decoded[name] = C.to_linear(back[..., :3]) / gain
    if name == 'figure':
        decoded['mask'] = back[..., 3:4]
    print('NW_ENCODE', name, img.size, manifest['passes'][name]['bytes'], f'scale {1 / gain:.4f}', flush=True)

# Where the figure is (for tests and the dust/haze placement), in 0..1 image coordinates.
ys, xs = np.nonzero(decoded['mask'][..., 0] > 0.5)
H, W = decoded['mask'].shape[:2]
manifest['figureBox'] = [float(xs.min() / W), float(ys.min() / H), float((xs.max() + 1) / W), float((ys.max() + 1) / H)]

# The hanging tube's diffuser (brightest part of main_a): the shader centres the dust cone on it.
glow = decoded['main_a'].max(-1)
ys, xs = np.nonzero(glow >= np.percentile(glow, 99.7))
manifest['tubeAt'] = [float(xs.mean() / W), float(ys.mean() / H)]


def poster(name, **state):
    P = {k: decoded[k] for k in C.PASSES}
    srgb = C.mix(P, decoded['mask'], levels=LEVELS, **state)
    img = Image.fromarray((srgb * 255 + 0.5).astype(np.uint8), 'RGB')
    path = os.path.join(OUT, f'poster_{name}.webp')
    img.save(path, 'WEBP', quality=78, method=6)
    manifest.setdefault('posters', {})[name] = {'file': f'poster_{name}.webp', 'bytes': os.path.getsize(path)}
    print('NW_ENCODE poster', name, os.path.getsize(path), flush=True)


poster('lit')
poster('dark', main=0, far=0)
poster('figure', main=0, far=0, figure=1, exit=1.35)
with open(os.path.join(OUT, 'corridor.json'), 'w') as f:
    json.dump(manifest, f, indent=2)
print('NW_ENCODE total', sum(p['bytes'] for p in manifest['passes'].values()), 'posters', sum(p['bytes'] for p in manifest['posters'].values()))
