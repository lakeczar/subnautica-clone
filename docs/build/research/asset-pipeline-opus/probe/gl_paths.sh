#!/bin/sh
# Follow-up probe for WSL: hardware OpenGL through Mesa's D3D12 Gallium driver.
# Usage: gl_paths.sh OUT_DIR. Same Blender download and cleanup as gpu_matrix.sh.
set -u
OUT=$1; mkdir -p "$OUT"; OUT=$(cd "$OUT" && pwd)
HERE=$(cd "$(dirname "$0")" && pwd)
W=$(mktemp -d "${TMPDIR:-/tmp}/asset-probe.XXXXXX")
XPID=""
cleanup() { [ -n "$XPID" ] && kill "$XPID" 2>/dev/null; rm -rf "$W"; }
trap cleanup EXIT INT TERM
log() { echo "[$(date +%H:%M:%S)] $*"; }
SHA=78486c018b4443efe5e75ab54c290ed8c15abafd249b862c2c9ce2530a918eec
URL=https://download.blender.org/release/Blender5.2/blender-5.2.3-linux-x64.tar.xz

Xvfb -displayfd 3 -nolisten tcp -screen 0 1600x1000x24 3>"$W/display" 2>"$OUT/xvfb.log" &
XPID=$!
for _ in 1 2 3 4 5 6 7 8 9 10; do [ -s "$W/display" ] && break; sleep 0.5; done
D=":$(cat "$W/display")"; log "Xvfb on $D"

{
  for A in NVIDIA Intel AMD Microsoft; do
    echo "## GALLIUM_DRIVER=d3d12 adapter=$A glxinfo (Xvfb)"
    DISPLAY=$D GALLIUM_DRIVER=d3d12 MESA_D3D12_DEFAULT_ADAPTER_NAME=$A timeout 60 glxinfo -B 2>&1 | grep -i "device\|renderer string\|accelerated\|core profile version" | head -5
    echo "## GALLIUM_DRIVER=d3d12 adapter=$A eglinfo (surfaceless)"
    env -u DISPLAY GALLIUM_DRIVER=d3d12 MESA_D3D12_DEFAULT_ADAPTER_NAME=$A timeout 60 eglinfo -B -p surfaceless 2>&1 | grep -i "renderer\|version string" | head -4
  done
  echo "## vulkaninfo --summary"; timeout 60 vulkaninfo --summary 2>&1 | grep -i "deviceName\|driverName\|apiVersion" | head -8
} > "$OUT/gl.txt" 2>&1
cat "$OUT/gl.txt"

curl -sSf -o "$W/blender.tar.xz" "$URL" || { log "download failed"; exit 2; }
echo "$SHA  $W/blender.tar.xz" | sha256sum -c - || exit 2
mkdir -p "$W/blender" && tar -xJf "$W/blender.tar.xz" -C "$W/blender" --strip-components=1
B=$W/blender/blender

run() { # NAME DISPLAY ADAPTER -- args
  n=$1; d=$2; a=$3; shift 4; s=$(date +%s)
  if [ -n "$d" ]; then DISPLAY=$d GALLIUM_DRIVER=d3d12 MESA_D3D12_DEFAULT_ADAPTER_NAME=$a timeout 300 "$B" "$@" > "$OUT/$n.log" 2>&1
  else env -u DISPLAY GALLIUM_DRIVER=d3d12 MESA_D3D12_DEFAULT_ADAPTER_NAME=$a timeout 300 "$B" "$@" > "$OUT/$n.log" 2>&1; fi
  log "$n rc=$? wall=$(( $(date +%s) - s ))s"
}
ENV="-b --factory-startup -noaudio --python-exit-code 1 --python $HERE/probe_env.py --"
run env-d3d12-background "" NVIDIA -- $ENV "$OUT/env-d3d12-background.json"
run env-d3d12-xvfb-nvidia "$D" NVIDIA -- $ENV "$OUT/env-d3d12-xvfb-nvidia.json"
run env-d3d12-xvfb-intel "$D" Intel -- $ENV "$OUT/env-d3d12-xvfb-intel.json"
PROBE="-b --factory-startup -noaudio -t 6 --python-exit-code 1 --python $HERE/probe_bpy.py --"
run eevee-d3d12-xvfb "$D" NVIDIA -- $PROBE "$OUT/EEVEE-d3d12-xvfb" BLENDER_EEVEE
run eevee-d3d12-xvfb-again "$D" NVIDIA -- $PROBE "$OUT/EEVEE-d3d12-xvfb-again" BLENDER_EEVEE
run gui-d3d12-xvfb "$D" NVIDIA -- --factory-startup -noaudio --python "$HERE/probe_gui.py" -- "$OUT/gui-d3d12"
run gui-llvmpipe-xvfb "$D" "" -- --factory-startup -noaudio --python "$HERE/probe_gui.py" -- "$OUT/gui-llvmpipe"
# OptiX: why is no device listed?
"$B" -b --factory-startup -noaudio --debug-cycles --python-expr "import bpy; p=bpy.context.preferences.addons['cycles'].preferences; p.compute_device_type='OPTIX'; p.get_devices(); print('OPTIX', [d.name for d in p.devices if d.type=='OPTIX'])" > "$OUT/optix.log" 2>&1
grep -i "optix\|cuda" "$OUT/optix.log" | head -20
for f in "$OUT"/env-*.json "$OUT"/gui-*.json; do echo "## $f"; python3 -I -c "import json,sys; r=json.load(open(sys.argv[1])); print(r.get('gpu'), r.get('eevee_frame'), r.get('screenshot_error',''))" "$f"; done
for f in "$OUT"/EEVEE-*/report-*.json; do echo "## $f"; python3 -I -c "import json,sys; r=json.load(open(sys.argv[1])); print({k:(v.get('ok'),v.get('s')) for k,v in r['steps'].items()})" "$f"; done
find "$OUT" -name '*.blend' -delete
log done
