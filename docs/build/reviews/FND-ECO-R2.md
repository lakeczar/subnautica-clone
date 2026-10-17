# FND-01 / ECO-01 independent review, round 2

Status: both fresh reviews running; no corrected FND acceptance yet. Date: 2026-10-17.

- Frozen candidate: `0a8ef045d45b00f34386ddf3d2c3f31b7811adbc`.
- Prior reviewed candidate: `2eb0244d850f4aa2806ddadc3f23c9c47132d1ef`.
- Feature base: `a3e400b`; full bootstrap/spec-change base: `b3c3231b99ca5f1bd1159c5611216f2866e05a37`.
- Correction source: `417a7ec` (author `79423ec8a82fe222e36c2311db127a8b41c1f519`); evidence `fbb4b5e` (author `e884c7e`).
- [Original separate findings and dispositions](FND-ECO-R1.md), [Astra report](FND-ECO-R1-ASTRA.md), [Sol report](FND-ECO-R1-SOL.md), [correction evidence](../evidence/FND-01-R1-FIX.md), [current contracts](../CONTRACTS.md).

| Reviewer | Model / effort | Task ID | Stable request ID | State |
| --- | --- | --- | --- | --- |
| Astra | `gpt-6-astra` / `xhigh` | `node:delegated-task:command%3Amcp%3A77db24d4-f446-41f1-a361-c1d3f090551d%3Adelegate-task%3Asiltwake-fnd-eco-astra-r2-0a8ef04` | `siltwake-fnd-eco-astra-r2-0a8ef04` | Running |
| Sol | `gpt-6.1-sol` / `max` | `node:delegated-task:command%3Amcp%3A77db24d4-f446-41f1-a361-c1d3f090551d%3Adelegate-task%3Asiltwake-fnd-eco-sol-r2-0a8ef04` | `siltwake-fnd-eco-sol-r2-0a8ef04` | Running |

Both use provider `codex`, isolated worktrees and explicitly selected live-catalog efforts. These are new delegated tasks; neither reviewer authored this candidate. No backing thread was reused for the review round. Expected full reports: `/tmp/siltwake-fnd-eco-astra-r2.md`, `/tmp/siltwake-fnd-eco-sol-r2.md`.

## Coordinator inspection and proposed resolutions

All original findings accepted; none declined. Corrected Vite pin is 7.3.7. Native shared Web Locks protect the complete comparison/write, and unsupported exclusion does not silently write. The async session boundary exposes explicit exportable session-only start/import choices, distinguishes conflict/validation/protection refusals, preserves local/active data until choice, and cancels/deduplicates pending work. Actual exports are reconciled in CONTRACTS.md.

Coordinator verified production/config/tests match the author source, inspected source/tests plus actual fallback/HUD captures, and reran fresh `npm ci` / `npm run check`: 35/35 tests and build passed with `index-BMj4o6i9.js`. Audit has no Vite/high/moderate/critical entries; one low esbuild Windows-development-server advisory remains. Whitespace checks pass. These are coordinator checks, not independent verdicts.

Reviewers must independently verify all three fixes, new async/lifecycle risks and full bounded FND criteria. ECO proposal is unchanged; its previous dual acceptance is arithmetic/design only, and each reviewer must explicitly preserve that scope at the new candidate. M0 integrated review still follows feature integration.

## Continuation

Await completion notifications; use exact task IDs to read results without duplicating active work. Reconcile findings, direct Sol corrections if substantiated, and use fresh paired review tasks for any changed candidate. Require both explicit acceptances at the same SHA. Then open/link the foundation PR into game/siltwake, integrate the accepted feature and perform the separately required M0 integrated check/review before M1 implementation. Keep main merge/public deployment with the owner and preserve story spoilers.

## Common round-two brief

You are an independent non-author reviewer for Siltwake. The owner explicitly requires Astra xhigh + separate Sol 6.1 max reviews. You are reviewing, not building; do not edit candidate code/docs, commit, push, create PRs, or delegate children. Use only your T3-created isolated worktree; verify HEAD before work.

