# SCHED-2a: goal-based heavy jobs, soaks, the GPU lease everywhere

Builder: Opus 5.5, branch `t3/sched-2-goal-jobs`. Scope: the owner's 2026-10-23 rule ("a job has a goal, not a time limit") and the 2a list in [DIRECTION](../DIRECTION.md), "Two test machines". SCHED-2b (the remote lane) and SAVE-1 follow after review. **Not installed:** the live queue still runs SCHED-1 `6824478b070f`; cut-over is below and waits for the coordinator.

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
