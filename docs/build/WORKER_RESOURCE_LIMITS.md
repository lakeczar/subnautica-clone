# Factory-worker test limits

The 16 GiB worker also hosts T3, agents and Fleet. On 2026-10-19, B1's `failures.sh` full suite exhausted RAM and swap. The owner supplied the first incident report. Root independently stopped a rerun at 23:58 UTC: `render-lifecycle.test.js` PID443037 held 7,574,680 KiB RSS and 3,935,200 KiB swap; parallel `m2-region-render` held another 1,634,212 KiB RSS. Root terminated only the verified B1 test descendants of437409, leaving the author and shared services alive. Memory returned to approximately2 GiB used/13 GiB available, swap147 MiB and full memory-pressure avg10 0.20%. The exact allocation cause remains under investigation by the B1 author.

## Before running tests

1. Run heavy render, full-suite, playthrough, bake and GPU jobs only through the heavy-check admission queue (below). It replaced "one heavy job at a time" on 2026-10-22. Other agents may continue editing or light checks. Use disk-backed `/work/tmp` or persistent home for large artifacts.
2. Wrap the entire test process tree in a user-systemd scope with a total-memory limit and no swap. Verify the child cgroup's limits before the heavy command. A V8 heap flag does not cap native allocations or ArrayBuffers.
3. For the current incident, isolate `render-lifecycle` with one test worker and a three-minute diagnostic deadline. Preserve timeout/OOM logs; investigate before retrying. Keep assertions and coverage meaningful.
4. After diagnosis, run required full checks with bounded concurrency and an explicit justified deadline. Record capped failures honestly. Raising the cap or retrying the same failing workload is not a fix.

Verified scope prefix on this worker:

```sh
systemd-run --user --scope --quiet --unit=siltwake-UNIQUE-TEST \
  -p MemoryHigh=5G -p MemoryMax=6G -p MemorySwapMax=0 \
  timeout --kill-after=10s 180s COMMAND ARGUMENTS
```

