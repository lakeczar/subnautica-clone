# factory-worker RAM upgrade: 12 GiB → 16 GiB

**Status: R1 correction prepared and offline-tested only.** No host file, VM, ask request or resource limit has been changed. The first candidate failed independent review ([Sol R1](REVIEW-SOL-R1.md), [disposition](COORDINATOR-R1.md)); [CORRECTION-R1.md](CORRECTION-R1.md) records how each finding was handled. Root inspects this bundle, gets a fresh Sol 6.1/xhigh review, places the operational files on a Fleet feature branch and then follows the procedure below.

## What it changes

Only `<memory>` and `<currentMemory>` in factory-worker's persistent definition, from 12582912 KiB to 16777216 KiB. These stay the same: 6 vCPUs, pins 0,1,8,9,10,11, topology `sockets=1 cores=3 threads=2`, UUID `ce0a610b-0a40-b2eb-1bfb-5a7203a24e22`, disks `vdisk1.img`/`vdisk2.img`, the attached ISO and autostart. Hermes, other VMs, containers and networking are never addressed.

Fleet's `vm resize 6 16 factory-worker` is **not** used. It rewrites the topology to `cores=6 threads=1` even when the count stays the same. The script calls `virsh setmaxmem/setmem --config` on the UUID, then compares the whole definition, memory aside, with the one it checked before the shutdown.

## Why it runs detached on the host

