"""Title-screen artwork, generated (no stock art): the distressed NIGHT WARD title, the weathered
Halden Vale Infirmary seal, the torn surfaces behind the menu items and their red glow.

    python3 make_menu_art.py <out_dir>          (numpy, scipy, Pillow)

Typeface: Cormorant Garamond (SIL Open Font License), from the project's own @fontsource package.
The seal's cross is bone-white, never red-on-white (that emblem is protected).
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(__file__), '../../../..')
FONTS = os.path.join(ROOT, 'node_modules/@fontsource/cormorant-garamond/files')
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(1969)
SS = 2  # supersampling


def font(weight, style, size):
    return ImageFont.truetype(os.path.join(FONTS, f'cormorant-garamond-latin-{weight}-{style}.woff'), size)


def noise(h, w, scale, octaves=4, seed=0):
    r = np.random.default_rng(seed)
    out = np.zeros((h, w))
    amp = 1.0
    total = 0.0
    for o in range(octaves):
        s = max(1, int(scale / (2 ** o)))
        small = r.random((h // s + 2, w // s + 2))
        up = ndimage.zoom(small, s, order=3)[:h, :w]
        out += up * amp
        total += amp
        amp *= 0.5
    out /= total
    return (out - out.min()) / (out.max() - out.min() + 1e-9)


def text_mask(size, items):
    """items: (text, font, xy, tracking). Returns float alpha 0..1."""
    img = Image.new('L', size, 0)
    d = ImageDraw.Draw(img)
    for text, f, (x, y), tracking in items:
        cx = x
        for ch in text:
            d.text((cx, y), ch, font=f, fill=255)
            cx += f.getlength(ch) + tracking
    return np.asarray(img).astype(np.float64) / 255


def roughen(a, amp, scale, seed):
    h, w = a.shape
    dx = (noise(h, w, scale, 3, seed) - 0.5) * 2 * amp
    dy = (noise(h, w, scale, 3, seed + 1) - 0.5) * 2 * amp
    yy, xx = np.mgrid[0:h, 0:w]
    return ndimage.map_coordinates(a, [yy + dy, xx + dx], order=1, mode='constant')


def erode(a, coverage, scale, seed, edge_bias=1.0):
    """Knock holes out of the letters, more at the edges than in the middle."""
    inside = ndimage.distance_transform_edt(a > 0.5)
    depth = np.clip(inside / (12 * SS), 0, 1)
    n = noise(*a.shape, scale, 4, seed)
    speck = noise(*a.shape, max(2, scale // 6), 2, seed + 7)
    threshold = 1 - coverage * (1.6 - depth * edge_bias)
    holes = np.clip((n * 0.65 + speck * 0.35 - threshold) * 12, 0, 1)
    return a * (1 - holes)


def scratches(shape, count, seed, width=(1.0, 2.6), angle=(-35, 25), length=(0.15, 0.6)):
    h, w = shape
    img = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(img)
    r = np.random.default_rng(seed)
    for _ in range(count):
        x, y = r.uniform(0, w), r.uniform(0, h)
        ang = math.radians(r.uniform(*angle))
        ln = r.uniform(*length) * w * 0.4
        pts = []
        for k in range(8):
            t = k / 7
            pts.append((x + math.cos(ang) * ln * t + r.normal(0, 1.2 * SS), y + math.sin(ang) * ln * t + r.normal(0, 1.2 * SS)))
        d.line(pts, fill=255, width=max(1, int(r.uniform(*width) * SS)))
    return np.asarray(img).astype(np.float64) / 255


def drips(a, density, seed, max_len):
    """Paint running down from the bottom edges of the letters."""
    h, w = a.shape
    out = np.zeros_like(a)
    img = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(img)
    r = np.random.default_rng(seed)
    solid = a > 0.6
    x = 0
    while x < w:
        x += int(r.uniform(6, 26) * SS)
        if x >= w:
            break
        col = np.nonzero(solid[:, x])[0]
        if col.size == 0 or r.random() > density:
            continue
        # bottom edges in this column (pixel solid, pixel below empty)
        bottoms = [y for y in col if y + 1 < h and not solid[y + 1, x]]
        if not bottoms:
            continue
        y0 = bottoms[-1] if r.random() < 0.75 else r.choice(bottoms)
        length = r.uniform(0.15, 1.0) ** 2 * max_len * SS
        width = r.uniform(2.0, 6.5) * SS
        steps = max(2, int(length / 3))
        for k in range(steps):
            t = k / steps
            wk = width * (1 - 0.55 * t) * (0.9 + 0.2 * r.random())
            yy = y0 + length * t
            d.ellipse([x - wk / 2, yy - wk / 2, x + wk / 2, yy + wk / 2], fill=255)
        bead = width * r.uniform(0.9, 1.4)
        d.ellipse([x - bead / 2, y0 + length - bead / 2, x + bead / 2, y0 + length + bead * 0.7], fill=255)
    out = np.asarray(img).astype(np.float64) / 255
    return np.clip(out, 0, 1)


def colourise(a, top, bottom, texture_seed, grime, stains=None):
    h, w = a.shape
    yy = np.linspace(0, 1, h)[:, None]
    base = np.array(top)[None, None] * (1 - yy[..., None]) + np.array(bottom)[None, None] * yy[..., None]
    tex = noise(h, w, 30 * SS, 4, texture_seed)
    fine = noise(h, w, 4 * SS, 2, texture_seed + 3)
    shade = 1 - grime * (0.55 * tex + 0.45 * fine)
    rgb = base * shade[..., None]
    if stains is not None:
        colour, amount, seed = stains
        s = np.clip((noise(h, w, 60 * SS, 4, seed) - (1 - amount)) * 5, 0, 1) * (0.4 + 0.6 * yy)
        rgb = rgb * (1 - s[..., None]) + np.array(colour)[None, None] * s[..., None]
    # dark inner edge (worn paint)
    inside = ndimage.distance_transform_edt(a > 0.5)
    rim = np.clip(1 - inside / (4 * SS), 0, 1)
    rgb *= (1 - 0.35 * rim)[..., None]
    return rgb


def layer(rgb, alpha):
    return np.dstack([np.clip(rgb, 0, 255), np.clip(alpha, 0, 1) * 255]).astype(np.uint8)


def shadow(alpha, blur, opacity, offset, colour=(0, 0, 0)):
    a = ndimage.shift(alpha, offset, order=1)
    a = ndimage.gaussian_filter(a, blur) * opacity
    rgb = np.ones(alpha.shape + (3,)) * np.array(colour)
    return rgb, a


def over(dst_rgb, dst_a, rgb, a):
    out_a = a + dst_a * (1 - a)
    out_rgb = (rgb * a[..., None] + dst_rgb * dst_a[..., None] * (1 - a[..., None])) / np.maximum(out_a[..., None], 1e-6)
    return out_rgb, out_a


def save(rgba, name, size, quality=88):
    img = Image.fromarray(rgba, 'RGBA').resize(size, Image.LANCZOS)
    path = os.path.join(OUT, name)
    img.save(path, 'WEBP', quality=quality, method=6, alpha_quality=95)
    print('NW_ART', name, img.size, os.path.getsize(path), flush=True)


# Title -------------------------------------------------------------------------------------

def title():
    W, H = 1300 * SS, 640 * SS
    night_f = font(700, 'normal', 268 * SS)
    ward_f = font(700, 'italic', 330 * SS)
    night = text_mask((W, H), [('NIGHT', night_f, (34 * SS, -28 * SS), 10 * SS)])
    ward = text_mask((W, H), [('WARD', ward_f, (300 * SS, 150 * SS), 2 * SS)])

    night = roughen(night, 1.6 * SS, 10 * SS, 11)
    night = erode(night, 0.16, 22 * SS, 12)
    night *= 1 - scratches(night.shape, 70, 13, width=(0.8, 1.8)) * 0.95
    cracks = scratches(night.shape, 18, 14, width=(0.6, 1.2), angle=(60, 120), length=(0.05, 0.18))
    night *= 1 - cracks

    ward = roughen(ward, 2.4 * SS, 8 * SS, 21)
    ward = np.maximum(ward, drips(ward, 0.55, 22, 120) * (ward.max()))
    ward = erode(ward, 0.16, 16 * SS, 23)
    ward *= 1 - scratches(ward.shape, 90, 24, width=(0.8, 2.2), angle=(-50, 10)) * 0.9

    night_rgb = colourise(night, (236, 230, 216), (186, 176, 160), 31, 0.45, stains=((92, 58, 44), 0.18, 32))
    ward_rgb = colourise(ward, (156, 16, 14), (88, 6, 6), 41, 0.42)

    rgb = np.zeros((H, W, 3))
    a = np.zeros((H, W))
    s_rgb, s_a = shadow(night, 5 * SS, 0.85, (4 * SS, 3 * SS))
    rgb, a = over(rgb, a, s_rgb, s_a)
    rgb, a = over(rgb, a, night_rgb, night)
    g_rgb, g_a = shadow(ward, 16 * SS, 0.32, (0, 0), colour=(150, 10, 8))
    rgb, a = over(rgb, a, g_rgb, g_a)
    s_rgb, s_a = shadow(ward, 4 * SS, 0.8, (4 * SS, 3 * SS))
    rgb, a = over(rgb, a, s_rgb, s_a)
    rgb, a = over(rgb, a, ward_rgb, ward)
    ys, xs = np.nonzero(a > 0.02)
    crop = (slice(max(0, ys.min() - 8 * SS), min(H, ys.max() + 8 * SS)), slice(max(0, xs.min() - 8 * SS), min(W, xs.max() + 8 * SS)))
    rgba = layer(rgb[crop], a[crop])
    h, w = rgba.shape[:2]
    save(rgba, 'title.webp', (w // SS, h // SS))


# Seal ----------------------------------------------------------------------------------------

def seal():
    S = 520 * SS
    c = S / 2
    img = Image.new('L', (S, S), 0)
    d = ImageDraw.Draw(img)
    r = np.random.default_rng(5)
    # Laurel: two branches of leaves rising from a tie at the bottom, leaves pointing up the branch.
    leaves = Image.new('L', (S, S), 0)
    dl = ImageDraw.Draw(leaves)
    radius = 0.4 * S

    def leaf(px, py, dx, dy, length, width):
        nx, ny = -dy, dx
        left, right = [], []
        for k in range(13):
            u = k / 12
            hw = width / 2 * math.sin(math.pi * u) ** 0.75
            cx, cy = px + dx * length * u, py + dy * length * u
            left.append((cx + nx * hw, cy + ny * hw))
            right.append((cx - nx * hw, cy - ny * hw))
        dl.polygon(left + right[::-1], fill=255)

    for side in (-1, 1):
        stem = []
        for k in range(15):
            t = k / 14
            ang = math.radians(90 - side * (14 + t * 132))  # y-down: 90 deg is the bottom
            px, py = c + radius * math.cos(ang), c + radius * math.sin(ang)
            stem.append((px, py))
            # direction of growth along the circle
            tx, ty = side * math.sin(ang), -side * math.cos(ang)
            for flip in (-1, 1):
                spread = math.radians(34) * flip
                dx = tx * math.cos(spread) - ty * math.sin(spread)
                dy = tx * math.sin(spread) + ty * math.cos(spread)
                leaf(px, py, dx, dy, (50 - 18 * t) * SS, (19 - 6 * t) * SS)
        dl.line(stem, fill=255, width=5 * SS, joint='curve')
    # Ribbon tie.
    dl.polygon([(c - 26 * SS, c + radius - 4 * SS), (c + 26 * SS, c + radius - 4 * SS), (c + 40 * SS, c + radius + 26 * SS), (c, c + radius + 10 * SS), (c - 40 * SS, c + radius + 26 * SS)], fill=255)
    laurel = np.asarray(leaves).astype(np.float64) / 255

    # Cross with rounded, slightly flared arms.
    arm, half = 0.27 * S, 0.085 * S
    cross = Image.new('L', (S, S), 0)
    dc = ImageDraw.Draw(cross)
    dc.rounded_rectangle([c - half, c - arm, c + half, c + arm], radius=int(half * 0.35), fill=255)
    dc.rounded_rectangle([c - arm, c - half, c + arm, c + half], radius=int(half * 0.35), fill=255)
    cross_a = np.asarray(cross).astype(np.float64) / 255
    outline = np.clip(ndimage.binary_dilation(cross_a > 0.5, iterations=6 * SS).astype(float) - cross_a, 0, 1)

    # Rod of Asclepius: a staff with one serpent winding up it.
    rod = Image.new('L', (S, S), 0)
    dr = ImageDraw.Draw(rod)
    dr.rounded_rectangle([c - 7 * SS, c - arm - 18 * SS, c + 7 * SS, c + arm + 14 * SS], radius=5 * SS, fill=255)
    pts = []
    for k in range(120):
        t = k / 119
        y = c + arm * 0.95 - t * arm * 1.85
        x = c + math.sin(t * math.pi * 3.2) * (26 - 8 * t) * SS
        pts.append((x, y))
    dr.line(pts, fill=255, width=15 * SS, joint='curve')
    hx, hy = pts[-1]
    dr.ellipse([hx - 15 * SS, hy - 12 * SS, hx + 17 * SS, hy + 9 * SS], fill=255)
    rod_a = np.asarray(rod).astype(np.float64) / 255

    rgb = np.zeros((S, S, 3))
    a = np.zeros((S, S))
    laurel = erode(roughen(laurel, 1.4 * SS, 6 * SS, 51), 0.14, 14 * SS, 52)
    lrgb = colourise(laurel, (176, 172, 160), (140, 134, 122), 53, 0.4)
    rgb, a = over(rgb, a, lrgb, laurel * 0.92)
    o_rgb = np.ones((S, S, 3)) * np.array([16, 14, 12])
    rgb, a = over(rgb, a, o_rgb, outline * 0.9)
    cross_a = erode(roughen(cross_a, 1.6 * SS, 8 * SS, 54), 0.08, 18 * SS, 55)
    cross_a *= 1 - scratches(cross_a.shape, 40, 56, width=(0.7, 1.6)) * 0.85
    crgb = colourise(cross_a, (230, 224, 208), (200, 192, 176), 57, 0.3, stains=((96, 22, 16), 0.22, 58))
    rgb, a = over(rgb, a, crgb, cross_a)
    rod_a = erode(roughen(rod_a, 1.0 * SS, 5 * SS, 59), 0.06, 10 * SS, 60)
    rrgb = colourise(rod_a, (58, 56, 52), (34, 32, 30), 61, 0.3)
    rgb, a = over(rgb, a, rrgb, rod_a)
    save(layer(rgb, a), 'seal.webp', (S // SS, S // SS), quality=90)


# Menu surfaces ------------------------------------------------------------------------------

def strip(seed, name):
    W, H = 1000, 120
    a = np.zeros((H, W))
    # A torn band: ragged ends, slightly uneven top and bottom.
    yy, xx = np.mgrid[0:H, 0:W]
    top = 10 + (noise(1, W, 60, 3, seed)[0] - 0.5) * 10
    bottom = H - 10 + (noise(1, W, 60, 3, seed + 1)[0] - 0.5) * 10
    left = 18 + (noise(H, 1, 10, 3, seed + 2)[:, 0] - 0.5) * 30
    right = W - 60 - noise(H, 1, 12, 3, seed + 3)[:, 0] * 120
    inside = (yy > top[None, :]) & (yy < bottom[None, :]) & (xx > left[:, None]) & (xx < right[:, None])
    a = ndimage.gaussian_filter(inside.astype(float), 0.8)
    # fade the torn right end
    fade = np.clip((right[:, None] - xx) / 160, 0, 1) ** 0.6
    a *= fade
    tex = noise(H, W, 40, 5, seed + 4)
    fine = noise(H, W, 3, 2, seed + 5)
    base = 22 + 22 * tex + 10 * fine
    rgb = np.dstack([base * 0.98, base * 1.0, base * 0.97])
    scuff = scratches((H, W), 26, seed + 6, width=(0.4, 1.0), angle=(-12, 12), length=(0.2, 0.9))
    rgb += scuff[..., None] * 26
    a *= 0.86 - 0.18 * noise(H, W, 25, 3, seed + 7)
    img = Image.fromarray(layer(rgb, a), 'RGBA')
    path = os.path.join(OUT, name)
    img.save(path, 'WEBP', quality=82, method=6, alpha_quality=90)
    print('NW_ART', name, img.size, os.path.getsize(path), flush=True)
    return inside


def glow(inside):
    H, W = inside.shape
    pad = 40
    big = np.zeros((H + pad * 2, W + pad * 2))
    big[pad:-pad, pad:-pad] = inside
    edge = np.clip(big - ndimage.binary_erosion(big > 0.5, iterations=2), 0, 1)
    edge = roughen(edge, 1.2, 4, 71) * (0.5 + 0.5 * noise(*big.shape, 30, 3, 72))
    halo = ndimage.gaussian_filter(big, 14) * (0.35 + 0.65 * noise(*big.shape, 80, 3, 73))
    halo *= np.clip(1 - np.linspace(0, 1, big.shape[1])[None, :] * 0.85, 0, 1)
    a = np.clip(edge * 0.9 + halo * 0.75, 0, 1)
    rgb = np.ones(big.shape + (3,)) * np.array([200, 22, 16])
    rgb = rgb * (0.7 + 0.3 * edge[..., None])
    img = Image.fromarray(layer(rgb, a), 'RGBA')
    path = os.path.join(OUT, 'strip_glow.webp')
    img.save(path, 'WEBP', quality=82, method=6, alpha_quality=90)
    print('NW_ART', 'strip_glow.webp', img.size, os.path.getsize(path), flush=True)


if __name__ == '__main__':
    title()
    seal()
    first = strip(81, 'strip_1.webp')
    strip(91, 'strip_2.webp')
    strip(101, 'strip_3.webp')
    glow(first.astype(float))
