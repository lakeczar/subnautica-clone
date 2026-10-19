# OPUS-STAGE1-R3: fresh stage1 experience verification

2026-10-18. This is the owner-required fresh experience review of the full controls / action / preparation / encounter stage, after the accepted OS2 correction. It is advisory. It is not a technical gate, not a blind human playtest, and not a continuation of R1 or R2. It is spoiler-free; protected canon was not read.

## Recommendation

**Advance to M2.** Bind one new feedback finding (OS3-01) to the first M2 presentation batch as an explicit acceptance criterion.

- **OS2-01 is closed in play.** Ordinary controls never trapped me in any of three fresh surface approaches to the reef ribs. One of those approaches passed straight through the original trap location. The unmodified trapped save imports through the normal menu, leaves with ordinary keys on the first input, saves, reloads and continues. Nothing relocates it.
- **The other OS2 corrections work as experienced.** The hull chip, the duplicated refusal, the title/pause copy and the "Saved locally" confirmation all behave as intended. Preparation is lean: 4 navigations, 4 commands, 0 refusals and 0 scrolls from return to a fitted trim.
- **New finding OS3-01 (substantive, bounded).** In an earned Canopy continuation the hunter bit the Dart for 8% hull and nothing on screen said so. There was no creature, chip, flash or text; the pursuit banner then vanished and the calm hint came back. This breaks intent → response → explanation at the most important danger moment. It is recoverable, not a softlock. The fix is presentation-only and sits inside the already-planned M2-A3 "truthful presentation" ownership.
  - I recommend **not** holding stage1 for it, because a separate gate cycle for one feedback route costs more than it protects.
  - It must not be dropped. If root prefers a stage1 leaf, it is roughly a one-file change.
- **No other blocker.** The rest are bounded copy refinements, M2 benchmark obligations (OS2-04/06, cockpit balance) and human-test hypotheses.

## Identity, binding and limits

- **Model.** Live `t3_thread_configuration` reports `claudeAgent / claude-opus-5-5`, option `effort: high`. That is the *selected* effort; I have no independent effective-effort readout. This is a fresh session with no children and no peer contact.
- **Source.**
  - Bound worktree HEAD is `223a3870d6b9e94b09d83df9253e9822b614c823`, clean.
  - The non-`docs/` diff from `dc0902864afb872c658b239821e870423877178a`, `75402ae4e3491a1f30cb3134ab9e0b1b3c843089` and `6aaeae2d97476528c3848e140aded6a069b0c3b1` to HEAD is empty.
  - I built from `git archive HEAD` in /tmp. The build produced `index-D2_rfsis.js` SHA256 `fd7f92cdbaa218012d83c83236e2743467fcb21f1fc0b3e147e83876d4f56927` and `index-CHzXt-7W.css` SHA256 `ec97b5d97f29dfda288959b2341ac6a6b825f8eddadca1a2fe55b9d8ee3209dd`. Both match the brief.
  - I re-ran no test suites. The accepted 436-test/build/economy results are the technical baseline. They are not evidence of taste.
- **Browser.**
  - One owned T3 incognito tab on `factory-worker`, served by my own `vite preview` on 5197.
  - Renderer PID 2271174 is Linux chrome-headless-shell (uid worker). Ancestry: zygote 827917 → 827915 → browser 827911 → T3 host 811435.
  - A 1.5 s page-local pulse raised its CPU ticks from 247 to 399. A second 2 s pulse raised 2271174 from 912 to 1116, while another renderer in the shared host (2271357) moved only 2349 → 2354. That renderer is not mine and I did not touch it.
  - Rendering was SwiftShader at DPR 2 on Light quality, about 5.5–6 fps. The fixed-step sim ran at about 40–47 ticks/s, roughly 0.7–0.8× real time, so timing and pacing judgments are qualified.
  - Audio was muted; nothing was heard.
  - I used Drag look throughout, so there was no pointer lock. Viewports were CSS 960×600 (fresh play and preparation) and 1280×800 (title, Dart, encounter).
