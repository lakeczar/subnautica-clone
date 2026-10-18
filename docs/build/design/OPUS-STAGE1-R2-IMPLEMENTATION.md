# OPUS-STAGE1-R2 implementation advice

Advisory only. This is follow-up advice in the completed Opus stage1 R2 context (Claude Opus 5.5, `claude-opus-5-5`, selected effort high), not an independent review round. It changes no production code and claims neither a repair nor acceptance. Sources: [R2 report](../reviews/OPUS-STAGE1-R2.md) (c4f2088), root [disposition](../reviews/OPUS-STAGE1-R2-DISPOSITION.md) (root cfe518f), root diagnostics `/tmp/siltwake-opus-stage1-r2-root/`, and source d9aaf6356cb320f283887922abf97ed8bdc54f59.

## Summary of recommendations

1. **Prevention (OS2-01):** fix both unchecked vertical corrections, the diver surface clamp and the hull depth clamp, with a **tiered verify → capped retry → rollback** correction. A collision-aware swept correction prevents overlap but lets divers and Darts climb rib flanks above the water, so do not use it.
2. **Separation:** let an actor already overlapping a canonical rib make any **non-closing** linear move. Treat a closing move as contact at t = 0, so the existing slide removes only the inward component. Add an endpoint guard that rejects any deeper result. A zero-length normal still fails closed.
3. **Trapped-save recovery:** **no decode relocation in this correction.** Runtime separation already frees the actual export and every legacy trapped state I could generate.
4. **No `WorldQueries` / `Capsule` / save-schema change** is needed.
5. **Ownership:** one Sol owner for OS2-01 (`step.ts`, `world.ts`, `ribCollision.ts`, tests). Then a separate small presentation/copy task for OS2-02/03/07, sequenced after OS2-01 because both touch `step.ts`.

## Evidence base (diagnostic, not gameplay)

All probes use the real compiled d9aaf63 modules or private prototype copies under `/tmp/siltwake-opus-stage1-r2-consult/`, hashed in `SHA256SUMS.txt`. The prototype diff is `patches/proto2-diagnostic.diff`, 105 lines. The original archive and root's directory were only read.

**Seeded grid ("path grid").** Starts around all 36 canonical rib segments: 2 positions along each segment × 8 directions around it. Each start runs 36 command variants (3 yaw offsets × 4 pitches × 3 vertical inputs), and each run is 50–90 ticks of forward input. That gives 20,736 diver runs and 7,668 Dart runs from valid starts. These numbers count runs, not human incidence.

**What baseline d9aaf63 produces (`path-probe*.json`):**

| Actor | First clear→overlap cause | Count |
| --- | --- | --- |
| Diver | Swim surface clamp, `step.ts:613-621` (967 after the final slice, 67 between slices) | 1,038 / 20,736 |
| Dart | Hull depth clamp `y = min(-0.9, y)`, `step.ts:453-457` | 494 / 7,668 |
| Either | Swept result itself overlapping | 0 |
| Either | Support/floor snap up | 0 |
| Diver walking over emergent rib tops (`dart-and-walk-probe.json`) | — | 0 / 48 |

A baseline-trapped Dart cannot move: 0 m escape over 72 attempts × 60 ticks. Diver exit from it is still allowed (`exitRefusal` returns null).

**Unaffected paths, by reading:**

- Exit/board poses are validated by `clearance`.
- Bobbin tow uses `moveHull` and aborts on `hitSolid`.
- Carrier interiors use their own rib-free roster.

**Variant comparison on the same grid.** "Clean" = cases baseline never trapped.

