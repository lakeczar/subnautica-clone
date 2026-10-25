# GPU enablement — independent Sol review, round 2

**Execution-readiness verdict: not ready.** Two correctness gaps remain in recovery: the host can restart from an unreadable definition, and the guest rejects a legitimate retry after a partial DKMS installation. The ordinary offline suite passes. Most R1 corrections are sound; neither this report nor the tests establish working GPU hardware.

Fresh non-author reviewer: **GPT-6.1 Sol, xhigh**, as identified by the effective injected runtime. Frozen candidate: **`c4d5191eb4259da8d8999521881ec8826fb0fc8f`**, directly above R1 base `e1a85c2`, checked out on `review/gpu-enablement-r2` in this reviewer's worktree. Only this report is committed. The claimed host-script SHA-256 **`ea128dfcc742afa2cbaba18511adc0956a578b6b8d66fd8e0e4a033ac02d19bd`** matches; all ten entries in the author's final source manifest independently match.

Scope includes the complete bundle, the original six-criterion brief in the root checkout, R1 report/disposition, correction brief, `a9cbfa1` compound-assertion addendum, resource/model policies, recovery evidence and relevant Fleet guidance. Private evidence (**E**) is `/home/worker/.local/share/siltwake-evidence/gpu-enablement-r2-review/`. Existing author evidence was read without changes.

## Six original criteria

| Criterion | Execution-readiness verdict |
| --- | --- |
| 1. Correct ownership and bounded changes | **Partial; blocked by R2-01.** Exact identity, peer ownership, card prerequisites and whole-definition checks are repeated at transition boundaries. Ordinary attach/detach and preservation checks pass. Unknown recovery configuration can still be started. |
| 2. Transition survives caller loss | **Partial.** Detached execution, bounded ACPI shutdown, cancellation, cold/MMIO rationale and no force-off remain supported. Fleet's lock is acquired before shutdown; ordinary lock/recovery tests pass. R2-01 remains a recovery safety gap; R2-03 is a smaller reporting defect. |
| 3. Approval, integrity and recovery | **Partial; blocked by R2-01.** Restricted native approval, hash-pinned copies, expiration, checked backup and logs are supported. Backups precede shutdown, and the lock order has no reverse acquisition in this bundle. Unreadable recovery state must not authorize a start. |
| 4. Reproducible guest setup | **Partial; blocked by R2-02.** Signed Debian sources, running-kernel headers, graphics-only plan, checked verification exits and read-only undo substantially improve safety. Partial-package retry is still incorrect. |
| 5. Real GPU browser workflow | **Ready for controlled post-activation verification.** Shared T3 preview remains software-only; the isolated workflow now draws/readbacks pixels, checks actual game readiness/rendered frames and canvas content, rejects relevant errors and validates current structured reports. Hardware execution remains unproven. |
| 6. Operational/game continuity | **Ready as a preparation procedure, subject to recovery corrections.** Services/endpoints, durable checkpoint, Fleet placement/discoverability and resource release are explicit. Actual placement, approved transition and resumed-state receipts remain required; no complete-game or performance acceptance follows from smoke. |

## Every R1 finding and the assertion addendum

