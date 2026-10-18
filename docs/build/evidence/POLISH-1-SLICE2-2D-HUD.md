# POLISH-1 slice2 — HUD composition implementation

Implemented the bounded presentation task on actual **gpt-6.1-sol / max** in the T3-owned worktree `/home/worker/.t3/worktrees/subnautica-clone/t3-d26f5a04`, branch `t3/hud-encounter-composition`. The actual T3 Codex `runtime_info` declares that model and effort; the initial runtime record is retained. The clean starting parent was **76ea8bf2f87906a24128ed3573bb02a6fb24949a**. Final source **d7f20852de1a5ee2a0ba32af5f906d62b0f541b8** has that exact parent.

Source remains **provisional** for root assembly with VISUAL and fresh non-author Astra xhigh / Sol max full-slice review, followed by stage1 Opus. No children, peer messages/polling, unfinished peer inspection, parent edits, push, PR or merge occurred. STATUS, PLAN, CONTRACTS, revised input/specification pointers, settled map/tracker, slice2 direction, Opus R2/disposition/T15–T19 and C0/RIB/2D0/2C integration reports informed this implementation. Root's narrowed composition decisions govern the result. No narrative spoiler is disclosed here.

The separate evidence commit contains this report only. Both full commit SHAs are supplied in the terminal handoff; the source SHA above is the implementation to assemble.

Artifact root: `/tmp/siltwake-polish-1-slice2-2d-hud/`.

Immutable artifact index: [MANIFEST.json](/tmp/siltwake-polish-1-slice2-2d-hud/MANIFEST.json), **379 files / 56,660,028 bytes**, SHA256 **5d3d04ab79ccaed33337d61f40e7a637b08b3f9dedf4d89f8d2dd330df3f50d7**. The manifest and its checksum sidecar are read-only. Every included file has a relative path, byte count and SHA256; only the manifest/self-checksum are excluded from their own inventory. This Git-committed report references that sealed inventory.

**Source and seams.** The source commit changes exactly these 13 paths:

| Path | Bounded change |
| --- | --- |
| `src/ui/hud.ts` | Current air, contextual pulse, measured obstruction display and encounter/notice composition |
| `src/ui/notices.ts` | New pure bounded presentation state, clocks, priorities and detached emitted origin |
| `src/ui/hud.css` | Extracted HUD declarations, backing/contrast and compact cue placement |
| `src/ui/view.ts` | HUD/notice DOM, metadata forwarding and lifecycle methods; panel and native-focus behavior retained |
| `src/runtime/app.ts` | Existing notice classification/forwarding, once-per-step observations and obstruction accumulator/reset |
| `src/style.css` | HUD/notification declarations moved out |
| `src/main.ts` | HUD stylesheet import |
| `src/ui/panels.ts` | Inline routing/clearing and semantic empty-set helper exclusion |
| `src/ui/panels.css` | Existing inline feedback made sticky and given room beside status/reminder |
| `tests/presentation.test.ts` | Notice, context, air, panel/focus and timer integration assertions |
| `tests/app.test.ts` | Actual app forwarding, fixed-step, sound-origin and obstruction/reset wiring |
| `tests/app-browser-support.ts` | New methods record observations/events for assertions |
| `tests/encounter-presentation.test.ts` | New pure priority/clock/context/origin cases |

[source-identity.json](/tmp/siltwake-polish-1-slice2-2d-hud/release/source-identity.json) records every changed file hash and identical Git objects against the required parent. **Simulation, content/registry, save, session, input, audio and renderer trees/files, dependencies and test/build configuration are byte-identical.** `expedition.ts` was not edited. No saved fields, resource budgets, encounter rules, physiology, movement/collision queries, vessel handling or input/audio authority were added or changed.

Compatible additions on `GameView` (matching internal `HudView` forwarding):

```ts
notify(message: string, error = false, options: NoticeOptions = {}): void
presentationStep(state: GameState): void
threatCall(origin: Vec3, state: GameState): void
blockedAscent(visible: boolean): void
```

`resetPresentation(): void` clears replacement/cancellation presentation; existing `showMenu`, panel close/switch, entered/reset and disposal seams clear their appropriate state. App-local `resetAscent(): void` and `observeAscent(events: readonly GameEvent[]): void` own obstruction history. No shared interface beyond the requested optional argument/methods was necessary.

