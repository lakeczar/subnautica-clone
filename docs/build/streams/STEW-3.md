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

EVIDENCE
