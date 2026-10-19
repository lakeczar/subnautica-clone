#!/usr/bin/env bash
# After the reboot, on factory-worker as user worker: make the archived Siltwake
# /tmp paths resolve again without refilling RAM-backed /tmp.
#
#   bash restore-tmp-links.sh            check only (the default): archive hash,
#                                        what would be linked, what already exists
#   bash restore-tmp-links.sh --apply    extract once into a disk folder beside the
#                                        archive, then symlink each missing /tmp name to it
#
# It never overwrites or removes anything in /tmp: a name that exists there
# (file, folder or another symlink) is reported and left alone. The extraction
# goes to <name>.partial first and is renamed only when tar succeeds.
# RTL_CHECKPOINT and RTL_TMP exist for the offline tests.
set -uo pipefail

CK="${RTL_CHECKPOINT:-/home/worker/.local/share/siltwake-checkpoints/vm-upgrade-20261019}"
ARCHIVE="$CK/tmp-siltwake.tar"
SHA="${RTL_SHA256:-188e1a36213ddb7f8ae58af26f4d1ea48280d938835883c4f2a50f37b1c13b1a}"
NAMES="$CK/tmp-paths.nul"
DEST="$CK/tmp-restored"
TMPD="${RTL_TMP:-/tmp}"
apply=no
case "${1:-}" in
  "") ;;
  --apply) apply=yes ;;
  *) echo "usage: bash restore-tmp-links.sh [--apply]" >&2; exit 2 ;;
esac

die() { echo "restore-tmp-links: $*" >&2; exit 1; }

[ -f "$ARCHIVE" ] && [ -f "$NAMES" ] || die "missing $ARCHIVE or $NAMES"
actual="$(sha256sum < "$ARCHIVE" | cut -d' ' -f1)"
[ "$actual" = "$SHA" ] || die "archive SHA-256 is $actual, expected $SHA; nothing was done"
echo "archive SHA-256 matches ($SHA)"

if [ -d "$DEST" ]; then
  [ "$(cat "$DEST/.from-sha256" 2>/dev/null)" = "$SHA" ] || die "$DEST exists but is not a finished extraction of this archive; inspect it"
  echo "already extracted in $DEST"
elif [ "$apply" = yes ]; then
  if [ -e "$DEST.partial" ]; then
    # Only a leftover from this script (it writes the marker first) is cleared.
    [ "$(cat "$DEST.partial/.partial-from-sha256" 2>/dev/null)" = "$SHA" ] || die "$DEST.partial exists and is not ours; inspect it"
    rm -rf -- "$DEST.partial"
  fi
  need=$(( $(stat -c %s "$ARCHIVE") / 1024 + 1048576 ))
  free="$(df -Pk "$CK" | awk 'NR == 2 { print $4 }')"
  [ "$free" -ge "$need" ] || die "needs $need KiB free beside the archive, has $free KiB"
  mkdir "$DEST.partial" && echo "$SHA" > "$DEST.partial/.partial-from-sha256" || die "cannot create $DEST.partial"
  echo "extracting to $DEST (disk, not /tmp) ..."
  tar -xf "$ARCHIVE" -C "$DEST.partial" || die "tar failed; $DEST.partial is left for inspection"
  mv "$DEST.partial/.partial-from-sha256" "$DEST.partial/.from-sha256" && mv -- "$DEST.partial" "$DEST" || die "could not finish $DEST"
  echo "extracted"
else
  echo "would extract to $DEST ($(stat -c %s "$ARCHIVE") bytes, disk-backed)"
fi

linked=0 created=0 would=0 kept=0 missing=0
while IFS= read -r -d '' name; do
  [[ -n "$name" && "$name" != */* && "$name" != . && "$name" != .. ]] || { echo "skipped odd name: '$name'"; continue; }
  t="$TMPD/$name"
  if [ -L "$t" ] && [ "$(readlink -- "$t")" = "$DEST/$name" ]; then
    linked=$((linked + 1))
  elif [ -e "$t" ] || [ -L "$t" ]; then
    kept=$((kept + 1)); echo "kept, already in $TMPD: $name"
  elif [ "$apply" = yes ]; then
    if [ -e "$DEST/$name" ] || [ -L "$DEST/$name" ]; then
      ln -s -- "$DEST/$name" "$t" && created=$((created + 1))
    else
      missing=$((missing + 1)); echo "not in the extraction: $name"
    fi
  else
    would=$((would + 1))
  fi
done < "$NAMES"

echo "linked before: $linked, linked now: $created, would link: $would, kept (exist in $TMPD): $kept, missing: $missing"
echo "Check the art prototype's Git binding before using it: git -C $TMPD/siltwake-art-prototype status"
[ "$missing" = 0 ]
