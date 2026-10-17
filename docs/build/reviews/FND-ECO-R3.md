# FND-01 / ECO-01 independent review, round 3

Status: both independent reviewers ACCEPT FND-01 and provisional ECO-01 at the frozen candidate. Coordinator accepts the bounded feature/design batch. Integrated M0 remains pending. Date: 2026-10-17.

- Frozen candidate: `50f5569a92a6e18aac8970ecdb7918e5e217a455`.
- Prior candidate: `0a8ef045d45b00f34386ddf3d2c3f31b7811adbc`; earliest review: `2eb0244`.
- Feature base: `a3e400b`; full bootstrap/spec-change base: `b3c3231b99ca5f1bd1159c5611216f2866e05a37`.
- Latest source: `2c25b8b` (author `1e2c581c28d209a9a3263071a638d6652b7d60e1`); evidence `bcef1e1` (author `b60ac58`).
- Prior full reports/dispositions: [round 1](FND-ECO-R1.md), [round 2](FND-ECO-R2.md). [Latest author evidence](../evidence/FND-01-R2-FIX.md), [reconciled contracts](../CONTRACTS.md).

| Reviewer | Model / effort | Task ID | Stable request ID | State |
| --- | --- | --- | --- | --- |
| Astra | `gpt-6-astra` / `xhigh` | `node:delegated-task:command%3Amcp%3A77db24d4-f446-41f1-a361-c1d3f090551d%3Adelegate-task%3Asiltwake-fnd-eco-astra-r3-50f5569` | `siltwake-fnd-eco-astra-r3-50f5569` | Complete: FND / ECO accept |
| Sol | `gpt-6.1-sol` / `max` | `node:delegated-task:command%3Amcp%3A77db24d4-f446-41f1-a361-c1d3f090551d%3Adelegate-task%3Asiltwake-fnd-eco-sol-r3-50f5569` | `siltwake-fnd-eco-sol-r3-50f5569` | Complete: FND / ECO accept |

Both use provider `codex` and T3-isolated worktrees, with exact requested model/effort selections. These are fresh task invocations; no backing thread was reused as a review round. Neither reviewer authored the candidate. Expected reports: `/tmp/siltwake-fnd-eco-astra-r3.md` and `/tmp/siltwake-fnd-eco-sol-r3.md`.

## Coordinator inspection and proposed resolution

Both prior reviewers resolved all three original dependency/save defects. Their shared remaining FND-A4 / FND-SOL-R2-01 is addressed by app-owned permission for each entry request: preparation pauses preserve it, external/player interruptions revoke it, recovery cannot restore it, and completion can remain paused. Fresh explicit Resume and fresh later requests retain deliberate semantics. Busy actions cannot authorize later completion.

Related graphics readiness now follows engine reconstruction plus scene readiness, requests a real paused redraw and removes/invalidates callbacks at disposal. Session/save APIs, data schema, dependencies, art/world/simulation and economy remain unchanged. Exact renderer callback semantics are reconciled in CONTRACTS.md.

Coordinator inspected source/tests, confirmed the integrated tree matches author source, viewed actual restored queued-New and completed-paused-import images, and ran `npm run check`: 65/65 tests and build passed with `index-DLXkZ6jy.js`. Feature whitespace check passed. Actual browser runs remain author-attributed, with synthetic focus/induced graphics/native-lock diagnostics labelled. No new audit or unchanged economy rerun was claimed. Remaining low esbuild advisory, chunk warning and hardware/human gaps persist.

## Combined acceptance and continuation

Both non-author reviewers explicitly **ACCEPT FND-01** and **ACCEPT ECO-01 (provisional arithmetic/design only)** at `50f5569a92a6e18aac8970ecdb7918e5e217a455`. Coordinator inspected both full reports against the specification, prior dispositions, source checks and actual artifacts. All prior findings are resolved; no new blocking finding, declined finding or unresolved disagreement remains. Reports are separate and were reached independently. Both reviewers completed with no live children and closed owned browser/server resources.

