# POLISH-1 slice2 2C — preparation panels

Author implementation and checks are provisional. Root's full-slice independent Astra/Sol gate remains open.

- Source/tests: `705ae5efd68edad2771ac37d2c203e418639b870`.
- Exact clean dispatch parent: `45612f7740490f569eb8a311a7fde5357823f97a` (C0 production author `72c3355`, root assembly `e3c3ce1`).
- Worktree: `/home/worker/.t3/worktrees/subnautica-clone/t3-1b6b662e`, branch `t3/preparation-menus`.
- Actual session `turn_context` confirms `gpt-6.1-sol`, effort `max`, and this worktree in both contexts. Extract: `/tmp/siltwake-polish-1-slice2-2c/runtime-confirmation.json`.
- No children, peer instructions/polling/source dependency, pushes, PRs, merges or parent edits. No spoiler appendix was read.

## Implemented scope

Changed only `src/ui/panels.ts`, new `src/ui/panels.css`, the panel shell and replacement-reset call in `src/ui/view.ts`, existing panel declarations removed from `src/style.css`, the stylesheet import in `src/main.ts`, `tests/presentation.test.ts`, and new `tests/preparation-panels.test.ts`. This evidence is a separate documentation commit. No simulation, world, registry, save, runtime, input, HUD or format implementation changed; the modal focus-trap body and public GameView/UiActions/PanelKind interfaces remain intact.

Hold starts with capacity/equipment and carried cargo/actions, followed by whole-set storage and accessible container disclosures, nearby craft service/fitting, Power and Elsewhere. Cells have deterministic `Reserve cell N` labels; module names come from the registry. The existing meal/cell/buoy and transfer commands retain their exact operands and increments. Emergency food is available with an empty inventory. Supported service, fitting, socket/capacity tradeoffs, local recovery controls and actual refusals remain available. Power's summary exposes pulse cost/next usable cell; its expansion retains recharge, reserve-hull and no-charge alternatives/restrictions. Active loss/cache/operation reports remain contextual in Hold and complete recovery preparation is in Notebook.

Fabricate starts with current bench/restoration and known required-bench direction. Only blueprint-known recipes are shown. Actual `craftingRefusal` determines readiness; completed **one-time** recipes alone move to the collapsed reference group. Ready work precedes actual material shortages and other blocked work. Costs/usable counts use registry data, `available` and `fabricationContainers`; unusable carried/elsewhere stock is separate and non-overlapping. Protected maintenance stock has its own counts. Prerequisites use recipe labels, unrestored lockers stay locked, and specific output/cradle/duplicate-hull refusals remain beside the command. Fitting/power live in Hold; habitats and unfinished berth context live in Notebook; redundant generic sorting buttons were removed without changing aimed E sorting/tending.

Notebook removes the generic intro/counter and adds a concise Dive check with current oxygen/food/cells/hulls and an explicitly labelled **Full-tank rating 180 s**. Safety and recovery remain expandable. Finding source/provenance, Observed/Hypothesis/Regional lead, current question/interpretation and personal record prose are preserved. Places remain discovered/visited capabilities and the large berth remains future construction.

Storage separates explicit intent from implicit defaults. Semantic pod/workshop/service/craft/buoy/cache anchors replace accessible-roster identity. Unchosen defaults prefer a local locker, then buoy, then craft; a valid explicit choice survives ordinary refresh, panel switches, a changing craft roster and same-site bench/cradle transitions. Invalid/identical destinations explain the fallback, without moving anything. Leaving the site and replacement reset intent. `PanelView.resetSession()` is called from the existing `GameView.resetPresentation()` and clears selection, expansions, commands, highlight and inline result. Native details state is retained across refresh/switch. Full-command semantic keys preserve eligible focus; completed/changed actions focus visible outcomes/summaries or Return. Explicit target focus opens existing ancestor disclosures first.

The single existing `panel-feedback` element/API remains. Notice routing, TTL, HUD priorities and existing toast duplication are unchanged for 2D.

## Checks

All artifacts below are under **`/tmp/siltwake-polish-1-slice2-2c/`** unless another absolute path is given.

| Check | Actual result |
| --- | --- |
| Fresh `npm ci` | Passed; `install.log` |
| `npm run check` | Typecheck, **286/286 tests**, production build passed; `final/check.log` |
| `node scripts/check-m1-economy.mjs` | Passed: 9 compared recipes, two staged production strategies; `final/economy.log` |
| `git diff --check` | Passed |
| Export decode validation | All four baseline/final/save/reload exports valid; `final-route/export-validation.json` |

