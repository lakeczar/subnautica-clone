# OPUS-DESIGN-R2: controls, gameplay flow and polish audit

Advisory, owner-requested, 2026-10-17. This is **not** a technical acceptance. It is not the post-M3 Astra design critic and not a human playtest. It is spoiler-free: no protected canon was read and there is no spoiler appendix.

## Identity, baseline and limits

- **Model:** Claude Opus 5.5 (`claude-opus-5-5`), per the runtime's model identity. **Effort:** `high` was requested. The runtime exposes a numeric reasoning-effort parameter with no catalog label, so the effective `high` setting is **requested, not self-verified**. I used no children, delegation, peer polling or external messages.
- **Parent:** `e41b98d46bb0c2e0b48421add95ef46d60d8af76`, clean. `git diff --name-only a5821aa..HEAD` and `1caa05f..HEAD` touch only `docs/**`, so production equals the accepted `a5821aa8f3d88045669190a720ccb5765c1acef2`. My own `npm ci && npm run build` produced `index-DfpByBNx.js`, SHA-256 `378f5a61…e6e4`, which matches `M1-FINAL-INTEGRATION.md`.
- **What I knew before play** (not blind): AGENTS, STATUS, PLAN, CONTRACTS (expedition seams and movement), the revised input, the research matrix and this brief, including the coordinator's one-line OD-01–12 dispositions. From these I knew the Dart speeds, pulse cost, C01–C04 and the Canopy destination. Before play I had not read the R1 report, solution routes or evidence reports. I read them afterwards, and only to check provenance.
- **Environment:** T3 headless Chromium 154 on `factory-worker` (Linux, X11 UA), ANGLE **SwiftShader**, DPR 2. Viewport 1280×800 for menus and opening, then 960×600 with "Light" quality for play. **No audio was heard.** At 4–13 fps with an 8-step-per-frame cap, simulation ran at roughly 65–100% of wall time. **Timings below are simulation- or event-relative, sampled from `canvas.dataset.cameraPosition` and the DOM on each rAF.** They are not input latency and say nothing about consumer-GPU smoothness.

## Assessment

M1 is now a coherent, legible first expedition with good bones:

- a calm, tasteful front end
- a short opening whose purge reveal of the island is a real beat
- a notebook that separates observation from hypothesis
- resources that explain themselves when collected
- one-click supported service
- a Dart that accelerates and coasts sensibly
- a Canopy descent that now has layered crowns and lanterns

The systems are trustworthy, and the art moved substantially toward the reference.

Moment to moment, the remaining problem is **intent mapping**. In several places what the player aims at, what the prompt names and what the game acts on are different things:

- **Interaction:** E targets the nearest object within 4 m and ignores where the player is looking.
- **Piloting:** a freshly built Dart faces into the shore, the boarding toast says "WASD steer" while A/D strafe, and collisions take hull silently.
- **Menus:** the one ready action sits 2–4 screen heights down, below completed recipes and repeated rule text, and raw item IDs appear.
- **Threat:** danger is a HUD line. The hunter never entered frame, in my live run or in the retained warning and disable clips.

None of these is a deep redesign. Together they are the difference between "systems work" and "controls feel intuitive". **One bounded controls-and-flow slice (§ Shortlist) addresses most of them without changing the save schema.**

## Coverage

