# OPUS-STAGE1-R1: stage 1 experience review (post controls/preparation polish)

Owner-required stage-exit experience review, 2026-10-18. Advisory. It is **not** a technical acceptance, not the post-M3 design critic and not a human playtest. Spoiler-free: protected canon was not read.

## Identity, baseline and limits

- **Model:** Claude Opus 5.5 (`claude-opus-5-5`), runtime identity. **Effort:** T3 `t3_thread_configuration` for this delegated thread reports `instanceId: claudeAgent`, `model: claude-opus-5-5`, option `effort: high`. That is the **selected** setting. The runtime exposes no separate effective-effort readout, so effective `high` is not independently self-verified. No children, peer contact, production/test/config edits, push, PR or parent mutation.
- **Candidate:** HEAD `5dbc73a40e2fb28c4ecbc156d247befd759c6861`, clean worktree. `git diff --stat c32d8c5..HEAD -- . ':!docs'` and `c4de579..c32d8c5` are both empty, so production/tests/config equal accepted c32d8c5 / c4de579. My own `npm ci` + `vite build` (to `/tmp`) produced `index-BpV8Fym2.js`, SHA-256 `14834e45c666…73af6`, matching `evidence/POLISH-1-SLICE2-CORRECTIONS-INTEGRATION.md`.
- **Environment:** T3 incognito preview on `factory-worker` (Chrome 154, X11 Linux UA, ANGLE **SwiftShader**, DPR 2). Isolation was confirmed because the tab reached my worker-local `127.0.0.1:5197` server with empty origin storage. Viewports were CSS 1280×800 (Rich) and 960×600 for the refit count. Render rate was about 5 fps. **No audio was heard.**
- **Input:** CDP key presses plus page-local synthetic `keydown`/`keyup` holds, released in `finally`, and a few DOM clicks. There was no mouse motion. The simulation keeps running during tool latency of roughly 5–15 s per step, so oxygen and timing pressure per action was far harsher than a human would feel. Steering with timed key holds is coarse; I overshot twice. Those overshoots are tooling artefacts, not game faults. Nothing here measures input latency, feel or pacing.
- **Prior knowledge before the fresh sample:** AGENTS, STATUS and this brief's framing only. No registry, solution route or evidence index was read before play. I needed source help after about 6 game-minutes (see OS1-02).

## Assessment

Stage 1 delivered most of what the OD2 audit asked for.

- E now acts on what you look at, and a bracket shows it.
- A newly built Dart faces open water, and its control copy is honest.
- Impacts give feedback.
- Fabricate leads with "Ready here".
- Save confirmations moved to a corner chip.
- A threat warning now ends with a clear "Calls fading".

The reef basin and the hatch reveal are the best-looking moments in the build.

The composed experience still has a **feedback-at-the-moment-of-action gap**. Three patterns cause most of the remaining friction, and all three will multiply across M2–M4:

1. **Feedback disappears under danger.** Every action/refusal notice is dropped while any danger state is active. Two collections made at low oxygen gave no confirmation, and the hold filled to 16/16 CU silently.
2. **Reach is invisible.** At 4–6 m, the most conspicuous object in the basin (the actual C02 host) showed no prompt and no cue, and E said "Nothing within reach". The bracket cue is ochre on an ochre host.
3. **The Hold is still a reading task at refuges.** At 600 px the workshop Hold is 1,481 px tall. A 17-button per-item transfer grid sits above Store and Install, and the trim's facts are stated three times.

There are no blockers. These are current high-value improvements, best fixed in one small batch before M2 breadth.

## Strengths to preserve

