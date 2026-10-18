# POLISH-1 experience composition — bounded author handoff

The twelve legacy presentation failures are reconciled and ROOT-EXP-01 is corrected. Final checks pass **399/399**. Current-source P1–P8 workflows and actual active-session Reload/Continue comparison are retained. **P8 still has a 9px non-action pause-menu caption outside this leaf's ownership**; the exact proposed CSS correction is below. This is an implementation/verification handoff, not acceptance. Root owns inspection, the complete candidate freeze, fresh non-author Astra xhigh/Sol max reviews and subsequent Opus verification. M2–M4 remain required.

## Identity, scope and interfaces

- Exact clean starting parent: **`648fa9248fffcf5e3aa0161174bb7dc37400f748`**, containing provisional combined production **`4c09ee749cfc9f16ca77e1759f83175cb41e3e7b`**. [Starting receipt](/tmp/siltwake-polish-1-experience-compose/starting-parent.json).
- Source/tests commit: **`5005095a1c049579d33b3c33a6053a1f3177c417`**. This report is committed separately afterward. Worktree `/home/worker/.t3/worktrees/subnautica-clone/t3-deb4e5ad`, branch `t3/experience-compose-tests-air`.
- Actual original runtime: **`gpt-6.1-sol` / `max`**, from original session `turn_context`, timestamp `2026-10-18T16:11:21.842Z`, ordinal7. [Runtime receipt](/tmp/siltwake-polish-1-experience-compose/runtime-original-turn-context.json). Runtime was checked before implementation; it is not inferred from a requested model name.
- Tracked source/test changes are limited to `tests/presentation.test.ts`, `tests/preparation-panels.test.ts`, `tests/encounter-presentation.test.ts`, and `src/ui/hud.ts` for ROOT-EXP-01. The only additional tracked change is this report. No simulation, save, content, input, session, render, CSS or config change.
- STATUS was read first, followed by PLAN/CONTRACTS, the revised input/specification pointers, settled map/tracker, [whole-batch reconciliation](../tasks/POLISH-1-EXPERIENCE.md), S2a/S2b briefs/reports/root inspections, [Opus implementation advice](../design/OPUS-STAGE1-IMPLEMENTATION.md), [disposition](../reviews/OPUS-STAGE1-R1-DISPOSITION.md), and delivery requirements. The committed COMPOSE assignment governs historical ownership wording and conflicting examples.

No public interface changed. `airSourceLabel(state)` is private to `hud.ts`; vitals and `hazardBanners` now share authoritative `airSupply` naming. Unlimited surface/refuge supplies retain their truthful names; craft names, finite emergency/suit duration and warning order remain. The correction adds no paragraph and mutates no survival state. Cargo production behavior was not changed to revive superseded expectations.

## Checks and twelve-failure reconciliation

Artifacts in this report are under **`/tmp/siltwake-polish-1-experience-compose/`** unless an original external path is explicitly named. [Checks receipt](/tmp/siltwake-polish-1-experience-compose/checks-receipt.json) and complete logs retain the results.

| Check | Result |
| --- | --- |
| Clean-parent `npm run check`, after `npm ci` | **385/397 pass, 12 fail**; all twelve expected legacy panel failures reproduced in `check-baseline.log`. Its chained build does not run after failing tests. |
| Reconciled `npm run check` | **399/399**, zero fail/skip/cancel/todo; typecheck and build pass (`check-reconciled.log`). |
| Postcommit `npm run check` on `5005095` | **399/399**, zero fail/skip/cancel/todo; typecheck/build pass (`check-final.log`, exec64796 exit0). |
| `node scripts/check-m1-economy.mjs` | PASS (`economy-m1.log`), staged arithmetic/production-rule scope. |
| `node docs/build/design/check-economy.mjs` | PASS (`economy-campaign.log`), catalog/scenario/conservation/rejection scope. |
| Working-tree and parent-to-source `git diff --check` | PASS. Report diff also checked before handoff. |

The count increases by two air-warning tests. No test is skipped or deleted. The test DOM port now respects native disclosure visibility, ancestry and semantic focus anchors; tests explicitly open Move before finding its commands. The salvage/rebuild fixtures equip the real Bobbin prerequisite and use the actual buoy item ID.

The exact original names/dispositions, old and new lines, and retained assertions are in [presentation-contract-reconciliation.json](/tmp/siltwake-polish-1-experience-compose/presentation-contract-reconciliation.json). Every row below was **FAIL before / PASS after**; line numbers refer to final `tests/presentation.test.ts` unless stated otherwise.