`presentationStep` runs once per completed `stepGame`, after installed state and event delivery. It never runs from paint, paused commands or arbitrary HUD updates. Existing `FIXED_SECONDS` is used, with no pause/resume catch-up. Session notice metadata is forwarded unchanged. Only finite origins on actual `sound` events with `source === "threat-call"` reach `threatCall`; audio receives the unchanged event list. Export serialization failure is explicitly persistence; import validation remains system/error. App-origin graphics/system/export notices are classified at their call sites.

One central notice is bounded without a queue or pending replay. Priorities are persistence failure/reminder (4), current hazard (3), action/system error (2), action success (1). Suppressed low-priority transients are dropped. Successful system/persistence bookkeeping uses a separate chip. Paused import validation can remain readable while the gameplay hazard is hidden; an independent persistence failure still outranks it. Durable save/unsaved/export and existing graphics surfaces remain available. The accepted redundant New-success omission remains; no new text-based channel inference was introduced.

Trial values, not a claim of final human polish:

| Presentation | Lifetime |
| --- | --- |
| Action success | 4 active seconds |
| Bounded hazard notice | 6 active seconds; validity also depends on actual state |
| Calls fading | 2.5 active seconds after an actual disengage transition |
| Actual emitted call direction | 3 active seconds |
| Action/system errors and persistence failure | 12 wall seconds |
| System/persistence success chip | 3 wall seconds |

Active lifetimes freeze in paused/menu/panel time. Ongoing danger remains available in the hazard area after a transient expires. At most one wall-clock timeout is scheduled for the next expiry; reset/disposal clears it. Unchanged live-region strings are not rewritten each frame. Panel actions/refusals appear only inline and never replay on closing; switch/close/replacement clears hidden inline text. Notice presentation preserves command/outcome focus. The generic empty-storage exclusion helper is omitted only when the semantic preview says the authoritative empty-set refusal already supplies it.

On actual disengage the warning/pursuit notice clears on the next observation/refresh and a short **Calls fading** cue can replace it outside refuge. New warning/pursuit, idle, refuge, replacement and disposal invalidate the appropriate transient. A loaded mode produces current guidance without inventing a transition or past call origin. The directional cue copies the emitted point and recomputes only against current listener position/yaw/pitch using the established heading convention. It has accessible direction text, restrained sectors, no LOS/frustum suppression, no distance/animal outline/world marker, and no current hunter-position tracking. Essential wildlife text survives muted audio and disabled opening captions.

Air consumes `airSupply(state)` directly: registry hull name for healthy craft, actual emergency seconds, actual current suit seconds from the drain helper, or true surface/refuge source. Percentage and critical warnings remain. Pulse cost/selected-cell result stays discoverable in Hold; compact HUD cost is limited to warn/investigate/pursue or active distraction, with free quiet/cover/retreat guidance. Disengagement alone no longer advertises a charged response.

App-local obstruction constants are `BLOCKED_ASCENT_SECONDS = 0.45` and `ASCENT_EPSILON = 1e-5`. Each completed step consumes its existing ascent sample once. Upward request must exceed epsilon, have no surface-limited rise, have absolute actual rise at most 10% of requested plus epsilon, and solid-limited rise over 50% of requested plus epsilon. The accumulator is capped at the threshold. Missing/released request, progress, actor/mode change, pause/panel, replacement, graphics interruption and disposal reset it. It performs no second collision query and stores no simulation history.

**Checks and production identity.** Fresh final-source `npm run check` passes **352/352 tests**, strict typecheck and production build; `git diff --check` passes. Both fresh economy scripts pass. The existing large-chunk build warning and the economy scripts' broader route/balance exclusions remain. Logs:

- `final/check-layout-final.log`
- `final/runtime-economy-layout-final.log`
- `final/design-economy-layout-final.log`

The exact final production artifacts are under **`release/`**. Actual browser resource identity is [production-browser-identity.json](/tmp/siltwake-polish-1-slice2-2d-hud/release/production-browser-identity.json), with final reload resources/styles also in `release/warn-reloaded-trace.json`.

| Final loaded artifact | SHA256 |
| --- | --- |
| `index-BPoFl7vF.js` | `103cf38df7bb6094b93b4e987b4b2de5cf832743bb2989994ba385fe6a2cf9a3` |
| `index-Dz7JMFAC.css` | `49ea57b440d3f12ace7fb99f01e1a34880329c9ce9912066f4259f22040e074c` |

