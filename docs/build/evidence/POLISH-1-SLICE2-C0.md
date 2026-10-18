# POLISH-1 slice2 C0 — panel and HUD ownership seams

Author handoff for coordinator inspection, not independent acceptance of slice2.

## Revision, runtime and scope

- Exact clean parent: `577d24954e17410974f6fa65a9f102201ba6e723`. Its production/test/configuration files match accepted controls candidate `d031803730fb44b9208e52fdfb91a88e9ddf8a41`.
- Source: **`72c3355f6f19710622363ed9e856c27fc57430af`**, `refactor(ui): separate panel and HUD presentation owners`.
- Effective runtime: **`gpt-6.1-sol` / `max`**, confirmed from this worktree's actual `turn_context` at `2026-10-18T09:22:40.656Z`. Session `/home/worker/.codex/sessions/2026/10/18/rollout-2026-10-18T04-22-40-01a14e52-042a-74b1-b70d-895ec4e8c03e.jsonl`; reduced receipt `runtime.json`. No mismatch or substitution.
- Read AGENTS/STATUS first, PLAN/CONTRACTS, revised input/specification pointers, settled map/tracker, accepted slice1 R2 record, slice2/C0 direction and Opus C0/T11–T19. The slice2 reconciliation governs the advisory designs.
- Changed only `src/ui/view.ts`, new `src/ui/panels.ts`, `src/ui/hud.ts`, `src/ui/format.ts`, and this evidence document. No tests, stylesheets, configuration, simulation, saves, input/runtime or render files changed. No additional path/interface was needed.
- Retained the T3 worktree/feature branch. No children, peer instructions/polling, parent edits, push, PR or merge. Root owns subsequent dispatch/integration/review.

All new diagnostics and receipts below are under **`/tmp/siltwake-polish-1-slice2-c0/`**. Previous evidence was read only.

## Exact internal exports for reconciliation

`panels.ts` exports `PanelKind` and `PanelView`; `view.ts` re-exports the same `PanelKind` type and retains `GameView`/`UiActions`. `CommandButton` and `containerLabel` remain private to panels.

```ts
type PanelKind = "inventory" | "craft" | "notebook" | "carrier";

class PanelView {
  constructor(root: HTMLElement, world: WorldQueries);
  command(action: string): GameCommand | undefined;
  selectStorage(id: "storage-from" | "storage-to", value: string): void;
  refresh(kind: PanelKind, state: GameState): void;
  focusTarget(kind: PanelKind, state: GameState, targetId: string): void;
  notify(message: string, error: boolean): void;
  cancelFeedback(): void;
}

class HudView {
  constructor(root: HTMLElement, world: WorldQueries,
    panelNotice: (message: string, error: boolean) => void);
  update(state: GameState, cruise: boolean, forward?: number): void;
  target(t: AimedTarget | null, state: GameState | null): void;
  lookAction(visible: boolean, fallback?: boolean): void;
  gesture(kind: "exit" | "skip" | null, progress: number,
    key: string, state: GameState | null): void;
  impact(loss: number, state: GameState | null): void;
  cancelFeedback(): void;
  resetPresentation(): void;
  notify(message: string, error?: boolean): void;
  dispose(): void;
}
```

`format.ts` exports only existing pure helpers: `escapeHtml(s: string): string`, `bearing(from: Vec3, to: Vec3): string`, and `recoveryDisplay(message: string): string`. Both owners use them without importing view values or each other. `HudView` receives the existing inline-notice callback; it does not introduce a channel, queue, priority or duration API.

## Method and field ownership