| Legacy test at parent | Final line | Reconciled contract and retained behavior |
| --- | ---: | --- |
| Bench cell recharge, old308 | 372 | Local cells wording; explicit recharge remains distinct from real hull service and its eligibility. |
| Bulk storage, old326 | 390 | Whole-stack quantities, Store7CU and exact operands; known empty/full activation suppressed. Separately stale-enabled real execution refuses atomically, preserves full state and uses storage focus. Successful transfer leaves nonmaterials alone. |
| Trim, old356 | 430 | One tradeoff line; actual one-socket/2CU occupancy, stored/installed distinction and real safe removal. |
| Completed all transfer, old715 | 790 | Native Move opened explicitly; removed glass row focuses next visible meal Move, not an equal-label transfer. Meal unchanged. |
| Refusal item focus, old731 | 807 | Known-full one/all cannot dispatch. A separately enabled command becomes stale, refuses twice without mutation and retains the item's useful Move anchor. |
| Same-label service, old755 | 832 | Reorder preserves second-vessel identity; real service changes only it. Fully serviced focuses its semantic vessel outcome; removal falls back Return. |
| Occupied recovery, old826 | 905 | Equipped Bobbin supports successful Patch. Occupied Tow/Salvage remain disabled with safe-exit/depth reasons; unsupported Service stays unavailable; reserve usable. Missing-kit checks are separate. |
| Recovery focus, old858 | 946 | Valid equipped fixture; occupation disables Tow, Patch identity survives reorder, real safe exit enables recovery. |
| Recovery frame/caps, old887 | 977 | Missing-kit activation suppressed; removing kit after enabled render causes real atomic refusal. Re-equipping permits exact frame/capped-stock salvage; 17CU buoy prerequisite retained. |
| Recipe focus, old990 | 1086 | Known shortage suppressed; adding actual costs moves the same full recipe command into Ready. Successful completion focuses visible completed-recipes disclosure. |
| Closed travel, old1016 | 1115 | Empty disabled Store retains operands.100 closed-panel observations preserve DOM bytes/write count, focus, scroll, timers, full expedition state and zero commands; real departure resets intent. |
| Same-site intent, old1046 | 1145 | Disabled Store retains explicit operands across close/reopen, roster, pause, bench/cradle observations and switches; session reset clears intent. |

Additional retained coverage includes partial-transfer semantic identity at763, departed-item/carried-anchor fallback at861, keyed native expansion and same-site/departure behavior in `preparation-panels.test.ts:157–208,316`, and a real paid build/salvage/paid rebuild at400. The latter now uses a valid equipped fixture, with real frame return, capped rescue stock and no free rebuild. Existing simulation validation remains authoritative.

Air regressions are tested in `encounter-presentation.test.ts:219,242` and the actual vitals view at `presentation.test.ts:1237`: surface zero-power and disabled hulls, genuine underwater refuge authority before assertions, emergency7.25→display8s, suit18s, powered Dart precedence, unchanged full state and warning order. The root probe's third case is surface; it is not reused as refuge proof.

## Final source/build and provenance

All production checks below use the single committed source **`5005095`** and one final build. No source change followed verification. [Identity](/tmp/siltwake-polish-1-experience-compose/source-identity.json) records source tree `175b2e2686016c7a04d45491aa4737f9ace57303`, tests tree `cb711dcf5a97ac0374369f4aa919cd8ab0517545` and individual source hashes. [Served match](/tmp/siltwake-polish-1-experience-compose/final-build-served-match.json) verifies **all 27 build files** byte-for-byte across working `dist`, retained `dist-final`, `production`, and HTTP5190 before cleanup.

| Final build file | SHA256 |
| --- | --- |
| `assets/index-DbUY9tS0.js` | `a1738657c6e92bdb6c005f5e1e848eda4b95ad0d545ec3402b350d48711bc7a8` |
| `assets/index-Bf-ykskD.css` | `caa6d8d200931667c2107821dbf775429987cfa9782a900d2a88fddb5a0b4a03` |
| `index.html` | `53449e31cd530943f20a8cefa73cc56e7548f09265ad52dc93f36cb108428f92` |

The existing >500kB bundle warning remains. Served observer/input/fault helpers are separate retained diagnostic files; they do not modify built production bytes. Earned workflows use UI import/confirmation and ordinary page keyboard/mouse/settings commands, with no pose/inventory/craft grants. Seeded and altered diagnostics are explicitly separate. [Workflow verification](/tmp/siltwake-polish-1-experience-compose/workflow-verification.json), generated by `audit-workflows.mjs`, asserts the recorded state/count/geometry facts.

