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

**Heavy** means render/NullEngine tests, `npm run test:heavy`, playthroughs, terrain bake or `--verify`, GPU browser sessions, and anything that needs more than about 1 GiB or 2 cores. Never wrap `npm run test:heavy` in `$H`: it queues itself.

**On factory-worker, the repo's CPU work runs only through the queue (STEW-2).** The CPU-heavy entry points never run here outside a heavy-check job: started from an agent's shell, each runs the same command again through `heavy-check run`, in the foreground, and exits with its code, so it reads like a local run. The queue then knows every sanctioned CPU job, and an exclusive run drains them like any other job. Nothing to check first.
- **Guarded:** `npm test`/`test:fast`, `build`, `typecheck`, `playthrough`, `check`, `test:build`, `bake:terrain`, and `scripts/test-tier.mjs`, `test-build.mjs`, `guard-architecture.mjs`, `bake-terrain.mjs`, the six economy scripts, `sim-bench.mjs`, `timeline-save-bench.mjs`, `saves-build-at.sh` and `sim-differential.sh`. Each has its class (`quick` for a typecheck or a single compile, `standard` for the fast tier or the build, `bake`, `playthrough`, `heavy-suite`).
- **Where it runs:** `--machine any` (alickers when its slot is free, else here) for tests and checks. Here (`3090`) for what leaves its product in your worktree (`.test-build`, `dist`, baked terrain), for commands naming local paths, and whenever your environment carries a setting such as `SILTWAKE_TEST_BUILD` or `NODE_OPTIONS`, since alickers receives only the command line. A guarded consumer of compiled output (the economy scripts, the tiers) compiles inside its job.
- **Commit first** (a WIP commit is fine) so a `--machine any` command can go to alickers; with uncommitted changes it runs here, and if the tree changes while it waits, the queue rejects it (exit 3). One job per worktree runs at a time, so a guarded command waits behind your own running job in the same worktree.
- **Runs directly** inside a heavy-check job (the job's own cgroup, not just its variables; under v1's lock, its exact scope), on the alickers sandbox (identified by its hostname and its `siltwake-job` tool), or with the override.
- **Override:** `SILTWAKE_LOCAL_OVERRIDE="<why>" npm test` runs it here and logs who, what and why to `/work/tmp/siltwake-sched/local-overrides.jsonl`; if the log can't be written it refuses. If `heavy-check status` shows an exclusive ticket, tell the coordinator its id and the time.
- **If heavy-check can't be run,** a guarded command refuses (exit 75) with the reason; it never falls back to running locally.
- **`node scripts/local-guard.mjs --status`** says what happens here.
- **Not prevented, a convention only:** bare `npx tsc`, `npx vite build`, `vite dev`, `node --test <file>`, compiled runners started directly (`node .test-build/…`), the `:direct` package scripts' commands typed by hand, and SCHED's acceptance suites run directly. Use the npm scripts, or `$H` yourself.
- **`npm run gate`** sends its local steps (fast, build, economy) as one `--machine any` job (the 3090 when your environment carries settings, as for a guarded command), and **`scripts/saves-export.sh`** compiles nothing outside the queue.

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

**Is an exclusive run clean?** Its result's `context` (v2) says, judged on the **job's own cgroup**, never the host's. It's marked `DISTURBED` with its `reasons` if, in its worst 5 s window, the job waited for a CPU ≥ 5% of the time, stalled on memory ≥ 1%, took a major fault or a swap-in in its own cgroup (its memory or cache read back from disk; the guest swaps), the hypervisor took ≥ 5% of the machine's CPU (steal), the GPU was shared outside the lease, or the job didn't run in the exclusive slice as configured, or that slice was CPU-throttled (below). The slice's weight, CPU, memory and swap limits are read from the kernel at the payload's start and end (`boost.status: unavailable`, with the reason); its throttle counters cover the stretch between. A change restored in between could be missed, so don't change config.json or reinstall during a measurement. `install.sh` refuses to write or rewrite the exclusive slice's unit while any ticket runs; if the slice still holds processes once admission is paused, the update stops incomplete (maintenance kept, below). Install when the queue is idle. A `DISTURBED` run's timings don't count as performance evidence. A run whose own counters couldn't be read is marked `DISTURBED` too (unmeasured is never clean). The result also records the whole-run values, host load and PSI, host swap-in, swap-out and major faults, CPU used outside the job and where it ran, so the label can be audited. Missing coverage (no counters from before the payload started or after it ended, or a gap over 3 s) and recovered jobs are marked `DISTURBED` as unmeasured. Raw counters are kept in the job's `contention.jsonl`, and the windows in its `context`. Thresholds: `disturbed` in config.json.

