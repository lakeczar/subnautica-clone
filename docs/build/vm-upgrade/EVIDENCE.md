# VM RAM upgrade bundle — evidence, 2026-10-19

Author: Claude Opus 5.5 / effort high (T3 delegated task; configuration confirmed with `t3_thread_configuration`). The worktree is `t3-a26cd7ba` on branch `t3/prepare-vm-ram-upgrade`, starting clean from Siltwake `522d946a4e937c748a4996eee7a2ba11525cb06f`. No game source was changed and the game suite was not run.

**No VM, host file, ask request, service or resource limit was changed.** Only read-only `unraid-admin` verbs were used: `help`, `status`, `vm info`, `files list`, `ask list`, an `ask result` status line for an earlier request, and an allowlisted `vm xml` read (below). Nothing was staged on the host.

## Reviewed file hashes

| File | SHA-256 |
| --- | --- |
| `vm-ram-upgrade.sh` | `89cce673e35663fb73a68eb5217c92a7fd78545fc07474c8aada9dd74fd3d1d4` |
| `ask-command.sh` | `5ad70fc380656fc865f6c249872b62d0b72bac17cfac7b0131031a01e8504f21` |
| `worker-check.sh` | `d3843bab860bf3124825c1794a5fa8a198f53273adc385af26a9d000860e6c4b` |
| `restore-tmp-links.sh` | `411f5ee8810083fb9f171a792d6a482923cc2f7cd598bf74c3049eb4a846395d` |

`ask-command.sh` pins the first hash into the approved command. If the script changes after review, the hash changes too; recompute it and review again.

## Offline tests

`bash docs/build/vm-upgrade/tests/run.sh` runs the unchanged production script inside bwrap. Scratch folders sit over `/mnt`, `/boot`, `/root` and `/tmp`; a fake `virsh` and Unraid `notify` sit over `/usr/local`. The fake refuses and logs `destroy`, `define`, `undefine` and every other verb outside the plan. Scratch lives under `/work/tmp`, not RAM `/tmp`.

Results are in [evidence/offline-tests.txt](evidence/offline-tests.txt): **131/131 passed**, the same in 6 consecutive runs, about 17 s each.

What the tests cover:

- Default preflight is read-only.
- Fixed-target refusals: another UUID, autostart off, the topology `vm resize` would write, 8 vCPUs, other disks, a missing disk file, no ACPI, paused, unexpected memory.
- Full upgrade: ACPI only, memory-only calls in order, the backup holds the security info, run files hold none, the owner is notified.
- Idempotent re-run.
- Re-entry from every in-between state, including a half-applied change.
- Capacity before the shutdown and before the start.
- Arm-window CANCEL, and changes by someone else during the window (shut off, upgraded, pins, paused).
- Exclusive lock.
- Shutdown timeout with ACPI re-sent and never forced.
- Restart by someone else after shut off; a definition edit while off (started as is, their change kept).
- `setmaxmem` / `setmem` / Fleet-lock failures (memory-only rollback).
- An unexpected non-memory diff: rolled back, the other change kept, never redefined.
- Start retry, start refusal at 16 GiB (rollback), no start at all (`left-off` plus alert).
- Live pin mismatch (`started-unverified`, not stopped again).
- No guest agent.
- TERM mid-wait (`aborted`), then a re-run that finishes without a second shutdown.
- Restore script: dry run, wrong hash, links, collision kept, idempotent.
- T3 cgroup formula.

**The disconnect-independent launch boundary.** The tests run the exact text from `ask-command.sh` through a copy of `approve.sh`'s runner, `( cd /root && timeout N bash -c "$cmd" )`:

- Rehearsal: the launcher returns before the run finishes, the run is in a different session, and the launcher is gone by the end. Nothing was changed and no backup was written.
- Group kill: the runner is kept alive and its `timeout` signals the whole process group mid-shutdown. A SIGHUP goes to the run as well. The run survives and finishes `upgraded`.
- A tampered staged file makes `sha256sum -c` stop the approved command before any code runs.
- `launch` without the right hash refuses.

**Mutations.** Each check below edits `vm-ram-upgrade.sh` once, and the suite must fail. All 12 failed as required:

1. shutdown without `--mode acpi`
2. force-off on timeout
3. rollback by redefining the backup
4. no rollback
5. launch without `setsid`
6. SIGHUP not ignored
7. identity check always passes
8. an upgraded VM not recognised
9. no memory-only diff
10. no capacity check
11. no re-plan after the arm window
12. no identity check after the arm window

`bash -n` passes on all four scripts. `shellcheck` is not installed on this worker, so it was not run.

## Host and guest facts used (read-only, about 13:27–14:00 host time)

- Live `unraid-admin help` is byte-identical to the usage in Fleet `origin/t3/unraid-full-access` 1d6cf7e. That branch's `approve.sh` runs approved commands with `timeout 3600 bash -c`, and its listener uses `setsid`. Only the help text was compared with the live host; the rehearsal checks real behaviour.
- `vm info factory-worker`: UUID `ce0a610b-…4e22`, max/used 12582912 KiB, 6 CPUs, pins 0,1,8,9,10,11, `vdisk1.img`/`vdisk2.img` plus a Debian ISO, autostart enabled. `status`: 12 CPUs, 31 GiB, 10 GiB available, no swap; factory-worker and Hermes running, the other three VMs off.
- `vm xml` piped through an allowlist on the worker. Only memory/CPU/feature/topology/channel/balloon lines were kept, and graphics or password text was never printed or stored. Result: topology `sockets=1 dies=1 clusters=1 cores=3 threads=2`, `<acpi/>`, `nosharepages`, no NUMA/hugepages/maxMemory, guest-agent channel, virtio balloon. Note that the helper's `vm xml` includes `--security-info`, so a VNC password, if one is set, does transit to the caller; this read discarded it.
- Files: `FILE_SHARES` lets `files list /mnt/user/appdata` work, `/mnt/user/appdata/fleet-vm-upgrade` does not exist, and `appdata/fleet` is closed to file verbs. The earlier ask `20261019-113244-59e5` finished `done`, exit 0.
- Guest: logind `HandlePowerKey` default (poweroff), no inhibitors, `qemu-guest-agent` active, `poweroff.target` `JobTimeoutUSec=30min` with `poweroff-force`, `DefaultTimeoutStopUSec=90s`. `/tmp` is 90 % full (5.3 of 5.9 G); `/work` has 121 G free, `/` 24 G. All 390 archived names are currently present in `/tmp`. The archive is 4137226240 bytes.
- T3 agent slice: runtime drop-ins in `/run/user/1000/systemd/user.control/app-t3code-agents.slice.d/`, values from `agentSliceMemoryLimits` in the installed T3 binary (0.0.46-nightly.20261012.3021). `worker-check.sh cgroup-expect 12542808064` reproduces the live 6271401984/9407102976 exactly.
- libvirt `qemuDomainSetMemoryFlags` (current source): lowering the persistent maximum also lowers `cur_balloon`, and `setmem` above the maximum is rejected. The fake behaves the same way, and the rollback depends on this.
- `worker-check.sh pre` run against the real host: all PASS, except "staged script missing" (expected, nothing staged) and a WARN for no rehearsal id.

## Not verified

The live `approve.sh` was not read. The following were not exercised on Unraid: the `setsid`/`flock`/bash-5 behaviour, `virsh shutdown --mode acpi`, `qemu-agent-command` and memory clamping in Unraid's libvirt version, the Unraid `notify` path, a 16 GiB guest boot, and post-boot services. The rehearsal and `worker-check.sh post` exist to close the first part and the last part of that list.