Replace the unit name with a unique job name and COMMAND with the intended isolated test. (heavy-check's own job scopes omit `MemoryHigh`: with no swap, a job past it is throttled rather than killed and crawls to its deadline. Measured in [SCHED-1](streams/SCHED-1.md).) The 180s deadline is for diagnosis; choose a bounded full-suite deadline from measured healthy runs. Heavy jobs share the6 GiB budget, rather than each overlapping with its own6 GiB allowance. The GPU author's lightweight shell correction suite has a separate1 GiB cap and runs sequentially.

A harmless child probe read `/proc/self/cgroup`, then the corresponding files under `/sys/fs/cgroup`, and verified `memory.high=5368709120`, `memory.max=6442450944`, `memory.swap.max=0`. `MemoryOOMGroup` is unsupported by this systemd; omit that property. On timeout, inspect the exact owned scope for lingering descendants and stop that scope if necessary. Keep the parent agent and shared browser/services alive.

## GPU scope

The affected test uses Babylon `NullEngine`; it does not rasterize using a GPU. Attaching the3090 will not move its Node allocations or test orchestration into VRAM. Actual browser WebGL drawing can benefit once passthrough/driver setup is accepted and executed. At incident recovery, PCI inventory still showed only QXL and `nvidia-smi` was absent. Do not claim NVIDIA acceleration yet. QXL driver loading was not implicated by this incident.

## Heavy jobs: the admission queue (SCHED-1, owner decision 2026-10-22)

Heavy jobs are **admitted through the queue**, not run one at a time. `scripts/heavy-check.sh` runs the machine-wide heavy-check v2: CPU tokens (`nproc − 2`: 6 on 8 vCPUs), a 6 GiB memory pool, one GPU lease and an express slot for one short check. Several compatible jobs run side by side, each in its own capped scope; reviews and short checks go first; waiting jobs age so nothing starves. Design: [SCHED-1](streams/SCHED-1.md) and `DECISION-OPUS.md` on `research/perf-decision`.

**Evidence rule.** Play and screenshots from shared runs count as **functional evidence only**. Every frame-rate or performance number comes from **`--class exclusive`**, which drains the lane and runs alone.

### How to run a heavy job (paste into briefs)

```sh
H=/home/worker/.t3/projects/subnautica-clone/scripts/heavy-check.sh
```

**Heavy** means render/NullEngine tests, `npm run test:heavy`, playthroughs, terrain bake or `--verify`, GPU browser sessions, and anything that needs more than about 1 GiB or 2 cores. **Light** work runs directly, outside the queue: `npm test`, typecheck, compiles (`npm run test:build`, `npx tsc -p scripts/playthrough/tsconfig.json`), a warm `npm run build` and focused non-render tests. Never wrap `npm run test:heavy`, `build` or a typecheck in `$H`: `test:heavy` already queues itself.

**A job has a goal, not a time limit** (owner, 2026-10-23; SCHED-2). It runs until its command ends. The queue stops it only when:
- it **stalls**: nothing written to its output, and no touch of `$SILTWAKE_JOB_HEARTBEAT`, for the stall window (exit **123**, `stalled: no output for N min`, with what its processes were doing). A job that is legitimately quiet for long stretches touches the heartbeat file or passes `--stall S`;
- it reaches a `--deadline S` that you chose (exit **124**, `deadline`);
- it reaches its class's **runaway ceiling**, hours away (exit **124**, `runaway ceiling`).

**Exclusive keeps a real 30-minute cap,** because it blocks everything.

**Pick a class.** Each class has a reservation, a stall window and a ceiling:

| Class | For | Reservation | Stall window, ceiling |
| --- | --- | --- | --- |
| `quick` | focused review checks, 1–3 heavy files, smokes | 1 cpu, 2 GiB; may use the express slot | 10 min, 2 h |
| `standard` (default) | anything else | 2 cpu, 3 GiB | 15 min, 4 h |
| `heavy-suite` | `npm run test:heavy` (already labelled) | 2–3 cpu, 3 GiB | 15 min, 4 h |
| `gpu` | task-owned GPU Chrome play, screenshots, functional GPU checks | 2 cpu, 3 GiB, the GPU lease | 15 min, 4 h |
| `playthrough` | the compiled playthrough (`--jobs` follows the grant) | 2–3 cpu, 2 GiB | 15 min, 6 h |
| `bake` | cold terrain bake, `bake-terrain --verify` | 2 cpu, 3 GiB | 15 min, 2 h |
| `soak` | long memory and streaming soaks (2–4 h sessions, ended by their goal) | idle CPU (no pool token), 3 GiB; `--gpu` adds the GPU lease | 15 min, 6 h |
| `exclusive` | frame-time and perf numbers, the large-cave lab bake, known-huge jobs | the whole lane and the GPU | 10 min, **30 min cap** |

**Exclusive is one measurement per ticket.** Submit each segment of a series (traversal segments, A/B variants) as its own ticket, all at once if you like; don't loop over them inside one job. After each exclusive run, the jobs that waited through it start before the next exclusive drains the lane (blocked reason `turn`), so a series never locks everyone else out.

> **Soak verdicts are not evidence yet (coordinator, 2026-10-23).** The scheduler parts of SCHED-2a are accepted and installed. The soak *harness* (`scripts/soak/`) is still in review (R6, `bf7bcb1`: a verdict reducer is being rebuilt). Run soaks to explore, but don't cite a soak `pass` or `partial` as evidence until this note is removed.

**Soaks take only leftover capacity:**
- A soak starts only when nothing else is waiting. It never ages, and it never takes the express slot or the 10-minute reservation.
- Its CPU runs at idle weight, so it never slows other jobs.
- **Yielding:** when its memory or GPU is what keeps a waiting job out, `$SILTWAKE_JOB_YIELD` appears. A soak driver should then write its final sample and exit (`scripts/soak/run.mjs` reports `yielded` and exits 75). Five minutes later the soak is stopped anyway (exit **75**, `preempted`). Soak goals and pass rules: `scripts/soak/` (SCHED-2). A soak reports `pass` only when its goal is met *and* every rule was measured. If something couldn't be measured, such as frame times on a shared run, a build without streaming attribution, or a failed provider, it reports `partial` (exit 5), with the unmeasured rules listed.
- Long soaks belong on quiet periods, or on the second worker (SCHED-2b).

Options:
- `--review`: Sol reviews and the coordinator's composed gate.
- `--stall S`: the stall window, at least 60 s.
- `--deadline S`: a hard limit of your own, up to the ceiling (exclusive: the cap).
- `--mem 4G` and `--cpus N`: up to the class maximum.
- `--snapshot`: run on a private copy of the tree as submitted, so you can keep editing while the ticket waits and runs (below). In package scripts that queue themselves (`test:heavy`), set `HEAVY_SNAPSHOT=1`.
- `--gpu`: for `soak` only.
- `--no-test-build`: this job never reads the worktree's `.test-build` (GPU play from `dist`), so `npm test` there stays allowed while it runs.
- `--machine any|3090|4070|soak`: where it runs (below, "Two machines").
- `--artifact PATH` (repeatable): an output file or directory to bring back from alickers (below).

**Two machines** (SCHED-2b; DIRECTION, "Two test machines"). The queue routes each job by its machine tag to factory-worker (RTX 3090) or the best-effort second worker `siltwake-alickers` (RTX 4070 Laptop):

| Tag | Default for | Where it runs |
| --- | --- | --- |
| `any` | `playthrough`, `heavy-suite` | alickers when its one slot is free; otherwise here at once (never waits for it) |
| `3090` | every other class | here only. `exclusive` is always 3090 |
| `4070` | (ask for it) | alickers only. It waits through pauses and outages until its queue timeout, and is never faked here |
| `soak` | `soak` | alickers first. It runs here only while alickers is paused or unreachable |

- **Only a commit goes to alickers.** A dirty tree, or a command that names a local path outside the worktree (`/work/...`, `/tmp/...`; inputs would be missing, outputs left behind), runs here, and `--machine 4070` is refused with the reason. Put inputs in the commit. Declare outputs with `--artifact`:
  - a relative path is in the job's directory in the sandbox checkout; an absolute path is on the sandbox;
  - each one comes back **whole**, an evidence pack directory included, into `/work/tmp/<ticket>/<name>`, also when the job failed. Outputs are staged inside the sandbox's job lock, so another job can never replace them. The transfer is bounded and cancellable; a failed one is reported with where the staged copy waits on alickers;
  - the result, the ledger and the final line list them with the machine and the tested commit. A fetch that failed is listed as such.
- **Sandbox outages:** if alickers never admitted the job (paused, its lock wait expired, unreachable, or the transport failed first), an `any` or `soak` job runs here instead, keeping its place (`status` marks it `here*`, the result has `fellBack`). A `4070` job waits again, backing off (`remote-retry`), until its queue timeout. A setup failure there (checkout, `npm ci`) isn't an outage: `any` and `soak` run here, and a `4070` job fails with it. Once the job has started, its own exit codes pass through, 75 and 255 included. The queue learns these phases from the transport's receipt, never from output.
- **Goals there:** the stall clock starts at the `testing` line, so waiting for the sandbox's lock, `npm ci` and the transport don't count; the first compile (cold, because the transport clears `.test-build*` when the commit changes) does. The sandbox's `siltwake-job` sets MemoryHigh at 85% of its memory with no swap, so a job past it is **throttled**, not killed. The queue reports continuous throttling after 2 minutes and stops the job at its stall window (exit **123**, `throttled`); rerun with more `--mem` (up to 12 GiB).
- **4070 frame times** are recorded, labelled "RTX 4070 Laptop (alickers, shared desktop host)", and flagged with a **WARNING** in a soak report when a frame rule would have failed. They are never judged. Memory, graphics, hold and save rules are judged there. Frame judgement stays with 3090 `exclusive` runs.
- **`status`** shows alickers' state (`up`, `busy`, `paused`, `unreachable`) and a MACHINE column. Blocked reasons are `remote` (its slot is busy: a lane job, or someone's direct `alickers-job.sh` call), `remote-paused` and `remote-down`.