| Kind | What, exactly | Provenance |
| --- | --- | --- |
| **Personally played**: fresh New | Title → settings → New → four pod checks → first control → C01 inspect → notebook (paused) → deck/ramp → water → reef ribs → H hints ×2 → optional field note → (outside guidance) C02 → glass ledge ×4 collects → Hold and Fabricate panels. About 6 simulated minutes before outside guidance; 3 deliberate pause/resume cycles | Own build `a5821aa`, port 5197, incognito tab `tab_2k_0430977b…`. CDP keypresses plus page-local synthetic keydown/keyup holds; no injection or teleport |
| **Personally played**: earned import 1 | `dart-fabrication.json` (SHA `5e18d3ff…`, tick 6269, fresh-main author route), byte-identical copy imported through Import → confirm. Covered: Dart approach, board, first W, keyboard turn, cradle exit, accel/coast/boost/quiet/strafe/dive probes, CDP drag-look, pointer-lock entry and Escape release, exit at speed, re-board, return to cradle, cradle exit | Same tab. Clips `media/clip1-dart-board-cradle-exit.mp4` (441 s) and `clip2-dart-return-cradle.mp4` (99 s) |
| **Personally played**: earned import 2 | `first-return-before-service.json` (SHA `edb24efe…`, tick 16585). Counted service → fabricate refusal → exit → workshop → fabricate trim → install → bulk store sequence | `media/clip3-return-service-fabricate-fit-store.mp4` (221 s) |
| **Personally played**: earned import 3 | `canopy-pre-warning.json` (SHA `3df46ef5…`, tick 9304). Normal-speed approach → warning → investigating; second trigger → quiet reverse → disengage, logged per frame | `media/clip4-canopy-warning-quiet-retreat.mp4` (119 s) |
| Watched continuous motion | **Not claimed.** I cannot watch video in real time. Motion judgments rest on per-frame position telemetry (frame-to-frame velocity) plus frame sequences | — |
| Extracted frames | My `media/frames/clip4-1fps-sheet.png`; from retained final-play media, `b-fresh-warning-response-2fps-sheet.png`, `c-ordinary-disable-2fps-sheet.png`, `c-tow-quarterfps-sheet.png` (originals untouched) | Source `84fb7e8` (simulation identical to `a5821aa`) |
| Inspected stills | 19 own captures in `media/stills/` (named by finding) | Own run |
| Read code | `runtime/input.ts`, `runtime/app.ts` (keys, focus, pointer lock, panels), `sim/step.ts` (player/Dart movement, notices), `sim/vehicles.ts` (board/exit), `sim/progression.ts` (targeting, discovery), `sim/survival.ts` (O₂, threat), `render/renderer.ts` (camera), `render/materials.ts` (optics), `ui/view.ts` (prompt, toast, panels), `audio/sound.ts` (cues) | `a5821aa` |
| Read docs | R1 report and disposition (after play), M1-PLAY-PRESENTATION README/save index, final-play recording index | — |
| **Not covered** | Audio/mix; locked-mouse *motion* (lock entry verified, but CDP moves under lock produced no rotation); real physical mouse; gamepad (none exists); pod interior warmth and creature silhouettes at close range; Bobbin tow live; repeated failure; second quiet outing live (relied on prior evidence); the full 18-collection route; protected canon | — |
| Lost artifact | The opening recording (03:47–04:01 UTC) exceeded the 50 MiB transfer cap and could not be retrieved. Opening observations rest on stills and DOM logs | — |

## Strengths to preserve

- **S2-1 Front end and opening tone.** The title, the settings drawer and the HUD-free four-step opening work. The purge cut from a dark window to the island (`stills/01`) is the best authored moment in M1. The HUD/toast clash from R1 is gone.
- **S2-2 Collection feedback.** "2 × Silica glass → diver hold. Pale grazers scrape this exposed ledge…" is instant, says where the material went and teaches the source rule. The exhausted-stock refusal names two alternatives.
- **S2-3 One-click supported service.** One button restored Dart power 92→100% and a carried cell 75→100%, and said exactly what was restored and retained.
- **S2-4 Dart handling baseline.** Measured 0→~6 m/s in ~0.6 s and ~8 m/s by ~1 s. Release coasts ~2.5 m and settles in ~1.5 s (code time constant ~0.36 s). Boost ≈ 11, quiet ≈ 3 (4.2 trimmed), dive ≈ 6 m/s. This is responsive and slightly watery. **Do not add weight, inertia or camera shake.** Keep camera-locked heading for comfort.
- **S2-5 Paused panels and notebook.** "EXPEDITION PAUSED / NO SURVIVAL DRAIN" removes reading pressure. The Observed / Hypothesis / Regional lead / Source structure and Mara's note remain the right voice.
- **S2-6 Readable composed views.** Twin ribs from the surface (`stills/06`), the Dart framed by amber rails from the workshop deck (`stills/09`), the surface return view of Splitspine, pod and cradle (`stills/15`), and the canopy crowns with the tall rib (`stills/19`). When the camera is at the right height, places pull the player.
- **S2-7 Clear warnings with direction.** LOW OXYGEN at 31%, with an amber card and a centred banner. "SOUND HUNTER · NE · paired calls · slow down / cover" escalates to "investigating · Z quiet / retreat". These are actionable and work muted.
- **S2-8 Bulk storage and trim fit.** "Stored 2 × Buoyant resin, 2 × Conductive crust in workshop locker (4 CU)" and the install summary (quiet 4.2 / cruise 8 / boost 9) are exactly the right feedback.

