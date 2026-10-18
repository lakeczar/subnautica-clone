# POLISH-1 experience S2a implementation handoff

S2a implementation is complete for root composition and review. This is author evidence, not acceptance. P4/P5 and the Cargo owner's changes are not present or claimed in this checkout.

## Revision, runtime and scope

- Exact clean starting HEAD: `8eecb7b4770230435f9c7002b4903bbe0477037b`, verified before implementation in `baseline.json`.
- Source/tests: `3d37f4ef1bbb5a3a7bf6760d48e3c91aae292625`.
- Final source follow-up: `24c241d0d71657863fee84d054a8c4a3750f4937`; this changes only seven lines of outer-menu typography CSS.
- Final `src` tree: `bbe5edc301e60ccfb65181225067bfde650935c6`; `tests` tree: `550ef6e46876b38158768a60d135cdf5eab7c66d`.
- Actual runtime: **gpt-6.1-sol / max**, verified from the session's `turn_context`, not requested-model metadata. [Receipt](/tmp/siltwake-polish-1-experience-s2a/runtime-receipt.json) includes the original session path and event.
- Used only this T3 worktree. No children, peer polling, push, PR, merge, parent mutation or cross-path implementation was performed. STATUS was read first; this explicit dispatch superseded its prepared-task wording. The revised input, PLAN/CONTRACTS, reconciled experience assignment, Opus advice/disposition and S1 inspection governed implementation.

Exactly these twelve source/test paths changed:

```text
src/render/renderer.ts
src/render/targetCue.ts
src/runtime/app.ts
src/ui/hud.css
src/ui/hud.ts
src/ui/notices.ts
src/ui/view.ts
tests/app-browser-support.ts
tests/app.test.ts
tests/encounter-presentation.test.ts
tests/presentation.test.ts
tests/render-lifecycle.test.ts
```

This report is the only additional tracked path. Save, simulation, content, configuration, input/session modules, PanelView and panels.css are unchanged. No necessary cross-path change remains proposed.

## Result and composition interfaces

The prompt, action result and persistent look/capture affordance share one vertical stack. Action notices use `summary ?? message`, with no length limit or line clamp. Success lasts 2.5 completed active seconds; refusal lasts 4. Menu/panel/session boundaries, opening, actor changes and refuge changes clear results without replay. A separately versioned live region announces identical repeated actions and cancels callbacks on replacement, reset and disposal. Panel actions still receive their full original message locally.

Current typed banners are built and rendered by `hazardBanners(state)`. Their current visible contexts alone cover hazard notices; the app supplies its installed current state during event delivery rather than relying on the previous HUD refresh. Newly appearing contexts announce once, while changing percentages do not rewrite the live region. Recovery, release, persistence and pulse cost/availability remain distinct. Threats suppress redundant bottom controls guidance. The acoustic cue is a horizontal bearing dial with a separate elevation marker, using a detached emission origin and the retained active-time lifetime/reset rules.

The shared executable target and reach preview are consumed separately. Executable targets win, previews have no action key, unknown labels say only “Move closer”, and known names appear only when supplied. The retained bracket buffer uses a pale core/dark edge and lower preview emphasis. Existing depth tests, fog, LOS selection and resource ownership remain in effect.

Piloted Dart service guidance uses `serviceState`/`serviceRefusal`, including a fully serviced hull. Measured obstruction accumulates once per completed active step only when requested travel is greater than `1e-5`, actual travel is at most 10% of requested, and measured solid loss is at least 80% of lost travel. The cue requires 0.5 active seconds. Missing/invalid samples, progress, release, boundary correction, unavailable power/hull, actor/session/pause boundaries reset it. Ascent feedback wins. Rail help additionally requires the current Dart pose to overlap an actual cradle rail's forward end; other contacts say “Blocked ahead”. There is no speed-zero detector or handling/geometry/docking change.