- **S1 Opening and reveal.** The four HUD-free pod checks end on the hatch view of the island (`stills/opening-hatch-reveal-1280.png`). The notebook's "Current question: Why is the pod damaged?" is a real motivating question.
- **S2 Richer-cel reef basin.** Twin ribs, fan colonies, caustic sand, fish schools and the intake pipes read as a coherent, inviting place (`stills/reef-ribs-basin-richer-cel-1280.png`). The Canopy lantern palms are a strong silhouette.
- **S3 Aimed targeting with honest verbs.** Live prompts named the right host every time I was in reach: "Intake & living filters · Inspect" (then "· Notebook" after recording), "Intake service scraps · Collect" (then "Sort · 20 s"), "Dart · Board" and "Workshop bench / berth · Use".
- **S4 New-build launch.** Boarded at yaw 180° and launched about 17 m down the lane with no contact. Release coasted about 2 m and settled. The toast reads "mouse or arrows steer · W/S thrust · A/D slide". Keep the responsive baseline; do not add inertia or shake.
- **S5 Contextual pilot help.** "E Hold to exit" while moving; "Exit blocked — Exit side is obstructed…"; "Turn to the open lane"; a −1 % hull flash and notice on real contact.
- **S6 Fabricate hierarchy.** "Ready here" is first, "Completed 7" is collapsed, and "0 / 2 (+8 carried, unavailable here)" is shown. The seat states "No bench here · exit the craft to use a bench / Required bench: Splitspine workshop · N · 23 m". A ready recipe needed no scroll at 960×600.
- **S7 Breathing state.** "Suit air · 23 s" changed to "Surface air" exactly at the breathable transition, and the warning cleared at once. "Dart air", "Home pod air" and "Splitspine workshop air" label refuges clearly.
- **S8 Encounter release.** In the warning, entering the crown cover column produced "Calls fading" within about 4 s and cleared the red toast. Cause → effect was fair. Persistence feedback stays in a small corner chip.
- **S9 One-click service and bulk store.** "Service complete…" appears once in a sticky panel banner. Store defaulted to the Workshop locker at the workshop, with no destination change needed.

## Coverage

| Kind | What exactly | Provenance |
| --- | --- | --- |
| **Personally played** — fresh New | Title → New → 4 pod checks → ramp/shallows → reef ribs by sight → E misses at the intake box → Hold/Notebook (paused) → pause menu/return (Esc, Enter) → C02 inspect → scraps collect ×2 at low O₂ → surface → fresh Fabricate refusal. About 12 game-minutes, help needed after about 6 | Own build of 5dbc73a; tab `tab_37_0430977b…`; synthetic keys |
| **Personally played** — earned import A | `final-before-paid-fabrication.json`, SHA-256 `b673cb90…` (tick 7551; POLISH-1B earned branch), normal Import → confirm. Paid Dart fabrication → walk to cradle → board (new yaw 180) → launch/turn/dive/boost/quiet → deliberate rail impact → cradle-mouth blocking → service from seat → seat Fabricate → exit | `media/clips/clip2-…mp4` (431 s) |
| **Personally played** — earned import B | `first-return-before-service.json`, SHA-256 `edb24efe…` (tick 16585, fresh main). Counted refit at CSS 960×600 | `media/clips/clip3-…mp4` (196 s) |
| **Personally played** — earned import C | `canopy-pre-warning.json`, SHA-256 `3df46ef5…`. Normal-speed approach → warning (twice) → cover → "Calls fading"; quiet reverse afterwards (already disengaged) | `media/clips/clip4-…mp4` (136 s), `stills/canopy-warning-four-surfaces-1280.png` |
| Watched continuous motion | **Not claimed.** Motion judgements rest on per-sample camera telemetry and frame sheets | — |
| Extracted frames / stills | `media/frames/*-sheet.png` (one per clip, plus a 3 s sheet for clip 4); 13 named stills | Own run |
| Read code | `sim/targeting.ts`, `sim/step.ts` (interact, look), `runtime/input.ts`, `runtime/app.ts` (Escape), `ui/notices.ts`, `ui/hud.ts` (`currentDanger`), `sim/inventory.ts` (`supportedServiceSite`), `sim/world.ts` (solids, LOS), `content/registry.ts` (hosts), `render/{environment,expedition}.ts` (intake art) | 5dbc73a |
| Probe | `/tmp/…/probes/c02-envelope.mjs`: compiled-source check. C02 is selected in 180/180 centred aims within reach, including my exact paused pose | Read-only, temp build |
| Read docs | OD2 report and disposition, POLISH-1 and slice-2 tasks, slice-2 R2 reconciliation, 1B save index | — |
| **Not covered** | Audio/mix; physical mouse and locked-mouse motion; gamepad; full fresh expedition; Bobbin/recovery; rib-trap re-test (RIB accepted in slice 2); fabricated-Dart docking success (I never got fully inside the cradle); human learning, duration and enjoyment; dedicated-GPU frame pacing | — |

