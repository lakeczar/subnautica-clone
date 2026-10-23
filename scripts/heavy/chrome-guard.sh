# GPU lease check in front of a Playwright Chrome binary (SCHED-2). Not run
# directly: install.sh --gpu-guard renames each Playwright Chrome to
# <name>.siltwake-real and writes a wrapper in its place, which is this body
# preceded by two settings:
#
#   real=<the real Chrome binary>
#   check=<an installed gpu-lease.mjs>, in the guard's own immutable install
#         (~/.local/share/siltwake-sched/guard/<version>), which scheduler
#         installs and rollbacks never touch (R1-F5)
#
# A launch that asks for the GPU (ANGLE on a GL/EGL/Vulkan backend,
# --enable-gpu, --ignore-gpu-blocklist, Vulkan) needs a valid lease; a software
# (SwiftShader) launch, such as the T3 preview's or a functional test's, passes
# straight through without running anything else. The check must print
# "gpu-lease: ok": a missing or broken checker fails closed. Chrome starts its
# own child processes from /proc/self/exe, so only the browser launch itself
# comes through here.
gpu=
for a in "$@"; do
  case "$a" in
    --type=*) exec "$real" "$@" ;;
    --use-angle=swiftshader*|--use-gl=swiftshader*|--use-gl=disabled|--use-gl=stub) ;;
    --use-angle=*|--use-gl=*|--enable-gpu|--ignore-gpu-blocklist|--use-vulkan*|--enable-features=*Vulkan*) gpu=1 ;;
  esac
done
if [ -n "$gpu" ]; then
  if [ ! -f "$check" ]; then
    echo "$real: GPU lease enforcement is unavailable ($check is missing); refusing a GPU launch. Run scripts/heavy/install.sh --gpu-guard (or --gpu-guard-remove to remove the guard deliberately)." >&2
    exit 2
  fi
  [ "$(node "$check" check "$real")" = "gpu-lease: ok" ] || exit 2
fi
exec "$real" "$@"
