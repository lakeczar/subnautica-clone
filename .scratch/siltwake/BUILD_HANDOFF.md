# Siltwake construction handoff

Read after compaction or a restart. This is a planning checkpoint, not a build launch. The owner reserved construction for the next run and requested review of the full input first; begin when they explicitly invoke the revised input. That invocation authorizes routine implementation, integration, fixes and PR work without another confirmation round.

## Current state

- Public repository: https://github.com/lakeczar/subnautica-clone; planning branch `docs/astra-game-build-brief`; draft PR https://github.com/lakeczar/subnautica-clone/pull/1. Inspect the current branch, HEAD and worktree before resuming. Latest review records are in [PLANNING_REVIEW.md](../../docs/PLANNING_REVIEW.md).
- Full authoritative input: [BUILD_GAME_REVISED.md](../../prompts/BUILD_GAME_REVISED.md). Read it and its specification pointers. The shorter `BUILD_GAME.md` is superseded.
- **Astra xhigh coordinates and sets direction. Sol 6.1 max is the main builder**, including gameplay, infrastructure, content, graphics and tests. Coordinator ownership of shared contracts means directing and integrating assigned Sol work, with exclusive editing paths.
- Two independent non-author reviewers remain mandatory: **Astra xhigh + a separate Sol 6.1 max agent**. The builder cannot be its own reviewer. Follow the [review gate](../../docs/DELIVERY_AND_ACCEPTANCE.md#independent-review-gate) for every completed feature/batch and integrated milestone.
- No game implementation or gameplay validation exists yet. The separate art study at `20711d1` on `prototype/siltwake-art-directions` is the richer cel visual reference; its viewer architecture is disposable. Its software-rendered captures do not establish dedicated-GPU performance.
- User decisions live in the [planning map](map.md). All design preferences needed to start are settled. Keep major story spoilers out of chat and PR summaries; the build input explicitly directs authorized story workers to the labelled canon.

## First actions after build submission

1. Inspect repository state and any live child tasks; avoid duplicating unfinished work. Verify the live model catalog, exact efforts and concurrency limit. Default to a coordinator plus at most three active workers; rotate builder and reviewer roles within the cap.
2. Read the input/specification, establish a dedicated game integration branch, and create the durable build status, plan, contracts and evidence records specified there. Keep main merge and public deployment for the owner unless separately authorized.
3. Assign the first bounded foundation task to **Sol 6.1 max**: pinned TypeScript/Vite/Babylon.js scaffold, production build, shared simulation/content/save interfaces and a launchable scene. The coordinator supplies interfaces, ownership and acceptance criteria; Sol proposes details for reconciliation before dependent work begins. Start from the existing committed planning baseline, then commit the shared runnable foundation before dispatching dependent implementation worktrees. Use T3 `delegate_task` with `isolation: "worktree"` for separate checkouts.
4. Establish the first complete expedition: opening/pod, reef/island investigation, gathering/crafting, small-craft controls, readable wildlife, save/reload and recovery. Include early carrier-berth and collision gates. Review using normal-input evidence before expanding to all regions, fleet, authored campaign and polish.

Approximately ten hours of main story, actual resource/route budgets, enjoyable play and dedicated-GPU performance remain construction/playtest targets. Before any browser workflow read `/work/repos/fleet/BROWSER_RULES.md` when present and `docs/BROWSER_RULES.md`; include those rules in delegated browser work.
