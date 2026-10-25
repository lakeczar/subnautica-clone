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
    - its compiled import closure (`closure`: a hash of the file and its relative imports, named relative to the build so it's the same in any checkout) and its own cache use (`cacheUse`: hit, fill, mixed or none). The run also records the lockfile's and the harness's hashes (R1-2).
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

## R1 (Sol, `1b5d99d7`): what changed
Root is merged (SCHED-3 included; no conflicts), at `0338044`.
- **R1-1 (P1), alternate budgets passed the real-budget gate:**
  - **The tier:** **either** variable is now an override: `SILTWAKE_HEAVY_BUDGET_MIB`, or `SILTWAKE_HEAVY_BUDGETS` naming any budgets file but `tests/heavy-budgets.json`. The tier labels it `NOT BUDGET EVIDENCE` (naming the variable) and stores `override: { budgetMiB, budgetsFile }` with `budgetEvidence: false`.
  - **The gate also stops trusting the record's word.** Its full-tier check reads the canonical facts at its own commit (`canonicalAt`: every `tests/*.heavy.test.ts` from `git ls-tree`, and each file's budget from `tests/heavy-budgets.json` via `git show`). It requires the record's files to be exactly those, each at its canonical budget.
  - **Regressions:**
    - the heavy-tier test runs the tier with `SILTWAKE_HEAVY_BUDGETS` raising budgets to 1,536 MiB;
    - the gate test refuses a budgets-file override, a record claiming real budgets at a raised one, and a missing file.
- **R1-2 (P2), `matchKey` couldn't establish a control:** replaced by two separate things.
  - **Identity** (`identityOf`): commit, file, the file's closure hash, the lockfile hash and the harness hash (the four tier scripts). The two arms of an A/B differ here by design.
  - **Conditions** (`conditionsOf`): machine, containment, the job's memory limit, pool, concurrency, CPU grant, the file's budget, phase, Node, and the file's own cache use. Cache use comes from that file's counters, so a store that is warm overall no longer makes a fill look like a hit; Sol's warm-but-miss case is a regression.
  - **`controlProblems(candidate, control, intendedSha)`:**
    - the control is eligible, at exactly the intended clean commit (the CLI requires the full 40-hex SHA);
    - it's for the same file, with the same harness and a recorded closure;
    - every condition is equal, and the cache use isn't mixed.
  - **CLI:** `heavy-results.mjs control --commit SHA --file NAME --like TICKET` lists the qualifying rows and why the others fail.
- **R1-3 (P2), eligibility ignored the receipt:** one check, `eligibility(stored, run, row)`. It requires:
  - a v2 record;
  - a receipt for the same ticket that the record names;
  - a job that ended on its own work, with an exit-1 file failure allowed as the files' own verdict;
  - no stop reason, and not DISTURBED;
  - evidence bound to the record's commit;
  - the receipt's machine equal to the record's;
  - a clean tree, canonical budgets, and a passing file.

  `fullTierProblems`, `near` and `control` use it. `show` marks other rows `NOT ELIGIBLE` with the reasons, and `show --eligible` filters to eligible rows. Sol's mismatched-receipt probe is a regression, through `ingest` and the CLI as well.
- **The pipe tripwire** also rejects `;` and `||` in the scripts the gate runs, since those could hide a failing stage. Sol noted the old regex let `false || true` through. It's still a tripwire, not proof that every exit code propagates.
- **The 7-day retention gap:** unchanged and disclosed above. Sol and I agree a daily lightweight `ingest` is worth scheduling; that's the coordinator's call.

## R1 evidence
Everything ran through the queue.
- **Fast tier, `--machine any`:** 1,703/1,703, none skipped, at `c43e5e1` on factory-worker (`261025-042238-34ef`). It includes the focused files, all passing:
  - `heavy-results`: eligibility, the canonical full-tier check, controls, alerts, `ingest`/CLI, the gate's heavy step and the pipe tripwire;
  - `gate`, `gate-routing`, `local-guard` and `tier-guard`.
