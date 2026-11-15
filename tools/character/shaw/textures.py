"""Painted textures for Shaw's face covering and cap (numpy), from the approved close-up:
horizontal stitched canvas strips, an off-centre vertical seam, pins, grime at the edges and a
blood streak running down from the brow. The cap: weathered cotton with a burgundy stripe.
Returns linear float RGBA arrays (H, W, 4) plus height and roughness arrays.
"""
from __future__ import annotations

import numpy as np

RNG = np.random.default_rng(317)


def _noise(h, w, scale, octaves=5, seed=0):
    rng = np.random.default_rng(seed)
    out = np.zeros((h, w))
    amp = 1.0
    for o in range(octaves):
        gh, gw = max(2, int(h / scale * 2 ** o)), max(2, int(w / scale * 2 ** o))
        g = rng.random((gh + 1, gw + 1))
        yi = np.linspace(0, gh, h); xi = np.linspace(0, gw, w)
        y0 = np.floor(yi).astype(int); x0 = np.floor(xi).astype(int)
        y1 = np.minimum(y0 + 1, gh); x1 = np.minimum(x0 + 1, gw)
        fy = (yi - y0)[:, None]; fx = (xi - x0)[None, :]
        fy = fy * fy * (3 - 2 * fy); fx = fx * fx * (3 - 2 * fx)
        a = g[y0][:, x0] * (1 - fx) + g[y0][:, x1] * fx
        b = g[y1][:, x0] * (1 - fx) + g[y1][:, x1] * fx
        out += (a * (1 - fy) + b * fy) * amp
        amp *= 0.5
    return out / out.max()


