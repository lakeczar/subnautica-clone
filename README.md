# Siltwake

An original alien-ocean adventure being designed around discovery, a recoverable mystery, and a fleet of increasingly capable submersibles. **Siltwake is a working title.**

**Status: complete build input and integrated design package ready for owner review. Full game construction is reserved for the next run.**

[Read the complete build input](prompts/BUILD_GAME_REVISED.md). Its main text preserves the story surprise; the implementation team has an explicitly labelled spoiler appendix. This is a planning package, not a playable game.

## Agreed direction

- Approximately ten hours for a first main-story playthrough, with optional exploration beyond it. Repeated harvesting and travel must not pad the duration.
- Open ocean, explorable islands, and research settlements from small outposts to larger ruins. Biomes, resources, ecology, blueprints and story discoveries must form one coherent world.
- Wonder comes first, with tense depths and comforting refuges.
- The player wakes in a damaged pod with missing memories. Scans, personal journals and physical evidence gradually reveal what happened.
- The narrative team authors a surprising central truth and personal reveal. Early lore supports competing interpretations; regional leads point toward biomes and landmarks for the player to investigate. Major spoilers stay in a clearly labelled writer appendix, separate from the review summary.
- The starting pod provides storage, crafting and healing. Construction focuses on distinct scouts, utility craft and increasingly customizable mobile homes, supported by modest fixed outposts.
- The fleet should be broad and purposeful, including a large inhabited carrier that stores and deploys smaller craft. Classic survival includes food but no thirst meter. Failed expeditions preserve knowledge and lead to recoverable cargo or vessel repair/salvage.
- Dangerous wildlife rewards observation, stealth and deterrence. Hunting is not the main progression loop.
- Richer cel-shading is the selected visual direction, with vibrant atmosphere, detailed environments and precise mechanical assets. Iterate designs in playable scenes during the future build.
- Astra coordinates the complete future game and its integration; GPT-6.1 Sol at **max** reasoning creates original graphics under shared art direction.

The duration is a design target, not a measured result. The game has not been built or playtested. The selected delivery plan is TypeScript/Vite/Babylon.js in a desktop browser, targeting a gaming PC or laptop with a dedicated GPU. The small art viewer does not prove full-game performance.

## Follow the planning work

The [active Wayfinder map](.scratch/siltwake/map.md) is the entry point. Human decisions live in its linked tickets. The [art comparison decision](.scratch/siltwake/issues/02-art-comparison.md) links the separate throwaway source and evidence as they become available.

[Planning PR](https://github.com/lakeczar/subnautica-clone/pull/1) · [public repository](https://github.com/lakeczar/subnautica-clone)

```bash
gh repo clone lakeczar/subnautica-clone
cd subnautica-clone
git switch docs/astra-game-build-brief
```

The [graphics workflow](docs/GRAPHICS_PIPELINE.md) records the requested Sol max delegation and the shared contracts for future production. **Do not execute [BUILD_GAME.md](prompts/BUILD_GAME.md): it is the superseded first draft**, which described a much shorter, vehicle-free, under-ice game. The earlier [synthesis](docs/SYNTHESIS.md) is historical rationale, not the current scope.

The [story design contract](docs/STORY_DESIGN.md) is safe to review without learning the major reveal. It links a separately labelled writer appendix for agents implementing the story.

Review the [integrated expedition progression](docs/EXPEDITION_INTEGRATION.md), [world and resource geography](docs/WORLD_PROGRESSION.md), [fleet and survival](docs/FLEET_AND_SURVIVAL.md), and [delivery/acceptance gates](docs/DELIVERY_AND_ACCEPTANCE.md) for the concrete design behind the input.

The [planning review](docs/PLANNING_REVIEW.md) records agent review and distinguishes the written design from the gameplay, performance and fresh-player validation still required.

## Research

Three GPT-6.1 Sol agents independently investigated [platforms and language](docs/research/01-platform.md), [gameplay and scope](docs/research/02-game-design.md), and [agent orchestration](docs/research/03-orchestration.md). [Deeper primary-source gameplay research](.scratch/siltwake/artifacts/gameplay-research.md) examines recognizable resource geography, useful return visits, vehicle loadouts, danger/sanctuary rhythm and crafting busywork. These findings inform hypotheses; fresh-player playtests must establish whether the eventual game is fun.

[Alternative capability-test briefs](prompts/GENRE_VARIANTS.md) cover wave survival and aquarium economy. They are examples, not additional Siltwake modes.