| Variant | Overlaps | Clean cases changed | Other effects |
| --- | --- | --- | --- |
| A: swept, non-sliding vertical correction (`proto`, `stability-probe.json`) | 0 / 0 | 40 diver, 15 Dart | **Climbing.** Divers ride rib flanks up to 4.19 m above the surface; 821 of 926 formerly trapped Darts stay above −0.9 after input release (beached on ribs). Rejected. |
| B: cap requested `delta.y` at the surface only | not prototyped | — | Insufficient by construction. The slide adds rise: the rib normal at the trap has +y 0.566 (root `probe.json`), so removing an inward component pushes the actor up. |
| **C: tiered verify → retry → rollback (`proto2`)** | **0 / 0** | **0 / 25,916 (bit-identical)** | Formerly trapped cases: 1,126 diver and 580 Dart stalls while input pushes into the rib. Every stall escapes in another direction (diver minimum best escape 1.70 m; Dart 11.5 m). No diver above the surface after arriving from below (max excess 0). No Dart above −0.9. 0 divers unsettled after release. |

Further results:

- **Root repro** (`repro.mjs` on `proto2`): both cases green. The unchanged checkout is still red.
- **Legacy states built with baseline steps, then run on `proto2`** (`legacy-trap-escape.json`): trapped Darts leave by 12.4–13.1 m. The actual export moves 3.12 m, ends with +0.716 m rib clearance, encodes and re-decodes successfully, and `migration` stays null.
- **Full suite on `proto2`: 399/400.** The only failure is `tests/rib-collision.test.ts:174-187`, which asserts the old "overlap never moves" policy (see Q4).
- **Adversarial separation on the full world** (`adversarial-probe-proto2.json`, 2,000 random 0.3 m directions per pose):

| Pose | Overlapped segments | Result |
| --- | --- | --- |
| Swimmer at junction 11/12, 10 mm | 12 | 0 deeper, 0 new overlaps, stationary input unchanged |
| Swimmer at junction, 60 mm | 11, 12 | same |
| Dart proxy, 30 mm | 13 | same |
| Swimmer mid-segment, 250 mm | 4, 5, 6 | same |
| Point actor exactly on a rib axis (zero normal) | — | does not move; `hitSolid` |
| 10 mm overlap moving outward toward a box placed 5 cm out | 5 | stops 1e-4 m before the box face |

The 63 "new overlaps" in the box case come from my two-solid test world, which omits the neighbouring ribs. That is an artifact, not a defect.

**Limits:**

- I sampled only around the canonical ribs. Box solids and terrain were not swept as primary targets; they are covered by the existing suite.
- The 244 non-escaping Dart stalls fall in bit-identical, baseline-clean trajectories. They likely come from my seeded hull starts, which were validated with `clearance` rather than `hullClearance`. I make no claim about them.
- No browser or live play was used for this advice.

## 1. Prevention at the actual callsites

### Diver: swim surface correction (`stepGame`, swim slice loop, `step.ts:571-622`)

Keep the slice loop and its ordering: floor-step guard → `nextSupport` → `moveCapsule` → solid-limited ascent accounting → floor snap → surface rule. Change only the surface rule body.

```ts
const sliceOrigin = { ...position };                 // capture before world.moveCapsule
const move = world.moveCapsule(position, delta, capsule);
// … unchanged ascent accounting, floor snap …
if (mode === "swimming" && position.y > -0.5 && old.y <= -0.5 && floor < -0.55) {
  if (ascent) ascent.surfaceLimitedRise += position.y + 0.5;   // formula unchanged
  const clamped = { ...position, y: -0.5 };
  if (!world.clearance(position, capsule) || world.clearance(clamped, capsule)) position = clamped; // tier 1 = today
  else {
    const retry = world.moveCapsule(sliceOrigin, { ...delta, y: Math.min(delta.y, -0.5 - sliceOrigin.y) }, capsule);
    const retryClamped = { ...retry.position, y: Math.min(-0.5, retry.position.y) };
    position = world.clearance(retryClamped, capsule) ? retryClamped : sliceOrigin;   // tier 2 / tier 3
  }
  vy = 0;
}
```

**Why these tiers:**

