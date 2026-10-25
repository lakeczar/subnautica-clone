# GPU enablement — independent Sol review, round 5

**Verdict: ACCEPT for the controlled execution procedure. No new findings.** The replacement mechanism and pre-shutdown gate are supported by the complete libvirt validation path and the offline checks. The Opus coordinator decides whether to proceed; successful GPU activation remains unproven.

Fresh non-author reviewer: **GPT-6.1 Sol / xhigh**, identified by the injected effective T3 runtime; the live catalog confirms the model. Candidate **`785503cac4350a99d6a35aaec12743f0f7e33b67`**, base **`6cc4bec46bf0744986fe4448d0f78a1c8373a904`**. Reviewed `6cc4bec..785503c`, connected recovery paths, six original criteria, all R1–R4 reports/dispositions, assertion addendum and author corrections. Host SHA-256 matches **`23471a53af8f7ca66f6c659f4c7a7c3c62272f5ffa51ad85ad07b5389fae0271`**.

Private evidence (**E**): `/home/worker/.local/share/siltwake-evidence/gpu-enablement-r5-review/`. Only this report is committed on `review/gpu-enablement-r5`.

## Whole libvirt path

The permitted restricted read of run `20261020T032723Z-ae45` confirms libvirt **12.2.0**, shutdown after 10 seconds, `define` rejecting the reserved name, and **`rolled-back/20`**, running without owned entries. R4's claim that native sysinfo was correct is superseded by this failure. Receipt: `E/live-failure.log`.

**`domxml-to-native` performs the same semantic validation as the actual plain `define`.** Independently fetched upstream **v12.2.0** sources show:

