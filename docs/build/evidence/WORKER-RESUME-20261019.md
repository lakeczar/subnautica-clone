# Worker recovery and game resumption — 2026-10-19

The owner reports the prior upgrade failed, another agent recovered it, and now authorizes continued game work plus RTX 3090 use. Coordinator inspection establishes the current state independently. No game source or VM configuration is changed by this verification.

- Boot ID changed from `82b454b2-8f2e-467f-a9e7-e99c56549a32` to `c64c4bcb-e6fb-47dd-a050-571f3bf86a14`.
- Host factory-worker UUID remains `ce0a610b-0a40-b2eb-1bfb-5a7203a24e22`, running, persistent/autostart enabled, defined/live memory 16,777,216 KiB. Six vCPUs retain pins 0,1,8,9,10,11 and 1 socket/3 cores/2 threads; both original disks remain.
- Guest MemTotal is 16,770,654,208 bytes, six CPUs; 4.1 GiB swap is now present. This coordinator did not create the swap or perform the later recovery.
- `t3code`, `fleet-dashboard-v2`, `fleet-dashboard`, `fleet-status` are active/enabled; linger is on. HTTP :9110/api/health, :9101/status and :9100 pass.
- Agent slice `memory.high=10328203264`, `memory.max=12577988608`, matching T3's current formula and increased from the pre-restart ceilings. No manual ceiling change.
- Original run `20261019T203605Z-d291` ended `shutdown-timeout`/13 after 2,400 seconds waiting for ACPI shutdown, with 12 GiB unchanged. The reviewed postcheck correctly retains a FAIL for that historical run while every current resource/service/cgroup/archive check passes; no WARNs. Do not relabel the original operation successful.
- Archive SHA-256 `188e1a36213ddb7f8ae58af26f4d1ea48280d938835883c4f2a50f37b1c13b1a` verifies. Reviewed `restore-tmp-links.sh --apply` extracted on persistent disk and created 390 missing symlinks, zero collisions/missing/failures. `/tmp/siltwake-art-prototype` Git binding is clean on its original branch. Future bulky artifacts use `/work/tmp` or persistent evidence directories.
- Root checkout remains clean/published at `dc08bba` before this documentation update; game production remains `eb712f1`. Interrupted reviewer/evidence/worktrees persist.

## GPU finding

Guest `lspci -nnk` shows QXL and no NVIDIA device; `nvidia-smi` is absent. Read-only, filtered VM definitions show no factory-worker hostdev. `Debian AI13 Inference` and `Windows 11 Gaming` definitions reference the same host functions `0000:01:00.0`/`.1`; Fleet identifies the card as RTX 3090. Confirm host identity/driver and current users before reassignment. Do not boot the old inference VM casually: historical duplicate job services remain an explicit concern. Preserve all other VMs and their data.

The useful GPU workload is browser/WebGL rendering, capture and any explicitly GPU-capable tools. Opus/Sol use the configured remote providers; TypeScript builds and ordinary Node tests are CPU work. GPU access, driver availability and actual browser renderer must each be verified before claiming acceleration. No GPU setting, driver or browser flag has changed here.

## Next

Dispatch a fresh complete SPACE-1 Sol 6.1/xhigh review with new report/evidence paths, including the old incomplete observations and all original seven criteria. In parallel Opus 5.5/high prepares a coherent GPU enablement bundle and evidence; coordinator/fresh Sol review precede disruptive or host-mutating execution through the established native approval mechanism. Continue authorized M2-B/C/M3/M4 after feature acceptance. Menus remain concise; main merge/public deployment stay with the owner.

Private current receipts: `/home/worker/.local/share/siltwake-checkpoints/vm-upgrade-20261019/resume-{actual-result,actual-log,live-info,helper-help}.txt`, `resume-postcheck.log`, `resume-restore.log`. These preserve the historical failure separately from current successful observations.