## Ranked findings

Labels used below: **Obs** is something I observed, **Code** comes from reading the code, **Judg** is aesthetic or experiential judgment, **Inf** is an inference, **Hyp** is a human-test hypothesis.

### OD2-01 · P1 · high confidence: E acts on the nearest object, not the aimed one

- **Where:**
  - `sim/progression.ts:102-114` returns the nearest interactable within 4 m in 3D, ignoring view direction.
  - `ui/view.ts:493` pins the prompt below the crosshair.
  - No in-world highlight exists (no render code references the target).
- **Obs:**
  - The first prompt after standing named "Scored regulator" while the regulator was behind the camera (`stills/02`).
  - "Mara's field note" and "Intake & living filters" prompted with the object off-screen; I was looking at sand and at the surface respectively.
  - At the intake, the **already-recorded** clue kept winning E over the adjacent tagged alloy panels until I physically moved closer to them.
  - A repeat E on a known clue does nothing visible.
- **Consequence:** the centre dot looks like an aim point but aims nothing. In dense reefs the player cannot choose between adjacent hosts by looking. They must body-position, or E surprises them. That undermines the "single understandable way to know what can be done here" the brief asks for.
- **Change:**
  - Select by a view cone: within ~30° of the view ray and ≤ 4–5 m, score by angle first and distance second. Fall back to nearest only when nothing is in the cone.
  - Demote evidence the player already holds below uncollected sources.
  - Add a subtle target cue: boost the existing contour ink or rim on the targeted mesh, or draw a small world-space bracket.
  - Re-press on a known clue should show "Already in notebook · J".
  - *Tradeoff:* small render work for the highlight. Selection stays in sim, so saves are unaffected.
- **Verify:** at the intake, look at the panels → prompt names the scraps. Look at the mouth → the clue. Face away → no prompt or nearest fallback. Add a unit test for the angular scoring.

### OD2-02 · P1 · high: the Dart's first launch and return fight the player

- **Where:**
  - `dart-fabrication.json` Dart pose yaw 0; `sim/vehicles.ts:109` `board()` copies vehicle yaw/pitch into the camera.
  - `vehicles.ts:112` boarding toast.
  - `view.ts:474` cradle hint.
  - `step.ts:367-372` collision: half velocity, hull loss above 4 m/s, no event.
  - `exitRefusal` has no speed check.
- **Obs** (clips 1–2, `stills/10–12, 16`):
  1. Boarding snapped the view 303°→000°, facing the island slope.
  2. The toast says "**WASD steer**". A/D strafe at ~8 m/s; turning is mouse/arrows only.
  3. The first natural W hit the shore within ~4.5 m (hull 100→99%, silent).
  4. A keyboard turn (fixed 86°/s, no snap) overshot to 106°, and W hit the east rail after ~0.75 m. Only the exact south lane is clear.
  5. The hint "move south beyond the amber rails *before turning*" assumes reversing, which a north-facing spawn makes non-obvious.
  6. Returning at boost stopped dead on the shore (hull 99→98%) with no toast, flash or sound.
  7. E at ~2 m/s ejected me with a 3.1 m side snap and no confirmation.
  8. Re-boarding inherited a saved upward pitch. Seven seconds of boost moved ~16 m while the Dart pressed silently into the surface ceiling (y ≤ −0.9).

  The author ledger's earlier shelf collisions (33 hull points) and missed boarding are consistent with this.
- **Consequence:** the Dart is M1's main reward, and its first ten seconds teach "I don't understand where I'm pointing, and the game quietly charges me for it." These are exactly the overshoot, misread-collision and accidental-exit cases the brief names.
- **Change:**
  - Fabricate the Dart facing the open lane (yaw π at the workshop cradle).
  - Toast: "Mouse/arrows steer · W/S thrust · A/D slide · Space/C rise/dive · Z quiet."
  - Hint: "Face the open lane between the amber rails."
  - On impact above ~2 m/s, emit one notice ("Hull scraped −1% · slow near rails"), flash the hull chip, and add a short cue.
  - Level pitch to 0 on boarding; keep yaw.
  - Gate side exit to speed < 1 m/s, or require a ~0.3 s E hold while moving.
  - Show a subtle ceiling cue when pressing the surface limit.
  - *Tradeoff:* pitch levelling slightly changes resume continuity. The spawn-yaw change affects only new fabrications; existing saves keep their parked yaw, so no migration is needed.
