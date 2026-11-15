"""NW-R04A: side-by-side sheets of the approved reference and the in-game preview screenshots
(tests/browser/nw-r04a-shaw-preview.spec.ts, written to docs/nw-r04a/preview/).

Run:  python3 compare_ingame.py <reference.jpg> <preview_dir>
"""
import os
import sys
from PIL import Image, ImageDraw

ref_path, d = sys.argv[1], sys.argv[2]
ref = Image.open(ref_path).convert('RGB')
REF = {'front': (310, 20, 580, 887), 'side': (590, 20, 790, 887), 'back': (1080, 20, 1310, 887),
       'front34': (40, 20, 320, 887), 'back34': (820, 20, 1010, 887),
       'face': (1355, 110, 1595, 388), 'hand': (1355, 650, 1595, 862)}
BODY = (460, 0, 820, 720)   # full-body presets keep her centred in the 1280x720 frame
CLOSE = (300, 0, 980, 720)


def load(name):
    path = f'{d}/{name}.png' if os.path.exists(f'{d}/{name}.png') else f'{d}/{name}.jpg'
    return Image.open(path).convert('RGB')


def shot(name, box):
    return load(name).crop(box)


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
sheet([('REFERENCE face', r('face')), ('IN-GAME studio face', shot('studio-face', CLOSE)), ('IN-GAME ward face', shot('ward-face', CLOSE))],
      'compare-face.jpg', 520)
sheet([('REFERENCE hand', r('hand')), ('IN-GAME studio hands', shot('studio-hands', CLOSE)), ('IN-GAME ward hands', shot('ward-hands', CLOSE))],
      'compare-hands.jpg', 520)
sheet([('REFERENCE front', r('front')), ('IN-GAME ward front', shot('ward-front', BODY)), ('IN-GAME ward 3/4 back', shot('ward-back34', BODY)),
       ('IN-GAME ward 3 m', load('ward-gameplay-near')),
       ('IN-GAME ward 7 m', load('ward-gameplay'))], 'compare-ward-lighting.jpg', 520)
print('ok')