## OD2-01 – OD2-10 against current source

| OD2 | Current evidence | Outcome |
| --- | --- | --- |
| **01** E acts on nearest | View-ray selection with LOS and own-host ignore, a corner-bracket cue, and per-verb prompts. All live prompts matched the host. A known clue shows "· Notebook" | **Fixed.** Residual reach/cue legibility moves to OS1-02 |
| **02** Dart launch/return | New build at yaw π, clean 17 m launch, honest toast, impact notice and flash, "Hold to exit" while moving, "Exit blocked" guidance. Saved pitch is retained on import (46°), as root decided | **Fixed** for launch and exit. Return/berth legibility moves to OS1-05 |
| **03** Menus bury action | Fabricate is fixed (Ready first, Completed collapsed, named bench, one refusal, carried vs usable, no `item_` strings seen). The Hold now leads with cargo and keeps a remembered/contextual destination, but at refuges it is still 2–2.5 screens with a transfer grid and triple trim facts | **Partly improved.** See OS1-03 |
| **04** Mouse look | The menu offers Captured/Drag (Captured default), "Sensitivity 1.0", a key-turn-speed slider, and X/I listed. Lock re-acquired after a page click in the isolated renderer. Locked motion and comfort are untested | **Fixed** in design and code; feel unverified |
| **05** Notice timing | Saves go to a corner chip. Threat release shows "Calls fading" and the red toast clears on disengage | **Fixed.** Residue: all actions are suppressed in danger (OS1-01), and four surfaces show during a warning (OS1-04) |
| **06** Creature visibility | A bearing cue "↗ Call · ahead right, below" plus a cover response made a fair encounter. The animal was never in frame in two warnings. The cue glyph contradicts its vertical label | **Partly improved.** See OS1-04; a visible ecology pass is later-scope |
| **07** Swim/air clarity | Breathing state and live suit seconds are shown and switch at the breathable transition. A "Blocked above" status exists. Minor: "On foot · 0.0 m" while the camera visibly stands in the shallows | **Fixed** within the sampled scope |
| **08** Speed/pitch presentation | Pitch indicator (shows degrees when steep) and pilot-specific hint rows exist. Open water is still a featureless teal field with no near-field motion cue. Interpolation was deferred by decision | **Partly improved**; motion cue and pacing are **later-scope** (needs hardware) |
| **09** First lead findability | The inspect host is now the visible intake filter box with a cue, and the notebook's lead names it. Unaided, I still failed: from 5–6 m the box gave no response, and I abandoned it as decoration | **Partly improved.** See OS1-02 |
| **10** Copy/polish | "Dart · Board", "2 minutes explored", "Skip · hold Space", and the pulse chip shown only in the Canopy are all fixed. HUD cards have solid backgrounds. Small type remains | **Fixed** for the listed items; type size moves to OS1-06 |

## Findings

Labels: **Obs** = observed live; **Code** = from source; **Inf** = inference; **Hyp** = needs a human test.

### OS1-01 · P1 · high — danger states silently drop collection and refusal feedback

