# GPU enablement — round-1 corrections

Author: Opus 5.5/high (`claude-opus-5-5`, effort high), same author as round 1, in the existing worktree `t3/enable-3090-gpu`. Base: reviewed candidate **`e1a85c2bec048b7a2581cd5aa4bfc2270154d6ae`** (host SHA-256 `37109451…7080`). Inputs read in root's checkout at `3b84fbc`:

- the Sol 6.1/xhigh R1 report (author `e087a6d`, copied at `5ac8abf`), verdict REQUEST CHANGES;
- the coordinator disposition, which accepts R1-01 to R1-10;
- the correction brief and the original six-criterion scope.

No root records were copied into this branch.

**Preparation only.** No `ask`, host file, VM definition, guest package, driver, service, shared browser or recovery setting was touched. No GPU is attached, and nothing here shows NVIDIA rendering.

## Source identity (final)

| File | SHA-256 |
| --- | --- |
| `host-gpu.sh` | `ea128dfcc742afa2cbaba18511adc0956a578b6b8d66fd8e0e4a033ac02d19bd` |
| `ask-command.sh` (unchanged) | `3ea611910abf519837d0fecd46131dfd9ee135f302276657d202d02cb950371f` |
| `worker-gpu.sh` | `723889288fce1353ae24dbe702acee45447b086034a8259d912e2ee127ab7296` |
| `webgl-probe.mjs` | `771008ea785e0619d2830fb7d84b84652c7b15b6745652287e478e6731d85802` |
| `tests/run.sh` | `2015491a8e2ec5ea7effc0433da269e8713f69a82121e97d972d7725bd6465f8` |
| `tests/checks.sh` | `577708099a9e5a68b7d90dc33ea5c20cefb069757bd606ff4a884246f6acd3bf` |
| `tests/fake-virsh.sh` | `3fd52acbf520cad110aa93712d1116d0ad89a2ea976596f648d382cee0669ae2` |
| `tests/guest-checks.sh` (new) | `f26f682fd51679dbf2f3dada8d7f3ed618dfe49fd2f342732700575ad7224359` |
| `tests/fake-guest-tool.sh` (new) | `27fa8645c9485ffe8e3e61f86917e56d487c00ee37b74aa02cd6f57976678bb2` |
| `tests/fixtures/factory-worker.xml` (unchanged) | `262221c6f8b9a58937c6c02ceda57624ddf14e7df4202510388484d44597aa01` |

The commit containing this file is the candidate; the hash list is also in the evidence directory (`final-source-sha256.txt`).

## Findings → corrections → checks

