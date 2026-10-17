# Working in this repository

Construction was explicitly invoked on 2026-10-17. Read `docs/build/STATUS.md` first for the current checkpoint, active ownership and next action, then `docs/build/PLAN.md` and `docs/build/CONTRACTS.md` before implementation. The authoritative input is `prompts/BUILD_GAME_REVISED.md`. Read `.scratch/siltwake/map.md` for settled decisions and `docs/agents/issue-tracker.md` for the historical Wayfinder tracker. `prompts/BUILD_GAME.md` is the superseded short-game draft; do not execute it.

For implementation, read the revised input and its specification pointers before assigning work. `docs/EXPEDITION_INTEGRATION.md` owns cross-system dependencies. `docs/spoilers/NARRATIVE_CANON.md` contains major story spoilers: the coordinator and lore/world integration workers need it, but ordinary owner-facing summaries and PR descriptions must not reveal the twist. Research explains choices and does not silently add or remove requirements.

The Astra `xhigh` coordinator sets direction and owns shared interfaces, dependencies, integration, and the project state. Sol 6.1 at `max` is the main builder and default implementation model, including graphics. Workers edit only the paths assigned in their task. Commit a shared baseline before creating implementation worktrees. Keep unfinished changes on feature branches and use pull requests for review.

Before accepting a feature, delegated deliverable batch or integrated milestone, follow the Independent review gate in `docs/DELIVERY_AND_ACCEPTANCE.md`: non-author Astra `xhigh` and Sol 6.1 `max` reviewers are required in addition to coordinator self-review. The coordinator runs Astra at `xhigh`.

## Browser usage

Before opening, driving, or launching a browser, including previews, screenshots, HTML previews, and browser tests, read and follow `/work/repos/fleet/BROWSER_RULES.md` when available and `docs/BROWSER_RULES.md`. Include these rules in delegated browser work. The repository copy provides the same isolation requirements for environments without the fleet checkout.
