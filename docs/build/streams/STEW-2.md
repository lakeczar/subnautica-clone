# STEW-2: local work can't disturb a 3090 exclusive run (handoff)

Opus 5.5 high. Branch `t3/stew-2-exclusive-guard`, on root `6ee488a`. Head: see the report. Story-neutral; no spoilers read. `scripts/heavy/*` and game code are untouched. R1 (Sol, `e8764aa`): request changes, five findings. R2 follows the coordinator's decision: **no leases; on factory-worker, guarded commands don't run locally at all, they go through the queue.**

## Outcome
- **On factory-worker, the repo's CPU work runs only through the queue.** Each CPU-heavy entry point asks `scripts/local-guard.mjs` first. Unless it is admitted, it runs **the same command again** through `heavy-check run --class <its class> --machine <any|3090> -- …`, in the foreground, and exits with its code, so it reads like a local run. The queue then knows every sanctioned CPU job, and an exclusive run drains them like any other job: no race, no lifetimes, no SCHED patch.
  - **Admitted (runs directly):**
    - inside a real heavy-check job (`SILTWAKE_JOB_TICKET`, and this process in that ticket's recorded cgroup, by whole path components);
    - on the alickers sandbox, positively identified: hostname `siltwake-alickers`, its `/usr/local/bin/siltwake-job`, and no queue state there;
    - with `SILTWAKE_LOCAL_OVERRIDE="<why>"`, logged to `/work/tmp/siltwake-sched/local-overrides.jsonl` once per command tree. If the log can't be written, it refuses.
  - **If the queue client can't be run** (missing, not executable, killed), the command refuses with exit 75 and the reason. It never falls back to running locally. The guard reads no queue state; the queue decides.
  - **Guarded:**
    - the npm scripts: `npm test`/`test:fast`, `build`, `typecheck`, `playthrough`, `check`, `test:build`, `bake:terrain`;
    - the node entry points: `scripts/test-tier.mjs`, `test-build.mjs`, `guard-architecture.mjs`, `bake-terrain.mjs`, the six economy scripts, `sim-bench.mjs`, `timeline-save-bench.mjs`;
    - the shell scripts: `saves-build-at.sh`, `sim-differential.sh`.

    Each package script is a wrapper (`local-guard.mjs --class C -- npm run X:direct --`). `X:direct` refuses outside a job, so it isn't a way round.
  - **Where a routed command runs:**
    - **`any`** (alickers when free, else here): tests and checks;
    - **`3090`:**
      - whatever leaves its product in your worktree (`test:build`, `build`, the bake);
      - commands naming local paths;
      - any command when your environment carries a setting (`SILTWAKE_*`, `NODE_OPTIONS`), since alickers receives only the command line.

    The tiers and the economy scripts compile inside their job, because on alickers there is no `.test-build` until they do.
- **Nothing expensive loads before admission (F3).** The economy scripts import their compiled `.test-build` modules dynamically after the guard. `guard-architecture.mjs` loads TypeScript, and `bake-terrain.mjs` loads esbuild, only after it. A routed or refused script loads none of them, even with no build output.
- **Scope membership is one shared predicate (F4):** `scripts/cgroup-scope.mjs` compares whole cgroup path components, against the job's recorded scope path (`jobs/<ticket>/cgroup`) or else its unit. A process is inside only if it is in the scope or below it, so `<unit>.scope-escaped.scope` isn't. SCHED's nested and GPU checks share the weaker `includes` rule; the coordinator has SCHED-3 adopt this helper in its follow-up.
- **`npm run gate`:** where local steps aren't admitted (factory-worker), fast, build and economy go to the queue as **one** `--class standard --machine any --review` job (`gate.mjs --batch <ids>`). The bake runs first; each step is reported from the job's `gate-batch:` line and judged on its receipt (exit, stop reason, DISTURBED, bound to the pinned commit). Admitted (in a job, on alickers, or overridden), they run directly. `--machine` moves the batch too. The R1 behaviour of choosing per step is gone, along with `--queued`, since on factory-worker there's no other choice.
- **`scripts/saves-export.sh` compiles nothing outside the queue** (unchanged in R2; Sol passed it).
  - **The export:** one `--machine any --class playthrough --snapshot --artifact <root>/<sha>` job builds the SHA, exports and verifies where it ran.
  - **The import:** only when the export ran on alickers, a small `--machine 3090` job imports (decodes) the copy.
  - **An existing commit** is verified in a job.
- **Heavy-tier timing bounds.** Files that assert elapsed time (`exclusive` in `tests/heavy-budgets.json`) run in a **timing phase**: last, one at a time. Each row reports the CPU wait (PSI "some") of the job and the host. No bound changed.
  - **Classification (F5):** a heavy file that reads a clock, itself or through a test helper beside it (transitively), must be listed under `exclusive` or `clockWithoutBound`, or the tier refuses (exit 2). The scan covers:
    - `Date.now`, `Date()`, `new Date` with no argument, `Date` aliased or destructured;
    - `performance` (and `perf_hooks` imports);
    - `hrtime`;
    - the CPU-usage clocks;
    - `console.time`.
  - **Newly classified:** `heavy-tier.heavy.test.ts` asserts its runner ends promptly, so it is a timing file. `terrain-borders`, `world-kit-render` and `regions-bake-decode` poll through `shared-support`'s `waitUntil` timeout, so they are clock-without-bound.

## R1 findings and what changed
- **F1 (P1), leases aren't mutual exclusion:** dropped entirely, with the SCHED patch and its check script. On factory-worker the guarded commands are queue jobs, so the queue's own admission is the exclusion: an exclusive drains them like any job, and nothing is registered, aged or expired.
- **F2 (P1), fail-open and unknown state:** the guard reads no queue state at all. Alickers is admitted only by positive identity (hostname, its `siltwake-job` tool, no queue directory), never because something is missing. Everything else routes, and a queue client that can't run means refusal (75).
- **F3 (P2), static imports before the guard:** dynamic imports after admission in all six economy scripts; TypeScript and esbuild likewise. A test runs each routed script with a module-resolution hook, in the repo and in a bare copy without `.test-build` or `node_modules`. No compiled module, TypeScript or esbuild loads, and there's no `ERR_MODULE_NOT_FOUND`.
- **F4 (P2), scope-name prefix:** `cgroup-scope.mjs`, with tests for the scope, descendants, `/sys/fs/cgroup` prefixes, trailing slashes, and prefix-collision siblings (by path and by unit). End to end inside a real job: the job's real path admits, and a prefix-named path routes.
- **F5 (P2), `Date.now` bypass:** the wider scan above, with regressions for `Date.now`, a destructured `Date`, `new Date().getTime()` and `+new Date`, an aliased `perf_hooks` import, `hrtime`, and a clock read through a helper. A fixed `new Date(0)` isn't refused.
- **Docs:** this handoff and `WORKER_RESOURCE_LIMITS.md` say plainly what remains a convention (below).

## How agents run things now (paste into briefs)
- **Run the npm scripts as before.** On factory-worker they queue themselves, in the foreground, and print the queued command first.
- **Commit first** (a WIP commit is fine) so a `--machine any` command can go to alickers. With uncommitted changes it runs here. If the tree changes while it waits, the queue rejects it (exit 3).
- **One job per worktree runs at a time:** a guarded command waits behind your own running job in the same worktree.
- **`node scripts/local-guard.mjs --status`** says what happens here.
- **The override** is for seconds of work you can't queue: `SILTWAKE_LOCAL_OVERRIDE="why" npm run typecheck`. It's logged. If `heavy-check status` shows an exclusive ticket, tell the coordinator its id and the time.
- **Not prevented, a convention only:**
  - bare `npx tsc` and `npx vite build`;
  - `vite dev`;
  - `node --test <file>`;
  - compiled runners started directly (`node .test-build/…`);
  - the `:direct` scripts' commands typed by hand;
  - SCHED's acceptance suites run directly.

  Use the npm scripts, or `heavy-check` yourself.
- **The coordinator:** `npm run gate` and `scripts/saves-export.sh` need no status check before them.

## The finding behind "timing bounds flake" (R1, unchanged)
TT-1 already ran the four timing files alone within the tier, and CW-1's failing run did too. The log (`261024-155654-6ff6`) shows `caves-deep-perf` at 437.6 µs as the 64th of 66 files, after the pool had drained. What ran beside it was another queue job on the 3090: `npm run playthrough -- --jobs 3` (`261024-160618-7506`, 16:08:36–16:17:07Z). The timing phase makes the ordering explicit and the contention visible; the root fix is compromise 3.

## For SCHED-3 (not edited here)
- **The scope predicate:** adopt `scripts/cgroup-scope.mjs` (`withinCgroup` against `jobs/<ticket>/cgroup`, or `hasScopeComponent`) for heavy-check's nested-call check and the GPU lease check. Both still use `includes(`/<unit>.scope`)`, which R1-F4 showed accepts a prefix-named sibling.
- **Queued progress in `heavy-check run`:** it prints a line every second while queued, because the line includes the waited time, so `follow()` sees a change each poll. Now that every guarded command is a foreground `run`, that floods agents' output (about 650 lines for an 11-minute wait). Printing on a change of position or blocker, plus a periodic heartbeat line, would read better.

## Compromises, each with its root fix and cost
1. **Bare compiler calls and direct runners aren't prevented** (the convention list above). *Root fix:* none in the repo short of wrapping `node_modules/.bin`. The structural fix, CPU isolation of the exclusive slice, is ruled out by the never-touch-T3-slices rule. *Cost:* these rely on habit.
2. **Every guarded command is now a queue job, even when nothing is measuring.** That adds about a second of queue overhead. On a quiet machine a dirty-tree command is admitted at once; with an exclusive series running, it waits for its turn (≤ 30 min), or runs on alickers if committed. *Root fix:* none needed; it is the design. *Cost:* latency for agents during exclusive windows, so commit to use alickers.
3. **Timing bounds are still judged on a shared machine.** *Root fix, for the files' owners (CW-1, the CA streams, LC):* bounds on thread CPU time (`process.threadCpuUsage()`), or a queue class reserving the whole CPU pool. *Cost:* four tests, or a SCHED class.
4. **`SILTWAKE_HEAVY_CHECK` names another queue client** (tests use stand-ins), so pointing it at `/bin/true` would skip the work. The guard prints the client it used whenever it isn't the production one. *Root fix:* none short of removing the test seam; it's an explicit act, like the override.
5. **The clock scan is textual,** over the test file and the helpers beside it, not code reached through `src/`.
6. **A routed command doesn't update your worktree when it runs on alickers.** That's why commands whose product is in the worktree route to `3090`, and guarded consumers compile inside their job. A bare `node .test-build/…` after a routed `npm test` can read a stale build, so run `npm run test:build` first.
7. **A batched gate prints the job's last 40 lines;** the gate names `heavy-check log <ticket>` for the rest.
8. **An alickers export builds the SHA twice:** the export there, the import here. That's the import's trust boundary.

## Evidence
All checks ran through the queue; nothing CPU-heavy ran locally (exclusive series from REC-1 were queued throughout).
- **Fast tier:** 1,649/1,649, none skipped, at `daa1d02` (the last code change; after it, only this handoff), on factory-worker twice:
  - `261024-200325-c51c`: submitted `--machine any`, run here while alickers was busy;
  - `261024-200326-b1a4`: `--machine 3090`.

  Both run the inside-a-real-job test in the production queue's own job scope: the recorded cgroup and its parent admit, and a string prefix of it routes. An alickers pass at `883708d` (`261024-193339-bcbf`, 1,649/1,649) covered the sandbox side; between that and `daa1d02`, only that test's form and docs changed.
- **Heavy tier, `--machine any`:** every file passes on alickers at `3869736` (`261024-194043-b7eb`, 612 s, exit 0, bound). `heavy-tier.heavy.test.ts` passes 8/8: containment, the timing phase, and the clock-form refusals under both containments. Five timing files ran last, one at a time, all ok:

  | File | CPU wait: job | CPU wait: host |
  | --- | --- | --- |
  | `caves-canopy-basin` | 0.2% | 0.3% |
  | `caves-deep-perf` | 0.1% | 0.2% |
  | `caves-reef-isles-game` | 0.1% | 0.1% |
  | `heavy-tier` | 0% | 0.1% |
  | `large-cave-canopy` | 0.1% | 0.2% |

  Since `3869736` only docs, the dry-run script and a fast-tier test changed.
- **Dry run, as a queued 3090 job** (`261024-194131-c1b5`, at `1f8c45b`, [`stew2/dry-run.sh`](stew2/dry-run.sh), output [`stew2/dry-run.txt`](stew2/dry-run.txt)):
  - **Inside the job:** `runs directly (inside heavy-check job 261024-194131-c1b5)`.
  - **With the job's variables removed:** `goes through the queue`.
  - **All 20 commands, each run both ways:**
    - **With a stand-in queue client:** every guarded command printed its routed form and handed the client exactly `run --class C --machine M -- <the same command>`, in 32–208 ms.
    - **With a missing client:** each refused with exit 75: `the heavy-check queue client isn't available … nothing ran`.
    - **`npm run build:direct`:** refused outright (75: runs only inside a heavy-check job).
  - `saves-build-at.sh` made no directory.
- **A real routed command, through the production queue** (from this agent's shell, not in a job; output in `/work/tmp/stew2-evidence/real-routed-typecheck.txt`):
  - `npm run typecheck` printed `through the queue: heavy-check run --class quick --machine any -- …` and became ticket `261024-194237-99e3`.
  - It waited 10m49s behind REC-1's exclusive series (`blocked by exclusive`), then was admitted to the express slot on the 3090.
  - It ran `typecheck:direct` inside the job, where it was admitted, in 10 s, and exited 0, bound to `0351cc2`.
  - The client's own CPU while waiting: 1.5 s user over 11 min (heavy-check's polling).
- **R1 evidence still standing:**
  - **Gate batching:** Sol's 6/6 real `--batch` economy steps.
  - **saves-export:** Sol's private-library checks; my `--job-verify ac734b0` (`261024-173723-788a`).
- **Not obtained:** a real end-to-end `saves-export.sh` (it would publish a branch commit's library). The first real run is the next post-merge export.

## Files
- **New:**
  - `scripts/local-guard.mjs` and `scripts/cgroup-scope.mjs`;
  - `tests/local-guard.test.ts`, `gate-routing.test.ts` and `saves-export.test.ts`;
  - `docs/build/streams/stew2/` (the dry-run script and its output).
- **Changed:**
  - `package.json` scripts (wrappers plus `:direct` bodies);
  - `scripts/gate.mjs`, `saves-export.sh`, `saves-build-at.sh` and `sim-differential.sh`;
  - `scripts/test-build.mjs`, `test-tier.mjs`, `guard-architecture.mjs` and `bake-terrain.mjs`;
  - the six economy scripts and the two benches;
  - `tests/heavy-budgets.json`, `heavy-tier.heavy.test.ts`, `gate.test.ts` and `bake-terrain-store.test.ts`;
  - `docs/build/WORKER_RESOURCE_LIMITS.md` and `scripts/playthrough/README.md`.
- **Removed:** the lease code, `scripts/local-guard-now.mjs`, and the proposed SCHED patch and its check script.