Outer navigation/control labels now say Cargo. Empty opening detail and the in-session pause subtitle hide. Narrative captions, controls/settings/save information, unfinished-campaign information, deliberate Resume, stable toolbar, keyboard focus and capture fallback remain available. Actionable secondary text and keys have a 12px floor; 11px is reserved for non-action uppercase labels.

The additive public composition signatures are:

```ts
// src/ui/hud.ts
export interface HudAim {
  target: AimedTarget | null;
  preview: ReachPreview | null;
}
export interface HazardBanner {
  context: NoticeContext | "pressure" | "health" | "hullDepth" | "power";
  text: string;
}
export function hazardBanners(state: GameState): HazardBanner[];

// GameView; existing callers remain valid
update(state: GameState, cruise: boolean, forward = 0, aim?: HudAim): void;
target(target: AimedTarget | null, preview: ReachPreview | null = null): void;
notify(message: string, error = false, options: NoticeOptions = {},
       state: GameState | null = this.latest): void;
blockedThrust(visible: boolean, state: GameState | null = this.latest): void;

// GameRenderer
present(state: GameState | null,
        overlay?: { target: InteractionHost | null;
                    preview?: InteractionHost | null }): void;

// createTargetCue return value
update(host: InteractionHost | null, eye?: Vec3, executable = true): void;
```

Within the owned presentation module, `EncounterPresentation.result` now holds an `ActionResult`. `notify` takes an optional final current-context set, and `observe`/`step` take that set instead of a danger boolean. `callDirection` returns `sector`, `label`, `bearingStep`, `elevation` and `vertical` instead of `glyph`. HudView supplies these internally; no simulation seam changed.

PanelView's constructor and all public methods remain unchanged. The required panel/storage IDs, navigation data-actions and native-disabled click guard remain. GameView still calls `observeStorageContext` during normal closed-panel updates and forwards full action messages to `PanelView.notify` while open. Existing renderer/session/input lifecycle contracts remain unchanged.

## Final-source checks

On `24c241d0d71657863fee84d054a8c4a3750f4937`:

| Check | Result | Retained log |
| --- | --- | --- |
| `npm run check` | Typecheck, **389/389 tests**, production build pass; zero skipped/cancelled | `check-final-typography.log` |
| `node scripts/check-m1-economy.mjs` | Pass | `economy-m1-final-typography.log` |
| `node docs/build/design/check-economy.mjs` | Pass | `economy-design-final-typography.log` |
| `git diff --check` against common parent | Pass | `final-source-verification.json` |

Unit/composition checks cover independent routing, full refusals, exact active lifetimes, identical-message announcements/cancellation, current banner coverage and stale-context exclusions, call origin/bearing/elevation/reset, preview precedence, service truth, actual Dart rail/centre movement and accumulator exclusions/timing, ascent precedence, save recovery, opening/menu/capture and disposal. The cue test retains one fogged depth-tested mesh across thousands of updates, then checks disposal and late updates. Existing preparation/panel behavioral assertions remain; no preparation-panel test failure remains. Prior assertions that referred to the old central action toast now use the action surface, and persistence/system fixtures use their actual typed channels.

The existing large Vite chunk warning remains. Node `v24.21.0`, npm `11.19.0`. [Final build identity](/tmp/siltwake-polish-1-experience-s2a/final-build-identity.json) records all 27 built files, hashes and matching served bytes. The exact final primary assets are:

```text
index-ovUYa_b_.js
a87d34613ecbc55175c540a5afeb1d84dda769a522ebc68cf747501d490110fe
index-Cf69flaF.css
3bd2073d4bde21342f4973dc1f6c0dd0bf03d76de9e6281aa2f1f0d818a3a433
```

## Production evidence and provenance

All authored payloads are under `/tmp/siltwake-polish-1-experience-s2a/`. [Evidence index](/tmp/siltwake-polish-1-experience-s2a/evidence-index.json) distinguishes ordinary fresh input, imported earned replay and explicitly seeded diagnostics. Actual captures were inspected, not only DOM boxes.