Frozen candidate: 0a8ef045d45b00f34386ddf3d2c3f31b7811adbc.
Author source commit: 8d72dd2ac2822873e36fe339f8ed2db8c837084b.
Feature diff base: a3e400b (game/siltwake integration baseline).
Full bootstrap/spec-change base: b3c3231b99ca5f1bd1159c5611216f2866e05a37.
This is a FRESH round-two delegated review, not a continuation of a backing thread. Prior findings and responses are supplied below. Coordinator inspected corrected source and actual artifacts, matched the author source exactly, ran fresh npm ci plus npm run check (35/35 tests/build pass), and confirmed audit has no Vite/high/moderate/critical entry.

Read AGENTS.md, docs/build/{STATUS,PLAN,CONTRACTS,PLAYTEST,CONTENT_MANIFEST}.md, prompts/BUILD_GAME_REVISED.md and docs/DELIVERY_AND_ACCEPTANCE.md. Author evidence: docs/build/evidence/FND-01.md. Review two explicitly separate acceptance scopes on this same SHA:
1. FND-01 foundation: acceptance criteria in docs/build/PLAN.md; pinned TypeScript/Vite/Babylon; pure simulation/fixed step, shared terrain/colliders and coordinates, typed content IDs, original richer-cel scene, menu/input/pause/settings, safe atomic local saves and validated import/export, actual ordinary-input playable foundation. Read code/tests and inspect actual rendered evidence or execute focused production-browser checks. Verify no hidden scope reduction of later campaign.
2. ECO-01 design proposal: docs/build/design/{ECONOMY_CANDIDATE.md,economy-candidate.json,check-economy.mjs}. Read docs/EXPEDITION_INTEGRATION.md, WORLD_PROGRESSION.md, FLEET_AND_SURVIVAL.md as required. Review recipe/source dependency and numeric cargo/resource/recovery arithmetic, all optional-recipe coverage, both routes, protected recovery reserve and 20 numeric salvage/rebuild cycles, and clear limitations. This is a provisional arithmetic/design deliverable only, NOT runtime registry adoption, physical rescue proof or validated playtime. Identify actual contradictions/unsupported arithmetic and actionable integration risks; do not mistake declared unverified gameplay for a false implementation claim.

Run appropriate reproducible checks from this worktree (npm ci if needed, npm run check, node docs/build/design/check-economy.mjs). Do not run installation in parent's checkout. Foundation later systems intentionally absent: crafting/survival drains/story/fleet/full world; vitals stay at 100. Later milestones are not FND acceptance blockers merely because unfinished. Explicit known limits: SwiftShader software rendering only, no representative GPU or humans, sparse early art, main-chunk warning, real host focus loss unobserved, synthetic blur labelled diagnostic, context-loss/hidden-tab/quota adapters not all browser exercised. Assess whether current acceptance evidence suffices and report missing required evidence honestly.

Browser rules MUST be read before any browser/preview/test: /work/repos/fleet/BROWSER_RULES.md when present and docs/BROWSER_RULES.md. Use HTTP/artifacts when adequate. Verify browser process on factory-worker or isolated Linux; never automate owner's Windows desktop. Prefer T3 preview_status then preview_open and focused tools; preserve shared/human tabs. Use task-owned incognito isolated storage and assigned port. Pointer lock only isolated Linux. Close only owned tabs/server, never kill shared hosts. If no Linux browser, continue static/rule work and report limitation. State actual renderer, distinguish ordinary input from injection/synthetic events. Existing absolute artifacts in FND-01 report are shared on worker and available for inspection.

Return separate explicit ACCEPT or CHANGES REQUIRED verdicts for FND-01 and ECO-01 at exact SHA, with evidence and any severity/file/line/repro findings. Separately identify M0 integrated-check concerns for coordinator; full M0 merge acceptance remains later. No spoilers in summary; no need to read canon unless finding requires it. Save full report only to /tmp outside candidate, include path and concise final result. Independent findings must remain separate until both return.