- **Tier 1** reproduces today's result exactly whenever the clamp creates no overlap. That is every non-trap case (proved bit-identical on 19,174 diver runs).
- **Tier 2** keeps tangential progress along the rib without letting the slide lift the actor above the surface.
- **Tier 3** keeps the clear slice origin. The actor stops against the rib as it crosses the surface plane, which is truthful contact, not an invisible wall: the rib occupies the swimmer's box at that plane. Diving under or turning away still works.

**Ascent metrics:**

- `surfaceLimitedRise` keeps today's definition, the pre-clamp excess. The surface rule is still the reason the rise stopped, so `app.ts:476` keeps suppressing "Blocked above" at the surface.
- `solidLimitedRise` stays as accumulated by the first sweep. Do not add the retry's measurement.

**Floor snap and mode:**

- In tier 2/3, `floor < -0.55` was established at the pre-clamp pose. The chosen pose differs horizontally by at most one slice (≤ 0.12 m).
- Do not snap again inside the rule. The existing `finalSupport`/mode logic after the loop is unchanged.
- Add a regression asserting every chosen pose satisfies `world.clearance`.

**Static versus swept acceptance:**

- Tier 1 and the retry accept on static `clearance`. This matches the RIB contract's tolerance and keeps bit-identity.
- The vertical distance checked statically is at most one slice's rise (≤ 0.12 m, because the slide never lengthens `remaining`).
- Every current solid is thicker than that vertically: roofs 0.3 m, decks 0.38 m, ribs ≥ 1.74 m diameter. Sol should add a geometry test that records this assumption (min vertical solid thickness > 0.12 m).
- A swept downward probe (`moveCapsule` with a pure vertical delta and `hitSolid` false) is stricter. It can reject near-tangent poses that baseline accepts, so treat it as an alternative and measure clean-case mismatches before using it.

### Hulls: depth / Spindle surface correction (`step.ts:450-457`)

Same three tiers, using the unmeasured `world` for the retry so thrust/ascent samples are not double-counted.

```ts
const hullOrigin = { ...v.pose.position };            // before moveHull(measuredWorld, …)
// … move = moveHull(measuredWorld, …); ascent.surfaceLimitedRise unchanged …
const shape = HULL_COLLIDERS[v.hull];
const targetY = v.hull === "spindle" ? -0.4 : Math.min(-0.9, move.position.y);
const clamped = { ...move.position, y: targetY };
if (targetY !== move.position.y && world.clearance(move.position, shape) && !world.clearance(clamped, shape)) {
  const retry = moveHull(world, hullOrigin, { ...delta, y: Math.min(delta.y, targetY - hullOrigin.y) }, shape,
    v.hull === "hearthline" ? carrierTravelBounds() : undefined);
  const retryClamped = { ...retry.position, y: v.hull === "spindle" ? -0.4 : Math.min(-0.9, retry.position.y) };
  move.position = world.clearance(retryClamped, shape) ? retryClamped : hullOrigin;
} else move.position = clamped;
```

- Impact damage and velocity halving keep using the first attempt's `hitSolid`.
- `thrust.actual` (`step.ts:487`) is computed from the final position. A rollback can therefore feed the existing 0.5 s obstruction gate, which is truthful ("Blocked ahead"). Do not loosen that gate.
- The Spindle forced −0.4 is corrected in both directions by the same rule.
- Hearthline passes the existing carrier tests on `proto2`.

### Not changed

- The upward support/floor snap and `moveHull`'s footprint correction showed no overlap path. Leave them unchanged, but cover them in regression (Q4).
- Expand ownership only if Sol reproduces a real path.

### Implementation hazard

Every `WorldQueries` wrapper must stay argument-faithful. My first probe wrapper dropped an argument and fabricated a failure. Tiered C needs no new argument; if Sol picks variant A anyway, `measuredWorld` (`step.ts:440`) must forward any new options.

## 2. Separation from existing overlap (`sweepBoxRib` + `moveCapsule`)

