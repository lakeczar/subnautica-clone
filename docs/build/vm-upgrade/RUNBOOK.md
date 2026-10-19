# factory-worker RAM upgrade: 12 GiB → 16 GiB

**Status: prepared and offline-tested only.** No host file, VM, ask request or resource limit has been changed. Root reviews this bundle, gets a fresh Sol 6.1/xhigh review, places the operational files on a Fleet feature branch and then follows the procedure below.

## What it changes

Only `<memory>` and `<currentMemory>` in factory-worker's persistent definition, from 12582912 KiB to 16777216 KiB. These stay the same: 6 vCPUs, pins 0,1,8,9,10,11, topology `sockets=1 cores=3 threads=2`, UUID `ce0a610b-0a40-b2eb-1bfb-5a7203a24e22`, disks `vdisk1.img`/`vdisk2.img`, the attached ISO and autostart. Hermes, other VMs, containers and networking are never addressed.

Fleet's `vm resize 6 16 factory-worker` is **not** used. It rewrites the topology to `cores=6 threads=1` even when the count stays the same. The script calls `virsh setmaxmem/setmem --config` on the UUID, then diffs the definition to prove nothing else moved.

## Why it runs detached on the host

T3, root and this author all run inside factory-worker, so after the shutdown nobody on the worker can issue another command. The whole sequence is therefore one host-side run: check → back up → arm window → ACPI shutdown → change → start → verify. It is launched once and needs nothing more from its caller.

The approved `ask run` command executes as `( cd /root && timeout 3600 bash -c "$cmd" ) > asks/<id>/output` (Fleet `unraid/approve.sh`). `timeout` signals its whole process group, and a terminal approval belongs to the owner's web-terminal session. So `launch` copies the verified script into the run folder, starts it with `setsid` (new session and process group), closes stdin and sends output to the run's own log. The run also ignores SIGHUP. The launcher returns within seconds. Tests reproduce the runner and show that the run survives a timeout group kill and a SIGHUP; the rehearsal checks the same thing on the real host.

## Files

| File | Where it runs | Purpose |
| --- | --- | --- |
| `vm-ram-upgrade.sh` | Unraid, as root | `preflight` (default, read-only), `launch`, `run`, `status` |
| `ask-command.sh` | worker | prints the exact `ask run` text (hash-pinned) the owner approves |
| `worker-check.sh` | worker | read-only `pre` / `post` checks; `cgroup-expect` |
| `restore-tmp-links.sh` | worker, after boot | archive hash check; optional disk-backed extraction plus `/tmp` symlinks |
| `tests/run.sh` | worker | offline tests in bwrap with a fake `virsh` |

Host layout. `/mnt/user/appdata/fleet-vm-upgrade/` holds the staged script plus `runs/<RUN_ID>/{vm-ram-upgrade.sh, launch.json, state.json, run.log, result.json, definition-*.xml}`. Everything there is readable with `files read`, and none of it contains secrets. The full definition backup, including security info, is written to `/boot/config/fleet/vm-backups/factory-worker-<RUN_ID>.xml`, which is on flash and out of reach of `files read`. The run lock is `/tmp/fleet-vm-ram-upgrade.lock`; the definition change also takes Fleet's `/tmp/fleet-admin.lock`.

## Outcomes (`result.json`)

| Outcome | Exit | VM afterwards | What to do |
| --- | --- | --- | --- |
| `upgraded` | 0 | running, 16 GiB | post-boot checks |
| `already-upgraded` | 0 | running, 16 GiB; **not stopped** | nothing |
| `rehearsal-ok` | 0 | untouched | continue to the real run |
| `preflight-failed` | 10 | untouched | read `message` |
| `locked` | 11 | untouched | another run is active; wait for it |
| `cancelled` | 12 | untouched (CANCEL inside the arm window) | — |
| `shutdown-timeout` | 13 | still running, 12 GiB, never forced | owner looks at the VNC console |
| `rolled-back-started-old` | 20 | running, 12 GiB (memory-only rollback) | read `run.log` and `unexpected-diff-*.txt` |
| `started-as-is`, `restarted-elsewhere` | 21 | running; memory not changed by this run | someone or something else changed the VM; inspect |
| `started-unverified` | 22 | running, but not as expected | read `message`; the VM is not stopped again |
| `left-off` | 30 | **shut off** | owner starts it (below); Unraid alert sent |
| `aborted` | 31 | depends on the phase | launch again; the run continues from the VM's state |

Every run ends with an Unraid notification (`normal`, `warning` or `alert`).

## Failure and recovery behaviour

