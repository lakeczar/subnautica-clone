# STEW-3: the heavy tier on root, stored per-file results, measurement hygiene (handoff)

Opus 5.5 high. Branch `t3/stew-3-heavy-gate`, from root `60f02dbb` (`origin/feat/siltwake-first-expedition`, which includes STEW-2 at `e136beb6`). Head: see the report. Story-neutral; no spoilers read. `scripts/heavy/*` and game code are untouched. Scope: the test-efficiency recommendation (`/work/tmp/test-efficiency/RECOMMENDATION.md`), items 1, 3 and 4, plus OOM kills per file.

## Outcome
- **The full heavy tier is a gate step.** `npm run gate` gains `heavy`: `npm run test:heavy`, queued `--class heavy-suite --machine any --review`. The owner accepted about 10 minutes per root merge, mostly on alickers.
  - **Order:** it runs after the local batch and before the playthrough.
  - **The step counts only with a stored record of the full tier, at real budgets, for the gate's clean commit.** It fails if the record is missing, if the run used the budget override ("not budget evidence"), if it ran a subset, or if it's for another or dirty tree.
  - **Every gate row now says where it ran** (`[on <machine>]` from the receipt, or `here`).
  - **Ready for "affected files only plus a nightly full run":**
    - the step's `run` is the only thing a selection changes;
    - each record says whether it ran the full tier or a subset;
    - the tier already warns when a file is at 85% of its budget, and `heavy-results near` lists them.

    The selection tool and the nightly scheduler aren't built.
- **Stored per-file heavy results with their context.** Every heavy-tier run prints one `heavy-results: {json}` record after its summary, and writes it to `<build>/heavy-results.json`.
  - **The run:**
    - the commit, and whether the tree had uncommitted changes;
    - the machine and the ticket;
    - the Node version and the containment kind;
    - the job's memory limit, the pool and the concurrency;
    - the build cache at the start (cold, warm or off, with its entry count);
    - whether it ran the full tier or a subset;
    - the override, if any, and `budgetEvidence`.
  - **Per file:**
    - status, and phase (pool or timing);
    - wall time;
    - CPU time: the whole tree, from the file's cgroup, or the file's own process where there's no per-file cgroup (`cpuScope`);
    - peak memory against its budget, and as a percentage;
    - **OOM kills, at the file's own budget and in nested cgroups below it, counted separately** (`null` where they can't be counted, never 0);
    - build-cache hits, misses, fills and fill CPU;
    - for timing files, the CPU wait;
    - a `matchKey`: machine, containment, budget, cache state and Node.
  - **The store:**
    - The queue keeps every job's output on factory-worker, alickers' runs included. `node scripts/heavy-results.mjs ingest` copies the records, with the job's receipt (exit, machine, evidence binding, DISTURBED), into `/work/tmp/siltwake-results/heavy/runs/<ticket>.json`. That store outlives the queue's 7-day job logs.
    - Read it with `show [--commit] [--machine] [--file] [--json]` and `near [--pct 85]`.
    - It holds results only: no repo files, and no edits to queue state.
- **The override label.** A heavy run with `SILTWAKE_HEAVY_BUDGET_MIB` set prints `NOT BUDGET EVIDENCE: …`, at the start and in its summary, and is stored with `budgetEvidence: false`. `near` and the gate ignore such runs.
- **Measurement hygiene in the tier scripts:**
  - **The heavy summary** opens with the commit, machine, containment, the job's memory limit, pool, concurrency and cache state.
  - **Each row** carries wall time, CPU, peak against its budget, cache use and any OOM kills.
  - **The fast tier's summary and `fast-timing.json`** carry the same context (`{ context, files }`): commit, machine, the 1 GiB V8 heap per file, job limit, concurrency and cache state.
  - **`pipefail`:** the shell scripts already set `set -euo pipefail`. The gate spawns no shell pipelines, and a test keeps the gate's commands and the package scripts it runs free of pipes.

