# Siltwake

An original alien-ocean adventure being designed around discovery, a recoverable mystery, and a fleet of increasingly capable submersibles. **Siltwake is a working title.**

**Status: design interview and original graphics studies. Full game construction is reserved for a later run, after the owner reviews the revised build input.**

## Agreed direction

- Approximately ten hours for a first main-story playthrough, with optional exploration beyond it. Repeated harvesting and travel must not pad the duration.
- Open ocean, explorable islands, and research settlements from small outposts to larger ruins. Biomes, resources, ecology, blueprints and story discoveries must form one coherent world.
- Wonder comes first, with tense depths and comforting refuges.
- The player wakes in a damaged pod with missing memories. Scans, personal journals and physical evidence gradually reveal what happened.
- The starting pod provides storage, crafting and healing. Construction focuses on distinct scouts, utility craft and increasingly customizable mobile homes, supported by modest fixed outposts.
- Compare original voxel and cel-shaded graphics, both with vibrant underwater atmosphere, before choosing an art direction.
- Astra coordinates the complete future game and its integration; GPT-6.1 Sol at **max** reasoning creates original graphics under shared art direction.

The duration is a design target, not a measured result. The game has not been built or playtested. Browser delivery with TypeScript/Babylon.js is an earlier recommendation being evaluated; the small art viewer does not prove full-game performance.

## Follow the planning work

The [active Wayfinder map](.scratch/siltwake/map.md) is the entry point. Human decisions live in its linked tickets. The [art comparison decision](.scratch/siltwake/issues/02-art-comparison.md) links the separate throwaway source and evidence as they become available.

[Planning PR](https://github.com/lakeczar/subnautica-clone/pull/1) · [public repository](https://github.com/lakeczar/subnautica-clone)

```bash
gh repo clone lakeczar/subnautica-clone
cd subnautica-clone
git switch docs/astra-game-build-brief
```

The [graphics workflow](docs/GRAPHICS_PIPELINE.md) records the requested Sol max delegation and the shared contracts for future production. The revised one-shot input will be presented in full for review before submission. **Do not execute [BUILD_GAME.md](prompts/BUILD_GAME.md): it is the superseded first draft**, which described a much shorter, vehicle-free, under-ice game. The earlier [synthesis](docs/SYNTHESIS.md) is historical rationale, not the current scope.

## Research

Three GPT-6.1 Sol agents independently investigated [platforms and language](docs/research/01-platform.md), [gameplay and scope](docs/research/02-game-design.md), and [agent orchestration](docs/research/03-orchestration.md). [Deeper primary-source gameplay research](.scratch/siltwake/artifacts/gameplay-research.md) examines recognizable resource geography, useful return visits, vehicle loadouts, danger/sanctuary rhythm and crafting busywork. These findings inform hypotheses; fresh-player playtests must establish whether the eventual game is fun.

[Alternative capability-test briefs](prompts/GENRE_VARIANTS.md) cover wave survival and aquarium economy. They are examples, not additional Siltwake modes.
