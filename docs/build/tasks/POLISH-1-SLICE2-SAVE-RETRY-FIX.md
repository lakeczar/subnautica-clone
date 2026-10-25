# Slice2 — resolve the stale save-retry warning

Bounded Sol6.1/max correction for **ASTRA-S2-R1-01 (P2)**. The coordinator verified the fresh Astra report/runtime/artifacts, inspected the actual failure/retry screenshot and reproduced the pure notice defect. The separate independent Sol R1 reviewer remains on frozen b9c99a0; do not contact it, inspect its work or wait for its result. This correction has no dependency on that report. Root will reconcile both initial findings and any additional corrections before commissioning a new fresh pair.

## Scope and baseline

Use the exact clean committed parent supplied in dispatch. It contains production660350b plus report/build records only. Read AGENTS, STATUS, PLAN, CONTRACTS, revised input and relevant specification pointers, DELIVERY_AND_ACCEPTANCE, the full `POLISH-1-SLICE2.md` and `POLISH-1-SLICE2-2D-HUD.md` contracts. Read `docs/build/reviews/POLISH-1-SLICE2-ASTRA-R1.md` in full and the HUD author/root integration reports. This corrects one returned finding, not the independent full-slice acceptance or the forthcoming stage1 Opus review.

Exclusive allowed source/test paths:

- `src/ui/notices.ts` only: presentation resolution of confirmed persistence recovery.
- `tests/encounter-presentation.test.ts`, `tests/presentation.test.ts`; `tests/app.test.ts` only if needed for actual export/event wiring coverage.
- Own report `docs/build/evidence/POLISH-1-SLICE2-SAVE-RETRY-FIX.md` in a separate evidence commit.

Do not edit app/session/save/sim/render production, schema/content, UI copy/layout, interfaces, dependencies or build records. A small correction should use existing typed channel semantics; no generic event bus, notice queue, message-string inference, unrelated rewrite or new UI paragraph. Report a concrete additional path need before editing it and continue independent work. No children, peer contact/polling, parent mutation, push, PR or merge.

## Defect and required behavior

Current `EncounterPresentation.notify` records successful system/persistence bookkeeping in a separate status chip and returns. A previous central persistence failure remains until its12-second wall expiry, even after a real manual save retry re-enables automatic saving and updates the journal. The success chip can expire at3 seconds while the false failure persists. Reviewer evidence: `/tmp/siltwake-polish-1-slice2-astra-r1/save-retry-stale-error-960.png`, `browser-trace.json`, `browser-final-trace.json`, `replay-and-notice.{mjs,json}`. Root reproduction/verification: `/tmp/siltwake-polish-1-slice2-r1-root/`.

On a confirmed successful **local persistence write**, resolve the obsolete central persistence failure/reminder immediately while showing the normal success chip. Preserve a current unrelated hazard/action error and the current emitted call. Successful export or arbitrary system success does **not** establish local-save recovery and must not dismiss a still-valid persistence warning. Another failed write must keep/refresh the truthful warning and leave the valid journal protected. No pending suppressed notice should replay after resolving the old failure or after the success chip expires. Existing durable unsaved reminder remains driven by actual session state, with no UI-forced autosave change.

Current call-site audit: SessionEvents emits successful `channel: "persistence"` only after actual successful new/import/manual writes; ordinary export/raw export success is `channel: "system"`. Session sets `automatic = result.ok` before notifying. These existing typed distinctions should suffice; verify all call sites rather than parsing text or assuming every success is recovery. Save validation, cancellation, writer lock, protected repair, backup generations and export behavior remain unchanged.

## Meaningful validation and evidence

1. Show the existing failure with a meaningful regression, then correct it. Exercise real GameSession→GameView composition: force a storage refusal, confirm unchanged local journal and durable reminder, restore storage, retry successfully, and verify obsolete failure clears immediately and does not return after the success chip expires while paused. Actual autosave permission/journal state must corroborate the display.
2. Cover still-failing retry and export/system success without dismissing the failure; preserve warning/save coexistence, unrelated hazard/action error, timer/reset/disposal bounds and native panel focus. Use the existing real composition helpers; avoid duplicative implementation-mirror assertions.
3. Run `npm run check` (tests/typecheck/build) and `git diff --check`. No wholesale historical route/economy/art rerun is required for this presentation-only change. Confirm unchanged frozen paths and exact final source/build identity.
4. Inspect actual final production in your isolated browser: byte-identical earned preparation checkpoint, paused Hold, seeded localStorage refusal, restore native method, successful F5 retry, then wait beyond the3-second chip lifetime. Retain before/after screenshots, observation trace, journal checks and current loaded bytes. Also check failed persistence plus successful export and danger plus successful save through production controls. Clearly label seeded storage injection; no grants/pose changes or ordinary-progression claim. Restore all overrides and keep saves/evidence from earlier workers untouched.
5. Return source and report commits, changed paths, red/green/check receipts, actual runtime confirmation, image/trace/provenance paths, limitations and cleanup. Source is provisional until root inspection and the fresh full-slice Astra/Sol pair. Do not add acceptance or full-game completion claims.

Own temp root `/tmp/siltwake-polish-1-slice2-save-retry-fix/`; optional port5191, checked free before start. The independent Sol reviewer owns5192 and separate storage. Before any browser action read `/work/repos/fleet/BROWSER_RULES.md` when available and `docs/BROWSER_RULES.md`. Prefer artifacts/APIs where sufficient; unattended browser work only on verified factory-worker/isolated Linux. Verify which actual machine/process renders the tab. Prefer T3 preview_status then preview_open; use one owned incognito tab/storage. Never drive the owner's Windows desktop/cursor, human/peer/historical tabs or shared storage. Keep actions within the target page. Stop recordings and close only your tab through the normal T3 lifecycle; stop only your own server, preserving shared hosts. No relaunch loops or speculative browser flags. If isolated browser execution is unavailable, report that evidence gap and complete non-browser work.

The owner prioritizes concise intuitive feedback. Resolve the contradiction through correct state; do not add another explanatory banner. Optional refit-copy recommendations remain reserved for the separate experience pass.
