# POLISH-1-EXPERIENCE — independent Sol R1

**Verdict: REQUEST CHANGES.** One reproduced P2 layout defect remains under criterion 6. Criteria 1–5, 7 and 8 are ACCEPT within the stated stage1 scope and evidence limits. This review covers the complete S1/S2a/S2b/COMPOSE/caption change, not merely the last selector. It does not accept the campaign, waive later Opus verification, or establish human/hardware performance.

## Identity and isolation

- Frozen candidate: `e81bb6fa3e19f01641f6fe874cce70443263b257`; diff base: `c4de57928347c89ea7602a13d1e14a2849caf722`.
- Actual cwd: `/home/worker/.t3/worktrees/subnautica-clone/t3-20f08b6c`; branch `t3/siltwake-experience-review`. Initial HEAD matched the candidate exactly and tracked/untracked status was empty. No checkout switch occurred.
- Source tree: `75cef7ecbd3133d26df7a4261175d9f4412d3256`; tests tree: `cb711dcf5a97ac0374369f4aa919cd8ab0517545`. Both remain unchanged. Only this assigned new report is committed.
- Actual original runtime: **gpt-6.1-sol / max**, verified from the original session's first `turn_context`, ordinal 7, timestamp `2026-10-18T17:24:59.069Z`, turn `01a1500b-9625-7561-9d72-ca73befe25d1`. This is an executed runtime receipt, not a composer selection. Original session: `/home/worker/.codex/sessions/2026/10/18/rollout-2026-10-18T12-24-58-01a1500b-9411-7752-9a00-b7de385bd899.jsonl`; retained as `original-runtime-turn-context.json` and `checkout-runtime.json`.
- Fresh non-author review. No children, peer contact, polling, production/test/config changes, parent/author artifact writes, push, PR or merge. Dispatch task ID was not supplied in the role brief; the root dispatch receipt owns that mapping.

Read STATUS first, PLAN/CONTRACTS, revised construction input and relevant delivery/integration specifications, settled map/tracker, whole-batch and leaf/reconciliation briefs, Opus R1/disposition/implementation advice, all five author reports and root inspections. Reviewed the entire production/test diff against the supplied base. The independent standards/spec review found no additional standards defect; the specification verdict is blocked by SOL-EXP-01 below. Reconciled requirements govern older implementation advice about disabled controls and rail behavior.

## Finding

### SOL-EXP-01 — P2 — cumulative warnings obscure the interaction prompt at 960×600

**Affected code:** `src/ui/hud.css:91–100` (fixed alert placement and z-index), `src/ui/hud.css:121–125` (independently bottom-anchored interaction stack), and the 960-width overrides at `src/ui/hud.css:198–200`.

**Trigger:** at 960×600, swim within 3 m of the upper Canopy resin source with the base 60 m suit, oxygen 25%, health 25, food 0, and threat warning active; carry 8 alloy (16/16 CU). Attempt collection. The production validator emits the complete capacity refusal. These are five real current typed banners: pressure, oxygen, health, threat and food. A persistence error is not necessary.

**Reproduction:** `create-warning-state.mjs` creates a codec-valid diagnostic save, checks physical clearance and actual `aimedInteraction` selection of `canopy_resin_lee_upper`. The browser probe uses the unchanged current compiled `GameView`, simulator and exact styles. Calling the real `executeCommand(interact)` preserves the entire state and produces the actual refusal; GameView renders the resulting notice. This is a native UI composition diagnostic, not an earned route or complete production-app playthrough.

**Observed:** `valid-native-five-warnings-960-no-save.json` records hazard bounds `(288.594,220,382.805,132)` and prompt bounds `(358.344,324,243.305,41)`. Their overlap is **243.305×28 CSS pixels**, the full prompt width. The opaque warning stack at z-index 8 covers the E key and source name; the retained image `valid-native-five-warnings-960.png` visibly confirms it. The full refusal and look control remain readable. A supplemental concurrent-save-error probe also overlaps. At1280×800 the same state is disjoint, which narrows the defect to the compact composition.

