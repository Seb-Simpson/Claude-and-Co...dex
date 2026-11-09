"""Reference compositor for the title-screen light passes (mirrors src/frontend/ui/corridor.ts).

Run with the Blender Python (it reads the EXR passes through bpy):

    <blender-python> composite.py <pass_dir> <out.png> [ambient=1 exit=1 main=1 sway=0.5 far=1 figure=0 exposure=1]

Used to preview lighting states and to check the shader's grade against the source renders.
"""
import sys

import numpy as np

# The browser grade (keep in sync with GRADE in src/frontend/ui/corridorShader.ts).
GRADE = {'exposure': 1.0, 'saturation': 0.7, 'tint': (0.92, 1.0, 1.0)}
PASSES = ('ambient', 'exit', 'main_a', 'main_b', 'far', 'figure')


def load_exr(path):
    import bpy
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    return a.reshape(h, w, 4)[::-1].astype(np.float64)


def to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, np.power((c + 0.055) / 1.055, 2.4))


def tonemap(x, exposure=1.0):
    """ACES fit, then a cold desaturating grade that spares reds (mirrors the shader)."""
    x = x * GRADE['exposure'] * exposure
    y = np.clip((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0, 1)
    lum = (y * [0.2126, 0.7152, 0.0722]).sum(-1, keepdims=True)
    red = np.clip((y[..., :1] - y[..., 1:2] * 1.5) * 3.0, 0, 1)
    sat = GRADE['saturation'] + (1 - GRADE['saturation']) * red
    y = lum + (y - lum) * sat
    return y * GRADE['tint']


def vignette(h, w):
    yy, xx = np.mgrid[0:h, 0:w]
    u = (xx + 0.5) / w - 0.5
    v = ((yy + 0.5) / h - 0.5) * 1.15
    d = np.sqrt(u * u + v * v) * 1.414
    k = np.clip((d - 0.45) / (1.1 - 0.45), 0, 1)
    return (1 - 0.42 * k * k * (3 - 2 * k))[..., None]


def mix(P, mask, levels=None, ambient=1.0, exit=1.0, main=1.0, sway=0.5, far=1.0, figure=0.0, exposure=None):
    L = levels or {'ambient': 1, 'exit': 1, 'main': 1, 'far': 1, 'exposure': 1}
    a, e, m, f = ambient * L['ambient'], exit * L['exit'], main * L['main'], far * L['far']
    tube = (1 - sway) * P['main_a'] + sway * P['main_b']
    scene = a * P['ambient'] + e * P['exit'] + m * tube + f * P['far']
    seen = e * P['figure'] + 0.15 * m * tube
    scene = scene * (1 - mask * figure) + seen * mask * figure
    out = tonemap(scene, L['exposure'] if exposure is None else exposure)
    return to_srgb(out * vignette(*scene.shape[:2]))


def load_passes(d):
    P = {k: load_exr(f'{d}/{k}.exr')[..., :3] for k in PASSES}
    mask = load_exr(f'{d}/figure_mask.exr')[..., 3:4]
    return P, mask


if __name__ == '__main__':
    from PIL import Image
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    d, out = args[0], args[1]
    kw = {k: float(v) for k, v in (a.split('=') for a in args[2:])}
    P, mask = load_passes(d)
    Image.fromarray((mix(P, mask, **kw) * 255 + 0.5).astype(np.uint8)).save(out)