- **Input.** Page-local synthetic `keydown`/`keyup` holds, CDP key presses and clicks, with tool latency between steps. Keyboard pitch and turn are coarse under this input. None of this measures human latency, mouse comfort, pacing or enjoyment.
- **Prior knowledge and help.**
  - I had read the R2 report before playing, so I knew the reef ribs, the staple cups, the intake and the R2 trap pose.
  - In fresh play I found the ribs and the intake scraps by sight, with no coordinates. From low oxygen onward I deliberately steered toward the known R2 trap pose. This is disclosed.
  - I read code to attribute OS3-01 and the stall cue.
- **Evidence.** `/tmp/siltwake-opus-stage1-r3/` (`EVIDENCE-INDEX.md`, finite manifest). Classes: **P** personally played (synthetic input) · **W** recorded clip, frames extracted (not watched live) · **S** still · **C** code · **D** labelled diagnostic.
- **Lost artifact.** The first ~20-minute recording, covering fresh play, the legacy import and preparation, exceeded T3's 50 MiB transfer limit and could not be retrieved. Stills and telemetry cover those segments.

## Strengths to preserve

- **Opening.** Four one-action pod beats lead to the door vista. The first toast names the goal and two leads. The notebook's "Current question … Compare its regulator with the intake below the reef ribs" plus a REGIONAL LEAD gives a real reason to swim. (Frames 03, 11.)
- **The reef is readable from the swimming view.**
  - The ribs, debris, fan and crown hosts read at distance (frame 06).
  - Approaching gave "Intake service scraps · Move closer" with a bracket.
  - At reach the prompt changed to `E Intake service scraps Collect`, and the receipt sat under it: "+4 Structural alloy · diver hold 8/16 CU" (frames 09–10). That is the right weight and timing.
- **Preparation is a short, legible loop** (raw/route-counts.md, frames 13–15).
  - "Service here · Tab" appears on the Dart card at the cradle.
  - Cargo opens with Here actions first.
  - Fabricate states "No bench here · exit the craft to use a bench" and "Required bench: Splitspine workshop · NW · 21 m away".
  - Walking that bearing reached the workshop zone in about 7 s. There, "Ready here 1", fabrication, "Store · 4 CU" and "Fit acoustic trim" all sat at scrollTop 0 with exact receipts.
- **Pause and return are calm.** The pause screen no longer repeats the tagline or build note. "Return to the water" takes focus, Enter returns, and movement resumes immediately. "Saved locally" is a short status, shown for about 2 s.
- **Dart handling stays immediate** (clip1). Turn, thrust, boost, quiet, dive and rise answer at once. A rib graze gave a real "Hull −0.6%" chip. Exit says just "Left the craft". I still recommend no added inertia or shake.
- **The call cue is truthful.**
  - "▼ Call bearing · ahead right, below" arrived with the paired-calls banner.
  - It updated to "below", and at pursuit onset to "behind right, below". The hunter did come from behind.
  - The banner chain was paired calls → investigating → pursuit → Calls fading, one line per state.

## Coverage

| Kind | What | Provenance |
| --- | --- | --- |
| **P** fresh New @960 | Title (1280) → Light/Drag → New → 4 beats → ramp → water → ribs by sight → H hint → LOW OXYGEN → intake debris "Move closer" → Collect (+4 alloy) → three rib-surface contacts / pass-through → J Notebook → Esc pause → Return → F5 / toolbar save. About 14 game-minutes | Frames 01–12 |
| **P** legacy trap import @960 | Menu → Import (`reef-rib-trap-expedition3.json`, 012982ea…) → confirm → W/S/A/D/C all move → save → page reload → Continue → same pose → moves | Telemetry quoted below |
| **P** earned preparation @960 | `first-return-before-service.json` (edb24efe…): Tab → Service → Fabricate → exit → walk NW → K → Fabricate trim → Cargo → Store → Fit → walk back → board | raw/route-counts.md; frames 13–15 |
| **P/W** Dart motion @1280 | Same session: launch, turn, boost, quiet, dive, rise, Canopy entry, cradle-zone stall, rib contact, exit | clip1 (245 s), frames 16–18 |
| **P/W** encounter @1280 | `canopy-pre-warning.json` (3df46ef5…): 12 s forward → call → investigating → pursuit → stop → bite → Calls fading → F meal → Export | clip2 (109 s), frames 19–21, raw/page-telemetry.json, raw/export-after-canopy-bite.json |
| **S** retained | `/tmp/siltwake-os2-refinements/after/after-seven-960.png` (staged seven-warning exit refusal; labelled diagnostic, not current fresh play) | Read-only |
| **C** | `ui/hud.ts` (pilot guidance, impact chip, blocked cue, zone hints), `ui/notices.ts`, `runtime/app.ts` (`observeThrust`, event routing), `sim/survival.ts` (hunter pursuit damage), `sim/step.ts` (thrust sample), `audio/sound.ts`, `ui/panels.ts` | HEAD = dc09028 source |
| Not covered | Physical mouse / pointer-lock resume; audio; a live exit refusal; full fresh expedition, regulator repair, reload of an active encounter, depletion/tow/recovery, new-fabrication heading; human learning, enjoyment and duration; consumer GPU | — |

