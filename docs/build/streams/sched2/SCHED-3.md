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

## R3 review responses

Review `7c188ded` on `review/sched-3-r3`, by Sol on `3850c9bd`: REQUEST CHANGES. E1–E5 and the base control pass 6/6. The findings:
- **F1 (P1):** npm's config-file selectors (`userconfig`, `globalconfig`, `prefix`) and `~/.npmrc` can set `script-shell`.
- **F2 (P2):** the test-cache controls were missing from the list.
- **F3 (P3):** local recovery inferred `ran` from a claimed holder.

The coordinator's decision: stop extending lists, and fix the mechanism so npm configuration can't matter.
- **The portable runner** (`scripts/heavy/portable-run.mjs`, in the commit):
  - **What it runs:** a registered command placed by default (`policy.mjs` `portableCommand` now returns the runner's arguments) runs as `node scripts/heavy/portable-run.mjs --script test` (or `--sh` for the heavy tier's command line), from the commit under test. So both machines run the same file and the same `package.json` by construction.
  - **No npm:** `resolveScript` expands `npm test`/`npm run X` steps from the commit's scripts. It refuses a script with pre/post hooks, shell quoting or a remaining npm step.
  - **How it runs:** under `sh -c` at the package root, with `portableEnv`: an allowlist of `PATH` (with `node_modules/.bin` first), home, user, locale, temp and session variables, and the queue's own job variables.
  - **What can no longer differ:** npm, `.npmrc`, prefixes, `script-shell` and the submitter's or the machine's other variables.
  - **Checks at submit:** `heavy-check` verifies the commit has the runner and the script resolves, else runs it here as submitted with the reason.
  - **What's recorded:** the ticket's `argv` is the runner's, and `goal.portable` keeps what was typed.
  - **Explicit `--machine any`** is unchanged: the caller's declaration, run as typed.
- **The intent check** (`policy.mjs` `intentEnv`) replaces R2's `invocationEnv` blocklist, which is deleted. A default `any` runs here as submitted, through npm (base behaviour), naming the variables, if the environment has:
  - any `SILTWAKE_*` the queue doesn't own (`QUEUE_OWNED`: its configuration and per-job variables). This covers `SILTWAKE_BUILD_CACHE`, `SILTWAKE_BUILD_CACHE_DIR` and any future selector;
  - any `NODE_*`;
  - any `npm_config_*` beyond npm's descriptive exports. `userconfig`, `globalconfig` and `prefix` pass only inside an `npm run` (`npm_lifecycle_event` set), where they are npm's own exports and every setting those files make is exported beside them, so `npm run test:heavy` still balances.
