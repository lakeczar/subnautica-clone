# Integrated expedition contract

This document reconciles the world, fleet and story plans. It is the authority for cross-system capability dependencies; source habitats live in [WORLD_PROGRESSION.md](WORLD_PROGRESSION.md), hull roles and recovery in [FLEET_AND_SURVIVAL.md](FLEET_AND_SURVIVAL.md), and revelation meaning in the labelled writer appendix linked from [STORY_DESIGN.md](STORY_DESIGN.md). Numbers are initial authored tuning values, not measured balance. Preserve the dependency relationships when tuning them.

## One world, two viable expedition strategies

The seven region IDs and eight material IDs in the world plan are shared content identifiers. Assets, scans, recipes, resource nodes, map leads and story evidence must refer to those same definitions. The six named craft are the fleet baseline. Finish all six distinct roles, but let a player finish the main story without building them all.

Early personal mobility plus island workshops provide the first hull. An upgraded Creel with restored service stops is a viable independent-expedition route. A midcampaign Hearthline carrying a Mantle is the more comfortable carrier route. Both require meaningful knowledge and preparation. Neither requires a Hush, Spindle or every optional module. Every optional hull must have at least one tested expedition where a player can explain why they preferred it.

## Reachability before protection

| Capability step | Reach available before crafting | New material/capability gained | Resulting access |
| --- | --- | --- | --- |
| Pod and shore preparation | Safe reef and walkable islands; ordinary hand collection | Alloy scraps, glass, shed membrane, food; basic gear and first hull fabrication | Short dives and first powered expeditions |
| Upper Canopy investigation | Early safe routes no deeper than 150 m; food, air and return reserve | Crust on exposed fins and cured resin in lee pockets | First reinforcement uses only these five early materials; reaches 350 m |
| Rift shoulder expedition | 350 m configuration; cool flank and inactive shoulder routes | Ceramic at 250–285 m; thermal core at 280–320 m | Pressure/service refit reaches 450 m; thermal equipment improves alternate routes |
| Divide ledge expedition | 450 m configuration; flushed exterior ledges with no chemical-protection prerequisite | Lattice at 360–390 m | Deep service package reaches 800 m, including personal exit protection; large hull tops out lower |
| Deep district expedition | Deep craft or upgraded Creel, prepared service stops and earlier-source repair stock | Investigation, routes and facility repairs | Finale combines learned capabilities; no newly invented endgame resource |

At each step, the leading depth limit exceeds the first deposit's depth. That establishes a proposed acyclic depth dependency, not oxygen, energy or stocking proof. During implementation validate a normal-control round trip, useful cargo, readable retreat and at least 25% remaining oxygen/power on the conservative intended approach; tune margins from playtests. Discovering a narrow shortcut must not be the only way to survive the first visit.

Blueprints for a capability are at or before its source tier. A first heat-protection recipe cannot be behind a heat-only route. A fleet blueprint cannot require that same vessel's handling tool. A dormant facility may need a portable service assembly; that assembly must have a reachable fabrication location and a carrier-independent transport option.

## Hull and personal protection envelopes

| Hull | Initial rating | Planned maximum | Useful constraint at late progression |
| --- | ---: | ---: | --- |
| Dart | 180 m | 350 m | Quick local reconnaissance and rift-edge collection; cannot enter the deepest district |
| Creel | 240 m | 800 m | Refits at 350, 450 and 800 m; deep version trades cargo/comfort for service protection and needs sheltered approaches |
| Hush | 220 m | 450 m | Quiet canopy/brine-edge observation, poor exposed-current authority |
| Spindle | Surface | Surface | Island supplies and solar charging; stays dry inside the carrier |
| Mantle | 800 m | 800 m | Requires already-reachable ceramic, core and lattice; better protected work and station keeping than adapted Creel, no home cabin |
| Hearthline | 400 m | 550 m | Midcampaign home and transport; stops at moorings and sends smaller craft onward |

