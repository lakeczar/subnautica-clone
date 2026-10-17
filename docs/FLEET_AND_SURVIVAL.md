# Fleet, survival and recoverable expeditions

Status: planning proposal, not implemented gameplay. The owner selected a broader fleet, a large inhabited carrier storing/deploying smaller vehicles, food without thirst, and recoverable expedition failure. Names, loadouts and numbers below are proposals. Coordinate final depths, yields and recipes with the world/progression specification.

The fleet changes decisions: where to stage home, what to carry, how to approach wildlife and which entrance to use. Larger hulls must not obsolete smaller ones. Target six piloted craft and one remote service tool. Approximately ten hours concerns the main story, not constructing every vessel.

## Six craft, six reasons to leave home

| Craft | Silhouette and habitats | Distinct capability | Tradeoff |
| --- | --- | --- | --- |
| **Dart**, compact scout | Short needle with offset observation canopy; reef arches, island channels and garden openings. | Fast reconnaissance, efficient ordinary transit and close landmark identification. Compact berth. | Small hold, no walkable cabin, audible boost; cannot carry large repair assemblies. |
| **Creel**, utility sub | Flat-fronted workboat with guarded tool arms and raised cabin; reef salvage, garden fixtures and basin terraces. | Bulk cargo, powered handling and repairs; optional early mobile-refuge cabin. Medium berth. | Slow and comparatively loud; one major utility mount forces a mission choice. |
| **Hush**, survey glider | Broad crescent with underslung observation blister; garden canopy and current-facing walls. | Low-noise coasting, passive directional listening and observing resource-bearing structures. Compact berth. | Poor acceleration and cross-current authority, small hold, no powered harvesting. |
| **Spindle**, island tender | Narrow surface hull between folding outriggers; island chains and research landings. | Solar endurance, generous dry cargo and a ramp at authored shores. Compact berth when stowed. | Cannot submerge or climb beaches; rough channels require sheltered approaches. |
| **Mantle**, deep service craft | Armored bell with service jaw and side cooling fins; thermal/brine margins and district passages. | Sustained protected work, precise station keeping and heavy repair interfaces. Medium berth. | High power demand, restricted view, modest cargo; no home interior. |
| **Hearthline**, inhabited carrier | Wide twin-keel hull around a central launch well; broad garden/basin waters and deep-border staging. | Furnished home, substantial logistics and internal vehicle storage. | Large turning envelope, noise, power cost and restricted channels. Cannot enter final narrow access routes. |

Dart remains the quick local explorer after acquiring Hearthline. Hush approaches acoustic-sensitive sites with less disturbance and helps identify useful deposits through observation; every predator need not share one hearing rule. Spindle turns island trips into supply journeys and comfortably carries camp equipment. Its surface route is an alternative, never an exclusive key to the first island.

Creel exchanges a major mount between cargo rack, powered service head and refuge cabin package. The cabin provides a bunk, small cooker and locker in a fixed dry compartment, sacrificing cargo/tool capacity. Its basic pilot compartment remains pressurized in every configuration. Exchange modules at supported moorings without destroying their materials. This first inhabited configuration should be attainable well before Hearthline.

Mantle works comfortably where an adapted Creel needs sheltered approaches and brief exposed crossings. Neither eliminates plume timing, current cues or hull warnings. Depth rating alone never grants heat, brine and wildlife protection. Small craft have two equipment sockets for competing choices such as reserve power, cargo, directional survey equipment or nonlethal distraction. Show both benefit and sacrificed alternative. Avoid a separate currency or resource family for every vessel.

## Earn the carrier while a journey remains

Introduce Hearthline's incomplete construction berth and recognizable silhouette early. Recover its design through complementary workshop and basin investigations, then complete construction around the campaign's middle, subject to first-time playtests. It should support several substantial expeditions before the ending. It requires neither late district resources, every other hull nor solving the central mystery.

Use shared materials for legible purposes: `structural_alloy` frames, `silica_glass` windows, `flex_membrane` seals, `conductive_crust` controls and `buoyant_resin` trim. `pressure_ceramic`, `thermal_core` and `brine_lattice` support later tolerance/efficiency modules, not the initial carrier. Their source contexts belong to the world document; do not invent interchangeable deposits beside home.