## OS2-01 – OS2-08 today

| Finding | Current player experience | Disposition |
| --- | --- | --- |
| **OS2-01** rib/surface trap | See the detail below this table. | **Fixed** |
| **OS2-02** "Hull −0.0%" | Rib and terrain contacts showed "Hull −0.6%" (P, clip1). No zero-valued chip was seen. The cradle-zone stall produced one chip, then nothing. | **Fixed** in observed play; precise sub-0.05 cases rely on retained native evidence |
| **OS2-03** duplicated refusal | The retained staged still shows the full exit reason once, in pilot guidance, with a short "Exit blocked" result under the prompt. That reads well. I could not create a live exit refusal: depth refusal needs >150 m and the rib/slope exits I tried were clear. The short label appears twice ("E Exit blocked" header plus the "Exit blocked" result), which is acceptable confirmation. No screen-reader speech was heard. | **Fixed** (S + C); live refusal not re-played |
| **OS2-04** near-floor wash | Reproduced twice while hunting the intake (frame 07, pitch −51° at 9.4 m). It is the exact moment you are looking for a seabed host. | **M2 benchmark obligation, unchanged** |
| **OS2-05** resume spike | Drag mode only, so there is no new evidence. | **Hypothesis, unchanged** |
| **OS2-06** Canopy void | Unchanged: 80 m of uniform teal, "break sight behind the tall rib" with no rib in view, and now an unseen bite (OS3-01). The hunter appeared only afterwards, as a dark spike sliding off the left edge (clip2 ~21 s). | **M2 must-precede-breadth**, strengthened |
| **OS2-07** copy density | Title is down to one tagline, the scene caption is hidden, and pause carries neither. Habitat copy reads "4 ready · 8 in reserve · 4 per gather". Manual save says "Saved locally". The remaining routine copy is listed under OS3-02. | **Largely fixed**; small residue |
| **OS2-08** cradle → bench | "Required bench · NW · 21 m" plus walking that bearing reached the zone-scoped bench in about 7 s with no aiming. | **Weakened**; keep only as a light human-test question |

**OS2-01 detail (P).**

- Fresh play: three approaches to the rib legs at the surface with forward + up pitch, two from the pod side and one from the west.
  - Contact stopped forward motion, as it should. S, A and C always moved me away, and D slid along.
  - One approach passed straight through (−26.1, −0.5, −8.16), next to the original trap pose, without stopping.
  - Afterwards I surfaced and dived through the arches repeatedly with no stick.
- Legacy save: the import restored (−24.416, −0.5, −8.300) at pitch 77° with no relocation. From there:
  - W moved 0.68 m.
  - S descended to −3.19.
  - A and D slid freely.
  - C dived.
  - After saving and reloading, Continue restored the exact saved pose (−23.953, −6.024, −12.006), and W/Space still moved me.
- Visible continuity: the imported view opens looking at the sky at 77° with the pitch cue shown. That is mildly disorienting, but one look-down fixes it.

## OS1-01 – OS1-08 today

