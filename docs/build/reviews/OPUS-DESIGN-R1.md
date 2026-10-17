# OPUS-DESIGN-R1 — early project, gameplay-loop and visual critique

Advisory, owner-requested, 2026-10-17. **Not** a technical acceptance, not the later full-campaign Astra design critic, not a human playtest. Spoiler-free; a labelled spoiler appendix is at [`docs/spoilers/reviews/OPUS-DESIGN-R1.md`](../../spoilers/reviews/OPUS-DESIGN-R1.md).

## Identity, baseline and limits

- **Model:** Claude Opus 5.5 (`claude-opus-5-5`), confirmed by the runtime's model identity. **Effort:** `high` was requested. The runtime gives me a reasoning-effort value but does not label it with the catalog's `high`/`xhigh` names, so I cannot independently confirm that the effective setting was `high`. Treat effort as **requested, not self-verified**. No children, delegation or peer polling.
- **Starting parent:** `a5260c9edcbdb46b51b6533aae879664b43030fd`, clean. `git diff 47d8872..a5260c9` touches only `docs/build/**`, so production equals `47d8872942e95120241af014e667084c75a54e39`. A fresh build exported from `47d8872` produced `index-quvrvcD6.js`, SHA-256 `0ab8a47a1a93f03f122a648fdda7c10834a03e27b2575b52489b60fd464a4122`, which matches STATUS.
- **Prior knowledge / order:** I am a fresh agent with no earlier exposure to Siltwake. I read AGENTS, STATUS, PLAN, the revised input, the settled map and the six specification documents **before** looking at images, so this is not a blind first impression. Order: spec → 26 retained captures + 4 clip contact sheets → evidence report M1-COMBINED-EXPEDITION → source code (render, survival, progression, registry, view) → research/critic brief → **then** spoiler canon → bounded live play. I did not open technical R2 peer reports.
- **Renderer:** all retained and live images come from headless Chromium 154 on `factory-worker`, ANGLE/SwiftShader, DPR 2, muted. I heard no audio. No GPU-performance, motion-smoothness or audible-mix claim.

## Assessment in one page

**What exists now.** A competent, honest, *safe* first expedition: wake → four pod checks → repair pod with reef glass/membrane and workshop alloy → restore the island workshop → build a Dart → scout down to the Upper Lantern Canopy lab → evade a sound hunter → return, store, service, reload. Systems are coherent and unusually trustworthy. Conservation, refusals, save/reload and recovery are exact. The notebook separates observation from hypothesis, the clue prose is restrained and specific, and the reef-to-island first loop gives the player a real two-way choice.

**What it does not yet deliver** is the owner's stated experience: *wonder first, richer cel, vibrant colour, detailed authored environments*. Production frames look markedly flatter and paler than the selected reference, and the cause is concrete and cheap to change (OD-01). Where the reference has authored detail, production often has world-space text labels and box primitives. The first deeper destination, the Canopy, which should be the first big reward, reads emptier than the starting shallows. The single wildlife encounter has a free, unlimited dominant counter, and its warning is mostly text. Inventory transfers outnumber collections on the recorded first run.

**Biggest risks to the intended game:**

1. **Visual identity drift.** The richer-cel decision is being implemented as "pastel fog + primitives + labels". Without a correction now, every new region in M2 will inherit that baseline.
2. **Tension without a creature, wonder without a vista.** Danger and destination are both communicated mainly through HUD text.
3. **Checklist mystery.** Each early lead names the next site and the required preparation; good prose still risks feeling like a quest log.
4. **Menu logistics as the loop.** Buoy/hold/locker shuffling and three-material recipes are already the most repeated activity.
5. **Process cost.** About 106 commits since M0 acceptance, 23 of them touching `src/`; about 130k words of build records against about 9k lines of TypeScript. Verification is excellent but has absorbed most of the day. No equivalent gate has looked at whether the game is beautiful or interesting (§ Process).

## Coverage

