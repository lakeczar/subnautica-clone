# OS2 accessible exit announcement correction

**SOL-OS2-R1-01 is corrected in source/test commit `75402ae4e3491a1f30cb3134ab9e0b1b3c843089`, pending root inspection and fresh full-batch R2.** This leaf does not accept its own correction or close stage1. It follows the [bounded brief](../tasks/POLISH-1-OS2-ANNOUNCEMENT-FIX.md) and [paired reconciliation](../reviews/POLISH-1-OS2-R1.md), including their content-based atomic-delivery clarification.

## Identity and scope

- Exact clean starting/direct source parent: **`c6b36a3c3fca05452c877b8ae2d77549ad0ba036`**. The original candidate production remains refinement `4a5103f` plus root's test-only `bd29ac3` before this correction.
- Isolated T3-bound checkout: `/home/worker/.t3/worktrees/subnautica-clone/t3-53a3ed9c`, branch `t3/exit-announcement-batching-fix`; no work in the parent checkout.
- Actual runtime **`gpt-6.1-sol` / `max`**. First original `turn_context` in session `01a1515e-e2b9-7940-afcc-e96abd8d37d3` records the model, effective effort and exact cwd. T3's own thread read independently matches model/branch/worktree. Catalog defaults are not substituted for effective effort. Receipts: `runtime-session.json`, `runtime-t3.json`.
- Only `src/ui/hud.ts`, affected `tests/presentation.test.ts`, and this report change. The source receipt compares all tracked production/test/config files with the parent; only the two implementation paths differ. Public interfaces, view markup/CSS, simulation/input, movement, persistence/session/schema, render/content/economy and existing visual/timing behavior remain unchanged.

Read AGENTS/STATUS first, PLAN/CONTRACTS, revised build input, settled map/tracker/glossary, applicable fleet/integration and delivery/UI requirements, the originating refinement and R1 brief, both completed independent reports and root reconciliation. The diagnosing-bugs/TDD workflows used the already confirmed GameView DOM/timer seam; the supplied root reproduction established the cancellation cause without a new speculative diagnosis phase. No delegation or peer coordination occurred.

## Delivery and exact reset semantics

`HudView` adds one private `pendingExitAnnouncements: string[]` and private `cancelAnnouncement(): void`.

1. A newly presented targeted error starts the existing zero-delay clear/set announcement. Further actual refusals for the same vehicle/reason before that flush append their **original full event text**, including identical occurrences. A depth-value update within that reason updates current visible guidance while preserving each attempted message.
2. The one scheduled callback assigns all pending messages, separated by newlines, through **`textContent` in one atomic live-region update**. It sets the timer handle to zero and releases the pending array immediately. There is no delayed backlog, generic queue, persistence or simulation work.
3. Existing result identity prevents updates, renders, active steps or expiry from appending/reannouncing an already delivered attempt. A later actual repeat gets a fresh clear/set singleton. Generic actions retain latest-result behavior and cancel pending exit content when replacing it; a later exit cannot revive discarded entries. Unmatched tagged refusals retain full fallback text.
4. `cancelAnnouncement()` clears the scheduled timeout, zeros its handle, advances the invalidation version and releases all pending strings. Actor/reason/success/menu/panel/opening/clear/expiry/reset changes reach this through existing result invalidation and rendering. `notify` also detects invalidation **after current-state/guidance observation but before a new result replaces it**, so a same-tag unmatched fallback cannot accidentally retain entries from a changed actor/reason.
5. `resetPresentation()` keeps its existing presentation reset/render boundary, which clears the result and cancels its pending announcement. Real New/import/Continue entry crosses that boundary. `dispose()` resets presentation, marks the HUD disposed, explicitly calls `cancelAnnouncement()` and clears the notice timer; callback version/disposed guards also prevent stale writes.

Concise visible `Exit blocked`, exact current pilot guidance, full panel-local results, `Left the craft`, active-time expiry, singleton/generic announcements, hazards and persistence routing are preserved. No new focus behavior, visible subtitle or HTML interpretation is introduced.

## Verification

Finite artifact directory: **`/tmp/siltwake-os2-announcement-fix/`**. `COMMANDS.md` retains actual commands, setup failures, results, provenance and cleanup.

| Check | Actual result |
| --- | --- |
| Regression before HUD edit | Real `stepGame([exit, interact])` → real GameView → existing DOM/timer port fails **1 !== 2** full occurrences; `regression-red.log`, exact test-only patch, parent HUD and red source hashes retained. |
| Same regression after fix | **1/1 pass**, `regression-green.log`; asserts full content occurrences, without requiring two rapid DOM writes. |
| Affected presentation suite | **70/70 pass**, `presentation-green.log`. Seventeen meaningful new cases supplement the 419-test baseline. |
| Final `npm run check` | **436/436 pass**, strict typecheck and production build pass; `check.log`. Existing large-chunk advisory remains. |
| Both economy scripts | Exit **0** for `node scripts/check-m1-economy.mjs` and `node docs/build/design/check-economy.mjs`; arithmetic/staged-rule scope retained. |
| Source/build integrity | Owned-path guard passes; all **27** production files and exact compiled native modules hashed in `source-build-identity.json`; `git diff --check` passes. |
| Native browser trace | Real compiled GameView/stepGame, native timers and MutationObserver pass double refusal, later repeat, no render replay, menu/reset cancellation and zero pending timers. |