| Finding | R2 verdict |
| --- | --- |
| R1-01 — failed reads | **Partially closed.** Initial/final reads now fail closed in the tested cases, but post-shutdown recovery still starts after a failed inactive-XML read: R2-01. |
| R1-02 — stale ownership/configuration | **Closed for preparation.** Boundary checks repeat card/peer/memory observations and compare the complete definition apart from hostdevs; peer-start, MAC-change and driver-binding regressions pass. Real libvirt behavior still needs execution checks. |
| R1-03 — invalid backup | **Closed for preparation.** Successful complete identity read, comparison, sync and readback precede disruption; truncated, differing and unwritable backup cases refuse shutdown. Real security-info/plain-XML compatibility remains a rehearsal gate. |
| R1-04 — unsafe guest undo/partial installs | **Partially closed.** Automatic purge is removed, unrelated packages are excluded, and source/transaction records improve. Normal unconfigured-package retry remains broken: R2-02. |
| R1-05 — successful failed-verification exit | **Closed.** Missing driver/build verification returns failure, including after successful fake apt installation. |
| R1-06 — false smoke-report acceptance | **Closed for preparation.** Schema, top-level success, chosen renderer/draw, smoke observations, browser/source/boot/host and age are checked; context-only and old false-success reports are rejected. |
| R1-07 — no rendered-work proof | **Closed for preparation.** Real shader draw/readback replaces context-only proof; game render-loop instrumentation replaces independent rAF counting. Error/readiness/image checks are meaningful. Author's SwiftShader run remains software-only evidence, not an independent hardware test. |
| R1-08 — recovery result/lock handling | **Original cases corrected; partially closed overall.** Busy Fleet lock causes no shutdown, and genuine failed recovery starts report failure. Lost response after a successful boot still produces an incorrect `left-off` outcome: R2-03, non-blocking by itself. |
| R1-09 — journal/QXL gate | **Closed for preparation.** Journal acquisition/start-of-boot and QXL prerequisites now fail when missing or unreadable; existing recovery configuration is preserved. A clean journal still does not guarantee shutdown. |
| R1-10 — fake-tool PATH | **Closed.** Fixed sandbox PATH and explicit fake-tool guards pass independently. Infrastructure calls in the suite resolve to fakes. |
| Compound-assertion addendum | **Closed.** All seven original secondary conditions are now inside `is ... eval`; related new assertions are also checked directly. An exact extracted corrected re-entry assertion with only its secondary condition deliberately failing prints `passed 0`, `failed 1`; the runner's `failed 0` guard returns 1. Historical 104-check coverage remains limited as recorded in the addendum. |

## Remaining findings

### R2-01 — P1, blocking: unreadable post-shutdown definition still authorizes recovery start

`host-gpu.sh:291–307,439–442,483`: a failed `read_cfg` makes `recheck` return false, but the caller sends every failure to `recover_start`, which starts without obtaining a readable current definition. This contradicts the correction report's claim that an unreadable definition after shutdown leaves the VM off. A failed read cannot distinguish the unchanged definition from an external edit, including added host devices.

**Reproduction:** run `bash E/run-targeted-host.sh targeted` (expand E to the private evidence directory). The unchanged candidate runs with fake infrastructure in a network-isolated, read-only-root sandbox. Set `on_shutoff_cmd` to `touch $S/fail_inactive_xml`, then launch attach. Result: **`backed-off/21`, VM running**, with `virsh start` after the failed read. A second case changes the MAC and makes the definition unreadable during shutdown; that unknown definition is also started. No real VM operation ran. Receipts: E `host-targeted.log`, `unreadable-after-shutdown-{run,calls}.log`, `changed-unreadable-{run,calls}.log`.

**Suggested fix:** distinguish an unreadable state/definition from a readable conflict. Require a successful current-definition/hostdev safety check before recovery start; otherwise publish `needs-owner` with the observed state and preserve the definition. Retain recovery for readable external edits. Add this case beside the existing unreadable-after-failed-start regression.

### R2-02 — P2, blocking the documented guest recovery: legitimate partial-install retry is refused

`worker-gpu.sh:61–64,160–167,215–218`: `installed_version` recognizes only fully configured `ii` packages, while `plan_check` recognizes only `Inst`. After a DKMS post-install failure, dpkg normally records `iF`; apt can legitimately repair it with **`Conf nvidia-kernel-dkms (...)`**, without unpacking a new version. The script rejects this as “the apt plan does not install nvidia-kernel-dkms,” before the retry can repair it. The fake partial-install test writes only `ii` rows and misses this state. `undo-plan` also omits such pending packages through the same version helper.

