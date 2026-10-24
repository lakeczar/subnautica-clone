# STEW-2: local work can't disturb a 3090 exclusive run (handoff)

Opus 5.5 high. Branch `t3/stew-2-exclusive-guard`, on root `6ee488a`. Head: see the report. Story-neutral; no spoilers read. `scripts/heavy/*` is untouched. The queue change this needs is a proposed patch for SCHED-3 (below).

## Outcome
- **The guard.** Ordinary local commands on factory-worker refuse to run beside a 3090 `exclusive` ticket, running or queued, because a queued one can start at any moment. Nobody has to remember to check first: `scripts/local-guard.mjs` is asked by every CPU-heavy entry point.
  - **The npm scripts:** `npm test`/`test:fast`, `build`, `typecheck`, `playthrough`, and `check`'s local tail.
  - **The node entry points:** `scripts/test-build.mjs`, `test-tier.mjs`, `guard-architecture.mjs`, `bake-terrain.mjs`, the six economy scripts, `sim-bench.mjs` and `timeline-save-bench.mjs`.
  - **The shell scripts:** `saves-build-at.sh` and `sim-differential.sh`.

  A refusal is one line naming the ticket and the queued form of the same command (exit 75). Inside a heavy-check job it runs, and so it does on alickers, which has no queue. An override (`SILTWAKE_LOCAL_OVERRIDE="<why>"`) runs it anyway and is logged.
- **`npm run gate` routes itself.** Before each local step (fast, build, economy) the gate asks the guard. When local work would be refused, every remaining local step goes to the queue as **one** `--class standard --machine any --review` job, `node scripts/gate.mjs --batch <ids>`, so the economy scripts read that job's own `.test-build`. Queued steps a batched step follows (the bake before the build) run first. The gate reports each step from the job's per-step `gate-batch:` line, judged on the job's receipt like any queued step (exit, stop reason, DISTURBED, bound to the pinned commit). `--queued` forces the routing. `--machine` moves the batch too. This is what the coordinator did by hand.
- **`scripts/saves-export.sh` compiles nothing outside the queue.**
  - **The export** is one `--machine any --class playthrough --snapshot --artifact <root>/<sha>` job. It runs on alickers when its slot is free, else here between exclusive runs. Inside, it builds the SHA (`saves-build-at.sh`), exports, and verifies where it ran.
  - **The import:** only when the export ran on alickers, a second small `--machine 3090` job imports (decodes) the fetched copy.
  - **A commit already in the library** is verified in a job.

  The outer script only submits and waits, so it may be started at any time. It now uses the remote lane (`--artifact`) instead of calling `alickers-job.sh` directly and copying over ssh, as its own old comment planned.
- **Heavy-tier timing bounds.** Files that assert elapsed time (`exclusive` in `tests/heavy-budgets.json`) now run in an explicit **timing phase**: last, one at a time, with nothing else of the tier beside them. Each such file's summary row reports the CPU wait (PSI "some") of this job and of the host while it ran, and a timing file that fails under ≥5% job CPU wait says so. No bound changed.
  - **Classification is enforced:** a heavy file that reads a clock must be listed under `exclusive` or under the new `clockWithoutBound`, or the tier refuses to run (exit 2). `ecology-render` and `ux1-carrier-corridor` only report a time and are listed so.
- **A local-run lease and a proposed queue rule close the remaining gap.** A check made once at start can't see an exclusive submitted a minute later, and an idle lane admits that exclusive at once. So each run the guard lets through leaves a lease (`/work/tmp/siltwake-sched/local-runs/<pid>.json`) while it runs. [`stew2/stew2-sched-local-runs.patch`](stew2/stew2-sched-local-runs.patch), for SCHED-3, makes a draining exclusive wait for live leases (blocked reason `local`; leases over 20 min stop counting) and lists them in `status`. The guard refuses new local work while the exclusive waits, so the wait ends with the longest local run already in progress (a fast tier, about 2 min). Until it lands, leases are attribution only.

## The finding behind "timing bounds flake"
TT-1 already ran the four `exclusive` files alone within the tier, and CW-1's failing run did too: they ran last, serially. The log (`261024-155654-6ff6`) shows `caves-deep-perf` at 437.6 µs as the 64th of 66 files, among the four timing files that ran last, after the pool had drained. What ran beside it was **another queue job on the 3090**, a `npm run playthrough -- --jobs 3` (`261024-160618-7506`, 16:08:36–16:17:07Z), so the "three-way concurrency" was three games in another job. Serialising within the tier can't prevent that. The timing phase makes the ordering explicit and the contention visible, and the root fix is listed under compromises, item 4.

