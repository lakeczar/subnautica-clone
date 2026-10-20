# Working in this repository

Construction was explicitly invoked on 2026-10-17. Read `docs/build/STATUS.md` (one page), `docs/build/DIRECTION.md` and `docs/build/GAME-DIRECTION.md` (owner-confirmed game design) first. They hold the current state, ownership, decisions and the lean review gate, and override conflicting older docs, including the Astra roles in the prompt. The authoritative scope is `prompts/BUILD_GAME_REVISED.md` and its specification pointers. `.scratch/siltwake/map.md` holds settled owner decisions. `docs/build/CONTRACTS.md`, `PLAN.md` and `docs/build/archive/` are historical context; read them only when you need them. `prompts/BUILD_GAME.md` is the superseded short-game draft; do not execute it.

For implementation, read the revised input and its specification pointers before assigning work. `docs/EXPEDITION_INTEGRATION.md` owns cross-system dependencies. `docs/spoilers/NARRATIVE_CANON.md` contains major story spoilers: the coordinator and lore/world integration workers need it, but ordinary owner-facing summaries and PR descriptions must not reveal the twist. Research explains choices and does not silently add or remove requirements.

For delegation, review or resuming an older task, read `docs/build/MODEL_POLICY.md`: the owner now selects **Opus 5.5 high to build** and **Sol 6.1 xhigh to review**. The coordinator retains direction and integration. Give Opus coherent outcome-based ownership and room for design suggestions and cross-module improvements; use disjoint ownership when workers run in parallel. Commit a shared baseline before creating implementation worktrees. Keep unfinished changes on feature branches and use pull requests for review.

Before accepting a feature, delegated deliverable batch or integrated milestone, follow the Independent review gate in `docs/DELIVERY_AND_ACCEPTANCE.md`: one fresh non-author **Sol 6.1 xhigh** reviewer plus coordinator inspection. The new owner policy replaces the old mandatory Astra/Sol pair; preserve historical evidence without restarting that arrangement.

## Browser usage

Before opening, driving, or launching a browser, including previews, screenshots, HTML previews, and browser tests, read and follow `/work/repos/fleet/BROWSER_RULES.md` when available and `docs/BROWSER_RULES.md`. Include these rules in delegated browser work. The repository copy provides the same isolation requirements for environments without the fleet checkout.