The original exact-parent baseline is in `baseline/` (production `index-D9fu034V.js` / `index-DOaF3wla.css`), including full export/trace and 960 captures before edits. Earlier candidates are retained, not relabelled final: initial `B-tFgH_K`/`D0p49yws`, toolbar calibration `CaUh_IrA`/`DA3NW1MZ`, rear spacing `BIy858uX`/`BP1AQG0x`, then source candidate `a11e0bb` with `BKiA_YD4`/`CQnV1hQ2`. `sealed-diagnostics/`, earlier `workflow/` and earlier `final/sealed-*` belong to that prior candidate. Final image inspection caught status overlapping a long inline result and disengagement still showing pulse cost; both were corrected before final source, checks and **new exact-production `release/` evidence**. The manifest distinguishes all cohorts.

The actual browser is app-managed isolated Linux Chrome headless 154 on **factory-worker**, incognito, muted SwiftShader. `final/browser-process.txt` retains process/host provenance. Fleet and repository browser rules were read before browser work. The owned tab used only port **5191**; no peer tab, historical tab 14, port 5192, shared host/storage or user desktop was driven or closed.

**Earned continuation and preparation workflow.** All three unchanged inputs are copied verbatim to `inputs/` and hashed:

| Input and attribution | SHA256 |
| --- | --- |
| Earned Canopy `canopy-pre-warning.json` | `3df46ef510e589675a422ebfbc62aaafcb626ecf3c89276c42cd5c03c219d305` |
| Original earned `first-return-before-service.json` | `edb24efec61cfcd890cfa6c0b3c29286d0d7bd71f533da6673d4c5902f0c0a91` |
| Terminal 2C `final-route/ordinary-result.json`, author source `705ae5efd68edad2771ac37d2c203e418639b870` | `4dc7e089a08d1dbe898898c0fc69e7b2535a6ec5527eaa76c72f4808fa12f145` |

On final source, the earned Canopy import used only ordinary input handlers: approach with W/C; actual warning/call; F5 manual save during danger; pause/resume; Z plus reverse/rise to actual disengage; quiet return/rise to surface; arrow-key look and ordinary travel/exit; swim/walk into workshop refuge. No player/animal relocation, inventory grant, geometry or rule change occurred in this branch. The final export is tick **13058**, walking at `(14.8991, 1.2, -35.5600)`, actual workshop air, health 100 / O₂ 100 / food 98.7806. Full trace/export were preserved before reload.

Primary exact-production evidence:

- `release/earned-warn-save-960.png` and `.mp4`: hazard and emitted direction remain readable while actual save success occupies its separate chip.
- `release/earned-release-960.png`: **Calls fading**, with no stale warning/call or pulse-cost prompt. The trace records the transition and later expiry.
- `release/earned-surface-1280.png`, `release/earned-workshop-refuge-1280.png`: true source changes and ordinary refuge return.
- `release/earned-full-trace-before-reload.json`, `earned-refuge-before-reload.json`, `earned-refuge-reloaded.json` and `earned-reloaded-trace.json`.

The original earned first-return import was actually serviced again on final source. `release/panel-result-and-status-960.png` shows its full long result beside the chip and command-button focus; `release/panel-result-trace.json` records switch/return clearing. It is a retained earned checkpoint continuation, not new preparation credit.

The final 2C continuation performed supported preparation/service, a short sortie, return, actual exit, removal and reinstall of the same trim item, retained native storage From/To intent across that outcome, native Tab after outcome, panel switch/return clearing, ordinary look, one successful E boarding and next quiet outing. Prior 2C fabrication/fitting/return achievements remain that author's work. Final export tick **34295** has health 100 / O₂ 100 / food 86.9822; no rescue or recovery was invoked. `release/workflow-full-trace.json`, `workflow-next-outing.json`, `actual-refit-focus-1280.png`, `next-outing-1280.png` and `.mp4` preserve this bounded continuation.

| Run | Panel navigations | Explicit wheel scrolls | Panel commands | Refusals | Travel legs | Boarding attempts | Storage selections |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Final exact-source 2C continuation | 4 | 0 | 3 | 0 | 3 | 1 | 1 |
| Prior raw-key 960 continuation (`workflow/raw-final-full-trace.json`) | 4 | 2 | 3 | 0 | 3 | 1 | 1 |
| Earlier focus/refusal diagnostic workflow | 8 | 3 | 6 | 2 | 3 | separately recorded | separately recorded |

