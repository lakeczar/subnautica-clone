# Creature field guide and found notes (CB-2)

**Status:** CB-2 proposal, 2026-10-22, for builders to lift. It sits under [GAME-DIRECTION](../build/GAME-DIRECTION.md) → *Creatures* (owner-confirmed), which wins on any conflict. Index: [BIBLE](BIBLE.md). Not wired into the game.

**Data:** [`fieldGuide.ts`](../../src/content/proposals/fieldGuide.ts) (one journal entry per species), [`fieldNotes.ts`](../../src/content/proposals/fieldNotes.ts) (found notes), [`fauna.ts`](../../src/content/proposals/fauna.ts) (where creatures leave things, plus CR-1's ID snapshot). Checked by [`tests/creature-lore.test.ts`](../../tests/creature-lore.test.ts).

**What the player learns, and how:**
- The **field guide** shows an entry once an animal is seen (or scanned, for the hard-to-notice ones). The first line is always the practical hint; diet, leavings, spawning, behaviour and what you may take follow, in the scanner's observational voice.
- **Found notes** (cook's notebook, trapper's tally, season logs, spawning and tide records, crew notes, chalk boards) hint at roe beds, moult and shed grounds, trap spots, carcass falls and the threats' natural windows. They name a landmark and an observable condition; they never place a marker or give a coordinate. Five sit on the main path and are always readable; ten are records inside lost sites and read only after their decode.
- Every note is dated before the disaster. Nothing here is a story clue; nothing reveals the story.

## Rules the data follows (test-enforced)
- **Protection.** Every species has one of six protection classes:
  - `food`: Common fish: it and its roe may be taken.
  - `spawn_only`: Roe may be gathered; the school is left alone.
  - `shed_only`: Take what it leaves, never the animal.
  - `observe`: Nothing to take.
  - `protected`: Protected: nothing is taken from it, its young or its eggs.
  - `remains`: Never reachable alive; its falls are salvage.
- **Threats, rare residents and story animals** are `protected`. Their entries never read as food: no catching, cooking, netting, gathering or collecting words, and nothing listed as a yield. Their eggs are `protected_spawn` placements with no item.
- **Every ground is regrowth-style** (CR-1): stock regrows to a cap on its own timer. Notes speak of beds that "refill" or "come back", never of waiting for a season.
- **Every threat has a natural window** with CR-1's cycle ID, taught by an always-readable note at the nearest stop or lab and by its field-guide hint.
- **Every placement is hinted** by at least one note, through a landmark within 200 m whose name appears in the note's own words.
- **Placements** sit on today's floor or in open water, in their region, outside every built and proposed cave unless they declare the cave, and carcass falls stay 30 m or more off every route.

## Matching CR-1
CR-1 (`t3/natural-threat-windows`) owns the mechanics. Its interface note (`docs/build/streams/CR-1.md`, `50642f5`) published the item, ground, fall and cycle IDs; `CR1_INTERFACE` snapshots them, and the test compares the snapshot with the composed registry whenever CR-1's rows land.
- **Items used:** `small_fish`, `roe_cluster`, `planter_feed`, `hand_net`, `mod_fish_trap`, plus the existing materials `flex_membrane`, `buoyant_resin` and `conductive_crust`. No new material.
- **CR-1's IDs** (`owner: CR-1` below): this bible proposes a position and the in-world read. CR-1's final positions win; the notes name landmarks, so a move of a few tens of metres keeps them true.
- **New IDs for CR-1 to adopt** (`owner: CB-2` below): `reef_trap_ribs_lee`, `isles_trap_stack_east`, `hub_fish_crown`, `hub_ray_eggcases`, `basin_trap_ridge_north`, `rift_crawler_moults`, `divide_picker_moults`, `meridian_scavenger_casts`.
- **Trap spots** have no item. They are ledges where fish run past a trap outpost. Proposal: a trap catches at its full rate within about 60 m of a fish ground or trap spot, and slower elsewhere. That rewards the trapper's tally without making the trap a chore.
- **Carcass falls** are all `pale_drifter` remains: a huge open-water filter-feeder never reachable alive. That keeps the "never harvest a threat or rare resident" rule intact while the falls give hide, bone and crust as CR-1 salvage.

## Field guide

### Common fish: it and its roe may be taken

#### Reef school (`reef_school`)

*Hearth Reef, Splitspine Isles, Hub spur, Pale Basin · unlocks when seen · existing*

> **Reach in where the school pauses in shade; a net takes two at a time. Roe sticks to the thickest cup beds and the warm side of sheltered coves.**
>
> *Eats:* Grazes the film on cup beds and picks at whatever the fans let drift past.
>
> *Leaves:* Nothing worth collecting, except its roe.
>
> *Spawning and rest:* Lays roe in clusters on dense staple cups and along still cove eddies; the beds fill again on their own after you take from them.
>
> *Behaviour:* Loops the same openings over and over and tightens into a ball when a craft speeds past. Common everywhere the water is clear and shallow.
>
> *Common and quick to recover. Take what you need for a meal; the school carries on.*

Yields: `small_fish` at `reef_fish_ribs`, `isles_fish_split`, `basin_fish_ridge`, `hub_fish_crown`; `roe_cluster` at `reef_roe_nursery`, `isles_roe_cove`.

### Roe may be gathered; the school is left alone

#### Lantern school (`canopy_school`)

*Lantern Canopy · unlocks when seen · existing*

> **Its roe hangs in the fronds of the crowns above the laboratory, in the singer's home water. Gather while the singer is away feeding east.**
>
> *Eats:* Plankton held in the clear upper water.
>
> *Leaves:* Roe strings in the crowns' fronds.
>
> *Spawning and rest:* In the home crowns above the laboratory, where the fronds are densest; the strings regrow after a gathering.
>
> *Behaviour:* Holds in clear water above the dense channel and scatters at loud machinery. A broken school means anything listening has heard you too.
>
> *Gather the roe; leave the school in the water. It is how the crowns tell you something is listening.*

Yields: `roe_cluster` at `canopy_roe_crowns`.

### Take what it leaves, never the animal

#### Ledge grazer (`ledge_grazer`)

*Hearth Reef, Splitspine Isles, Hub spur · unlocks when seen · existing*

> **Follow the fresh scars: glass sits in them, and the grazers' old skins collect in the lee below the ridge.**
>
> *Eats:* The film on wave-exposed rock, scraped off with a hard lip.
>
> *Leaves:* Bright scars with glass in them, and papery moulted skins that make good membrane.
>
> *Spawning and rest:* Out of sight in crevices; young appear on the ledges already grazing.
>
> *Behaviour:* Works a ridge in a line and drifts off when a craft boosts close, coming back once it passes.
>
> *Take the moults and the glass they uncover. Leave the grazers on their ledges.*

Yields: `flex_membrane` at `reef_shed_moults`.

#### Filter-ribbon colony (`filter_ribbon`)

*Hearth Reef, Lantern Canopy, Ember Rift, Mirror Divide, Hub spur · unlocks when seen · existing*

> **Face the way the fans lean and swim downstream: shed ribbons pile in the first sheltered catch.**
>
> *Eats:* Whatever the current carries into its fans.
>
> *Leaves:* Shed ribbons, which the current carries into lee catches. The catches fill again over time.
>
> *Spawning and rest:* Buds new fans upstream of the old ones.
>
> *Behaviour:* Leans into the current and closes in dense or silty water. Open fans mean clear water ahead.
>
> *Take the shed, never the colony.*

Yields: `flex_membrane` at `reef_ribbon_catch_north`, `reef_ribbon_catch_south`.

#### Tide clappers (`tide_clapper`)

*Splitspine Isles · unlocks when seen · new · cave-dweller*

> **When the clapping runs along the wall, hold on or tuck into a side pocket: the surge comes a few seconds later.**
>
> *Eats:* What each surge brings in.
>
> *Leaves:* Empty valves that roll out of the caves into gullies, good crushed for planters.
>
> *Spawning and rest:* On the undercut walls; spat settles in the lines left by older shells.
>
> *Behaviour:* Shut in a rippling run before every surge. A touch closes one shell and nothing else.
>
> *Pick up the empty valves. Leave the living shells on the wall.*

Yields: `planter_feed` at `isles_shed_shells`.

#### Shore buttons (`shore_buttons`)

*Splitspine Isles · unlocks when seen · research*

> **Their cast plates wash into the gully below the button ledges with the clappers' shells.**
>
> *Eats:* Film on wet rock, at the splash line.
>
> *Leaves:* Overlapping plates they outgrow and drop.
>
> *Spawning and rest:* In the splash zone, when the ledges stay wet longest.
>
> *Behaviour:* Clamp shut as footsteps come near and open again after a still minute. Harmless.
>
> *Take the dropped plates. Leave the buttons where they cling.*

Yields: `planter_feed` at `isles_shed_shells`.

#### Resin weavers (`resin_weaver`)

*Lantern Canopy · unlocks when seen · new · cave-dweller*

> **An empty nest has no weaver at the door: that one is cured resin and free to take.**
>
> *Eats:* Small drift caught in the hollows.
>
> *Leaves:* Nests packed from shed resin, abandoned when the weaver moves on.
>
> *Spawning and rest:* Inside occupied nests; the young move out to start their own.
>
> *Behaviour:* Freezes at loud machinery and backs into the nest under a direct lamp.
>
> *Take empty nests only. An occupied nest has a weaver at the door; leave it.*

Yields: `buoyant_resin` at `canopy_weaver_resin`, `canopy_rootways_weaver_resin`.

#### Ember mites (`ember_mites`)

*Ember Rift · unlocks when seen · existing*

> **When the lip is bare, the plume is coming. Their grit drifts onto the cool shoulder balcony facing the split; collect it there, away from the lip.**
>
> *Eats:* Mineral film on the chimney lip.
>
> *Leaves:* Fine dark grit that settles on cooler ledges below, crust-rich.
>
> *Spawning and rest:* In the warm lip itself; nobody reaches it.
>
> *Behaviour:* Leaves the lip a few seconds before every vent and returns after.
>
> *Sweep the grit from the cool ledges. Leave the mites to their lip.*

Yields: `conductive_crust` at `rift_mite_grit`.

#### Basin scavengers (`basin_scavengers`)

*Pale Basin, Meridian · unlocks when seen · existing*

> **An empty lane is a plume lane. Their casts heap at the burrow mouths; planters grow faster for them.**
>
> *Eats:* Anything that settles near stable wreckage, and every fall that comes down.
>
> *Leaves:* Coiled casts at the burrows, the best planter feed in the basin.
>
> *Spawning and rest:* Deep in the burrows, where nothing else goes.
>
> *Behaviour:* Feeds beside stable ground and backs into the burrows before a sediment surge or loud machinery.
>
> *Take the casts from the burrow mouths. Leave the burrows and the scavengers in them.*

Yields: `planter_feed` at `basin_scavenger_casts`, `meridian_scavenger_casts`.

#### Kiln crawlers (`kiln_crawler`)

*Ember Rift · unlocks when seen · new · cave-dweller*

> **When they file into the cracks, the tube is about to breathe heat; wait in a niche or take the cool tube. Their moults line the cracks of the cooler walls.**
>
> *Eats:* Mineral film on warm tube walls.
>
> *Leaves:* Pale moults packed into wall cracks, good crushed for planters.
>
> *Spawning and rest:* In the warmest cracks, out of reach.
>
> *Behaviour:* Files into cracks just before a heat breath and comes out as it fades.
>
> *Take the moults from the cracks. Leave the crawlers on the walls.*

Yields: `planter_feed` at `rift_crawler_moults`.

#### Seam pickers (`seam_pickers`)

*Mirror Divide · unlocks when seen · research*

> **Where pickers walk, the water is rinsed and clear. Their outgrown shells collect in the gaps of the picker rocks.**
>
> *Eats:* Film on rinsed crystal and rock.
>
> *Leaves:* Small three-lobed shells, outgrown and dropped.
>
> *Spawning and rest:* On the rinsed ledges, never below the mirror.
>
> *Behaviour:* Scatter into cracks when a craft boosts close and come straight back.
>
> *Take the dropped shells. Leave the pickers on the ledges.*

Yields: `planter_feed` at `divide_picker_moults`.

### Never reachable alive; its falls are salvage

#### Pale drifter (remains) (`pale_drifter`)

*Pale Basin, Mirror Divide · unlocks when scanned · new*

> **A fall feeds scavengers for years. Hide hangs from the newest ones; old bone crusts over in dense water.**
>
> *Eats:* Plankton in the open water beyond the rim, by the ton.
>
> *Leaves:* Its whole body, once, when it sinks.
>
> *Spawning and rest:* Far from here.
>
> *Behaviour:* Never seen alive this side of the rim, only as a silhouette in the far water.
>
> *Its remains are fair salvage. Take hide and bone; the scavengers will not miss a little.*

Yields: `flex_membrane` at `fall_basin_west_hide`, `fall_basin_east_hide`; `planter_feed` at `fall_basin_west_bone`, `fall_divide_lee_bone`; `conductive_crust` at `fall_divide_lee_crust`.

### Nothing to take

#### Vault glimmers (`vault_glimmer`)

*Hearth Reef, Hub spur · unlocks when seen · new · cave-dweller*

> **Lamp off, and the mats lean toward the moving water of the nearest mouth: that is the way out.**
>
> *Eats:* Particles drawn in by the cave's breathing.
>
> *Leaves:* Nothing.
>
> *Spawning and rest:* Within the mats; a mat thickens year on year.
>
> *Behaviour:* Dims inside a lamp cone and brightens again a few seconds after it moves on.
>
> *There is nothing to take. Leave the mats on the ceilings; they are the cave's signposts.*

#### Silt combs (`silt_combs`)

*Pale Basin, Meridian · unlocks when seen · research*

> **Combs stand only on firm ground above the silt line. Where they grow, a craft can settle.**
>
> *Eats:* Fine sediment strained through rigid plates.
>
> *Leaves:* Nothing.
>
> *Spawning and rest:* Spreads by budding along firm ridges.
>
> *Behaviour:* Sessile. Rows of combs mark where surges do not reach.
>
> *Nothing to take. Leave them standing; they mark safe ground.*

#### Wakeglow drift (`wakeglow_drift`)

*Pale Basin · unlocks when scanned · new · cave-dweller*

> **Your own wake glows for about a minute in still vault water. Lamp off, follow it back.**
>
> *Eats:* Too small to say.
>
> *Leaves:* Light, briefly.
>
> *Spawning and rest:* Unknown; it is always there in still water.
>
> *Behaviour:* Lights wherever something moves through it, and craft wakes glow brighter.
>
> *Nothing to take.*

#### Cable tenders (`cable_tender`)

*Meridian · unlocks when seen · new · cave-dweller*

> **Tenders cluster only on lines that still carry current: follow a chain of them and you follow live power.**
>
> *Eats:* Something in the faint warmth of a live line.
>
> *Leaves:* Nothing.
>
> *Spawning and rest:* Along the cables; young chains are short.
>
> *Behaviour:* Pulses slowly, faster under a lamp, and drifts a metre off at loud machinery.
>
> *Nothing to take. Leave the chains on the lines.*

### Protected: nothing is taken from it, its young or its eggs

#### Brine sails (`brine_sails`)

*Mirror Divide · unlocks when seen · existing*

> **Sails drift the calm lanes well above the dense layer. They are one sign of a calm lane, not the only one: ribbons and drift show it too.**
>
> *Eats:* Plankton concentrated above the mixing line.
>
> *Leaves:* Nothing you would find.
>
> *Spawning and rest:* Somewhere along the outer lanes; young sails are rarely seen.
>
> *Behaviour:* Glides slowly where the downwelling is weakest.
>
> *Few and slow to replace. Leave them alone.*

#### Canopy floaters (`canopy_floaters`)

*Lantern Canopy · unlocks when seen · research*

> **Where floaters tend the bladders, cured resin rolls into the lee below them.**
>
> *Eats:* The film their brushes sweep from the bladders.
>
> *Leaves:* Nothing of their own; the resin is the bladders' doing.
>
> *Spawning and rest:* Among young bladders, in the floater nursery.
>
> *Behaviour:* Drifts apart from loud machinery and regroups after a minute.
>
> *Leave them be. They keep the crowns afloat.*

#### Brine skimmers (`brine_skimmer`)

*Mirror Divide · unlocks when seen · new · cave-dweller*

> **Where skimmers fan out over a pocket floor, there is dense water below, shimmer or not.**
>
> *Eats:* What the dense water's edge concentrates.
>
> *Leaves:* Nothing.
>
> *Spawning and rest:* Over the pools they skim; the eggs float at the edge of the brine.
>
> *Behaviour:* Scatters in a fan and settles back on the same pool.
>
> *There are not many. Leave them and their eggs.*

#### Knot eels (`knot_eel`)

*Lantern Canopy · unlocks when seen · new · cave-dweller*

> **Hold a lamp on the hole for a few seconds and the eel withdraws; or take the other passage. It never leaves its hole.**
>
> *Eats:* Whatever swims past its knot.
>
> *Leaves:* Nothing.
>
> *Spawning and rest:* In the knot holes of the oldest roots.
>
> *Behaviour:* Rattles from a distance, flares closer, and nips only a diver who stays.
>
> *Leave it in its hole.*

#### Crown rays (`crown_rays`)

*Hub spur · unlocks when seen · new*

> **The rays circle wide around a loud craft. Their egg cases wedge in the crown's south crevices; leave them where they are.**
>
> *Eats:* Small life in the crown's upwelling.
>
> *Leaves:* Egg cases, which are not to be touched.
>
> *Spawning and rest:* On the crown itself, in its southern crevices.
>
> *Behaviour:* Rings the crown slowly, always the same way round.
>
> *Rare. Nothing is taken from them, and their egg cases stay on the crown.*

#### Sound hunter (`canopy_sound_hunter`)

*Lantern Canopy · unlocks when seen · existing*

> **Watch which way it goes: when it leaves to feed east, the lab crowns are yours. Coming back, it is listening.**
>
> *Eats:* The lantern school, mostly, in the east shoals.
>
> *Leaves:* Nothing.
>
> *Spawning and rest:* Not seen.
>
> *Behaviour:* Warns, approaches, commits and disengages; acceleration, scans and heavy extraction draw it.
>
> *Not prey and not to be hunted. Go around it, or go while it feeds.*

Natural window (`cycle.canopy.hunter_feeding`): It leaves its home crowns to feed on the lantern school's east shoals, then comes back. While it is away, the home crowns are quiet.

#### Glare stalker (`glare_stalker`)

*Ember Rift · unlocks when seen · existing*

> **When the chimney vents, they feed in the wash: that is when the passage is clear. Dark lamps and cool water lose them at any time.**
>
> *Eats:* Whatever the plume carries up.
>
> *Leaves:* Nothing.
>
> *Spawning and rest:* Somewhere warm and dark.
>
> *Behaviour:* Hunts light in warm passages and never crosses into cool water.
>
> *Not prey and not to be hunted. A released fish draws it off; nothing is taken from it.*

Natural window (`cycle.rift.stalker_feeding`): While the split chimney vents, both stalkers feed in the plume's rising wash; the warm passage behind them is empty.

#### Layer skate (`layer_skate`)

*Mirror Divide · unlocks when seen · existing*

> **When the crest goes slack, nothing drifts down for them and the skates settle on the floor: cross then, slowly. Their egg cases are tethered on the clear lee shelf by the west ledge; never touch them.**
>
> *Eats:* What the downwelling drops onto the mirror.
>
> *Leaves:* Egg cases tethered on the lee shelf, which are not to be touched.
>
> *Spawning and rest:* The one time a skate leaves the dense water: it rises to tether its egg cases on the clear lee shelf, where the brine cannot smother them.
>
> *Behaviour:* Feels vibration at the layer's surface and surges no more than a few metres above it.
>
> *Not prey and not to be hunted. Its egg cases stay where they lie.*

Natural window (`cycle.divide.skate_rest`): In crest slack water, when nothing drifts down onto the mirror, the skates settle to the floor and rest.

#### Hollow choir (`hollow_choir`)

*Meridian · unlocks when seen · existing*

> **When the bells close, they barely hear: pass then. A sound somewhere else spends their chorus.**
>
> *Eats:* What the gallery water carries in.
>
> *Leaves:* Nothing.
>
> *Spawning and rest:* Buds new bells along the colony's edge.
>
> *Behaviour:* A rising hum precedes a pressure pulse; afterwards the bells fall quiet and close.
>
> *Not prey and not to be hunted. It cannot move; leave it be.*

Natural window (`cycle.meridian.choir_rest`): The bells close to rest and barely hear.

## Found notes

| Note | Kind | Region | Found at | Readable | Dated | Hints at |
| --- | --- | --- | --- | --- | --- | --- |
| `note_yard_galley` Yard galley notebook | cook | Splitspine Isles | place `island_workshop` | always | Season 7 | `reef_fish_ribs` (via place `reef_ribs`); `isles_fish_split` (via site `isles.stack_cleft`); `reef_roe_nursery` (via `reef.nursery_flats`) |
| `note_lab_feeding_card` Card by the laboratory hatch | board | Lantern Canopy | place `canopy_lab` | always | D−96 | `cycle.canopy.hunter_feeding` (via place `canopy_lab`); `canopy_roe_crowns` (via place `canopy_lab`) |
| `note_station_margin` Ledger margin, materials station | board | Ember Rift | site `rift.materials_station` | always | D−51 | `cycle.rift.stalker_feeding` (via site `rift.split_chimney`); `rift_mite_grit` (via `rift.balcony`) |
| `note_dock_board` Chalk on the dock board | board | Mirror Divide | site `divide.service_dock` | always | D−30 | `cycle.divide.skate_rest` (via site `divide.gateworks`); `divide_skate_eggcases` (via site `divide_lattice_ledge_west`) |
| `note_office_board` Staging office shift notes | board | Meridian | site `meridian.staging_office` | always | D−12 | `cycle.meridian.choir_rest` (via site `meridian.gallery_north`); `meridian_scavenger_casts` (via site `meridian.staging_office`) |
| `note_reef_season` Reef season log | season log | Hearth Reef | `reef.pumphouse_site` | after `reef_pumphouse_log` | Season 2 | `reef_shed_moults` (via `reef.grazer_lookout`); `reef_roe_nursery` (via `reef.nursery_flats`) |
| `note_trapper_tally` Trap tally, yard spares | trapper | Splitspine Isles | `isles.tide_store` | after `isles_tide_store_fragment` | Season 8 | `reef_trap_ribs_lee` (via place `reef_ribs`); `isles_trap_stack_east` (via site `isles.stack_cleft`); `basin_trap_ridge_north` (via site `basin_wreck_frames_north`) |
| `note_tide_sheet` Tide and spawning sheet | spawning record | Splitspine Isles | `isles.strain_gauges` | after `isles_strain_gauge_log` | D−140 | `isles_roe_cove` (via site `isles.headland_landing`); `isles_shed_shells` (via `isles.button_ledges`) |
| `note_tether_aside` Tether crew aside | crew log | Lantern Canopy | `canopy.basket_site` | after `canopy_basket_log` | Season 6 | `canopy_weaver_resin` (via site `canopy.east_crowns`) |
| `note_basin_tray` Specimen tray note | season log | Pale Basin | `basin.instrument_vault` | after `basin_vault_archive` | D−210 | `basin_scavenger_casts` (via site `basin_wreck_panels_south`); `basin_fish_ridge` (via site `basin.wreck_ridge`) |
| `note_fall_survey` Pump crew survey note | survey | Pale Basin | `basin.pump_heads_site` | after `basin_pumphead_log` | Season 8 | `fall_basin_west` (via site `basin.dish_centre`); `fall_basin_east` (via site `basin_wreck_frames_north`) |
| `note_drill_crew` Drill crew notes | crew log | Ember Rift | `rift.borehole_site` | after `rift_borehole_log` | D−77 | `rift_crawler_moults` (via site `rift.cool_mooring`) |
| `note_mixing_aside` Sensor crew aside | survey | Mirror Divide | `divide.mixing_site` | after `divide_mixing_log` | D−44 | `fall_divide_lee` (via site `divide.lee_mooring`); `divide_picker_moults` (via `divide.picker_rocks`) |
| `note_allotment_margin` Rota margin | crew log | Meridian | `meridian.allotments_site` | after `meridian_allotment_log` | D−3 | `meridian_scavenger_casts` (via site `meridian.staging_office`) |
| `note_beacon_keeper` Beacon keeper's log | season log | Hub spur | `hub.beacon_house` | after `hub_beacon_archive` | Season 5 | `hub_ray_eggcases` (via site `hub.crown`); `hub_fish_crown` (via site `hub.crown`) |

**Yard galley notebook** (`note_yard_galley`) — *Yard galley, Season 7*

> Fish: the little reef ones round the ribs, where they stop in the shade. Don't chase, reach. A net does two. The split under the stack holds more on rough days. Roe: the nursery flats, on the fattest cup beds. It cooks to near twice the portions a fish does, and the beds come back if you leave the edges. Board says nobody touches the big rays. Good. Nobody asked.

**Card by the laboratory hatch** (`note_lab_feeding_card`) — *Canopy lab, D−96*

> The singer goes east to feed on the lantern shoals and comes back the same way. While it's gone, work the home crowns. When it's on its way back, stop the motors and wait it out. The school leaves its roe in the fronds right above this hatch, in the singer's own water. Take it while the singer is out east.

**Ledger margin, materials station** (`note_station_margin`) — *Station shift, D−51*

> Stalkers eat in the vent wash. When the chimney blows, both are up in it and the passage behind is empty; when it stops, they come down. Grit: sweep the cool balcony on the shoulder, facing the split. Never the lip.

**Chalk on the dock board** (`note_dock_board`) — *Upper dock, D−30*

> Slack on the crest means skates on the floor. Cross slow, in the slack. Egg cases on the lee shelf by the west ledge: DO NOT TOUCH. Incident sheet pinned below.

**Staging office shift notes** (`note_office_board`) — *Staging office, D−12*

> After the bells sing they close up, and you can walk a cart past them. Wait for the close. Casts for the troughs: the scavenger ledge east of this office. Gloves.

**Reef season log** (`note_reef_season`) — *Mara Sen, Season 2*

> Grazers moult in the lee of the lookout ridge, below their scar line; the skins make membrane as good as ribbon. The school spawns on the nursery flats where the cups grow thickest. The beds refill whatever we take, if we leave the edges. Nobody here believes I time this. I time this.

**Trap tally, yard spares** (`note_trapper_tally`) — *T. Orr, Season 8*

> West of the ribs, on the sand where the school turns back: 11. The split's south-east mouth, on the ledge, at the turn of the tide: 14. Best. Wreck ridge, north end, by the big frames: 6. Slow, but nothing else down there is worth the pot. Pots don't need watching. They fill and stop.

**Tide and spawning sheet** (`note_tide_sheet`) — *Slope technicians, D−140*

> South cove under the headland: roe on the eddy line, warm side, thickest after a long slack. Clapper valves and button plates wash into the gully under the button ledges; crushed, the planters take them. Gauge four still reading high. Logged.

**Tether crew aside** (`note_tether_aside`) — *Tether crew, Season 6*

> Weaver nests on the holdfast rims of the east crowns. The empty ones are just resin; take those. A weaver at the door means leave it. Floaters: hands off. They keep the bladders up, and the bladders keep us up.

**Specimen tray note** (`note_basin_tray`) — *Mara Sen, D−210*

> Scavenger casts from outside the burrows on the wreck ridge's south end: a handful in the cup trays and they double in a week. The pump crew calls it muck. The fish worth a net stay over the wreck ridge, above the silt line.

**Pump crew survey note** (`note_fall_survey`) — *Pump crew, Season 8*

> Two falls in the bowl. A drifter came down on the dish field, north of the great dish, this season; the scavengers are still on it. The older one lies on the terrace north-west of the wreck ridge, half silted. Hide off the new one makes fair seal stock. Bone goes to the gardens.

**Drill crew notes** (`note_drill_crew`) — *Core drilling crew, D−77*

> Crawler moults in the cracks of the kiln tube's upper wall, past the cool mooring. Good for the hut's tubers. When the crawlers go into the cracks, get out of the tube's end.

**Sensor crew aside** (`note_mixing_aside`) — *Divide sensor crew, D−44*

> A drifter fall on the lee shelf west of the mooring, toward the west ledge. All bone now, and the bone all crust. Picker shells in the gaps of the picker rocks, between the west ledge and the overlook.

**Rota margin** (`note_allotment_margin`) — *Allotment rota, D−3*

> Casts for the troughs from the scavenger ledge east of the office: a bucket a week, no more, or the cups go rank. And don't sing near the bells on your way down.

**Beacon keeper's log** (`note_beacon_keeper`) — *Beacon keeper, Season 5*

> Rays laid on the crown again: cases in the south crevices. Nobody touches them. Keeper's order. Little fish shelter on the west flank, out of the rays' circle. Enough for the keeper's pan.

## Placements by region

Coordinates are metres (x east, y up with water at 0, z north). ⟂ marks a point inside a cave, checked against that cave rather than today's floor.

### Hearth Reef

| ID | Kind | Owner | Animal | Takes | At (x, y, z) | Cave | What you see |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `reef_fish_ribs` | fish | CR-1 | `reef_school` | `small_fish` | -24, -8.1, -2 | — | Small silver fish turning over the intake apron beside the ribs, pausing in their shade. |
| `reef_roe_nursery` | spawning | CR-1 | `reef_school` | `roe_cluster` | -196, -15.8, 44 | — | Amber roe clusters stuck among the thickest staple cups on the nursery flats; the school circles low over them. |
| `reef_shed_moults` | moult | CR-1 | `ledge_grazer` | `flex_membrane` | -158, -13.1, -18 | — | Papery grazer moults caught in the lee of the lookout ridge, below the line of fresh scars. |
| `reef_trap_ribs_lee` | trap spot | CB-2 | `reef_school` | — | -40, -8.7, 20 | — | A flat sand patch west of the ribs where the school's loop narrows on its way back from the pod. |

### Splitspine Isles

| ID | Kind | Owner | Animal | Takes | At (x, y, z) | Cave | What you see |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `isles_fish_split` | fish | CR-1 | `reef_school` | `small_fish` | 470, -3.5, 88 | — | Small fish hang in the sheltered water of the split, out of the swell. |
| `isles_roe_cove` | spawning | CR-1 | `reef_school` | `roe_cluster` | 950, -10.2, -30 | — | Roe strung along the cove's eddy line, where drift settles and the water is warmest. |
| `isles_shed_shells` | moult | CR-1 | `tide_clapper`, `shore_buttons` | `planter_feed` | 1125, -13.2, 20 | — | Empty clapper valves and button plates rolled into a gully below the button ledges. |
| `isles_trap_stack_east` | trap spot | CB-2 | `reef_school` | — | 520, -9.6, 40 | — | A ledge off the split's south-east mouth where the fish leave the channel at the turn of the tide. |

### Lantern Canopy

| ID | Kind | Owner | Animal | Takes | At (x, y, z) | Cave | What you see |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `canopy_roe_crowns` | spawning | CR-1 | `canopy_school` | `roe_cluster` | 126, -104, -96 | — | Roe strings in the fronds of the crowns above the laboratory, the school thick around them. This is the hunter's home water. |
| `canopy_weaver_resin` | shed | CR-1 | `resin_weaver` | `buoyant_resin` | 690, -123.2, -128 | — | Empty weaver nests on a holdfast rim of the east crowns: cured resin with no weaver at the door. |

### Hub spur

| ID | Kind | Owner | Animal | Takes | At (x, y, z) | Cave | What you see |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `hub_fish_crown` | fish | CB-2 | `reef_school` | `small_fish` | 294, -60, -560 | — | A reef school sheltering on the crown's west flank, out of the rays' circle. |
| `hub_ray_eggcases` | protected spawn | CB-2 | `crown_rays` | — | 330, -74.2, -596 | — | Leathery egg cases wedged in the crown's south crevices, each the size of a diver. |

### Pale Basin

| ID | Kind | Owner | Animal | Takes | At (x, y, z) | Cave | What you see |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `basin_fish_ridge` | fish | CR-1 | `reef_school` | `small_fish` | 770, -255.4, -530 | — | A small group of fish over the wreck ridge, above the silt line. |
| `basin_scavenger_casts` | shed | CR-1 | `basin_scavengers` | `planter_feed` | 800, -255.7, -600 | — | Coiled casts outside the scavengers' burrows on the wreck ridge's south end. |
| `basin_trap_ridge_north` | trap spot | CB-2 | `reef_school` | — | 770, -253.2, -470 | — | Firm ground at the wreck ridge's north end, by the big frames, where the ridge fish turn. |
| `fall_basin_west` | carcass fall | CR-1 | `pale_drifter` | `fall_basin_west_hide` (`flex_membrane`), `fall_basin_west_bone` (`planter_feed`) | 520, -296.7, -480 | — | A great curved ribcage on the dish field, north of the great dish, scavengers working it, hide hanging in sheets. |
| `fall_basin_east` | carcass fall | CR-1 | `pale_drifter` | `fall_basin_east_hide` (`flex_membrane`) | 700, -242.4, -380 | — | An older fall on the terrace north-west of the wreck ridge, half silted, its hide gone leathery. |

### Ember Rift

| ID | Kind | Owner | Animal | Takes | At (x, y, z) | Cave | What you see |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `rift_mite_grit` | shed | CR-1 | `ember_mites` | `conductive_crust` | -62, -305.3, -1046 | — | Dark mineral grit drifted onto the cool shoulder balcony that faces the split, below the mites' lip. |
| `rift_crawler_moults` | moult | CB-2 | `kiln_crawler` | `planter_feed` | 130, -306, -800 ⟂ | `rift_kiln_tube` | Pale crawler moults packed into the cracks of the kiln tube's upper wall. |

### Mirror Divide

| ID | Kind | Owner | Animal | Takes | At (x, y, z) | Cave | What you see |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `divide_picker_moults` | moult | CB-2 | `seam_pickers` | `planter_feed` | 426, -359.6, -1200 | — | Three-lobed picker shells collected in the boulder gaps of the picker rocks. |
| `fall_divide_lee` | carcass fall | CR-1 | `pale_drifter` | `fall_divide_lee_crust` (`conductive_crust`), `fall_divide_lee_bone` (`planter_feed`) | 420, -388.1, -1130 | — | Bones crusted over on the lee shelf west of the mooring, sails passing high above. |
| `divide_skate_eggcases` | protected spawn | CR-1 | `layer_skate` | — | 424, -386.5, -1146 | — | Leathery egg cases tethered to the rock of the clear lee shelf, shadows moving inside. |

### Meridian

| ID | Kind | Owner | Animal | Takes | At (x, y, z) | Cave | What you see |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `meridian_scavenger_casts` | shed | CB-2 | `basin_scavengers` | `planter_feed` | 1170, -527, -1080 | — | Casts on the stable service ledge east of the staging office, scavengers in the frame racks. |

## Differences from CR-1's draft

Positions for CR-1's IDs follow CR-1's working-tree draft (`src/content/fauna/grounds.ts`, uncommitted on 2026-10-22). Two points for CR-1:
- **`isles_fish_split`:** CR-1's datum is at 7.6 m deep, inside the Splitstack Undercroft's proposed carve domain (the domain's top is 4 m). The split itself is open water, so this bible raises the datum to 3.5 m. Either keep that, or have the undercroft's builder trim the domain off the cleft.
- **`divide_skate_eggcases`:** on the clear lee shelf, above the brine the skates live in. The field guide explains it: it is the one time a skate leaves the dense water, to tether its cases where the brine cannot smother them. If CR-1 moves them below the mirror, the dock board and the field guide must change too (the test will say so).
- **Falls:** CR-1 placed all three on shelves 36–66 m from routes, which meets the 30 m rule. The pump crew's note names the dish field and the wreck ridge, not the pump heads; the note stays in the pump-head cabinet because the pump crew logged them.

## Builder notes and open points

- **Journal:** SYS-2's creatures tab shows `FIELD_GUIDE` entries; found notes join the decodes tab when decoded and the story notebook's "records" otherwise. Note IDs are already in their decodes' `gates` lists.
- **CR-1:** adopt the CB-2 IDs, or tell the lore owner which to rename. If a CR-1 ground moves more than about 200 m from the landmark its note names, the test fails and the note needs a new landmark.
- **`rift_crawler_moults`** sits in the proposed kiln tube, which CA-3 has not built yet. Until it is, the ground has no cave to live in; CR-1 can leave it unplaced.
- **The Canopy roe** sits in the hunter's home crowns above the laboratory (CR-1's risk and reward): gather while it feeds east. The lab card teaches that window right there.
- **Cave-only items:** none. The in-cave grounds (weaver resin, scavenger casts, crawler moults) give resin and planter feed, which also come from exterior grounds and sources.
- **Tone:** spoiler-free here. How these notes sit in the canon is in the [lore appendix](../spoilers/CONTENT_BIBLE_LORE.md#creature-lore-cb-2).
