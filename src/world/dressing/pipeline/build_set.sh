#!/usr/bin/env bash
# Rebuild the Room 104 visual prototype and copy it into src/world/dressing/assets.
#   BLENDER_PY=/path/to/python-with-bpy ./build_set.sh [--quick]
# Needs: a Python with the `bpy` module (Blender 5.x), and python3 with numpy + Pillow.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ASSETS="$HERE/../assets"
WORK="${WORK:-$HERE/.work}"
PY="${BLENDER_PY:?set BLENDER_PY to a python that can import bpy}"
mkdir -p "$WORK/tex" "$WORK/game" "$WORK/preview" "$ASSETS"
python3 "$HERE/textures.py" "$WORK/tex"
"$PY" "$HERE/room104_set.py" -- "$WORK/tex" "$WORK/room104_set.blend"
"$PY" "$HERE/bake_export.py" -- "$WORK/room104_set.blend" "$WORK/tex" "$WORK/game" "$@"
cp "$WORK/game/room104_set.glb" "$WORK/game/room104_lightmap.jpg" "$WORK/game/room104_set.json" "$ASSETS/"
"$PY" "$HERE/preview_set.py" -- "$WORK/room104_set.blend" "$WORK/preview" "$@"
echo "Room 104 set written to $ASSETS (previews in $WORK/preview)"