| Kind | Artifact (exact path) | Provenance |
| --- | --- | --- |
| **Personally played** (bounded, ordinary inputs) | New expedition → all 4 pod checks → notebook (J) → walk to deck edge → W/C dive and left turn to 7 m at the reef ribs. Saved: `/tmp/siltwake-opus-design-r1/live-00-opening-check1.png`, `live-01-opening-check4.png`, `live-02-reef-7m.png`, `live-03-notebook.png` | Production `47d8872`, own build, port 5197, incognito tab `tab_29_…`. About 90 s of play; page-local synthetic key events; no injection or teleport |
| Inspected image (expedition) | `/tmp/siltwake-m1-combined-expedition/media/01-initial-menu, 02-orientation-deck, 03-ramp-orientation, 04-prepared-fabrication, 05-cockpit-shallow, 06-canopy-warning-cockpit, 07-lab-record, 08-return-locker, 09-reloaded-workshop, 10-island-first-intake .png` | Source `4d0a7f0` (production-equivalent for these views; see below) |
| Watched (contact sheets I derived, 4 frames each) | `/tmp/siltwake-opus-design-r1/contact-01-opening-pause.png`, `contact-03-east-after-cradle.png`, `contact-04-canopy-warning-quiet.png` from the matching `.mp4` | Same source. Clips 02 and 05 contact sheets were generated but **not viewed** |
| Inspected image (render) | `/tmp/siltwake-m1-render/captures/after/{reef,island,podOutside,podSide,dartQuarter,dartPilot,dartDeep,hunter,labIn,labOut,carrierBay,carrierSurface}.png`; `hunter-comparison.png`, `dart-comparison.png`, `canopy-motion-contact.png` | Source `6ea44ce`, art-staging cameras, not earned play |
| Inspected image (carrier) | `/tmp/siltwake-m1-combined-carrier/captures/f2-creel-nonzero-heading-pane.png` | Seeded diagnostic fixture |
| Inspected image (reference) | `/tmp/siltwake-m1-batch-r1-astra/reference-reef.webp`, `reference-scout.webp` | Art study `20711d1` |
| Inspected image (recovery UI) | `/tmp/siltwake-m1-batch-r1-occupancy-fix/media/01-occupied-hold-disabled.png`, `04-safe-exit-recovery-available.png`, `05-unoccupied-salvage-return.png` | Author `d99aa649`; retained in `47d8872` |
| Read (code at `47d8872`) | `src/render/{palette,atmosphere,materials}.ts`, `src/sim/survival.ts` (threat), `src/sim/step.ts` (distraction), `src/sim/progression.ts` (recipe gating), `src/content/registry.ts` (opening, C01–C04, recipes), `src/ui/view.ts` (notices, opening, recovery panel), `src/runtime/session.ts` (autosave); `20711d1:…/art-prototype/main.js` (reference fog/outline) | — |
| Read (docs) | AGENTS, STATUS, PLAN, CONTRACTS headings, revised input, map, EXPEDITION_INTEGRATION, WORLD_PROGRESSION, FLEET_AND_SURVIVAL, STORY_DESIGN, GRAPHICS_PIPELINE, DELIVERY_AND_ACCEPTANCE, BROWSER_RULES ×2, `tasks/OPUS-DESIGN-R1.md`, `research/04-game-design-review.md` incl. critic brief, CONTENT_MANIFEST, `evidence/M1-COMBINED-EXPEDITION.md`, spoiler canon (privately, after the player-facing pass) | — |
| **Not inspected** | Audio (muted everywhere); clips 02/05/06/07 and `lab-entry-contact.png`; `11-invalid-save`, `12-disabled-hull-panel`; render `podBack`, `hunterUp`, `carrier{Aft,Fore,Outside,Side,SurfaceOutside}`, `bay-comparison`, `canopy-up-frame`; carrier f0/f2/f3 other frames; recovery 02/03/06; PLAYTEST.md; most evidence/integration reports; all technical R2 reports (excluded by assignment); any Dart piloting or Canopy visit in live play | — |

**Currency check.** Render captures are from `6ea44ce` and expedition captures from `4d0a7f0`. The later correction commits touched recovery, boundary saveability and the mesh cache. I re-read the current fog, palette, cel shader, threat and opening code at `47d8872`, and they produce the same frames. My live captures at `47d8872` match the retained look. No criticism below relies on a defect that has since been fixed.

## Strengths to preserve

- **S-1 Trustworthy systems.** Refusals consume nothing, every container is exact, saves keep a backup generation, pause stops drain, and recovery never destroys knowledge. Few survival games ship this clean. Keep the invariants; just stop narrating them to the player (OD-07).
- **S-2 Notebook epistemics.** *Observed / Hypothesis / Regional lead / Source*, plus "Either early lead can be investigated first" (`live-03-notebook.png`). This is exactly the Outer Wilds-style log the research recommends.
- **S-3 Clue voice.** The C01–C04 prose and Mara's note ("Start with what the fans are doing. The instruments can wait. The water will not.") are specific, physical and humane. That is the right register.
- **S-4 Source logic.** Glass exposed by grazers, membrane caught downstream of filter fans, crust on grounding fins, resin in lee pockets. Geology and ecology explain resources, as the owner asked.
- **S-5 The reef-rib underwater frame** (`live-02-reef-7m.png`, `10-island-first-intake.png`). Two tall ribs, a fish school with clean silhouettes, caustics on sand. The game's mood is already visible here.
- **S-6 Island workshop under sun** (`09-reloaded-workshop.png`). Warm sand, broad paddle-leaf fronds and an ochre accent read as a refuge. This is the warmest place in the build.
- **S-7 The opening reveal through the pod door** (`live-01-opening-check4.png`). The island framed by the doorway is a good composition. It is currently covered by a text card.
- **S-8 Menu/brand typography.** The serif title, tagline and "Follow the light. Learn the shore." on the menu (`01-initial-menu.png`) are tasteful and coherent.
- **S-9 Fleet and recovery design.** Hull niches that never obsolete each other, carrier as staging not key, Bobbin's limits and "recoverable loss without duplicate advanced ships" are well reasoned on paper and should not be simplified away.

