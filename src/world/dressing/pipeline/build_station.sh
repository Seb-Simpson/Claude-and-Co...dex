#!/usr/bin/env bash
# NW-006A: rebuild the Nurses' Station set and copy it into src/world/dressing/assets.
#   BLENDER_PY=/path/to/python-with-bpy ./build_station.sh [--quick]
# Needs: a Python with the `bpy` module (Blender 5.x), and python3 with Pillow.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ASSETS="$HERE/../assets"
WORK="${WORK:-$HERE/.work}/station"
PY="${BLENDER_PY:?set BLENDER_PY to a python that can import bpy}"
mkdir -p "$WORK" "$ASSETS"
"$PY" "$HERE/station_set.py" -- "$WORK" "$@"
python3 "$HERE/optimize_glb.py" "$WORK/station_set.glb" "$ASSETS/station_set.glb"
cp "$WORK/station_set.json" "$ASSETS/"
python3 -c "import json,os,sys;p=sys.argv[1];m=json.load(open(p));m['bytes']=os.path.getsize(sys.argv[2]);json.dump(m,open(p,'w'),indent=1)" "$ASSETS/station_set.json" "$ASSETS/station_set.glb"
echo "Nurses' Station set written to $ASSETS"