**Basis.** For a canonical rib with axis segment S and radius r, and an actor box B, let g(s) = dist(S, B + s·Δ) − r.

- dist between two convex sets under translation is convex in s, so g is convex.
- Its right derivative at 0 is n·Δ, where n is the `segmentBoxClosest` normal from axis to box. n is unique when the distance is greater than 0.
- Therefore n·Δ ≥ 0 implies g is non-decreasing on [0, 1]: a non-closing linear move can never deepen that rib.
- With several overlapped segments, each g_i is non-decreasing, so their minimum is too. This covers arch junctions.

**Policy in `sweepBoxRib`** (replace `ribCollision.ts:104-105`):

| Condition | Return | Reason |
| --- | --- | --- |
| gap not finite | `{t: 0, stop: true}` | fail closed |
| gap < −tolerance and (i > 0, or distance ≤ 1e-9) | `{t, stop: true}` | Overlap can only be present at the start pose, because advancement stops at contact. distance ≤ 1e-9 means the axis touches the box: zero normal, fail closed. |
| gap < −tolerance and closing > 1e-12·max(1, \|Δ\|) | `{t: 0, normal, stop: false}` | Contact at t = 0. The existing slide removes only the inward component; the next iteration is tangential. |
| gap < −tolerance, otherwise | `null` | Non-closing: this rib does not limit the move. |

**Endpoint guard in `moveCapsule`** (per slide iteration; `world.ts:412-431`):

- Before sweeping, list the canonical ribs whose static gap at `position` is below −tolerance, using the existing broadphase with zero delta.
- After computing `next`, reject it (set `hitSolid`, break, keep `position`) if any listed rib's gap at `next` is more than 1e-9 below its start gap.
- This numerical backstop keeps the convexity argument honest without trusting a derivative sign.

**What stays the same:**

- Non-overlapped ribs and all box solids keep their unchanged continuous sweeps. The swept guarantee is untouched for anything newly encountered.
- `RIB_SLIDE_ITERATIONS` = 8 and `RIB_SWEEP_ITERATIONS` = 64. An exhausted slide keeps the last verified pose, as today.
- Hull proxies use the same code.

**Fail-closed outcome.** Only zero-normal or non-finite cases stay frozen. A zero normal needs the rib axis to touch the actor box, i.e. penetration of at least the rib radius (0.87–1.12 m). No caller can produce that after prevention: the grid shows no overlap at all, and pre-fix clamp overlaps observed so far are ≤ 0.037 m for hulls and 0.0131 m for the export. Ordinary recoverable states therefore don't become new permanent traps.

**Do not copy the existing box-solid leniency.** `sweep()` returns null whenever its start already overlaps, which allows movement deeper into a box. Leave it unchanged in this correction and record it as a known asymmetry.

## 3. Trapped-save recovery

**Recommendation: do not add decode relocation now.**

Runtime separation recovers every overlap with a defined normal:

- the actual export (3.12 m on first input, clean round trip, `migration` null);
- baseline-built trapped Darts (≥ 12 m escape);
- 0 failures in the adversarial set.

A decode repair would add:

- a new teleport path that must prove it can't cross ribs, roofs or carrier seals;
- notice semantics the current code lacks. `migration` is never cleared and re-announces on every Continue (`session.ts:163`), while Import does not announce it at all (`session.ts:202-208`);
- a new idempotence/encode obligation;
- a conflict with the codec rule "reading never moves a vessel/cargo".

The cost outweighs the benefit.

**If root still wants a backstop, keep it actor-only and narrow:**