| Owner | Methods/responsibility | Fields/state |
| --- | --- | --- |
| `GameView` | Original DOM shell; all root click/change/keydown listeners; app-facing `UiActions` dispatch; modal/opening focus trap; menu, settings, audio controls, slot/persistence/confirmation/graphics-error surfaces; panel visibility and Return focus; public forwarding methods and lifecycle composition | Sole `latest` reference and `panelKind`; `subtitles`, `canvas`, `abort`, `menu`, `hud`, `wasPlaying`, `canContinue`, `graphicsFailed`; two presentation handles |
| `PanelView` | `refresh` builds all four panels and restores command focus; `powerPreparation`, `materialStorageControls`, `moduleFitting`, `knownHabitats`, `returnInformation`; `command`, `selectStorage`, `focusTarget`, inline `notify`, highlight cancellation; private DOM lookup/container label | Sole generated `commands` map, `storageFrom`, `storageTo`, `highlightTimer`; DOM root and world queries |
| `HudView` | HUD `update`, vitals/hazards/opening/pilot/pitch/surface presentation; `target`, `lookAction`, `gesture`, `impact`, current `notify`; presentation reset/cancel/dispose and private DOM lookup | `toastTimer`, `impactTimer`, `impactLoss`, `impactAt`, `impactUntil`, `impactVehicle`, `pilotId`, `pilotSince`, `startTick`, `exitKey`, `exitProgress`; DOM handles, world queries and inline-notice callback |
| `format.ts` | Existing escaping, bearing/distance text and recovery-display compatibility wording | No mutable state |

Neither child retains a `GameState` or an active-panel copy. `GameView.update` assigns `latest` before HUD work; `refreshPanel` assigns it even when no panel is open. Public `target`/`gesture` receive that latest state explicitly through their internal delegates. This preserves updates to the same object as well as replacement-state ordering. Children register no listeners or focus traps.

Generated command IDs/keys/order and the single current command map are unchanged. Root click dispatch now queries `PanelView.command`; every panel refresh still clears/rebuilds that map at the original point. Detached-button dispatch and semantic focus restoration match the parent, including Return fallback for unavailable commands. Target IDs, non-sequential finding focus, scrolling and highlight behavior are retained.

Storage selection keeps its **existing view-instance lifetime**, accessibility fallbacks and change-handler focus. C0 adds no session/site/default-destination policy. In particular, `resetPresentation` did not previously reset storage operands and still does not; the later slice2 preparation policy is not smuggled into this extraction. Only GameView owns the latest session state; no previous session object is retained by either child.

Highlight expiry remains 1,400 ms; impact aggregation 1,500 ms, flash 600 ms and notice expiry 1,800 ms; toast expiry remains 5,500/12,000 ms. Cancellation is split between the two owners and composed by the existing public lifecycle. Reset still clears pilot identity/start tick and hides the toast. Disposal clears all three timeout handles, aborts the original input listeners and removes the DOM. `checkVisibility()` and the complete original focus-trap body remain unchanged.

## Checks and before/final comparison

| Check | Actual result / receipt |
| --- | --- |
| `npm ci` | Pass; pinned dependencies installed without tracked dependency/configuration changes; `install.log` |
| `npm run check` | Strict typecheck, **275/275 unchanged tests**, zero failures/skips, production build; `check-final.log`. Test duration 11041.605956 ms; Vite build 8.64 s. Existing large-chunk warning remains. |
| `node scripts/check-m1-economy.mjs` | Pass; nine recipes and both staged scenarios; `economy-final.log`. Arithmetic/transaction evidence only. |
| `parity.mjs` | **22 exact parent/final checkpoints match**, including root template, panel HTML/text/command keys, public prototype, focus, detached dispatch, storage operands, notices/impact expiry and reset/dispose; `before-parity.json`, `final-parity.json`, `parity-result.json`, `parity.log` |
| `verify-source.mjs` | Byte-identical DOM template and UiActions; 20 exactly moved/retained method bodies, four extraction-normalized bodies; **no new-module cycles and no child dependency on view**; `source-verification.json` |
| Path/hash audit and `git diff --check` | Pass. Every pre-existing source/test file except owned `view.ts` is unchanged; new production files are only the three assigned UI modules. `baseline-files.json`, `build-identity.json`, `source.diff`, `cleanup.json`. |

The temporary parity script reuses the unchanged presentation tests' minimal DOM port and deterministic diagnostic timers. It compares both compiled revisions against the original earned envelope without changing that state. It is not a permanent implementation-mirroring test and cannot establish native visibility/layout. Existing tests inspect generated controls through production click dispatch, so no private-test assumption needed adjustment.

An initial compiler attempt preceded dependency installation, and the first extraction script used an incorrect interface/class search bound. Both were corrected before the passing candidate. `check-initial-extraction.log` is the superseded typecheck failure, not a final test result. No assertion was weakened or edited.