**Player consequence:** while several warnings are active, the player loses the actionable prompt/key/target, despite correct target selection and preserved action feedback. That violates criterion 6's composed prompt/result/look usability. It is a bounded P2 blocker for this correction batch, not a state/economy failure or a claim that a normal route was completed in this seed.

**Expected correction/check:** reserve space based on actual warning/interaction height, or otherwise place the regions so they remain disjoint at 960×600 while preserving full warning/refusal text and the 12px floor. Retain a focused native layout check with these five banners, prompt, full refusal and look control, with and without a persistence failure, plus the 1280 comparison. Unit checks that only assert text/markup presence cannot detect this defect. No fix was made in this review.

## Eight criteria

| # | Verdict | Evidence and assessment |
|---|---|---|
| 1. Action outcomes | **ACCEPT** | Collection summaries derive from actual granted quantity/container usage; repeated pickups each emit one collect sound, refusal emits none. Source lore stays in Known habitats. Independent action/persistence/hazard surfaces preserve the complete actionable refusal. `EncounterPresentation` tests cover 2.5/4 active-second expiry and cancellation/reset rather than wall-time paints. Versioned announcements and panel routing suppress obsolete fallback without rewriting saved feedback. Current source/tests plus retained P2/P3 and our real capacity refusal support this. SOL-EXP-01 obscures the separate prompt, not the result. |
| 2. Approach preview | **ACCEPT** | Shared selection preserves executable reach strictly below 4 m; preview is4≤distance<8, absent when a target is reachable, and never executes or discovers knowledge. Unknown evidence/records keep generic labels. LOS/own-host ignore/ties and opening/pilot/interior gates remain in targeting. Target cue keeps depth test/fog, light core/dark edge, bounded mesh lifecycle and quieter preview. Targeting/experience/render lifecycle tests and personally inspected P1 images support these distinctions; P1 raw knowledge remains only earned C01, not C02 granted by preview. |
| 3. Cargo/fabrication | **ACCEPT** | Here precedes carried rows and keyed native Move. Earned P4 at 960 shows Store/Fit without scrolling and one trim tradeoff. Read actual prerequisite/disabled-reason paths, detached recovery/reserve previews, semantic focus and same-site/departure intent handling. Current craft grouping tests live ownership independently of the first site refusal, distinguishes cradle/occupied/disabled, and preserves paid rebuild after salvage. Reconciled tests retain underlying item/vessel identity, full no-mutation refusals, recovery prerequisites and paid salvage/rebuild; they do not merely relabel expected headings. Own native keyboard transfer/focus, disabled Store and stale enabled Store probes passed; details below. |
| 4. Hazards/calls | **ACCEPT** | Dedup consumes the exact current rendered typed banner set; hidden HUD supplies no coverage. No stale frame/string classification is introduced. Persistence, unmatched recovery/release and pulse cost remain separate. Calls use a copied emission origin, discrete horizontal bearing and independent elevation; actor/refuge/warning/release resets and lifetime remain tested. Announcements change on context appearance rather than every numeric percent, and the redundant threat hint is suppressed. Personally inspected P6 warning/release imagery and raw workflow/paid-cell audit. |
| 5. Service/measured movement | **ACCEPT** | Shared authoritative service queries preserve command refusal precedence and show support even when fully serviced. Current `thrust-sample` observation requires eligible powered Dart forward input, meaningful request, actual≤10% requested and solid limitation≥80% of missing progress for 0.5 active seconds. Release, absent samples, progress, boundary and session/actor/pause reset; ascent takes priority. Rail-specific copy requires actual rail-end context. Physics/velocity/docking formulas remain unchanged. App tests plus independent exact input replays distinguish floor stops from qualifying solid contact. |
| 6. Readable composition | **REQUEST CHANGES** | Final caption selector correctly raises the compact pause label to11px; final caption960/1280 captures and byte-matched build support it. Measured actionable/secondary text and keys meet 12px; Store/Fit, single-warning/save/refusal, warning/call/pulse, toolbar/menu/persistence and graphics/hidden-HUD boundaries otherwise retain usable evidence. Deliberate Resume/native navigation and restrained opening/subtitle copy survive. **SOL-EXP-01** exposes an untested multi-warning prompt overlap at 960×600. |
| 7. Compatibility/invariants | **ACCEPT** | No save schema, persistent domain field, source yield, economy or handling change. Registry edits in scope concern opening helper copy; added events/presentation types are transient. Shared crafting/service queries preserve original validation ordering; detached command previews clone state. Existing air authority, rescue/frame/cap/rebuild, retry, storage-intent and panel/refuge/input invariants retain behavioral checks. ROOT-EXP-01 is closed: surface/refuge/Dart air labels are unlimited where authoritative, emergency/suit labels show finite seconds, including disabled surface0-oxygen cases. |
| 8. Current evidence | **ACCEPT, qualified** | Fresh 399/399/typecheck/build and both economies pass. All 27 final build payloads byte-match caption author output. All 1,340 payloads in five immutable author archives verified twice. Retained actual exports/replays and paid transactions independently reproduce; source attribution and fresh/earned/seeded distinctions remain explicit. Native focus/disabled/stale-command checks cover real browser behavior beyond the DOM ports. Known missing full exports, old journals, excluded routes/captures, human/audio/hardware and our inconclusive production follow-up remain disclosed below. This acceptance does not claim unrecorded data or resolve criterion6. |

