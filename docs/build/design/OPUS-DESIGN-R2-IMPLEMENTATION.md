# OPUS-DESIGN-R2 implementation consultation

Owner-requested follow-up in the same Opus thread, 2026-10-17. This is an implementation design for the accepted OD2 findings and the coordinator's disposition. It is not a new review round, does not accept anything, and contains no production code. Spoiler-free; no canon was read.

- **Model / effort:** Claude Opus 5.5 (`claude-opus-5-5`). `high` was selected; root confirmed the selection through T3 thread configuration. The runtime's effective reasoning effort is an unlabelled number in my context, so it is **not separately verified** here.
- **Baseline:** this worktree is at my report commit `5991273776587f2565bc104be4851acba7bbdb51`, clean. Root checkpoint `ef8d7614a47488c7d77b7bf9907c0b5b6c1b47ef` differs from it only under `docs/`, so production is still `a5821aa` (accepted at `1caa05f`). I read the disposition with `git show ef8d761:docs/build/reviews/OPUS-DESIGN-R2-DISPOSITION.md`.
- **New evidence for this consultation.** I compiled the simulation to `/tmp` and ran the code against my recorded positions, writing nothing to the worktree and opening no browser. Scripts are in `/tmp/siltwake-opus-design-r2-implementation/scripts/`. Numbers below marked *measured* come from them.

## 0. Corrections to my report, and what the new measurements settle

1. **The first prompt (OD2-01).** `completeOpening()` already records C01 when the player stands up (`progression.ts:141-153`). So the first "Scored regulator · Inspect & record" prompt pointed at a record already in the notebook, about 1.4 m to the player's left, not behind them. The E press was a silent re-inspection. This sharpens the known-evidence case root asked about.
2. **The C02 host (OD2-09).** The C02 point (−17, −7, −8) sits on the drawn ochre filter box at (−17, −7.7, −8) beside the intake pipes (`expedition.ts:444-458`). The clue is already bound to a visible host. My miss was vertical reach plus low contrast, so root's ordering (cue and contrast before any change to location or range) is correct.
3. **Final-play C (OD2-06).** The disable was a **terrain collision** (`M1-FINAL-PLAY.md:98`: a boost-dive held for 6 s and 3 s took hull from 99.9 to 41 to 0). I withdraw the implication of an invisible predator attack. The clip instead shows that ~100% hull loss from terrain produced only HUD text changes, which is direct support for OD2-02's impact feedback.
4. **The two blocked ascents (OD2-07) — *measured*.** Root asked whether they were expected obstructions or collision traps. They are **proxy traps**. Each rib segment collides as its axis-aligned bounding box (`world.ts:217-230`).
   - Stall B (camera −13.30, −1.01, −5.84): upward motion is blocked by `reef.rib.6` while the capsule is still **0.56 m** from the visible rib cylinder.
   - Stall A: every blocked sample within ±5 cm was blocked by `reef.rib.16` with ≥ **0.33 m** of visible clearance.
   - A reef-wide sweep (x −34…−4, z −20…0, y −10…0, 0.5 m grid) found that **210 of 254** blocked upward steps (83%) had more than 0.25 m of visible clearance.

   So the fix is collision fidelity on one landmark, not buoyancy or an automatic push.
5. **The launch lane (OD2-02) — *measured*.** From `DART_BUILD_POSE` with the real `HULL_COLLIDERS.dart` proxy:
   - yaw 0 (the current build heading) first touches terrain after **4.4 m** (I saw about 4.5 m live);
   - yaw π (south) has no contact within 40 m, and a 25 m `sweptHullClearance` lane passes;
   - east and west touch the cradle rails after 0.6 m.

   The proxy is a yaw-independent ±3.6 m square, so turning inside the cradle never collides.
6. **The new-build checkpoint.** `island-glass-east-bundles.json` (SHA-256 `6f680245…868f`, tick 5944, fresh-main earned route) has no Dart yet and holds enough materials. Its only refusal is location. A diagnostic copy placed at the workshop bench returns READY. That makes it the ordinary-control checkpoint for validating a **new** fabrication heading, which the old yaw-0 save cannot do.

## 1. Response to the coordinator disposition

| Finding | Root's decision | My position |
| --- | --- | --- |
| OD2-01 | One authoritative target with view, reach and occlusion; no nearest fallback behind the camera; known clues stay inspectable when aimed at | **Agree in full.** I drop my earlier global demotion of known evidence. Known evidence loses only a near-tie (§3). Reach stays the existing 4 m body-distance authority, so selection never offers what the action would refuse. |
| OD2-02 | New-build heading, accurate copy, damaging-impact feedback; no rotation of legacy hulls; no global pitch reset; deliberate exit input rather than a speed lock; keep clearance and depth rules | **Agree.** Yaw π applies only to new fabrications and is proven by the measured lane. Pitch: a readable pitch/surface cue ships first, and pitch normalization waits for human evidence. Exit: a hold-to-exit gate that is bypassed for a failing craft, with simulation exit legality unchanged. |
| OD2-03 | Hierarchy, readable identities, named refusals, carried vs usable; respect intentional destination choice; cradle crafting is a gameplay decision | **Agree.** Root is right about the destination: `materialStorageControls` remembers a destination that was valid but never chosen (my first Hold visit was inside the Dart, where Dart hold was the only option). Fix: remember only explicit choices. Cradle fabrication goes to a separate rule decision, not this UI task. |
| OD2-04 | Captured look after a deliberate gesture, drag alternative, remembered preference; no capture on load or focus; Escape releases and pauses; denial leaves drag usable | **Agree.** The design follows browser activation rules: Escape is not an activation key, and Chromium has a re-lock cooldown after an Escape exit (§4). |
| OD2-05 | State-aware notices; save, export and graphics errors are never suppressed; calm text describes state rather than promising safety | **Agree.** The release cue reads "Calls fading", which describes state without promising safety. |
| OD2-06 | Narrow the claim; C was terrain; no teleporting the hunter or showing it through geometry | **Agree; claim withdrawn as stated in §0.3.** At my logged warning point the hunter's home was about 68 m away and roughly 24° off-axis, low in frame. Canopy fog there gives 0.46–0.66 haze, and the bright console covers the lower view (geometric estimate, not measured visibility). Plausible causes: distance, haze and console occlusion. Slice 2 gets render-only legibility; any change to warning behaviour waits for a measured approach comparison. |
| OD2-07 | Breathing state and remaining air; no automatic surfacing or pushes; first classify the rib cases; test any geometry change with sweeps | **Agree, and now classified (§0.4).** Collision fidelity on the rib, a cue when ascent is blocked, and a seconds-of-air readout. No buoyancy change. |
| OD2-08 | Pilot guidance and pitch readability now; interpolation and inertia deferred; measure first | **Agree.** Interpolation and per-frame look move to the evidence-dependent stage. |
| OD2-09 | Bind the cue to the visible host and raise its contrast before changing location or range; learning is a human question | **Agree** (§0.2). |
| OD2-10 | Labels, grammar, contextual hints, contrast with R1-01; keep a deliberate keyboard skip; keep costs discoverable | **Agree.** Hold-Space to skip on the canvas; the focused button keeps instant Space/Enter. |

