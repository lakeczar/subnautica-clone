# POLISH-1 slice2 C0 — establish panel and HUD ownership seams

Read STATUS first, PLAN/CONTRACTS, revised input and specification pointers, accepted slice1 R2 record, [slice2 direction](POLISH-1-SLICE2.md) and Opus consultation C0/T11–T19. This is mechanical preparation for two real owners, not an architecture redesign or visible polish pass.

## Exclusive paths

`src/ui/view.ts`, new `src/ui/panels.ts`, new `src/ui/hud.ts`, optional small shared `src/ui/format.ts` only for existing pure text/format helpers, and `docs/build/evidence/POLISH-1-SLICE2-C0.md`. No other production, test, configuration or stylesheet edits. Existing tests run unchanged; if a genuine extraction seam requires adjusting a private test assumption, report its exact need before editing. Temporary diagnostics live in `/tmp/siltwake-polish-1-slice2-c0/`; optional isolated port5191.

## Implementation contract

Preserve public `GameView`, `UiActions` and `PanelKind` exports/method signatures, DOM IDs, text, attributes, order, styling, command keys, focus behavior, timers/durations and resource cleanup. Move panel content construction and its panel-specific storage selection/helpers into panels.ts. Move HUD updates, vitals/hazards/prompts/pilot/impact presentation and current notification mechanics into hud.ts. GameView remains the DOM/lifecycle/menu and event-dispatch composition boundary. It owns the modal focus trap and deliberate app-facing commands; avoid separate competing input listeners or focus traps.

Use small explicit internal constructor/method inputs. No inheritance/mixin, untyped God-context, circular import, proxy backdoor into GameView private fields, generic UI framework or duplicate UI state authority. Put shared pure existing formatting in format.ts only if needed to avoid a cycle; do not import view.ts values from children. Keep latest session/state/reset ownership coherent. A panel notice callback or small handle is acceptable for the existing feedback line; do not add the future channel API or alter priority/TTL now. Preserve same-state update ordering, storage selection lifetime, focus restoration, highlighted finding targets, timeout cancellation and detached command maps.

Move only what is needed to let later panel and HUD authors work exclusively. Return exact new internal exports and a method/field ownership map for root reconciliation before any consumer tasks. No behavior/CSS/copy change, rib work, new event/schema or speculative extension.

## Check and handoff

Run existing npm run check and economy checker. Existing275 tests must pass without weakening/editing their assertions. Inspect current tests for private assumptions and keep public behavior unchanged. Verify new dependencies have no cycles. This is high-impact lifecycle refactoring: perform a bounded exact-build browser smoke, not a whole campaign. Fresh opening/skip → Hold/Fabricate/Notebook → Return/Escape, native Tab/Shift+Tab boundaries and storage controls, paused ticks/capture count, settings, close/dispose/restart. Include one earned return-before-service import to confirm panel content and command focus remains the same; original imports read-only, no state grants. Capture comparable panels at960×600/1280×800 as future layout baselines. Record output text/command-key identity before versus final as needed, without adding implementation-mirroring permanent tests.

If browser work is unavailable, report its gap instead of fabricating it. Current passing tests do not prove Chromium focus/visibility; retain the accepted checkVisibility behavior. No new paired gate is dispatched by you: return bounded evidence for root and the full slice2 review.

## Execution, evidence and closure

Use actual `gpt-6.1-sol` at `max`; confirm effective runtime from your session turn_context and report any mismatch. Begin at the exact clean parent supplied in dispatch; retain the T3-bound worktree. No children, peer instructions, push, PR, parent edits or merge. Only root dispatches/integrates. If an extra path/interface becomes essential, send root the exact proposal and continue independent owned work; do not wait/poll peers or mutate unowned files. Keep commits small, scope source separately from evidence, end clean and return full SHAs/paths/exports/checks/limits.

Before any browser/preview/HTML/screenshot/test launch, read `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md`. Use existing artifacts/HTTP when sufficient. Verify the actual browser process is on isolated Linux/factory-worker, not only shell hostname. Prefer T3 preview; first status, then your own incognito tab if needed. Isolate origin/storage/free port; never drive user/peer/historical tab14. No unattended Windows pointer lock/cursor actions, process-name kills, host restarts or relaunch loops. Close only your own tab through normal T3 lifecycle and own server with Ctrl-C; stop recordings. Preserve shared hosts. If Linux browser work is unavailable, finish other work and report the precise gap.

Record ordinary inputs, imported earned checkpoints and seeded diagnostics separately. No grants or direct state edits count as ordinary play. Record final source/bundle hashes, input actions and checkpoint bytes; inspect actual final images for visible behavior. Keep previous evidence under `/tmp/siltwake-*` read-only. Use your assigned new temp directory. Software rendering/muted audio does not establish GPU performance, real-mouse feel, audible mix or human enjoyment. No full campaign claim. Fresh non-author Astra xhigh/Sol max review and coordinator acceptance cover the complete composed slice2 after its remaining implementation, not this author handoff alone.