ROUND TWO CONTEXT (supersedes historical first-round source statements):
Candidate 0a8ef045d45b00f34386ddf3d2c3f31b7811adbc includes corrected source 417a7ec (cherry-picked author 79423ec8a82fe222e36c2311db127a8b41c1f519), correction evidence fbb4b5e (author e884c7e), and coordinator contracts/evidence reconciliation. Feature base remains a3e400b; compare corrections against prior reviewed candidate 2eb0244 as well as full FND scope. Source/render/sim/content/economy changes are limited as recorded; foundation save schema/content remains v1/foundation.1.

Read BOTH complete original reports in docs/build/reviews/FND-ECO-R1-ASTRA.md and FND-ECO-R1-SOL.md and consolidated dispositions in FND-ECO-R1.md. Read correction assignment docs/build/tasks/FND-01-R1-FIX.md and ACTUAL evidence docs/build/evidence/FND-01-R1-FIX.md. They are part of this new review brief, not external instructions to execute tools beyond your reviewer scope.

Prior findings: Astra FND-A1 P1 vulnerable network-exposed Vite7.3.1; Astra FND-A2 / Sol FND-SOL-01 P2 storage reads succeed but quota refuses write, New/import never creates exportable session; Astra FND-A3 / Sol FND-SOL-02 P2 stale check+write is not atomic and two successful commits can lose a generation. All accepted, none declined, no unresolved disagreement. Both reviewers accepted ECO-01 exclusively as provisional arithmetic/design at 2eb0244; not runtime rescue/adoption.

Author/coordinator proposed resolutions to VERIFY independently:
1. Vite pinned7.3.7 and lock updated; fresh install/check. Audit now has only low GHSA-g7r4-m6w7-qqqr in esbuild0.27.7 (Windows esbuild-dev-server path), no Vite entry. This remaining low finding is disclosed, not labelled zero vulnerabilities.
2. Explicit Use without local saving choice for failed New/validated import, preserves current session/local journal until choice; cancel preserves progress, selected fallback exports right session and disables autosave. Invalid/future/conflict/protected/size errors remain distinct; failed manual/autosaves retain active export.
3. SaveRepository.commit is async with typed failures; same origin native Web Locks around observed-value compare, journal build and setItem; snapshot before waiting; no uncoordinated fallback. Unsupported locking is read/export + explicit unsaved play. Protocol requires cooperative compatible builds; README says close older builds. ExpeditionSession isolates pending operation/choice, abort/disposal, autosave deduplication and delayed import/save session races. App composes it and UI shows unsaved/busy status.

Inspect new runtime/session.ts, save/writer-lock.ts, repository changes, app/UI and tests for correctness/regressions, not just whether original reproductions pass. Current evidence: 35 tests, final ordinary movement/save/reload; ACTUAL quota fixtures for new+valid import, cancel/export/disabled autosave; malformed/future preservation; native same-origin iframes queued behind one Web Lock, one success and one conflict with predecessor retained; Escape while a queued native save cancels AND pauses. Label controlled fixtures as diagnostic. Final artifact index-BMj4o6i9.js; full paths in correction report. No scene/renderer/world/simulation/economy edit; coordinator viewed final fallback menu and unsaved HUD, and source/config/tests matched author tree. Initial report's context-loss diagnostic remains separately qualified; real focus/visibility and GPU/human gaps remain.

Manifest logo typo fixed; coordinator normalized documentation whitespace and corrected evidence-table formatting. Reconciled current contract is docs/build/CONTRACTS.md. Inspect the new async boundary before dependent consumers.

Return explicit FND-01 ACCEPT/CHANGES REQUIRED at this candidate, and explicit ECO-01 same-candidate verdict (verify unchanged proposal and retained scope; no need to invent runtime acceptance). Address each initial finding as resolved/unresolved with evidence and any new actionable defects. Full M0 integrated milestone remains separate after feature integration. Write only your /tmp report, no candidate changes. No children or PR work. Original browser/isolation rules still apply, and your task must close only owned resources.