All three original earned saves were codec-validated, copied without alteration, and imported through the real UI. [Original validation](/tmp/siltwake-polish-1-experience-compose/original-save-validation.json) records original and served-copy hashes:

| Original under `/tmp/siltwake-opus-stage1-r1/saves/` | Tick | SHA256 |
| --- | ---: | --- |
| `first-return-before-service.json` | 16585 | `edb24efec61cfcd890cfa6c0b3c29286d0d7bd71f533da6673d4c5902f0c0a91` |
| `final-before-paid-fabrication.json` | 7551 | `b673cb90fc81b53cbdcbf0ee234582ae64141651e43319eceb3eae96caf0c50f` |
| `canopy-pre-warning.json` | 9304 | `3df46ef510e589675a422ebfbc62aaafcb626ecf3c89276c42cd5c03c219d305` |

## Current-source workflows

### P1 — fresh opening and ordinary C02 approach

New/opening and ordinary swim/look produce **Move closer** for unknown C02 at tick1264, without key/name. In reach at1872, executable **E / Intake & living filters / Inspect** wins with the visibly brighter cue. Inspected `media/p1-unknown-preview-1280.png` and `p1-executable-1280.png`; raw `traces/p1-unknown-preview.json`, `p1-executable.json` and `p1-active-saved-after-approach.json` are retained. At active save 1880, only C01 exists, earned at 352 before the preview; no C02/scans/journals/crafting knowledge was granted by approach. The opening-complete journal was still pre-opening, so no active-state equality with that journal is claimed. E/Q authority is unchanged and existing preview nonmutation/LOS/selection tests pass.

### P2 — labelled low-oxygen success/repeat/full refusal

Codec-valid seeded diagnostics exercise actual E commands. Two pickups change alloy **0→4→8**, CU **0→8→16**, source stock **8→0**, reserve8 unchanged. Receipts are `+4 Structural alloy · diver hold 8/16 CU` then16/16CU. A separate genuinely full16/16 fixture retains available source stock; refusal grants nothing and leaves the entire inventory and all resource stock unchanged. The full refusal remains readable during low oxygen; no duplicate central toast appears.

Instrumentation records exactly **two 520Hz collect oscillator starts**, ticks 0/33; refusal adds none. A later 280Hz danger sound is separate. The audio wrapper was restored before earned P4. This is event-count evidence, not an audible-mix claim. Source-context lore appears only after opening Notebook (`p2-notebook-only-source-context.json`), not in action receipts. Preferred active checks: `p2-saved-after-pickups.json`, `p2-full-saved-after-refusal.json`; inspected `media/p2-repeated-success-960.png`.

### P3 — labelled concurrent errors, capture fallback and truthful air

`traces/p3-qualified-concurrent-{960,1280}.json` and matching images retain concurrent persistence error, low oxygen, full refusal and capture fallback. Pause exposes error/export; actual Export during failed persistence is retained as download001. Export does not falsely clear the error. A successful manual save retry clears only obsolete persistence notice while the danger state remains (`p3-successful-real-retry.json`; also `p8-diagnostic-restored-successful-retry.json`). Storage and pointer-lock APIs were restored.

[Air authority](/tmp/siltwake-polish-1-experience-compose/air-fixture-authority.json) precedes production assertions. The genuine refuge fixture is walking at `(116,-117.9,-126)` with no controlled craft: underwater airway, `refuge:true`, `breathable:true`, `airSupply.kind=refuge`. Final `traces/p3-air-final-{surface-zero,surface-disabled,refuge,emergency,suit,powered}.json` show Surface air without invented0s, Upper Canopy laboratory air, finite Emergency air8s, Suit air18s, and powered Dart air respectively. Named supply agrees with vitals; finite warning order remains. The emergency fixture initially stages below terrain and a normal step raises it to−8.46m while retaining finite air; it is not route/placement evidence.

Use inspected **`media/p3-air-verified-surface-visible-1280.png`** and **`p3-air-verified-emergency-visible-1280.png`**, with their playing-state `p3-air-verified-*-visible/tail.json` traces. Earlier final-named air screenshots could show pause; earlier unqualified air preflight imports returned404 after a rejected fixture build and are explicitly excluded in `p3-air-excluded-invalid-preflight.json`.

### P4 — earned service, Store/Fit and next departure at960