- **Verify:** from `dart-fabrication.json`, board → hold W → leave the cradle with no contact. Re-board after a pitched exit → level view. A deliberate bump shows feedback. E at boost is refused or requires a hold.

### OD2-03 · P1 · high: Hold and Fabricate bury the next action and leak internals

- **Where:** `ui/view.ts` panel builders (`:661` intro, `:767-818`), with clip 3 and `stills/17`. Counted sequence below.
- **Obs:**
  - Panel heights at the 600 px viewport: Hold **2630 px**, Fabricate **3886 px**.
  - Both repeat the same "Pulse or reserve power" and "Bench cell recharge" blocks at the top, mostly disabled.
  - Hold's actual contents ("Silica glass × 8") sit below the fold.
  - Fabricate lists **seven completed recipes (~200 px each) before** the only ready one, whose button sits at y≈2646.
  - Raw IDs reach the player: "Next payment: **item_10** in Diver hold", "Cells… **item_10 · 75%, item_11 · 100%**", "Retained item **item_20**".
  - Away from a bench, carried crust shows "**0 / 2**" in amber.
  - The fabricate refusal "Use the fabrication bench at the required refuge." appears **three times at once** (sticky banner, inline, toast) without naming the workshop.
  - "The unrestored workshop locker stays locked" is static copy shown after restoration.
  - Bulk store defaults its destination to the Dart hold while standing at the workshop locker.
  - Asymmetric site rule: the trim installed from the workshop deck ~20 m from the cradle, but fabricating from the cradle 20 m from the bench was refused.

  The counted refit sequence, from the Dart at the cradle (service, fabricate trim, fit, store):
  1. Tab
  2. Service
  3. Fabricate tab
  4. Fabricate → refused
  5. Esc
  6. E exit
  7. ~25 m walk/swim, then K
  8. Scroll and fabricate
  9. Hold tab
  10. Install
  11. Change destination
  12. Store
  13. Esc, then walk back and E to re-board

  That is 13 discrete interactions, 2 loss-of-context moments and 1 site round trip. Bulk storage did remove the historical per-item shuffle.
- **Consequence:** routine refits become a scroll-and-read task that depends on manual-style text. That is the opposite of "menus serve exploration". The IDs and the triple refusal undercut otherwise excellent feedback.
- **Change:**
  - **Order:**
    - Fabricate: "Ready here" first, then "Needs materials", then a collapsed "Completed (7)".
    - Hold: contents first, actions second.
    - Merge the pulse, recharge and reserve blocks into one compact "Power & cells" strip that expands on demand.
  - **Copy:**
    - Replace IDs with "carried cell (75%)".
    - Name the place and direction in refusals: "Fabricate at the Splitspine workshop bench · 21 m NW".
    - Show "carried 4 · usable here 0" instead of a bare 0/2.
    - Make the intro conditional on restoration state.
    - Show a refusal once inline and once in the toast; drop the sticky duplicate.
    - Default the store destination to the refuge locker.
  - **Rule (coordinator choice):** treat a docked cradle as part of its refuge for fabrication from the seat, matching the install rule.
  - *Tradeoff:* less forced walking through the workshop, which is a minor inhabitation cost.
- **Verify:** recount the same sequence. Target ≤ 8 interactions, no scroll to reach the ready action at 600 px, and zero `item_` strings in any panel. Add a DOM test that no rendered text matches `/item_\d+/`.

### OD2-04 · P1 · medium-high: mouse look defaults to drag, and pointer lock is lost on every panel visit

- **Where:** `runtime/input.ts` (pointerdown capture or drag; 0.0025 rad/px × sensitivity 0.4–2.5); `runtime/app.ts:442` (`openPanel → pause → exitPointerLock`) and `:368-387` (`resume` never re-locks). The lock button sits inside the pause menu's Controls drawer.
- **Obs:**
  - CDP drag-look works: a 156 px drag gave +22°, so a 180° drag-turn needs ~1,260 px.
  - "Resume with locked mouse" granted lock in the isolated renderer, and Escape released it and paused correctly. CDP moves under lock produced no rotation, so locked motion is **unverified**.
  - Arrow-look is fixed at 1.5/1.2 rad/s with no setting.
  - The sensitivity slider shows no value.
  - Of the 18 functions, `X` (exit) and `I` (hold) are undocumented. There is no rebinding.