The initial Hearthline uses the five early materials, substantial recovered frames and complementary workshop/basin blueprints reachable with an early hull. Its thicker, costly structure achieves 400 m without requiring late materials. Its 550 m refit uses ceramic and lattice already accessible at 400 m. The Creel's intermediate 450 m package uses ceramic/core; its 800 m package uses lattice as well. Hull rating, chemical/thermal tolerance, useful range and player suit rating are separate fields.

Early gear supports unprotected short dives to 60 m and a basic pressure suit to 150 m from early reef/island materials. Each later pressure-research tier exposes the corresponding personal suit refit, with its materials included in that tier's expedition budget. A craft rated to 800 m is not enough if the mission requires a diver to exit there: the 800 m service package includes the suit refit. Show both limits during preparation. Dry docking to an air-filled station avoids exposure only when the full pressure-lock transition is implemented.

Hearthline moorings are proposed at Canopy 160 m, Basin 240 m, cooled Rift 300 m and Divide lee 390 m; its upgrade opens a district shelf at 520 m. These turn the carrier into a staging home without letting it replace a small craft in every location. Construction and refits occur at supported docks with visible clearance; the largest hull's material workload remains substantially greater than a specialist's.

## Recipes, logistics and replenishment

Before implementing the progression tree, the coordinator creates one machine-readable recipe/source registry from these dependencies. Choose actual quantities and guaranteed source yields together. Every recipe lists a discovered blueprint, fabrication site, material function, output, cargo volume and reversible/module-transfer behavior. Keep common parts shared. An intermediate component earns its place only when it creates a meaningful production/logistics choice or has several uses.

For each mandatory build/refit/final repair, check stock reachable with the preceding tier, one credible optional purchase, and one failed recovery. At least two matching source patches must cover critical materials. Basic recovery stock replenishes without a forced wait; finite protected caches have an explicit maintenance purpose. The quantity ledger must include personal suit upgrades, power reserves and final repairs, not just hull frames.

Bulky wreck frames make the work-sub valuable, while smaller salvage and recovery paths keep its own construction possible. The carrier should combine materials gathered during several different investigations; its workload is not repeated visits to one alloy pile. Retain earlier material relevance through seals, instruments and service assemblies. Record collection time and repeated hauling during ordinary-input playtests; reduce quantities, improve payloads or open logistics shortcuts when costs produce repetition instead of decisions.

Food is the only nutritional meter. Prolonged starvation can harm health after clear warning, with accessible emergency staples and recovery grace. Wild food, quick cooking and small onboard crops give convenient alternatives. There is no thirst, mandatory water collection, meal spoilage timer or population-scale meal grind.

## Wildlife, loss and knowledge

The owner selected observation, stealth and deterrence. Threats react to legible behavior such as acceleration, active scans or disturbing feeding structures. Use directional warnings, disengagement opportunities, cover, quiet movement, decoys and defensive equipment. Hunting is not a progression tree and mandatory upgrades never require killing a predator. Edible small fauna and plants support food without turning rare wildlife into farming targets.

Knowledge survives incapacity. Every hazardous route must retain an escape/recovery plan when all advanced craft are disabled. Bobbin uses shallow-built equipment, approaches locally through authored tether corridors, and attaches to standardized rescue fittings. It cannot operate story machinery, mine bulk resources or carry the player. Its camera may reveal whatever is actually visible; early discoveries still count.

Before placing a deep loss-capable site, demonstrate its rescue staging approach with starter gear, its complete tether route and a safe tow or in-place salvage outcome. A reusable kit and recoverable critical modules prevent an unrecoverable second loss. This is a level-design constraint, not a promise that an arbitrary cave automatically supports retrieval. Body/cargo recovery markers indicate previously visited loss sites only.

## Shared narrative and art checks

Every C01–C15 clue has a physical placement in the world plan. Its true meaning and visibility rules belong to the writer appendix. Essential facts have independent corroboration and local recovery sources; optional personal entries cannot become mandatory interaction flags. Record early discoveries immediately and adapt the notebook's interpretations. The internal machinery route is distinct from the world's exterior approach ledges.

