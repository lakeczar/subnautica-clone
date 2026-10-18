# Find the design for an integrated ocean-world adventure

Current owner continuation: after OPUS-DESIGN-R2, obtain detailed implementation advice from that same Opus thread, implement with Sol6.1/max under Astra/xhigh, and continue to the complete game. Thorough Opus5.5/high reviews are required after current polish, M2, M3 and M4, with detailed fix advice and Sol correction loops. Avoid excessive menu subtitles/subheadings/helper copy. See [live status](../../docs/build/STATUS.md) and [standing protocol](../../docs/build/tasks/OPUS-STAGE-REVIEWS.md); these supersede historical pause/planning-only wording.

Label: wayfinder:map
Status: resolved

Construction was explicitly invoked on 2026-10-17: "Read .scratch/siltwake/BUILD_HANDOFF.md and start the revised Siltwake build prompt." The planning destination is complete. The notes below preserve the design interview; current execution state lives in [build status](../../docs/build/STATUS.md).

## Destination

A coherent, user-reviewed game specification and complete Astra build input for an original ocean/island survival-exploration adventure targeting approximately ten hours, with deeply connected geography, resources, ecology, vehicle construction and mystery. The completed rendered art comparison informs the selected visual baseline before construction is submitted.

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
- The user answered the integrated questionnaire. Duration, building emphasis, visual direction, mystery, fleet/survival/encounter preferences and hardware target are resolved below. The owner delegates the hidden truth and protagonist reveal to the narrative team; preserve their chance to discover it by keeping major spoilers in a labelled appendix.

## Decisions so far

- [Define the campaign target and building emphasis](issues/01-campaign-and-building.md): approximately ten hours for the main story plus optional exploration; vehicle-focused building with modest fixed outposts and increasingly customizable mobile homes.
- [Compare two feasible visual directions](issues/02-art-comparison.md): richer cel-shading selected after the refined comparison, with asset designs iterated during the future build.
- [Connect the arrival story and discovered history](issues/03-mystery-and-discovery.md): ambiguous early evidence, a surprising personal reveal authored by the narrative team, and regional leads for independent discovery.
- [Connect resource geography to the vehicle fleet](issues/04-geography-and-fleet.md): broad specialist fleet and deployable carrier, food without thirst, evasion/deterrence and recoverable losses; authored region/resource/capability contracts are ready for final review.
- [Choose delivery and required feasibility gates](issues/05-delivery-feasibility.md): dedicated-GPU desktop browser using TypeScript/Babylon.js; early construction gates must prove gameplay, interiors, persistence and performance.
- [Review the complete long-running build input](issues/06-final-build-input.md): owner explicitly invoked construction on 2026-10-17; current execution state is in the build records.

## Not yet specified

No additional owner-preference question blocks the review input. Recipe quantities/source yields, exact encounter timing, route dimensions, asset production details and performance tuning are assigned to explicit implementation gates in the specification. Their validation is future work, not a completed planning experiment.

## Final input awaiting owner review

Resolved by the owner's explicit build invocation on 2026-10-17; see [Review the complete long-running build input](issues/06-final-build-input.md). The following text records the earlier review boundary.

[Review the complete long-running build input](issues/06-final-build-input.md) links the full prompt and its integrated specification. The old short-game prompt remains superseded. User review and a later explicit build instruction are still required by the user's chosen scope; the current run does not submit construction.

The owner additionally requires Astra at `xhigh` and Sol 6.1 at `max` to review completed/delegated work along the way. The [Independent review gate](../../docs/DELIVERY_AND_ACCEPTANCE.md#independent-review-gate) defines separate non-author reviewers, coordinator self-review, correction rounds and integrated milestone acceptance. The coordinator runs Astra at `xhigh`.

The latest owner instruction selects **Sol 6.1 max as the main builder**, with Astra setting direction. This supersedes earlier Astra implementation-worker assignments; original graphics remain Sol max. The Sol reviewer must be a separate non-author agent. After compaction or a restart, read the [build handoff](BUILD_HANDOFF.md) before assigning work.

## Out of scope

- Executing the earlier build prompt, starting the full game, merging to main or publicly deploying during this design interview.
- Building two separate ten-hour games merely to compare art styles.
- Treating research, a visual prototype, a developer-speed run or repeated harvesting as proof of ten hours of enjoyable play.

## Art study

[Compare two feasible visual directions](issues/02-art-comparison.md) holds the owner's resolved choice and the completed original-graphics study from three GPT-6.1 Sol workers at max reasoning, coordinated by Astra. The full game input will preserve this graphics delegation preference. Source/evidence stay on the throwaway art branch; this map remains the planning index.
