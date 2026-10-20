#!/usr/bin/env bash
# One fake for every system tool worker-gpu.sh calls, chosen by the name it is invoked as
# (run.sh links it as sudo, apt-get, apt-mark, dpkg-query, journalctl, lsmod, modinfo,
# modprobe, lspci, nvidia-smi, systemctl, loginctl, curl, df). State lives in $GF; every
# call is logged to $GF/calls.log. Nothing here touches the real system: sudo only runs
# its command inside the sandbox, and apt only edits $GF/db.tsv.
#
# Files in $GF: db.tsv ("package<TAB>version<TAB>ii "), manual.txt, deps.txt (extra packages
# a plan pulls in), journal.txt, lsmod.txt, modprobe.txt, lspci.txt, nvidia-smi.txt,
# modules_built (modinfo answers for any kernel). Knobs: dpkg_fail, aptmark_fail,
# update_fail, sim_extra (extra plan lines), install_partial N, install_fail,
# install_also (a package someone else installs meanwhile), purge_extra, journal_fail,
# lsmod_fail, curl_fail, lspci_fail.
GF="${GF:-/tmp/guest-fake}"
me="$(basename "$0")"
echo "$me $*" >> "$GF/calls.log"
has() { [ -f "$GF/$1" ]; }
ver_of() { awk -F'\t' -v p="$1" '$1 == p {print $2}' "$GF/db.tsv"; }

# The plan for "install PKGS": every requested package not installed, plus deps.txt, plus sim_extra.
plan_for() {
  local p
  for p in "$@"; do [ -n "$(ver_of "$p")" ] || echo "Inst $p (1.0-1 Debian:13.7/stable [amd64])"; done
  [ -f "$GF/deps.txt" ] && while read -r p; do [ -n "$p" ] && [ -z "$(ver_of "$p")" ] && echo "Inst $p (1.0-1 Debian:13.7/stable [amd64])"; done < "$GF/deps.txt"
  [ -f "$GF/sim_extra" ] && cat "$GF/sim_extra"
  return 0
}

case "$me" in
  sudo) [ "${1:-}" = -n ] && shift; exec "$@" ;;
  apt-get)
    args=(); sim=""; verb=""
    while [ $# -gt 0 ]; do case "$1" in -o) shift 2; continue ;; -s) sim=1 ;; -y|-qq|-q|--no-install-recommends) ;; install|update|purge) verb="$1" ;; *) args+=("$1") ;; esac; shift; done
    case "$verb" in
      update) has update_fail && { echo "E: update failed" >&2; exit 100; }; echo "Reading package lists..." ;;
      install)
        if [ -n "$sim" ]; then plan_for "${args[@]}"; exit 0; fi
        n=0; limit="$(cat "$GF/install_partial" 2>/dev/null)"
        has install_also && printf '%s\t9.9\tii \n' "$(cat "$GF/install_also")" >> "$GF/db.tsv"
        while read -r _ p _; do
          [ -n "$limit" ] && [ "$n" -ge "$limit" ] && { echo "E: Sub-process /usr/bin/dpkg returned an error code (1)" >&2; exit 100; }
          printf '%s\t1.0-1\tii \n' "$p" >> "$GF/db.tsv"; n=$((n + 1))
        done < <(plan_for "${args[@]}" | grep '^Inst ')
        has install_fail && { echo "E: post-install failed" >&2; exit 100; }
        exit 0 ;;
      purge)
        [ -n "$sim" ] || { echo "FORBIDDEN real purge" >> "$GF/calls.log"; exit 1; }
        for p in "${args[@]}"; do echo "Purg $p [$(ver_of "$p")]"; done
        has purge_extra && echo "Purg $(cat "$GF/purge_extra") [1.0]"; exit 0 ;;
      *) echo "FORBIDDEN apt-get $verb" >> "$GF/calls.log"; exit 1 ;;
    esac ;;
  apt-mark) has aptmark_fail && exit 1; [ "${1:-}" = showmanual ] && cat "$GF/manual.txt" ;;
  dpkg-query)
    has dpkg_fail && { echo "dpkg-query: error" >&2; exit 2; }
    fmt=""; pkg=""
    for a in "$@"; do case "$a" in -W) ;; -f=*) fmt="${a#-f=}" ;; *) pkg="$a" ;; esac; done
    if [ -n "$pkg" ]; then v="$(ver_of "$pkg")"; [ -n "$v" ] || exit 1; printf 'ii \t%s' "$v"
    else cat "$GF/db.tsv"; fi ;;
  journalctl) has journal_fail && { echo "Failed to get journal access" >&2; exit 1; }; cat "$GF/journal.txt" ;;
  lsmod) has lsmod_fail && exit 1; cat "$GF/lsmod.txt" ;;
  modinfo) has modules_built || exit 1; k=""; while [ $# -gt 0 ]; do [ "$1" = -k ] && k="$2"; shift; done; echo "$k SMP preempt mod_unload modversions" ;;
  modprobe) cat "$GF/modprobe.txt" ;;
  lspci) has lspci_fail && exit 1; for a in "$@"; do case "$a" in 10de*) cat "$GF/lspci.txt" 2>/dev/null; exit 0 ;; esac; done ;;
  nvidia-smi) [ -f "$GF/nvidia-smi.txt" ] || { echo "NVIDIA-SMI has failed" ; exit 9; }; cat "$GF/nvidia-smi.txt" ;;
  systemctl) case "$*" in *is-active*) echo active ;; *is-enabled*) echo enabled ;; esac ;;
  loginctl) echo yes ;;
  curl) has curl_fail && exit 7; exit 0 ;;
  df) printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/vda2 77000000 53000000 19000000 74%% /\n' ;;
  *) echo "FORBIDDEN unknown tool $me" >> "$GF/calls.log"; exit 1 ;;
esac