## How agents run things now (paste into briefs)
- **Run locally as before.** When the guard refuses, run the command it prints: `scripts/heavy-check.sh --machine any -- npm test`. Commit first (a WIP commit is fine) and it runs on alickers at once if free; otherwise it runs here between exclusive runs.
- **`node scripts/local-guard.mjs --status`** shows what the guard sees and the local runs in progress (`--json` for scripts).
- **The override** is for a few seconds of work you can't queue: `SILTWAKE_LOCAL_OVERRIDE="why" npm run typecheck`. It is logged to `/work/tmp/siltwake-sched/local-runs.jsonl`. If an exclusive was *running*, tell the coordinator with the ticket id and time.
- **Unguarded:** bare `npx tsc`, `npx vite build`, `node --test <file>` and `node .test-build/…` directly. Use the npm scripts, or the queue.
- **The coordinator:** `npm run gate` and `scripts/saves-export.sh` need no status check before them any more.

## Design notes
- **What counts:** tickets of class `exclusive` in `state.json`.
  - **Running:** they count regardless of their holder (the job can outlive it).
  - **Queued:** they count while their supervisor lives. A queued ticket whose supervisor died is never admitted, and the queue drops it at its next reconcile.
  - **The read:** `state.json` plus `/proc/<pid>/stat` for liveness, about 1 ms. No `heavy-check status` call (its `recover()` can call systemd), and no process-tree walk.
- **Inside a job:** `SILTWAKE_JOB_TICKET` *and* this process inside that ticket's scope (its `grant.json` unit in `/proc/self/cgroup`), the rule heavy-check's own nested calls use. The variable alone is refused. v1's `SILTWAKE_HEAVY_LOCK_HELD` counts inside a `siltwake-heavy-*` scope.
- **Fail open, and why that's right here.** State that can't be read or parsed means the queue itself is broken. It then admits nothing, so no exclusive measurement is running to protect, and failing closed would stop every agent's tests machine-wide over a queue fault. The guard warns on every call, so the condition isn't silent.
  - **The case where failing open would be wrong:** a newer queue protocol renaming the fields. Tickets of an unknown shape are counted and warned about on every call ("update scripts/local-guard.mjs"), never silently ignored.
  - **No queue:** a missing state directory (alickers) is no queue: it runs, and writes nothing.
- **A later step of the same run continues.** `npm test`'s guard leases the npm shell; its later steps (guard, compile, tier) find that lease on an ancestor and go on when an exclusive is merely *queued*, since the lease holds it back, but refuse once one is *running*. A half-done `npm test` isn't aborted for an exclusive that will wait for it. Without the queue patch, an idle lane admits that exclusive at once, and the next step then refuses.
- **No lease during a queue wait.** `check` leases only its local tail, after `test:heavy`. A lease held while waiting on the queue would deadlock with a draining exclusive.
- **The gate asks before each local step**, not once, so an exclusive submitted mid-gate moves the remaining local steps to the queue rather than failing them on the guard.
- **Rejected alternative: CPU isolation of the exclusive** (cpuset `AllowedCPUs` on everything else). It would cover even bare `npx tsc`, but agents' work runs in T3's slices, and the owner's rule is never to clamp T3 slices.
- **Rejected alternative: running all local work at idle CPU weight in a `siltwake-*` scope.** It would make agents' `npm test` crawl whenever queue jobs run, and it still shares caches and memory bandwidth.

## Compromises, each with its root fix and cost
1. **The guard can't see bare compiler calls.** These are unguarded:
   - `npx tsc`;
   - `npx vite build`;
   - `node --test <file>`;
   - running compiled output directly (`node .test-build/scripts/playthrough/run.js`);
   - `vite dev`.

   *Root fix:* none in the repo short of wrapping `node_modules/.bin`. The structural fix is CPU isolation of the exclusive slice, ruled out by the T3-slice rule. *Cost:* these few still rely on habit, so briefs say to use the npm scripts.
