# Experience R2 — notice and action composition correction

Both confirmed R2 compositions are corrected on source **d9aaf6356cb320f283887922abf97ed8bdc54f59**. Full notices now reserve panel space, and playing warnings, full results and look guidance share content-sized flow. Author verification is complete; this remains provisional for root inspection, fresh non-author Astra/Sol complete-batch review and Opus verification.

The initial checkout was clean at the exact assigned parent **0f8ae44afa048758472ba6911ce30f9de27ae121**, branch `t3/experience-r2-composition`, cwd `/home/worker/.t3/worktrees/subnautica-clone/t3-ddc9bdc7`. [Initial receipt](/tmp/siltwake-polish-1-experience-composition-fix/initial-checkout.json). This report is a separate report-only commit after the source commit. No child, peer contact/polling, parent change, merge, rebase, push or PR occurred.

Actual original runtime is **gpt-6.1-sol / max**, verified against the original session's `turn_context` at line 8, including the bound cwd. [Runtime receipt](/tmp/siltwake-polish-1-experience-composition-fix/runtime-receipt.json); the retained original records come from `/home/worker/.codex/sessions/2026/10/18/rollout-2026-10-18T13-42-20-01a15052-69c5-7ad3-bfe8-2feaa4930d48.jsonl`.

Read STATUS first, PLAN/CONTRACTS, revised input and relevant UI/integration/delivery specifications, settled decisions/history, whole-batch experience reconciliation, R2's eight criteria, both R1 reports/disposition, completed Astra R2/reconciliation, and original Opus stage1 report/advice/disposition before implementing. Read the terminal Sol R2 report from `8c078ea` after root's update; its same two findings added the starvation variant without expanding ownership.

| Finding mapping | Independent report commit |
| --- | --- |
| ASTRA-EXP-R2-01 = SOL-EXP-R2-01: full save error over paid fabrication | Astra `c429a1e5ac0bcebe9cc08e1cc9aa03456d070e77` |
| ASTRA-EXP-R2-02 = SOL-EXP-R2-02: seven warnings over full exit refusal | Sol `8c078ea9e4237bb411374eb1016214f709402b56` |

Reviewer task IDs are `node:delegated-task:command%3Amcp%3A77db24d4-f446-41f1-a361-c1d3f090551d%3Adelegate-task%3Asiltwake-polish-1-experience-astra-r2-3e740a8` and `node:delegated-task:command%3Amcp%3A77db24d4-f446-41f1-a361-c1d3f090551d%3Adelegate-task%3Asiltwake-polish-1-experience-sol-r2-3e740a8`.

## Source and preserved behavior

Only four owned source/test paths changed, plus this new report:

- `src/ui/hud.css`: a common grid reserves actual header, instrument, encounter and telemetry heights. Warnings and interaction content compose without prompt-count selectors. Pilot/obstruction guidance occupies a separate column; call and session notices have separate cells. Menus/panels reserve a notice sidebar only when notices exist. When that sidebar reduces menu space, the decorative caption wraps in normal flow. Initial title layout follows actual menu visibility before `data-screen` exists.
- `src/ui/panels.css`: sticky `.panel-chrome` sizes the header and full feedback together, replacing fixed feedback offsets and notice padding.
- Constructor markup in `src/ui/view.ts`: private `.experience-layout`, `.hud-instruments`, `.encounter-stack` and `.panel-chrome` grouping; pitch joins instruments, motion cues join pilot/obstruction guidance, graphics failure joins the session notices outside the hidden HUD.
- `tests/presentation.test.ts`: behavioral focus/command/scroll and full-error lifetime regression, plus structural assertions for the common flow groups. Existing behavior assertions remain.

[Source invariants](/tmp/siltwake-polish-1-experience-composition-fix/current-source-invariants.json) verify byte-identical GameView implementation outside constructor markup; identical constructor text, IDs/actions/roles/live regions/focus/disabled attributes; and unchanged font declarations. Public APIs, command keys, simulation/save/input/lifecycle/economy/render code and notice timers were not edited. No copy was shortened, hidden or truncated, and no measurement loop or helper paragraph was introduced. `#hud` retains hidden semantics with `display: contents`; notices/export remain available outside it.