- **The real `npm run gate -- --only heavy`** at `50c9ab9` (the last code change is `c43e5e1`; after it, docs only):
  - ticket `261025-043250-7875`, on factory-worker because alickers was busy, 14m11s, exit 0, evidence bound to `50c9ab9`;
  - it stored 67 rows, and the gate's eligibility and canonical checks passed (`pass heavy 855 s [on RTX 3090 (factory-worker)]`).

  Output: [`stew3/gate-heavy-r1.txt`](stew3/gate-heavy-r1.txt); rows: [`stew3/stored-rows-50c9ab9.txt`](stew3/stored-rows-50c9ab9.txt).
  - **The records:** all 67 rows are v2 and **eligible**, each with a closure hash, plus the run's lockfile and harness hashes, and no override.
  - **The cache:** warm at the start (1,493 entries), where the first run was cold. Per file, 62 rows were `hit`, 4 `none` and 1 `mixed`. That shows why cache use must be per file: the mixed row can't serve as a control.
  - **`heavy-tier.heavy.test.ts`:** 12/12, including the new `SILTWAKE_HEAVY_BUDGETS` override test under both containments. The 3 OOM kills are again all nested inside it.
  - **The R0 run** at `f9dcfce` (a v1 record) now reads `NOT ELIGIBLE: a v1 record`, as intended.

## R2 (Sol, `9b909ed7`): what changed
Root merged again (`e7028cb`). The coordinator's rulings, as built:
- **R2-1 (runtime identity):**
  - **Recording:** every heavy file's processes now report what they loaded and read (`scripts/test-heavy-file.mjs`, carried to node descendants through `NODE_OPTIONS`). `fileFacts` accounts for each input:
    - not inputs: `node_modules` (the lockfile), `/proc`/`/sys`/`/dev`, the build cache, and what the file's own processes created or wrote (a `mkdir` of an existing directory doesn't count);
    - bound to the commit: files tracked there, or compiled into the build from one;
    - hashed as the run found them: declared generated or external paths (`tests/heavy-inputs.json`).
  - **Conservative default:** anything else (a computed import of a generated module, an ignored fixture, a read outside the repository, a descendant that never reported) leaves the row's provenance **incomplete**. Its numbers stay full gate evidence; only `control` refuses it.
  - **Controls:** both arms must be complete, but their inputs aren't required to be equal. A control is also refused when another complete run of that commit's file, with the same closure, read different inputs (not reproducible).
  - **The real cases:**
    - `timeline-model` needs no declaration: its sources are tracked, and its tmp builds are its own `mkdtemp`;
    - `regions-bake` declares `public/terrain/`, the terrain store, esbuild and its workers, with why.
  - **Regressions:** the real runner's computed-import and generated-fixture probes, and the unit cases.
