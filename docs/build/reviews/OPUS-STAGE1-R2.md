# OPUS-STAGE1-R2: fresh stage1 experience verification

2026-10-18. This is the owner-required fresh experience review of the full controls / action / preparation / encounter stage. It is advisory. It is not a technical gate or a human playtest. Spoiler-free: protected canon was not read.

## Recommendation

**Hold for one focused correction, then advance to M2.**

- **The hold:** a reproducible, permanent movement trap at the reef ribs (OS2-01). The ribs are the first lead the game offers, and I reached the trap during the fresh opening through ordinary surfacing. Autosave then records the trapped state. The fix is narrow and physical: about one owner and one regression set.
- **No new broad polish batch is needed.** OS1-01, -03, -04 and -07 are fixed in use. OS1-02, -05, -06 and -08 are partly improved or fixed with limits. The remaining items are bounded refinements, M2 benchmark-region obligations, or taste.

Once OS2-01 is corrected and verified (see its Verify list), I see no reason to hold M2 for stage1 experience work.

## Identity, binding and limits

- **Model:** Claude Opus 5.5 (`claude-opus-5-5`). Live `t3_thread_configuration` reports `claudeAgent / claude-opus-5-5`, option `effort: high`. That is the *selected* effort; there is no independent effective-effort readout. This is a fresh non-author session, not a continuation of R1.
- **Source binding:**
  - Clean parent `c299ba9d406f124062a9f411f60b9f1e48ee4a88`.
  - `git diff` of non-docs paths from `4baaa34f3c5cdb859d75e320e4f95a53a669ef1e` and from `d9aaf6356cb320f283887922abf97ed8bdc54f59` to HEAD is empty.
  - I built from `git archive HEAD` in `/tmp`. Output: `index-B0ZQ9wiL.js` SHA256 `be58bfd46db548e43cd659bbdc88f70890af28fa5994f6b9ef787e5fcae1fee3` and `index-CHzXt-7W.css` SHA256 `ec97b5d97f29dfda288959b2341ac6a6b825f8eddadca1a2fe55b9d8ee3209dd`. Both match the brief.
- **Scope of my changes:** no production, test or config edits; no children, peer contact, push, PR or merge. This report is the only tracked change.
- **Browser:**
  - One owned T3 incognito tab on `factory-worker`, served on my port 5197.
  - Ownership proof: the only renderer, PID 2139127, is Linux chrome-headless-shell under UID 1000, with ancestry → browser 827911 → T3 host 811435. A 1.5 s page-local busy pulse raised its CPU ticks from 243 to 425.
  - Rendering was SwiftShader at DPR 2. Rich ran at ~3 fps, so I switched to Light (~13.7 fps) to keep the 60 Hz fixed-step sim near real time.
  - Audio was muted (`--mute-audio`); nothing was heard.
  - Viewports: CSS 1280×800 and 960×600.
- **Input:** page-local synthetic `keydown`/`keyup` holds (untrusted events) and CDP presses/clicks, with tool latency between steps. Key-hold steering is coarse. None of this measures human input latency, pacing, mouse comfort or enjoyment.
- **Prior knowledge before the fresh sample:** AGENTS, the brief, and the R1/R3 framing in the brief. No registry or route data. I used outside help twice, both disclosed below.
- **Evidence:** `/tmp/siltwake-opus-stage1-r2/` (`EVIDENCE-INDEX.md`, finite manifest). Classes: **P** personally played · **W** recorded clip, frames extracted (not watched live) · **S** still · **C** code · **D** labelled diagnostic.

## Strengths to preserve

