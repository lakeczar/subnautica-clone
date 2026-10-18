# Keyboard correction — coordinator inspection

**Provisionally assembled at `5f25810a7f7d9974ffd2fb2b3379d812d206b0f9`; SOL-P1-1 is corrected in the inspected checks. Fresh paired round2 of the complete controls/action slice remains required.** No stage or full-game acceptance.

Author sources `7c1cbfd651235462f46c98f95cf7eb7e42305e34` and final `da1a9dc8299b6ca1935e465abcd8b8ae1a3bbdd5`, evidence `44d4efec97453199e209f8a2758c2016ab7e2a1c`, are merged without conflict. Parent is7eec795; the five changed paths exactly match the bounded assignment. Root inspected the complete diff and [author report](POLISH-1-SLICE1-R1-FIX.md), confirmed clean author checkout and actual Sol6.1/max from its session turn_context. Task is terminal, with no children/questions and ownership released.

## Behavior and scope

The app now limits Tab's Hold shortcut to active non-control gameplay focus and respects handled keys. Every open panel keeps Tab/Shift+Tab for focus navigation. The view wraps both ways, consumes handled wraps and routes non-sequential focus to a visible boundary. Letter toggles, text-entry protection, explicit Return, Escape and capture lifecycle retain the reconciled contract. Existing source helpers/API are unchanged.

The first native trial found that closed-details descendants could retain client rectangles. Final source uses `checkVisibility()` in the existing trap, so the menu boundary reaches the visible summary. Root considers this within the assigned focus seam. The current native evidence is Chromium154; no wider browser/device validation is inferred. Initial failed menu trial and its failing-before regression remain distinguished from final proof.

Only app/view and their two tests change. Simulation, input helper, terrain/art, registry/economy, settings/save schema/content, session/writer and dependencies/config match the prior source. No copy/subtitles, camera/movement change or warp suppression.

## Root verification

Receipts: `/tmp/siltwake-polish-1-slice1-r1-fix-integration/`. Originals remain in `/tmp/siltwake-polish-1-slice1-r1-fix/` and prior review directories.

- Fresh root `npm run check`: strict typecheck, **275/275 tests**, no failures/skips, production build. Economy and diff checks pass. No repeated unrelated full campaign/terrain/carrier route.
- Independently verified all **47** sealed author payloads and **37 source / 25 test / 27 build** file hashes, first in the author checkout and then against root. Final JS is `index-CqYw5oJu.js`, SHA256 `5dc12ca6271db4a51da767b746a70e90fd7c1f20007fcc3c8228610b0a937f6b`. The first root identity read ran while Vite was replacing dist and hit a missing index.html; after awaiting successful build all identities match. This is a verifier ordering error, not a product failure.
- Repeated root's original synthetic real-app probe on current compiled source. SELECT and BUTTON Tab now retain Hold, tick311 and capture count1 over60 frames, whereas prior source resumed and advanced to370/capture2. Shift+Tab and KeyK from SELECT also remain paused. `tab-probe.mjs`/`tab-probe-results.json` preserve this focused correction proof separately from the original red probe.
- Read the native observer, final183-row trace,61 markers and assertions. Root independently checked the **19 panel Tab intervals**: panel, tick, capture count and unlocked state remain invariant. Native key events are trusted. Actual focusin events support expected traversal and boundary wraps. Return/eligible letter requests and subsequent native lock state remain; Escape does not request capture.
- Visually inspected final Hold storage before/after, Notebook reverse wrap and expanded settings traversal. Visible focus rings and panel state match the native trace. These are author captures on exact final source, not a root browser run.

Two trace qualifications matter: delayed `keydown-after` callbacks can follow another action. The article→Return focus event is row103, before deliberate refocus at104; late row105 is not its endpoint. Carrier reverse wrap reaches Notebook at124, then the next Tab reaches Return at126; delayed128 must not stand in for reverse-wrap focus. Likewise immediate panel Return/Escape sees lock true before the queued release callbacks; count actual requests/state rather than treating every callback as a separate success. Root's `root-native-inspection.json` records these distinctions. No production defect is established by that observer scheduling.

## Remaining limits and continuation

Author closed the sole owned incognito tab/server normally, no recordings,5191 free; shared hosts/user/peer/tab14 preserved. Root opened no browser/server. Existing human-feel/native-drag, muted audio, software-rendering/GPU, sampled terrain cost and full-campaign limits remain. Root inspected keyboard behavior rather than replaying unchanged routes; prior route/save evidence stays source-attributed and can be reused with explicit source equivalence.

Freeze a new candidate and dispatch separate fresh non-author Astra xhigh and Sol6.1 max tasks. Both cover all original nine criteria, both R1 reports/disposition, this correction and its new evidence. Until both accept, the full slice remains provisional. Slice2, required stage1 Opus and M2–M4 follow automatically.