I also accept root's evidence caveats: the 13 grouped steps exclude re-boarding, and raw per-frame telemetry was not retained. Acceptance therefore uses explicit recount rules (§9), not my old count.

## 2. Copy rules (owner preference, applied throughout)

1. **A label names a thing or an action.** No subtitle, eyebrow or explanatory sublabel on routine controls.
2. **State and cost are compact values**: "Cell 1 · 75%", "−25", "Suit 150 m", "2 / 3".
3. **Help is progressive and contextual.** A hint appears when its action is available or was just refused, then disappears. A permanent manual paragraph never stands in for good affordances.
4. **Refusals say where or what**: "Bench at Splitspine workshop · 21 m NW", not "the required refuge".
5. **Exempt from reduction:** dialogue and opening captions, hazard warnings, persistence and save warnings, graphics errors, accessibility names and descriptions (aria), and notebook observation and hypothesis prose (the notebook's voice stays).
6. **Do not swap removed text for decorative sublabels.** If the thing is clear without text, show nothing.

Each section below gives before → after copy.

## 3. Plan and dependency order

| Stage | Contents | Depends on |
| --- | --- | --- |
| **0. Interface freeze** (root, in CONTRACTS, before dispatch) | The signatures in §8.1 | — |
| **Slice 1: controls and action** | 1A simulation side: T1 targeting, T2 line of sight, T5 Dart build heading and board copy, T6 impact event, T7 known-evidence response. 1B presentation side: T3 prompt and cue, T4 mouse capture, T8 exit gate, T9 pilot hints and pitch/surface cue, T10 opening skip, labels and grammar | 0 |
| **Slice 2: preparation and encounter** | C0 mechanical `view.ts` split. 2C: T11 Hold, T12 Fabricate, T13 Notebook compaction, T14 storage destination. 2D: T15 notice centre, T16 threat release and arc, T17 air state, T18 rib collision fidelity and blocked-ascent cue, T19 contextual pulse chip and contrast | Slice 1 merged and accepted |
| **Later: evidence-dependent** | E1 render interpolation and per-frame look; E2 swim easing; E3 marine snow and speed cues; E4 hunter warning display and territory tuning; E5 cradle-site fabrication rule; E6 pitch normalization on boarding | Hardware, human or design evidence (§9) |

Slice 1 comes first because Slice 2's panels and notices reuse its targeting, prompt and event plumbing. It also proves the highest-value intent fixes before any menu work.

## 4. Slice 1 designs

### T1. Aimed interaction (OD2-01)

**Module.** New `src/sim/targeting.ts`, owned by 1A. It is pure: no DOM or Babylon.

```ts
export interface AimRay { origin: Vec3; dir: Vec3 }               // dir is unit length
export interface InteractionHost { center: Vec3; radius: number; solidIds: readonly string[] }
export type InteractionVerb =
  | "collect" | "gather" | "sort" | "inspect" | "review"
  | "read" | "board" | "recover" | "open" | "use";
export interface AimedTarget extends Interaction {
  host: InteractionHost; verb: InteractionVerb; known: boolean;
}
export function aimRay(s: GameState): AimRay | null;
export function interactionHost(s: GameState, t: Interaction): InteractionHost;
export function aimedInteraction(s: GameState, world: WorldQueries): AimedTarget | null;
```

**Aim origin, consistent with the renderer and outside survival authority.**

- `aimRay` uses `pose.position + (0, eyeHeight(s), 0)`. That is the same `eyeHeight` the renderer imports from `sim/state.ts`.
- Its direction is the renderer's own formula (`sin yaw·cos pitch, sin pitch, −cos yaw·cos pitch`).
- It returns null during the opening, while piloting and in an interior. While piloting, E means exit.
- The renderer eases eye height by 0.16 per frame during walk↔swim transitions. That lag lasts ~15 frames and up to 0.97 m. It is accepted: the simulation ray is authoritative, and the prompt and cue are drawn from the same simulation result, so they never disagree with the action.
- Nothing in survival, collection, crafting or exit authority changes. Those functions keep their own distance checks.

**Algorithm** (one function; the prompt, cue, E and Q all call it on the same state):

```text
aimedInteraction(s, world):
  ray = aimRay(s); if !ray return null
  best = null
  for t in interactions(s):
    if distance(s.player.pose.position, t.position) >= 4: continue   // unchanged action authority (collect/discover use 4)
    h = interactionHost(s, t)
    toC = h.center - ray.origin; along = dot(toC, ray.dir); inside = |toC| <= h.radius
    if !inside and along <= 0: continue                                // never behind or beside the eye
    miss = inside ? 0 : |toC - ray.dir*along|                          // perpendicular miss from the crosshair ray
    if miss > h.radius + AIM_SLACK: continue
    entry = inside ? ray.origin : ray.origin + ray.dir*max(0, along - sqrt(max(0, h.radius² - miss²)))
    if !inside and !world.lineOfSight(ray.origin, entry, h.solidIds): continue   // occlusion; ignore the host's own solids
    score = atan2(miss, max(along, 1e-3)) + DIST_W*along               // angle first, distance as tiebreak
    known = t.kind == "evidence" && s.knowledge.evidence has t.id
    if best is null
       or score < best.score - TIE
       or (|score - best.score| <= TIE and preferNew(t, known, best)):
      best = {t, h, score, known}
  return best ? {...best.t, host: best.h, known: best.known, verb: verbFor(s, best.t, best.known)} : null
```

`preferNew` only breaks near-ties: an uncollected source or new evidence beats known evidence. Looking deliberately at a known record selects it.

**Verbs** (state-derived):

| Target | Verb |
| --- | --- |
| Source with stock | `collect` (`gather` for meals) |
| Source exhausted, reserve > 0 | `sort` |
| New evidence | `inspect` |
| Known evidence | `review` |
| Optional record | `read` |
| Working vehicle | `board` |
| Disabled vehicle | `recover` |
| Cache | `open` |
| Service point | `use` |

**Hosts.**

- Add `INTERACTION_HOSTS` to `content/registry.ts` (additive; no saved data or provenance strings change). It maps a target id to an optional `{offset, radius, solidIds}`, with per-kind defaults:

  | Kind | Center | Radius (m) |
  | --- | --- | --- |
  | source | position + (0, 0.3, 0) | 1.1 |
  | evidence | position | 0.7 |
  | record | position | 0.6 |
  | vehicle | position (pose + 0.6 y) | 2.2 |
  | cache | position | 0.8 |
  | service | position | 1.4 |

- Service ids ignore their own furniture solids:
  - `pod_services`: `["pod.bench", "pod.locker"]`
  - `workshop_services`: `["workshop.bench", "workshop.locker"]`
- The renderer places the cue from the same table, so the cue is on the real host.

**Trial values** (unvalidated):

| Value | Setting | Rationale |
| --- | --- | --- |
| `AIM_SLACK` | 0.25 m | About one capsule radius of forgiveness for keyboard aiming |
| `DIST_W` | 0.02 rad per metre | A metre of distance matters less than ~1° of aim |
| `TIE` | 0.07 rad (~4°) | Wide enough to separate adjacent hosts |
| Host radii | table above | From mesh scale |

Acceptance (S1) checks agreement and usability, not these constants.

**Wiring.**

- `step.ts` `case "interact"` with no `target`: use `aimedInteraction(s, w)` instead of `nearestInteraction`.
- `nearestTarget(s, id)` becomes "aimed target equals id". This keeps the existing optional `target` field meaningful and compatible.
- `scan`: same change.
- `nearestInteraction`: its only call sites today are `step.ts:158/175/203` and `view.ts:467/686`. All five move to `aimedInteraction`, after which it has no users and is deleted. That stops any later caller from reintroducing a body-distance-only choice.
- The Fabricate panel's sort buttons go (T12); sorting becomes the E verb `sort` on an exhausted host.

**No target.** E or Q with no aimed target returns `"Nothing within reach."` (error: false). It is short and doesn't send the player hunting.

**Save and command compatibility.** No state or schema change. `interact` and `scan` keep their shapes. Feedback strings may change, except the exact `RECOVERY_NOTICES` and persistence strings.

**Tests** (new `tests/targeting.test.ts`). Add a `faceTarget(s, id)` helper that sets yaw and pitch from the eye to the host centre.

1. Facing a source collects it; facing away yields null and the interact refusal. There is no behind-camera fallback.
2. With two hosts within 4 m (intake scraps and the C02 filter box), aiming at each selects it, and `executeCommand(interact)` acts on that one.
3. Occlusion: a target behind a pod wall solid or a rib segment yields null; with the host's own solids ignored, the bench is selectable.
4. A known record that is aimed at is selected with verb `review`. A known record within the tie window of an aimed new source loses.
5. Prompt/action agreement: for 500 random poses near the reef and workshop, the HUD's target id equals the id acted on by the next `interact` on the same state.
6. Body distance ≥ 4 is never selected, even when the ray hits the host.

**Migrating existing tests.** Tests that place the player at `SOURCES[id].position` and call `interact` stay valid because the eye is inside the host sphere. Tests at other poses need `faceTarget`. These edits belong to 1A; each adds aim only and changes no expected outcome.

**Playable verification.** S1 and S2 in §9.

### T2. Line-of-sight query

- **Interface.** Add `WorldQueries.lineOfSight(a: Vec3, b: Vec3, ignore?: readonly string[]): boolean` (`types.ts`, implemented in `world.ts`).
- **Algorithm.**
  - Slab-test the segment against each solid that is neither ignored nor a rib.
  - Test rib segments as true capsules: segment-to-segment distance against `radius`.
  - Sample terrain every 0.3 m (`surfaceHeight(x, z) > y + 0.05` blocks).
  - The water plane never blocks.
- **Shared geometry.** Rib capsules go in one helper, `ribContact(...)`, which T18 later reuses for collision. Visibility and collision then match.
- **Carrier fixture.** `createWorldQueries(carrierInteriorSolids…)` gains `lineOfSight` automatically.
- **Tests:** a known clear segment, one blocked by a solid, one blocked by a rib, terrain occlusion across the island, and ignore-list behaviour.

### T3. Prompt, cue and labels (1B)

**Prompt** (`view.ts:493`): one line, `E  {label}  {Verb}`.

| Before | After |
| --- | --- |
| `E dart / board` / `Inspect` | `E  Dart  Board` |
| `E Grazer glass ledge` / `Collect exposed bundle · Q scan` | `E  Grazer glass ledge  Collect`, plus `Q  Scan` only when the scanner is equipped and the host is unscanned |
| `E Scored regulator` / `Inspect & record · J notebook` (for a known record) | `E  Scored regulator  Notebook` |
| Exhausted host | `E  Grazer glass ledge  Sort · 20 s` (only when reserve > 0); otherwise `Grazer glass ledge  Empty` with no key |

- **Vehicle label:** `HULLS[v.hull].label`. When disabled: label `Dart · disabled`, verb `Recover`, and E opens Hold (UI-side; boarding is refused).
- **Target cue** (new `src/render/targetCue.ts`): four thin amber corner brackets, billboarded, at `host.center`, sized to `host.radius`.
  - Depth-tested with a small depth bias, so it is never visible through walls.
  - Hidden when the target is null or the game is paused.
  - Subtle opacity pulse.
  - Brackets avoid editing the shared cel material, which can't carry a per-mesh highlight.
- **One source of truth.** After each simulation step and on command, the app calls `aimedInteraction(this.state, world)` once and caches it per state object (`WeakMap<GameState, AimedTarget | null>`). It passes the result to `view.update` (the prompt updates immediately when the id changes, not on the 90 ms HUD cadence) and to `renderer.present(state, {target})`. E and Q execute on that same state, so prompt, cue and action share one result.
- **Tests:** a presentation DOM test checks prompt text for each verb. A render-lifecycle test checks the cue is enabled only with a target and disposes cleanly.

### T4. Mouse capture lifecycle (OD2-04, 1B)

**Settings** (`app.ts readSettings`, key unchanged `siltwake.settings.v1`, additive and tolerant):

```ts
interface Settings {
  quality: Quality; sensitivity: number; invertY: boolean;
  mouseMode: "captured" | "drag";   // missing or invalid → "captured"
  keyTurnSpeed: number;             // 0.5–2.0, missing → 1 (multiplies the 1.5 / 1.2 rad/s arrow rates)
}
```

Older builds ignore the extra fields when reading and drop them when writing. That only resets the preference, which is safe.

**State machine** (in `app.ts`, owned by 1B):

```text
lock: "off" | "requesting" | "on" | "denied" | "cooldown"
wantCapture = settings.mouseMode == "captured" && active && !panelOpen

requestCapture(reason):            // called only from activation-triggering handlers below
  if !wantCapture or lock in {"on", "requesting"}: return
  if lock == "cooldown" and now < cooldownUntil: showLookChip(); return
  lock = "requesting"
  try p = canvas.requestPointerLock(); p?.then(ok, deny) catch deny
  deny(e): lock = "denied"; showLookChip()        // drag and keys keep working; never auto-retry

pointerlockchange:
  locked   → lock = "on"; hideLookChip()
  unlocked → if releasingMouse: lock = "off"      // our own release for a panel or pause
             else: lock = "cooldown"; cooldownUntil = now + 1200 ms; pause("")   // user pressed Esc or the browser released
```

**Which gestures request capture.** Only handlers of user activation:

- clicking Continue, New, Resume or "Return to the water";
- a canvas left-click while captured mode is wanted and the pointer is unlocked (that click is consumed and does not start a drag);
- closing a panel with its Return button click;
- closing a panel with the same key that opened it (Tab, K or J).

To support the last case, **Tab, K and J become toggles** while their panel is open. That gives a natural one-key round trip that is also an activation-triggering keydown.

**Never request capture on:** page load, focus or visibility return, WebGL context restoration, `entered()` without valid activation, or Escape.

**New and Continue.** These finish after async I/O, so in `entered()` the app calls `requestCapture` only if `navigator.userActivation?.isActive` is true. Otherwise it shows the look chip, and the next canvas click captures.

**Escape.** It already exits lock and pauses through `pointerlockchange`. While not locked, Escape still pauses. Closing a panel with Escape resumes **without** capture (Escape is not an activation key) and shows the chip. The chip, bottom centre and small, says `Click to look`. It is one of the few retained helper texts because it is actionable and transient.

**Blur and context loss.** These keep the existing `pause()`, which releases capture. Restoration never re-captures.

**Drag and keyboard** remain fully functional in both modes. In drag mode no request is ever made.

**Controls drawer.**

| Before | After |
| --- | --- |
| "Resume with locked mouse" button plus the paragraph "Mouse lock is optional. Escape releases it and pauses. Click and drag also works." | `Mouse look  [Captured | Drag]` segmented toggle |
| Sensitivity slider with no value | `Sensitivity  1.0` slider with a live value |
| Fixed arrow-key turn rate | `Key turn speed  1.0` slider |
| `X` (exit) and `I` (hold) missing from the key list | Both listed |

**Tests** (`app.test.ts` with the existing browser-support doubles; mock `requestPointerLock` returning a resolved promise, a rejected promise, or throwing):

1. No request on load or focus.
2. A Return click requests once.
3. A rejected request sets `denied` with drag still active.
4. A Tab-open then Tab-close round trip requests again.
5. Closing with Escape does not request.
6. A `pointerlockchange` exit pauses and sets the cooldown.
7. Settings parse old JSON, garbage and new JSON.

**Playable verification.** S6, which needs a **real mouse in the isolated Linux environment**. Automation on the owner's Windows desktop must use `mouseMode: "drag"`, which never requests capture.

### T5. Dart build heading and board copy (OD2-02, 1A)

- **Heading.** Add `DART_BUILD_YAW = Math.PI` in the registry, beside `DART_BUILD_POSE`. In `craft()` (`progression.ts`), the `dart` branch sets `v.pose.yaw = DART_BUILD_YAW` after `makeVehicle`. `makeVehicle`'s default stays 0, so the carrier fixture and other hulls are unaffected.
- **Legacy saves are untouched.** Saved `pose.yaw` is never rewritten, there is no migration, and the content version stays `expedition.3`.
- **Real launch clearance test** (`hull-clearance.test.ts`):
  - Fabricate a Dart from a materially ready test state at the workshop bench.
  - Assert `yaw === Math.PI` and `sweptHullClearance(world, lane25m(DART_BUILD_POSE, yaw), HULL_COLLIDERS.dart)` is true.
  - Assert yaw 0's first contact is under 5 m (documents the old failure).
  - Decode the retained `dart-fabrication.json` fixture shape and assert its yaw 0 is preserved and boardable.
- **Board copy** (`vehicles.ts:112`). This is simulation feedback, not a persistent recovery string.
  - Before: "Boarded Dart. Hull 180 m; personal suit 150 m. WASD steer, Space/C rise/dive, E exit. Quiet throttle avoids acoustic attention."
  - After: "Dart · mouse or arrows steer · W/S thrust · A/D slide."
  - Hull and suit limits stay in the pilot guidance line when stopped (existing).
- **Cradle hint** (`view.ts:474`, 1B), inside the cradle bounds only:
  - If |yaw − π| > 0.6: `Turn to the open lane`.
  - If returning from the south within 15 m of the cradle at more than 4 m/s: `Slow · cradle ahead`.
  - The contradictory "move south … before turning" sentence is removed.
- **Playable verification.** S3.

### T6. Impact event and feedback (OD2-02; 1A event, 1B presentation)

- **Simulation** (`step.ts` piloting branch, after `moveHull`): if `move.hitSolid && previousSpeed > 4` (the existing damage threshold, so only damaging impacts produce feedback), emit

  ```ts
  { type: "impact", speed: previousSpeed, hullLoss: before - v.health, origin: { ...v.pose.position } }
  ```

  The physics, damage values and saved state are unchanged. Events are never persisted.
- **Presentation** (1B):
  - The view coalesces impact events within 1.5 s (trial) into one transient action notice, `Hull −{sum, one decimal if < 1}%`.
  - The hull figure in the Dart card flashes for 0.6 s.
  - The sound cue `"impact"` (new union member) is a short low thud, rate-limited like `damage`.
  - Below the threshold there is no text. A very quiet bump sound is optional (trial; listening is unverified).
  - The notice becomes `error` only when hull ≤ 25 (existing LOW HULL band).
- **Tests:** a simulated boost into the cradle rail emits ≥ 1 impact event with positive `hullLoss`; 3.9 m/s contact emits none; the event stream contains no persistent fields; view coalescing produces one notice for a burst.
- **Playable verification.** S4. The final-play C terrain dive is the reference case: it should now show repeated coalesced impact notices.

### T7. Known-evidence response (OD2-01, 1A + 1B)

- **UI path** (1B): when the aimed target is known evidence and the player presses E (or Q), the app opens Notebook scrolled to that finding, with a brief highlight. No simulation command is sent, and no state changes.
- **Simulation path** (1A): `executeCommand(interact)` on known evidence, for tests and other callers, pushes an info notice `"{label} · in notebook"` through an `events` argument instead of rewriting `s.feedback`.

  This matters because `stepGame` only emits notices when `feedback` changes, and `feedback` also persists the "Last recovery report". Clearing it would erase that report. So `action(s, c, w)` becomes `action(s, c, w, events)` (an internal function; both callers already own an events array).
- **Test:** repeated interact on C01 emits a notice each time; `s.feedback`, including a stored recovery notice, is unchanged.

### T8. Deliberate exit (OD2-02, 1B)

**The gate is an input-layer rule. The simulation's `exit()` legality and its refusals are unchanged.**

```text
on KeyE (or KeyX) keydown while piloting:
  v = controlled vehicle; speed = |v.velocity|
  failing = v.disabled || v.charge <= 0 || v.health <= 25 || threat.mode == "pursue"
  if speed < 1.5 or failing: command({type: "interact"})      // immediate, as today
  else: start hold; pilot guidance shows "Hold E" with a fill
        complete after 0.35 s of continuous hold → command({type: "interact"})
        cancel on keyup, pause, panel, blur, or vehicle change
```

- **Trial values** (unvalidated): 1.5 m/s is roughly the end of the coast after release, which measured ~1.5 s at the 0.36 s time constant. 0.35 s is noticeable but shorter than a deliberate tap-and-hold elsewhere. Including `pursue` in `failing` means the gate never slows escape during danger. Depth and clearance refusals still apply in simulation, so the gate never permits unsafe egress.
- **Pilot guidance copy.**
  - Before: `E Side exit · Tab Hold · Esc Controls` plus "Outside: personal air · suit 150 m / hull 180 m." shown continuously.
  - After, stopped: `E  Exit`, with `Suit 150 m · hull 180 m` only when stopped.
  - After, moving: `Hold E  Exit`.
  - The Tab and Esc reminders leave this line; they are in the toolbar.
- **Tests:**
  - At speed, a tap does not exit and a held press does.
  - A disabled or zero-charge craft exits immediately.
  - A refusal at depth is unchanged.
  - X follows the same gate.
  - A pause during a hold cancels it.
- **Playable verification.** S5.

### T9. Pilot hints and pitch/surface cue (OD2-08, 1B)

- **Hints while piloting.** For the first 12 s after boarding (trial), show `Mouse/arrows steer · W/S thrust · A/D slide · Space/C rise/dive · Z quiet · Shift boost`. After that show nothing; the existing contextual cradle and hazard hints remain.
- **On-foot hints.** The permanent hint row (`WASD move · drag / arrows look · Space rise · C dive`) becomes progressive: it shows during the first 60 s of a session, or until each control group has been used once. Afterwards it lives in the Controls drawer.
- **Pitch tick.** A small vertical scale beside the crosshair with a marker for pitch. It appears only when piloting or swimming and |pitch| > 0.14 rad (8°). No number unless |pitch| > 45°.
- **Surface chip.** When piloting and `v.pose.position.y ≥ −0.95` with forward thrust and pitch > 0.1, show the chip `Surface`.
- **No orientation change on boarding** (E6 decides after the human test).
- **Tests:** DOM visibility rules for the hints, the tick and the chip from synthetic states.

### T10. Opening skip, labels and grammar (OD2-10, 1B)

- **Skip.** Space on the canvas during phases 0–3 must be held for 0.8 s (trial) to skip, with a fill on the Skip button. A focused Skip button with Space or Enter skips immediately (keyboard-accessible, deliberate). Button label: `Skip · hold Space`.
- **Import dialog grammar** (`session.ts:266`): `${n} minute${n === 1 ? "" : "s"} explored`.
- **Tests:** a hold shorter than 0.8 s leaves the opening phase unchanged; a focused button skips; the pluralization.

## 5. Slice 2 designs

### C0. Mechanical view split (first commit of 2C, merged before 2D's view work)

Move the panel builders into `src/ui/panels.ts` (Hold, Fabricate, Notebook, `powerPreparation`, `materialStorageControls`, `moduleFitting`, `knownHabitats`, `returnInformation`). Move the HUD update, warnings, vitals and notifications into `src/ui/hud.ts`. `GameView` composes them. There is **no behaviour change**: the existing presentation tests must pass unchanged. This makes the 2C/2D split safe; without it, both touch an 878-line file.

### T11. Hold (2C)

```text
Hold   [Hold] [Fabricate] [Notebook]                Paused · Return Esc
Suit 150 m · Carried 14 / 16 CU
CARRIED
  Buoyant resin ×2      2 CU          [→ Workshop locker]
  Reserve cell 1        75%           [Use as Dart power]   (only at a craft socket)
  Prepared meal ×2                    [Eat · F]
  Salvage buoy                        [Deploy · B]
HERE
  Workshop locker 5 / 160   ·   Dart hold 2 / 32
  Store materials → [Workshop locker ▾]   [Store 4 CU]
DART                         Power 92% · Hull 100%   [Service]
  Acoustic trim  quiet 3→4.2 · boost 11→9 · 2 CU     [Install]
Power ▸  Pulse G −25 from Cell 1 · Cells 75% · 100%   (expands: recharge at bench, cell → hull)
Elsewhere ▸  Pod locker 0/160
```

**Information order:** carried items, then accessible containers and bulk store, then the nearby craft with service and fitting, then the collapsed Power strip, then the collapsed Elsewhere line.

**Removed:**

- the panel intro paragraph;
- the "Reusable buoy …" paragraph (the buoy is an item row with its action);
- the "Out of reach … A workshop locker opens after …" paragraph (now `Elsewhere ▸`, plus `Locked · restore at bench` only for an unrestored locker);
- the 7 m service small print (shown only as a refusal);
- the Return & recovery article (moved to Notebook; shown in Hold only while a loss or recovery is active);
- the "No charge needed: Z quiet …" text (contextual in danger);
- the eyebrow "EXPEDITION PAUSED / NO SURVIVAL DRAIN" (now the pill `Paused`).

**Readable identities** (display only; ids unchanged):

- `cellLabel(state, id)` gives `Reserve cell N`, where N is the cell's index among the player's cells sorted by stable id. Its container is shown only when ambiguous.
- Modules use `ITEMS[kind].label`.
- A DOM test asserts that no rendered text matches `/\bitem_\d+\b/`.

**Repeatables** (cells, meals, buoy, transfers) always stay visible. One-time actions are never hidden while available.

### T12. Fabricate (2C)

```text
Fabricate        At Splitspine workshop              Paused · Return Esc
READY
  Dart acoustic trim     Crust 2/2 · Resin 2/2      [Fabricate]
  Reserve cells ×2       Alloy 2/2 · Glass 2/2 · Membrane 2/2  [Fabricate]
NEEDS MATERIALS
  Fit 150 m suit         Alloy 1/1 · Membrane 0/3 (+2 carried elsewhere)
COMPLETED ▸ 7
```

**Header status line** (one line, named and directional):

- `At home pod bench`
- `At Splitspine workshop`
- `No bench here · Splitspine workshop 21 m NW` (or the nearest restored bench that has the recipe). This replaces every per-recipe "Use the fabrication bench at the required refuge." line.

**Ingredient chips.** `have/need`, using **usable here** counts (unchanged `available(state, kind, bins)`). When the player carries more than is usable at this site, append `(+N carried)`, or `(+N elsewhere)` for an inaccessible locker. This keeps carried and usable distinct without implying they can be spent here.

**Order:**

1. Ready here (refusal null).
2. Needs materials.
3. Blocked by prerequisite, as one line `Needs: Scanner & service tool`.
4. `Completed ▸ N` collapsed (one-time `r.once` recipes only).

**Moved out:** pulse and recharge (to Hold Power), module fitting (to Hold Dart), known habitats (to Notebook), sort buttons (to the E verb), the "unfinished large berth" article (to Notebook as a place note), and the rescue-stock paragraph (now a chip on rescue recipes only: `Rescue stock 16 / 1 / 10`).

**One feedback surface.** While a panel is open, command feedback goes to a single `aria-live` line under the header, and the HUD toast is not also shown. The sticky duplicate and the per-recipe repeated refusal are removed. Persistence errors still also appear in the menu save status (T15).

**Focus.** Keep the existing `data-command-key` restoration so focus survives reordering.

**Not in this task.** Fabricating from the craft seat at a cradle is gameplay access (E5). The UI only names the bench and its distance.

### T13. Notebook compaction (2C)

- **Keep untouched:** finding cards (Observed / Hypothesis / Regional lead / Source), Mara's record, current question, interpretation line. This is the notebook's voice.
- **Remove:** the intro paragraph (the structure is self-evident).
- **Replace** "Before committing to a dive" (two dense paragraphs) with a `Dive check` row of state chips: `Suit 150 m · Air 180 s · Dart 180 m · Cells 75% / 100% · Meal 2`. The Z and G guidance moves to danger context (T16).
- **Places:** compact rows, `Splitspine workshop · NW 21 m · air, locker, charging`. Recovery text appears only when relevant.
- **"Recovered research 1 / 5"** (prior OD-09 residue): replace with nothing. Root decides if a counter returns.

### T14. Storage destination (2C)

```text
storageToChosen: string | null      // set only in the change handler for #storage-to
contextKey = sorted accessible container ids joined
on refresh:
  if contextKey changed since last refresh: storageToChosen = null      // the player moved to a new site
  to = storageToChosen if still accessible
       else contextual(localRefugeLocker ?? deployedBuoy ?? craftHold)
```

This respects intentional choices within a site and never carries a stale non-choice across sites. **Test:** inside the Dart only (Dart hold) → walk to the workshop → the default is the Workshop locker; choose Dart hold explicitly → it persists across refreshes at the workshop → change site → contextual again.

### T15. Notice centre (OD2-05, 2D)

**Event shape** (additive; events are not persisted):

```ts
{ type: "notice"; message: string; error?: boolean;
  channel?: "threat" | "action" | "system" | "persistence"; key?: string }
```

Session notifications pass `channel`: save and import successes are `system`; every `error: true` is `persistence`. `survival.ts` threat notices carry `channel: "threat", key: "threat"`.

**Display rules** (`hud.ts`):

- **Priority:** persistence error 4, threat 3, action error 2, action 1, system 0.
- **Slots:**
  - one centre toast for priority ≥ 1;
  - `system` successes go to a small corner chip (3 s, trial) and never cover the centre.
- **Replacement:** equal or higher priority replaces. Lower priority waits as a single latest pending item, shown afterwards if still relevant (an action notice older than 4 s is dropped).
- **Time-to-live** counts **unpaused** time for action (4 s, trial) and threat (state-bound, below). Persistence errors keep 12 s of wall time, plus their existing persistent surfaces (menu save status and the unsaved-session aside), and are never suppressed.
- **Panels open:** see T12. Persistence errors still show in the toast as well.

**Tests:**

- A save success during a threat warning does not replace it and appears in the corner.
- A persistence error replaces a threat notice and stays its full time; the session-warning aside is unaffected.
- A pause freezes action TTL.

### T16. Danger release, arc and render legibility (OD2-05/06, 2D)

- **Release** (`hud.ts`, derived from state each update): when `threat.mode` becomes `disengage` and the player isn't in a refuge, clear the threat toast and show `Calls fading · {dir}` (threat channel, non-error, 2.5 s trial). If a new `warn` arrives, it replaces this immediately. In a refuge, just clear. The copy describes state; it never says "safe".
- **Off-screen arc.**
  - A thin screen-edge arc at the hunter bearing, relative to camera yaw and pitch.
  - Shown only while `threat.mode ≠ idle` and not in a refuge. It is the visual equivalent of the paired calls, giving the same direction the HUD already prints.
  - Hidden when the hunter is inside the view frustum **and** `world.lineOfSight(eye, hunter)` is clear, so it never reveals more than sound would, and never shows the animal through geometry.
- **Render** (`expedition.ts`, render-only): during `warn`, `investigate` and `pursue`, the existing warning fins and eye glows pulse brighter (emissive gain). The mesh stays depth-tested and fogged normally; there is no fog bypass and no teleport.
- **Diagnostic for E4** (dev-only, not shipped UI): `threatVisibilityProbe(state, world)` returns `{distance, inFrustum, losClear, haze, projectedPx}` from state and camera math. Running it offline over saved warning states (`canopy-pre-warning.json` plus the final-play B states) tells E4 whether distance, fog or console occlusion dominates.
- **Tests:**
  - Mode transition warn → disengage clears the toast and shows the calm cue.
  - The arc is hidden when the frustum and line of sight are clear, and visible otherwise.
  - No arc in a refuge.

### T17. Air and breathing state (OD2-07, 2D)

O₂ card sublabel, derived from `exposure(state)`:

| State | Sublabel |
| --- | --- |
| Breathable, refuge | `Refuge air` |
| Breathable, at surface | `Surface air` |
| Not breathable | `{ceil(oxygen × 1.8)} s` (100% / 180 s from `survival.ts:53`) |
| Piloting a healthy craft | `Dart air` |
| Piloting a failing craft | `Emergency {emergencyAir} s` |

When the card changes to not breathable, it switches to an underwater style; no toast. The existing LOW OXYGEN warning is unchanged. This covers the ramp-entry case without moving the player. **Tests:** a state matrix to label.

### T18. Rib collision fidelity and blocked-ascent cue (OD2-07, 2D)

**Collision.**

- Remove the `reef.rib.*` AABB solids from `SOLIDS`.
- In `moveCapsule`, add a rib pass using `ribContact`: the swept upright capsule axis against each rib segment capsule, tested in sub-steps of ≤ 0.12 m. On contact, remove the velocity component along the contact normal (the vector from the rib axis's closest point). This gives a real slide along the curved rib instead of stopping on a box face.
- Dart `moveHull` passes through the same `moveCapsule`, with its square proxy approximated by its radius for ribs (conservative).
- `clearance()` and `lineOfSight()` use the same helper.

**Blocked cue.**

- In `step.ts` (swim branch): if vertical input > 0.5 and realized vertical displacement is under 10% of requested for ≥ 20 ticks (0.33 s, trial), emit `{type: "blocked", direction: "up"}`.
- The HUD shows `Blocked above` beside the crosshair for 1.5 s.
- No automatic push.

**Tests:**

- The sweep metric from §0.4 (port the scan script into a test): upward steps blocked with > 0.25 m of visible clearance drop from 210 to 0.
- Both recorded stall poses can rise or slide free with Space plus a small horizontal input.
- The existing hull-clearance, carrier and route-sweep tests pass.
- Evidence route paths still pass `sweptHullClearance`.
- A rib target behind the arch stays occluded.

**Risk.** This changes movement at one landmark. It is a physics change, so it gets its own commit and the existing sweeps rerun. It is not combined with buoyancy (rejected).

### T19. Contextual pulse chip and contrast (OD2-10, 2D)

- **Pulse chip:** shown only while `threat.mode ≠ idle`, inside the territory (distance to `THREAT_HOME` < 72 and not in a refuge), or while a pulse is active. It is always available in Hold's Power strip, so the cost stays discoverable.
- **Contrast:** coalesce with ASTRA/SOL-M1-INTEGRATED-R1-01. Give the compass, region eyebrow and `.explore-note` a translucent backplate (CSS in `hud.css`; the panels CSS stays with 2C to avoid stylesheet conflicts). Verify with the existing contrast-index method against bright sand, sky and the cockpit console: ≥ 4.5:1 for secondary text, matched frames.

## 6. What stays unchanged (all slices)

- Dart acceleration and coast (time constant ~0.36 s), speeds, strafing, camera-locked heading, no added shake or inertia.
- Collection toasts with source explanation.
- Bulk material moves (whole-stack, capacity-checked).
- The trim tradeoff (quiet 4.2 / boost 9 / 2 CU).
- One-click supported service.
- Notebook finding prose and Mara's voice.
- Opening beats and captions.
- Save schema 2 / `expedition.3`, codec, recovery notices, writer lock and session lifecycle.

## 7. Evidence-dependent later work (not in Slices 1–2)

| Item | Why it waits | What evidence unlocks it |
| --- | --- | --- |
| E1 render interpolation and per-frame look | Touches the camera, optics and cockpit contracts; no observed high-refresh defect | Frame-time capture on the documented GPU at 60, 120 and 144 Hz, then A/B a prototype |
| E2 swim ease (0.08–0.12 s trial) | Instant swim response may be preferred | Human A/B in the playtest protocol |
| E3 marine snow and speed cues | An art and readability prototype | A boost-clip comparison plus human report of apparent speed |
| E4 hunter warning display / territory tuning | Changes encounter behaviour | `threatVisibilityProbe` over saved states plus an ordinary approach comparison with and without the T16 render cue |
| E5 cradle-site fabrication | Gameplay access, inhabitation tradeoff | A design decision after Slice 2's recount |
| E6 pitch normalization on boarding | Root narrowed it | Fresh humans still misread pitch after the T9 cue |

## 8. Interfaces, ownership and merge order

### 8.1 Freeze before dispatch (root, recorded in CONTRACTS)

1. `sim/targeting.ts`: `AimRay`, `InteractionHost`, `InteractionVerb`, `AimedTarget`, `aimRay`, `interactionHost`, `aimedInteraction`.
2. `WorldQueries.lineOfSight(a, b, ignore?)`, and the `ribContact` helper as the single rib representation.
3. `GameEvent` additions: `impact {speed, hullLoss, origin}`, `blocked {direction}`, notice `channel` / `key`, sound cue `"impact"`.
4. `GameRenderer.present(state, overlay?: { target: InteractionHost | null })`. The overlay is optional, so existing callers stay valid.
5. `Settings` (v1, additive): `mouseMode`, `keyTurnSpeed`.
6. `SessionEvents.notify(message, error?, channel?)`.
7. Registry additions: `DART_BUILD_YAW`, `INTERACTION_HOSTS`. No changes to persistent strings, ids or recovery notices.

### 8.2 Slice 1 (one Astra/Sol review pair for the batch)

| Task | Exclusive paths | Notes |
| --- | --- | --- |
| **1A simulation** | `src/sim/targeting.ts` (new), `src/sim/world.ts` (lineOfSight + ribContact helper only), `src/sim/types.ts`, `src/sim/step.ts`, `src/sim/vehicles.ts`, `src/sim/progression.ts`, `src/content/registry.ts` (additive), tests: `targeting.test.ts` (new), `expedition.test.ts`, `hull-clearance.test.ts`, `simulation.test.ts` | First commit lands the frozen interfaces with working implementations |
| **1B presentation** | `src/runtime/app.ts`, `src/runtime/input.ts`, `src/runtime/session.ts` (pluralization only), `src/ui/view.ts`, `src/render/renderer.ts`, `src/render/targetCue.ts` (new), `src/audio/sound.ts`, `src/style.css`, tests: `presentation.test.ts`, `app.test.ts`, `render-lifecycle.test.ts`, `sound-origin.test.ts` | Can start in parallel on T4, T8, T9, T10 and copy; rebases on 1A's interface commit for T3, T6 and T7 wiring |

**Merge order:** 1A, then 1B. Root assembles, runs checks and the S1–S6 scenarios, then the pair reviews one frozen candidate.

### 8.3 Slice 2 (one review pair)

| Task | Exclusive paths |
| --- | --- |
| **2C preparation** | C0 split first (`src/ui/view.ts` → `panels.ts` + `hud.ts`, merged immediately), then `src/ui/panels.ts`, `src/ui/panels.css` (new), and panel tests |
| **2D encounter / air / obstruction** | `src/ui/hud.ts` (after C0), `src/ui/hud.css` (new), `src/sim/world.ts` (rib collision), `src/sim/step.ts` (blocked event), `src/sim/survival.ts` (notice channels), `src/runtime/session.ts` (notify channel), `src/render/expedition.ts` (fin glow), `src/runtime/app.ts` (notice wiring only), and tests |

2D's simulation and world work (T18) can start before C0 merges. Its HUD work waits for C0. **Merge order:** C0, then 2C and 2D in either order, with the second rebasing.

### 8.4 Not safe to parallelize

- Anything touching `step.ts` or `world.ts` across tasks at the same time. That is why T18 stays in 2D alone and Slice 1's line of sight lands first.
- Any `view.ts` work by two tasks before C0.
- `style.css` by two tasks; hence the new per-area CSS files.
- Cradle fabrication (E5) together with the T12 UI.
- Physics changes (T18, any later E2) together with presentation-only acceptance.

## 9. Acceptance scenarios (purposeful, not a matrix)

All use production builds and ordinary inputs, from the stated earned checkpoints with SHA verified before Import. Record the viewport, input method and any diagnostic staging, labelled.

| ID | Start | Pass condition |
| --- | --- | --- |
| **S1 aim** | `alloy-first.json` (tick 1225), swim to the intake | Aiming at the scraps shows `Intake service scraps  Collect`, and E collects scraps. Aiming at the ochre filter box shows C02 `Notebook`, and E opens it. Looking away shows no prompt or cue. A host behind a rib shows no prompt. The cue sits on the host and is never visible through geometry. |
| **S2 first control** | Fresh New, stand up | No prompt until the regulator is in view. Looking at it gives `Scored regulator  Notebook`, and E opens Notebook at C01. |
| **S3 launch** | `island-glass-east-bundles.json` → walk to the workshop bench → fabricate Dart → board | View faces the open lane, hint absent. Holding W for 3 s makes no contact (hull unchanged). Separately, `dart-fabrication.json` still boards at yaw 0 and shows `Turn to the open lane`. |
| **S4 impact** | S3 state | Boost into a rail: one coalesced `Hull −N%` plus a chip flash. Contact under 4 m/s produces no text. |
| **S5 exit** | S3 state | A tap at boost doesn't exit and `Hold E` appears. A 0.35 s hold exits. A disabled craft (labelled diagnostic copy as in final-play C) exits on a tap. A refusal at depth is unchanged. |
| **S6 mouse** | Isolated Linux, **real mouse** | Return click captures. Tab opens a panel and releases; Tab closes and re-captures. Escape pauses and releases. Closing a panel with Escape shows `Click to look` and the next click captures. Denied capture (mocked or a cooldown) leaves drag and keys working. Nothing captures on load or focus. |
| **S7 refit recount** | `first-return-before-service.json` at 960×600 | Count separately: navigation actions, scroll gestures, refusals, and moves through the world (re-boarding included), for service → fabricate trim → install → store → re-board. Report against the §0-era observation without a target number. No `item_` text anywhere. The ready recipe is visible without scrolling at 600 px. |
| **S8 release** | `canopy-pre-warning.json` | Warn, then quiet reverse. The threat toast clears within 0.5 s of `disengage`, and `Calls fading` appears. A manual save during the warning shows only a corner chip. The off-screen arc appears while the hunter isn't visible. |
| **S9 rib** | Fresh or diagnostic placement (labelled) at both §0.4 stall poses | Space plus a small sideways input rises or slides free; `Blocked above` appears only at a genuine visible overhang. The sweep test passes. |
| **S10 air** | Fresh New, walk off the ramp | The O₂ card shows seconds on the first submerged tick; no automatic surfacing. |

After Slice 1 and again after Slice 2, root runs the short fresh-human protocol from my report (uncoached opening; Dart out and back; service, fabricate, fit, store; warning response). Record the mouse mode chosen, errors, hints and discomfort. No enjoyment or duration claim follows from agent runs.

**Actionable now:** T1–T19. **Needs hardware or humans:** E1–E4 and E6 evidence, plus S6's real-mouse comfort, the audio mix of the impact and calm cues, and human learning in S1/S2/S3.

## 10. Evidence and resource closure

- **Temporary files:** `/tmp/siltwake-opus-design-r2-implementation/`
  - `notes.md`
  - `scripts/{rib-stalls,rib-scan,launch-lane,prefab}.mjs`
  - `compiled/` (tsc output of `tsconfig.test.json` sources, written outside the worktree)
- Original evidence was read only. The diagnostic placement in `prefab.mjs` mutated an in-memory copy only.
- No browser, server, recording, pointer lock or input was used. No children, delegation or peer messages.
- **Repository:** only this document is added. No code, test, config, specification or canon edits; no push, PR, merge, reset or worktree binding change.
