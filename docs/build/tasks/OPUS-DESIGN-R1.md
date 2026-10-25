# Early Opus project, gameplay-loop and visual critique

Owner explicitly requested one **Claude Opus 5.5 at high** review on 2026-10-17, including gameplay-loop judgment, taste and a look at the actual visuals. This is an early advisory review of the current expedition plus the complete campaign plan. It supplements the technical Astra/Sol gates and the later full-campaign Astra xhigh design critique; it does not complete or replace either.

## Role, baseline and ownership

Use live-catalog `claudeAgent / claude-opus-5-5`, explicit `effort: high`, one fresh T3-owned isolated worktree. Verify the exact clean parent SHA supplied in delegation; its production must match `47d8872942e95120241af014e667084c75a54e39` (technical R2 candidate `e0a7d0d` has the same production). Root remains Astra xhigh coordinator; Sol 6.1 max remains implementation author. No children/delegation or peer polling.

Only author/commit `docs/build/reviews/OPUS-DESIGN-R1.md`; if needed, also `docs/spoilers/reviews/OPUS-DESIGN-R1.md` for a clearly labelled spoiler appendix. Temporary evidence: `/tmp/siltwake-opus-design-r1/`. No code/tests/config/spec edits, fixes, push/PR/merge, parent mutation or external messages. Preserve original artifacts; copy and redirect analyzers before running. Return after bounded review with your actual model/effort, commit, findings, evidence and resource closure.

## Owner's taste and intended experience

- Original alien-ocean survival mystery, approximately ten hours for the main story plus optional exploration; no harvesting/travel padding.
- Wake in a damaged home pod with missing memories; ambiguous lore supports investigation and a consequential personal reveal. Regional leads, independently discovered sites, out-of-order evidence and optional personal journals.
- Open ocean, islands, scattered research settlements and a larger research district. Resources belong to learnable biomes and ecological/geological hosts.
- Vehicle-focused building: pod storage/crafting/healing, modest fixed outposts, six complementary hull roles and a large customizable mobile home that stores/deploys smaller craft. Expensive vessels must earn their resource/logistics cost through useful missions.
- **Richer cel-shading**, vibrant color, atmospheric naturalistic lighting, detailed environments, readable organic silhouettes and precise mechanical assets. The owner explored voxel art but selected richer cel; do not reopen that settled choice as the default recommendation.
- Wonder first, tense depths and comforting refuges. Food without thirst; oxygen, pressure, power and damage; evade/deter wildlife instead of hunting progression; recoverable loss without erasing knowledge or requiring duplicate advanced ships.

Exercise independent taste. Be candid about weak or generic design and visual choices, and name strong choices worth preserving. Aesthetic judgment is welcome when labelled as judgment and anchored in a specific image/scene. Do not treat taste as a proven universal player response.

## Review order and inputs

Read AGENTS and STATUS first, then PLAN/CONTRACTS, `prompts/BUILD_GAME_REVISED.md`, settled map and applicable EXPEDITION_INTEGRATION, WORLD_PROGRESSION, FLEET_AND_SURVIVAL, STORY_DESIGN, GRAPHICS_PIPELINE and DELIVERY_AND_ACCEPTANCE. Read `docs/research/04-game-design-review.md` and the later critic procedure for useful principles and evidence distinctions. Existing primary-source research is enough; avoid an unbounded new literature survey.

Start with player-facing opening/UI/actual imagery and ordinary-input evidence before spoiler canon/solution routes. Record prior knowledge and inspection order honestly; this is not a blind human test. Then inspect narrative canon privately to assess whether the planned mystery connects to geography and progression. Keep its twist out of the ordinary report, terminal summary and any owner-facing suggestions.

Current M1 implements the first expedition, local Dart recovery and a seeded carrier feasibility fixture. It is not the ten-hour campaign or ordinary acquisition of the entire fleet. M2–M4 remain planned work. Evaluate existing play as existing play, and campaign promises as design/architecture hypotheses. Do not excuse current onboarding/visual defects as future content, and do not call the absence of scheduled M2–M4 content an unexpected M1 defect.

Current combined check:153 tests/typecheck/build. Three technical R1 defects (boundary distraction saveability, stale cache meshes, occupied recovery persistence) have provisional corrections. Their reports/limits are available, but your job is experience and project judgment, not repeating the entire technical audit. Do not inspect current technical R2 peer reports or ask peers for findings. Technical acceptance remains independently coordinated.

## Questions to answer

1. **Integrated expedition loop:** trace player question → preparation → habitat/source → resource/blueprint → capability/vehicle → discovery → return. Where does this produce an interesting choice, and where is it just shopping, hauling or menu work? Judge learning, agency, reward anticipation and how a successful return changes the next expedition.
2. **First-expedition flow:** does waking lead to a clear safe action and an intriguing voluntary goal? Are reef/island routes readable without turning mystery into a checklist? Are the Dart and first deeper visit meaningful rewards? Does comfort reliably punctuate tension?
3. **Campaign depth:** can the planned regions, research settlements, clues and six hull roles plausibly support varied investigations and ten-hour intent without repetition? Identify missing mission variety or dependencies that could make an expensive vessel arrive too late or obsolete earlier craft. Do not infer actual duration from content counts.
4. **Survival/ecology/recovery:** are warning, cause, response and consequences legible? Do noise/light/cover/decoys create choices? Does recovery invite another attempt or risk a repetitive chore spiral? Separate physically solvable from emotionally worthwhile.
5. **Taste and visuals:** inspect actual images at gameplay-camera scale. Critique palette, lighting, fog, silhouettes, material contrast, detail density, environmental composition, scale, creature character, refuge warmth, cockpit framing and UI burden. Do assets read as a coherent alien world, or as assembled procedural primitives? Does precise mechanical detail remain legible while moving? Which concrete changes would most improve atmosphere and authorship within the selected richer-cel direction?
6. **Project judgment:** assess whether current interfaces/content workflow support useful expansion, and whether our coordination/review process is overinvesting in verification while delaying meaningful gameplay. Recommend a practical next slice that increases experience value without discarding save/recovery guarantees. Criticize the plan/coordinator's assumptions where justified; avoid generic rewrites or extra gates without concrete benefit.