| Finding | Current experience | Status |
| --- | --- | --- |
| **OS1-01** actions vanish in danger | The receipt sits under the prompt and updates on repeat. The routine meal receipt is over-long (OS3-02). | **Fixed** |
| **OS1-02** invisible reach | "Move closer" fired at 4–8 m on the intake and the Dart, with a bracket offset to the host. Discovery of the intake still took searching under coarse keyboard pitch. | **Fixed**; unaided discovery remains a human question |
| **OS1-03** Cargo hierarchy | 4 nav / 4 cmd / 0 refusal / 0 scroll, Here-first. Fit works site-wide at the workshop. Focus lands on the changed card. | **Fixed** |
| **OS1-04** redundant hazards / glyph | One banner per state, a separate ▼ elevation glyph, and the pulse chip. The only duplicate is the visually hidden live-region copy (fine). | **Fixed** (presentation) |
| **OS1-05** service / contact | "Service here · Tab" is discoverable. Three powered stalls never showed "Blocked ahead": one against the island slope / cradle area for 8 s+, one into a rib for 5.5 s, and one in R2. The first had open water visible ahead; the zone hint "Turn to the open lane" showed only because of position and heading, and A-slide freed it. | **Partly improved**; cue eligibility hypothesis **strengthened** (see OS3-03) |
| **OS1-06** text / composition | Quiet exploration is calm at both widths. The cockpit console is still the brightest mass (about 25–30% of frame). The encounter banner overlaps the console's orange keys at 1280 but stays readable. | **Fixed with limits**; balance → M2 |
| **OS1-07** fabrication readiness | "Ready here", "Needs preparation / another bench" with "(+4 carried, unavailable here)", and "A Dart already exists. Recover its frame…" are all useful and adjacent. | **Fixed** |
| **OS1-08** helper copy | Much reduced; residue under OS3-02. | **Partly improved → near fixed** |

## The five experience areas

1. **Intent and control continuity.**
   - Aim → preview → prompt → action → receipt is coherent on foot and in the Dart.
   - The ribs are now physically fair: contact stops you, and every other direction works.
   - Pause and return are reliable and quick.
   - Remaining breaks: the seabed wash (OS2-04), and the cradle-zone stall with open water ahead and no blocked cue (OS3-03).
2. **Preparation and useful return.**
   - Service → fabricate → store → fit is short, with exact receipts and a real tradeoff ("Quiet 3 → 4.2 · boost 11 → 9 m/s").
   - The bench bearing is enough to find it.
   - Two things could confuse:
     - Fit works from the workshop platform while the Dart is "SE · 23 m away", yet Service from there says "Approach the craft service socket locally". The difference is defensible (site-scoped fitting versus local service) but unexplained. Taste only.
     - The Store destination defaulted sensibly per site: Dart hold at the cradle, workshop locker at the bench.
3. **Information timing and danger.**
   - Before contact the encounter chain is timely and truthful, including a correct "behind right" bearing at pursuit onset.
   - The consequence step fails: damage is silent (OS3-01), and the banner disappears at the bite.
   - Calm-state help returns too quickly: "Read the upper crowns…" reappears within 0.2 s of a bite.
4. **Discovery and expedition rhythm.**
   - Leads are clear. The intake host is visible and named on approach.
   - H at the ribs still says "Two visible leads: the twin reef ribs and Splitspine's broken ridge". That is mildly odd when you are already at the ribs.
   - The Dart and trim change the next outing (quiet speed) with a real decision.
5. **Visual taste.**
   - The shallows (ribs, fans, crowns, debris, island, workshop) are the richer-cel direction working well.
   - The pod interior is primitive but brief.
   - The Canopy at 53 m is still a flat teal field. The hunter's only on-screen appearance was a departing dark spike at the frame edge.
   - Near-field: passing the workshop dock produced one large flat ochre slab filling a frame corner (clip1 sheet, frame 7). Minor.

## Findings

### OS3-01 · Substantive, bounded · high confidence — predator damage is silent on screen

**Observed (P/W, clip2, raw/page-telemetry.json, raw/export-after-canopy-bite.json).** This was an earned import of `canopy-pre-warning.json` with ordinary forward travel and no seeds. The sequence:

