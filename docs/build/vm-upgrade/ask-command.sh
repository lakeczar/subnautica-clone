#!/usr/bin/env bash
# Print the exact command to send with `ask run`; the owner sees this text before approving.
#
#   bash ask-command.sh --rehearsal     a detached rehearsal that changes nothing
#   bash ask-command.sh                 the real upgrade
#
# The command copies the staged script into a new root-only folder, checks the
# copy against this bundle's SHA-256 and launches that copy, so what runs is what
# was reviewed even if the staged file changes. The run copies itself again into
# its run folder and checks the same hash.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
STAGED=/mnt/user/appdata/fleet-vm-upgrade/vm-ram-upgrade.sh
case "${1:-}" in
  ""|--rehearsal) ;;
  *) echo "usage: bash ask-command.sh [--rehearsal]" >&2; exit 2 ;;
esac
sha="$(sha256sum < "$here/vm-ram-upgrade.sh" | cut -d' ' -f1)"
# shellcheck disable=SC2016 # $d is for the host's shell
printf 'd=$(mktemp -d) && cp %s "$d/" && echo "%s  $d/vm-ram-upgrade.sh" | sha256sum -c && bash "$d/vm-ram-upgrade.sh" launch --expect-sha256 %s%s\n' \
  "$STAGED" "$sha" "$sha" "${1:+ $1}"