## Checks and focused evidence

Fresh `npm ci`, `npm run check` (**399/399**, strict TypeScript, production build), `node scripts/check-m1-economy.mjs` and `node docs/build/design/check-economy.mjs` pass. Existing large-main-chunk warning remains nonblocking. The source/test/build relationships are recorded in `checkout-runtime.json`, `build-comparison.json` and `reviewer-assertions.json`.

Final production payloads, all 27 matched:

- `index-CCLbdff-.js`: `95cf4bab359e6fd28bbeecb72755294a7be6b86dcb56107fd0a8b0e492724f65`.
- `index-BJIWxO4z.css`: `c7cef898ba99dd07af6e7de07d85394b83d7aa078b06c95a392cee358d78611a`.

Reviewed copies/adaptations of author verification scripts run only in reviewer-owned outputs and import current compiled source. They independently establish:

- Reload downloads002/003: complete decoded state equality at 18457, 0 elapsed ticks, all state keys; not a pose-only or repository-fallback comparison. The app export path prefers active session envelope.
- Aligned P7: 648 replay steps, all 47 pose/yaw samples and the complete actual final active export equal; 160 floor stops, 0 solid limitation, 0 qualifying steps/cue. Off-centre P7: 1128 steps, all 86 samples equal, 194 consecutive qualifying steps; threshold 8856 and retained DOM cue 8860. No complete active final export exists for that separate off-centre branch.
- P2: two +4 alloy receipts, total +8 alloy / 16 CU, stock decremented correctly, two collect oscillators, no extra collect sound/mutation on refusal; habitat prose only in Notebook.
- P4 raw events 118–140 independently recount 4 navigation, 0 scrolls, 5 commands, 0 refusals, 1 travel leg through fitting. Extended departure includes the mis-aimed E and ordinary reverse cruise; it is not a quiet-departure proof.
- P5 paid Dart consumes 6 alloy / 3 glass / 2 membrane. Current ownership labels and prerequisites remain truthful. S2b paid salvage/rebuild derives from an earned state with local staging/disable diagnostics; it is not an ordinary recovery route.
- P6 pulse debits 25 points from the selected cell and leaves the other unchanged. Quiet-release raw DOM/input is retained, but its final stored journal is old (9304), so no full active equality is claimed.

Own native browser probes use unchanged compiled modules and exact current styles (byte-verified), real GameView/PanelView and real command validation. Trusted Enter opens alloy Move, Tab reaches its first transfer, and Enter moves exactly 3 alloy to pod storage; focus lands on `move:item_2`. Full pod storage makes Store native-disabled, unfocusable and non-dispatching with full state equality. A deliberately stale enabled Store node after departure dispatches the actual validator refusal, preserves the entire state, and shows full panel feedback. These are focused diagnostic UI checks; they do not replace the production P1–P8 route evidence.

