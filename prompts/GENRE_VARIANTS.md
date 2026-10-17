# Alternative capability-test briefs

These are optional **separate experiments**, not extra features for Siltwake. They show how to test different game-building strengths. They are proposed original briefs, not recovered historical benchmark prompts or replicas of commercial content.

For either experiment, start a fresh repository/session and use GPT-6 Astra as coordinator with up to three Astra workers. Apply the team/ownership, committed-baseline, milestone, PR, browser-isolation, and truthful-evidence rules from [BUILD_GAME.md](BUILD_GAME.md). **Replace all Siltwake-specific content, mechanics, progression, art direction and tests with the chosen brief below.** The coordinator must first write the resulting single genre-consistent contract; do not combine the games. Use the new experiment's repository rather than the Siltwake remote. A new public repository requires authorization for that experiment.

## Variant A: Blackout Station — round-based survival

> Build an original, polished first-person wave-survival game in a sealed polar research station. You are the Astra coordinator and integration owner; delegate bounded Astra tasks with exclusive paths. Deliver a complete 15–25 minute run with onboarding, ten tuned waves, a final holdout/extraction, defeat/restart, pause/settings and save/resume at wave boundaries.
>
> Use strict TypeScript, Vite and Babylon.js for desktop WebGL 2. Create one carefully composed arena with three connected unlockable zones, three weapons with materially different firing/reload/range tradeoffs, three enemy roles with readable movement and attack windups, and at least two competing uses for earned currency: immediate survival supplies versus access/equipment improvement. Choices must affect the next encounter. Keep all names, enemy designs, map layout, interface, audio and writing original.
>
> Start with a complete small loop: move/aim → fight → earn → choose a purchase → face a harder wave → extract or lose. Finish that loop before adding enemy or weapon variants. Design the map around sightlines, movement routes, resource decisions and escape options. Ensure enemy spawning and navigation cannot leave an unreachable final enemy, spawn damage inside the player, or create an unwinnable purchase state. Provide a conservative stuck-enemy recovery rule and test it.
>
> Polish recoil and hit/damage feedback, reload readability, telegraphing, spatial sound, short between-wave decisions, a clear wave objective and an unmistakable ending. Use stylized original assets and purposeful lighting. Controls must pause/release correctly; audio starts from user input. Follow the browser rules before any testing and use verified isolated Linux for pointer lock.
>
> Prove the complete ten-wave extraction through normal controls, normal damage/economy and no invulnerability, enemy deletion, injected currency or forced wave progression. Also prove defeat/restart, save/resume at a wave boundary, weapon switching during reload, purchase atomicity, spawn exhaustion, navigation recovery and production-build asset loading. Include meaningful rules tests and actual frame-time measurements with hardware context. Report observed pacing rather than declaring the requested duration achieved without a run.
>
> Keep multiplayer, procedural maps, weapon-count inflation, extensive cinematics and an endless mode out of the initial release. Deliver source/assets, reproducible commands, build, local playable preview, linked reviewable PRs and evidence. Preserve a playable commit when blocked and state incomplete gates explicitly. Final main merge and deployment remain with the owner.

**What this probes:** control responsiveness, combat feedback, navigation/spawning, tactical economy, encounter tuning, and whether ten waves form an authored experience instead of an unbounded enemy spawner.

## Variant B: Lantern Aquarium — fish-economy game

> Build an original, polished aquarium-management game about restoring a neglected bioluminescent research tank. You are an Astra coordinator with bounded Astra workers and ownership contracts. Deliver a complete 15–25 minute guided progression with an explicit restoration milestone and optional continue-playing afterward.
>
> Use strict TypeScript, Vite and Babylon.js for a small orbit-camera desktop-browser tank. Implement feed → observe inhabitants → earn research credits → choose a new species or habitat upgrade → unlock the next restoration objective. Provide four visually and behaviorally distinct species and three habitat upgrades that change carrying capacity, feeding strategy or yield; prevent a single strictly superior purchase from erasing the choices. Teach through immediate feedback, short goals and readable controls.
>
> Compose a visually coherent tank with schooling, original animated silhouettes, plants, appealing lighting and restrained sound. Feeding, collection and purchases must be responsive, understandable and satisfying. Include an inspection journal, pause/settings, save/resume, export/import, reset confirmation, a milestone celebration and a clear continuing-play state. Use a free rescue ration or recovery task so running out of currency cannot permanently stall the loop. Choose and explain a forgiving care model rather than causing surprise deaths while the tab is closed.
>
> Test and tune the full progression before adding decorative variations. Use a controllable simulation clock for economic invariants and save tests, but prove at least one normal-speed, ordinary-input start-to-restoration run with real costs and rewards. Test repeated-click purchasing, full capacity, no currency, pause/background tabs, reload after feeding and purchase, corrupt saves, and large groups of active inhabitants. Distinguish author-reported performance from measurements made in this run.
>
> Keep predators/combat, multiplayer, accounts, procedural oceans, monetization and arbitrary long idle timers outside the initial release. Follow the same isolated-browser, clean-build, reviewable-PR and honest-evidence rules. Deliver source/assets, build, launch/test instructions, playable local preview, evidence and measured limitations; final main merge/deployment remain with the owner.

**What this probes:** economy pacing, readable feedback, expressive behavior, visual cohesion, save integrity, and whether a peaceful game has a satisfying objective. This is not a claim to reproduce the intended “fishslop” benchmark; its exact identity was not established by the research.

## Compare artifacts fairly

Freeze the exact brief, models, permitted tools/assets, environment, execution budget and policy for human interventions before comparing runs. Record revisions and interruptions. The Siltwake planning run sets no budget and has not executed any benchmark.

First apply pass/fail prerequisites: documented launch works; ordinary controls work; the promised endpoint is reachable; failure/recovery and saving match the contract; essential features are implemented; evidence is truthful. A screenshot cannot compensate for a failed prerequisite.

For artifacts that pass, use the same six assessment axes, anchored from 0 (absent) through 1 (broken), 2 (functional), 3 (coherent), and 4 (polished):

| Axis | Weight | Look for |
| --- | --- | --- |
| Complete loop | 25% | Beginning, meaningful progression, endpoint and replay/restart |
| Player agency | 20% | Choices that change routes, tactics, economy or risk |
| Content and pacing | 15% | Distinct encounters/activities and earned escalation |
| Usability and presentation | 15% | Legibility, control feel, coherent art/audio, onboarding |
| Robustness and recovery | 15% | Persistence, edge cases, safe transitions and recoverable failure |
| Evidence and delivery | 10% | Reproducible artifact, ordinary playthrough and contextual measurements |

Calculate `sum(weight × rating / 4)` for a score out of 100, alongside prerequisite results and specific defects. Establish any pass threshold before observing submissions. Genre-specific checks differ: an aquarium has no combat obligation and a shooter has no crafting obligation. The comparisons evaluate shipped experiences; one uncontrolled run does not establish model superiority.
