# VM upgrade R1 disposition

The coordinator accepts all five findings in [Sol R1](REVIEW-SOL-R1.md) after inspecting the candidate control flow and the reviewer's ten retained offline probe results. The bundle at `9987231` is **not ready for staging**. No host script, approval request, VM setting or service has been changed.

Opus 5.5/high owns correction of the whole upgrade bundle, with room to simplify connected helpers. Preserve the original review and evidence as historical records; add correction evidence and update the current runbook and hashes. A fresh non-author Sol 6.1/xhigh review follows the corrected frozen candidate.

Required outcomes:

1. Unknown, failed or malformed VM observations must never become zero-memory start authorization. Bound read retries; if configuration remains unknown, alert and leave the VM off rather than risk host memory exhaustion.
2. Revalidate state, permitted memory and the relevant non-memory definition after acquiring the mutation lock, including recovery. Preserve intervening changes and avoid persistent-memory writes to a VM restarted by someone else. State the operational exclusion window for host operations that do not share Fleet's lock.
3. Required log/state/backup writes must succeed before disruption. I/O failure after shutdown must preserve recovery while reporting failure through an available alternate host channel. Never report success without publishing the required result.
4. Enforce the documented live/persistent memory matrix and verify live target invariants on initial, no-op and post-arm paths. Refuse unexpected states without forcing a running VM to match.
5. Restore must preserve concurrent destination entries and report unresolved link failures. Cover failed link creation and a directory appearing between check and creation.

Add meaningful regression cases for the exact reproduced failures and retain the original upgrade/disconnect tests. Useful small follow-ups are shared dependency checks and completing guest service checks; no general infrastructure framework is requested.

The 120-second arm window, 2 GiB host reserve, 40-minute clean-shutdown limit, mandatory real-host rehearsal and existing Unraid notification are retained. No additional owner decision is needed for these choices. Direct termination of the independent host runner and shutdown completing after timeout remain explicit owner-side recovery limitations; narrow the broad automatic-recovery claims accordingly. The coordinator inside the guest cannot restart an off VM itself. Do not add force-off or automatic whole-definition restore.

Siltwake remains paused. Correcting and reviewing this script does not establish real-host success: native host approval, detached rehearsal, then actual post-restart resource/service/cgroup/archive verification remain required.