- [`qemuConnectDomainXMLToNative`, `qemu_driver.c:6272`](https://github.com/libvirt/libvirt/blob/v12.2.0/src/qemu/qemu_driver.c#L6272) and [`qemuDomainDefineXMLFlags`, line 6485](https://github.com/libvirt/libvirt/blob/v12.2.0/src/qemu/qemu_driver.c#L6485) both call `virDomainDefParseString` with **INACTIVE | ABI_UPDATE**, without **SKIP_VALIDATE**. `define --validate` additionally requests schema validation; this bundle uses plain `define`.
- [`domain_conf.c:20838–20873`](https://github.com/libvirt/libvirt/blob/v12.2.0/src/conf/domain_conf.c#L20838): `virDomainDefParseString` → `virDomainDefParse` → `virDomainDefParseNode` → **`virDomainDefParseXML` → `virDomainDefPostParse` → `virDomainDefValidate`**, in that order. QEMU post-parse callbacks run through `domain_postparse.c:1418–1488` and `qemu_postparse.c:1861`.
- [`domain_validate.c:2136–2142`](https://github.com/libvirt/libvirt/blob/v12.2.0/src/conf/domain_validate.c#L2136) dispatches `domainValidateCallback`, configured as **`qemuValidateDomainDef`** (`qemu_domain.c:5060–5068`). That reaches **`qemuValidateDomainDefSysinfo`**, which rejects `opt/ovmf/` (`qemu_validate.c:1447`, `1059–1081`). The old target therefore fails here in the new gate, before shutdown.

Conversion creates an unregistered `virDomainObj`, then uses `qemuProcessCreatePretendCmdPrepare/Build` (`qemu_driver.c:6269`, `6300–6307`; `qemu_process.c:9103–9138`). PRETEND avoids real activation/hooks and host preparation. It cannot guarantee later persistence, QEMU startup or firmware behavior.

**The QEMU extension is accepted and preserved.** Parsing registers the namespace and reads values into `namespaceData` (`domain_conf.c:20680–20686`; `qemu_domain.c:3681–3705`, `3960–3983`), separately from sysinfo. `define` → `virDomainDefSave` → secure formatting (`qemu_driver.c:6518`; `domain_conf.c:30484`). Inactive/security-info dump selects the persistent definition and reaches the generic formatter (`qemu_driver.c:6203–6237`; `qemu_domain.c:5649–5665`, `5606`). It emits the namespace on `<domain>` and the extension before `</domain>` (`domain_conf.c:29702`, `30157`; `qemu_domain.c:3991–4006`). Both values survive unchanged in the candidate's canonical block; `qemu_command.c:11076–11086` appends them verbatim. No live round-trip was performed.

`virCommandToString` shell-quotes arguments. `virbuffer.c:551–569` leaves these two fixed arguments unquoted; compact JSON VFIO arguments retain their recognizable host fields (`qemu_command.c:4756–4820`). Thus the gate's matching fits this actual output. All four supplied libvirt source files match the independent downloads; provenance and the additional parser/validator/formatter sources are in `E/sources/` and `identity-and-sources.json`.

## Safety and previous findings

An existing **owned** namespace/block is removed before rebuilding: the focused check rebuilds an attached definition byte-identically, with one namespace, and detaches to the original fixture. Libvirt omits unused namespace declarations. The suite refuses foreign args, env, override, capabilities and file blobs. Detach/rollback remove the owned hostdev pair, exact block and namespace, retaining unrelated valid sysinfo and other content. Each change/undo uses fresh security-info XML; foreign content prevents overwriting it.

Backup, arm/cancel window and boundary check precede the real gate; Fleet's lock is held. The gate runs before shutdown, including in rehearsal. Build/read/conversion/missing-argument failures produce **`preflight-failed/10`**, with no shutdown, define or start. Later boundary/recovery checks remain intact. Direct writers outside Fleet's cooperative lock still require operational exclusion.

The full argv remains in shell variables; successful logging selects only the fixed fw_cfg pair and the two VFIO device arguments. The suite's separate secret object does not appear in run records. No secret leak was found on this sequence; logging the full argv would be unsafe.

**R4-01 (P3) closed:** `tmp_new` tracks the mode-0600 path in the parent shell; normal returns and `finish` call `tmp_clean`. TERM/INT reach `finish`. Reproduction cases “TERM during the define” and “TERM during the gate” leave no temporary file and report `aborted`; the latter never stops the VM. **R3-01 (P3) closed:** the changed-version pending-package case says “left alone” and excludes it from removal, without contradictory wording. No regression found in R1/R2 failed-read, backup, external-edit, locking, recovery, lost-response, package, report/probe or assertion-accounting protections on affected paths.

## Six original criteria

| Criterion | Execution-readiness verdict |
| --- | --- |
| 1. Ownership and bounded changes | **Ready.** Exact extension ownership; foreign content refused; other VM definitions untouched. |
| 2. Survives caller loss | **Ready.** Detached host control, bounded ACPI shutdown and cold allocation remain; gate failures avoid disruption. |
| 3. Approval, integrity and recovery | **Ready.** Hash pinning, checked backup, locks and truthful rollback retained; R4-01 closed. |
| 4. Reproducible guest setup | **Ready.** Existing transaction/retry/version protections retained; R3-01 closed. Driver installation is historical coordinator evidence. |
| 5. GPU-backed browser workflow | **Ready for post-activation verification.** Renderer/draw/production-smoke gates unchanged; hardware success unverified. |
| 6. Operational/game continuity | **Ready as a procedure.** Checkpoint and resumed services remain execution obligations. Worker :9100/:9110 are intentionally disabled baseline, per current STATUS. |

## Checks and limits

- Required suite **once, sequentially**, with the exact requested `systemd-run` properties/unit prefix and **450 s** timeout. `BASH_ENV` verified child cgroup values **805306368 / 1073741824 / 0** before the runner. **Exit 0: 189 host + 64 guest + 5 ask + 39 probe = 297 checks.** Scope is inactive. Receipts: `E/suite.log`, `suite.exit`, `verify-limits.sh`.
- Focused namespace rebuild/removal check: `bash E/check-namespace.sh`, passing; uses unchanged extracted candidate functions and no infrastructure. Receipt: `E/namespace.log`. Suite fixtures exercise the reserved-name rejection, gate ordering/failures, secret exclusion, detach/rollback and TERM cleanup. They simulate infrastructure and do not independently prove daemon behavior.
- Shell/probe syntax and diff whitespace checks pass. No game tests, browser/server launch, live mutation, ask, children, push or PR.

Still required: byte-identical operational placement; a **new approved real rehearsal using this gate**; current prerequisites/backup/checkpoint; approved attach and actual define/security-info round-trip; QEMU boot, OVMF honoring the 64 GiB window and assigned BAR1; NVIDIA loading/device access, actual 3090 draw/readback and production smoke in the same isolated browser; resumed T3/Fleet/:9101 and intentional dashboard baseline, preserved VM/repository identity, and real detach/rollback. No performance, human-play or complete-game acceptance is claimed.