- **F3:** `reconcile` takes `ran` from the payload's `started` marker, as the holder does. A holder that died after its claim and before the start is "not started: its holder died before the command started", `ran:false`, `planned`.
- **Tests:**
  - **B38 (Sol's config probes):** each of `npm_config_userconfig`, `npm_config_globalconfig` and `npm_config_prefix` naming an npmrc with `script-shell` routes the default here as submitted (exit 19, the file's shell applied). A private-HOME `~/.npmrc` is irrelevant: the default runs through the runner with exit 0 on the 4070, and again here with alickers paused. Pinned to the 3090 it runs as submitted, through npm (19).
  - **B39 (F2):** `SILTWAKE_BUILD_CACHE=off`, `SILTWAKE_BUILD_CACHE_DIR` and an invented `SILTWAKE_NOT_YET_INVENTED` each route here, naming it. The queue's own variables and npm's descriptive exports don't.
  - **B40 (Sol's crash probe):** the holder killed between claim and launch gives `ran:false`, `planned`, the "never ran" line, and the frozen goal.
  - **B28** also checks that the registered default ran through the runner.
  - **Policy units:** `intentEnv`, `resolveMachine` with intent, the runner's `resolveScript` on this repository's own scripts, and `portableEnv`.
  - The test contexts drop the test runner's own `NODE_TEST_CONTEXT`.

## R2 review responses

Review `0f6b3b2a` on `review/sched-3-r2`, by Sol on `fa2078a2`: REQUEST CHANGES, P1, P2 and P3, plus the coordinator's new F4. All R1 repros were fixed (9/9). Not installed.
- **F1 (P1), registered argv inherited local configuration** (E1: `npm_config_script_shell` changed `npm test` here, and the remote run silently dropped it).
  - **The rule:** a default `any` is portable only when the settings that change the command are clean (`policy.mjs` `invocationEnv`, passed to `resolveMachine` as `localConfig`). The environment is not forwarded. An explicit `--machine any` stays the caller's declaration.
  - **Invocation-changing settings:**
    - `npm_config_*`, except npm's own exports. These are the 13 names `npm run` sets itself: install paths, config file locations, version, user agent, `allow_scripts` and `loglevel`. They say where npm is and how much it logs, so `npm run test:heavy`'s queued command still balances.
    - `NODE_OPTIONS`.
    - What `scripts/test-tier.mjs`, the playthrough runner and the fast tests read: `SILTWAKE_FAST_*`, `SILTWAKE_TIMELINE_*`, `SILTWAKE_HEAVY_BUDGET_MIB`, `SILTWAKE_SAVES`, `SILTWAKE_PLAYTHROUGH_FAULT` and `SILTWAKE_LIBRARY_PAUSE`.
  - **Not counted:** the queue's own per-job variables (`SILTWAKE_JOB_*`, `SILTWAKE_HEAVY_CONCURRENCY`, …), which it sets on either machine, and `SILTWAKE_TEST_BUILD`, which only names where the job compiles (alickers compiles into its own fresh `.test-build`).
  - **The reason:** `local configuration <names> changes this command; pass --machine any to declare it portable`.
- **F2 (P2), build options changed the output** (E2: `npm run build -- --outDir custom-dist` with `--artifact custom-dist` was refused). `buildOnly`:
  - with options after the build command, the caller's declared `--artifact` is the output contract, so any declared artifact satisfies it;
  - with no options, the table's output must be covered, as before;
  - with no artifact, it stays here, "declares no --artifact for its output".
  - No `--outDir` parsing.
- **F3 (P3), one terminal identity builder.** `state.mjs` `terminalRecord(t, fields, { ran, remote })` now starts every result, at all seven writers:
  - the holder;
  - the remote holder's finish, and its recovery;
  - the coordinator's release;
  - queued cancellation, expiry, and reconcile.

  It always keeps the frozen goal. `ran` is what was observed of the payload, not of admission:
  - **the holder:** scope-run's `started`, written just before the command runs;
  - **the remote holder:** the receipt's `started` phase. Without a valid receipt that says it didn't start, `unknown`;
  - **remote recovery:** `true` if a valid receipt read showed the start, else `unknown`;
  - **release:** `unknown`.

  `true` and `unknown` carry `machine`; `false` carries `planned`. The final line says `never ran; planned for …` for `false`, and `on <machine> (whether its command started there is unknown)` for `unknown`.
- **F4, the suites inside a queue job:**
  - **Scope naming:** `gpuUsers` treated any `siltwake-heavy-*` scope as a v1 (leased) holder, including the production job scope running the suites. A v1 scope is `siltwake-heavy-<dir>-<pid>`. A v2 job scope of any queue ends in a ticket id (`-YYMMDD-HHMMSS-xxxx`) and is no longer taken for one.
  - **Parallelism:** `availableParallelism()` follows the caller's cgroup quota, so the suites inside a quota-limited job sized slices for 7 CPUs while holders in their own scopes used 8. One `state.mjs` `machineCpus(cfg)` (config.json `nproc`, else the kernel's CPU count) now serves host sampling, the holder's exclusive-slice check, the unit writer and the tests.
  - **Job variables:** the test contexts drop every `SILTWAKE_JOB_*`, `SILTWAKE_HEAVY_*`, the GPU lease, `SILTWAKE_TEST_BUILD` and `BAKE_WORKERS` they inherit.
- **Regressions:**
  - **B34 (E1):** `npm_config_script_shell` routes the default `npm test` here, where the requested setup runs (exit 19). Without it the same command goes to the 4070. An explicit `any` goes there, where the real ssh boundary drops the variable.
  - **B35 (E2 and its base control):** `--machine 4070|any --artifact custom-dist -- npm run build -- --outDir custom-dist` runs on the 4070 and returns `FRESH`. Without the artifact it is refused.
  - **B36 (E3):** the holder's tree-change rejection: `ran:false`, `planned`, no machine. `wait`, `wait --json` and `status` agree. A job that ran says `ran:true`.
  - **B37 (E4):** remote recovery after the payload started keeps the frozen goal, with `ran:true`.
  - **Policy units:** `invocationEnv` with npm's own exports and the queue's variables excluded, `resolveMachine` with local configuration, and `buildOnly` with options.

