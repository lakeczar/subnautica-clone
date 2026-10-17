# Deeper gameplay investigation — draft for the design interview

2026-10-17. Research only; no implementation, repository edits, publication or playtesting. All Siltwake mechanics below are **original proposals**, conditional on the user's setting, emotional and scope choices. Research identifies design reasoning and risks; it cannot prove fun.

## What was actually read

The strongest source is Charlie Cleveland's **“New Loot System”** design essay, reproduced by Unknown Worlds in its [official Steam announcement](https://steamcommunity.com/games/264710/announcements/detail/515997419769156446). Full text was retrieved through Valve's [first-party news API](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=264710&count=100&maxlength=0&feeds=steam_community_announcements), which also supplied the following full developer update texts. Original Unknown Worlds URLs have migrated or returned missing pages; the publisher's announcement archive preserves the developer writing. These are historical development statements, not independently verified descriptions of every current-release value.

**Read, primary:** [Silent Running](https://steamcommunity.com/games/264710/announcements/detail/3819571572130893407), [Dangerous Creatures](https://steamcommunity.com/games/264710/announcements/detail/3819571572130893987), [Seamoth Update](https://steamcommunity.com/games/264710/announcements/detail/405677533508080906), [Bones](https://steamcommunity.com/games/264710/announcements/detail/3819571572130893867), [Get Wrecked](https://steamcommunity.com/games/264710/announcements/detail/377538367949893926), [Alterra Science](https://steamcommunity.com/games/264710/announcements/detail/519383914573421028), [Voice of the Deep](https://steamcommunity.com/games/264710/announcements/detail/1980870483552153883), and [Coming Next: Seabases](https://steamcommunity.com/games/264710/announcements/detail/515997975634130855). These include developer rationale, concrete mechanics and iteration reports beyond store marketing.

**Located but not watched/read as a talk:** GDC's official [The Design of Subnautica](https://www.youtube.com/watch?v=7R-x9NSBS2Y), described by its organizer as Charlie Cleveland's 2019 presentation about exploration, discovery and the unknown. Only metadata/description was accessible; the caption endpoint returned empty and a Vault request led to login. No detailed claim below is attributed to its unseen content. Search results and inaccessible postmortem guesses are not evidence. No community recipes/maps were needed or relied on.

## What the developers actually explain

**Fact: geography must be learnable, and the economy must justify geography.** Cleveland identifies abstract material names, resources scattered across too many places, similar recipes, abundant unremarkable loot, inventory juggling, a shallow tech tree and one-use intermediate crafting as problems. His revision places resources primarily in one recognizable habitat/context, with the explicit intention that old areas remain useful as players descend. He removes intermediate steps that add work without choice, adds advanced resources to reward greater danger, and tries to make creatures relevant through materials. This directly supports the user's request for specific resources in particular regions. It does **not** support arbitrary biome exclusivity or six differently colored pickups.

**Fact: equipment can change how an expedition works, not just unlock a door.** The Seamoth update gives mission examples: cave exploration favors sonar, defense, storage and battery; hostile-resource collection favors different equipment/storage choices. It describes nonlethal defense with energy costs. Alterra Science adds equipment modification, labeled beacons to remember future destinations, and greater diving-depth upgrades. Get Wrecked connects a laser cutter with compartments, rewards and predators. These show multiple kinds of restriction: environmental tolerance, capability, preparation and information. Exact historical recipes are unnecessary to borrow that relationship.

**Fact: creature threat is coupled to player behavior.** Silent Running explicitly trades speed against light/noise and attack likelihood; defensive options include distraction, shields and suppression. Voice of the Deep reports a second balance pass after feedback, including shutting down the engine for a safe haven. This is evidence that tuning threat and refuge was iterative, not proof that its first implementation was fun. A predator that merely swims at the player on proximity misses much of that systemic opportunity.

**Fact: the world includes respite and intelligible breadcrumbs.** Dangerous Creatures pairs threatening additions with Tree Cove, described as a peaceful place to escape into, and links a reinforced suit to hot-zone exploration. Bones describes several subareas and a connection to another zone, plus pipes carrying air. Coming Next: Seabases describes dive lines reducing the danger of getting lost in caves and prototype feedback about the feeling of standing safely inside while observing ocean life. Voice of the Deep uses distributed pipes, unusual animal movement, artifacts and data as mystery-bearing world details. These establish concrete ingredients for route memory, sanctuary and environmental questions. They do not prove a universal optimal fear/relief ratio.

**Design inference:** the compelling unit is an expedition with a question, a preparation decision, an observed environmental rule, a risky commitment and a consequential return. “Return” should include consolidating knowledge and changing future possibilities. Repeated empty commuting is not intrinsically valuable. The freedom/gating balance needs explicit design: several visible leads and alternative routes can coexist with a finite ending, while some environmental restrictions remain real.

## Current draft gaps that need decisions

1. **Ecology may remain scenery.** Six fauna categories and one predator state machine do not establish food/resource relationships or useful observation. Require a few causal behaviors that affect where resources are found, how hazards are predicted and how the player moves. Avoid simulating a whole ecosystem without a gameplay payoff.
2. **Six materials are a quota, not an economy.** The draft lacks a source-context/recipe/revisit matrix, cost budget and substitutability rules. Every material needs a recognizable source and purpose; several should connect earlier and later expeditions. Check for one-use processing busywork and a dominant universal ingredient.
3. **The fixed objective chain risks a guided corridor.** Two relays in strict order can reduce exploration to following markers. Consider a hub with two investigable leads, flexible upgrade order, optional approaches and looped connections. The final network prerequisite can remain ordered without ordering every discovery.
4. **Danger can become grind.** Low oxygen, slow travel, expensive consumables and unavoidable harvesting may stack into repeated punishment. Use infrastructure and knowledge to reduce previously solved friction. Ask whether the desired emotion is wonder, vulnerability, sustained dread or competence before tuning.
5. **Exclusivity can softlock.** A region-specific required resource must be obtainable before the protection/tool it crafts. Preserve geographic identity through multiple deposits within the same habitat, reliable non-random yield, respawn/recovery rules and protected quest stock. Do not solve every shortage by spawning everything beside home.
6. **Art direction needs mechanical readability.** Darkness, silt and glowing organisms should communicate routes/rules, not only atmosphere. Give harvestable growth, predator warning, current direction and safe air distinct shapes and motion. Decide how alien and stylized the user wants the world before choosing these signals.

## Three integrated loop proposals

These illustrate depth, not a request to approve this setting. Resource names, physiology and route rules are original and replaceable. Numbers remain tuning hypotheses.

### A. Lantern terraces: learn a living resource map

**Place/source:** sheltered undersides of warm shelf arches support pale filter ribbons; their shed membrane catches on recognizable forked rocks downstream. Silica beads collect beneath grazing shell-crawlers on exposed ledges. Neither is a random generic pickup field.

**Pressure/choice:** a membrane-and-silica tank bladder competes with a modest membrane reserve for optional decoys. The player can gather safe loose sheds on a longer open route or follow crawlers to a short ledge near a visible stinging-drifter colony. Critical bladder stock always exists on the safe route; optional spending cannot exhaust it.

**Learning/action:** current-bent ribbons and drifting fragments teach upstream/downstream navigation. Watching a crawler scrape a ledge reveals a bead; the initial scanner records the relationship. Scanning is useful guidance, not a compulsory progress bar on every animal. Manual observation also works.

**Payoff/return:** greater air range makes the distant first relay feasible. Repairing it restores circulation, revealing an already-present lee-side passage back toward home. Later thermal protection still needs a small amount of shelf membrane, giving a reason to recognize and revisit a familiar habitat via the new shortcut.

**Failure modes:** waiting for creature RNG, overharvesting living organisms without intended consequences, indistinguishable decorative plants, or needing four identical collection trips. Mitigate with guaranteed shed stock, deterministic initial reveal, obvious source silhouettes and one purposeful early return. Test whether players can name the source and find it again without a waypoint.

### B. Suspended garden: information versus exposure

**Place/source:** conductive crust grows on corroded observatory grounding fins beneath suspended roots. A three-fin clamp hunter investigates mechanical vibration; it patrols the same structures because scavengers shelter there. Common alloy is available elsewhere; concentrated conductive crust is native to this region.

**Pressure/choice:** the direct route saves oxygen but passes the hunter's listening pocket. A quieter high route is longer and better lit. The swim impeller helps the long route but its boost is noisy. A survey pulse reveals grounding-fin silhouettes through silt while attracting investigation. A reusable low-power listening mode reveals the hunter's direction without outlining every object.

**Learning/action:** the first safe overlook lets the player watch a loose machine trigger an investigation. The hunter fans its shell and clicks before pursuing. Player options are glide through cover, pulse then relocate, spend a crafted decoy, or retreat. It disengages at a readable terrain boundary; it never turns a refuge into a death camp.

**Payoff/return:** crust and shelf membrane craft the environmental liner; relay two provides air, fabrication and a safe acoustic alcove. The corridor that felt opaque becomes understandable through landmarks and listening. A later visit can be shorter or richer because the player knows the animal, not because the animal disappears.

**Failure modes:** “punish any tool use” encourages inactivity; unavoidable darkness demands pulses yet punishes them; arbitrary aggression feels unfair. Maintain readable unassisted routes, a generous warning/recovery window and multiple viable solutions. Measure whether players intentionally change approach after observing the rule, rather than merely tanking damage.

### C. Furnace rift: turn ecology into the finale's solution

**Place/source:** ceramic flakes form on cool chimney flanks; thermal crystals occur in exposed warm seams between periodic plumes. The safe pre-liner access pocket contains all prerequisite materials. Fully exposed inner seams reward protection and route knowledge rather than supply their own prerequisite.

**Pressure/choice:** the liner permits brief hotter crossings but never abolishes heat. Passive sail migrators ride alternating current lanes; tiny drifters and suspended grains indicate the next shift. The impeller provides short cross-current bursts; fast travel risks missing a cooling pocket. Choose a longer sheltered flank or a timed direct crossing.

**Learning/action:** an overlook presents a small version of the final maneuver: observe a plume, move into its lee, then cross during the lull. Scanner notes explain the pattern after discovery without replacing the visible cue. A failed attempt permits retreat; no unavoidable damage during a long interaction animation.

**Payoff/return:** crystal and conductive crust retune the guide network. The finale recombines previously learned current timing, mobility and listening to escort the player through the migration toward the ascent beacon. Restored relays serve as preparation stops. Finale awe is earned by understanding and participating in the system, rather than watching newly spawned large fish after pressing a button.

**Failure modes:** mandatory waiting, invisible turbulence, an escort NPC that gets stuck, a finale requiring a consumable the player exhausted. Keep timing windows frequent, model migration as robust paths rather than fragile escort AI, guarantee permanent-tool solutions, and test failure/resume at each stage.

## Interview follow-ups and testing hypotheses

After the user's emotional/setting answers: should mastery make old territory comfortable, or should it remain unsettling? Do they want restorative ecological stewardship or utilitarian survival? Is an ice ceiling appealing or claustrophobic? Should industrial ruins dominate, or natural geography with sparse human traces? Would they rather have one sophisticated predator and four functional species than six equally shallow types?

After scope answers: is 30–45 minutes a complete game or the first chapter? Which two systems may receive most complexity: living ecology, crafting/loadouts, navigation/infrastructure, environmental mystery? Should both relay leads be visible initially, and can their order vary? Are alternate routes equipment choices or merely optional scenery? What loss makes retreat consequential without discouraging curiosity?

**Playtest hypotheses, not proof:** first-time players infer one resource source, learn one animal rule, select between two viable routes, and understand one return-trip improvement. Record observed route choices, source recall, failed excursions, time spent on empty travel/repeated harvesting, reasons for retreat, oxygen remaining on successful returns, and whether a tool changes behavior. Ask players what they intended before interpreting telemetry. Run new-player sessions before claiming pacing or fun; a developer's practiced completion proves reachability only. Refine the design from observed boredom/confusion/tension, then bring the full revised input back to the user before submission.
