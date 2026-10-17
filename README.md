# Siltwake

An original underwater survival-exploration game brief: restore a silent observatory beneath alien ice, extend your range with oxygen relays, and cross a luminous migration to reach the ascent beacon.

**Status: research and build prompt only. The game has not been built or playtested.** This public repository is the planning and future implementation home. Its existing repository slug is `subnautica-clone`; the proposed game identity is **Siltwake**.

## Run the build next

Open [the complete one-shot build prompt](prompts/BUILD_GAME.md) and paste it into a fresh **GPT-6 Astra** coding session working in this repository. Alternatively, give that session this instruction:

> Read `AGENTS.md` and `prompts/BUILD_GAME.md`, then execute the build prompt. You are the Astra coordinator; use Astra child agents as specified. Build and verify the complete game, maintain the project state, and prepare the implementation PRs for final review.

While the planning PR is unmerged, use its branch:

```bash
gh repo clone lakeczar/subnautica-clone
cd subnautica-clone
git switch docs/astra-game-build-brief
```

After it merges, use `main`. No game installation command exists yet; the build run must create and verify it.

The prompt is self-contained and defines the creative brief, required mechanics, default stack, agent ownership, milestones, PR workflow, browser isolation rules, and release evidence. “One shot” means one initial brief with iterative execution, not a single model call or a guaranteed result. Execution time and cost have not been estimated or capped by this planning run.

## What is planned

- **Game:** a complete 30–45 minute campaign, three regions, six original fauna types, four meaningful equipment improvements, two restored oxygen refuges, and an ending.
- **Stack:** strict TypeScript, Vite, Babylon.js, WebGL 2; desktop browser, local saves, bundled assets, static production build.
- **Team:** one Astra coordinator with up to three Astra workers, clear ownership, a committed foundation, and frequent integration.
- **Quality gate:** normal-input start-to-ending playthrough, recovery/save checks, useful automated tests, cohesive art/audio, and measured performance with hardware limitations disclosed.
- **Release:** feature branches and reviewable PRs; final main merge and public deployment remain with the owner.

The browser is the selected delivery target. Vehicles, freeform bases, multiplayer, and an infinite world are outside the first release. The aim is a finished small game whose systems work together.

## Research and alternatives

Three **GPT-6.1 Sol** research agents investigated the choices independently. Their reports cite primary sources and separate observed facts from recommendations:

1. [Platform and language](docs/research/01-platform.md) — Babylon.js, Three.js, and Godot; architecture, delivery, and testing constraints.
2. [Game design and scope](docs/research/02-game-design.md) — Subnautica, round-based horde survival, fishslop candidates, and original settings.
3. [Prompt and orchestration](docs/research/03-orchestration.md) — Astra delegation, worktrees, contracts, PRs, and evidence.

[The consolidated decisions](docs/SYNTHESIS.md) explain what was selected and narrowed. [Alternative game briefs](prompts/GENRE_VARIANTS.md) give wave-survival and aquarium-economy capability tests using the same completion standard. Neither variant is an extra mode required for Siltwake.

Research reports are proposals; [BUILD_GAME.md](prompts/BUILD_GAME.md) is the authoritative implementation contract. The title is a working creative choice, not a claim of trademark availability. No benchmark scores or model-performance claims were produced.