T3, root and this author all run inside factory-worker, so after the shutdown nobody on the worker can issue another command, and nothing on the worker can relaunch the run while the VM is off. The whole sequence is therefore one host-side run: check → record → back up → arm window → ACPI shutdown → (under Fleet's lock) check again → change → start → verify. It is launched once and needs nothing more from its caller.

The approved `ask run` command executes as `( cd /root && timeout 3600 bash -c "$cmd" ) > asks/<id>/output` (Fleet `unraid/approve.sh`). `timeout` signals its whole process group, and a terminal approval belongs to the owner's web-terminal session. So `launch` copies the verified script into the run folder, starts it with `setsid` (new session and process group), closes stdin and sends output to the run's own log. The run also ignores SIGHUP. The launcher returns within seconds. Tests reproduce the runner and show that the run survives a timeout group kill and a SIGHUP; the rehearsal checks the same thing on the real host.

## Files

| File | Where it runs | Purpose |
| --- | --- | --- |
| `vm-ram-upgrade.sh` | Unraid, as root | `preflight` (default, read-only), `launch`, `run`, `status` |
| `ask-command.sh` | worker | prints the exact `ask run` text (hash-pinned) the owner approves |
| `worker-check.sh` | worker | read-only `pre` / `post` checks; `cgroup-expect` |
| `restore-tmp-links.sh` | worker, after boot | archive hash check; optional disk-backed extraction plus `/tmp` symlinks |
| `tests/run.sh` | worker | offline tests in bwrap with a fake `virsh`, `logger` and `notify` |

Host layout. `/mnt/user/appdata/fleet-vm-upgrade/` holds the staged script plus `runs/<RUN_ID>/`: `vm-ram-upgrade.sh`, `launch.json`, `state.json`, `run.log`, `result.json`, `definition-reference.xml` (the definition without its memory lines, as checked before the shutdown), `definition-before/after-*.xml`, and `changed-*.txt` / `unexpected-diff-*.txt` when something else changed the definition. Everything there is readable with `files read`, and none of it contains secrets. The full definition backup, including security info, is written to `/boot/config/fleet/vm-backups/factory-worker-<RUN_ID>.xml`, which is on flash and out of reach of `files read`. The run lock is `/tmp/fleet-vm-ram-upgrade.lock`. Fleet's `/tmp/fleet-admin.lock` is held from just after the shutdown until the VM has been started (see the exclusion window below). Every run also writes one line to the host syslog with tag `fleet-vm-upgrade`.

## Outcomes (`result.json`)

| Outcome | Exit | VM afterwards | What to do |
| --- | --- | --- | --- |
| `upgraded` | 0 | running, 16 GiB, verified | post-boot checks |
| `already-upgraded` | 0 | running, 16 GiB, verified live; **not stopped** | nothing |
| `rehearsal-ok` | 0 | untouched | continue to the real run |
| `preflight-failed` | 10 | untouched | read `message` |
| `locked` | 11 | untouched | another run is active; wait for it |
| `cancelled` | 12 | untouched (CANCEL inside the arm window) | — |
| `shutdown-timeout` | 13 | still running at the deadline, 12 GiB, never forced | owner looks at the VNC console; see limitations |
| `rolled-back-started-old` | 20 | running, 12 GiB (memory-only rollback) | read `run.log` and any `changed-*`/`unexpected-diff-*` |
| `started-as-is`, `restarted-elsewhere` | 21 | running; memory not changed by this run | someone or something else changed the VM, or Fleet's lock stayed busy; inspect |
| `started-unverified` | 22 | running, but not as expected | read `message`; the VM is not stopped again |
| `evidence-incomplete` | 23 | as `vm_outcome` says (the VM part succeeded) | a record after the shutdown could not be written; `evidence_errors` lists which |
| `left-off` | 30 | **off**, or not started because its memory or the host's could not be read | owner starts it (below); alert sent |
| `needs-owner` | 30 | neither running nor shut off (e.g. paused) after the shutdown; nothing done | owner inspects |
| `aborted` | 31 | depends on the phase | launch again; the run continues from the VM's state |
| *(any)*, result not written | 32 | as the notification says | `result.json` could not be published; the outcome is in the Unraid notification and syslog |

Every run ends with an Unraid notification (`normal`, `warning` or `alert`; anything leaving the VM not running is `alert`) and a syslog line. The notification subject starts with the VM outcome and adds `records incomplete` or `result NOT written` when that happened. A success (exit 0) is only reported with every record written and `result.json` published. `worker-check.sh` requires both the outcome and exit code 0.

## Failure and recovery behaviour

**States it handles.** Persistent memory (maximum/current) and running memory, in GiB:

| VM | Defined | Running | Plan |
| --- | --- | --- | --- |
| running | 12/12 or 16/12 | 12/12 | shut down, change, start |
| running | 16/16 | 12/12 | shut down, start |
| running | 16/16 | 16/16 | nothing (`already-upgraded`, after the live checks) |
| shut off | 12/12 or 16/12 | — | change, start |
| shut off | 16/16 | — | start |

16/12 is a change that stopped between its two steps. Every other combination (for example running with 8 GiB, defined 12 but running 16, or a ballooned 16/12 running VM) is refused before anything is stopped. A memory value that cannot be read or is not a number is never taken as zero: before the shutdown the run refuses; after it, see below.

**Fixed target, definition and running VM.** Before the shutdown and at the end of the arm window it checks UUID↔name, persistent, autostart, 6 vCPUs, pins, topology, both disks (and that their files exist), ACPI and no NUMA/hugepages/hotplug in the definition. For a running VM it also checks the running vCPU count, pins (`virsh vcpupin`), topology and disks. That includes the no-op path: a VM already at 16 GiB with other running pins is refused (`preflight-failed`), not reported as upgraded. A read that fails is tried up to 5 times, 3 s apart.

**Before the shutdown** (identity, memory states, capacity, lock, records, backup, CANCEL) it stops and changes nothing. The definition, memory aside, is recorded in `definition-reference.xml` and must still match at the end of the arm window; any edit during the window stops the run. If something else shut the VM off during the window the run carries on without a shutdown; if something else upgraded it, the run checks it and ends `already-upgraded`. Nothing disruptive happens unless every record so far (state, log, reference, backup) was written, the run folder has 10 MiB free and nothing occupies `result.json`.

**Shutdown:** ACPI only, re-sent every 5 minutes, for up to 40 minutes. That is longer than the guest's own 30-minute `poweroff.target` force. If the VM is still running at the deadline, the run exits `shutdown-timeout` without forcing anything and without changing the definition.

**Once the VM is off** the run takes Fleet's lock (waiting up to 120 s) and reads the VM again *after* taking it:

- Running again (someone else started it): `restarted-elsewhere`; memory not written.
- Fleet's lock still busy after 120 s: memory not changed; started as it is.
- Identity, pins, topology, disks or anything else besides memory differs from the recorded reference, or its memory is not one this run expects: memory not changed; started as it is (`changed-while-off.txt` records the difference).
- Otherwise it changes the memory (memory-only, and only if the definition still matches the reference at the moment of writing), checks capacity and starts the VM.
- If the memory change fails, anything besides memory changed during it, 16 GiB will not fit or will not start (after one retry): it reads the VM again and, if it is still off with memory this run set, puts 12 GiB back memory-only and starts it. Another actor's concurrent edit is kept and recorded, never undone.
- It never `virsh define`s the backup and never forces the VM off.

**Starting only with known memory.** Every start (upgrade, rollback or as-is) first reads the definition successfully and checks that host `MemAvailable` covers the defined maximum plus a 2 GiB reserve. If the definition or `MemAvailable` cannot be read after the retries, or the memory does not fit, or the start fails twice, the VM stays off (`left-off`) and the owner is alerted.

**Records after the shutdown.** A write that fails after the shutdown no longer stops anything: the VM is still changed/started or recovered. The result then says `evidence-incomplete` (23) and lists what is missing. If `result.json` itself cannot be written, the run exits 32 and the Unraid notification and syslog carry the outcome.

**Re-entry:** the plan always comes from the VM's current state (table above). A run that ended for any reason can be launched again; it does not stop an already-upgraded VM.

**Capacity:** host `MemAvailable` must cover the 4 GiB growth plus a 2 GiB reserve before the shutdown (about 6 GiB; checked at the start and end of the arm window), and the full defined maximum plus the reserve before any start.

Expected timing: arm 2 min, guest shutdown usually 0.5–2 min (90 s per-unit stop timeout), start a few seconds, guest boot about 1 min. The guest-agent check waits up to 10 min, and `result.json` is written after it finishes.

### Exclusion window (owner)

Fleet's lock serializes only some helper verbs. From submitting the real request until `result.json` (or the notification) arrives, nobody may:

- edit, snapshot or start/stop factory-worker in the Unraid UI;
- run `unraid-admin vm start|shutdown|resize|force-off factory-worker` (these do **not** take Fleet's lock);
- run other host scripts that change factory-worker.

`vm define`, `vm snapshot/revert` and Fleet's file/docker verbs do take the lock and wait for it (or fail after 120 s with "another change is still running") while the run holds it, which is from just after the shutdown until the start. The run reads the VM again after taking the lock, so most interleavings are detected and the run backs off, but it cannot serialize with actors that ignore the lock.

### Limitations that need the owner

- **The run itself is killed** (signal, host reboot, OOM kill) after the VM is off: it records `aborted` if it can and the VM stays off. Nothing on the worker can relaunch it. The owner launches again from the web terminal (below); the new run continues from the VM's state.
- **A late shutdown.** A timeout does not cancel an ACPI shutdown already under way. If the guest powers off after `shutdown-timeout`, it stays off; the owner starts it or launches again.
- **Libvirt definition stability.** The run compares the definition, memory aside, before and after power-off. If Unraid's libvirt formats it differently once off, the run takes the safe branch: no memory change, started as it is (`started-as-is`, `changed-while-off.txt` shows the difference). That would cost a disruptive window but not the VM.
- **Unraid notification failure.** If `notify` itself fails, only the syslog line and the run folder remain. The result is still published when the folder is writable.

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
$H files read $U/vm-ram-upgrade.sh | sha256sum; sha256sum < vm-ram-upgrade.sh   # must match the reviewed hash
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
$H files read $U/runs/<RUN_ID>/run.log
bash worker-check.sh pre <RUN_ID>          # all PASS
```

Accept the rehearsal only if `outcome` is `rehearsal-ok` with `exit_code` 0, `launcher_alive_at_finish` is `"no"`, `sid` differs from `launcher_sid` in `$U/runs/<RUN_ID>/launch.json`, `definition-reference.xml` exists, and `run.log` shows plan `full`, memory available ≥ 6 GiB and no "reading the VM failed" retries. This shows on the real host that a detached run outlives the approval runner, has every tool it needs (including `logger`, `notify` and GNU `mv -T`), reads the definition and running VM the same way twice, writes its folder, takes and releases both locks, and checks the definition comparison. It cannot show the power-off, the memory change or the start.

### 3. Ready the worker (root)

Commit and push the handoff records, and make sure no worker job still needs to run. The real request can be approved at any moment after submission, so **submit it only when the worker may go down**, and only once the owner has agreed to the exclusion window above.

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
$H files read $U/runs/<RUN_ID>/result.json # outcome "upgraded", exit_code 0
$H files read $U/runs/<RUN_ID>/run.log
bash worker-check.sh post <RUN_ID>         # 16 GiB/6 vCPUs/pins/disks, T3 and fleet services active and enabled, linger, :9100, :9110/api/health, :9101/status, cgroups, archive hash
bash restore-tmp-links.sh                  # check only: archive hash and what is missing from /tmp
bash restore-tmp-links.sh --apply          # only if historical /tmp paths are needed
git -C /tmp/siltwake-art-prototype status  # after --apply: the prototype's Git binding
```

`restore-tmp-links.sh --apply` extracts once into `…/vm-upgrade-20261019/tmp-restored` on disk (needs about 5 GiB free on `/`; 24 GiB is free today). It symlinks only names missing from `/tmp` (`ln -sT`, so it never links inside a folder that appears meanwhile). Existing or newly appearing entries are reported and left alone; a link it cannot make is reported and makes it exit 1. Then, on the Fleet branch: `machines.yaml` `ram_gib: 16`, plus the `docs/STATE.md` worker row and Unraid-access row.

**Agent cgroup ceilings.** These are not copied over the reboot. T3 0.0.46-nightly.20261012.3021 sets them at runtime as `high = max(total − 6 GiB, total/2)` and `max = max(total − 4 GiB, 0.75·total)`. That formula reproduces today's 6271401984/9407102976 exactly. At 16 GiB (MemTotal ≈ 16.77 GB) expect about 10.33 GB high (9.6 GiB) and 12.58 GB max (11.7 GiB). `worker-check.sh post` compares the actual values with this formula and only warns if they differ or the slice is not there yet. **Inspect any WARN before accepting**: it is a manual checkpoint, not proof the ceilings rose. No limit change is proposed.

## Owner-side commands (Unraid web terminal, as root)

If the `ask` route is unavailable, launching from the web terminal is equivalent. Paste exactly the text root gives you from `bash ask-command.sh` (the hash is pinned). The run detaches, so the terminal can be closed.

```bash
bash /mnt/user/appdata/fleet-vm-upgrade/vm-ram-upgrade.sh              # preflight, read-only
bash /mnt/user/appdata/fleet-vm-upgrade/vm-ram-upgrade.sh status       # latest run
tail -f /mnt/user/appdata/fleet-vm-upgrade/runs/<RUN_ID>/run.log
grep fleet-vm-upgrade /var/log/syslog                                  # outcome, even if the run folder failed
```

- `left-off`: check `virsh dominfo factory-worker`, `virsh dumpxml --inactive factory-worker | grep -i memory` and `free -m`, then start it from the VM page or with `virsh start factory-worker`.
- `needs-owner`: the VM is paused or in another unusual state; look at it in the VM page.
- `shutdown-timeout`: the VM was still running at the deadline. Look at its VNC console for what is holding the shutdown. Forcing it off is your decision; the script never does it. If it powers off later, start it or launch again.
- `aborted`, exit 32, or unclear: launch again with the same approved text. It continues from the VM's state and does not stop an already-upgraded VM.
- Manual memory-only revert while the VM is off: `virsh setmaxmem factory-worker 12582912 --config` (this lowers current memory too; confirm with `virsh dumpxml --inactive factory-worker | grep -i memory`).
- Last resort only: `virsh define /boot/config/fleet/vm-backups/factory-worker-<RUN_ID>.xml` restores the whole pre-run definition. It also undoes any other definition change made since.

## Verified versus assumed (2026-10-19, read-only)

Verified:

- `unraid-admin help` matches the usage text of Fleet branch `origin/t3/unraid-full-access` (1d6cf7e) byte for byte. `approve.sh` and the listener source were read from that branch. On that branch Fleet's lock is taken by `vm define/delete/disk-create/snapshot/revert`, docker changes and file writes, **not** by `vm start/shutdown/resize/force-off`.
- `appdata` is open to file verbs (`FILE_SHARES` covers it), `fleet-vm-upgrade` does not exist yet, and a previous `ask run` finished with exit 0.
- `vm info` gave UUID, 12582912 KiB max/used, 6 CPUs, pins, both vdisks plus the ISO, and autostart enabled. `status` showed 31 GiB total, 10 GiB available, no swap, factory-worker and Hermes running, the other VMs off.
- An allowlisted read of `vm xml` (no graphics or password lines kept or printed) gave the topology `1/1/1/3/2`, `<acpi/>`, `memoryBacking nosharepages`, no NUMA/hugepages/maxMemory, a guest-agent channel and a virtio memballoon.
- Guest: `HandlePowerKey` is the default (poweroff), no inhibitors, `qemu-guest-agent` is active, `poweroff.target` has a 30 min timeout followed by `poweroff-force`, and `DefaultTimeoutStopUSec` is 90 s. `t3code`, `fleet-dashboard-v2`, `fleet-dashboard` (:9100) and `fleet-status` (:9101) are enabled and active, and lingering is on.
- T3 slice formula: read from the installed binary, and it matches the live values.
- libvirt (`qemu_driver.c`, current source): `setmaxmem --config` lowers `cur_balloon` with the maximum; `setmem` above the maximum is rejected.
- Offline: see [CORRECTION-R1.md](CORRECTION-R1.md) for the current suite, the run against the original scripts and the mutation trials. The first candidate's numbers in [EVIDENCE.md](EVIDENCE.md) are historical.

Assumed (the rehearsal and preflight check the first four on the real host):

- The live `approve.sh` and `fleet-admin.sh` behave like the branch copies (only the help text was compared).
- Unraid has bash ≥ 5, `setsid`, `flock`, `timeout`, `sha256sum`, `logger`, GNU `mktemp`/`mv -T`, `ps -o sid` and `/usr/local/emhttp/webGui/scripts/notify`. A run checks all of them before doing anything.
- `virsh shutdown --mode acpi`, `qemu-agent-command --timeout` and memory clamping behave in Unraid's libvirt version as in current libvirt; running `virsh dumpxml` shows the running memory, topology and disks; `virsh vcpupin` on a running VM shows its live pins.
- `virsh dumpxml --inactive` gives the same text, memory aside, while the VM runs and once it is off (see limitations for what happens if not).
- The guest boots normally with 16 GiB. If it boots but services fail, the host run still reports `upgraded`; `worker-check.sh post` catches that, and stopping the VM again is a separate owner decision.
- The owner receives the approval notification. If not, use the terminal path.

## Decisions (coordinator, R1)

- Arm window 120 s, host reserve 2 GiB, clean-shutdown limit 40 minutes, no force-off: kept.
- The real detached rehearsal is mandatory before the real run.
- Unraid's own notification (plus syslog) is the end-of-run channel; no ntfy integration.
- No automatic whole-definition restore.

## Recommendations

- **Build temp directory.** Use `/work/tmp` (on the 147 GB disk, already present) for bulky build, test and browser output per command or project script, for example `TMPDIR=/work/tmp <command>`. Do not resize `/tmp` or set `TMPDIR` system-wide: T3, systemd and sockets expect `/tmp`, and a global change is broader than this window needs.
- **Fleet follow-up (separate PR):** make `vm resize` keep the existing topology when the vCPU count does not change, or add a memory-only verb; and consider taking Fleet's lock in `vm start/shutdown/resize` too. Also record in `docs/STATE.md` that the live helper is wider than `main`.
- **Later:** an off-VM backup of `/home` and `/work`. The `/tmp` archive is still on the same disk.