## Final-source verification

All primary receipts use `current-` under `/tmp/siltwake-polish-1-experience-composition-fix/`. [Evidence index](/tmp/siltwake-polish-1-experience-composition-fix/EVIDENCE-INDEX.md) distinguishes final production input, native diagnostics and earlier development artifacts. JSON records actual CSS viewport/DPR 2, full text, rectangles, ancestor clipping, element overflow, focus/scroll and interactive hit targets. T3 scales its PNG output; screenshots were personally inspected alongside the CSS measurements.

The final production app imported the unchanged earned fabrication input. After a diagnostic setup pause, trusted Resume/K/F5 reproduced the exact full save error through a journal-only quota failure. Storage was restored immediately. Both required sizes showed the complete ready action and error disjoint:

| CSS viewport | Full error `(x,y,w,h)` | Ready Dart `(x,y,w,h)` |
| --- | --- | --- |
| 960×600 | `(648,106,288,94)` | `(361,231.94,230.41,36.20)` |
| 1280×800 | `(956,106,300,94)` | `(669,219.54,230.41,36.20)` |

A deliberate trusted click at 960 occurred while the full error was visible. Trusted Export retained the actual paid result. Current codec decoding proves **6 structural alloy /3 silica glass /2 flexible membrane spent**, `dart_17` created with the matching investment, and tick 7551 before/after. [Paid proof](/tmp/siltwake-polish-1-experience-composition-fix/current-paid-proof.json), [input trace](/tmp/siltwake-polish-1-experience-composition-fix/current-production-input-trace.json), [actual exported save](/tmp/siltwake-polish-1-experience-composition-fix/current-production-paid-build-export.json). The post-payment disabled action and complete reason remain visible with feedback/error.

Both final reviewer danger seeds pass current codec/state validation and real hull clearance, take an actual `stepGame`, retain seven banners and atomically refuse `interact`. Astra's `(110,-158,-130)` and Sol's starvation `(110,-155,-105)` variants are distinct staged diagnostics. [Seed validation](/tmp/siltwake-polish-1-experience-composition-fix/current-seed-validation.json). At960, the seven-warning block ends at376, full refusal starts at388 and ends447, and look fallback occupies453–491. Pilot guidance occupies the separate left column. At1280, warning/result separation remains12px. Full save/reminder/status/call/obstruction content is readable in the same native composition.

A focused **final production 960** pilot smoke used the valid Astra seed, trusted Resume/E and the app's actual refusal path. Seven real warnings, the full 157 m refusal, look fallback and pilot guidance remain disjoint. A temporary canvas capture-denial diagnostic exercised the normal fallback path and was restored. [Production pilot trace](/tmp/siltwake-polish-1-experience-composition-fix/current-production-pilot-trace.json). This is staged danger evidence, not an earned severe route. Earlier b6d60f1 starvation production captures are supplemental; final native starvation captures establish stable final-source composition at both required sizes.

The final native matrix covers **13 cases at 960×600,1280×800,1050×700**, plus seven-warning/craft probes at 1051×700: both seven-warning variants with all notices, no-look pilot, five-warning target/full-capacity refusal, reach preview, no target, ordinary exploration, ready/disabled recipes/reasons, Cargo/full feedback, earned no-error preparation, expanded menu and hidden-HUD graphics failure. Across 41 probes: no measured HUD/notice intersection, viewport overflow, notice/control intersection or menu-caption intersection. Offscreen panel/menu rows retain native scrolling. [Matrix](/tmp/siltwake-polish-1-experience-composition-fix/current-native-matrix-summary.json). Fifteen final captures were personally inspected; [exact list](/tmp/siltwake-polish-1-experience-composition-fix/current-personal-image-inspection.json).