- **The opening.** Four one-action pod beats end on the door vista of the island (frame 05). The first HUD objective and the notebook's "Current question: Why is the pod damaged?" give a real motivating question.
- **The reef reads from the swimming view.** I found the twin ribs by sight with no coordinates (frame 14). Staple cups, fans, fish and the pod are legible, and the richer-cel shallows are inviting.
- **Action → response.** The aimed bracket and "E Southern staple cups · Gather" were followed immediately by "+2 Prepared reef meal · diver hold 2/16 CU" under the prompt. A repeated E updated it to 4/16 (frames 12–13). This is the right weight.
- **Preparation is now lean** (frames 27–30, 39–40):
  - "Service here · Tab" appears on the Dart card at the cradle.
  - Cargo puts Here actions first.
  - Store and Fit sit at scrollTop 0 at 960×600.
  - Receipts are exact ("Stored 4 × Buoyant resin, 4 × Conductive crust in Dart hold (8 CU)").
  - The post-store line is neutral ("Nothing to store · Meals, cells, tools and modules stay with their container").
  - Fabricate gives a clean Ready-here view and a build receipt that names the next step: "Dart is in the yellow launch cradle. Approach the cockpit side…".
- **Danger is consolidated** (P, W clip2): one banner per state, the call cue "▼ Call bearing · ahead right, below" with a separate elevation glyph, the pulse-cost chip, then "Calls fading". The context hint hides during the warning and returns afterwards. Low oxygen is one short line: "LOW OXYGEN · 35% · return to air now".
- **Dart handling stays responsive** (W clip1). Turn, thrust, boost, quiet and dive answer at once. Impact gives a brief card flash and chip. I don't recommend adding inertia or shake.

## Coverage

| Kind | What | Provenance |
| --- | --- | --- |
| **P** fresh New | Title → New → 4 pod beats → ramp → water → staple cups ×2 → ribs by sight → H hint → LOW OXYGEN → surface → Notebook → (outside help) → **trapped between rib legs at the surface**. Export save → pause/menu (Light, Drag). About 9 game-minutes | Frames 01–25; `raw/fresh-stuck-at-ribs-export.json` |
| **P** earned A @960 | `first-return-before-service.json` (`edb24efe…`): Cargo → Service → Fabricate (no bench) → Store → exit → attempted walk to the bench | Frames 26–36 |
| **P** earned B @960 | `earned-preparation.json` (`6f3fb36b…`, at workshop): Fabricate → Cargo → Fit → Store | Frames 37–40 |
| **P** earned C @1280 | `final-before-paid-fabrication.json` (`b673cb90…`): bench → Ready here → paid Dart build. Boarding not reached by my steering | Frames 41–45 |
| **P/W** Dart motion @1280 | Seated legacy Dart from A: turn out, blocked start, boost, rib contact, quiet, dive, turn | `clips/clip1…mp4` (70 s), sheets |
| **P/W** danger @1280 | `canopy-pre-warning.json` (`3df46ef5…`): approach → investigating → call → pursuit → Calls fading | `clips/clip2…mp4` (66 s), frames 47–49 |
| **S** retained | Current composition-fix stills: `current-production-seven-refusal-960.png` (staged), preparation/target/cargo natives | Composition-fix archive (read-only) |
| **C** | `runtime/input.ts`, `runtime/app.ts` (pointer lock), `sim/step.ts` (swim/surface clamp), `sim/world.ts`, `sim/ribCollision.ts`, `sim/inventory.ts`, `ui/hud.ts`, `save/codec.ts`, `content/registry.ts` | d9aaf63 |
| **D** | Compiled-sim replay of the exported trap; seeded swim sweep; per-tick trace | `scripts/`, `raw/*seeded*` |
| Not covered | Physical mouse; audio; full expedition/reload/depletion/recovery; new-fabrication launch heading (Sol R3 retains paid-build evidence); docking; human learning/enjoyment/duration; consumer GPU | — |

**Outside help:**

1. After about 4.5 game-minutes without finding a regulator ingredient, I read the rib-area `SOURCES` positions in `content/registry.ts`.
2. During route A I read `nearWorkshop` bounds after missing the raised bench at beach level.

## OS1-01 – OS1-08 today

