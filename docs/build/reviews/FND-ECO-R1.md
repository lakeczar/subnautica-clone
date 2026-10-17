# FND-01 / ECO-01 independent review, round 1

Status: both reviews completed. FND-01 changes required; ECO-01 accepted only as provisional arithmetic/design evidence at the frozen SHA. Date: 2026-10-17.

- Candidate: `2eb0244d850f4aa2806ddadc3f23c9c47132d1ef`.
- Foundation author: `8d72dd2ac2822873e36fe339f8ed2db8c837084b`.
- Feature base: `a3e400b`; full bootstrap/spec-change base: `b3c3231b99ca5f1bd1159c5611216f2866e05a37`.
- Coordinator: Astra xhigh; source/rendered-artifact inspection completed, `npm run check` passed (18 tests and production build), economy checker passed. These are not independent verdicts.

| Reviewer | Model / effort | Task ID | Stable request ID | State |
| --- | --- | --- | --- | --- |
| Astra | `gpt-6-astra` / `xhigh` | `node:delegated-task:command%3Amcp%3A77db24d4-f446-41f1-a361-c1d3f090551d%3Adelegate-task%3Asiltwake-fnd-eco-astra-r1-2eb0244` | `siltwake-fnd-eco-astra-r1-2eb0244` | Complete: FND changes / ECO accept |
| Sol | `gpt-6.1-sol` / `max` | `node:delegated-task:command%3Amcp%3A77db24d4-f446-41f1-a361-c1d3f090551d%3Adelegate-task%3Asiltwake-fnd-eco-sol-r1-2eb0244` | `siltwake-fnd-eco-sol-r1-2eb0244` | Complete: FND changes / ECO accept |

T3 provider `codex`; both exact effort options verified against the live catalog. Each task uses `isolation: worktree` from the candidate. Neither reviewer authored the candidate or may author corrections/delegate children.

## Scope and expected return

Both independently review FND-01 against its six acceptance criteria in [PLAN.md](../PLAN.md), and ECO-01 as a separate arithmetic/design proposal against the world/fleet/integration specification. They receive the same candidate, bases, specification and [author evidence](../evidence/FND-01.md). Astra emphasizes cross-system/player semantics; Sol emphasizes implementation/tests. Both review both full scopes.

Each returns separate explicit FND-01 and ECO-01 verdicts, severity/file/line/reproduction findings, actual checks, artifact inspections, known limits and M0 integration concerns. Expected reports are `/tmp/siltwake-fnd-eco-astra-r1.md` and `/tmp/siltwake-fnd-eco-sol-r1.md`. Full common brief is retained below for fresh correction-round delegation. No finding is shared with the other before both initial results return.

## Exact continuation

Read each task status only when needed; completion notifications wake the coordinator. A timeout is not cancellation. Reconcile both findings, assign substantiated corrections to Sol, freeze corrected SHA, repeat applicable checks, and start **fresh** paired T3 review tasks with original brief plus all findings/dispositions. Record both explicit acceptances before accepting either batch. Then open/link the feature PR into `game/siltwake`, integrate and run the separately required integrated M0 review. Do not launch dependent game implementation before the accepted runnable foundation is integrated.

## Astra result and preliminary coordinator dispositions

[Full independent report](FND-ECO-R1-ASTRA.md). Task completed with no live children and owned tab/server closed. **FND-01: CHANGES REQUIRED; ECO-01: ACCEPT**, limited to provisional arithmetic/design. Integrated M0 remains unaccepted. Sol has not received these findings and its initial review remains independent.

- FND-A1, P1: upgrade exposed Vite 7.3.1 to a patched compatible pin/lockfile. **Accepted.** Coordinator independently ran `npm audit --json`: direct Vite high-severity advisories confirmed; compatible 7.3.7 fix reported. Separate low esbuild advisory concerns its Windows dev server and is not an established exploit here. Rerun clean install/check/audit and production smoke after dependency correction.
- FND-A2, P2: read-success/write-failure prevents New Game or validated import from producing an exportable session. **Accepted.** Coordinator inspected both early returns in `src/runtime/app.ts`; reviewer demonstrated actual browser quota refusal. Correction needs an explicit unsaved-session fallback, preservation of existing progress/current session until the user's replacement choice, export availability and disabled autosave. Add app-boundary coverage, not only storage mocks.
- FND-A3, P2: compare followed by `setItem` is not an atomic cross-context transaction. **Accepted.** Coordinator reran the review's interleaved StoragePort diagnostic: both commits reported success, current tick 30 / previous tick 10, successful tick 20 lost. Preserve the single-record journal and add cross-context write serialization (e.g. Web Locks), safe unavailable-lock behavior and competing-writer coverage. This was a diagnostic model, not simultaneous browser-tab evidence.
- Nonblocking bookkeeping: production logo is `public/siltwake.svg`, not the manifest's `siltwake-mark.svg`; correct in the next documentation update.
- Carry forward ECO integration risks: persistent blueprint knowledge after fleet loss, concrete transferable module identity, bound recovery provenance, service-pallet layouts/return margins and actual carrier acquisition effort. Proposal acceptance does not settle these runtime obligations.

## Sol result and consolidated disposition

[Full independent report](FND-ECO-R1-SOL.md). Sol independently returned **FND-01: CHANGES REQUIRED; ECO-01: ACCEPT** at the same SHA, with no live children and its owned browser/server closed. FND-SOL-01 duplicates accepted FND-A2; FND-SOL-02 duplicates accepted FND-A3. Both reviewers found the same persistence problems; no finding is declined and no disagreement remains. The manifest typo is confirmed by both.