- **R2-2 (workload settings):**
  - **Recorded:** every `SILTWAKE_*` variable that isn't a queue grant or the harness's own plumbing, plus `NODE_OPTIONS` (minus the tier's own preload), `JOURNEY_TRACE` and `LC_VERBOSE`, goes in `settings`. The tier labels them, and they're a strict control condition.
  - **The gate:** its heavy step is submitted with a canonical environment (`canonicalEnv`: no workload settings, no budget overrides), so nothing pins it to the 3090 either. Its check refuses a record that has settings.
  - **Coverage:** the timeline selector, with a test that every variable a heavy test reads is classified, and `SILTWAKE_TIMELINE_SEQUENCES=0` through the real runner and through the gate.
- **R2-3 (child cache):**
  - Cache use is summed over every process of the file that has a store, keyed by the file's own stats prefix.
  - A child or worker that never reports makes it `unknown`, and that refuses control reuse. Worker threads don't run `NODE_OPTIONS` preloads (checked), so they count as unobserved unless declared.
  - A child without a store is fine: its work never depends on the cache.
  - Regressions: a real child that fills and then hits, and a real child started without the preload.
- **R2-4 (ingest race):** `publish` writes a temporary file unique to the process, then hard-links it into place. That fails if the target exists, which counts as "already stored". The gate catches any storage error too. Regressions: six concurrent ingests (one publishes, the rest see it stored, no leftovers), and the gate passing when a sweep stores its ticket first.
- **R2-5 (fallback):**
  - Records carry `attempt` (`local`, or `alickers:a<N>` from the lane's attempt directory). Eligibility requires the attempt the receipt reports on (`terminalAttempt`).
  - The gate selects the last complete record from that attempt. Machine agreement is unchanged.
  - Regression through the gate: alickers completes, its receipt is lost, the rerun here succeeds. It passes on the local record, and fails when only the abandoned attempt's record exists.
- **Daily ingest (approved; built, not installed):**
  - **Sweep:** `heavy-results.mjs sweep` is bounded: 200 jobs per run, logs over 64 MiB skipped, and a checkpoint of jobs already read (pruned with the queue). It leaves running jobs for later, publishes only complete records, atomically, and writes `sweep-last.json`.
  - **Overdue signal:** `sweep-status` exits 1 when no sweep has succeeded in 36 h.
  - **Installer:** `scripts/heavy-results-timer.sh install|uninstall|status` copies `heavy-results.mjs` read-only to `~/.local/share/siltwake-results/sweep/<hash>/`. It writes a `siltwake.slice` oneshot service, which runs `heavy-check run --class quick --review --machine 3090 --deadline 900 --queue-timeout 5400 -- node <copy> sweep --max 200`, and a daily `Persistent=true` timer.
  - **Tested** with `--dry-run`. **The coordinator installs it after merge.**
- **Records are v3.** v1 and v2 records stay readable as diagnostics and are never eligible.

## R2 evidence
Everything ran through the queue, `--machine any`, with no exclusive time. The last code change is `1fb0e42`; after it, only docs and saved evidence.
- **Fast tier:** 1,712/1,712, none skipped, at `1fb0e42` on alickers (`261025-054427-c1f5`). It includes the focused files and the regressions:
  - schema;
  - attempts, including the fallback through the gate;
  - workload, including the gate's canonical submission and every variable a heavy test reads being classified;
  - file facts (computed import, generated fixture, declared inputs, children, workers);
  - six concurrent ingests;
  - the gate passing while a sweep stores its ticket first;
  - the bounded, checkpointed sweep and its overdue signal;
  - the timer installer (dry run).
- **Earlier attempts:** two found my own test bugs (a probe's quoting, a wrong expectation, the harness's own test in the env scan). All are fixed.
- **The real `npm run gate -- --only heavy`** at `1fb0e42` (`261025-055450-807e`): it waited 22m43s behind REC-1's exclusive series, then ran on **alickers** in 9m30s, exit 0, bound. The gate stored 67 rows and passed: `pass heavy 1933 s [on RTX 4070 Laptop …]`. Output: [`stew3/gate-heavy-r2.txt`](stew3/gate-heavy-r2.txt); rows: [`stew3/stored-rows-1fb0e42.txt`](stew3/stored-rows-1fb0e42.txt).
  - **Attempt binding, end to end:** the record says `attempt: alickers:a1`, the receipt is remote attempt 1, and all 67 rows are eligible. `settings: {}` (the canonical workload); the build cache was cold at the start.
  - **Provenance:** 65 of 67 files are complete.
    - `timeline-model` reads 712 inputs, all accounted for, with no declaration.
    - `regions-bake` is complete through its declaration (280 inputs).
    - Two are incomplete, and so are never a control (both stay gate evidence):
      - `save-library-build` starts `git`, `bash`, `flock` and `chmod`, and reads an archive build's `.siltwake-source-commit`;
      - `heavy-tier`, the harness's own self-test, starts nested runners and `git`.
  - **`heavy-tier.heavy.test.ts`:** 18/18, including the new real-runner regressions under both containments:
    - a child's fill-then-hit;
    - a silent child, recorded as `unknown`;
    - a computed import and a generated fixture, left incomplete;
    - `SILTWAKE_TIMELINE_SEQUENCES=0`, recorded and labelled.
  - **Cache use across a cold tier:** per file it's a mix of `hit`, `fill`, `mixed` and two `unknown`. That's why reuse needs each file's own cache use.
  - **OOM kills:** only the 3 nested ones inside `heavy-tier`. **`near`:** nothing at 85% (the top file is `timeline-model` at 75.3%).
- **Not done:** the timer isn't installed; that's the coordinator's step after merge. No local CPU work, apart from one 50 ms `node` probe of worker-thread preloading while REC-1's exclusive was running. I chained the status check and the probe in one call, so the check didn't actually gate it; disclosed here.

## Files
- **New:** `scripts/heavy-results.mjs` (record format, store, CLI, the sweep); `scripts/heavy-results-timer.sh` (the timer's installer); `tests/heavy-inputs.json` (declared inputs); `scripts/test-heavy-file.mjs` (each heavy file's process reports its CPU, peak and cache use); `tests/heavy-results.test.ts`.
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
    - identity, conditions, eligibility and control selection (R1);
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
  - A/Bs can read a root row through `heavy-results.mjs control` instead of re-running the control arm.

## Compromises
- **Records reach the store through the queue's job logs,** which are pruned after 7 days. A run on another machine or outside the queue stays only in its own `<build>/heavy-results.json` until someone ingests it. The gate ingests its own step at once; other runs need `heavy-results.mjs ingest` within the week. *Root fix:* the nightly run (item 4's next step) ingests. *Cost:* until then, branch runs not ingested within 7 days are lost from the store.
- **CPU per file is the whole tree only under cgroup containment.** Under the process-group fallback it's the file's own process (`cpuScope: "process"`), and OOM kills are `null`, never 0.
- **The cache state is the build cache's,** not V8's compile cache or the terrain store's. Those aren't recorded.
