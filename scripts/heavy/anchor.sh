#!/bin/sh
# The job scope's anchor (started by scope-run.sh before the command, with the
# legacy bridge lock as fd 9, shared, the same lock the ticket's holder holds).
#
# It keeps v1 out for as long as the job's cgroup lives, whatever happens to
# the holder: it ignores TERM, so a stop of the scope (including BindsTo= after
# the holder dies) leaves it running through the stop grace, and it dies only
# in the scope's final SIGKILL, together with anything else still in the
# scope. On the normal path the holder (or recovery) sends it USR1 once it and
# its sleep are all that is left, so the lock is released as the cgroup empties.
exec 3<&-
trap '' TERM INT HUP
trap 'kill -KILL "$sleeper" 2>/dev/null; exit 0' USR1
while :; do
  sleep 3600 9<&- &
  sleeper=$!
  wait "$sleeper"
done
