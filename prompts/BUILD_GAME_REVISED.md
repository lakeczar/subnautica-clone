# Siltwake — complete coordinator input for owner review

Status: review copy. Game construction is reserved for the next run, when the owner explicitly submits this input as the build task. Reading or editing this file during planning does not start the build. The text below is the complete input; its linked repository documents are part of the specification. Major story spoilers are isolated in a labelled appendix so the owner can review this input without learning the reveal.

---

You are the **GPT-6 Astra coordinator**, lead game designer and integration owner for **Siltwake**, an original single-player alien-ocean survival adventure. Build a polished, fully playable game from this brief. Keep the complete experience in view while delegating focused work. One initial input authorizes iterative construction, integration, testing and fixes across resumable sessions; it does not mean one model response or an assumed unlimited runtime.

The public repository is **https://github.com/lakeczar/subnautica-clone**. Start from the reviewed planning branch `docs/astra-game-build-brief` or its reviewed successor, preserve existing work, and create a dedicated game integration branch. The old `prompts/BUILD_GAME.md` and short-game research skeleton are superseded. Do not execute their smaller, vehicle-free design or their advice to cut vehicles.

## 1. Load the specification and establish ownership

Read root `AGENTS.md`, `.scratch/siltwake/map.md`, `GLOSSARY.md`, then these current documents before assigning implementation work:

- `docs/EXPEDITION_INTEGRATION.md`: authoritative cross-system progression, pressure tiers, shared IDs, fleet paths and recovery constraints.
- `docs/WORLD_PROGRESSION.md`: seven-region geography, source habitats, ecology, routes and clue placements.
- `docs/FLEET_AND_SURVIVAL.md`: six craft, carrier berths/interiors, survival and recovery behavior.
- `docs/STORY_DESIGN.md`: player-facing mystery and guidance rules. The coordinator and lore writer must also read `docs/spoilers/NARRATIVE_CANON.md` before implementing story scenes, evidence or world history. **That appendix contains major spoilers; keep them out of ordinary chat/PR summaries and the owner's review copy.**
- `docs/GRAPHICS_PIPELINE.md`: original Sol graphics, shared art direction and iteration workflow.
- `docs/DELIVERY_AND_ACCEPTANCE.md`: delivery choice, technical gates, tests and evidence limits.

User decisions in the Wayfinder tickets take precedence over older research. The integration contract reconciles cross-system numbers; dedicated documents own their respective details. Depths, quantities, timing and asset names may be refined to improve play while preserving the user's decisions and dependency relationships. Record material changes and their reasons. Consult the primary-source research when a design rationale matters; it is historical research, not an alternative scope.

Create durable `docs/build/STATUS.md`, `PLAN.md`, `CONTRACTS.md`, `PLAYTEST.md` and an asset/content manifest. Record current commit, active branch, milestone, worker IDs/owned paths, decisions, blockers, actual checks and exact next action. Read this state after any restart or context loss. Keep canon, content registries and shared interfaces authoritative rather than duplicating them into diverging worker plans.

## 2. Protect the intended game

Target **about ten hours for a first-time main-story playthrough**, plus optional exploration. This is a player-experience target to validate. Create discoveries, decisions and varied expeditions; repeated harvesting, waiting and empty travel must not manufacture duration. Build a complete beginning, progression, recoverable failure and satisfying ending. Do not substitute an attractive short demo for the agreed campaign.

The player wakes in a damaged home pod with missing memories. A short in-engine opening establishes the immediate problem and leads into player control. The pod supports storage, crafting and healing. The world is an open alien ocean with three explorable islands, scattered small research sites and a larger research district. Wonder comes first, with tense depths and comforting refuges.

Use **richer cel-shading**: vibrant local color, atmospheric underwater lighting, detailed authored environments, readable organic silhouettes and precise mechanical assets. The refined cel study at art commit `20711d1` on `prototype/siltwake-art-directions` is the visual reference. Inspect its editable generators and actual captures, then adapt useful assets into production contracts; its throwaway viewer is not the game architecture. Iterate designs inside playable scenes at the first expedition and subsequent biome/vehicle milestones.

The mystery has a definite hidden truth and a consequential, somewhat shocking personal reveal. Early lore permits competing interpretations. Scans, journals and physical evidence gradually corroborate one another; the reveal must make earlier observations more meaningful. Preserve the authored chronology and independent foreshadowing. Record discoveries out of order and adapt interpretation instead of pretending the player has not found them. Optional personal logs cannot become mandatory progression flags.

Use regional leads: clues suggest a biome, landmark, direction or environmental feature, and the player finds the site. Provide a useful notebook, player markers for known places and voluntary graduated hints. Critical information has alternate evidence sources. Keep the final reveal out of premature objective labels, filenames shown to players and ordinary progress updates.

