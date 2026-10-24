#!/bin/sh
# Asset-pipeline research probe: which Blender render paths work on this worker?
# Usage: gpu_matrix.sh OUT_DIR
# Downloads portable Blender 5.2.3 LTS (sha256-checked) into a private temporary
# directory unless BLENDER_TARBALL names a verified copy, then runs the probes
# and removes Blender again. Only small logs, JSON and PNGs stay in OUT_DIR.
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

{
  echo "## host"; uname -sr; hostname; nproc; free -m | head -2
  echo "## gpu devices"; ls -l /dev/dxg /dev/dri 2>&1; nvidia-smi -L 2>&1 | head -4
  echo "## wsl gpu libs"; ls /usr/lib/wsl/lib 2>&1 | tr '\n' ' '; echo
  echo "## tools"; for t in Xvfb xvfb-run glxinfo eglinfo vulkaninfo; do printf '%s: %s\n' "$t" "$(command -v $t || echo missing)"; done
  echo "## packages"
  dpkg-query -W -f='${Package} ${Version}\n' xvfb mesa-utils libegl-mesa0 libgl1-mesa-dri libglx-mesa0 \
    mesa-vulkan-drivers libx11-6 libxi6 libxxf86vm1 libxfixes3 libxrender1 libxkbcommon0 libsm6 libice6 \
    libwayland-client0 libdecor-0-0 2>&1
} > "$OUT/env.txt" 2>&1
cat "$OUT/env.txt"

# A private display inside Linux: no TCP, no Windows integration.
if command -v Xvfb >/dev/null; then
  Xvfb -displayfd 3 -nolisten tcp -screen 0 1280x1024x24 3>"$W/display" 2>"$OUT/xvfb.log" &
  XPID=$!
  for _ in 1 2 3 4 5 6 7 8 9 10; do [ -s "$W/display" ] && break; sleep 0.5; done
  D=":$(cat "$W/display")"
  log "Xvfb on $D"
  if command -v glxinfo >/dev/null; then
    for A in "" NVIDIA Intel AMD; do
      echo "## glxinfo adapter='$A'"
      DISPLAY=$D MESA_D3D12_DEFAULT_ADAPTER_NAME=$A timeout 60 glxinfo -B 2>&1 | grep -i "device\|renderer\|version\|accelerated" | head -6
    done > "$OUT/glxinfo.txt" 2>&1
    cat "$OUT/glxinfo.txt"
  fi
else
  D=""
  log "no Xvfb"
fi

if [ -n "${BLENDER_TARBALL:-}" ]; then T=$BLENDER_TARBALL; else
  log "downloading Blender"; T=$W/blender.tar.xz
  curl -sSf -o "$T" "$URL" || { log "download failed"; exit 2; }
fi
echo "$SHA  $T" | sha256sum -c - || { log "checksum mismatch"; exit 2; }
mkdir -p "$W/blender" && tar -xJf "$T" -C "$W/blender" --strip-components=1
B=$W/blender/blender
echo "## ldd missing"; ldd "$B" | grep "not found" || echo none

run() { # NAME DISPLAY ADAPTER -- blender args...
  n=$1; d=$2; a=$3; shift 4
  s=$(date +%s.%N)
  if [ -n "$d" ]; then
    DISPLAY=$d MESA_D3D12_DEFAULT_ADAPTER_NAME=$a timeout 600 "$B" "$@" > "$OUT/$n.log" 2>&1
  else
    env -u DISPLAY -u WAYLAND_DISPLAY MESA_D3D12_DEFAULT_ADAPTER_NAME=$a timeout 600 "$B" "$@" > "$OUT/$n.log" 2>&1
  fi
  rc=$?
  log "$n rc=$rc wall=$(python3 -I -c "import sys; print(round(float(sys.argv[2])-float(sys.argv[1]),1))" "$s" "$(date +%s.%N)")s"
}
ENV="-b --factory-startup -noaudio --python-exit-code 1 --python $HERE/probe_env.py --"
run env-background "" "NVIDIA" -- $ENV "$OUT/env-background.json"
if [ -n "$D" ]; then
  run env-xvfb-nvidia "$D" "NVIDIA" -- $ENV "$OUT/env-xvfb-nvidia.json"
  run env-xvfb-intel "$D" "Intel" -- $ENV "$OUT/env-xvfb-intel.json"
fi
for f in "$OUT"/env-*.json; do echo "## $f"; cat "$f"; done

PROBE="-b --factory-startup -noaudio -t 6 --python-exit-code 1 --python $HERE/probe_bpy.py --"
export PROBE_SCALE=2 PROBE_SAMPLES=128
for e in CYCLES CYCLES_CUDA CYCLES_OPTIX; do run "bpy-$e" "" "NVIDIA" -- $PROBE "$OUT/$e" "$e"; done
unset PROBE_SCALE PROBE_SAMPLES
run bpy-EEVEE-background "" "NVIDIA" -- $PROBE "$OUT/EEVEE-background" BLENDER_EEVEE
[ -n "$D" ] && run bpy-EEVEE-xvfb "$D" "NVIDIA" -- $PROBE "$OUT/EEVEE-xvfb" BLENDER_EEVEE
run bpy-WORKBENCH-background "" "NVIDIA" -- $PROBE "$OUT/WORKBENCH-background" WORKBENCH
for f in "$OUT"/*/report-*.json; do echo "## $f"; python3 -I -c "import json,sys; r=json.load(open(sys.argv[1])); print(r.get('cycles_devices'), {k:(v.get('ok'),v.get('s'),v.get('error','')[:160]) for k,v in r['steps'].items()}, r['total_s'])" "$f"; done
find "$OUT" -name '*.blend' -delete
sha256sum "$OUT"/*/canister.glb
log done
