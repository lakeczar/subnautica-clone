# GPU enablement — independent Sol review, round 3

**Execution-readiness verdict: ready-with-minor-fixes.** R2-01, R2-02 and R2-03 are closed. No blocking regression was found. One undo warning needs clearer wording; the removal command itself remains correct. This is readiness for the controlled operator procedure, not evidence of working GPU hardware. The Opus coordinator makes the final decision.

Fresh non-author reviewer: **GPT-6.1 Sol, xhigh**, confirmed by the injected effective T3 runtime. Candidate: **`8d6dba92505c229336a22fb1b7da288ee4dd2afa`**, above `c4d5191eb4259da8d8999521881ec8826fb0fc8f` and `e1a85c2`. Review branch: `review/gpu-enablement-r3`. Only this report is committed.

The claimed host-script SHA-256 **`e3365eb3a9e58d9f421ccc5be6072d41cca65a12f4b646666509e2ee105892d7`** matches. All ten author manifest entries match independently. Scope includes the original six criteria, R1 report/disposition and `a9cbfa1` assertion addendum, R2 report/disposition, author corrections and evidence. Unchanged R2 closures are retained; inspection and additional checks concentrate on this diff. Private evidence (**E**): `/home/worker/.local/share/siltwake-evidence/gpu-enablement-r3-review/`.

## R2 findings

| Finding | Verdict and evidence |
| --- | --- |
| **R2-01: unreadable recovery definition** | **Closed.** `recover_start` obtains a successful current state and complete target definition, then compares every hostdev source with the caller's expected set. Both original unreadable-definition reproductions now produce `needs-owner/30`, shut off, with no start. Changed hostdevs and unreadable state also refuse; a readable MAC edit still recovers without losing the edit. |
| **R2-02: partial-package retry** | **Closed.** Real `apt-get -s` and `dpkg-query` against the R2 synthetic database produce the same `iF` / `Conf nvidia-kernel-dkms (550.163.01-2 ...)` repair. Exact extracted old helpers reject it; candidate helpers accept it. The fake failed-configuration/retry sequence reaches `ii` and passes verification. Pending packages appear in undo guidance. |
| **R2-03: running VM reported left-off** | **Closed.** The original lost-response reproduction now returns `backed-off/21`, running, after one start. Main attach and detach lost responses verify successfully without another start. Unreadable/paused states return `needs-owner`; only observed shut-off failures return `left-off`. Both retry callers handle those outcomes correctly. |

Every `recover_start` caller supplies the fourth argument. After a successful detach followed by a late boundary conflict, the quoted empty `""` correctly permits recovery with no hostdevs. Failed-detach undo instead requires both original GPU entries. The Fleet lock remains held through recovery and the second-try sleep. Both retry paths wait only after an observed shut-off failure; neither retries an already running, unreadable or paused VM. With the test delay set to 0.2 s, all eight measured retry intervals were 0.222–0.225 s; the operational default remains 10 s.

`Conf` alone cannot satisfy a different package name or pending version. A `Conf` accompanying `Inst` belongs to that same apt-generated installation plan; existing removal, upgrade and kernel/Xorg/CUDA installation refusals remain. Apt can also configure an unrelated package already pending at its exact existing version: this is reported, does not introduce a new version, and does not make that package owned by undo. The saved real 38-package archive plan still passes. Final verification still requires configured packages and the matching built module.

R1 failed-read, external-edit, backup, recovery and guest ownership/verification protections remain effective on the affected paths. The unchanged approval/probe/shutdown-gate closures stand. New compound assertions keep their secondary conditions inside the accounting helper; the old/new comparison below demonstrates actual failures rather than relying on a pass count.

## New finding

**R3-01 — P3, non-blocking: misleading pending-package undo warning.** At `worker-gpu.sh:260`, the warning says a pending package is “included in the removal below” even when the preceding version comparison excludes it as changed. A later warning correctly says it is left alone, and the printed purge command correctly excludes it. Move the inclusion wording into the matching-version branch, or simply report its pending status.