The 11 additions cover actual recipe grouping/once versus repeatable, authoritative usable counts, named prerequisites/site/restoration, protected maintenance stock, atomic output/clearance refusals, implicit/explicit choice lifetime and fallback, expansion/reset, readable labels/emergency food, semantic command focus after regroup/completion and stale-command invalidation at the GameView replacement seam. Existing command/input/focus/capture/session assertions remain; only four designed copy/location expectations changed. No global fixture or app/input/simulation test changed.

An initial build before dependency installation reported `tsc: not found`; fresh installation resolved it. Earlier expectation failures and corrected runs are retained in `final/test-*.log`. The final check has zero failures/skips. The existing Vite large-chunk warning remains. Economy is arithmetic/staged command evidence, not earned play.

Production loaded `/assets/index-BrHHMmgf.js` (SHA256 `98b150614d0785360a8a265388bb5eeed0fc2ffb2d1df60e6d43993b6d3a07a6`) and `/assets/index-DOaF3wla.css` (`a0a32f6b51f7e54aef711b8704216b8b8f8032cbb5824d10057f1b82eb056b4f`). `source-build-manifest.json` hashes all seven source/test files, index HTML and these bundles; `final-route/production-browser.json` records actual loaded URLs.

## Matched ordinary preparation workflow

Original earned checkpoint: `/tmp/siltwake-m1-play-presentation/saves/first-return-before-service.json`, SHA256 **`edb24efec61cfcd890cfa6c0b3c29286d0d7bd71f533da6673d4c5902f0c0a91`**. Its bytes remain unchanged, with a byte-identical `baseline/import.json`. Before changing layout, the exact-parent production build and complete ordinary workflow were preserved in `baseline/`.

Both measured routes imported those bytes at **960×600 CSS pixels, DPR 1**, using native browser controls: service → travel to the required workshop bench → fabricate acoustic trim → fit it → store remaining materials → return and re-board. There were no grants or direct state writes. The baseline tried Fabricate from the seat and received the real site refusal. The final route read the bench direction and travelled before crafting. The baseline explicitly selected the workshop locker; the final unchosen default changed to that locker on arrival.

| Measured action category | Exact parent | Final source, uninterrupted `final-route/` |
| --- | ---: | ---: |
| Panel/navigation actions | 7 | 6 |
| Wheel scroll gestures (450 CSS px each) | 22 | 4 |
| Preparation commands attempted | 5 | 4 |
| Panel command refusals | 1 | 0 |
| World travel legs (outbound / return) | 2 | 2 |
| Craft exit / confirmed re-board | 1 / 1 | 1 / 1 |
| Failed world interaction attempts | 0 | 0 |

The final six navigation actions were Tab, Fabricate tab, Escape, K at the bench, Hold tab, Escape. The four commands were service, trim fabrication, installation and whole-set storage. Import/setup, screenshots, save/export/reload and subsequent inspection navigation are excluded in both columns. Focus-driven scrolling and panel scroll resets are not wheel gestures. The complete logs and native events are retained, rather than treating Opus's old grouped steps or C0's six layout captures as this workflow count.

Effort remains in the two travel legs, exit/re-boarding, service/fitting below the dense Hold's first screen, and the final approach/aim. The uninterrupted final run needed extra native pitch/yaw corrections and a short approach before its first E. Narrow-angle polling missed windows on the software renderer; the bounded correction history is retained in `final-route/return-look-adjustments*.json` and the raw trace. No elapsed-time or survival-margin improvement is claimed: final saved food was 87.2978%, observed minimum oxygen 75.3889%, versus baseline 93.8672% / 85.0833%. Both finished alive, with the trim installed, remaining two crust/two resin stored in the workshop locker, two meals and two fully charged cells carried.

`baseline/ordinary-result.json` and `final-route/ordinary-result.json` are the full exports. Their inventory, knowledge and maintenance stock are exactly equal. **Fourteen** other raw state differences (ticks, positions, food, threat timer, charge and movement/survival metrics) are fully listed in `final-route/baseline-final-comparison.json`. This is two ordinary workflows, not a complete deterministic replay. Raw trusted key/pointer events, movementX/Y, focus, command keys, camera positions/headings and exports are retained; they do not provide every per-tick input/look command. No orientation field was discarded to claim parity.