Scroll counts mean explicit wheel inputs; locator-driven scroll-into-view is separate and is not claimed as zero navigation cost. Counts are not added across repeats or mixed with 2C's earlier author counts. The final E attempt succeeded, but its immediate pre-E prompt observation was empty before a HUD refresh; the final trace therefore does not prove prompt visibility at that instant. Earlier retained ordinary and seeded actor-change evidence does record the actual Board prompt.

Raw window key events, command/focus/select events and sampled HUD poses are retained for both final earned and preparation runs. Automated movement uses the existing keyboard input handlers; native T3 clicks/select/Tab also retain their trusted-event records. No exact per-tick look reconstruction is available. Earlier first-pass instrumentation attached key listeners only at document and missed synthetic window events; that omission is disclosed and the final raw-key runs corrected it. This is bounded earned-import continuation, not fresh-player preparation or a ten-hour play claim.

**Labelled diagnostics.** Final exact-production [diagnostics-full-trace-before-reload.json](/tmp/siltwake-polish-1-slice2-2d-hud/release/diagnostics-full-trace-before-reload.json) contains **50 observations/cases**, including actual production event paths after explicitly seeded boundary imports. `diagnostics/fixtures-manifest.json` documents the 28 generated starting fixtures; `scripts/extra-fixtures.mjs` adds actual collision and boarding setups. Seeded placements/thresholds are separate from earned play and never counted as ordinary progress.

| Area | Actual result and retained evidence |
| --- | --- |
| Warn and pursue calls | Real unchanged transition rules emit both. Final `release/call-*.png` covers ahead/behind/left/right/above/below, 65m fog and foreground Canopy cover with offline actual LOS=false. No silhouette/marker is added. |
| Listener versus emission | Real listener translation/yaw changes ahead to left; upward pitch changes ahead to below. Origin remains the detached emission, never current hunter position. Muted=true/opening captions=false still leaves essential text. Active call expires after resumed steps. |
| Pause and wall clocks | The active call remains frozen at tick9401 through more than 12 wall seconds; status/error surfaces expire without simulation. No pending action/hazard replays. |
| Priority and persistence | Controlled actual localStorage write throws; local journal is unchanged and durable autosave-off/export reminder appears. Immediate invalid import cannot displace persistence failure. Export success remains an independent chip. After 12 wall seconds the central failure expires while the durable reminder remains. `release/storage-failure-960.png`. |
| Invalid import | After that expiry, the actual invalid-file validation is readable as system/error; complete before/after valid state is equal. `release/invalid-import-960.png` and full envelopes in the trace. |
| Reload origin | Saved warn with a still-valid actual origin, navigated/reloaded, Continue and exported. Current-mode danger remains, old call cue/origin is absent: `release/reloaded-warn-no-origin-960.png`, `warn-before-reload.json`, `warn-reloaded.json`, `warn-reloaded-trace.json`. |
| Non-call alarms | Actual boosted collision shows hull impact with no cue; oxygen/food body crossings also create no cue. `release/impact-no-call-1280.png`, `body-alarms-1280.png`. |
| Air | Final images cover suit 68s / empty 0s, healthy Dart, emergency 7s, exhausted craft→suit 36s, depleted craft at surface→surface, surface, pod, lab, workshop and carrier. A piloted craft at the lab location truthfully stays craft air because current refuge rules exclude piloting. No fabricated valid craft/refuge overlap is claimed. |
| Ramp | Actual W walk off pod treads followed by C dive changes refuge→surface→suit; `release/actual-ramp-suit-1280.png` and successive observations. |
| Obstruction | Genuine deck/rib held ascent shows Blocked above; corrected rib A/B and the surface cap do not. Final `release/ascent-*.png`. |
| Reset | Production held-Space pause clears obstruction; released/no-input resume stays clear. Actual E boarding under deck changes actor and clears it. Actual WebGL context loss pauses, clears obstruction, restores graphics normally and remains paused. Panel/replacement/disposal resets and timer bounds also have direct integration assertions. |

Offline unchanged full-world samples are retained as `diagnostics/measured-{deck,rib,corrected-a,corrected-b,surface,ramp}.json`, correlated with final production HUD observations/captures. Deck/rib requested rise is about 0.0466667 per step, first actual rise about 0.001 then 0, solid-limited rise approximately the request, surface 0. Corrected A has useful full rise; B has useful rise then true surface limitation. At surface actual 0 / solid 0 / surface-limited full request produces no Blocked above. These are offline measurements of the unchanged simulation, not a new runtime per-tick event hook. Actual collision samples are in `diagnostics/impact-measured.json`. Empty-suit diagnostics were bounded (observed health 98, no recovery); ordinary branches preserved health 100 and food safety. The built-in carrier fixture begins with its existing health 76.

