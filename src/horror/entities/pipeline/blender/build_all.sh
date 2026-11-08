#!/bin/bash
# Rebuild NIGHT WARD's entity models from source.
#   BLENDER_PY=/path/to/python-with-bpy ./build_all.sh [--skip-sculpt]
# Needs Python with the `bpy` package (pip install bpy) and Node for the pose sampler.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../../../.." && pwd)"
WORK="${NW_WORK:-$HERE/.work}"
PY="${BLENDER_PY:-python3}"
ASSETS="$REPO/src/horror/entities/assets"
mkdir -p "$WORK/sculpt" "$WORK/game"
if [ "${1:-}" != "--skip-sculpt" ]; then
  for e in patient nurse crawler watcher reflection; do
    "$PY" "$HERE/$e.py" -- "$WORK/sculpt"            # sculpt + cloth sim + preview renders
  done
fi
( cd "$REPO" && NW_POSE_OUT="$WORK/poses.json" npx vitest run src/horror/entities/pipeline/samplePoses.test.ts )
for e in patient nurse crawler watcher reflection; do
  "$PY" "$HERE/rig_and_export.py" -- "$e" "$WORK/sculpt/$e.blend" "$WORK/poses.json" "$WORK/game"
  cp "$WORK/game/$e.glb" "$ASSETS/$e.glb"
done
"$PY" - "$WORK/game" "$ASSETS/manifest.json" <<'PY'
import json, sys, os
src, out = sys.argv[1], sys.argv[2]
merged = {e: json.load(open(os.path.join(src, f'{e}.manifest.json'))) for e in ('patient', 'nurse', 'crawler', 'watcher', 'reflection')}
json.dump(merged, open(out, 'w'), indent=1)
PY
echo "Assets written to $ASSETS"