2. **Until SCHED-3 takes the patch, a local run started before an exclusive was submitted can still overlap it**, if the lane was idle. *Root fix:* the patch. It's tested: SCHED's policy tests pass with it, 34/34 including the new case, on alickers (`261024-173003-3fad`), via `stew2/check-sched-patch.sh`. *Cost:* a SCHED-3 review and an install while the queue is idle.
3. **The guard reads SCHED's internal state shape** (`tickets[*].state`, `req.class`, `supervisor`). *Root fix:* SCHED documents those fields as a read contract, or ships the reader. *Cost:* a line in SCHED's design doc. Until then, unknown shapes warn.
4. **Timing bounds are still judged on a shared machine.** The tier can't stop other queue jobs; the phase only makes the contention visible. *Root fix, for the files' owners (CW-1, the CA streams, LC):* assert per-step bounds on the thread's CPU time (`process.threadCpuUsage()`, Node ≥ 23.9; we run 24), which doesn't count time spent waiting for a CPU. The bound's number would then need re-establishing on a quiet machine, which is the owners' call, not mine. *Alternative:* a SCHED class that reserves the whole CPU pool without the GPU and exclusive drain. *Cost:* a change in each of four tests, or a queue class.
5. **The clock classification scans the test file's own text**, not its helpers, so a timing bound inside a shared helper isn't caught.
6. **`SILTWAKE_SCHED_DIR` redirects the guard** (tests need private roots), so a deliberate bypass is possible and unlogged. It is an explicit act, like the override.
7. **A batched gate prints the job's last 40 lines** (`wait`'s tail), not the whole fast tier. The gate names `heavy-check log <ticket>` for the rest.
8. **An alickers export builds the SHA twice:** once in the export job there, once in the import job here (a compile of about 30 s). That second build is the import's own trust boundary, as before.

## Evidence
All checks ran through the queue, nothing locally beside the exclusive series that was running throughout (CW-1 r13 and REC-1).
- **Fast tier, `--machine any`:** 1,646/1,646 on alickers at `73bb321` (`261024-173532-7ac2`), and at `f292345` before the economy-ordering commit (`261024-173249-80a7`). It includes the new `tests/local-guard.test.ts` (decisions; refusals of the real entry points before they compile; override and log; inside-job by scope; no-queue and unreadable state; leases), `tests/gate-routing.test.ts` (routing order, per-step verdicts, the real gate against a stand-in queue) and `tests/saves-export.test.ts` (the real script in a throwaway repo against a stand-in queue, with a `saves-build-at.sh` that records any call: none outside a job).
- **Heavy tier, `--machine any`:** HEAVY_RESULT
- **Inside a real 3090 job** (`261024-175236-cee0`, `--snapshot`, at `c3f2aef`, admitted between CW-1's exclusive segments with the rest of the series still queued): `local-guard --status` printed `local work here: run (inside heavy-check job 261024-175236-cee0)`, and a guarded call ran. The production queue's own job scope is what the guard recognised.
- **saves-export's in-job path for real:** `saves-export.sh --job-verify ac734b0` (the newest library) as a queued 3090 job (`261024-173723-788a`, at `73bb321`, 6.9 s). `saves-build-at.sh` built `ac734b0` from an archive (its guard let it run inside the job; that commit's lockfile differs, so it ran `npm ci`), and every file matched its manifest and decoded unchanged.
- **End-to-end dry run against a private copy of the live queue state** (CW-1's and REC-1's real exclusive tickets; nothing written to the production state directory): [`stew2/dry-run.txt`](stew2/dry-run.txt).
  - `npm run build`, `npm test`, `npm run typecheck`, `npm run playthrough`, `node scripts/test-build.mjs --typecheck`, `node scripts/test-tier.mjs fast` and `saves-build-at.sh` each refused in 27–182 ms, exit 75.
  - The override ran and was logged.
  - `--status` reported REFUSED.
  - `gate --only bake,build,economy:m1`, against a stand-in queue, submitted the bake, then one `--batch build,economy:m1` job with `--machine any`.
  - The dry run also caught the economy scripts loading their compiled modules before asking the guard; they now import `local-guard-now.mjs` first.
- **Not obtained:** a real end-to-end `saves-export.sh` through the new path. It would publish a library for a branch commit into the shared store. The first real run is the coordinator's next post-merge export after this lands; its output names each ticket.

## Files
- **New:** `scripts/local-guard.mjs` and `local-guard-now.mjs`; `tests/local-guard.test.ts`, `gate-routing.test.ts` and `saves-export.test.ts`; `docs/build/streams/stew2/` (the patch, its check script, the dry run).
- **Changed:**
  - `package.json` scripts;
  - `scripts/gate.mjs` and `saves-export.sh`;
  - `scripts/saves-build-at.sh`, `sim-differential.sh`, `test-build.mjs`, `test-tier.mjs`, `guard-architecture.mjs`, `bake-terrain.mjs`, the economy scripts and the two benches (one guard line each);
  - `tests/heavy-budgets.json`;
  - `tests/heavy-tier.heavy.test.ts`, `gate.test.ts` and `bake-terrain-store.test.ts` (fixtures copy the guard);
  - `docs/build/WORKER_RESOURCE_LIMITS.md`;
  - `scripts/playthrough/README.md`.