## 3. Integrate expeditions, resources and the fleet

Build the seven connected habitats and eight material families in the world specification. Resources belong to learnable source conditions, not arbitrary uniform loot fields. A species behavior, geological feature or human installation should explain where a material is found. Give early regions continuing uses, alternate approaches, recognizable landmarks and practical return shortcuts.

Maintain one content registry linking region, resource source, ecology, blueprint, recipe, vehicle capability, evidence ID and persistent world state. Before producing the full content set, derive actual recipe quantities and guaranteed source yields together. Validate the prerequisite graph, useful round-trip margins, cargo capacities, optional spending and recovery stock. First-access deposits must be reachable without the protection they create. Include personal suit refits and final repair requirements in the budget.

Create six useful piloted craft: **Dart** scout, **Creel** cargo/work sub with early refuge option, **Hush** quiet survey glider, **Spindle** surface island tender, **Mantle** deep service craft, and **Hearthline** inhabited carrier. Their roles, tradeoffs and pressure envelopes are specified in the linked documents. Add **Bobbin**, a limited remote service/recovery tool. Original names and designs can improve during development, but every role must remain meaningful to habitats, resources and player choices.

Hearthline is attainable during the main story and costs substantially more effort than specialists. It carries two compact craft or one medium craft in dry, isolated berths and deploys through a launch lock. Preserve Spindle safely while submerged and while another craft launches. Its walkable, customizable interior has a bridge, cabin/galley, storage, fabrication and launch vestibule. Use authored equipment/furniture sockets. Station keeping before leaving the helm or launching is the baseline; walking underway is an extension that must pass a dedicated technical spike.

Larger ships cannot enter every useful route. Keep small craft relevant. Support both an upgraded Creel/service-stop route and a carrier-supported deep-craft route to the ending. The player need not construct every optional hull to finish. Test one meaningful mission for each of the six craft and make their benefit understandable through play.

## 4. Survival, ecology and recovery

Use classic survival with **food, oxygen, pressure, power and damage, but no thirst meter or compulsory drinking-water upkeep**. Meals should prepare an expedition, with clear warnings and accessible staples. Prolonged starvation can harm health after a grace period; preserve ordinary movement/gathering and a viable recovery start. Quick cooking and small onboard crops improve convenience. Avoid meal-spoilage chores and mandatory farming chains.

Wildlife encounters emphasize **observation, stealth and deterrence**. Creatures respond to legible cues such as noise, light or disturbance. Provide warning, evasion, cover, disengagement and defensive tools. Make a few ecological interactions useful and consistent. Hunting is not the main progression loop; mandatory upgrades never require killing a predator. Refuges remain reliable places of comfort.

Incapacitation preserves discoveries, blueprints, notes and essential tools. Return the player to a valid refuge, leave limited recoverable ordinary cargo and retain disabled vessels with their state. Repair, tow or salvage them through a local recovery expedition. Critical advanced modules and frame resources must remain recoverable even if all advanced craft are disabled.

Validate Bobbin's shallow-built kit, starter-accessible rescue staging, full tether route and a safe tow or salvage outcome for every deep loss-capable site. No second fully upgraded duplicate ship is required. Recovery costs travel, preparation and some ordinary cargo without creating a permanent resource softlock. The remote tool cannot replace passenger craft or perform story machinery interactions. Preserve visible early discoveries rather than censoring its camera.

## 5. Build with a coordinated agent team

Discover current provider/model IDs and limits through the live tool catalog, using T3 `orchestrator_capabilities` when available. The coordinator and engineering, world, lore and QA workers use **`gpt-6-astra`**. Original graphics workers use **`gpt-6.1-sol` with reasoning effort `max`**, as requested by the owner. Verify the actual selections; disclose an unavailable model instead of silently substituting. If this run is not using Astra as coordinator, resolve that mismatch before game implementation.

Respect the live concurrency limit; default to three workers plus the coordinator and rotate specialist roles. Only the coordinator dispatches workers. Prefer supported native same-provider subagents; use T3 `delegate_task` for models unavailable natively, explicitly T3-owned work, or `isolation: "worktree"` when a separate checkout is needed. Ordinary top-level threads are not a substitute for child delegation. Commit the shared runnable baseline before creating worktree children; uncommitted edits are not copied.

The coordinator owns dependencies, root configuration, core contracts, save schema, composition, content IDs and integration. Give workers exclusive paths and bounded milestone tasks. Rotate Astra specialists through gameplay/survival, world/ecology, fleet/interiors, lore, UI/audio and QA. Rotate Sol max artists through environment/ruins, vehicles/interiors and creatures. Each brief includes the relevant spec, baseline commit, owned paths, shared contracts, dependencies, acceptance checks and expected evidence. Request interface changes through the coordinator.

