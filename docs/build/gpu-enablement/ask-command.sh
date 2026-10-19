#!/usr/bin/env bash
# Print the exact command to send with `ask run`; the owner sees this text before approving.
#
#   bash ask-command.sh preflight             read-only checks and host facts, printed in `ask result`
#   bash ask-command.sh rehearsal             detached run: same checks, records and locks; changes nothing
#   bash ask-command.sh attach                the real change: give factory-worker the GPU (restarts it)
#   bash ask-command.sh detach                take the GPU back (restarts it)
#
# The command copies the staged script to a new root-only folder, checks it against
# this bundle's SHA-256 and runs that copy. Launches carry a deadline 30 minutes from
# now (GPU_ASK_VALID_MIN to change): an approval that arrives later starts nothing.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
STAGED=/mnt/user/appdata/fleet-gpu/host-gpu.sh
sha="$(sha256sum < "$here/host-gpu.sh" | cut -d' ' -f1)"
deadline=$(( $(date +%s) + ${GPU_ASK_VALID_MIN:-30} * 60 ))
case "${1:-}" in
  preflight) tail="preflight attach" ;;
  rehearsal) tail="launch attach --expect-sha256 $sha --not-after $deadline --rehearsal" ;;
  attach|detach) tail="launch $1 --expect-sha256 $sha --not-after $deadline" ;;
  *) echo "usage: bash ask-command.sh preflight|rehearsal|attach|detach" >&2; exit 2 ;;
esac
# shellcheck disable=SC2016 # $d is for the host's shell
printf 'd=$(mktemp -d) && cp %s "$d/" && echo "%s  $d/host-gpu.sh" | sha256sum -c && bash "$d/host-gpu.sh" %s\n' "$STAGED" "$sha" "$tail"