Sol additionally exercised induced WebGL loss/restoration using the browser extension: ticks stopped while lost, Resume was gated, restoration redrew without advancing simulation, and explicit resume worked. This closes one diagnostic adapter gap; it does not establish real device-loss compatibility or host focus/visibility behavior.

**ECO-01 proposal acceptance:** coordinator checker/source inspection plus both independent acceptances cover the numeric/design proposal at `2eb0244d850f4aa2806ddadc3f23c9c47132d1ef`. No runtime registry adoption, physical rescue, route/air/power margin, acquisition timing or human balance is accepted. Carry the integration risks above into future tasks.

**FND-01 correction scope:** patched Vite pin/lock; explicit exportable unsaved-session fallback for storage write refusal; cross-context write exclusion with stale comparison inside it; meaningful failure/concurrency/session-lifecycle coverage; updated evidence/contracts. [Correction assignment](../tasks/FND-01-R1-FIX.md) owns the concrete constraints. After Sol's corrections, rerun coordinator checks and return a new frozen SHA with both original reports and these dispositions to fresh Astra and Sol reviewers. M0 remains pending.

## Common round-one brief

You are an independent non-author reviewer for Siltwake. The owner explicitly requires Astra xhigh + separate Sol 6.1 max reviews. You are reviewing, not building; do not edit candidate code/docs, commit, push, create PRs, or delegate children. Use only your T3-created isolated worktree; verify HEAD before work.

Frozen candidate: 2eb0244d850f4aa2806ddadc3f23c9c47132d1ef.
Author source commit: 8d72dd2ac2822873e36fe339f8ed2db8c837084b.
Feature diff base: a3e400b (game/siltwake integration baseline).
Full bootstrap/spec-change base: b3c3231b99ca5f1bd1159c5611216f2866e05a37.
No prior independent findings; this is round 1. Coordinator already inspected source and actual rendered captures and ran npm run check (18/18 tests, build pass) and economy checker (pass).

Read AGENTS.md, docs/build/{STATUS,PLAN,CONTRACTS,PLAYTEST,CONTENT_MANIFEST}.md, prompts/BUILD_GAME_REVISED.md and docs/DELIVERY_AND_ACCEPTANCE.md. Author evidence: docs/build/evidence/FND-01.md. Review two explicitly separate acceptance scopes on this same SHA:
1. FND-01 foundation: acceptance criteria in docs/build/PLAN.md; pinned TypeScript/Vite/Babylon; pure simulation/fixed step, shared terrain/colliders and coordinates, typed content IDs, original richer-cel scene, menu/input/pause/settings, safe atomic local saves and validated import/export, actual ordinary-input playable foundation. Read code/tests and inspect actual rendered evidence or execute focused production-browser checks. Verify no hidden scope reduction of later campaign.
2. ECO-01 design proposal: docs/build/design/{ECONOMY_CANDIDATE.md,economy-candidate.json,check-economy.mjs}. Read docs/EXPEDITION_INTEGRATION.md, WORLD_PROGRESSION.md, FLEET_AND_SURVIVAL.md as required. Review recipe/source dependency and numeric cargo/resource/recovery arithmetic, all optional-recipe coverage, both routes, protected recovery reserve and 20 numeric salvage/rebuild cycles, and clear limitations. This is a provisional arithmetic/design deliverable only, NOT runtime registry adoption, physical rescue proof or validated playtime. Identify actual contradictions/unsupported arithmetic and actionable integration risks; do not mistake declared unverified gameplay for a false implementation claim.

Run appropriate reproducible checks from this worktree (npm ci if needed, npm run check, node docs/build/design/check-economy.mjs). Do not run installation in parent's checkout. Foundation later systems intentionally absent: crafting/survival drains/story/fleet/full world; vitals stay at 100. Later milestones are not FND acceptance blockers merely because unfinished. Explicit known limits: SwiftShader software rendering only, no representative GPU or humans, sparse early art, main-chunk warning, real host focus loss unobserved, synthetic blur labelled diagnostic, context-loss/hidden-tab/quota adapters not all browser exercised. Assess whether current acceptance evidence suffices and report missing required evidence honestly.

Browser rules MUST be read before any browser/preview/test: /work/repos/fleet/BROWSER_RULES.md when present and docs/BROWSER_RULES.md. Use HTTP/artifacts when adequate. Verify browser process on factory-worker or isolated Linux; never automate owner's Windows desktop. Prefer T3 preview_status then preview_open and focused tools; preserve shared/human tabs. Use task-owned incognito isolated storage and assigned port. Pointer lock only isolated Linux. Close only owned tabs/server, never kill shared hosts. If no Linux browser, continue static/rule work and report limitation. State actual renderer, distinguish ordinary input from injection/synthetic events. Existing absolute artifacts in FND-01 report are shared on worker and available for inspection.

Return separate explicit ACCEPT or CHANGES REQUIRED verdicts for FND-01 and ECO-01 at exact SHA, with evidence and any severity/file/line/repro findings. Separately identify M0 integrated-check concerns for coordinator; full M0 merge acceptance remains later. No spoilers in summary; no need to read canon unless finding requires it. Save full report only to /tmp outside candidate, include path and concise final result. Independent findings must remain separate until both return.