| Tick | Hull | What the screen showed |
| --- | --- | --- |
| 10077 | 100 | Paired-calls banner + call cue |
| 10259 | 100 | Investigating |
| 10499 | 100 | Pursuit; "Call bearing · behind right, below". I released W and the Dart coasted to a stop at (122.9, −53.65, −152.0) |
| 10972 | 98 | Pursuit banner still showing, nothing else changed |
| 10979 | 96 | Same |
| 10994 | 93 | Same |
| 11007 | 92 | Banner gone, calm hint back |

- Throughout the hull drop there was no creature, no hull chip, no card flash and no message (4 fps frames, clip2 18.5–22.5 s).
- At 11007 the calm hint "Read the upper crowns. Z quiet · cover / retreat · Tab for pulse & reserves." returned, with "Calls fading" at the right.
- Only then did a dark spike slide past the left edge.
- The export confirms Dart health 92.4 and threat idle. The bite persisted.

**Cause (C).**

- `sim/survival.ts` applies `pursue && d < 5.3 && !cover` → −12 hull/s, plus a `sound` cue `damage` only on `tick % 60 === 0`.
- `runtime/app.ts` routes only `impact` events to `view.impact()`, which owns the chip and card flash. Predator damage therefore reaches the player only through the small hull number and a sawtooth sound at most once per second. The sound was muted here and may not fire at all in a sub-second bite.
- **Attribution.** This is predator damage, not terrain. The Dart was stationary with no contact, and code identifies the source. It is the first concrete observation of the "invisible predator damage" that earlier briefs warned not to assume.

**Consequence.** The player does not learn that the hunter caught them, how fast it bites, or that cover or speed would have prevented it. The banner then clears as if the danger resolved itself, which teaches "stop and wait". It is recoverable (8%), but it undercuts the encounter's whole learning loop, and every later hunter region inherits it.

**Direction (do not implement here).**

1. Emit a typed damage presentation event (source `threat`, actor, rounded loss) and route it to the existing hull feedback: card flash and chip, with the existing −0.0 suppression.
2. Give the chip a distinguishing word, for example "Hull −8% · bitten" (taste). Use the same route for diver health when out of the craft.
3. Keep the pursuit banner, or a brief "Bitten · retreat / cover" state, visible for the existing release window after a bite instead of switching straight to the calm hint.
4. Caption the damage sound when captions are on, so it is not audio-only.

Constraints: no creature tracking or marker, no physics or AI change, and no fabricated loss. This belongs in M2-A3 ownership (`ui/hud.ts`, `ui/notices.ts`, `audio/sound.ts`, `runtime/app.ts` wiring).

**Verify.**

- From `canopy-pre-warning.json`: forward 12 s, stop, wait for the bite. A visible chip/flash appears within one presentation frame of the first hull loss; there is a matching accessible announcement; and the banner does not return to the calm hint while hull is falling.
- A terrain impact still shows the existing chip with no "bitten" label.
- Recheck at 960×600 for overlap with the pursuit banner and pilot guidance.

### OS3-02 · Bounded copy refinement · medium — routine receipts still explain the system

Concrete screens (P):

- **Meal (frame 21).** At food 99, F was accepted and printed two lines: "Meal eaten. Prepared portions do not spoil; ordinary movement remains available when hungry." Suggest "Meal eaten · food 100". Also consider refusing ("Not hungry") or requiring a hold above ~90 food, because an accidental F wastes a meal for +1. Design taste; root's call.
- **Service receipt.** "Service complete: hull battery, health, emergency air and cells in your hold or this craft restored. Cargo and fitted modules retained." Suggest "Serviced · power 100% · cells charged". The button state "Fully serviced" already confirms it.
- **Notebook habitat.** The context line still says "four alloy per hand bundle", then the stock line repeats "4 per gather". Drop one.
- **H at the ribs.** The hint restates both leads even when you are at one. Prefer the next nearer step ("The intake lies below the ribs"), or leave it unchanged if hint scope is M3.
- **Title.** "FIRST EXPEDITION ·" ends on a dangling separator. Trivial.

Keep the captions, current question, leads, warnings, the import confirmation and refusals as they are.