```sh
$H --class gpu --machine 4070 --artifact evidence-pack -- node my-4070-session.mjs   # writes evidence-pack/ in the checkout
$H --class playthrough -- npm run playthrough -- --jobs 3 --quiet                     # any: alickers if free, else here
```

A command that reads build output a commit lacks (`node .test-build/…`, `--dist dist`) runs here: on alickers it must compile inside the job (`npm run playthrough` compiles first; `npm run test:heavy` already does). Compiling outside the queue and queueing only `node .test-build/…`, as below, stays the fastest form for a run here.

Commands that `heavy-check` recognises (a playthrough, the heavy tier, the terrain bake, the large-cave lab bake) get their class without `--class`.

**Claude Code agents.** Make one Bash call with `run_in_background: true` and `timeout: 7200000`:

```sh
$H --class quick --review -- node --test .test-build/tests/foo.heavy.test.js
```

The output streams as it runs. You are woken when the job ends, so keep working meanwhile and don't poll.

**Codex agents** (no background wake-ups):

```sh
T=$($H submit --class gpu -- node my-play.mjs)   # prints a ticket at once
$H wait "$T" --max 540                            # tool timeout_ms ≥ 570000
```

`wait` exits with the job's code and its last 40 lines the moment the job ends. Exit **99** with a "still pending" line means call `wait` again. `$H log "$T"` shows the whole output.