- **Consequence (Inf):** desktop first-person players expect captured mouse-look. Drag-look means holding a button while also pressing WASD and E, and large turns need several drags. A player who finds the lock loses it after every Tab/K/J and must dig through the pause menu again. That is a constant small fight.
- **Change:**
  - At first entry, offer "Mouse look: Captured (Esc releases) / Drag", and persist the choice.
  - With Captured chosen, clicking the canvas or the panel's Return button re-requests lock (both are user gestures).
  - Show the sensitivity value.
  - Add a keyboard turn-speed slider.
  - List X and I in the controls drawer.
  - Keep drag as the accessibility fallback, and keep the owner's rule that unattended Windows sessions never capture the cursor. That is an automation rule, not a player default.
- **Verify:** this needs a real mouse in an isolated environment. Lock → Tab → Return → still locked. Escape → paused and released. Then a short human check of a 180° turn.

### OD2-05 · P2 · high: notice timing does not track state, so release is muddy

- **Where:** `view.ts:841-861` (one wall-clock toast slot, 5.5 s normal, 12 s error, expiring even while paused); `survival.ts` threat notices.
- **Obs:**
  - Live: warn at ~1.0 s of normal travel. I switched to quiet reverse at 2.0 s, and the HUD read "disengaging" at 4.1 s.
  - The red toast "Paired warning calls… Slow down or reach cover" stayed until ~13 s, about **9 s after the threat had started disengaging** (`clip4`, frame sheet).
  - In the retained warning clip, an unrelated "Saved locally. The previous valid save is retained as a backup." toast persists through the whole encounter. A stale "Save file exported…" toast opens the disable clip.
- **Consequence:** the tension–release beat (warning → act → relief) loses its release, and save bookkeeping competes with the one threat in M1.
- **Change:**
  - Tie threat toasts to threat state: clear on disengage and show a short calm confirmation ("Calls fade · hunter returning", ~2.5 s, non-error colour).
  - Move save and export confirmations to a small corner chip that never covers the centre.
  - Let a higher-priority notice replace a lower one, never the reverse.
  - The durations above come from observation. The 2.5 s confirmation is a proposed trial value.
- **Verify:** replay `canopy-pre-warning.json` with warn → quiet. The red toast is gone within ~0.5 s of the "disengaging" state, and no save text is visible during the encounter.

### OD2-06 · P2 · high: the threat is a HUD line, not a creature (OD-04, visual part, still open)

- **Obs:**
  - In my two live triggers and in the retained `b-fresh-warning-response` and `c-ordinary-disable` frames, the hunter is **never on screen**. The disable happens facing empty teal while "LOW HULL" becomes "HULL DISABLED".
  - **Code:** in the 72 m territory, normal Dart travel (loudness 0.48) crosses the warn threshold in ~0.7 s of simulation, so the zone is effectively quiet-only. There is no cue at its edge.
- **Consequence:** cause and effect for the most dramatic event in M1 are invisible. Players cannot learn the animal's cues, only the HUD's. The "wonder first, tense depths" promise depends on seeing the thing.
- **Change:**
  - Place the hunter's idle home and warn pose in the approach sightline, so the warning rises into view.
  - When it is off-screen, add a screen-edge directional arc matching the HUD bearing.
  - Add an ambient "distant calls" cue (sound plus subtle visual) when entering the territory, so the quiet zone has a legible border before the warning.
  - *Tradeoff:* a visible animal invites inspection, so the silhouette quality R1 noted (OD-11) matters more.
- **Verify:** ordinary approach from `canopy-pre-warning.json` → the hunter is visible in frame at or before the warn notice. Separately test the off-screen arc.

### OD2-07 · P2 · medium-high: swim vertical state is hard to read and can trap

- **Where:** `step.ts` swim branch (instant velocity; `vy = 0` hover at any depth; no buoyancy); `survival.ts:25-45` (`airwayY = y + 0.85` while swimming); the vitals sublabel is a static "180 s tank".
- **Obs:**
  - Walking down the ramp left me hovering at 0.6 m depth, not breathable, with a near-surface view. O₂ fell 99→89% before I noticed (`stills/03`).
  - Holding Space under the rib crest stopped ascent dead twice (at camera −8.97 and −1.01), with no slide or cue, while O₂ fell 60→45% and later to 22% (`stills/05`). Sideways plus Space escaped.