| Finding | Current player experience | Status |
| --- | --- | --- |
| **OS1-01** Actions vanish in danger | A compact receipt sits under the prompt with exact quantity and destination, and updates on repeat (P). Full refusals show in place (S, staged). Low-oxygen collection itself wasn't re-played; retained native/P2 evidence covers it. I never had to fight a warning to read a result. | **Fixed** |
| **OS1-02** Invisible reach | A generic "Move closer" preview appeared while approaching a host (P, shore). Brackets read clearly on the staple cups (white on teal). In the fresh sample my failure to find the intake was a search problem, not reach. Whether new players find the intake unaided remains a human question. | **Fixed** (affordance); discovery is a hypothesis |
| **OS1-03** Cargo hierarchy | Here actions first. Store/Fit at scrollTop 0 at 960. One tradeoff line ("Quiet 3 → 4.2 · boost 11 → 9 m/s · 1 socket · 2 CU"). Exact receipts; neutral "Nothing to store". Two commands per site, no scrolls, no refusals (routes A/B). The panel is still ~1,300–1,450 px tall at 960, but everything needed is above the fold. | **Fixed** |
| **OS1-04** Redundant hazards, glyph | Banner + call cue + pulse chip (+ exit guidance), versus R1's four prose surfaces. The ▼ elevation glyph is separate from the horizontal bearing, and the context hint is suppressed during the warning (P/W). In the Canopy the encounter is understood only through HUD text; see OS2-06. | **Fixed** (presentation); visibility is M2 |
| **OS1-05** Service / contact | "Service here · Tab" shows before any docking attempt, and the service banner is single and sticky (P). A 3 s blocked thrust in the cradle and a ~4 s stall against a rib both showed only impact chips, never "Blocked ahead". I can't tell whether either qualified under the deliberately narrow gate; the player just sees the craft stop. | **Partly improved** |
| **OS1-06** Text / composition | Exploration is calm: four cards, toolbar and depth, and the controls footer fades. Keys and secondary text are readable at both widths. The cockpit at 960 is crowded (cards + console leave a mid-screen band; frame 27). The pause menu content overflows below 600 px. Dense seven-warning danger (staged) blocks the centre of the view; that stays a human-test hypothesis. | **Fixed with limits** |
| **OS1-07** Fabrication readiness | Ready / Needs another bench / Current craft groups, each with an adjacent reason ("Use the fabrication bench at the required refuge"; "A Dart already exists. Recover its frame…"). The seat view says "No bench here · exit the craft to use a bench" with bench bearing and distance. Wording is "cockpit side". | **Fixed** |
| **OS1-08** Helper copy | The pod footer, inaccurate pause subtitle and seated "0 m" are gone, and the panel is named Cargo. Remaining items are listed in OS2-07. The fixture menu and Escape-to-resume were deferred by decision. | **Partly improved** |

## The five experience areas

1. **Intent and control continuity.**
   - Aim → prompt → action → receipt is now coherent on foot and in the Dart.
   - Pause/menu/return is reliable. Panels close with Escape; the pause menu needs Return.
   - Two continuity defects interrupt it:
     - The rib trap (OS2-01).
     - Swimming into the seabed turns the whole screen into an untextured wash (OS2-04).
   - A Captured-mode resume produced one locked movement spike. It is likely a CDP artifact (OS2-05).
2. **Preparation and useful return.**
   - At a site, service → store → make → fit is two to three clicks with exact receipts.
   - The friction is spatial. From the cradle, the bench sits on a raised platform 21 m away, and only the Fabricate panel's text bearing points to it (OS2-08, hypothesis).
   - The trim gives a real speed/stealth tradeoff for the next outing.
3. **Information timing and danger.**
   - Normal moments show intent → response → explanation → control without competing text.
   - In the Canopy the sequence (investigating → call → pursuit → fading) is timely and legible as text. But "break sight behind the tall rib" pointed at nothing visible (OS2-06).
   - The impact chip can read "Hull −0.0%" (OS2-02).
   - Refusals can appear twice (OS2-03).
