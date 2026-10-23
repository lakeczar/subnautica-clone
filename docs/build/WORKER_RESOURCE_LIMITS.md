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
- **`.test-build` is in use while your job runs.** While a heavy job runs in your worktree, `npm test` and `npm run test:build` there refuse to rebuild `.test-build`, because the job is running those files. Wait, or edit in another worktree. The job itself may rebuild.
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

## Second worker: siltwake-alickers (best-effort, added 2026-10-23)

A WSL2 Ubuntu sandbox on the owner's PC (`alickers`): **8 CPUs, 16 GB, no swap, an RTX 4070 Laptop GPU** (Chrome → ANGLE/OpenGL → Mesa D3D12). Fleet provisioned it (handoff: `/work/tmp/siltwake-alickers-handoff/SANDBOX-HANDOFF.md` on factory-worker). It runs **one job at a time**, in its own capped scope (6-CPU quota, 8 GiB by default, 1–12 GiB allowed).

**Use it for:**
- whole headless playthroughs;
- `npm run test:heavy`;
- **RTX 4070 WebGL sessions.** These are the closest thing we have to a player's GPU.

Keep factory-worker for evidence that must be on the 3090, and for anything needing the coordinator or provider logins.

**Run a job** from any worktree on factory-worker:

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

**Rules:**
- **Best-effort.** Exit **75** (paused by the owner, or the queue wait expired) or **255** (unreachable) means **rerun the job on factory-worker** through `scripts/heavy-check.sh`. Never restart Windows, change host settings, run `wsl --shutdown`, or try to bring the sandbox up yourself.
- **Browsers** use `executablePath: "/usr/local/bin/siltwake-chrome"`. It runs Chrome Stable headless under a private Xvfb, on the 4070. Read and follow `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md`. **Everything stays inside Linux:** never use the Windows desktop, cursor, focus, a Windows browser or a Windows-rendered preview. Use a separate profile per job, and close what you open.
- **Artifacts** go in `/work/results/<name>` or `/work/tmp`. Fetch them with `ssh -F ~/.ssh/siltwake.conf siltwake-alickers cat /work/results/<file> > /work/tmp/<file>`.
- **Performance numbers** from the sandbox are labelled **"RTX 4070 Laptop (alickers, shared desktop host)"**. The Windows host can be in use, so treat them as indicative, never as the 3090's exclusive-mode evidence. Functional evidence (play, screenshots, passes) counts like any other run at the recorded SHA.
- **One job at a time** on the sandbox, and the checkout is shared. Don't leave long interactive sessions holding it, and don't edit files there; everything comes from commits.
- **Coordination, provider logins and GitHub pushes stay on factory-worker.** The sandbox has no logins.

## Shared save library (SAVE-1, 2026-10-23)

Don't derive late saves in your own job. After each root merge the coordinator runs `scripts/saves-export.sh` on root: the whole playthrough runs on siltwake-alickers (factory-worker's queue if it is paused), and every bot-earned save lands, read-only, in **`/work/tmp/siltwake-saves/<sha>/`** on factory-worker, shared by every worktree. Kinds include pod start, the Dart, the Creel at 350 m, the Rift at 450 m, the 800 m Creel, the carrier fit-out, the pre-ending of both routes, low air, a damaged hull, a lost craft, a depleted battery, minimum gear and over-geared in the Canopy, and the tour-ready Dart. The details are in [the playthrough README](../../scripts/playthrough/README.md#save-library-save-1).

```sh
npx tsc -p scripts/playthrough/tsconfig.json                 # light; from your checkout
node .test-build/scripts/playthrough/saves.js pick creel-350  # prints the save's path
npm run playthrough -- --scenario carrier --from-library      # a branch without its parent's replay
```

- **Light:** `pick`, `list` and `verify` are light work; run them directly. Exporting is a playthrough: only through `scripts/saves-export.sh`, the second worker or the queue.
- **Compatibility:** the newest export at your commit or one of its ancestors, with this build's schema and content versions (or the schema 5 bridge), that this build decodes. Anything else is refused with the reason (exit 3), never swapped for another save. Record the save's commit (stderr, or `--json`) with your evidence.
- **On the second worker:** exports run there keep their copy in the same place, `/work/tmp/siltwake-saves`, so a job there finds every commit exported there. A commit exported on factory-worker isn't there; `pick` then refuses, and you copy the save you need in with the job.