Species, source materials and human infrastructure explain each site's layout. Scans describe behavior actually implemented. Sol artists use the selected richer cel palette and shape language, then revise assets at playable milestones for visibility, functional scale and coherent habitat. Geometry detail does not substitute for interaction, collision or ecological behavior.

## Required integration evidence

The future build must demonstrate both fleet strategies, all six hull niches, the midcampaign carrier, dry carrier transport of Spindle with another craft's launch, safe blocked launches, save/load during docking, personal-suit exit limits, food access from no inventory, all-advanced-hulls-disabled recovery, and a main-story finish without all optional vessels or logs. The planning arithmetic alone proves none of those runtime behaviors. The first-time duration and enjoyment target require observed human playtests.

## S9 campaign registry: adopted quantities and changes (2026-10-20)

The registry now carries the whole campaign (`src/content/campaign/*`). The depth shelves above hold unchanged on S2's sites: ceramic at 258/266 m, core at 289/290 m and lattice at 366/375 m, two first-access deposits each, none needing heat or brine protection. Each sits under 90% of the preceding configuration's rating. `src/sim/campaignEconomy.ts` and `scripts/check-campaign-economy.mjs` check the quantity rules. They cover required progression, a credible optional spend and a failed rescue together, on finite stock with zero renewal, for both strategies. Recorded changes and their reasons:

| Change | Reason |
| --- | --- |
| Hearthline is built in two stages at the stack-yard berth. The keel (Basin frame survey) costs 2 tagged frames, 16 alloy and 6 resin. The fit-out (workshop plans) costs 6 alloy, 8 glass, 8 membrane, 8 crust and 4 resin. | This makes the two complementary plans two separate expeditions. It holds frame demand at 6 of the 10 frames, so losing any one frame host still leaves the carrier buildable. Glass and membrane are the binding materials at zero renewal. |
| The Hearthline 550 m refit costs 10 ceramic and 6 lattice. It uses no membrane. | Both materials are reachable from the 400 m hull with the 450 m suit. Dropping membrane keeps the membrane margin. |
| The Mantle costs 8 ceramic, 4 core, 5 lattice, 8 alloy, 3 glass and 4 crust. It needs no frame and no Hearthline (S5 proposed `needs: hearthline_400`). | The Mantle's requirement is the three late materials. A Creel-route player may build one as an optional craft. The carrier route still builds it after the carrier. |
| A third restored stop, the Ember Rift materials station, costs 4 alloy, 2 glass, 2 membrane and 2 crust. The Divide upper service dock costs 3 alloy, 3 glass, 3 crust and 2 lattice. | Each stop is paid in one diver load, because its locker is shut until it is restored. Both give air and charge on the Creel route between the Basin and the district. |
| The Creel refits cost 6 ceramic, 2 core, 2 crust and 2 membrane for 450 m, and 8 ceramic, 5 lattice, 3 core and 2 glass for 800 m. The suit refits cost 4 ceramic, 2 membrane and 2 crust for 450 m, and 4 ceramic, 4 lattice, 1 core and 1 membrane for 800 m. | The 800 m Creel refit and the 800 m suit share the deep-service plans. That keeps the rule that the 800 m package includes personal exit protection. |
| S4's protections and kits are registered at S4's costs. The heat shroud and lining use the cool-flank research plans. The brine seals use the deep-service plans. The trim vanes use the Canopy reinforcement plans. The lures and ink use the reef recovery plans. | One registry. Each protection's plan sits at or before its source tier. |
| S2's 950 m deep Bobbin tether is a small shallow-stock recipe: 2 membrane, 2 alloy and 1 resin. | This follows "recovery kit from shallow materials". |
| The ledger counts the plume-side core seam only with heat protection or a Mantle, although S2 says plume timing also works. | Conservative. |

Not modelled: the Creel 800 m package's cargo-and-comfort trade-off (no hold penalty yet), and a Hush 450 m refit (the Hush stays at 220 m).