| Finding | Correction | Demonstrated by |
| --- | --- | --- |
| **R1-01** failed host reads taken as absence | One read layer, used by every decision, recovery and final verification. `virsh` must exit 0. A domain document must be complete (first line `<domain`, last `</domain>`) and, where named, of the expected VM (`<name>`/`<uuid>`). States must be a known libvirt state, and the VM list must contain the worker. sysfs files must be readable and non-empty. The BAR lines must parse. `/proc/iomem` must be readable and show **BAR0 under the GPU's own name**, which rejects a missing map and the zeroed unprivileged map. An unreadable state or definition after a shutdown or a failed start is `needs-owner`/off, never a start. | 13 host scenarios, 22 assertions (list, peer state/XML, worker live/persistent XML, missing and zeroed iomem, BARs, IOMMU group, launch, final verification, detach absence, unreadable definition after a failed start). Mutation removing the whole read layer: **7 cases fail**. |
| **R1-02** stale ownership and partial definition checks | `recheck` runs before the shutdown (under Fleet's lock), after it, and again just before the start. Each time it re-reads the state and the **whole** inactive definition (hostdev aside, byte for byte against the checked one). For attach it also redoes every card check (IDs, binding, group, BARs, framebuffer) and every other VM's ownership, plus memory. Before any change → `backed-off` with the VM started as it was. After our change → our entries removed again, then started. The other operator's edit is kept and recorded (`changed-definition.diff`). | Gaming VM starts during the shutdown, MAC changed during the shutdown, host driver takes the audio function during the shutdown, gaming VM starts between attach and start (entries removed, definition equals the original). Mutation skipping the boundary checks: 8 cases fail. |
| **R1-03** truncated backup accepted | Before the arm window: a successful `dumpxml --inactive --security-info` of this VM; the complete identity check; equal to the checked definition apart from `passwd=` attributes; written to a temp file, `sync`ed, renamed, and read back with `cmp`; hash recorded. Any failure is `preflight-failed` with the VM still running. The rehearsal does the same. Later changes are caught by the boundary rechecks. | Truncated backup read, backup differing from the checked definition, backup directory unwritable: no shutdown in any. Mutation skipping the comparison: caught. |
| **R1-04** guest undo ownership, partial install | Automatic purge **removed**. `install --apply`:<br>• refuses a pre-existing sources file it did not write, and keeps it byte for byte;<br>• records all packages (with versions) and the manual marks before the first change, with a checked `dpkg-query`/`apt-mark`, before anything else;<br>• simulates the real plan and refuses removals, upgrades, kernel, Xorg or CUDA;<br>• records each plan and its new packages;<br>• records the system after every install attempt, including failed ones.<br>A retry keeps the first record. `undo-plan` is read-only. It treats as ours only what one of our recorded plans newly installed, that was absent before, and that is still at the version we installed. It simulates the purge and refuses if apt would remove anything else. It names unrelated or changed packages it leaves alone, prints `apt-mark auto` for marks to restore, and offers to remove the sources file only if install created it and it is unchanged. | 24 guest assertions: pre-existing sources, failed first snapshot, refused removal/upgrade/kernel plans, partial install then undo-plan (exactly the 3 installed), retry with an unrelated concurrent package (excluded and named), extra package in the purge simulation (refused), upgraded package of ours (left alone), pre-installed auto headers (not purged, mark restored), re-entry. Mutations: refusing removals disabled → 3 fail; undo from a machine-wide difference → 3 fail. |
| **R1-05** failed verification returned success | Checks are grouped with `section`, which fails if any check inside failed. `install` returns 1 on any apt or verification failure and records it (`failed: verification`). The dispatcher exits non-zero on every failure path. | Driver missing (check pre exit 1), apt succeeds but the module did not build (install exit 1, recorded). |
| **R1-06** postcheck accepted any "accelerated" string | `check post` requires `REPORT --commit SHA` and calls `webgl-probe.mjs --validate`. That parses report schema `siltwake-gpu-probe/2` and requires:<br>• mode `game-smoke`, verdict `accelerated-game-smoke-passed`, exit 0;<br>• the chosen candidate's renderer and draw re-judged;<br>• the smoke in that candidate, with the same renderer and browser, its judgement **recomputed from the raw observations**;<br>• build identity and the given commit;<br>• `nvidia-smi` naming the 3090, this boot ID, this host, and an age of 6 h or less.<br>Context-only reports are a distinct mode with their own verdict. | 13 validation self-test cases, including context-only, a nested string in a failed document, a stored `passed` over failing observations, another boot, commit or host, and stale. Guest cases: no report, another commit, an earlier boot, a context-only document, `nvidia-smi` failing. The reviewer's old "PASS" smoke report fails validation with 9 reasons. Mutation accepting context mode: caught. |
| **R1-07** no rendered-work proof; callback cadence reported as fps | Each candidate draws three solid colours with a compiled and linked shader and reads 15 pixels back. Any wrong pixel, GL error, lost context or link failure means not accelerated. The game smoke:<br>• serves the production `dist/` itself (commit plus file hashes recorded);<br>• waits for the game's own readiness (`data-graphics=available`, `data-ready=true`, HUD shown);<br>• counts frames from the game's render loop (`data-frames`, one per `scene.render()`) over 5 s, needing at least 10;<br>• checks the canvas alone (DOM overlays hidden) for colour buckets, luma spread and the dominant colour;<br>• fails on page errors, console errors, relevant WebGL warnings and context loss, while excluding ANGLE "Performance" driver notes.<br>The independent rAF counter is gone. The game's frame rate is labelled headless and not a performance measurement. | 6 draw and 10 smoke self-test cases, including the reviewer's `WebGL: shader compilation failed` with frames advancing, which now fails. The reviewer's fake-Playwright fixture, run against a copy: no candidate is accelerated (no draw), exit 1; the old `--url` path is gone. A real Chromium run on SwiftShader, labelled software functional only: draw readback ok, game ready, 12–13 game-rendered frames, canvas 127 buckets, game checks pass, verdict `not-accelerated`, exit 1. At 1920×1080 SwiftShader rendered 9 frames, and the functional check correctly failed. Mutation ignoring console errors: caught. |
| **R1-08** failed recovery start reported as started | Fleet's lock is now taken **before** the shutdown and held to the start. A busy lock is `locked` with the VM never stopped, and no recovery start races a lock holder. Every recovery start goes through `recover_start`, which retries once, then reports `left-off` with the current state. `started-as-is` is replaced by `backed-off` (running, nothing changed). | Lock busy plus starts failing: `locked`, no shutdown, running. Definition changed plus restart fails: `left-off`/30, off. Conflict plus restart fails: `left-off`/30. Mutation reporting a failed start as started: 3 cases fail. |
| **R1-09** unreadable journal passed; QXL only a warning | The journal is read once with a checked exit status and must contain this boot's `Linux version` line before anything is counted. QXL is now a **FAIL** gate: `module_blacklist=qxl` on the running kernel **and** in `GRUB_CMDLINE_LINUX*`, plus a readable `lsmod` without qxl. The scripts never edit it. The README states the policy, and that a clean journal does not guarantee the next shutdown. | Journal unreadable, journal truncated, TTM failure, blacklist missing on the running kernel, blacklist missing from GRUB, qxl loaded, lsmod unreadable; plus "the gate never edits the QXL fix". Mutation ignoring the journal failure: 6 cases fail. |
| **R1-10** fake tools depended on the caller's PATH | `run.sh` starts the host and guest sandboxes with `env -i` and a fixed PATH. `checks.sh` stops at once unless `/usr/local/sbin/virsh` is the fake (`version` says `(fake)`), and likewise `logger` and `notify`; `guest-checks.sh` checks all 14 fake guest tools. `host-gpu.sh` also sets its own PATH. The guest sandbox has no network, a read-only real root and a private `/tmp`; its `sudo` runs only inside the sandbox. | The original suite with a PATH lacking `/usr/local/sbin` reproduced root's failure (49 pass / 42 fail, `timeout: failed to run command 'virsh'`). Every later run here uses that same hostile PATH and passes. |

### Other changes made along the way

- **Real bug, found by the new guest tests before any run:**
  - **What was wrong:** `plan_check` matched package names as regular expressions. `linux-headers-6.12.111+deb13-amd64` contains `+`, so every real plan would have been refused.
  - **Fix:** all package comparisons now use exact fields.
  - **Proof:** a read-only dry run against the live Debian archive, in a private apt directory with the system's apt state unchanged, accepts the real 38-package plan.
- Also fixed:
  - `hostdev_srcs` reports any hostdev without a PCI source (USB, mdev) as `other`, which is refused;
  - the launcher reports a run that finished before it looked;
  - the host script fixes its own PATH.

## Compound-assertion audit (test honesty)

`is "name" [ A ] && B` only checks `A`; `B`'s result was ignored. In `e1a85c2`'s `tests/checks.sh`, **7 assertions** were written this way, at lines 162, 196, 208, 224, 229, 235 and 242:

- foreign hostdev "says why";
- needs-owner "entry recorded";
- restarted-elsewhere "no attach";
- cancelled "nothing changed";
- locked "nothing changed";
- started-as-is "no attach";
- re-entry "no shutdown/attach".

So round 1's "104 passing" overstated what those 7 checked. All 14 compound assertions (those 7 plus 7 new ones) are now `is "name" eval '…'` and evaluate every condition. The first fully evaluated red run exposed one more real failure that partial evaluation had hidden: "launch with an unreadable running definition". All 7 old assertions pass fully evaluated against the corrected script. Two of them now assert the corrected outcomes: `locked` instead of `started-as-is` for the busy Fleet lock, and `backed-off` for the pins change.

## Checks actually run

| Check | Result | Evidence (`…/gpu-enablement-r1-fix/`) |
| --- | --- | --- |
| Original e1a85c2 suite, hostile PATH (R1-10 initial failure) | exit 1, 49 pass / 42 fail | `initial-failures/R1-10-original-suite-codex-like-path.log` |
| New host regressions vs **unchanged** e1a85c2 script (red) | 19 fail (partial evaluation), then **20 fail** fully evaluated | `initial-failures/new-host-cases-against-e1a85c2*.log` |
| Final offline suite, sequential, 1 GiB / zero-swap user scope, 300 s deadline | **exit 0 in 35 s: 130 host + 51 guest + 5 ask + 39 probe = 225 checks** | `final-suite.log` |
| Same totals in the pre-incident full run (hostile PATH) | 225 / 0 failed, 37 s | (preserved result, before the memory incident) |
| Ten mutation trials (run in parallel before the memory incident) | 9 caught; the 10th inconclusive (only two rehearsal timing checks under load) | `mutations.txt` |
| That mutation rerun alone, capped | suite passes: ignoring `virsh` status alone is still refused by the completeness/identity checks | `mutations-sequential/m1-rerun.log` |
| Replacement mutation: whole read layer removed, capped | **7 R1-01 cases fail** | `mutations-sequential/read-layer.log` |
| Reviewer's fake-Playwright fixture vs corrected probe (copy) | context exit 1, smoke exit 1, old `--url` refused (exit 2), both old reports rejected by `--validate` | `reviewer-fixture-rerun/` |
| Real Chromium 156 on SwiftShader, isolated profile, probe-served `eb712f1` build on 127.0.0.1:5192 | 1920×1080: functional FAIL (9 frames). 1280×800: game checks pass, renderer software, verdict `not-accelerated`, exit 1. Server and browsers closed; 5192 free. | `software-functional-probe*/` (report, log, canvas PNG) |
| `install` dry run, real archive, private apt directory | 38 new packages accepted; `/var/lib/apt/lists` and dpkg status unchanged | `install-dry-run-real-*` |

The memory incident happened after the 225-check run and the parallel mutations, and was caused by another task's suite. Anything of mine that ran under that load was treated as inconclusive and rerun sequentially under a cap, as above.

## Remaining live postchecks (not executed)

- **Rehearsal (native approval):** the actual IDs, binding, group, BAR sizes and BAR0 in the root-readable iomem; any framebuffer; `vfio-pci.cfg`; QEMU RSS and the libvirt pid path; and that the security-info backup equals the plain definition apart from passwords on this libvirt.
- **Libvirt formatting:** that the inactive definition reads identically across the arm window, power-off and `attach --config`. A difference backs off truthfully; it costs a restart, never the VM.
- **Real attach:** ACPI shutdown, OVMF BAR allocation, start with VFIO, live entries, guest agent.
- **Guest:** `install --apply` on the real system (38 packages, DKMS build for the running kernel), then after the restart `check pre`, the module load, `nvidia-smi`, device-node permissions, and console framebuffer placement.
- **Browser:** the probe on the 3090 (which ANGLE candidate, the draw readback), then the production game smoke in the same candidate and `check post REPORT --commit SHA`.
- **Services and recovery:** services and endpoints, CPU/memory/disks/autostart, repository and evidence checkpoints, then detach/rollback on real libvirt.
- **No claims:** no performance, 1080p/60, or complete-game claim.

## Process notes

- No children, peer messages, push or PR.
- Browser work followed `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md`. It used my own headless Chromium with temporary profiles on factory-worker Linux, never T3's shared preview or CDP. Only my own server and browsers were closed, by exact PID.
- Earlier evidence directories (`gpu-enablement-prep`, the reviewer's and root's) were read, not changed. The reviewer's fixture was copied before use.