## Ranked findings

Types: **D** observed defect · **A** aesthetic judgment · **I** design inference · **H** human-test hypothesis. Priority P1 (highest) → P3.

### OD-01 · P1 · high confidence · D+A — Atmosphere is about 5× denser and less saturated than the selected reference, and ink outlines were dropped

- **Scene/artifact:** every underwater and surface frame; compare `reference-reef.webp` with `render/after/reef.png`, `island.png`, `06-canopy-warning-cockpit.png`, `hunter.png`.
- **Observation (code):** The reference `20711d1` uses underwater fog density `0.0048`, surface `0.0028`, haze clamped to **0.94**, and `renderOutline` ink edges (`#163e46`, width `.022–.025`) on hero meshes. Production `materials.ts` uses `0.027` (`0.017` east of X65), clamps haze at **0.9999**, and has **no outline/edge rendering anywhere** in `src/`. Half-visibility underwater is about **26 m** in production (41 m east) against about **144 m** in the reference. The 0.9999 clamp lets distant silhouettes vanish completely; the reference's 0.94 always keeps a ghost of the shape. `palette.ts` is pastel (sand `#b5ccb0`, porcelain `#e5e8ce`), and dry-air haze is pale mint `#96c5b9`, which washes the sky to cream-green (`02-orientation-deck.png`).
- **Player consequence:** Little is readable beyond about 30 m. Landmarks cannot pull the player, the Canopy is an empty blue field at the Dart's camera, and creatures appear only at close range. "Vibrant colour" and "wonder first" are not on screen.
- **Change/tradeoff:** Restore reference-class optics as a per-region/depth table: reef about 0.006, canopy crowns about 0.009, lower channel and deeper about 0.02+ for deliberate tension. Clamp haze at ≤0.94. Re-enable ink outlines (merged hero meshes only: craft, pod, landmarks, creatures, resource hosts) as the main readability tool. Raise saturation of accent slots. The cost is fill rate on SwiftShader and less hiding of sparse content. That second effect is desirable, because it exposes emptiness that should be authored instead.
- **Verify:** re-capture the 12 `render/after` cameras plus Canopy at Dart helm, paired with the reference cameras. Check that a landmark is identifiable at 60–100 m and the lower channel still reads as threatening.

### OD-02 · P1 · high · D+A — World-space text labels stand in for authored signifiers

- **Artifact:** `dartQuarter.png` ("DART / CLEAR CRADLE", "SPLITSPINE / WORKSHOP"), `labIn.png` ("UPPER LAB / AIR", "SAMPLING / UPPER CANOPY"), `07-lab-record.png`, `09-reloaded-workshop.png` ("LOADING LEDGER"), `carrierBay.png`/`carrierSurface.png`/`f2-creel…` ("DRY / ISOLATED", "BRIDGE", "SERVICE BERTH"), plus small unreadable plaques at distance (`island.png`).
- **Observation:** Large sans-serif signs in bright cream on dark panels act as the primary identifier of function. They are often the largest, highest-contrast element in frame.
- **Consequence:** Breaks fiction, flattens discovery into a labelled diagram, and draws the eye away from the actual objects. Interaction prompts already name things, so the signs mostly duplicate the prompt.
- **Change:** Use shape language and lighting: a cradle silhouette with amber guide lights, an airlock with a lit threshold and pressure placard, a ledger with a lamp. Keep small diegetic stencils (code + icon, about 1/5 current size) for flavour. Leave names to prompts/notebook. Carrier fixture labels may stay while it remains a diagnostic.
- **Verify:** from the same cameras, a reviewer who has not seen the label can say what the cradle/airlock/ledger is. Prompt text still identifies them.

### OD-03 · P1 · high · D+I — The first deeper visit (Upper Lantern Canopy) is visually emptier than the start

