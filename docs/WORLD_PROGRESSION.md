# Siltwake — geography, ecology and expedition progression

Status: integrated design proposal for coordinator review, not implemented content. The owner selected an open alien ocean with islands, a broad specialist fleet including an inhabited carrier, food without thirst, recoverable expedition failures, richer cel shading, regional clues and roughly ten hours of main story. Distances, depths, density and pacing below are **untested tuning hypotheses**. Construction still awaits review of the final input. Clue IDs reference the writer's canonical graph without disclosing their meanings.

## A connected place

Author a compact coastal basin approximately 2.0 × 1.8 km, descending to 780 m. This is a layout envelope, not a required expanse of traversable empty water. Island geology, currents and historical infrastructure explain the seven habitats. The basin's rim supports shallow refuges; descending shelves provide several approaches; fractured southern ground connects to deeper works. An inaccessible distant horizon sells an ocean larger than this playable district.

| Stable region ID / working name | Proposed extent | Recognizable geography and human presence | Expedition role |
| --- | --- | --- | --- |
| `refuge_reef` / Hearth Reef | 0–65 m; northwest shelf | Twin curved limestone-like ribs, luminous fan terraces; refuge pod and a small intake installation | Safe orientation, current reading, membrane sources; preparation remains useful throughout |
| `island_chain` / Splitspine Isles | Land to +95 m; surrounding water 0–90 m, north/east rim | Three walkable islands: a split sea stack, low workshop island and storm-cut headland; fabrication yard, field shelter, damaged mast | Food preparation, land exploration, early craft fabrication, later evidence reinterpretation |
| `suspended_garden` / Lantern Canopy | 55–220 m; eastern descending shelf | Buoyant fronds tethered to mineral ribs form open upper crowns and narrow lower passages; suspended small laboratory | Choose clear high routes or quiet low routes; study acoustics and collect resin/crust |
| `silt_basin` / Pale Basin | 150–380 m; central bowl | Fallen survey dishes rise above rippled sediment; drowned dormitory and boundary station | Read visibility and sediment, salvage deliberately, establish a useful carrier anchorage |
| `thermal_rift` / Ember Rift | 250–540 m; southwest fracture | Split chimney and pale cool ledges surrounding warmer passages; compact materials station | Thermal timing, first ceramic/core stock and power adaptation; bypass toward deeper approaches |
| `brine_divide` / Mirror Divide | 360–650 m; southern saddle | Shimmering horizontal interfaces, fractured ridge, tall gateworks and an upper service dock | Read dense-water boundaries, choose flank or narrow bypass, obtain lattice stock |
| `deep_district` / Meridian District | 520–780 m; southeast terraces | A larger research settlement with recognizable terraces, service galleries and protected interior sites | Combine earlier navigation and service skills; resolve the main investigation |

These regions overlap in depth and connect geographically; depth is not an invisible chapter boundary. Hearth Reef joins both the Isles and Canopy. Isles → Canopy → Pale Basin → Hearth Reef makes the first loop. Pale Basin joins both Ember Rift and Mirror Divide; a cooled rift flank reconnects to the Divide. The Divide reaches Meridian by a broad exterior approach and a narrow exterior service ledge. A surveyed outer escarpment returns from Meridian toward the Canopy at comparable deep-water exposure: a useful alternate line, not a free shallow exit. These exterior routes do not bypass the story's internal machinery boundary; the writer appendix defines that boundary separately.

Carrier navigation uses broad shelf corridors, mooring bowls and turning spaces. Narrow canopy roots, island shoals and service galleries reward smaller vessels throughout. Never shrink a corridor during an authored event around a parked carrier. Reveal clearance and mooring suitability before committing. At the deepest works, the home vessel stays at a safe staging shelf while a suitable smaller craft or suited diver completes local tasks.

## Density and route learning

Initially sketch inter-site legs of 250–600 m, then tune them against actual craft speed. Aim for roughly 45–120 seconds of ordinary powered movement between meaningful observations, route decisions or destination approaches; this is not a mandatory event timer. Swimming legs inside a site should be much shorter. A major silhouette should orient the player before fine detail loads. Travel across a solved route should consume less time after a shortcut, faster craft or relocated home becomes available.

Each habitat needs a landmark, a readable environmental rule, a principal investigation site, a local resource context and a quiet preparation pocket. Side sites earn their space through a distinct route, useful equipment option, human detail or ecological observation. Do not fill a ten-hour target with hundreds of interchangeable collectibles. If a route is empty, shorten it or relocate its destination before adding decorations.

Regional leads describe a landmark and an observable condition: “below the split chimney, where pale fans still open.” Discovered locations can receive player markers; undiscovered objectives are not exact-coordinate pins. Observation, scanner entries and notebook sketches reinforce the same geography. A voluntary hint sharpens a known regional lead without revealing the mystery.

