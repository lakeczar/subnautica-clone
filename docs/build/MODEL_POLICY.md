# Model policy — owner revision, 2026-10-19

The owner replaces the earlier Sol-builder/Astra-plus-Sol review arrangement with **Claude Opus 5.5 at high for implementation** and **GPT-6.1 Sol at xhigh for independent review**. This policy supersedes conflicting model assignments, routine paired-review requirements and narrow implementation-authority rules in older prompts, task briefs and historical records. Historical reviews retain their actual model/source attribution.

## Roles

- **Builder: `claude-opus-5-5`, `effort: high`.** Default for gameplay, engineering, world/lore implementation, original graphics, UI/audio, integration fixes and meaningful tests.
- **Reviewer: `gpt-6.1-sol`, `reasoningEffort: xhigh`.** One fresh non-author reviewer assesses each completed feature/batch and integrated milestone, alongside coordinator inspection. Routine Astra reviewer dispatches stop.
- **Coordinator:** retains whole-game direction, dependencies, integration and durable state. The current Astra/xhigh coordinator does not add automatic Astra review subagents.
- **Additional design reviews:** retain the previously requested fresh non-author Opus/high stage-exit experience audits. The post-M3 dedicated design critique uses a fresh Sol6.1/xhigh reviewer under the revised reviewer choice. An author never independently accepts its own work.

Verify requested models/efforts against the live catalog and record effective settings. Use committed baselines and isolated worktrees; only root dispatches within the live concurrency limit. An unavailable requested model is a reported limitation, not grounds for silent substitution.

## Builder discretion

Give Opus the intended player experience, current source, relevant specification, known defects and a coherent delivery boundary. Opus chooses implementation details, art treatments, interaction refinements and technical approaches. It may change connected modules, interfaces and supporting tests together, documenting compatibility/migration where needed. A task with one implementation owner does not need a file-by-file approval queue. Parallel owners still need disjoint responsibilities.

Encourage useful new design directions and concrete suggestions. Implement improvements that support the established game; distinguish recommendations that materially change an owner decision or the campaign scope so root can reconcile them. Preserve the richer cel direction, purposeful exploration/progression, food without thirst, recoverable loss, concise menus and the full campaign goal. Keep changes and evidence reviewable without prescribing every algorithm or demanding repetitive artifact bookkeeping.

## Review and continuation

Follow [the independent review gate](../DELIVERY_AND_ACCEPTANCE.md#independent-review-gate) with the single Sol6.1/xhigh reviewer. Review complete player behavior and integration risks, including visuals and ordinary play where relevant. Fix substantiated findings with Opus; send the revised frozen candidate, original scope, prior findings/dispositions and affected evidence to a fresh Sol review round. No automatic Astra tie-breaker or duplicate review pair.

Validation stays proportional: meaningful checks and source-attributed playable evidence, with unresolved failures and unavailable human/hardware evidence stated honestly. A model change does not turn incomplete evidence into a pass or waive a gameplay requirement. Resume the authorized full-game build under this policy; no repeated owner permission is needed for routine work.