- **Artifact:** `06-canopy-warning-cockpit.png` (84 m, nothing in frame), `dartDeep.png` (flat green slab, a tan lumpy node), `labOut.png` (dark field, thin stalks), `canopy-motion-contact.png`, `labIn.png` (open-fronted box room).
- **Observation:** "Lantern Canopy" has no lanterns. There is no light source, crown silhouette or vertical layering visible from the helm. The lab is a dollhouse box with its front wall missing.
- **Consequence:** The Dart's first reward, a new region, lands as darkness plus a HUD warning. Reward anticipation inverts: the reef at 7 m is the visual high point.
- **Change:** Author the Canopy as a *vista*. Glowing float bladders form a ceiling of soft lights, crowns are readable at 80+ m with OD-01 optics, the lab hangs with lit windows as a beacon, and a clear-flank/lower-channel colour split is visible on approach. Give the lab a real envelope (walls, porthole light spill) so entering it is a threshold, not a stage set.
- **Verify:** the Dart descent clip from the cradle to 84 m shows the destination silhouette before arrival, and a naive viewer can point to "where to go". Capture once at the same camera before and after.

### OD-04 · P1 · high · D+I — Hunter encounter has a free dominant counter, and the warning is text-first

- **Code:** `step.ts` "distraction" costs nothing and is reusable as soon as the previous one ends. `survival.ts` makes any active distraction (or more than 1 s of cover) force `disengage` at once. The warning notice prescribes the answer ("Slow down, use the tall rib as cover, or release a distraction"). The notebook explains Z/G/cover before the player has met the animal (`live-03-notebook.png`).
- **Artifact:** `06-canopy-warning-cockpit.png` and `contact-04` show the banner "SOUND HUNTER · NE · investigating — Z quiet / G distraction" with **no creature on screen**. `hunter.png` shows a frontal silhouette that reads as a faceted box with two yellow horns. The side view (`hunter-comparison.png` left) is much better.
- **Consequence:** There is no decision: press G. Tension is delivered by UI, not by seeing and hearing an animal. "Noise/light/cover/decoys create choices" is not yet true.
- **Change:** Give distraction a cost: reserve-cell charge, or a recharge period *after* it expires. That can reuse `distractionSeconds` as a negative/recharge phase so no save-schema change is needed. Shorten notices to the cue ("Low paired call · NE"), and move the counters to the notebook **after** the first encounter. Make the warning pose visible: the hunter rises into view, flares its warning fins, and you hear the call. Its idle home should sit in a sightline from the approach. Fix the frontal silhouette (a long, low head, not a box).
- **Tradeoff:** Slightly more failure early. Recovery is solid, so that is affordable.
- **Verify:** an ordinary-input encounter where the player sees the animal before the banner. Repeating G immediately is refused or costly. Count how often cover vs distraction vs retreat is chosen in a short human session (H).

### OD-05 · P2 · high · D+A — Cockpit is primitive and permanently occluded

- **Artifact:** `05-cockpit-shallow.png`, `06…`, `dartPilot.png`, `dartDeep.png`, `contact-03`.
- **Observation:** Two box handles on orange sticks and a plain console box take about 40% of the screen. The prompt "E Clear side exit · suit 150 m / hull 180 m" is shown **continuously at screen centre while piloting**. Power/hull appear only in a HUD card. The reference Dart (`reference-scout.webp`: orange/white livery, offset blister canopy) is not what the pilot sees.
- **Consequence:** The precise-mechanical side of the art direction is absent where the player spends the most vehicle time, and the centre of the view always carries text.
- **Change:** Lower the dash line. Put depth/power/hull as diegetic gauges on the console (keep the HUD as a fallback or accessibility option). Show the exit prompt only when speed ≈ 0. Match the canopy frame to the reference blister and livery.
- **Verify:** helm capture with an unobstructed centre third. Gauges are legible at 1080p while moving (motion clip).

### OD-06 · P2 · medium-high · D+I — Inventory transfers dominate the first loop

- **Evidence:** M1-COMBINED-EXPEDITION: 25 collections, **31 transfers** (124 units moved, items moved several times: membrane 16→buoy, 14→pod), 8 recipes. Hold 16 CU. Recipes `pod_repair`, `essential_tools`, `suit_150`, `restore_workshop`… each cost the same three materials in 1–2 unit amounts (`04-prepared-fabrication.png`). `08-return-locker.png` shows the transfer UI's density.
- **Inference:** The agent's route may not be optimal (H). Still, a 16-CU hold plus a separate buoy container plus site-specific benches creates sorting work without decisions. Near-identical recipes teach nothing about materials, which is the failure Cleveland names in research S1.
- **Change:** Let fabrication draw from every container within the refuge radius, including an adjacent buoy and a docked Dart. Add "Store all materials" at lockers. Give each early recipe a *signature* ingredient tied to its function (suit = membrane-heavy, workshop = alloy-heavy, scanner = glass) and fewer total steps before the Dart. Keep the buoy as an expedition tool, not a prerequisite shuffle.
- **Verify:** rerun the same earned route and compare transfer count and menu time. Target transfers ≤ collections. Human: ask what they deferred and why (R3).