- **Before the shutdown** (identity, capacity, lock, backup, CANCEL): it stops and changes nothing. The fixed target is checked at the start and again at the end of the arm window. At that point the run re-plans: if something else shut the VM off it carries on without a shutdown, and if something else already upgraded it, the run ends `already-upgraded`.
- **Shutdown:** ACPI only, re-sent every 5 minutes, for up to 40 minutes. That is longer than the guest's own 30-minute `poweroff.target` force. If the VM is still running at the deadline, the run exits `shutdown-timeout` without forcing anything and without changing the definition.
- **Once the VM is off,** every failure path tries to start it again:
  - If something else already started it, the run stops (`restarted-elsewhere`).
  - If the definition changed while it was off (pins, disks, …), the run leaves memory alone and starts it as it is.
  - If the memory change fails, or anything besides memory changed, or 16 GiB will not fit or will not start (after one retry), the run puts 12 GiB back **memory-only** under the Fleet lock and starts the VM.
  - It never `virsh define`s the backup, so an unrelated concurrent change is not undone; the difference is logged instead.
  - If even 12 GiB will not fit in host memory, or the VM will not start, it stays off (`left-off`) and the owner is alerted.
- **Re-entry:** the plan comes from the VM's current state. Running at 16 GiB means nothing to do. Off at 12 GiB means change and start. Off at 16 GiB means start only. 16 GiB defined but running at 12 means a restart. A half-applied change (maximum 16, current 12) is treated as unchanged. Every other state is refused. A run killed at any point can simply be launched again.
- **Capacity:** host `MemAvailable` must cover the growth plus a 2 GiB reserve before the shutdown (about 6 GiB today), and the full 16 GiB plus the reserve before the start.

Expected timing: arm 2 min, guest shutdown usually 0.5–2 min (90 s per-unit stop timeout), start a few seconds, guest boot about 1 min. The guest-agent check waits up to 10 min, and `result.json` is written after it finishes.

## Procedure

`H` is the existing restricted route. No new credentials are needed.

```bash
H='ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=yes unraid-admin'
U=/mnt/user/appdata/fleet-vm-upgrade
cd <bundle directory>   # where vm-ram-upgrade.sh and ask-command.sh are
```

### 1. Stage (root, no approval needed)

```bash
$H files write $U/vm-ram-upgrade.sh < vm-ram-upgrade.sh
$H files read $U/vm-ram-upgrade.sh | sha256sum; sha256sum < vm-ram-upgrade.sh   # must match
```

### 2. Rehearsal (owner approval 1 of 2; changes nothing)

```bash
bash ask-command.sh --rehearsal            # the exact text the owner will see
$H "ask run $(bash ask-command.sh --rehearsal)"   # -> Request <ASK_ID> is waiting for the owner
```

The owner checks the command and taps **Approve** on the phone notification, or runs `bash /boot/config/fleet/approve.sh <ASK_ID>` in the Unraid web terminal and answers `y`. Then:

```bash
$H ask result <ASK_ID>                     # status: done, exit code: 0, "Launched run <RUN_ID> ..."
sleep 120; $H files read $U/runs/<RUN_ID>/result.json
bash worker-check.sh pre <RUN_ID>          # all PASS
```

Accept the rehearsal only if `outcome` is `rehearsal-ok`, `launcher_alive_at_finish` is `"no"`, `sid` differs from `launcher_sid` in `$U/runs/<RUN_ID>/launch.json`, and `run.log` shows plan `full` and memory available ≥ 6 GiB. This shows on the real host that a detached run outlives the approval runner and can read the VM, write its folder and take the lock.

### 3. Ready the worker (root)

Commit and push the handoff records, and make sure no worker job still needs to run. The real request can be approved at any moment after submission, so **submit it only when the worker may go down.** Do not edit or snapshot factory-worker in the Unraid UI during the window: an Unraid snapshot switches its disks to overlay files, and the script would refuse or start it as it is.

### 4. Real run (owner approval 2 of 2)

```bash
$H "ask run $(bash ask-command.sh)"        # -> <ASK_ID>
$H ask result <ASK_ID>                     # after approval: Launched run <RUN_ID>
$H files read $U/runs/<RUN_ID>/state.json  # phase "armed": the shutdown follows 120 s after launch
# To stop it before the shutdown, inside those 120 s:
echo cancel | $H files write $U/runs/<RUN_ID>/CANCEL
```

After the arm window the worker shuts down and this session ends.

### 5. After the VM is back (a new root session)

```bash
$H files list $U/runs                      # the newest RUN_ID, if it was not recorded
$H files read $U/runs/<RUN_ID>/result.json # outcome "upgraded"
$H files read $U/runs/<RUN_ID>/run.log
bash worker-check.sh post <RUN_ID>         # 16 GiB/6 vCPUs/pins/disks, T3 and fleet services, :9110/api/health, :9101/status, cgroups, archive hash
bash restore-tmp-links.sh                  # check only: archive hash and what is missing from /tmp
bash restore-tmp-links.sh --apply          # only if historical /tmp paths are needed
git -C /tmp/siltwake-art-prototype status  # after --apply: the prototype's Git binding
```

`restore-tmp-links.sh --apply` extracts once into `…/vm-upgrade-20261019/tmp-restored` on disk (needs about 5 GiB free on `/`; 24 GiB is free today). It symlinks only names missing from `/tmp`; existing entries are reported and left alone. Then, on the Fleet branch: `machines.yaml` `ram_gib: 16`, plus the `docs/STATE.md` worker row and Unraid-access row.

