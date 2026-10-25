#!/usr/bin/env bash
# CW-1 R5: a job's memory over time, for telling steady growth (a leak) from a phase peak. Every
# 5 s, the job cgroup's memory.current and its five largest processes by RSS, as JSON lines.
#   usage: mem-trace.sh <out.jsonl> -- <command...>
set -u
out=$1; shift; [ "$1" = "--" ] && shift
cg=/sys/fs/cgroup$(sed -n 's/^0:://p' /proc/self/cgroup)
: > "$out"
( while :; do
    cur=$(cat "$cg/memory.current" 2>/dev/null || echo 0)
    top=$(for p in $(cat "$cg/cgroup.procs" 2>/dev/null); do
      r=$(awk '/^VmRSS:/{print $2}' /proc/$p/status 2>/dev/null); [ -n "$r" ] || continue
      c=$(tr '\0' ' ' < /proc/$p/cmdline 2>/dev/null | cut -c1-60 | tr -d '"\\'); echo "$r $c"; done | sort -rn | head -5 |
      awk '{r=$1; $1=""; printf "%s{\"rssMiB\":%d,\"cmd\":\"%s\"}", (NR>1?",":""), r/1024, substr($0,2)}')
    echo "{\"t\":$(date +%s),\"cgroupMiB\":$((cur / 1048576)),\"top\":[${top}]}" >> "$out"
    sleep 5
  done ) &
poller=$!
"$@"; rc=$?
kill $poller 2>/dev/null
exit $rc