### OD-07 · P2 · high · D — Player-facing text uses implementation/accounting language

- **Artifact:** `05-unoccupied-salvage-return.png` ("Public frame investment returned once. Bound patches returned to maintenance, never public purchases."); `01-occupied-hold-disabled.png` (four dense paragraphs before the buttons); `04-prepared-fabrication.png` ("Craft cargo is not a bench ingredient source: transfer it first. A refusal consumes nothing."); the in-world "Upper-Canopy survey boundary… that route is not yet open" notice.
- **Consequence:** Recovery, the moment where the game must invite another attempt, reads as a terms-of-service page. "Public/maintenance/bound" is a second economy the player never asked for.
- **Change:** Rewrite recovery as three option cards: **Patch here** / **Tow home** / **Strip and rebuild**. Each shows cost, what you get back and travel, plus one sentence of fiction. Hide the maintenance ledger, or name it diegetically ("rescue stock"). Delete "A refusal consumes nothing" from player copy; the invariant is a test, not a message.
- **Verify:** a reader-level check (each card ≤ 2 lines) plus a human: "what will happen if you press this?"

### OD-08 · P2 · high · D+A — Opening tells urgency while the screen says "safe"

- **Artifact (live):** `live-00-opening-check1.png`. The "Pressure alarm. Upward motion…" card appears over the full live HUD: **0.0 m depth, "On foot", "Safe air · gradual healing"**, a "Hold/Notebook/Fabricate/Save" bar and the toast "Expedition saved. The island shore and reef ribs are yours to explore." Checks 2–4 reframe the camera, which is good, but the scene is static and the card hides the lower half of the reveal (`live-01…`).
- **Consequence:** The only authored drama in M1 is undercut by its own UI before the first input. The specified ~90 s in-engine sequence is a four-card prompt.
- **Change:** Hide the HUD and toolbar during phases 0–3. Suppress the "Expedition saved" toast until phase 4 completes. Add camera roll/shake and dim/flash lighting in phases 0–2 (render-only, no state change). Move the card to a compact lower-third caption and let the final door reveal play uncovered for a beat.
- **Verify:** four live captures at the same phases. No vitals or "safe" text before standing up.

### OD-09 · P2 · medium · I — Leads read as a next-objective chain

- **Code:** C01 lead → intake; C02 lead → workshop; C03 lead → "Investigate the buoyant crowns east… prepare a 150 m suit and return power"; C04 lead → Pale Basin "needs reinforcement and service preparation". Notebook "Recovered research: 1 / 5".
- **Inference:** The first fork (reef or island) is genuine. After it, each record prescribes exactly one next site *and* its loadout, and a counter frames clues as collectibles. That pushes the mystery toward a checklist, against STORY_DESIGN's "a reason to investigate, not an errand".
- **Change:** Phrase leads as observations with a place ("Survey dishes on the lower crowns all face south-east"), and keep preparation advice in the dive brief/hint tier. Replace "1 / 5" with open questions ("Why were departure supplies unused?"). From C03 onward, offer two physical leads.
- **Verify (H):** after C03, ask a fresh player what they want to find out and where they would look, before showing a hint.

### OD-10 · P2 · medium · A — Refuges are not yet warm

- **Artifact:** `podSide.png`, `podOutside.png` (cool grey/cream boxes, a flat green regulator panel), `labIn.png`, carrier bridge.
- **Observation:** Interiors use the same cool palette and flat light as the exterior. There is no lamp pool, warm accent or soft texture. The island workshop (S-6) is the only warm space, and it gets that from the sun, not the interior.
- **Change:** Give every refuge a warm interior key light (palette `warm #ffdda0` exists but is used only as thin vertex-colour trim strips in `landmarks.ts`/`expedition.ts`, never as light), one soft object (bunk, blanket, mug, plant), a window framing live sea life, and an "air restored" audio/visual settle. This is cheap and directly serves "comforting refuges".
- **Verify:** pod/lab interior capture side by side with an underwater frame; the temperature contrast is obvious without text.