**Exclusive runs get CPU priority.** An exclusive job runs in its own slice, `siltwake_exclusive.slice`, which has CPU weight 10,000 (everything else in your user session, T3 and all its agents included, has 100). Your work keeps running; it only yields the CPU the exclusive job actually wants, typically one or two of the eight. Nothing of yours is moved or re-limited, and nothing is changed at runtime: the slice's weight is fixed in its unit file (`install.sh` writes it once, with the heavy slice's caps). This reduces disturbance but doesn't guarantee a clean measurement: the job's own counters still decide `DISTURBED` (above).

**Exclusive is one measurement per ticket.** Submit each segment of a series (traversal segments, A/B variants) as its own ticket, all at once if you like; don't loop over them inside one job. After each exclusive run, the jobs that waited through it start before the next exclusive drains the lane (blocked reason `turn`), so a series never locks everyone else out.

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
| `any` | `standard`, `gpu`, `playthrough`, `heavy-suite` (SCHED-3) | alickers when its one slot is free; otherwise here at once (never waits for it). Only a job declared portable goes to alickers; any other is routed to `3090` at submit, with the reason (below) |
| `3090` | `quick` (the express slot), `bake` (local artifacts), `exclusive` (always 3090) | here only |
| `4070` | (ask for it) | alickers only. It waits through pauses and outages until its queue timeout, and is never faked here |
| `soak` | `soak` | alickers first. It runs here only while alickers is paused or unreachable |

