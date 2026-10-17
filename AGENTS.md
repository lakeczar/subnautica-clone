# Working in this repository

This repository currently contains planning and research, not a playable game. The user has reopened the design for an approximately ten-hour ocean/island adventure with vehicle construction and a discoverable mystery. Read `.scratch/siltwake/map.md` for the active planning state and `docs/agents/issue-tracker.md` for its local Wayfinder tracker. `prompts/BUILD_GAME.md` is the superseded first draft, retained for comparison; do not execute it. The user must review the revised final input before game construction is submitted. Research reports explain choices; they do not silently add requirements.

The coordinator owns shared interfaces, dependencies, integration, and the project state. Workers edit only the paths assigned in their task. Commit a shared baseline before creating implementation worktrees. Keep unfinished changes on feature branches and use pull requests for review.

## Browser usage

Before opening, driving, or launching a browser, including previews, screenshots, HTML previews, and browser tests, read and follow `/work/repos/fleet/BROWSER_RULES.md` when available and `docs/BROWSER_RULES.md`. Include these rules in delegated browser work. The repository copy provides the same isolation requirements for environments without the fleet checkout.
