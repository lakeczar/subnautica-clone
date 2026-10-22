# SCHED-1: heavy-check v2 admission queue

Builder: Opus 5.5, branch `t3/sched-1-heavy-queue`. Design: `DECISION-OPUS.md` on `research/perf-decision` (`fd4cdcd`), approved by the owner on 2026-10-22. It is built in its five phases. Phases 3 (slice install) and 5 (canary and cut-over) are the coordinator's steps below. The branch is merged up to `feat/siltwake-first-expedition` `f0eb2b1`.

## What's built

**Scheduler:** `scripts/heavy/`, Node with no dependencies.
- `policy.mjs`: the pure decision `(state, now, host) → admit/blocked`. It covers:
  - classes and the pools (`T = nproc − 2` tokens, `M` = 6 GiB, 1 GPU);
  - the express slot;
  - aging, the 10-minute reservation and the exclusive drain;
  - one job per worktree;
  - refusal of impossible requests, coalescing and serial mode.
- `state.mjs`: the state file under a kernel `flock`, which util-linux `flock(1)` takes on an fd this process owns, so it is released if the process dies. It also handles PID plus start-time liveness, the `/proc/locks` bridge, host sampling and reconciliation.
- `supervisor.mjs`: one detached supervisor per ticket, in its own systemd scope. It admits, runs the job in a capped, delegated scope in `siltwake-heavy.slice`, writes the result and the JSONL ledger, and frees the reservation.
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
5. **A dead supervisor's running scope is stopped,** not just un-reserved. Freeing the reservation while the job still runs would overcommit.
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
- `node --test --test-concurrency=1 scripts/heavy/acceptance.test.mjs` uses private state, slice, units and lock, with sleep and allocation payloads. Run 4 passed 14 of 14, plus 6b.
- `tests/heavy-sched-policy.test.ts` passed 18 of 18.
- `npm test` passed 1,275 tests in 124 files.

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
| 9 | Crash reconciliation | pass: killed supervisor's scope stopped and freed (137); same PID with a different start time is not alive |
| 10 | Cancel and expiry | pass: queued removal; running cancel stops only that scope (75); queue limit gives 75 |
| 11 | `wait` | pass: `--max` gives 99 with a position line; then the job's code; 124 and 0 |
| 12 | Legacy bridge | pass: with the real v1 script (`1ccce66`), a v1 holder blocks v2; a v1 waiter pauses v2 until it has run; the inode is unchanged |
| 13 | Nested calls | pass: inline in the same scope; nested `gpu` and `exclusive` refused; forged ticket and forged `LOCK_HELD` refused |
| 14 | Per-worktree and guard | pass: `blocked-by worktree`; the guard refuses outside the job and allows the job itself |
| 15 | Serial switch | pass: serial runs one at a time with v1 env; flipping to normal re-resolves waiting tickets, which then overlap |

**Also checked:**
- the installer: idempotent, starts serial, `--uninstall`;
- the shim running v2;
- the v1 fallback parsing v2 options, with the GPU lease and delegation;
- `submit` on v1 giving a clear exit 2;
- `systemd-analyze verify` on the slice unit;
- the terrain store: seed from an up-to-date tree, restore in 0.1 s byte-identical, a corrupted entry refused.

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
5. After TT-1 merges, run `git apply docs/build/streams/sched1/tt1-test-build-guard.patch`. It was checked against TT-1 `34c08a0`: it refuses outside the job, allows the job itself, and ignores a stale marker.
6. After a week of ledger data:
   - calibrate reservations to cgroup p95 + 25%;
   - consider `{"poolMiB": 7168}` in `/work/tmp/siltwake-sched/config.json`;
   - check whether exact repeats exceed about 20% of lane time; that decides the result-receipt cache.
7. Remove the bridge after 7 days with no `legacy-holder` event in the ledger.

After any change to `scripts/heavy/`, re-run `install.sh`. Supervisors already running keep their own version.

## Agent usage text

It is the section "How to run a heavy job (paste into briefs)" in [WORKER_RESOURCE_LIMITS](../WORKER_RESOURCE_LIMITS.md). It covers the classes, the Claude background run, the Codex `submit`/`wait` loop, `status` and `cancel`, exclusive mode, the evidence rule and the exit codes.

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
- **Next stream (decision §3):** the `stepGame` per-tick clone.

**Incident (mine).** While testing the terrain store, a bad test command (`/usr/bin/time` is absent) ran **one cold terrain bake outside the heavy lock**: 35 s, 4 workers. A second bake started for up to 12 s before `timeout` stopped it. Both ended; nothing else was affected. I redid the test with a guard that refuses to bake.
