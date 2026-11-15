"""Side-by-side: reference crops vs renders (front, side, back), equal heights."""
import sys
from PIL import Image
ref, renders, out = sys.argv[1], sys.argv[2], sys.argv[3]
views = sys.argv[4].split(',') if len(sys.argv) > 4 else ['front', 'side', 'back']
im = Image.open(ref)
crops = {'front': (310, 20, 580, 887), 'side': (590, 20, 790, 887), 'back': (1080, 20, 1310, 887), 'front34': (40, 20, 320, 887), 'back34': (820, 20, 1010, 887)}
H = 900
tiles = []
for v in views:
    a = im.crop(crops[v]); a = a.resize((int(a.width * H / a.height), H))
    b = Image.open(f'{renders}_{v}.png').convert('RGB'); b = b.resize((int(b.width * H / b.height), H))
    tiles += [a, b]
W = sum(t.width for t in tiles)
sheet = Image.new('RGB', (W, H), (40, 40, 40)); x = 0
for t in tiles:
    sheet.paste(t, (x, 0)); x += t.width
sheet.save(out)