- **Where:** `src/ui/notices.ts:44` returns early for any priority < 3 notice while `danger` is true. `src/ui/hud.ts:325-331` (`currentDanger`) is true for O₂ ≤ 35 % unbreathable, health ≤ 25, **food < 20**, over-depth, **Dart charge < 25 %**, hull ≤ 25, and threat warn/investigate/pursue.
- **Obs:** At 29–21 % O₂ I pressed E twice on "Intake service scraps". Stock went 8 → 0 and the diver hold went to **16/16 CU**. No collection text appeared at 50, 300 or 900 ms. The only change was the prompt verb, Collect → "Sort · 20 s" (`stills/reef-scraps-collect-low-oxygen-1280.png`, `stills/hold-full-after-silent-collect-1280.png`). Refusals such as hold full have error priority 2 and are dropped the same way (**Code**).
- **Consequence:** In exactly the moments when a player is hurrying (low air, low power on the way home, hungry), E appears to do nothing. They press again, waste air, or leave believing they collected nothing. Food < 20 and charge < 25 % can last minutes, so this is not a rare edge.
- **Change:** Keep hazards owning the centre, but give the *action itself* a minimal confirmation that never competes with them. Two options:
  - Attach a short result line to the prompt slot for about 1.5 s ("+4 Structural alloy · hold full"), styled below hazard weight.
  - Show a small side "pickup" stack that is exempt from suppression.
  - Either way, let *refusals that block the action* (hold full, wrong tool) through in the same compact form.
  - Do not replay suppressed messages later; the current no-queue rule is right.
  - *Tradeoff:* one more small surface during danger; keep it brief and non-error coloured.
- **Comparison:** most survival games keep pickup confirmation visible during low-air states. The hazard banner and the pickup line coexist because they answer different questions.
- **Verify:** at O₂ ≤ 35 %, E on a source shows a quantity line; E with a full hold shows a compact refusal; the hazard text is unchanged.

### OS1-02 · P1 · medium-high — reach is invisible, and the cue disappears on ochre hosts

- **Where:** `sim/targeting.ts:84-86` hard-cuts candidates at 4 m from the **body datum**, with nothing returned beyond that. The cue is thin amber corner brackets. The C02 host is the ochre filter box at (−17, −7.7, −8) (`render/expedition.ts:518`, registry host offset).
- **Obs:** Unaided, I swam to the most saturated object in the basin and centred it at roughly 5–6 m and then 4–5 m. There was no prompt and no cue, and E said "Nothing within reach." I concluded it was decoration and left (`stills/reef-c02-box-nothing-within-reach-1280.png`). After reading the source, the same box from 3.6 m gave the correct prompt. The bracket is low-contrast ochre on ochre. The compiled probe confirms selection works everywhere inside reach.
- **Inf:** Underwater, with a wide FOV and fog, judging distance to a 1.2 m box is hard. The one honest message ("within reach") reads as "not interactive".
- **Change:**
  - Add a **near-miss state** for the same centred aim: angle and LOS rules unchanged, host 4–8 m away. Show a dim prompt with no key, such as "Intake & living filters · closer", and a faint cue.
  - Draw the cue in a contrasting value (a light/ink outline rather than ochre), or invert it on warm hosts.
  - Do not extend reach or add markers through solids.
  - *Tradeoff:* slightly more prompt traffic; restrict it to centred aim.
- **Verify (Hyp):** fresh players reach C02 without help. Record whether anyone presses E on the box from too far away and what they conclude.

### OS1-03 · P1/P2 · high — the refuge Hold still buries next actions and repeats module facts

- **Obs (960×600):** Refit from the Dart seat. Tally:
  - **4 navigation actions, 3 explicit scrolls, 5 commands, 0 refusals, 0 destination changes, 1 site leg (~26 m).**
  - This is a real improvement over OD2's refusal and destination change, but not a matched benchmark.
