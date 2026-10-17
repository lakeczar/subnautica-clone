# Dedicated game-design critic

Owner-requested on 2026-10-17. Status: scheduled for the M3-to-M4 transition; supporting research and this procedure passed [paired review](../reviews/DESIGN-PREP-R1.md) at `c0aa5cb`, the actual game critique has **not** run. This adds a review obligation without reducing game scope or replacing the [independent technical gate](../../DELIVERY_AND_ACCEPTANCE.md#independent-review-gate).

## Role and timing

Use a fresh non-author **GPT-6 Astra at xhigh**, verified against the live catalog. Root remains coordinator; Sol 6.1 max remains main builder and implements accepted corrections. The critic authors no production changes and cannot count as either of the separate technical acceptance reviewers for that candidate. Rotate slots within the four-agent cap.

Run the main critique after M3 has a complete playable opening, middle and ending, early enough in M4 to change weak design. Freeze and identify the candidate SHA, specification SHA and artifact before dispatch. If a major prerequisite is absent, report it, route it to implementation and reschedule the full critique; do not score an incomplete expedition as the full game. Earlier route observations can inform construction without claiming the late critique complete.

Research preparation is a separate assignment, recorded in TASKS.md. Its single cited report is [04-game-design-review.md](../../research/04-game-design-review.md); verify its review status and read it before the critique. Inspect cited primary sources where needed, treat principles as context-sensitive lenses, and distinguish their authors' claims from Siltwake-specific inference. Research is not authority to alter the owner's chosen setting, fleet, richer-cel art or ten-hour campaign.

## Review inputs and method

Read AGENTS.md, current STATUS/PLAN/CONTRACTS, revised build prompt, EXPEDITION_INTEGRATION, WORLD_PROGRESSION, FLEET_AND_SURVIVAL, STORY_DESIGN, GRAPHICS_PIPELINE and DELIVERY_AND_ACCEPTANCE. Receive prior findings/dispositions, known gaps, production run commands, controls, save/route artifacts, content manifest and actual hardware settings.

Start with a player-facing pass: use the game and ordinary-control evidence before reading spoiler canon or hidden solution routes. Record this ordering and any prior knowledge honestly; a model playthrough is not a blind human test. Then read `docs/spoilers/NARRATIVE_CANON.md` for a separate audit of chronology, corroboration and reveal support. Do not leak the twist into ordinary reports or PR summaries.

Inspect actual play and rendered scenes on the frozen candidate, not only code, prose or attractive asset views. Exercise onboarding and an expedition directly where tools permit; inspect ordinary-input campaign evidence covering both fleet strategies, optional hull missions, early/missed clues, return/refuge and repeated recovery. Identify which segments you personally played, watched, read about or inferred from static code. Missing critical behavioral evidence stays open. Cheats/seeded fixtures can diagnose a mechanism but cannot establish campaign flow.

Before any browser, preview, screenshot or browser test, read `/work/repos/fleet/BROWSER_RULES.md` when available and `docs/BROWSER_RULES.md`. Verify isolated Linux ownership, prefer T3 preview_status then preview_open, use task-isolated storage and a unique free port, preserve human/shared tabs including historical tab14, and close only owned resources. State rendering hardware, settings and audio availability. Software rendering and muted audio limit the corresponding claims.

## Questions to answer through play

| Aspect | Concrete questions and evidence |
| --- | --- |
| Onboarding and flow | After waking, can the player infer a safe first action, an intriguing lead and a practical reason to return? Does each new capability change the next decision? Inspect opening, first refuge, midgame transitions and ending. |
| Exploration and geography | Do landmarks, ecology and source conditions teach where to search without exact undiscovered-site markers? Are alternate approaches and return shortcuts useful? Trace clue → habitat → material → capability → new discovery. |
| Expedition loop and pacing | Does preparing, venturing, observing, gathering, retreating and upgrading offer changing decisions? Record empty travel, repeated ferrying, menu friction and repeated harvests separately from investigation and meaningful challenge. Do not infer ten hours from map size. |
| Fleet and building | Does each of six craft offer an understandable benefit on a real mission? Do carrier interior services and two-compact/one-medium logistics justify their cost? Can both intended main strategies finish without optional hull shopping? |
| Survival, ecology and recovery | Are warning, evasion and deterrence learnable? Do tense depths contrast with reliable refuges? Is loss consequential but recoverable without duplicate advanced ships, hidden subsidies or a new chore spiral? No thirst or predator-kill progression. |
| Story and lore | Are ambiguity and regional leads productive rather than confusing? Do scans, journals and physical evidence support multiple early interpretations and the eventual reveal? Audit out-of-order discovery, independent corroboration and missed optional logs. |
| Assets and atmosphere | From the real gameplay camera, do richer-cel silhouettes, colors, lighting, scale and animation communicate biome identity, resources, entrances, machinery and creature behavior? Does detail improve discovery and interaction without hiding routes? |
| UI, audio and accessibility | Can the player understand hazards, craft requirements, cargo, depth/exposure and consequences without memorizing hidden rules? Are audio cues backed by useful visual/subtitle cues? Check readability, menu burden, controls and settings in context. |
| Whole experience | Where do the systems reinforce curiosity, wonder, tension and relief, and where do they conflict? What specific change would most improve the player's next decision, and what would it cost elsewhere? |

## Required output and correction loop

Return a concise spoiler-free verdict, strengths worth preserving, and a ranked findings table. Each substantive finding needs an ID, affected route/scene and exact artifact, observed behavior, likely player consequence, relevant principle (if any), confidence/evidence class, proposed correction and tradeoff, and a verification step. Classify evidence as direct observation, inspected artifact, design inference or human-test hypothesis. Avoid generic praise, taste presented as fact, and aggregate numeric 'fun' scores.

Priorities: **blocking** for broken progression, unrecoverable loss, material scope violations or missing essential evidence; **major** for a demonstrated repeated confusion/chore or an undermined core game relationship; **minor** for localized polish; **hypothesis** for untested player-response concerns. Severity and confidence are separate. Clearly state uncertainty and preserve genuinely useful alternatives.

Record the report and dispositions under `docs/build/reviews/DESIGN-R<n>.md`; put spoiler-bearing analysis under `docs/spoilers/reviews/DESIGN-R<n>.md` and label it. Coordinator resolves each finding through evidence: fix, justified rejection, or an explicit remaining human-test hypothesis. Substantiated major findings require correction or a documented scope-consistent resolution; blocking correctness/scope disputes stay open. Small taste improvements can be deferred with reasons, without pretending they were fixed.

Dispatch fixes to bounded Sol max assignments, run affected checks and freeze a new candidate. Start a **new** T3 delegate_task for the focused Astra xhigh re-review, with a distinct stable request ID and the original brief, full prior findings, dispositions, unresolved objections and new evidence. Do not recycle a backing child thread as a review round. Re-review affected design plus regressions in connected systems. Functional/content/contract changes also require the existing fresh technical Astra/Sol acceptance pair.

Final reporting must include actual critic model/effort/task IDs, candidate SHAs, evidence coverage, all unresolved items and explicit limits. Fresh-player comprehension, surprise, enjoyment and approximately ten-hour main-story pacing still require human observations. The dedicated critic cannot waive those or representative-GPU measurements.