### OD-11 · P3 · medium · A — Organic forms are under-authored relative to mechanical ones

- **Artifact:** `dartPilot.png` (green lumpy spheres floating at the surface), `reef.png` (fans good; ribbons are flat tubes), `hunter.png`.
- **Observation:** The fans, fish and fronds work. Floaters, bladders and the hunter's front read as inflated primitives. The reference organic pieces (red fans, tall kelp ribbons, the finned fish at top right of `reference-reef.webp`) are more characterful than the production versions.
- **Change:** Port the reference ecology generators more literally, then iterate. Give each species one memorable silhouette feature visible at 40 m with outlines (OD-01).

### OD-12 · P3 · medium · D — Small copy/compass error remains

EXP-2 from the expedition evidence ("move north beyond the amber rails" while the compass shows S) is still in `view.ts`. It is cheap; include it in the presentation slice.

## Answers to the six questions

**1. Integrated expedition loop.** Traced on the actual run: *question* (why is the pod damaged?) → *preparation* (glass/membrane/alloy, suit 150, reserve cells, buoy) → *habitat* (grazed ledge, fan lee catch, workshop scraps; then canopy fins and resin lee) → *blueprint/capability* (pod repair → tools → suit → workshop → Dart) → *discovery* (C04 lab) → *return* (store crust/resin, service, reload). The interesting choices are the first fork (reef or island), where to park the Dart, and quiet versus loud near the hunter. Shopping and menu work are the eight similar recipes and the 31 transfers. The successful return produces crust/resin and the Pale Basin lead, but M1 cannot yet *spend* them, so the "return changes the next expedition" beat is a promise. **Recommendation:** in M1, let the returned crust/resin immediately buy one visible capability, for example a Dart sonar ping that outlines nearby landmarks through fog, or a quieter thruster that makes the Canopy safer. That closes the loop the player just ran.

**2. First-expedition flow.** A clear safe action exists (pod is safe, repair it), and the voluntary goal is decent: two visible landmarks, a two-option question. Routes are physically readable at the reef. The Canopy route depends on the lead text because the destination cannot be seen (OD-01/03). The Dart is a meaningful *mechanical* reward (speed, reach, hold, own air). Visually and emotionally it is undersold by the cockpit and the empty destination (OD-05/03). Comfort does punctuate tension mechanically (lab air, workshop, pod). Emotionally the refuges are not warm (OD-10), and the opening's tension is undercut by HUD and toast (OD-08).

**3. Campaign depth (design hypothesis, not duration).** Seven connected regions, two completion strategies and material-host logic are a sound skeleton. Risks:
- *Optional hulls without unique sorties.* Hush and Spindle are framed as "improves approach". Unless each has at least one authored investigation that is clearly better done with it (story-bearing, not just faster), players will skip them and they become showroom pieces. Give each an exclusive *optional* investigation site, never required.
- *Carrier value in a compact basin.* At 2.0 × 1.8 km with 250–600 m legs, the pod/workshop is never far, so "mobile home" risks being comfort with no logistical pull. It earns its cost only if some expeditions are genuinely long, for example multi-site Divide/District trips where returning to the pod loses an established foothold. Validate in M2 with real craft speeds before furnishing it.
- *Late arrival.* Hearthline needs "several substantial expeditions" after acquisition. If its acquisition depends on Pale Basin plus workshop parts, the M2 plan should pin a target acquisition point and test from there, rather than discover in M3 that it lands in the last third.
- *Creel vs Mantle.* The upgraded-Creel route also reaches 800 m. Make sure Mantle's distinct mission (precise station-keeping at a heat/brine fixture, heavy repair interface) appears on *both* routes as an optional improvement, so carrier-route players do not see Mantle as "a worse Creel without a cabin".
- *Recipe sameness.* Early recipes already share three materials in near-equal amounts. With 39 planned recipes and 8 materials, enforce signature ingredients per function now.

**4. Survival, ecology and recovery.** *Legible:* oxygen %, tank seconds, hull/suit limits (shown in several places, sometimes too many), directional hunter warning with a visual equivalent, and return-reserve advice. *Choice:* currently weak (OD-04). Light and disturbance are specified but not implemented as choices. Quiet movement (Z) is real. *Recovery:* physically solvable and exhaustively proven. Emotionally, the panel (OD-07) invites reading rather than another attempt. The design (patch / tow / strip, knowledge kept) is good; the presentation needs to make one option feel like a short adventure ("Bobbin follows the tether line to the collar") rather than a ledger. Chore-spiral risk is low given the reusable kit, but untested with humans (H).

**5. Taste and visuals.** See the next section.

**6. Project judgment.** See § Process.