**Reproduction:** E `package-pending-repro.sh` uses the exact candidate helpers and real `apt-get -s`/`dpkg-query` against a private synthetic dpkg database, with all seven requested packages present and DKMS `half-configured`. No network or system package database writes occur. Real apt returns **0**, with one pending package and `Conf nvidia-kernel-dkms`; candidate `plan_check` returns **1**. Receipt: `package-pending.log` and `pkg-state/apt-plan.txt`.

**Suggested fix:** account explicitly for version-matched pending packages and their `Conf` repair actions while retaining upgrade/removal refusal and final module verification. Keep pending package status visible in recovery/undo guidance. Exercise a failed configuration followed by a successful retry, rather than modelling every partial package as already configured.

### R2-03 — P2, non-blocking: `left-off` can describe a running VM

`host-gpu.sh:411–414,439–442`: recovery equates a failed start command with a VM that did not start. A libvirt timeout/lost response can occur after boot. It then attempts another start and emits `left-off/30` even when its own `vm_state` is `running`. The recorded state prevents this from being an execution blocker by itself, but the outcome table and instruction to start it are wrong.

**Reproduction:** run `bash E/run-targeted-host.sh start-response-lost`. The candidate is unchanged; fake start boots normally and then returns nonzero, modelling a lost response. Trigger recovery with a readable MAC change during shutdown. Result: **`left-off/30`, `vm_state: running`**. Receipts: E `start-response-lost.log`, `start-response-lost-{run,calls}.log`; fake extension: `host-sbin/virsh`.

**Suggested fix:** inspect state after any failed start; verify/report an already running VM, distinguish unknown state, and reserve `left-off` for observed `shut off`. Avoid retrying start when already running.

## Checks actually run and remaining execution gates

- **Required suite:** exact requested `systemd-run --user --scope --quiet --unit=siltwake-gpu-r2-review-$$ -p MemoryHigh=768M -p MemoryMax=1G -p MemorySwapMax=0 timeout --kill-after=10s 300s bash docs/build/gpu-enablement/tests/run.sh`. A private `BASH_ENV` hook first verified the child cgroup values: **805306368 / 1073741824 / 0**, then unset itself. Exit **0**: **130 host, 51 guest, 5 ask and 39 probe checks**. E `suite.log`, `verify-cgroup.sh`; scope finished inactive.
- **Targeted checks:** the three reproductions above; corrected compound-assertion accounting; all five archived real domain documents accepted by the new XML envelope check; exact matching accepts the author's real 38-package archive plan and rejects a similar-but-wrong kernel-header name. These are offline checks, not new archive or live-host observations.
- **Integrity/syntax:** all ten author manifest entries match; all eight shell files pass `bash -n`; probe passes `node --check`. Author's final suite, real-archive dry-run and software-functional logs were inspected, not counted as independent reruns.
- One initial reviewer sandbox launch failed because `/evidence` did not exist under the read-only root. It ran no candidate logic; corrected mounts use the existing private evidence path. This was a harness error, not a product failure.

Still **unexecuted**: byte-identical operational Fleet placement and guidance links; native-approved real rehearsal, actual host IDs/binding/group/BAR/framebuffer/memory and backup compatibility; real guest install/module verification; next ACPI shutdown, cold attach/boot and OVMF allocation; NVIDIA module loading, device permissions and `nvidia-smi`; actual 3090 WebGL2 draw/readback and production smoke in that browser; post-transition services, endpoints, VM/repository/evidence identity receipts; VNC behavior and real detach/rollback. Preserve the failed historical RAM run separately from later recovery. No representative 1080p/60, human-play or complete-game claim is made.

No live host inspection was needed. No host/native ask, VM/package/driver/service/browser mutation, game render/full-suite run, browser/server launch, child, push or PR occurred. Private target sandboxes exited; no owned background resource remains. Coordinator inspection and disposition remain separate from this independent verdict.
