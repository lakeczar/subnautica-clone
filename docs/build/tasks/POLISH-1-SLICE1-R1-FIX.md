# POLISH-1 slice1 — keyboard navigation correction

Sol 6.1 **max** implements this bounded correction to SOL-P1-1. Read STATUS first, PLAN, CONTRACTS, the revised build input/specification pointers, POLISH-1/POLISH-1B and both independent R1 reports plus [root reconciliation](../reviews/POLISH-1-SLICE1-R1.md). TASKS/dispatch supplies the exact committed parent. Production is still cd4ef9f, reviewed at88f1f71; no acceptance extends to this provisional slice.

## Problem and reconciled behavior

Native reviewer evidence shows Tab from Hold's real `#storage-from` selector closes the panel, resumes simulation and captures the mouse. Root independently reproduces the same branch from SELECT and BUTTON targets using the real compiled app harness. The application explicitly bypasses text-entry protection for Tab; the UI also skips forward focus wrapping for inventory. Evidence: `/tmp/siltwake-polish-1-slice1-sol-r1/keyboard-tab-reproduction.json`, its two `media/storage-tab-*.png` images, and `/tmp/siltwake-polish-1-slice1-root-r1/tab-probe.mjs` and `tab-probe-results.json`. Keep originals read-only.

Binding correction to the older POLISH-1B same-panel Tab wording:

- During active gameplay, unmodified Tab from the canvas/non-control gameplay focus opens Hold. Tab from a focused HUD control remains normal keyboard navigation. Preserve opening's existing accessible focus behavior.
- While **any expedition panel is open**, Tab and Shift+Tab navigate controls and wrap within that panel. Neither switches panels, resumes simulation nor requests pointer capture, including from the initially focused Return button, selects, inputs, links/summaries or other focusable content. The app must not reinterpret a focus-wrap event handled by the view. Do not add a new focus framework or redesign the menu.
- I/K/J/V remain intentional panel shortcuts outside text entry, including from focused Return/buttons. Same-panel letter shortcuts may resume/capture when otherwise eligible. Text fields, selects, textareas and editable content retain their keys. Preserve modifier/repeat handling.
- Explicit Return/Resume/canvas activation keeps existing capture eligibility. Escape closes/resumes without capture, or releases/pauses as currently defined. Blur, context interruption, stale capture completions, denial, cooldown and remembered Drag preferences remain safe. No new auto-recapture or input held across interruption.

This is a narrow focus/capture correction, not the slice2 menu redesign. No extra help paragraphs/subtitles, movement tuning, synthetic warp suppression or broader cleanup.

## Exclusive ownership

- `src/runtime/app.ts`: panel shortcut eligibility only.
- `src/ui/view.ts`: existing Tab/focus navigation only; remove the inventory-specific forward escape and reconcile handled-event propagation where necessary. Preserve layout/copy/commands and existing opening/menu focus behavior.
- `tests/app.test.ts`, `tests/presentation.test.ts`, `tests/app-browser-support.ts`: meaningful focused regressions and only support needed for them. Do not weaken capture/interruption assertions; update the old synthetic double-Tab toggle test to the explicitly revised contract and retain intentional letter-toggle coverage.
- `docs/build/evidence/POLISH-1-SLICE1-R1-FIX.md`; new temp directory `/tmp/siltwake-polish-1-slice1-r1-fix/`.

Everything else stays frozen: input helper API, simulation/world/physics, source and terrain art, recipes/yields, schema2/expedition.3, saves/knowledge/provenance, session/writer lifecycle, dependencies/config, other evidence and root records. Existing control/text-entry helpers are available. Report any necessary cross-path proposal with exact scope while continuing independent work; do not edit it first. No children, peer coordination, parent mutation, pushes, PRs or merges.

## Verification and return

1. Capture the regression failing before the fix. Tests must exercise observable panel/simulation/capture behavior, not merely mirror a conditional. Cover Tab and Shift+Tab from initial Return, form entries, actionable controls and non-control panel focus; panel identity/tick/capture count stay unchanged. Cover focus wrap in both directions, gameplay Tab, intentional letter toggles, explicit Return, text-entry protection and Escape. Use real view behavior where the existing harness supports it; native focus traversal needs browser evidence.
2. Run focused app/presentation checks, then final `npm run check` and `node scripts/check-m1-economy.mjs`, plus diff check. No unchanged full expedition/carrier/terrain replay is required for this isolated input correction unless a concrete affected concern appears.
3. Build final committed production and perform a bounded native T3 keyboard trial: fresh opening/Skip; gameplay Tab opens Hold; Tab from initial Return and storage selectors advances focus; Shift+Tab reverses; first/last control wraps without leaking to gameplay. Demonstrate equivalent panel behavior in Fabricate and Notebook, and normal settings/menu navigation. Use existing visible inputs, buttons and summaries; label any seeded/temporary DOM diagnostic separately. No production debug hooks/state grants.
4. Record panel/focus/paused ticks, capture requests and actual native lock events before/after. DOM `.focus()` may select a control; use native keyboard for the tested action. Synthetic dispatch is a unit/diagnostic check, not native proof. Explicit Return and eligible same-panel letter toggle must still capture when eligible; Escape must not. Check opening focused Skip and a bounded pause/resume smoke. No human-feel or native drag claim.
5. Keep source/build identity, logs, selected actual screenshots and a concise event trace sufficient to reproduce the finding and correction. Document failures honestly. No need to duplicate the existing resource-art archives or collect a large unrelated matrix. Commit coherent source/tests, then the evidence document; return full commits, actual model/effort receipt, changed paths, checks, evidence locations and limits. Leave checkout clean and close owned resources.

Before any browser work read `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md`. Prefer artifacts/HTTP when sufficient; use T3 preview for the native unresolved behavior. Verify the actual browser process is isolated Linux/factory-worker, not just the shell. Own one incognito tab/storage and checked-free port5191. Preserve shared/user/historical tab14, other tasks and shared browser hosts. No unattended Windows pointer lock/cursor automation, process-name kills, relaunch loops or unverified flags. Close only your owned tab/recordings/server through normal lifecycle before returning. Software-rendered/muted evidence does not qualify GPU performance/audio/human feel.

Root inspects the correction, then starts **fresh** non-author Astra xhigh and Sol6.1 max round2 tasks covering all original nine criteria plus both prior reports/dispositions. Your handoff is provisional. Slice2, end-stage1 Opus and M2–M4 remain required.