Current native trusted keyboard Store moved 4 CU, trusted Fit installed acoustic trim, and keyboard Move transferred the whole resin stack with semantic focus fallback. Notice on/off preserved the focused element, command identity, storage operands and scrollTop 724. Disabled focus/click suppression and a trusted click on a deliberately stale enabled recipe retained complete state equality on refusal. Keyboard panel wrapping, panel→menu→playing, hidden-HUD export, graphics availability and disposal passed. Real wall timers retained the full error at 3.05 s after system-status expiry and removed it at 12.05 s. A diagnostic change to an earned safe snapshot cleared warnings/call; the result retained its remaining active lifetime, then expired after 238 additional real fixed steps. Reset cleared presentation. These are native state/command checks, not a route replay.

The retained earned S2b preparation state at tick 17145 still exposes **Store 4 CU and Fit at scrollTop0** at all three main sizes; at 960 they occupy y188.74–224.94 and376.69–412.88. No new no-error preparation scrolling was introduced. [Provenance](/tmp/siltwake-polish-1-experience-composition-fix/preparation-provenance.json).

Final `npm run check` passes **400/400**, typecheck and production build. Both `node scripts/check-m1-economy.mjs` and `node docs/build/design/check-economy.mjs` exit 0. The existing Vite chunk-size advisory remains. [Check receipt](/tmp/siltwake-polish-1-experience-composition-fix/current-check-receipt.json). All 27 served production files match the final build: entry `index-B0ZQ9wiL.js`, SHA256 `be58bfd46db548e43cd659bbdc88f70890af28fa5994f6b9ef787e5fcae1fee3`; CSS `index-CHzXt-7W.css`, SHA256 `ec97b5d97f29dfda288959b2341ac6a6b825f8eddadca1a2fe55b9d8ee3209dd`. [Build identity](/tmp/siltwake-polish-1-experience-composition-fix/current-build-identity.json).

## Integrity, cleanup and limits

Read both browser rule files. Used one owned incognito T3 tab and port5190 on factory-worker. A 900 ms page CPU pulse identified the actual Linux renderer 2096672 through its 90 CPU ticks and Chrome/T3 ancestry; UA/loopback was not treated as proof. Raw traces/downloads were retained, Storage/capture APIs restored, input/lock released and native view disposed. T3 lifecycle closed only the owned tab; its renderer is gone. Own server exited normally; bind/listen proves 5190 free. Shared Chrome 827911/T3 host 811435 remain. [Ownership](/tmp/siltwake-polish-1-experience-composition-fix/browser-process-proof.json), [cleanup](/tmp/siltwake-polish-1-experience-composition-fix/cleanup-receipt.json).

Both original archives remain unchanged: Astra 175 payloads, manifest `965eaee390dc34b3b7db1976fc70ff315a59f1d1c7dcef432d74312f32a28251`; Sol 173 payloads, manifest `db822100be4a82dcc29ded57991368ac66e1e5df0606da8b4eaef9f66e94d764`. Scripts were inspected before adaptation; originals were not executed in place. The Sol1280 supplemental fixture's shortened error is not used for final copy verification; all final probes retain “Export save from the menu”.

Final own archive: **447 payloads /25,681,925 bytes**, read-only files; [manifest](/tmp/siltwake-polish-1-experience-composition-fix/manifest.json) SHA256 **044c5e47fb55507c4c1dab6e38eb7cee21dcfd55d11f4a993f2b05593be74daa**. Every listed payload and the manifest were verified after generation. This report-only commit is outside the artifact manifest.

Original P1–P8, earned-route, carrier/recovery and active-reload evidence keeps its existing source attribution; no unchanged full route was rerun and no fresh reload equality is claimed. Desktop composition and automated semantics are the bounded result. Human feel, audible mix, duration/enjoyment, representative-GPU performance and campaign completion remain unverified. Both R1 triggers remain closed in current native probes; only root and the fresh non-author complete-batch pair plus Opus may accept the integrated experience.