- **Checks** at `a01066f2`, all through the queue (nothing local):
  - **One `--class standard --machine 3090 --review` job** (`261024-171517-cc5c`), with the job's variables cleared and the suites run directly in the job's own scope (no wrapper scope):
    - policy, contention and config units **48/48**;
    - SCHED-1 **23/23**;
    - SCHED-2 **27/27**, S11, S17, S20 and S22 included, which F4 fixes;
    - SCHED-2b **37/37**.
  - **Fast tier:** `--machine 4070`, ticket `261024-171517-0994`, exit 0, 149 files.
  - **Negative control** (ticket `261024-175008-4a53`, the R1 code `fa2078a2` with only the new SCHED-2b test file): B34, B35, B36 and B37 all fail, each at its finding:
    - B34: no routing reason;
    - B35: "declares no --artifact dist";
    - B36: `ran`, `planned` and `machine` wrong;
    - B37: the recovered result has no `goal`.
  - **A first control attempt was invalid:** it copied the new test library, which imports `machineCpus`.

## R1 review responses

Review `6f49c776` on `review/sched-3-r1`, by Sol on `86744a72`: REQUEST CHANGES, one P1, one P2 and one P3; not installed. Coordinator's decisions applied.
- **F1 (P1), portability was inferred from argv.** A path blacklist can't see what a script imports, reads from the environment or writes: an opaque `node scripts/x.mjs` ran on the 4070 and left its output there, and a remote build left a stale local one. Portability is now **declared, never inferred** (`policy.mjs`):
  - **The logical default stays `any`**, but a default `any` goes to alickers only for a **registered** command (`PORTABLE`, `portableCommand`): ours, proven self-contained (it compiles and consumes its builds inside the job and writes nothing the caller needs back), and run there by a suite or the gate.
    - The registered commands are the fast tier (`npm test`, `npm run test:fast`), the heavy tier's own queued command (`sh -c 'node scripts/test-build.mjs && node scripts/test-tier.mjs heavy'`), and the gate's playthrough (`npm run playthrough`, optionally `-- --jobs N --quiet`).
    - Matching is exact, so `--json pt.json` isn't registered.
  - **Or the caller declares it** with an explicit `--machine any|4070`, and returns its outputs with `--artifact`. The lane's eligibility refusals still apply.
  - **Everything else is routed to the 3090** with `portability not declared: pass --machine any and --artifact for its outputs`, printed, recorded and shown as before.
  - **Not registered, with reasons:**
    - **the economy scripts:** each imports `../.test-build/src/...` directly, so alone they aren't self-contained. The gate runs them here after its fast tier.
    - **`npm run test:heavy`:** it queues itself; its inner command is registered.
    - **the saves export:** its remote path calls `alickers-job.sh` directly, not through the queue, and its queued fallback names an outside build and `.test-build`, so it stays here anyway. Nothing queued needs an entry.
  - **Audited tools:** none is trivially portable, so their headers now say `--class gpu --machine 3090`, with why.
    - `tools/large-cave-lab.gpu.mjs`, `cave-deep-shots.mjs` and `cave-gpu-check.mjs` load Playwright and Chrome from this machine's paths and need the GPU lease.
    - The CA-2, POI-1, W2 and ATM-1 drivers use the caller's Vite server, compiled files or prebuilt dists.
    - Unregistered, all of them are routed here by default anyway.
  - **Docs:** `WORKER_RESOURCE_LIMITS.md`, including the `node my-play.mjs` example, now `--machine any --artifact out`, and how to balance your own driver. DIRECTION's line says `--machine any` is the declaration.
- **F2 (P2), build placement ignored declared artifacts.** `buildOnly(argv, artifacts)` (`remote.mjs`):
  - **What counts as a build:** a table of build commands and their outputs: `npm run build`, `npx vite build` and `vite build` → `dist`; `npm run test:build` and `node scripts/test-build.mjs` → `.test-build`.
  - **The reason applies only when** no `--artifact` covers the output (the output itself, or `.`).
  - **Behaviour now:**
    - `--machine 4070 --artifact dist -- npm run build` runs there again and `dist` comes back whole, as on base;
    - without the artifact, an explicit 4070 is refused and an explicit `any` is routed here, with "… declares no --artifact dist: build output must stay here".
  - **The regex is gone:** argv is matched word by word. A `sh -c` script with any separator, newline included, isn't build-only (Sol's false positive). Under F1, an undeclared `sh -c 'npm run build && true'` is unregistered and stays here.
  - **Relative `--artifact` on a routed job:** an `--artifact` without `--machine` isn't a declaration, so that job is routed here. A relative `--artifact` on it is now where it wrote it, as for an `any` job run here, instead of being refused as an absolute-path error.