`candidate-*` captures are the final committed build. Historical `final-p*` captures are source `3d37f4e`/`index-B0UQjxzc.js`; their complete build is separately retained in `dist-3d37f4e/`. Unprefixed `p*` captures precede the first commit's menu-error placement correction and use `index-C55gA-UX.js`. Their initial bundle bytes were not separately archived. Their functional HUD/app/cue implementation is the same, but their menu presentation must not be represented as final.

| Case | Actual route and finding | Preferred final evidence |
| --- | --- | --- |
| P1 | Ordinary New, opening actions, swim/look toward unknown C02. Generic preview has no E/name; closer approach produces executable named inspection with a brighter bracket. No pose/inventory injection. | `candidate-p1-fresh-preview-1280.{png,json}`, `candidate-p1-fresh-executable-1280.{png,json}`, final tool transcript; earlier complete `traces/s2a-final-p1-fresh.json` |
| P2 | Explicit low-O2 diagnostic imports; two real E collections take alloy from 0→4→8 and hold use 0→8→16 CU. Separate fixture starts genuinely full at 16/16 CU with source stock remaining; E refuses without collection. | `candidate-p2-repeated-success-960.png`, `traces/s2a-candidate-p2-low-oxygen.json`, codec-generated fixtures and `create-diagnostics.mjs` |
| P3 | Journal-write quota failure diagnostic concurrent with low oxygen, full refusal and denied-capture fallback. Full actionable refusal wraps without truncation. Error/export remain available in paused menu; successful manual retry restores saving. Patched APIs were restored. | `candidate-p3-danger-error-refusal-capture-960.png`, `candidate-menu-error-{960,1280}.png`, `traces/s2a-candidate-p2-p3-p8.json` |
| P6 | Unchanged original earned `canopy-pre-warning.json`, actual W/C approach to warning and actual release. One threat banner, separate horizontal dial/elevation, quiet bottom guidance, G cost 25 and 100→75%; release retains “Calls fading” and clears dial/banner. | `candidate-p6-earned-warning-960.png`, `traces/s2a-candidate-p6-earned-release.json`; earlier release stills remain source-attributed |
| P7 | Original earned materials save, actual paid Dart fabrication (6 alloy/3 glass/2 membrane), ordinary travel/boarding. Final build replays that task-earned paid-boarded save and moves away/back toward current service support. Current near-centre passage continues past the mouth without a cue. Starboard contact at approximately x21.893/y−0.9/z−14.400, yaw6.24978 qualifies; release clears it. | `candidate-p7-moving-service-approach-1280.png`, **`candidate-p7-actual-qualified-blocked-1280.png`**, final tool transcript; complete earlier paid/qualified/centred event streams and task-earned exports |
| P8 | Actual CSS 960×600 and 1280×800 compositions, full result/prompt/fallback plus danger/save error, warning/dial/pulse, paused menu, focus and font inspection. Checked groups have no overlapping boxes; actionable keys/secondary text are ≥12px. Escape stays paused; deliberate Resume and visible keyboard focus remain. | `candidate-p8-danger-error-refusal-capture-1280.png`, P3/menu stills, `candidate-layout-fonts-{960,1280}.json`, `candidate-menu-fonts-1280.json`, `candidate-threat-layout-fonts-960.json` |

The exact original `first-return-before-service.json` was imported through the real File input/confirmation, immediately paused, reloaded, continued, immediately paused and manually saved on the final build. **Complete state deep-equals the original at tick16585**: `candidate-earned-reload-journal.json` and `candidate-exact-earned-reload-comparison.json`. An earlier complete reload event stream is also retained.

Rich/Light and resize were checked on final production: Rich1280×800 buffer1280×800; Light1280×800 buffer853×533; Light960×600 buffer640×400; restored Rich960×600 buffer960×600. `candidate-quality-resize.json` and the raw menu-quality trace retain observations. Final ready/available Rich1280×800 and actual SwiftShader identity are in `browser-before-close.json`. Disposal is covered by final-source tests and normal app-owned tab cleanup; no extra production context-loss test or debug global was introduced.