Final loaded main bundle: **`dist/assets/index-CmqWR8YJ.js`**, SHA256 **`7332344eb4d173f0ddb89df7e7255be088829e77b826d92bc40bf97109ac8a28`**. HTML and JS returned HTTP200 with exact rebuilt bytes. The browser loaded this script before and after restart. `build-identity.json` binds all source/test/dist hashes to source commit72c3355.

| Final source file | SHA256 |
| --- | --- |
| `src/ui/view.ts` | `da8837fb7316e6055844ca1f03626cb35c7d2adf5ff93329430ae7bce65e300e` |
| `src/ui/panels.ts` | `0e049820b94b3af32a05b7f8d16e6900bf81e0ec1707d2be1753dc25001a1935` |
| `src/ui/hud.ts` | `7d21cdab9e7b21108c3578c84e91107b091584fc5a1b6ed989a39175d5640e61` |
| `src/ui/format.ts` | `f7b7892e7e6bfcf53199f70c08be049572a6c195ed7c5fde4520b8cbef9c14d2` |

## Bounded exact-build native browser smoke

Read both `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md` before browser work. Used T3 status first, then one new owned **incognito** tab, `tab_2u_0430977b-1ed3-45f2-ac72-3683f9fe8942`, isolated origin **`http://localhost:5191/`**. Port5191 was checked free before starting the owned production-preview server.

Verified the actual new renderer **PID1803985**, Linux executable `/home/worker/.t3/tools/chrome-headless-shell/linux64/154.0.8037.92/chrome-headless-shell`, process namespace/arguments on **factory-worker**, plus the page's Linux UA/platform. `browser-before.json`, `browser-owned-process.json`, native metadata and build identity provide process/browser evidence. Shared host arguments show SwiftShader/software rendering, disabled GPU and muted audio. No Windows tab or physical cursor was used.

The temporary observer only reads DOM/events and delegates the unmodified native pointer-lock method while counting calls. All tested keyboard input used native T3 `preview_press`; selected existing elements were sometimes focused to establish a boundary starting point. Capture setup also scrolls the existing panel to its top. No synthetic KeyboardEvent, state grant, teleport, simulation setter, added control or production debug hook was used.

| Ordinary fresh sequence | Observation |
| --- | --- |
| New → opening controls → focused Skip Enter | Opening ends, canvas focused. The first early Tab happened during preparation; the raw trace retains that attempt and an Act activation. The confirmed skip is marker `opening-skip-complete` at index23, not the earlier marker named `focused-skip`. |
| Gameplay Tab → Hold; interior and both boundary directions | Hold pauses at **tick368**, unlocked, capture requests**1**. Return ↔ final Store command wraps correctly. |
| Storage From Tab/Shift+Tab, protected K, ArrowDown source change | From ↔ To traverse normally; K does not switch the panel from a selector; changing source rebuilds and restores selector focus. Tick/capture remain368/1. |
| K → Fabricate; J → Notebook; V → carrier information; both boundaries | All panels remain368/1/unlocked. Notebook also tests focused existing C01 article reverse traversal. V does not start the seeded fixture. |
| Native Enter on Return, Escape to menu; menu boundaries/settings | Return captures deliberately; Escape releases without recapture. Collapsed-details boundary reaches visible Save safety, then Return. Rendering/sensitivity native traversal works; ArrowRight persists sensitivity1.1. Menu stays at384. |
| Menu Return → I Hold → Escape → Escape | Deliberate Return captures; panel Escape resumes without capture; next Escape pauses. No competing child listener or trap. |

`native-final.json` retains271 main-page rows; `lifecycle.json` includes the final pagehide tail and34 restart rows. `native-assertions.json` checks **16 native panel Tab trials**, unchanged panel/tick/capture/lock for each, zero untrusted keyboard events and zero Escape recaptures. The two page contexts record **seven native capture requests** and14 trusted lock-change events; callbacks are not counted as extra requests.

### Earned import and actual panel commands