- **Scope:** schema 2 after `validState`; player not piloting; `interiorId === null`; opening complete; actor box (walking 1.75 m / swimming 0.95 m) overlaps a canonical rib by more than 1 mm **with a zero normal**. Every other overlap is runtime-recoverable and must decode unchanged.
- **Search:** deterministic. Directions in fixed order +y, +x, −x, +z, −z, then the four horizontal diagonals. Distances 0.05 m to (r + half-extent + 0.1) in 0.05 m steps.
- **Accept a candidate only if all hold:**
  - `world.clearance` is true;
  - every rib gap is ≥ +0.002;
  - y ≥ original y − 0.05, so it never gains depth;
  - within `WORLD_BOUNDS`;
  - the straight segment, sampled at ≤ 0.05 m, is clear of every solid except the rib being exited.
- **On success:** set velocity 0, `migration` and `feedback` to "Your saved position was inside a reef rib after a movement fault, so you were moved just outside it. Inventory, knowledge and vessels are unchanged.", and the same validation as the carrier path.
- **On failure:** `{ok: false}` with "This save's position is inside reef geometry and no clear local position was found. Keep the original file; nothing was loaded."
- **Hulls are never moved by decode.** A zero-normal hull overlap should load unchanged, with the existing salvage-in-place path as the remedy. I did not verify salvage eligibility in that state; that part is uncertain.
- **Notice:** if root wants it shown once, notify on Import and Continue, then clear `migration` in the live state. That changes behaviour for the existing foundation/carrier notices too, so it is a root decision.

## 4. Regression and live acceptance

**Mandatory new coverage** (new `tests/rib-surface-trap.test.ts`, plus a fixture copy of the actual export, SHA256 `012982ea…6d55`, 6,140 bytes):

1. **Actual export:** decode; ordinary movement > 0.1 m in some direction within 60 ticks (root assertion). An outward 0.05 m move along the segment-12 normal moves exactly and ends clear. Encode → decode round trip is unchanged apart from movement, with no `migration` text.
2. **Root minimal trigger:** `createGame`, opening phase 4, (−25.9, −0.7, −7.400000000000001), yaw 1.57, pitch 0.3, forward input. `clearance` holds on every tick for at least 60 ticks.
3. **Reduced deterministic grid** (run in the suite): every 4th segment × directions {0, 2, 4, 6} × pitch {0.3, 0.8} × vertical {0, 1}, forward for 50 ticks, diver and Dart. Zero rib overlaps, and every chosen pose clear.
   - Also run the original 595-case segment-12 grid from my R2 report as a one-off evidence script.
   - Run the full 20,736 / 7,668 path grid once as recorded evidence, not in `npm test`.
4. **Bit-identity goldens.** Record exact end poses and ascent samples **before** changing code, then assert them after: free open-water surfacing, surfacing beside the pod floats, ramp walk-out, shore walk-up, Dart surfacing in open water, Spindle-free Hearthline travel. Tier 1 must reproduce today's numbers exactly.
5. **Separation units:**
   - inward move is not deeper (slide only);
   - tangential move is not deeper;
   - junction two-segment overlap;
   - Dart proxy junction;
   - 250 mm non-zero-normal overlap;
   - zero-normal axis point stays frozen with `hitSolid`;
   - zero-delta move from overlap leaves the pose unchanged;
   - outward move toward a box stops before its face;
   - 2,000 random directions in the full world: never deeper, no new overlap;
   - endpoint-guard rejection under a forced numeric case.
6. **Stalls are escapable:** a formerly trapped diver/Dart pressed into the rib stays clear, then reverse, strafe, dive or turn moves it ≥ 0.3 m. No diver ends above −0.5, and no Dart above −0.9, after release.
7. **Revise one existing assertion with evidence:** `rib-collision.test.ts:183-186`, overlap + `{2,3,4}`.
   - The 2 mm-overlap case now moves, because Δ is outward (non-closing). Assert "not deeper" instead of "unchanged".
   - Keep the `first.a` zero-normal case asserting exact non-movement.
   - Add a closing case.
8. **Unchanged suites** must pass untouched: the full 400 apart from (7), typecheck/build, both economy scripts, hull clearance, carrier seals/berths/travel, recovery/tow, codec.

