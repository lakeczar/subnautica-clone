# OPUS-STAGE1-R3 implementation advice: predator damage feedback and residual copy for M2-A

2026-10-18. This is an advisory consultation from the completed R3 review context. It is not an independent review round and validates nothing. Root reconciles it, Sol6.1/max implements, and the complete M2-A batch receives the paired gate.

## Binding and scope

- **Model.** Live `t3_thread_configuration` reports claudeAgent / claude-opus-5-5 / selected effort high. I have no independent effective-effort readout.
- **Checkout.** The bound checkout is the unchanged report commit `d7597d976d9a6c95cbfa7610c32220a3001a67e4` (source = accepted dc09028).
- **Root docs.** I read them by absolute path. The dispatch named record parent 87a7860; the root checkout read `0341a0d…` at the time of reading.
- **Receipts.** `/tmp/siltwake-opus-stage1-r3-consult/receipts.txt` holds the source file hashes. The original R3 archive is untouched.
- **No new play, prototype or browser.** All advice is from code, my retained R3 evidence and root's `damage-probe`. Nothing here reconstructs the lost recording.

**Correction to my R3 report (OS3-02, meal).** `eat()` already refuses at `food >= 99` with "Already fed. Meal retained." (`sim/vehicles.ts`). The HUD rounds food with `toFixed(0)`, so I saw "99" while the real value was below 99. The meal was accepted correctly. I withdraw the meal-consumption remark; only the receipt wording remains, and root's no-threshold decision stands.

## 1. Damage signal contract (A1)

### Why this cannot be UI-only