[Full Sol report](FND-ECO-R3-SOL.md) records fresh 65/65 tests/typecheck/build, economy checks and ordinary production movement/save/reload plus native-lock/synthetic-focus/induced-graphics diagnostics. Sol also checked queued cancellation and synthetic pagehide disposal. Sol's incognito download was observed and used for UI import but disappeared after cleanup; its attempted post-cleanup Node decode failed with ENOENT and is **not** counted as evidence. Retain this report's explicit attribution and limits.

Open/link the foundation PR into `game/siltwake`, integrate accepted source, and run the separate M0 milestone gate with fresh non-author Astra xhigh and Sol max reviews. ECO arithmetic does not establish runtime registry, recovery topology, route timing or balance. Preserve real-focus/visibility, software-renderer, hardware/human and later campaign gaps. Subsequent bookkeeping does not extend this exact-SHA review to future source/contract changes. Main merge/public deployment remain owner actions.

## Astra verdict

[Full independent round-three report](FND-ECO-R3-ASTRA.md): **FND-01 ACCEPT; ECO-01 ACCEPT** at `50f5569a92a6e18aac8970ecdb7918e5e217a455`, with ECO limited to provisional arithmetic/design. All prior findings resolved; no new actionable blocking defect or scope reduction found. Integrated M0 remains pending. Sol independently agreed, as recorded above.

Astra ran fresh install, 65/65 tests, production build, economy checker and whitespace/source comparisons. Its actual production run used ordinary movement/save/reload, then native-held writes with synthetic-focus New and induced-graphics import diagnostics. Both completed paused until explicit Resume; actual restored queued/completed import screenshots were visually inspected, with no invalid-resource warnings observed. Exact measurements/artifacts and historical-versus-fresh attribution are in the report. Hardware/human/real-focus/visibility limits remain explicit. Owned tab/server closed; no live child work.

Coordinator verified both reports' exact revision, scope and resolved findings. The pair is accepted for FND-01 and the qualified ECO-01 scope; separate integrated M0 review follows feature integration.

## Common round-three brief

You are an independent non-author reviewer for Siltwake. The owner explicitly requires Astra xhigh + separate Sol 6.1 max reviews. You are reviewing, not building; do not edit candidate code/docs, commit, push, create PRs, or delegate children. Use only your T3-created isolated worktree; verify HEAD before work.

Frozen candidate: 50f5569a92a6e18aac8970ecdb7918e5e217a455.
Author source commit: 8d72dd2ac2822873e36fe339f8ed2db8c837084b.
Feature diff base: a3e400b (game/siltwake integration baseline).
Full bootstrap/spec-change base: b3c3231b99ca5f1bd1159c5611216f2866e05a37.
This is a FRESH round-three delegated review; prior findings and responses follow below. Coordinator inspected corrected source/tests and actual restored paused captures, matched the author tree and ran npm run check (65/65 tests and production build pass) plus full feature whitespace check. No author remains active.

Read AGENTS.md, docs/build/{STATUS,PLAN,CONTRACTS,PLAYTEST,CONTENT_MANIFEST}.md, prompts/BUILD_GAME_REVISED.md and docs/DELIVERY_AND_ACCEPTANCE.md. Author evidence: docs/build/evidence/FND-01.md. Review two explicitly separate acceptance scopes on this same SHA:
1. FND-01 foundation: acceptance criteria in docs/build/PLAN.md; pinned TypeScript/Vite/Babylon; pure simulation/fixed step, shared terrain/colliders and coordinates, typed content IDs, original richer-cel scene, menu/input/pause/settings, safe atomic local saves and validated import/export, actual ordinary-input playable foundation. Read code/tests and inspect actual rendered evidence or execute focused production-browser checks. Verify no hidden scope reduction of later campaign.
2. ECO-01 design proposal: docs/build/design/{ECONOMY_CANDIDATE.md,economy-candidate.json,check-economy.mjs}. Read docs/EXPEDITION_INTEGRATION.md, WORLD_PROGRESSION.md, FLEET_AND_SURVIVAL.md as required. Review recipe/source dependency and numeric cargo/resource/recovery arithmetic, all optional-recipe coverage, both routes, protected recovery reserve and 20 numeric salvage/rebuild cycles, and clear limitations. This is a provisional arithmetic/design deliverable only, NOT runtime registry adoption, physical rescue proof or validated playtime. Identify actual contradictions/unsupported arithmetic and actionable integration risks; do not mistake declared unverified gameplay for a false implementation claim.