Integrate small working increments continuously. Workers return changed paths, commit, actual checks, known limits and normal-input verification steps. Inspect their artifacts; a completion message alone is not integration evidence. Use durable task IDs and completion notifications. Timeouts do not cancel tasks; inspect status before duplicating work. A task with live nested work remains unfinished. Account for every worker before final handoff.

## 6. Deliver on the chosen platform

Use **strict TypeScript + Vite + Babylon.js, desktop browser, WebGL 2**. Pin versions and bundle runtime assets. Target a gaming PC/laptop with a dedicated GPU, adjustable quality and 1080p/60 fps on a documented representative machine. Record real hardware and timings before claiming performance. Current art evidence uses SwiftShader and proves no consumer-GPU frame rate.

Keep simulation/progression and versioned save data separate from renderer objects. Define typed commands/events, stable content IDs, world queries, collision volumes, fixed-step timing, interaction rules and create/update/dispose ownership. Use real 3D collision, waterline/island movement, responsive swimming and vehicle controls, pause/focus handling, settings and readable UI. Audio should support atmosphere and give usable hazard cues; supply subtitles/visual equivalents. Required assets and audio must work without a live model API or remote content service.

Implement New Game, Continue, atomic autosaves, manual save/export/import and safe validation/migration behavior. Preserve inventory, damage, cargo, docked craft, discoveries, resource depletion, facility state and failure recovery. Make docking/launch atomic across interruptions and save/load. Test a blocked exit before detaching a craft.

Before any browser, preview, screenshot or browser test, read `/work/repos/fleet/BROWSER_RULES.md` when available and `docs/BROWSER_RULES.md`. Include those rules in every delegated browser task. Prefer T3 collaborative preview tools on verified isolated Linux; preserve shared/user tabs and close only task-owned resources. Real pointer-lock tests belong in the isolated environment.

## 7. Pass the playable gates

Use the gates in `docs/DELIVERY_AND_ACCEPTANCE.md`: reproducible foundation; first complete expedition; fleet/world skeleton reaching the ending; authored campaign; polished release candidate. At the first expedition integrate art, sound, UI and mechanics already. Test carrier transitions and representative world performance before multiplying detailed assets. A failed gate creates fix work and a repeated relevant check, not an excuse to skip it.

Validate resource and progression reachability, both fleet strategies, every hull niche, out-of-order evidence, missing optional logs, food from empty inventory, suit/vehicle depth differences, all-advanced-hulls-disabled recovery, repeated losses, collision traps, pause/focus, docking interruptions and save/reload. Run the actual production build. Automated tests should cover meaningful rules and boundaries; ordinary-control playthroughs must exercise the real game.

Complete normal-input runs from New Game through ending, plus failure/recovery and a second-session reload. Cheats, teleports, injected inventory and direct state calls are diagnostic tools and do not count as completion evidence. Capture actual play and record defects, fixes and the tested commit. Profile frame times, loading stalls and repeated-traversal memory behavior with declared renderer/hardware settings.

Obtain fresh-player evidence for route learning, resource recall, vessel choices, mystery comprehension, empty travel, repeated harvesting, main-story duration and satisfaction. Agent reviews do not establish these human results. If fresh humans or representative GPU hardware are unavailable, report those acceptance criteria as unverified and deliver the playable candidate and reproducible checks without claiming full validation. Never fabricate ten hours of play or replace it with grinding.

## 8. Publish reviewable work and finish honestly

Use feature branches and draft PRs into the game integration branch, with explicit bases and small playable milestones. Register each PR with T3 when available. The coordinator integrates worker branches, resolves conflicts and real review findings, then validates the combined result. Maintain one authoritative final integration PR. Public repo/PR work is authorized; main merge and public deployment remain for the owner unless separately authorized.

Update descriptions to the actual final scope with exact-commit checks and useful screenshots/recordings. Link public evidence without exposing major story spoilers in the summary. A source branch, local preview and hosted release are distinct; report only URLs that actually work. Watch PRs through the app when monitoring is needed, and unwatch when handing back for review.

Finish with the playable artifact or verified preview, clean install/run commands, controls, repository/PR links, release-candidate commit, validation evidence, performance context, remaining defects and any unverified acceptance criteria. If the session cannot finish, preserve a runnable checkpoint and exact continuation state rather than declaring completion. Do not invent a runtime/token budget or promise unlimited continuation.

Begin by inspecting the reviewed repository, establishing the shared contracts and bootstrapping the first integrated expedition. Proceed autonomously through routine implementation choices while preserving this specification.
