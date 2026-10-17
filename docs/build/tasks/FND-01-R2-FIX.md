# FND-01 round-two correction assignment

Main builder: `gpt-6.1-sol` / `max`; coordinator: Astra xhigh. Construction and fixes are authorized. Do not delegate children, push, open PRs, merge, switch branches or edit the parent's checkout. Work only in your T3-created isolated worktree. Verify HEAD/status before editing.

Read AGENTS.md, current docs/build/{STATUS,PLAN,CONTRACTS}.md, revised build input and delivery/acceptance contract. Read both full independent round-two reports:
- docs/build/reviews/FND-ECO-R2-ASTRA.md
- docs/build/reviews/FND-ECO-R2-SOL.md
- consolidated dispositions in docs/build/reviews/FND-ECO-R2.md.

Current source is `417a7ec` (author `79423ec`), reviewed at `0a8ef045d45b00f34386ddf3d2c3f31b7811adbc`; later commits are review bookkeeping. Both reviewers explicitly resolved the three original issues and accepted ECO-01 only as a provisional arithmetic/design proposal. One independently reproduced P2 remains: **FND-A4 / FND-SOL-R2-01**, delayed New/import completion overrides an interruption pause. Preserve all existing resolved behavior; this task is not M1 or a broad rewrite.

## Owned paths

Only necessary lifecycle fixes in `src/runtime/`, `src/ui/view.ts` if needed, `src/render/renderer.ts` for the narrow engine-readiness seam, relevant tests/test config, README if behavior wording changes, and new report `docs/build/evidence/FND-01-R2-FIX.md`. Do not change geometry/shaders/assets, simulation/world/content, economy, dependency pins or save schema/journal/locking protocol. If a concrete minimal session API change is needed, it is within the runtime ownership; report exports for coordinator reconciliation. Coordinator retains build status/contracts/reviews. Do not rewrite earlier evidence to imply it passed.

Commit assigned changes on your isolated branch and return exact commits/path/check/evidence details. No parent integration.

## Required behavior

The current app's `entered` callback unconditionally invokes resume after asynchronous replacement. Blur/background/context loss may already have paused the app, yet current hidden/graphics checks forget an interruption if it recovers before completion.

Preserve interruption intent across delayed session entry. Either enter the selected session paused after an intervening interruption or safely cancel the pending replacement under the existing completed-write semantics. A current `hasFocus()`/visibility/context check alone is insufficient: recovery before completion must not clear the pause. Distinguish the internal preparation pause used by New/import from an external interruption or deliberate player pause. A fresh valid explicit Resume should resume only after pending work and graphics readiness permit it. Do not pre-authorize a later resume from a disabled/busy action.

Preserve ordinary New/import automatic entry when no interruption occurred, ordinary Continue, Escape cancellation, snapshot ownership, autosave deduplication, protected/conflicting-save refusals, unsaved fallback/export and no resurrection after cancellation/disposal. New/import after an earlier settled interruption must have understandable deliberate-entry semantics; avoid a permanently sticky latch. Use a small explicit lifecycle/intent boundary rather than a general framework.

Both reviewers reproduce the defect with a genuine held Web Lock, ordinary New/confirmation controls and then (a) labelled synthetic blur or (b) induced context loss/restoration before lock release. No gameplay state setter is needed. Read the report's exact fixtures and measurements.

## Related graphics-readiness check

Sol observed invalid-context/program/VAO warnings and a transient blank paused background after the native restored event, before Babylon rebuilt resources. Coordinator inspected installed Babylon 9.31 `abstractEngine.pure.js`: `_restoreEngineAfterContextLost` defers reconstruction with `setTimeout`; `onContextRestoredObservable` fires after reconstruction. The app currently marks graphics available directly on the earlier canvas event.

Reproduce/inspect this ordering and make the minimal renderer/app readiness correction if it can present stale resources. Prefer the engine's lifecycle signal as authority for reconstruction and request a real paused redraw after shaders/resources become ready; do not claim native canvas restoration or an incremented frame counter proves visible recovery. Preserve the interruption latch even once rendering is ready. Remove observers on disposal and reject delayed callbacks after disposal. Avoid unrelated engine/art changes. Report actual images and console results, including any remaining transient limits.

## Verification and return

- Fresh worktree install as needed; `npm run check` and whitespace check. Preserve the current 35 meaningful tests and add regression tests at the actual app/composition boundary or a narrow shared adapter that the real app consumes. Counting session pause/entered callbacks alone does not verify their ordering.
- Cover delayed New AND validated import: no interruption -> ordinary entry; interruption -> completion remains paused; interruption recovers before completion -> still paused; explicit Resume afterward works; pending Escape/dispose still cannot re-enter. Use bounded adversarial scheduling, not arbitrary sleeps. Preserve save consistency and existing refusal/fallback tests.
- Actual final production browser: ordinary new/move/pause/save/reload; delayed New and import with interruption/recovery and no Resume until observed paused; subsequent explicit Resume; native queued cancellation. Test the engine-restored paused visual using actual screenshots after stable readiness, and confirm no ticking without input. Label synthetic blur/visibility and induced WebGL loss as diagnostics, not real OS/GPU faults.
- Only rerun the relevant established save checks if affected by your implementation; no need to repeat every unrelated economy or art path. No dependency change is planned, so retain the disclosed low Windows esbuild advisory rather than claim a new clean audit.
- Return exact source/evidence commits, owned paths, actual checks/artifacts, interface decisions and remaining gaps. Make no independent acceptance/M0/campaign/performance claim. Coordinator will inspect/cherry-pick, reconcile contracts, freeze a new candidate and request fresh Astra xhigh + separate Sol max reviews.

## Browser rules

Before any preview/browser/screenshot/test read `/work/repos/fleet/BROWSER_RULES.md` when available and `docs/BROWSER_RULES.md`. Use existing artifacts/HTTP when adequate. Verify browser processes on factory-worker/isolated Linux; never automate the owner's Windows desktop. Prefer T3 preview_status then preview_open and focused controls. Use your own incognito origin/storage and production server, suggested port 5184. Preserve all shared/human tabs including coordinator blank tab14. Real pointer lock only on verified isolated Linux; it is not needed for these fixes. Close only your own pages/contexts/server with app lifecycle or owned terminal session; never kill shared hosts. Remove task fixtures/locks/iframes, retain evidence and identify actual renderer. If browser availability is blocked, continue other work and report it; do not switch to the Windows desktop.