- **Obs, panel shape:**
  - The workshop Hold is **1,481 px** tall. Carried items carry **17 per-item transfer buttons** ("To Workshop locker · 2 / · 1 / To Dart hold · 2 / · 1") before Store (`stills/hold-workshop-transfer-grid-960.png`). Install sits two scrolls down.
  - After install, the banner, the "Quiet 3 → 4.2 · normal 8 → 8 · boost 11 → 9" line and the "Now: quiet 4.2 · normal 8 · boost 9 · trim occupies 2 CU" line state the speeds **three times** on one screen. Sockets/CU appear three times and "noise/power unchanged" twice (`stills/hold-trim-installed-repeats-960.png`).
  - "Normal" and "cruise" name the same speed.
  - Right after a successful store, an amber line reads "No public material stacks in the source…".
  - "Dart · SE · 26 m away · approach the service socket" sits beside "Local fitting available".
- **Consequence:** A useful-return loop that is mechanically lean still reads as a manual. The repeated module text is exactly the routine helper copy the owner wants to avoid, and it will multiply with each module and hull in M2.
- **Change:**
  - **"At this site" block first:** Store materials, Install/Remove, Service, shown only when available.
  - **Carried list as compact rows** (name × qty · CU), with per-item transfers behind one row-level "Move…" disclosure.
  - **One module line:** "Acoustic trim — quiet 3→4.2 · boost 11→9 · 1 socket · 2 CU" plus its action. Drop the "Now:" restatement and shorten the success banner to "Trim fitted".
  - Use "cruise" (or "normal") consistently. Show the post-store line only when the user tries to store nothing, in neutral colour and plain words ("Nothing to store — meals, cells and tools stay with you").
- **Verify:** recount the same route. Target zero scrolls to reach Store and Install at 960×600; each speed appears once per screen.

### OS1-04 · P2 · high — the warning is four text surfaces, and the call glyph misleads

- **Obs:** At the warning (`stills/canopy-warning-four-surfaces-1280.png`), four surfaces were visible at once:
  - Top banner: "SOUND HUNTER · paired calls · slow down / cover".
  - Bottom red toast: "Paired warning calls. The hunter turns toward you. Slow down or reach cover."
  - Bottom-right context hint: "Read the upper crowns. Z quiet · cover / retreat · Tab for pulse & reserves", plus the pulse chip.
  - Right-edge cue: "↗ Call · ahead right, below".

  The **↗ glyph points up-right on screen while the label says "below"**: `notices.ts` `callDirection` only switches to a vertical glyph above 60° elevation. The hunter never entered frame in either warning.
- **Consequence:** Danger information is clear but heavy and redundant. The one spatial cue contradicts itself vertically, and players cannot learn the animal from what they see.
- **Change:**
  - Keep **one** hazard line (the banner). Show the red toast only on the first warning of a session, or drop it while the banner is up. Hide the context hint during an active warning.
  - Make the cue honest: anchor it at the screen edge along the bearing (edge arc or chevron), with a separate up/down tick for elevation. Keep it bound to the actual emitted call; no tracker.
  - Optional, bounded: a brief in-world call pulse (light or particulate ripple) at the call origin inside fog, as the visual equivalent of audio. It must not render through solids.
- **Verify:** replay `canopy-pre-warning.json`. At most two warning surfaces (banner plus cue); the glyph points down for "below"; release unchanged.

### OS1-05 · P2 · medium — Dart return: service range and cradle blocking are not legible

- **Obs:**
  - Service works within 12 m of the build pose (`inventory.ts:115-121`). From 8.6 m out the Hold offered "service socket in reach", but nothing on the HUD said so. I spent several minutes trying to berth inside the rails.
  - At the cradle mouth, low-speed thrust was silently blocked at a constant z with no notice. Two further contacts registered "Hull −0.4/−0.5 %" while the hull card still read 99–100 %.
  - The 8.6 m rail gap fits the 5.0 m hull, but nothing shows the centreline (`stills/dart-exit-blocked-open-lane-hint-1280.png`).
