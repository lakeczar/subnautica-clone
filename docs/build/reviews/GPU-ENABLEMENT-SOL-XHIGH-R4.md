# GPU enablement — independent Sol review, round 4

**Execution-readiness verdict: ready-with-minor-fixes; ACCEPT for the controlled procedure.** No blocking defect found in `6cc4bec`. The MMIO mechanism and full-definition update are supported by source inspection and offline checks. Working hardware remains unproven. The Opus coordinator decides whether to proceed.

Fresh non-author reviewer: **GPT-6.1 Sol / xhigh**, identified by the injected effective T3 runtime. Candidate: **`6cc4bec46bf0744986fe4448d0f78a1c8373a904`**; reviewed diff: `8d6dba9..6cc4bec`. Branch: `review/gpu-enablement-r4`. Claimed host SHA-256 **`ca097451d38937001f3ce7a3a97adbe33631b7b04f45a7a96708a5fcf8535c6b`** matches; all ten author manifest entries match. Only this report is committed.

Scope includes the six original criteria, all R1–R3 reports/dispositions and assertion addendum in the root checkout, candidate source and author evidence. Private evidence (**E**): `/home/worker/.local/share/siltwake-evidence/gpu-enablement-r4-review/`.

## Mechanism and definition safety

The allowed read of real run `20261020T003504Z-f08a` confirms **`preflight-failed/10` before mutation**, BAR1 32 GiB and total prefetchable-64 memory 33,587,200 KiB. Independent guest reads confirm 39 physical bits and the existing root window `7000000000-77ffffffff` (32 GiB). Receipts: `E/real-rehearsal.log`, `guest-baseline.txt`.

**The native libvirt mechanism is correct at source level.** Independently fetched upstream **libvirt v12.2.0** `qemu_command.c` and `virsysinfo.c` exactly match the saved author copies. `virSysinfoParseFWCfgDef` accepts the named string entry; the formatter keeps its one-line representation; `qemuBuildSysinfoCommandLine` emits exactly **`-fw_cfg name=opt/ovmf/X-PciMmio64Mb,string=65536`**. This is independent of SMBIOS mode and needs no QEMU namespace. Sources and provenance: `E/sources/`, `source-fetch.json`. No real daemon `domxml-to-native` or define was executed.

Both the saved modern edk2 source and independently fetched **edk2-stable202202** and **edk2-stable202502** implementations read this knob as decimal MiB. The older implementation directly replaces the default size; the newer implementation additionally suppresses dynamic sizing through the override flag. The guest's DMI date `02/02/2022` does **not** identify its exact firmware binary. That binary honouring the setting remains a real-boot postcheck.

**Sizing is sufficient for this fixed card/topology.** Card plus margin is 34,848 MiB, rounded to 65,536 MiB. edk2 packs the 32 GiB and 32 MiB children before rounding the bridge length to its existing 1 MiB alignment, then raises its base alignment; it does not first round that bridge length to 64 GiB. The other five 256 MiB paddings fit comfortably. The script's conservative RAM-top estimate is 20 GiB, giving an aligned interval `[64,128)` GiB, below the 39-bit limit of 512 GiB. Actual placement also depends on firmware/reserved-memory handling; this is a check for the captured 16 GiB, host-passthrough definition, not a general capacity model for future memory-hotplug layouts. Receipt: `E/fit.txt`.

**Full define is sufficiently atomic while shut off.** In v12.2.0, `qemuDomainDefineXMLFlags` parses the complete definition, replaces it under the domain object lock and restores its old in-memory definition if saving fails. `virDomainDefSave` uses secure formatting; `virXMLSaveFile` uses mode 0600 and `virFileRewrite` writes, fsyncs and renames the new file. This avoids an intermediate persistent state containing only half the owned change. Existing UUID, disks, CPU, network, NVRAM and autostart identity are preserved; the script never undefines the domain.

Every update/undo takes a **fresh security-info** definition and changes only the owned entries. Focused fake-infrastructure cases preserve a simulated VNC password through attach, detach, failed GPU boot, failed detach and undo. A password changed during shutdown is kept from the current definition. Normal temporary inputs are UID 0/mode 0600 and removed; logs, results and nonsecure XML records contain no test password. A failed current security-info read causes no define. These establish script behaviour, not a real libvirt password round-trip.

The verified backup still precedes disruption. Fleet's cooperative lock remains held from before shutdown through definition changes, rollback/recovery and start. Ordinary definition changes after backup fail the boundary comparison; automatic undo never restores the whole stale backup. Direct Unraid-editor or unrestricted libvirt writes do not participate in that lock: coordinated exclusion of those writers is still necessary because full define has no compare-and-swap protection.

