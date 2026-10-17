# Original graphics under one art direction

The owner requested **GPT-6.1 Sol at maximum reasoning** to create graphics from scratch. Preserve this in the revised build input. Astra remains the project coordinator, keeping geography, progression, lore, engineering and acceptance requirements in view. Astra gameplay workers and Sol graphics workers are complementary roles; this decision does not silently replace all future workers with Sol.

## Current study

The separate `prototype/siltwake-art-directions` branch holds an actual Babylon.js scene comparing voxel and cel-shaded constructions of the same subjects. Three Sol max workers author environment/ruins, vehicles/pod, and ecology. The coordinator owns interfaces, atmosphere, cameras, integration and evidence. The [art decision ticket](../.scratch/siltwake/issues/02-art-comparison.md) owns the human choice and source/evidence pointers. The owner now prefers voxel and has requested a finer-block treatment preserving precise asset detail, plus a richer cel comparison before selecting the final treatment.

Geometry and material source are original and deterministic. This establishes an editable source workflow and concrete visual samples. It does not establish collision quality, production rigs/LOD, complete vehicle interiors, interaction, streaming, or target-hardware performance.

## Contract for the future build prompt

- Discover the live model catalog, select `gpt-6.1-sol` and explicitly set `reasoningEffort: max`. Use native child-agent tools when they support that choice, otherwise T3 `delegate_task` with the chosen provider/model/options. Do not create ordinary top-level threads as a substitute for subagents. Record the model and effort used; disclose a missing capability rather than silently substituting.
- Batch artists within the actual concurrency limit. More agents are useful only when their work has clear ownership and can be integrated. Commit the shared baseline before creating worktrees.
- Establish a single art bible: chosen visual style, palette, world-unit scale, hull/biology language, lighting, silhouettes, camera readability and target hardware. Shared shader/material changes belong to the coordinator or one explicit owner.
- Give each asset a stable content ID, semantic role, dimensions, pivot, palette/material slots, biome or progression association, and source/provenance. Keep source generators editable. Choose export formats only when they help the production pipeline; a mesh export alone does not preserve its rig or interaction contract.
- Resource art must teach geography: host rock, plant niche, depth/current conditions and readable landmarks match the world/resource registry. A decorative mineral does not become an interactable resource without its corresponding content definition.
- Species need recognizable silhouettes, habitat and behavior cues. Scan text must describe the same species and behavior that players encounter. Lore claims come from a shared chronology/fact registry, not independent artist invention.
- Vehicles need distinct functional silhouettes, meaningful scale, visible access points and attachment locations that match their gameplay modules. The most capable craft must communicate inhabited space and utility. A beautiful exterior is not evidence of a traversable interior.
- Review assets in the actual game camera and lighting, including darkness and visual clutter. Require a functional interaction or readable cue before spending effort on tiny surface decoration. Compare paired style studies with identical subjects, cameras, lighting and animation time.
- Integrate a bounded first pass early. The coordinator inspects rendered results, gives specific corrections, and repeats only where a visible or functional problem warrants it. Do not accept disconnected asset folders as a finished art pass.
- Record source, screenshots, build/check results and limitations in the relevant PR. Follow repository browser isolation rules. Software-rendered evidence must not be presented as consumer-GPU performance.

These requirements describe the intended production workflow. The current prototype remains disposable evidence for the art decision and is not an approved foundation for the ten-hour game.
