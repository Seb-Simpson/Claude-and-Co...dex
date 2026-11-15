"""NW-R04A: side-by-side sheets of the approved reference and the in-game preview screenshots
(tests/browser/nw-r04a-shaw-preview.spec.ts, written to docs/nw-r04a/preview/).

Run:  python3 compare_ingame.py <reference.jpg> <preview_dir> [<before_preview_dir>]
The optional third argument adds before/after sheets against an earlier capture.
"""
import os
import sys
from PIL import Image, ImageDraw

ref_path, d = sys.argv[1], sys.argv[2]
before = sys.argv[3] if len(sys.argv) > 3 else None
ref = Image.open(ref_path).convert('RGB')
REF = {'front': (310, 20, 580, 887), 'side': (590, 20, 790, 887), 'back': (1080, 20, 1310, 887),
       'front34': (40, 20, 320, 887), 'back34': (820, 20, 1010, 887),
       'face': (1355, 110, 1595, 388), 'hand': (1355, 650, 1595, 862),
       'head-front': (370, 20, 520, 200), 'head-side': (620, 20, 770, 200), 'head-back': (1120, 20, 1270, 200),
       'head-front34': (80, 20, 260, 200),
       'skirt-front': (310, 380, 580, 887), 'skirt-side': (590, 380, 790, 887), 'skirt-back': (1080, 380, 1310, 887)}
BODY = (460, 0, 820, 720)        # full-body presets keep her centred in the 1280x720 frame
LOWER = (440, 300, 840, 720)     # lower half of a full-body preset
CLOSE = (300, 0, 980, 720)
HEAD = (300, 20, 980, 640)       # cap and hair in the head presets


def load(name, folder=None):
    folder = folder or d
    for ext in ('png', 'jpg'):
        if os.path.exists(f'{folder}/{name}.{ext}'):
            return Image.open(f'{folder}/{name}.{ext}').convert('RGB')
    raise FileNotFoundError(f'{folder}/{name}')


def shot(name, box, folder=None):
    return load(name, folder).crop(box)


def sheet(pairs, out, height):
    tiles = []
    for label, im in pairs:
        im = im.resize((int(im.width * height / im.height), height))
        t = Image.new('RGB', (im.width, height + 28), (28, 28, 30)); t.paste(im, (0, 28))
        ImageDraw.Draw(t).text((8, 8), label, fill=(225, 225, 225))
        tiles.append(t)
    w = sum(t.width for t in tiles) + 6 * (len(tiles) - 1)
    s = Image.new('RGB', (w, height + 28), (12, 12, 12)); x = 0
    for t in tiles:
        s.paste(t, (x, 0)); x += t.width + 6
    s.save(f'{d}/{out}', quality=90)


r = lambda k: ref.crop(REF[k])
sheet([('REFERENCE front', r('front')), ('IN-GAME studio front', shot('studio-front', BODY)),
       ('REFERENCE side', r('side')), ('IN-GAME studio side', shot('studio-side', BODY)),
       ('REFERENCE back', r('back')), ('IN-GAME studio back', shot('studio-back', BODY))], 'compare-turnaround.jpg', 760)
sheet([('REFERENCE 3/4 front', r('front34')), ('IN-GAME studio 3/4 front', shot('studio-front34', BODY)),
       ('REFERENCE 3/4 back', r('back34')), ('IN-GAME studio 3/4 back', shot('studio-back34', BODY))], 'compare-three-quarter.jpg', 760)
sheet([('REFERENCE face covering', r('face')), ('IN-GAME studio face', shot('studio-face', CLOSE)), ('IN-GAME ward face', shot('ward-face', CLOSE))],
      'compare-mask.jpg', 520)
sheet([('REFERENCE head front', r('head-front')), ('IN-GAME studio', shot('studio-face', HEAD)),
       ('REFERENCE head side', r('head-side')), ('IN-GAME studio', shot('studio-head-side', HEAD)),
       ('REFERENCE head back', r('head-back')), ('IN-GAME studio', shot('studio-head-back', HEAD))], 'compare-cap-hair.jpg', 420)
sheet([('REFERENCE hand', r('hand')), ('IN-GAME studio hands', shot('studio-hands', CLOSE)), ('IN-GAME ward hands', shot('ward-hands', CLOSE))],
      'compare-hands.jpg', 520)
sheet([('REFERENCE skirt front', r('skirt-front')), ('IN-GAME studio', shot('studio-front', LOWER)),
       ('REFERENCE skirt side', r('skirt-side')), ('IN-GAME studio', shot('studio-side', LOWER)),
       ('IN-GAME studio side close', shot('studio-skirt-side', (240, 0, 1040, 720))),
       ('REFERENCE skirt back', r('skirt-back')), ('IN-GAME studio', shot('studio-back', LOWER))], 'compare-skirt-bow.jpg', 520)
sheet([('REFERENCE front', r('front')), ('IN-GAME ward front', shot('ward-front', BODY)), ('IN-GAME ward 3/4 back', shot('ward-back34', BODY)),
       ('IN-GAME ward 3 m', load('ward-gameplay-near')), ('IN-GAME ward 7 m', load('ward-gameplay'))], 'compare-ward-lighting.jpg', 520)
if before:
    sheet([('REFERENCE', r('front')), ('R04A (before)', shot('studio-front', BODY, before)), ('R04A.2 (after)', shot('studio-front', BODY)),
           ('REFERENCE', r('side')), ('R04A (before)', shot('studio-side', BODY, before)), ('R04A.2 (after)', shot('studio-side', BODY)),
           ('REFERENCE', r('back')), ('R04A (before)', shot('studio-back', BODY, before)), ('R04A.2 (after)', shot('studio-back', BODY))],
          'before-after-body.jpg', 640)
    sheet([('REFERENCE', r('face')), ('R04A (before)', shot('studio-face', CLOSE, before)), ('R04A.2 (after)', shot('studio-face', CLOSE)),
           ('REFERENCE', r('hand')), ('R04A (before)', shot('studio-hands', CLOSE, before)), ('R04A.2 (after)', shot('studio-hands', CLOSE))],
          'before-after-closeups.jpg', 460)
print('ok')
