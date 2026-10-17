# Working in this repository

This repository currently contains a game build brief and research, not a playable game. For an implementation task, read `prompts/BUILD_GAME.md` first. It owns the game scope, coordinator workflow, and release criteria. Research reports explain choices; they do not silently expand the required scope.

The coordinator owns shared interfaces, dependencies, integration, and the project state. Workers edit only the paths assigned in their task. Commit a shared baseline before creating implementation worktrees. Keep unfinished changes on feature branches and use pull requests for review.

## Browser usage

Before opening, driving, or launching a browser, including previews, screenshots, HTML previews, and browser tests, read and follow `/work/repos/fleet/BROWSER_RULES.md` when available and `docs/BROWSER_RULES.md`. Include these rules in delegated browser work. The repository copy provides the same isolation requirements for environments without the fleet checkout.
