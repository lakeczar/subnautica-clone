# SCHED-1: heavy-check v2 admission queue

Builder: Opus 5.5, branch `t3/sched-1-heavy-queue`. **R1 and R2 fixes applied:**
- R1: review `506f3a4`, `docs/build/reviews/SCHED-1-SOL-XHIGH-R1.md` on `review/sched-1-r1`; see [R1 responses](#r1-review-responses).
- R2: review `5ae3b3a`, `docs/build/reviews/SCHED-1-SOL-XHIGH-R2.md` on `review/sched-1-r2`; see [R2 responses](#r2-review-responses). Design: `DECISION-OPUS.md` on `research/perf-decision` (`fd4cdcd`), approved by the owner on 2026-10-22. It is built in its five phases. Phases 3 (slice install) and 5 (canary and cut-over) are the coordinator's steps below. The branch is merged up to `feat/siltwake-first-expedition` `f0eb2b1`.

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
  - launches the job scope (capped, delegated, in `siltwake-heavy.slice`, `BindsTo=` the holder) and passes it no lock;
  - stops the scope once the foreground ends, or at the whole-job deadline;
  - waits until the job's cgroup reports `populated 0`, failing closed on query errors;
  - then removes the worktree marker, writes the result and ledger, frees the reservation, and exits, which releases the bridge.
- `scope-run.sh`: runs inside the job's scope. It checks the scope's limits, applies the deadline, and records `memory.peak`, OOM kills and CPU time before the scope disappears.
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
   - **Holder killed:** `BindsTo` stops the job. Recovery (any transaction, `wait`, `status`, `cancel`) keeps the reservation until that cgroup is empty, then finishes the ticket.
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
- `node --test --test-concurrency=1 scripts/heavy/acceptance.test.mjs` uses private state, slice, units and lock, with sleep and allocation payloads. After R2 it passes 20 of 20: the decision's tests except 4, plus 6b, 9b, 9c, 9d, 12b and 14b.
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
| 6 | Whole-tree containment | pass: grandchild OOM, exit 137 with the `oom:` label from `memory.events`, reservation freed, neighbour exits 0 |
| 6b | Delegation (added) | pass: a TT-1-style per-file cgroup OOM stays inside the job and is not relabelled |
| 7 | Exclusive drains | pass: `lane`/`exclusive` blocking, express shut, runs alone with 6 cpu, 6 GiB and the GPU, load and PSI recorded |
| 8 | Detach | pass: caller's process group SIGKILLed, job finishes, a fresh `wait` exits 7, resubmit joins the same ticket |
| 9 | Crash recovery (R2: revised) | pass: the supervisor has exited after the handoff and the job finishes normally (exit 5). Then, with the holder SIGKILLed and nothing else queued, `BindsTo` stops the job, a lone `wait` returns 137 "killed: its holder died", and the reservation is reclaimed only with the cgroup empty. Same PID with a different start time is not alive |
| 9b | Stopping scope (R1, F2) | pass: TERM-resistant payload, scope `deactivating`, holder killed: an exclusive job stays `blocked-by lane` and the old job stays reserved until the cgroup is empty; the exclusive payload then sees the old PID gone |
| 9c | Background children (R2-F1, R2-F2) | pass, two cases: a shell `sleep 120 &` that inherits every descriptor, and a TERM-ignoring Python child started by Node `spawn` with `stdio: 'ignore'` (fds 0–2 only). In each the foreground exits 0 with the supervisor gone and a real v1 waiter queued. v1's own command never sees the old child alive. In the TERM-ignoring case v1 waits out the 10 s stop grace. `wait` returns 0 with `leftovers: true`, and the scope is empty |
| 9d | Whole-job deadline (R2-F2) | pass: the payload SIGSTOPs its own `timeout`, so the foreground can't end; the holder's backstop stops the scope at deadline + 15 s; a lone `wait` returns 124 "deadline 2s exceeded" |
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
- **Residual bridge gap (narrowed in R2).** Only a SIGKILL of the *holder* itself releases the bridge before the job's cgroup is empty. `BindsTo` then stops the job, but a TERM-ignoring process can linger for the 10 s stop grace while v1 enters. The v2 reservation is still held until the cgroup is empty. Supervisor death, and any descriptor behaviour of the job, no longer opens a gap.
- **Next stream (decision §3):** the `stepGame` per-tick clone.

**Incident (mine).** While testing the terrain store, a bad test command (`/usr/bin/time` is absent) ran **one cold terrain bake outside the heavy lock**: 35 s, 4 workers. A second bake started for up to 12 s before `timeout` stopped it. Both ended; nothing else was affected. I redid the test with a guard that refuses to bake.
