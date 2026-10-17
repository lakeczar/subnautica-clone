# M1 completion batches — independent review round 2

Review the same frozen candidate supplied in your delegation. Combined production is **`47d8872942e95120241af014e667084c75a54e39`**; later candidate commits contain only records/this brief. **Diff base: accepted M0 `a2cb19f1d4cd2d795b82642a2bd357f681d1c293`.** Inspect the whole M1 delta, not only the latest corrections.

The full original scope and acceptance criteria in [M1-BATCH-REVIEW-R1](M1-BATCH-REVIEW-R1.md) remain part of this brief. Its “no prior independent round,” original candidate/build and R1 report-path statements are historical and superseded by this document. Read both original reports, [Astra](../reviews/M1-BATCH-R1-ASTRA.md) and [Sol](../reviews/M1-BATCH-R1-SOL.md), plus [all dispositions](../reviews/M1-BATCH-R1.md). Prior findings are inputs to this new independent round; do not read your current R2 peer's findings before returning your initial verdict.

Return separate explicit **ACCEPT** or **CHANGES REQUIRED** verdicts for both:

1. **M1 core/physical-feasibility** — all delivered gameplay, registry/economy, shared physics/carrier, survival/recovery, state/save/migration and runtime integration.
2. **M1 first-expedition presentation** — richer-cel environments/assets/optics/camera, early narrative/notebook/UI, controls/focus/feedback and audio, including gameplay interactions.

Both reviewers cover both full batches. This is batch acceptance only. Accepted game/siltwake remains M0; a separate integrated M1 run and fresh paired review follows batch acceptance. M2–M4 and the later dedicated design critic remain separate.

## Assignment and independence

| Reviewer | Sole repository output | Temporary evidence | Browser port |
| --- | --- | --- | --- |
| Fresh non-author Astra `gpt-6-astra`, explicit `xhigh` | `docs/build/reviews/M1-BATCH-R2-ASTRA.md` | `/tmp/siltwake-m1-batch-r2-astra/` | 5195, check free first |
| Fresh non-author Sol `gpt-6.1-sol`, explicit `max` | `docs/build/reviews/M1-BATCH-R2-SOL.md` | `/tmp/siltwake-m1-batch-r2-sol/` | 5196, check free first |

Astra emphasizes cross-system behavior, dependencies and readability; Sol emphasizes implementation, invariants and evidence consistency. These are emphases, not scope divisions. Start clean at the exact frozen candidate and verify the base. Report actual model/effort. Only author and commit the assigned report; no production/test/config/spec edits, children/delegation, peer polling, push/PR/merge or parent mutation. Original evidence is immutable: copy inputs/scripts and redirect outputs and module imports before executing analyzers. Close only owned resources and return a bounded terminal handoff, without waiting on the peer.

Read AGENTS/STATUS first, PLAN/CONTRACTS, revised build input and applicable linked specifications, M1-01/COORDINATION/PARALLEL and the complete original R1 brief. EXPEDITION_INTEGRATION owns dependencies; DELIVERY_AND_ACCEPTANCE owns the gate. Keep major story spoilers outside ordinary reports/summaries, using a labelled temporary appendix only if needed. Research does not alter owner scope.

## Prior findings, responses and correction evidence

Both original reviewers required changes on `ac5988c1472da8f8f81b097ed235f33f48c62c7d`. Root accepted every distinct finding; none was declined or waived.

| Initial finding | Response and assembled correction | Required review attention |
| --- | --- | --- |
| SOL-M1-01 / M1-ASTRA-R1-02, P2: reachable distraction creates an out-of-world target and blocks Save/Export/autosave | Source `b2014592512786920b2bcfdb8f28ed90145aebea`: shorten the 16 m ray against shared WORLD_BOUNDS; clamp numeric overshoot; atomically refuse zero usable outward length | Valid targets at all edges; immediate save and expiry; unchanged interior direction/lifetime/repeat refusal; no validator relaxation or irrelevant threat reset |
| SOL-M1-02 / M1-ASTRA-R1-03, P2: stale cache art survives New/import/null | Same source: dispose and delete absent cache IDs, including null; retain/reuse current caches and scene-owned materials | Actual factory/session lifecycle, reused IDs/empty caches, material/disposal ownership; diagnostic-camera images are not earned travel |
| M1-ASTRA-R1-01, P1: occupied tow separates pilot/hull poses and occupied salvage leaves dangling ownership | Source `d99aa649eec097370a6b38b107f5ec358c8d1945`: atomically refuse occupied tow/salvage, cancel valid legacy occupied operations before movement/ready return, explain Hold availability; paid repair and survival unchanged | Immediate and moving-step persistence, old approach/ready/tow snapshots, no forced/unsafe exit or free service, normal drains, paid repair/reserve, unoccupied tow/salvage conservation, UI/focus and strict invalid-import rejection |

Read [boundary/cache author evidence](../evidence/M1-BATCH-R1-SOL-FIX.md), [root inspection](../evidence/M1-BATCH-R1-SOL-FIX-INTEGRATION.md), [occupied-recovery author evidence](../evidence/M1-BATCH-R1-OCCUPANCY-FIX.md), and [combined root inspection](../evidence/M1-BATCH-R1-OCCUPANCY-INTEGRATION.md). Root reconciles `recoveryOccupancyRefusal(s, vehicleId): string | null` and `RECOVERY_NOTICES.occupied` in CONTRACTS. No saved fields/schema, public commands, geometry or existing signature change. The occupancy report has one unit typo: the legacy emergencyAir value 113.816666666667 is **seconds**, not percent.