- **Balance (SCHED-3; DIRECTION, "Balance the two GPUs"):** only acceptance numbers are `--class exclusive` on the 3090. Everything else may run on either machine, but **portability is declared, never inferred**: a command line can't show what a script imports, reads from the environment or writes.
  - **Declared portable:** a registered command we own that compiles and consumes its builds inside the job and writes nothing the caller needs back (`npm test`, `npm run test:fast`, the heavy tier's own queued command, `npm run playthrough [-- --jobs N --quiet]`), or a caller's explicit `--machine any|4070`. With an explicit machine, the caller vouches for the job: it must be self-contained (no local inputs, no build output from outside the job), and everything it writes that's needed afterwards must be an `--artifact`; a remote artifact lands in `/work/tmp/<ticket>/<name>` (the result's `artifacts[].local`), never back in the worktree. **To balance your own driver:** `$H --class gpu --machine any --artifact <outdir> -- node <driver> <outdir>`, and read the outputs from the returned location.
  - **The portable runner:** a registered command placed by default runs through `scripts/heavy/portable-run.mjs` from the commit itself, on whichever machine takes it. It reads the commit's `package.json` script in a closed grammar: steps joined by ` && `, each `node <repo-relative path> [plain args]` or `npm test` / `npm run <script> [-- plain args]`, expanded the same way. It runs the resulting `node` steps directly, without npm or a shell, with an environment rebuilt from a fixed allowlist: `PATH` (with `node_modules/.bin` first), home, user, locale, temp and session variables, and the queue's own job variables. So npm configuration (`.npmrc`, prefixes, `script-shell`) and the rest of your environment can't make the two machines differ.
    - **STEW-2's guarded entry points:** `npm test`, `npm run test:fast` and `npm run playthrough` are `node scripts/local-guard.mjs --class <C> --machine any -- npm run <X>:direct --` wrappers. The runner treats exactly that form as an alias: it runs the `<X>:direct` body under the same grammar (its `local-guard.mjs --require …` head is an ordinary node step, admitted inside the job and on alickers) and never runs the guard's routing or npm. A wrapper with `--machine 3090` (`npm run build`), the guard's `bash scripts/<name>.sh` form, or any other guard step runs here as submitted, with the reason.
    - **A step's file must stay inside the repository**, every symlink followed (a dangling one too), or inside the repository's own `node_modules` wherever that links (a worktree's shared install, a snapshot's link). A committed link to a program elsewhere on the machine runs the job here as submitted: `<path> resolves outside the repository and its node_modules (<target>)`. The runner checks this again before running anything.
    - **Exit codes:** a step a signal ended gives 128 + the signal's own number, as `sh` reports it. A stop the runner receives (TERM, INT, HUP) goes to the running step and always ends the run with that code, even if the step then exits 0.
    - **Anything outside the grammar** runs here as submitted, with the reason: another program, an assignment, `env`, a path to npm, `npx`, an npm option, quoting, a newline or other separator, or pre/post scripts. So does a commit without the runner.
    - **What's shown:** `status` shows the runner's command line, and the result's `goal.portable` holds what you typed.
  - **Your intent first:** a default `any` runs here as submitted (with npm, as before) if your environment carries any of:
    - a `SILTWAKE_*` the queue doesn't own (a test selector, `SILTWAKE_BUILD_CACHE=off`, …);
    - any `NODE_*`;
    - an `npm_config_*` beyond npm's descriptive exports. The config-file selectors (`npm_config_userconfig`, `npm_config_globalconfig`, `npm_config_prefix`) always count, so a default submitted from inside an `npm run` runs here.

    The reason reads `local configuration <names> changes this command; pass --machine any to declare it portable`. A script that means to balance declares it: `npm run test:heavy` queues its command with `--machine any`. The environment is never forwarded.
  - **Everything else is routed to the 3090** at submit, with the reason printed once (`runs here (factory-worker), not on alickers: <reason>`), kept on the ticket and the result (`goal.routed`), shown by `status` (`3090^`, `here^` once running, and a `^ <ticket>: any, routed here: <reason>` line) and in the final line. Reasons: `portability not declared: pass --machine any and --artifact for its outputs`; the remote lane is off; not a git tree; uncommitted changes; a local path outside the worktree; reading `.test-build*` or `dist`; or a command that only builds (`npm run build`, `npm run test:build`, `vite build`, `node scripts/test-build.mjs`) with no `--artifact` for its output (`dist`, `.test-build`): `build output must stay here`. With `--artifact dist`, `--machine any|4070 -- npm run build` runs there and `dist` comes back whole. With options after the build (`-- --outDir custom-dist`), your declared `--artifact` is its output: `--artifact custom-dist` lets it go. An explicit `--machine 4070` is refused for any of these reasons. An `--artifact` alone isn't a declaration; on a job routed here, a relative one is where it wrote it.
  - **A fast tier through the queue may run on alickers:** it doesn't refresh this worktree's `.test-build`, so compile here before running anything that reads it (the economy scripts do).
  - **Pinned 3090 drivers:** the GPU tools that load Playwright and Chrome from this machine's paths (`tools/large-cave-lab.gpu.mjs`, `tools/cave-deep-shots.mjs`, `tools/cave-gpu-check.mjs`) and the stream drivers that use local servers or prebuilt dists (CA-2, POI-1, W2, ATM-1) say `--machine 3090` in their headers.
  - **Every result says whether its command ran** (`ran`), from the payload's actual start, not from admission: `true` with `machine`; `false` with `planned` (cancelled or expired while queued, lost before admission, rejected because the tree changed, cancelled before start), and the final line `never ran; planned for …`; or `unknown` when a start on alickers can't be established (a released ticket, an invalid receipt). The frozen goal and route are always kept.
  - **`--snapshot`** needs no rule of its own: alickers runs the submit-time commit, which is the snapshot of a clean tree; a dirty tree is routed here.
- **Only a commit goes to alickers.** A dirty tree, or a command that names a local path outside the worktree (`/work/...`, `/tmp/...`; inputs would be missing, outputs left behind), runs here, and `--machine 4070` is refused with the reason. Put inputs in the commit. Declare outputs with `--artifact`:
  - a relative path is in the job's directory in the sandbox checkout; an absolute path is on the sandbox;
  - each one comes back **whole**, an evidence pack directory included, into `/work/tmp/<ticket>/<name>`, also when the job failed. Outputs are staged inside the sandbox's job lock, so another job can never replace them. The transfer is bounded and cancellable; a failed one is reported with where the staged copy waits on alickers;
  - the result, the ledger and the final line list them with the machine and the tested commit. A fetch that failed is listed as such.
