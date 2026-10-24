# LS-1: lost sites (design plan, stage 0)

Opus 5.5 high, design authority for the stream. Branch `t3/ls-1-lost-sites` from root `a38b951e`. **Docs only: no code stage starts until the coordinator approves this plan.** Spoiler-safe. The lore owner's canon notes are in `docs/spoilers/LS-1-LORE.md` (writers and integration agents only).

**Player outcome.** Lost sites are real places you notice, approach and read. Each has a silhouette and a tell, an approach that uses what the region teaches, a story you can see before you decode anything, and records that open once decoded. Decoded maps lead to further sites, caves, stops and landmarks, so the decoder pulls you outward. No site is ever required.

## Design calls (taste decisions, argued from the evidence below)

1. **A site is a place, not a point.** Today every lost site is an invisible 10 m trigger with no geometry (see §1). That's the biggest gap, and it's more important than adding more sites. Every site gets an authored set, a readable plate and a tell. On-route sites can be seen from their route at 60–150 m (POI-1's rule). Off-route sites have a faint tell that only reads within about 60 m, so exploration finds them and decoded maps give the bearing.
2. **Rewards must be things the game doesn't already have.** Four proposed plans duplicate shipped systems, so I drop them:
   - `bp_chart_fix` duplicates SYS-1's `chart_live_position`;
   - `bp_decoder_cooling` duplicates SIG-1's decoder lattices;
   - `bp_outpost_thermal_tap` duplicates outpost location power at vents;
   - `bp_beacon_array` duplicates per-category beacon toggles.

   The kept plans are the locker extension, ping lens, air-line reel and lamp filter, plus the current turbine if its sandbox prototype is kept. The other reward kinds are seeds, caches, notes and map reveals.
3. **Felt decode time stays about 3–10 minutes all game.** Base times stay at 3, 6, 10 and 15 min by size. Later sites carry bigger records, but the decoder lattices (×1.5, then ×2.25) arrive at the same time, so a late core takes about as long as an early log.
4. **Every decode opens something,** and at least one reveal per region leads to another lost site or decodable. That is GAME-DIRECTION's "decoded maps reveal more sites".
5. **Two purposeful-backtracking gates, spaced about 3 hours apart:**
   - the opening island's cold-store hatch, opened by a code from a Splitspine decode after the Dart;
   - the Basin ridge vault door, opened by a code in the pump-head field's records.

   Both are seen before they can be opened and are legible in hindsight.
6. **The owner's mid-game overgrown plot becomes a main-path site:** the keeper's racks on the hub spur. Its planting card (the planter plan) is readable without decoding, which keeps the main-path rule.
7. **Seeing is not capturing.** The Dart's range tagger and the Hush's listening array mark a site on the chart and in the journal. Capturing its data still means reaching the logger. Otherwise approach design is moot.
8. **No new materials.** Rewards use the eight shared materials, seeds, plans, caches and maps. Cave-only rewards stay optional.

## 1. Current state

**Framework (SYS-2, C4, SIG-1), working:**
- discovery within 10 m (`LOST_SITE_FIND_RANGE`);
- background decodes on powered socketed decoders, paused beyond 250 m without a relay;
- completion grants plans, beacons and readable records;
- journal Decodes tab, chart cells and HUD objective nudge;
- decoder lattice speed;
- range tagger and listening array hooks;
- the bot decodes the pump house on the Creel route (`scripts/playthrough/live.ts`);
- save validation of `found`, `decoded` and `decodes`.

**Per region** (proposal IDs from `src/content/proposals/*`; "placed" means in `WORLD_LOST_SITES`):

| Region | Site | Placed | Decode (size) | Grants today | Gap |
| --- | --- | --- | --- | --- | --- |
| Reef | Old intake pump house | yes | log 6 | `bp_small_fabricator` (stand-in) | No geometry. Its proposed plan (locker extension) has no rules. CB-2's note isn't wired. Its reveals are dropped. OP-1's island shelf ends about 15 m short of it, so its floor must be rechecked, and the bot's pump-house leg runs through the island's future centre. |
| Isles | Strain gauge line | yes | log 6 | nothing | No geometry; ping lens has no rules; note and reveals unwired. |
| Isles | Yard tide store | no | fragment 3 | — | Inside the Isles cave biome (not built; BIO-2/3/4). |
| Canopy | Fallen tether basket | yes | log 6 | `bp_outpost_standard` (early copy) | No geometry; the basket bins cache is unwired; reveals unwired. |
| Canopy | Root specimen store | no | archive 10 | — | Inside the rootways (BIO-1). One of its two plans is redundant. |
| Hub | Beacon house | no | archive 10 | — | Was waiting for W2's crown, which has landed. It conflicts with HUB-2's lit mast; its plan is redundant. |
| Basin | Pump-head field | yes | log 6 | nothing | No geometry; its plan is redundant; reveals unwired (one targets the Rift station). |
| Basin | Sealed instrument vault | no | archive 10 | — | Inside the vault complex (BIO-x). |
| Rift | Core borehole rig | yes | log 6 | nothing | No geometry; its plan is redundant. |
| Divide | Mixing-line station | yes | log 6 | nothing | No geometry; its plan waits on the turbine prototype. |
| Meridian | Terrace allotments | yes | log 6 | nothing | No geometry; logs only. |

**Cross-cutting gaps:**
- **Found notes are unwired.** CB-2's 15 notes (10 behind decodes) exist only in proposals; nothing in the game imports them.
- **Reveals carry no target.** `RevealDefinition` is a position only, so `knownSites()` returns reveal IDs rather than site IDs. A decoded map can't make another lost site "known".
- **The main-path guarantee is tested on demo data.** `mainPathPlanProblems` runs on `DEMO_MAIN_PATH`, and three `demo_*` rows (one marked `story: true`) live in the production table. The runtime proof is the bot's `no-optional` scenario, and its verify step doesn't assert that it never decoded.
- **The range tagger captures data from a distance** (`signatures.ts` calls `discoverSite`).
- **No caves hold decodable fragments**, although GAME-DIRECTION asks for them, and **no cave find or cache is wired at all.** Already authored but inert: the dive-school locker, blowhole stash, cove float tin, arch float, fin crate, salvage bench, dock frame, alcove cache and housing cache. No stream owns wiring them.
- **The owner's mid-game overgrown plot has no home and no owner.** `bp_cultivation` still comes from the workshop sheet in the first hour.
- **The opening island's cold-store hatch** (OP-1) needs a decode that unlocks it, and none exists yet.

## 2. Sites per region

Columns per site:
- **Read:** silhouette and tell;
- **Approach:** how you get there;
- **Story:** what's visible before decoding;
- **Decoded:** what the decode opens;
- **Rewards;**
- **Path:**
  - *main:* the intended route passes it, and anything the route needs from it is readable without decoding;
  - *near:* on or beside the route; the decode is optional;
  - *off:* found by exploration or decoded maps.

Every decode is optional. Decoder plans are guaranteed on the main path by the workshop's signal rack, which needs no decode (OP-1 moves the rack with the workshop; see §4).

### Hearth Reef

**Old intake pump house** `reef.pumphouse_site` (−380, −23.5, −20): log 6, *near*, the first decode.
- **Read:** a squat block house on a limestone shoulder. A vent stack rises about 10 m with fans streaming off it like pennants, and the intake's black mouth below is choked with fan growth. It can be seen from the opening island's west shelf and the Colonnade.
- **Approach:** the old intake pipe, cut and capped, still lies on the floor from the ribs' intake (the main-path C02 site) west to the pump house. You can follow it, which makes it a landmark-led lead. A gentle inflow leans the fans toward the mouth: the reef's current-facing growth lesson.
- **Story:** a cheerful painted "Intake 1" sign, scrapers racked by the hanging door, a sealed log cabinet grown over with fans.
- **Decoded:** three intake logs, plus the Reef season log note (grazer moults, nursery roe).
- **Rewards:** `bp_small_fabricator`, kept here because the first decode should pay something you use soon, on outposts. Reveals the Lantern grotto (cave) and the spur crown bearing (hint).

**Dive-school route slates** (new, three cave fragments, 3 min each, *off*). The expedition's cave-diving school left three route tags in the reef's small and medium caves. It's a short optional chain that teaches the cave-plus-decode loop early, using dressing CA-1 already authored.
- **Route 1, `reef_archlet`:** the existing bolted slate, with its depth marks and a painted "ROUTE 1", plus a data tag. Decoded: exit first, the lamp-off check, and "the mats lean to moving water". Reveals the Bell hole.
- **Route 2, `reef_bellhole`:** the existing dive-school locker (reserve cells and the cave-signals card) plus a "ROUTE 2" tag. Reveals the Wrack hollow and the Lantern grotto.
- **Route 3, `reef_lantern_grotto`:** a "ROUTE 3" tag in the glimmer hall. Grants `bp_air_line_reel`, the diver line from 28 to 40 m, a cave tool earned in caves. Reveals the drop-cathedral shortcut toward the Basin west gate.

### Splitspine Isles

**Strain gauge line** `isles.strain_gauges` (345, −45.4, 70): log 6, *near*.
- **Read:** the slump scar is the read. It's a raw, pale bite in the stack's grown-over west flank, with six gauge posts across its edge and the last two bent downslope. It's visible on the Dart's first approach to the stack.
- **Approach:** down the scar's bare scree, where nothing grows. The first clappers sit on the fresh basalt in the scar crawl next door.
- **Story:** numbered posts, "RECAL" chalked on post 4, and a logger housing whose cable runs upslope toward a torn mast stump.
- **Decoded:** strain readings, the recalibration notes, a last request for a review, and the Tide and spawning sheet note. One line names the opening island station's cold store and its door code.
- **Rewards:** `bp_ping_lens` (handheld ping 35 → 60 m; it outlines cave mouths it touches). Reveals the Storm arch (cave) and the Root stair (hint). **It opens the cold-store hatch** (gate 1).

**Yard tide store** `isles.tide_store`, inside the Isles cave biome: fragment 3, *main-path biome, optional site*.
- **Read:** a stencilled "TIDE STORE" door off the yard sump.
- **Story:** dry lockers, and loads strapped on pallets as if for a departure.
- **Decoded:** the manifests and a shift note, plus the trap tally note.
- **Rewards:** `bp_locker_extension` (+50% for one pod, stop or outpost locker). A store room is the natural home for storage. Reveals the gauge line (lost site) and the west sea cave.
- **Placed by:** the Isles biome stream; LS-1 ships the row.

**Opening island cold-store hatch** (OP-1's place). LS-1 supplies only the gate: `island.cold_store_hatch` opens when the gauge logger's record is readable. You see it in the first 20–40 minutes and open it after the Dart. Its contents (records and the Under-Stair sump) are OP-1's.

### Lantern Canopy

**Fallen tether basket** `canopy.basket_site` (760, −108.6, −100): log 6, *near*.
- **Read:** a cage basket lying crooked on a crown's shoulder. Its snapped tether still rises 30 m to a buoyant float, a vertical line with a float on top that reads across the crowns.
- **Approach:** the basket lies in the singer's home crowns. Go while it's out east feeding (the laboratory card's window), or run silent.
- **Story:** the "TETHER CREW" stencil, inspection tags clipped crown by crown, latched bins (the cache opens without decoding: 6 resin and 4 crust), and a dark log unit.
- **Decoded:** the tether logs and the Tether crew aside (weaver resin on the east crowns).
- **Rewards:** `bp_outpost_standard` (early copy) and the bins. Reveals the Lantern hall (cave), and the Rootways front mouth once BIO-1 places it.

**Root specimen store** `canopy.root_specimen_store`, inside the rootways (BIO-1): archive 10, *off* (an optional biome).
- **Read:** a sealed locker bolted to a root beyond the knot warren, behind a pressure sticker.
- **Story:** fogged jar labels.
- **Decoded:** the root-colony catalogue, and where rootglow grows inside.
- **Rewards:** `bp_lamp_filter` (a common-pool lamp fitting that halves the light animals read), a rootways exclusive. Reveals the escarpment gallery and the root arch.

### Hub spur

**Keeper's racks** `hub.keepers_racks` (new; spur second step, about (175, −40, −462), floor check in stage 1): planting card readable, decode log 6, **main**. This is the owner's mid-game overgrown plot.
- **Read:** three tiers of grow racks bolted up the step's sunward face, gone wild. Cups and fans spill over the trays in a green cascade against grey rock, under a dead grow-lamp pole. It reads from the spur route between the first step and the crown.
- **Story:** rack labels in one hand, a stool wedged on a ledge, a pan hung on the lamp pole.
- **Readable without decoding:** the laminated planting card. It grants `bp_cultivation`, moved here from the workshop sheet (with OP-1). Cuttings of staple cup, ribbon fan and salve frond can be taken from the racks.
- **Decoded** (the keeper's garden tag): growing notes, with casts and fall bone as feed and which crops took where. Reveals the lumen bulb cluster (Canopy) and the pale spore mat (Basin) as hints: the other seeds.

**Keeper's chart room** `hub.beacon_house` (335, −48, −565, recast): archive 10, *near* (on the main path's hub).
- **Read:** a small round hut on the crown summit under the station's lit mast, its windows dark. The lit mast is the keeper's own lamp, so there's no contradiction with HUB-2.
- **Approach:** the crown; mind the rays' circling pass.
- **Story:** a wall chart with unlabelled pins, a bunk and a logbook shelf.
- **Decoded:** the beacon plan, the beacon failure list, and the Beacon keeper's log note.
- **Rewards:** no plan. **It's the map room:** five landmark beacons (dish field, lantern crowns, split chimney, gateworks, signal spire), plus bearings to two deep lost sites, the borehole rig and the mixing-line station.

### Pale Basin

**Pump-head field** `basin.pump_heads_site` (240, −260.2, −760): log 6, *near* (Basin → Rift leg).
- **Read:** rows of squat pump heads on pale sediment, each with a dead status lamp, and a taller central head with a cabinet. The west row is tilted and half buried where the sediment slumped.
- **Story:** numbered rows, and a quota board whose chalk tallies climb. You can read that much before decoding.
- **Decoded:** the extraction logs, calibration requests filed to the ridge vault, and the Pump crew survey note (two carcass falls).
- **Rewards:** 2 reserve cells (pump spares). Reveals the west rim cut (cave) and the materials station (Rift stop). **It holds the ridge vault's door code** (gate 2).

**Sealed instrument vault** `basin.instrument_vault`, inside the vault complex (BIO-x): door tag fragment 3, then archive 10, *main-path biome, optional site*.
- **Read:** a sealed door in the ridge vaults with a tag light still blinking. Seen early in the biome.
- **Opening it:** either the door tag's own decode or the pump-head record, whichever comes first. In hindsight, the pump crew's requests explain the door.
- **Inside:** instrument racks and two ceramic liners. These are the bible's tastes, below any transition's need.
- **Decoded** (the archive): calibration records and profiles filed without comment, plus the Specimen tray note.
- **Rewards:** `bp_outpost_advanced` (early copy). Reveals the cool flank mooring (stop) and the inactive shoulder.

### Ember Rift

**Core borehole rig** `rift.borehole_site` (−420, −251.4, −900): log 6, *off* (beside the cool-flank route).
- **Read:** a lattice drill tower over the borehole and a field hut whose vent pipe shimmers with heat haze, with a warm glow at the hut's porthole.
- **Approach:** along the cool flank's ledges from the materials station. Don't touch the haze: the heat lesson, applied.
- **Story:** core samples racked by depth, a sleeping bench, and a vent-warmed planter box overgrown with **kiln tubers**. They're collectable before you know their use (GAME-DIRECTION).
- **Decoded:** core and heat logs, the sketch of a tube "all the way to the cold", and the Drill crew notes note.
- **Rewards:** `seed_kiln_tuber`, the exterior source of the bible's Rift seed (three meals; grows on a thermal outpost or the carrier). Reveals the West tube (cave) and the seam's Rift mouth (once the seam is placed).

### Mirror Divide

**Mixing-line station** `divide.mixing_site` (880, −379.2, −1150): archive 10, *near* (by the carrier's lee mooring).
- **Read:** a sensor house at the foot of a vertical buoy chain of red-banded floats rising toward the mirror. It's kept distinct from POI-1's cyan float line.
- **Approach:** across the lee shelf where the sails cross their lanes; time the slack.
- **Story:** a pile of replaced sensors by the door, each tagged "FAULTY", and a flag board.
- **Decoded:** brine profiles with spikes flagged, the replacement tickets, the sails' lane change, and the Sensor crew aside note.
- **Rewards:** two chart hints over the dense-water lanes (navigation through the Divide's hazard) and 2 reserve cells. It also gets the current turbine plan if the sandbox prototype is kept (GAME-DIRECTION; not LS-1's to build). Reveals the brine cistern (cave) and the seam's Divide mouth.

**Seam drainage panel** `rift_divide_seam.cold_junction` (new, inside the seam, BIO-4): core 15, *off*.
- **Read:** a panel at the cold junction with a schematic.
- **Decoded:** a drainage schematic. It reveals an approach once the story structure places the deep structure it points to; until then the row stays deferred.

### Meridian

**Terrace allotments** `meridian.allotments_site` (1150, −600, −1250): log 6, *near* (by the staging shelf).
- **Read:** stepped troughs on a terrace edge, soft with a pale crop gone wild, under dead lamp poles. It's a green terrace in a grey district.
- **Approach:** down from the staging shelf, past the bells (take their rest window).
- **Story:** a rota board with initials, a watering can, and the last crop marked "ready" in chalk.
- **Readable without decoding:** one harvest of the wild crop (4 meals).
- **Decoded:** the rota logs and the Rota margin note (casts for the troughs).
- **Rewards:** reveals the escarpment culvert and the terrace window gallery.

### Caches made live (stage 2, one runtime with sites)

These are authored but inert today. LS-1 wires them as inspectable finds through the same runtime as lost sites: the dive-school locker, blowhole stash, cove float tin, arch float, basket bins, housing cache, salvage bench, fin crate, dock frame and service alcove. They keep the bible's contents. They are finite, optional and counted against the tier rule's taste limit.

### Lead chain (decoded maps → what they reveal)

| Decode | Leads to |
| --- | --- |
| Pump house | Lantern grotto · spur crown |
| Route 1 → 2 → 3 | Bell hole → Wrack hollow and Lantern grotto → drop-cathedral shortcut |
| Gauge line | Storm arch · Root stair · **cold-store hatch** |
| Tide store | **Gauge line** · west sea cave |
| Basket | Lantern hall · Rootways mouth |
| Keeper's racks | Lumen bulbs · pale spores |
| Chart room | 5 landmarks · **borehole rig** · **mixing station** |
| Root store | Escarpment gallery · root arch |
| Pump heads | West rim cut · materials station · **vault door** |
| Vault | Cool flank mooring · inactive shoulder |
| Borehole | West tube · seam Rift mouth |
| Mixing line | Cistern · seam Divide mouth · 2 brine lanes |
| Allotments | Culvert · window gallery |

**Bold** marks a further lost site or gate. A reveal whose target isn't placed yet is withheld until it is, and the test enforces that.

**Count:**
- 9 exterior sites (7 placed today, plus the racks and the recast chart room);
- 3 reef cave fragments;
- 4 in-biome sites;
- 17 decodables;
- 10 caches made live.

Every site earns its place by its set, approach and reward. None exists to fill time.