4. **Discovery and expedition rhythm.**
   - Two visible leads and a motivating question are good.
   - The H hint restated the same two leads mid-dive. I didn't test successive presses.
   - Food cups beside the ramp are the first host most players will see. They feel productive but advance nothing; that is fine as a breather.
5. **Visual taste.**
   - The shallows (ribs, fans, caustics, pod, workshop) are the richer-cel direction working.
   - The pod interior is chunky primitive geometry, acceptable for a four-beat intro.
   - The 53 m Canopy is a uniform teal field with palm tops only at the start. It does not yet carry "tense depths" or a readable refuge/threat geography.

## Findings

### OS2-01 · Blocker · high confidence — permanent movement trap at the reef ribs

**What happened.** In the fresh run (**P**) I surfaced beside the twin ribs while answering "LOW OXYGEN · return to air now". I then pushed forward with slight upward pitch. The player froze at the surface between two rib legs, 33 m from the pod (frames 24–25). W/A/S/D, C, Space and Shift, at every heading and at pitch −77° to +77°, produced no movement. Look, vitals and the clock kept running.

**Persistence.** "Saved locally · 3:11:42 PM" shows that autosave captured the trapped state. My actual Export save (`raw/fresh-stuck-at-ribs-export.json`, tick 22258, pose (−24.42, −0.50, −8.30), velocity 0) re-imports into the same state.

**Cause (C/D).**

- The exported player box overlaps rib segment 12 by **13.1 mm**, beyond `RIB_CONTACT_TOLERANCE` = 1 mm. `clearance` is false.
- For any overlap, `sweepBoxRib` returns `{t: 0, stop: true}` (`src/sim/ribCollision.ts:103-105`), including movement *away* from the rib. So no command can ever move the player again.
- The overlap comes from the swim surface clamp (`src/sim/step.ts:613-621`). After a collision-limited move slides the capsule up the inclined rib flank above y = −0.5, the clamp sets y = −0.5 without a collision check.
- Seeded diagnostic, labelled and not gameplay:
  - 595 clear swim starts beside segment 12 just under the surface; **99 end trapped** at y = −0.5.
  - A per-tick trace shows the minimum rib gap at 0.103 → 0.067 → 0.032 → **−0.0020 m** while y holds at −0.5.
  - The trapped pose escapes 0.000 m under five sprint inputs held 2 s each.
  - The exported state moves 0.000 m in 72 direction × yaw × pitch combinations of 60 ticks each.

**History.** The slice-2 RIB contract assumed already-overlapping states "are not ordinary initial states". The clamp lives outside RIB ownership and creates them in ordinary play. No earlier report records this path; R1 explicitly did not re-test the ribs.

**Consequence.** It hits the first suggested lead, at the moment the game tells the player to surface. The only exits are importing an older export or starting a new expedition. Autosave then removes the good generation (this is my inference from the 30 s autosave cadence and my observed timestamp). This is the kind of softlock the revised input's "recovery must work without softlocks" forbids.

**Direction (do not implement here).** All three parts are needed.

1. Make the surface correction collision-aware. Sweep the downward correction with `moveCapsule`, or skip or limit it when it would reduce rib clearance below tolerance.
2. Let an already-overlapping actor move along the separating normal. Allow deltas with a positive normal component, and stop only for inward travel, so legacy or edge states self-recover.
3. Repair trapped saves on load with a visible, idempotent depenetration relocation, matching the existing foundation/carrier relocation pattern. Cover current saves that fail `clearance` against canonical ribs.

Also check hulls and the support-height snap for the same overlap path. Keep handling, velocities and the deliberate floor rules unchanged.

**Verify.**

- `raw/fresh-stuck-at-ribs-export.json` imports and moves.
- The seeded sweep gives 0/595 trapped, and the same sweep around rib 2 and both arches is also clean.
- A swim-to-surface regression beside every non-cardinal rib segment.
- Existing rib/hull/carrier/codec tests stay unchanged.
- A short live repeat of fresh New → ribs → surface at low air.