### OS3-03 · Hypothesis (strengthened) · low–medium — "Blocked ahead" did not fire in any observed real stall

- **Observed (P/W, frame 17, clip1).**
  - 8+ s of W held at (15.6, −4.6, −17.3) facing 284°: open water and ribs ahead, island slope at the right wing. One "Hull −0.6%" chip, then nothing except the position-driven "Turn to the open lane". A-slide freed it.
  - 5.5 s into a rib at (−13, −4.5, −18): one chip, slow slide, no cue.
  - R2 recorded two more stalls without the cue.
- **Code.** `runtime/app.ts observeThrust` requires `actual ≤ 0.1·requested` and `solidLimited ≥ 0.8·(requested − actual)` for 0.5 s. Terrain/slope limitation, or a residual slide, plausibly fails this.
- **Consequence.** A craft that silently stops with clear water visible is the case the cue was meant for.
- **Ask, not a change.** Add debug telemetry of the gate inputs during M2 benchmark docking and contact tests. Then decide whether to include support/terrain limitation, or to retire the cue. Do not loosen it blindly (root's prior rule stands).

## Bucket summary

| Bucket | Items |
| --- | --- |
| **Blockers to advancing** | None |
| **Bound to first M2 presentation batch (M2-A3) as explicit acceptance** | OS3-01 predator damage feedback |
| **Bounded refinements (ride with M2-A3 or any UI leaf)** | OS3-02 routine copy; meal-at-full-food behaviour (taste) |
| **First M2 benchmark obligations (before content multiplication)** | OS2-06 visible cover / landmarks / threat and readable approach, depth and region edge (now including an observed unseen bite); OS2-04 floor wash; cockpit console balance; OS3-03 cue telemetry in real docking/contact |
| **Human-test hypotheses** | OS2-05 lock-resume spike; OS2-08 bench finding (weakened); unaided intake discovery; dense seven-warning centre stack |
| **Taste alternatives** | "bitten" wording; Fit-at-distance vs Service-local explanation; imported-save first view at 77° pitch |

## Fresh-human protocol (~20 min, 3–5 people, physical mouse, audio on, representative PC)

1. **New, 8 min uncoached.** "What is your current question? What did you pick up first?" Note any rib contact moments and floor-wash disorientation.
2. **`first-return-before-service.json`.** "Service, make and fit the trim, set out." Count re-reads and any "where is the bench?" moments.
3. **`canopy-pre-warning.json`, audio on.** "Reach the lab." Then ask: "Did anything hurt you? What, from where? What did you hide behind?" If OS3-01 is still unfixed, this directly tests whether audio alone carries the bite.
4. **Captured-mouse resume once.** Note any camera snap (OS2-05).

## Evidence and resource closure

- **Archive.** `/tmp/siltwake-opus-stage1-r3/`, indexed by `EVIDENCE-INDEX.md`. The finite `manifest.json` and its `.sha256` sidecar are recorded in the report commit message. The manifest excludes itself, its sidecar and the reconstructible `build/` tree; dist hashes are in `receipts/build-sha256.txt`. Contents:
  - receipts;
  - read-only input copies;
  - frame map and route counts;
  - telemetry;
  - the actual post-bite export;
  - 21 frames;
  - two clips with extracted frames and sheets.
- **Original evidence** under other `/tmp/siltwake-*` archives was read only. No author scripts were executed.
- **Browser.**
  - All synthetic holds were released by their timers.
  - There was no pointer lock (Drag mode); `pointerLockElement` was null at close.
  - The page helper globals were deleted.
  - Two recordings were stopped and copied. The first, oversized recording was not retrievable.
  - Two downloads (export, telemetry) were copied before the owned tab closed via `t3_preview_close`.
  - Renderer 2271174 is gone. Shared hosts 811435, 827911 and 847778 and the foreign renderer 2271357 were untouched.
- **Server.** My `vite preview` on 5197 was stopped through its task lifecycle. There is no listener, and an exclusive bind/listen on 5197 succeeds (`receipts/cleanup.txt`).
- **Repository.** Only this file is committed, directly on `223a387`. There was no production/test/config change, push, PR or merge. Report and evidence ownership is released at commit.