**Not needed:** UI layout matrices, P1–P8 composed routes, notice/presentation matrices. OS2-01 changes no presentation.

**Live acceptance** (isolated Linux, owned tab, normal input; diagnostics labelled separately):

- Fresh New → reef ribs → surface beside the arch at low air → keep pressing forward/up into the rib, then turn away. No freeze. Export → reload → still free.
- Import the byte-identical actual export → move within 2 s → save → reload → move.
- From earned `first-return-before-service.json`: drive the Dart up into a rib at the surface, then reverse out.
- Record source/bundle hashes, inputs and renderer ownership. Grants or teleports are not allowed as acceptance.

**Ownership:** one Sol6.1/max author.

- Owns `src/sim/step.ts`, `src/sim/world.ts`, `src/sim/ribCollision.ts`, the new test file and fixture, the one revised assertion, and an evidence report.
- No `types.ts`, codec, UI or registry edits.
- No collision-architecture rewrite.
- Then fresh Astra xhigh / Sol max on the affected batch, and a fresh Opus spot verification (the live steps above).

## 5. OS2-02 / 03 / 07 bounded refinements

**Ordering.** These belong to a separate small Sol task after OS2-01 merges, because both touch `step.ts`. Owned paths: `src/ui/hud.ts`, `src/ui/notices.ts`, `src/ui/view.ts`, `src/ui/panels.ts`, `src/runtime/session.ts`, `src/sim/progression.ts` (copy only), one line in `src/sim/step.ts`, and focused tests.

### OS2-02: zero-valued hull chip (`hud.ts:216-226`)

- Keep accumulation, flash (`impactUntil`) and the urgent class.
- Compute `const shown = Math.round(this.impactLoss * 10) / 10`.
- If `shown < 0.1`, keep the card flash but leave the chip hidden and its text unchanged. Otherwise show `Hull −${shown.toFixed(1)}%`.
- Never round up.
- Tests: accumulated 0.01 / 0.04 → flash, no chip. 0.05 → "Hull −0.1%". 0.26 → "−0.3%".

### OS2-03: duplicated exit refusal

Typed by command, with no prose comparison:

- `step.ts:333`: when `c.type === "exit"`, push `{ type: "notice", channel: "action", message: no, error: true, summary: "Exit blocked" }`.
- Pilot guidance (`hud.ts:133`) already prints the full `exitRefusal(state)` reason from the same state, so exactly one full actionable sentence stays on screen.
- `notices.ts:37`: store `{ message: summary ?? message, full: message, … }`.
- `hud.ts:323-327`: announce `result.full` when `result.error`, so screen readers get the full reason once. No current refusal carries a summary, so no other announcement changes.
- Hazards, banners and persistence errors are untouched.
- Test: blocked exit at 960/1280 shows the reason once (guidance) plus "Exit blocked" (result); the seven-warning staged state is otherwise unchanged.

### OS2-07: exact copy

| Where | Now | Proposed |
| --- | --- | --- |
| `view.ts:88` scene caption, title **and** pause | "01 / HEARTH REEF · Follow the light. Learn the shore. · A QUIET PLACE TO BEGIN" | Set `hidden` in both states. Keep the markup, so `hud.css:181` layout is unaffected while hidden. |
| `view.ts:68` tagline | "A refuge. A reef. A first horizon." | Keep. It is the one title tagline, already hidden in pause (`view.ts:337`). |
| `view.ts:86` build note, title | "FIRST LINKED EXPEDITION · Restore the pod and workshop, investigate their habitats, build a Dart and explore the upper Canopy. The remaining campaign is under construction." | "FIRST EXPEDITION · Pod, workshop, Dart and the upper Canopy. More of the campaign is in development." |
| Build note, pause | (same) | Hidden (`view.ts:337`, with the subtitle) |
| `session.ts:324` manual save | "Saved locally. The previous valid save is retained as a backup." | "Saved locally". Backup facts stay in Save safety; errors are unchanged. |
| `panels.ts:460` habitats | "N exposed · N finite reserve · N per hand bundle. When empty, tend here for 20 active seconds for two more portions." / "Sort the host’s finite reserve locally if exposed stock is empty." | "N ready · N in reserve · N per gather. When empty, tend here for 20 seconds to prepare two more." / "When none are ready, sort the reserve here." |
| `panels.ts:408` | "Ingredients: usable here / cost" | "Have here / needed" |
| `panels.ts:444` | "Completed · N one-time references" | "Completed · N" |
| `step.ts:56` exit receipt | "Clear exit · personal suit protection" | "Left the craft · on suit air" (full message at `vehicles.ts:131` unchanged) |
| `progression.ts:293` | "…Approach the cockpit side and board deliberately." | "…Board it from the cockpit side." |

