# Recording feedback: the Opus view

Opus 5.5, design judgement · 2026-10-23 · companion to [RECORDING-FEEDBACK-SOL](RECORDING-FEEDBACK-SOL.md) (same branch base `60196347`). Story-neutral; `docs/spoilers/*` not read. Read-only: no browser, GPU or queue work.

**Sampled:** `/work/tmp/rec1/final/playtest-3090-b` and `final/pack-3090-seg0`: summaries, stories, event kinds, the playtest export's file list, and two strips (seg0 `A05` milestone, playtest `R2` random). Recorder at `origin/t3/rec-1-flight-recorder` (`REC-1.md`, `scripts/rec/analyse.mjs` and `pack.mjs`); root `src/sim/timeline/`, `scripts/timeline-report.mjs` and `scripts/playthrough/`.

**In one line:** the pack is a good health instrument and a weak design instrument. The design value is in three artefacts we mostly already have the data for: the **owner's notes**, the **droughts between major new things**, and the **tension and friction moments**. Everything else is diagnosis on demand.

---

## 1. First view (written before reading Sol)

1. **The pack is a health and performance instrument with a gameplay label.** In the playtest pack, 11 of 12 attention entries are long frames. In seg0, 13 of 18 are. On a shared run the pack itself says it doesn't judge them. So the reader's 6–10-strip budget gets spent on noise the pack has already disowned.
2. **Strips suit a hitch, not a design question.** 48 tiles of ±2 s are right for "did it pop?" They're wrong for "did the player see the lead?" The design unit is a **moment**: a few large frames over 20–30 s, plus what the player was chasing (lead, panel, vitals, last new thing). The `A05` "new region" strip is 48 near-identical cockpit tiles. It says nothing about arriving somewhere new.
3. **Pacing is worked out twice.** `analyse.mjs` has its own travelling/doing/waiting heuristic, while `src/sim/timeline/report.ts` `analyseTimeline` already carries the GAME-DIRECTION thresholds and before/after labels for gaps. That's a fork. "Longest stretch with nothing new: 112 s" on a 1.9-minute run is the whole run, and it means nothing.
4. **Bot packs show structure, never feel.** A 96% travel share from a traversal driver isn't a pacing fact. Bots don't get lost, don't hesitate, don't misread a lead, and their vitals never get scary.
5. **The owner's playtest is the signal.** Notes anchor the clips. Machine-flagged suspects (circling, long idle, repeated death, a return trip with nothing new) become *questions to the owner*, not verdicts.
6. **The smallest useful set:** a session sheet with new things on a play-time axis, droughts over 20 minutes, travel over 90 s, notes and deaths. Add one clip per note and 3–5 questions. Performance goes in its own lane and is judged only on exclusive runs.

---

## 2. Sol's report: agreement and disagreement

### Agree (no further argument needed)
- **Notes lead.** Owner words outrank technical alarms, except crash or progress loss.
- **One progression model.** Join `analyseTimeline` into the pack; no third pacing classifier.
- **Strips for motion, a large frame for readable UI.** Never infer text from 155-pixel tiles.
- **Owner exports are canvas-only and silent.** HUD, menus and the audible mix stay open questions until that changes.
- **Agents don't read `timeline.html`, raw NDJSON or unchanged fixed views.**
- **Follow-up reviews cover changed risks and earlier objections.** After two rounds exposing the same defect family, simplify the design before patching again.
- **Bots: reachability, conservation, recipe effort, empty travel and the perfect-route floor.** They give no fun score. An LLM player is no judge of enjoyment.
- **External methods:** hypothesis-led observation, light RITE and severity × frequency are the right borrowings. Population analytics, RL agents and a live LLM controller are not.

### Disagree, or push further