Earlier measurement attempts remain separate in `final/`: a helper initially treated sticky navigation as content and issued redundant wheel gestures; an interrupted ordinary attempt initially pressed E without a Board prompt, was caught by exported mode/state, then corrected and re-boarded. Its preboarding exports/images and input are retained. Neither attempt supplies the final table. The original baseline setup attempt is likewise retained/excluded. `final/inspect-hold-initial-960.png` is a misnamed **1280×800 inspection**, excluded from viewport claims.

## Actual images, keyboard and reload

The author inspected the actual following final images, including the genuinely ready trim at its restored bench, rather than relying on DOM positions alone:

| State | 960×600 | 1280×800 |
| --- | --- | --- |
| Final Hold | `final-route/hold-final-clear-960.png` | `final-route/hold-final-clear-1280.png` |
| Final Fabricate, seated | `final-route/fabricate-final-clear-960.png` | `final-route/fabricate-final-clear-1280.png` |
| Final Notebook | `final-route/notebook-final-clear-960.png` | `final-route/notebook-final-clear-1280.png` |
| Ready trim, actual workshop bench | `final-route/fabricate-ready-bench-960.png` | — |

The clear final images re-import the actual ordinary save and wait for the existing import notice to expire naturally; no notice was suppressed. The initial immediate post-reload captures with the existing export toast are also retained. Baseline equivalents include initial Hold/Fabricate, actual ready bench, final bench, Notebook and all three 1280 captures. The baseline ready-bench image retained its previous scroll position and is not a top-of-panel measurement.

At the final workshop, the trim action is visible at approximately y217 without scrolling, with header/navigation/status present. Completion focuses the visible Completed summary; install focuses the socket/outcome section; store retains the complete storage command. Their actual bounds and focus are in `final-route/workflow.json` and the three `*-after-*-focus-960.png` captures. Actual locked-stock/output/storage refusals also retain their eligible command and visible result.

Native keyboard records cover both Tab/Shift+Tab boundaries, closed and expanded Completed/Power/container groups, enabled controls inside disclosures, selectors, and focus after reordering. Initial checks: `final/keyboard-return-escape.json` (37 checked keys, including the earlier 28-key record); expanded Power: `final-route/power-keyboard-checks.json` (30); container disclosure: `diagnostics/container-keyboard-checks.json` (37). Tab never resumes or captures. Collapsing a container skips its transfer controls; switching away/back preserves its expansion. Select arrows work and J in a select stays in Hold; J from an eligible control opens Notebook. Deliberate Return and Escape resume with no pointer lock in Drag mode. Raw traces accompany each record. Native Completed focus after a successful one-time craft is its summary, not a hidden recipe descendant.

Actual final ordinary save/reload exports:

- `final-route/ordinary-result.json`: `4dc7e089a08d1dbe898898c0fc69e7b2535a6ec5527eaa76c72f4808fa12f145`.
- `final-route/ordinary-saved-before-reload.json`: `c6557bbd57e88c3e7e354e7c740f5c7e3a1e6afca81494f87ea53522beb4cfed`.
- `final-route/ordinary-reloaded.json`: `49ea767685599e048a15137fe13a2c19463c77be8f8acfc95d1c8f099bdcaaf4`.

Full exports and `before-reload-full-trace.json` were written before reload. Continue advanced **30 no-input ticks** before Escape paused it. The raw five differences are retained in `reload-comparison.json`; stepping the saved state by those 30 empty-input ticks matches **every** reloaded state field, including both orientations, with no ignored fields (`reload-no-input-comparison.json`). This proves the bounded reload continuation, not preparation-input replay.

## Labelled seeded diagnostics

`diagnostics/fixtures-manifest.json` identifies all eight codec-validated fixtures. `scripts/fixtures.mjs` and `scripts/repeatable-fixture.mjs` preserve their construction. They are excluded from earned preparation counts.

