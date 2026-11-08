"""Encode the Blender renders as WebP for the build (python3 with Pillow).

    python3 encode_media.py <render_dir> <out_dir>
"""
import os
import sys

from PIL import Image

NAMES = ['menu_lit', 'menu_dark', 'menu_figure', 'load_room104', 'load_patient_doorway', 'load_rot',
         'load_crawler', 'load_reflection', 'load_nurse', 'load_clock']

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
total = 0
for name in NAMES:
    im = Image.open(os.path.join(src, f'{name}.png')).convert('RGB')
    if im.width > 1600:
        im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
    path = os.path.join(out, f'{name}.webp')
    # The menu frames are crossfaded, so they are encoded identically (same quality, same size).
    im.save(path, 'WEBP', quality=80 if name.startswith('menu') else 76, method=6)
    total += os.path.getsize(path)
    print('NW_MEDIA', name, im.size, os.path.getsize(path))
print('NW_MEDIA_TOTAL', total)