- **`--class exclusive` is refused off the 3090** (it measures the 3090): for a 4070 session use `--class gpu --machine 4070`, whose frame times are recorded, not judged.
- **A command that reads `.test-build*` or `dist` can't go to alickers** (the commit doesn't carry them, and the transport clears `.test-build*`), so `--machine 4070` is refused and `any` runs here. Compile inside the job instead: `npm run playthrough`, `npm run build && …`, or `tsc -p <config> --outDir <job-local dir>` then run from that directory.
- **`any` and `soak` never wait for alickers.** If its job lock is held (someone's direct `alickers-job.sh` call), or the sandbox hasn't admitted the job within 20 s of hand-over, the attempt is given up there (it can then never start) and the job runs here at once. `4070` jobs wait for the lock.
- **Sandbox outages:** if alickers never admitted the job (busy, paused, its lock wait expired, unreachable, or the transport failed first), an `any` or `soak` job runs here instead, keeping its place (`status` marks it `here*`, the result has `fellBack`). A `4070` job waits again, backing off (`remote-retry`), until its queue timeout. A setup failure there (checkout, `npm ci`, an unclean tree) isn't an outage: `any` and `soak` run here, and a `4070` job fails with it. Once the job has started, its own exit codes pass through, 75 and 255 included. The queue learns these phases from the transport's receipt, never from output.
- **Nothing runs twice.** Once a job has reached the sandbox, it runs anywhere else only after alickers confirms that attempt can't start or has stopped, its whole scope included (detached and TERM-ignoring processes are killed with the scope's cgroup). While alickers is unreachable the ticket keeps its place there; it doesn't run here meanwhile, and `cancel` waits too.
- **A sandbox that is gone for good (coordinator only):** once the owner confirms it, `heavy-check release-remote <ticket> --reason "owner confirmed the sandbox is gone"` frees that ticket's reservation. It writes a cancelled (75), unbound result with the reason (`released`), records `remote-released` in the ledger, and ends the ticket's holder. The job isn't run here; resubmit it if needed. Nothing calls this automatically. Builders: ask the coordinator instead.
- **Evidence from alickers is bound to the commit** only if the transport's receipt is valid and complete, its exit agrees with the transport's own, and the shared checkout's tracked files were exactly the commit before and after the job. The result records `dirtyAtAdmit` (`clean`, or `restored:<n>` tracked files left changed by an earlier job) and `changedDuringRun`. A job that changes tracked files isn't bound; the checkout is restored for the next one. A receipt that isn't valid binds nothing: an `any` or `soak` job reruns here, a `4070` job fails with 70.
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
T=$($H submit --class gpu --machine any --artifact out -- node my-play.mjs out)   # prints a ticket at once; out comes back to the result's artifacts[].local
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
- **Playthroughs:** `npm run playthrough -- --scenario …` queues itself (class `playthrough`, `--machine any`) and compiles inside its job. A compiled runner started directly (`node .test-build/scripts/playthrough/run.js`) isn't guarded: queue it yourself, `$H --class playthrough -- node .test-build/scripts/playthrough/run.js --scenario …`, after a compile that ran in a job (`npm run test:build`, here).

  While iterating, run only the affected scenarios (a branch alone with `--from-library`); run them all at handoff.
- **The GPU guard is installed** (2026-10-23 10:12Z, guard `073e8b0da3da`). Rerun `scripts/heavy/install.sh --gpu-guard` after any `npx playwright install`.
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

