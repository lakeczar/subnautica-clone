# SCHED-1: heavy-check v2 admission queue

Builder: Opus 5.5. Branch `t3/sched-1-heavy-queue`. Design: `docs/build/perf/DECISION-OPUS.md` on `research/perf-decision` (`fd4cdcd`), approved by the owner on 2026-10-22. **In progress.** This file becomes the handoff.

## Paused for VM restart (2026-10-22, about 22:05 UTC)

The owner paused all work for the 6 → 8 vCPU restart. Nothing of mine is running. My acceptance run was stopped (its own process group and its `sched1test*` scopes only). My private state under `/work/tmp/sched1-test/` never touched the live lock: at the pause, CW-1's GPU traverse (`t3-e42dee05`) held it and one other agent was waiting.

**Done (committed):**
- `scripts/heavy/`:
  - `policy.mjs`, the pure admission function;
  - `state.mjs`, the flock transaction on an inherited fd, liveness by PID plus start time, the `/proc/locks` legacy bridge, host sampling and reconciliation;
  - `supervisor.mjs`, the detached per-ticket supervisor in its own scope;
  - `heavy-check.mjs`, the CLI: run, submit, wait, status, log and cancel, plus the nested-call check;
  - `scope-run.sh`, which verifies limits inside the scope, records `memory.peak`, OOM kills and CPU time, and applies the deadline;
  - `build-guard.mjs`, `gpu-lease.mjs` and `install.sh`.
- `scripts/heavy-check.sh` is now a shim. It runs the installed v2 and falls back to v1, which accepts v2's options and grants the GPU lease.
- **Call sites:**
  - `package.json` `test:heavy` uses `--class heavy-suite` and compiles inside the job;
  - `check` drops the duplicate typecheck;
  - the playthrough's `--jobs` defaults to `SILTWAKE_JOB_CPUS` (never in a `--child`);
  - GPU-lease guards are in `tools/cave-gpu-check.mjs`, `tools/cave-deep-shots.mjs`, `tools/large-cave-lab.gpu.mjs` and `webgl-probe.mjs`.
- **Unit tests:** `tests/heavy-sched-policy.test.ts` (fast tier) passes 18 of 18. It includes test 4, starvation, with an injected clock.
- **Acceptance run 1** (`scripts/heavy/acceptance.test.mjs`): tests 1, 3, 8, 9, 10, 11 and 13 passed. Six failures came from one CLI bug, a TDZ in `status` (now fixed; the queued row shows `gpu` by hand). Test 6 exposed a real design flaw:
  - **The flaw:** `MemoryHigh` at 90% with no swap throttles a runaway job instead of killing it. It crawled from 478 to 490 MiB in 18 s, with 0 OOM events.
  - **The fix:** job scopes now set `MemoryHigh=infinity`, so the job gets an explicit OOM at `MemoryMax`.

**In flight when paused:** acceptance run 2, with both fixes. It was stopped before it reported.

**Next step after the restart:**
1. Run `nproc`, expecting 8. Then run `node -e 'import("./scripts/heavy/policy.mjs").then(P=>console.log(P.tokensFor(require("os").availableParallelism()), P.sliceLimits(8)))'` and expect `6` and a quota of 700%. Also check that `heavy-suite` and `playthrough` resolve to 3 tokens.
2. Rerun `node --test --test-concurrency=1 scripts/heavy/acceptance.test.mjs`. The tests inject `nproc: 6`, so the expected numbers don't change. Fix what fails.
3. Then:
   - the docs: the agent usage section in `WORKER_RESOURCE_LIMITS.md` and the `DIRECTION.md` rule lines;
   - the TT-1 follow-up: wire `heavyJobGuard` into `scripts/test-build.mjs`;
   - the terrain store, as a separate commit or a follow-up;
   - this handoff in full.
