# SCHED-2a: goal-based heavy jobs, soaks, the GPU lease everywhere

Builder: Opus 5.5, branch `t3/sched-2-goal-jobs`. Scope: the owner's 2026-10-23 rule ("a job has a goal, not a time limit") and the 2a list in [DIRECTION](../DIRECTION.md), "Two test machines". SCHED-2b (the remote lane) and SAVE-1 follow after review. **Not installed:** the live queue still runs SCHED-1 `6824478b070f`; cut-over is below and waits for the coordinator.

## SCHED-2b: the remote lane (built on 2a; for review)

Design: [sched2/SCHED-2B-DESIGN.md](sched2/SCHED-2B-DESIGN.md), with the coordinator's calls on its four open points (2026-10-23). Branch `t3/sched-2b-remote-lane`, on 2a at `1c62134` (R4 fixes merged).

**Routing** (`policy.mjs`):
- Machine tags `any|3090|4070|soak` sit in the ticket's goal. Defaults: playthrough and heavy-suite → `any`, soak → `soak`, the rest → `3090`. `exclusive` with a non-3090 tag is refused.
- The plan routes the remote slot first, in priority order. A remote ticket takes no local tokens, memory, GPU or worktree, and local legacy, exclusive and memory states don't hold it back. `any` takes alickers only when it's free; `4070` waits (`remote`, `remote-paused`, `remote-down`); `soak` waits unless alickers is paused or unreachable. A fallen-back `any` or `soak` stays here.
- A remote soak yields its slot to a waiting `4070` job.

**Eligibility** (`heavy-check.mjs` submit, `remote.mjs`):
- Only a clean tree goes, and only a command that names no local path outside the worktree (`/work`, `/home`, `/tmp`, `/mnt`) except its declared `--artifact` outputs, and reads no uncommitted build output (`.test-build*`, `dist`).
- Otherwise `any` and `soak` run here, with the reason, and `4070` is refused.
- Private state (tests) never reaches a real sandbox unless its `config.json` names a remote.

