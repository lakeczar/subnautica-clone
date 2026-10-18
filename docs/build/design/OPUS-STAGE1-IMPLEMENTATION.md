# Stage 1 experience findings — implementation design (OS1-01 … OS1-08)

Advice-only design, 2026-10-18, written in the same context as the [stage-1 review](../reviews/OPUS-STAGE1-R1.md). It follows the root disposition (supplied verbatim in the request) and its narrowed boundaries. This is **not** an independent review, an implementation or an acceptance claim. Root freezes the contracts and assigns Sol 6.1/max owners.

## Identity, baseline, evidence corrections

- **Model/effort:** `t3_thread_configuration` for this thread reports `claudeAgent / claude-opus-5-5`, option `effort: high`. That is the selected setting; no effective-effort readout exists.
- **Worktree:** clean on `8c4977015ef7c90738317e66ff3a160f5db0152b`, branch `t3/opus-stage1-experience-review`. `git diff c32d8c5..HEAD -- . ':!docs'` is empty, so the source under design is accepted production c32d8c5. Root's later documents (b5e88e8) are not merged here; the disposition text in the request is authoritative.
- **No browser, server or recording** was used for this consultation.
- **New receipts** in `/tmp/siltwake-opus-stage1-consult/`: `cradle-window-probe.{mjs,json}`. This is a read-only probe of compiled c32d8c5 sim modules (from the review's retained temp build `/tmp/siltwake-opus-stage1-r1/probe-build/`), used for OS1-05.
- **Manifest correction:** `/tmp/siltwake-opus-stage1-r1/MANIFEST.sha256` has 32 lines. 31 are valid payload hashes. The 32nd hashes `MANIFEST.sha256` itself, which was generated while the file was being written, so that entry cannot verify. The review's handoff sentence "32 files" overstated it: the correct statement is **31 verified payloads plus one invalid self-entry**. The original file is intentionally left unmodified.
- **Isolation correction:** the review's isolation statement rests on:
  - the page's Linux X11 UA and ANGLE SwiftShader renderer string;
  - reachability of my worker-local `127.0.0.1:5197`;
  - T3 `preview_status` reporting the tab as agent-owned with the incognito profile.

  The last item exists only in the conversation transcript, not as a retained file. **No process-level receipt (renderer PID or host process owner) was captured or retained**, so browser-process ownership is not independently proven by retained artifacts. I am not reconstructing one.
- **Ledger correction:** the fresh-run ledger initially says no pointer lock. `cleanup.json` correctly records that a page click under the default Captured mode later acquired lock in that renderer, and closing the owned tab released it. The cleanup record is the accurate one.

## Design principles for this batch

- **Two transient surfaces near their causes, one alert column, nothing duplicated:**
  - **Interaction stack**, bottom centre: current target prompt, then the action result directly beneath it.
  - **Alert column**, top centre: state-derived hazard lines, then at most one central notice.
  - **Status chip**, top right: system/persistence successes (unchanged).
  - **Call cue** at the screen edge, and **panel feedback** inside panels (unchanged).
- **Classification uses typed metadata** (`channel`, `context`, a new optional `summary`, new transient sample events), never message text.
- **No saved-state, schema, economy, movement, physics, geometry, reach or radius change.** Every new field is transient presentation data.
- Copy is **short labels and state**. Remove routine explanation. Keep hazard, recovery, persistence and narrative captions.

---

## OS1-01 — action result that survives danger (first priority)

### Player-visible flow

| Situation | Before (c32d8c5) | After |
| --- | --- | --- |
| E collects at O₂ 29 % | Nothing visible; prompt verb flips Collect → Sort | Under the prompt: **`+4 Structural alloy · Diver hold 16/16`** for 2.5 s active time. The LOW OXYGEN line stays at the top |
| E with no room, any state | Dropped under danger, otherwise a centre toast | Under the prompt, refusal style: **`No room for this bundle. Stow cargo, or deploy the 24 CU salvage buoy. Nothing collected.`** (full sim text, clamped to 2 lines), 4 s active time |
| Collect outside danger | Long centre toast with habitat lore | Same compact line. The lore already persists in Notebook → Known source habitats (`panels.ts knownHabitats` shows `s.context`) |
| Action while a panel is open | Panel feedback banner | Unchanged (panel-local result) |
| Persistence error during danger | Central, priority 4 | Unchanged: top alert column, wall-time 12 s, never replaced by a lower priority |

Summaries with no metadata fall back to the message text (2-line clamp). No queue: a newer action result replaces the current one, and an expired or cleared result is never replayed.

### Interfaces (smallest)

`src/sim/types.ts`:

```ts
// Optional on the existing notice event; transient, never saved.
| ({ type: "notice"; message: string; error?: boolean; summary?: string } & NoticeOptions)
```

Sim authors short summaries (≤ 48 chars) at the sites that already know the facts:

- `progression.ts collect()`: `+${n} ${ITEMS[item].label} · ${containerLabel} ${used}/${cap}`.
  `collect()` currently returns `string | null` and sets `s.feedback`. Do not add saved fields. Instead the `interact` source branch in `step.ts action()` pushes the action notice itself with the summary (the existing `!actionEvents.some(notice)` guard then suppresses the generic one). The quantity and destination come from a tiny return object of an internal helper (`collectBundle(s,id): {refusal, n, item, destination}`), with `collect()` kept as a wrapper for existing callers and tests.
- `board`: `Piloting Dart`. `exit`: `On foot · suit protection`. `service`: `Dart serviced`. `reserve`: `+${amount}% hull power`. `store-materials`: `Stored ${cu} CU → ${destination}`. `transfer`: `${q} × ${label} → ${destination}`. `install/remove-module`: `Trim fitted` / `Trim removed`. `craft`: `${label} made`.
  - Each is attached where that command already sets `s.feedback` and returns null.
  - Mechanism: a `pendingSummary` local passed through `action()`'s existing `events` array (push the notice explicitly), not a new state field.
- Refusals stay `string` returns. `executeCommand`/`stepGame` keep emitting `{ channel: "action", error: true, message }` with no summary.

`src/ui/notices.ts` (`EncounterPresentation`): split the single `central` slot into two typed slots:

```ts
result: { message: string; error: boolean; activeLeft: number } | null; // action channel only
central: PresentedNotice | null;                                         // hazard/system/persistence only
```

### Algorithm / precedence / lifetime

1. `notify(channel="action")` → `result = { message: summary ?? message, error, activeLeft: error ? 4 : 2.5 }`. It **ignores `danger` and `central`** entirely. Delete the `priority < 3 && this.danger` early return for the action channel, and the `observe()` clause that nulls a sub-3 central notice on danger. Neither applies to `result`.
2. `result.activeLeft` decrements only in `step()` (fixed-step active time, deterministic, frozen while paused). This is the existing `NOTICE_SECONDS` mechanism with new trial values; it is not a wall clock.
3. Clear `result` (no replay) on:
   - actor change (existing `clearAction` path);
   - refuge entry (existing);
   - panel open (`GameView.openPanel` → `hud.clearActionNotice()`);
   - menu shown (`setMenu(true)`);
   - session replace/reset (`reset()`);
   - opening phase < 4 (hide).
4. While a panel is open, `GameView.notify` keeps routing the action channel to `panels.notify()`, unchanged. The HUD `result` is cleared and not populated.
5. `central` keeps priorities persistence 4 > hazard 3 > error 2 > 1, wall time for persistence/errors, and active time for hazards. With actions removed from it, `danger` only matters for the hazard de-duplication in OS1-04.
6. **Accessibility:** a new `#action-result` element with `role="status" aria-live="polite" aria-atomic="true"`. A refusal additionally gets `data-error` styling but is **not** `role=alert`: refusals are expected and polite, and `alert` stays reserved for persistence, graphics and genuine hazards. To re-announce an identical consecutive result, clear `textContent` then set it on the next animation frame.
7. **Panel-local results** use the full sim `message` (the panel has room). Copy fixes in OS1-03 remove the duplicated numbers at the source.

### Compatibility and failure cases

- **New/Continue/Import/session replace:** `reset()` clears `result` and `central`, as today.
- **Context loss/blur:** existing `cancelFeedback`/pause paths call `setMenu(true)` → `result` is cleared.
- **Save retry/export:** persistence and system channels are untouched. A local-save success still resolves an obsolete persistence failure (existing rule); exports do not.
- **Stale command/target:** the sim refusal "Aim at a visible host within reach." is an action result (refusal style). There is no UI-side inference.

### Regressions (`tests/session-notices.test.ts`, `tests/encounter-presentation.test.ts`, `tests/simulation.test.ts`)

- With `danger=true`, an action success sets `result` with the summary and leaves `central` (hazard) untouched. An action refusal also shows.
- A newer result replaces the old one. Expiry after 2.5 s / 4 s of `step()` calls. No decrement while paused (no step). Cleared on menu, panel, actor and reset. No replay after clear.
- Persistence error plus action result plus hazard line coexist; a persistence error is never replaced by a hazard notice.
- Sim: `collect` emits exactly one action notice with `summary` matching quantity/container. Refusal has no summary. A command snapshot through `executeCommand` changes no state field.

---

## OS1-02 — reach preview and a readable cue

### Player-visible flow

| Aim (centred, LOS clear) | Before | After |
| --- | --- | --- |
| Host datum 4–8 m away, no in-reach target selected | No prompt, no cue | Prompt row, muted, **no key**: `Intake & living filters · Move closer`. A dim bracket (outline only) on the host |
| Same, but host is unknown evidence or a record | Same | `Move closer` (no name, so no remote reveal) |
| An in-reach target is selected anywhere in the cone | Prompt for it | Unchanged: the preview never shadows an executable target |
| E pressed during preview | "Nothing within reach." | Unchanged sim result, shown as a refusal-style result line (consistent with "Move closer") |
| Exhausted host with no useful action (`verb: "empty"`) | — | No preview |

### Interface

In `src/sim/targeting.ts`, refactor without behaviour change:

```ts
export const INTERACTION_REACH = 4;   // existing strict < 4 body-datum rule
export const PREVIEW_REACH = 8;
interface Candidate { target: AimedTarget; angle: number; reach: number; fresh: boolean }
function aimCandidates(s: GameState, world: WorldQueries, maxReach: number): Candidate[]  // current loop body, reach < maxReach
function pick(c: Candidate[]): AimedTarget | null                                         // current sort + near-tie rule, verbatim
export function aimedInteraction(s, world) { return pick(aimCandidates(s, world, INTERACTION_REACH)); }  // identical result
export interface ReachPreview { id: string; kind: Interaction["kind"]; host: InteractionHost; label: string | null }
export function reachPreview(s: GameState, world: WorldQueries): ReachPreview | null
```

`reachPreview`:

- Returns `null` if `aimRay(s)` is null. That keeps the existing opening/piloting/interior gates.
- Returns `null` if `pick(aimCandidates(s, world, 4))` is non-null.
- Otherwise it takes `pick` over `aimCandidates(s, world, 8)` filtered to `reach >= 4 && verb !== "empty"`.
  - The same angle limit (π/6), the same `miss ≤ radius + 0.18`, the same `lineOfSight(eye, host.center, host.solidIds)` with only own-host solids ignored, and the same tie rule.
- `label = (kind === "evidence" && !known) || kind === "record" ? null : displayLabel`. The vehicle label uses the existing HUD helper (`Dart` / `Dart · disabled`).
- It is pure. No state mutation, no discovery, no scan bookkeeping. `describe()` is already read-only.

**Boundaries.** Reach is the existing body-datum distance to `t.position`:

- `< 4` executes;
- `4 ≤ reach < 8` previews;
- `≥ 8` gives nothing.

A host whose datum is under 4 m but that fails the aim/miss test is neither selected nor previewed, which is today's behaviour. Dynamic hosts (vehicles, caches) use their current pose each frame. Known evidence previews with its name. Sort-capable exhausted sources preview.

`src/runtime/app.ts frame()` currently computes `aimedInteraction` twice per frame. Compute once:

```ts
const aim = this.active && this.state ? { target: aimedInteraction(s, w), preview: null as ReachPreview | null } : null;
if (aim && !aim.target) aim.preview = reachPreview(s, w);
```

Pass it to `view.target(aim)` and `renderer.present(state, { target: aim?.target?.host ?? null, preview: aim?.preview?.host ?? null })`. The `GameRenderer.present` overlay type gains an optional `preview`. The cost is bounded by the small interaction roster.

### Cue contrast (`src/render/targetCue.ts`, `renderer.ts`)

- Build each bracket corner as an **ink outline quad** (thickness 0.09, colour ≈ `#0f2a30`) under a **light core quad** (0.05, colour ≈ `#f3ead2`). Use a per-vertex colour attribute, keep depth testing and keep `opticalFog`.
- Uniform `uEmphasis`: 1 for the target, 0.45 for the preview. The preview core mixes toward the outline colour.
- Use one mesh per state (target, preview); both may not show at once by construction.
- Remove the single ochre colour.

### Failure cases

- Occluded or behind-camera hosts are already excluded by `along ≤ 0` and LOS.
- Opening/pilot/interior gates come from `aimRay`.
- Remote reveal of unknown evidence names is prevented by `label: null`.
- There is no Q affordance in preview.

### Regressions (`tests/targeting.test.ts`)

- Preview boundaries: datum at 3.99 m → target, no preview; at 4.0 → preview; at 7.99 → preview; at 8.0 → none.
- Preview is null when any in-reach target is selected, even if the preview host is more centred.
- An occluding unrelated solid → no preview; own-host solid → preview.
- `verb:"empty"` → none. Unknown evidence → `label === null`.
- Piloting/opening → null.
- `deepEqual` state before and after: no mutation.
- `executeCommand(interact)` at preview distance → "Nothing within reach." and no state change.
- Render-lifecycle test: the preview mesh is disabled when null and disposed with the renderer.

---

## OS1-03 — cargo hierarchy, compact rows, one tradeoff line

### Ordered layout (panel title becomes **Cargo**; container names stay "Diver hold", "Dart hold", "Workshop locker")

Every context starts with the existing one-line status (`Suit 150 m · Carried 10/16 CU · …`). Then:

| Context | 1. **Here** block (only entries that apply) | 2. | 3. | 4. collapsed |
| --- | --- | --- | --- | --- |
| Field, no container | — | Carried (compact rows) | Eat / emergency meal / buoy row | Power · Elsewhere |
| Workshop or pod bench (restored) | Store row · Fit/Remove trim row (if trim accessible and the Dart is at this site) · Service row (if a Dart here and `serviceRefusal` is null) · Recharge cells row (if any chargeable) | Carried | Locker / Dart hold groups | Power · Elsewhere |
| Seated in Dart, supported site | Service row · Fit/Remove row · Store row (Diver → Dart hold) | Carried | Dart hold group | Power · Elsewhere |
| Seated in Dart, unsupported site | Reserve-cell → hull power row (if charge < 100 and a charged cell) · Store row (Diver → Dart hold) | Carried | Dart hold | Power · Elsewhere |
| Disabled Dart within 7 m | The existing vessel card with **Patch / Tow / Salvage** choices first, unchanged copy and prerequisites | Carried | — | Power · Elsewhere |
| Supported bench, no Dart | Store row · Recharge row | Carried | Locker | Power · Elsewhere |

**Here block row formats** (one line each, with a button on the right):

- **Store:** `Store materials  [Diver hold ▾] → [Workshop locker ▾]  [Store · 4 CU]`.
  - With nothing storable: `[Nothing to store]` disabled, and no amber paragraph.
  - Drop "Individual transfers are with each container." and the routine "Meals, cells, tools and modules stay put." Show the latter only as the disabled button's tooltip/`aria-describedby`, when storable items are zero but carried non-materials exist.
- **Fit (stored trim):** `Acoustic trim · quiet 3→4.2 · boost 11→9 · 1 socket · 2 CU  [Fit]`.
- **Fit (installed):** `Acoustic trim fitted · quiet 4.2 · cruise 8 · boost 9  [Remove]`.
- **Fit (unavailable):** the same line with an adjacent compact reason from `installModuleRefusal` (e.g. `Fit at the pod or workshop cradle`) and an aria-disabled button.
- **Not yet made, blueprint known:** `Acoustic trim · make at workshop: 2 crust + 2 resin`, with no button.
- **Service:** `Dart · power 62 % · hull 88 %  [Service]`. When there is nothing to restore: `Dart · fully serviced`, no button.
- **Recharge:** `Cells 2 · 75 % → 100 %  [Recharge]`.

**Compact carried rows:**

```
Structural alloy × 8 · 16 CU                         [Move ▸]
Reserve cell 1 · 2 CU · 100 %                         [Move ▸]
Dart acoustic trim · 2 CU                             [Move ▸]
Reusable salvage buoy · 2 CU            [Deploy]      [Move ▸]
```

- `Move ▸` is a native `<details class="row-move" data-panel-group="move:${item.id}"><summary data-focus-key="move:${item.id}">Move</summary>…</details>`. It reuses `group()`, the expansion map and focus restore.
- Expanded, it lists that item's existing destination buttons (`Workshop locker · all`, `· 1`, `Dart hold · all`, `· 1`), keeping `(needs space)` markers.
- Installed modules show `Fitted in Dart` and no Move. Maintenance provenance keeps `· rescue stock`.

**Remove from the module card** the duplicate speeds line, the "Faster quiet travel…" paragraph and the `Now:` line. Facts appear once, in the Fit row. The **Dart card** (vessel service) keeps hull/power/depth. When seated: `Seated · power 100 % · hull 100 % · 180 m` (no "0 m away").

**Terminology:** "cruise" everywhere: `dartPerformance` display strings, the Fit row and the install message. In `src/sim/modules.ts` change `s.feedback` on install/remove to `Installed Dart acoustic trim.` / `Removed Dart acoustic trim into the Dart hold.` with summaries `Trim fitted` / `Trim removed`.

### State, focus and reset rules (preserve existing fixes)

- **Storage intent:** `storageFrom`, `storageToChosen`, `storageContext` and the departed-site reset in `observeStorageContext` are unchanged; the controls only move. A default is never promoted to intent by rendering.
- **Move disclosures:** keyed `move:${itemId}`, stored in `expansions`. Clear all `move:*` keys when `storageContext` changes (destinations changed) and on `resetSession()`.
- **Focus restore:**
  - Command keys are unchanged (`data-command-key`), so the focused `Store`/`Fit` button survives re-render.
  - After a transfer removes a row, fall back to the next row's `move:` summary, then to `#container-diver` (new `data-focus-fallback="carried"`), then to `panel-return` (existing chain).
  - Unavailable actions use `aria-disabled="true"` (focusable, muted). Clicking still sends the command, so the sim refusal appears in panel feedback and the validation path is unchanged.
- **Scroll:** keep `scrollTop = 0` on kind change.
- **960×600 budget:** header 70 + status 30 + Here block 3 rows × ~48 + 16 gap + first carried rows ≈ 300 px. Store and Fit sit at y ≤ 330 without scrolling.

### Compatibility and failure cases

- Item identity, provenance, CU and charge are rendered from the same state.
- Recovery and salvage are unchanged: the vessel card is moved, not rewritten.
- Remote containers stay in Elsewhere with the "Locked · restore workshop…" text.
- Buoy deploy/pack is unchanged.
- The carrier fixture panel is unchanged apart from its label (OS1-08).

### Regressions (`tests/preparation-panels.test.ts`)

- At each context fixture, the Here block order and membership match the table.
- No module speed appears twice in panel text.
- `Nothing to store` is disabled with no amber text.
- Move disclosure: expansion survives re-render; collapses on site change and session reset.
- Focus is retained on Store/Fit across refresh. A focused row removed by transfer falls back as specified.
- Storage intent: chosen destination kept at the same site, reset on departure (existing cases still pass).
- A DOM layout test at 960×600 (jsdom has no layout, so assert order plus a static height budget). The **real** check is the production recount below.

---

## OS1-04 — warning without duplicate prose, honest direction cue

### Player-visible flow (threat warn)

| Surface | Before | After |
| --- | --- | --- |
| Alert column hazard line | `SOUND HUNTER · paired calls · slow down / cover` | Unchanged |
| Central toast | `Paired warning calls. The hunter turns toward you. Slow down or reach cover.` | **Not shown** while that hazard line is present |
| Context hint (bottom-right) | `Read the upper crowns. Z quiet · cover / retreat · Tab for pulse & reserves.` | Hidden while threat mode ∈ {warn, investigate, pursue} |
| Pulse chip | `G · 25 cell points · 100 → 75%` / `G · unavailable …` | Unchanged: actual cost and unavailability stay |
| Call cue | `↗ Call · ahead right, below` | Dial pointer at 45° (top = ahead) plus `▼`, with text `Call · ahead right, below` |
| Release | `Calls fading` (central, 2.5 s) | Unchanged; no line is present during disengage, so it shows |
| Concurrent low O₂ | Banner line plus `Oxygen 35%…` toast | Banner line only (same de-dup rule, context `oxygen`) |

### Interfaces and rules

- **`hud.ts` warning lines become typed:** `{ context: NoticeContext | "pressure" | "health" | "hullDepth" | "power"; text: string }[]`. The rendered HTML is unchanged.
- **`HudView` passes `activeContexts: Set<NoticeContext>`** to `EncounterPresentation.observe()`.
- **De-dup:** in `notify(channel:"hazard")`, if `options.context` is in `activeContexts`, **drop** the central notice (the banner covers it). Hazards without a matching line pass: `recovery`, `Calls fading` (release), and threat notices in refuge transitions. When a matching line appears later, an already-shown central notice of that context is cleared in `observe()`. This removes the 34 %/35 % double reading.
- **Banner announcements:** set the visible `#hazard` to `aria-live="off"` and add a visually hidden `#hazard-announce` (`role="status" aria-live="polite"`). Write a line's text there only when a context **appears**, not on every numeric change.
- **Call cue** (`notices.ts callDirection`): return `{ sector, label, bearingStep: 0..7, elevation: "level" | "above" | "below" }` and drop `glyph`.
  - `elevation` uses the existing ±π/8 threshold.
  - `sector` is "above"/"below" only beyond π/3, as today.
  - HUD renders `<span class="call-dial" style="--turn:${bearingStep*45}deg"></span><span class="call-elev">${above ? "▲" : below ? "▼" : ""}</span>`. The dial is a small ring with one notch (top = ahead), visually a top-down compass, not a screen arrow. For pure above/below sectors, hide the dial and show only `▲`/`▼`.
  - Text label, origin detachment, 3 s lifetime and refuge/disengage reset are unchanged.
- **Positions:** keep the sector placement, but add CSS so the "ahead" and "above" cues sit below the compass and do not overlap the alert column (layout test below). No world pulse, shader, creature marker or tracking.

### Regressions

- `encounter-presentation.test.ts`:
  - threat notice dropped while the threat line is active; shown in refuge or with no line;
  - `Calls fading` still emitted on disengage;
  - oxygen notice dropped with an oxygen line;
  - persistence error unaffected.
- `callDirection` for origins ahead-right-below, behind-above, left-level, directly above and directly below → correct `bearingStep` and `elevation`; no glyph field.
- HUD: context hint empty during warn; pulse chip unchanged; `#hazard-announce` written once per new context, not per percent.

---

## OS1-05 — service discoverability; measured blocked-thrust cue

### Service state (authoritative)

`src/sim/vehicles.ts`: extract the pure check from `service()`:

```ts
export function serviceRefusal(s: GameState, id: string): string | null  // exactly service()'s current checks, in order
export function service(s, id) { const no = serviceRefusal(s, id); if (no) return no; /* existing mutation */ }
export function serviceWouldRestore(s: GameState, v: VehicleState): boolean // charge<100 || health<100 || emergencyAir<120 || a cell in diver/craft hold <100
```

Dart card (`hud.ts` vitals, piloting only) adds one line:

| Rule result | Line |
| --- | --- |
| `serviceRefusal === null && serviceWouldRestore` | `Service here · Tab` |
| `serviceRefusal === null && !serviceWouldRestore` | nothing |
| refusal is the disabled-hull patch refusal, at a supported site | `Patch hull first` |
| unsupported site / berth / any other refusal | nothing (never implies service) |

Classification is by **code, not message**: `serviceRefusal` returns the string for command use, and `serviceState(s,id): "ready" | "patch" | "unsupported" | "away"` is a sibling helper sharing the same checks. Occupancy and recovery refusals belong to other commands and are not implied. The Cargo panel Service row uses the same helper (OS1-03).

### Blocked thrust — justified, measured, narrow

**Evidence:** `cradle-window-probe.json` on compiled c32d8c5 sim code. With the Dart's normal piloting proxy (`HULL_COLLIDERS.dart`, yaw-independent square of half-size 3.6), northward re-entry into the workshop cradle passes **only for x ∈ [19.5, 20.5]**. Every other tested x from 16.5 to 23.5 stops against a rail end at z = −14.4, matching the review's retained camera z = −13.94 plus the eye offset. At low speed no impact event fires, so thrust silently does nothing. This is real solid contact, not tooling. Geometry and proxies stay unchanged by decision; the fix is honest feedback.

Transient sample event (`types.ts`), never saved, mirroring the accepted `ascent-sample`:

```ts
| { type: "thrust-sample"; actorId: string; requested: number; actual: number; solidLimited: number } // metres this step, horizontal
```

`step.ts` piloting branch:

- Emit when `speed > 0`, `Math.hypot(forward, right) > 0.5`, the hull is not hearthline/station-keeping, and `Math.hypot(delta.x, delta.z) > 0`.
- Extend the existing `measuredWorld` wrapper so that, for each `moveCapsule` with `hitSolid` and horizontal `d`, it adds `max(0, |d_xz| − |result.position − origin|_xz)` to `solidLimited`.
- `actual` is the post-`moveHull` horizontal displacement.
- Skip when `move.hitBoundary` (the boundary notice already exists).

`app.ts` accumulator (beside `observeAscent`, same reset discipline):

- **Count a step** when `requested ≥ 0.02` (≈ 1.2 m/s), `actual ≤ 0.1 × requested`, and `solidLimited ≥ 0.8 × (requested − actual)`.
- **Show** after ≥ 0.5 s of consecutive counted steps.
- **Reset** on any failing step, actor change, pause/menu/panel, session replace or opening.
- **Display** `Blocked ahead` in the existing blocked-ascent slot. Rename the element to `#blocked-move` with text `Blocked above` / `Blocked ahead`; ascent wins if both are true.
- **At the workshop cradle** (existing hint rectangle) the context hint additionally reads `Centre between the rails` while blocked. This is text only, no lane markers.

**False-positive exclusions:**

- sliding along a wall (actual > 10 %);
- strafing or vertical-only input (horizontal forward threshold);
- surface clamp (vertical);
- boundary;
- disabled/zero-power craft (speed 0);
- stationary craft with no input.

If root prefers to defer this item, the service line alone resolves the forced-docking impression. The cue is the smallest honest remedy for the measured silent block.

### Regressions

- `simulation.test.ts`: a thrust-sample against the starboard rail end from x = 22 gives `actual ≈ 0` and `solidLimited ≈ requested`. At x = 20 passing → `actual ≈ requested`. Strafe along the rail → actual > 10 %. Open water → `solidLimited = 0`.
- `app.test.ts`: the accumulator shows after 0.5 s, resets on release/pause/actor.
- `vehicles` unit: `serviceRefusal` equals the `service()` refusal for all branches; `service` mutation is unchanged.

---

## OS1-06 — type floor, non-overlap, one hint

- **Type floor** (`hud.css`): `--hud-label: 11px` (uppercase captions such as O₂/HEALTH/DEPTH/eyebrow), `--hud-secondary: 12px` (sublabels, hints, toolbar text, pilot guidance, prompt `small`, result line), `--hud-key: 11px` (`kbd`). Replace every 7–10 px declaration in HUD rules; at ≤ 900 px allow 11/11. The toolbar stays stable (no auto-fade, deferred). At ≤ 1024 px reduce button padding to keep the toolbar clear of the compass.
- **Interaction stack:** a new `#interaction-stack`, `position: absolute; bottom: 112px (1280) / 100px (960); flex-direction: column; gap: 6px; max-width: 520px (1280) / 360px (960)`, containing `#interact-prompt`, `#action-result`, `#look-action` in that order. Empty children are `display: none`, so no overlap is possible.
- **Alert column:** a new `#alert-stack` at top centre (current hazard top), containing `#hazard`, then `#notification` (central). Remove `#notification`'s separate bottom positioning. In the menu and panel screens keep the existing alternate positions.
- **One hint:** `control-hint` is hidden whenever `context-hint` is non-empty. The board feedback becomes the summary `Piloting Dart`, so no centre toast repeats the controls.
- **Capture affordance:** `Click to look` stays in the stack whenever lock is lost or denied (with the fallback text), never on a timer. Deliberate resume and context-loss behaviour are unchanged.
- **Regressions:** a DOM test asserting containment/order; computed `font-size ≥` floor for listed HUD selectors; control-hint empty when context-hint set. **Production stills** at 960×600 and 1280×800 must show no overlapping boxes among prompt, result, look action, alert column, call cue, compass and toolbar.

## OS1-07 — fabrication readiness and the rebuildable Dart

- **`progression.ts`:** add `craftingBlock(s,id,world): { code: "opening" | "blueprint" | "site" | "restore" | "needs" | "materials" | "rescue-low" | "duplicate-hull" | "space" | "other"; message: string } | null`. `craftingRefusal()` returns `craftingBlock()?.message ?? null`, so callers and tests are unchanged. `panels.ts` groups by `code`, replacing today's `refusal.startsWith(...)` matching.
- **Groups:**
  - `Ready here` (button `.primary`);
  - `Needs materials`;
  - `Needs preparation / another bench`;
  - new **`Current craft`** for `duplicate-hull`;
  - `Completed` (collapsed, once-recipes only).

  Unavailable buttons are `aria-disabled="true"` with the adjacent reason already rendered (`recipe-status`), `aria-describedby` linked.
- **`Current craft` row:** `Build Dart scout · Dart owned — in cradle`. Location is computed live:
  - `in cradle` iff `supportedServiceSite(s,v) === "island_workshop"`, `distance(v.pose, DART_BUILD_POSE) < 1.5` and speed < 0.2;
  - otherwise `piloting`, `disabled · SE 140 m` or `SE 26 m`.

  Reason: `One Dart at a time · salvage its frame to rebuild`. When the Dart is salvaged (no Dart exists), `craftingBlock` no longer returns `duplicate-hull`, so the recipe returns to its normal group automatically. It is never marked completed from `crafted` history (`once:false` respected).
- **Copy (`progression.ts craft()` feedback):**
  - Dart: `Dart scout built · in the yellow cradle. Board from the cockpit side.` (summary `Dart scout built`).
  - Trim: `Acoustic trim made · fit it from Cargo at the pod or workshop cradle.` (summary `Acoustic trim made`).
- **Echo banners:** drop the companion notices `Refuge services · Fabricate.`, `· hold and recovery.`, `Cargo cache reached…` and `Local recovery bench · Hold.` on `interaction-panel` events (the opened panel is the response). Keep `· in notebook.` only if root wants an audible confirmation; I recommend dropping it too. Focus stays as accepted: craft → `panel-title`, others → target. First-ready focus is not proposed.

## OS1-08 — small copy cleanup

- **Pod checks** (`registry.ts OPENING[*].detail`): remove the key-instruction prefix that the button already shows. Keep narrative remainders: `The air refuge remains protected.`, `Your hands remember the work.` Phases 0 and 2 then have an empty detail; hide `#opening-detail` when empty. Captions and skip are unchanged.
- **Toolbar, panel title, nav:** `Hold` → `Cargo`. Container names keep "hold"/"locker".
- **Notebook:**
  - Delete `Either early lead can be investigated first. Personal field notes add context; they do not unlock the investigation.`
  - Empty habitats: `No habitats recorded yet.`
  - Keep the hint button, optional-record guidance and Dive preparation details.
- **Pause subtitle** (`view.ts showMenu`): hide `#menu-subtitle` when `hasSession`. The title screen tagline stays.
- **Seated Dart card:** `Seated · …` (OS1-03).
- **Carrier fixture:**
  - menu summary and panel title `Developer test · carrier fixture`;
  - HUD region name while in the fixture `Carrier test fixture`;
  - the existing seeded-feasibility label stays inside.
- **Deferred:** Escape-to-resume, toolbar auto-fade, debug-menu rework.

---

## Production comparisons (labelled evidence)

Use the three byte-identical earned saves (`b673cb90…` paid fabrication, `edb24efe…` return, `3df46ef5…` warning). Seeded fixtures must be labelled as seeded.

| # | Case | Source | Observable success |
| --- | --- | --- | --- |
| P1 | Fresh New → C02 approach from ~6 m | fresh | Muted `Intake & living filters · Move closer`, no key, dim bracket. Under 4 m: `E … Inspect`, light-core bracket clearly separated from the ochre box (core/host luminance ratio ≥ 3:1 sampled from the still) |
| P2 | Low-O₂ collect | seeded O₂ 30 % at reef scraps | `+4 Structural alloy · Diver hold …` under the prompt while the LOW OXYGEN line shows; second press with full hold shows the refusal line |
| P3 | Danger plus save failure | seeded quota failure + O₂ 30 % | Persistence error in the alert column, result line under the prompt, hazard line; none overlap; error persists 12 s |
| P4 | Refit recount at 960×600 | earned `edb24efe` | From the seat: Service visible without scroll. At the workshop: Store and Fit visible at `scrollTop 0`. Report nav / scroll / commands / refusals / travel; target 0 scrolls (was 3); each trim speed once on screen |
| P5 | Paid Dart build and Fabricate | earned `b673cb90` | `Ready here` primary button. After build, `Current craft · Dart owned — in cradle` with adjacent reason; banner "cockpit side" |
| P6 | Warning and release | earned `3df46ef5` | Threat line plus call cue only (pulse chip allowed); no threat toast; context hint hidden; dial notch at the correct quadrant with `▼` for a below call; `Calls fading` on cover |
| P7 | Cradle return | earned `b673cb90` after build | Off-centre entry (x ≈ 18) → `Blocked ahead` (+ `Centre between the rails`) after ~0.5 s; centred entry passes with no cue; `Service here · Tab` appears within service range before the rails |
| P8 | HUD stills | earned / fresh | 960×600 and 1280×800: no overlaps (list in OS1-06); measured font sizes ≥ floor |

No human-feel, audio or GPU claims follow from these.

## Minimal ordered Sol split and path candidates

1. **S1 — sim signals and selection (one owner).** `src/sim/{types,targeting,step,progression,vehicles,modules}.ts`, `src/content/registry.ts` (OPENING detail strings only). Tests: `tests/{targeting,simulation,expedition,modules,command-snapshot}.test.ts`, narrowly.
   - Delivers: `summary` on action notices; `aimCandidates`/`reachPreview`; `thrust-sample`; `serviceRefusal`/`serviceState`/`serviceWouldRestore`; `craftingBlock`; copy changes for board/exit/install/craft; removal of the interaction-panel echo notices.
   - No UI files.
2. **S2a — HUD/notices/cue/app (one owner, after S1 merge).** `src/ui/{notices,hud,view}.ts`, `src/ui/hud.css`, `src/render/{targetCue,renderer}.ts`, `src/runtime/app.ts`. Tests: `tests/{session-notices,encounter-presentation,presentation,app,render-lifecycle}.test.ts`.
   - Delivers OS1-01 surfaces, the OS1-02 prompt and cue, OS1-04, the OS1-05 card line and accumulator, OS1-06, the Cargo toolbar label and pause subtitle.
3. **S2b — panels (one owner, parallel with S2a after S1).** `src/ui/{panels.ts,panels.css}`. Tests: `tests/preparation-panels.test.ts`.
   - Delivers OS1-03, OS1-07 grouping/rows, notebook copy, the Cargo title and the fixture label.
   - Shared boundary: S2a owns `view.ts` (including panel-feedback routing). S2b uses the existing `notify(message, error)` API only.

Root then composes, runs the full check, performs P1–P8, and proceeds to the non-author Astra xhigh / Sol max pair and a fresh Opus experience verification.

## Acceptance checks (summary)

- **Unchanged rules:** execution reach < 4 m and LOS; no saved field or schema change; economy checks unchanged.
- **Action results:** visible under every danger state; never queued or replayed; cleared on panel, menu, actor and session.
- **Alerts:** persistence errors never suppressed; threat/oxygen prose de-duplicated by context metadata; `Calls fading` and pulse cost kept.
- **Preview:** never executable; never shadows a target; no unknown-evidence names; no through-solid cue.
- **Cargo:** Store and Fit reachable without scrolling in the retained 960×600 refit; module facts once; storage intent, focus and reset tests unchanged.
- **Dart recipe:** returns to craftable after salvage; location text matches the actual pose.
- **Blocked-thrust cue:** only from measured solid limitation with the stated exclusions.
- Full `npm run check` passes. Earned-save imports decode unchanged.

## Unresolved points for root

- **Blocked-thrust cue:** I recommend including it, on the basis of the measured ±0.5 m cradle window and the silent low-speed stop. It is self-contained and can be deferred without affecting the rest.
- **Compact action results** (summary instead of collect lore) rely on Notebook → Known habitats preserving the habitat context. If root wants the lore line visible live once per source, show the full message only on that source's first collection (`scans` already records first contact). That is presentation-side, using existing state.
- **"Cargo" rename:** I judge it coherent. If root prefers to keep "Hold", the layout is unaffected.