## Visual critique (aesthetic judgment, anchored in images)

The selected reference (`reference-reef.webp`) has a clear hierarchy. A **white/orange Dart and white pod** pop against **teal water**. **Red fans and yellow fish** give warm accents. A **terraced island with a lookout tower** is the landmark. **Ink outlines** hold every silhouette, and **long visibility** lets the ocean feel large. Production keeps the teal and the cel banding but loses almost everything else. The frames resolve to one mid-value mint-teal, with cream fog above the waterline and slate-blue fog below. Mechanical objects are boxes in the same desaturated slate as the water. The best production frames (S-5, S-6) are the ones where light and a living silhouette coincide.

Specific notes:
- **Palette:** Too many mid-value cool slots (`stoneLight`, `metal`, `steelLight`, `shade`, `mint`, `sand`) with similar luminance. Accents (`ochre`, `coral`, `amber`) appear as flat slabs, such as the orange intake plate filling the foreground of `10-island-first-intake.png`, instead of small high-value highlights on important things.
- **Lighting:** Cel bands are present, but with no shadowing, rim or key/fill contrast; the frame looks evenly lit. The sun disc exists but rarely composes a shot. Caustics on sand are lovely; keep them.
- **Fog:** OD-01. This is the largest single cause of the "assembled procedural primitives" impression, because silhouettes never get the chance to read as a whole.
- **Silhouettes:** Reef ribs are a strong landmark (segmented arch). Island is a good two-hump read but uniformly smooth. Hunter side view is good, front view is a box. Floaters are lumps.
- **Mechanical precision:** Pod and Dart detail exists in the reference generators but is not what the player sees. The pod reads as panels and boxes up close (`podSide`, `podOutside`). The cockpit is primitive (OD-05). The carrier fixture is legible as a diagram, which is correct for a diagnostic. Its interior shows the useful bones (berths visible through panes, a bridge window), and once labels are replaced and furnishing sockets used, it has real "living in a ship" potential.
- **Scale and composition:** Few frames have foreground/midground/background layering. The menu background and the opening door reveal are the exceptions and show the team can compose.
- **UI burden:** The HUD is clean typographically but heavy. Four boxed vitals, a five-button toolbar, a region title, two lines of key help and frequent centre-screen prompts at once. In the cockpit the HUD duplicates the console. Consider hiding food/health when full and showing vitals only on change or when submerged.
- **Coherent alien world?** Not yet. It reads as a tidy prototype of one. The ingredients for coherence are present in the reference and the specs.

**Ordered art improvements within richer cel** (do in this order; each is visible in one capture pass):

1. Optics table per region/depth at reference densities, clamp ≤0.94, warmer/saturated fog hues (OD-01).
2. Ink outlines on hero silhouettes, plus value hierarchy: hero objects lightest or darkest in frame, environment mid-value.
3. Port the reference pod, Dart livery and blister canopy, and the reference ecology pieces literally, then iterate. They were already approved by the owner.
4. Replace text signs with lit signifiers (OD-02). Give the Canopy actual lanterns and a lit lab beacon (OD-03).
5. Warm refuge interiors (OD-10) and a diegetic cockpit (OD-05).
6. Only then add density: more reef life, island terraces, detail props. Detail without steps 1–2 will read as clutter.

## Five most valuable next changes

| # | Change | Bucket | Shares a slice? |
| --- | --- | --- | --- |
| 1 | **Optics + outlines + reference-asset port** (OD-01, OD-11 partial; art steps 1–3) | Current M1 fix | **Slice A "M1 look & feel"**, render-only paths (`src/render/*`) |
| 2 | **Signifiers, Canopy vista, cockpit, warm refuges, opening presentation** (OD-02, 03, 05, 08, 10, 12) | Current M1 fix | **Slice A**, render + `ui/view.ts` presentation; no sim/save change |
| 3 | **Encounter choice**: distraction cost/recharge reusing existing threat fields, cue-only notices, visible warning pose (OD-04) | Current M1 fix | **Slice B "M1 play"**, small `sim/` + content copy; one focused regression test |
| 4 | **Loop friction & copy**: refuge-radius fabrication sources, store-all, signature ingredients, recovery option cards, lead phrasing (OD-06, 07, 09) plus one immediately spendable return reward | M1 fix (copy/UI) + small M1 economy change | **Slice B** |
| 5 | **M2 design: mission matrix and benchmark region**. One page mapping each hull to an exclusive optional sortie and each region to its vista + rule + threat. Take *one* region (Canopy or Pale Basin) to target art quality during M2 as the benchmark before skeletonizing all seven. Pin Hearthline's acquisition point and measure leg times with real craft speeds | M2–M3 design/implementation | Planning doc by root, then first M2 task |

