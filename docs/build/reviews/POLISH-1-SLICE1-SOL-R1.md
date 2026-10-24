# POLISH-1 SLICE1 — independent Sol review, round 1

**REQUEST CHANGES** on **`88f1f71b0ddb38c2f5d325a527afd0c15768d3e9`**, covering the entire composed **1A + 1B + 1C** batch against **`61fcc3033292f9412a795a2388616a4f926ece22`**. One new P2 control regression blocks criterion 5 and consequently criterion 9. The three prior visual findings are corrected within this slice's scope. No other blocking finding was identified.

2026-10-18. Fresh independent **non-author** reviewer, actual runtime **T3 Code / Codex harness, `gpt-6.1-sol`, effort `max`**. Confirmed the session's own `turn_context` fields, including after compaction, and the injected runtime information; receipt `runtime.json` below. This was the existing T3-bound checkout `/home/worker/.t3/worktrees/subnautica-clone/t3-66502914`, branch `t3/review-polish-1-slice1`, clean at the exact candidate before review. No checkout creation/rebinding, peer review consultation, children, production/test edits, parent edits, push, PR or merge. Only this report is committed. Root retains reconciliation and acceptance authority; no leaf or earlier M1 acceptance is substituted for this gate.

All reviewer receipts and derivatives are under **`/tmp/siltwake-polish-1-slice1-sol-r1/`**. Author/root artifacts were read only.

## Blocking finding

### SOL-P1-1 — P2: Tab from a panel form control resumes play and captures the mouse