- **Consequence:** the player believes they are at the surface or rising and is quietly losing air. That combines collision opacity with poor oxygen feedback.
- **Change:**
  - Gentle buoyancy toward the surface within ~1.5 m when no vertical input is given. Alternatively, auto-surface on ramp entry.
  - When vertical motion is blocked by an overhang, deflect it along the obstacle (a small horizontal push toward open water).
  - Show "≈ 74 s air" in the O₂ card instead of "180 s tank", plus a "Submerged" state change.
  - *Tradeoff:* buoyancy slightly changes hover-collecting near the surface.
- **Verify:** walk off the ramp → surface or breathable within ~1 s. Hold Space under the rib → you emerge beside it.

### OD2-08 · P2 · medium: speed, pitch and step presentation

- **Code and Obs:**
  - At boost over open sand there is nothing near-field to read motion against: uniform sand and a fog wall, with no particulates (`stills/13`).
  - Nothing indicates pitch.
  - The renderer draws the last fixed-step pose with no interpolation (`renderer.ts`; mouse look is also applied per simulation step).
  - On-foot and swim velocity start and stop instantly.
  - The piloting HUD still shows the on-foot hint row.
- **Inf (unverified on hardware):** on 120–144 Hz displays, 60 Hz step presentation produces uneven frame pacing in camera motion. This is the most likely invisible cause of "feels a bit stiff" on a gaming PC.
- **Change:**
  - Add sparse near-camera marine snow whose streaking scales with speed.
  - Add a small pitch tick on the heading strip or console.
  - Interpolate the render pose between steps, and apply mouse-look yaw/pitch per frame for the view, committing to simulation per step.
  - Use a pilot-specific hint row.
  - Trial (proposed value, not observed): a 0.08–0.12 s swim ease-in and ease-out. Keep it only if a human A/B prefers it.
- **Verify:** test on a representative high-refresh machine with a frame-time capture. Compare boost clips for apparent speed.

### OD2-09 · P2 · medium: the first lead is findable from above, not from where players swim

- **Obs:** I found the ribs and an optional note, but needed outside guidance (the registry position) for C02 after ~6 simulated minutes. The clue point sits mid-water at (−17, −7, −8). I passed ~4.6 m away along the seabed (radius 4 m). From inside the basin the intake mouth reads as a flat dark disc among same-value rocks (`stills/04`). From the surface the composition is clear (`stills/06`). Hint tier 2 ("Face north from the pod ramp; ribs to your left") got me to the ribs, not the intake.
- **Change:**
  - Move the inspect point onto the visible mouth frame, with a lit service plate or lamp as the signifier.
  - Apply OD2-01 targeting.
  - Make the third hint tier physical: "the dark intake mouth beneath the twin ribs, above the fan colony".
  - Raise value contrast between the intake frame and the rock.
- **Verify (Hyp):** fresh players reach C02 without outside help. Record the time and the hint tier used.

### OD2-10 · P3 · high: copy and polish items that read as unfinished

- The vehicle prompt reads "**dart / board** · Inspect" (`progression.ts:87-88`, `view.ts:493`). It should be "Dart · Board".
- The import dialog says "1 **minutes** explored".
- Space skips the opening at any of the four checks (`app.ts:224-228`) while Space is "rise/jump" in the controls list. Use a held skip or the explicit button only.
- The bottom-right hints, compass and region eyebrow wash out over bright sand and sky (`stills/07`). This is the same family as the known `.explore-note` contrast finding, which remains open.
- The pulse chip ("G · 25 cell points · 100 → 75%") is permanently visible away from any threat. Show it inside the territory or on demand.
- The post-exit view at the open-ocean surface was a featureless blue field (`stills/14`). A faint horizon line or sun glint would help orientation.

## Prior Opus findings reassessed on current production