Imported the original read-only `/tmp/siltwake-m1-play-presentation/saves/first-return-before-service.json`: **10,612 bytes**, SHA256 **`edb24efec61cfcd890cfa6c0b3c29286d0d7bd71f533da6673d4c5902f0c0a91`**, tick16585, `expedition.3`. Import confirmation and normal entry used the real UI. This is continuation of previously earned play, separate from the fresh opening and from Node diagnostic fixtures.

Import enters piloting; Hold then stays at **tick16617**, capture requests**4**, unlocked throughout captures, service and storage. Actual native Enter on **Supported charge / repair** restores hull battery/health/emergency air and local cells while retaining exact command key `{"type":"service","vehicleId":"dart_17"}` and focus. Storage From/To traversal and native source change/back preserve selector focus. Native Enter on **Store materials** moves four resin plus four crust, **8 CU**, from diver to Dart hold; source/destination and command key `{"from":"diver","to":"dart_17_hold","type":"store-materials"}` retain focus after rerender. One further Enter produces the genuine empty-source refusal, retaining that command focus.

The success toast subsequently expires while paused; the inline result remains. Return exposes the actual piloted HUD/vitals/guidance, and Escape releases. Manual F5 saves the actual result; `earned-after-service-store.json` is the own-origin journal's current envelope read after that save: **10,600 bytes**, SHA256 **`e194d52f47f6d47229cb5d4df2c703e8942acac2ec81d0b655b16b682afdfa97`**, tick16665. A few active ticks between Return, capture and Escape account for ordinary subsequent power drain; service itself showed100% at the paused command boundary. No stock/state was granted. Original checkpoint hash/bytes are unchanged.

`media/earned-{hold,fabricate,notebook}-{960x600,1280x800}.png` are six same-state **pre-service** future layout baselines. Adjacent JSON records measured CSS viewport, full HTML/text, ordered command identities, storage values, scroll height and tick/capture. T3 normalizes the saved PNGs to1280×800 pixels at both measured CSS viewports; the960×600 labels describe actual CSS layout, not native PNG dimensions. The original captures were copied without alteration. I inspected all six actual images, plus `settings-1280x800.png`, `earned-store-focus-1280x800.png` and `earned-pilot-1280x800.png`. They show the existing dense layout/copy, focus rings, controls and current HUD. C0 makes no visible polish claim.

### Dispose, restart and cleanup

Navigated the own tab normally while a newly saved toast was pending. A pagehide observer registered after the app's handler recorded **persisted=false, app children=0, unlocked** after disposal. Restart reconstructed nine root children with the same final bundle, hidden old toast and persisted sensitivity1.1. Normal Continue restored the serviced Dart and8 CU of stored cargo; Hold worked and Escape did not recapture. Then native New confirmation replaced that session: opening Release restraint, low fresh tick, pilot/impact hidden and no inherited toast. `lifecycle.json` contains these receipts; permanent tests additionally cover stale capture/session disposal behavior.

Removed observer listeners, cleared only the owned incognito origin's storage/session receipt and closed the owned tab through `t3_preview_close`. No recording was started. Stopped own Vite session **27793** with Ctrl-C (reported exit1); a new socket bind proves5191 free. Owned renderer1803985 is gone; shared hosts827911/847778 remain alive. T3 status reports no attached tab. No process-name kill, host restart, foreign-tab operation or relaunch loop. `cleanup.json` records closure and original-checkpoint integrity; `artifact-manifest.json` seals the handoff payloads.

## Limits and next ownership boundary

This is a mechanical extraction and bounded author smoke, not a campaign/refit benchmark or independent feature acceptance. No new warning/air/rib behavior, notice channels/priorities or menu layout/copy changes are implemented. Native target-highlight activation, collisions/impact, capture denial and complete campaign routes were not replayed; moved-body checks, temporary parity and the unchanged tests cover the affected code within their synthetic limits. Browser screenshots do not establish physical-mouse feel, audible mix, human learning/enjoyment/duration or representative-GPU performance.

Root must inspect these returned exports/ownership and reconcile any later reset/notification interface before dispatching consumers. C0, RIB and the remaining slice2 implementation require the fresh non-author Astra xhigh/Sol6.1 max gate and coordinator acceptance on the complete composed slice. This author dispatched no review and claims no such acceptance.
