# GPU enablement — round-2 corrections

Same author (Opus 5.5/high) and worktree, on top of reviewed candidate **`c4d5191`**. Inputs: the Sol 6.1/xhigh R2 report (REQUEST CHANGES) and the coordinator's disposition, which accepts R2-01, R2-02 and R2-03; everything else R2 closed is untouched. Preparation only: no ask, host, VM, package, driver, service or browser change; no GPU attached.

**New host script SHA-256: `e3365eb3a9e58d9f421ccc5be6072d41cca65a12f4b646666509e2ee105892d7`** (was `ea128dfc…19bd`). `worker-gpu.sh`: `31043ba3be191fae834d58eb90dd47eecb5fb342c466c6408902247e7d38ced1`. `ask-command.sh` and `webgl-probe.mjs` unchanged. Full list: `final-source-sha256.txt` in the evidence directory.

| Finding | Correction | Regressions (each failed against `c4d5191` first) |
| --- | --- | --- |
| **R2-01** unreadable definition after the shutdown still led to a start | `recover_start` now starts only after it has itself read, successfully, a `shut off` state, a complete definition of this VM, and exactly the expected hostdev entries. Otherwise it publishes `needs-owner` with what it observed and leaves the VM off. Readable external edits (for example a MAC change) still recover to `backed-off`. | Definition unreadable after the shutdown; changed **and** unreadable; state unreadable at the check after the shutdown; someone adds a hostdev during the shutdown. All are now `needs-owner`, off, never started, and edits are kept. "Readable edit still recovers" passes before and after. |
| **R2-02** retry refused a legitimately half-configured package | `pending_status` recognises dpkg's pending states (`iU iF iH iW it`). `plan_check` accepts a requested package that is pending at version V only if the plan repairs it with `Conf pkg (V …)`, and every `Conf` line must belong to a package the plan installs or one pending at exactly that version. Upgrades and removals are still refused, and the final verification still requires `ii` and a built module. `undo-plan` lists pending packages and includes them in the simulated removal. | The fake now keeps real dpkg status columns and emits real apt `Conf` lines. A DKMS configuration failure leaves `iF` and exits 1. `undo-plan` lists `pending: nvidia-kernel-dkms (iF)`. The retry is accepted with `Conf nvidia-kernel-dkms (1.0-1  [amd64])` and ends `ii`, exit 0. A `Conf` of an unrelated package is refused, and a pending package at another version (an upgrade) is still refused. **With real `apt-get -s`/`dpkg-query`** on the reviewer's synthetic database: `c4d5191`'s helpers exit 1, the corrected helpers exit 0 ("completes pending: nvidia-kernel-dkms(iF)"). The saved real 38-package archive plan is still accepted. |
| **R2-03** `left-off` reported for a running VM | After any failed start `start_vm` reads the state:<br>• running (for example a lost response after boot) counts as started and is not started again;<br>• shut off returns `left-off` (after one retry in recovery);<br>• unreadable or any other state is `needs-owner` saying so.<br>The main start and both recovery starts use this. | The reviewer's lost-response case: `backed-off`, running, one start. The main start's lost response: `attached/0` verified, one start. A failed start followed by an unreadable state: `needs-owner` "cannot be read". A failed start observed shut off: still `left-off`. |

## Checks run

All runs were sequential, in a `systemd-run --user --scope` with MemoryHigh 768M, MemoryMax 1G, MemorySwapMax 0 and `timeout 300s`, with a hostile caller PATH.

- **Red baseline**, with the new regressions against unchanged `c4d5191` scripts: **12 fail** (8 host, 4 guest). Log: `initial-failures/r2-cases-against-c4d5191.log`.
  - An earlier red log is kept as `INVALID-fakes-not-extended-…`. In that run my fake extensions had not been applied, because a failed `cd` short-circuited the edit. It is not counted.
  - The first draft of the "state unreadable" case made every state read fail. That only exercised the shutdown timeout, so the case now fails the third read, at the post-shutdown check, which is the R2-01 path.
- **Final suite: exit 0 in 73 s, 140 host + 58 guest + 5 ask + 39 probe = 242 checks.** Log: `final-suite.log`.
- **Real-apt reproduction, before and after:** `real-apt-pending-before-after.log`. Real archive plan recheck: `real-archive-plan-recheck.log`.

Evidence: `/home/worker/.local/share/siltwake-evidence/gpu-enablement-r2-fix/`. Remaining live postchecks are unchanged from [R1-FIX.md](R1-FIX.md) and the README.