| Prior | Current evidence | Status |
| --- | --- | --- |
| OD-01 optics | Fog density is now 0.0105 (canopy 0.009 + lower), against 0.027 before. Selective grazing ink and warm refuge light pools exist (`materials.ts`). The haze clamp stays at 0.9999 (rejected). Surface views compose well. The reef basin at ~10 m is still one mid-teal value (`stills/04`) | **Revised.** The density gap is closed. Local value hierarchy at gameplay depth remains (see OD2-09) |
| OD-02 signage | Pod and workshop use small stencils ("REGULATOR"); the big signs are gone from what I saw | **Closed** for the observed scenes |
| OD-03 Canopy | The descent shows layered crowns, lantern bladders and the tall rib (`clip4` sheet, `stills/19`). The imported arrival frame at 52 m is flat (`stills/18`). I did not see the lab beacon from distance | **Mostly closed.** Destination visibility on approach is not verified |
| OD-04 encounter | Pulse costs 25 cell points; the notebook still explains Z/G/cover before the first encounter; the animal is invisible | **Cost closed. Visibility carried forward as OD2-06** |
| OD-05 cockpit | The exit guidance moved to a lower-left box. The bright console still fills ~30% of the frame (`stills/12`) | **Partial.** Not re-prioritised against controls |
| OD-06 transfers | Bulk store, local bench sources and 3 individual transfers in the current route | **Closed.** A new menu-hierarchy cost replaces it (OD2-03) |
| OD-07 accounting copy | Recovery copy is improved; raw `item_` IDs and "next payment" language are new | **Revised into OD2-03** |
| OD-08 opening | The HUD is hidden in phases 0–3 and the reveal reads well | **Closed.** Minor Space-skip risk in OD2-10 |
| OD-09 leads | The C03 lead is now place-based. "Recovered research 1 / 5" remains | **Partial.** Low priority |
| OD-10 / OD-11 | Not re-inspected at close range in this pass | **Not assessed** |
| OD-12 | Fixed | **Closed** |

## Expedition rhythm (brief)

**Decisions** today:

- reef or island first;
- quiet versus normal near the Canopy;
- spending a cell on a pulse versus retreating free;
- fitting the trim (quiet 4.2 at the cost of boost 9).

The trim works as a visible "return changes the next outing" reward. The quiet zone makes its value felt.

**Errands** today:

- repeated E per 2-unit bundle;
- the menu refit (OD2-03);
- O₂ round trips caused by the swim issues (OD2-07).

**Campaign risk (Inf):** "E nearest + scroll panel + HUD-only threat" will multiply with every region and hull. Fix the patterns now, before M2 breadth. Do not read this as a content complaint. M2–M4 content is scheduled work.

## Shortlist for the implementation team

1. **Aim-based interaction plus target cue** (OD2-01, part of OD2-09).
   - *Today:* E acts on the nearest object, sometimes off-screen. Recorded clues block resources.
   - *Better:* the player looks at the thing, it highlights, the prompt names it, E acts on it.
   - *Scope:* `sim/progression.ts` selection and a test; a small render highlight; prompt copy.
   - *Check:* the intake panels-versus-mouth test and a dense-reef test.
2. **Dart launch/return pass** (OD2-02, part of OD2-08).
   - *Today:* the first W hits the shore, the toast misnames the controls, impacts are silent, exit works at speed, the Dart re-boards pitched up.
   - *Better:* face the lane, honest control copy, impact feedback, level boarding, gated exit.
   - *Scope:* `sim/vehicles.ts` (spawn yaw for new fabrications, exit gate, board pitch); a collision event in `step.ts`; `view.ts` copy/hint; one audio cue. No save change.
   - *Check:* `dart-fabrication.json` board → W → clean exit from the cradle.
3. **Panels that lead with the next action** (OD2-03).
   - *Today:* 13 interactions and 2–4 screens of scrolling for a refit, plus raw IDs and triple refusals.
   - *Better:* "Ready here" first, completed recipes collapsed, one Power & cells strip, named places, no IDs.
   - *Scope:* `ui/view.ts` only. The optional cradle-fabrication rule is a small `inventory.ts`/progression decision for the coordinator.
   - *Check:* recount to ≤ 8 interactions, no-scroll ready action at 600 px, and a DOM test for `item_\d+`.
4. **State-aware notices and a visible threat** (OD2-05, OD2-06).
   - *Today:* the red toast lingers 9 s into release, save toasts overlay the encounter, the creature is unseen.
   - *Better:* threat notices clear on disengage with a calm confirmation, saves move to a corner chip, the warning pose is in the sightline, an off-screen arc points to it.
   - *Scope:* `view.ts` notice priority; hunter home placement and pose (render/content); a screen-edge arc.
   - *Check:* the `canopy-pre-warning.json` replay.