- **F3 (P3), terminal records lost the route.**
  - **One helper:** `state.mjs` `terminalRecord` writes queued cancellation (`heavy-check cancel`), expiry (supervisor) and recovery (`reconcile`). It keeps the frozen `goal` (machine tag and route).
  - **Never ran:** a ticket that never ran gets `ran: false` and `planned`, never `machine`. That covers cancelled or expired while queued, lost before admission, cancelled before start, and a supervisor that died in the handoff.
  - **Ran here:** a recovered ticket that did run gets `machine` and `machineTag`.
  - **The final line** reads `never ran; planned for RTX 3090 (factory-worker) (any, routed here: …)` instead of `on RTX 3090`.
- **Regression tests from Sol's repros** (SCHED-2b suite), each asserting the fixed behaviour:
  - **B30 (R1):** the opaque writer stays here by default, its output is here and nothing is left on the sandbox. Declared with `--machine any --artifact local-results`, it runs on the 4070 and the output comes back.
  - **B31 (R2):** a default `npm run test:build` builds here, so the later local exclusive read sees `FRESH`. An undeclared `sh -c 'npm run build && true'` stays here. A declared `--machine any` build-only job with no artifact is routed here with the build reason.
  - **B32 (R7):** `--machine 4070 --artifact dist -- npm run build` runs there and fetches `dist` whole. Without the artifact it's refused. With an `--artifact` alone, it's routed here and its relative artifact is recorded where it was written.
  - **B33 (R3):** a routed ticket cancelled, expired or lost while queued keeps its goal and route, with `ran: false`, `planned`, and the `never ran; planned for …` final line.
  - **Policy units (R6):** the registry, with Sol's opaque commands unregistered, and `buildOnly` with artifacts, the newline case and `npm run test:build`.
  - **B28, rewritten:** a registered `npm test` and a declared `--machine any` job go to the 4070. An unregistered one is routed with the printed reason, shown by status, the final line and the result. Dirty trees, local paths and build reads are routed with their own reasons. Explicit tags win, and quick stays here.
- **Negative control:** with the R0 code (`86744a72`), B30, B31, B32 and B33 all fail.

- **Checks** at `5b27ad57` (code `df808cfb`; the later commits change only SCHED-2b's tests, tool headers and docs), on root `aa82d905`:
  - **SCHED-1 23/23 and SCHED-2 27/27:** local, sequential, at `df808cfb`.
  - **SCHED-2b 33/33:** through the queue on the 3090 (ticket `261024-162415-978e`, `--class standard --machine 3090`, with the job's own variables cleared so the suite's calls aren't nested). The queue ran it between exclusive turns, never beside one.
  - **Fast tier:** `--machine 4070`, ticket `261024-162419-0455`, exit 0, 149 files; the policy units, 36/36, are in it.
  - **B28 to B33** passed 6/6 on their own first. No private units or processes were left behind.
  - **Run history:** the first SCHED-2b run, local at `df808cfb`, failed B1, B3 and B5 before I stopped it. Those older remote-lane tests submitted arbitrary playthrough commands relying on the default `any`; under F1 they now declare `--machine any` (19 submissions).
  - **Disturbance, reported at once:** that run, and the SCHED-2 run before it, overlapped REC-1's exclusive `261024-160911-4a2b` from 16:17:07 to 16:23:14 UTC. It started earlier than the announced window, while queued exclusives were visible. I stopped the suite and its leftover test scope.

## Checks (R0, at `79d6bc13`; history)

At `79d6bc13`, on root `7479e188`:
- **Full suites, local and sequential (concurrency 1):** SCHED-1 **23/23**, SCHED-2 **27/27**, SCHED-2b **29/29**. They ran while CW-1's 3090 exclusives were running, under the coordinator's allowance for acceptance suites at concurrency 1. No units, slices or unit files were left behind.
- **Fast tier:** through the queue on alickers (`--machine 4070`, ticket `261024-144534-a52d`, exit 0, 146 files); the policy units are in it. B28 also passed three runs in a row on its own.
- **Run history:** the first full SCHED-2b run had one failure, B28's own setup. It dirtied the tree before the worktree-holding job had started, so the holder rejected that job. B28 now waits for the job's output first.

## Compromises and missing evidence (R0; R1 below replaces the build-only spelling limit)

- **Production:** not installed (nothing is until accepted). The default change was checked only against the fake second worker and private state.
- **Build-only rule:** it recognizes three spellings: `npm run build`, `vite build` and `node scripts/test-build.mjs`, each bare, optionally after `sh -c`. A build-only command spelled otherwise (a custom script) still goes to alickers. It can be pinned with `--machine 3090`, or the rule widened when a case appears.
- **The 4070 queue today:** with many jobs pinned `4070` (exclusive-window guidance), the second worker is now the bottleneck. With the default `any` those jobs would run on whichever machine frees first. Pinning `4070` should go back to being for 4070-specific questions once windows end.
