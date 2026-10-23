# SCHED-1: heavy-check v2 admission queue

Builder: Opus 5.5, branch `t3/sched-1-heavy-queue`. **R1 and R2 fixes applied:**
- R1: review `506f3a4`, `docs/build/reviews/SCHED-1-SOL-XHIGH-R1.md` on `review/sched-1-r1`; see [R1 responses](#r1-review-responses).
- R2: review `5ae3b3a`, `docs/build/reviews/SCHED-1-SOL-XHIGH-R2.md` on `review/sched-1-r2`; see [R2 responses](#r2-review-responses).
- R3: review `89352de`, `docs/build/reviews/SCHED-1-SOL-XHIGH-R3.md` on `review/sched-1-r3`; see [R3 responses](#r3-review-responses).
- R4: review `200e898`, `docs/build/reviews/SCHED-1-SOL-XHIGH-R4.md` on `review/sched-1-r4`; see [R4 responses](#r4-review-responses) and the [cut-over checklist](#cut-over-checklist). Design: `DECISION-OPUS.md` on `research/perf-decision` (`fd4cdcd`), approved by the owner on 2026-10-22. It is built in its five phases. Phases 3 (slice install) and 5 (canary and cut-over) are the coordinator's steps below. The branch is merged up to `feat/siltwake-first-expedition` `f0eb2b1`.

## What's built

**Scheduler:** `scripts/heavy/`, Node with no dependencies.
- `policy.mjs`: the pure decision `(state, now, host) → admit/blocked`. It covers:
  - classes and the pools (`T = nproc − 2` tokens, `M` = 6 GiB, 1 GPU);
  - the express slot;
  - aging, the 10-minute reservation and the exclusive drain;
  - one job per worktree;
  - refusal of impossible requests, coalescing and serial mode.
- `state.mjs`: the state file under a kernel `flock`, which util-linux `flock(1)` takes on an fd this process owns, so it is released if the process dies. It also handles PID plus start-time liveness, the `/proc/locks` bridge, host sampling and reconciliation.
- `supervisor.mjs`: one detached supervisor per ticket, in its own systemd scope. It queues and admits the ticket, taking the v1 bridge lock shared, then hands both to the ticket's holder and exits.
- `holder.mjs` (R2): owns an admitted job's whole lifetime, in its own scope `<prefix>-hold-<ticket>`. It:
  - claims the ticket under the state lock, and never launches a ticket that recovery already finished;
  - holds the bridge, inherited from the supervisor's admission, so there is no gap;
  - launches the job scope (capped, delegated, in `siltwake-heavy.slice`, `BindsTo=` the holder) and hands the bridge to the scope's anchor (R3);
  - stops the scope once the foreground ends, or at the whole-job deadline, retrying failed stops with backoff until the cgroup is empty (R3);
  - waits until the job's cgroup reports `populated 0`, failing closed on query errors;
  - then removes the worktree marker, writes the result and ledger, frees the reservation, and exits, which releases the bridge.
- `anchor.sh` (R3): a tiny process inside the job scope that holds the bridge (shared) for as long as the scope lives.
  - **Startup:** `scope-run.sh` starts it before the command and closes the bridge fd for the command.
  - **Stops:** it ignores TERM, so it dies only in the scope's final SIGKILL, with everything else.
  - **Normal path:** the holder, or recovery, sends it USR1 once it (and its sleep) are all that is left in the cgroup.
- `scope-run.sh`: runs inside the job's scope. It checks the scope's limits, and puts itself, the anchor and the command in one OOM group: the child cgroup `job`, with `memory.oom.group=1` (R4). It applies the deadline and records `memory.peak`, OOM kills and CPU time before the scope disappears.
- `heavy-check.mjs`: the CLI (`run`, `submit`, `wait`, `status`, `log`, `cancel`) and the nested-call check.
- `install.sh`: installs a versioned, immutable copy and the `current` symlink, creates state (`mode=serial` when new), optionally installs the slice unit, and uninstalls.
- `build-guard.mjs` and `gpu-lease.mjs`.

**Call sites and docs:**
- `scripts/heavy-check.sh` is now a shim. It runs the installed v2, and otherwise falls back to v1, which also accepts v2's options.
- `test:heavy` is `--class heavy-suite` and compiles inside the job.
- `check` drops the second typecheck.
- The playthrough's `--jobs` defaults to `SILTWAKE_JOB_CPUS` (never in a `--child`).
- The GPU lease is required by `tools/cave-gpu-check.mjs`, `cave-deep-shots.mjs`, `large-cave-lab.gpu.mjs` and `webgl-probe.mjs`.
- `WORKER_RESOURCE_LIMITS.md` and `DIRECTION.md` (Tests, Resources, GPU) now carry the owner's rule change.

**Reuse ("now" items):**
- the duplicate typecheck is gone from `check`;
- `test:heavy` queues itself, and the docs forbid wrapping it, `build` or typecheck;
- compiles run outside the queue;
- the scenario-selection policy is in the usage text;
- **the shared terrain store** is a separate commit (`338c17b`). It sits in `bake-terrain.mjs`, keyed by the bundled inputs (relative paths), the script, the codec, and the Node, zlib and esbuild versions. Entries are immutable, restored by copy and sha256-checked. `--force` and `--verify` bypass it.

**Machine size:** on 8 vCPUs, `T = 6`, `heavy-suite` and `playthrough` get 3 tokens, and the slice quota is 700%. This was checked after the restart, with no change or redeploy.

## Changes to the decision, and why

1. **No `MemoryHigh` on job scopes.** With no swap, a job past `memory.high` is throttled, not killed. Measured: 478 → 490 MiB in 18 s, with 482 `high` events and 0 OOM kills, so it would hold its reservation to the deadline and never report `oom`. At `MemoryMax`, the kernel still reclaims cache before it kills.
2. **Exclusive v2 jobs hold the old lock *shared*.** An exclusive holder looked like a v1 caller: it gave the wrong `legacy` reason and logged false `legacy-holder` ledger events, which the bridge-removal rule counts.
3. **The 10-minute reservation goes to the *oldest* ticket that has waited 10 minutes,** not the priority head. Otherwise a playthrough under a stream of reviews only becomes head after 15 minutes, which breaks test 4's bound.
4. **Known commands get their class without `--class`:** the playthrough, the heavy tier and the terrain bake, plus the large-cave lab bake as `exclusive`. Otherwise v1-style calls would be clamped to `standard`'s 20 minutes.
5. **A job's lifetime is its cgroup, owned by a per-ticket holder.** (Revised in R1 and again in R2; see the R2 responses.)
   - **Holder lives:** it keeps the v1 bridge and the reservation until the job's cgroup is conclusively empty, whatever descriptors the job's processes keep or close.
   - **Holder killed:** `BindsTo` stops the job. The scope's anchor keeps v1 out until the scope's last process is gone (R3). Recovery (any transaction, `wait`, `status`, `cancel`) keeps the reservation until that cgroup is empty, then finishes the ticket.
6. **Supervisors run in their own scope,** so stopping an agent's cgroup does not orphan its job.
7. **TT-1 r1 compatibility.** Job scopes are `Delegate=yes` with `SILTWAKE_HEAVY_CGROUP=delegated`, so TT-1's per-file cgroups nest inside the job's cap. Only an OOM at the scope's own limit (`memory.events.local`) is labelled a reservation OOM. A per-file budget kill keeps the job's own exit code, plus a note.
8. **Slice limits follow the machine.** Once `--slice` is installed, supervisors correct the slice's `CPUQuota` (`(T+1)×100%`) and `MemoryMax` (`M` + 2 GiB) at runtime, so a vCPU change needs no reinstall.
9. **Small safety defaults:**
   - serial mode gives a job only the v1 environment, so TT-1's own defaults apply;
   - a missing mode file means serial;
   - a nested `exclusive` call is refused, as `gpu` is;
   - queued tickets are re-resolved on every plan, so a mode switch or vCPU change applies to them too.

## Acceptance results

**Commands:**
- `node --test --test-concurrency=1 scripts/heavy/acceptance.test.mjs` uses private state, slice, units and lock, with sleep and allocation payloads. After R4 it passes 23 of 23: the decision's tests except 4, plus 6b, 6c, 9b, 9c, 9d, 9e, 9f, 12b and 14b. Mutation checks (with the v1 source available): 9e and 9f fail on the R2 code (`c562bed`), and 6c fails on the R3 code (`8759122`).
- `tests/heavy-sched-policy.test.ts` passed 18 of 18, and `tests/bake-terrain-store.test.ts` 4 of 4.
- `npm test` passed 1,287 tests in 126 files.
- **The reviewer's probes, rerun on the R1 code** (copied to private paths):
  - **F2 (`stop-repro.mjs`):** the exclusive job waited, blocked by `lane`, until the old scope was empty, and then found the old payload gone.
  - **F3 (`cancel-repro.mjs`):** `payloadRanAfterCancel=false`, label "cancelled before start".
  - **F1 (`crash-bridge.mjs`):** the probe now times out waiting for v1 to enter while the orphaned payload lives, which is the fixed behaviour. A lone `wait` then finished the ticket.

| # | Test | Result |
| --- | --- | --- |
| 1 | Two CPU jobs at once | pass: both admitted in under 1 s, intervals overlap |
| 2 | GPU doesn't block CPU | pass: the playthrough starts at once; the second `gpu` is `blocked-by gpu` |
| 3 | Review jumps a playthrough | pass: R before P when tokens free; R in the express slot at once while the pool is full |
| 4 | No starvation | pass (unit test, injected clock): P starts between minutes 10 and 20 under steady reviews |
| 5 | Memory overcommit | pass: `blocked-by memory`; 9 GiB exits 2; injected 3 GiB `MemAvailable` gives `host-memory` |
| 6 | Whole-tree containment (R4: revised) | pass: a grandchild over the 512 MiB reservation OOM-kills the whole job at once (`memory.oom.group=1` seen in the job; nothing printed after it), exit 137 with the `oom:` label, reservation freed, neighbour exits 0 |
| 6c | Reservation OOM can't strand the anchor (R4-F1) | pass, using the reviewer's memfd allocator (tiny RSS, charges shared pages), with the anchor made the kernel's first victim and a real v1 waiter queued. The OOM kills the whole scope, never the anchor alone. The holder is SIGKILLed if still alive. v1's own command never sees the allocator alive. `wait` returns 137 `oom: class quick reservation 256 MiB`. On `8759122` it fails with "the OOM killed the whole scope, not the anchor alone" |
| 6b | Delegation (added; R4: rechecked) | pass: a TT-1-style per-file cgroup OOM stays inside the job (the shell carries on) and is not relabelled |
| 7 | Exclusive drains | pass: `lane`/`exclusive` blocking, express shut, runs alone with 6 cpu, 6 GiB and the GPU, load and PSI recorded |
| 8 | Detach | pass: caller's process group SIGKILLed, job finishes, a fresh `wait` exits 7, resubmit joins the same ticket |
| 9 | Crash recovery (R2: revised) | pass: the supervisor has exited after the handoff and the job finishes normally (exit 5). Then, with the holder SIGKILLed and nothing else queued, `BindsTo` stops the job, a lone `wait` returns 137 "killed: its holder died", and the reservation is reclaimed only with the cgroup empty. Same PID with a different start time is not alive |
| 9b | Stopping scope (R1, F2) | pass: TERM-resistant payload, scope `deactivating`, holder killed: an exclusive job stays `blocked-by lane` and the old job stays reserved until the cgroup is empty; the exclusive payload then sees the old PID gone |
| 9c | Background children (R2-F1, R2-F2) | pass, two cases: a shell `sleep 120 &` that inherits every descriptor, and a TERM-ignoring Python child started by Node `spawn` with `stdio: 'ignore'` (fds 0–2 only). In each the foreground exits 0 with the supervisor gone and a real v1 waiter queued. v1's own command never sees the old child alive. In the TERM-ignoring case v1 waits out the 10 s stop grace. `wait` returns 0 with `leftovers: true`, and the scope is empty |
| 9d | Whole-job deadline (R2-F2) | pass: the payload SIGSTOPs its own `timeout`, so the foreground can't end; the holder's backstop stops the scope at deadline + 15 s; a lone `wait` returns 124 "deadline 2s exceeded" |
| 9e | Holder SIGKILL with a real v1 waiter (R3-F1) | pass, four cases: TERM-ignoring Node-spawned child (fds 0–2), inheriting shell child, holder killed during the leftover stop (`deactivating`), and a TERM-ignoring foreground in serial mode. v1's own command never sees the old payload alive, the child is dead when v1 enters, a lone `wait` finishes, and the reservation is reclaimed |
| 9f | Deadline stop retry (R3-F2) | pass: the foreground SIGSTOPs its `timeout`; the backstop's first `systemctl stop` fails (PATH wrapper, once); the holder retries; `wait` returns 124 "deadline 1s exceeded" and the scope is empty |
| 10 | Cancel and expiry (R1: launch window added) | pass: queued removal; running cancel returns only when the scope is empty (75); queue limit gives 75; a cancel while scope creation is held gives exit 75 "cancelled before start" and the command never runs |
| 11 | `wait` | pass: `--max` gives 99 with a position line; then the job's code; 124 and 0 |
| 12 | Legacy bridge | pass: with the real v1 script (`1ccce66`), a v1 holder blocks v2; a v1 waiter pauses v2 until it has run; the inode is unchanged |
| 12b | Supervisor gone, v1 waiter (R1, F1) | pass: with the supervisor exited and the real v1 script waiting, v1 does not enter until the payload ended (v1 start ≥ payload end) |
| 13 | Nested calls | pass: inline in the same scope; nested `gpu` and `exclusive` refused; forged ticket and forged `LOCK_HELD` refused |
| 14 | Per-worktree and guard | pass: `blocked-by worktree`; the guard refuses outside the job and allows the job itself |
| 14b | Guard follows the cgroups (R2-F3) | pass: with the supervisor gone, the guard refuses. After the holder is killed and the job lingers in its stop grace, it still refuses (the job itself is allowed). It allows once the cgroup is empty, and recovery removes the marker |
| 15 | Serial switch | pass: serial runs one at a time with v1 env; flipping to normal re-resolves waiting tickets, which then overlap |

**Also checked:**
- the installer: idempotent, starts serial, `--uninstall`;
- the shim running v2;
- the v1 fallback parsing v2 options, with the GPU lease and delegation;
- `submit` on v1 giving a clear exit 2;
- `systemd-analyze verify` on the slice unit;
- the terrain store: seed from an up-to-date tree, restore in 0.1 s byte-identical, a corrupted entry refused;
- `tests/bake-terrain-store.test.ts` (R1, F4), four cases on a one-byte fixture with the real driver:
  - same-version restore;
  - a driver change makes local output stale and the new key holds the new bytes;
  - a source-only manifest stays locally fresh but is never published;
  - a damaged entry is a miss, and `--verify` and `--force` bypass the store.

  Mutation check: the R0 driver fails three of the four.

## Rollback

- `echo serial > /work/tmp/siltwake-sched/mode`: v1 behaviour, with no redeploy.
- `scripts/heavy/install.sh --uninstall`: every shim falls back to the v1 lock.

## Migration steps (coordinator)

*The [cut-over checklist](#cut-over-checklist) (R4) supersedes these steps where they differ, in particular on retiring v1.*

1. After Sol review, merge this branch into the integration branch, and update the root checkout so the absolute-path `scripts/heavy-check.sh` is the shim.
2. From that checkout, run `scripts/heavy/install.sh`. It installs `mode=serial`. With your approval, add `--slice`, which writes `~/.config/systemd/user/siltwake-heavy.slice` and runs `daemon-reload`. Everything now queues one at a time. Agents already blocked on the old lock keep waiting on the same inode, and no one is cancelled.
3. Canary: `scripts/heavy/install.sh --mode normal`. Then:
   - run one `--class gpu` functional session beside `npm run test:heavy` from another worktree, and a `quick --review` during a playthrough;
   - watch `scripts/heavy-check.sh status` and `/work/tmp/siltwake-sched/ledger.jsonl` for about 2 hours;
   - record p50/p95 queue time, peak slice memory, the `MemAvailable` floor and PSI.
4. Paste the "How to run a heavy job" section of `WORKER_RESOURCE_LIMITS.md` into briefs.
5. After TT-1 merges, run `git apply docs/build/streams/sched1/tt1-test-build-guard.patch`. It was checked against TT-1 `c16abca`:
   - it refuses outside the job;
   - inside the job, `--clean` succeeds and keeps the marker;
   - after that, an outside rebuild is still refused;
   - a stale marker is ignored.

   Until it's applied, `npm test` does not refuse; the usage text says so.
6. After a week of ledger data:
   - calibrate reservations to cgroup p95 + 25%;
   - consider `{"poolMiB": 7168}` in `/work/tmp/siltwake-sched/config.json`;
   - check whether exact repeats exceed about 20% of lane time; that decides the result-receipt cache.
7. Remove the bridge after 7 days with no `legacy-holder` event in the ledger.

After any change to `scripts/heavy/`, re-run `install.sh`. Supervisors already running keep their own version.

## Agent usage text

It is the section "How to run a heavy job (paste into briefs)" in [WORKER_RESOURCE_LIMITS](../WORKER_RESOURCE_LIMITS.md). It covers the classes, the Claude background run, the Codex `submit`/`wait` loop, `status` and `cancel`, exclusive mode, the evidence rule and the exit codes.

## R1 review responses

*Superseded in part by R2:* R1's descriptor-based mechanism (passing fds 3 and 4 into the scope, `alive.lock`) has been replaced by the per-ticket holder. R1's empty-cgroup rule, recovery from `wait`, `status` and `cancel`, the launch gate (F3) and the terrain fingerprint (F4) all stand.

**F1 (P1), the bridge died with the supervisor: fixed.**
- **Bridge:** the shared v1-bridge fd is passed into the scope, where it is held by the in-scope wrapper and the payload for the payload's whole life. A supervisor SIGKILL no longer lets v1 in (regression 12b, with the real v1 script).
- **Liveness:** a per-ticket `alive.lock` gives race-free liveness. The supervisor takes it, and the scope launcher, the wrapper and the payload inherit it, which covers the startup window before the scope is registered.
- **Recovery:** `wait`, `status` and `cancel` run reconciliation themselves, so a lone `wait` reaches a terminal result and reclaims the reservation (regression 9). A finished orphan reports the payload's own exit code, from the wrapper's `stats`.
- **Choice:** the orphaned payload is not killed. It is bounded by its own deadline and still holds the bridge and the reservation.

**F2 (P1), a stopping scope counted as empty: fixed.**
- **Rule:** `scopePopulated()` treats a unit as empty only when it is not loaded or its cgroup reports `populated 0`. A `deactivating` scope isn't empty, and query errors count as populated.
- **Reconciliation:** it keeps the reservation while the ticket's `alive.lock` is held or the cgroup is populated, stops stragglers without blocking, and finishes only when the cgroup is empty.
- **Supervisor:** it uses the same rule for leftovers and retries until the cgroup is empty.
- **Regression:** 9b.

**F3 (P2), cancel before scope creation still ran the command: fixed.**
- **Launch gate:** a per-ticket `flock` on `jobs/<t>/gate` is shared by `cancel` and `scope-run.sh`. Under the gate, `scope-run.sh` checks for cancellation and either refuses to start (exit 75, "cancelled before start; the command did not run") or marks `started`. The supervisor also skips the launch if the cancel is already recorded.
- **Cancel:** under the gate it records the cancellation, then either the launch is prevented, or it stops the scope. It reports only once the ticket has a result and the cgroup is empty.
- **Regression:** the test-10 launch-window case, using the reviewer's held `systemd-run` technique.

**F4 (P2), stale bakes could poison a new store key: fixed.**
- **Local manifest:** it now records `fingerprint` (the full store key: sources, driver, codec, Node, zlib, esbuild). A mismatching fingerprint is stale locally.
- **Publish and restore:** only manifests carrying exactly the current key are published, and restore requires it too.
- **Old manifests:** a manifest from before the store (`sourceHash` only) stays locally fresh, as since S2, so a merge doesn't force a cold bake in every worktree. But it is never published, so old bytes can't seed a new key.
- **Eviction (the report's note):** restore now refreshes the entry's mtime against pruning, re-checks the copied bytes, and treats any failure as a cache miss and bakes. The manifest is written only after a complete restore.
- **Regression:** `tests/bake-terrain-store.test.ts`.

**Notes from the report:**
- **Cross-version fairness:** it is not unconditional. Any v1 holder or waiter pauses v2, so a continuous v1 backlog can hold v2 tickets until their queue timeout; a finite one drains. This is stated in `WORKER_RESOURCE_LIMITS.md` under "Operating it". The fix is moving callers to the shim promptly.
- **`.test-build` guard wording:** the usage text no longer claims `npm test` refuses today. It tells agents not to rebuild a worktree's `.test-build` while that worktree's job runs, and says the refusal arrives with the TT-1 patch. The patch also keeps the job's marker across `--clean`.
- **Marker ordering:** both the supervisor and reconciliation now remove the worktree marker *before* writing the result, so a waiter never sees "done" while the marker is still live.
- **Exit 99:** it stays the approved interface's limitation. The "still pending" line, not the code alone, means pending; the usage text says so.
- **Deviations 1–4 and 6–9:** the wording is unchanged; the reviewer judged them justified or reasonable. Deviation 5 is revised above.

## R2 review responses

The coordinator directed one scheduler-owned, cgroup-based lifetime mechanism instead of patching around descriptor inheritance. It is built as directed: the **per-ticket holder** (`holder.mjs`, above). Payload descriptors are no longer a lifetime signal; the job receives no lock at all. `alive.lock` and `ticketHeld()` are removed.

**R2-F1 (P1), Node background children dropped the bridge: fixed.** The bridge is held by the holder, not by the job's processes. The holder releases only after the job's cgroup is empty. Regression 9c, the closing case with a real v1 waiter: v1 never sees the child alive, including through the 10 s stop grace.

**R2-F2 (P2), an inheriting child prevented cleanup forever: fixed.**
- **Leftovers:** when the foreground command ends, the holder stops anything left in the scope (`leftovers: true`) and waits for the cgroup to empty.
- **Deadline backstop:** the holder stops the scope at deadline + 15 s if the foreground somehow hasn't ended.
- **Recovery** no longer trusts inherited descriptors. A ticket is alive only while its holder's scope (or, before the claim, its supervisor or launcher) holds processes. Without an owner, a populated job scope is stopped and kept reserved until empty.
- **Regressions:** 9c (inheriting case) and 9d (backstop).

**R2-F3 (P2), the guard trusted the supervisor PID: fixed.**
- **Marker:** it now names the ticket's holder and job units. `heavyJobGuard` refuses while either unit's cgroup holds processes; a failed query counts as populated.
- **Kept:** the matching-ticket exception, the `--clean` marker preservation and the marker-before-result ordering.
- **Regression 14b,** plus an end-to-end run of the real patched TT-1 `test-build.mjs` (export of `c16abca` with the patch, private state):
  - outside build while running: refused (1);
  - the job's own build: allowed (0);
  - supervisor alive: false;
  - after the holder SIGKILL, with the job populated in its stop grace: still refused (1);
  - after the job is empty: allowed (0);
  - `wait`: 137.

**Why a separate holder and not a sturdier supervisor:** the supervisor does queueing work and polls the state. The holder is the smallest process that can own a running job, and it exits the moment the job's cgroup is empty. `BindsTo=` means killing the holder can't leak a job.

**Test hazard to flag for the R2 probes:** the supervisor now exits right after the handoff. Probes that `process.kill(t.supervisor.pid, …)` after admission would signal a dead PID, which the system may have reused. The acceptance helpers kill only processes verified by PID plus start time (`killOwned`). The equivalent crash point is now the holder (`t.holder`).

## R3 review responses

**R3-F1 (P1), holder SIGKILL released the bridge: fixed as directed, with an in-scope anchor (`anchor.sh`).**
- **The fd path:** the holder passes its bridge fd to the job's launcher, and `scope-run.sh` hands it to the anchor (as fd 9) before the launch gate and the command. From the moment the launcher is spawned, the fd is carried by the launcher, then `scope-run.sh`, then the anchor, so there's no gap. The command runs with fd 3 closed, so it never holds the bridge.
- **The anchor's life:** it ignores TERM, so a stop of the scope, including `BindsTo` after the holder dies, can't end it before the final SIGKILL. That kill takes it together with every other process in the scope. Kernel exclusion against v1 therefore lasts exactly as long as the job's cgroup.
- **No 10 s wait on the normal path:** the holder, or recovery when the holder is dead, sends USR1 once the cgroup holds only the anchor and its sleep. The anchor PID is verified as a member of that cgroup first. Normal jobs still finish in about 0.7 s.
- **Serial mode** uses the same path.
- **Regression 9e:** the reviewer's four holder-kill cases with a real v1 waiter. All four failed on `c562bed` and pass now.
- **Belt and braces:** the holder also still holds its own bridge reference.

**R3-F2 (P2), the deadline backstop was one-shot: fixed.**
- **Retrying stop:** `stopJob` now runs a stop loop. It checks every `systemctl stop` result, retries failures with backoff (0.5 s, doubling to 10 s), notes the first failure in the job log, and keeps going until the cgroup is conclusively empty, whether or not the foreground has ended.
- **Pending launch:** if the scope isn't registered yet while the launch is still pending, it kills its own launcher.
- **Regression 9f:** the reviewer's probe, with the first stop failing once. It hung on `c562bed` and returns 124 now.

**Residual P3s (recorded, not built):**
- **A job can kill its own anchor.** A command that deliberately SIGKILLs processes in its own scope, such as a `pkill` aimed at everything, could kill the anchor early. That reopens only the v1 window and only while the holder is also dead. v2 accounting is unaffected.
- **The anchor counts against the job's memory reservation:** one `sh` plus one `sleep`, about 1 MB. TT-1's runner moves it into its leaf cgroup along with the job's own processes, which is harmless.
- **Stopping a job scope by hand** (`systemctl --user stop`) while its holder is dead takes the full 10 s grace, unless recovery runs meanwhile and releases the anchor once it is alone.
- **The dead-holder test hazard from R2 still applies to probes:** kill `t.holder` only after verifying its PID and start time.

## R4 review responses

**R4-F1 (P2), a reservation OOM could kill the anchor alone: fixed.** Any OOM at the job's reservation now kills every process of the job at once, the anchor included.
- **Why not `OOMPolicy=kill`, as suggested:** I tried it first. It sets `memory.oom.group` on the scope, but systemd then *also* stops the whole scope on any OOM kill in its subtree. A TT-1-style per-file OOM in a delegated child killed the entire job: test 6b failed, and the journal shows "Failed with result 'oom-kill'" for that per-file case.
- **What is built instead:** the same kernel guarantee, without systemd's reaction. `scope-run.sh` moves itself into its own child cgroup `job`, enables the available controllers, and sets `memory.oom.group=1` on it. The anchor and the command start inside it. The scope keeps `OOMPolicy=continue`, stated explicitly. If that setup fails, the job refuses to run (exit 70).
- **Kernel semantics this relies on:** the kernel group-kills the highest cgroup with `oom.group` set between the victim and the OOM domain.
  - **Reservation OOM:** the domain is the scope, so all of `job` dies, wherever the victim was.
  - **TT-1 per-file OOM:** the domain is that file's cgroup, nested under `job`, so only that file dies.
- **Composes with TT-1:**
  - Test 6b passes.
  - TT-1's real `scripts/heavy-containment.mjs` at `c5992ad` ran inside a private SCHED-1 job (`standard --mem 1G`). It chose cgroup mode with sharing and saw the 1,024 MiB grant. A normal tiny file passed. An over-budget file was killed by its own 128 MiB cgroup (`killed: true`) while the runner survived. The job exited 0 with `reservationOom: false` and a sub-limit note.
- **Attribution:** a reservation OOM is still reported as `oom`. If the wrapper survived, it records `memory.events.local` as before. If the group kill took the wrapper too:
  - the holder, outside the memory domain, watches the scope's `memory.events.local` with inotify and keeps what it sees (also in `jobs/<t>/oom-local`, for recovery);
  - failing that, a wrapper SIGKILLed with no stop of ours is attributed to the group kill, since nothing else in the scheduler does that.

  The result records which evidence applied (`oomEvidence`) and falls back to systemd's `MemoryPeak` and `CPUUsageNSec`. Job scopes are no longer `--collect`ed, so a failed unit's accounting can be read; `unitFacts()` then resets it.
- **Regressions:**
  - **6c:** the reviewer's memfd case with a real v1 waiter and a holder kill. The anchor is made the first OOM victim (`oom_score_adj=1000`), so the dangerous order happens every time rather than only when victim selection picks it.
  - **6 (revised):** a reservation OOM kills the whole job.
  - **6b:** a per-file OOM doesn't.
  - **9e and 9f:** still pass.
- **Correction to my R3 report:** my R3 claim that 9e failed on `c562bed` came from a mutation harness without the v1 source, so it may have been an artefact. Rechecked with the source available (`SCHED1_V1_REPO`): 9e does fail on `c562bed` for the real reason, "v1 entered 38 ms after the holder died, with the old payload alive". The tests now assert that the v1 source is present.

**P3s from the R4 report (recorded, not built):**
1. **A job deliberately killing its own anchor while its holder is also dead.** A compound, non-cooperative action. An ordinary reservation OOM is no longer in this class (R4-F1).
2. **Anchor overhead:** an `sh` and a `sleep` (about 1.8 MiB RSS including shared pages) count against the reservation.
3. **Manual stop with a dead holder:** a TERM-ignoring anchor can take the 10 s stop grace unless recovery releases it once it is alone. The latency is bounded.
4. **Anchor identity for USR1:** `anchor.pid` is a bare PID, checked for membership of the job's cgroup subtree, with a check-to-signal race. Same-subtree PID reuse after the anchor's death could satisfy the test. None was observed. If stronger identity is ever needed, record the start time with the PID, or use a pidfd.
5. **Disclosed limits that stand:**
   - per-ticket supervisor and follower cost;
   - finite-backlog-only fairness while v1 copies remain;
   - exit 99, told apart by the "still pending" line;
   - the GPU lease is enforced only in the wired drivers;
   - light work outside the lane can disturb a measurement;
   - the TT-1 guard is a composition prerequisite;
   - an inferred OOM label when the holder's watch missed the event (`oomEvidence` says so).

## Cut-over checklist

This is the reviewer's checklist from R4, with the coordinator's added step 7. It doesn't approve any candidate: the first step is a fresh ACCEPT.

1. **Accept and compose.**
   - Get a fresh ACCEPT on the corrected frozen source, plus coordinator inspection.
   - Compose TT-1 and apply `docs/build/streams/sched1/tt1-test-build-guard.patch` to the integrated runner.
   - Verify that the marker survives `--clean`, that delegated containment works (now under the `job` cgroup), and the affected package scripts.
2. **Install in serial.**
   - Update the integration and root checkouts and the active callers' shims.
   - Run `scripts/heavy/install.sh --mode serial`. Add `--slice` under the coordinator's approval.
   - Verify the installed version contains `anchor.sh` and the `job` OOM group.
   - Preserve the legacy lock's inode throughout: never remove or recreate it, and never cancel other agents' old waiters.
3. **Verify the limits** on this 8-vCPU host:
   - 6 pool tokens and 1 express token;
   - a 6 GiB pool plus 2 GiB express;
   - a slice CPU quota of 700%, with zero swap;
   - each job's own cap and delegation before its payload.

   Confirm that serial jobs run alone, legacy waiters drain, and detached `wait` and `cancel` work. Run the OOM-plus-holder-death regression (6c) privately.
4. **Switch with `scripts/heavy/install.sh --mode normal`.** From separate worktrees:
   - run one leased GPU functional job beside `npm run test:heavy`;
   - run a `quick --review` during a playthrough, and check express admission;
   - use exclusive mode for any performance number.

   Follow the browser rules for the GPU canary.
5. **Observe for about 2 hours:** `status`, the per-job logs and `/work/tmp/siltwake-sched/ledger.jsonl`.
   - **Numbers:** queue p50/p95; grants and express use; peak slice memory; the `MemAvailable` floor; memory PSI.
   - **Faults:**
     - orphaned tickets without terminal recovery;
     - reservations persisting after empty scopes;
     - duplicate terminal records;
     - `oom`, `deadline` and `killed` labels (with `oomEvidence`);
     - cancellation failures;
     - repeated stop errors;
     - tree-change warnings;
     - `legacy-holder` events.
6. **Roll back if the canary fails.**
   - `echo serial > /work/tmp/siltwake-sched/mode` immediately; running jobs drain and are not preempted.
   - To remove v2: stop new submissions, let admitted work drain, resolve or cancel only your own queued tickets, then run `scripts/heavy/install.sh --uninstall`.
   - Preserve the state and the old lock's inode. Detached tickets keep their installed version, which stays reachable by absolute path.
7. **Retire v1 promptly at cut-over** (coordinator, R4).
   - Merge root (the shim) into every active worktree at cut-over. Inventory absolute-path callers, update briefs, and check the command each agent actually uses.
   - Once that inventory is clear, retire v1 without waiting out the decision's seven quiet days. The bridge then only protects stale copies.
   - Ledger sampling can miss a short v1 job, so the inventory, not a quiet ledger, is the evidence.
8. **After a week:** calibrate reservations to cgroup p95 + 25%, keeping the 6 GiB pool until measurements justify a change. Revisit result caching from the recorded repeated-work share. Re-install after any scheduler change; running tickets keep their own immutable code.

## Known limits and follow-ups

- **Process cost:** every queued ticket has a Node supervisor of about 45 MB, and every `run` or `wait` caller a follower.
- **Admission latency:**
  - after a job ends, about 1 s;
  - after a v1 job releases the lock, up to 2 s;
  - after host memory recovers, up to 15 s.
- **The ledger has no report script yet.** Use `jq` on `ledger.jsonl`.
- **Unlabelled GPU work isn't detected.** Only the four shared drivers enforce the lease; per-stream play scripts don't.
- **Measurements are labelled, not protected.** Fast tiers outside the lane can still disturb an exclusive measurement. The run is marked `DISTURBED` (CPU PSI some ≥ 10%, or memory full ≥ 1%), not prevented.
- **Until TT-1 merges:**
  - `test:build` rebuilds `.test-build` clean, about 47 s, inside the lane;
  - the clean rebuild deletes the marker;
  - the `.test-build` guard isn't wired in.
- **Same-worktree `npm test` is blocked by design** while that worktree's heavy job runs.
- **`wait`'s 99 can collide with a job's own exit 99.** The "still pending" line tells them apart.
- **The legacy nested-call check trusts the `siltwake-heavy-*` scope name.**
- **Without `--slice` there is no aggregate CPU quota.** Per-job caps and the pool still bound memory.
- **The terrain store keeps 20 entries,** about 400 MB, in `/work/tmp/siltwake-terrain-store`.
- **Bridge gap: closed** by the in-scope anchor (R3) and the job's OOM group (R4). Only P3 1 above remains: a job deliberately killing its own anchor while its holder is also dead.
- **Next stream (decision §3):** the `stepGame` per-tick clone.

**Incident (mine).** While testing the terrain store, a bad test command (`/usr/bin/time` is absent) ran **one cold terrain bake outside the heavy lock**: 35 s, 4 workers. A second bake started for up to 12 s before `timeout` stopped it. Both ended; nothing else was affected. I redid the test with a guard that refuses to bake.