`updateThreat` (`sim/survival.ts`, pursue branch) mutates `v.health` or `player.vitals.health` with no visual event. Its only signal is `sound damage` when `s.tick % 60 === 0`. That is aligned to the global tick, not to the bite, so a sub-second bite can emit nothing at all (root's tick 10973 row).

The HUD cannot infer a bite from health deltas without false attribution. Collision (`step.ts` `impact`), hull pressure (`updateSurvival`), oxygen, starvation and diver pressure all lower health in the same or adjacent steps. So one typed producer event is required.

### Event (add to the `GameEvent` union in `sim/types.ts`)

```ts
/** Actual health removed by a creature attack this step. Raw, unrounded, transient; never saved. */
| { type: "threat-damage"; source: "hunter";
    target: { kind: "vehicle"; vehicleId: string } | { kind: "diver" };
    loss: number;         // health actually removed this step (> 0, after clamping)
    healthAfter: number } // clamped to >= 0
```

**Deliberately excluded:**

- **No `origin` or creature position.** This avoids live position exposure; the existing spatial `sound` event keeps its current pan behaviour.
- **No speed.** That keeps it disjoint from collision.
- **No severity.** Severity is derived in UI from current state.
- **`source` is a closed union** so M3 creatures extend it without re-plumbing. Root may drop it if one hunter is final for M2.

### Producer (only the existing damage branch in `updateThreat`)

```ts
if (t.mode === "pursue" && d < 5.3 && !cover) {
  const v = s.fleet.vehicles.find(v => v.id === s.player.controlledVehicleId);
  if (v) {
    const before = v.health;
    v.health = Math.max(0, v.health - 12 * DT);                 // unchanged rule
    const loss = before - v.health;
    if (loss > 0) events.push({ type: "threat-damage", source: "hunter",
      target: { kind: "vehicle", vehicleId: v.id }, loss, healthAfter: v.health });
  } else {
    const before = s.player.vitals.health;
    s.player.vitals.health -= 10 * DT;                           // unchanged rule (unclamped, as today)
    const loss = Math.max(0, before - Math.max(0, s.player.vitals.health));
    if (loss > 0) events.push({ type: "threat-damage", source: "hunter",
      target: { kind: "diver" }, loss, healthAfter: Math.max(0, s.player.vitals.health) });
  }
  if (s.tick % 60 === 0) events.push({ type: "sound", cue: "damage", origin: { ...t.position } }); // unchanged
}
```

**Applied loss and clamping.**

- Vehicle: loss is the clamped difference. A disabled hull at 0 emits nothing because nothing was applied.
- Diver: the state mutation stays exactly as today (unclamped; incapacity handles ≤0). The event reports only the health that existed above zero, so the HUD never shows more loss than was there.
- Losses are raw: 0.2 per step for the hull, 0.1666… for the diver. Rounding happens only in display.

**Identity snapshot.** The target is captured before `updateSurvival` runs. That function may then, in the same step:

- disable the vehicle (`v.health <= 0`), or
- incapacitate the diver (relocate to refuge, `mode = "walking"`, `failures++`, threat set to `disengage`).

The event keeps the actor that was actually bitten. Stable `vehicleId` is enough; no hull or label snapshot is needed because display reads the current vehicle by id.

**Batch order.** `stepGame` calls `updateThreat` before `updateSurvival`, so within one step's `events` the `threat-damage` entry precedes any "Hull disabled…" notice or recovery notice/sound. The consumer relies on this order. Tests must assert it.

**Separation from collision and audio.**

- `impact`, `metrics`, `minPower` and collision sound routing (`app.ts`: `impact → view.impact + sound impact`) are untouched.
- The sim's periodic spatial `damage` sound is untouched.
- No metric counts bites, so no save, schema or economy change follows. `threat-damage` is transient like `thrust-sample`.

**Simultaneous sources.** Only this branch emits the event, so no false attribution is possible:

- Collision, pressure, oxygen and starvation never produce `threat-damage`.
- The HUD shows a bite only from events, never from health deltas.
- If a collision and a bite land in the same step, each gets its own accumulator (section 2).
- No universal damage refactor is proposed.

**Optional A1 producer copy (root's choice; not required for OS3-01).** In `updateSurvival`'s incapacity reason, `events.some(e => e.type === "threat-damage" && e.target.kind === "diver")` could select "Hunter injury." instead of the generic "Exposure or injury." It is a transient same-step check with no saved field. Skip it if root wants zero producer-copy change in A1.

## 2. Perception without spam (A3)

### State (extend `EncounterPresentation` in `ui/notices.ts`; pure, active-time, unsaved)

```ts
export const DAMAGE_SECONDS = { aftermath: 3.0, pulse: 1.0 } as const;
export type DamageTarget = { kind: "vehicle"; vehicleId: string } | { kind: "diver" };
export interface DamageFeedback {
  target: DamageTarget;
  total: number;       // raw sum of event.loss in this episode
  sinceLast: number;   // active seconds since the last bite step
  sincePulse: number;  // active seconds since the last flash/onset pulse
  announce: boolean;   // one onset announcement pending
  pulse: boolean;      // flash pending
}
damage: DamageFeedback | null = null;
recordDamage(target: DamageTarget, loss: number): void;
clearDamage(): void;
```

**`recordDamage` rules.**

- Ignore input unless `loss` is finite and positive.
- **Same episode** (same target and `damage` still alive): `total += loss`, `sinceLast = 0`. If `sincePulse >= 1.0`, set `pulse = true` and `sincePulse = 0`.
- **New episode** (otherwise): `{ total: loss, sinceLast: 0, sincePulse: 0, announce: true, pulse: true }`.

**Timing in `step()` and `observe()`.**

- `step()` advances `sinceLast` and `sincePulse` by `FIXED_SECONDS` and drops the episode when `sinceLast > 3.0`.
- Active time means pause freezes nothing stale, because pause clears the episode (section 3).
- `observe()` clears `damage` on any of:
  - actor change;
  - refuge entry;
  - `opening.phase < 4`;
  - a target that no longer matches the current actor (vehicle id ≠ `controlledVehicleId`, or diver while piloting).
- `reset()` clears it.

### Display (extend `HudView`)

**Entry point.** New `threatDamage(e, state): boolean`. It validates the target against the passed final step state and drops it if mismatched (for example, same-step incapacity). It then calls `presentation.recordDamage`, renders, and returns `true` only on a **new episode onset**; the app uses that return for audio.

**Chip.** Reuse the existing `#impact-notice` element and CSS, with one composer `renderDamageChip()`. `impact()` now sets its accumulator and calls the composer instead of writing text itself.

- Bite part, vehicle: `Bitten · hull −${(Math.round(total * 10) / 10).toFixed(1)}%`
- Bite part, diver: `Bitten · health −${(Math.round(total * 10) / 10).toFixed(1)}`
- Collision part, while the existing 1.8 s collision window is open:
  - with a bite part, collision alone renders as `impact −0.6%`, giving the composite `Bitten · hull −3.0% · impact −0.6%`;
  - without a bite part, it renders exactly as today: `Hull −0.6%`, with the −0.0 suppression unchanged. Existing `presentation.test.ts` impact assertions must stay green unedited.
- The `urgent` class applies when the bitten vehicle's health or the diver's health is ≤ 25 (the existing threshold).
- The chip stays visible for the 3.0 s aftermath, then hides when neither part remains.

**Flash.**

- Vehicle: reuse `impactVehicle` / `impactUntil` (+600 ms) on each `pulse`. The Dart card gets the existing `.hull-impact` outline at onset and then at most once per active second while bites continue. That gives a visible ~1 Hz beat for sustained bites and one flash for a single-step bite.
- Diver: add the same class to the HEALTH card through a parallel `vitalFlashUntil` field. CSS is reused, so there is no new style.

**Accessible delivery.** Add one hidden span:

```html
<span id="damage-announce" class="hud-sr" role="alert" aria-live="assertive" aria-atomic="true"></span>
```

- Write it **only on `announce`**, with the onset chip text, for example "Bitten · hull −0.2%". Then clear `announce`.
- Clear the span when the episode ends, so a later identical onset is spoken again.
- Use the existing version-guarded `setTimeout(0)` pattern (`cancelAnnouncement` style) so a pause or reset in the same turn cancels the write.
- While a bite part is shown, set `aria-hidden="true"` on `#impact-notice` so its polite region does not re-announce every step's total. Remove it when only a collision part remains, which keeps today's collision announcement semantics.
- Result: one assertive announcement per bite episode, with no 60 Hz speech.
- **Alternative.** Polite instead of assertive, if root prefers never interrupting. I recommend assertive because it is an injury requiring action, and it fires at most once per ≥3 s gap.

**Audio (`app.ts` wiring only; `sound.ts` unchanged).**

- On `threatDamage(...) === true`, play `{ type: "sound", cue: "damage" }` (centred, no origin), but only if the same step's batch has no `sound` with `cue: "damage"`.
- The sim's existing ~1 Hz spatial cue carries sustained bites.
- Worst case is the onset plus one spatial cue in the first second, with no per-step sound.
- The `sound.ts` debounce keys (`damage/centred` vs `damage/spatial`) already permit that and nothing more.

**Captions and mute.**

- The "Opening captions" setting governs only the pod intro. Hazards and results are always readable, and this keeps that rule: chip, flash and announcement do not depend on captions or audio.
- No separate caption string is needed. The chip is the visual equivalent of the damage sound.

### Aftermath copy and truthfulness

While `damage` exists (≤ 3.0 active s after the last bite), `update()` blanks `context-hint` exactly as `threatened` does today. The calm "Read the upper crowns…" line therefore cannot appear until 3 s after the final bite.

No new advice paragraph is needed:

- During pursuit, the existing banner already says "break sight behind the tall rib / retreat".
- After disengage, the existing "Calls fading" release notice states the AI's true state.
- The chip states the factual outcome.

Nothing extends pursuit, fakes a banner, or changes AI, damage, physics or invulnerability. Severity escalation reuses existing state: LOW HULL, LOW HEALTH and HULL DISABLED banners and alerts appear as today.

**Alternative (not recommended now).** A one-word aftermath state in the hazard area, such as "BITTEN · move / break sight", is more instructive. However, it duplicates the banner and needs a new hazard context.

## 3. Lifecycle and composition

| Trigger | Existing path | Damage behaviour |
| --- | --- | --- |
| Pause, menu, panel open (`openPanel → pause`) | `app.pause → view.cancelFeedback → HudView.cancelFeedback` | Extend `cancelFeedback`: `presentation.clearDamage()`, hide chip, remove `aria-hidden`, clear flash fields, cancel/clear `#damage-announce`. No replay on resume; a renewed bite is a new onset. |
| New / import / Continue / graphics reconstruction | `session entered → app.entered → view.resetPresentation` (calls `cancelFeedback` + `presentation.reset`) | `reset()` nulls `damage`. Sol must confirm reconstruction re-enters via `entered()`; if not, call `resetPresentation` there. |
| Actor change (board, exit, incapacity relocation) | `presentation.observe` actor key | Clear. Same-step incapacity is also dropped at `threatDamage` validation; the recovery alert speaks instead. |
| Vehicle disabled by the bite (no actor change) | `updateSurvival` notice after the event | Chip remains with the truthful total; the existing "Hull disabled…" alert and banner coexist. |
| Refuge entry or recovery tow | `observe` refuge flag | Clear. |
| `dispose` | `app.dispose → cancelFeedback`, `disposed` flag | Guarded announcement timer; no other timers (active-time state). |

**Several fixed steps in one rendered frame.** `app.frame` already calls `this.events(result.events)` and `view.presentationStep(state)` once per fixed step. Each step's bite accumulates into the same episode, and the onset announcement is written once. DOM chip text is written only when the rounded text changes. Final actor change in a later step of the same frame clears the episode at that step's `observe`.

**Preserved contexts.** Damage state never touches:

- `result`
- `exitGuidance`
- `pendingExitAnnouncements`
- `central` notices (persistence and save errors, "Hull disabled", "Calls fading")
- hazard banners or the call cue

There is no queue, no backlog and no saved field.

**Minimal interface changes.**

- `EncounterPresentation`: `+damage`, `+recordDamage`, `+clearDamage`; extend `step`, `observe`, `reset`.
- `HudView`: `+threatDamage`; extend `impact` (via the composer), `cancelFeedback`, `update` (context-hint and HEALTH flash).
- `GameView`: `+threatDamage` delegate and the one new SR span.
- `app.events`: one `threat-damage` branch.

## 4. Bounded copy (OS3-02)

| Literal | Owner / path | Current | Replacement |
| --- | --- | --- | --- |
| Service receipt | A1 · `sim/vehicles.ts service()` | "Service complete: hull battery, health, emergency air and cells in your hold or this craft restored. Cargo and fitted modules retained." | **"Serviced: hull, power, emergency air and your cells full. Cargo and modules kept."** ("your cells" = diver hold + this craft, as in the code; lockers are unaffected, as today) |
| Meal receipt | A1 · `sim/vehicles.ts eat()` | "Meal eaten. Prepared portions do not spoil; ordinary movement remains available when hungry." | **`` `Meal eaten · food ${Math.round(s.player.vitals.food)}` ``** (consumption and refusal unchanged) |
| Habitat context | A1 · `content/registry.ts` intake scraps source | "Tagged maintenance panels beside the intake; four alloy per hand bundle." | **"Tagged maintenance panels beside the intake."** (the stock line already says "4 per gather") |
| Title note | A3 · `ui/view.ts` `#build-note` | `FIRST EXPEDITION · <span>…` | **`FIRST EXPEDITION<span>…`** (the span renders on its own line) |

**Test impact.** `tests/experience-signals.test.ts:289` asserts the old service literal. A1 owns no existing tests, so root must either explicitly grant A1 that single expectation line, or move the service literal to the composition pass. No test asserts the meal, registry or title literals. The trap fixture's saved `feedback` string must stay byte-identical; it is data, not a producer.

**Hints.** No safe literal change is needed. `hint()` already progresses by `hintLevel` and evidence. Making it observation-aware is **optional later M2/M3 lead work**: for example, if `!C02` and the player is inside the reef-rib region, return the existing C02 intake line. It must not replace undiscovered leads globally.

No subtitle is proposed to explain site Fit versus local Service.

## 5. Ownership and dependencies

| Leaf | Exclusive paths for this advice | Must freeze before consumers |
| --- | --- | --- |
| **M2-A1** | `sim/types.ts` (event union), `sim/survival.ts` (producer; optional incapacity reason), `sim/vehicles.ts` (two receipts), `content/registry.ts` (one context); new test file (suggest root adds `tests/m2-threat-damage.test.ts` to A1's list, or uses `m2-route.test.ts`); only with explicit grant, the single `experience-signals` expectation | The `threat-damage` type and emission order, committed and inspected by root before A3 starts |
| **M2-A2** | None for OS3-01. OS2-06 visible cover / threat anatomy and OS2-04 floor readability stay in A2's region/visual work under root-frozen geometry and view contracts | — |
| **M2-A3** | `ui/notices.ts`, `ui/hud.ts`, `ui/view.ts` (span, title), `runtime/app.ts` (one `events` branch + onset sound), `ui/hud.css` only if reuse proves insufficient; `tests/m2-route-presentation.test.ts` | Consumes committed A1 only |
| **Composition pass** | Affected legacy assertions (if root routes them here), ordinary earned bite continuation evidence | — |

There are no simultaneous edits to peer paths. `sound.ts` needs no change. No input, physics, save, schema or camera change is proposed.

## 6. Acceptance evidence

### A1 rule tests (labelled seeded states are appropriate here)

Seed `world.threat` as `pursue` with `d < 5.3` and no cover.

1. A piloting Dart at 100 emits exactly one event per step: `{ target: vehicle id, loss ≈ 0.2, healthAfter ≈ 99.8 }`. Resulting health is bit-identical to the pre-change formula.
2. A Dart at 0.1 → `loss 0.1`, `healthAfter 0`. The same step disables it, and the event index is less than the "Hull disabled" notice index.
3. A Dart at 0 → no event.
4. A swimming diver at 100 → `loss 10/60`. A diver at 0.1 → `loss 0.1`, followed by the incapacity notice in that order.
5. Each of these produces **no** `threat-damage`:
   - cover;
   - `d ≥ 5.3`;
   - `warn`, `investigate`, `disengage` or `idle`;
   - collision `impact`;
   - hull-depth pressure;
   - diver pressure, oxygen exhaustion and starvation damage.
6. The `sound damage` cadence is unchanged (`tick % 60`).
7. Encode/decode, metrics and economy outputs are unchanged. No event is serialized.

### A3 presentation tests (pure `EncounterPresentation` + existing DOM view fixture; seeded, labelled)

1. A single-step bite shows the chip "Bitten · hull −0.2%", the Dart card `.hull-impact` and exactly one `#damage-announce` write. `true` is returned once.
2. 40 consecutive steps give total "−8.0%", one announcement, flash pulses at about 0 / 1.0 / 2.0 s, and no announcement or onset sound after the first.
3. After the last bite, the chip stays 3.0 active s and then hides. `context-hint` is blank throughout and returns afterwards.
4. Pause or panel mid-episode hides the chip and cancels the pending announcement, with no replay on resume. A renewed bite produces a new onset.
5. Exiting the craft clears the episode. A diver bite then shows "Bitten · health −0.2" and the HEALTH card flash.
6. Four steps' events followed by one render give a summed total and one announcement.
7. Same-step diver incapacity shows no bite chip or announcement; the recovery alert is present.
8. Collision during a bite shows "Bitten · hull −3.0% · impact −0.6%". Collision-only and −0.0 suppression match the existing `presentation.test.ts` unchanged.
9. An exit refusal result and pilot guidance are unchanged while a bite chip is shown. Persistence errors remain.
10. Composition at 960×600 and 1280×800 is measured: chip, pursuit banner, call cue, pilot guidance, action result and pulse summary must not overlap. Reuse the R2 layout-measure approach.

### Actual gameplay (the composition pass must observe; not seeded)

**Hull bite (required).** Import byte-identical `canopy-pre-warning.json` (3df46ef5…) through the menu. Ordinary forward travel about 12 s, release, wait. Capture:

- chip onset at the first hull drop;
- total matching the hull telemetry within display rounding;
- ~1 Hz flash;
- the calm hint suppressed until 3 s after the last bite;
- "Calls fading";
- Export afterwards, then reload/Continue without any chip replay.

Keep the run short to stay under the 50 MiB recording limit, and keep a MutationObserver trace of `#damage-announce`. Disclose SwiftShader, muted audio and synthetic input.

**Diver bite (honest attempt).** From the same save, exit the Dart in the hunter's territory and swim noisily (Shift) until pursued. If a bite is not reached in bounded time, say so and rely on DOM test 5; do not seed and call it gameplay.

**Collision discrimination (ordinary).** A shallow rib contact shows "Hull −x%" with no "Bitten".

**Disable, incapacity and session cancellation.** Disable and incapacity are seeded diagnostics only, labelled. Pause / menu / Continue cancellation is checked in the browser during an active chip.

No screen-reader speech is claimed without an actual assistive-technology test.

### OS3-03 instrumentation (bounded, no product UI)

1. In ordinary play, Export just before each reported stall:
   - (15.6, −4.6, −17.3), yaw 4.958, Dart at the cradle-zone slope;
   - (−13.4, −4.1, −17.98), yaw 3.308, rib.
   R3's stall poses are reviewer telemetry, not saves, so a fresh earned approach is needed. Seeding the Dart pose into `first-return-before-service.json` is acceptable only as a **labelled** diagnostic.
2. Offline, compile the real modules and replay with constant forward input for 2 s through `stepGame`. Wrap `world.moveCapsule` and support queries, copying results before caller mutation as in the root probes.
3. Log per step:
   - whether `thrust-sample` is present, and why it is absent (`forwardIntent`, the forward-projection sign, actor stability, charge);
   - `requested`, `actual`, `solidLimited`;
   - support / terrain / surface limitation;
   - which `observeThrust` clause resets the timer.
4. Decide only from those logs. If support or terrain limitation is the unrecorded cause, root assigns one owner to add a transient `supportLimited` field (A1) and the consumer rule (A3). Otherwise retire or keep the cue as is. No threshold change, permanent debug panel or URL flag.

## Open uncertainties

- Whether assertive interrupts other urgent speech, such as "Hull disabled" in the same step, in real screen readers. This is untested; polite is the fallback.
- Whether a 3.0 s aftermath feels right at human pace. My evidence ran at about 0.75× real time.
- Whether a diver bite is reachable in bounded ordinary play from the current save.
- Whether `.hull-impact` reused on the HEALTH card reads well at 960. That is a visual check for A3.
- OS3-03's cause is unknown until the replay logs exist.