Budget hull effort in useful expeditions. Initial relative workloads: compact hull one, Creel two, Mantle three, Hearthline five. Five means complementary components gathered during different investigations, not five identical alloy trips. A compact hull's stock should fit one purposeful collection route. The carrier combines substantial frame recovery with workshop and basin components collected alongside clues. Reconcile quantities with cargo capacity and guaranteed yields before adopting them.

Building a larger ship never consumes a smaller vessel. Early furnishings, power modules and storage transfer to compatible mounts or remain useful at forward outposts. Optional dismantling returns ordinary parts with a clear preview; advanced modules transfer intact. Avoid rebuilding identical upgrades solely to retain progression.

One viable main path uses upgraded Creel and restored service stops, taking the cooled rift flank and narrow exterior service ledge. Another uses Hearthline as a staging home and Mantle for protected local work or harsher outer approaches. Dart, Hush and Spindle improve different tasks without becoming a compulsory shopping list. Both paths support final repair cargo without repeated ferry chores. Hearthline is desirable for self-contained expeditions, comfort and flexible deployment rather than an exclusive plot lock.

Working world integration: Hearthline's normal rating is 400 m, upgraded 550 m. Proposed moorings are `suspended_garden` at 160 m, `silt_basin` at 240 m, the `thermal_rift` cool flank at 300 m and the `brine_divide` lee at 390 m. An optional 520 m `deep_district` staging shelf rewards its upgrade. `refuge_reef` and `island_chain` support fabrication and early recovery. These are coordination targets, not validated balance.

## Storage, boarding and launch

Hearthline has **two compact berths or one medium berth**, reconfigured only while empty at a supported dock. Dart, Hush and folded Spindle take one compact berth each; Creel or Mantle uses the medium configuration. No unlimited hangar. Berths are dry, pressure-isolated compartments; a separate launch lock floods for one craft at a time. This allows the surface-only Spindle to travel safely inside a submerged carrier without exposing it when another craft launches. Spindle deploys only at the surface. A silhouette preview states fit, clearance and payload before construction or boarding.

The walkable interior has a fixed bridge, short passage, cabin/galley, fabrication locker and launch vestibule. Customize furniture/equipment on authored sockets. Windows show the exterior; storage belongs to persistent containers. Do not promise arbitrary room extensions or physics for loose objects.

Baseline: stop and engage station keeping before leaving the helm, boarding, changing loadouts or opening the bay. Resume piloting once seated with the bay closed. Dock through a visible low-speed approach corridor, followed by a short guided capture. An attached craft uses a parent-local berth transform with independent propulsion/collision disabled. This requires implementation and tests, not merely a convincing animation.

Launch validates the entire exit volume, carrier state and destination water. If blocked, explain why and preserve the docked craft. Transactional detachment creates exactly one independent vessel with its cargo, charge and damage. Saving during capture/launch must resume or roll back without duplication. A dry vestibule prevents breath-meter transitions from killing the player during valid boarding.

Walking inside a moving ship is a separate technical spike: test collisions, camera jitter, attached vehicles, persistence and world-origin changes. Adopt it only if it passes on target hardware without destabilizing the campaign. Stationary walkable interiors remain the baseline mobile-home experience. Anchoring should be quick rather than a long repeated animation. Never claim underway walking is implemented before verification.

## Survival that prepares an expedition

Oxygen, depth, power, damage and food matter. **There is no thirst meter or drinking-water dependency.** Food provisions an expedition without becoming a second oxygen countdown. Recognizable reef edibles and island plants supply meals before vehicles/farming. Gathering food requires no tool whose recipe depends on being fed.

Propose a satisfying meal lasting roughly thirty to forty-five minutes of normal activity, with early warnings and a generous reserve; these are tuning hypotheses. To honor classic survival, prolonged starvation eventually drains health. First stop passive healing and reduce strenuous sprint recovery while preserving normal swimming and gathering; only after a clearly warned grace period begin slow health loss. Oxygen, exposure and injury remain the faster expedition risks. Recovery returns the player fed enough to reach guaranteed local staples, and accessible refuge emergency meals prevent an empty-inventory starvation loop. Avoid stacking hunger with unavoidable breath penalties.