### OS2-02 · Bounded refinement · high — impact chip reads "Hull −0.0%"

- **Observed (P/W, clip1 ~t 14 s):** grazing a rib showed "Hull −0.0%" with the Dart card flash.
- **Code:** `src/ui/hud.ts:216-224` shows any loss above 0 with `toFixed(1)`.
- **Consequence:** the player gets a damage alarm that reports no damage.
- **Change:** suppress the chip below a display threshold of 0.05 (keep the flash), or round up to "−0.1%".
- **Verify:** grazing contact shows no "−0.0%".

### OS2-03 · Bounded refinement · medium — the same refusal is printed twice

- **Observed (S, staged `current-production-seven-refusal-960.png`; C):**
  - Pilot guidance permanently prints the exit refusal reason in its small line (`src/ui/hud.ts:133`).
  - Pressing E prints the identical sentence again as the action result under the prompt.
  - In the staged frame, "Exit exposure 157 m exceeds your 150 m personal suit…" appears twice next to seven warnings.
  - The same structure applies to "Exit side is obstructed…" (P, clip1 telemetry).
- **Change:** while the guidance already shows that reason, have the result say only "Exit blocked", or hide the guidance reason while the matching result is visible. Keep one full sentence on screen.
- **Verify:** a blocked exit at 960 shows the full reason once.

### OS2-04 · Later-scope (M2 near-field) · high — swimming into the seabed fills the screen with flat colour

- **Observed (P):** three times, a diver pitched down and pressing W against the floor saw an undifferentiated pale-green field with no horizon or detail (frames 15, 19, 44).
- **Consequence:** momentary disorientation exactly where resources sit.
- **Change:** in the M2 near-field/camera pass, keep the camera a small distance off terrain, or add a floor-contact cue (sediment puff or a slight push-back). This needs no physics change.
- **Verify:** pitched-down floor contact keeps a readable horizon.

### OS2-05 · Hypothesis · low — Captured-mode resume can snap the camera

- **Observed (P, `raw/page-telemetry.json`):** clicking "Return to the water" re-acquired pointer lock, and the first locked `pointermove` carried (−259, −215). That turned the camera 37° and pitched it about 31°. `PlayerInput` accumulates it with no guard (`src/runtime/input.ts:117-131`).
- **Caveat:** the magnitude looks like CDP cursor teleportation, so this is not a demonstrated human defect.
- **Verify** with a physical mouse on Windows/macOS Chrome. If it is real, discard the first locked movement event or clamp single-event outliers.

### OS2-06 · M2 must-precede-breadth · high — the Canopy encounter happens in a void

- **Observed (P/W, clip2):**
  - From the earned warning checkpoint, normal-speed travel crossed 80 m of uniform teal at 53 m.
  - The warning, call ("ahead right, below") and pursuit ("break sight behind the tall rib / retreat") arrived as text.
  - The creature, the tall rib and the "upper crowns" were not visible.
  - The Dart reached the region edge (stuck at "Home pod · 202 m") with no visible boundary or feedback.
- **Consequence:** the counterplay is fair on paper but not seen. Every M3/M4 region will repeat this unless the benchmark region proves visible cover, landmark silhouettes, a value gradient for depth and some trace of the hunter (silhouette, wake or call-origin effect) within the selected richer-cel look.
- **Why it isn't a stage1 blocker:** this is the scheduled M2 priority, not a stage1 regression. It should be the first acceptance question for the M2 benchmark, ahead of more content.

### OS2-07 · Bounded copy cleanup · medium — remaining helper and implementation language

Concrete screens (P):

