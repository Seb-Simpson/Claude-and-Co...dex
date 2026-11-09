"""Downsize oversized textures inside the exported GLB (GPU memory budget for laptops).

    python3 optimize_glb.py <in.glb> <out.glb>

The bake writes every atlas at full size. Several maps do not need it:
- the rot glow atlas is almost entirely black;
- the props ORM and normal maps hold low-frequency detail;
- the wheelchair is a small prop.
Each map is resized and re-encoded in place. Geometry, materials and UVs are untouched.
"""
import io
import json
import struct
import sys

from PIL import Image

TARGETS = {  # image name prefix -> max size
    'decals_glow': 512,
    'props_orm': 1024,
    'props_normal': 1024,
    'wheelchair_albedo': 512,
    'wheelchair_orm': 512,
    'wheelchair_normal': 512,
    'doorleaf_orm': 512,
    'doorleaf_normal': 512,
}


def read_glb(path):
    data = open(path, 'rb').read()
    magic, version, length = struct.unpack('<4sII', data[:12])
    assert magic == b'glTF' and version == 2
    jlen, jtype = struct.unpack('<I4s', data[12:20])
    gltf = json.loads(data[20:20 + jlen])
    off = 20 + jlen
    blen, btype = struct.unpack('<I4s', data[off:off + 8])
    return gltf, bytearray(data[off + 8:off + 8 + blen])


def write_glb(path, gltf, bin_chunk):
    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    bin_chunk += b'\0' * ((4 - len(bin_chunk) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(bin_chunk)
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total))
        f.write(struct.pack('<I4s', len(js), b'JSON') + js)
        f.write(struct.pack('<I4s', len(bin_chunk), b'BIN\0') + bytes(bin_chunk))


def main(src, dst):
    gltf, blob = read_glb(src)
    views = gltf['bufferViews']
    # Rebuild the binary chunk view by view so resized images can change length.
    replaced = {}
    for img in gltf.get('images', []):
        name = img.get('name', '')
        limit = next((v for k, v in TARGETS.items() if name.startswith(k)), None)
        if limit is None:
            continue
        v = views[img['bufferView']]
        raw = bytes(blob[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']])
        im = Image.open(io.BytesIO(raw))
        if max(im.size) <= limit:
            continue
        im = im.resize((limit, limit), Image.LANCZOS)
        out = io.BytesIO()
        if img.get('mimeType') == 'image/png':
            im.save(out, 'PNG', optimize=True)
        else:
            im.convert('RGB').save(out, 'JPEG', quality=88)
        replaced[img['bufferView']] = out.getvalue()
        print('NW_OPT', name, len(raw), '->', len(out.getvalue()))
    new_blob = bytearray()
    for i, v in enumerate(views):
        chunk = replaced.get(i)
        if chunk is None:
            chunk = bytes(blob[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']])
        while len(new_blob) % 4:
            new_blob += b'\0'
        v['byteOffset'] = len(new_blob)
        v['byteLength'] = len(chunk)
        new_blob += chunk
    gltf['buffers'][0]['byteLength'] = len(new_blob)
    write_glb(dst, gltf, new_blob)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