## Actual visual and gameplay evidence — inspect pixels, not just filenames

Use an available image-viewing tool to open actual retained captures; read the source reports for provenance. Screenshots alone do not establish motion or fun. If tooling cannot display an artifact, state that limitation rather than claiming visual inspection. Select representative coverage; no need to inspect hundreds of near-duplicate captures.

- **Ordinary composed expedition, production `4d0a7f0`:** `/tmp/siltwake-m1-combined-expedition/media/02-orientation-deck.png`, `03-ramp-orientation.png`, `04-prepared-fabrication.png`, `05-cockpit-shallow.png`, `06-canopy-warning-cockpit.png`, `07-lab-record.png`, `08-return-locker.png`, `09-reloaded-workshop.png`, `10-island-first-intake.png`. Reports `docs/build/evidence/M1-COMBINED-EXPEDITION.md` and `M1-COMBINED-EXPEDITION-INTEGRATION.md` index controls, clips/checkpoints and exclusions. Fresh New→C01–C04→Dart→cargo→return/reload recorded25 collections/31 transfers/8 recipes; those counts indicate places to investigate friction, not proof of boredom.
- **Appearance/pilot/optics, production `6ea44ce`:** `/tmp/siltwake-m1-render/captures/after/{reef,island,podOutside,podSide,dartQuarter,dartPilot,dartDeep,hunter,labIn,labOut,carrierBay,carrierSurface}.png`; comparisons `/tmp/siltwake-m1-render/{hunter,bay,dart}-comparison.png`. Many are staged appearance views, not earned exploration. Read M1-RENDER and M1-RENDER-INTEGRATION for exact camera/source/limit attribution.
- **Seeded carrier:** `/tmp/siltwake-m1-combined-carrier/captures/f2-creel-nonzero-heading-pane.png` and carrier evidence reports. Judge interior utility/readability potential without claiming campaign fleet use.
- **Selected richer-cel reference:** `/tmp/siltwake-m1-batch-r1-astra/reference-reef.webp` and `reference-scout.webp`, derived from the chosen study at art commit20711d1. Reference art is not production gameplay or a performance target.
- **Current recovery UI, author `d99aa649`:** `/tmp/siltwake-m1-batch-r1-occupancy-fix/media/01-occupied-hold-disabled.png`, `04-safe-exit-recovery-available.png`, `05-unoccupied-salvage-return.png`. Current combined code retains these behaviors; root report M1-BATCH-R1-OCCUPANCY-INTEGRATION records targeted verification.

Earlier captures keep their exact source attribution. Inspect current code for any subsequent visual difference before carrying a criticism forward. Do not judge obsolete known defects as still present. No fresh complete preparation/full campaign run is demanded here.

If retained evidence leaves a material experiential question unresolved, a bounded current-production preview is allowed. Prefer first-person New/opening plus a short ordinary-input segment or an unchanged earned checkpoint, accurately labelled. No injected progress/teleports count as normal play; carrier fixtures remain diagnostic. Do not consume hours repeating technical matrices or waiting for battery exhaustion.

## Browser isolation

Before opening/driving a browser, preview, screenshot or browser test, read `/work/repos/fleet/BROWSER_RULES.md` when available and `docs/BROWSER_RULES.md`. Prefer APIs/retained artifacts when adequate. Verify the actual browser process is factory-worker/isolated Linux; T3 preview_status then preview_open, task-owned incognito tab/storage, **port5197 checked free first**. Never automate the owner's Windows desktop or capture/confine its physical cursor. Preserve historical tab14, shared hosts and all user/peer resources. Bounded page-local inputs only; release keys/controllers, stop recordings, close only owned tabs normally through T3 and stop only your own server normally. No process-name kills. State actual renderer/settings/audio limits. SwiftShader/muted audio prove no dedicated-GPU performance or audible mix.

## Required return

- Concise spoiler-free assessment of what experience exists now and the biggest risks to the intended game.
- Coverage table: personally played / watched or inspected image / read / inferred, with exact source and artifact. Include what was not inspected.
- Strengths to preserve, then ranked findings with stable IDs, priority/confidence, scene/artifact, observation or inference, player consequence, suggested change/tradeoff and a concrete verification step. Distinguish observed defect, aesthetic judgment, design inference and human-test hypothesis. No numeric “fun” score or claims of human surprise/duration.
- A visual critique naming specific examples and a short ordered set of art improvements within richer cel; original assets and useful precision should be preserved where justified.
- The five most valuable next changes, separating current M1 fixes, M2–M3 design/implementation work and human-playtest questions. Indicate which can share one small implementation slice rather than creating more review bureaucracy.
- Project/process critique with evidence and practical recommendation, plus a small set of owner decisions only if they materially block a good choice. Do not ask the owner questions yourself; root consolidates them.

Commit only assigned report(s), return full SHA and evidence paths, actual model/effort and owned-resource closure. This advisory report cannot accept a technical batch/milestone or waive the later critic. Root evaluates recommendations and delegates accepted implementation to Sol max under bounded ownership; functional changes continue through existing applicable reviews.