- **Title and pause** stack four subtitle layers: "FIELD BUILD / M1", "A refuge. A reef. A first horizon.", "01 / HEARTH REEF · Follow the light. Learn the shore. · A QUIET PLACE TO BEGIN", and the "FIRST LINKED EXPEDITION" paragraph. The pause screen repeats all of them during play. Keep one tagline on the title and none in pause.
- **Notebook habitats:** "4 exposed · 0 finite reserve · 2 per hand bundle. When empty, tend here for 20 active seconds…" is engine vocabulary.
- **Fabricate:** "Ingredients: usable here / cost" and "Completed · 8 one-time references".
- **Routine save:** F5 gives "Saved locally. The previous valid save is retained as a backup." A short "Saved" chip is enough; keep the long form for errors and the menu.
- **Exit and build:** "Clear exit · personal suit protection" and "board deliberately".
- **Keep:** the captions, Current question, regional lead, low-oxygen and recovery text. "Personal field notes add context…" was deliberately retained by reconciliation; I note it only as taste.

### OS2-08 · Hypothesis · low — refuge wayfinding between cradle and bench

- **Observed (P, route A):** after exiting at the cradle, the bench (21 m, raised platform) never gave a preview or prompt from beach level. Repeated K checks were the only bearing source.
- **Caveat:** my keyboard steering inflates the cost, so I don't claim a defect.
- **Ask a fresh player** to walk cradle → bench → cradle. If people miss the steps, a lit stair or doorway accent is the cheap answer, not a marker.

## What must precede content multiplication

| Bucket | Items |
| --- | --- |
| **Before advancing (blocker)** | OS2-01 rib/surface trap + trapped-save repair |
| **Bounded refinements, can ride with OS2-01 or early M2** | OS2-02 chip, OS2-03 duplicate refusal, OS2-07 copy |
| **M2 benchmark obligations (before M3/M4 breadth)** | OS2-06 visible cover/landmarks/hunter and depth value; OS2-04 near-field camera; cockpit balance (the cream console is still the brightest mass, ~30% of frame); visible region edge |
| **Human-test hypotheses** | OS2-05 lock spike, OS2-08 bench wayfinding, OS1-02 unaided intake discovery, dense seven-warning centre stack, blocked-thrust cue eligibility in real docking |
| **Taste alternatives** | A softer pod-interior palette; fewer title/pause lines; a pause screen without the region card |

## Fresh-human protocol (~20 min, 3–5 people, real mouse, audio on, representative PC)

1. **New, 8 min uncoached.** "What is your current question? Where did you look first?" Note any trap or seabed-wash moments, and any E presses at 4–8 m.
2. **`first-return-before-service.json`.** "Service, make and fit the trim, store spares, set out." Count scrolls, re-reads and "where is the bench?" moments.
3. **`canopy-pre-warning.json`.** "Reach the lab." "Where was the call? What did you hide behind? What did you see?"
4. **Record:** completion, help requested, mouse mode, a one-word feel, any camera snap on resume.

## Evidence and resource closure

- **Archive:** `/tmp/siltwake-opus-stage1-r2/`, indexed by `EVIDENCE-INDEX.md`. Manifest `manifest.json`: **220 payloads / 51,606,345 bytes**, all verified; it excludes itself and its `.sha256` sidecar. Manifest SHA256 `724610ba6d957768e39bfd565d98b96f1e2f7de65dbb1165f955cf67243aeb45`. The archive is frozen read-only. Contents: receipts, read-only input copies, raw notes/telemetry, the actual trapped export, labelled diagnostics and scripts, 49 frames, two clips with extracted frames and sheets.
- **Original evidence** was read only. No author scripts were executed.
- **Browser:**
  - Synthetic holds were released in their timers.
  - Pointer lock was in effect only during Captured mode in the isolated tab (released at ~20:05; false at close).
  - Two recordings were stopped and copied, and the download was copied, before the owned tab closed via `t3_preview_close`.
  - Renderer 2139127 is gone. Shared hosts 811435, 827911 and 847778 are untouched.
- **Server:** my `vite preview` on 5197 was stopped through its task lifecycle. There is no listener, and an exclusive bind/listen on 5197 succeeds (`receipts/cleanup.txt`).
- **Repository:** only this file is committed.