## Materials belong to source conditions

Only these eight shared material IDs define the proposed progression economy. Food is separate. Coordinator-owned recipes must justify each ingredient's function; avoid single-purpose intermediate items. Sources below describe stock, not an obligation to harvest every species.

| Material ID | Primary recognizable source; secondary access | Relevance and useful revisit |
| --- | --- | --- |
| `structural_alloy` | Exposed, tagged maintenance wreckage on Pale Basin ridges; smaller recoverable workshop/reef service scraps | Hull frames, fixtures and repairs; work-sub gathering improves bulk logistics without monopolizing essential stock |
| `silica_glass` | Clear nodules exposed by grazers on wave-washed island ledges; matching exposed reef ridges | Windows, instruments and lighting; hand collection stays useful for precise upgrades |
| `flex_membrane` | Shed filter ribbons caught downstream of current-facing reef colonies; corresponding clear-water canopy margins | Seals, flexible gear and habitation fittings; learn direction of flow to locate catch points |
| `conductive_crust` | Mineral-coated grounding fins beneath Canopy holdfasts; secondary fins on exposed Basin survey frames | Electronics, sensors and power routing; quiet access and utility handling offer different efficiencies |
| `buoyant_resin` | Detached, cured nodules below mature Canopy float bladders; sheltered island coves receiving their drift | Trim, flotation and deployable systems; collect cured sheds rather than destroying living anchors |
| `pressure_ceramic` | Pale layers on cooled Ember Rift chimney flanks, including accessible lip deposits | Pressure structures and service equipment; deeper seams improve yield rather than unlock the first protection |
| `thermal_core` | Stable inclusions exposed on inactive Rift shoulders; richer seams beside active plumes | Thermal power/handling options and late service work; timing reduces risk, insulation is another approach |
| `brine_lattice` | Rinsed crystals at Mirror Divide mixing boundaries above the dense layer; richer protected fissures below | Advanced filtration, specialist protection and final repairs; current knowledge identifies safe outer stock |

Initial reef stock supports refuge repair and a first expedition, not the entire technology tree. Island workshops supply early structural material so first transport does not require hauling from the Basin. Secondary sources preserve recognizable geology or infrastructure; they are not identical loot scattered everywhere. Scans explain a source context and likely region once observed. Recipe screens can repeat that knowledge without revealing every deposit.

Provisional prerequisite shelves: ceramic at 250–285 m; core at 280–320 m on cool, inactive shoulders; lattice at 360–390 m on flushed outer ledges. The **preceding** craft/suit configuration must reach and return from these shelves with useful oxygen/power margin before any upgrade using their material becomes necessary. If fleet ratings disagree, move shelves during integration. Do not require thermal protection to collect the first core, chemical protection to collect first lattice, or an upgrade to survive its own crafting source.

## Ecology the player can actually learn

Use a few local state machines and authored habitats, not a whole simulated food web. Their cues must work without color alone and remain consistent with narrative evidence.

- **Filter ribbons** bend into currents and close in dense, sediment-heavy water. Their shed material collects downstream. Clear branches and open fans indicate a promising flank; their absence is a caution, not an instant-death boundary.
- **Ledge grazers** scrape wave-exposed ridges, exposing glass nodules. Existing visible nodules guarantee availability; watching an animal teaches the relationship without waiting for a random drop.
- **Canopy floaters** maintain buoyant fronds; detached cured resin falls into lee pockets. A small school disperses when nearby machinery becomes loud. Both behaviors help distinguish an occupied living habitat from a dead-looking resource shelf.
- **A territorial sound hunter** investigates acceleration, active survey pulses and heavy extraction near its feeding structures. It warns, approaches, commits and disengages visibly. Slow movement, terrain cover, a distraction or a different route can work; no mandatory combat trophy gates materials.
- **Basin scavengers** emerge beside stable wreck ridges and retreat during sediment surges. Their movements and suspended grains reveal plume lanes. Machinery can briefly stir local silt; this is bounded visibility feedback, not persistent fluid simulation.
- **Deep sail animals** follow clear-water lanes above dense layers; small drifting organisms and fan motion provide the same information at ordinary visibility. A player must never wait for a rare giant animal to find the safe route.

Brine threatens through readable visibility, flow and equipment exposure. Ambient low oxygen does not magically consume air inside a sealed diver's tank. Heat and pressure warnings identify the relevant protection and allow retreat. Refuges sit outside pursuit areas; no predator can camp a sole respawn exit. Wildlife remains present after mastery, but observation and infrastructure make familiar territory comfortable.

## Food, power and comfort support expeditions

