# SCHED-3: queue self-balancing

Builder: Opus 5.5, branch `t3/sched-3-balance`, from root `7479e188`. Owner-approved on 2026-10-24, after the 3090 had about 5 h of exclusive work queued while the 4070 sat idle: builders had tagged investigations `3090` (the default for most classes), and a queued job never moves. DIRECTION, "Balance the two GPUs": only acceptance numbers are `--class exclusive` on the 3090; everything else is `--machine any`, pinned only when the question needs a machine. It touches `scripts/heavy`, so it's checked with the full SCHED-1, SCHED-2 and SCHED-2b suites.

## The change

- **Defaults** (`policy.mjs` `defaultMachine`): `any` for `standard`, `gpu`, `playthrough` and `heavy-suite`. Kept here (`3090`): `quick` (the express slot; shipping a commit costs more than the job), `bake` (it writes local artifacts) and `exclusive` (it measures the 3090). `soak` is unchanged. An explicit `--machine` always wins.
- **Routing at submit** (`policy.mjs` `resolveMachine`, called by `heavy-check.mjs` `submit`): the reason a job can't run on alickers is the remote lane's own predicate, reused as it was (`remote.mjs` `externalPaths`, `builtOutputs`, the clean-tree and lane checks). With a reason:
  - `any` resolves to `3090`, recording `goal.routed = { from: "any", reason }`;
  - `4070` is refused with it (as before);
  - `3090` and `soak` stand (soak keeps its own rule).

  The goal is resolved once, at submit, and never re-resolved, so the route sticks.
- **Shown everywhere:**
  - `submit` prints `runs here (factory-worker), not on alickers: <reason>` once, for a default `any` too (before, a defaulted `any` fell back silently);
  - the ticket and its result carry `goal.routed`;
  - `status` marks the machine `3090^` while queued, `here^` once running, with a line `^ <ticket>: any, routed here: <reason>`;
  - the final line reads `on RTX 3090 (factory-worker) (any, routed here: <reason>)`.
- **One reason added beyond the brief (kept by the coordinator): build-only commands** (`remote.mjs` `buildOnly`). `npm run build`, `vite build` or `node scripts/test-build.mjs`, with nothing after it, stays here, with the reason "it only builds (`npm run build`): build output must stay here": its output in the worktree is the point, and a commit run on alickers brings none back. A later local step (an exclusive run reading `dist`) would otherwise silently use stale output. A build followed by its use (`npm run build && …`) still goes, as the lane's docs recommend.
- **`--snapshot`** needs no rule: alickers runs the submit-time commit, which is exactly the snapshot of a clean tree, and a dirty tree is already routed here.
- **Re-routing at admission: already there; nothing added.** An `any` ticket is placed when it's admitted, not at submit (SCHED-2b): alickers when its slot is free at that moment, else here as soon as there's room, never waiting for alickers. A queued `any` job therefore already goes to whichever machine frees first. What never moves is a job pinned to `3090` or `4070`, by its owner's choice; changing that would override an explicit tag, which the brief rules out.

## Tests

- **Policy units** (`tests/heavy-sched-policy.test.ts`):
  - the default for every class, matching `defaultMachine`; explicit `3090`, `4070` and `any` win;
  - `resolveMachine`: no reason; `any` routed with its reason; `4070` refused; `3090` and `soak` unrouted;
  - `buildOnly`: four build-only commands, and five that aren't (`npm test`, build then use, `build:terrain`, a playthrough).
- **Acceptance (SCHED-2b suite, fake second worker):**
  - **B28:**
    - a clean `standard` and a clean `gpu` job, no `--machine`, run on the 4070, tagged `any`, unrouted, with no "runs here" line;
    - `quick` and an explicit `--machine 3090` run here unrouted;
    - a dirty tree: routed, one line at submit, the ticket's `goal`, `status` (`3090^` and the reason line, while it waits for its worktree), the final line and the result;
    - an explicit `--machine 4070` with the same dirty tree is refused;
    - a local path, a `.test-build` read and `npm run build`: each is routed with its reason.
  - **B29:** private state without a remote: a default `standard` job is routed here, "the remote lane is off".

## Checks

At `79d6bc13`, on root `7479e188`:
- **Full suites, local and sequential (concurrency 1):** SCHED-1 **23/23**, SCHED-2 **27/27**, SCHED-2b **29/29**. They ran while CW-1's 3090 exclusives were running, under the coordinator's allowance for acceptance suites at concurrency 1. No units, slices or unit files were left behind.
- **Fast tier:** through the queue on alickers (`--machine 4070`, ticket `261024-144534-a52d`, exit 0, 146 files); the policy units are in it. B28 also passed three runs in a row on its own.
- **Run history:** the first full SCHED-2b run had one failure, B28's own setup. It dirtied the tree before the worktree-holding job had started, so the holder rejected that job. B28 now waits for the job's output first.

## Compromises and missing evidence

- **Production:** not installed (nothing is until accepted). The default change was checked only against the fake second worker and private state.
- **Build-only rule:** it recognizes three spellings: `npm run build`, `vite build` and `node scripts/test-build.mjs`, each bare, optionally after `sh -c`. A build-only command spelled otherwise (a custom script) still goes to alickers. It can be pinned with `--machine 3090`, or the rule widened when a case appears.
- **The 4070 queue today:** with many jobs pinned `4070` (exclusive-window guidance), the second worker is now the bottleneck. With the default `any` those jobs would run on whichever machine frees first. Pinning `4070` should go back to being for 4070-specific questions once windows end.
