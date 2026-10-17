# M1 coordination revision

Date: 2026-10-17. Owner asked whether M1 should be split and whether an Astra subagent could help coordinate its complexity. This revises work ownership and sequencing, **not the M1 exit or full game scope**. The original [M1-01 assignment](M1-01.md) remains the acceptance checklist.

## Transition request (historical)

The main builder has a provisional committed checkpoint at `5fd633879d7c8e059c7ff5cb6a6200895e1f7d93`, following `df1a6bc` and `9c537a7`, in `/home/worker/.t3/worktrees/subnautica-clone/t3-8054529a`. Its latest message reports 97 tests passing and ongoing ordinary-input verification. Those are author reports, not coordinator or independent acceptance. This source has not been integrated into the accepted game branch.

Root sent an in-flight steering message to the existing implementation task, stable request `siltwake-m1-decompose-checkpoint-20261017`, successfully delivered as **steered**. It asks Sol to finish its current bounded check, commit coherent fixes, produce `/tmp/siltwake-m1-builder-handoff.md` plus assigned evidence as appropriate, identify remaining M1 work and clean owned resources before returning. Broad art/content polish should not expand further during this handoff. No cancellation or loss of current work is intended. The old owner retains its paths until its explicit handoff/termination; no mutating specialist may overlap it.

A separate Astra xhigh technical lead is running (exact task ID in [TASKS](../TASKS.md#completed-m1-coordination-advice)) to inspect the immutable checkpoint and propose practical module boundaries, remaining-work assignments, dependencies and integration checks. It is a bounded advisory role, not an additional dispatcher or acceptance reviewer. Root remains accountable for scope, shared contracts, task dispatch, integration and PRs. Advice and author-reported progress do not close M1 criteria.

## Intended team after the handoff

Respect four simultaneous agents including root. Rotate the advisory lead out before filling all implementation slots. Initial intended roles, subject to the actual checkpoint audit:

| Role | Model/effort | Responsibility |
| --- | --- | --- |
| Root coordinator | Astra xhigh | Whole-game direction, contracts, ownership, integration and acceptance |
| Main builder / integration owner | Sol 6.1 max | Simulation, inventory/economy, save/migration, runtime composition and required shared-seam changes |
| Visual specialist | Sol 6.1 max | Original richer-cel environment, resources, pod/Dart/interior assets and scene readability within agreed dimensions |
| Presentation/content specialist | Sol 6.1 max | Early story/scans, notebook/HUD/interaction clarity and audio within frozen data/event interfaces |

Carrier/collision/recovery can become a separate bounded specialist assignment by rotating a slot when its dependencies are ready; do not let two owners edit the same shared types/world/save module. The Astra technical lead may return for a focused integration/design question, but does not remain idle consuming a builder slot.

Exact files are assigned **after** the audit/handoff. In particular, `src/content/registry.ts`, `src/sim/types.ts`, world geometry and runtime composition need one owner. If existing content/render code lacks a safe seam, the main Sol builder first makes the smallest necessary extraction and commits it. Do not create speculative parallel registries or give artists incompatible physical dimensions.

## Integration and evidence

1. Inspect the final source/evidence handoff and Astra proposal. Record complete, failed and unexecuted checks separately; reconcile them against M1-01.
2. Stage the preserved implementation on a provisional feature branch, inspect/build it and reconcile its contracts. This is assembly work permitted before acceptance, not a merge into accepted `game/siltwake`.
3. Commit the shared provisional baseline before dependent T3 worktrees. Dispatch only concrete non-overlapping assignments, each with exact source/API contracts, dependencies, acceptance and artifact requirements. Main Sol integrates composition changes; root performs Git integration and conflict decisions.
4. Verify the combined first-expedition route and carrier feasibility. A collection of completed asset folders does not establish M1. Use actual normal inputs for the expedition and label seeded fixtures/diagnostics separately.
5. Apply fresh **non-author Astra xhigh and separate Sol max** reviews to completed related batches and integrated M1. The advisory Astra cannot count as an independent reviewer of its own design contribution. Keep the full campaign, source geography, six fleet roles, recovery and human/GPU evidence obligations intact.

Before any delegated browser work, require reading `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md`; verify isolated Linux ownership, prefer T3 preview, use isolated task storage and preserve shared/human tabs. Close only owned resources. Advisory work should use immutable source and existing artifacts when they suffice.


## Handoff received

The main Sol task completed on 2026-10-17 with unchanged source `5fd6338` and evidence-only commit `ff92868`; worktree clean. Its 97 passing tests/build/economy checks are author evidence. Full final-source ordinary expedition, gameplay/repeated recovery, browser carrier feasibility and final visual/audio/edge checks are still open. Handoff `/tmp/siltwake-m1-builder-handoff.md` and archive `/tmp/siltwake-m1-handoff-artifacts.tar.gz` preserve details. Specialist paths in that handoff are explicitly released; main Sol retains shared simulation/save/registry/world/runtime composition for its next bounded assignment. Owned browser/server closed, no children. Await the Astra advice before assigning exact mutating paths.


## Audit reconciled; A0 next

The Astra task completed; [full report](../evidence/M1-COORDINATION-ASTRA.md) is preserved. Root accepted its sequencing advice, not a game acceptance verdict: A0 fixes immediate command/save coherence and freezes physical/audio seams before A/B/C. Root independently reproduced both R1 failures and ran fresh checks on staged source (97 tests/build/economy pass). [M1-A0](M1-A0.md) is the concrete bounded next assignment. Existing interfaces support the split; no broad extraction is authorized. Source/history is preserved on `feat/siltwake-first-expedition`, outside accepted `game/siltwake`. The advisor created no children or browser resources.
