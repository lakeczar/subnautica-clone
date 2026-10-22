# Decision: how heavy jobs share factory-worker (Opus 5.5)

2026-10-22. Design decision on `research/perf-decision`, taken after reading [A, lock and scheduling](https://github.com/lakeczar/subnautica-clone/blob/research/perf-a/docs/build/perf/ANALYSIS-A-LOCK.md) (`b363f3e`), [B, test cost and reuse](https://github.com/lakeczar/subnautica-clone/blob/research/perf-b/docs/build/perf/ANALYSIS-B-TESTCOST.md) (`0d9b9f3`) and [C, capacity](https://github.com/lakeczar/subnautica-clone/blob/research/perf-c/docs/build/perf/ANALYSIS-C-CAPACITY.md) (`5d729b1`) in full, plus `scripts/heavy-check.sh`, `WORKER_RESOURCE_LIMITS.md`, `DIRECTION.md`, the review gate and TT-1's WIP (`feat/tt-1-test-speed` at `0a429f9`). Nothing shared was changed. The few light checks I ran are listed at the end.

## Verdict

**The lock is the problem, not the machine.** Today one job holds the whole VM. While a playthrough runs on two cores, the GPU sits idle, around 8 GiB of RAM is free, and a reviewer's 40-second check waits 15–25 minutes behind it. At 21:18 UTC today the load average was 1.2, one playthrough held the lock, and three more jobs were blocked behind it.

**What I decided:**

1. **Replace the single lock with a small admission queue.** It shares out three things:
   - **4 CPU "tokens"** on today's 6 vCPUs. That becomes 6 tokens at 8 vCPUs, automatically.
   - **6 GiB of memory**, enforced by the kernel across each job's whole process tree.
   - **The one GPU.**

   Each kind of job asks for a fixed amount. Typical pairs then run side by side: a GPU play session next to a playthrough, or the heavy test suite next to a GPU session.

   On top of that, **one "express" slot always stays open for a short (≤10 min) check**, so a reviewer never waits behind a 25-minute session. Reviews and short checks jump the queue. Long jobs gain priority as they wait, so nothing starves.

   Frame-time and performance measurements get an **exclusive mode** that empties the queue first. They are the only jobs that still need the machine to themselves.
2. **Agents stop polling.** A submitted job becomes a ticket that runs on its own, detached from the agent's tool call:
   - **Claude Code agents** run it in the background and are woken when it finishes.
   - **Codex agents** call a `wait` command that blocks for up to 9 minutes, then call it again.

   Either way, a timeout never loses the job or its place in the queue.
3. **Reuse: do the cheap, safe things now; skip the risky cache.**
   - **Now:** remove the duplicate typecheck, stop wrapping already-locked scripts in a second lock, and share terrain bakes between worktrees, which saves about 3 minutes per fresh worktree.
   - **Not now:** a result cache shared between author and reviewer, and automatic selection of affected tests. The new queue will log enough to show whether the cache would ever hit, so it can be decided later from data.
   - **Never:** cached results in place of gameplay or GPU evidence, or in place of the full check before integration.
4. **The biggest remaining speed-up is not in the test system.** The CPU is the real limit: the machine was 94% busy in C's sample. About 70% of simulation time goes to copying the whole game state every tick. Making that cheaper is worth its own stream once composition settles.
5. **Machine:** ask fleet for **8 vCPUs**. 10 vCPUs is not worth it: memory runs out first, and the host only has 12 threads. **20 GiB of RAM** is worth more than 10 vCPUs, but only if fleet confirms the host can spare it.
6. **One Opus builder can build this in one stream** (about 1–2 days), with the tests and the migration below. While the cut-over happens, old copies of the script keep working safely, so nobody has to stop work.

## Side by side

| Question | A (lock) | B (test cost) | C (capacity) | **This decision** |
| --- | --- | --- | --- | --- |
| Replace the single lock? | Yes: broker with CPU/memory/GPU reservations | Keep the lock; reuse first | Yes: queue for *all* compiles, suites and bakes | **Yes, heavy work only.** A queue with CPU tokens, a memory pool and a GPU lease. The fast tier stays outside it |
| CPU tokens (6 vCPU) | 4 | – | 4 | **4** (`nproc − 2`), plus one express token for a short check |
| Heavy memory pool | 6 GiB | – | 7.5 GiB | **6 GiB**, plus 2 GiB for the express slot. Kernel cap on the slice: 8 GiB |
| GPU job reservation | 2 CPU / 3 GiB | – | 2 CPU / 4 GiB | **2 / 3 GiB.** The measured maximum was 2,074 MiB |
| Unlabelled jobs | Exclusive, 6 GiB | – | Exclusive until profiled | **`standard`: 2 tokens / 3 GiB.** An OOM kill tells the caller to relabel |
| Priority | 4 levels, age one level per 5 min, reserve for the head after 10 min, one job per owner | – | Critical path first, with aging | **Agree with A.** Add the express slot |
| Implementation | Long-lived broker process | – | Dispatcher with a fresh checkout per job | **No daemon.** A detached supervisor per ticket and a state file under `flock`; systemd tracks liveness. Jobs run **in place** |
| How agents wait | Queue position output, separate queue and run deadlines | – | Durable result, lease | **Ticket plus background run (Claude) or a re-armable 9-minute `wait` (Codex)** |
| Reuse | Narrow follow-up checks | Input-keyed receipts this week; dedup compiles; shared bakes; selection next | Dedupe identical runs only | **Now:** compile hygiene and the shared terrain store. **Later:** receipts (after measuring hit rate) and selection |
| Simulation cost (`stepGame` clone) | Separate | "Later 1" | – | **Next stream after the scheduler.** It is the only lever that adds throughput |
| VM | 8–10 vCPU raises tokens; same RAM | – | 8 vCPU, 16 GiB; 20 GiB conditional; 10 only after comparison | **8 vCPU now. 20 GiB before 10 vCPU, conditional on host headroom** |
| Rollout | Instrument with the lock first, then canary, then queue | – | Keep the lock until the scheduler is reviewed | **Ship the ledger with v2, plus a one-file switch back to serial mode.** Bridge the old lock with shared/exclusive `flock` |

### Where I disagree, and why

**With A.**
- **Unknown jobs should default to `standard` (2 tokens, 3 GiB), not exclusive.**
  - Most real calls are ad hoc `node --test …heavy…` or small browser drivers. Making them exclusive keeps exactly the head-of-line blocking we are removing.
  - A's own journal shows whole-scope p90 at 1,677 MiB and a GPU maximum of 2,074 MiB. Only one historical job, a large-cave bake verification at 5,544 MiB, exceeded 3 GiB.
  - Because the kernel caps each job, a wrong guess becomes an explicit OOM. The job stops and the message says "rerun with `--class exclusive`". It doesn't take down the host.
  - The large-cave lab bake is labelled exclusive by name until it has been re-profiled.
- **No broker daemon.**
  - A spends a paragraph on broker restart and reconciliation. Without a daemon, that problem disappears.
  - Instead, each ticket is its own detached supervisor that admits itself through a millisecond transaction under `flock` on one state file.
  - Liveness comes from systemd (`is-active` on the job's scope) and from PID plus start time. That is the source of truth A wants anyway.
- **No instrumentation-only phase that keeps the lock.**
  - A's journal (486 scopes) already is the baseline.
  - The ledger ships inside v2, and `echo serial > /work/tmp/siltwake-sched/mode` turns v2 back into v1 behaviour without a redeploy.
  - Another day of 13–36 minute waits just to collect a baseline we already have isn't worth it.
- **No per-job hard `CPUQuota`.**
  - Per-job quotas throttle a job even when the machine is otherwise idle. A shows long idle gaps.
  - Instead, the slice gets a single `CPUQuota` (tokens + 1) × 100%.
  - Each job gets `CPUWeight` proportional to its tokens, and its worker counts (`SILTWAKE_JOB_CPUS`) match its tokens.
- **No CPU-pressure brake on admission.**
  - The CPU pressure comes mostly from fast tiers *outside* the lane (C: CPU some-pressure 55.8% while the lane ran one playthrough).
  - Braking heavy admission on it would starve reviews behind builders' edit loops.
  - Tokens already bound the lane. The memory brake stays, because memory failures are fatal and CPU contention only slows things down.

**With B.**
- **Scheduler first, reuse second.**
  - The measured pain is waiting, not repeated work. Reuse reduces volume but can't stop a 40-second review from waiting behind a 25-minute GPU session.
  - B's own measurement attempts died with exit 75 after 1,800 s in the queue, which is the clearest evidence.
- **Input-keyed receipts: later, not "this week".**
  - A wrong key fails silently: it produces a pass for a tree that was never tested, at the review gate.
  - Getting the input closure right is hard. Tests read `docs/content/BIBLE.md`, there are computed imports, and TT-1's cache hashes absolute paths.
  - The likely hit rate is low. Coordinator reruns after a merge are new trees, author iterations are new trees, and reviewers already run focused checks (B's own examples).
  - The v2 ledger records the tree hash and command for every job, so a week of data tells us the would-be hit rate for free. Build it only if exact repeats exceed about 20% of lane time.
- **Verification receipts: no.** Use a policy instead: run `bake-terrain --verify` when terrain inputs change, and always in the composed integration check. A fresh verify at the gate is the point of the check.
- **Cross-worktree compiled-output sharing: not worth it.**
  - TT-1's incremental build already takes a warm rebuild to 5–9 s.
  - A cold reviewer worktree pays about 47 s once.
  - Sharing would need TT-1's absolute-path keys rewritten.
- **`stepGame` cloning moves up from "Later 1" to the next stream.**
  - C measured the CPU at 94.6% busy, and TT-1 attributes about 70% of simulation-test time to the per-tick `structuredClone`.
  - Everything else in all three reports redistributes CPU. This is the only item that creates it, for playthroughs, the fast tier and the game itself.

**With C.**
- **Don't queue the fast tier, compiles or warm builds.**
  - `npm test` is the edit loop. The coordinator alone submitted it 25 times in three days (B), and after TT-1 it takes 60–100 s.
  - Queuing it behind 25-minute playthroughs brings back the latency problem in its worst place.
  - On 6 vCPUs, C's own 4-token fast-suite reservation would take the whole lane.
  - TT-1 already bounds fast concurrency at `min(5, cores − 1)` and per-file CPU. It stays where it is.
- **6 GiB pool, not 7.5 GiB.**
  - C's 7.5 GiB assumed fast suites inside the pool. With them outside, the extra headroom has to stay with them.
  - Fast-tier processes run inside T3's agent slice, which has charged 4.1–6.8 GiB.
  - The guest's 4.2 GiB swap is already full of cold pages, so in practice there is no swap cushion.
- **GPU reservation of 3 GiB, not 4.** C's 4 GiB came from an older software-browser estimate. The measured 3090 sessions peak at 2,074 MiB in their cgroup (A).
- **No fresh checkout per job.**
  - A cold checkout pays roughly 47 s of compile and 172 s of bake, and starts TT-1's caches cold, on every job.
  - In place, plus a record of the tree state and a `.test-build` guard (below), gives the same safety.
- **Cold bake gets 2 tokens with `BAKE_WORKERS=2`, not 4.** Cold bakes are 2.9% of lane time (A), and the shared terrain store makes them rarer still.

**Rulings where the reports conflict.**
- **Memory pool:** A's 6 GiB, because I reject C's premise that everything goes through the queue.
- **GPU reservation:** A's 3 GiB, because it rests on measurement.
- **Ordering:** scheduler first (A and C over B).
- **VM:** C's request, with the RAM step ranked above 10 vCPUs.

## 1. Admission model

### Pools

| | 6 vCPU / 16 GiB (now) | 8 vCPU / 16 GiB | 8 vCPU / 20 GiB |
| --- | ---: | ---: | ---: |
| CPU tokens `T` | **4** | **6** | **6** |
| Memory pool `M` (sum of reservations) | **6 GiB** | 6 GiB, then **7 GiB** after a week of ledger calibration | **9 GiB** |
| Express slot (one job of class `quick`, outside `T` and `M`) | +1 token, +2 GiB | same | same |
| GPU leases | 1 | 1 | 1 |
| Slice `siltwake-heavy.slice` | `MemoryMax=8G`, `MemorySwapMax=0`, `CPUQuota=500%` | 8–9G, `CPUQuota=700%` | 11G, `CPUQuota=700%` |
| Host brake | Admit only if `MemAvailable − Σ(reservation − current charge of running jobs) − new reservation ≥ 2 GiB`, and memory PSI `full avg10 < 1%` | same | same |

`T` is computed as `nproc − 2` at each admission, so a vCPU change needs no redeploy. `M` comes from a config file, because RAM headroom has to be measured, not derived.

### Job classes

Each job runs in its own systemd scope inside the slice. The scope's `MemoryMax` is its reservation, `MemoryHigh` is 90% of that, and swap is 0. The cap applies to the whole process tree, so a child process's memory is counted. That fixes the gap A found in parent-RSS budgets, where `regions-bake` shows 54 MiB at the parent but 1,462 MiB in the tree. Admission adds up reservations, not observed RSS, and the ledger records each scope's `memory.peak`.

| Class | For | Tokens (6 / 8 vCPU) | Memory | GPU | Max run | Base priority |
| --- | --- | ---: | ---: | :---: | ---: | ---: |
| `quick` | Focused review checks, 1–3 heavy files, smokes | 1 | 2 GiB | – | 10 min | 1 |
| `standard` (default) | Anything unlabelled | 2 | 3 GiB | – | 20 min | 2 |
| `heavy-suite` | `npm run test:heavy` (TT-1 pool runs at 2 files) | 2 / 3 | 3 GiB (max 5 GiB) | – | 25 min | 2 |
| `gpu` | Task-owned Chrome play, screenshots, functional GPU checks | 2 | 3 GiB | 1 | 25 min | 2 |
| `playthrough` | `npm run playthrough` (`--jobs` = tokens) | 2 / 3 | 2 GiB (max 3 GiB) | – | 30 min | 3 |
| `bake` | Cold bake, `--verify` | 2 | 3 GiB | – | 15 min | 2 |
| `exclusive` | Frame-time and perf measurements, the large-cave lab bake, known-huge jobs | all | `M` | 1 | 30 min | 3, drains |

- **Overrides.** `--cpus` and `--mem` may raise a request up to the class maximum. A request above the class maximum or above the pool is refused at once with exit 2, rather than queued forever.
- **Reviews.** `--review` (Sol reviewers and the coordinator's composed gate) lowers the base priority by 1.
- **What the job sees.** It receives the following environment, so worker counts match the reservation:
  - `SILTWAKE_JOB_CPUS` and `SILTWAKE_JOB_MEM_MIB`;
  - `SILTWAKE_HEAVY_CONCURRENCY` and `SILTWAKE_HEAVY_POOL_MIB` (the reservation minus 512 MiB), which TT-1's heavy pool already reads;
  - `BAKE_WORKERS`;
  - `SILTWAKE_HEAVY_LOCK_HELD=1`, so old nested scripts pass through.

Examples on 6 vCPU:

| Running together | Tokens | Memory |
| --- | ---: | ---: |
| GPU + playthrough + express check | 4 + 1 | 5 + 2 GiB |
| GPU + `heavy-suite` | 4 | 6 GiB |
| `heavy-suite` + playthrough | 4 | 5 GiB |
| Two `standard` + a playthrough | 6 | 8 GiB: doesn't fit, so the third job waits |

### Queue order

- **Effective priority** = base − ⌊minutes waited / 5⌋. Equal priorities run in arrival order.
- **Backfill.** Scan the queue in priority order and start every job that fits.
- **Head reservation.** Once the head has waited 10 minutes, nothing else may start from the pools until it does. The express slot doesn't use pool resources, so it may still run.
  - So the longest a job can wait behind others is the remaining run time of whatever is running, at most 30 minutes.
- **Exclusive jobs.** When an `exclusive` job reaches the head, nothing new starts, including the express slot. It starts once the lane is empty.
  - The ledger records load and PSI during the run, so a measurement disturbed by unqueued work outside the lane is labelled.
- **One running job per worktree.** Later jobs from the same worktree queue behind it. Reviewers have their own worktrees, so this never blocks a review behind its author.
- **No preemption.** A running session is never killed for priority. Long work yields at its own scenario or segment boundaries, as the 20–30 minute session rule already asks.

### Limits

- **Run deadline.** `--deadline` still counts from admission, and is clamped to the class maximum.
- **Queue limit.** A ticket that hasn't started after 2 hours expires with exit 75 (`--queue-timeout` to change it).
- **Deadline exit.** A job that passes its deadline exits 124.
- **OOM.** An OOM is identified from the scope's `memory.events`, not guessed from exit code 137. It is reported as `oom: class C reservation N MiB; rerun with --class … or --mem …`. It is never retried with a larger cap automatically.

## 2. How agents wait

The job no longer runs inside the agent's tool call. `submit` starts a detached supervisor (`setsid`, so the caller's environment is kept). The supervisor queues the job, admits it, then runs it in its scope. Output goes to `/work/tmp/siltwake-sched/jobs/<ticket>/output.log`.

```sh
H=/home/worker/.t3/projects/subnautica-clone/scripts/heavy-check.sh
$H [--class C] [--review] [--deadline S] [--cpus N] [--mem 3G] -- CMD…  # run: submit, then follow to the end (v1-compatible)
$H submit [same options] -- CMD…   # prints a ticket id at once
$H wait TICKET [--max 540]         # blocks up to --max; exits with the job's code, or 99 if still pending
$H status [TICKET]                 # queue: ticket, worktree, class, state, waited, blocked-by (cpu|memory|gpu|head|worktree)
$H log TICKET [-f]
$H cancel TICKET
```

- **Claude Code agents:** use the plain `run` form with Bash `run_in_background: true` and a timeout up to 7,200,000 ms. The harness wakes the agent when the job exits, so no polling is needed and the agent keeps working meanwhile.
- **Codex agents** (or any agent without background notification): `submit`, then `wait T --max 540` in a tool call with `timeout_ms ≥ 570000`. If it exits 99, the job is still pending; call `wait` again. Each call blocks without using tokens, returns the moment the job ends, and never loses the queue position.
- **Coalescing.** If the same command is submitted from the same worktree with an unchanged tree while a matching ticket is queued or running, the existing ticket is returned. A retry after a lost tool call therefore never doubles the work. This is the safe part of B's coalescing idea.
- **Exit codes:**
  - the job's own code, or 124 if it passed its deadline;
  - 137 with an `oom` or `killed` label;
  - 75 for a cancelled or expired ticket;
  - 99 for "still pending" (from `wait` only);
  - 2 for a usage error or a request that can never fit.

**What gets tested.** A job tests the worktree as it is **at admission**. `submit` records `HEAD` and a hash of the uncommitted diff, and admission records them again. The final line prints both and warns if they differ. Agents should commit before submitting anything that will serve as handoff or review evidence.

Agents will now edit and run `npm test` while their heavy job waits, and both tiers write `.test-build`. So:
- `test:heavy` compiles **inside** the admitted job. TT-1's incremental compile makes that 5–9 s.
- The wrapper writes `.test-build/.heavy-job` (ticket and PID) while that worktree has a job running.
- TT-1's `scripts/test-build.mjs` refuses to rebuild while that marker names a live ticket, and says why.

## 3. Reuse: what to do now, later, never

| Item | Decision | Why |
| --- | --- | --- |
| Don't wrap `npm run test:heavy` in an outer `heavy-check.sh`. Compile the playthrough before submitting. Never queue `build` or typecheck | **Now**, in the scheduler stream (docs and `package.json`) | Takes about 47 s and 19 s of compile per run out of the lane (B). Costs nothing |
| `check` drops the second typecheck in `build` (use `test:fast`'s, run on the same tree) | **Now**, after TT-1 merges | About 21 s and 15 CPU-s per check (B). One script line |
| Shared terrain bake store, keyed by the bake's own metafile closure with relative paths, the bake script and codec, and the Node and esbuild versions. Immutable entries, restored by copy | **Now**, a small separate task for any builder | 172 s per cold worktree. B found 31 manifests but only 13 distinct inputs. The bake is deterministic, and the composed gate still runs a fresh `--verify` |
| Run only affected scenarios while iterating (existing `--scenario`); all five at handoff and at the composed check | **Now**, as policy | Cuts about 79% of iteration replay (B). No code |
| Stop the hidden parent at the branch milestone for `--scenario carrier`/`creel-loss` | **Next**, small runner change | Saves about 80% of the parent's ticks on branch-only runs (B). Low risk, but it's playthrough code |
| `stepGame` per-tick clone | **Next stream after the scheduler.** Production code, so it needs conservation, aliasing and reload tests, and must sequence with C4 composition | The only item that adds CPU capacity (see "With B") |
| Input-keyed result receipts shared by author, reviewer and integration | **Later, only if** the ledger shows exact repeats are over about 20% of lane time | A wrong key fails silently, the hit rate is unproven, and the ledger measures it for free |
| Affected-test selection | **Later**, as an opt-in for the author's edit loop only, never as acceptance evidence | Registry and POI edits reach 115–120 of 123 fast files (B), so most content work stays broad. TT-1 already made the full fast tier 60–100 s |
| Cross-worktree compiled-output store | **No** | TT-1 warm rebuild is 5–9 s; the cold cost is about 47 s once per worktree; key rework needed |
| Terrain `--verify` receipts | **No.** Use the policy in "With B" | A fresh verify at the gate is the point of the check |
| Fast-forward simulation | **No** | Not ordinary-control evidence. B agrees |

Fixed rules: the fresh, independent Sol reviewer stays; the full composed check runs before integration; cached results never stand in for gameplay or hardware evidence.

## 4. vCPU and RAM

The design doesn't change with the machine. Only the numbers do: `T = nproc − 2` adjusts itself, and `M` is a config value.

- **8 vCPU (ask now).** Most of the gain lands *outside* the lane: fast tiers, compiles and agents, which are what saturate the CPU today.
  - Inside the lane, 6 tokens on a 6 GiB pool add about one more concurrent CPU job at best, because memory binds first. For example, GPU + `heavy-suite` already fills 6 GiB.
  - After a week of ledger data, recalibrate reservations to cgroup p95 + 25% and raise `M` to 7 GiB. Three typical jobs then fit.
- **10 vCPU: don't ask.**
  - Tokens would rise to 8, but memory binds even harder on 16 GiB.
  - The host has 12 threads for Unraid, Hermes and the proxy, and C saw steal concentrated on two guest CPUs already.
  - I agree with C: reconsider only after an 8-vCPU comparison.
- **20 GiB: the more valuable second step**, conditional on fleet confirming at least 4 GiB of host headroom under load (C's condition, which I accept).
  - With 20 GiB, `M` goes to 9 GiB and the slice cap to 11 GiB, and GPU + `heavy-suite` + playthrough run together.
  - Also check that T3's agent-slice limits (9.62 GiB high, 11.71 GiB max) still make sense after the change.
- Host pinning and SMT placement are fleet's audit (C). Nothing here depends on the outcome.

## 5. Rollout: one Opus stream

**Prerequisites:**
- TT-1 merged, or at least its `package.json` lines and `test-tier.mjs` pool environment settled.
- A shared baseline committed.
- This stream counts as one of the five builder slots.

**Implementation:**
- Node `.mjs` with no dependencies, the repo's language.
- Kernel `flock` comes from util-linux `flock(1)` around a short transaction subprocess. Node has no flock, and a lockfile without the kernel's release-on-death is the bug class to avoid.
- The decision function is pure: (state, request, now, host) → decision. It lives in `scripts/heavy/`.
- State goes in `/work/tmp/siltwake-sched/`, with a `protocol` version.
- The code is installed once to `~/.local/share/siltwake-sched/<version>/` with a `current` symlink. Every branch's `scripts/heavy-check.sh` becomes a shim that runs the installed copy, and falls back to v1 if it's absent. That gives one implementation and one state machine-wide, as A warns.
- Waiters re-check when the state file's mtime changes or every 15 s. That costs no agent tokens and almost no CPU.

**Phases:**

1. **Core logic and unit tests** (fast tier, no systemd). Covers classes, pools, the express slot, aging, head reservation, exclusive drain, one job per worktree, rejecting impossible requests, and coalescing.
2. **Supervisor and CLI:**
   - `submit`, `run`, `wait`, `status`, `log` and `cancel`;
   - the detached supervisor and scope creation in the slice;
   - environment exports and the nested-call check: `SILTWAKE_JOB_TICKET` plus `/proc/self/cgroup` must sit under that ticket's scope, and a nested job can't add the GPU;
   - OOM detection from `memory.events`;
   - reconciliation on every transaction (a dead PID or a scope that is no longer active frees its reservation);
   - the ledger (JSONL: ticket, worktree, `HEAD`, dirty hash, class, reservation, command, submit/admit/end times, exit, `memory.peak`, CPU usage, OOM events);
   - the legacy bridge (below).
3. **Install the slice** with an idempotent user unit `~/.config/systemd/user/siltwake-heavy.slice`. Its limits come from §1. It needs coordinator approval, since it is per-user configuration.
4. **Call sites:**
   - `test:heavy` → `heavy-check.sh --class heavy-suite -- sh -c 'node scripts/test-build.mjs && node scripts/test-tier.mjs heavy'`;
   - the `check` typecheck dedup;
   - the playthrough runner defaults `--jobs` from `SILTWAKE_JOB_CPUS`;
   - the shared GPU Chrome launch helper(s) refuse to start without `SILTWAKE_GPU_LEASE`, so GPU work can't skip the lease;
   - the `.test-build/.heavy-job` guard in `test-build.mjs`;
   - updated `WORKER_RESOURCE_LIMITS.md`, DIRECTION's Tests, Resources and GPU lines, and a short "how to wait" note for Claude and Codex briefs.
5. **Canary and cut-over (below), then a real pilot.**
   - Run one GPU functional session alongside a `heavy-suite`, and a review `quick` during a playthrough.
   - Record ledger p50/p95 queue time, peak total slice memory, `MemAvailable` floor and PSI.
   - Calibrate reservations to cgroup p95 + 25%.

### Acceptance tests

Integration tests use sleep and allocation payloads, an isolated `SILTWAKE_SCHED_DIR`, a test slice name and a private legacy lock path. They never touch production state. Host values (`nproc`, `MemAvailable`, PSI) can be injected for tests.

| # | Test | Pass condition |
| --- | --- | --- |
| 1 | Two CPU jobs at once | Two `quick` jobs (`sleep 5`) are both admitted within 1 s, and their ledger intervals overlap |
| 2 | GPU job doesn't block a CPU job | With a `gpu` job running, a `playthrough` job is admitted at once. A second `gpu` job queues with `blocked-by=gpu` |
| 3 | Review jumps a playthrough | Tokens are full. Queue `playthrough` P, then a `quick --review` R. When 2 tokens free, R starts before P. Separately, R starts in the express slot at once while the pool is full |
| 4 | No starvation | With a steady stream of review quicks and an injected clock, P starts within 10 min + the longest running deadline |
| 5 | Memory refuses overcommit | Pool 6 GiB with 3 + 2 GiB reserved: a 2 GiB request waits (`blocked-by=memory`). A 9 GiB request exits 2 at once. Injected `MemAvailable` of 3 GiB: a 2 GiB request waits (`host-memory`) |
| 6 | Whole-tree containment | A grandchild that allocates past its reservation is OOM-killed and reported as `oom` from `memory.events`. The reservation is released; a neighbouring job is unaffected |
| 7 | Exclusive drains | An exclusive job queued behind two running jobs stops new admissions (express included), starts when the lane is empty, and nothing runs beside it |
| 8 | Detach survives the caller | `run`, then SIGKILL the caller's process group. The job finishes. A fresh `wait` returns its real exit code. Resubmitting the same command joins the same ticket |
| 9 | Crash reconciliation | SIGKILL a running supervisor: its reservation is freed by the next transaction. A reused PID with a different start time isn't treated as alive |
| 10 | Cancel and expiry | Cancelling a queued ticket removes it. Cancelling a running one kills only its scope and frees it. The queue limit gives exit 75 |
| 11 | `wait` semantics | `wait --max 5` on a 30 s job exits 99 with a position line. A later `wait` exits with the job's code. 124 and 0/1 pass through |
| 12 | Legacy bridge | A v1 holder (exclusive `flock`) blocks v2 admission. A v1 waiter appearing while v2 jobs run pauses new v2 admissions until it acquires. The lock file inode never changes |
| 13 | Nested calls | A nested `heavy-check` inside a job runs inline. A nested `--class gpu` from a non-GPU job is refused. A forged `SILTWAKE_JOB_TICKET` outside the scope is refused |
| 14 | One per worktree, and the `.test-build` guard | A second job from the same worktree queues (`worktree`). `test-build.mjs` refuses while that worktree's heavy job runs |
| 15 | Serial switch | `mode=serial` makes every request exclusive (v1 behaviour) with no redeploy |

### Migrating while agents are mid-queue on the old lock

**The bridge.** Every admitted v2 job holds the **old lock file** `/work/tmp/siltwake-heavy-check.lock` in **shared** mode (`flock -s`) for its run. Old v1 copies of the script (every unmerged branch has one) keep taking it **exclusively**, as today. The kernel then guarantees:
- v1 jobs never overlap anything;
- v2 jobs overlap only each other.

Linux `flock` doesn't favour waiting exclusive lockers, so v2 reads `/proc/locks`. I checked that blocked waiters show there as `->` lines on the lock's inode. Whenever a v1 waiter is present, v2 stops admitting, so v1 callers get their turn. **Never delete or recreate the lock file:** a new inode would silently break mutual exclusion.

**Deploy order:**
1. Install v2 with `mode=serial`.
2. Agents blocked in `flock -w 3600 9` on the old lock keep waiting on the same inode, are admitted in turn, and finish normally. Nobody is cancelled.
3. Switch to `mode=normal` with the coordinator watching `status` and the ledger for about 2 hours.
4. Merge the shim into the integration branch so new worktrees use v2. Older branches pick it up when they merge root, and the bridge covers them meanwhile.
5. Remove the bridge after 7 days with no v1 acquisitions in the ledger. A v1 acquisition shows as an exclusive holder without a ticket.

**Rollback:** `mode=serial`, or remove the `current` symlink so the shim falls back to v1.

## 6. Where this touches TT-1

TT-1 owns its files. The scheduler stream sets environment and adds one guard after TT-1 merges. It reimplements nothing.

- **Heavy pool.** v2 sets TT-1's existing `SILTWAKE_HEAVY_CONCURRENCY` and `SILTWAKE_HEAVY_POOL_MIB` from the reservation: 2 files and 2,560 MiB on 6 vCPU. TT-1's code needs no change.
  - This trades some of the WIP pool's isolated speed (3 files, 395.6 s) so a GPU session or playthrough can run alongside, which I agree with A on.
  - The pool's `world-stream` budget miss (1,286 MiB against 1,280 MiB) is TT-1's to fix.
- **`package.json`.** TT-1 edits the `test:build` and `test:fast` lines. v2 edits only `test:heavy` and `check`.
- **`test-build.mjs`.** v2 adds the `.heavy-job` guard, about 10 lines, after TT-1 merges.
- **Fast tier.** Stays unqueued at TT-1's `min(5, cores − 1)` concurrency.
- **DIRECTION.** TT-1's pending update to the "one file at a time" line folds into this stream's DIRECTION edit.

## Owner decisions needed

1. **VM:** ask fleet for 8 vCPUs now (keeping 16 GiB), and 20 GiB only if fleet confirms at least 4 GiB of host headroom under load. Not 10 vCPUs. This needs a VM restart window, which you authorize.
2. **Rule change:** DIRECTION's "one heavy job on the VM at a time" becomes "heavy jobs are admitted through heavy-check v2". Screenshots and play from shared sessions count as functional evidence only. Every frame-time or performance number must come from exclusive mode.
3. **Priority:** the scheduler stream takes one of the five builder slots for about 1–2 days, ahead of content. After it, a `stepGame` performance stream touches the simulation core, and needs scheduling around C4.

## Light checks I ran (no heavy lock, nothing shared changed)

- **Cgroup delegation.** `user@1000.service` delegates `cpu`, `memory`, `io` and `pids`, and systemd is version 257.
- **Nested slice probe.** A throwaway scope in a nested slice, `perfdecision-probe.slice`, got `cpu.max=50000 100000`, `memory.max=64M` and `memory.swap.max=0`. So slice and per-job CPU and memory limits work in user scopes.
  - Transient slices stay active after their scopes exit, so the real slice should be a unit file.
  - I stopped my probe slice afterwards.
- **Where jobs run.** Heavy scopes run in `app.slice`, **outside** T3's agent slice. That slice is capped at 9.62 GiB high and 11.71 GiB max, and contains the agents and their fast tiers.
- **Detachment.** A `setsid -f` child keeps the caller's environment and is reparented to the user manager, so a detached supervisor survives the end of the agent's tool call.
- **`/proc/locks`.** It lists blocked `flock` waiters as `->` lines, checked on a private lock. On the live lock at 21:18 UTC there was one holder (a `creel-loss` playthrough, 548 MiB peak, about 1.3 cores) and three blocked waiters, with load average 1.24, GPU at 0% and 1 MiB, and `MemAvailable` at 11.8 GiB. At 21:25 two of the waiters were still blocked, one with a self-raised `flock -w 5400`.
- **Swap.** The guest's 4.2 GiB swap is full of cold pages, with no swap traffic in C's window. Treat swap as unavailable headroom.
- **Tools.** `python3`, `jq` and `flock` are present; `inotifywait` is not, which is why waiters check the file's mtime instead.