**Reproduction:** the isolated guest case in `E/run-extra-remaining.sh` fails DKMS configuration at `1.0-1`, changes only its current fake dpkg row to `9.9` / `iF`, then invokes `undo-plan`. `E/extra/cases/undo-changed-pending.log` contains both contradictory warnings and the safe purge command. No actual package operation occurs.

## Six original criteria

| Criterion | Execution-readiness verdict |
| --- | --- |
| 1. Ownership and bounded changes | **Ready.** Recovery now refuses unknown definitions and unexpected hostdevs; owned changes and readable external edits remain bounded. Revalidate actual card/peer facts at execution. |
| 2. Survives caller loss | **Ready.** Detached host control, cold/MMIO rationale, bounded ACPI shutdown and preserved QXL recovery remain supported. Starts and retry outcomes are truthful in the affected tests. |
| 3. Approval, integrity and recovery | **Ready.** Hash-pinned native approval, checked backups and locking remain intact; recovery requires readable state/definition. Actual rehearsal and approval remain execution gates. |
| 4. Reproducible guest setup | **Ready, with minor R3-01.** Legitimate pending repair works while version/removal guards and final verification remain effective. Real installation/loading is still unexecuted. |
| 5. GPU-backed browser workflow | **Ready for post-activation verification.** The unchanged isolated workflow checks renderer, draw/readback and actual production smoke; shared T3 preview remains software-only. No hardware success is claimed. |
| 6. Operational/game continuity | **Ready as a procedure.** Fleet placement/discoverability, durable checkpoint, resumed services/endpoints and resource release remain explicit execution obligations. No game or performance acceptance follows from smoke. |

## Checks and limits

- Ran the required full shell suite **once**, sequentially, using the exact requested `systemd-run` properties and 300 s timeout. A `BASH_ENV` hook verified the child limits before the runner: `memory.high=805306368`, `memory.max=1073741824`, `memory.swap.max=0`. Exit **0**: **140 host + 58 guest + 5 ask + 39 probe = 242 checks**. The scope is inactive. Receipt: `E/suite.log`.
- Extracted only the newly added regression blocks, with identical candidate fakes, and compared production scripts from both commits. **`c4d5191`: 8 host and 4 guest failures; `8d6dba9`: zero failures.** The focused scripts print counts; the runner's `failed 0` guard returns failure for the old candidate. No second full-suite run. Receipts: `E/regressions/{old,new}/`, `E/targeted.log`.
- Reran both R2 host scenarios and the real-apt pending reproduction using private copies with redirected evidence paths and candidate production code. The package reproduction's embedded helpers were replaced with exact blocks from each commit. Original R2 evidence is untouched. Receipts: `E/r2-repros/`.
- Additional isolated checks cover detach recovery with empty/restored hostdev sets, main attach/detach and both second-start caller outcomes, retry delays, wrong-version/name `Conf` rejection, unrelated pending-package ownership, and changed pending undo. Eight shell syntax checks, probe syntax, all ten manifest hashes and diff whitespace pass. No browser is launched by these checks.
- One initial extra fixture injected its MAC edit inside the definition-change transaction, earlier than intended. The candidate correctly rolled back, causing two incorrect reviewer expectations to fail. The corrected hook injects after that transaction's readback; only that case was rerun and passes. Initial results remain in `E/extra/host-initial.log` and `cases/early-edit-control`; details: `E/extra-harness-notes.txt`. Other initial extra host cases passed. This is a harness correction, not a candidate fix.

Still **unexecuted**: byte-identical Fleet placement and guidance links; coordinated durable checkpoint; native-approved real rehearsal and current host IDs, binding/users/group/BAR/framebuffer/memory and backup compatibility; real guest install/DKMS verification; the next ACPI shutdown, cold attach/boot and OVMF allocation; module loading, device permissions and `nvidia-smi`; actual RTX 3090 WebGL2 draw/readback and production smoke in the same isolated browser; resumed services, :9100/:9110 health/:9101 status, VM/repository/evidence identity, VNC behavior and real detach/rollback. Preserve the failed historical RAM run separately from later recovery. Representative 1080p/60, human play and complete-game acceptance remain unproven.

No live host inspection was needed. No live mutation, host/native ask, game render/full-suite test, browser/server launch, child, push or PR occurred. All private test sandboxes exited; no owned background resource remains.