Food has a survival meter; there is **no thirst meter**. Reef edible schools, island shore crops and later modest onboard cultivation provide different acquisition routes. Familiar food stays useful at every tier. Catching or collecting must be quick enough that expedition preparation does not become repetitive hunting. Reserve staple food at each established refuge prevents a bad recovery from turning into starvation loops; its replenishment cannot require waiting beside a timer.

Growing and cooking improve convenience, storage or efficiency, not survival through a hidden mandatory farming chain. Gatherable food sources need clear silhouettes and preparation instructions. Do not add spoilage without demonstrating a meaningful decision beyond inventory maintenance.

The pod remains a dependable place to store, craft and heal. Restored island workshops and a few small outposts support the route network; a carrier provides movable comfort and reduced hauling. Sanctuary audio, warm readable interiors and visible local wildlife should make returning rewarding. Power budgets must include reserve propulsion and emergency access; a drained vehicle still offers a recoverable expedition problem, not a permanently sealed inventory.

## Preparation, choice and payoff

| Expedition question / clue placement | Preparation and viable choices | Return changes something |
| --- | --- | --- |
| Inspect Hearth intake and Splitspine workshop, C01–C03 | Start with short dives; choose reef source learning or land approach first. Gather membrane/glass and early alloy without a vehicle prerequisite | Stable pod, first fabrication options and two regional leads; later C14 belongs back at the pod |
| Investigate Canopy laboratory, C04 | Scout takes open crowns; quiet survey role favors lower structures; a diver can use refuge-to-refuge hops. Choose loud scan then relocate, or observe a clear flank | Resin/crust, useful environmental knowledge and a new Basin approach; laboratory becomes a respite |
| Trace Pale Basin settlement routes, C05–C06 | Pack food, reserve power and salvage space. Work-sub handles larger salvage; an upgraded scout can hand-collect required stock with smaller useful loads | Interior access options, material efficiency and an anchorage that makes the carrier valuable |
| Follow Rift and Divide approaches, C07/C12 (C09 moved to Meridian's gate hall, beside the machinery it explains; coordinator decision 2026-10-20) | First visit collects safe edge stock. Later choose cooled flank versus timed warm crossing; broad mooring plus deployable small craft versus independent deep service craft | Deeper service capability, an exterior service ledge and a dependable loop home; optional specialists improve approach, not permission to progress |
| Revisit island field shelter, C11 | Bring observations from new regions; land approach and sheltered cove remain available | Better interpretation and a surveyed return route, not another compulsory mineral shopping list |
| Investigate Meridian sites, C08/C10/C13/C15 | Choose an adequately equipped deep craft or carrier-supported sortie. Separate exterior navigation, local interior access and repair preparation | Evidence and practical requirements converge; the finale uses learned habitats, tools and routes |

These are discoverable locations, not a prescribed clue pickup order. Root/narrative integration owns the meanings and final interaction dependencies. Finding late evidence early changes the notebook's interpretation; it does not erase discoveries. Essential information has local redundant records. Personal side journals are worthwhile without becoming a completion tax.

## Scarcity, recovery and completion checks

For each mandatory recipe and repair, calculate guaranteed stock reachable **before** the requirement, after plausible optional spending and after a vehicle failure. Reserve adequate critical deposits across at least two appropriately located source patches. Protected repair caches are finite authored infrastructure with a declared purpose; ordinary nodes replenish at known habitats. Never make forward progress depend on loot RNG, waiting for respawn or scavenging the vessel whose recovery needs that same material.

Discovered blueprints, scans and journal facts persist through failure. Ordinary lost cargo receives a recoverable marker; disabled vehicles retain identifiable location and repair/salvage access. A recovery plan must work with preceding-tier equipment: accessible tow fitting, releasable storage buoy, sheltered approach or service route. Hazardous cargo can be moved to a nearby reachable recovery shelf through an explicit emergency action. Do not secretly respawn everything beside the pod. Multiple losses must not delete earlier recovery targets or create compounding irretrievable debt.

The main route needs an efficient scout-scale option, access to essential utility functions and a viable deep expedition configuration; it must **not** require crafting every specialist. A surface tender makes island logistics comfortable; quiet survey rewards observation; work-sub rewards bulk salvage; carrier rewards extended residence; a remote tool reaches tight fixtures but cannot complete the whole adventure remotely. Root owns final hull roster and costs.

Before approval, test the dependency graph against minimum craft, optional spending, early discoveries and recovery. During construction, measure fresh-player route choice, habitat recall, empty travel, repeat harvesting, retreat reasons and successful return margins. Build a representative linked loop before filling the whole basin. Approximately ten hours must emerge from discoveries, consequential preparation, varied expeditions and resolution; this document alone establishes neither duration nor fun.