**Source:** [`src/runtime/app.ts`, lines 240–244](../../../src/runtime/app.ts#L240). The new shortcut condition explicitly exempts Tab from `textEntryHasFocus(event.target)`, then calls `resume(true)` when Hold is open. It therefore treats forward focus navigation from an actual `SELECT` as eligible intent to play/capture. On other panels the same branch switches to Hold. The base handler only intercepted panel shortcuts while gameplay was active, so this panel-focus regression is introduced by this batch.

**Independent production reproduction on the exact candidate:**

1. Open the built game with fresh incognito storage and default Captured preference. Start New expedition. Focus Skip and press native Enter to complete the opening immediately.
2. Press native Tab from the canvas to open Hold. The native lock releases; simulation is paused at tick 88.
3. Focus the real `#storage-from` selector (the trial used DOM `.focus()` solely to place focus; the action key was a native T3 `preview_press`, with no synthetic dispatched keyboard event).
4. Press unshifted Tab, as when advancing from From to To. Actual result: Hold closes, focus becomes `#ocean`, the screen becomes `playing`, and the browser acquires native pointer lock. The native `pointerlockchange` record confirms capture. Simulation subsequently advances; reopening Hold stopped it at tick 408.
5. Control comparison: from `#storage-to`, Shift+Tab moves to `#storage-from`, keeps the panel paused at tick 408 and leaves lock false. Native K from that selector also preserves the panel/focus and leaves lock false.

**Player consequence:** ordinary forward keyboard navigation in the storage form exits the paused UI and confines the mouse. Navigation from the panel's initially focused Return also cannot advance normally. In underwater preparation the same unintended resume re-enables survival progression; no actual cargo loss or underwater injury was induced in this bounded trial.

**Evidence:** reviewer `keyboard-tab-reproduction.json`, `media/storage-tab-before.png`, `media/storage-tab-after.png`, and the exact-source bundle receipt. The before screenshot visibly focuses the From selector; the after screenshot shows active gameplay. The fresh trial also independently establishes real native capture/release and immediate focused Skip activation, without claiming native relative-motion feel.

**Requested correction:** distinguish deliberate gameplay/panel-toggle shortcuts from normal Tab traversal of panel controls. At minimum, do not intercept Tab in a form entry control; preserve forward navigation from the panel's focused controls as well. Keep explicit Return/Resume and the requested eligible same-panel shortcuts usable, including K/J from Return. This is a focused input guard correction, not the deferred menu hierarchy redesign.

**Verification:** add a meaningful focused-control regression to the app tests and repeat a native keyboard trial. From real selects, inputs and actionable panel controls, Tab/Shift+Tab must traverse without changing screen, tick or capture count. Confirm intentional eligible panel toggles and Return still work; Escape must still release/resume without capture. Existing [`tests/app.test.ts`, line 426](../../../tests/app.test.ts#L426) checks K/J with text-entry targets but omits Tab, explaining why all current tests pass despite this defect.

## All nine acceptance criteria

“Pass” below is a bounded result for this candidate and slice, subject to the declared evidence limits. It grants no stage/full-game acceptance.

| # | Result | Independent assessment |
| --- | --- | --- |
| 1 | **Pass** | Reviewed `targeting`, progression/action dispatch, host metadata, prompt and renderer consumers. One pure current-state aimed query supplies E/Q, prompt and cue; strict body reach and LOS still apply inside host volumes. Ahead/behind/adjacent/zero-distance, known evidence, empty/sort/tend, protected maintenance, disabled/unpowered craft, caches/services and explicit-target refusals have substantive current tests. Scanner/noise rules and protected saved recovery feedback remain. Real regulator/intake/service imagery and the seeded cache diagnostic corroborate the selection/action paths. |
| 2 | **Pass** | LOS uses supplied solids/terrain; registered optical ribs require matching canonical bounds, avoiding global leakage into empty/local worlds. Reviewed point/parallel segment handling, finite checks, host-specific exemptions and unrelated obstruction controls. Current tests cover walls, containment, real rib gaps, invalid coordinates/terrain and detached local rosters. Independently replayed the separately seeded blocked/clear cache exports: both physical poses clear, optical LOS false/true, target absent/present, and only clear E emits the correct inventory intent. Existing movement/collision is unchanged. |
| 3 | **Pass** | `DART_BUILD_YAW = π` is assigned only by paid `dart_base` fabrication; `makeVehicle`, decoding and other hulls retain prior headings. Independently applying the paid recipe to the actual before export reproduces the **entire** actual after export, including resources/metrics. Historical yaw-zero save roundtrips unchanged. The distinct actual new and legacy launch traces/media are coherent; the legacy boards at yaw 0 and is then deliberately turned. Current hull tests exercise the actual clear departure lane without changing handling/geometry. |
| 4 | **Pass** | Reviewed clipped positive actual hull-loss event emission, detached origin, centered/coalesced transient UI/audio, validated panel intents and existing-record focus. No panel intent escapes an action refusal. Retained cue is fogged/depth-tested with no depth writes; 2,000-target lifecycle test adds no mesh/material/geometry and disposes safely. Inspected actual impact/slow-contact sequence and notebook/service/cache panels. Nonpilot camera now directly uses the targeting eye height; opening and hull-local pilot camera contracts remain. Startup trace qualifications are explained below. |
| 5 | **Fail** | **SOL-P1-1.** Other reviewed capture generations, deliberate activation, denial/cooldown fallback, intentional release ordering, stale completion, interruption/replacement/disposal and tolerant remembered settings are covered by current tests and attributed author traces. Native entry/release is independently reproduced. Those successes do not cure the actual form-Tab recapture. |
| 6 | **Pass** | Moving healthy craft use cancellable 0.35 s presentation holds; semantic sim exit remains authoritative for depth/clearance. Tests cover E/X taps, one completion, pause/blur/panel cancellation, same-ID replacement and all immediate emergency cases. Author ordinary step traces retain cancelled holds and one eventual exit; emergency/depth scenarios are explicitly diagnostics. Opening canvas Space hold is 0.8 s; the real focused Skip button activated immediately with native Enter in my trial. No movement/physics/save-schema tuning. |
| 7 | **Pass** | Inspected all twelve final stock/empty two-angle images, two before-selection images, actual sampled route/deck motion and support/topology receipts. Full and depleted sites remain identifiable and supported. Ordinary earned branches show collection/depletion/sorting/restock and food/C03/services; no new-campaign claim. Current tests check actual float32 triangles, shared seam topology, hidden deck extraction, transformed support, stock lifecycle and all twenty source target views. Independent local terrain/replay measurements support P1-VIS-1/2/3 closure, detailed below. |
| 8 | **Pass** | Fresh current checks pass **265/265**, strict typecheck/build and economy. Full actual 1C and 1B reload states independently reproduce after 80 neutral ticks; all 28 submitted 1C exports and five historical earned originals roundtrip. Verified source/test/build/artifact attribution and read-only originals. Dependencies/config, schema/content, source yields/positions, recipes, hull shapes and writer/session policies have no unintended change; session production diff is grammar only. |
| 9 | **Blocked by SOL-P1-1** | Added prompt/controls/feedback copy is concise; essential captions, recovery warnings and persistence errors remain. No dependency addition or separate scope violation found. Terrain cost and lifecycle/hardware limits are disclosed. The unresolved control defect prevents the required “no unresolved blocking defect” conclusion. No additional menu/air/encounter/rib-collision redesign is requested here. |

## Review coverage and current checks

Read AGENTS, STATUS first, PLAN, CONTRACTS, revised authoritative prompt, settled map, historical tracker, delivery/review gate, POLISH-1/1B/1C and the round-1 brief; all six POLISH author/integration evidence records; Opus R2 report/disposition and implementation consultation; relevant integration, world, fleet/survival, story/guidance, graphics and glossary specifications. Reconciled tasks govern advisory conflicts. No superseded short-game implementation was executed.

Reviewed the complete composed production/test diff and its dependencies: all **18 changed production files** across sim, registry, runtime/input/session, UI/CSS, renderer/environment/expedition/terrain/cue and audio; all **11 changed test/support files**. Examined callers of the new required `WorldQueries.lineOfSight`, optional renderer overlay, transient events and preference fields. No runtime dependency/package/lockfile change. The modules speed fixture's explicit yaw 0 preserves its existing fixed-direction assertions rather than weakening them.

| Command / independent check | Actual result |
| --- | --- |
| Initial `npm run check` before dependency installation | Stopped with `tsc: not found`; this fresh worktree had no installed dependencies. |
| `npm ci` then `npm run check` | Success: strict typecheck, **265 tests passed, 0 failed/cancelled/skipped**, production build. Logs `install.log`, `check.log`. |
| `node scripts/check-m1-economy.mjs` | Success; `economy.log`. Arithmetic/transaction coverage, not route margins, pacing or enjoyment evidence. |
| `git diff --check` | Success. |
| Reviewer `replay.mjs` | Whole actual 1C state **9266→9346** and 1B **8157→8237** equal current-production neutral continuations. Production codec normalization only; no filtered fields or rounded state comparison. |
| Save compatibility and paid transaction in that script | **28/28** 1C export roundtrips; five earlier earned originals roundtrip; actual paid before→after state exactly matches current command; old yaw 0/new yaw π remain distinct. |
| Seeded rib replay | Both poses physically clear; blocked LOS/target/panel = false/null/null; clear = true/`rib_optical_cache_900`/matching inventory intent. |
| Reviewer terrain sample | **14,947** deterministic random non-deck samples from 16,000 attempts: maximum absolute float32-triangle error **0.02595646946 m**, at X1.217096049/Z−29.794147594. Below 0.05 m in this sample; no continuous/global bound claimed. |

The exact current JS is **`dist/assets/index-L7oBd6Sf.js`**, SHA256 **`89d49a1c1037342f3d82f5481a8916993d559bf12aa08cdefb1b9410e3265065`**. Existing >500 kB chunk warning remains. Candidate src/tests/config match production assembly `cd4ef9f832db52742aa127399b5a595ca19fca4b`; later candidate records do not change production.

Exact replay inputs: 1C `final-reload-before.json` / `final-reload-after.json`; 1B `final-new-dart-launched.json` / `final-reload-after.json`; paid transaction `final-before-paid-fabrication.json` / `final-after-paid-fabrication.json` in the 1B directory. The 28 1C exports and their classifications are enumerated in original `new-save-manifest.json` and reviewer `replay-results.json`. Historical originals are `/tmp/siltwake-m1-play-presentation/saves/{alloy-first,island-glass-east-bundles,dart-fabrication,canopy-pre-warning,first-return-before-service}.json`.

`provenance.json` independently verifies all **200** sealed 1C artifacts, **10** seal entries and committed evidence, plus **37 source / 25 test / 27 build** hashes against the candidate/current output; all **160** 1B artifact entries and **17** 1A receipt entries also match. `originals-snapshot.json` and final `cleanup.json` rehash **425** files across the original author/root evidence directories, with **zero changed/missing files**. Existing failed/preliminary captures retain their original classifications. Reviewer scripts/results are new files in the reviewer directory.

## Prior findings and evidence interpretation

**P1-VIS-1 — corrected.** Workshop/headland plates have clear silhouettes, ribs and upward-facing tags. Pale frames/tags persist when depleted; west glass has visible faceted stock and surviving mineral ridges. Workshop east's real deployed buoy partially occludes the left frame, but the north view after packing it makes the anchor clear. Headland remains a steep close approach; its before-selection image demonstrates visibility, not an in-range action. The west prompt/cue can sit between geological ridges, but the host is visibly identifiable. Useful support is established by actual images plus transformed-triangle tests, not exposure percentages alone.

**P1-VIS-2 — corrected locally.** Independent interpolation at original X−14.197/Z−41.736 places the recorded eye **0.639953603 m above** the new surface. Exact unrounded ordinary replay export gives **0.644378486 m**; the rounded route sample gives approximately 0.644456 m. These distinct input precisions are consistent. Valid route records in the five inspected arrays have minimum eye clearances: workshop 1.62 m, headland 0.642369 m, west 0.640278 m, original-rim replay 0.644456 m, clean workshop 1.62 m. The close original-rim image is clearance evidence, not a clean resource overview. The author's separate 339,296-point grid maximum 0.025906701 m is a sample; my differently located random sample is slightly higher, still below the target. Neither proves all continuous terrain/routes.

**P1-VIS-3 — corrected.** Source extracts only terrain faces hidden under the existing opaque workshop deck, with exact perimeter/ramp edges and shared transition vertices. The current topology test rules out interior unpaired/nonmanifold edges. Actual deck frames at 40/42/44/46 s and the sampled moving sequence show stable planking across changing views. Physical floor, ramp, rails and movement remain unchanged.

**Two startup camera records:** independently scanned the actual `route` arrays rather than conflating them with the input/event log. Only the first headland and west/control rows retain menu camera `(25,13,44)` while the newly resumed/imported simulation/UI state is already available. The next sampled records carry the expected instantaneous sim eye and later records match. The renderer's menu camera and next-present ordering support excluding those two records from same-frame camera claims; they provide no proof of a rendered wrong-eye gameplay frame. I found no sustained mismatch in the retained route samples. This is a sampled assertion, not inspection of every presented frame.

**Cost/lifetime:** inspected the 1C scene comparison: **391,011→485,460 triangles**, **99→102 meshes**, **18 materials unchanged**. Terrain is **80,421 vertices / 159,882 triangles** with 32-bit indices. Scene attribute/index buffers grow about **3.45 MB**; the recorded one-run NullEngine scene creation rises **577→823 ms**. Lower 2/4-subdivision sampled alternatives miss the tolerance. Retained/disposed geometry tests pass; cost is bounded but material for later representative-GPU profiling. This review makes no GPU frame-rate or loading-performance acceptance claim.

## Actual media and step evidence inspected

Author originals remain at their original paths. These are inspected author captures, not a reviewer campaign playthrough. Earlier 1B media remains attributed to its final 1B source (`8c15277`, production-equivalent to `c1e5ca6`), not relabelled current 1C captures. The unchanged controls/sim paths, fresh current checks and current exact transaction/reload replays support reuse for those behaviors; 1C media establishes the revised terrain/art.

Under `/tmp/siltwake-polish-1c/`, visually inspected:

- `final-workshop-stock-east.png`, `final-workshop-stock-north.png`, `final-workshop-empty-east.png`, `final-workshop-empty-north.png`.
- `final-headland-stock-north.png`, `final-headland-stock-west.png`, `final-headland-empty-north.png`, `final-headland-empty-west.png`.
- `final-west-glass-stock-north.png`, `final-west-glass-stock-east.png`, `final-west-glass-empty-north.png`, `final-west-glass-empty-east.png`.
- `final-headland-stock-before-selection.png`, `west-glass-stock-before-selection.png`, `SEEDED-rib-blocked.png`, `SEEDED-rib-clear.png`, `SEEDED-rib-opened-cache.png`, `final-control-services.png`.
- `final-workshop-deck-stock-depletion-motion-40s.png`, `-42s.png`, `-44s.png`, `-46s.png` (same full prefix), plus reviewer `media/deck-38-46.jpg`, a 1 fps sampled deck sequence around that interval.

Under `/tmp/siltwake-polish-1b/`, visually inspected `final-fresh-regulator-aim.png`, `final-fresh-regulator-focus.png`, `terminal-intake-scraps-cue.png`, `terminal-intake-record-cue.png`, `final-new-dart-boarded.png`, `final-legacy-lane.png`. The intake cue is partly depth-occluded near its box; the physical host is visible, consistent with ordinary depth testing. No through-wall marker is inferred.

I also decoded the following original movies into new reviewer-only eight-frame sheets and inspected each sequence. `media/sample-index.json` records exact source filenames, durations and sampling settings; sheet labels are the nominal `fps=1/(duration/8)` output timeline, not exact original seek timestamps. This is sampled motion inspection, not continuous viewing of every frame:

| Original movie | Duration | Nominal sheet spacing | Corroborating observations |
| --- | ---: | ---: | --- |
| 1B `final-new-paid-dart-launch.mp4` | 68.329933 s | 8.541242 s | Earned approach, paid fabrication UI, boarding and clear departure. Additionally inspected exact seek frames **61/64/67 s**, saved as `media/new-launch-{61,64,67}s.jpg`. |
| 1B `final-legacy-departure.mp4` | 34.748867 s | 4.343608 s | Separate old hull boarding/turn/departure; preserved yaw is confirmed by its trace/export. |
| 1B `final-panels-impact.mp4` | 21.975667 s | 2.746958 s | Panel→pilot contact; centered hull-loss notice appears and then clears during continued slow contact. |
| 1B `final-exit-cancellations.mp4` | 31.904733 s | 3.988092 s | Aboard/pause/return/exit transitions, correlated with cancellation trace. |
| 1B `final-capture-context.mp4` | 31.767333 s | 3.970917 s | Pause/context restoration remains at menu; trace distinguishes actual lock from injected interruptions/denial. |
| 1C `final-headland-stock-deplete-sort-restock.mp4` | 167.421467 s | 20.927683 s | Earned branch import, movement, stock/empty frame and sorting/restock state sequence. |
| 1C `final-west-empty-sort-restock.mp4` | 69.543000 s | 8.692875 s | Persistent depleted ridges, pause and resumed active sorting. |
| 1C `final-shore-C03-services.mp4` | 52.053067 s | 6.506633 s | Both foods, known-record panel and services/deck movement. |
| 1C `original-west-rim-replay.mp4` | 6.844733 s | 0.855592 s | Close terrain-clearance replay; not a resource-overview claim. |

Raw step/input evidence inspected includes 1B `trace-final-new-dart.json`, `trace-final-legacy.json`, `trace-final-controls.json`, `trace-final-capture-context.json`; 1C `trace-final-workshop-pre-reload.json`, `trace-final-headland.json`, `trace-final-west-and-controls.json`, `trace-original-west-rim-replay.json`, `trace-workshop-clean-empty.json`; and their actual full saves. Selected trace rows are copied into reviewer `trace-final-*-selected.json`; full-state replay outputs remain in `replay-results.json`/`replay.log`.

New paid fabrication is at tick 7551; boarding at 7917 retains π and the actual launch export at 8157 has Z≈−0.190. The **separate legacy** boards at tick 6688 with yaw 0 and departs after turning, exported at 7168. Impact trace reports `Hull −1.5%` at 12615, absent during the later slow contact at 12839. Exit taps/cancelled holds remain aboard; the later continuous X finishes at 13431. These observed step sequences do not establish native human timing/comfort.

## Limits and closure

1C ordinary cycles use imported earned branches and their real subsequent exports, not a newly played whole campaign. The rib cache is a **separate labelled seeded, codec-valid production diagnostic**. Its optical result is useful but is not an ordinary encounter or physical rib-collision redesign. Earlier preliminary/failed reload/capture files are retained without promoting them to final proof.

Native entry/release exists in author evidence and my bounded trial. Author relative look, selected interruption events and denial injection are synthetic; native drag tool timeout remains unresolved. No natural OS blur/permission-denial trial was added. Software renderer/SwiftShader and muted audio cannot establish dedicated-GPU performance, audible mix, native drag/relative-motion feel, human enjoyment, duration or campaign acceptance. These are disclosed limitations, not invented passing results. Slice2 menu/notice/air/encounter/rib-collision work and later whole-game gates remain outside this verdict.

Before any browser activity read both `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md`. Verified the actual Linux Chromium renderer process/executable under `/home/worker/.t3/tools/chrome-headless-shell/linux64/154.0.8037.92/`, not only the shell hostname. Used exactly one owned T3 incognito tab on checked-free **5194**, serving this exact build; initial local storage was empty. `browser-machine.json`, `browser-host-flags.json` and the keyboard receipt identify `factory-worker`, Linux x86_64, software-rendering/muted flags and the exact JS URL. No Windows/physical desktop pointer actions, browser relaunch loops or process-name kills.

Owned tab **`tab_2p_0430977b-1ed3-45f2-ac72-3683f9fe8942`** closed successfully through `t3_preview_close`; subsequent preview status has no attached tab. No recordings were created. Owned preview server exec session **79195** stopped normally by Ctrl-C (exit 130); successful socket bind confirms **5194 free**, and its owned renderer PID 1766152 is gone. Shared browser hosts, historical tab14, user/peer tabs and storage were preserved; no foreign cleanup performed. `cleanup.json` records closure and the 425-file original-evidence recheck. Build/dependency/test outputs remain ignored local artifacts; report-only commit and final clean git status are returned to root.

**Final verdict: REQUEST CHANGES for the complete frozen slice on `88f1f71b0ddb38c2f5d325a527afd0c15768d3e9`, pending SOL-P1-1.**
