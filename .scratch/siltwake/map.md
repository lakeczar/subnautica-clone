# Find the design for an integrated ocean-world adventure

Label: wayfinder:map
Status: open

## Destination

A coherent, user-reviewed game specification and complete Astra build input for an original ocean/island survival-exploration adventure targeting approximately ten hours, with deeply connected geography, resources, ecology, vehicle construction and mystery. Two small rendered art prototypes inform the visual choice before construction is submitted.

## Notes

- This is planning. The user explicitly reserved construction for a later run and asked to inspect the final input before submission. The earlier thirty-to-forty-five-minute, under-ice, vehicle-free prompt is superseded.
- Use Wayfinder, grilling and domain-modeling for decisions; research for factual investigations; prototype for concrete art/interaction comparisons. Before any browser work read `/work/repos/fleet/BROWSER_RULES.md` when present and `docs/BROWSER_RULES.md`.
- Use the integrated questionnaire for user choices. Recommendations and preselected answers are not decisions. Preserve the user's answers across sessions and read this map before resuming.
- The local tracker is defined in `../../docs/agents/issue-tracker.md`; tickets are decision questions, not implementation assignments. Read only relevant ticket detail after this index.
- Starting preferences supplied by the user: discovery and curiosity lead; building and survival follow. A plot event/cutscene explains arrival, while scans and personal journals gradually reconstruct the lore. A dedicated lore agent is a possible future role.
- Setting preference: an open alien ocean with explorable islands and research settlements ranging from small to large. Discovery can yield special blueprints for upgrades, vehicles, items and resource processing.
- Building preference: a home pod supports storage, crafting and healing. Multiple vehicles serve scouting, resource utility and habitation. The most capable vessels take substantially more resources and effort to obtain; specific costs and roles remain undecided. The resolved campaign/building ticket owns the selected balance between fixed outposts and inhabited vehicles.
- The user requested two art directions to compare and expressed concern about implementation feasibility. Use comparable actual rendered scenes, not artwork presented as evidence that the engine can reproduce it.
- The resolved campaign/building ticket owns the ten-hour target's main-story/optional-content definition. It remains a player-experience target, not a measured duration or promise about build time.
- [Deeper gameplay research](artifacts/gameplay-research.md) reads primary developer writing on learnable resource geography, useful return visits, mission-specific vehicle loadouts, threat/noise tradeoffs and crafting busywork. Its example loops predate the expanded ten-hour scope; they are hypotheses, not accepted designs. Earlier source reports remain under `docs/research/`.
- The user answered the integrated questionnaire. Duration and building emphasis are resolved below. The art ticket records the selected comparison pair (voxel and cel-shaded, with vibrant atmosphere); it remains claimed pending rendered examples and the user's preference. The mystery ticket records the selected damaged-pod/missing-memories opening, with the deeper story still open.

## Decisions so far

- [Define the campaign target and building emphasis](issues/01-campaign-and-building.md): approximately ten hours for the main story plus optional exploration; vehicle-focused building with modest fixed outposts and increasingly customizable mobile homes.

## Not yet specified

- Exact biome roster, island distribution, travel distances, routes, shortcuts and resource habitats, after the campaign and vehicle structure are chosen.
- Resource quantities, processing chains, replenishment, logistics and protection against resource softlocks; enough interdependence to reward knowledge without forcing repetitive chores.
- Survival pressure, death/recovery, vehicle loss or rescue, energy and repair costs, and how earlier craft remain useful.
- The canonical lore timeline, character arcs, revelation order and how environmental evidence and blueprints connect to it. Scope and presentation of the opening cutscene.
- Meaningful ecological interactions, discovery rewards, hazard readability and the rhythm of danger and sanctuary.
- Target hardware, asset-production methods, world streaming, vessel interiors, island movement and final browser/native delivery if technical evidence changes the earlier recommendation.
- Chapter-sized implementation milestones, long-session state/handoffs, lore-agent ownership, end-to-end playtest protocol and credible evidence for the duration target.

## Out of scope

- Executing the earlier build prompt, starting the full game, merging to main or publicly deploying during this design interview.
- Building two separate ten-hour games merely to compare art styles.
- Treating research, a visual prototype, a developer-speed run or repeated harvesting as proof of ten hours of enjoyable play.

## Active art delegation

[Compare two feasible visual directions](issues/02-art-comparison.md) owns the original-graphics prototype: three GPT-6.1 Sol workers at max reasoning, coordinated by Astra. The full game input will preserve this graphics delegation preference. Source/evidence stay on the throwaway art branch; this map remains the planning index.