**Both:**
- **A job runs detached.** A tool timeout or a killed call never loses it or its place in the queue.
- **Repeats join the same ticket.** Running the same command again from the same worktree, with the tree unchanged, joins the existing ticket.
- **One job per worktree runs at a time.**
- **Watching and stopping.** `$H status` shows the queue and why each ticket waits (`cpu`, `memory`, `gpu`, `head`, `worktree`, `exclusive`, `lane`, `turn`, `leftover`, `legacy` or `host-memory`), the live slice limits, and any GPU use outside the lease. `$H cancel T` stops a ticket; cancel only your own.
- **Evidence is bound to a commit.** The final line says either `evidence for <sha>` or `NOT evidence for a commit: <why>` (uncommitted changes, or the worktree changed while the job ran). Commit before submitting anything that will serve as handoff or review evidence.
- **A changed worktree is rejected, not silently tested** (exit **3**). If the tree (HEAD, tracked changes or untracked files) changed between submit and admission, the command does not run. Either don't edit that worktree while your ticket waits, or submit with `--snapshot`: the job then runs on a copy of the tree as submitted (about 0.3 s to make; `node_modules` is linked).
  - A snapshot has no ignored build outputs, so the job compiles inside it. Package scripts like `npm run playthrough` and `test:heavy` already do; the terrain bake restores from the shared store.
  - Write artifacts to absolute paths (`/work/tmp/...`). A snapshot the job wrote into is kept beside the job's log for 7 days.
- **`.test-build` is in use while your job runs.** While a heavy job is *running* (admitted) in your worktree, `npm test` and `npm run test:build` there refuse to rebuild `.test-build`, because the job may be running those files; a *queued* ticket never blocks. The refusal names the ticket. Meanwhile:
  - compile and test in a sibling directory: `SILTWAKE_TEST_BUILD=.test-build-2 npm test` (any `.test-build-<name>`; the first build is cold, then incremental; git ignores it);
  - a heavy job submitted with `SILTWAKE_TEST_BUILD` set protects that directory instead;
  - submit jobs that never read `.test-build`, such as GPU play from `dist`, with `--no-test-build`, or use `--snapshot`: neither takes the worktree's `.test-build`.

  The job itself may rebuild.