def srgb_to_linear(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def mask_texture(size=1024):
    h = w = size
    v = np.linspace(0, 1, h)[:, None] * np.ones((1, w))   # 0 = chin (bottom), 1 = brow (top)
    u = np.ones((h, 1)) * np.linspace(0, 1, w)[None, :]
    base = srgb_to_linear([0.66, 0.60, 0.52])
    n1 = _noise(h, w, 64, seed=1); n2 = _noise(h, w, 8, seed=2); n3 = _noise(h, w, 220, seed=3)
    tone = 0.80 + 0.25 * n1 + 0.06 * n2
    height = 0.5 * n2
    rough = np.full((h, w), 0.9)
    # Horizontal strips (overlapping bandage panels), slightly slanted and wavy.
    seams = [0.10, 0.21, 0.33, 0.44, 0.56, 0.67, 0.79, 0.90]
    strip_id = np.zeros((h, w))
    seam_dist = np.full((h, w), 1.0)
    for i, s in enumerate(seams):
        line = s + 0.015 * np.sin(u * 7 + i) + 0.02 * (u - 0.5) * (1 if i % 2 else -1)
        d = np.abs(v - line)
        seam_dist = np.minimum(seam_dist, d)
        strip_id += (v > line)
    strip_tone = (0.92 + 0.10 * RNG.random(len(seams) + 1))[strip_id.astype(int)]
    tone *= strip_tone
    tone *= 1 - 0.35 * np.exp(-(seam_dist / 0.006) ** 2)           # seam shadow
    height += 0.6 * np.exp(-(seam_dist / 0.01) ** 2)                # overlapping edge ridge
    # Off-centre vertical seam.
    vline = 0.43 + 0.02 * np.sin(v * 9)
    vd = np.abs(u - vline)
    tone *= 1 - 0.4 * np.exp(-(vd / 0.005) ** 2)
    height += 0.4 * np.exp(-(vd / 0.008) ** 2)
    # Stitches: short dark ticks along the seams.
    stitches = np.zeros((h, w))
    for i, s in enumerate(seams):
        for x in np.arange(0.04, 0.96, 0.035):
            y = s + 0.015 * np.sin(x * 7 + i) + 0.02 * (x - 0.5) * (1 if i % 2 else -1)
            cx, cy = int(x * w), int((y + 0.012) * h)
            stitches[max(0, cy - 6):cy + 6, max(0, cx - 1):cx + 2] = 1
    tone *= 1 - 0.5 * stitches
    # Grime toward the edges and the bottom.
    edge = np.minimum(np.minimum(u, 1 - u), np.minimum(v, 1 - v))
    tone *= 0.55 + 0.45 * np.clip(edge / 0.12, 0, 1) ** 0.6
    tone *= 0.85 + 0.15 * np.clip(v * 1.4, 0, 1)
    rgb = base[None, None, :] * tone[..., None]
    # Blood: a streak from the brow down the left of centre, drips, splatter; brown where dry.
    blood_fresh = srgb_to_linear([0.42, 0.05, 0.04]); blood_dry = srgb_to_linear([0.25, 0.07, 0.05])
    streak_u = 0.36 + 0.03 * np.sin(v * 13) + 0.02 * (1 - v)
    streak = np.exp(-((u - streak_u) / (0.025 + 0.03 * v)) ** 2) * np.clip((v - 0.15) / 0.5, 0, 1)
    streak *= 0.6 + 0.6 * n2
    drips = np.zeros((h, w))
    for x in RNG.uniform(0.25, 0.75, 9):
        top = RNG.uniform(0.55, 0.95); length = RNG.uniform(0.15, 0.5); width = RNG.uniform(0.004, 0.009)
        drips += np.exp(-((u - x) / width) ** 2) * ((v < top) & (v > top - length)) * np.clip((v - (top - length)) / 0.05, 0, 1)
    splat = (n2 > 0.80) * (n1 > 0.55) * 1.0
    blood = np.clip(streak + drips + 0.8 * splat, 0, 1)
    wet = np.clip(n3 * 1.3 - 0.2, 0, 1)
    bcol = blood_fresh[None, None, :] * wet[..., None] + blood_dry[None, None, :] * (1 - wet[..., None])
    rgb = rgb * (1 - blood[..., None]) + bcol * blood[..., None]
    rough = rough - 0.4 * blood * wet
    # Rust spots round the pins.
    for x, y in RNG.uniform(0.15, 0.85, (14, 2)):
        d = np.hypot(u - x, v - y)
        rgb *= (1 - 0.5 * np.exp(-(d / 0.012) ** 2))[..., None]
    rgba = np.concatenate([rgb, np.ones((h, w, 1))], axis=-1)
    return rgba, np.clip(height, 0, 1), np.clip(rough, 0.2, 1)


def cap_texture(w=1024, h=256):
    v = np.linspace(0, 1, h)[:, None] * np.ones((1, w))
    u = np.ones((h, 1)) * np.linspace(0, 1, w)[None, :]
    base = srgb_to_linear([0.70, 0.64, 0.56])
    burg = srgb_to_linear([0.36, 0.07, 0.08])
    n1 = _noise(h, w, 40, seed=5); n2 = _noise(h, w, 6, seed=6)
    tone = 0.75 + 0.3 * n1 + 0.06 * n2
    stripe = ((v > 0.50) & (v < 0.72)).astype(float)
    rgb = base[None, None, :] * tone[..., None] * (1 - stripe[..., None]) + burg[None, None, :] * (0.8 + 0.3 * n1[..., None]) * stripe[..., None]
    # Stains and grime at the lower edge (sweat and blood).
    stain = np.clip((n1 - 0.62) * 4, 0, 1) * (1 - v * 0.5)
    rgb = rgb * (1 - 0.6 * stain[..., None]) + srgb_to_linear([0.30, 0.08, 0.06])[None, None, :] * 0.6 * stain[..., None]
    rgb *= (0.7 + 0.3 * np.clip(v / 0.2, 0, 1))[..., None]
    rgba = np.concatenate([rgb, np.ones((h, w, 1))], axis=-1)
    height = 0.4 * n2 + 0.3 * np.exp(-((v - 0.50) / 0.01) ** 2) + 0.3 * np.exp(-((v - 0.72) / 0.01) ** 2)
    return rgba, height, np.full((h, w), 0.85)


def to_image(bpy, name, rgba, colorspace='sRGB'):
    hgt, wid = rgba.shape[:2]
    img = bpy.data.images.new(name, wid, hgt, alpha=True, float_buffer=False)
    img.colorspace_settings.name = 'Linear Rec.709' if colorspace == 'linear' else 'sRGB'
    data = rgba.copy()
    if colorspace == 'sRGB':
        data[..., :3] = np.where(data[..., :3] <= 0.0031308, data[..., :3] * 12.92, 1.055 * np.power(np.clip(data[..., :3], 0, None), 1 / 2.4) - 0.055)
    img.pixels.foreach_set(np.clip(data, 0, 1).astype(np.float32).ravel())
    img.pack()
    return img


def gray_image(bpy, name, arr):
    rgba = np.stack([arr, arr, arr, np.ones_like(arr)], axis=-1)
    return to_image(bpy, name, rgba, 'linear')