The unchanged first-return input starts paused/seated at 16585. Service is visible at scrollTop0. After normal settled exit and workshop travel, actual paid trim crafting leads to enabled Store and Fit, both at scrollTop0 (Store y188.74–224.94, Fit y376.69–412.88). One trim tradeoff line remains. Store transfers2 resin+2 crust/4CU; Fit installs actual `item_20` in Dart hold with one socket/2CU occupancy. Full panel feedback remains local with no field echo; pause/resume works. Preferred `p4-completed-*` traces and inspected `media/p4-completed-seat-960.png`, `p4-completed-store-fit-960.png` support this route.

Counts use panel open/close/switch as navigation, discrete gameplay transactions as commands, and destination travel as legs; pause inspections and continuous look/movement are excluded.

| Defined scope | Navigation | Scrolls | Commands | Refusals | Travel legs |
| --- | ---: | ---: | ---: | ---: | ---: |
| Seated paused16585 before Cargo → installed trim at 17481 | **4** | **0** | **5** | **0** | **1** |
| Same start → boarded, reverse departure and saved 18457 | **5** | **0** | **7** | **1** | **2** |

The five commands are Service, normal E exit after coasting settles, craft trim, Store and Fit. The extended scope adds one mis-aimed E (**Nothing within reach**) then correctly aimed E board. Reverse departure moves 30.34288m at ordinary cruise ~8m/s. Z was tapped, not held: **no quiet-departure claim**. The matched preparation scope has 0 scrolls, versus the recorded pre-Cargo 3; these are measured current counters, not inferred layout savings. `p4-excluded-preliminary-route.json` separates earlier moving-exit/short-of-bench attempts with optimistic filenames.

### P5 — earned paid build and labelled readiness/status variants