**Human-playtest questions** (no agent can answer these): After the opening, what do you want to find out, and which landmark did you head for? At the hunter, what did you try first and why? Did the Dart trip to the Canopy feel like a reward? After a loss, did you want to go back, and what did you think the tow would cost? Which menu step felt like work?

Slices A and B can each be one Sol max task with bounded paths. Both leave the save schema unchanged. Slice A only needs paired before/after captures from fixed cameras plus one earned-route clip, not a new evidence matrix.

## Process critique

**Evidence.**
- `git rev-list d415436..a5260c9` contains 106 commits, 23 of which touch `src/`.
- `docs/build/**` is about 129,600 words. `src/**/*.ts` is about 9,000 lines.
- `docs/build/evidence` + `reviews` hold 57 files, and the first expedition has passed through assembly, combined validation, R1 pair, three corrections and an R2 pair within one day.
- The single combined-expedition evidence file is about 22 KB for one guided run.

**What that bought (genuinely valuable):** real defects caught before they reached players. Negative disabled-hull health made saves unexportable; occupied-recovery persistence; stale cache meshes; boundary saveability. Those would have been miserable bugs. The save/recovery guarantees should be kept.

**What it cost:** most of the day went to proving a narrow slice correct. None of the gates asked whether it looks like the chosen art or whether the encounter has a choice. The technical reviewers' remit (correctness/spec) meant visual drift from the reference passed every gate. The project's verification register has also leaked into the game's voice (OD-07): player copy explains invariants the way evidence reports do.

**Recommendations (practical, no new gates):**

1. **Move invariants into tests, not prose.** The codec/round-trip/conservation properties already have 153 tests. Prefer adding a property test per new invariant over a narrative evidence section. Cap author evidence at about one page plus artifacts.
2. **Right-size review to change size.** Keep the dual Astra/Sol gate at milestones and for new systems. For bounded corrections with a regression test, one non-author reviewer plus coordinator would save a full serial round each time. This is an owner rule, so it is listed as a decision below.
3. **Add an experience check to existing gates rather than a new gate.** Each batch touching render/UI includes 4–6 fixed-camera captures paired with the reference, and the coordinator looks at them against the art bible. Cost: minutes.
4. **Iterate look-and-feel fast.** Art is the cheapest area to improve and the most visible to the owner. Run Slice A as a short loop (change → fixed-camera captures → coordinator look) without full-matrix revalidation, because render-only paths do not touch persisted state.
5. **Benchmark region before breadth** (change #5). M2's skeleton-of-everything plan is right for the dependency graph. Without one region at target quality, M3 risks discovering that the asset pipeline (procedural TS primitives + DynamicTexture labels) cannot reach "detailed authored environments" at scale. Find out now.

**Interfaces/workflow for expansion:** `registry.ts` as the single content authority, the plain-data state and the `ArtBatch`/semantic-role asset metadata are good seams for adding regions and hulls. Two concerns: content is embedded in a 676-line TS module (fine for now; consider data files when C05–C15 and 39 recipes arrive), and the visual side lacks an art bible with numeric optics/value targets per region. That is why drift went unnoticed. A one-page art bible table (fog density, fog hue, key light, accent budget, outline policy per region) would let every Sol task and reviewer check the look objectively.

## Owner decisions that would materially help (root to consolidate)

1. **Review sizing:** may bounded corrections with regression tests use one non-author reviewer, keeping the dual gate for milestones and new systems?
2. **Reference fidelity:** should production match the `20711d1` reference's optics/outline treatment and asset designs as the default baseline (my recommendation), or is the current softer look intentional? This is within richer cel either way.

Nothing else blocks the recommended slices.

## Evidence and resource closure

- New evidence: `/tmp/siltwake-opus-design-r1/` — `live-00…03` captures, `contact-0{1,2,3,4,5}-*.png` (derived; originals untouched), `build/` (exported `47d8872` tree + `dist`, matching JS hash), `npm-ci.log`, `build.log`, `preview.log`.
- Browser: verified `factory-worker` Linux headless Chromium 154 / SwiftShader. T3 `preview_status` → `preview_open` incognito `tab_29_0430977b-…`, checked-free port 5197, own `vite preview` server. Page-local key events only, all keys released. Tab closed through `t3_preview_close`, own server stopped through its task handle, port 5197 verified free. No recordings, no process-name kills. Historical tab 14 and all peer/user resources untouched.
- Repository: only this file and the spoiler appendix are added. No source/test/config/spec edits, push, PR or merge.