- **Change:**
  - Add a small Dart-card state "Service in reach · Tab" whenever `supportedServiceSite` is non-null. This tells players docking is not required.
  - Reuse a transient "Blocked ahead" cue for sustained thrust with no motion, like the blocked-ascent cue.
  - Optionally add a faint lane centreline on the cradle deck.
- **Verify:** return from open water. The service chip appears before the rails, and blocked thrust gets a cue.

### OS1-06 · P2 · medium — HUD edge load, small type and overlapping text

- **Obs:**
  - At 1280×800, secondary HUD text is **10–11 CSS px**: region eyebrow, all five top-right button labels and keys, vital labels, depth caption, hints. The exit key glyph is **8.8 px**.
  - Boarding showed two control-hint texts at once (bottom-right row plus centre toast) (`stills/dart-boarded-new-yaw180-two-hints-1280.png`).
  - The C02 success toast overlapped the target prompt (y 630–688 vs 600–645) (`stills/reef-c02-recorded-toast-overlaps-prompt-1280.png`).
  - "Click to look" stays stacked under the prompt for keyboard players.
  - Low-oxygen showed banner 34 % and alert 35 % at the same moment.
- **Change:**
  - Minimum 12 px for secondary labels and 13 px for values at 1280.
  - Fade the five key buttons to a single compact key strip after some idle time; they reappear on key or menu.
  - Never show two control-hint texts together.
  - The toast slot sits above the prompt, or the prompt slot carries the result (pairs with OS1-01).
  - Show "Click to look" once per resume, offset from the prompt.
  - Hazard banner and alert use the same value tick.
- **Verify:** stills at 960×600 and 1280×800 with no overlaps; measured font sizes.

### OS1-07 · P3 · high — fabrication affordances and naming

- **Obs:**
  - All six blocked fresh recipes carry identical, active-looking "Fabricate · …" buttons that only refuse.
  - After building, the spent Dart recipe moves to "Needs preparation / another bench" with an active button.
  - "Dart acoustic trim complete." gives no next step, where the Dart banner did.
  - The Dart banner says "Approach the **canopy** side", which collides with the Canopy region name.
  - Opening E shows the echo banner "Refuge services · Fabricate." and focuses the heading rather than the ready button.
- **Change:**
  - Use a distinct ready style. Blocked recipes get a disabled button with a reason, or no button.
  - Put one-of-a-kind built items under Completed ("Dart built · in cradle").
  - "Trim made · fit it from Hold at the cradle".
  - Rename to "cockpit side". Drop the echo banner and focus the first ready action.

### OS1-08 · P3 · medium — small copy/menu frictions

- Pod checks state each verb three times (heading, button, footer). Drop the footer.
- The HUD button "Hold · Tab" reads like an instruction. Consider "Cargo" or "Inventory".
- Notebook meta lines ("Personal field notes add context; they do not unlock…", "Inspecting a record does not reveal every deposit") are system explanation. Cut them or move them under Dive preparation.
- The pause subtitle "A moment ashore." shows at 7 m depth.
- The player-facing menu lists "Carrier feasibility fixture".
- Escape opens the pause menu but does not close it (`app.ts:225-231`). Allow Escape to resume in Drag mode, or say "Enter to return".
- The Dart card says "0 m away" while seated.

### Optional taste and later-scope (not stage-1 defects)

- **Depth contrast.** The 52–70 m Canopy reads as uniform mid-teal with lantern palms. "Tense depths" are not yet carried by value or light falloff, and open water at speed is a flat field (frame sheets clip 2 and 4). Address in M2 world/art with a darker gradient and sparse near-field particulates, prototyped within richer cel.
- **Cockpit.** The cream console takes about 30–35 % of the frame and is the brightest value on screen (as OD-05 noted). A darker console top or a slightly lower seat would return attention to the water.
- **Ochre overload (Inf).** Ochre marks the intake host, cradle rails, locker, posts and the HUD key/cue colour. That is coherent as "human equipment", but it makes interactable versus decor ambiguous; OS1-02 is the cheaper fix.
- **Campaign risk (Inf).** OS1-01, -02 and -03 are pattern-level: every new region, module and hull adds danger states, hosts and Hold rows.

