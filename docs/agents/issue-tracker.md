# Issue tracker: local Markdown

The active Wayfinder effort uses the skill's local-Markdown fallback because no project issue-tracker configuration was present when it began. The GitHub repository and planning PR still hold published artifacts; they are not a second decision ledger.

## Wayfinding operations

- Map: `.scratch/siltwake/map.md`, labelled `wayfinder:map` in its metadata.
- Child decisions: `.scratch/siltwake/issues/NN-title.md`. Each has a title, `Parent: ../map.md`, `Type:`, `Label: wayfinder:<type>`, `Status:`, and `Assignee:`.
- Status values: `open`, `claimed`, `resolved`. `Assignee: none` means unclaimed. Claim a decision before working it; retain the human as the decision maker for grilling/prototype tickets.
- Blocking: `Blocked by: NN, NN`, or `none`. A ticket is available when all its listed blockers are resolved.
- Frontier query: read ticket metadata in numeric order and select open, unblocked, unclaimed children. Refer to tickets by their linked titles in user-facing communication.
- Resolution: append an `## Answer` with the human's decision or supported research result, mark resolved, and add a one-line linked pointer under the map's Decisions so far. Never infer an answer from silence or a preselected questionnaire option.
- Research and throwaway prototypes link their artifacts from the relevant ticket. They do not become production code by being useful in a discussion.
- The destination is a reviewed build input and implementation plan. Game construction remains a later run. Preserve this boundary when applying Wayfinder and other skills.

## Domain documents

Resolved game terminology belongs in `GLOSSARY.md`. Keep it independent of engine or implementation details. Create architectural decision records only for meaningful, difficult-to-reverse tradeoffs; none is required merely to record questionnaire answers.