- **Playthroughs:** compile first, then queue only the run:

  ```sh
  npx tsc -p scripts/playthrough/tsconfig.json
  $H --class playthrough -- node .test-build/scripts/playthrough/run.js --scenario …
  ```

  While iterating, run only the affected scenarios; run all five at handoff.
- **The GPU guard is pending install** (coordinator, 2026-10-23): it's installed after the last pre-SCHED-2a tickets drain. Until then, enforcement is by the queue's `gpu`/`exclusive` classes only.
- **The GPU lease covers every GPU driver.** Every Playwright Chrome on this machine is wrapped (`install.sh --gpu-guard`; the guard has its own install, so rolling the scheduler back or uninstalling it leaves the guard enforcing, and a missing guard refuses GPU launches): a launch that asks for the GPU (`--use-angle=gl-egl`, `--use-gl=…`, `--enable-gpu`, `--ignore-gpu-blocklist`, Vulkan) refuses to start unless it runs inside a `gpu`, `exclusive` or `soak --gpu` job. Software (SwiftShader) launches pass. Drivers may also call `requireGpuLease()` from `scripts/heavy/gpu-lease.mjs` for an earlier, clearer error.
  - **Outside the queue:** any process holding the NVIDIA device without a lease is shown by `status`, recorded in the ledger (`unleased-gpu`) and on any GPU job that shared the GPU with it. An exclusive run that shared the GPU is marked `DISTURBED`.
- **Machine-readable results:** `wait --json` ends with one JSON line: `{"pending":true,…}`, or the full result with `code`, `label`, `stopReason` (`stalled`, `deadline`, `ceiling`, `oom`, `killed`, `cancelled`, `preempted`, `rejected` or null) and `evidence`. Use it to tell a pending `99` from a job's own.

**Exit codes:**
- the job's own code;
- **123**: stalled (no output and no heartbeat for the stall window);
- **124**: your deadline, or the class's runaway ceiling (exclusive: the cap);
- **137**: OOM or killed. An OOM message names the class and reservation: rerun with `--class exclusive` or more `--mem`, and never just retry. If no observer could read a counter, the result lists it under `unavailable` instead of reporting 0;
- **75**: cancelled, expired after the 2-hour queue limit (`--queue-timeout`), or a soak preempted for waiting work;
- **3**: rejected: the worktree changed before admission (resubmit, or use `--snapshot`);
- **99**: still pending (`wait` only);
- **2**: a usage error or a request that can never fit.

### Operating it (coordinator)

State lives in `/work/tmp/siltwake-sched/` (the queue, `ledger.jsonl` and per-job logs under `jobs/`). The code is installed to `~/.local/share/siltwake-sched/current` by `scripts/heavy/install.sh`. Rollback is `echo serial > /work/tmp/siltwake-sched/mode`, which makes every job exclusive, as before. `scripts/heavy/install.sh --uninstall` puts every shim back on the v1 lock. Never delete or recreate `/work/tmp/siltwake-heavy-check.lock`: each v2 job holds it shared, through its holder and an anchor inside the job's own scope, until that cgroup is gone, so old v1 copies of the script still exclude them. During the cut-over, v1 goes first: any v1 holder or waiter pauses all v2 admissions. A finite v1 backlog drains, but a continuous one can hold v2 tickets until their queue timeout, so move callers to the shim promptly. Tuning lives in `/work/tmp/siltwake-sched/config.json` (read on every admission): `ceilings` (`{"playthrough": 21600}`), `stalls` (a class's default stall window, e.g. `{"playthrough": 2700}` while worktrees without the playthrough heartbeat remain), `soakYieldS` (300), `soakSlots` (1) and `poolMiB`. The GPU guard is `scripts/heavy/install.sh --gpu-guard` (re-run after `npx playwright install`; `--gpu-guard-remove` undoes it).

