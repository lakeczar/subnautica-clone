#!/usr/bin/env bash
# REC-1 R3b, BROWSER-HW-VIDEO-ENCODE-SOL §10 probe 2: does this Linux (WSL2)
# machine expose a hardware video ENCODER through VA-API? Read-only: it lists
# packages and drivers, asks vainfo (Mesa's D3D12 driver first on WSL), and
# tries a short synthetic native encode with ffmpeg's VAAPI encoders. It
# installs and changes nothing.
#   bash scripts/rec/vaapi-probe.sh OUT_DIR
set -u
out="${1:?usage: vaapi-probe.sh OUT_DIR}"; mkdir -p "$out"
log() { printf '%s\n' "$*" | tee -a "$out/vaapi-probe.txt"; }
: > "$out/vaapi-probe.txt"
log "## machine"; log "$(uname -a)"; log "WSL: $(grep -qi microsoft /proc/version && echo yes || echo no)"
log "## packages"; log "$(dpkg -l 2>/dev/null | grep -Ei 'mesa-va|libva|vainfo|intel-media|nvidia-vaapi' | awk '{print $2, $3}')"
log "## VA drivers on disk"; log "$(ls /usr/lib/x86_64-linux-gnu/dri/*_drv_video.so 2>/dev/null || echo none)"
log "## devices"; log "$(ls -l /dev/dri /dev/dxg 2>&1)"
for drv in d3d12 ""; do
  for dev in /dev/dri/renderD128 /dev/dri/card0; do
    [ -e "$dev" ] || continue
    log "## vainfo LIBVA_DRIVER_NAME=${drv:-default} --device $dev"
    if command -v vainfo >/dev/null; then
      env ${drv:+LIBVA_DRIVER_NAME=$drv} vainfo --display drm --device "$dev" > "$out/vainfo-${drv:-default}-$(basename $dev).txt" 2>&1
      log "exit $?; encode entrypoints: $(grep -E 'EncSlice|EncPicture|EncSliceLP' "$out/vainfo-${drv:-default}-$(basename $dev).txt" | sed 's/^ *//' | tr '\n' ';')"
      log "driver: $(grep -i 'driver version' "$out/vainfo-${drv:-default}-$(basename $dev).txt" | head -1)"
    else log "vainfo not installed"; fi
  done
done
log "## native encode (Microsoft's documented h264_vaapi example, 2 s synthetic)"
ff=$(command -v ffmpeg || true)
if [ -z "$ff" ]; then log "no system ffmpeg"; else
  log "ffmpeg: $($ff -hide_banner -version | head -1); vaapi encoders: $($ff -hide_banner -encoders 2>/dev/null | grep -Eo '[a-z0-9]+_vaapi' | tr '\n' ' ')"
  for enc in h264_vaapi av1_vaapi hevc_vaapi; do
    for dev in /dev/dri/renderD128 /dev/dri/card0; do
      [ -e "$dev" ] || continue
      LIBVA_DRIVER_NAME=d3d12 timeout 60 $ff -hide_banner -loglevel error -vaapi_device "$dev" -f lavfi -i testsrc=duration=2:size=1280x720:rate=12 \
        -vf 'format=nv12,hwupload' -c:v $enc -y "$out/native-$enc.mkv" > "$out/native-$enc-$(basename $dev).log" 2>&1
      rc=$?
      log "$enc on $dev (d3d12): exit $rc, $(stat -c %s "$out/native-$enc.mkv" 2>/dev/null || echo 0) bytes; $(tail -2 "$out/native-$enc-$(basename $dev).log" | tr '\n' ' ')"
      [ $rc -eq 0 ] && break
    done
  done
fi