## Files
- **New:** `scripts/heavy-results.mjs` (record format, store, CLI); `scripts/test-heavy-file.mjs` (each heavy file's process reports its CPU, peak and cache use); `tests/heavy-results.test.ts`.
- **Changed:**
  - `scripts/test-tier.mjs`: records, context, the override label, near-budget warnings and the fast-tier context;
  - `scripts/heavy-containment.mjs`: tree CPU and own/nested OOM kills from each file's cgroup;
  - `scripts/test-build-cache.mjs`: hit, miss and fill counts;
  - `scripts/gate.mjs`: the heavy step, ingest and machine per row;
  - `scripts/local-guard.mjs`: `SILTWAKE_RESULTS_DIR` is a local-side setting and doesn't pin a job to the 3090;
  - `tests/heavy-tier.heavy.test.ts`, `gate.test.ts` and `gate-routing.test.ts`;
  - `docs/build/WORKER_RESOURCE_LIMITS.md`.

## The OOM kills, answered
A heavy run on root reports "3 process(es) were OOM-killed inside the job by a sub-limit", every time, budgets or not; LS-1 saw the same. The stored rows show where they happen.
- **Where:** all 3 are in `heavy-tier.heavy.test.js`, nested (`oom-killed 0 own + 3 nested`).
- **Why:** that file's deliberate over-budget probe ("a child over the file's budget fails that file only") has its own nested runner kill the probe's tree, which is the containment behaviour the test asserts.
- **Every other file:** 0 own and 0 nested.

**So the message is benign:** no real file's budget killed anything. The tier now prints the attribution (`OOM kills inside nested cgroups …: heavy-tier.heavy.test.js 3`), so a kill elsewhere would stand out.

## Evidence
Everything ran through the queue; nothing CPU-heavy ran locally.
- **Fast tier, `--machine any`:** 1,689/1,689, none skipped, at `f9dcfce` on alickers (`261025-030540-3ce3`).
  - **New in `tests/heavy-results.test.ts`:**
    - record parsing;
    - the cache state;
    - `matchKey`;
    - the full-tier rules (missing record, override, subset, other commit, dirty tree);
    - near-budget, ignoring override runs;
    - `ingest`, `show` and `near` against private queue and results roots;
    - the gate's heavy step, judged on its stored record, against a stand-in queue;
    - no pipeline in the gate's commands or the package scripts it runs.
  - **Updated:** `tier-guard.test.ts` checks that `fast-timing.json` records a cold then warm cache and the 1 GiB heap.
  - **Earlier attempts:** two found test fixtures my changes had broken (`bc44bc7`, `0ecb91a`): the gate fixture copies its imports, and the timing file's shape changed. Both are fixed.
- **The gate's real heavy step** (`npm run gate -- --only heavy` from this agent's shell, not in a job; output in [`stew3/gate-heavy.txt`](stew3/gate-heavy.txt)):
  - it submitted `--class heavy-suite --machine any --review -- npm run test:heavy` as ticket `261025-034422-1861`;
  - it ran the full tier (67 files) on factory-worker, because alickers was busy, in 15m58s, exit 0, with evidence bound to `f9dcfce`;
  - it stored 67 file rows, and the gate row reads `pass heavy 1165 s [on RTX 3090 (factory-worker)]`.

  This run is also this branch's heavy-tier evidence: every file passes, including `heavy-tier.heavy.test.ts` 10/10. The new tests there cover:
  - the record's context;
  - the override label;
  - per-file CPU, cache use and own/nested OOM kills;
  - the real-budget run as budget evidence;
  - under cgroup containment, the over-budget probe counted as an OOM kill under its own budget.
- **The stored rows** ([`stew3/stored-rows-f9dcfce.txt`](stew3/stored-rows-f9dcfce.txt), `node scripts/heavy-results.mjs show --commit f9dcfce`):
  - **context:** commit `f9dcfce`, clean; RTX 3090 (factory-worker); cgroup containment; job memory 3,072 MiB, pool 2,560 MiB, 3 at once; build cache **cold** at the start; full tier; budget evidence;
  - **coverage:** all 67 rows have tree CPU and cache use;
  - **highest peaks:**
    - `caves-deep-perf` 803/1,024 MiB (78.4%);
    - `timeline-model` 767/1,024 (74.9%);
    - `caves-reef-isles-shell` 729/1,024 (71.2%);
  - **`near`** lists nothing at the 85% line.

## Notes for the coordinator
- **Gate time:** the heavy step took about 16 minutes on the 3090 while alickers was busy. The earlier alickers runs of the whole tier took about 10 minutes.
- **The gate's output** carries about 960 `running for Ns` lines from `heavy-check wait` during a long step. That's the queue-progress chatter SCHED-3 is already quieting.
- **Next, from the recommendation:**
  - affected-only selection (item 6) changes only the gate step's `run`;
  - a nightly full run can call `heavy-results.mjs ingest` and `near` for its 85% alert;
  - A/Bs can read a root row by `matchKey` instead of re-running the control arm.

## Compromises
- **Records reach the store through the queue's job logs,** which are pruned after 7 days. A run on another machine or outside the queue stays only in its own `<build>/heavy-results.json` until someone ingests it. The gate ingests its own step at once; other runs need `heavy-results.mjs ingest` within the week. *Root fix:* the nightly run (item 4's next step) ingests. *Cost:* until then, branch runs not ingested within 7 days are lost from the store.
- **CPU per file is the whole tree only under cgroup containment.** Under the process-group fallback it's the file's own process (`cpuScope: "process"`), and OOM kills are `null`, never 0.
- **The cache state is the build cache's,** not V8's compile cache or the terrain store's. Those aren't recorded.