Light checks of the scheduler itself (no systemd) are in `tests/heavy-sched-policy.test.ts`. Its acceptance tests use private state only: `node --test --test-concurrency=1 scripts/heavy/acceptance.test.mjs` (SCHED-1) and `scripts/heavy/acceptance-sched2.test.mjs` (SCHED-2).

## Second worker: siltwake-alickers (best-effort, added 2026-10-23)

A WSL2 Ubuntu sandbox on the owner's PC (`alickers`): **8 CPUs, 16 GB, no swap, an RTX 4070 Laptop GPU** (Chrome → ANGLE/OpenGL → Mesa D3D12). Fleet provisioned it (handoff: `/work/tmp/siltwake-alickers-handoff/SANDBOX-HANDOFF.md` on factory-worker). It runs **one job at a time**, in its own capped scope (6-CPU quota, 8 GiB by default, 1–12 GiB allowed).

**Use it for:**
- whole headless playthroughs;
- `npm run test:heavy`;
- **RTX 4070 WebGL sessions.** These are the closest thing we have to a player's GPU.

Keep factory-worker for evidence that must be on the 3090, and for anything needing the coordinator or provider logins.

**Run a job through the queue** with `--machine` (above). `scripts/alickers-job.sh` is the queue's transport, and the documented fallback if the queue's lane is unavailable. Called directly, it runs from any worktree on factory-worker:

```sh
scripts/alickers-job.sh [--sha SHA] [--deadline S] [--memory NG] -- COMMAND ...
# e.g.
scripts/alickers-job.sh --deadline 5400 -- npm run playthrough -- --jobs 3 --quiet --json /work/results/pt-<stream>.json
scripts/alickers-job.sh --deadline 1800 -- npm run test:heavy
```

**How the helper runs a job:**
- It tests a **commit**, by default this worktree's HEAD; uncommitted edits are not sent. A commit already on origin is fetched by the sandbox; a local-only commit is sent as a git bundle.
- Inside the sandbox's job lock, it moves the shared checkout `/work/repos/subnautica-clone` to that commit and runs `npm ci` if the lockfile changed.
- It prints `alickers-job: testing <sha>` first and `tested <sha> exit N` last. **Record that SHA with any result.**
- With `--receipt FILE` (the queue's lane uses it), the transport also writes its phases to that file on the sandbox: admitted, the checked-out SHA, setup ok or failed, started, exit. Those lines, not its output, are what the queue trusts.

**Rules:**
- **Best-effort.** Exit **75** (paused by the owner, or the queue wait expired) or **255** (unreachable) means **rerun the job on factory-worker** through `scripts/heavy-check.sh`. Never restart Windows, change host settings, run `wsl --shutdown`, or try to bring the sandbox up yourself.
- **Browsers** use `executablePath: "/usr/local/bin/siltwake-chrome"`. It runs Chrome Stable headless under a private Xvfb, on the 4070. Read and follow `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md`. **Everything stays inside Linux:** never use the Windows desktop, cursor, focus, a Windows browser or a Windows-rendered preview. Use a separate profile per job, and close what you open.
- **Artifacts** go in `/work/results/<name>` or `/work/tmp`. Fetch them with `ssh -F ~/.ssh/siltwake.conf siltwake-alickers cat /work/results/<file> > /work/tmp/<file>`.
- **Performance numbers** from the sandbox are labelled **"RTX 4070 Laptop (alickers, shared desktop host)"**. The Windows host can be in use, so treat them as indicative, never as the 3090's exclusive-mode evidence. Functional evidence (play, screenshots, passes) counts like any other run at the recorded SHA.
- **One job at a time** on the sandbox, and the checkout is shared. Don't leave long interactive sessions holding it, and don't edit files there; everything comes from commits.
- **Coordination, provider logins and GitHub pushes stay on factory-worker.** The sandbox has no logins.