## Expedition rhythm

- **Decisions observed:**
  - Reef versus shore first; the notebook offers both.
  - Trim tradeoff: quiet 3→4.2 at boost 11→9.
  - Normal speed versus cover in the Canopy. Reaching cover released the warning, which is a good spatial decision.
- **Errands observed:** per-bundle E presses; the refit's one site leg; Hold scrolling.
- The useful return clearly changes the next outing's speeds. Whether that feels like a choice or a checklist item is a human question (protocol step 3).

## Recommended next polish batch (one bounded Sol 6.1/max task)

1. **Action feedback that survives danger** (OS1-01), together with toast/prompt slot placement (part of OS1-06).
2. **Near-miss reach prompt plus a contrasting cue** (OS1-02).
3. **Refuge Hold restructure:** an "At this site" block, compact carried rows, one-line module facts, copy fixes (OS1-03).
4. **Warning consolidation and an honest call cue** (OS1-04, without the optional pulse).
5. **Small items:** "Service in reach" chip and blocked-thrust cue (OS1-05), the type-size floor (OS1-06), and OS1-07/08 copy.

The save schema is unchanged. Use the existing paired gate plus about six before/after comparisons from the same saves: low-O₂ collect, C02 approach from 6 m, the 960×600 refit recount, the warning frame, the cradle return, and HUD stills.

The depth-contrast/cockpit pass and any visible-creature behaviour belong to M2 art/world, validated on representative hardware.

**Recommendation:** no blocker prevents advancing. I recommend landing this batch before M2 breadth, because each item is a pattern that multiplies with content.

## Fresh-human protocol (about 25 min, 3–5 people, real mouse, audio on, representative PC)

1. **New → 8 min, uncoached.** Ask afterwards: "Where was the intake? Did E ever seem to do nothing? What did you collect?" Note any E presses at 4–8 m.
2. **Low air:** during the first low-oxygen warning, ask "Did your last pickup work?"
3. **`first-return-before-service.json`:** "Service, make and fit the upgrade, store spares, head out." Count scrolls, re-reads and "where is it?" moments. Ask whether the trim felt like a choice.
4. **`final-before-paid-fabrication.json`:** build, launch and return. Note whether people try to berth inside the rails, and their first key after boarding.
5. **`canopy-pre-warning.json`:** "Reach the lab." Ask "Where was the call? Up or down? When were you safe?"
6. **Record:** completion, time, help, mouse mode, one-word feel (floaty / stiff / fine), discomfort. Small samples find problems; they do not certify enjoyment.

## Evidence and resource closure

- **Temp evidence** in `/tmp/siltwake-opus-stage1-r1/`:
  - `notes/01-fresh-run-ledger.md`
  - `saves/` (3 byte-identical copies; SHA-256 matches the indexes)
  - `media/clips/clip1–4*.mp4`, `media/frames/*-sheet.png`, `media/stills/*.png` (13)
  - `probes/c02-envelope.{mjs,json}`
  - `MANIFEST.sha256` (32 files), `cleanup.json`
- **Original evidence** was read-only. No author scripts were executed and no analyzer was run in place.
- **Browser:** one owned incognito tab on `factory-worker`, closed via `t3_preview_close`. Four recordings were stopped and retrieved, and all keys released. Pointer lock was found active in the isolated Linux renderer at the end (a page click under the default Captured mode) and was released by closing the tab. No Windows desktop automation.
- **Server:** own `vite preview` on 5197. SIGINT went to the owned process tree only; the port was verified free.
- **Repository:** only this file was added. `node_modules` is gitignored. No production, test, config or specification edits; no push, PR or merge.
