"""Tileable PBR surface textures and deterioration decals for the Room 104 prototype.

Run with any Python that has numpy + Pillow:  python3 textures.py <out_dir>

Surfaces tile seamlessly because every noise field is synthesised in the frequency domain
(FFT-filtered white noise is periodic by construction) and every hard feature (seams, grid,
grain) is drawn with wrap-around. Outputs per surface: <name>_albedo.jpg (sRGB),
<name>_orm.jpg (R occlusion=1, G roughness, B metalness: the glTF channel layout) and
<name>_normal.jpg (OpenGL convention, +Y up, as glTF expects).
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

RNG = np.random.default_rng(0x104)


# ---------------------------------------------------------------------------------------------
# Periodic noise


def fbm(n, beta=2.0, lo=1.0, hi=None, seed=None, aniso=(1.0, 1.0)):
    """Periodic fractal noise in [0, 1]: white noise shaped by 1/f^beta between lo and hi cycles."""
    rng = np.random.default_rng(seed) if seed is not None else RNG
    w = rng.standard_normal((n, n))
    f = np.fft.fft2(w)
    fy = np.fft.fftfreq(n)[:, None] * n * aniso[1]
    fx = np.fft.fftfreq(n)[None, :] * n * aniso[0]
    r = np.sqrt(fx ** 2 + fy ** 2)
    r[0, 0] = 1
    amp = 1.0 / r ** (beta / 2)
    amp[r < lo] = 0
    if hi:
        amp[r > hi] = 0
    out = np.real(np.fft.ifft2(f * amp))
    out -= out.min()
    out /= max(1e-9, out.max())
    return out


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    nz = np.ones_like(h)
    # Image rows go down, glTF normal +Y is up: flip dy.
    n = np.stack([-dx, dy, nz], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return ((n * 0.5 + 0.5) * 255).astype(np.uint8)


def to_srgb8(c):
    c = np.clip(c, 0, 1)
    s = np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)
    return (np.clip(s, 0, 1) * 255).astype(np.uint8)


def save_set(out, name, albedo_lin, rough, metal, height, nstrength):
    Image.fromarray(to_srgb8(albedo_lin)).save(os.path.join(out, f'{name}_albedo.jpg'), quality=90)
    orm = np.stack([np.ones_like(rough), rough, metal], -1)
    Image.fromarray((np.clip(orm, 0, 1) * 255).astype(np.uint8)).save(os.path.join(out, f'{name}_orm.jpg'), quality=92)
    Image.fromarray(normal_from_height(height, nstrength)).save(os.path.join(out, f'{name}_normal.jpg'), quality=84)


def lin(rgb):
    """sRGB 0-255 triple -> linear float."""
    c = np.array(rgb, dtype=np.float64) / 255
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def tint(field, a, b):
    """Blend two linear colours by a [0,1] field."""
    return a[None, None, :] * (1 - field[..., None]) + b[None, None, :] * field[..., None]


# ---------------------------------------------------------------------------------------------
# Surfaces


def floor_vinyl(out, n=1024):
    """Hospital safety sheet vinyl (2 m tile): grey-green with quartz flecks, a welded seam, scuffs
    and a slightly polished-then-neglected sheen."""
    base = tint(fbm(n, 2.2, 2, seed=1), lin((116, 122, 112)), lin((96, 104, 96)))
    # Flecks: sparse light and dark chips.
    flecks = RNG.random((n, n))
    light = (flecks > 0.9965).astype(float)
    dark = (flecks < 0.004).astype(float)
    chips = Image.fromarray((light * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
    light = np.asarray(chips) / 255.0
    base = base * (1 - 0.35 * light[..., None]) + lin((205, 205, 196))[None, None, :] * 0.35 * light[..., None]
    base *= (1 - 0.45 * dark[..., None])
    # Welded seam at the tile edge (wraps) and grime packed into it.
    y = np.arange(n)
    seam1 = np.zeros(n)
    for c in (0, 1):
        d = np.minimum(np.abs(y - c), np.abs(y - c - n))
        seam1 = np.maximum(seam1, np.exp(-(d / 1.6) ** 2))
    seam = seam1[:, None] * np.ones((1, n))
    grime = fbm(n, 2.6, 1, seed=2)
    base *= (1 - 0.55 * seam[..., None])
    # Scuff marks: anisotropic streaks (rubber soles, trolley wheels).
    scuff = smooth(0.62, 0.9, fbm(n, 1.6, 6, 140, seed=3, aniso=(0.25, 3.0)))
    scuff *= smooth(0.45, 0.8, fbm(n, 2.0, 1, seed=4))
    base *= (1 - 0.5 * scuff[..., None])
    base *= (0.86 + 0.14 * grime[..., None])
    rough = 0.42 + 0.22 * grime + 0.18 * scuff - 0.08 * light
    height = 0.6 * fbm(n, 1.2, 40, seed=5) - 2.0 * seam + 0.2 * scuff
    save_set(out, 'floor_vinyl', base, rough, np.zeros_like(rough), height, 1.6)


def wall_paint(out, n=1024):
    """Institutional eggshell paint over skimmed plaster (1.5 m tile): roller stipple, faint
    trowel undulation, yellowed patches."""
    stipple = fbm(n, 0.6, 60, seed=11)
    undulate = fbm(n, 3.0, 1, 6, seed=12)
    patch = smooth(0.45, 0.8, fbm(n, 2.4, 1, seed=13))
    # NW-005A: decades unpainted. Duller, nicotine-yellowed green, grime settled in vertical runs
    # (condensation down the walls) and darker toward the floor of each tile.
    base = tint(patch * 0.45, lin((146, 154, 136)), lin((150, 136, 96)))
    runs = smooth(0.55, 0.85, fbm(n, 1.4, 4, 120, seed=14, aniso=(4.0, 0.25)))
    base *= (1 - 0.22 * runs[..., None])
    base *= (0.94 + 0.06 * stipple[..., None])
    base *= (0.95 + 0.05 * undulate[..., None])
    rough = 0.72 + 0.12 * stipple - 0.1 * patch
    height = 0.5 * stipple + 1.4 * undulate
    save_set(out, 'wall_paint', base, rough, np.zeros_like(rough), height, 1.2)


def wainscot(out, n=512):
    """Rigid PVC wall protection (1.2 m tile): deep teal, factory emboss, scratches."""
    emboss = fbm(n, 0.8, 30, seed=21)
    base = tint(fbm(n, 2.4, 1, seed=22), lin((44, 82, 78)), lin((38, 70, 68)))
    scratch = np.zeros((n, n))
    img = Image.new('L', (n, n), 0)
    d = ImageDraw.Draw(img)
    for _ in range(60):
        x, y = RNG.random(2) * n
        L = RNG.uniform(20, 140)
        a = RNG.normal(0, 0.18)
        for ox in (-n, 0, n):
            d.line([(x + ox, y), (x + ox + L * math.cos(a), y + L * math.sin(a))], fill=int(RNG.uniform(90, 200)), width=1)
    scratch = np.asarray(img.filter(ImageFilter.GaussianBlur(0.6))) / 255.0
    base = base * (1 - 0.15 * scratch[..., None]) + lin((150, 170, 162))[None, None, :] * 0.35 * scratch[..., None]
    rough = 0.38 + 0.1 * emboss + 0.3 * scratch
    height = 0.6 * emboss - 0.8 * scratch
    save_set(out, 'wainscot', base, rough, np.zeros_like(rough), height, 1.5)


def ceiling_tile(out, n=512):
    """600 mm fissured mineral-fibre tile with its exposed T-bar grid (one tile per texture)."""
    fiss = fbm(n, 1.0, 20, seed=31)
    pits = smooth(0.7, 0.86, fbm(n, 0.5, 80, seed=32))
    worm = smooth(0.48, 0.52, fbm(n, 2.4, 8, 40, seed=33))
    yell = smooth(0.5, 0.9, fbm(n, 3.0, 1, seed=34))
    # NW-005A: older, evenly nicotine-yellowed tiles. No blotches here: this texture is one tile,
    # so any stain in it repeats on every tile of the ceiling. Water stains are decals instead.
    base = tint(yell * 0.35 + 0.35, lin((196, 190, 172)), lin((168, 148, 106)))
    base *= (1 - 0.22 * pits[..., None] - 0.12 * worm[..., None])
    base *= (0.95 + 0.05 * fiss[..., None])
    # T-bar: 15 mm white enamel strip around the edge (wraps), with a dark gap line.
    px = n / 600.0
    e = np.minimum(np.arange(n), n - 1 - np.arange(n))
    bar = (e < 7.5 * px).astype(float)
    gap = ((e >= 7.5 * px) & (e < 9.5 * px)).astype(float)
    barx, bary = bar[None, :] * np.ones((n, 1)), bar[:, None] * np.ones((1, n))
    gx, gy = gap[None, :] * np.ones((n, 1)), gap[:, None] * np.ones((1, n))
    grid = np.maximum(barx, bary)
    gapm = np.maximum(gx, gy) * (1 - grid)
    base = base * (1 - grid[..., None]) + lin((228, 226, 218))[None, None, :] * grid[..., None]
    base *= (1 - 0.6 * gapm[..., None])
    rough = np.where(grid > 0, 0.45, 0.92 - 0.05 * fiss)
    metal = np.where(grid > 0, 0.2, 0.0)
    height = 1.0 * fiss - 1.6 * pits - 0.8 * worm + 2.5 * grid - 2.0 * gapm
    save_set(out, 'ceiling_tile', base, rough, metal, height, 2.0)


def wood_rail(out, n=512):
    """Beech-veneer handrail (1 m tile, grain along U) with hand-worn varnish."""
    y = np.arange(n)[:, None] / n * np.ones((1, n))
    warp = fbm(n, 2.2, 1, 12, seed=41, aniso=(0.15, 1.0))
    rings = 0.5 + 0.5 * np.sin((y * 7 + warp * 0.45) * 2 * math.pi)
    fine = fbm(n, 0.8, 30, 250, seed=44, aniso=(0.04, 1.0))
    base = tint(np.clip(rings * 0.7 + 0.4 * fine, 0, 1), lin((176, 132, 90)), lin((118, 80, 48)))
    wear = smooth(0.6, 0.9, fbm(n, 2.0, 2, seed=43, aniso=(0.3, 1.0)))
    base = base * (1 - 0.2 * wear[..., None]) + lin((110, 86, 62))[None, None, :] * 0.2 * wear[..., None]
    rough = 0.32 + 0.25 * wear + 0.08 * rings
    height = 0.6 * rings
    save_set(out, 'wood_rail', base, rough, np.zeros_like(rough), height, 0.8)


# ---------------------------------------------------------------------------------------------
# Decals (RGBA, sRGB colour + alpha). Not tiled.


def save_rgba(out, name, rgb_lin, alpha):
    a = (np.clip(alpha, 0, 1) * 255).astype(np.uint8)
    img = np.dstack([to_srgb8(rgb_lin), a])
    Image.fromarray(img, 'RGBA').save(os.path.join(out, f'{name}.png'), optimize=True)


def radial(n):
    y, x = np.mgrid[0:n, 0:n] / (n - 1) * 2 - 1
    return np.sqrt(x * x + y * y), x, y


def water_stain(out, n=512):
    """Ceiling/wall water stain: tide-mark rings with rust-brown edges."""
    r, x, y = radial(n)
    warp = fbm(n, 2.4, 1, seed=51) - 0.5
    rr = r + 0.35 * warp
    body = smooth(0.95, 0.45, rr)
    rings = sum(np.exp(-((rr - k) / 0.012) ** 2) * w for k, w in ((0.82, 1.0), (0.66, 0.6), (0.5, 0.35)))
    col = tint(np.clip(rings, 0, 1), lin((150, 128, 88)), lin((96, 62, 30)))
    alpha = 0.32 * body + 0.6 * np.clip(rings, 0, 1) * smooth(1.0, 0.7, rr)
    save_rgba(out, 'decal_water_stain', col, alpha * smooth(1.02, 0.9, r))


def rust_drip(out, n=512):
    """Rust/blood-brown runs from a fixing point, pooling at the bottom."""
    img = Image.new('L', (n, n), 0)
    d = ImageDraw.Draw(img)
    for _ in range(9):
        x = n * (0.5 + RNG.normal(0, 0.08))
        L = RNG.uniform(0.35, 0.95) * n
        w = RNG.uniform(2, 7)
        pts = [(x + RNG.normal(0, 1.5), 0.05 * n + t * L) for t in np.linspace(0, 1, 30)]
        d.line(pts, fill=int(RNG.uniform(120, 230)), width=int(w))
        d.ellipse([pts[-1][0] - w, pts[-1][1] - w * 0.6, pts[-1][0] + w, pts[-1][1] + w * 1.4], fill=200)
    a = np.asarray(img.filter(ImageFilter.GaussianBlur(1.6))) / 255.0
    a *= 0.55 + 0.45 * fbm(n, 2.0, 2, seed=61)
    col = tint(fbm(n, 2, 2, seed=62), lin((86, 40, 20)), lin((120, 62, 28)))
    save_rgba(out, 'decal_rust_drip', col, a)


def scratches(out, n=512):
    """Four-finger nail gouges dragged down the wall beside the bed (paint scraped to plaster)."""
    img = Image.new('L', (n, n), 0)
    d = ImageDraw.Draw(img)
    for set_ in range(3):
        x0 = n * (0.25 + 0.25 * set_) + RNG.normal(0, 10)
        y0 = n * RNG.uniform(0.05, 0.2)
        L = n * RNG.uniform(0.45, 0.75)
        bend = RNG.normal(0, 0.15)
        for f, dx in enumerate((-30, -10, 10, 28)):
            pts = []
            for t in np.linspace(0, 1, 40):
                pts.append((x0 + dx * (1 - 0.3 * t) + bend * L * t * t + RNG.normal(0, 0.6), y0 + L * t * (1 - 0.06 * f)))
            for i in range(len(pts) - 1):
                w = max(1, int(5 * (1 - (i / len(pts)) ** 1.5)))
                d.line([pts[i], pts[i + 1]], fill=230, width=w)
    a = np.asarray(img.filter(ImageFilter.GaussianBlur(0.8))) / 255.0
    col = np.ones((n, n, 3)) * lin((222, 214, 196))[None, None, :]
    inner = np.asarray(img.filter(ImageFilter.MinFilter(3))) / 255.0
    col = col * (1 - 0.5 * inner[..., None]) + lin((70, 52, 40))[None, None, :] * 0.5 * inner[..., None]
    save_rgba(out, 'decal_scratches', col, a * 0.92)


def handprints(out, n=512):
    """Grey-black handprints (ash, not blood): splayed fingers, smudged palms."""
    img = Image.new('L', (n, n), 0)
    d = ImageDraw.Draw(img)

    def hand(cx, cy, s, ang):
        def rot(px, py):
            c, sn = math.cos(ang), math.sin(ang)
            return (cx + (px * c - py * sn) * s, cy + (px * sn + py * c) * s)
        palm = [rot(px, py) for px, py in ((-40, 0), (-38, 50), (0, 62), (36, 48), (40, 0), (25, -30), (-25, -30))]
        d.polygon(palm, fill=200)
        for fx, fl, fa in ((-34, 62, -0.5), (-18, 82, -0.12), (2, 90, 0.02), (20, 80, 0.15), (34, 58, 0.42)):
            tip = (fx + fl * math.sin(fa), -30 - fl * math.cos(fa))
            d.line([rot(fx * 0.8, -25), rot(*tip)], fill=210, width=int(17 * s))
            d.ellipse([*rot(tip[0] - 8, tip[1] - 8), *rot(tip[0] + 8, tip[1] + 8)], fill=210)
    hand(n * 0.33, n * 0.45, 1.25, -0.25)
    hand(n * 0.7, n * 0.6, 1.1, 0.35)
    hand(n * 0.55, n * 0.25, 0.9, 0.05)
    a = np.asarray(img.filter(ImageFilter.GaussianBlur(3))) / 255.0
    a *= 0.35 + 0.65 * smooth(0.25, 0.65, fbm(n, 1.6, 6, seed=71))
    col = np.ones((n, n, 3)) * lin((38, 36, 36))[None, None, :]
    save_rgba(out, 'decal_handprints', col, a * 0.8)


def rot_veins(out, n=1024):
    """The ward's supernatural mark: black, branching 'rot' spreading from a corner like frost in
    reverse. Colour + alpha, plus a faint cold glow map along the youngest tips."""
    img = Image.new('L', (n, n), 0)
    glow = Image.new('L', (n, n), 0)
    d = ImageDraw.Draw(img)
    dg = ImageDraw.Draw(glow)

    def branch(x, y, ang, length, width, depth):
        if depth > 7 or width < 0.6:
            return
        steps = int(length / 6)
        for _ in range(steps):
            ang += RNG.normal(0, 0.18)
            nx, ny = x + 6 * math.cos(ang), y + 6 * math.sin(ang)
            d.line([(x, y), (nx, ny)], fill=255, width=max(1, int(width)))
            if depth >= 4:
                dg.line([(x, y), (nx, ny)], fill=int(120 + 30 * depth), width=max(1, int(width)))
            x, y = nx, ny
            width *= 0.985
            if RNG.random() < 0.06:
                branch(x, y, ang + RNG.choice([-1, 1]) * RNG.uniform(0.4, 1.0), length * 0.6, width * 0.7, depth + 1)
    for k in range(5):
        branch(n * 0.02, n * (0.75 + 0.05 * k), -0.35 - 0.25 * k + RNG.normal(0, 0.1), n * 0.55, 9, 0)
    core = np.asarray(img.filter(ImageFilter.GaussianBlur(1.2))) / 255.0
    halo = np.asarray(img.filter(ImageFilter.GaussianBlur(14))) / 255.0
    r, x, y = radial(n)
    corner = smooth(1.6, 0.0, np.sqrt((x + 1) ** 2 + (y - 0.6) ** 2))
    stain = np.clip(halo * 1.6, 0, 1) * 0.45 + corner * 0.25 * fbm(n, 2.2, 2, seed=81)
    alpha = np.clip(np.maximum(core, stain), 0, 1)
    col = tint(np.clip(core, 0, 1), lin((48, 52, 46)), lin((8, 10, 10)))
    save_rgba(out, 'decal_rot', col, alpha)
    g = np.asarray(glow.filter(ImageFilter.GaussianBlur(2.5))) / 255.0
    ge = np.dstack([g * 0.35, g * 0.75, g * 0.7])
    Image.fromarray(to_srgb8(ge)).save(os.path.join(out, 'decal_rot_glow.png'), optimize=True)


def floor_wear(out, n=512):
    """Floor decal: trolley tracks and a dragged smear leading out of the room."""
    img = Image.new('L', (n, n), 0)
    d = ImageDraw.Draw(img)
    for off in (-0.08, 0.08):
        pts = [(n * (0.5 + off + 0.03 * math.sin(t * 3)), n * t) for t in np.linspace(0, 1, 50)]
        d.line(pts, fill=150, width=9)
    smear = [(n * (0.45 + 0.1 * math.sin(t * 2.2)), n * t) for t in np.linspace(0.1, 0.95, 50)]
    d.line(smear, fill=110, width=46)
    a = np.asarray(img.filter(ImageFilter.GaussianBlur(5))) / 255.0
    a *= 0.4 + 0.6 * fbm(n, 1.8, 3, seed=91)
    col = np.ones((n, n, 3)) * lin((52, 48, 42))[None, None, :]
    save_rgba(out, 'decal_floor_wear', col, a * 0.7)


def peeling(out, n=512):
    """Peeling paint patch: lifted flakes over damp grey plaster."""
    m = smooth(0.52, 0.56, fbm(n, 2.2, 2, seed=101))
    r, _, _ = radial(n)
    m *= smooth(0.95, 0.6, r)
    edge = np.clip(np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.FIND_EDGES)) / 255.0 * 3, 0, 1)
    col = tint(m, lin((180, 186, 170)), lin((126, 120, 104)))
    col = col * (1 - 0.4 * edge[..., None])
    alpha = np.clip(m + edge * 0.8, 0, 1) * smooth(1.0, 0.7, r)
    save_rgba(out, 'decal_peeling', col, alpha)


# ---------------------------------------------------------------------------------------------
# Signage atlas (1024 x 1024): eight 512 x 256 cells, top to bottom, left to right:
#   0 plaque 101, 1 plaque 102, 2 plaque 103, 3 plaque 104, 4 plaque 105, 5 plaque 106,
#   6 clock face (square, uses the cell's left 256 x 256), 7 notice "PLEASE DO NOT LEAVE THE WARD".
SIGN_CELLS = {'101': 0, '102': 1, '103': 2, '104': 3, '105': 4, '106': 5, 'clock': 6, 'notice': 7}


def _font(size, bold=True):
    from PIL import ImageFont
    for path in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
                 '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def signage(out, n=1024):
    img = Image.new('RGB', (n, n), (30, 34, 38))
    d = ImageDraw.Draw(img)
    grime = fbm(n, 2.2, 2, seed=111)

    def cell(i):
        return (i % 2) * 512, (i // 2) * 256
    for label in ('101', '102', '103', '104', '105', '106'):
        x, y = cell(SIGN_CELLS[label])
        d.rounded_rectangle([x + 6, y + 6, x + 506, y + 250], radius=22, fill=(22, 58, 112))
        d.rounded_rectangle([x + 18, y + 18, x + 494, y + 238], radius=16, outline=(236, 238, 240), width=6)
        d.text((x + 256, y + 112), label, font=_font(150), fill=(240, 242, 244), anchor='mm')
        d.text((x + 256, y + 214), 'PATIENT ROOM', font=_font(26), fill=(200, 210, 225), anchor='mm')
    # Clock: dial stopped at 3:17 (the moment the ward went quiet).
    x, y = cell(SIGN_CELLS['clock'])
    cx, cy, r = x + 128, y + 128, 120
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(236, 232, 220))
    for k in range(60):
        a = k / 60 * 2 * math.pi
        r0 = r - (16 if k % 5 == 0 else 8)
        d.line([(cx + r0 * math.sin(a), cy - r0 * math.cos(a)), (cx + (r - 4) * math.sin(a), cy - (r - 4) * math.cos(a))], fill=(30, 30, 30), width=4 if k % 5 == 0 else 2)
    for h in range(1, 13):
        a = h / 12 * 2 * math.pi
        d.text((cx + (r - 36) * math.sin(a), cy - (r - 36) * math.cos(a)), str(h), font=_font(22), fill=(25, 25, 25), anchor='mm')
    for frac, L, w in ((3 + 17 / 60) / 12, 62, 7, ), ((17 / 60), 96, 4):
        a = frac * 2 * math.pi
        d.line([(cx, cy), (cx + L * math.sin(a), cy - L * math.cos(a))], fill=(15, 15, 15), width=w)
    d.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], fill=(150, 20, 20))
    # Notice: laminated A4 sheet, landscape cell.
    x, y = cell(SIGN_CELLS['notice'])
    d.rectangle([x + 10, y + 8, x + 502, y + 248], fill=(232, 228, 214))
    d.rectangle([x + 10, y + 8, x + 502, y + 58], fill=(178, 32, 30))
    d.text((x + 256, y + 33), 'WARD 4 WEST', font=_font(30), fill=(250, 245, 240), anchor='mm')
    d.text((x + 256, y + 110), 'PLEASE DO NOT', font=_font(40), fill=(30, 30, 30), anchor='mm')
    d.text((x + 256, y + 160), 'LEAVE THE WARD', font=_font(40), fill=(30, 30, 30), anchor='mm')
    d.text((x + 256, y + 218), 'Staff will come to you.', font=_font(22, False), fill=(60, 60, 60), anchor='mm')
    arr = np.asarray(img).astype(np.float64) / 255.0
    arr *= (0.9 + 0.1 * grime[..., None])
    Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8)).save(os.path.join(out, 'signage.jpg'), quality=92)


def decal_atlas(out):
    """Pack the decals into one 2048 RGBA atlas (one draw call) + a matching glow atlas.

    Layout (pixels): rot 0,0 1024x1024 | water 1024,0 512 | rust 1536,0 512 | scratches 1024,512 512 |
    handprints 1536,512 512 | peeling 0,1024 512 | floor_wear 512,1024 512.
    """
    atlas = Image.new('RGBA', (2048, 2048), (0, 0, 0, 0))
    glow = Image.new('RGB', (2048, 2048), (0, 0, 0))
    place = {'decal_rot': (0, 0, 1024), 'decal_water_stain': (1024, 0, 512), 'decal_rust_drip': (1536, 0, 512),
             'decal_scratches': (1024, 512, 512), 'decal_handprints': (1536, 512, 512), 'decal_peeling': (0, 1024, 512),
             'decal_floor_wear': (512, 1024, 512)}
    for name, (x, y, size) in place.items():
        atlas.paste(Image.open(os.path.join(out, f'{name}.png')).convert('RGBA').resize((size, size), Image.LANCZOS), (x, y))
    glow.paste(Image.open(os.path.join(out, 'decal_rot_glow.png')).convert('RGB').resize((1024, 1024), Image.LANCZOS), (0, 0))
    # Palette-quantised RGBA keeps the decal atlas small (it is the only PNG in the set).
    atlas.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(os.path.join(out, 'decals.png'), optimize=True)
    glow.save(os.path.join(out, 'decals_glow.jpg'), quality=90)


# ---------------------------------------------------------------------------------------------
# NW-005A: door veneer and the opening's labels.


def door_veneer(out, n=512):
    """Beech-veneer fire-door leaf (UV: 1 unit = 1 m, grain running up the leaf): long vertical
    grain, darker hand-height band where decades of palms polished and greyed it."""
    grain = fbm(n, 1.4, 2, 200, seed=301, aniso=(6.0, 0.15))
    flake = smooth(0.7, 0.95, fbm(n, 1.0, 20, 300, seed=302, aniso=(3.0, 0.4)))
    tone = fbm(n, 2.6, 1, seed=303)
    base = tint(grain * 0.8 + 0.2 * tone, lin((176, 136, 92)), lin((134, 98, 62)))
    base = base * (1 - 0.12 * flake[..., None]) + lin((196, 160, 112))[None, None, :] * 0.12 * flake[..., None]
    grime = fbm(n, 2.4, 1, seed=304)
    base *= (0.86 + 0.14 * grime[..., None])
    rough = 0.48 + 0.18 * grime - 0.08 * flake
    height = 0.6 * grain + 0.2 * flake
    save_set(out, 'door_veneer', base, rough, np.zeros_like(rough), height, 0.9)


def opening_labels(out):
    """1024 x 512 label sheet for the opening's semantic props (see OPENING_CELLS):
    0 staff access card face, 1 card reader face, 2 intercom badge, 3 'STAFF ONLY' door sign."""
    W, H = 1024, 512
    img = Image.new('RGB', (W, H), (20, 22, 24))
    d = ImageDraw.Draw(img)
    # 0: staff ID card (85.6 x 54 mm) in the top-left 512 x 256 cell.
    x, y = 0, 0
    d.rounded_rectangle([x + 8, y + 8, x + 504, y + 248], radius=26, fill=(238, 238, 232))
    d.rectangle([x + 8, y + 8, x + 504, y + 62], fill=(20, 72, 120))
    d.text((x + 24, y + 35), 'HALDEN VALE INFIRMARY', font=_font(30), fill=(245, 248, 250), anchor='lm')
    d.rectangle([x + 28, y + 80, x + 148, y + 226], fill=(120, 126, 130))  # photo, faded to a grey ghost
    d.ellipse([x + 58, y + 98, x + 118, y + 162], fill=(150, 154, 156))
    d.rectangle([x + 46, y + 170, x + 130, y + 226], fill=(150, 154, 156))
    d.text((x + 170, y + 100), 'E. SHAW', font=_font(40), fill=(25, 25, 25), anchor='lm')
    d.text((x + 170, y + 142), 'Senior Staff Nurse', font=_font(24, False), fill=(40, 40, 40), anchor='lm')
    d.text((x + 170, y + 176), 'WARD 4 WEST  -  NIGHTS', font=_font(22), fill=(150, 30, 28), anchor='lm')
    d.text((x + 170, y + 214), 'STAFF ACCESS  0317', font=_font(20, False), fill=(60, 60, 60), anchor='lm')
    # 1: card reader face: black gloss, logo, LED strip, 'PRESENT CARD'.
    x, y = 512, 0
    d.rectangle([x, y, x + 512, y + 256], fill=(14, 15, 17))
    d.rounded_rectangle([x + 150, y + 40, x + 362, y + 150], radius=18, outline=(70, 74, 80), width=5)
    d.arc([x + 206, y + 62, x + 306, y + 128], 200, 340, fill=(95, 100, 106), width=6)
    d.arc([x + 226, y + 76, x + 286, y + 118], 200, 340, fill=(95, 100, 106), width=6)
    d.rectangle([x + 150, y + 176, x + 362, y + 196], fill=(140, 18, 16))
    d.text((x + 256, y + 228), 'PRESENT CARD', font=_font(24), fill=(150, 156, 160), anchor='mm')
    # 2: intercom badge.
    x, y = 0, 256
    d.rectangle([x, y, x + 512, y + 256], fill=(206, 206, 198))
    d.text((x + 256, y + 90), 'WARD INTERCOM', font=_font(44), fill=(30, 34, 38), anchor='mm')
    d.text((x + 256, y + 160), 'Do not obstruct', font=_font(26, False), fill=(70, 72, 74), anchor='mm')
    # 3: 'STAFF ONLY' sign.
    x, y = 512, 256
    d.rectangle([x + 6, y + 6, x + 506, y + 250], fill=(236, 234, 226))
    d.rectangle([x + 6, y + 6, x + 506, y + 70], fill=(22, 58, 112))
    d.text((x + 256, y + 38), 'NURSES\u2019 STATION', font=_font(34), fill=(245, 245, 245), anchor='mm')
    d.text((x + 256, y + 140), 'STAFF ONLY', font=_font(56), fill=(30, 30, 30), anchor='mm')
    d.text((x + 256, y + 210), 'Please ring for assistance', font=_font(24, False), fill=(70, 70, 70), anchor='mm')
    arr = np.asarray(img).astype(np.float64) / 255.0
    arr *= (0.92 + 0.08 * np.asarray(Image.fromarray((fbm(512, 2.2, 2, seed=305) * 255).astype(np.uint8)).resize((W, H)))[..., None] / 255.0)
    Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8)).save(os.path.join(out, 'opening_labels.jpg'), quality=92)


def corridor_labels(out):
    """1024 x 1024 sheet of corridor print, eight 512 x 256 cells (row-major, top to bottom; see
    CORRIDOR_CELLS): 0 'CAUTION WET FLOOR', 1 patient status whiteboard, 2 fire action notice,
    3 hand hygiene poster, 4 notice-board papers, 5 visiting hours, 6 glove box print, 7 desk items."""
    n = 1024
    img = Image.new('RGB', (n, n), (40, 40, 40))
    d = ImageDraw.Draw(img)

    def cell(i):
        return (i % 2) * 512, (i // 2) * 256
    # 0: caution sign (yellow), pictogram of a slipping figure.
    x, y = cell(0)
    d.rectangle([x, y, x + 512, y + 256], fill=(236, 196, 30))
    d.polygon([(x + 70, y + 40), (x + 150, y + 180), (x + 20, y + 180)], outline=(20, 20, 20), width=8)
    d.ellipse([x + 78, y + 92, x + 92, y + 106], fill=(20, 20, 20))
    d.line([(x + 85, y + 106), (x + 92, y + 140)], fill=(20, 20, 20), width=6)
    d.line([(x + 92, y + 140), (x + 110, y + 160)], fill=(20, 20, 20), width=5)
    d.line([(x + 92, y + 140), (x + 70, y + 158)], fill=(20, 20, 20), width=5)
    d.text((x + 330, y + 70), 'CAUTION', font=_font(64), fill=(20, 20, 20), anchor='mm')
    d.text((x + 330, y + 140), 'WET FLOOR', font=_font(52), fill=(20, 20, 20), anchor='mm')
    d.text((x + 330, y + 205), 'ATTENTION  -  SUELO MOJADO', font=_font(18, False), fill=(40, 40, 30), anchor='mm')
    # 1: patient status whiteboard (magnetic, marker scrawl, smudged).
    x, y = cell(1)
    d.rectangle([x, y, x + 512, y + 256], fill=(232, 234, 230))
    d.rectangle([x + 8, y + 8, x + 504, y + 44], fill=(22, 58, 112))
    d.text((x + 256, y + 26), 'PATIENT INFORMATION', font=_font(22), fill=(240, 240, 240), anchor='mm')
    rows = [('Named nurse:', 'E. Shaw'), ('Consultant:', 'Dr  M. Hale'), ('Diet:', 'NIL BY MOUTH'), ('Obs:', '1 hrly')]
    for k, (a, b) in enumerate(rows):
        yy = y + 70 + k * 44
        d.text((x + 24, yy), a, font=_font(20, False), fill=(60, 60, 60), anchor='lm')
        d.text((x + 210, yy), b, font=_font(28, False), fill=(30, 40, 120) if k != 2 else (170, 20, 20), anchor='lm')
        d.line([(x + 20, yy + 20), (x + 490, yy + 20)], fill=(200, 202, 198), width=2)
    d.ellipse([x + 430, y + 200, x + 470, y + 240], fill=(200, 30, 30))  # magnet
    # 2: fire action notice.
    x, y = cell(2)
    d.rectangle([x, y, x + 512, y + 256], fill=(240, 240, 236))
    d.rectangle([x, y, x + 512, y + 48], fill=(200, 24, 24))
    d.text((x + 256, y + 24), 'FIRE ACTION', font=_font(32), fill=(255, 255, 255), anchor='mm')
    for k, t in enumerate(['Raise the alarm at the nearest call point', 'Do not use the lifts', 'Staff will direct patients', 'Assembly point: Car Park C']):
        d.rectangle([x + 18, y + 64 + k * 46, x + 46, y + 92 + k * 46], fill=(22, 58, 112))
        d.text((x + 58, y + 78 + k * 46), t, font=_font(20, False), fill=(30, 30, 30), anchor='lm')
    # 3: hand hygiene poster.
    x, y = cell(3)
    d.rectangle([x, y, x + 512, y + 256], fill=(226, 238, 242))
    d.text((x + 256, y + 34), 'CLEAN YOUR HANDS', font=_font(38), fill=(0, 94, 160), anchor='mm')
    for k in range(6):
        cx = x + 50 + k * 82
        d.ellipse([cx - 30, y + 80, cx + 30, y + 140], outline=(0, 94, 160), width=5)
        d.text((cx, y + 110), str(k + 1), font=_font(26), fill=(0, 94, 160), anchor='mm')
    d.text((x + 256, y + 190), 'Before and after every patient contact', font=_font(20, False), fill=(40, 60, 70), anchor='mm')
    d.text((x + 256, y + 226), 'WARD 4 WEST  -  INFECTION PREVENTION', font=_font(16, False), fill=(90, 100, 110), anchor='mm')
    # 4: notice-board papers: rota, memo, torn flyer (collage, each slightly rotated).
    x, y = cell(4)
    d.rectangle([x, y, x + 512, y + 256], fill=(150, 104, 62))
    papers = [
        (x + 20, y + 16, 170, 220, (238, 236, 226), 'NIGHT ROTA', ['Mon  E.S / J.K', 'Tue  E.S / P.O', 'Wed  E.S / -', 'Thu  E.S / -', 'Fri  E.S / -']),
        (x + 200, y + 30, 150, 120, (250, 240, 170), 'REMINDER', ['Doors closed', 'after 22:00', 'NO EXCEPTIONS']),
        (x + 360, y + 20, 136, 200, (236, 238, 240), 'MEMO', ['Re: 104', 'Do not discuss', 'with relatives', '- Mgmt']),
        (x + 210, y + 160, 140, 86, (220, 236, 222), 'STAFF SOCIAL', ['cancelled']),
    ]
    for (px, py, w, h, col, title, lines) in papers:
        d.rectangle([px, py, px + w, py + h], fill=col, outline=(120, 110, 90))
        d.text((px + w / 2, py + 18), title, font=_font(18), fill=(40, 40, 40), anchor='mm')
        for k, t in enumerate(lines):
            d.text((px + 10, py + 44 + k * 24), t, font=_font(15, False), fill=(50, 50, 60), anchor='lm')
        d.ellipse([px + w / 2 - 6, py + 2, px + w / 2 + 6, py + 14], fill=(200, 30, 30))
    # 5: visiting hours.
    x, y = cell(5)
    d.rectangle([x, y, x + 512, y + 256], fill=(236, 234, 226))
    d.rectangle([x, y, x + 512, y + 56], fill=(22, 58, 112))
    d.text((x + 256, y + 28), 'VISITING HOURS', font=_font(34), fill=(255, 255, 255), anchor='mm')
    d.text((x + 256, y + 110), '14:00 - 16:00', font=_font(46), fill=(30, 30, 30), anchor='mm')
    d.text((x + 256, y + 165), '18:00 - 20:00', font=_font(46), fill=(30, 30, 30), anchor='mm')
    d.text((x + 256, y + 222), 'Visitors are not permitted after 20:00', font=_font(18, False), fill=(150, 30, 30), anchor='mm')
    # 6: glove box print (three sizes side by side, each 170 px wide).
    x, y = cell(6)
    for k, (size, col) in enumerate((('S', (120, 70, 160)), ('M', (40, 110, 190)), ('L', (30, 150, 120)))):
        bx = x + k * 170
        d.rectangle([bx + 2, y, bx + 168, y + 256], fill=(236, 236, 236))
        d.rectangle([bx + 2, y + 160, bx + 168, y + 256], fill=col)
        d.ellipse([bx + 40, y + 40, bx + 130, y + 110], fill=(70, 70, 70))  # dispenser hole
        d.text((bx + 85, y + 208), size, font=_font(60), fill=(255, 255, 255), anchor='mm')
        d.text((bx + 85, y + 140), 'NITRILE', font=_font(18), fill=(60, 60, 60), anchor='mm')
    # 7: desk items: visitor book cover (left), 'PLEASE WAIT HERE' card (right).
    x, y = cell(7)
    d.rectangle([x, y, x + 256, y + 256], fill=(70, 22, 26))
    d.text((x + 128, y + 110), 'VISITORS', font=_font(30), fill=(210, 190, 140), anchor='mm')
    d.text((x + 128, y + 150), 'WARD 4 WEST', font=_font(18), fill=(210, 190, 140), anchor='mm')
    d.rectangle([x + 256, y, x + 512, y + 256], fill=(240, 238, 230))
    d.text((x + 384, y + 90), 'PLEASE', font=_font(40), fill=(30, 30, 30), anchor='mm')
    d.text((x + 384, y + 140), 'WAIT HERE', font=_font(40), fill=(30, 30, 30), anchor='mm')
    d.text((x + 384, y + 200), 'Ring for assistance', font=_font(20, False), fill=(90, 90, 90), anchor='mm')
    arr = np.asarray(img).astype(np.float64) / 255.0
    grime = np.asarray(Image.fromarray((fbm(512, 2.2, 2, seed=306) * 255).astype(np.uint8)).resize((n, n))) / 255.0
    arr *= (0.88 + 0.12 * grime[..., None])
    Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8)).save(os.path.join(out, 'corridor_labels.jpg'), quality=90)


# (u0, v0, u1, v1) of each label cell, v measured from the bottom (Blender/glTF UV convention).
OPENING_CELLS = {'card': (0.0, 0.5, 0.5, 1.0), 'reader': (0.5, 0.5, 1.0, 1.0), 'intercom': (0.0, 0.0, 0.5, 0.5), 'staff': (0.5, 0.0, 1.0, 0.5)}


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'textures'
    os.makedirs(out, exist_ok=True)
    for fn in (floor_vinyl, wall_paint, wainscot, ceiling_tile, wood_rail, water_stain, rust_drip, scratches, handprints, rot_veins, floor_wear, peeling, signage, decal_atlas, door_veneer, opening_labels, corridor_labels):
        fn(out)
        print('NW_TEX', fn.__name__)