State lives in `/work/tmp/siltwake-sched/` (the queue, `ledger.jsonl` and per-job logs under `jobs/`). The code is installed to `~/.local/share/siltwake-sched/current` by `scripts/heavy/install.sh`. Rollback is `echo serial > /work/tmp/siltwake-sched/mode`, which makes every job exclusive, as before. `scripts/heavy/install.sh` from an older commit re-points `current` at that version (versions are immutable). `--uninstall` puts every shim back on the v1 lock; the exclusive slice's unit stays, inert without jobs. `--remove-exclusive-slice` removes it, and refuses unless no ticket is running and the slice is provably empty (a failed query counts as in use).
  - **Maintenance:** while `install.sh` changes or removes the exclusive slice's unit, the queue is in maintenance. Nothing is admitted; submissions queue normally and wait, with blocked reason `maintenance`. `status` shows `MAINTENANCE`, its reason, age and owner. One installer runs at a time: `install.sh` holds `install.lock` in the state directory for its whole run, publication included (the unit, the version, `current`, mode, slice and guard). It's separate from the admission lock. A second one waits, up to 10 minutes, then exits 3 with nothing changed. The mark names its operation, and only that operation clears it, once systemd's own view of the slice is verified. A reload is stopped after 120 s (TERM, then KILL).
  - **A maintenance window (coordinator only, by convention and audit):** `heavy-check maintenance set --by coordinator --reason "<why>"` pauses admission on both machines with the same mark; it prints the window's operation id. Running tickets continue; queued ones wait. A held window doesn't stop their queue-timeout clocks, so a long window can expire them (75). A second `set` is refused.
    - **Clearing:** `heavy-check maintenance clear --op <id> --by coordinator --reason "<why>"` resumes admission, for that window's id only. It refuses while any install holds `install.lock`, while an install runs under the window, or while one left it incomplete. An installer's own mark is never cleared this way: rerun `install.sh` until it verifies, and it clears its own mark.
    - **Seeing it:** `heavy-check maintenance status` and `heavy-check status` show the mark; past 15 minutes they add an OVERDUE line with the exact way to end it, and an incomplete install under a window gets its own INSTALL INCOMPLETE line. Every `submit` and `run` prints `maintenance held for <age> by <who>: <why> (op <id>)` while one is held. Warnings never end a window; nothing expires it.
    - **The audit:** `maintenance.jsonl` in the state directory. Each set or clear appends an intent row (who, when, why, the id) under the state lock before it changes anything; if that row can't be written, nothing changes. An outcome row follows the change. An intent row with no outcome means the command was interrupted at its commit; the state shows whether the change was made.
    - **For an install:** set the window, let running tickets end on their own, run `install.sh` once none run (it refuses while a ticket runs, and runs under the window without clearing it), then clear. Builders never set or clear it.
    - **The first window (bootstrap, while the installed version predates the command):** the shim still runs the installed CLI, which has no `maintenance` subcommand. So:
      1. Run `node <accepted-checkout>/scripts/heavy/heavy-check.mjs maintenance set --by coordinator --reason "<why>"` directly, against the production state (the default state directory). The installed scheduler and its already-started supervisors honour the mark.
      2. Let running tickets finish.
      3. Once `heavy-check status` shows no running ticket, run `scripts/heavy/install.sh` from that checkout.
      4. Clear with the now-installed `heavy-check maintenance clear --op <id> …`, or the checkout's CLI.
      5. Keep that checkout available: after a rollback to an older version, only its CLI can show or clear a window.
  - **If the update is incomplete** (a reload failed or overran, systemd didn't answer, the slice held processes, the file couldn't be read or written, or the installer was killed), maintenance stays, with the reason, so nothing runs on stale settings. The recovery is to rerun `scripts/heavy/install.sh` once the cause is gone; it takes over a dead installer's mark and checks systemd from scratch. Older versions never use the exclusive slice, so neither needs any cleanup. Never delete or recreate `/work/tmp/siltwake-heavy-check.lock`: each v2 job holds it shared, through its holder and an anchor inside the job's own scope, until that cgroup is gone, so old v1 copies of the script still exclude them. During the cut-over, v1 goes first: any v1 holder or waiter pauses all v2 admissions. A finite v1 backlog drains, but a continuous one can hold v2 tickets until their queue timeout, so move callers to the shim promptly. Tuning lives in `/work/tmp/siltwake-sched/config.json` (read on every admission): `ceilings` (`{"playthrough": 21600}`), `stalls` (a class's default stall window, e.g. `{"playthrough": 2700}` while worktrees without the playthrough heartbeat remain), `soakYieldS` (300), `soakSlots` (1) and `poolMiB`. The GPU guard is `scripts/heavy/install.sh --gpu-guard` (re-run after `npx playwright install`; `--gpu-guard-remove` undoes it).

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
- Tracked files in the shared checkout are put back to the commit (`git checkout -f`) before the job, and after it if the job changed them. Untracked files stay, except compiled test output (`.test-build*`), which is removed when the commit changes or files were restored.
- With `--receipt DIR` (the queue's lane uses it, with a nonce on stdin), the transport also writes its phases to `DIR/receipt` on the sandbox, each stamped with the nonce, in one order: admitted, the checked-out SHA, setup ok (and whether the tree was restored) or failed, started, the tree after the job, exit. Those lines, not its output, are what the queue trusts. `--no-wait` exits 75 at once if the sandbox's lock is held. The script's header describes both.
- Its test overrides (`ALICKERS_SSH`, `ALICKERS_REPO`, `ALICKERS_TMP`, `ALICKERS_LOCK`) work only with `ALICKERS_TEST_MODE=1` and a private `SILTWAKE_SCHED_DIR`; otherwise they are ignored with a warning.

**Rules:**
- **Best-effort.** Exit **75** (paused by the owner, the queue wait expired, or busy with `--no-wait`) or **255** (unreachable) means **rerun the job on factory-worker** through `scripts/heavy-check.sh`. Never restart Windows, change host settings, run `wsl --shutdown`, or try to bring the sandbox up yourself.
- **Browsers** use `executablePath: "/usr/local/bin/siltwake-chrome"`. It runs Chrome Stable headless under a private Xvfb, on the 4070. Read and follow `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md`. **Everything stays inside Linux:** never use the Windows desktop, cursor, focus, a Windows browser or a Windows-rendered preview. Use a separate profile per job, and close what you open.
- **Artifacts** go in `/work/results/<name>` or `/work/tmp`. Fetch them with `ssh -F ~/.ssh/siltwake.conf siltwake-alickers cat /work/results/<file> > /work/tmp/<file>`.
- **Performance numbers** from the sandbox are labelled **"RTX 4070 Laptop (alickers, shared desktop host)"**. The Windows host can be in use, so treat them as indicative, never as the 3090's exclusive-mode evidence. Functional evidence (play, screenshots, passes) counts like any other run at the recorded SHA.
- **One job at a time** on the sandbox, and the checkout is shared. Don't leave long interactive sessions holding it, and don't edit files there; everything comes from commits.
- **Coordination, provider logins and GitHub pushes stay on factory-worker.** The sandbox has no logins.

## Shared save library (SAVE-1, 2026-10-23)

Don't derive late saves in your own job. After each root merge the coordinator runs `scripts/saves-export.sh` on root: the whole playthrough runs on siltwake-alickers (factory-worker's queue if it is paused), and every bot-earned save lands, read-only, in **`/work/tmp/siltwake-saves/<sha>/`** on factory-worker, shared by every worktree. Kinds include pod start, the Dart, the Creel at 350 m, the Rift at 450 m, the 800 m Creel, the carrier fit-out, the pre-ending of both routes, low air, a damaged hull, a lost craft, a depleted battery, minimum gear and over-geared in the Canopy, and the tour-ready Dart. The details are in [the playthrough README](../../scripts/playthrough/README.md#save-library-save-1).

```sh
npm run test:build                                            # through the queue, here (its .test-build is the product)
node .test-build/scripts/playthrough/saves.js pick creel-350  # prints the save's path
npm run playthrough -- --scenario carrier --from-library      # a branch without its parent's replay
```

- **Light:** `pick` and `list` are light work; run them directly. `verify` and `import` compile a build of the commit when needed (about 5 s), so on factory-worker run those in a job (`$H --class quick -- node .test-build/scripts/playthrough/saves.js verify …`). Exporting is a playthrough: only through `scripts/saves-export.sh`, which runs it from an archive build of the pinned SHA, on the second worker or through the queue.
- **Compatibility:** the newest export at your commit or one of its ancestors, with this build's schema and content versions (or the schema 5 bridge), that this build decodes. Anything else is refused with the reason (exit 3), never swapped for another save. Record the save's commit (stderr, or `--json`) with your evidence.
- **On the second worker:** exports run there keep their copy in the same place, `/work/tmp/siltwake-saves`, so a job there finds every commit exported there. A commit exported on factory-worker isn't there; `pick` then refuses, and you copy the save you need in with the job.
