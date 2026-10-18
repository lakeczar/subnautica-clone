# POLISH-1 slice1 R1 keyboard correction

**Provisional author handoff. SOL-P1-1 is corrected by the bounded checks below; root inspection and fresh paired round2 of the entire original nine-criterion slice remain required.** This does not accept the combined slice, slice2, stage1 or the remaining campaign.

## Baseline, runtime and scope

- T3-owned checkout `/home/worker/.t3/worktrees/subnautica-clone/t3-a8b4da6f`, branch `t3/siltwake-keyboard-correction`; verified clean at exact parent **`7eec795a5619042931199a73b70bca563aae6a30`** before edits. `baseline.json` records this.
- Actual **`gpt-6.1-sol` / `max`**, confirmed before editing from this session's own `turn_context`, including cwd and collaboration settings. Reduced receipt: `/tmp/siltwake-polish-1-slice1-r1-fix/runtime.json`. Session: `/home/worker/.codex/sessions/2026/10/18/rollout-2026-10-18T03-29-53-01a14e21-b0e4-7b50-bcb3-8f44b1258c3d.jsonl`, timestamp `2026-10-18T08:29:53.606Z`. T3 catalog selection was also inspected; its provider defaults are not substituted for effective runtime.
- Read AGENTS/STATUS first, PLAN/CONTRACTS, revised build input and relevant specification pointers, settled map/tracker, original POLISH-1/POLISH-1B, both complete R1 reports, root reconciliation and the binding correction brief. Used the diagnosing-bugs skill for failing-before regression and cleanup. Root's accepted reproduction already established the cause; no speculative capture/physics diagnosis was needed.
- Only four source/test paths changed: `src/runtime/app.ts`, `src/ui/view.ts`, `tests/app.test.ts`, `tests/presentation.test.ts`. No support-file edit was needed. This evidence document is the fifth and final assigned path. All other tracked paths remain unchanged.
- No children, peer communication, parent mutation, push, PR or merge. No new dependency, schema, save/session/writer, simulation, economy, physics, art, copy or subtitle change. No mouse-warp suppression or slice2 redesign.

All new receipts are under **`/tmp/siltwake-polish-1-slice1-r1-fix/`**. Original review/root receipts were read only; final rehash matches all **146** files fingerprinted across the three inspected R1 review/root directories. Other original author archives were not rewritten.

## Source commits and resulting behavior

1. **`7c1cbfd651235462f46c98f95cf7eb7e42305e34`** — restrict the Tab shortcut to active, non-control gameplay focus; honor already-handled keys. Open-panel Tab/Shift+Tab cannot toggle, switch, resume or request capture. The existing focus trap now wraps Hold forward as well as backward, consumes its handled wraps, and handles existing non-sequential panel focus. Its eligible controls include links, summaries, form fields and explicit focusable content. I/K/J/V remain available from buttons while text entry, modifiers and repeat remain protected.
2. **Final source `da1a9dc8299b6ca1935e465abcd8b8ae1a3bbdd5`** — use actual element visibility in the existing Tab trap. The first native trial exposed a menu boundary problem: Chromium retains nonempty layout rectangles for descendants of closed `<details>`. `checkVisibility()` excludes those unfocusable descendants while retaining the visible summaries. This is an existing focus-navigation correction within the assigned view seam.

Opening focus behavior and all capture/pause/input lifecycle code remain unchanged. Explicit Return/Resume and eligible same-panel letters still deliberately capture; Escape never requests capture. The full existing denial, cooldown, stale-completion, interruption, replacement and remembered-Drag tests remain enabled.

## Failing-before and green checks