**Agent cgroup ceilings.** These are not copied over the reboot. T3 0.0.46-nightly.20261012.3021 sets them at runtime as `high = max(total − 6 GiB, total/2)` and `max = max(total − 4 GiB, 0.75·total)`. That formula reproduces today's 6271401984/9407102976 exactly. At 16 GiB (MemTotal ≈ 16.77 GB) expect about 10.33 GB high (9.6 GiB) and 12.58 GB max (11.7 GiB). `worker-check.sh post` compares the actual values with this formula and only warns if they differ. No limit change is proposed.

## Owner-side commands (Unraid web terminal, as root)

If the `ask` route is unavailable, launching from the web terminal is equivalent. Paste exactly the text root gives you from `bash ask-command.sh` (the hash is pinned). The run detaches, so the terminal can be closed.

```bash
bash /mnt/user/appdata/fleet-vm-upgrade/vm-ram-upgrade.sh              # preflight, read-only
bash /mnt/user/appdata/fleet-vm-upgrade/vm-ram-upgrade.sh status       # latest run
tail -f /mnt/user/appdata/fleet-vm-upgrade/runs/<RUN_ID>/run.log
```

- `left-off`: check `virsh dominfo factory-worker` and `free -m`, then start it from the VM page or with `virsh start factory-worker`.
- `shutdown-timeout`: the VM is still running. Look at its VNC console for what is holding the shutdown. Forcing it off is your decision; the script never does it.
- `aborted` or unclear: launch again. It continues from the VM's state and does not stop an already-upgraded VM.
- Manual memory-only revert while the VM is off: `virsh setmaxmem factory-worker 12582912 --config` (this lowers current memory too; confirm with `virsh dumpxml --inactive factory-worker | grep -i memory`).
- Last resort only: `virsh define /boot/config/fleet/vm-backups/factory-worker-<RUN_ID>.xml` restores the whole pre-run definition. It also undoes any other definition change made since.

## Verified versus assumed (2026-10-19, read-only)

Verified:

- `unraid-admin help` matches the usage text of Fleet branch `origin/t3/unraid-full-access` (1d6cf7e) byte for byte. `approve.sh` and the listener source were read from that branch.
- `appdata` is open to file verbs (`FILE_SHARES` covers it), `fleet-vm-upgrade` does not exist yet, and a previous `ask run` finished with exit 0.
- `vm info` gave UUID, 12582912 KiB max/used, 6 CPUs, pins, both vdisks plus the ISO, and autostart enabled. `status` showed 31 GiB total, 10 GiB available, no swap, factory-worker and Hermes running, the other VMs off.
- An allowlisted read of `vm xml` (no graphics or password lines kept or printed) gave the topology `1/1/1/3/2`, `<acpi/>`, `memoryBacking nosharepages`, no NUMA/hugepages/maxMemory, a guest-agent channel and a virtio memballoon.
- Guest: `HandlePowerKey` is the default (poweroff), no inhibitors, `qemu-guest-agent` is active, `poweroff.target` has a 30 min timeout followed by `poweroff-force`, and `DefaultTimeoutStopUSec` is 90 s.
- T3 slice formula: read from the installed binary, and it matches the live values.
- libvirt (`qemu_driver.c`, current source): `setmaxmem --config` lowers `cur_balloon` with the maximum; `setmem` above the maximum is rejected.
- Offline: 131/131 checks, 6 consecutive passing runs, and 12 deliberate script mutations all caught. See [EVIDENCE.md](EVIDENCE.md).

Assumed (the rehearsal and preflight check the first four on the real host):

- The live `approve.sh` behaves like the branch copy (only its help text was compared).
- Unraid has bash ≥ 5, `setsid`, `flock`, `timeout`, `sha256sum`, `ps -o sid` and `/usr/local/emhttp/webGui/scripts/notify`.
- `virsh shutdown --mode acpi`, `qemu-agent-command --timeout` and memory clamping behave in Unraid's libvirt version as in current libvirt.
- The guest boots normally with 16 GiB. If it boots but services fail, the host run still reports `upgraded`; `worker-check.sh post` catches that, and stopping the VM again is a separate owner decision.
- The owner receives the approval notification. If not, use the terminal path.

## Recommendations

- **Build temp directory.** Use `/work/tmp` (on the 147 GB disk, already present) for bulky build, test and browser output per command or project script, for example `TMPDIR=/work/tmp <command>`. Do not resize `/tmp` or set `TMPDIR` system-wide: T3, systemd and sockets expect `/tmp`, and a global change is broader than this window needs.
- **Fleet follow-up (separate PR):** make `vm resize` keep the existing topology when the vCPU count does not change, or add a memory-only verb. Also record in `docs/STATE.md` that the live helper is wider than `main`.
- **Optional:** phone (ntfy) notification at the end of a run. It was left out so this script does not read Fleet's notification configuration; Unraid's own notification is sent.
- **Later:** an off-VM backup of `/home` and `/work`. The `/tmp` archive is still on the same disk.

## Open questions for root/owner

1. Are the arm window (120 s), the 2 GiB host reserve and the 40-minute shutdown limit acceptable?
2. Should the rehearsal be skipped? Not recommended: it is the only real-host proof of detachment.
3. Should the end-of-run phone notification also go through ntfy (see above)?
