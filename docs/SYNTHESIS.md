# Consolidated build brief

Prepared 2026-10-17 from three GPT-6.1 Sol research reports. The requested deliverable for this run is the build prompt and public planning repository; construction is reserved for the next run.

## Decision

Build **Siltwake**, an original compact survival-exploration campaign beneath alien ice. The player restores an observatory's two acoustic/oxygen relays, extends the safe exploration network, and completes a migration-current finale. Use **TypeScript + Vite + Babylon.js** in a desktop browser. One **GPT-6 Astra coordinator** owns the whole game and integrates work from at most **three Astra workers**.

The implementation contract is [the complete build prompt](../prompts/BUILD_GAME.md). These notes explain the decisions; they do not add hidden requirements.

## What each researcher contributed

| Researcher | Main conclusion | Consolidated choice |
| --- | --- | --- |
| Platform | An integrated browser engine reduces the collision/audio/rendering glue the team must own; both Three.js and Godot remain valid alternatives | Babylon.js with WebGL 2, strict TS, custom swimming, simple collision geometry, renderer-independent rules, static delivery |
| Game design | Preparation should expand reach, discovery should motivate upgrades, and infrastructure should change route planning | Under-ice observatory; three authored regions, two refuges, a complete objective chain and ecological ending |
| Orchestration | Independent subsystem success is insufficient; committed interfaces and early integrated play are essential | Coordinator-owned contracts, exclusive paths, committed worktree baseline, four playable milestone gates and final ordinary-input evidence |

## Why this platform

**Babylon.js** supplies scene, collision, picking, rendering, audio and other engine facilities in the same language as the game rules and browser UI. That reduces integration burden for this particular project. It does not establish that Babylon is universally faster or more capable than Three.js. **Three.js** is attractive with a proven existing foundation; this repository has none. **Godot/GDScript** is a good native or editor-driven choice, but adds toolchain/export work before this browser target is proven. Current engine/export claims and source links are in [platform research](research/01-platform.md).

The final prompt fixes the stack rather than inviting every worker to choose an engine. It calls for meaningful tests and real-input browser verification; the planning run did not install an engine, create a game scaffold, measure graphics performance, or run gameplay.

## Why this scope is more than a scene demo

The chain is **explore → gather → improve equipment → reach farther → restore a refuge → overcome an ecological hazard → complete the expedition**. Each major system changes another system. A repaired relay is a new return route; a range upgrade makes a previously unsafe trip practical; observing a predator gives the player a useful choice. The ending tests the equipment and route knowledge acquired along the way.

The base release includes three regions, six fauna types, six resources, at least six useful recipes, four functional equipment improvements, two relay repairs, and three optional discoveries. Death, recoverable progression, save/resume, onboarding, sound, navigation, and an ending are part of the floor. Vehicles and full base building remain stretch work after the entire campaign passes verification.

The game-design researcher proposed eight recipes, six named landmarks, six short records, exact provisional oxygen timings, and a 30–40 minute target. The final prompt keeps six useful recipes as the floor, allows the coordinator to compose landmarks and short records, and uses a 30–45 minute first-play target. This reduces content bookkeeping and leaves balance to measured traversal without removing a required system. It also omits a preliminary seal-kit repair so basic survival services are immediately dependable. The final prompt's counts and rules take precedence over exploratory report suggestions.

The observatory setting makes a ceiling, bounded map, modular architecture, fixed refuges, and a finite expedition natural. The proposed visual identity uses ice, sediment, warm machinery and restrained biological light; it does not need an enormous ocean, a copied crash narrative, or recognizable franchise assets. Other researched settings were floating gas-giant gardens and flooded reservoir-city gardens. They offer distinct moods but bring additional flight-teaching or architectural-collision costs.

## How the coordinator keeps the whole plan

The coordinator writes and owns the shared contracts before parallel implementation and retains build/dependency/integration authority. Workers receive the complete relevant brief, exact committed baseline, exclusive paths, dependency contracts, acceptance steps and a required result format. Worktrees isolate branches; they do not solve conflicting interfaces or integrate code automatically.

Four gates keep work convergent: a controllable expedition, a complete rough campaign, a coherent world/content pass, then polish and verified release. A small durable state ledger records decisions, branch/task IDs, defects and next actions across context changes. A separate acceptance ledger records evidence. A worker reporting success never replaces the coordinator's integrated check.

Implementation PRs target a feature integration branch; a final PR targets `main`. This lets the team integrate continuously without requiring the owner to merge every internal dependency. The owner retains final main merge and public deployment. [Orchestration research](research/03-orchestration.md) records live tool observations and Git/GitHub sources; availability must be checked in the execution session.

## How the references are used

- **Subnautica:** first-party product copy establishes the advertised survival, crafting, exploration, habitat and mystery relationships. Those relationships guide the original design; its content is not being copied.
- **Call of Duty Zombies:** the inspected official page establishes round-based hordes and maps. The alternative prompt uses an original wave-survival economy and finite extraction goal; exact franchise economy details were not verified.
- **Fishslop:** multiple public projects were found. One README attributes inspiration to Theo Browne's benchmark, but that does not identify the user's exact reference or validate model scores. The alternative is explicitly a proposed aquarium-economy brief, not the canonical fishslop prompt.

See [game-design research](research/02-game-design.md) for source links and investigation limits, and [the genre variants](../prompts/GENRE_VARIANTS.md) for usable alternate briefs.

## Success and remaining uncertainty

An ordinary-input campaign completion is the main completion check. Save/recovery, actual rendered interaction, cohesive audiovisual presentation, production-build delivery and declared-machine performance complement it. Screenshots, a simulation-only victory, and compilation are evidence of narrower facts.

The prompt cannot guarantee creativity, fun, uninterrupted runtime, a hardware target, or delivery within an unstated budget. It makes those limitations visible and gives the coordinator a concrete loop for finding and fixing shortcomings. Independent first-player feedback and representative GPU testing may remain external validation needs. No capability-test score is justified until the actual game is built and observed.