**Reload and visual assessment.** `scripts/compare-reloads.mjs` compares every state field using unchanged `stepGame` and the real codec, with **no excluded fields**. Final earned refuge tick13058→13058 and final seeded warn tick9327→9327 are direct complete-state matches after actual reload. Earlier earned/workflow comparisons also pass after exact observed no-input steps (8 each). An earlier raw JavaScript comparison differed only on velocity `-0` versus JSON `0`; the authoritative comparisons apply the actual save codec, which normalizes signed zero. Earlier false raw-comparison files remain preserved rather than hidden. Results are `final/reload-release-earned-verified.json`, `reload-release-warn-verified.json`, and other named `reload-*-verified.json`; `release/reload-comparisons.log` retains output. Root's inherited 30-tick comparison remains its own baseline evidence, not a new claim here.

Actual final images and chronological MP4 frames were inspected at **960×600 and 1280×800 CSS** against deep water, bright sand/sky, cockpit and lab surfaces. The 960 layout keeps warning, central notice, direction and chip legible with an open central view; rear cue is above the toast. Long inline service text now wraps to the left of the chip/reminder. Existing focus/capture/settings/caption safety assertions remain green. T3 normalizes saved PNGs to 1280×800; viewport metadata identifies the actual CSS size. The workshop refuge image faces an existing opaque building surface and proves the air label/earned position, not interior-art quality.

`final/contrast.json` records conservative sRGB compositing over white plus representative scene contexts. Secondary `#d6e5d9` on `#102d36f2`: **9.539:1**; hazard `#ffdf9c` on `#102d36f5`: **10.022:1**; error `#ffe1b2` on `#38372ffa`: **8.943:1**; inline `#d2dfd2` on `#163b48fa`: **8.203:1**. Minimum tested pair is pilot secondary `#d2dfcd` on `#102f3ee8`, **7.710:1**. The exact final computed styles and actual images substantiate the backing; these are not DOM-only visual claims or an entire-UI accessibility certification. Text at 10–13px remains small.

Final motion originals are `release/earned-warn-save-960.mp4` (**1.695333s**) and `release/next-outing-1280.mp4` (**7.947933s**). Metadata and extracted contact sheets are retained; the unused fourth tile of the short warning contact sheet is padding, not a game black frame. Screen-capture rates around 3.54 / 4.53fps do not establish game performance. [inspection.md](/tmp/siltwake-polish-1-slice2-2d-hud/release/inspection.md) records the inspected images/motion and limitations.

Retained investigation exclusions: `final/sealed-earned-disengage-960.png` was an intermediate investigating-state capture despite its filename; actual release evidence uses the correctly observed calls-fading captures. The stale early `diagnostics/craft-refuge-overlap.json` is not a valid overlap proof. A final priority observation initially occurred after expiry and its trace label was corrected; only the later immediate combined failure/import case proves priority. Earlier timeout and evidence-orchestration errors are retained in `final/tool-timeout.txt`, `workflow/tool-refit-timeout.txt` and [tool-errors.md](/tmp/siltwake-polish-1-slice2-2d-hud/release/tool-errors.md). No fallback browser/relaunch loop occurred.

**Cleanup and limits.** Both final recordings stopped normally; earlier recordings were already stopped. Owned T3 tab `tab_2y_0430977b-1ed3-45f2-ac72-3683f9fe8942` closed through its lifecycle tool. Only the owned 5191 Vite preview session 28795 received Ctrl+C and exited 130. A plain bind probe encountered recently closed sockets, but `ss` showed no listener and a connection probe returned ECONNREFUSED 111. [cleanup.json](/tmp/siltwake-polish-1-slice2-2d-hud/release/cleanup.json) preserves the actual results. Shared browser processes, hosts, other tabs/contexts/ports and storage were preserved; the controlled Storage prototype was restored before final save/reload and closure.

Muted SwiftShader cannot establish physical mouse feel, audible mix, human enjoyment/duration or dedicated-GPU performance. No broad gameplay/balance acceptance, ten-hour play, independent review acceptance or combined VISUAL art acceptance is claimed. The bounded implementation, final checks and production evidence are complete for root's provisional assembly and review.