- **Keep:** Current question, regional leads, captions, LOW OXYGEN, recovery/save errors, Dive preparation details, and "Personal field notes add context…".
- **Leave for M2 or a debug-menu decision:** the "finite reserve" refusal strings in `progression.ts:163` and `step.ts:183/286`. They are only reached on an actual empty host.
- **Composition checks** at 960×600 and 1280×800:
  - title shows exactly one visible tagline and no scene caption;
  - pause hides tagline, caption and build note;
  - the notebook habitat card, Fabricate header, blocked-exit cockpit and grazing contact all render without overlap;
  - the measured fonts keep the existing 12 px / 11 px floors.
- No new UI state model.

## 6. M2 benchmark obligations (before habitat/content multiplication)

1. **Visible cover and landmarks.** From the earned `canopy-pre-warning` approach, any cover named in a warning (for example "the tall rib", "upper crowns") must be on screen or within fog range when the line appears. Measure screen-space size and luminance contrast at the warn/pursue distances on SwiftShader and on representative hardware. If it isn't visible, the text must not name it.
2. **Depth value.** Run a value-gradient study from 0 to 60 m; the Canopy must read darker and denser than the shallows. **Cockpit balance:** the console's mean luminance and frame coverage should not exceed the water view's. Prototype within richer cel.
3. **Truthful threat cues.** Call-origin presentation stays bound to the emitted call and its finite lifetime. Any world-space effect respects occlusion and fog; there is no global creature reveal.
4. **Near-floor readability (OS2-04).**
   - First determine whether the wash is near-plane clipping into terrain or an untextured close surface.
   - The camera eye drives targeting rays, LOS and reach, so a camera offset is not physics-neutral. Prefer close-range terrain detail or fog-tinted floor contact.
   - If an offset is unavoidable, change rendering, targeting and reach together and re-run the aim tests.
5. **Region boundary.** Make `WORLD_BOUNDS` legible (terrain or fog edge) and surface the existing `foundation-boundary` event, instead of a silent stop (observed at "Home pod · 202 m").
6. **Unproved hypotheses — keep testing, don't fix:**
   - OS2-05 mouse-resume spike: test with a physical mouse.
   - OS2-08 bench wayfinding: fresh-player walk.
   - Blocked-thrust eligibility: log `thrust-sample` during cradle/rib stalls in M2 human tests before changing any gate.

## Open objections and uncertainties

- Tier-2/3 acceptance relies on static `clearance` plus the ≤ 0.12 m vertical-thickness margin. The geometry test must lock that in, or Sol must justify the swept alternative.
- Zero-normal overlaps stay fail-closed. I know of no producer, but runtime cannot recover them; decode repair is the only remedy, and I recommend deferring it.
- Formerly trapping inputs now stall while pressed into the rib (truthful contact, always escapable in tests). Human feel is untested.
- My grid samples only around ribs. Box/terrain behaviour is covered by the existing suite, not new sampling.
- Prototype code is evidence for the design, not a patch to merge. Sol should implement from this specification, with the tests written red first.