| Command / receipt | Actual result |
| --- | --- |
| `npm ci` | Installed pinned dependencies without a tracked dependency/config change; `install.log`. |
| `npm exec tsc -- -p tsconfig.test.json`, then `node --test .test-build/tests/app.test.js .test-build/tests/presentation.test.js` before production edits | **85 pass / 11 fail**, exit1; `focused-before.log`. Revised double-Tab case observes `playing` instead of `panel`; new panel/HUD guard and wrap regressions also fail. This is synthetic Node/DOM-port evidence. |
| First native production trial on `7c1cbfd` | Panel navigation passes; menu reverse wrap fails by selecting an invisible closed-details descendant. `native-initial.json`, `menu-visibility-diagnostic.json`, `media/initial/`. Intended-outcome marker labels in that trace are not passing assertions: actual state shows the failed wrap and subsequent New confirmation, which was cancelled without replacement. |
| `node --test --test-reporter=tap --test-name-pattern='menu settings' .test-build/tests/presentation.test.js` before visibility correction | **0 pass / 1 fail**, exit1; `menu-before.log`. The DOM port models a collapsed descendant with retained rectangles. |
| `node --test --test-reporter=tap .test-build/tests/app.test.js .test-build/tests/presentation.test.js` on final source | **96/96 pass**; `focused-final.log`. |
| Final `npm run check` | Strict typecheck, **275/275 tests**, 0 failures, production build; `check-final.log`. Test duration10955.919107ms; build8.92s. Existing large-chunk warning remains. |
| Final `node scripts/check-m1-economy.mjs` | Pass, nine recipes and both staged scenarios; `economy-final.log`. Arithmetic/transactions only. |
| `npm run build` after committing final source | Pass; `production-final.log`. Final committed production was used for the complete repeat below. |
| `git diff --check` and assigned-path audit | Pass. `source.diff` contains the complete bounded source/test change. |

The app regressions exercise all four panels, Tab/Shift+Tab from buttons, selects, inputs, textareas, links, summaries and non-control targets; panel identity, complete paused state, tick, capture requests and unlocked state are invariant. They also cover gameplay/HUD Tab, already-handled keys, all I/K/J/V toggles, modifiers/repeat, editable content, explicit Return and Escape. App tests use real compiled app/session/clock/save logic with substituted presentation/input ports. Presentation tests exercise the real GameView listener and rendered command controls with a minimal DOM port; they do not implement native browser traversal. Native proof is separate below.

## Final production identity

`build-identity-final.json` binds the final source, all source/test/build files and HTTP byte checks. Final loaded JS:

**`dist/assets/index-CqYw5oJu.js`** — SHA256 **`5dc12ca6271db4a51da767b746a70e90fd7c1f20007fcc3c8228610b0a937f6b`**.

Both HTML and this JS returned HTTP200 and match the rebuilt files. Final browser metadata confirms that exact script URL. Earlier `build-identity.json`, initial media and `native-initial.json` remain attributed to `7c1cbfd`, not relabelled final-source proof.

## Final native T3 keyboard trial

Read both browser-rule files before browser work. Port **5191** was checked free by socket bind. Used one owned **incognito** tab, `tab_2r_0430977b-1ed3-45f2-ac72-3683f9fe8942`, on `http://localhost:5191/`. Verified the actual new Linux renderer **PID1781050** and executable `/home/worker/.t3/tools/chrome-headless-shell/linux64/154.0.8037.92/chrome-headless-shell` on **factory-worker**, plus the page's Linux UA/platform. This is process evidence, not shell hostname alone. `browser-host-before.json`, `browser-process.json`, `native-final-meta.json` identify the host and software-rendering flags.

After the visibility correction, rebuilt committed production, cleared only this task's origin/storage, and repeated from fresh New expedition. No imports, seeded scenario, scene setter, state grant, temporary DOM controls or production debug hooks. Native `preview_press` delivered every tested action. DOM `.focus()` only selected existing controls/articles for individual starting points. The temporary `observer.js` records events/state and delegates the unmodified native pointer-lock method; it neither grants nor denies capture.