**Health** (`remote.mjs`): one ssh probe reads the owner's pause flag and a non-blocking check of `siltwake-job`'s lock, giving `up`, `busy` (a lane job or someone's direct call), `paused` or `unreachable`. It's cached in `remote.json` and rechecked after 30 s (up or busy), 60 s (paused), or 1, 2, then 5 min (unreachable). Waiting remote-bound supervisors refresh it outside the state lock, one prober at a time.

**The remote holder** (`remote-holder.mjs`, its own scope; the supervisor starts it instead of `holder.mjs`):
- **Transport:** it runs `alickers-job.sh --sha <submitted commit> --deadline <limit> --memory <≥8G>` on `lane-run.sh` (uploaded once per version), with the argv base64-encoded so no quoting survives the shell layers. Each installed version carries its own transport copy.
- **Stall and throttle:** the stall clock starts at `alickers-job: testing <sha>`. Heartbeat and `memory.high` are read **out of band**, by ssh every `tickS` (10 s), because a monitor inside the job's cgroup is throttled with it (found in B6). Continuous throttling is reported after 2 min and stopped at the stall window (`throttled`, 123); a throttled job that has gone silent is labelled `throttled`, not `stalled`.
- **Ceiling, cancel, yield:** the ceiling is applied by the sandbox's own `timeout` plus a backstop. Cancel and stop TERM the wrapper (PID and start time) and mark the ticket cancelled, so a job still waiting for the sandbox's lock never starts. Soak yield works through `$SILTWAKE_JOB_YIELD` on the sandbox.
- **Exit codes:** a 75 or 255 *before* `testing` is the sandbox's: `any` and `soak` are re-queued here, keeping their place (a resumed supervisor takes the ticket over; the holder owns it until then); `4070` waits again; the health is updated. A connection lost mid-run stops the job remotely, then re-queues it. Transport errors give up after `maxAttempts` (3) for 4070 and run here for `any`. After `testing`, the code is the job's own, 75 and 255 included.
- **After the job:** artifacts are fetched whole (`ssh tar | tar`) into `/work/tmp/<ticket>/`, recorded with bytes, machine and the tested commit. Then the sandbox is cleaned: the lane directory is removed, and so are artifacts inside the shared checkout; one that failed to fetch is moved to `/work/results/lane-<ticket>/` there instead. Health is probed again so the slot frees promptly.
- **Recovery:** if the holder dies, reconcile finishes the ticket (137, unbound) and starts a detached `--stop` with the lane the job was sent to (`remote-config.json` in the job directory).
- **Results:** `machine` ("RTX 4070 Laptop (alickers, shared desktop host)" or "RTX 3090 (factory-worker)"), `machineTag`, `evidence` bound to the tested SHA, `artifacts`, `fellBack`, `attempts`. Peak memory and CPU time are `unavailable`: the sandbox's `siltwake-job` measures them, and they aren't reported over the lane.

**Inside the sandbox** (`lane-run.sh`): it records PID and start, refuses to start if cancelled, and records its scope's cgroup. It sets `SILTWAKE_JOB_HEARTBEAT`, `SILTWAKE_GPU_LEASE` (older commits read the variable; current ones accept the `siltwake-job-*` scope) and `SILTWAKE_SOAK_MACHINE`, plus worker counts for the sandbox's grant and nested heavy-check calls inline.

**Soaks there:** frames are recorded, never judged; a would-be failure gets a report **WARNING**. Memory, graphics, hold and save rules are judged. The browser is `siltwake-chrome`, which sets its own GPU flags, with the sandbox's playwright-core.

**Checks:**
- **Acceptance** `scripts/heavy/acceptance-sched2b.test.mjs` passes **11/11** against a fake sandbox (the real `siltwake-job`'s lock, pause flag, user scope, MemoryHigh and swap settings, and the transport's protocol), with real systemd scopes:
  - B1 any on alickers at its commit, worktree free, an evidence-pack directory and a file fetched whole, sandbox checkout left clean, ledger records;
  - B2 paused: 4070 waits and runs on resume, any runs here; B3 paused after dispatch: any falls back here keeping its place, 4070 waits again; B4 unreachable, dirty tree and local paths;
  - B5 stall after `testing`, heartbeats, waiting for the sandbox lock isn't silence; B6 memory.high throttling reported and stopped as `throttled`;
  - B7 cancel while running and while waiting for the lock (the command never runs); B8 remote holder SIGKILL, recovery and remote stop;
  - B9 soak on alickers yields to 4070, local while paused; B10 the job's own 7 and 255; B11 private state never reaches a sandbox.
- **Policy units:** 30/30, including routing for every tag and state, and the eligibility rules. Soak units: 25/25 (2a's contract, goals and runner tests plus the 4070 warning).
- **Regression on this branch** at `4e18397`: SCHED-1 acceptance 23/23, SCHED-2 16/16, SCHED-2b 11/11; fast tier 1,342.
- **A second real canary** (ticket `261023-080802-0984`, `--class playthrough`, a real `reverse` scenario) found alickers `busy` with another agent's direct job, so `any` correctly ran here, at once, and passed (15 saves reloaded; result bound to `bd577b1`). It showed one bug, now fixed: a local job's relative `--artifact` was checked against the holder's directory, not the job's.
- **Real canary** on alickers (private local state, the real transport and sandbox), ticket `261023-075720-305e` at `99b65b6`, `--class gpu --machine 4070 --artifact canary-pack`:
  - `alickers-job: testing 99b65b6… on siltwake-alickers`; the job's scope is `/user.slice/…/app.slice/siltwake-job-33075.scope`;
  - `gpu-lease.mjs check` prints **`gpu-lease: ok`** there, which settles 2a's unverified point; the sandbox's GPU probe exits 0 with renderer **`ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 4070 Laptop GPU), OpenGL 4.6)`**;
  - the pack (4 files, 8,799 bytes) is at `/work/tmp/sched2/canary/artifacts/261023-075720-305e/canary-pack`, and the result is `evidence for 99b65b6`.
  - It found two flaws, both fixed: the pack left untracked in the shared checkout, now cleaned; and stray `lane/jobs/<ticket>/cancelled` markers that recovery's detached stop made on the real sandbox after a test's private config was deleted, now prevented by the private-state rule and the lane snapshot. Both were removed after checking they were mine; nothing had run.

**Limits and compromises:**
- **Peak memory and CPU time** of remote jobs are unavailable. Root fix: `siltwake-job` (fleet's) writes its scope's `memory.peak` and `cpu.stat` to a file the lane fetches.
- **Undeclared files** a job writes inside the checkout stay there, as with direct `alickers-job.sh` calls today. Root fix: the transport cleans untracked files on commit change, as it now does for `.test-build*`. Fleet and the transport owner's call.
- **Direct `alickers-job.sh` callers** are seen only as `busy`, and their waits are invisible until briefs move to `--machine` (the coordinator's cut-over step).
- **MemoryHigh at 85%** stays in `siltwake-job` until fleet changes it (the coordinator is asking). Meanwhile throttling is detected and labelled.
- **Upload of the in-sandbox wrapper:** a file under `/work/tmp/siltwake-lane/bin/<hash>/`, like the transport's own bundle upload. It is not in the checkout.

**Cut-over** (coordinator, after review): merge, `scripts/heavy/install.sh` (the transport is copied into the version), then update briefs to `--machine`. Nothing is needed on the sandbox.

## R4 review responses

Review: `7080616` on `review/sched-2a-r4`, on `4f572b5`, not accepted: three P2s on holds and timing windows. The contract itself stood. Still no change under `scripts/heavy`.

- **R4-F1, the hold contract: fixed.** `measure.mjs` has one canonical hold observation, `holdObservation()`: `holding`, `clear` or `unknown`.
  - **Mapping:** it adapts CW-1's real producer, the per-frame `hold: hold?.state ?? null` and `#ocean.dataset.caveHold`, both `CaveHold.state`. `clear`, `admitted` and `away` are clear; `loading`, `waiting`, `rescue` and `refuge` are holding; booleans keep their meaning.
  - **Unknown:** absent, `null` (admission not evaluated) or a wrong type is `unknown`, never evidence of no hold. A wrong type is also a diagnostic.
  - **Coverage:** a record covers its frame only with a known state. Holding records and holding polls are violations.
- **R4-F2, polled holds inside a save or GC window: fixed.** Positive polls, recorded holds, streaming violations and hold coverage are all taken before any timing exclusion. Only gap timing is excluded.
- **R4-F3, GC gaps admitted after the flag cleared: fixed, by interval.**
  - **Tagging:** the page's recorder (`frameRecorderScript`) tags every rAF gap that overlapped an excluded window, the one spanning its end included: a gap is excluded if the window was open at any moment since the previous frame. The soak opens and closes windows around each GC and save check (`excludeTiming`).
  - **Counting:** tagged gaps never count as timing, and an autosave interval that held one is incomplete. Its timing is unavailable, never a pass or a hitch.
  - **Fallback:** without page tagging, every tick whose interval a window touched is excluded.
- **Tests:** 29/29 soak tests, five runs in a row. The new regressions all fail on `4f572b5`:
  - `tests/soak-measure.test.ts`: the hold observation over CW-1's real states, booleans, absent, null, unknown and wrong types, through CW-1's actual record shape and the `#ocean` poll; tagged and untagged gaps.
  - `tests/soak-runner.test.ts`, R4-F1: the real frames provider with CW-1's records. Clear passes, one `loading` frame fails, a missing or `null` field is unproven.
  - R4-F2: a `loading` poll only inside save checks, with no per-frame record, fails and stops at the first lap.
  - R4-F3: the **real recorder** in Node under an rAF shim, with real event-loop stalls. A 120 ms GC pause before, during and after save ticks is never an autosave hitch (those intervals are incomplete); a 150 ms game pause outside any window, in a save's interval, fails the dwell.

## R3 review responses

Review: `d2a429c` on `review/sched-2a-r3`, on `014f37b`, not accepted: three P2s, again only in the soak evidence path. As the coordinator directed, these got **one structural fix, not more rule-by-rule patches**. Still no change under `scripts/heavy`.

- **One measurement contract** (`scripts/soak/measure.mjs`). Every provider's output passes through `normalize()` in `createProbe` before anything else sees it. Each type declares its domain:
  - `memoryMiB`: finite, > 0;
  - `sizeMiB` (residency): finite, ≥ 0;
  - `count` (graphics): a nonnegative integer, 0 valid;
  - `frameMs` (a frame total): finite, > 0;
  - `splitMs` (a split part): finite, ≥ 0;
  - `gapMs` (rAF and autosave gaps): finite, ≥ 0;
  - `seconds`: finite, ≥ 0.

  An out-of-domain value is dropped with a diagnostic, never a number. An absent one is simply not measured.
- **Frames are raw observations.** The frame provider now returns the rAF gaps and the per-frame records unchanged. The contract derives the facts from valid observations only:
  - the worst gap, a maximum over valid gaps only;
  - gaps over the limit;
  - attribution, `true` only when every record has a valid total and a valid split for each of chunks, caves, regions and lights; a missing split is unavailable, never "zero streaming";
  - streaming frames from valid records;
  - hold frames, booleans only, with coverage;
  - whether the interval was complete.
- **Known violations are kept independently of completeness (R3-F2).** An invalid observation makes its interval incomplete, which prevents a pass and gives `partial`. A valid violation in the same interval fails a judged run and stops it. Autosaves record the worst valid gap and whether their interval was complete.
- **The evaluator re-checks the same contract** (`goals.mjs` uses `valid()`): both tour endpoints, counts, frame milliseconds, monotonic and ordered sample times, and a finite trend.
- **A monotonic clock (R3-F3):** the loop's elapsed time comes from `performance.now()`, or an injected `deps.clock`; it covers sample times, warm-up, GC cadence, leak windows and autosave silence. Travel timeouts are monotonic too. Wall time is used only for labels.
- **Found while fixing:** a tick that landed during a GC or a save check was dropped whole, hold records included. Holds and attributed streaming frames are now always kept; only plain gaps from that window are left out.
- **Tests:**
  - `tests/soak-measure.test.ts`, table-driven: every type × {valid, fraction, 0, negative, NaN, ±Infinity, absent, null, wrong types}; the same through `normalize()`; frame totals and every split part × every bad value; holds; times.
  - The reviewer's reproductions as runner-level regressions in `tests/soak-runner.test.ts`, all failing on `014f37b`:
    - a final RSS of 0 or −1, or a −1 mesh count, gives partial (and a zero-to-positive count still fails as growth);
    - a garbled record total (NaN, ±Infinity, −1, 0, absent), or a missing split with a 70 ms gap, gives partial;
    - gaps `[70, NaN]` with a valid 70 ms record fail and stop at the first autosave;
    - a 300 s wall-clock step changes neither the leak window nor the 40 MiB/h failure, and non-monotonic or infinite times are unavailable.
  - Soak tests: **24/24**, three runs in a row.

## R2 review responses

Review: `e43761e` on `review/sched-2a-r2`, on `e85c8e3`, not accepted, with three P2s, all in the soak harness. The scheduler side passed. Each fix has a runner-level regression in `tests/soak-runner.test.ts`, using the real loop and the real providers; all three fail on `e85c8e3`'s soak code (checked by export).

- **R2-F1, non-finite measurements could pass: fixed.**
  - **At the provider boundary:** `createProbe` keeps only finite numbers in memory and graphics, and drops anything else with an `unavailable` entry naming the value. `cdpHeap` reports a missing `JSHeapUsedSize` as unavailable instead of dividing it into NaN.
  - **Defensively in the goals:** only finite values count, and a zero memory baseline is no measurement. Growth from a zero count is unbounded, not 0%.
  - **Regression:** a CDP that reports no metrics, through the real `cdpHeap`, gives a partial tour with the heap rule unavailable and the provider error listed. A NaN that bypasses the probe is unavailable too.
- **R2-F2, a hold between polls was ignored: fixed.**
  - **Holds are consumed:** the per-frame record's hold frames (`holdFrames`) are recorded, however short the hold, and any recorded hold fails.
  - **"No hold" needs coverage:** a pass requires the per-frame record over the whole run (`holds.covered`); state polls alone can only find a hold, never prove there was none.
  - **Regression:** one hold frame between two polls, with the current state clear, through the real `frames()` provider, gives `fail`. A clear run passes, and a build without the record is unavailable.
- **R2-F3, missing timing hid a measured failure: fixed.**
  - **Known violations first:** `frameRule` judges a measured violation before any coverage check. The autosave hitch rule fails on a measured over-budget autosave even when others lack a frame time; it is unavailable only when nothing measured broke. The runner stops on it.
  - **Regression:** first autosave untimed, second at 70 ms, on a judged run: the dwell fails and stops. A streaming violation recorded before attribution was lost still fails.

## R1 review responses

Review: `2d461de` on `review/sched-2a-r1` (`docs/build/reviews/SCHED-2A-SOL-XHIGH-R1.md`), on `8f702de`, not accepted. All eight findings are fixed with root fixes, each with a regression test that fails on `8f702de`'s behaviour.

- **R1-F1 (P1), an edited snapshot still bound evidence: fixed.** The holder checks the tree it ran in at the end, the snapshot included, against admission (HEAD and tracked diff). Drift unbinds the result ("the job changed its snapshot's tracked files or HEAD") and keeps the snapshot. S6 adds a tracked edit and a moved HEAD inside a snapshot; untracked output alone still binds.
- **R1-F2 (P1), the reload between laps hid accumulation: fixed.** All laps run in one game lifetime. At each lap end, the save (F5) is exported from the measured page's journal and loaded in a **separate browser**, whose processes the probe doesn't measure, by `saveAndCheck`. Frames from that window are excluded. The measured page is never reloaded. Regression: `tests/soak-runner.test.ts`, where a per-visit leak shows at lap 2 and stops the soak, and nothing reset the page.
- **R1-F3 (P1), failed providers gave passes: fixed.**
  - **Availability:** frame attribution and hold state start *unknown*, and only an observation (frames counted, a hold state read) makes a rule measurable. Provider errors are counted, carried into the report (`providers` rule, `providerErrors`) and listed as missing.
  - **Autosave hitch:** an autosave with no frame time is unavailable.
  - **Verdicts:** a met goal is `pass` only if every rule was measured and passed; otherwise it is **`partial`** (exit 5), with `unproven` listed. Shared-run frame times are therefore `partial` too, per the evidence rule.
  - **Tests:** the runner tests drive the real loop with throwing providers, and with a build without attribution.
- **R1-F4 (P1), sibling build directories were unprotected: fixed.** `submit` records the build directory the job inherits (`SILTWAKE_TEST_BUILD`, validated) on the ticket. The holder writes the marker there, and recovery removes it from there. S15 covers a job building into `.test-build-review`: that directory refuses, while `.test-build` and other siblings stay free, and it still refuses after the holder is SIGKILLed while the job lingers. An invalid name is refused at submit.
- **R1-F5 (P1), rollback silently disabled the Chrome guard: fixed at the root.**
  - **The wrapper carries the guard:** `chrome-guard.sh` is now the wrapper's body, with no runtime lookup through the scheduler's `current`.
  - **Its own install:** the lease checker has its own immutable install (`$home/guard/<version>`, `guard/current`). Scheduler installs, rollbacks and `--uninstall` never touch it, and a newer scheduler install refreshes it once present.
  - **Fails closed:** a missing checker refuses GPU launches with a clear message. `--gpu-guard-remove` stays the deliberate removal.
  - **Test:** S10 re-wraps, then runs SCHED-1's real installer (`1f31c87`). An unleased GPU launch is still refused, and a leased one still works. After uninstalling the scheduler it is still refused. With the checker removed, it's refused with "enforcement is unavailable". Software launches pass throughout.
- **R1-F6 (P2), `dwell --at` hit the temporal dead zone: fixed.** The soak loop moved to `scripts/soak/soak.mjs` (browser and providers injected), and `PLACES` is a module constant. Runner tests cover a named place, coordinates, `large-cave` (incomplete: "not placed in the game yet") and an invalid place.
- **R1-F7 (P2), a dwell could pass without the leak rule: fixed.** The dwell goal needs `leakMinWindowS` after warm-up, as well as the autosaves (and day–night once the game has it). Short of the window, the rule is listed as unmeasured. The runner stops on the evaluator's verdict, not on the autosave count, and the "autosaves stopped" clock starts on arrival. A runner test shows a slow leak fails before any pass, and a flat dwell is `partial` (day–night missing).
- **R1-F8 (P2), soaks never yielded to same-worktree work: fixed.** The counterfactual yield also covers a waiting job blocked only by the soak's worktree. Unit test, plus S4b: a review queued in the soak's own worktree gets the soak preempted after its notice, and starts after the soak's cgroup is empty.
- **R1 P3, recovery dropped identity: fixed.** Recovered results keep the submitted `head`/`dirty` and carry `evidence.bound: false` ("recovered: no observer checked the tree at the end"), and a recovered snapshot is dropped or kept by the same rule. S8 asserts it.

## What changed (`scripts/heavy/`)

**Goals, not clocks** (`policy.mjs`, `holder.mjs`):
- A job runs until its command ends. The holder stops it only when:
  - it **stalls**: the job's output (minus the holder's own lines) and `$SILTWAKE_JOB_HEARTBEAT` don't move for the stall window. The default is 15 min (quick and exclusive 10), and `--stall S` overrides it. Before stopping, the holder writes each process's state, wait channel and command, and the CPU used while silent. Exit **123**, `stalled: no output for N min`;
  - it reaches a caller's `--deadline` (124, `deadline`);
  - it reaches the class's **runaway ceiling** (124, `runaway ceiling`). Ceilings are quick 2 h; standard, heavy-suite and gpu 4 h; playthrough and soak 6 h; bake 2 h. **Exclusive keeps a 30-minute cap.**
- Every result carries `stopReason`: `stalled`, `deadline`, `ceiling`, `oom`, `killed`, `cancelled`, `preempted`, `rejected` or null.
- `config.json` `ceilings` retunes a class without a release.
- `test:heavy` drops its 25-minute `--deadline`.

**Quiet jobs that are working** (found while checking the defaults):
- **Playthrough:** a parallel playthrough's children print nothing until they finish, about 22 min, so the run would look stalled. The driver now touches the heartbeat as the simulation advances: every 1,024 steps, at most every 5 s (`scripts/playthrough/driver.ts`). A hung child stops stepping and is still caught. Inside the queue, children have no 1,800 s wall-clock limit any more (`run.ts`; `--child-timeout` still sets one).
- **Heavy tier:** it holds each file's output until the file ends, so its test output beats the heartbeat as it arrives (`scripts/test-tier.mjs`).
- These are small edits to playthrough and TT-1 files, flagged for composition.

**Exclusive turns** (`policy.mjs`): `state.lastExclusiveEnd` is recorded. Until the queued tickets that waited through the last exclusive have started, no exclusive may drain (blocked reason `turn`). A series of exclusive tickets, one measurement each, therefore interleaves with everyone else. The usage text states the rule, and a loop inside one exclusive command gets a warning. Live example: at 03:02Z, CW-1 queued its traversal as one exclusive ticket per segment. Under SCHED-1 those tickets drain the lane back to back; under this policy, waiting work runs between them.

**`soak` class:**
- **Admission:** only when nothing else waits (a ticket waiting only for its own worktree doesn't count). A soak never ages, and never takes the express slot or the 10-minute reservation.
- **CPU:** runs at `CPUWeight=idle` (cgroup `cpu.idle=1`) and takes no pool token.
- **Memory and GPU:** its memory counts against the pool; `--gpu` adds the lease.
- **Yield:** the plan's `preempt` is computed as a counterfactual: would someone start without the soaks? If so, the soak's holder writes `$SILTWAKE_JOB_YIELD` and, `soakYieldS` (300 s) later, stops it (75, `preempted`). The notice is withdrawn if the need goes away.

**Changed trees:**
- **Rejection:** a ticket whose tree (HEAD, tracked diff or untracked files) changed between submit and the holder's pre-launch check never runs (exit **3**, `rejected: …`; the message names `--snapshot`).
- **`--snapshot`** (`snapshot.mjs`): runs on a shared clone of the tree as submitted, with the diff applied, the untracked files copied and `node_modules` linked. It takes 0.27 s on this repo and is verified against the submit hash before launch. The worktree's `.test-build` stays free. The copy is deleted after the job, or kept if the job wrote into it.
- **Evidence:** every result has `evidence {commit, bound, why, snapshot}`, and the final line says `evidence for <sha>` or `NOT evidence for a commit: …`. A tracked change during the run unbinds it (`changedDuringRun`); untracked job output doesn't.

**The GPU lease for every driver:**
- **`gpu-lease.mjs`:** a lease is valid only for a process inside the granting ticket's scope whose grant has the GPU. The environment variable alone isn't proof.
- **`chrome-guard.sh` + `install.sh --gpu-guard`:** every Playwright Chrome binary (full and headless shell, under `~/.cache/ms-playwright`) is replaced by a 6-line wrapper, using a hard link and then a rename, so no launch ever finds the binary missing. A GPU-flagged launch (`--use-angle=`, except SwiftShader; `--use-gl=`; `--enable-gpu`; `--ignore-gpu-blocklist`; Vulkan) then needs a valid lease. The check fails closed: it needs an explicit `gpu-lease: ok`. Per-stream play scripts are covered without edits. `--gpu-guard-remove` restores the originals.
- **The second worker:** a process inside the sandbox's `siltwake-job-*` scope holds the lease, because the sandbox runs one job at a time. CW-1's `run-4070.sh` sets `SILTWAKE_GPU_LEASE=alickers-job` and keeps working.
- **Detection:** `gpuUsers()` lists processes with `/dev/nvidia*` open (one scan takes about 7–10 ms). Checked on the 3090: a GPU-flagged Chrome's `gpu-process` opens `/dev/nvidia0`, and SwiftShader opens nothing. Unleased users appear in `status` and in the ledger (`unleased-gpu`, at most once a minute). They are also recorded on any GPU job that shared the GPU with them (`gpuShared`); an exclusive job that did is marked `DISTURBED`.

**OOM classification across observer loss (R5 P3)** (`scope-run.sh`):
- **The wrapper's place:** it now sits in a `ctl` leaf outside the `job` OOM group, where the anchor and command still are, so it survives the reservation's group kill. A TERM trap (not an ignore, which children would inherit) lets it record stats when the scope is stopped, including `stopped=1`.
- **Unavailable counters:** a counter no observer read is `null`, with the reason under `unavailable`, never 0.
- **Recovery:** a stopped scope whose holder died is labelled `killed: its holder died…` (137), not "ran to its end".

**The `.test-build` guard** (UX-1's report, checked):
- **Only running tickets block.** Only an admitted, running ticket writes the marker, so a queued one never blocks; that holds on the installed SCHED-1 code too. Acceptance S14 shows a queued `gpu` ticket leaves the guard open, and SCHED-1's own tests 14 and 14b still pass. UX-1's worktree had a running playthrough beside its queued tickets.
- **What changed:**
  - the refusal names the ticket, its class and its command, and gives the ways around it;
  - `SILTWAKE_TEST_BUILD=.test-build-<name>` compiles and runs the fast tier from a sibling directory: `test-build.mjs`, `test-tier.mjs`, the build cache and two tests that wrote into `.test-build`. It sits at the same depth because compiled tests find the root at `../../`. The fast tier passes 1,296 from `.test-build-2`, and the name is git-ignored;
  - `--no-test-build` declares a job that never reads `.test-build`; `--snapshot` already didn't take it.
- **Default:** I kept the guard for every running job rather than guessing from the command which jobs read `.test-build`. Drivers import compiled modules in ways a command line doesn't show.

**Smaller items:**
- `anchor.pid` records `PID START`, and USR1 is sent only to the same process (R4 P3 4).
- `wait --json` ends with a JSON record, pending or final, so a pending 99 can't be mistaken for a job's own (TST-22).
- **Live slice check:** `status` prints the slice's live `cpu.max`/`memory.max` against the wanted values. `ensureSlice` takes systemd's `ControlGroup` and falls back to the nested derivation from the coordinator's `0c664ca`.
- **Migration safety:**
  - New fields live in `t.goal`, beside `req`. A queued SCHED-1 supervisor re-resolves every queued `req` with its own 10–30-minute maxima, so a goal inside `req` would be overwritten. Seen in the mixed-version run: the old code set `req.deadline` 1200 while `goal.limitS` stayed 7200.
  - SCHED-2 re-resolves only its own tickets.
  - A soak is refused (75, "retry later") while goal-less tickets are queued. Their plans would let a waiting soak hold the 10-minute reservation.
  - `PROTOCOL` stays 1, with additive fields only.

## Soak harness (`scripts/soak/`, thin by design, as directed)

- **`goals.mjs`** is pure:
  - **Tour:** `laps` laps. Rules: memory growth for the renderer RSS, the GPU-process RSS and the heap after GC (≤ 5% of lap 1); graphics growth for meshes, materials, textures and geometries (≤ 2%); streaming frames (33 ms); loading holds (0); save–reload at every lap end.
  - **Dwell:** a count of `autosaves`, plus `dayNightCycles`. Rules: memory flat after warm-up (≤ 5%); leak trend (≤ 30 MiB/h over ≥ 10 min); autosave hitch (33 ms); autosaves still happening.
  - The verdict is pass, fail, running, incomplete or yielded, and any broken rule stops the soak with its reason. Thresholds are in `thresholds.json`, and `--thresholds` overrides them (for MEM-1).
- **Frame times are judged only on an isolated run** (an exclusive grant, or `SILTWAKE_SOAK_DEDICATED=1` from the remote lane). On a shared run they are `recorded`, per the evidence rule. Measurements nothing provides yet are `unavailable` and listed as missing evidence, never replaced by a proxy.
- **`probe.mjs`** is the measurement interface: `{name, sample(ctx)}` providers merged into one sample. The current providers:
  - CDP heap, before and after a GC;
  - `/proc` RSS of the browser tree (renderer, GPU process, total);
  - the job scope's `memory.current` and `memory.peak`;
  - `#ocean` scene counts and residency;
  - rAF gaps;
  - CW-1's `__siltwakePerf` split and `caveHold` where a build has them;
  - the save journal.

  **REC-1's recorder becomes one more provider,** with no change to the soak logic.
- **`browser.mjs`** runs a task-owned GPU Chrome (lease required; `--software` for SwiftShader functional runs). The save is imported through the menu, and travel uses ordinary keys only, closed-loop on the HUD and camera (C3/CW-1 pattern). `saveAndReload` does F5, reload, Continue, then checks the tick and position.
- **`run.mjs tour|dwell`:**
  - **Plan:** takes CW-1's `{segments}` plan or `{points}`.
  - **Dwell places:** `--at` takes `crown-station`, `dish-field` or coordinates. `large-cave` reports "not placed in the game yet".
  - **Outputs:** `samples.jsonl`, `report.json` and `report.md`.
  - **Exit codes:** 0 pass, 1 rule broken, 4 incomplete, 75 yielded, 2 setup error.
  - **Signals:** it touches the heartbeat each sample and honours the yield file.

## Checks

- **Unit:** `tests/heavy-sched-policy.test.ts`, 24/24 (including the lease rules), with SCHED-2 policy cases for soak leftover, no aging, no token, preemption only for memory or GPU, exclusive turns, serial soak and coalescing. `tests/soak-goals.test.ts`, 5/5.
- **Acceptance** (real systemd, private state, units and slices):
  - SCHED-1's `acceptance.test.mjs` on the new code passes **23/23**, including 6c and 9e. Two expectations changed with the code, both shown above: 6c's anchor PID format, and 9e's label after the wrapper's TERM trap.
  - New `acceptance-sched2.test.mjs` passes **14/14**:
    - S1 stall (123, process dump); S2 heartbeat and output keep a job alive; S3 deadline against ceiling;
    - S4 soak (`cpu.idle=1`, yield notice, preempted 75, the waiting job starts after);
    - S5 rejection (3, the command never ran); S6 snapshot (tests v1 while the worktree says v2, evidence bound; a dirty snapshot is unbound; a written snapshot is kept); S7 drift during a run;
    - S8 the R5 delegated case, holder SIGSTOPped through the OOM, then SIGKILLed: 137 `oom`, evidence `memory.events.local (wrapper)`, `oomKills ≥ 1`;
    - S9 live slice limits after an admission, on a nested `a-b.slice` name;
    - S10 GPU lease and Chrome guard (granted, missing, forged in another ticket's name; software passes; the guard removes cleanly);
    - S11 an unleased `/dev/nvidia0` holder shown by `status` and recorded on a GPU job;
    - S12 `wait --json`;
    - S13 mixed-version queue with the real SCHED-1 code (`1f31c87`);
    - S14 the `.test-build` guard (queued doesn't block, running names itself, the sibling directory is free, `--no-test-build`).
  - Full runs of both suites at `fcc5811`: 23/23 and 13/13. S14 and SCHED-1's 14 and 14b ran again after the guard change.
- **Fast tier:** `npm test` passes 1,296, and passes from `.test-build-2` too.

  S11 flaked once in a full run (a fixed 300 ms wait), was fixed to wait on the condition, and then passed 3/3.
- **Soak runner, functional on the 3090:** see "Functional soak check" below.

## Functional soak check (3090, `--class gpu`, a shared run)

This is not the real tour. It's a 4-point surface swim loop by the start pod (`/work/tmp/sched2/soak/pod-loop.json`, earned travel with ordinary keys from `c2-evidence/saves/pod.json`), there to show the runner works end to end on the GPU. Results are in `/work/tmp/sched2/soak/run*/`.

- **Tour, 3 laps** (run4, at `bdc7985`): one game lifetime, each lap's save loaded in a separate browser. The verdict is **partial** (exit 5):
  - every memory and graphics rule passes: renderer RSS lap 1 376.8 → lap 3 374.2 MiB, GPU process 230.2 → 231.3, heap after GC 93.4 → 93.0, 425 meshes flat;
  - all 3 saves load;
  - `streaming-frame` and `loading-hold` are **unavailable**: this root build records no per-frame split or cave-hold state (CW-1 and REC-1 add them).
- **Dwell:** these runs found two measurement flaws, both fixed:
  - **First run (10-min window):** it "failed" on an artifact. The renderer RSS idling at the pod swings ±5–11% with GC timing (478–490 MiB, then 532 just after a forced GC), and a single post-GC sample was compared with samples taken without a GC.
  - **Fix:** memory compared over time is now read one way only: a forced GC, a 2 s settle, then RSS and heap. Tour laps already worked like that. Dwell flatness and leak are judged only on these settled samples, one a minute after a 60 s warm-up, and the goal requires them to span the leak window.
  - Regression: `tests/soak-goals.test.ts`, GC swings over a flat floor pass, a rising floor fails.
  - **Rerun on the fixed code** (run5, at `da06145`, short check thresholds: 5 autosaves, a 3-min leak window): **fail**, on a finding rather than an artifact.
    - Settled renderer RSS is flat: 367.4, 366.3, 366.4, 366.1 MiB. The heap after GC is 90–92 MiB.
    - The **GPU process's RSS rises steadily:** 228.3 → 230.3 MiB in 3 min (`leak:gpuRssMiB`, 39.8 MiB/h). The first, 10-minute run shows the same, 228 → 234 MiB, about 34 MiB/h.
    - So idling at the pod grows Chrome's GPU-process memory by about 35–40 MiB/h. It's for MEM-1 to attribute (the game's uploads, or Chrome's GPU process), and it's exactly what the dwell rule exists to catch. I haven't tuned the threshold around it.
- **Observed for its owners:** every load requests terrain tiles `t_4_11`, `t_4_12`, `t_5_11` and `t_5_12`, which are not in the bake or its manifest, so each load logs four HTTP 404s. The soak's page-error list now names the resource.

## Compromises, limits and missing evidence

- **Unverified on the sandbox:** the exact cgroup path of a `siltwake-job` scope. The rule follows the sandbox handoff's `siltwake-job-*` scope names. My check job couldn't run: the sandbox had a backlog of other agents' jobs.

- **Starvation bound grows with ceilings.** The 10-minute head reservation now bounds a wait at 10 min plus the longest running job's remaining time, which can be hours. Only soaks are preemptible. Root fix if it bites: checkpointed or resumable jobs (TST-14's "resumable scenario runs"), or preemption by stopping and requeueing with a progress marker. Neither is cheap to do safely; I'd measure the ledger first.
- **The GPU guard covers Playwright's Chrome binaries,** the only browsers here. Another GPU client (a system Chrome, a CUDA tool) is detected and recorded, not prevented. Device-level enforcement (cgroup device BPF) needs privileges we don't have.
- **Snapshots carry no ignored build outputs.** A job must compile inside: the TT-1 cold compile is about 47 s, and the terrain bake restores from the store. It's opt-in for that reason.
- **Soak harness, missing pieces:**
  - **Not run yet:** the real tour (every region and cave, 3 laps). It needs CW-1's 55-cave plan (on its branch), a late-game save with a craft and power for about 27 km a lap (SAVE-1 builds these), and power and oxygen top-ups along the route.
  - **Dwell gaps:** day–night is `unavailable` (the game has none), and `large-cave` is not placed.
  - **Streaming-frame and hold attribution** exist only where a build records them (CW-1, then REC-1).
  - **Autosave hitch** is the worst rAF gap in the second around a detected save. That's labelled, and judged only on isolated runs.
- **Moved out of SCHED-2:** TST-10, capture segmenting, goes to REC-1, which owns video and the evidence pack (coordinator, 2026-10-23). The light-work slice and throttling during exclusive runs (TST-16) is not in 2a's list. I propose it for 2b or a later stream: put `npm test`, typecheck and build in `siltwake-light.slice`, and clamp that slice's CPU quota while an exclusive job runs. It's about S/M.
- **Carried P3s that stand:**
  - a job deliberately killing its own anchor while its holder is also dead;
  - anchor overhead;
  - manual-stop latency with a dead holder;
  - supervisor cost (about 45 MB per queued ticket);
  - fairness for a finite v1 backlog only;
  - disturbance from light work outside the lane.

## Cut-over (coordinator; after Sol review and your go-ahead)

1. Merge this branch into root.
2. From the root checkout, run `scripts/heavy/install.sh` (mode unchanged; `--slice` not needed). It installs the new immutable version and moves `~/.local/share/siltwake-sched/current`, which every worktree's shim runs. Running and queued SCHED-1 tickets keep their own code, and mixed operation is covered by S13.
3. Run `scripts/heavy/install.sh --gpu-guard` once. Running browsers are unaffected. Re-run it after any `npx playwright install`. Rollback is `--gpu-guard-remove`.
4. Check that `status` shows the slice "as wanted", and watch the ledger for `unleased-gpu` events. Per-stream drivers run outside the queue will fail with the guard's message; point their owners to `--class gpu`.
5. Paste the new "How to run a heavy job" section into briefs. The new pieces are the stall and heartbeat, `--snapshot`, exit 3 and 123, exclusive turns, and soaks.

Rollback: `install.sh` from the previous root commit re-points `current` (versions are immutable), or `echo serial > /work/tmp/siltwake-sched/mode`.
