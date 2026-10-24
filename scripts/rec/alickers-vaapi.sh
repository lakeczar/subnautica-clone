#!/usr/bin/env bash
# REC-1 R3b: the WSL sandbox's D3D12 VA-API encode path, owner-approved
# 2026-10-24: install mesa-va-drivers, vainfo and ffmpeg inside the sandbox
# only (nothing on Windows or the host, no WSL restart), then probe:
#   1. LIBVA_DRIVER_NAME=d3d12 vainfo: encode entrypoints, not just decode;
#   2. the native h264_vaapi synthetic encode;
#   3. only if 2 encoded: Chrome's VA-API path with the media-log identity check.
# Stops at once, changing nothing, if sudo is not available non-interactively.
#   bash scripts/rec/alickers-vaapi.sh OUT_DIR      (through the 4070 lane, one bounded job)
# Removal: sudo apt remove <the packages in OUT_DIR/installed.txt> && sudo apt autoremove
set -u
out="${1:?usage: alickers-vaapi.sh OUT_DIR}"; mkdir -p "$out"
cd "$(dirname "$0")/../.."
# Already installed (by someone with sudo): probe read-only.
if dpkg-query -W mesa-va-drivers vainfo ffmpeg >/dev/null 2>&1; then
  dpkg-query -W -f='${Package} ${Version}\n' mesa-va-drivers vainfo ffmpeg | tee "$out/installed.txt"
  echo "packages already present: probing only"
else
  if ! sudo -n true 2>/dev/null; then echo "NO_SUDO: sudo is not available non-interactively to $(whoami); nothing installed" | tee "$out/result.txt"; exit 3; fi
  dpkg-query -W -f='${Package} ${Version}\n' | sort > "$out/packages-before.txt"
  export DEBIAN_FRONTEND=noninteractive
  if ! timeout 900 sudo -n apt-get update -qq > "$out/apt.log" 2>&1 || ! timeout 1200 sudo -n -E apt-get install -y -qq --no-install-recommends mesa-va-drivers vainfo ffmpeg >> "$out/apt.log" 2>&1; then
    echo "INSTALL_FAILED: $(tail -3 "$out/apt.log" | tr '\n' ' ')" | tee "$out/result.txt"; exit 4
  fi
  dpkg-query -W -f='${Package} ${Version}\n' | sort > "$out/packages-after.txt"
  comm -13 "$out/packages-before.txt" "$out/packages-after.txt" > "$out/installed.txt"
  echo "installed $(wc -l < "$out/installed.txt") packages: $(grep -E '^(mesa-va-drivers|vainfo|ffmpeg) ' "$out/installed.txt" | tr '\n' ';')"
fi
bash scripts/rec/vaapi-probe.sh "$out/vaapi"
if [ -s "$out/vaapi/native-h264_vaapi.mkv" ]; then
  echo "native h264_vaapi encoded: trying Chrome's VA-API path"
  node scripts/rec/encoder-probe.mjs --out "$out/chrome" --env LIBVA_DRIVER_NAME=d3d12 \
    --launch 'vaapi=--enable-features=AcceleratedVideoEncoder' --launch 'vaapi-gl=--enable-features=AcceleratedVideoEncoder,VaapiIgnoreDriverChecks'
else
  echo "native h264_vaapi did not encode: Chrome's VA-API path not tried"
fi
grep -E 'encode entrypoints|h264_vaapi|av1_vaapi|hevc_vaapi' "$out/vaapi/vaapi-probe.txt" | tee "$out/result.txt"