| Native final sequence | Observed result |
| --- | --- |
| Opening canvas Tab → Act → Skip; Enter on focused Skip | Immediate completion, canvas focused, opening hidden. No added capture request; `opening-focused-skip.png`. |
| Gameplay canvas Tab | Hold opens at **tick176**, initial Return focus; native lock releases, requests stay **1**. |
| Hold Return Tab / nav Shift+Tab; From Tab → To / reverse; K from selector | Correct control traversal, selector retains K; Hold stays at **176**, unlocked, requests**1**. Real last Store materials button Tab wraps to Return; reverse wraps back. |
| K from Hold Return switches to Fabricate; its initial/interior/boundary Tab/Shift+Tab | Fabricate stays at **176**, unlocked, requests**1**, including last reserve-cells action ↔ Return. |
| Same-panel K from focused Return | Resumes and requests**2**; a trusted native lock-change record observes lock true. K reopening releases at512. Escape resumes without capture; requests remain2. |
| Notebook initial Return/interior/boundary navigation; focused existing C01 article in both directions | Notebook remains **tick528**, unlocked, requests**2**. Its Hint action ↔ Return wraps; the non-control article routes to Return/Hint without leaving the panel. |
| V opens the carrier information panel; initial and both boundary directions | Same paused **528** and requests**2**. This does not start the seeded carrier fixture or exercise carrier gameplay. |
| Native Enter on panel Return, then Escape | Enter observes gameplay/canvas native lock true, requests**3**. Escape pauses/releases with no recapture. These immediate transitions precede two queued lock callbacks which both observe the released state; do not count them as separate capture successes. |
| Menu summary Enter, Tab to Rendering select, Tab to Sensitivity input, reverse | Normal native traversal, menu remains **528**, unlocked, requests**3**. First Return Shift+Tab now wraps to visible **Save safety** summary, then Tab wraps back to Return. |
| Native Enter on menu Return | Gameplay/canvas and native lock true, requests**4**; trusted lock-change confirms entry. |
| Focused HUD Hold Tab → Notebook / reverse | Normal navigation, remains gameplay and captured; requests stay4. Simulation advances normally while gameplay is active. |
| Final Escape and subsequent paused observations | Menu/Return, lock false, requests**4**, tick **696** throughout the later two animation frames and pre-cleanup observation. |

`native-final-trace.json` has **183** event rows; `native-final-markers.json` has **61** labelled observations. `native-assertions.json` verifies all **19** panel Tab actions preserve panel/tick/capture/lock, zero untrusted keyboard events and zero Escape recaptures. There are four delegated native capture requests and eight trusted `pointerlockchange` records, with the queued-event qualification above. No synthetic browser KeyboardEvent dispatch was used.

Eight actual final-source screenshots are in `media/final/`, indexed by `native-final-media.json`: opening focus, Hold storage before/after Tab, Fabricate reverse wrap, Notebook reverse wrap, settings traversal, native Return capture and final Escape pause. I inspected the selected opening, selector, Fabricate, Notebook, settings and captured-game images. The focus rings and panel/menu states agree with the trace. `native-final-page.json` retains the final page/network/console observation; no page error was reported.

## Limits and resource closure

This is bounded keyboard/focus/capture verification. Synthetic tests cover additional text-entry target types; native form proof uses existing storage selects and menu select/range input. No native drag, physical-mouse feel, natural OS blur/permission denial, human enjoyment/duration, audio mix or dedicated-GPU performance claim. Rendering is Chromium154/SwiftShader at1280×800 CSS pixels/DPR2 with muted browser audio. Existing full campaign/carrier/resource/terrain evidence was not replayed because this isolated input correction does not change those systems.

Removed observers, cleared the owned origin's journal, and closed only the owned tab through `t3_preview_close`. No recording was created. Owned Vite exec session **5257** stopped normally with Ctrl-C, exit130; a new socket bind confirms5191 free. Owned renderer1781050 is gone; shared browser hosts827911/847778 remain alive. Preview status has no attached tab. User/peer/historical tab14 resources were preserved; no process-name kill, relaunch loop, Windows pointer operation or foreign cleanup. `cleanup.json` records closure and unchanged originals.

`artifact-manifest.json` seals **47** temp payloads, including the final eight images and all check/native/cleanup receipts. Checkout source and evidence are committed separately; final terminal handoff supplies the evidence commit and clean-state receipt. Root alone performs integration, inspection and the fresh full-slice review dispatch.
