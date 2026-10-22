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

**Pick a class.** Each class has a reservation and a maximum run time:

| Class | For | Reservation, max run |
| --- | --- | --- |
| `quick` | focused review checks, 1–3 heavy files, smokes | 1 cpu, 2 GiB, 10 min; may use the express slot |
| `standard` (default) | anything else | 2 cpu, 3 GiB, 20 min |
| `heavy-suite` | `npm run test:heavy` (already labelled) | 2–3 cpu, 3 GiB, 25 min |
| `gpu` | task-owned GPU Chrome play, screenshots, functional GPU checks | 2 cpu, 3 GiB, the GPU lease, 25 min |
| `playthrough` | the compiled playthrough (`--jobs` follows the grant) | 2–3 cpu, 2 GiB, 30 min |
| `bake` | cold terrain bake, `bake-terrain --verify` | 2 cpu, 3 GiB, 15 min |
| `exclusive` | frame-time and perf numbers, the large-cave lab bake, known-huge jobs | the whole lane and the GPU, 30 min |

Options:
- `--review`: Sol reviews and the coordinator's composed gate.
- `--deadline S`: clamped to the class maximum.
- `--mem 4G` and `--cpus N`: up to the class maximum.

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
- **Watching and stopping.** `$H status` shows the queue and why each ticket waits (`cpu`, `memory`, `gpu`, `head`, `worktree`, `exclusive`, `lane`, `legacy` or `host-memory`). `$H cancel T` stops a ticket; cancel only your own.
- **Commit before submitting** anything that will serve as handoff or review evidence. The final line prints the tested `HEAD` (plus a dirty hash) and warns if the tree changed between submit and admission.
- **`.test-build` is in use while your job runs.** While a heavy job runs in your worktree, don't rebuild that worktree's `.test-build` (`npm test`, `npm run test:build`): the job is running those files. Wait, or edit in another worktree. Once the TT-1 guard is applied ([SCHED-1](streams/SCHED-1.md), migration step 5), `npm test` refuses on its own.
- **Playthroughs:** compile first, then queue only the run:

  ```sh
  npx tsc -p scripts/playthrough/tsconfig.json
  $H --class playthrough -- node .test-build/scripts/playthrough/run.js --scenario …
  ```

  While iterating, run only the affected scenarios; run all five at handoff.
- **New GPU drivers** call `requireGpuLease()` from `scripts/heavy/gpu-lease.mjs` before launching Chrome.

**Exit codes:**
- the job's own code;
- **124**: the deadline passed;
- **137**: OOM or killed. An OOM message names the class and reservation: rerun with `--class exclusive` or more `--mem`, and never just retry;
- **75**: cancelled, or expired after the 2-hour queue limit (`--queue-timeout`);
- **99**: still pending (`wait` only);
- **2**: a usage error or a request that can never fit.

### Operating it (coordinator)

State lives in `/work/tmp/siltwake-sched/` (the queue, `ledger.jsonl` and per-job logs under `jobs/`). The code is installed to `~/.local/share/siltwake-sched/current` by `scripts/heavy/install.sh`. Rollback is `echo serial > /work/tmp/siltwake-sched/mode`, which makes every job exclusive, as before. `scripts/heavy/install.sh --uninstall` puts every shim back on the v1 lock. Never delete or recreate `/work/tmp/siltwake-heavy-check.lock`: each v2 job holds it shared, through its holder and an anchor inside the job's own scope, until that cgroup is gone, so old v1 copies of the script still exclude them. During the cut-over, v1 goes first: any v1 holder or waiter pauses all v2 admissions. A finite v1 backlog drains, but a continuous one can hold v2 tickets until their queue timeout, so move callers to the shim promptly. Light checks of the scheduler itself (no systemd) are in `tests/heavy-sched-policy.test.ts`. Its acceptance tests are `node --test --test-concurrency=1 scripts/heavy/acceptance.test.mjs`, which uses private state only.