Run appropriate reproducible checks from this worktree (npm ci if needed, npm run check, node docs/build/design/check-economy.mjs). Do not run installation in parent's checkout. Foundation later systems intentionally absent: crafting/survival drains/story/fleet/full world; vitals stay at 100. Later milestones are not FND acceptance blockers merely because unfinished. Explicit known limits: SwiftShader software rendering only, no representative GPU or humans, sparse early art, main-chunk warning, real host focus loss unobserved, synthetic blur labelled diagnostic, context-loss/hidden-tab/quota adapters not all browser exercised. Assess whether current acceptance evidence suffices and report missing required evidence honestly.

Browser rules MUST be read before any browser/preview/test: /work/repos/fleet/BROWSER_RULES.md when present and docs/BROWSER_RULES.md. Use HTTP/artifacts when adequate. Verify browser process on factory-worker or isolated Linux; never automate owner's Windows desktop. Prefer T3 preview_status then preview_open and focused tools; preserve shared/human tabs. Use task-owned incognito isolated storage and assigned port. Pointer lock only isolated Linux. Close only owned tabs/server, never kill shared hosts. If no Linux browser, continue static/rule work and report limitation. State actual renderer, distinguish ordinary input from injection/synthetic events. Existing absolute artifacts in FND-01 report are shared on worker and available for inspection.

Return separate explicit ACCEPT or CHANGES REQUIRED verdicts for FND-01 and ECO-01 at exact SHA, with evidence and any severity/file/line/repro findings. Separately identify M0 integrated-check concerns for coordinator; full M0 merge acceptance remains later. No spoilers in summary; no need to read canon unless finding requires it. Save full report only to /tmp outside candidate, include path and concise final result. Independent findings must remain separate until both return.


ROUND THREE CONTEXT — supersedes historical candidate/check counts above:
Frozen candidate 50f5569a92a6e18aac8970ecdb7918e5e217a455 includes interruption correction source 2c25b8b (author 1e2c581c28d209a9a3263071a638d6652b7d60e1), evidence bcef1e1 (author b60ac585ee6dd7a5c2b8afbf72c7f060bd6794f6), and coordinator contract reconciliation. Prior candidate 0a8ef045d45b00f34386ddf3d2c3f31b7811adbc; full feature base remains a3e400b; earliest review 2eb0244.

Read all FOUR complete prior independent reports under docs/build/reviews/: FND-ECO-R1-ASTRA.md, FND-ECO-R1-SOL.md, FND-ECO-R2-ASTRA.md, FND-ECO-R2-SOL.md, plus consolidated dispositions FND-ECO-R1.md and FND-ECO-R2.md. Read correction assignments docs/build/tasks/FND-01-R1-FIX.md and FND-01-R2-FIX.md for acceptance intent, and ACTUAL evidence docs/build/evidence/FND-01-R1-FIX.md and FND-01-R2-FIX.md. You review these assignments; do not execute their author mutation instructions.