Personally inspected actual P1 preview/executable, P3 qualified concurrent, P4 earned Store/Fit, P5 paid current-craft, P6 warning/call/release, P7 measured-contact and final caption pause captures. All full gameplay P1–P8 evidence remains attributed to **5005095**; the final CSS-only caption captures remain **f2e634a**. Equality of gameplay JS and all 27 rebuilt files supports reuse without relabeling historical images as newly played source.

## Evidence manifest and limits

Reviewer artifact root: `/tmp/siltwake-polish-1-experience-sol-r1/`. `EVIDENCE-INDEX.md` maps raw inputs, saves, checks, screenshots, adapters, assertions, exclusions and cleanup. Immutable manifest: **167 payloads / 4,699,912 bytes**, SHA256 **`899ccb284c26a3178122187c5fbe5e9eeafffb62108a83d8c442d93d4bf84a93`** (`manifest.json`; manifest and sidecar excluded).

Original archives were not modified; manifest and payload hashes match at review start and end:

| Archive | Payloads | Manifest SHA256 |
|---|---:|---|
| S1 |444|`1e1c748a296e83b890ff30022455226b01f8411f27a438c8203be62e30bf9778`|
| S2a |198|`7970af6fbdd2c5172b83dcc267cd6af528dd47a2e08bb16a6cac76d0d29735ac`|
| S2b |220|`1ceecb6cb64225a2b0d0be57826a8f50da07d308d1b72d94996a9b010e4e0163`|
| COMPOSE |368|`42334db877ec81cd3d07cfa5ee6df50dbd95725965063ada4e626a608846d50c`|
| Caption |110|`e66c1d0fa7a6eab7d58e2351fbdcd172cf7c30d572d4c45e9dac2df17e2dc47d`|

Historical S2a four missing final streams/mislabeled rail captures remain limits. Preliminary preflight/paused/invalid captures do not become full-play evidence. Old journal checkpoints cannot stand in for active exports. The off-centre P7 and quiet-release limits above remain real. No human mouse-feel, audio-mix, enjoyment/duration or representative-GPU pass follows; full M2–M4/campaign content remains required.

The attempted own production-app follow-up was **inconclusive**: initial adapter/hidden-selector mistakes and premature import interruption were corrected, but a later click timed out and T3 reported `No preview automation host is available for press in environment eff88ded-2882-487b-9095-28cba8588c98.` Status then recovered on the same tab without relaunch. No complete active export/capture was retained from that attempt; its empty/hidden snapshots and journal are explicitly excluded. The confirmed finding instead uses the labelled unchanged native UI diagnostic and real simulator refusal described above. No tool/adapter error is reported as a product defect. `browser-limits.json` retains the raw errors/exclusions.

## Browser cleanup

Read both fleet/repository browser rules before browser work. Used T3 status/open and one task-owned incognito tab `tab_3c_0430977b-1ed3-45f2-ac72-3683f9fe8942`, isolated storage and assigned port 5192. Process ownership was established by a 900 ms target-page CPU pulse correlated with 95 Linux CPU ticks on renderer PID 2056910, UID 1000, on `factory-worker`, with `/proc` executable/ancestry through shared Chrome 827911 and T3 host 811435. UA/loopback were not treated as proof.

No physical input or Windows automation; all native key presses have matching keyups. Restored the temporary diagnostic `Storage.prototype.setItem` patch before leaving production; no pointer lock held. Retained own input/state/screenshot/process evidence, disposed the native view, closed only the owned tab through `t3_preview_close`, then stopped server 2056894 normally with SIGINT. T3 reports no attached tab. `cleanup-final.json` confirms own renderer/server gone, shared browser/T3 host preserved, no 5192 listener, and a successful 5192 bind+listen with `SO_REUSEADDR` (ordinary closed-connection TIME_WAIT explains a preceding plain-bind refusal). No kill/relaunch loop or peer wait occurred.