## Evidence limits and corrections

Four final downloaded observation streams were lost when app-managed tab closure removed its downloads after archive copying failed on an unavailable older path: `s2a-candidate-p7-correction`, `s2a-candidate-p7-actual-contact`, `s2a-candidate-earned-exact-reload` and `s2a-candidate-p1-fresh`. Their metadata and missing status are explicit in `downloads-final-index.json`. Final PNGs/metadata, the exact saved-state journal/comparison and **74 unmodified tool call/output records** are retained in `final-browser-tool-transcript.jsonl`, with original line attribution. This preserves commanded input and actual tick/pose/tool observations; it does not recreate the lost per-DOM event streams. Earlier corresponding complete streams remain. No replacement trace was fabricated and no browser was relaunched to hide the gap.

The earlier `candidate-p7-qualified-blocked-1280.png` filename and `s2a-candidate-p7-paid-movement.json` provenance prematurely described an oblique approach as qualifying. Its actual capture shows no cue while travel continued. Use **`candidate-p7-actual-qualified-blocked-1280.png`** for the subsequent real final qualification. Similarly, historical `s2a-p7-centred-contact.json` was actually off-centre; later qualified/centred traces correct that label. These originals remain intact.

One earlier combined fresh-route evaluation exceeded T3's 15s limit; pending helper inputs were released/paused and the route resumed. Final fresh-route calls were bounded and did not time out. A final New confirmation click had one transient transport error and succeeded on one retry. T3 screenshot PNGs normalize to1280×800 even for CSS960×600; retained T3 viewport, `innerWidth/Height` and boxes establish actual viewport size. Semantic snapshot text and image can sample adjacent frames.

No human feel, audible mix, duration/enjoyment or representative dedicated-GPU performance claim is made. This is a bounded HUD/cue implementation; root must compose Cargo, inspect P4/P5 and obtain the independent whole-batch reviews and experience verification.

## Preservation, isolation and cleanup

Both browser rule files were read before browser use. Only task-owned incognito tab `tab_39_0430977b-1ed3-45f2-ac72-3683f9fe8942` and port5190 were used. The port was verified free first. Final process-level proof correlates a 900ms CPU pulse in the paused loaded final tab with **92 Linux CPU ticks in renderer PID1992115**, and records its Chrome/T3 ancestry on **factory-worker**. [Proof](/tmp/siltwake-polish-1-experience-s2a/candidate-browser-process-proof.json) and its before-sample supplement the earlier process receipts; ownership is not inferred from UA or loopback.

All held helper inputs were released, no pointer lock remained, mouse mode was Drag, diagnostic capture/storage patches were restored, and no recording was started. The owned tab closed using `t3_preview_close`. The preview server stopped normally by Ctrl-C in original exec session13266. `resource-cleanup.json` records port5190 free, owned npm/vite PIDs1994160/1994172 gone, and shared Chrome/T3 host PIDs827911/811435 preserved. No other tab/host was closed.

Original earned saves and earlier artifacts were preserved. Final original-save SHA256 readbacks are:

```text
canopy-pre-warning.json
3df46ef510e589675a422ebfbc62aaafcb626ecf3c89276c42cd5c03c219d305
final-before-paid-fabrication.json
b673cb90fc81b53cbdcbf0ee234582ae64141651e43319eceb3eae96caf0c50f
first-return-before-service.json
edb24efec61cfcd890cfa6c0b3c29286d0d7bd71f533da6673d4c5902f0c0a91
```

The immutable [manifest](/tmp/siltwake-polish-1-experience-s2a/manifest.json) excludes itself and covers **198 payloads / 26,553,671 bytes**. Every path/byte count/SHA256 was verified using the retained `verify-manifest.py`. Manifest SHA256:

```text
7970af6fbdd2c5172b83dcc267cd6af528dd47a2e08bb16a6cac76d0d29735ac
```

Source/tests were committed before this separate report. Work stops at this handoff; root owns integration and acceptance.
