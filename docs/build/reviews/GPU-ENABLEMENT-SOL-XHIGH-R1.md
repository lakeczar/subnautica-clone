# GPU enablement — independent Sol 6.1/xhigh review, round 1

**Verdict: REQUEST CHANGES; the complete bundle is not ready for execution.** Do not run its guest `install --apply` or disruptive native host command as the accepted procedure yet. The cold-transition approach is justified, the approval command pins the host script, and the ordinary offline suite passes with a conventional PATH. Targeted checks nevertheless reproduce unsafe acceptance of failed reads/backups, stale ownership checks, incorrect guest undo accounting, and false GPU/smoke success. None of this establishes working GPU hardware.

## Identity, independence and boundary

- Reviewer: fresh non-author **`gpt-6.1-sol`, `reasoningEffort: xhigh`**. The injected runtime states those effective settings. T3's saved task configuration independently selects that model and xhigh, and binds this child to this checkout. The live capability catalog confirms the model but exposes a composer default of `low`; that default is not the task's selected effort. Receipts: private `runtime-binding.json`, `runtime-catalog.json` and `identity.json`.
- Initial checkout: clean `t3/gpu-enablement-review`, `/home/worker/.t3/worktrees/subnautica-clone/t3-6e4feb47`, frozen parent **`cdbbab978e5e8a5de1d9dda4b43185e08ac81b10`**.
- Reviewed complete author source: **`e1a85c2bec048b7a2581cd5aa4bfc2270154d6ae`**, author parent **`d8a812ed3008d8950a0bdd3f9fe59caa6762e545`**, copied at **`53b66c1aced866a8bdc7e6bc147493b0a94ae8c6`**. I independently compared every one of the nine bundle files against both commits: all byte-identical. Host SHA-256: **`3710945199e0af4193e04719c1077a9739001c6108f9cf6b0806702973c57080`**.
- Scope: the complete README, host, ask, guest, browser and offline-test bundle, the original six review criteria, current model/acceptance policies, current recovery evidence, and the [coordinator's contrary evidence](../evidence/GPU-ENABLEMENT-ROOT-R1.md). Fleet's operational checkout is clean `ops/factory-worker-16g` at `af0426a016e96e75be6809d5b78bb5637852c1f1` in `/work/repos/fleet-vm-upgrade`; shared `/work/repos/fleet` is older.
- Private evidence, abbreviated **EVID** below: `/home/worker/.local/share/siltwake-evidence/gpu-enablement-sol-xhigh-r1/`. All candidate sources used in reproductions are unchanged copies or exact extracted function blocks. Fakes replace infrastructure, not the candidate's decision logic.
- No children, peer waits, host asks, package/driver/service/VM changes, source edits, push or PR. No browser or server was launched; port 5192 was unused and 5191 was untouched. Live inspection used read-only guest commands and the existing restricted SSH helper (`help`, `vm list`, `vm info`). Offline mutation simulations used scratch files and fake commands only.

## Explicit criterion verdicts

These are **execution-readiness verdicts**, not hardware acceptance. Unavailable post-activation evidence is listed separately and is not itself treated as an implementation defect.

1. **GPU ownership and bounded changes — NOT READY.** Exact UUID/functions, IDs, driver, BAR/group and definition checks are useful, and ordinary attach/detach preserves the fixture. R1-01/R1-02 allow unknown or changed ownership to proceed. The real helper currently reports Hermes and factory-worker running, and all three other GPU-referencing definitions stopped; that observation must be revalidated at execution.
2. **Transition survives loss of caller — PARTIAL, NOT READY.** Host-owned `setsid`, redirected descriptors, HUP handling, durable records, locks, cancellation, bounded ACPI waits and no force-off are sound design choices. The launcher-loss rehearsal passes offline. Cold attachment is justified by actual resource-window evidence. R1-08 still misreports a failed recovery after this script shut the worker down; R1-09 weakens the documented guest shutdown gate. No actual next shutdown/boot was attempted.
3. **Approval, integrity and recovery — NOT READY.** Existing restricted route/native `ask run`, exact hash/arguments/deadline and copied execution bytes are appropriate. There is no broader SSH/key workaround. R1-01/R1-03/R1-08 prevent acceptance of backup validity and truthful recovery. The completed launcher and concurrency tests cover selected paths, not those missing cases.
4. **Reproducible guest setup — NOT READY.** Debian archive `Signed-By`, running-kernel headers, graphics-only package selection and the unprivileged module-build evidence are appropriate. R1-04/R1-05 prevent accepting re-entry, failure and undo. No package was installed or purged by this review, and no module load/device-permission claim is made.
5. **Real GPU-backed browser workflow — NOT READY.** The shared T3 limitation and a task-owned Linux browser are correctly distinguished. The unmasked renderer classifier rejects the recorded software renderers and wrong GPUs. R1-06/R1-07 allow success without the required rendered-work/game proof. Actual 3090 WebGL2 and same-hardware production smoke remain unexecuted.
6. **Operational/game continuity — PARTIAL, NOT READY.** The procedure connects native approval, a root checkpoint, host result, guest services/endpoints and resource closure; it does not claim game completion from one smoke. Existing services/endpoints are healthy now. False postcheck success and recovery reporting must be fixed, and final Fleet placement/discoverability plus durable before/after repository receipts must be made concrete before execution.

## Findings requiring correction

### R1-01 — P1: failed host reads are accepted as safe absence

Locations: `host-gpu.sh:70–84`, `115–172`, `208–227`, `353–365`.

Several security/safety decisions consume command output without checking the command's status. A failed `virsh list` becomes an empty list; failed XML reads become no hostdevs; an unreadable framebuffer map becomes no framebuffer. `pipefail` does not repair ignored assignments or process substitutions. In particular, a running worker's unreadable live XML is accepted as the full attach plan when its persistent definition has no hostdevs. The script cannot know the live device set in that case. Absence verification on detach has the same ambiguity.

Reproduction: `bash "$EVID/run-targeted.sh"`, with its network disabled and real filesystem read-only outside private evidence. The fake wrapper selectively fails one infrastructure read while leaving the candidate unchanged:

```text
failed-list: preflight exit=0
failed-peer-xml: preflight exit=0
failed-worker-live-xml: preflight exit=0
unreadable-iomem: preflight exit=0
```

The peer-XML case marks Windows running before making its XML unreadable. See `targeted.log`, `cases/failed-*.txt`, `cases/unreadable-iomem.txt`, `fakebin/virsh` and `targeted.sh`.

Require successful, complete reads and validated XML/identity before interpreting absence. Enumeration, every relevant VM's XML/state, target live/persistent XML and required host resource maps must fail closed, including final verification and recovery paths. Add focused failed/truncated-read cases rather than counting only ordinary refusals.

### R1-02 — P1: ownership and host prerequisites go stale before mutation

Locations: `host-gpu.sh:229–233`, `391–410`, `529–537`.

`check_gpu` and `check_other_vms` run only during the initial examination. After the arm window the script rechecks target state and a partial target fingerprint, then shuts down. Under Fleet's lock it still checks only the target definition and host memory. It does not recheck competing GPU consumers, binding, framebuffer or IOMMU conditions before attaching/starting.

The bounded fake starts the Windows consumer at worker shutdown. The unchanged candidate then issues both config attachments and a worker start, and reports `attached/0`. Receipt: `cases/peer-starts-after-preflight/{fake/calls.log,run/result.json}`. **This fake does not model libvirt's real GPU exclusivity**: it does not demonstrate two real simultaneous consumers or a real takeover. It demonstrates that the program proceeds on stale ownership. Real libvirt would ordinarily reject the competing assignment/start, potentially after avoidable worker downtime.

Revalidate ownership and host prerequisites immediately before disruption and again under the applicable lock before mutation/start. Back off with a truthful conflict outcome and safe worker recovery if ownership changed. The guard should also account for the complete relevant inactive definition: a separate fixture changed the worker MAC during shutdown, was preserved, and still produced `attached/0` because the fingerprint excludes it (`cases/network-change-during-shutdown/`). That fixture demonstrates incomplete change detection, not destruction of the other operator's edit.

### R1-03 — P1: a failed, truncated backup is considered valid

Location: `host-gpu.sh:521–524`.

The security-info backup checks only that captured stdout is nonempty and that writing it succeeds. It ignores `virsh`'s exit status and never validates the document or checks it against the reviewed/current definition. The candidate must have a usable backup before stopping the VM.

The fake emits only `<domain>` and exits 1 for the backup read. The unchanged full launch still shuts down, attaches both functions and starts, returning `attached/0` with four mutation calls. Its saved `backup.xml` is just `<domain>`. See `targeted.log` and `cases/truncated-backup/`.

Require a successful complete XML read, expected domain identity/layout, a checked durable write/readback, and consistency with the mutation reference. Hold/revalidate the relevant configuration boundary so a concurrent change cannot invalidate the backup. Failure must occur before shutdown.

### R1-04 — P1: guest undo can purge unrelated packages and cannot handle partial installation

Locations: `worker-gpu.sh:96–121`; README guest installation/undo procedure.

The ledger is a one-time whole-system package-name snapshot, followed by a whole-system difference recorded only after successful apt installation. This cannot establish transaction ownership. It includes unrelated installations between first attempt and retry, ignores upgrades/versions and prior apt marks, and provides no ledger when apt partially changes the system then fails. Snapshot pipeline failures are also ignored. The sources file is overwritten without preserving existing contents, and undo removes it regardless of prior ownership. The shared `/work/tmp/siltwake-gpu-after.txt` adds another avoidable collision.

Network-isolated function-level reproductions use a fake `sudo`/apt/dpkg-query and writable private paths only:

```text
partial-install: exit=1, added-ledger=no
uninstall-after-partial: nothing recorded ...; nothing to remove
retry-install: exit=0 ... added=gpu-partial,unrelated-concurrent-package
... apt-get purge -y gpu-partial unrelated-concurrent-package
failed-before-snapshot: install-exit=0 before-bytes=0
  added=base-preexisting-package,gpu-new-package
```

The last case injects failure of the first dpkg snapshot; a pre-existing base package then becomes an alleged addition. The fake source initially contains operator-owned content and is overwritten. Receipts: `guest-targeted.log`, `guest-snapshot-failure.log`, corresponding scripts and `guest/` transaction outputs. **No real apt transaction or purge ran.**

Use a checked, durable transaction/ownership record, an inspectable actual apt plan, isolated temporary files and explicit partial-failure/re-entry handling. Preserve/refuse a pre-existing sources file and track actual before/after versions and marks where changed. Undo must inspect the current dependency/removal plan and refuse unrelated removals or intervening ownership changes. A package-name difference over the entire machine is not sufficient authorization to purge it.

### R1-05 — P2: failed guest installation verification returns success

Locations: `worker-gpu.sh:28`, `41–54`, `106–110`, `145`.

`fail` increments the counter but returns success; `driver_installed`'s missing-package branch calls `fail` then a bare `return`. `cmd_install` returns the verifier's status and the dispatcher immediately exits, bypassing the final `fails` check used by `check pre|post`.

The unchanged `driver_installed` function with missing package queries returns **0 with `fails=1`**. The fake successful apt/retry followed by failed verification likewise returns install exit 0. Receipts: `guest-targeted.log`, `guest/driver-missing.txt`, `guest/retry-install.txt`.

Return nonzero whenever installation/build verification fails and retain a recoverable partial state. The operator's later precheck remains useful but does not justify a successful installation exit after failed verification.

### R1-06 — P1: guest postcheck falsely claims accelerated game smoke

Locations: `worker-gpu.sh:90–93`; `webgl-probe.mjs:160–179`.

The postcheck greps for an accelerated string anywhere in a JSON file and prints `accelerated with smoke`. It does not validate top-level verdict/exit code, the chosen candidate, a smoke result, actual rendered-work proof or run provenance. Context-only and nested failed documents both pass.

I independently executed the **exact unchanged report-validation block** against both isolated fixtures. Both print `PASS ... accelerated with smoke`; see `guest-targeted.log` and `guest/{context-only,nested-only}.{json,txt}`. This confirms root's contrary reproduction, rather than replacing it. A complete probe invocation against an offline Playwright API fixture also legitimately emits top-level `accelerated`/0 without `--url` or smoke, so this is not only about malformed JSON.

Parse a versioned structured report and require a successful matching production-game smoke, not a nested string. Check explicit top-level status, candidate/browser/renderer consistency, actual smoke success and source/URL/run identity. Reject missing, malformed, failed and stale/mismatched reports. Distinguish a context probe from game smoke in the report schema and messages.

### R1-07 — P1: the probe does not establish rendered work or a successful game render

Locations: `webgl-probe.mjs:40–52`, `96–109`, `112–138`, `165–170`; README links 6–7 and smoke claims.

The standalone probe creates a WebGL2 context and reads strings/limits, but performs no draw/readback or error/context-loss check. The game path clicks New and sleeps, then counts **its own requestAnimationFrame callback**, independently of Babylon's render loop and readiness. A positive count can persist with a frozen, loading or failed game. The stored screenshot is not validated as rendered game work. Collected `console` errors—including WebGL/shader errors—are explicitly excluded from the failure predicate unless they become `pageerror` events.

A bounded offline Playwright API fixture supplies an NVIDIA context, a positive callback count and `console: WebGL: shader compilation failed`. The complete unchanged probe prints **`60 fps, 1 errors -> PASS`**, reports smoke passed and exits 0. See `fake-probe.log`, `fake-probe-smoke/report.json` and `fake-playwright/`. These are deliberately artificial API fixtures; their `game.png` contains a text fixture marker, not an actual screenshot. They test success logic and provide no hardware/browser rendering evidence.

Require a real WebGL2 draw with deterministic pixel readback/error/context-loss validation. For production smoke assert actual game readiness and advancing rendered frames using the game's render lifecycle, validate meaningful rendered output, and fail on relevant browser/WebGL errors. Record browser/source identity and actual workload conditions. Rename the present callback metric if retained; it cannot establish game fps or the representative 1080p/60 criterion. Keep a separate functional smoke after activation in the same actual GPU browser workflow.

### R1-08 — P2: recovery ignores a failed start and reports `started-as-is`

Locations: `host-gpu.sh:396–402`; README outcome/recovery table.

Both the Fleet-lock-busy path and the changed-definition path discard `start_vm`'s return status and finish `started-as-is`/21. In the busy-lock case the script also attempts that start without obtaining the lock whose protected operation may still be in progress.

Combine two existing fake capabilities: Fleet lock held, and `start_fail=always`. The candidate has already shut the worker down, cannot restart it, yet publishes:

```text
busy-lock-start-fails: started-as-is/21, vm=shut off
message: Fleet's lock stayed busy for 1 s; nothing was changed
```

`vm_state` truthfully says `shut off`, but the outcome/recovery claim is wrong. Receipt: `recovery-targeted.log`, `cases/busy-lock-start-fails/run/{result.json,run.log}`.

Handle every recovery-start failure as a distinct owner-action/left-off outcome, with explicit current state and recovery instructions. Do not start concurrently with an operation that still owns Fleet's lock. Preserve the other operator's definition; do not use the full backup to overwrite it.

### R1-09 — P2: the guest shutdown gate accepts unreadable evidence and only warns about QXL

Locations: `worker-gpu.sh:59–67`; README lines 43–46, 94.

If `sudo journalctl` fails, `grep -c` still prints 0; its failed pipeline status is discarded and the script reports no TTM failures/hung tasks. Separately, loaded/not-blacklisted QXL is only a WARN, although the README says the precheck requires it absent and the final status may still say all checks pass.

With only the journal command made unreadable, the unchanged precheck emits `PASS this boot: no TTM eviction failures, no hung tasks` and `fails=0`. Receipt: `guest-precheck.log` and its script; driver/services were harmless fixtures, while the real boot/cmdline/disk reads were read-only. The QXL severity mismatch is direct source inspection, not a claimed live QXL failure.

Require successful journal acquisition before counting evidence, and enforce the declared QXL prerequisite or explicitly change the procedure's policy. Preserve the current recovery blacklist and never infer that a clean journal guarantees the next shutdown.

## Nonblocking reproducibility issue

**R1-10 — P2:** `tests/run.sh:25–29` binds fake `virsh` in `/usr/local/sbin` but inherits arbitrary PATH. Root's first exact documented command failed with **49 host assertions passing and 42 failing**, because `timeout` could not find `virsh`; its five ask and eight classifier checks passed. Root's subsequent explicit-PATH log completes with 104 passes. My independent conventional-PATH rerun also passes 104. Retain the first failure; make the sandbox explicitly select its fake-tool PATH and fail early if that selection is wrong. This is test portability/isolation evidence, not a reproduced live host failure.

## Evidence reconciliation and actual checks

- **Source/integrity:** all nine files independently match both authored and copied candidates. Shell syntax checks for all six shell files and `node --check` pass. Only this report is a repository change.
- **Unchanged offline suite:** `env PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin bash docs/build/gpu-enablement/tests/run.sh` exits 0: **91 host + 5 ask + 8 classifier checks**. I first read the complete runner/fake/checks: production mutation verbs resolve to fake `virsh`, writes target scratch overlays, and the candidate invokes no SSH/network route. Receipt: `offline-suite-explicit-path.log`. Five author mutation trials are present and each reports failure as expected; I inspected their evidence but did not rerun or count them as independent trials.
- **Additional targeted checks:** failed list/XML/iomem reads; changed peer ownership; truncated backup; MAC change; busy lock plus start failure; guest partial failure/retry/unrelated-package accounting; failed before-snapshot; failed driver verifier; false report acceptance; unreadable shutdown journal; context-only and console-error probe success. Host and guest harnesses use `bwrap` with no network, fresh PID/user namespaces, read-only real filesystem and writable private/scratch overlays. The guest harness's `sudo` is a shell function; it never escalates or executes apt. Host wrappers can invoke only the provided fake implementation. Source and reproduction scripts/results remain in EVID.
- **Reviewer harness failures retained:** the first read-only harness omitted a writable `/dev` mount (`/dev/null: Permission denied`); an attempted nested-user-namespace run of the unchanged suite failed (`setting up uid map: Operation not permitted`); the first fake Playwright fixture lacked its module entrypoint. These are reviewer harness failures, corrected without editing candidate source. Original logs remain `targeted-harness-dev-binding-failure.log`, `offline-suite-nested-userns-failure.log`, and `fake-probe-fixture-module-resolution-failure.log`. They are not candidate findings or successful tests.
- **Current live state, read-only:** hostname factory-worker, kernel `6.12.111+deb13-amd64`, unchanged recovered boot ID `c64c4bcb-e6fb-47dd-a050-571f3bf86a14`, no NVIDIA PCI device, `module_blacklist=qxl` present. Host helper reports exact worker UUID, 16,777,216 KiB, six vCPUs pinned 0/1/8/9/10/11, both disks, persistent/autostart enabled; Hermes runs and Windows/inference/Ubuntu-old are shut off. Four expected services are active/enabled, linger yes, and :9100, :9110/api/health and :9101/status return HTTP 200. Receipts: `live-guest.json`, `live-host-worker-info.txt`, `live-host-vmlist.txt`, `live-helper-help.txt`.
- **Cold/QXL rationale independently checked:** live root port 00:01.5 still has 2 MiB nonprefetchable and 256 MiB prefetchable windows. The supplied kernel v6.12 source's slot-enable path supports the resource-allocation argument; cold OVMF allocation is a justified approach, not proof that a future BAR mapping succeeds. Independent journal queries reproduce **65,643** old TTM failures and ten hung-task reports, including PID 1's QXL/DRM console stack, versus zero of both in the current boot. Receipts: `live-root-port.txt`, `shutdown-independent-counts.json`; author PCI/shutdown excerpts and kernel source remain separately attributed. The original 2,400-second RAM-upgrade run remains failed; later recovery is a separate event. The historical clean shutdown after recovery does not guarantee this next shutdown.
- **T3/browser scope independently checked:** the installed `0.1.1-nightly.20261016.3203` binary contains the shared preview and HTML-render launch paths with `--disable-gpu`, matching the author's excerpt. Read-only process inspection is retained in `t3-browser-readonly.json`. No binary/shared flags were changed and no existing browser was driven. The author's real software probe/smoke remains harness-only evidence: SwiftShader rejected, Vulkan candidate without WebGL2, pod opening captured at 1280×800. Its callback-derived fps does not establish game render performance.
- **Guest evidence limits:** inspected Debian apt simulations/install set and the successful unprivileged module-build log. Their running-kernel compatibility result is useful. This review did not repeat the build or prove module loading, secure-boot acceptance, device permissions or package transaction safety from that build.

## Required execution/post-activation evidence and placement

After Opus corrections and a new fresh full-scope review, root should copy the reviewed operational files byte-for-byte into a named Fleet location, for example `/work/repos/fleet-vm-upgrade/unraid/gpu-enablement/`, on the current operational branch. Record the actual selected path/commit and hashes; do not assume the older shared Fleet checkout is current. Replace the README's bundle-directory placeholder with working commands at that path. Link the supported isolated GPU-browser workflow from Fleet's operational documentation and Siltwake's agent/browser guidance so later agents can find it. Placement is a declared future integration step, not evidence that it already happened.

Before disruption, root must checkpoint all active game work, exact repository/worktree heads and evidence/source identities to persistent storage and arrange orderly suspension. Capture the guest precheck, native approval command/hash/deadline, host preflight/rehearsal and detached result durably. Rehearsal must verify actual IDs, both functions, group, drivers/users, BAR/framebuffer and host-memory/RSS facts still unknown behind the restricted helper. Do not casually boot the old inference VM or alter Hermes/other consumer definitions/data. Preserve QXL recovery and existing CPU/memory/disks/network/autostart.

Still **unexecuted**: native-approved rehearsal/real attachment, actual next ACPI shutdown and OVMF BAR allocation, post-transition boot and module load/DKMS/kernel checks, 3090 `nvidia-smi`, intended-process device access, hardware WebGL2 draw/readback, actual ready/rendering production smoke in the same hardware-browser workflow, framebuffer/VNC behavior, and detach/rollback on real libvirt. Capture resumed service/endpoint health, CPU/memory/disk/autostart identity and unchanged repository/evidence checkpoint receipts; this review's healthy pre-transition observations do not substitute for those postchecks.

No representative 1080p/60-fps result, complete-game acceptance, human-play validation or successful GPU activation is claimed. This review owns no remaining browser, server or background process. Root reconciles these findings; Opus implements corrections and a new fresh reviewer receives the original complete scope plus all R1 findings/dispositions.