Re-serialization differences fail the non-owned comparison. The focused whitespace-only case removes our pair, preserves the password, records the remaining difference and returns **`rolled-back/20`**, running without the GPU. It never claims attached. Foreign fw_cfg/file entries, duplicate/unexpected owned sets and QEMU extensions are refused; a foreign fw_cfg arriving during shutdown produces **`needs-owner/30`** with no define/start. Detach removes the two sources and this numeric fw_cfg entry together, preserving everything else in the accepted definition.

The guest BAR1 check is meaningful: it requires a nonzero assigned prefetchable BAR inside an actual top-level root window read as root. It does not require Linux's ACPI window length to equal the configured firmware aperture. Together with the unchanged NVIDIA, device-access and rendered-work checks, it detects the relevant allocation failure. A visible fw_cfg value proves delivery, not that firmware used it; absence is reasonably a warning when BAR placement succeeds.

## Non-blocking findings

**R4-01 — P3: interruption can leave the security-info temporary file.** At `host-gpu.sh:461–463`, cleanup occurs only after `vdo define` returns normally. The existing TERM/INT trap exits through `finish`, bypassing `rm`. A TERM during the fake define reproducibly leaves `/tmp/fleet-gpu-define.*`, UID 0/mode 0600, with the test password; result is truthfully **`aborted/31`**, shut off. No credential is exposed in logs/results. Track the temporary path in exit cleanup so catchable interruption also removes it. Root-only permissions and exclusion from the restricted file-reading route make this cleanup issue non-blocking.

**Reproduction:** `bash E/run-extra.sh` (expand E above), specifically the final `interrupted-temp` case. It sends TERM to the detached run PID from the fake define hook. Receipts: `E/extra.log`, `extra/cases/interrupted-temp/`. The supplied wrapper isolates all host mutations; no real infrastructure is used.

**R3-01 — P3, retained:** the misleading pending-package inclusion warning remains at `worker-gpu.sh:291`; its removal command remains safe. The prior coordinator deferral stands. No other closed R1–R3 objection regressed on the touched paths: failed reads/backups, external edits, locks, recovery-state checks and lost-start-response handling remain covered; guest retry, probe and assertion-accounting closures are retained.

## Six original criteria

| Criterion | Execution-readiness verdict |
| --- | --- |
| 1. Ownership and bounded changes | **Ready.** Ownership includes fw_cfg; foreign entries fail closed. Other VM definitions remain untouched. |
| 2. Survives caller loss | **Ready.** Detached control, bounded ACPI shutdown, cold allocation and QXL recovery remain intact. |
| 3. Approval, integrity and recovery | **Ready, with minor R4-01.** Hash pinning, backups, locks, secure define input and truthful recovery remain supported. |
| 4. Reproducible guest setup | **Ready, with retained minor R3-01.** Existing package/version/retry protections remain effective. |
| 5. GPU-backed browser workflow | **Ready for post-activation verification.** Added BAR containment complements the unchanged renderer/draw/game-smoke gates. |
| 6. Operational/game continuity | **Ready as a procedure.** Checkpoint, Fleet placement, resumed services/endpoints and resource release remain execution obligations. |

## Checks and unexecuted postchecks

- Ran the requested shell suite **once**, sequentially, with the exact `systemd-run` properties, unit prefix and **400 s** timeout. A `BASH_ENV` hook first verified the child limits: **805306368 / 1073741824 / 0** for high/max/swap. Exit **0**: **162 host + 63 guest + 5 ask + 39 probe = 269 checks**. Receipt: `E/suite.log`.
- Afterwards, the focused network-isolated, read-only-root host sandbox passed **16 checks**, including the guard and the interruption reproduction. Candidate production scripts were unchanged; only infrastructure/redaction was simulated. Same memory ceilings, 160 s timeout. Receipt: `E/extra.log`; preparation and reusable runner are in E.
- All ten manifest hashes, eight shell syntax checks, probe syntax and diff whitespace pass. Both reviewer scopes are inactive. Independent live reads were limited to the restricted helper's help/run log and guest firmware/CPU/root-window facts.

Still **unexecuted**: byte-identical placement of this revised bundle in Fleet/on host and a new approved passing rehearsal; current host prerequisites, valid backup and coordinated durable work checkpoint; real guest install/DKMS verification; next ACPI shutdown, actual native sysinfo/command-line and security-info round-trip, OVMF aperture/BAR1 allocation and guest boot; NVIDIA module loading, device permissions and `nvidia-smi`; actual 3090 WebGL2 draw/readback and production-game smoke through the same isolated browser; VNC/framebuffer behaviour, resumed T3/Fleet services and :9100/:9110 health/:9101 status, unchanged VM/repository/evidence identity, and real detach/rollback. The failed rehearsal is not a passing execution gate. Representative 1080p/60, human play and full-game acceptance remain unproven.

No live mutation, ask, game test, browser/server launch, production edit, child, push or PR occurred. Private sandboxes exited; the simulated interrupted temporary file was removed. Coordinator inspection and execution decisions remain separate.