Prior findings/responses:
- R1 FND-A1 P1 exposed Vite7.3.1: fixed pin/lock7.3.7. R2 BOTH explicitly resolved.
- R1 FND-A2 / FND-SOL-01 P2 quota/write refusal blocks exportable New/import: fixed explicit eligible unsaved-session choice preserving old state/record until acceptance, autosave off/export available; typed failures preserve conflict/validation/protection. R2 BOTH explicitly resolved.
- R1 FND-A3 / FND-SOL-02 P2 stale compare/write non-atomic: fixed genuine shared Web Locks around comparison+journal write, snapshots, no uncoordinated fallback, async session deduplication/cancel/dispose. R2 BOTH explicitly resolved.
- R2 FND-A4 / FND-SOL-R2-01 P2 delayed New/import completion overrides interruption pause, including recovery before completion: BOTH independently reproduced using actual production + native held lock, synthetic blur and induced WebGL loss/restoration. Coordinator accepted; correction now pending your verification. No declined findings or unresolved disagreement.
- R2 Sol observed transient invalid-resource warnings/blank paused background on native graphics restoration. Coordinator traced Babylon's deferred resource rebuild after that event. Narrow readiness correction is included; not a general driver-fault claim.

Current proposed fix to verify:
App owns entry permission for one accepted New/import/Continue request, covering read/confirmation/write/fallback. Internal preparation pause preserves it; external interruption/player pause revokes it for that request even after recovery. Completion consumes it and installs paused when revoked. Fresh valid explicit Resume works only when not busy/confirming/hidden and graphics available. Refused busy entry/Resume cannot authorize later completion. Fresh deliberate request after earlier settled interruption is independent. Internal pointer-lock release is distinguished from external loss.
Renderer createRenderer(canvas, availabilityChanged) now forwards engine loss and waits for engine onContextRestoredObservable AND scene.executeWhenReady before restoring availability/requesting paused redraw. Presentation is gated unavailable; readiness never grants simulation resume. Own observers/readiness callbacks removed or invalidated on disposal; app ignores late callbacks. Session/save APIs, schema/content/journal/lock protocol unchanged. App is sole production caller.

Check actual production app composition and renderer lifecycle correctness, not only tests/asserted outcomes. 30 added tests load the REAL app/session/repository/clock/simulation through Node port substitutions for view/input/renderer; original35 unchanged, total65. Covers New/import through blur/visibility/graphics recovery, still hidden/lost, busy Resume/entry actions, explicit pause, fallback intent, slow reads, cancellation/disposal, fresh later requests, internal mouse release, native-event vs engine readiness, paused redraw/late callback. No new package/dependency/runtime test hook.
Author final browser used index-DLXkZ6jy.js; ordinary movement/save/reload at tick941; delayed New/import without interruption enter automatically, with interruption+recovery remain paused until explicit Resume; actual restored paused screenshots contain scenes. Native queued Escape preserved journal; no invalid-resource console warnings across3 induced cycles. Full exact artifact paths, baseline failing tests, observed timings and limits in correction report. Coordinator inspected source/tests, verified source match, viewed queued-New restored capture and completed-paused-import capture, ran65tests/build. No fresh coordinator browser run is claimed.

Diff since 0a8ef04: app.ts, renderer.ts lifecycle seam,30 composition tests in3 files,README and evidence/contracts bookkeeping. Geometry/shaders/assets/world/simulation/content/save/session/dependencies/economy unchanged. R1 persistence browser matrix remains prior evidence; rerun relevant checks if you find affected interactions, without presenting all old measurements as fresh. No separate audit was repeated for unchanged dependencies; one disclosed low esbuild Windows-dev-server advisory and chunk warning remain. SwiftShader, real OS focus/hidden-tab/human/GPU gaps remain explicit.

ECO proposal files are unchanged since prior two accepted reviews. Explicitly carry its qualified arithmetic/design acceptance to this candidate after verifying unchanged scope; no runtime rescue/route/balance adoption. FND full bounded scope still requires your exact-SHA ACCEPT or CHANGES REQUIRED. Address original findings and shared R2 race resolved/unresolved, actual evidence and any new actionable regressions. M0 integrated review remains separately required after feature integration.

Write only your /tmp full report; do not edit candidate, delegate children, create PRs or commit. Browser isolation rules from the original brief apply, must be reread before work; close only owned resources.
