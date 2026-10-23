#!/bin/sh
# GPU lease check in front of a Playwright Chrome binary (SCHED-2).
#
#   chrome-guard.sh REAL_CHROME ARGS...
#
# install.sh --gpu-guard renames each Playwright Chrome to <name>.siltwake-real
# and puts a two-line wrapper in its place that runs this file. A launch that
# asks for the GPU (ANGLE on a GL/EGL/Vulkan backend, --enable-gpu,
# --ignore-gpu-blocklist, Vulkan) needs a valid lease (gpu-lease.mjs); a
# software (SwiftShader) launch, such as the T3 preview's or a functional test's,
# passes straight through. Chrome starts its own child processes from
# /proc/self/exe, so only the browser launch itself comes through here.
real=$1
shift
gpu=
for a in "$@"; do
  case "$a" in
    --type=*) exec "$real" "$@" ;;
    --use-angle=swiftshader*|--use-gl=swiftshader*|--use-gl=disabled|--use-gl=stub) ;;
    --use-angle=*|--use-gl=*|--enable-gpu|--ignore-gpu-blocklist|--use-vulkan*|--enable-features=*Vulkan*) gpu=1 ;;
  esac
done
if [ -n "$gpu" ]; then
  [ "$(node "$(dirname "$0")/gpu-lease.mjs" check "$real")" = "gpu-lease: ok" ] || exit 2
fi
exec "$real" "$@"