The full earlier evidence map from R1 still applies: M1/A0 assembly, focus/transfer, render/glass/cockpit, tow corrections, fresh combined expedition, repeated-loss recovery, seeded carrier and CR1 saturation/guidance. They remain in scope. Preserve each source attribution rather than relabelling old full routes as new correction runs.

## Combined checks and retained evidence

Root combined `npm run check` on `47d8872`: **153/153 tests, strict typecheck and build pass**; unchanged economy spend 16 alloy / 11 glass / 13 membrane, 56 raw CU. This is coordinator evidence, not your independent verdict.

- JS `index-quvrvcD6.js`, SHA256 `0ab8a47a1a93f03f122a648fdda7c10834a03e27b2575b52489b60fd464a4122`.
- CSS `index-DONjl4IF.css`, SHA256 `14756146fd5523913bc59b8079703e86ae867d0250079c88ed57e6198ab0a797`.
- Boundary/cache archive `/tmp/siltwake-m1-batch-r1-sol-fix/artifacts.tar.gz`, SHA256 `a3e125b45dedb2d50f097772b18b7c60b4d6414788711078221b27ccc9457ee6`; 76 payloads / 77 files / 13 source snapshots under `source/final/`.
- Occupancy archive `/tmp/siltwake-m1-batch-r1-occupancy-fix/occupancy-fix-artifacts.tar.gz`, SHA256 `19c21627446d9fcf0d9710bb6a66bad2a726ddf36a9f093711297cc6d18a9040`; 151 payloads / 152 files / 56 source snapshots under `source/`.
- Root combined artifacts `/tmp/siltwake-m1-batch-r1-occupancy-root/`: 7 exact complete actual-export comparisons, 1237 swept/saveable earned-checkpoint tow steps, 1378 codec round trips, single legacy cancellation, actual retained author media inspection. Combined boundary/cache command/factory/browser-state comparison harnesses also pass. Original east-edge correction evidence remains at the previous root source; no new east route is claimed.

The occupancy replay has conditional comparisons when browser files are absent: copy all inputs and assert the expected seven comparisons rather than silently accepting a partial run. Its script imports current-cwd `.test-build/src` and has a hardcoded output directory; redirect it before running. Other analyzers may also hardcode checkout paths. Do not overwrite originals or accidentally test another worktree's compiled modules.

## Unresolved evidence limits

No prior substantive objection is dismissed; all three fixes are provisional until this round evaluates them. No additional missing-proof blocker was asserted in the original Astra review. Sol's ordinary depleted-power runtime line stays open for **integrated M1**; zero-power diagnostics and consumption tests do not satisfy it.

The original R1 limits remain: targeted correction replays do not replace/relabel the earlier full preparation/repeated-loss/carrier runs; one excluded walking reconstruction is non-exact; ordinary geometric blocked-build isolation was preempted by an existing-hull guard; thin throat blockers use labelled diagnostics. Seeded carrier feasibility is not campaign acquisition or registered mobile-refuge fallback. Do not invent a solid-placement tool or demand M2–M4 completion as an M1 condition. Judge whether a specific remaining gap blocks these bounded batches and explain that judgment.

SwiftShader/muted-host evidence proves no consumer-GPU performance/audible mix or human learning/enjoyment/ten-hour duration. The large bundle warning and previously disclosed low development dependency advisory remain. Full campaign/fleet, designated mobile refuge and advanced deep recovery remain M2–M4 obligations. No release or deployment claim.

## Method, browser isolation and return

Inspect the full source delta, specification and actual artifacts; choose focused fresh executable/production checks for the risks you identify. A fresh independent check/build is useful; do not repeat unchanged broad browser matrices without a reason. Runtime claims require executable or actual rendered evidence. Distinguish new reviewer play, unchanged earned-checkpoint replay, inspected author play and seeded diagnostics.

Before opening/driving any browser or preview, read `/work/repos/fleet/BROWSER_RULES.md` when available and `docs/BROWSER_RULES.md`. Prefer APIs/retained artifacts when adequate. Otherwise verify the actual browser process is on factory-worker or isolated Linux; use T3 preview_status then preview_open with a task-owned incognito tab/storage and your checked-free port. Never automate the owner's Windows desktop or use real desktop pointer capture. Preserve historical tab14, human/peer tabs and shared hosts. Keep scripts/recordings bounded, release keys/controllers, close only owned tabs normally through T3 and stop only your server normally; no process-name kills. Report rendering/audio context and resource closure.

Return candidate/base/spec/model/effort, checked scopes and methods, stable findings with severity/exact source or artifact/reproduction/player consequence/recommendation, explicit disposition of each prior finding and unresolved proof limit, and a separate verdict for each named batch. Distinguish observed defect, missing required proof and nonblocking later polish. Include evidence paths/hashes and owned-resource closure. Commit only your assigned report. Root reconciles independent verdicts and starts another fresh paired round if justified corrections remain.