Cooking is one interaction with selectable portions. Stored meals do not decay on an inventory timer. Small galley planters supplement dependable wild sources; they do not demand agricultural micromanagement or gate recovery. Sleeping must not spend food merely to bypass production waiting. Pause drains when the game is paused or an interrupting cutscene prevents control.

The pod always supplies storage, basic fabrication, reliable air and gradual healing. Fixed outposts stay modest: rest locker, charging point and one specialized service. Vehicle habitats offer convenience/range; restored charging infrastructure reduces solved-route friction. Solar favors Spindle, thermal charging requires a suitable safe mooring, and portable batteries serve compatible equipment. Avoid a perpetual generator that erases all power decisions.

Warn before failure through hull creaks/stress bands, power reserves, environmental cues and pre-pursuit animal behaviors. Emergency propulsion supports retreat but is not normal free energy. Provisioning should create a manageable cargo choice without inventory sorting overwhelming discovery. Narratives never advance while the player is helplessly taking unavoidable survival damage.

## Recovery without erasing the expedition

Incapacitation returns the player to the last valid refuge; if their registered mobile refuge is unsafe, use the starting pod. Preserve discoveries, scans, annotations, blueprints and story facts. Retain essential personal tools. Drop a limited, identified share of ordinary cargo in one persistent recovery cache. Story knowledge never becomes a destructible inventory object.

A disabled vessel stays at the loss site with cargo, modules and a transponder. Damage disables systems rather than deleting the only advanced hull. An unpowered cabin has a labelled emergency air reserve, not unlimited breathing: escape and return prepared. Recovery markers identify visited loss locations, not undiscovered sites.

**Bobbin**, the only remote service tool, is a pressure-equalized tethered unit for close inspection, salvage attachment and reconnecting disabled hulls. Its recovery kit needs only reliably replenishable shallow materials and pod-available power. It carries no passenger, story scanner or bulk miner, so deep pressure resistance cannot substitute for exploration vehicles. Tether-camera observation may reveal ordinary visible facts; never censor already observed evidence to enforce story order.

Every advanced-vehicle route needs a surface-accessible or starter-equipment-accessible rescue staging point and a tether corridor to potential loss sites. Bobbin must reach them even when all deep-rated craft are disabled. Its full recovery tether is available from shallow materials, not the endangered region. Route the tether through authored guides instead of simulating rope snags. Operate locally from the staging point, attach a rescue collar and guide the vessel to a nearby safe repair mooring. Exterior fittings remain reachable when an interior doorway is obstructed.

A hull wedged in a corridor can be salvaged in place: retrieve its advanced modules intact and cargo in pressure canisters, then rebuild its ordinary frame from reachable stock. If advanced frame materials are required, their salvage return must cover rebuilding them too. Document these options before the player commits scarce materials. Do not require a second fully upgraded copy of the lost ship.

Recovery still requires regional travel, local hazard navigation and attachment; no world-wide summon. Tow movement may use guided routes and combined collision proxies rather than simulated ropes. Critical materials never disappear with an inaccessible wreck. Home retains guaranteed, replenishable basic stock for food access, essential tools and rescue equipment; optional spending cannot consume the last recovery path. Exact safe rescue bearings belong in world layouts and must be validated at every hazardous depth.

Check the whole chain: death inside the carrier, all advanced hulls disabled, depleted batteries, cave wrecks, blocked hatches and repeated failures. Reserve supplies cannot be exhausted by one unsuccessful rescue. Use a reusable shallow-built rescue kit and recoverable pressure canisters so failure costs travel/preparation and some ordinary cargo, rather than forcing an unrecoverable restart.

## Evidence required during construction

Test a meaningful expedition with every craft, both main-path fleet choices, carrier acquisition before the final act and transfer of an early refuge loadout without wasted progression. Observe whether players choose a craft for a reason they can explain. Verify docking interruption/save states, blocked launch, loss of the designated mobile refuge, deep recovery using shallow-built equipment and food access from an empty inventory. Duration, comfort and usefulness require fresh-player playtests; neither a fleet table nor a scripted demonstration establishes them.