Coverage includes identical refusals and multiple batches arriving before a timer runs; different full depth text within one vehicle/reason, preserved original order/count; one final short visible result/current full guidance; later singleton repeats; paused wall time, active expiry and no replay. Before-flush interruption tests cover actor, reason, success, menu, panel, opening, explicit public HUD clear, reset/replacement and disposal, with a clean later attempt proving no retained batch content. Real New/import/Continue session callbacks exercise GameView reset. Same-tag unmatched deliveries after actor/reason changes, generic replacement and existing hazard/persistence accessibility cases remain meaningful. Opening, missing-actor, command-batch/final-actor and event-count coverage is retained by the passing unchanged suites.

Two initial expanded-test harness mistakes remain disclosed in `presentation-initial.log`: a success assertion inspected its full message rather than its summary, and a second HUD's cleanup ran after the fixture restored globals. Correcting only those assertions/fixture cleanup yielded the final green suite; no production workaround or weakened event adapter was used.

Final production JS: `dist/assets/index-D2_rfsis.js`, SHA256 **`fd7f92cdbaa218012d83c83236e2743467fcb21f1fc0b3e147e83876d4f56927`**. CSS remains `index-CHzXt-7W.css`, SHA256 **`ec97b5d97f29dfda288959b2341ac6a6b825f8eddadca1a2fe55b9d8ee3209dd`**. Historical candidate captures are not described as images of this new JS build.

## Bounded native evidence and composition

Read `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md` before browser tools. T3 `preview_status` was initially unavailable, so `preview_open` created one owned incognito tab; no fallback browser was needed. The task page's localhost TCP client maps to Linux Chromium network PID827936 → browser827911 → T3 worker811435 on **factory-worker**, recorded in `browser-process-isolation.json`. Own free port5190, empty local/session storage and no pointer lock were verified.

`native-trace.json` explicitly labels the diagnostic stationary Dart at Y−80, 60m suit and empty-water query. The same-turn `[exit, interact]` yields two genuine tagged events and one MutationObserver added-text value containing both complete refusals in order. A later attempt clears then exposes one full occurrence. Menu/reset each cancel a pending double refusal, with no later added refusal or timer. Final `native-accessibility.json` exposes the full singleton text as a polite atomic status, and contains no console entries. `native-singleton.png` is a UI-only diagnostic with the real GameView and original CSS; it has no 3D renderer.

Fresh clean-parent and final singleton native DOM match exactly, SHA256 **`01fd8d6acdef3ea20df0a54b360af933ea2c41160a623f9e2a1f6a425adc7d75`**, with identical text/styles/rectangles for result, pilot guidance, hazards, vitals and interaction stack at CSS1280×800. The retained author `after-seven-960.png` was inspected read-only and verified against its manifest (SHA256 `f44b70858f4ba7b2a0b08eef1d8b64d39d9e41e7fd5559abe092b60ea6f89ea7`), alongside exact unchanged view/notices/panels/simulation sources and CSS. That capture remains attributed to **4a5103f**, with its staged seven-warning provenance. This supports preservation of the existing singleton visual composition without claiming a new ordinary-control expedition or replaying a layout matrix.

The temporary evidence server initially returned `ERR_EMPTY_RESPONSE` because process instrumentation tried to read a protected ancestor executable. Its traceback is retained; only the owned server was stopped/restarted once after permitting an explicit permission-denied annotation. The first native probe then failed an overly broad fresh-versus-after-menu whole-DOM comparison: the hidden menu subtitle differed, while all measured visible groups matched. Raw error, focused fresh-instance investigation and the final lifecycle diagnostic are retained. Fresh singleton comparison is now separate from exercised lifecycle history; final content/atomicity/cancellation assertions all pass.

## Limits, cleanup and handoff

No actual screen-reader speech, player incidence of keyboard batching, human control feel, audible mix, enjoyment/duration or dedicated-GPU performance is established. Native checks are seeded UI composition, not a gameplay completion run. No unchanged collision grids, expedition/recovery routes or reload matrices were repeated. Earlier ordinary/diagnostic and source-attribution limits remain in force.

Page-local real GameView disposal left zero root children, no pointer lock and no storage keys. Closed only owned tab `tab_3n_0430977b-1ed3-45f2-ac72-3683f9fe8942` through T3 lifecycle; native status confirms no owned tab. Stopped both owned server instances through terminal Ctrl-C; their PIDs are absent and port5190 is free. Shared browser hosts827911/847778 remain. No recordings, child tasks, peer messages/waits, pending questions, push/PR/merge or parent mutation.

Payload manifest: **28 files / 374,642 bytes**, excluding only `manifest.json` and `manifest.sha256`; manifest SHA256 **`b00fcb3d404f6f2fd0f1e219016523e3d3d6ef0ddcbd21944b316cdf116121de`**. All previous archives remained read-only.

Implementation/report ownership and task resources are released on return. Root inspects this bounded correction, then commissions fresh full-batch Astra xhigh/Sol6.1 max R2 with original findings/dispositions and the atomic-content clarification, followed by fresh Opus stage1 verification. Those acceptance gates remain pending.