The unchanged prebuild input at 7551 pays exactly **6 alloy /3 glass /2 membrane**, leaving 1glass and a real invested Dart. No earned grant is used. `p5-before-paid-build.json`, `p5-paid-current-cradle.json`, `p5-paid-active-saved.json` and active download004 retain the transaction. Ready and in-cradle views were inspected. `p5-final-paid-occupied-current.json` retains **Current craft / piloting** independently of the original first site refusal. Separate disabled and resource-removal shortage diagnostics retain truthful disabled/**Needs materials** labels.

Salvage/rebuild production paths are unchanged by COMPOSE. The [S2b report](POLISH-1-EXPERIENCE-S2B.md) and original `/tmp/siltwake-polish-1-experience-s2b/probes/rebuild-fixture-{before-salvage,salvaged,paid-rebuild-ready,paid-rebuilt}.json` remain cited as **earned-derived disable/local-staging diagnostics**, not an ordinary recovery route. Their existence/hashes were checked. Current automated real frame/capped-stock salvage and paid rebuild pass with the corrected valid equipment fixture.

### P6 — earned warning, paid pulse and quiet release

The unchanged canopy input at 9304 uses actual W+C approach to warning at 9521. The typed **SOUND HUNTER** banner is separate from the detached **ahead right, below** bearing/elevation dial and contextual25-point pulse cost. Inspected960/1280 warning and pulse images show no duplicate threat prose/bottom hint. Actual G changes paying cell `item_10` **100→75**, second cell stays100; active paid state is saved at 9602.

A separate branch reimports the unchanged input and uses held S+Space+Z for quiet retreat. Actual DOM/raw input records **Calls fading** and a cleared dial/banner at 9705. `p6-quiet-retreat-release-saved.json` still contains old journal 9304 while active HUD reaches 9769: release proof is live DOM/input, not a complete final active export. The fresh-emission P8 replays `p8-actual-call-layout-{960,1280}` and `p8-actual-pulse-layout-1280` supply full current typography/rectangle audits. This is a bounded warning/release check, not another expedition.

### P7 — earned paid movement, centre passage and real solid contact

All movement uses the task-earned current-source paid-boarded Dart input, acquired through actual paid build/boarding. Service approach appears before rails. Key-turn settings were adjusted through real UI range input for precise alignment, then restored 1; no pose/state injection.

The qualified aligned pass has heading **0.0015926535897428096rad** and actual movement near `(20.006,-0.9,-15.392)`→`(20.026,-0.9,-27.880)`. It has **zero solid-limited sum**, **160 shore-floor stopping steps**, and **zero qualifying blocked steps**. Floor stopping is distinct from rail contact. Active download005 at 8580 matches the **entire decoded state** after 648 exact recorded-input replay steps from 7932; all 47 sampled HUD poses/yaws match. `p7-aligned-input-replay.json`, `replay-p7-aligned.mjs`, `traces/p7-aligned-*` and inspected `media/p7-aligned-centre-held-floor-1280.png` retain proof.

The separate actual off-centre run moves **6.631786m** before genuine solid contact. Exact 1128-step replay matches **all 86 recorded HUD position/yaw samples**, finds **194 consecutive qualifying contact steps**, and reaches the 30-step/0.5-active-second threshold at 8856. The actual blocked DOM mutation appears 8860; inspected **`media/p7-contact-held-1280.png`** is qualified. Release clears the cue (`p7-contact-release-reset.json`). Full receipts: `p7-qualified-input-replay.json`, `replay-p7.mjs`, `p7-final-offcentre-start.json`, `p7-contact-hold-before-capture.json`, `p7-contact-held-tail.json`. Its final journal remains 7932, so no complete active export equality is claimed for that off-centre branch.

An earlier angled centre-labelled pass accumulated 0.001156m tangential loss; the aligned run supersedes it for exact-zero centre evidence. No docking claim. Current meaningful tests cover ascent precedence (`presentation.test.ts:1361`), real rail contact, open-water/tangent/surface/floor/boundary rejection, reverse/strafe/coast, other/disabled/unpowered hulls and actor replacement (`experience-signals.test.ts:363–421`, `encounter-signals.test.ts:174–322`). Unchanged historical carrier/recovery matrices were not rerun.

### P8 — composed layout, focus and bounded lifecycle

Actual CSS **960×600 and1280×800** captures and text/rect audits include Cargo, fabrication, prompt/full result/look, warning/dial/pulse, concurrent failure/capture fallback, paused save errors and keyboard focus. Preferred sets are `p8-final-cargo-{960,1280}`, `p8-final-paid-cradle-fabrication-{960,1280}`, `p8-qualified-concurrent-fonts-{960,1280}`, `p8-qualified-pause-error-fonts-{960,1280}`, and the P6 actual-call/pulse layout sets. Native disclosure/focus receipts are `p8-native-move-1280` and `p8-final-native-keyboard-focus-1280`. Captures were inspected; relevant overlaps/horizontal overflow were not observed. All measured actionable secondary text **and keys are≥12px**, with visible golden keyboard focus.

The one explicit typography gap is **“01 / HEARTH REEF” at 9px** in pause at both sizes. It is a non-action caption; other small measured labels are 11px. Proposed exact root change: add **`.scene-caption > span`** to the existing 11px rule at **`src/ui/hud.css:56`**. CSS is outside this leaf, so no edit was made and **full P8 typography compliance is not claimed**. This finding was reported during work and remains for root.

Toolbar stays at y0 after actual 219.5px scroll (`p8-toolbar-before-scroll-1280.json`, **`p8-toolbar-after-scroll-settled.json`**); the immediate after-scroll checkpoint predates wheel settling. Qualified Rich/Light checks advance active ticks: Light1280 buffer853×533, Light960 buffer640×400, restored Rich960 buffer960×600. `p8-qualified-escape-remains-paused-960.json` remains at paused 8196; deliberate Resume is required. Earlier unqualified quality attempts had an obsolete pause observer consume Resume; preferred qualified traces supersede them. No unrelated lifecycle expansion or representative-GPU performance claim.

## Actual Reload/Continue: complete active state

At earned P4 checkpoint 18457, actual active Export produced **download002**. The page was actually navigated/reloaded, Continue started the active session, and an immediate pause preceded the first active tick. A second actual active Export produced **download003**. `exportGame` in `src/runtime/app.ts:553` chooses `session.envelope()` before repository fallback; this verifies the running session, not just retained imported/storage bytes.

[Complete comparison](/tmp/siltwake-polish-1-experience-compose/reload-complete-state-comparison.json), produced by `verify-state.mjs`, deep-compares all decoded state keys: tick, sequence, scenario, player, opening, inventory, knowledge, world, fleet, recovery, metrics, feedback and migration. **All state equals**, both ticks 18457, elapsed active ticks 0; deterministic no-input replay 0 accounts exactly for elapsed simulation. Only envelope `savedAt` differs (`16:31:16.565Z`→`16:31:26.551Z`); session ID/createdAt match. State SHA256:

```text
251cbb4d5f18651e2e5bb23b1868bf1d70dc0c6146105809776b33fe268de5e7
```

Raw checkpoints are `reload-before-current-source.json`, `reload-page-before-continue.json`, `reload-active-after-continue-paused.json`. The retained full tool-transcript snapshot also includes the actual pre-reload Export click after the earlier checkpoint. S2a tick16585 equality remains prior-source evidence; it is not substituted for this current-source active comparison.

## Evidence retention, limits and cleanup

Both browser rule files were read before browser use. One task-owned incognito tab **`tab_3a_0430977b-1ed3-45f2-ac72-3683f9fe8942`** and port5190 were used after checking the port free. [Process ownership proof](/tmp/siltwake-polish-1-experience-compose/browser-process-proof.json) correlates a 900ms pulse in the target page with **90 CPU ticks in Linux renderer PID2022844**, UID1000 on factory-worker, retaining process/host ancestry. UA, loopback and thread location alone were not used as ownership proof. Browser is the isolated software-rendered worker; human enjoyment, elapsed human playtime, audible mix and representative hardware remain unverified.

Every download was copied and hash-checked independently **before tab closure**; each trace was independently parsed/hashed. `preclosure-retention-verification.json` verifies 5 downloads + 155 traces without failures; the later cleanup trace has its own preclosure receipt. All 5 downloads,156 final trace files, PNGs, raw events/samples, diagnostic helpers, original/earned-derived input copies, build bytes and stream tails are retained. `browser-final-aligned-event-tail.json` and `browser-cleanup-before-close.json` each retain the final 325 events/173 mutations/371 samples at 8580; the older `browser-final-event-tail.json` is explicitly earlier. `raw-tool-transcript-snapshot.jsonl` preserves all earlier raw input/evaluation calls; its source may continue after the immutable snapshot.

| Retained download under `saves/` | Provenance | SHA256 |
| --- | --- | --- |
| `download-001-siltwake-2026-10-18.json` | P3 labelled diagnostic export during persistence failure | `681659c5e5fbcb78b5ba83f06e753da712d2403cd96de611846b840e73234187` |
| `download-002-siltwake-2026-10-18.json` | P4 active before actual reload | `71119a3d04677912be24cd9a149ffb8466759854b9a52def276d94eb6efeb0d4` |
| `download-003-siltwake-2026-10-18.json` | Active after Continue | `067225ec67de87a907d7bf77fa9963dccfcb75a1fde4a63d700341366525559c` |
| `download-004-siltwake-2026-10-18.json` | P5 current-source earned paid build | `2f0f0a49117e573c4e4e91571e35fec08be64fd2c3e64caa196ae64666fd5aa0` |
| `download-005-siltwake-2026-10-18.json` | P7 aligned active end8580 | `a1cb5c6ba0da41f6fa398a16fc80c6fa23fbb980abf675544a30504502f3929b` |

No original save or prior author script/artifact was modified. Read-only [external evidence hashes](/tmp/siltwake-polish-1-experience-compose/referenced-external-evidence.json) verify all 14 referenced originals/prior reports/probes/capture, none missing. S2a's four lost final streams and corrected rail labels remain disclosed in its original report; its original qualified image retains its historical source. Current contact/alignment evidence above does not recreate or relabel those missing streams. T3 PNGs normalize to1280×800 even at CSS960×600; actual CSS viewport/rect receipts establish size. Raw preliminary failures remain preserved with the exclusions described above. No evidence was invented to fill stale-journal or paused-capture gaps.

Cleanup released held keys/pointer lock, restored diagnostic storage/pointer APIs and audio instrumentation, stopped the owned sample timer/observer, and restored Rich/Drag/key-turn1. No recording was started. The tab closed through `t3_preview_close`; final status has no attached tab. The server stopped through Ctrl-C in owned exec 45434 (tool returned 143). [Cleanup receipt](/tmp/siltwake-polish-1-experience-compose/cleanup-process-port.json) shows server 2023673 and renderer 2022844 gone, no 5190 listener, and shared browser 827911/T3 host 811435 still running. An immediate plain bind returned EADDRINUSE; the socket-reuse bind and subsequent **exclusive plain bind** both verified free (`port-final.json`). No process kill/relaunch loop or other tab/host mutation.

The immutable [manifest](/tmp/siltwake-polish-1-experience-compose/manifest.json) excludes itself and its SHA sidecar. It covers **368 payloads / 60,747,366 bytes**, all path/size/hash checks passing through retained `verify-manifest.py`. Manifest SHA256:

```text
42334db877ec81cd3d07cfa5ee6df50dbd95725965063ada4e626a608846d50c
```

No children, peer polling, push, PR, merge or parent mutation. Work stops at this bounded handoff; the 9px caption and the independent acceptance/experience gates remain with root.