5. **Look and swim comfort** (OD2-04, OD2-07).
   - *Today:* drag-look by default, pointer lock lost per panel, ramp entry hovers underwater, rib crest traps ascent, O₂ shows no time left.
   - *Better:* persisted captured-look preference re-locked on Return, gentle near-surface buoyancy, ceiling deflection, "≈ N s air".
   - *Scope:* `runtime/app.ts`, `runtime/input.ts`, the swim branch of `step.ts`, vitals copy.
   - *Check:* the ramp and rib reproductions; an isolated real-mouse lock round trip.

**One coherent small polish slice ("M1 controls & flow")** for a single Sol max task: items **1, 2 and 3 in full**, plus the notice-priority half of **4** and the O₂/buoyancy half of **5**. The save schema is unchanged; the Dart spawn yaw applies to new fabrications only.

Evidence should be about six before/after comparisons from the same earned saves, not a new matrix:

- the intake targeting test;
- cradle launch and return;
- the Fabricate panel at 600 px;
- the warn → release replay;
- the ramp entry;
- the rib ascent.

The normal Astra/Sol pair reviews it as one batch. The visible hunter pose and placement, the pointer-lock preference, render interpolation and the speed/pitch cues are a **second, later slice** (render/content heavy, and best validated on representative hardware). Still later in the campaign: visible creature behaviour for every threat, and interpolation and frame pacing on the documented GPU.

## Fresh-human playtest protocol (controls, learning, flow)

Use 3–5 participants with no Siltwake exposure, a representative PC, a real mouse and audio on. Spend ~25 minutes each.

1. **New → free play for 8 minutes.** No coaching. Think-aloud is optional. Afterwards, ask: "What were you trying to do? What did E do when you pressed it? Where was the intake?"
2. **Import `dart-fabrication.json`.** Ask: "Take the Dart out and back to where it started." Note the first key pressed after boarding, any collisions, turning method and accidental exits. Ask: "How do you turn? What happened when you hit something?"
3. **Import `first-return-before-service.json`.** Ask: "Service the Dart, make and fit the trim, put the spare materials away." Count clicks and scrolls, and note any re-read or "where is it?" moment.
4. **Import `canopy-pre-warning.json`.** Ask: "Reach the lab." Ask: "What warned you? Where was it? When did you feel safe again?"
5. Record per task: completion, time, hints or outside help, mouse mode chosen, one-word feel ("floaty / stiff / fine"), and any discomfort.

Small samples find problems. They do not certify enjoyment.

## Owner choice that would change direction

**Default mouse model for players:** captured mouse-look by default (recommended for a first-person game), with drag as an option, or drag by default. Automation safety rules are unaffected either way. Nothing else in this report needs an owner decision; the cradle-fabrication rule and notice priorities are coordinator-level.

## Evidence and resource closure

- **Temporary evidence:** `/tmp/siltwake-opus-design-r2/`
  - `notes/00-prior-knowledge.md`, `notes/01-live-ledger.md`
  - `saves/` with byte-identical copies of the four imported files (SHA-256 verified against `save-index.json`)
  - `media/clip1–4*.mp4`, `media/stills/01–19*.png`, `media/frames/*-sheet.png`
  - `cleanup.json`
- **Original evidence** was read-only. No analyzers were run in place.
- **Browser:** one task-owned incognito tab, `tab_2k_0430977b-1ed3-45f2-ac72-3683f9fe8942`, on `factory-worker`. Isolation was confirmed by loopback to my own server, the Linux UA and a new renderer pid 1603201.
  - Pointer lock was granted once inside the isolated renderer and released by Escape.
  - All synthetic keys were released and lock exited before the tab was closed through `t3_preview_close`.
  - Four recordings were retrieved and stopped. The first (opening) failed transfer at more than 50 MiB; no recording remained active afterwards.
- **Server:** own `vite preview` on 5197 (pids 1603163/1603177), stopped with SIGINT. Port 5197 was verified free.
- **Untouched:** historical tab14, other tabs, storage and processes, and the shared browser host. No process-name kills.
- **Repository:** only this file was added. No production, test, config or specification edits; no push, PR or merge.