| Diagnostic | Actual result / evidence |
| --- | --- |
| Empty inventory, food 40 at pod | Emergency button visible; ordinary UI command issues one meal; `empty-emergency-*.png`, full result export |
| Known unrestored workshop, stocked locked locker | Restore recipe remains first shortage work, usable counts 0, locker stock shown unavailable; actual craft refuses; `locked-workshop-*.png` |
| Low protected maintenance, abundant public stock | Bobbin uses 1 alloy / 0 glass / 2 membrane, refuses rescue shortage; public stock cannot substitute; `maintenance-*.png` and result |
| Full 16 CU output hold, usable trim costs in locker | Specific output-space refusal and no spend; focused command remains; `full-output-refusal-focus-960.png` |
| Full 32 CU Dart destination | Whole 8 CU material set refused atomically; `full-hold-storage-result.json` |
| Occupied disabled Dart | Tow/salvage disabled; patch/reserve/service controls retained. Actual reserve adds 8% and local patch restores 65% hull using protected stock; `occupied-*.png`, controls/exports |
| Explicit choice, changing accessible roster | Explicit buoy choice survives Dart leaving/re-entering pod range. An explicit Dart choice becoming inaccessible explains Pod fallback. Selecting the destination as From gives an identical-source fallback. `choice-*-results.json`, `choice-*-notice-960.png`, `choice-identical-source-fallback-960.png` |
| Completed one-time versus repeatable | Prior Dart receipt retained with no live Dart: repeated Dart appears Ready and crafts through UI; it stays visible afterward with the duplicate-hull refusal. One-time references stay collapsed; `repeatable-*.png`, result/export |

`command-atomicity-final.json` compares full inventory/crafted/maintenance state before and after the four actual UI refusals: all unchanged. The blocked-cradle case is separately covered by the panel/real-command test using an explicitly false clearance query; **no production browser obstruction fixture is claimed**. Same-site bench/cradle intent and leaving-site reset are additionally covered by behavioral tests. The first attempted buoy-out-of-range diagnostic instead observed the existing following buoy remain accessible; that trace/export is retained, and the inaccessible-Dart case is the actual fallback proof.

Two New replacements and repeated imports were exercised after explicit source/destination intent, expanded Power and an inline refusal. Both New entries emptied old panel DOM/results/error state; imports restored From=diver, contextual To=pod locker, collapsed Power and no old feedback. `session-reset-results.json`, `session-reset-repeated.json` and their traces record this. Unit checks invalidate old command nodes at the reset seam and existing fixture teardown disposes GameView listeners/timers.

## Browser provenance, manifest and cleanup

Both browser-rule files were read. T3 preview status/open were attempted on an owned incognito tab on 5191. The connection failed with `Preview automation click timed out after 10000ms.` and `Preview snapshot failed: No preview automation host is available for snapshot in environment eff88ded-2882-487b-9095-28cba8588c98…`. Exact returned tool records are in `browser-fallback-tool-records.json`. The owned T3 tab `tab_2w_0430977b-1ed3-45f2-ac72-3683f9fe8942` was closed through T3 lifecycle. No user/peer/historical tab or shared storage was driven.

Fallback Chromium was verified from its actual `/proc/1817921/exe` and process command on **factory-worker Linux / Debian 13**, not hostname alone. Executable: `/home/worker/.t3/tools/chrome-headless-shell/linux64/154.0.8037.92/chrome-headless-shell`. It used an owned ephemeral context, DPR 1, headless software rendering, muted audio and Drag mouse. `browser-process-provenance.json` records process/platform/flags; the existing shared hosts were preserved. No physical cursor, audible mix, representative GPU, fresh-human duration or enjoyment claim is made.

There were **zero page errors / console errors**. Four WebGL warnings report `GPU stall due to ReadPixels`; `browser-console.json` retains them. Automation timeouts and corrected setup/aim attempts are disclosed above and retained separately from game errors. No recordings were started.

The baseline server stopped normally through its own terminal. The production server on 5191 stopped through its own Ctrl+C tool request (reported exit 143); an explicit socket check found no listener. The owned browser/page/context closed normally, both own controllers exited 0, and all three recorded owned PIDs are gone. The earlier stalled controller was closed through its own recovered terminal session, without a process-name kill. `cleanup.json` records page/context/browser closure, no pointer lock, PIDs, server stop and free port. Original checkpoint bytes were re-hashed unchanged after cleanup.

`artifact-manifest.json` lists every retained artifact with byte count, SHA256, category and actual PNG dimensions. It identifies definitive `final-route/`, exact-parent `baseline/`, separate seeded `diagnostics/`, earlier inspection/attempt/check `final/`, source/build/runtime/browser records and scripts. These artifacts remain local under the owned temporary directory; no original evidence was rewritten or public assets published. The source and this evidence are committed separately with a clean checkout. Root integration and paired acceptance remain outstanding.