| # | Sol says | I say | Why |
| --- | --- | --- | --- |
| D1 | Rank the attention list by player impact; group repeated hitches into one representative. | **Split the pack into two reports**, a *play debrief* and a *health report*. On a non-exclusive run, unjudged hitches get **one line and no strips**. The exceptions are hitches attributed to streaming over 33 ms (the owner's rule) and errors or holds. | Ranking still puts hitches and notes in one list for one reader. The designer and the perf engineer ask different questions. Reading noise the pack itself says it can't judge is the single largest waste in today's packs. |
| D2 | REC-2: about ten changes (semantic IDs and target/outcome on every event, UI and cue telemetry, semantic compare, wandering bots, coverage manifest, regression replays, journey tables, per-minute bins, traces, a shared driver). | **Cut REC-2 to what changes a design decision for one owner playing a few hours** (§4). Defer journey and funnel tables, semantic compare, the coverage manifest, wandering bots and traces until a real question needs them. Keep the shared driver for stewardship reasons, not feedback reasons. | With n = 1 and a branching opening, a funnel table restates what the owner can say in one sentence. Each of these items is reasonable alone. Together they're the "pipeline that makes more pipeline" the owner asked us to avoid. |
| D3 | Label canvas-only recordings; explore full-page capture only if the owner wants it. | **The first playtests need the HUD and sound now, at zero engineering cost:** the owner runs ordinary screen recording (OBS or Win+Alt+R) alongside the game's export. The recording header's wall-clock origin (`startedAt`, `pageOrigin`) lines the two up. In the game, add a **text context snapshot at each note** (active lead, open panel, last toast, HUD objective, vitals). Text is cheaper for an agent than pixels. | Those are exactly the things the opening playtest exists to judge: leads, the journal, the HUD objective (OPENING-DESIGN: "General HUD direction is revisited in playtesting"). A canvas-only clip is blind there. Building in-game screen and audio capture is a large job for something the OS already does. |
| D4 | "Raw novelty rate is not enjoyment"; report semantic milestones. | Make it concrete: **split `new` into major and minor** in `analyseTimeline`. Major means a tool, craft, upgrade, area, story beat, decode, or a recipe that opens an option. Minor means a material picked up, a scan or a log line. **The 15–20-minute rule counts majors only.** Show minors as texture. | GAME-DIRECTION's rule names tools, areas, craft, discoveries and story beats. Without the split, a run of pickups satisfies the metric while the player feels nothing has changed. This is the cheapest way to make the drought list honest. |
| D5 | No equivalent. | **Add a tension trace:** the lowest of air, health and craft power (as a share), plus depth and threat proximity, drawn under the session ribbon. Close calls followed by relief (surfacing, docking, reaching the pod) are *good* moments; a flat line for an hour is a finding. | Tension and relief are half of GAME-DIRECTION's "atmospheric, with something to do". The 4 Hz samples already hold position and vitals, so this costs one chart. Bot vitals are managed perfectly, so this trace is meaningful only for human play. Say so on bot packs. |
| D6 | Guarantee strips for notes; look 30–90 s back before a note. | Agree, and make it a fixed artefact: a **moment card** per note. It holds the exact words; frames at −30, −10 and 0 s at usable size; the text context snapshot; the last major new thing and the time since it. One card is about 1.5 k tokens and replaces about 3 strips. | A designer reading a note wants "what were they trying to do, and what did they see". The card answers that in one look. |
| D7 | Fixed views are captured "every run" (current owner policy); read changed views only. | Agree on reading. **Propose to the owner** capturing only the affected subset at stream handoff (views tagged by region and system), and the full set at render-touching root merges and at wave end. | 143 views take 10–13 GPU minutes per run on a contended GPU lease. They detect regressions, but taste is judged once per wave anyway. That's a policy question for the owner, not a quiet shortcut (Sol is right on that point). |
| D8 | Keep three random control strips; read one relevant control. | **Generate one, and only for render- or content-touching changes.** | Same intent. Generating three per pack and listing them invites reading three. |
| D9 | The calibration factor needs per-leg owner calibration. | Also: **the owner isn't a blind first-timer**, since the owner designed the opening. Owner play gives a *lower bound* on a first-timer's time. Report a per-leg owner/bot ratio as a range for the legs actually played. The one cheap step up is **one outside blind tester for the opening** (a friend; the export is local-only and portable). | The 10-hour floor is about a blind player. Today the bot's full creel route is about 30 minutes of play (playthrough README). The factor is the most decision-relevant number we can't yet estimate, and the owner's own knowledge biases it downwards. |
| D10 | The fresh Sol reviewer independently tests the highest-risk claims. | **For a playtest debrief, no second reviewer.** One Opus reader produces the debrief, and the owner answers its questions; that is the check. Sol reviews the *code fixes* that follow. | Reviewing a design reading with another agent is the redundant check the owner named. The owner is the ground truth and is in the loop anyway. |
| D11 | A single `verdict` with `partial` explained in the unproven list. | **Two verdicts in `summary.json`:** `functional` (pass or fail) and `performance` (judged or not judged, and why). | Every shared run currently reads "PARTIAL", and every reader spends tokens finding out it's fine. |

---

## 3. Consolidated options

Token figures assume about 4 characters per token for text and about 1–1.5 k per image (Sol's planning allowance; not measured). "Today" means a reader who follows the README on a shared-run pack: summary, a 2–4 k story, and 6–10 strips, about **10–18 k per pack**, most of it hitches.

### A. Minimal: reading habits plus small REC-1 fixes
- **What:** the D1 split *inside today's story* (unjudged hitches become one line with no strips), D11's two verdicts, the pacing section suppressed on scripted traversal and on runs under 15 minutes, one control strip (D8), and the reading habits in §4 "Do now".
- **Builder time:** about half a day of Opus on REC-1, plus one focused Sol pass on the analysis change.
- **Tokens per pack:** bot or traversal about **2–4 k**, usually with no images. Owner playtest about **4–8 k** plus whatever notes need.
- **What it buys:** most of today's waste goes away. It adds **no** new design signal: notes still get ±2 s strips of a HUD-less canvas, and pacing is still the motion heuristic.

### B. Recommended: A, plus a play debrief in REC-2, plus the owner protocol
- **What:** A; then REC-2 builds the **play debrief** from `analyseTimeline` (D4 major/minor), the **session ribbon** with the tension trace (D5), **moment cards** (D6) fed by a **note context snapshot** (D3), and a **friction list** (deaths, repeated refusals, impacts without progress, near-empty air or power). Add the owner playtest protocol (§4) with OS screen capture. Delete the `analyse.mjs` pacing heuristic in the same merge.
- **Builder time:** about 2–3 Opus days in REC-2 (analysis and pack about 1.5, the note context snapshot about 0.5 with the UI owner, the major/minor tag about 0.5 with the timeline owner), plus one Sol review round.
- **Tokens per pack:** bot about **2–4 k**. Owner session of 1–2 hours: debrief about 2 k, ribbon 1 image, about 1.5 k per moment card. With 10 notes that's about **18–20 k** for the whole design reading, and that reading produces the action list directly.
- **What it buys:** the owner's notes become a precise, short action list. Droughts are honest. Tension and relief become visible. The owner answers about 5 questions instead of rewatching footage.

### C. Ambitious: B, plus outside testers and richer capture
- **What:** B; one or two outside blind testers for the opening and first expedition; opt-in in-game page, HUD and audio capture; semantic UI and cue presentation telemetry; journey tables per opening thread; build-to-build compare by milestone; seeded wandering bots around changed areas; regression replays from observed traps.
- **Builder time:** about 1.5–2 extra Opus weeks spread over REC-2 and REC-3, plus tester scheduling (owner time).
- **Tokens per pack:** similar per pack to B, but there are more packs.
- **What it buys:** real first-timer time and comprehension (the testers are worth the most here), and trap coverage. The capture and telemetry pieces mostly duplicate what B plus OS recording already gives. **Take the testers from C; leave the rest until a real question needs it.**

---

## 4. Recommended plan (B, plus outside testers when the owner is willing)

### Do now: REC-1 fixes and reading habits
1. **Two verdicts** in `summary.json`: `functional` and `performance: judged | not judged (shared run)`.
2. **No strips for unjudged hitches.** On non-exclusive runs, long frames are one line ("30 over 33 ms, worst 917 ms, not judged"). They get strips only when attributed to streaming over 33 ms, or for holds and errors.
3. **Suppress the pacing section** on scripted traversal and on runs under 15 minutes, and print why. Don't invest further in the `analyse.mjs` heuristic; REC-2 replaces it.
4. **One random control strip**, generated only when the run's commit touched rendering or content.
5. **Reading habits (coordinator, builders, reviewers):**
   - Before opening a pack, write at most **three questions** tied to the change.
   - Read `summary.json`. If the run is functional with performance not judged and has no errors, stop unless a question needs pictures.
   - **Image budget:** zero by default for logic changes; 2–4 for visual or content changes; 6–10 only for a stage exit or a named risk.
   - **A Sol reviewer reads a pack only for visual, content or experience changes.** Otherwise the summary is enough.
   - **Read one machine's pack**, and only the summary of the other.
   - **Findings:** at most five, each one line: scene and time → what was seen → player consequence → fix. Mark each as observed, inferred or a question for the owner.

### Do in REC-2, in this order. Items 1–4 must land before the first owner playtest (right after OP-1).
1. **One pacing model.** The pack calls `analyseTimeline` on the timeline events embedded in the recording, or on the attached timeline export. Delete the `analyse.mjs` pacing heuristic in the same merge. The playthrough's own leg timeline stays for routes; for pacing it reads the same analyser.
2. **Major and minor new things** in `src/sim/timeline/report.ts` (timeline owner). The drought rule (`newGapMinutes`) counts majors only.
3. **A note context snapshot.** When the feedback key is pressed, the event carries the active lead, open panel, HUD objective, last toast, vitals, depth, craft and region, as text.
4. **The play debrief** (`debrief.md`, under 2 k tokens) plus `ribbon.png`:
   - **The ribbon:** the play-time axis; bands for travel by craft, gathering, idle and menus; pins for major new things, minor ticks, notes, deaths. Under it, the tension trace.
   - **The top three droughts:** each with what filled them, its region, and any note in it.
   - **The friction list:** deaths and their recovery, repeated refusals, impacts without progress, and close calls followed by relief.
   - **One moment card per note**, plus at most three machine-flagged moments.
   - Health stays in a separate `health.md` that the design reader doesn't open.
5. **Later, only when a question asks for it:** the shared driver (planned anyway, for stewardship), semantic compare, wandering bots, coverage manifest, traces.

### Stop doing
- **Generating or reading strips for hitches the pack itself doesn't judge** (shared runs, "outside the game's frame").
- **Reading pacing shares from traversal or short runs,** or quoting a bot's travel share as a pacing finding.
- **Reading both machines' packs in full** for the same scene, and reading all three random controls.
- **Sol re-reading a pack the builder already read** when the change isn't visual or experiential, and any second-agent review of a playtest debrief.
- **Opening `contact-sheet.jpg`, `analysis.json`, the charts or `timeline.html` by default.**
- **Re-measuring recorder overhead.** The handoff's 0.30 ms per frame (interval −0.13 to +0.73) is settled for now. A cheap self-time line stays in the summary; re-measure only if the recorder's capture path changes.
- **Treating any count as a fun score:** pack verdict, event count, travel share, bot completion.

On Sol's process stop-list (full fast-tier reruns by reviewers, unbounded guard hardening, timing loops, provenance inventories): **agree with all of it.**

### Playtest protocol for the owner

**Before (coordinator, about 10 minutes):**
- Build at a named SHA. The 4070 check has passed (per DIRECTION), and the tour soak is clean.
- A fresh New Game, or a named save for later segments.
- Recording on in playtest mode; the feedback key works and its notes show on screen.
- **No focus questions for the owner.** Telling the owner what we're watching for changes how they play.

**During (owner):**
- Start your usual screen recorder with game audio (OBS or Win+Alt+R). That gives us the HUD, menus and sound.
- Play the way you'd play at home, in uninterrupted sessions of about 60–120 minutes. Don't narrate.
- Press the feedback key whenever something strikes you. One word is enough. An optional first character makes sorting exact:
  - `?` lost or unsure where to go;
  - `-` this feels like work;
  - `+` loved this;
  - `!` bug or looks wrong;
  - `~` anything else.

  A plain note is fine too.
- When you stop, export (the flight zip, which includes the timeline), and type one note saying why you stopped: tired, done for today, bored, stuck or crash.

**What gets recorded:**
- The game's flight recording: 12 fps canvas video, 4 Hz samples, events, timeline, notes and their context snapshots.
- Your OS screen recording with HUD and audio.
- Nothing leaves the PC until you hand it over.

**Afterwards (agents, one task, same day):**
1. **One Opus playtest reader** reads `debrief.md`, the ribbon and the moment cards. It opens your OS recording only at note times, where HUD or sound matters.
2. It produces **one page for you:**
   - **What worked:** the `+` notes and the strongest relief moments.
   - **The top 3–5 problems:** observed → consequence → proposed root fix.
   - **At most five questions** that only you can answer, each anchored to a time. For example: "At 34:10 you circled the station three times without opening the log. Were you looking for something?" Plus three fixed ones: where you wanted to go next; where progress felt like work; which moment made you want to continue.
3. **You answer in about five minutes,** by text or voice.
4. **The coordinator** turns the answers and findings into stream briefs. Health anomalies go as a separate short list to the owning streams.
5. **After the first session,** the per-leg owner/bot time ratio is reported as a lower bound on first-timer time.
6. **Fixes are checked** at your next session, RITE-style. Your replay checks the fix, not first-time discovery.

---

## 5. Proposed changes to DIRECTION.md rules

Each needs the owner's approval; nothing is changed here.

1. **Tiered evidence.** Current rule: *"agents read `summary.json`, then `story.md` (with its attention list), then only the frame strips for flagged items. The budget is about 6–10 strips per review."*
   **Proposed:** *"Agents start from at most three questions, read `summary.json`, then the play debrief or story, then only the images that answer a question: none by default for logic changes, 2–4 for visual or content changes, and 6–10 as a ceiling for a stage exit or a named risk. Hitches the pack doesn't judge get no strips."*
2. **Fixed-view visual regression.** Current rule: *"every run, or a short `gpu` job, captures a fixed set of camera views and compares them with the last accepted baseline per machine class."*
   **Proposed:** *"Stream handoffs capture the affected subset (views tagged by region and system). Root merges that touch rendering or content, and every wave end, capture the full set."*
3. **Taste review once per wave.** Current rule: *"an Opus agent reviews the fixed-view contact sheet against GAME-DIRECTION after each wave of work."*
   **Proposed:** add *"together with the latest owner playtest's moment cards; the owner's notes outrank the contact sheet."*
4. **New rule under Evidence reading:** *"A playtest debrief is read by one Opus agent and checked by the owner's answers, not by a second agent. Sol reviews the code fixes that follow."*
5. **For GAME-DIRECTION (owner-confirmed, so flagged rather than proposed).** Current rule: *"A first-timer's time is estimated as the bot's time times a factor calibrated from the owner's play."*
   **Suggested note:** the owner's play gives a lower bound. Calibrate per leg as a range, and use one outside blind tester for the opening if possible.
